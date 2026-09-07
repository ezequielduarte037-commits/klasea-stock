-- Precio de Combo LT 600 informado por Compras el 07/09/2026.
-- La matriz contabiliza rollos; cada rollo contiene 100 kg.
insert into public.materiales_secundarios_precios (
  catalogo, material_id, proveedor, precio_base, moneda, unidad_precio,
  factor_unidad_matriz, precio_unidad_matriz, incluye_iva, fecha, fuente, notas
)
select
  'laminacion',
  lm.id,
  'Náutica Recalada/Plaquimet',
  2.10,
  'USD',
  'kg',
  100,
  210.00,
  true,
  date '2026-09-07',
  'Precio LT600 informado por Compras · 07/09/2026',
  'Rollo de 100 kg; USD 2,10 por kg. La cotización informada fue de 300 kg (3 rollos), USD 630 total.'
from public.laminacion_materiales lm
where lower(trim(lm.nombre)) = lower('Combo LT 600')
on conflict (catalogo, material_id, fuente) do update set
  proveedor = excluded.proveedor,
  precio_base = excluded.precio_base,
  moneda = excluded.moneda,
  unidad_precio = excluded.unidad_precio,
  factor_unidad_matriz = excluded.factor_unidad_matriz,
  precio_unidad_matriz = excluded.precio_unidad_matriz,
  incluye_iva = excluded.incluye_iva,
  fecha = excluded.fecha,
  notas = excluded.notas;
