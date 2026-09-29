-- K55: segunda tanda de precios (28/09/2026). Va después de 20260928120000.
--
-- 18 precios más, todos referencias sin proveedor y SIN IVA:
--   · Llaves y tomas Macroled Milan (6), todas de mundoled.ar, que tiene la
--     línea completa. Dos ya estaban en la primera tanda con otras tiendas: se
--     borran esas filas para que el precio salga de un solo lugar.
--   · baron.com.ar (3): plafón P81435, luces bajo agua y tambucho cuadrado. A
--     lista, con el 10% que Baron descuenta en sus remitos.
--   · Otras (6): tiras LED COB, neón, caño de termofusión, bisagras codo 0,
--     guías de 25 cm y tanque acumulador Jabsco.
--   · Plotter de 12" y piloto automático (2): la ficha no tiene modelo
--     ("modelo?? accesorios??"). Llevan un Garmin de referencia hasta que se
--     decida, como el grupo de 9 kVA del K52.
--
-- Las de EE.UU. no incluyen flete ni importación.

begin;

-- ─── Las dos Milan de la primera tanda, con otra tienda ───────────────────
delete from public.panol_precios p
 using (values
    ('692e7d5b-bd13-4c3f-91a6-2dad3c911ba2'::uuid, 'Distribuidora Miler (MercadoLibre), llave Milan 2 puntos bastidor metálico Macroled (rango 4.942-6.513) · con IVA era 5.938 · sin IVA · 2026-09-28'),  -- Llave 2 puntos combinables Macroled MILAN
    ('758d53c8-2d39-41d5-adf1-56837b2d25d5'::uuid, 'Mundo LED (MercadoLibre), tecla toma doble + USB-C 20W Milan Macroled (rango 25.202-44.039) · con IVA era 33.420 · sin IVA · 2026-09-28')  -- Toma doble 220v + USB-C Macroled Milan
 ) as viejo(material_id, fuente)
 where p.material_id = viejo.material_id
   and p.fuente = viejo.fuente;

