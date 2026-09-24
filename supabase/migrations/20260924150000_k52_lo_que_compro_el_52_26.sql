-- K52: lo que compró el 52-26 y no estaba en la matriz, las cantidades que compró
-- de más, los dos inodoros y el descuento de Baron en las referencias de su web.
-- Lo confirmó Ezequiel el 24/09/2026.
--
-- 1. ESTÁNDAR NUEVO, con lo que compró el 52-26 (remito Baron del 10/09): 6
--    posavasos, 5 levantapisos Perko 1221, la llave de las tapas de tanque y los
--    conductos del calefactor Autoterm (rejilla D90, 2 adaptadores y 2 rejillas
--    D60, 12 m de manguera D90 y 1 m de D60). Las mangueras no estaban en el
--    catálogo: se crean con el precio del remito.
-- 2. CANTIDADES, a lo que compró el 52-26: omegas 6, bisagras de 59×40 3 y de
--    70×38,5 8, soportes de bichero 2 y accesorios de fijación de resorte 6
--    (3 de ángulo y 3 planos, para los 3 pistones de 18 kg).
-- 3. INODOROS: 2, uno por baño, los dos con bidet (el 52-26 compró dos iguales).
--    El SFMTE1-07 pasa a 2 y el SFMTE1-05 sale de la matriz.
-- 4. BARON.COM.AR: las 12 referencias de la web de Baron llevan el 10% que Baron
--    descuenta en sus remitos de accesorios.
--
-- Subir una cantidad de la matriz también la sube en las obras que tomaron ese
-- ítem de la matriz (trigger de sincronización): es el caso del inodoro en el
-- 52-26, que pasa a 2. Borrar la fila del SFMTE1-05 no toca las obras.

begin;

-- ─── 1. Mangueras del calefactor (nuevas en el catálogo) ────────────────────
insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_requisito, producto_por_obra, activo, origen, proveedor, proveedor_id, notas)
select nuevo.descripcion, 'metro', '1ce29151-94e8-4eb7-b02b-41d5aa8b49c2', false, false, true, 'matriz-k52', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', nuevo.notas
  from (values
    ('Manguera de aire D90 - Calefactor Autoterm', 'Baron C89150: CALEFACTOR AUTOTERM MANGUERA AIRE D90 X METRO (remito del 10/09/2026, obra 52-26).'),
    ('Manguera de aire D60 - Calefactor Autoterm', 'Baron C89013: CALEFACTOR AUTOTERM MANGUERA AIRE D60 X METRO (remito del 10/09/2026, obra 52-26).')
  ) as nuevo(descripcion, notas)
 where not exists (select 1 from public.panol_materiales m where m.descripcion = nuevo.descripcion);

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select m.id, nuevo.precio, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', nuevo.fuente
  from (values
    ('Manguera de aire D90 - Calefactor Autoterm', 26776.86::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · C89150 CALEFACTOR AUTOTERM MANGUERA AIRE D90 X METRO · con IVA era 36.000 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),
    ('Manguera de aire D60 - Calefactor Autoterm', 20157.02::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · C89013 CALEFACTOR AUTOTERM MANGUERA AIRE D60 X METRO · con IVA era 27.100 · sin IVA · con el 10% de descuento del remito (total USD 5.298)')
  ) as nuevo(descripcion, precio, fuente)
  join public.panol_materiales m on m.descripcion = nuevo.descripcion
 where not exists (select 1 from public.panol_precios p where p.material_id = m.id and p.fecha = '2026-09-10' and p.proveedor = 'Baron');

-- ─── Filas nuevas de la matriz del K52 ─────────────────────────────────────
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ('f4a56af4-e018-411a-a9f1-1dee3f6db079'::uuid, 6::numeric),  -- Posavasos inox
    ('33cd96e4-def4-47e3-92ea-960d3404258e'::uuid, 5::numeric),  -- Levantapisos exterior
    ('9a8d6d69-4db2-489c-bcac-1aa4c917c6e8'::uuid, 1::numeric),  -- Llave abre Tapa Tanque inox
    ('b2830c16-2f31-4bb0-9b7e-60368c734e8b'::uuid, 1::numeric),  -- Rejilla D90 Obturable Negra - Calefactor Autoterm
    ('8803ceee-6654-42d5-a057-41cc3ba79260'::uuid, 2::numeric),  -- CALEFACTOR AUTOTERM ADAPT P/REJILLA D60 NEGRA
    ('d98179e7-c15c-4c02-bb97-187c72a2f428'::uuid, 2::numeric),  -- Rejilla D60 Orientable Negra - Calefactor Autoterm
    ((select id from public.panol_materiales where descripcion = 'Manguera de aire D90 - Calefactor Autoterm' limit 1), 12::numeric),  -- Manguera de aire D90 - Calefactor Autoterm
    ((select id from public.panol_materiales where descripcion = 'Manguera de aire D60 - Calefactor Autoterm' limit 1), 1::numeric)   -- Manguera de aire D60 - Calefactor Autoterm
  ) as nuevo(material_id, cantidad)
 where nuevo.material_id is not null
   and not exists (
     select 1 from public.panol_material_modelo actual
      where actual.material_id = nuevo.material_id and actual.modelo = '52'
        and coalesce(actual.variante, 'standard') = 'standard'
   );

