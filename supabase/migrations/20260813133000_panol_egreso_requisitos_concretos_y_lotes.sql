begin;

-- Los movimientos de reclasificacion trasladan saldo desde un requisito
-- historico hacia el producto concreto elegido por el operario. No crean stock:
-- la salida generica y la entrada concreta se compensan exactamente.
create or replace function public.panol_stock_movimiento_delta(
  p_source text,
  p_estado text,
  p_recepcion_estado text,
  p_cantidad numeric,
  p_cantidad_egresada numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_estado in ('en_panol', 'recibido', 'parcial')
     and (
       p_recepcion_estado in ('recibido', 'parcial')
       or coalesce(p_source, '') in (
         'stock_general', 'remito', 'transferencia_ingreso',
         'ajuste_ingreso', 'reclasificacion_ingreso'
       )
       or coalesce(p_source, '') like 'stock\_%' escape '\'
       or coalesce(p_source, '') like 'transferencia\_ingreso%' escape '\'
     )
      then coalesce(p_cantidad, 0)
    when coalesce(p_source, '') like 'egreso%'
      or coalesce(p_source, '') like 'transferencia\_egreso%' escape '\'
      or coalesce(p_source, '') in ('conteo_fisico_reversion', 'reclasificacion_egreso')
      then -abs(coalesce(nullif(p_cantidad_egresada, 0), p_cantidad, 0))
    else 0
  end;
$$;

revoke all on function public.panol_stock_movimiento_delta(text,text,text,numeric,numeric) from public;
grant execute on function public.panol_stock_movimiento_delta(text,text,text,numeric,numeric) to authenticated;

-- Resuelve la identidad y, si hace falta, consume saldo historico generico para
-- convertirlo al producto concreto elegido. Todo ocurre dentro de la misma
-- transaccion del egreso o transferencia.
create or replace function public.panol_preparar_stock_producto(
  p_material_id uuid,
  p_producto_material_id uuid,
  p_variante text,
  p_sede text,
  p_obra_id uuid,
  p_cantidad numeric
)
returns table(material_id uuid, requisito_material_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrada public.panol_materiales%rowtype;
  v_producto public.panol_materiales%rowtype;
  v_producto_id uuid := p_material_id;
  v_requisito_id uuid := p_material_id;
  v_disponible_producto numeric := 0;
  v_disponible_generico numeric := 0;
  v_reclasificar numeric := 0;
  v_nota text;
begin
  select * into v_entrada
    from public.panol_materiales
   where id = p_material_id
     and activo is distinct from false;
  if not found then raise exception 'Producto inexistente o inactivo'; end if;

  if v_entrada.es_requisito then
    v_requisito_id := v_entrada.id;
    v_producto_id := p_producto_material_id;

    if v_producto_id is null and nullif(btrim(coalesce(p_variante, '')), '') is not null then
      select rp.producto_material_id into v_producto_id
        from public.panol_requisito_productos rp
       where rp.requisito_material_id = v_requisito_id
         and rp.activo
         and lower(btrim(rp.variante_legacy)) = lower(btrim(p_variante))
       limit 1;
    end if;

    if v_producto_id is null then
      raise exception 'Elegir el producto concreto para % antes de confirmar', v_entrada.descripcion;
    end if;
    if not exists (
      select 1
        from public.panol_requisito_productos rp
       where rp.requisito_material_id = v_requisito_id
         and rp.producto_material_id = v_producto_id
         and rp.activo
    ) then
      raise exception 'El producto elegido no corresponde al requisito %', v_entrada.descripcion;
    end if;
  else
    if p_producto_material_id is not null and p_producto_material_id <> p_material_id then
      raise exception 'El producto elegido no coincide con el material del stock';
    end if;
    select coalesce((
      select rp.requisito_material_id
        from public.panol_requisito_productos rp
       where rp.producto_material_id = p_material_id
         and rp.activo
       order by rp.updated_at desc
       limit 1
    ), p_material_id) into v_requisito_id;
  end if;

  select * into v_producto
    from public.panol_materiales
   where id = v_producto_id
     and activo is distinct from false;
  if not found or v_producto.es_requisito then
    raise exception 'Elegir un producto concreto activo antes de confirmar';
  end if;

  -- Todos los flujos toman primero el lock del requisito y luego el producto.
  -- Esto evita que dos terminales asignen el mismo saldo generico a la vez.
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', v_requisito_id::text, lower(coalesce(p_sede, '')), coalesce(p_obra_id::text, 'stock')), 0
  ));
  if v_producto_id <> v_requisito_id then
    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws('|', v_producto_id::text, lower(coalesce(p_sede, '')), coalesce(p_obra_id::text, 'stock')), 0
    ));
  end if;

  v_disponible_producto := public.panol_stock_disponible_ubicacion(v_producto_id, p_sede, p_obra_id);
  if v_producto_id <> v_requisito_id then
    v_disponible_generico := public.panol_stock_disponible_ubicacion(v_requisito_id, p_sede, p_obra_id);
  end if;

  if p_cantidad > v_disponible_producto + v_disponible_generico + 0.000001 then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %',
      v_disponible_producto + v_disponible_generico, p_cantidad;
  end if;

  v_reclasificar := greatest(p_cantidad - v_disponible_producto, 0);
  if v_reclasificar > 0.000001 then
    v_nota := concat(
      'Reclasificacion al egresar: ', v_entrada.descripcion,
      ' -> ', v_producto.descripcion
    );

    insert into public.panol_obra_materiales_snapshot(
      obra_id, obra_origen_id, material_id, requisito_material_id,
      descripcion, codigo, cantidad, cantidad_egresada, unidad, proveedor,
      tipo, tipo_label, notas, source, estado, recepcion_estado,
      recepcion_updated_at, stock_sede, stock_nota, egreso_at, egreso_por,
      egreso_nota, producto_asignado_at, producto_asignacion_origen
    ) values (
      p_obra_id, p_obra_id, v_requisito_id, v_requisito_id,
      v_entrada.descripcion, v_entrada.codigo, v_reclasificar, v_reclasificar,
      coalesce(v_entrada.unidad_medida, 'unidad'), v_entrada.proveedor,
      'reclasificacion', 'Reclasificacion de requisito', v_nota,
      'reclasificacion_egreso', 'egresado', 'egresado', now(), p_sede,
      v_nota, now(), auth.uid(), v_nota, now(), 'panol_reclasificacion'
    );

    insert into public.panol_obra_materiales_snapshot(
      obra_id, obra_origen_id, material_id, requisito_material_id,
      descripcion, codigo, cantidad, unidad, proveedor,
      tipo, tipo_label, precio_unitario, moneda, notas, source,
      estado, recepcion_estado, recepcion_updated_at, stock_sede,
      stock_nota, producto_asignado_at, producto_asignacion_origen
    ) values (
      p_obra_id, p_obra_id, v_producto_id, v_requisito_id,
      v_producto.descripcion, v_producto.codigo, v_reclasificar,
      coalesce(v_producto.unidad_medida, v_entrada.unidad_medida, 'unidad'),
      v_producto.proveedor, 'reclasificacion', 'Producto concreto asignado',
      v_producto.precio_unitario, v_producto.moneda, v_nota,
      'reclasificacion_ingreso', 'en_panol', 'recibido', now(), p_sede,
      v_nota, now(), 'panol_reclasificacion'
    );
  end if;

  return query select v_producto_id, v_requisito_id;
