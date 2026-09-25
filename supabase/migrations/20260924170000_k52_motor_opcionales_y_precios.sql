-- K52: motor genérico, electrónica y cama de moto de agua como opcionales, y
-- dos precios que informó Ezequiel. Lo definió el 24/09/2026.
--
-- 1. MOTOR: requisito genérico de la matriz, 2 por barco. El motor concreto se
--    asigna en cada obra y no lleva precio: lo elige y lo paga cada cliente.
--    Con el motivo cargado el costo no lo cuenta como faltante.
-- 2. OPCIONALES DE LA LÍNEA (no vienen por defecto, igual que el tender lift):
--    radar, piloto automático, AIS, audio y la cama de la moto de agua. La
--    cama sale de la matriz estándar. Los equipos de referencia son los del
--    catálogo (Simrad Halo 20, Simrad Reactor 40, Garmin AIS 800 y el audio
--    que elige el cliente); se cambian cuando se decida la marca.
-- 3. PRECIOS de Laminación y Maderas: placa de poliuretano de 100 mm a
--    $150.000 y placa de PVC de 10 mm a $120.000. Se cargan como sin IVA.

begin;

-- ─── 1. Motor genérico ──────────────────────────────────────────────────────
insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_requisito, producto_por_obra, activo, origen, sin_precio_motivo, notas)
select 'Motor', 'unidad', 'e67e5b92-0cba-469c-9242-62faceedaf05', true, true, true, 'matriz-k52',
       'Lo elige cada cliente: el motor concreto se asigna en cada obra.',
       'Requisito genérico de la matriz: el producto se asigna en cada obra. Sin precio (definido por Ezequiel el 24/09/2026).'
 where not exists (select 1 from public.panol_materiales where descripcion = 'Motor' and es_requisito is true);

insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select m.id, '52', 2, 'standard'
  from public.panol_materiales m
 where m.descripcion = 'Motor' and m.es_requisito is true
   and not exists (
     select 1 from public.panol_material_modelo actual
      where actual.material_id = m.id and actual.modelo = '52'
        and coalesce(actual.variante, 'standard') = 'standard'
   );

-- ─── 2. Opcionales de la línea ──────────────────────────────────────────────
insert into public.panol_matriz_condicionantes (modelo, nombre, tipo, descripcion, activo_por_defecto, orden)
values
  ('52', 'Radar', 'equipamiento', 'No es estándar: va si el cliente lo pide.', false, 30),
  ('52', 'Piloto automático', 'equipamiento', 'No es estándar: va si el cliente lo pide.', false, 31),
  ('52', 'AIS', 'equipamiento', 'No es estándar: va si el cliente lo pide.', false, 32),
  ('52', 'Audio', 'equipamiento', 'No es estándar: lo elige el cliente.', false, 33),
  ('52', 'Cama de moto de agua', 'equipamiento', 'No es estándar: va si el cliente lo pide.', false, 34)
on conflict (modelo, nombre) do nothing;

insert into public.panol_matriz_condicionante_items (condicionante_id, material_id, descripcion, cantidad, unidad, tipo_item, orden)
select c.id, nuevo.material_id, nuevo.descripcion, 1, 'unid', 'extra', 1
  from (values
    ('Radar', 'd70f4125-466d-4af1-b627-31d42926c721'::uuid, 'ANTENA SIMRAD HALO 20 RADAR'),
    ('Piloto automático', '0b1ab9b8-2bf9-4e1c-b4a4-75f1fa1cbd9b'::uuid, 'Piloto Automatico Reactor 40 Hydraulic Corepack'),
    ('AIS', 'dec5cc4c-4a0c-4419-ad7f-2ff3240a8a67'::uuid, 'Transceptor GARMIN AIS 800'),
    ('Audio', 'cd3f2ccf-fccb-4e3c-b4c0-08ca43dfa207'::uuid, 'Equipo de audio (elige cliente)'),
    ('Cama de moto de agua', '7d667ee3-db47-46c5-8588-3a9bcafb2ed0'::uuid, 'CAMA MOTO DE AGUA K52')
  ) as nuevo(condicionante, material_id, descripcion)
  join public.panol_matriz_condicionantes c on c.modelo = '52' and c.nombre = nuevo.condicionante
 where not exists (
   select 1 from public.panol_matriz_condicionante_items i
    where i.condicionante_id = c.id and i.material_id = nuevo.material_id
 );

delete from public.panol_material_modelo
 where material_id = '7d667ee3-db47-46c5-8588-3a9bcafb2ed0'   -- CAMA MOTO DE AGUA K52
   and modelo = '52';

-- En la bandeja de estandarización queda como no estándar por ser opcional.
insert into public.panol_material_normalizaciones (material_id, modelo, decision, cantidad, revisado_por, motivo_no_estandar, observacion_no_estandar)
values ('7d667ee3-db47-46c5-8588-3a9bcafb2ed0', '52', 'puntual', null, null, 'condicionante',
        'No es estándar en el K52: condicionante "Cama de moto de agua".')
on conflict (material_id, modelo) do nothing;

-- ─── 3. Precios de Laminación y Maderas ─────────────────────────────────────
insert into public.materiales_secundarios_precios
  (catalogo, material_id, proveedor, precio_base, moneda, unidad_precio, factor_unidad_matriz, precio_unidad_matriz, incluye_iva, fecha, fuente, notas, created_by)
values
  ('laminacion', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', null, 150000, 'ARS', 'placa', 1, 150000, false, '2026-09-24',
   'Informado por Ezequiel el 24/09/2026', 'Placa de poliuretano de 100 mm. Se carga como sin IVA.', null),
  ('maderas', '8b3d4c7e-f05f-4098-a74c-f53012eb635c', null, 120000, 'ARS', 'placa', 1, 120000, false, '2026-09-24',
   'Informado por Ezequiel el 24/09/2026', 'Placa de PVC de 10 mm. Se carga como sin IVA.', null)
on conflict (catalogo, material_id, fuente) do nothing;

commit;
