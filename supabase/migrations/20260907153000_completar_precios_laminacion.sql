-- Precios adicionales informados por Compras el 07/09/2026.
-- La plantilla de Laminación contabiliza placas, rollos y baldes como "unidad";
-- precio_unidad_matriz conserva el costo de esa presentación completa.
with valores(nombre, precio_base, unidad_precio, factor, precio_matriz, notas) as (
  values
    ('Airex H80 15mm', 80.00::numeric, 'placa', 1::numeric, 80.00::numeric,
      'USD 80 por placa/unidad.'),
    ('Airex H80 20mm', 92.00::numeric, 'placa', 1::numeric, 92.00::numeric,
      'USD 92 por placa/unidad.'),
    ('Velo superficial', 0.90::numeric, 'm2', 250::numeric, 225.00::numeric,
      'Rollo de 250 m2; USD 0,90 por m2.'),
    ('Roving 400', 2.10::numeric, 'kg', 75::numeric, 157.50::numeric,
      'Rollo de 75 kg; USD 2,10 por kg.'),
    ('PQ7', 8.95::numeric, 'kg', 17::numeric, 152.15::numeric,
      'Balde de 17 kg; USD 8,95 por kg.')
)
insert into public.materiales_secundarios_precios (
  catalogo, material_id, proveedor, precio_base, moneda, unidad_precio,
  factor_unidad_matriz, precio_unidad_matriz, incluye_iva, fecha, fuente, notas
)
select 'laminacion', lm.id, null, v.precio_base, 'USD', v.unidad_precio,
       v.factor, v.precio_matriz, true, date '2026-09-07',
       'Precios informados por Compras · 07/09/2026', v.notas
from valores v
join public.laminacion_materiales lm
  on lower(trim(lm.nombre)) = lower(trim(v.nombre))
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
