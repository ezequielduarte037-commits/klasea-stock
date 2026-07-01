-- Egresos: stock general, reasignacion de obra y cantidades parciales.

alter table public.panol_obra_materiales_snapshot
  alter column obra_id drop not null,
  add column if not exists obra_origen_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists egreso_destino_obra_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists cantidad_egresada numeric not null default 0,
  add column if not exists retirado_por text,
  add column if not exists sector_destino text,
  add column if not exists stock_sede text,
  add column if not exists stock_nota text;

create index if not exists idx_panol_obra_snapshot_stock_general
  on public.panol_obra_materiales_snapshot(stock_sede, estado)
  where obra_id is null;

create index if not exists idx_panol_obra_snapshot_egreso_destino
  on public.panol_obra_materiales_snapshot(egreso_destino_obra_id)
  where egreso_destino_obra_id is not null;

create or replace function public.panol_ingresar_stock_general(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para ingresar stock general';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
    rubro,
    tipo,
    tipo_label,
    precio_unitario,
    moneda,
    notas,
    source,
    estado,
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota
  )
  values (
    null,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    null,
    'stock_general',
    'Stock general',
    v_material.precio_unitario,
    v_material.moneda,
    nullif(btrim(coalesce(p_nota, '')), ''),
    'stock_general',
    'en_panol',
    'recibido',
    now(),
    v_sede,
    nullif(btrim(coalesce(p_nota, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.panol_egresar_obra_materiales(
  p_snapshot_ids uuid[],
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_destino_obra_id uuid default null,
  p_cantidades jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
  v_row record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_raw_qty text;
  v_qty numeric;
  v_available numeric;
  v_new_id uuid;
begin
  if array_length(p_snapshot_ids, 1) is null then
    return 0;
  end if;

  for v_row in
    select
      s.*,
      e.sede as envio_sede
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.id = any(p_snapshot_ids)
  loop
    if not (
      public.is_panol_manager(v_uid)
      or (coalesce(v_row.envio_sede, v_row.stock_sede) is not null and public.can_receive_envio(coalesce(v_row.envio_sede, v_row.stock_sede), v_uid))
    ) then
      raise exception 'Sin permiso para egresar uno o mas materiales';
    end if;

    if v_row.estado in ('en_panol','recibido','parcial','problema') then
      v_available := greatest(coalesce(v_row.cantidad, 1), 0);
      v_raw_qty := p_cantidades ->> v_row.id::text;
      v_qty := null;
      if v_raw_qty is not null and replace(v_raw_qty, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
        v_qty := replace(v_raw_qty, ',', '.')::numeric;
      end if;

      if v_available <= 0 then
        v_available := 1;
      end if;

      if v_qty is null or v_qty <= 0 or v_qty >= v_available then
        update public.panol_obra_materiales_snapshot
           set estado = 'egresado',
               obra_origen_id = coalesce(obra_origen_id, obra_id),
               obra_id = coalesce(p_destino_obra_id, obra_id),
               egreso_destino_obra_id = p_destino_obra_id,
               egreso_at = now(),
               egreso_por = v_uid,
               egreso_nota = v_nota,
               retirado_por = v_retirado,
               sector_destino = v_sector,
               cantidad_egresada = coalesce(cantidad_egresada, 0) + v_available,
               updated_at = now()
         where id = v_row.id
           and estado <> 'egresado';
      else
        update public.panol_obra_materiales_snapshot
           set cantidad = v_available - v_qty,
               cantidad_egresada = coalesce(cantidad_egresada, 0) + v_qty,
               updated_at = now()
         where id = v_row.id
           and estado <> 'egresado';

        insert into public.panol_obra_materiales_snapshot(
          obra_id,
          obra_origen_id,
          material_id,
          descripcion,
          codigo,
          cantidad,
          unidad,
          proveedor,
          rubro,
          tipo,
          tipo_label,
          precio_unitario,
          moneda,
          notas,
          source,
          orden,
          estado,
          purchase_request_id,
          purchase_request_item_id,
          panol_envio_id,
          panol_envio_item_id,
          recepcion_estado,
          recepcion_cantidad_recibida,
          recepcion_nota,
          recepcion_updated_at,
          egreso_at,
          egreso_por,
          egreso_nota,
          retirado_por,
          sector_destino,
          egreso_destino_obra_id,
          cantidad_egresada,
          stock_sede,
          stock_nota
        )
        values (
          coalesce(p_destino_obra_id, v_row.obra_id),
          coalesce(v_row.obra_origen_id, v_row.obra_id),
          v_row.material_id,
          v_row.descripcion,
          v_row.codigo,
          v_qty,
          v_row.unidad,
          v_row.proveedor,
          v_row.rubro,
          v_row.tipo,
          v_row.tipo_label,
          v_row.precio_unitario,
          v_row.moneda,
          v_row.notas,
          'egreso_parcial',
          v_row.orden,
          'egresado',
          v_row.purchase_request_id,
          v_row.purchase_request_item_id,
          v_row.panol_envio_id,
          v_row.panol_envio_item_id,
          v_row.recepcion_estado,
          v_row.recepcion_cantidad_recibida,
          v_row.recepcion_nota,
          v_row.recepcion_updated_at,
          now(),
          v_uid,
          v_nota,
          v_retirado,
          v_sector,
          p_destino_obra_id,
          v_qty,
          v_row.stock_sede,
          v_row.stock_nota
        )
        returning id into v_new_id;
      end if;

      v_count := v_count + 1;

      if v_row.panol_envio_id is not null then
        insert into public.panol_envio_eventos(
          envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
        )
        values (
          v_row.panol_envio_id,
          v_row.panol_envio_item_id,
          'egreso_material',
          v_row.estado,
          'egresado',
          concat_ws(' - ', v_nota, case when p_destino_obra_id is not null then 'Reasignado' else null end),
          v_uid
        );
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.panol_ingresar_stock_general(uuid,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.panol_egresar_obra_materiales(uuid[],text,text,text,uuid,jsonb) to authenticated;
