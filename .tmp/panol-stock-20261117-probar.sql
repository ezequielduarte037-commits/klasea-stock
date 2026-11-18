do $$
declare
  v_envio uuid;
  v_item uuid;
  v_item_snapshot uuid;
  v_snapshot public.panol_obra_materiales_snapshot%rowtype;
begin
  -- El subbloque se revierte incluso cuando la prueba pasa.
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);
    v_envio := public.panol_crear_envio('Prueba de recepción de stock', 'Chubut', 'media',
      null, null, null, 'manual', null, jsonb_build_array(jsonb_build_object(
        'descripcion', 'Prueba de recepción de stock', 'codigo', '4187',
        'material_id', '2d98e85a-bde0-421c-a0f0-61697283eee1', 'cantidad', '10', 'unidad', 'unidad'
      )));
    select id, obra_snapshot_item_id into strict v_item, v_item_snapshot
      from public.panol_envio_items where envio_id = v_envio;
    if v_item_snapshot is not null then raise exception 'La prueba necesita un aviso sin movimiento previo'; end if;

    perform public.panol_marcar_items(array[v_item], 'parcial', null, '9');
    select s.* into strict v_snapshot
      from public.panol_envio_items i join public.panol_obra_materiales_snapshot s on s.id = i.obra_snapshot_item_id
      where i.id = v_item;
    if v_snapshot.cantidad is distinct from 9::numeric or v_snapshot.obra_id is not null
        or v_snapshot.stock_sede is distinct from 'Chubut'
        or v_snapshot.recepcion_estado is distinct from 'parcial'
        or v_snapshot.panol_envio_item_id is distinct from v_item
        or v_snapshot.estado is distinct from 'en_panol' then
      raise exception 'La recepción parcial no dejó 9 unidades en stock Chubut';
    end if;
    v_item_snapshot := v_snapshot.id;

    perform public.panol_marcar_items(array[v_item], 'recibido', null, null);
    perform public.panol_marcar_items(array[v_item], 'recibido', null, null);
    select * into strict v_snapshot from public.panol_obra_materiales_snapshot where panol_envio_item_id = v_item;
    if v_snapshot.id is distinct from v_item_snapshot or v_snapshot.cantidad is distinct from 10::numeric
        or v_snapshot.recepcion_estado is distinct from 'recibido' then
      raise exception 'Completar o repetir la recepción cambió el vínculo o no dejó exactamente 10 unidades';
    end if;
    raise exception using errcode = 'KA001', message = 'Prueba parcial y completa OK, revertir datos de prueba';
  exception when sqlstate 'KA001' then
    null;
  end;
end $$;