end;
$$;

revoke all on function public.panol_preparar_stock_producto(uuid,uuid,text,text,uuid,numeric) from public, anon, authenticated;

drop function if exists public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text);
drop function if exists public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text,uuid);

create function public.panol_egresar_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_id uuid default null,
  p_destino_obra_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_es_adicional boolean default false,
  p_variante text default null,
  p_producto_material_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material public.panol_materiales%rowtype;
  v_material_id uuid;
  v_requisito_id uuid;
  v_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_id is null then raise exception 'Elegir un producto del catalogo antes de egresarlo'; end if;
  if v_sede is null then raise exception 'Elegir la sede de origen'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if not (public.is_panol_manager(v_uid) or public.can_receive_envio(v_sede, v_uid)) then
    raise exception 'Sin permiso para egresar producto';
  end if;

  select r.material_id, r.requisito_material_id
    into v_material_id, v_requisito_id
    from public.panol_preparar_stock_producto(
      p_material_id, p_producto_material_id, p_variante,
      v_sede, p_obra_id, p_cantidad
    ) r;

  select * into v_material from public.panol_materiales where id = v_material_id;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor, rubro,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
    sector_destino, egreso_destino_obra_id, cantidad_egresada,
    es_adicional, variante, producto_asignado_at,
    producto_asignacion_origen
  ) values (
    p_obra_id, p_obra_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor, null, 'egreso_producto', 'Egreso manual',
    v_material.precio_unitario, v_material.moneda, v_nota, 'egreso_producto',
    'egresado', 'egresado', now(), v_sede, v_nota, now(), v_uid, v_nota,
    v_retirado, v_sector, p_destino_obra_id, p_cantidad,
    coalesce(p_es_adicional, false), null, now(),
    case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text,uuid) from public;
