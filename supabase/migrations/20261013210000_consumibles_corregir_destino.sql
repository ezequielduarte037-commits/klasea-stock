-- Consumibles: corregir la obra (o el sector) de un retiro ya registrado.
--
-- El 13/10 dos rodillos epoxi quedaron repartidos entre 21 obras (42 renglones
-- de 0,095): la persona figura en RRHH en todas las obras activas y en el
-- mostrador se tocó "Repartir". "Era otra obra" es además uno de los motivos
-- más comunes de anulación. Anular y volver a cargar desde el mostrador
-- cambiaba la hora y obligaba a firmar de nuevo.
--
-- consumibles_corregir_destino anula los renglones de un producto de un
-- retiro y los vuelve a cargar en uno solo, con la nueva obra o sector, la
-- misma persona, hora, lote y costo congelado. Lo que salió por una solicitud
-- se corrige desde la solicitud, como la anulación.

begin;

create or replace function public.consumibles_corregir_destino(
  p_ids uuid[],
  p_obra_id uuid default null,
  p_sector text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector text := nullif(trim(coalesce(p_sector, '')), '');
  v_base public.consumibles_movimientos;
  v_filas int;
  v_cantidad numeric;
  v_gramos numeric;
  v_antes text;
  v_nuevo text;
  v_id uuid := gen_random_uuid();
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para corregir movimientos';
  end if;
  if (p_obra_id is null) = (v_sector is null) then
    raise exception 'Elegí una obra o un sector (uno solo)';
  end if;
  if p_obra_id is not null and not exists (select 1 from public.produccion_obras where id = p_obra_id) then
    raise exception 'Esa obra no existe';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No hay renglones para corregir';
  end if;

  perform 1 from public.consumibles_movimientos where id = any(p_ids) for update;

  select count(*), sum(cantidad), sum(gramos)
    into v_filas, v_cantidad, v_gramos
    from public.consumibles_movimientos
   where id = any(p_ids) and anulado_at is null;
  if v_filas = 0 then
    raise exception 'Esos renglones ya estaban anulados';
  end if;
  if v_filas <> cardinality(p_ids) then
    raise exception 'Parte del retiro ya estaba anulada: actualizá y probá de nuevo';
  end if;
  if (select count(distinct (material_id, tipo, sede, coalesce(lote::text, id::text))) from public.consumibles_movimientos where id = any(p_ids)) > 1 then
    raise exception 'Se corrige un producto de un retiro por vez';
  end if;

  select * into v_base from public.consumibles_movimientos where id = any(p_ids) order by id limit 1;
  if v_base.tipo not in ('retiro', 'devolucion') then
    raise exception 'Solo se corrige el destino de retiros y devoluciones';
  end if;
  if v_base.origen = 'solicitud' or v_base.solicitud_id is not null then
    raise exception 'Lo entregado por una solicitud se corrige desde la solicitud';
  end if;

  select case when count(distinct coalesce(o.codigo, m.sector, 'sin obra')) > 4
              then 'repartido entre ' || count(distinct coalesce(o.codigo, m.sector, 'sin obra')) || ' obras'
              else string_agg(distinct coalesce(o.codigo, m.sector, 'sin obra'), ' · ') end
    into v_antes
    from public.consumibles_movimientos m left join public.produccion_obras o on o.id = m.obra_id
   where m.id = any(p_ids);
  v_nuevo := coalesce((select codigo from public.produccion_obras where id = p_obra_id), v_sector);
  if v_filas = 1 and v_antes = v_nuevo then
    raise exception 'Ya está cargado en %', v_nuevo;
  end if;

  update public.consumibles_movimientos
     set anulado_at = now(),
         anulado_motivo = coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Destino corregido') || ': pasa a ' || v_nuevo
   where id = any(p_ids);

  insert into public.consumibles_movimientos (
    id, material_id, sede, tipo, cantidad, gramos, empleado_id, empleado_nombre, empleado_dni,
    metodo_firma, obra_id, sector, carril, lote, costo_unitario_ars, canje,
    fuera_cupo, autorizado_por, remito, origen, nota, created_by, created_at
  )
  select v_id, v_base.material_id, v_base.sede, v_base.tipo, v_cantidad, v_gramos,
         v_base.empleado_id, v_base.empleado_nombre, v_base.empleado_dni,
         v_base.metodo_firma, p_obra_id, v_sector, v_base.carril, v_base.lote, v_base.costo_unitario_ars, v_base.canje,
         (select bool_or(fuera_cupo) from public.consumibles_movimientos where id = any(p_ids)),
         (select string_agg(distinct autorizado_por, ' / ') from public.consumibles_movimientos where id = any(p_ids)),
         v_base.remito, v_base.origen,
         concat_ws(' · ', nullif(v_base.nota, ''), 'Destino corregido (antes: ' || v_antes || ')'),
         v_base.created_by, v_base.created_at;

  return jsonb_build_object('id', v_id, 'anulados', v_filas, 'antes', v_antes, 'ahora', v_nuevo);
end;
$$;

revoke all on function public.consumibles_corregir_destino(uuid[], uuid, text, text) from public;
grant execute on function public.consumibles_corregir_destino(uuid[], uuid, text, text) to authenticated;

commit;
