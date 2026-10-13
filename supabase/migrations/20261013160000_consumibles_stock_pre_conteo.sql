-- Consumibles: los retiros de antes del primer conteo no dejan el stock en
-- negativo.
--
-- Desde el 13/10 se registra todo lo que sale, pero el inventario inicial
-- todavía no se hizo. El stock era la suma de los movimientos, así que cada
-- retiro de un producto sin contar lo dejaba en negativo (38 productos el
-- 13/10 a la tarde) y parecía un faltante.
--
-- Ahora el stock parte del último conteo:
--   stock = lo contado en el último conteo + lo que se movió después.
-- Sin conteo en esa sede no hay stock (null, "sin contar"). Lo que se movió
-- antes del primer conteo queda registrado (vale para el consumo y el tablero)
-- como movimiento pre-conteo, y la vista lo informa aparte.
--
-- De paso, un retiro sin conexión que llega después de un conteo con la hora
-- original (anterior al conteo) ya no se descuenta dos veces: el conteo ya lo
-- reflejaba.
--
-- El conteo graba como teórico ese mismo stock. En el primer conteo de un
-- producto y sede el teórico queda vacío: no había stock con qué comparar.

begin;

create or replace view public.consumibles_stock
with (security_invoker = true) as
with vivos as (
  select id, material_id, sede, tipo, cantidad, contado, created_at
    from public.consumibles_movimientos
   where anulado_at is null
),
ultimo_conteo as (
  select distinct on (material_id, sede) material_id, sede, contado, created_at
    from vivos
   where tipo = 'inventario'
   order by material_id, sede, created_at desc, id desc
),
primer_conteo as (
  select material_id, sede, min(created_at) as created_at
    from vivos
   where tipo = 'inventario'
   group by material_id, sede
)
select
  v.material_id,
  v.sede,
  case
    when u.created_at is null then null
    else u.contado + coalesce(sum(v.cantidad) filter (
      where v.tipo <> 'inventario' and v.created_at > u.created_at
    ), 0)
  end as stock,
  max(v.created_at) filter (where v.tipo = 'inventario') as ultimo_conteo_at,
  max(v.created_at) filter (where v.tipo = 'retiro') as ultimo_retiro_at,
  max(v.created_at) filter (where v.tipo = 'ingreso') as ultimo_ingreso_at,
  p.created_at as primer_conteo_at,
  coalesce(-sum(v.cantidad) filter (
    where v.tipo = 'retiro' and (p.created_at is null or v.created_at < p.created_at)
  ), 0) as pre_conteo_retirado,
  count(*) filter (
    where v.tipo = 'retiro' and (p.created_at is null or v.created_at < p.created_at)
  ) as pre_conteo_retiros,
  coalesce(sum(v.cantidad) filter (
    where v.tipo = 'ingreso' and (p.created_at is null or v.created_at < p.created_at)
  ), 0) as pre_conteo_ingresado
from vivos v
left join ultimo_conteo u on u.material_id = v.material_id and u.sede = v.sede
left join primer_conteo p on p.material_id = v.material_id and p.sede = v.sede
group by v.material_id, v.sede, u.contado, u.created_at, p.created_at;

grant select on public.consumibles_stock to authenticated;

-- Conteo: igual que antes (idempotente, con candado por material y sede), pero
-- el teórico es el stock de la vista. En el primer conteo queda null y la
-- diferencia es todo lo contado.
create or replace function public.consumibles_registrar_conteo(
  p_material_id uuid,
  p_sede text,
  p_contado numeric,
  p_gramos numeric default null,
  p_nota text default null,
  p_lote uuid default null,
  p_id uuid default null
)
returns public.consumibles_movimientos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teorico numeric;
  v_row public.consumibles_movimientos;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para contar stock';
  end if;
  if p_contado is null or p_contado < 0 or p_contado in ('NaN', 'Infinity') then
    raise exception 'La cantidad contada tiene que ser un número de cero para arriba';
  end if;
  if p_sede is null or p_sede not in ('Pampa', 'Chubut') then
    raise exception 'Elegí la sede del pañol';
  end if;

  -- Reintento del mismo conteo: devuelve lo que ya se grabó, sin recalcular.
  if p_id is not null then
    select * into v_row from public.consumibles_movimientos where id = p_id;
    if found then
      return v_row;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('consumibles:' || p_material_id::text || ':' || p_sede));

  select s.stock
    into v_teorico
    from public.consumibles_stock s
   where s.material_id = p_material_id
     and s.sede = p_sede;

  insert into public.consumibles_movimientos (
    id, material_id, sede, tipo, cantidad, contado, teorico, gramos, lote, origen, nota
  )
  values (
    coalesce(p_id, gen_random_uuid()), p_material_id, p_sede, 'inventario',
    p_contado - coalesce(v_teorico, 0), p_contado, v_teorico,
    p_gramos, p_lote, 'conteo', nullif(trim(coalesce(p_nota, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.consumibles_registrar_conteo(uuid, text, numeric, numeric, text, uuid, uuid) to authenticated;

commit;