-- ─── Precios nuevos ────────────────────────────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, nuevo.moneda, nuevo.fecha, nuevo.proveedor, nuevo.proveedor_id, nuevo.fuente
  from (values
    -- Llaves y tomas Macroled Milan, todas de la misma tienda
    ('692e7d5b-bd13-4c3f-91a6-2dad3c911ba2'::uuid, 4084.21::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Tecla Armada Llave Luz 2 Canales" (la línea completa de la misma tienda) · con IVA era 4.941,9 · sin IVA · 2026-09-28'),  -- Llave 2 puntos combinables Macroled MILAN
    ('7f0e2662-4517-4e68-889f-46db0b7d32b6'::uuid, 5829.17::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Tecla Armada Llave De Luz 2 canales + Tomacorriente" (la línea completa de la misma tienda) · con IVA era 7.053,3 · sin IVA · 2026-09-28'),  -- Llave 2 puntos combinables y toma Macroled MILAN
    ('5eccbf9a-9b9c-4544-b5c3-793dc354ad83'::uuid, 5196.94::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Tecla Armada Llave Luz 3 Canales" (la línea completa de la misma tienda) · con IVA era 6.288,3 · sin IVA · 2026-09-28'),  -- Llave 3 puntos combinables Macroled MILAN
    ('ff321a90-d9a4-496f-8206-9a637bb8dde2'::uuid, 5715.37::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Tecla Armada Llave Luz 4 Canales" (la línea completa de la misma tienda) · con IVA era 6.915,6 · sin IVA · 2026-09-28'),  -- Llave 4 puntos combinables Macroled MILAN
    ('0e08a2cc-d0f8-4d2e-920c-88ac14166a83'::uuid, 3376.12::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Llave armada Tomacorriente Doble" (la línea completa de la misma tienda) · con IVA era 4.085,1 · sin IVA · 2026-09-28'),  -- Toma doble 220v Macroled Milan
    ('758d53c8-2d39-41d5-adf1-56837b2d25d5'::uuid, 26161.74::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mundoled.ar, Macroled Milan "Llave armada Tomacorriente Doble + Usb Tipo C 20W" (la línea completa de la misma tienda) · con IVA era 31.655,7 · sin IVA · 2026-09-28'),  -- Toma doble 220v + USB-C Macroled Milan
    -- baron.com.ar, a lista con el 10% de Baron
    ('46c9bd6e-36a6-40ec-b810-3be1518ffaac'::uuid, 30198.35::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'baron.com.ar, P81435 plafón Five Oceans 5 LED blanco IP67 12V (el código de la ficha), precio de lista · con IVA era 40.600 · sin IVA · con el 10% que descuenta Baron en sus remitos · 2026-09-28'),  -- Plafon Five Oceans 5 Led Blanco exterior
    ('c9ff853c-fb0d-409d-99bc-17c13afaf30e'::uuid, 47305.79::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'baron.com.ar, P81804 plafón Five Oceans sumergible bajo línea de flotación blanco y azul 10-30V IP68; la ficha no dice marca, precio de lista · con IVA era 63.600 · sin IVA · con el 10% que descuenta Baron en sus remitos · 2026-09-28'),  -- Luces bajo agua Azul/Blanco
    ('cf096fe3-b941-4cc9-9c09-e141692ac76a'::uuid, 430661.16::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'baron.com.ar, T11505 tambucho de aluminio cuadrado 572x572 mm (interior 507x507), sin mosquitero, precio de lista · con IVA era 579.000 · sin IVA · con el 10% que descuenta Baron en sus remitos · 2026-09-28'),  -- Tambucho Cuadrado 57.5cm x 57.5cm
    -- Otras referencias web
    ('d3dfa487-3a7d-41df-855a-62b70bf6a1cf'::uuid, 23213.31::numeric, 'ARS', '2026-09-23'::date, null, null::uuid, 'Electro Gelz, tira LED COB 12V cálida Trefi, rollo de 5 m; la misma referencia que tiene la del K52 (no dice el ancho, la ficha pide 5 mm) · con IVA era 28.088,1 · sin IVA · 2026-09-23'),  -- Tira led cob 5mm x 5 metros. 15W, blanco calido 3000K
    ('1a472f8c-d7ae-48bc-8e59-89d5931df0d5'::uuid, 23213.31::numeric, 'ARS', '2026-09-23'::date, null, null::uuid, 'Electro Gelz, tira LED COB 12V cálida Trefi, rollo de 5 m; la misma referencia que tiene la del K52 (no dice el ancho, la ficha pide 10 mm) · con IVA era 28.088,1 · sin IVA · 2026-09-23'),  -- Tira led cob 10mm x 5 metros. 15W, blanco calido 3000K
    ('ba718a75-5fd3-4af0-9f43-e5902b54323d'::uuid, 11923.85::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Mundo LED (MercadoLibre), neón LED 12V rollo de 5 m (LED Universe 15.500) · con IVA era 14.427,86 · sin IVA · 2026-09-28'),  -- NEON FLEXIBLE 5M 12V
    ('abbb41e5-4462-4d51-8d8c-714fc81bb42c'::uuid, 2323.29::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'deplano.com.ar, caño fusión PN20 Ø 32 mm (1") KLOSS, barra de 4 m a 11.244,71: por metro · con IVA era 2.811,18 · sin IVA · 2026-09-28'),  -- Cañeria termofusion 1"
    ('0ecee772-6a45-4a95-8efe-61627217f643'::uuid, 2653.17::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Herrajes Gol (MercadoLibre), bisagra cazoleta 35 mm codo 0 cierre suave, por unidad · con IVA era 3.210,34 · sin IVA · 2026-09-28'),  -- Bisagra codo 0
    ('93f88e36-ba6a-4544-87d8-e67c85a660b4'::uuid, 11093.39::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Mundo Cima (MercadoLibre), corredera telescópica cierre suave 250 mm Cima, el par · con IVA era 13.423 · sin IVA · 2026-09-28'),  -- Guía telescóp. cierre suave 25cm
    ('82f25dd3-0722-4643-8945-5d6e3d534a16'::uuid, 117.62::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'fisheriessupply.com, tanque acumulador Jabsco 30573-0000 de 1 L (el de 0,64 L a 103,25) · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Tanque acumulador presion Flojet-Jabsco
    -- Sin modelo en la ficha: precio de referencia hasta que se decida
    ('b906ae92-89f6-4384-9673-4188d8e14d33'::uuid, 3099.99::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'Precio de referencia (la ficha no tiene modelo: "modelo?? accesorios??"): Garmin GPSMAP 1223xsv, Defender y Russell Marine a 3.099,99 · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Plotter 12"
    ('ff69a11e-39ba-4d45-aa50-2453685c8990'::uuid, 3899.99::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'Precio de referencia (la ficha no tiene modelo): Garmin Reactor 40 hidráulico con SmartPump v2, nvnmarine.com; no incluye la pantalla GHC ni las mangueras · EE.UU., sin flete ni gastos de importación · 2026-09-28')   -- Piloto automatico (KIT) K55
  ) as nuevo(material_id, precio, moneda, fecha, proveedor, proveedor_id, fuente)
 where exists (select 1 from public.panol_materiales m where m.id = nuevo.material_id)
   and not exists (
     select 1 from public.panol_precios p
      where p.material_id = nuevo.material_id and p.fuente = nuevo.fuente
   );

commit;
