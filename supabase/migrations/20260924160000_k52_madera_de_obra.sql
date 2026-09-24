-- K52: madera de obra en la matriz.
--
-- Es la lista que pasó Ezequiel el 24/09/2026 como lo que lleva cada K52 de
-- madera de obra. Va en la matriz, igual que en el K55, porque se compra por
-- barco (así se pidió la del 52-26):
--   · 7 placas de PVC espumado de 20 mm
--   · 300 pie² de loro blanco
--   · 300 pie² de okume
--   · 7 tablones de teca de 1,40 m × 10 cm
--   · 10 placas de honeycomb (terciado de 6 mm + panal de 15 mm + terciado de
--     6 mm), 1,2 × 2,45 m, Garnica UltraLight Poplar
--
-- El resto de la madera del K52 (terciados, fibrofácil, nogal, lenga) no va en
-- la matriz: se toma como estándar el consumo real del 52-23 en Maderas hasta
-- el 24/09/2026 (compras/materialesSecundariosApi.js), igual que el K55 toma
-- el del 55-1. De ese consumo quedan afuera el okume, el honeycomb, el PVC de
-- 20 mm y la teca, que ya están acá.
--
-- Precios: salen del presupuesto de maderas que pidió Ezequiel. Por ahora solo
-- el PVC tiene precio (de ficha).

begin;

insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_requisito, producto_por_obra, activo, origen, notas)
select nuevo.descripcion, nuevo.unidad, '55a47151-3f6c-46ea-8dc5-5271261c66dc', false, false, true, 'matriz-k52', nuevo.notas
  from (values
    ('Pie de loro blanco', 'pies', 'Madera de obra del K52 (lista de Ezequiel del 24/09/2026): 300 pie² por barco.'),
    ('Tablón de teca 1,40 m × 10 cm', 'unidad', 'Madera de obra del K52 (lista de Ezequiel del 24/09/2026): 7 tablones por barco.')
  ) as nuevo(descripcion, unidad, notas)
 where not exists (select 1 from public.panol_materiales m where m.descripcion = nuevo.descripcion);

insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ('15c7f36f-acbe-48ad-83dc-ee1404187b00'::uuid, 7::numeric),    -- PVC espumado espesor 20mm
    ((select id from public.panol_materiales where descripcion = 'Pie de loro blanco' limit 1), 300::numeric),
    ('9a3e996d-5248-4e07-a3da-6e8d1a7d07c6'::uuid, 300::numeric),  -- Tablón Okume (pies), el mismo que el K55
    ((select id from public.panol_materiales where descripcion = 'Tablón de teca 1,40 m × 10 cm' limit 1), 7::numeric),
    ('e43b4580-ee84-47ce-acfc-cee13cdc7f5a'::uuid, 10::numeric)    -- Placa de honeycomb 1,2 × 2,45
  ) as nuevo(material_id, cantidad)
 where nuevo.material_id is not null
   and not exists (
     select 1 from public.panol_material_modelo actual
      where actual.material_id = nuevo.material_id and actual.modelo = '52'
        and coalesce(actual.variante, 'standard') = 'standard'
   );

commit;
