-- Pedir como "Adicional" un renglón de la matriz (o de un condicionante) que
-- todavía no se pidió ni se movió ya no crea un adicional nuevo: se engancha el
-- pedido a ese mismo renglón, igual que hace un pedido Estándar.
--
-- Antes la función siempre creaba otro adicional (con su propio renglón) para
-- todo lo que no fuera ya un adicional. El renglón original quedaba pendiente y
-- la lista de la obra mostraba el ítem dos veces: uno "Pendiente" que volvía a
-- pedir comprar y otro "Adicional" con el pedido. Pasó en la 37-43 con la
-- parrilla Kenyon (12/11) y la grifería negra (17/11).
--
-- Se sigue creando un adicional aparte cuando el renglón ya tiene compra,
-- envío, recepción o egreso: ahí sí es una cantidad nueva que no debe tocar lo
-- que ya se entregó (caso de los ánodos de la 52-24).
--
-- El renglón queda con tipo_pedido 'adicional' y es_adicional (lo que el
-- trigger panol_snapshot_set_tipo pondría al insertar). Desde el 19/11 la
-- lista de la obra no separa por eso un renglón de la matriz de su fila: hay
-- que publicar ese cambio de la app antes de aplicar esta migración.

create or replace function public.materiales_pedir_adicional_obra(
  p_obra_id uuid, p_titulo text, p_descripcion text, p_items jsonb, p_envio_id uuid
)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_codigo text;
  v_pedido public.purchase_requests;
  v_origen public.panol_obra_materiales_snapshot;
  v_addon public.panol_obra_addons;
  v_item jsonb;
  v_cantidad numeric;
  v_item_id uuid;
  v_snapshot_id uuid;
  v_libre boolean;
  v_origen_adicional boolean;
  v_reusa_matriz boolean;
