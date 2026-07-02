-- Diagnostico COMPATIBLE: obras dentro de lineas de produccion.
--
-- Este archivo evita columnas opcionales como produccion_obras.modelo,
-- produccion_obras.descripcion y produccion_obras.linea_nombre.
-- Usa como base segura:
--   produccion_obras.id
--   produccion_obras.codigo
--   produccion_obras.estado
--
-- Importante: ejecutar bloque por bloque en Supabase SQL Editor si queres ver
-- cada resultado por separado.

-- 1) Ver columnas reales disponibles.
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'produccion_obras',
    'panol_materiales',
    'panol_material_modelo',
    'panol_obra_materiales_snapshot',
    'panol_matriz_condicionantes',
    'panol_matriz_condicionante_items',
    'panol_obra_matriz_condicionantes',
    'panol_obra_addons',
    'purchase_requests',
    'purchase_request_items',
    'panol_envios',
    'panol_envio_items'
  )
order by table_name, ordinal_position;

-- 2) Obras y modelo/linea deducidos desde codigo.
-- Ej: 55-2 => 55, K37-38 => 37, K85-3 => 85.
select
  o.id as obra_id,
  o.codigo,
  o.estado,
  nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo_calculado
from public.produccion_obras o
order by modelo_calculado, o.codigo;

-- 3) Resumen por linea/modelo calculado.
with obras as (
  select
    o.id,
    o.codigo,
    o.estado,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
),
snapshot_resumen as (
  select
    s.obra_id,
    count(*) as items_snapshot,
    count(*) filter (where coalesce(s.estado, 'pendiente') in ('pendiente', 'pedido', 'comprado')) as items_abiertos,
    count(*) filter (where coalesce(s.estado, '') in ('en_panol', 'recibido', 'parcial')) as items_en_panol,
    count(*) filter (where s.estado = 'egresado') as items_egresados
  from public.panol_obra_materiales_snapshot s
  group by s.obra_id
),
compras_resumen as (
  select
    pr.project_id as obra_id,
    count(*) as pedidos_compras,
    count(*) filter (where pr.status not in ('recibido', 'cancelado')) as pedidos_abiertos
  from public.purchase_requests pr
  where pr.project_id is not null
  group by pr.project_id
),
recepcion_resumen as (
  select
    e.obra_id,
    count(*) as envios_panol,
    count(*) filter (where e.estado not in ('completado', 'cancelado')) as envios_abiertos
  from public.panol_envios e
  where e.obra_id is not null
  group by e.obra_id
)
select
  o.modelo,
  count(*) as obras,
  count(*) filter (where o.estado = 'activa') as obras_activas,
  sum(coalesce(sr.items_snapshot, 0)) as items_fijados,
  sum(coalesce(sr.items_abiertos, 0)) as items_abiertos,
  sum(coalesce(sr.items_en_panol, 0)) as items_en_panol,
  sum(coalesce(sr.items_egresados, 0)) as items_egresados,
  sum(coalesce(cr.pedidos_compras, 0)) as pedidos_compras,
  sum(coalesce(cr.pedidos_abiertos, 0)) as pedidos_compras_abiertos,
  sum(coalesce(rr.envios_panol, 0)) as envios_panol,
  sum(coalesce(rr.envios_abiertos, 0)) as envios_panol_abiertos
from obras o
left join snapshot_resumen sr on sr.obra_id = o.id
left join compras_resumen cr on cr.obra_id = o.id
left join recepcion_resumen rr on rr.obra_id = o.id
group by o.modelo
order by o.modelo;

-- 4) Resumen por obra.
with obras as (
  select
    o.id,
    o.codigo,
    o.estado,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
),
snapshot_resumen as (
  select
    s.obra_id,
    count(*) as items_snapshot,
    count(*) filter (where coalesce(s.estado, 'pendiente') in ('pendiente', 'pedido', 'comprado')) as items_abiertos,
    count(*) filter (where coalesce(s.estado, '') in ('en_panol', 'recibido', 'parcial')) as items_en_panol,
    count(*) filter (where s.estado = 'egresado') as items_egresados,
    count(*) filter (where s.tipo = 'condicionante') as items_condicionantes
  from public.panol_obra_materiales_snapshot s
  group by s.obra_id
),
compras_resumen as (
  select
    pr.project_id as obra_id,
    count(*) as pedidos_compras,
    count(*) filter (where pr.status not in ('recibido', 'cancelado')) as pedidos_abiertos
  from public.purchase_requests pr
  where pr.project_id is not null
  group by pr.project_id
),
recepcion_resumen as (
  select
    e.obra_id,
    count(*) as envios_panol,
    count(*) filter (where e.estado not in ('completado', 'cancelado')) as envios_abiertos
  from public.panol_envios e
  where e.obra_id is not null
  group by e.obra_id
)
select
  o.id as obra_id,
  o.codigo,
  o.modelo,
  o.estado,
  coalesce(sr.items_snapshot, 0) as items_lista_fijada,
  coalesce(sr.items_abiertos, 0) as items_abiertos,
  coalesce(sr.items_en_panol, 0) as items_en_panol,
  coalesce(sr.items_egresados, 0) as items_egresados,
  coalesce(sr.items_condicionantes, 0) as items_condicionantes,
  coalesce(cr.pedidos_compras, 0) as pedidos_compras,
  coalesce(cr.pedidos_abiertos, 0) as pedidos_abiertos,
  coalesce(rr.envios_panol, 0) as envios_panol,
  coalesce(rr.envios_abiertos, 0) as envios_abiertos
