-- Diagnostico: catalogo, lineas/modelos y condicionantes de matriz.
-- Uso recomendado: correr por bloques en Supabase SQL editor.
--
-- Idea general del modelo:
-- 1) panol_materiales = catalogo maestro. Un producto existe una sola vez.
-- 2) panol_material_modelo = matriz base por linea/modelo. Ej: material X lleva 20 en K55.
-- 3) panol_matriz_condicionantes = reglas de configuracion por modelo. Ej: Vestidor K55.
-- 4) panol_matriz_condicionante_items = deltas de cada regla. Ej: Vestidor suma 9 bisagras.
-- 5) panol_obra_matriz_condicionantes = override por obra. Si no hay fila, usa activo_por_defecto.
-- 6) panol_obra_addons = adicionales/opcionales por obra. La app lo usa si la tabla existe.
--
-- Tipos de item condicionante:
--   matriz = suma/resta sobre la matriz del barco (segun signo/cantidad; hoy se trata como suma)
--   extra  = item extra que entra solo por ese condicionante
--   quita  = resta cantidad de la matriz base

-- 1) Ver columnas reales de las tablas que participan.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'panol_materiales',
    'panol_material_modelo',
    'panol_categorias',
    'panol_material_categorias',
    'panol_opciones',
    'panol_opcion_valores',
    'panol_material_condicion',
    'panol_matriz_condicionantes',
    'panol_matriz_condicionante_items',
    'panol_obra_matriz_condicionantes',
    'panol_obra_addons'
  )
order by table_name, ordinal_position;

-- 2) Resumen de matriz base por modelo.
-- panol_material_modelo es la tabla clave: una fila por material + modelo + variante.
select
  mm.modelo,
  coalesce(nullif(mm.variante, ''), 'standard') as variante,
  count(*) as filas_matriz,
  count(distinct mm.material_id) as productos,
  sum(coalesce(mm.cantidad, 0)) as unidades_teoricas,
  count(*) filter (where m.activo is distinct from false) as filas_activas,
  count(*) filter (where m.precio_unitario is null) as sin_precio,
  count(*) filter (where nullif(btrim(coalesce(m.proveedor, '')), '') is null) as sin_proveedor
from public.panol_material_modelo mm
join public.panol_materiales m on m.id = mm.material_id
group by mm.modelo, coalesce(nullif(mm.variante, ''), 'standard')
order by mm.modelo, variante;

-- 3) Matriz base detallada de una linea.
-- Cambiar p.modelo a '37', '52' o '55'. Cambiar p.buscar para filtrar texto/codigo/proveedor.
with params as (
  select '55'::text as modelo, null::text as buscar
)
select
  mm.modelo,
  coalesce(nullif(mm.variante, ''), 'standard') as variante,
  c.nombre as sector,
  m.id as material_id,
  m.descripcion,
  m.codigo,
  m.proveedor,
  m.unidad_medida,
  mm.cantidad,
  m.precio_unitario,
  m.moneda,
  m.revisado,
  m.activo
from public.panol_material_modelo mm
join public.panol_materiales m on m.id = mm.material_id
left join public.panol_categorias c on c.id = m.categoria_id
cross join params p
where mm.modelo::text = p.modelo
  and m.activo is distinct from false
  and (
    p.buscar is null
    or concat_ws(' ', m.descripcion, m.codigo, m.proveedor, c.nombre) ilike concat('%', p.buscar, '%')
  )
order by c.nombre nulls last, m.descripcion;

-- 4) Condicionantes definidos por modelo.
-- Ej: K55 Vestidor, Camarote marinero, Motor Iveco, Grupo electrogeno.
select
  mc.modelo,
  mc.orden,
  mc.id as condicionante_id,
  mc.nombre,
  mc.tipo,
  mc.descripcion,
  mc.activo_por_defecto,
  mc.activo,
  count(ci.id) as items_asociados,
  count(ci.id) filter (where ci.tipo_item = 'matriz') as items_matriz,
  count(ci.id) filter (where ci.tipo_item = 'extra') as items_extra,
  count(ci.id) filter (where ci.tipo_item = 'quita') as items_quita
from public.panol_matriz_condicionantes mc
left join public.panol_matriz_condicionante_items ci
  on ci.condicionante_id = mc.id
  and ci.activo is distinct from false
group by mc.modelo, mc.orden, mc.id, mc.nombre, mc.tipo, mc.descripcion, mc.activo_por_defecto, mc.activo
order by mc.modelo, mc.orden, mc.nombre;

