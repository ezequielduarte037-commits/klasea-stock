-- Permite resolver por primera vez un requisito histórico que ya pasó por
-- Pañol, pero impide reemplazar un SKU concreto una vez que tiene kardex.

create or replace function public.panol_asignar_producto_snapshot(
  p_snapshot_id uuid,
  p_producto_material_id uuid default null,
  p_origen text default 'asignacion_obra'
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
  v_requisito uuid;
  v_producto uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para asignar productos de obra';
  end if;

  select * into v_row
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id
   for update;
  if not found then raise exception 'Item de obra no encontrado'; end if;

  v_requisito := coalesce(v_row.requisito_material_id, v_row.material_id);
  v_producto := coalesce(p_producto_material_id, v_requisito);

  if (
    v_row.panol_envio_item_id is not null
    or v_row.estado in ('en_panol','parcial','recibido','egresado')
    or v_row.recepcion_estado in ('recibido','parcial')
  )
    and v_row.material_id is distinct from v_requisito
    and v_producto is distinct from v_row.material_id
  then
    raise exception 'El producto ya tiene movimientos de Pañol y no puede reemplazarse';
  end if;

  if p_producto_material_id is not null then
    if not exists (
      select 1 from public.panol_materiales
       where id = p_producto_material_id
         and activo is distinct from false
         and es_requisito is distinct from true
    ) then
      raise exception 'El producto elegido no existe, está inactivo o es otro requisito';
    end if;

    insert into public.panol_requisito_productos (
      requisito_material_id, producto_material_id, origen, created_by
    ) values (
      v_requisito, p_producto_material_id,
      case when p_origen in ('manual','migracion_variante','asignacion_obra','compras','panol') then p_origen else 'asignacion_obra' end,
      v_uid
    )
    on conflict (requisito_material_id, producto_material_id)
    do update set activo = true, updated_at = now();
  end if;

  perform set_config('app.audit_origin', coalesce(nullif(p_origen, ''), 'asignacion_obra'), true);
  perform set_config('app.audit_note', case when p_producto_material_id is null then 'Producto concreto limpiado' else 'Producto concreto asignado' end, true);

  update public.panol_obra_materiales_snapshot
     set requisito_material_id = v_requisito,
         material_id = v_producto,
         variante = null,
         producto_asignado_at = case when p_producto_material_id is null then null else now() end,
         producto_asignado_por = case when p_producto_material_id is null then null else v_uid end,
         producto_asignacion_origen = case when p_producto_material_id is null then null else coalesce(nullif(p_origen, ''), 'asignacion_obra') end,
         updated_at = now()
   where id = p_snapshot_id
   returning * into v_row;

  if v_row.purchase_request_item_id is not null then
    update public.purchase_request_items
       set material_id = v_producto,
           requisito_material_id = v_requisito,
           catalog_source = 'panol',
           updated_at = now()
     where id = v_row.purchase_request_item_id;
  end if;

  update public.panol_envio_items
     set material_id = v_producto,
         requisito_material_id = v_requisito,
         updated_at = now()
   where id = v_row.panol_envio_item_id
      or obra_snapshot_item_id = p_snapshot_id;

  return v_row;
end;
$$;

grant execute on function public.panol_asignar_producto_snapshot(uuid,uuid,text) to authenticated;
