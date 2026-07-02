-- Diagnostico: como se manejan las obras dentro de lineas de produccion.
--
-- Resumen conceptual:
-- NO hay una tabla por obra.
-- Cada obra es una fila en public.produccion_obras.
-- Lo especifico de cada obra se guarda en tablas compartidas con obra_id/project_id:
--   produccion_obras                    = maestro de obras/barcos
--   panol_materiales + panol_material_modelo = matriz viva por modelo K37/K52/K55
--   panol_obra_materiales_snapshot      = lista fijada por obra + estado compra/recepcion/egreso
--   panol_obra_matriz_condicionantes    = si esa obra lleva/no lleva condicionantes
--   panol_obra_addons                   = opcionales/adicionales propios de esa obra
--   purchase_requests/project_id        = pedidos a compras asociados a la obra
--   purchase_request_items              = items de esos pedidos
--   panol_envios/obra_id                = envios/recepciones a panol asociados a la obra
--   panol_envio_items                   = items recibidos/pendientes de esos envios

-- 1) Columnas reales de las tablas que arman una obra
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

-- 2) Resumen por linea/modelo
with obras as (
  select
    o.id,
    o.codigo,
    o.descripcion,
    o.estado,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
    o.linea_nombre
  from public.produccion_obras o
),
snapshot_resumen as (
  select
    s.obra_id,
    count(*) as items_snapshot,
    count(*) filter (where s.estado in ('pendiente', 'pedido', 'comprado')) as items_abiertos,
    count(*) filter (where s.estado in ('en_panol', 'recibido', 'parcial')) as items_en_panol,
    count(*) filter (where s.estado = 'egresado') as items_egresados,
    count(*) filter (where s.es_adicional is true) as items_adicionales_snapshot
  from public.panol_obra_materiales_snapshot s
  group by s.obra_id
),
compras_resumen as (
  select
    pr.project_id as obra_id,
    count(*) as pedidos_compras,
    count(*) filter (where pr.es_adicional is true) as pedidos_adicionales,
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
  coalesce(o.linea_nombre, 'Sin linea') as linea_nombre,
  count(*) as obras,
  count(*) filter (where o.estado = 'activa') as obras_activas,
  sum(coalesce(sr.items_snapshot, 0)) as items_fijados,
  sum(coalesce(sr.items_abiertos, 0)) as items_abiertos,
  sum(coalesce(sr.items_en_panol, 0)) as items_en_panol,
  sum(coalesce(sr.items_egresados, 0)) as items_egresados,
  sum(coalesce(cr.pedidos_compras, 0)) as pedidos_compras,
  sum(coalesce(rr.envios_panol, 0)) as envios_panol
from obras o
left join snapshot_resumen sr on sr.obra_id = o.id
left join compras_resumen cr on cr.obra_id = o.id
left join recepcion_resumen rr on rr.obra_id = o.id
group by o.modelo, coalesce(o.linea_nombre, 'Sin linea')
order by o.modelo, linea_nombre;

-- 3) Resumen por obra
with obras as (
  select
    o.id,
    o.codigo,
    o.descripcion,
    o.estado,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
    o.linea_nombre
  from public.produccion_obras o
),
snapshot_resumen as (
  select
    s.obra_id,
    count(*) as items_snapshot,
    count(*) filter (where s.estado in ('pendiente', 'pedido', 'comprado')) as items_abiertos,
    count(*) filter (where s.estado in ('en_panol', 'recibido', 'parcial')) as items_en_panol,
    count(*) filter (where s.estado = 'egresado') as items_egresados,
    count(*) filter (where s.tipo = 'condicionante') as items_condicionantes,
    count(*) filter (where s.es_adicional is true) as items_adicionales
  from public.panol_obra_materiales_snapshot s
  group by s.obra_id
),
cond_resumen as (
  select
    oc.obra_id,
    count(*) as condicionantes_definidos,
    count(*) filter (where oc.activo is true) as condicionantes_activos
  from public.panol_obra_matriz_condicionantes oc
  group by oc.obra_id
),
addon_resumen as (
  select
    a.obra_id,
    count(*) as addons,
    count(*) filter (where a.tipo = 'opcional') as opcionales,
    count(*) filter (where coalesce(a.tipo, 'adicional') <> 'opcional') as adicionales
  from public.panol_obra_addons a
  group by a.obra_id
),
compras_resumen as (
  select
    pr.project_id as obra_id,
    count(*) as pedidos_compras,
    count(*) filter (where pr.es_adicional is true) as pedidos_adicionales,
    count(*) filter (where pr.status not in ('recibido', 'cancelado')) as pedidos_abiertos
  from public.purchase_requests pr
  where pr.project_id is not null
  group by pr.project_id
)
select
  o.id as obra_id,
  o.codigo,
  o.modelo,
  o.linea_nombre,
  o.estado,
  o.descripcion,
  coalesce(sr.items_snapshot, 0) as items_lista_fijada,
  coalesce(sr.items_abiertos, 0) as items_abiertos,
  coalesce(sr.items_en_panol, 0) as items_en_panol,
  coalesce(sr.items_egresados, 0) as items_egresados,
  coalesce(sr.items_condicionantes, 0) as items_condicionantes,
  coalesce(cr.condicionantes_definidos, 0) as condicionantes_definidos,
  coalesce(cr.condicionantes_activos, 0) as condicionantes_activos,
  coalesce(ar.addons, 0) as addons,
  coalesce(ar.opcionales, 0) as opcionales,
  coalesce(ar.adicionales, 0) as adicionales,
  coalesce(pr.pedidos_compras, 0) as pedidos_compras,
  coalesce(pr.pedidos_abiertos, 0) as pedidos_abiertos,
  coalesce(pr.pedidos_adicionales, 0) as pedidos_adicionales