grant execute on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text,uuid) to authenticated;

drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text);
drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text,uuid);

create function public.panol_transferir_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_origen_id uuid default null,
  p_obra_destino_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_es_adicional boolean default false,
  p_variante text default null,
  p_producto_material_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material public.panol_materiales%rowtype;
  v_material_id uuid;
  v_requisito_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_liberar boolean := p_obra_destino_id is null;
  v_egreso uuid;
  v_ingreso uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_id is null then raise exception 'Elegir un producto del catalogo antes de transferirlo'; end if;
  if v_sede is null then raise exception 'Elegir la sede de origen'; end if;
  if p_obra_origen_id is null and p_obra_destino_id is null then raise exception 'Elegir una obra de origen o destino'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if not (public.is_panol_manager(v_uid) or public.can_receive_envio(v_sede, v_uid)) then
    raise exception 'Sin permiso para transferir producto';
  end if;

  select r.material_id, r.requisito_material_id
    into v_material_id, v_requisito_id
    from public.panol_preparar_stock_producto(
      p_material_id, p_producto_material_id, p_variante,
      v_sede, p_obra_origen_id, p_cantidad
    ) r;
  select * into v_material from public.panol_materiales where id = v_material_id;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
    egreso_destino_obra_id, cantidad_egresada, es_adicional,
    producto_asignado_at, producto_asignacion_origen
  ) values (
    p_obra_origen_id, p_obra_origen_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor, 'transferencia',
    case when v_liberar then 'Liberado de obra' else 'Transferencia a obra' end,
    v_material.precio_unitario, v_material.moneda, v_nota,
    'transferencia_egreso', 'egresado', 'egresado', now(), v_sede,
    v_nota, now(), v_uid, v_nota, v_retirado,
    p_obra_destino_id, p_cantidad, coalesce(p_es_adicional, false),
    now(), case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_egreso;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, es_adicional, producto_asignado_at,
    producto_asignacion_origen
  ) values (
    p_obra_destino_id, p_obra_origen_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor,
    case when v_liberar then 'stock_general' else 'transferencia' end,
    case when v_liberar then 'Liberado a stock' else 'Transferencia recibida' end,
    v_material.precio_unitario, v_material.moneda, v_nota,
    'transferencia_ingreso', 'en_panol', 'recibido', now(), v_sede,
    v_nota, coalesce(p_es_adicional, false), now(),
    case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_ingreso;

  return jsonb_build_object('egreso_id', v_egreso, 'ingreso_id', v_ingreso);
end;
$$;

revoke all on function public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text,uuid) from public;
grant execute on function public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text,uuid) to authenticated;

-- Una sola llamada para todo el carrito: si falla cualquier renglon, Postgres
-- revierte tambien los anteriores.
create or replace function public.panol_egresar_carrito(
  p_items jsonb,
  p_destino_obra_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito esta vacio';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'El carrito supera los 100 renglones'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id := public.panol_egresar_producto(
      nullif(v_item ->> 'material_id', '')::uuid,
      nullif(v_item ->> 'descripcion', ''),
      nullif(v_item ->> 'codigo', ''),
      replace(coalesce(nullif(v_item ->> 'cantidad', ''), '0'), ',', '.')::numeric,
      coalesce(nullif(v_item ->> 'unidad', ''), 'unidad'),
      nullif(v_item ->> 'sede', ''),
      nullif(v_item ->> 'obra_id', '')::uuid,
      p_destino_obra_id,
      p_nota,
      p_retirado_por,
      p_sector_destino,
      coalesce((v_item ->> 'es_adicional')::boolean, false),
      nullif(v_item ->> 'variante', ''),
      nullif(v_item ->> 'producto_material_id', '')::uuid
    );
    v_ids := v_ids || jsonb_build_array(v_id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('cantidad', v_count, 'egreso_ids', v_ids);
end;
$$;

revoke all on function public.panol_egresar_carrito(jsonb,uuid,text,text,text) from public;
grant execute on function public.panol_egresar_carrito(jsonb,uuid,text,text,text) to authenticated;

commit;
