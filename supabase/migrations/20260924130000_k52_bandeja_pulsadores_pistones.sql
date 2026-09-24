-- K52: bandeja de estandarización del pañol, pulsadores y pistones estándar, y
-- el ojo de buey sin precio. Lo definió Ezequiel el 24/09/2026.
--
-- 1. OJO DE BUEY: se borra el precio de referencia (lista de baron.com.ar de un
--    ojo de buey de 175 mm). El que llevó el 52-23 es el PL-ROUND-M-ST de
--    250×213, así que esa referencia no sirve. Queda sin precio hasta que lo
--    cotice quien lo vende.
-- 2. ESTÁNDAR: los pulsadores de consola (11 con retención y 6 sin, como el
--    52-23) y los pistones (3 de 18 kg como el 52-26 y 2 de 27 kg como el 52-24).
--    El pulsador sin retención no tiene precio: va estimado con el de retención.
-- 3. NO ESTÁNDAR: los otros 40 pendientes de la línea 52 en la bandeja. Son de
--    un solo casco: otra marca de algo estándar, cosas de los motores o del grupo
--    de esa obra, extras del cliente o compras puntuales. Cada uno con su motivo.

begin;

-- ─── 1. Ojo de buey sin precio ──────────────────────────────────────────────
delete from public.panol_precios
 where id = '67243038-314f-4869-aae0-e12a1e1efda6'
   and material_id = '03425e5e-5e18-41a4-8db1-04ff40a260c1'   -- Ojo de buey
   and fuente like 'baron.com.ar, ojo de buey inox 316 5-Oceans%';

-- ─── 2. Pulsadores y pistones, estándar ─────────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select '7f903e34-1cd9-495f-9e00-f39be106a3af', 8664, 'ARS', '2026-09-24', null, null,
       'Estimado: el mismo precio que el pulsador de consola CON retención (ficha, Flojumar, sin fecha)'
 where not exists (select 1 from public.panol_precios where material_id = '7f903e34-1cd9-495f-9e00-f39be106a3af');

insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ('8e0f48d5-0df2-4f34-8165-9b9480116ca8'::uuid, 11::numeric),  -- PULSADOR DE CONSOLA C/RETENCION AZUL
    ('7f903e34-1cd9-495f-9e00-f39be106a3af'::uuid, 6::numeric),  -- PULSADOR DE CONSOLA S/RETENCION AZUL
    ('bcfc6635-8690-45ce-801e-545a1b4cf34c'::uuid, 3::numeric),  -- Piston 18Kg e 437mm c 260mm
    ('dfc15286-b90f-4960-8ec8-baf0338ddbec'::uuid, 2::numeric)   -- Piston 27kg e 510mm c 305mm
  ) as nuevo(material_id, cantidad)
 where not exists (
   select 1 from public.panol_material_modelo actual
    where actual.material_id = nuevo.material_id and actual.modelo = '52'
      and coalesce(actual.variante, 'standard') = 'standard'
 );

