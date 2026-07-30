-- Separa preparacion, espera logistica y trabajo externo.
--
-- Por cada material de una operacion se registran dos hitos:
--   1. listo_envio_at: el astillero termino de prepararlo y puede pedir el flete.
--   2. listo_retiro_at: Torneria/Plegadora termino y puede pedirse el regreso.
--
-- Un flete puede incluir materiales de varias operaciones y obras. Se crean
-- movimientos individuales (para conservar el circuito existente) agrupados
-- bajo un mismo lote logistico.

alter table public.torneria_operacion_items
  add column if not exists listo_envio_at timestamptz,
  add column if not exists listo_envio_por uuid references public.profiles(id) on delete set null,
  add column if not exists listo_retiro_at timestamptz,
  add column if not exists listo_retiro_por uuid references public.profiles(id) on delete set null;

comment on column public.torneria_operacion_items.listo_envio_at is
  'Momento en que el material quedo preparado en astillero para solicitar el flete de salida.';
comment on column public.torneria_operacion_items.listo_retiro_at is
  'Momento en que el taller externo informo que el material estaba listo para retirar.';

create table if not exists public.torneria_fletes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('salida', 'recepcion')),
  fecha timestamptz not null default now(),
  responsable text,
  destino text,
  remito text,
  notas text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.torneria_movimientos
  add column if not exists flete_id uuid
    references public.torneria_fletes(id) on delete set null;

create index if not exists idx_torneria_movimientos_flete
  on public.torneria_movimientos(flete_id)
  where flete_id is not null;

