-- Cada adicional nuevo tiene su propio renglón operativo, incluso cuando el
-- mismo material ya forma parte de la matriz o de otra compra de la obra.
alter table public.panol_obra_addons
  add column if not exists obra_snapshot_id uuid
  references public.panol_obra_materiales_snapshot(id) on delete set null;

create index if not exists panol_obra_addons_snapshot_idx
  on public.panol_obra_addons(obra_snapshot_id) where obra_snapshot_id is not null;

create or replace function public.materiales_adicional_recepcion_parcial()
returns trigger language plpgsql set search_path = public
as $$
declare v_recibido numeric;
begin
  if new.source='adicional_obra' and new.recepcion_estado='recibido' and new.cantidad>0
     and replace(coalesce(new.recepcion_cantidad_recibida,''),',','.') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_recibido := replace(new.recepcion_cantidad_recibida,',','.')::numeric;
    if v_recibido>0 and v_recibido<new.cantidad then
      new.recepcion_estado := 'parcial';
      if new.estado in ('en_panol','recibido') then new.estado := 'parcial'; end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_materiales_adicional_recepcion_parcial on public.panol_obra_materiales_snapshot;
create trigger trg_materiales_adicional_recepcion_parcial before insert or update on public.panol_obra_materiales_snapshot
for each row execute function public.materiales_adicional_recepcion_parcial();

create or replace function public.materiales_crear_adicional_obra(p_obra_id uuid, p_datos jsonb)
returns public.panol_obra_addons
language plpgsql security invoker set search_path = public
as $$
declare
  v_addon public.panol_obra_addons;
  v_snapshot_id uuid;
  v_cantidad numeric := (p_datos->>'cantidad')::numeric;
  v_rubro text;
begin
  if auth.uid() is null then raise exception 'No hay usuario autenticado.'; end if;
  if nullif(btrim(p_datos->>'descripcion'),'') is null then raise exception 'Falta la descripción del adicional.'; end if;
  if v_cantidad is null or v_cantidad <= 0 or v_cantidad::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Ingresá una cantidad mayor que cero.';
  end if;
  insert into public.panol_obra_addons(
    obra_id,material_id,descripcion,cantidad,proveedor,tipo,observaciones,
    codigo,unidad,categoria_id,proveedor_id,precio_unitario,moneda,imagen_url,links,codigo_barra,variantes
  ) values (
    p_obra_id,nullif(p_datos->>'material_id','')::uuid,btrim(p_datos->>'descripcion'),v_cantidad,
    nullif(p_datos->>'proveedor',''),coalesce(nullif(p_datos->>'tipo',''),'adicional'),nullif(p_datos->>'observaciones',''),
    nullif(p_datos->>'codigo',''),coalesce(nullif(p_datos->>'unidad',''),'unidad'),
    nullif(p_datos->>'categoria_id','')::uuid,nullif(p_datos->>'proveedor_id','')::uuid,
    nullif(p_datos->>'precio_unitario','')::numeric,nullif(p_datos->>'moneda',''),nullif(p_datos->>'imagen_url',''),
    coalesce(p_datos->'links','[]'::jsonb),nullif(p_datos->>'codigo_barra',''),coalesce(p_datos->'variantes','[]'::jsonb)
  ) returning * into v_addon;
  select nombre into v_rubro from public.panol_categorias where id = v_addon.categoria_id;
  insert into public.panol_obra_materiales_snapshot(
    obra_id,material_id,requisito_material_id,descripcion,codigo,cantidad,unidad,proveedor,rubro,
    tipo,tipo_label,precio_unitario,moneda,notas,source,es_adicional,estado,tipo_pedido
  ) values (
    p_obra_id,v_addon.material_id,v_addon.material_id,v_addon.descripcion,v_addon.codigo,v_cantidad,
    v_addon.unidad,v_addon.proveedor,v_rubro,'addon',
    case when v_addon.tipo='opcional' then 'Opcional' else 'Adicional' end,
    v_addon.precio_unitario,v_addon.moneda,v_addon.observaciones,'adicional_obra',true,'pendiente','adicional'
  ) returning id into v_snapshot_id;
  update public.panol_obra_addons set obra_snapshot_id=v_snapshot_id where id=v_addon.id returning * into v_addon;
  return v_addon;
end;
$$;