-- ─── 3. Bandeja: no estándar en la línea 52 ─────────────────────────────────
insert into public.panol_material_normalizaciones (material_id, modelo, decision, cantidad, revisado_por, motivo_no_estandar, observacion_no_estandar)
select nuevo.material_id, '52', 'puntual', null, null, nuevo.motivo, nuevo.observacion
  from (values
    ('af650c8e-20ab-4b6b-b734-128d01856554'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 2.'),  -- PASAMANO RECTO 300MM
    ('3978ee84-65a3-4147-984e-98b7101dd2de'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 2.'),  -- PASAMANO RECTO 1500MM
    ('9805411b-d676-4486-a310-730cb1b9cbed'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-26: 1.'),  -- ANCLA 32KG GALVANIZADO DELTA
    ('e775154e-57f7-4b20-a837-e3194309e638'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 2.'),  -- MANIJA INOX CAÑO OPVAL 170X40MM
    ('bf6a01f6-93c7-47f1-8fdf-cdd903a6422d'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 2.'),  -- GIRATORIO BUTACA
    ('6ecf947f-e9c3-4d18-b70a-48c69db47de9'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-26: 1.'),  -- TRABACADENA INOX STOPPER 80X70MM
    ('09780a31-1f34-4dd1-8f8d-d452e8980a86'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 1.'),  -- CAJA PORTA BATERIA 431X257X256
    ('92f8ee35-0ca1-4efa-b326-2f06c46b550d'::uuid, 'otro', 'Es el piso que eligió el cliente de esa obra; en la matriz va el genérico "Caja de piso". Lo llevó el 52-23: 1.'),  -- CAJA DE PISO URBEN FOSTER CREAM
    ('8153eaa2-4650-4749-9575-2757b74582c6'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-23: 6.'),  -- BATERIA WILLARD 12X220
    ('897bc49b-26a1-4ea4-b6dd-1a49798aae85'::uuid, 'adicional', 'Lo eligió el cliente de esa obra; no va en todos los K52. Lo llevó el 52-24: 1.'),  -- Cámara GARMIN GC 245
    ('6a08077a-42c5-4f63-b65a-3fee4799e5e9'::uuid, 'adicional', 'Lo eligió el cliente de esa obra; no va en todos los K52. Lo llevó el 52-24: 2.'),  -- Cámara GARMIN GC 200
    ('10f6a22b-8048-4c54-af89-39b1560e2617'::uuid, 'adicional', 'Lo eligió el cliente de esa obra; no va en todos los K52. Lo llevó el 52-22: 1.'),  -- Garmin Stereo Fusion MS-RA670
    ('c6f2657a-0de2-4eae-966e-d044591b51c2'::uuid, 'adicional', 'Lo eligió el cliente de esa obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- PARLANTE JL 7.7" M6-770 GRIS
    ('8365ba5b-6304-4def-9e5a-97445a47ae9d'::uuid, 'otro', 'Es el piso que eligió el cliente de esa obra; en la matriz va el genérico "Caja de piso". Lo llevó el 52-24: 2.'),  -- CAJA DE PISO Orbis OXFP 452-13
    ('227c7279-0565-480c-8080-0a56ec271f86'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-24: 1.'),  -- ANODO DE SACRIFICIO ZINC
    ('3bedd34e-ee72-40ef-9571-9e68a80ad891'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-24: 2.'),  -- ANODO DE FLAP ZINC
    ('96fbcfa4-43df-4ea8-8749-dfe5dc9a2f80'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-24: 2.'),  -- ANODO TIMON 5´ ZINC
    ('55f07459-5b9b-4329-be61-d22233e0a624'::uuid, 'otro', 'Es la misma ancla Bruce 30 kg de la matriz, cargada con otro ítem del catálogo. Lo llevó el 52-24: 1.'),  -- Ancla Bruce 30kg galvanizada
    ('2592e3b6-5c7d-4d06-8337-351bdbb5ff6c'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- Bomba dual-max 12v
    ('8d181543-0791-4639-845b-faba3e724c79'::uuid, 'otro', 'Otra marca o variante de un ítem que ya está en la matriz del K52. Lo llevó el 52-25: 1.'),  -- REGULADOR DE PRESION BLANCO SEAFLO
    ('225099a6-4f3b-4e9c-87c2-859c18de3ca8'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- CONTROL FARO JABSCO
    ('871d5cd1-8ef3-4730-aca8-86ab1e06bf3c'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- DELUXE COMPACT PANEL SAN GIORGIO
    ('f39e0d9d-056a-46f3-8843-b504c39a276b'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- DISPLAY ADVANCED 7" SAN GIORGIO
    ('e8ab225c-6ca6-4699-806e-87f8d5b4558c'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-23: 2.'),  -- MORSE FLEXBALL CONTROL 4200
    ('b4c7077f-d935-4224-9d1f-05a23366bafa'::uuid, 'otro', 'Pieza del K55 cargada en un K52; el K52 lleva los PUNTALES ASIENTO K52 de Maxi. Lo llevó el 52-23: 3.'),  -- PUNTALES ASIENTO K55
    ('923434be-2370-4380-a9ca-76fb2b9f65a9'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 2.'),  -- CANILLA VALDEOS
    ('03fa1c35-3486-4dcc-b3d6-d4c4d9b1ca05'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-25: 2.'),  -- terminal tana 8mm
    ('38303b1c-e7d0-49d6-867c-6b1408cf9864'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-24: 2.'),  -- TAMBOR DE ARRANQUE (LLAVES)
    ('e54be50e-187b-4a6b-992c-92afc5aca055'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-22: 1.'),  -- PASAMANOS ESCALERA PLANCHADA
    ('8da88891-2b01-4c38-9a12-fe10c7a76c33'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-25: 3.'),  -- PORTAFUSIBLE MEGA
    ('648ab628-f54e-47e6-bbbc-b2bec288a75e'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 3.'),  -- Pasa cable - Recto D=08mm
    ('2b918c7d-a0c0-4aa1-9460-50b2aa94e91a'::uuid, 'adicional', 'Lo eligió el cliente de esa obra; no va en todos los K52. Lo llevó el 52-24: 2.'),  -- BACHA DE APOYO REDONDA NEGRO MATE LZA-1203094-BAC DECA
    ('a001cf4b-9629-48ed-a6ac-3ebcc09d6aa7'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-22: 2.'),  -- Rejillas Plastico Seaflo D76x92 Blanca
    ('e9511bc9-e49f-4894-951f-6cc9384b2642'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- Sensor nivel agua/comb.  14¨
    ('d8fd6b1a-254a-4a42-be56-44efdeed7011'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-23: 1.'),  -- Separador de gases 3¨ 1020301
    ('2972dabe-5a20-4477-a249-8856b7f3c77b'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 1.'),  -- Conector ANTENA Union Corta (YC1102)
    ('1a30fa8d-5e98-4b44-a368-34462ee7d9e8'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 3.'),  -- Conector Antena Macho P/VHF P/RG58 (YC101)
    ('8b509a47-aa1e-4395-a8dd-52782cc8f7da'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 2.'),  -- Pasador Inoxidable 316, Heavy Duty de 3-1/2"
    ('b2ace13f-e5a3-458b-a1c0-417cfb3ba839'::uuid, 'compra_puntual', 'Compra de una sola obra; no va en todos los K52. Lo llevó el 52-26: 1.'),  -- CANCAMO 80X50MM 4 TORNILLOS B10121
    ('0754784c-7c6d-4dee-b36f-98fd8b6d9fe9'::uuid, 'otro', 'Depende de los motores o del grupo de esa obra; no va en todos los K52. Lo llevó el 52-23: 2.')   -- Silenciador CENTEK Vernalift 3´´ 150034w
  ) as nuevo(material_id, motivo, observacion)
on conflict (material_id, modelo) do nothing;

commit;