begin
  if v_usuario is null then raise exception 'No hay usuario autenticado.'; end if;
  if p_envio_id is null then raise exception 'Falta identificar el envío.'; end if;
  if nullif(btrim(p_titulo),'') is null then raise exception 'Falta el título del pedido.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Faltan los ítems del pedido.'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'Faltan los ítems del pedido.'; end if;
  if (select count(distinct value->>'snapshot_id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'Hay ítems repetidos o sin identificar. Actualizá la lista.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_usuario::text || p_envio_id::text,0));
  select * into v_pedido from public.purchase_requests
   where source='materiales_obra' and source_ref=p_envio_id::text and created_by=v_usuario;
  if found then
    if v_pedido.title is distinct from btrim(p_titulo) or v_pedido.description is distinct from p_descripcion or v_pedido.project_id is distinct from p_obra_id then
      raise exception 'Ese envío ya fue creado. Cerrá esta ventana y actualizá la lista antes de armar otro pedido.';
    end if;
    return jsonb_build_object('request',to_jsonb(v_pedido),'reutilizado',true);
  end if;
  select codigo into v_codigo from public.produccion_obras where id=p_obra_id;
  if not found then raise exception 'No se encontró la obra.'; end if;
  -- Se bloquean en orden estable para impedir que dos compras simultáneas
  -- reutilicen el mismo renglón pendiente.
  perform id from public.panol_obra_materiales_snapshot
   where id in (select (value->>'snapshot_id')::uuid from jsonb_array_elements(p_items))
   order by id for update;
  insert into public.purchase_requests(title,description,priority,status,project_id,destino,
    source,source_ref,es_adicional,tipo_pedido,created_by)
  values(btrim(p_titulo),p_descripcion,'media','nuevo',p_obra_id,'Obra '||v_codigo,
    'materiales_obra',p_envio_id::text,true,'adicional',v_usuario) returning * into v_pedido;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'quantity')::numeric;
    if v_cantidad is null or v_cantidad <= 0 or v_cantidad::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Ingresá una cantidad mayor que cero en cada ítem.';
    end if;
    if nullif(btrim(v_item->>'description'),'') is null then raise exception 'Falta la descripción de un ítem.'; end if;
    select * into v_origen from public.panol_obra_materiales_snapshot
     where id=(v_item->>'snapshot_id')::uuid and obra_id=p_obra_id;
    if not found then raise exception 'El ítem ya no pertenece a esta obra. Actualizá la lista.'; end if;
    if coalesce(nullif(v_item->>'requisito_material_id','')::uuid,nullif(v_item->>'material_id','')::uuid)
       is distinct from coalesce(v_origen.requisito_material_id,v_origen.material_id) then
      raise exception 'Cambió el material del ítem. Actualizá la lista.';
    end if;

    v_addon := null;
    v_libre := coalesce(v_origen.estado,'pendiente')='pendiente'
      and v_origen.purchase_request_id is null and v_origen.purchase_request_item_id is null
      and v_origen.panol_envio_id is null and v_origen.panol_envio_item_id is null
      and v_origen.recepcion_estado is null and v_origen.egreso_at is null;
    v_origen_adicional := v_origen.tipo='addon' or v_origen.source in ('addon','adicional_obra')
      or (coalesce(v_origen.es_adicional,false) and coalesce(v_origen.source,'') not in ('matriz','condicionante'));
    v_reusa_matriz := v_libre and not v_origen_adicional;

    if v_libre and v_origen_adicional then
      select * into v_addon from public.panol_obra_addons
       where obra_id=p_obra_id and (
         obra_snapshot_id=v_origen.id or (obra_snapshot_id is null and id=nullif(v_item->>'addon_id','')::uuid)
       ) order by id limit 1 for update;
      -- Un adicional histórico sin ficha propia también puede pedirse desde
      -- su renglón pendiente; no se incrementa otra vez la necesidad.
      v_snapshot_id := v_origen.id;
    elsif v_reusa_matriz then
      v_snapshot_id := v_origen.id;
    else
      v_addon := public.materiales_crear_adicional_obra(p_obra_id,jsonb_build_object(
        'material_id',v_item->>'material_id','descripcion',v_item->>'description','cantidad',v_cantidad,
        'proveedor',v_item->>'proveedor','tipo','adicional','observaciones',v_item->>'notes',
        'codigo',v_item->>'codigo','unidad',v_item->>'unit','categoria_id',v_item->>'categoria_id',
        'precio_unitario',v_item->>'precio_unitario','moneda',v_item->>'moneda'
      ));
      v_snapshot_id := v_addon.obra_snapshot_id;
    end if;

    insert into public.purchase_request_items(
      request_id,description,quantity,unit,destination,material_id,requisito_material_id,
      especificaciones,catalog_source,notes,supplier_id,supplier_name,supplier_description,supplier_code,supplier_components
    ) values (
      v_pedido.id,btrim(v_item->>'description'),v_cantidad::text,coalesce(nullif(v_item->>'unit',''),'unidad'),
      'Obra '||v_codigo,nullif(v_item->>'material_id','')::uuid,nullif(v_item->>'requisito_material_id','')::uuid,
      coalesce(v_item->'especificaciones','{}'::jsonb),'panol',nullif(v_item->>'notes',''),
      nullif(v_item->>'supplier_id','')::uuid,nullif(v_item->>'supplier_name',''),
      nullif(v_item->>'supplier_description',''),nullif(v_item->>'supplier_code',''),
      coalesce(v_item->'supplier_components','[]'::jsonb)
    ) returning id into v_item_id;

    if v_reusa_matriz then
      -- El renglón sigue siendo de la matriz: no cambia origen ni tipo, sólo
      -- queda pedido. Si se pidió más de lo que pide la matriz, el renglón
      -- pasa a esa cantidad para que lo pedido y lo necesario coincidan.
      update public.panol_obra_materiales_snapshot set
        cantidad=greatest(coalesce(cantidad,0),v_cantidad),estado='pedido',
        purchase_request_id=v_pedido.id,purchase_request_item_id=v_item_id,
        tipo_pedido='adicional',es_adicional=true,
        material_id=coalesce(nullif(v_item->>'material_id','')::uuid,material_id),
        especificaciones=case when coalesce(v_item->'especificaciones','{}'::jsonb)<>'{}'::jsonb
          then v_item->'especificaciones' else especificaciones end,
        especificaciones_origen=case when coalesce(v_item->'especificaciones','{}'::jsonb)<>'{}'::jsonb
          then 'asignacion_obra' else especificaciones_origen end
       where id=v_snapshot_id;
    else
      update public.panol_obra_materiales_snapshot set
        cantidad=v_cantidad,estado='pedido',purchase_request_id=v_pedido.id,purchase_request_item_id=v_item_id,
        material_id=nullif(v_item->>'material_id','')::uuid,
        requisito_material_id=nullif(v_item->>'requisito_material_id','')::uuid,
        especificaciones=coalesce(v_item->'especificaciones','{}'::jsonb),
        especificaciones_origen='asignacion_obra',source='adicional_obra',tipo='addon',tipo_label='Adicional',es_adicional=true
       where id=v_snapshot_id;
    end if;
    if not found then raise exception 'No se pudo vincular el adicional al pedido. Revisá tus permisos.'; end if;
    if v_addon.id is not null then
      update public.panol_obra_addons set cantidad=v_cantidad,obra_snapshot_id=v_snapshot_id where id=v_addon.id;
    end if;
  end loop;
  return jsonb_build_object('request',to_jsonb(v_pedido),'reutilizado',false);
end;
$$;

revoke all on function public.materiales_pedir_adicional_obra(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.materiales_pedir_adicional_obra(uuid,text,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