from obras o
left join snapshot_resumen sr on sr.obra_id = o.id
left join cond_resumen cr on cr.obra_id = o.id
left join addon_resumen ar on ar.obra_id = o.id
left join compras_resumen pr on pr.obra_id = o.id
order by o.modelo, o.codigo;

-- 4) Detalle de lista fijada por obra
-- Cambiar codigo en params para ver una obra puntual; dejar null para ver todas.
with params as (
  select null::uuid as obra_id, null::text as codigo
),
obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
    o.linea_nombre
  from public.produccion_obras o
)
select
  o.codigo as obra,
  o.modelo,
  o.linea_nombre,
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
  s.es_adicional,
  s.precio_unitario,
  s.moneda,
  s.estado,
  s.recepcion_estado,
  s.recepcion_cantidad_recibida,
  s.egreso_at,
  s.egreso_nota,
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
where (p.obra_id is null or o.id = p.obra_id)
  and (p.codigo is null or o.codigo = p.codigo)
order by o.codigo, s.orden nulls last, s.created_at;

-- 5) Matriz viva que le corresponderia a cada obra segun su modelo
-- Esto NO es la lista fijada; es lo que sale de catalogo + panol_material_modelo.
-- Cambiar codigo en params para ver una obra puntual; dejar null para ver todas.
with params as (
  select null::uuid as obra_id, null::text as codigo
),
obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
    o.linea_nombre
  from public.produccion_obras o
),
matriz as (
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
    and (p.obra_id is null or o.id = p.obra_id)
    and (p.codigo is null or o.codigo = p.codigo)
)
select *
from matriz
order by obra, sector, descripcion;

-- 6) Condicionantes de matriz y como quedan en cada obra
with obras as (
  select
    o.id,
    o.codigo,
    nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
    o.linea_nombre
  from public.produccion_obras o
),
cond_items as (
  select
    ci.condicionante_id,
    jsonb_agg(jsonb_build_object(
      'material_id', ci.material_id,
      'descripcion', ci.descripcion,
      'cantidad', ci.cantidad,
      'unidad', ci.unidad,
      'tipo_item', ci.tipo_item,
      'notas', ci.notas
    ) order by ci.orden, ci.descripcion) as items
  from public.panol_matriz_condicionante_items ci
  where ci.activo is distinct from false
  group by ci.condicionante_id
)
select
  o.codigo as obra,
  o.modelo,
  c.id as condicionante_id,
  c.nombre,
  c.tipo,
  c.descripcion,
  c.activo_por_defecto,
  coalesce(oc.activo, c.activo_por_defecto) as activo_en_obra,
  oc.notas as notas_obra,
  ci.items
from obras o
join public.panol_matriz_condicionantes c
  on c.modelo::text = o.modelo
 and c.activo is distinct from false
left join public.panol_obra_matriz_condicionantes oc
  on oc.obra_id = o.id
 and oc.condicionante_id = c.id
left join cond_items ci on ci.condicionante_id = c.id
order by o.codigo, c.orden, c.nombre;

-- 7) Opcionales/adicionales propios de cada obra
select
  o.codigo as obra,
  nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
  a.id,
  a.tipo,
  a.descripcion,
  a.cantidad,
  a.proveedor,
  a.created_at
from public.panol_obra_addons a
join public.produccion_obras o on o.id = a.obra_id
order by o.codigo, a.created_at;

-- 8) Pedidos a compras asociados a obra
select
  o.codigo as obra,
  nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
  pr.id as purchase_request_id,
  pr.title,
  pr.status,
  pr.priority,
  pr.es_adicional,
  pr.destino,
  pr.proveedor,
  pr.estimated_amount,
  pr.actual_amount,
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
join public.produccion_obras o on o.id = pr.project_id
order by o.codigo, pr.created_at desc, pri.created_at;

-- 9) Recepcion/panol asociados a obra
select
  o.codigo as obra,
  nullif(regexp_replace(split_part(coalesce(o.codigo, ''), '-', 1), '[^0-9]', '', 'g'), '') as modelo,
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
join public.produccion_obras o on o.id = e.obra_id
order by o.codigo, e.created_at desc, it.created_at;
