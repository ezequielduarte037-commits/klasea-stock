-- Ejecutar en Supabase SQL Editor y descargar el resultado como CSV.
-- Este CSV alimenta:
--   node scripts/k55-match-catalog-preview.mjs --catalog=RUTA_AL_CSV
--
-- Regla: material_id es la identidad real del item. K37/K52/K55 son cantidades
-- por modelo del mismo catalogo, no tablas separadas.

select
  m.id as material_id,
  m.descripcion,
  lower(coalesce(m.descripcion, '')) as descripcion_normalizada,
  m.codigo,
  m.codigo_barra as codigo_barra_principal,
  m.unidad_medida,
  m.proveedor,
  m.proveedor_id,
  c.nombre as categoria,
  m.categoria_id,
  m.precio_unitario,
  m.moneda,
  m.variantes,
  m.notas,
  m.revisado,
  m.activo,
  coalesce(sum(mm.cantidad) filter (where mm.modelo::text = '37'), 0) as k37,
  coalesce(sum(mm.cantidad) filter (where mm.modelo::text = '52'), 0) as k52,
  coalesce(sum(mm.cantidad) filter (where mm.modelo::text = '55'), 0) as k55
from public.panol_materiales m
left join public.panol_categorias c on c.id = m.categoria_id
left join public.panol_material_modelo mm on mm.material_id = m.id
where coalesce(m.activo, true) = true
group by m.id, c.nombre
order by m.descripcion;
