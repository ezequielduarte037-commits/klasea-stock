-- Diagnostico del catalogo completo
-- Correr en Supabase SQL Editor. Luego podes exportar cada resultado como CSV.

-- 1) Columnas reales de las tablas que arman el catalogo
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

-- 2) Catalogo plano: una fila por material, con cantidades K37/K52/K55
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
    max(cantidad) filter (where modelo::text = '55') as cant_k55,
    jsonb_agg(jsonb_build_object('modelo', modelo, 'variante', variante, 'cantidad', cantidad) order by modelo, variante) as modelos_raw
  from public.panol_material_modelo
  group by material_id
),
sectores_extra as (
  select
    mc.material_id,
    string_agg(c.nombre, ' | ' order by c.nombre) as sectores_extra
  from public.panol_material_categorias mc
  join public.panol_categorias c on c.id = mc.categoria_id
  group by mc.material_id
),
proveedores_alt as (
  select
    mp.material_id,
    string_agg(concat_ws(' ', p.nombre, mp.moneda, mp.precio), ' | ' order by p.nombre) as proveedores_alternativos
  from public.panol_material_proveedores mp
  left join public.panol_proveedores p on p.id = mp.proveedor_id
  group by mp.material_id
)
select
  m.id,
  m.activo,
  m.descripcion,
  m.codigo,
  m.codigo_barra,
  c.nombre as sector,
  m.categoria_id,
  m.proveedor,
  m.proveedor_id,
  p.tipo as proveedor_tipo,
  m.unidad_medida,
  m.precio_unitario as precio_catalogo,
  m.moneda as moneda_catalogo,
  up.precio_unitario as ultimo_precio,
  up.moneda as ultimo_moneda,
  up.proveedor as ultimo_proveedor,
  m.revisado,
  m.origen,
  m.notas,
  m.variantes,
  m.imagen_url,
  m.created_at,
  m.batch_id,
  mp.cant_k37,
  mp.cant_k52,
  mp.cant_k55,
  mp.modelos_raw,
  se.sectores_extra,
  pa.proveedores_alternativos
from public.panol_materiales m
left join public.panol_categorias c on c.id = m.categoria_id
left join public.panol_proveedores p on p.id = m.proveedor_id
left join ultimo_precio up on up.material_id = m.id
left join modelo_pivot mp on mp.material_id = m.id
left join sectores_extra se on se.material_id = m.id
left join proveedores_alt pa on pa.material_id = m.id
order by m.descripcion;

-- 3) Resumen de calidad/completitud
select 'materiales total' as metrica, count(*)::text as valor from public.panol_materiales
union all select 'materiales activos', count(*)::text from public.panol_materiales where activo is distinct from false
union all select 'sin proveedor', count(*)::text from public.panol_materiales where nullif(trim(coalesce(proveedor, '')), '') is null
union all select 'sin precio catalogo', count(*)::text from public.panol_materiales where precio_unitario is null
union all select 'sin codigo', count(*)::text from public.panol_materiales where nullif(trim(coalesce(codigo, '')), '') is null
union all select 'sin codigo_barra', count(*)::text from public.panol_materiales where nullif(trim(coalesce(codigo_barra, '')), '') is null
union all select 'sin categoria', count(*)::text from public.panol_materiales where categoria_id is null
union all select 'sin cantidad K37/K52/K55', count(*)::text
from public.panol_materiales m
where not exists (select 1 from public.panol_material_modelo mm where mm.material_id = m.id);

-- 4) Distribucion por sector/rubro
select coalesce(c.nombre, 'Sin categoria') as sector, count(*) as items
from public.panol_materiales m
left join public.panol_categorias c on c.id = m.categoria_id
where m.activo is distinct from false
group by 1
order by items desc, sector;

-- 5) Distribucion por proveedor
select coalesce(nullif(trim(m.proveedor), ''), 'Sin proveedor') as proveedor, count(*) as items
from public.panol_materiales m
where m.activo is distinct from false
group by 1
order by items desc, proveedor;
