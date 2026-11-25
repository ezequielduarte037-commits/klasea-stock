-- Planilla de Compras (25/11/2026)
--
-- 1. Stock del pañol ya sumado por material. La planilla bajaba los ~15.600
--    renglones del ledger (16 páginas en fila, ~10 s) sólo para sumar cuánto
--    hay libre y cuánto reservado. La regla es la misma de rowDelta()
--    (una cantidad vacía cuenta como 0, igual que qtyNum en la app)
--    en src/features/panol/panolMovimientos.js: si cambia una, cambia la otra.
--
-- 2. Pedido a Compras para varias obras en una sola operación: un pedido por
--    obra, sus renglones y el renglón de la lista de cada obra marcado
--    "pedido". Antes se hacía llamada por llamada desde el navegador y un corte
--    a la mitad dejaba pedidos a medias.

create or replace function public.panol_planilla_stock_por_material()
returns table(material_id uuid, libre numeric, reservado numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with filas as (
    select s.material_id,
           s.obra_id,
           lower(btrim(coalesce(s.source, ''))) as src,
           s.estado,
           btrim(coalesce(s.recepcion_estado, '')) as rec,
           s.cantidad,
           s.cantidad_egresada
      from public.panol_obra_materiales_snapshot s
     where s.material_id is not null
  ), deltas as (
    select material_id, obra_id,
           case
             when src = 'ajuste_ubicacion' then 0
             when estado in ('en_panol', 'recibido', 'parcial')
              and (rec in ('recibido', 'parcial')
                   or src in ('stock_general', 'remito', 'transferencia_ingreso', 'ajuste_ingreso', 'reclasificacion_ingreso')
                   or src like 'stock\_%'
                   or src like 'transferencia_ingreso%')
               then coalesce(cantidad, 0)
             when src like 'egreso%'
               or src like 'transferencia_egreso%'
               or src in ('reclasificacion_egreso', 'conteo_fisico_reversion')
               then -abs(coalesce(cantidad_egresada, 0))
             else 0
           end as delta
      from filas
  )
  select material_id,
         coalesce(sum(delta) filter (where obra_id is null), 0) as libre,
         coalesce(sum(delta) filter (where obra_id is not null), 0) as reservado
    from deltas
   where delta <> 0
   group by material_id;
$$;

grant execute on function public.panol_planilla_stock_por_material() to authenticated;


-- 1,5 -> "1.5"; 2,00 -> "2". Para el texto del pedido.
create or replace function public.compras_numero_corto(p numeric)
returns text language sql immutable set search_path = public as $$
  select case when p is null then '' when p = trunc(p) then trunc(p)::text
              else rtrim(rtrim(p::text, '0'), '.') end;
$$;

-- p_items: [{ obra_id, snapshot_id?, requisito_material_id, material_id,
--             description, codigo?, quantity, cantidad_base?, unit?, proveedor?, rubro? }]
-- p_lote: lo genera la pantalla por cada armado; repetir la llamada con el
-- mismo lote devuelve los pedidos ya creados en vez de duplicarlos.
create or replace function public.compras_pedir_planilla_obras(
  p_titulo text,
  p_observaciones text,
  p_lote uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_obra record;
  v_pedido public.purchase_requests;
  v_item jsonb;
  v_origen public.panol_obra_materiales_snapshot;
  v_cantidad numeric;
  v_item_id uuid;
  v_snapshot_id uuid;
  v_material uuid;
  v_requisito uuid;
  v_renglones text;
  v_titulo text;
  v_varias boolean;
  v_resultado jsonb := '[]'::jsonb;
begin
  if v_usuario is null then raise exception 'No hay usuario autenticado.'; end if;
  if p_lote is null then raise exception 'Falta identificar el pedido.'; end if;
  if nullif(btrim(p_titulo), '') is null then raise exception 'Falta el título del pedido.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'Faltan los ítems del pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where nullif(e.value->>'obra_id', '') is null) then
    raise exception 'Hay un ítem sin obra. Actualizá la planilla.';
  end if;
  if (select count(*) from jsonb_array_elements(p_items) e where nullif(e.value->>'snapshot_id', '') is not null)
     <> (select count(distinct e.value->>'snapshot_id') from jsonb_array_elements(p_items) e where nullif(e.value->>'snapshot_id', '') is not null) then
    raise exception 'Hay ítems repetidos. Actualizá la planilla.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('planilla:' || p_lote::text, 0));

  -- Ya creado con este lote (doble clic, reintento): se devuelve lo que hay.
  if exists (select 1 from public.purchase_requests
              where source = 'materiales_obra' and source_ref like 'planilla:' || p_lote::text || ':%') then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'obra_id', r.project_id, 'title', r.title)), '[]'::jsonb)
      into v_resultado
      from public.purchase_requests r
     where r.source = 'materiales_obra' and r.source_ref like 'planilla:' || p_lote::text || ':%';
    return jsonb_build_object('pedidos', v_resultado, 'reutilizado', true);
  end if;

  -- Los renglones de obra se bloquean en orden estable antes de tocarlos.
  perform s.id from public.panol_obra_materiales_snapshot s
   where s.id in (select (e.value->>'snapshot_id')::uuid from jsonb_array_elements(p_items) e
                   where nullif(e.value->>'snapshot_id', '') is not null)
   order by s.id for update;

  select count(distinct e.value->>'obra_id') > 1 into v_varias from jsonb_array_elements(p_items) e;

  for v_obra in
    select o.id, o.codigo
      from public.produccion_obras o
     where o.id in (select (e.value->>'obra_id')::uuid from jsonb_array_elements(p_items) e)
     order by o.codigo
  loop
    select string_agg(
             public.compras_numero_corto((e.value->>'quantity')::numeric) || ' '
             || coalesce(nullif(e.value->>'unit', ''), 'unidad') || '  ' || btrim(e.value->>'description')
             || case when nullif(e.value->>'codigo', '') is not null then ' (' || (e.value->>'codigo') || ')' else '' end,
             E'\n' order by e.ordinality)
      into v_renglones
      from jsonb_array_elements(p_items) with ordinality e
     where (e.value->>'obra_id')::uuid = v_obra.id;

    v_titulo := btrim(p_titulo) || case when v_varias then ' · ' || v_obra.codigo else '' end;

    insert into public.purchase_requests (
      title, description, priority, status, project_id, destino,
      source, source_ref, es_adicional, tipo_pedido, created_by
    ) values (
      v_titulo,
      nullif(concat_ws(E'\n\n', nullif(btrim(coalesce(p_observaciones, '')), ''), v_renglones), ''),
      'media', 'nuevo', v_obra.id, 'Obra ' || v_obra.codigo,
      'materiales_obra', 'planilla:' || p_lote::text || ':' || v_obra.id::text, false, 'estandar', v_usuario
    ) returning * into v_pedido;

    for v_item in
      select e.value from jsonb_array_elements(p_items) with ordinality e
       where (e.value->>'obra_id')::uuid = v_obra.id
       order by e.ordinality
    loop
      v_cantidad := (v_item->>'quantity')::numeric;
      if v_cantidad is null or v_cantidad <= 0 or v_cantidad::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Ingresá una cantidad mayor que cero en cada ítem.';
      end if;
      if nullif(btrim(v_item->>'description'), '') is null then
        raise exception 'Falta la descripción de un ítem.';
      end if;
      v_material := nullif(v_item->>'material_id', '')::uuid;
      v_requisito := coalesce(nullif(v_item->>'requisito_material_id', '')::uuid, v_material);
      v_snapshot_id := nullif(v_item->>'snapshot_id', '')::uuid;

      if v_snapshot_id is not null then
        select * into v_origen from public.panol_obra_materiales_snapshot
         where id = v_snapshot_id and obra_id = v_obra.id;
        if not found then
          raise exception '% ya no está en la lista de %. Actualizá la planilla.', btrim(v_item->>'description'), v_obra.codigo;
        end if;
        if v_origen.purchase_request_id is not null or v_origen.purchase_request_item_id is not null
           or coalesce(v_origen.estado, 'pendiente') <> 'pendiente'
           or v_origen.panol_envio_item_id is not null then
          raise exception '% de % ya tiene un pedido o un aviso. Actualizá la planilla.', btrim(v_item->>'description'), v_obra.codigo;
        end if;
        if coalesce(v_origen.requisito_material_id, v_origen.material_id) is distinct from v_requisito then
          raise exception 'Cambió el material de % en %. Actualizá la planilla.', btrim(v_item->>'description'), v_obra.codigo;
        end if;
      end if;

      insert into public.purchase_request_items (
        request_id, description, quantity, unit, destination, material_id, requisito_material_id,
        catalog_source, notes
      ) values (
        v_pedido.id, btrim(v_item->>'description'), v_cantidad::text,
        coalesce(nullif(v_item->>'unit', ''), 'unidad'), 'Obra ' || v_obra.codigo,
        v_material, v_requisito, 'panol',
        case when nullif(v_item->>'proveedor', '') is not null then 'Proveedor sugerido: ' || (v_item->>'proveedor') end
      ) returning id into v_item_id;

      if v_snapshot_id is not null then
        update public.panol_obra_materiales_snapshot
           set estado = 'pedido',
               purchase_request_id = v_pedido.id,
               purchase_request_item_id = v_item_id,
               material_id = coalesce(v_material, material_id)
         where id = v_snapshot_id;
      else
        -- La obra todavía no tenía renglón para este material: nace ya pedido.
        -- Como en la lista de obra, se guarda la cantidad BASE de la matriz;
        -- los condicionantes se aplican al leer.
        insert into public.panol_obra_materiales_snapshot (
          obra_id, requisito_material_id, material_id, descripcion, codigo, cantidad, unidad,
          proveedor, rubro, tipo, tipo_label, source, es_adicional, estado, especificaciones,
          purchase_request_id, purchase_request_item_id
        ) values (
          v_obra.id, v_requisito, coalesce(v_material, v_requisito), btrim(v_item->>'description'),
          nullif(v_item->>'codigo', ''),
          coalesce(nullif(v_item->>'cantidad_base', '')::numeric, v_cantidad),
          coalesce(nullif(v_item->>'unit', ''), 'unidad'),
          nullif(v_item->>'proveedor', ''), nullif(v_item->>'rubro', ''),
          'base', 'Base', 'matriz', false, 'pedido', '{}'::jsonb,
          v_pedido.id, v_item_id
        );
      end if;
    end loop;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'id', v_pedido.id, 'obra_id', v_obra.id, 'codigo', v_obra.codigo, 'title', v_pedido.title));
  end loop;

  if jsonb_array_length(v_resultado) = 0 then
    raise exception 'No se encontraron las obras del pedido. Actualizá la planilla.';
  end if;
  return jsonb_build_object('pedidos', v_resultado, 'reutilizado', false);
end;
$$;

grant execute on function public.compras_pedir_planilla_obras(text, text, uuid, jsonb) to authenticated;
