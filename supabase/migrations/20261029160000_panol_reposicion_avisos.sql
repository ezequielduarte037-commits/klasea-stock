-- Reponer lo reasignado.
--
-- Cuando el pañol saca material del stock de una obra para llevarlo a otra, la
-- obra de origen se queda sin él y nadie se entera: la lista de esa obra puede
-- seguir diciendo "en compras" y el ítem no se vuelve a pedir nunca. Desde acá,
-- cada salida así abre (o suma a) un aviso a Compras "Reponer en <obra>", que
-- además manda el push de avisos (trigger notificaciones_aviso_encolar).
--
-- Se detecta sobre el renglón y no en cada función de egreso, para cubrir a
-- todas (egreso de renglones de obra, egreso de producto, carrito y
-- reasignación entre obras) sin redefinirlas:
--   · egreso_producto / transferencia_egreso con destino: obra_id es la obra
--     que lo tenía.
--   · retiro total de un renglón (UPDATE a egresado): la obra que lo tenía es
--     la de antes del cambio.
--   · retiro parcial (historial_retiro_parcial): la que lo tenía es la del
--     renglón que se descontó en la misma transacción.
-- Una liberación a stock no tiene destino y no abre aviso: liberar es decir
-- que la obra no lo necesita.

alter table public.compras_avisos
  drop constraint if exists compras_avisos_origen_check;

alter table public.compras_avisos
  add constraint compras_avisos_origen_check
  check (origen in (
    'web',
    'whatsapp',
    'compras_etapa',
    'panol_devolucion',
    'panol_reposicion'
  ));

comment on column public.compras_avisos.origen is
  'Canal o flujo que creó el aviso: web, whatsapp, compras_etapa, panol_devolucion o panol_reposicion.';

-- Abre el aviso de la obra o suma el renglón al que la misma persona abrió en
-- los últimos 15 minutos: un carrito con diez cosas de la 52-25 es un aviso,
-- no diez pushes. source_ref guarda los renglones ya avisados (idempotente).
create or replace function public.panol_reposicion_avisar(
  p_obra_id uuid,
  p_snapshot_id uuid,
  p_descripcion text,
  p_cantidad numeric,
  p_destino text,
  p_retirado_por text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra record;
  v_aviso public.compras_avisos%rowtype;
  v_linea text;
  v_items int;
begin
  select id, codigo, estado into v_obra from public.produccion_obras where id = p_obra_id;
  -- Lo que sale de una obra terminada es sobrante: no hay nada que reponer.
  if not found or v_obra.estado is distinct from 'activa' then return null; end if;

  v_linea := format(
    '· %s × %s → %s%s',
    trim(to_char(coalesce(p_cantidad, 1), 'FM999999990.###')),
    coalesce(nullif(btrim(p_descripcion), ''), 'Material'),
    coalesce(nullif(btrim(p_destino), ''), 'otro destino'),
    case when nullif(btrim(p_retirado_por), '') is null then ''
         else format(' (retiró %s)', btrim(p_retirado_por)) end
  );

  select * into v_aviso
    from public.compras_avisos
   where origen = 'panol_reposicion'
     and project_id = p_obra_id
     and estado = 'nuevo'
     and created_by is not distinct from v_uid
     and created_at > now() - interval '15 minutes'
   order by created_at desc
   limit 1
   for update;

  if found then
    if position(p_snapshot_id::text in coalesce(v_aviso.source_ref, '')) > 0 then
      return v_aviso.id;
    end if;
    v_items := 1 + (
      select count(*) from regexp_split_to_table(coalesce(v_aviso.detalle, ''), E'\n') l
       where l like '· %'
    );
    update public.compras_avisos
       set titulo = format('Reponer en %s: %s ítems', v_obra.codigo, v_items),
           material = null,
           detalle = concat_ws(E'\n', v_aviso.detalle, v_linea),
           source_ref = concat_ws(',', v_aviso.source_ref, p_snapshot_id::text)
     where id = v_aviso.id;
    return v_aviso.id;
  end if;

  insert into public.compras_avisos (
    titulo, detalle, material, project_id, destino, prioridad, origen, source_ref, created_by
  ) values (
    format('Reponer en %s: %s', v_obra.codigo, coalesce(nullif(btrim(p_descripcion), ''), 'material')),
    format('Salió del stock de la %s hacia otro destino. Hay que volver a pedirlo para la %s:', v_obra.codigo, v_obra.codigo)
      || E'\n' || v_linea,
    nullif(btrim(p_descripcion), ''),
    p_obra_id,
    'Obra ' || v_obra.codigo,
    'media',
    'panol_reposicion',
    p_snapshot_id::text,
    v_uid
  )
  returning id into v_aviso.id;
  return v_aviso.id;
end;
$$;

revoke all on function public.panol_reposicion_avisar(uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.panol_reposicion_avisar(uuid, uuid, text, numeric, text, text) to service_role;

create or replace function public.panol_reposicion_detectar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra uuid;
  v_cantidad numeric;
  v_destino text;
begin
  if tg_op = 'INSERT' then
    v_cantidad := new.cantidad;
    if new.source in ('egreso_producto', 'transferencia_egreso') then
      v_obra := new.obra_id;
    elsif new.source = 'historial_retiro_parcial' then
      -- panol_egresar_obra_materiales descuenta el renglón y escribe el
      -- historial con el mismo now(): ese renglón es el de la obra que lo tenía.
      -- obra_origen_id no sirve solo: en material ya reasignado guarda la
      -- primera obra, no la última.
      select s.obra_id into v_obra
        from public.panol_obra_materiales_snapshot s
       where s.id <> new.id
         and s.material_id = new.material_id
         and s.updated_at = new.egreso_at
         and s.source <> 'historial_retiro_parcial'
         and s.stock_sede is not distinct from new.stock_sede
       order by (s.obra_id is not distinct from new.obra_origen_id) desc
       limit 1;
      v_obra := coalesce(v_obra, new.obra_origen_id);
    else
      return new;
    end if;
  else
    if old.estado = 'egresado' then return new; end if;
    v_obra := old.obra_id;
    v_cantidad := coalesce(new.cantidad_egresada, 0) - coalesce(old.cantidad_egresada, 0);
    if v_cantidad <= 0 then v_cantidad := new.cantidad; end if;
  end if;

  if v_obra is null or v_obra = new.egreso_destino_obra_id then return new; end if;

  select codigo into v_destino from public.produccion_obras where id = new.egreso_destino_obra_id;
  perform public.panol_reposicion_avisar(
    v_obra, new.id, new.descripcion, v_cantidad,
    coalesce(v_destino, new.sector_destino), new.retirado_por
  );
  return new;
exception when others then
  -- El aviso es un extra: un error acá nunca puede frenar un egreso.
  raise warning 'panol_reposicion_detectar (%): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.panol_reposicion_detectar() from public, anon, authenticated;

drop trigger if exists panol_reposicion_detectar on public.panol_obra_materiales_snapshot;
create trigger panol_reposicion_detectar
  after insert or update of estado on public.panol_obra_materiales_snapshot
  for each row
  when (new.estado = 'egresado' and new.egreso_destino_obra_id is not null)
  execute function public.panol_reposicion_detectar();