from obras o
left join snapshot_resumen sr on sr.obra_id = o.id
left join compras_resumen cr on cr.obra_id = o.id
left join recepcion_resumen rr on rr.obra_id = o.id
order by o.modelo, o.codigo;

-- 5) Detalle de lista fijada por obra.
-- Para una obra puntual, cambiar null por el codigo:
--   select null::text as codigo
--   select '55-2'::text as codigo
with params as (
  select null::text as codigo
),
obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
)
select
  o.codigo as obra,
  o.modelo,
  s.orden,
  s.id as snapshot_id,
  s.material_id,
  s.descripcion,
  s.codigo as codigo_material,
  s.cantidad,
  s.unidad,
  s.proveedor,
  s.rubro,
  s.tipo,
  s.tipo_label,
  s.precio_unitario,
  s.moneda,
  s.estado,
  s.recepcion_estado,
  s.recepcion_cantidad_recibida,
  s.purchase_request_id,
  s.purchase_request_item_id,
  s.panol_envio_id,
  s.panol_envio_item_id,
  s.notas,
  s.created_at,
  s.updated_at
from public.panol_obra_materiales_snapshot s
join obras o on o.id = s.obra_id
cross join params p
where p.codigo is null or o.codigo = p.codigo
order by o.codigo, s.orden nulls last, s.created_at;

-- 6) Matriz viva que le corresponderia a cada obra segun modelo calculado.
-- Esto NO es lista fijada; sale del catalogo + panol_material_modelo.
with params as (
  select null::text as codigo
),
obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
)
select
  o.codigo as obra,
  o.modelo,
  m.id as material_id,
  m.descripcion,
  m.codigo as codigo_material,
  mm.cantidad,
  m.unidad_medida,
  c.nombre as sector,
  m.proveedor,
  m.precio_unitario,
  m.moneda,
  m.revisado,
  m.activo
from obras o
join public.panol_material_modelo mm on mm.modelo::text = o.modelo
join public.panol_materiales m on m.id = mm.material_id
left join public.panol_categorias c on c.id = m.categoria_id
cross join params p
where m.activo is distinct from false
  and (p.codigo is null or o.codigo = p.codigo)
order by o.codigo, c.nombre, m.descripcion;

-- 7) Pedidos a compras asociados a obra.
with obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
)
select
  o.codigo as obra,
  o.modelo,
  pr.id as purchase_request_id,
  pr.title,
  pr.status,
  pr.priority,
  pr.destino,
  pr.proveedor,
  pr.created_at,
  pri.id as item_id,
  pri.description as item_descripcion,
  pri.quantity,
  pri.unit,
  pri.status as item_status,
  pri.material_id,
  pri.destination
from public.purchase_requests pr
left join public.purchase_request_items pri on pri.request_id = pr.id
join obras o on o.id = pr.project_id
order by o.codigo, pr.created_at desc, pri.created_at;

-- 8) Recepcion/panol asociados a obra.
with obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo
  from public.produccion_obras o
)
select
  o.codigo as obra,
  o.modelo,
  e.id as envio_id,
  e.titulo,
  e.estado as envio_estado,
  e.sede,
  e.origen,
  e.purchase_request_id,
  e.created_at as envio_created_at,
  it.id as envio_item_id,
  it.obra_snapshot_item_id,
  it.purchase_request_item_id,
  it.descripcion,
  it.codigo,
  it.cantidad,
  it.unidad,
  it.estado as item_estado,
  it.cantidad_recibida,
  it.nota,
  it.marcado_at
from public.panol_envios e
left join public.panol_envio_items it on it.envio_id = e.id
join obras o on o.id = e.obra_id
order by o.codigo, e.created_at desc, it.created_at;