-- ─── 2 y 3. Cantidades ─────────────────────────────────────────────────────
update public.panol_material_modelo actual
   set cantidad = nuevo.cantidad
  from (values
    ('54619c9e-d476-40cd-94b6-6934972561f5'::uuid, 6::numeric),  -- Omega Inoxidable Inox Barra D06mm c/u: 4 → 6
    ('e4bb8731-3c9a-41a1-b3b9-8a9893132dc0'::uuid, 3::numeric),  -- Bisagra Inox 59X40mm 6 Tornillos: 2 → 3
    ('49b5c301-4638-45ac-8f90-3dc5a3d2496a'::uuid, 8::numeric),  -- Bisagra Inox 70X38.5mm Perno abajo 4 Tornillos: 6 → 8
    ('48691257-85e0-43a4-8bac-ed25c1dad24b'::uuid, 2::numeric),  -- SOPORTE BICHERO Inoxidable 25-32mm (PAR): 1 → 2
    ('78d38650-cbd9-4db0-912c-d4c73b830804'::uuid, 6::numeric),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 2 → 6
    ('357e9ba0-a9e6-4820-a4f9-2315e40e48bc'::uuid, 2::numeric)   -- Inodoro con bidet SEAFLO Sfmte1-07 12v: 1 → 2
  ) as nuevo(material_id, cantidad)
 where actual.material_id = nuevo.material_id
   and actual.modelo = '52'
   and coalesce(actual.variante, 'standard') = 'standard'
   and actual.cantidad < nuevo.cantidad;

delete from public.panol_material_modelo
 where material_id = 'd862758e-7dd9-4e28-bcc7-993d62e3da30'   -- Inodoro con Bidet Seaflo SFMTE1-05
   and modelo = '52';

-- ─── 4. baron.com.ar con el 10% de Baron ───────────────────────────────────
update public.panol_precios p
   set precio_unitario = nuevo.precio,
       fuente = p.fuente || ' · con el 10% que descuenta Baron en sus remitos'
  from (values
    ('550d5562-bf34-415d-9bda-684e62e43bb8'::uuid, 423223.14::numeric),  -- TAMBUCHO REDONDO 57CM: 470247.93 → 423223.14
    ('48e98238-382c-4186-9988-648ec376ffbc'::uuid, 6396.7::numeric),  -- Rejilla de plastico plana 264x126,5mm: 7107.44 → 6396.7
    ('5f5e09ab-ac6b-46ad-9613-a23d88950704'::uuid, 3295.04::numeric),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 3661.16 → 3295.04
    ('26618f55-d4bb-4378-b300-18852ff0bb0a'::uuid, 288595.04::numeric),  -- Ancla Bruce 30kg galvanizada: 320661.16 → 288595.04
    ('dd7db509-fc87-4e0e-a43b-1344d436ea56'::uuid, 8033.06::numeric),  -- Cadena 8mm calibrada galvanizada: 8925.62 → 8033.06
    ('14dd07d0-ab23-4483-9763-e281c9a66428'::uuid, 37933.88::numeric),  -- Traba cadena 10-12mm: 42148.76 → 37933.88
    ('66565af0-6763-4233-a070-aea81f5670e8'::uuid, 1941.32::numeric),  -- Abrazadera inox para manguera 50-75mm: 2157.02 → 1941.32
    ('9894b0ff-dd90-4e06-a13a-5552db99ba50'::uuid, 3116.53::numeric),  -- Abrazadera inox para manguera 70-80mm: 3462.81 → 3116.53
    ('7228ad46-afe7-4081-aaf1-9975327724ed'::uuid, 9148.76::numeric),  -- Luz cuadrada chica roja: 10165.29 → 9148.76
    ('ee00b0f2-c432-4bb8-bab2-2b6ca6d24977'::uuid, 73338.84::numeric),  -- Manguera de carga de combustible Dunlop con a: 81487.6 → 73338.84
    ('21eb8e28-9ccb-49cd-b4dc-37864ccc2a98'::uuid, 6738.84::numeric),  -- CODO QUICK CONNECT 15mm: 7487.6 → 6738.84
    ('2c9087fe-b95e-4268-a973-53060758dee1'::uuid, 59876.04::numeric)   -- Brazo y escobilla de limpiaparabrisa: 66528.93 → 59876.04
  ) as nuevo(id, precio)
 where p.id = nuevo.id
   and p.proveedor is null
   and p.fuente not like '%descuenta Baron%';

commit;
