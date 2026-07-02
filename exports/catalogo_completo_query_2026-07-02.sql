-- Estructura del catalogo completo
-- Tablas principales:
--   panol_materiales: maestro de productos
--   panol_material_modelo: cantidades por modelo K37/K52/K55
--   panol_categorias: sector/rubro
--   panol_precios: historial de precios
--   panol_material_categorias: sectores extra M2M
--   panol_material_proveedores: proveedores alternativos

-- Ver columnas reales en Supabase:
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'panol_materiales',
    'panol_material_modelo',
    'panol_categorias',
    'panol_precios',
    'panol_material_categorias',
    'panol_material_proveedores',
    'panol_proveedores'
  )
order by table_name, ordinal_position;

-- Vista plana del catalogo, similar al CSV exportado:
with ultimo_precio as (
  select distinct on (material_id)
    material_id, precio_unitario, moneda, proveedor, fecha, created_at
  from public.panol_precios
  order by material_id, coalesce(fecha, created_at)::timestamptz desc nulls last
),
modelo_pivot as (
  select
    material_id,
    max(cantidad) filter (where modelo::text = '37') as cant_k37,
    max(cantidad) filter (where modelo::text = '52') as cant_k52,
    max(cantidad) filter (where modelo::text = '55') as cant_k55
  from public.panol_material_modelo
  group by material_id
)
select
  m.id, m.activo, m.descripcion, m.codigo, m.codigo_barra,
  c.nombre as sector, m.categoria_id,
  m.proveedor, m.proveedor_id, p.tipo as proveedor_tipo,
  m.unidad_medida,
  m.precio_unitario as precio_catalogo, m.moneda as moneda_catalogo,
  up.precio_unitario as ultimo_precio, up.moneda as ultimo_moneda, up.proveedor as ultimo_proveedor,
  m.revisado, m.origen, m.notas, m.variantes, m.imagen_url, m.created_at, m.batch_id,
  mp.cant_k37, mp.cant_k52, mp.cant_k55
from public.panol_materiales m
left join public.panol_categorias c on c.id = m.categoria_id
left join public.panol_proveedores p on p.id = m.proveedor_id
left join ultimo_precio up on up.material_id = m.id
left join modelo_pivot mp on mp.material_id = m.id
order by m.descripcion;