create or replace function public.materiales_reasignar_adicional_obra(p_addon_id uuid,p_obra_id uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_addon public.panol_obra_addons;
  v_snapshot public.panol_obra_materiales_snapshot;
begin
  if auth.uid() is null then raise exception 'No hay usuario autenticado.'; end if;
  select * into v_addon from public.panol_obra_addons where id=p_addon_id for update;
  if not found or v_addon.obra_snapshot_id is null then raise exception 'No se encontró el adicional. Actualizá la lista.'; end if;
  select * into v_snapshot from public.panol_obra_materiales_snapshot where id=v_addon.obra_snapshot_id for update;
  if not found or v_snapshot.obra_id<>v_addon.obra_id then raise exception 'Revisá la obra del adicional antes de moverlo.'; end if;
  if v_snapshot.estado<>'pendiente' or v_snapshot.purchase_request_id is not null
    or v_snapshot.purchase_request_item_id is not null or v_snapshot.panol_envio_id is not null
    or v_snapshot.panol_envio_item_id is not null or v_snapshot.recepcion_estado is not null or v_snapshot.egreso_at is not null then
    raise exception 'Este adicional ya tiene compras o movimientos. No se puede reasignar desde la lista.';
  end if;
  update public.panol_obra_materiales_snapshot set obra_id=p_obra_id where id=v_snapshot.id;
  if not found then raise exception 'No tenés permiso para mover el adicional.'; end if;
  update public.panol_obra_addons set obra_id=p_obra_id where id=p_addon_id;
  if not found then raise exception 'No tenés permiso para mover el adicional.'; end if;
end;
$$;

-- El pedido, sus líneas y los adicionales se guardan juntos. Un reintento del
-- mismo envío devuelve el pedido ya creado en lugar de duplicarlo.
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
  v_reutilizar boolean;
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
  -- reutilicen el mismo adicional pendiente.
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
    v_reutilizar := coalesce(v_origen.es_adicional,false) or v_origen.tipo='addon' or v_origen.source in ('addon','adicional_obra');
    v_reutilizar := v_reutilizar and v_origen.estado='pendiente'
      and v_origen.purchase_request_id is null and v_origen.purchase_request_item_id is null
      and v_origen.panol_envio_id is null and v_origen.panol_envio_item_id is null
      and v_origen.recepcion_estado is null and v_origen.egreso_at is null;
    if v_reutilizar then
      select * into v_addon from public.panol_obra_addons
       where obra_id=p_obra_id and (
         obra_snapshot_id=v_origen.id or (obra_snapshot_id is null and id=nullif(v_item->>'addon_id','')::uuid)
       ) order by id limit 1 for update;
      -- Un adicional histórico sin ficha propia también puede pedirse desde
      -- su renglón pendiente; no se incrementa otra vez la necesidad.
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
    update public.panol_obra_materiales_snapshot set
      cantidad=v_cantidad,estado='pedido',purchase_request_id=v_pedido.id,purchase_request_item_id=v_item_id,
      material_id=nullif(v_item->>'material_id','')::uuid,
      requisito_material_id=nullif(v_item->>'requisito_material_id','')::uuid,
      especificaciones=coalesce(v_item->'especificaciones','{}'::jsonb),
      especificaciones_origen='asignacion_obra',source='adicional_obra',tipo='addon',tipo_label='Adicional',es_adicional=true
     where id=v_snapshot_id;
    if not found then raise exception 'No se pudo vincular el adicional al pedido. Revisá tus permisos.'; end if;
    if v_addon.id is not null then
      update public.panol_obra_addons set cantidad=v_cantidad,obra_snapshot_id=v_snapshot_id where id=v_addon.id;
    end if;
  end loop;
  return jsonb_build_object('request',to_jsonb(v_pedido),'reutilizado',false);
end;
$$;

revoke all on function public.materiales_crear_adicional_obra(uuid,jsonb) from public,anon;
revoke all on function public.materiales_reasignar_adicional_obra(uuid,uuid) from public,anon;
revoke all on function public.materiales_pedir_adicional_obra(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.materiales_crear_adicional_obra(uuid,jsonb) to authenticated;
grant execute on function public.materiales_reasignar_adicional_obra(uuid,uuid) to authenticated;
grant execute on function public.materiales_pedir_adicional_obra(uuid,text,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