-- 5) Items de condicionantes con el material vinculado.
-- Si material_id es null, es un item escrito a mano que todavia no esta ligado al catalogo.
with params as (
  select '55'::text as modelo
)
select
  mc.modelo,
  mc.nombre as condicionante,
  mc.tipo as tipo_condicionante,
  mc.activo_por_defecto,
  ci.orden,
  ci.id as condicionante_item_id,
  ci.tipo_item,
  case when ci.tipo_item = 'quita' then -abs(coalesce(ci.cantidad, 0)) else coalesce(ci.cantidad, 0) end as delta_cantidad,
  ci.unidad,
  ci.descripcion as descripcion_condicionante,
  ci.material_id,
  m.descripcion as descripcion_catalogo,
  m.codigo,
  m.proveedor,
  cat.nombre as sector,
  ci.notas,
  ci.activo
from public.panol_matriz_condicionantes mc
join public.panol_matriz_condicionante_items ci on ci.condicionante_id = mc.id
left join public.panol_materiales m on m.id = ci.material_id
left join public.panol_categorias cat on cat.id = m.categoria_id
cross join params p
where mc.modelo::text = p.modelo
order by mc.modelo, mc.orden, ci.orden, ci.descripcion;

-- 6) Matriz final teorica para una linea con condicionantes por defecto.
-- Esto muestra base + deltas activos por defecto. Sirve para detectar el caso:
-- "K55 base lleva 20 bisagras; si lleva vestidor, suma 9 al mismo material".
with params as (
  select '55'::text as modelo
),
base as (
  select
    mm.modelo::text as modelo,
    m.id as material_id,
    m.descripcion,
    m.codigo,
    m.proveedor,
    m.unidad_medida as unidad,
    coalesce(mm.cantidad, 0)::numeric as cantidad_base,
    0::numeric as cantidad_condicionante,
    null::text as condicionantes
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id
  cross join params p
  where mm.modelo::text = p.modelo
    and m.activo is distinct from false
),
cond as (
  select
    mc.modelo::text as modelo,
    ci.material_id,
    coalesce(m.descripcion, ci.descripcion) as descripcion,
    m.codigo,
    m.proveedor,
    coalesce(ci.unidad, m.unidad_medida) as unidad,
    0::numeric as cantidad_base,
    (case when ci.tipo_item = 'quita' then -abs(coalesce(ci.cantidad, 0)) else coalesce(ci.cantidad, 0) end)::numeric as cantidad_condicionante,
    concat(mc.nombre, ': ', ci.tipo_item, ' ', coalesce(ci.cantidad::text, '0'), coalesce(' ' || ci.unidad, '')) as condicionantes
  from public.panol_matriz_condicionantes mc
  join public.panol_matriz_condicionante_items ci on ci.condicionante_id = mc.id
  left join public.panol_materiales m on m.id = ci.material_id
  cross join params p
  where mc.modelo::text = p.modelo
    and mc.activo is distinct from false
    and mc.activo_por_defecto is true
    and ci.activo is distinct from false
),
movs as (
  select * from base
  union all
  select * from cond
),
agg as (
  select
    coalesce(material_id::text, 'texto:' || lower(btrim(descripcion))) as key,
    max(material_id) as material_id,
    max(descripcion) as descripcion,
    max(codigo) as codigo,
    max(proveedor) as proveedor,
    max(unidad) as unidad,
    sum(cantidad_base) as cantidad_base,
    sum(cantidad_condicionante) as delta_condicionantes,
    sum(cantidad_base + cantidad_condicionante) as cantidad_final,
    string_agg(condicionantes, ' | ' order by condicionantes) filter (where condicionantes is not null) as detalle_condicionantes
  from movs
  group by coalesce(material_id::text, 'texto:' || lower(btrim(descripcion)))
)
select *
from agg
where cantidad_final <> 0
order by descripcion;

-- 7) Overrides de condicionantes por obra.
-- Cambiar p.obra_codigo a '55-2', 'K55-2', etc. Si queda null, muestra defaults del modelo.
with params as (
  select '55'::text as modelo, null::text as obra_codigo
),
obra as (
  select o.id, o.codigo
  from public.produccion_obras o
  cross join params p
  where p.obra_codigo is not null
    and lower(o.codigo) = lower(p.obra_codigo)
  limit 1
)
select
  p.modelo,
  o.codigo as obra,
  mc.id as condicionante_id,
  mc.nombre,
  mc.tipo,
  mc.activo_por_defecto,
  ov.activo as override_activo,
  coalesce(ov.activo, mc.activo_por_defecto) as activo_en_obra,
  ov.notas as override_notas
from params p
join public.panol_matriz_condicionantes mc on mc.modelo::text = p.modelo
left join obra o on true
left join public.panol_obra_matriz_condicionantes ov
  on ov.condicionante_id = mc.id
  and ov.obra_id = o.id
where mc.activo is distinct from false
order by mc.orden, mc.nombre;