-- Marca o desmarca varios materiales en una sola accion y deja auditoria por
-- cada proceso afectado.
create or replace function public.torneria_marcar_listo(
  p_operacion_item_ids uuid[],
  p_etapa text,
  p_listo boolean default true
)
returns setof public.torneria_operacion_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_torneria_editor(v_uid) then
    raise exception 'Sin permiso para preparar materiales';
  end if;
  if p_etapa not in ('envio', 'retiro') then
    raise exception 'Etapa de preparacion invalida';
  end if;
  if coalesce(array_length(p_operacion_item_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos un material';
  end if;

  if p_etapa = 'envio' then
    if exists (
      select 1
      from public.torneria_operacion_items oi
      join public.torneria_items item on item.id = oi.item_id
      join public.torneria_operaciones op on op.id = oi.operacion_id
      where oi.id = any(p_operacion_item_ids)
        and (
          oi.cantidad_enviada >= oi.cantidad_requerida
          or (
            not item.es_resultado
            and lower(coalesce(op.origen, 'astillero')) = 'astillero'
            and item.compra_estado not in ('recibido_astillero', 'no_aplica')
          )
        )
    ) then
      raise exception 'Hay materiales que aun no estan recibidos en astillero o ya fueron enviados';
    end if;

    update public.torneria_operacion_items
       set listo_envio_at = case when p_listo then now() else null end,
           listo_envio_por = case when p_listo then v_uid else null end,
           updated_at = now()
     where id = any(p_operacion_item_ids);
  else
    if exists (
      select 1
      from public.torneria_operacion_items oi
      where oi.id = any(p_operacion_item_ids)
        and oi.cantidad_enviada <= oi.cantidad_recibida
    ) then
      raise exception 'Hay materiales que no tienen cantidades pendientes de retiro';
    end if;

    update public.torneria_operacion_items
       set listo_retiro_at = case when p_listo then now() else null end,
           listo_retiro_por = case when p_listo then v_uid else null end,
           updated_at = now()
     where id = any(p_operacion_item_ids);
  end if;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  select distinct
    op.proceso_id,
    'preparacion',
    op.proceso_id,
    case
      when p_etapa = 'envio' and p_listo then 'listo_para_enviar'
      when p_etapa = 'retiro' and p_listo then 'listo_para_retirar'
      else 'preparacion_reabierta'
    end,
    jsonb_build_object(
      'etapa', p_etapa,
      'listo', p_listo,
      'operacion_item_ids', to_jsonb(p_operacion_item_ids)
    ),
    v_uid
  from public.torneria_operacion_items oi
  join public.torneria_operaciones op on op.id = oi.operacion_id
  where oi.id = any(p_operacion_item_ids);

  return query
  select *
  from public.torneria_operacion_items
  where id = any(p_operacion_item_ids);
end;
$$;

-- Registra un unico flete y crea atomicamente un movimiento por cada operacion.
-- p_operaciones:
-- [
--   {
--     "operacion_id": "uuid",
--     "items": [{"operacion_item_id": "uuid", "cantidad": 2}]
--   }
-- ]
create or replace function public.torneria_guardar_flete(
  p_tipo text,
  p_fecha timestamptz,
  p_responsable text,
  p_destino text,
  p_remito text,
  p_notas text,
  p_operaciones jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_flete uuid;
  v_operacion jsonb;
  v_item jsonb;
  v_operacion_id uuid;
  v_operacion_item_id uuid;
  v_movimiento uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_cantidad numeric;
  v_pendiente numeric;
  v_listo timestamptz;
  v_ultimo_movimiento timestamptz;
begin
  if not public.is_torneria_editor(v_uid) then
    raise exception 'Sin permiso para registrar fletes';
  end if;
  if p_tipo not in ('salida', 'recepcion') then
    raise exception 'Tipo de flete invalido';
  end if;
  if jsonb_typeof(coalesce(p_operaciones, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_operaciones, '[]'::jsonb)) = 0 then
    raise exception 'Selecciona al menos un material';
  end if;

  insert into public.torneria_fletes(
    tipo, fecha, responsable, destino, remito, notas, created_by
  )
  values (
    p_tipo,
    coalesce(p_fecha, now()),
    nullif(btrim(p_responsable), ''),
    nullif(btrim(p_destino), ''),
    nullif(btrim(p_remito), ''),
    nullif(btrim(p_notas), ''),
    v_uid
  )
  returning id into v_flete;

  for v_operacion in
    select value from jsonb_array_elements(p_operaciones)
  loop
    v_operacion_id := (v_operacion ->> 'operacion_id')::uuid;

    if not exists (
      select 1 from public.torneria_operaciones where id = v_operacion_id
    ) then
      raise exception 'Una operacion seleccionada no existe';
    end if;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_operacion -> 'items', '[]'::jsonb))
    loop
      v_operacion_item_id := (v_item ->> 'operacion_item_id')::uuid;
      v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 0);

      select
        case when p_tipo = 'salida' then oi.listo_envio_at else oi.listo_retiro_at end,
        case
          when p_tipo = 'salida'
            then greatest(0, oi.cantidad_requerida - oi.cantidad_enviada)
          else greatest(0, oi.cantidad_enviada - oi.cantidad_recibida)
        end,
        (
          select max(m.fecha)
          from public.torneria_movimiento_items mi
          join public.torneria_movimientos m on m.id = mi.movimiento_id
          where mi.operacion_item_id = oi.id
            and m.tipo = p_tipo
        )
        into v_listo, v_pendiente, v_ultimo_movimiento
      from public.torneria_operacion_items oi
      where oi.id = v_operacion_item_id
        and oi.operacion_id = v_operacion_id;

      if not found then
        raise exception 'Un material no pertenece a la operacion indicada';
      end if;
      if v_listo is null
         or (v_ultimo_movimiento is not null and v_listo <= v_ultimo_movimiento) then
        raise exception 'Todos los materiales deben estar marcados como listos';
      end if;
      if v_cantidad <= 0 or v_cantidad > v_pendiente then
        raise exception 'Cantidad invalida para uno de los materiales';
      end if;
    end loop;

    v_movimiento := public.torneria_guardar_movimiento(
      null,
      v_operacion_id,
      p_tipo,
      coalesce(p_fecha, now()),
      p_responsable,
      p_destino,
      p_remito,
      p_notas,
      v_operacion -> 'items'
    );

    update public.torneria_movimientos
       set flete_id = v_flete,
           updated_at = now()
     where id = v_movimiento;

    v_movimientos := v_movimientos || jsonb_build_array(v_movimiento);
  end loop;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  select distinct
    op.proceso_id,
    'flete',
    v_flete,
    case when p_tipo = 'salida' then 'flete_salida' else 'flete_retiro' end,
    jsonb_build_object(
      'flete_id', v_flete,
      'tipo', p_tipo,
      'movimiento_ids', v_movimientos,
      'remito', nullif(btrim(p_remito), '')
    ),
    v_uid
  from jsonb_array_elements(p_operaciones) entry
  join public.torneria_operaciones op
    on op.id = (entry ->> 'operacion_id')::uuid;

  return jsonb_build_object(
    'flete_id', v_flete,
    'movimiento_ids', v_movimientos
  );
end;
$$;

alter table public.torneria_fletes enable row level security;

drop policy if exists "torneria lectura" on public.torneria_fletes;
create policy "torneria lectura"
on public.torneria_fletes for select to authenticated
using (public.is_torneria_viewer(auth.uid()));

drop policy if exists "torneria alta" on public.torneria_fletes;
create policy "torneria alta"
on public.torneria_fletes for insert to authenticated
with check (public.is_torneria_editor(auth.uid()));

drop policy if exists "torneria edicion" on public.torneria_fletes;
create policy "torneria edicion"
on public.torneria_fletes for update to authenticated
using (public.is_torneria_editor(auth.uid()))
with check (public.is_torneria_editor(auth.uid()));

drop policy if exists "torneria baja" on public.torneria_fletes;
create policy "torneria baja"
on public.torneria_fletes for delete to authenticated
using (public.is_torneria_editor(auth.uid()));

grant select, insert, update, delete on public.torneria_fletes to authenticated;
revoke execute on function public.torneria_marcar_listo(uuid[], text, boolean)
  from public, anon;
revoke execute on function public.torneria_guardar_flete(
  text, timestamptz, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.torneria_marcar_listo(uuid[], text, boolean) to authenticated;
grant execute on function public.torneria_guardar_flete(
  text, timestamptz, text, text, text, text, jsonb
) to authenticated;
