-- Une un producto ya entregado con el requisito de matriz de la misma obra.
-- No cambia la matriz, la cantidad ni otra obra: sólo conserva que el SKU
-- físico entregado satisface ese requisito puntual.

create or replace function public.panol_reconciliar_snapshot_con_requisito(
  p_snapshot_id uuid,
  p_requisito_material_id uuid
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_snapshot public.panol_obra_materiales_snapshot%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para conciliar un producto de obra';
  end if;

  select * into v_snapshot
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id
   for update;
  if not found then raise exception 'Producto entregado no encontrado'; end if;
  if v_snapshot.material_id is null then raise exception 'El registro no tiene producto físico'; end if;
  if not exists (
    select 1 from public.panol_materiales
     where id = p_requisito_material_id
       and es_requisito is true
  ) then
    raise exception 'El destino debe ser un requisito genérico de matriz';
  end if;
  if exists (
    select 1 from public.panol_obra_materiales_snapshot otro
     where otro.obra_id = v_snapshot.obra_id
       and otro.id <> v_snapshot.id
       and coalesce(otro.requisito_material_id, otro.material_id) = p_requisito_material_id
       and coalesce(otro.source, 'matriz') <> 'matriz'
  ) then
    raise exception 'La obra ya tiene otra entrega vinculada a este requisito';
  end if;

  insert into public.panol_requisito_productos (
    requisito_material_id, producto_material_id, origen, created_by
  ) values (
    p_requisito_material_id, v_snapshot.material_id, 'panol', v_uid
  ) on conflict (requisito_material_id, producto_material_id)
    do update set activo = true, updated_at = now();

  perform set_config('app.audit_origin', 'conciliacion_obra', true);
  perform set_config('app.audit_note', 'Producto entregado vinculado al requisito de matriz de esta obra', true);

  update public.panol_obra_materiales_snapshot
     set requisito_material_id = p_requisito_material_id,
         producto_asignado_at = coalesce(producto_asignado_at, now()),
         producto_asignado_por = coalesce(producto_asignado_por, v_uid),
         producto_asignacion_origen = 'asignacion_obra',
         updated_at = now()
   where id = v_snapshot.id
   returning * into v_snapshot;

  -- Si la obra ya tenía el placeholder pendiente del requisito, se elimina
  -- sólo cuando todavía no cargó compras ni movimientos. La fila entregada
  -- recién conciliada pasa a ser la única identidad de ese requisito.
  delete from public.panol_obra_materiales_snapshot pendiente
   where pendiente.obra_id = v_snapshot.obra_id
     and pendiente.id <> v_snapshot.id
     and coalesce(pendiente.requisito_material_id, pendiente.material_id) = p_requisito_material_id
     and pendiente.material_id = p_requisito_material_id
     and pendiente.purchase_request_id is null
     and pendiente.panol_envio_id is null
     and pendiente.panol_envio_item_id is null
     and coalesce(pendiente.estado, 'pendiente') = 'pendiente'
     and coalesce(pendiente.recepcion_estado, 'pendiente') = 'pendiente';

  update public.purchase_request_items
     set requisito_material_id = p_requisito_material_id,
         updated_at = now()
   where id = v_snapshot.purchase_request_item_id;

  update public.panol_envio_items
     set requisito_material_id = p_requisito_material_id,
         updated_at = now()
   where obra_snapshot_item_id = v_snapshot.id;

  return v_snapshot;
end;
$$;

grant execute on function public.panol_reconciliar_snapshot_con_requisito(uuid,uuid) to authenticated;