-- 8) Matriz final para una obra, usando overrides si existen.
-- Si p.obra_codigo es null, equivale a "por defecto del modelo".
with params as (
  select '55'::text as modelo, null::text as obra_codigo
),
obra as (
  select o.id, o.codigo
  from public.produccion_obras o
  cross join params p
  where p.obra_codigo is not null
    and lower(o.codigo) = lower(p.obra_codigo)
  limit 1
),
condicionantes_activos as (
  select
    mc.*,
    coalesce(ov.activo, mc.activo_por_defecto) as activo_en_obra
  from params p
  join public.panol_matriz_condicionantes mc on mc.modelo::text = p.modelo
  left join obra o on true
  left join public.panol_obra_matriz_condicionantes ov
    on ov.condicionante_id = mc.id
    and ov.obra_id = o.id
  where mc.activo is distinct from false
),
base as (
  select
    m.id as material_id,
    m.descripcion,
    m.codigo,
    m.proveedor,
    m.unidad_medida as unidad,
    coalesce(mm.cantidad, 0)::numeric as cantidad_base,
    0::numeric as cantidad_condicionante,
    null::text as condicionantes
  from params p
  join public.panol_material_modelo mm on mm.modelo::text = p.modelo
  join public.panol_materiales m on m.id = mm.material_id
  where m.activo is distinct from false
),
cond as (
  select
    ci.material_id,
    coalesce(m.descripcion, ci.descripcion) as descripcion,
    m.codigo,
    m.proveedor,
    coalesce(ci.unidad, m.unidad_medida) as unidad,
    0::numeric as cantidad_base,
    (case when ci.tipo_item = 'quita' then -abs(coalesce(ci.cantidad, 0)) else coalesce(ci.cantidad, 0) end)::numeric as cantidad_condicionante,
    concat(ca.nombre, ': ', ci.tipo_item, ' ', coalesce(ci.cantidad::text, '0'), coalesce(' ' || ci.unidad, '')) as condicionantes
  from condicionantes_activos ca
  join public.panol_matriz_condicionante_items ci on ci.condicionante_id = ca.id
  left join public.panol_materiales m on m.id = ci.material_id
  where ca.activo_en_obra is true
    and ci.activo is distinct from false
),
movs as (
  select * from base
  union all
  select * from cond
),
agg as (
  select
    coalesce(material_id::text, 'texto:' || lower(btrim(descripcion))) as key,
    max(material_id) as material_id,
    max(descripcion) as descripcion,
    max(codigo) as codigo,
    max(proveedor) as proveedor,
    max(unidad) as unidad,
    sum(cantidad_base) as cantidad_base,
    sum(cantidad_condicionante) as delta_condicionantes,
    sum(cantidad_base + cantidad_condicionante) as cantidad_final,
    string_agg(condicionantes, ' | ' order by condicionantes) filter (where condicionantes is not null) as detalle_condicionantes
  from movs
  group by coalesce(material_id::text, 'texto:' || lower(btrim(descripcion)))
)
select *
from agg
where cantidad_final <> 0
order by descripcion;

-- 9) Control de calidad de condicionantes.
-- Ayuda a detectar items sueltos, quitas sin base o duplicados.
with cond_items as (
  select
    mc.modelo,
    mc.nombre as condicionante,
    ci.id,
    ci.material_id,
    ci.descripcion,
    ci.tipo_item,
    ci.cantidad,
    exists (
      select 1
      from public.panol_material_modelo mm
      where mm.material_id = ci.material_id
        and mm.modelo::text = mc.modelo::text
    ) as existe_en_base_modelo
  from public.panol_matriz_condicionantes mc
  join public.panol_matriz_condicionante_items ci on ci.condicionante_id = mc.id
)
select
  modelo,
  condicionante,
  id as condicionante_item_id,
  material_id,
  descripcion,
  tipo_item,
  cantidad,
  case
    when material_id is null then 'sin material_id: texto libre/no vinculado al catalogo'
    when tipo_item = 'quita' and not existe_en_base_modelo then 'quita sobre material que no existe en matriz base'
    when tipo_item in ('matriz','extra') and cantidad is null then 'sin cantidad'
    else 'ok'
  end as diagnostico
from cond_items
where material_id is null
   or (tipo_item = 'quita' and not existe_en_base_modelo)
   or (tipo_item in ('matriz','extra') and cantidad is null)
order by modelo, condicionante, diagnostico, descripcion;

-- 10) Adicionales por obra.
-- Este bloque solo funciona si existe public.panol_obra_addons.
-- En este repo no aparece una migracion de creacion para esa tabla, pero la UI la consulta.
-- Si falla, primero correr el bloque 1 y mirar si panol_obra_addons existe en information_schema.
/*
select
  o.codigo as obra,
  a.tipo,
  a.descripcion,
  a.cantidad,
  a.unidad,
  a.proveedor,
  a.notas,
  a.created_at
from public.panol_obra_addons a
join public.produccion_obras o on o.id = a.obra_id
order by o.codigo, a.created_at desc;
*/
