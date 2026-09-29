-- K55: primera tanda de precios. Lo pidió Ezequiel el 28/09/2026 ("a todo lo que le falte").
--
-- Antes: 365 ítems, 168 con precio y 184 sin precio. Esta tanda carga 64.
-- Todo SIN IVA, y ningún proveedor inventado: lo que sale de una web o de la
-- lista de una obra va con proveedor en null y el origen en "fuente".
--
-- De dónde sale, en orden:
--   1. Flojumar (28). Los presupuestos 0001-00005534, 5536 y 5538 del 04/09
--      son la respuesta a la lista que se le mandó para el K55
--      (precios-flojumar.xlsx). En la migración 20260922140000 se cargaron
--      solo los renglones cuyo código ya estaba en el catálogo; los del K55 no
--      lo tenían y quedaron afuera. Flojumar cotiza a consumidor final: todos
--      van divididos por 1,21.
--   2. Trimer (5), de su cuenta corriente con Klase A: el silenciador y el
--      separador de gases de 3" que compró el 55-1, el aire FCFP25 y la bomba
--      de 1000 GPH del 52-23, y las bombas de 500 GPH del 64-21.
--   3. Otros papeles (5): la rejilla D60 obturable del presupuesto Baron del
--      21/09 (el mismo código C89099), el codo de Iriarte, el cable 1x1,5 de
--      Electro 2001, y el equipo de audio del 55-1 (remito de Garmin).
--   4. Listas de las obras 55 (4): cámara, pistones de 80N, sensores de
--      puerta y horno.
--   5. Referencias web (22): grupo, thrusters, aires, heladera, TVs,
--      grifería, bachas, llaves y tomas. Las de EE.UU. no incluyen flete ni
--      importación: en Argentina salen más.
--
-- Lo que NO se tocó a propósito:
--   · Tender lift: no está confirmado que sea estándar en el K55.
--   · Controles Lenco de flaps: el 55-3 recibió de Trimer el sistema Bennett
--     24x12 con control EIC de 2 estaciones (remito del 14/09), que ya tiene
--     precio en "Sistema FLAP 24 x 12 Doble estación". Si se cargan, el barco
--     paga dos controles.
--   · Repetidos en la matriz: "Grupo electrogeno 17.5 kva" (es el mismo Kohler
--     18EFKOZD), "Giratorio gusano cadena 10-12mm" (el mismo destorcedor) y el
--     túnel del bow thruster, que figura dos veces. Se cotiza uno de cada par.
--   · Lo que se cotiza a medida: herrería de Maxi Herrero, vidrios del casco,
--     cableado y tableros de Merniez, tanques y el inox de Famiq/Inoxalum.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, nuevo.moneda, nuevo.fecha, nuevo.proveedor, nuevo.proveedor_id, nuevo.fuente
  from (values
    -- Flojumar: presupuestos 5534, 5536 y 5538 del 04/09, la respuesta a la lista del K55
    ('142d2ea6-bd30-4954-8859-a2a8c7a96888'::uuid, 11595.04::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 7172 CADENA CALIBRADA 10MM GALVANIZADA X METRO PARA MALACATE · con IVA era 14.030 · sin IVA'),  -- Cadena 10mm calibrada galvanizada
    ('3824e242-d540-4e97-b2d3-eb6d2e710a27'::uuid, 92971.07::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 17255 TABLERO PARA BOMBA DE ACHIQUE JOHNSON PUMP 12V · con IVA era 112.495 · sin IVA'),  -- Panel bomba de achique Johnson pump
    ('1b504e7d-5c21-4f9c-b0a6-e2da81aa9b5f'::uuid, 32535.54::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3422 AUTOMATICO ACHIQUE FLOTADOR AS888 JOHNSON PUMP · con IVA era 39.368 · sin IVA'),  -- Automatico Johnson pump 20A
    ('57afcf61-77e6-4a62-9acb-3471c395d8df'::uuid, 94089.26::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 23334 ANODO ALUMINIO EJE 2 3/4" C2750A · con IVA era 113.848 · sin IVA'),  -- Ánodo eje 2 3/4"
    ('d35acbfa-ac3d-4974-9ffd-267127a4ce93'::uuid, 216166.94::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3404 CAJA DE DUCHA BOMBA 1000 GPH 12V JOHNSON PUMP · con IVA era 261.562 · sin IVA'),  -- Caja drenaje ducha 1000 GPH
    ('e02e9579-2bcb-4bc7-b7ac-c57c4547f7ec'::uuid, 485231.4::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 9941 BOWTHRUSTER CONTROL JOYSTICK DOBLE QUICK · con IVA era 587.130 · sin IVA'),  -- CONTROL DOBLE BOW/STERN QUICK TCD2044
    ('40aa7005-da15-4cfd-98b6-13ce7a1feaee'::uuid, 2040694.21::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 17410 INODORO TECMA 12V CON BIDET SILENCE 2G · con IVA era 2.469.240 · sin IVA'),  -- Inodoro Tecma Thetford silence 2 plusg con bidet y tapa 12v
    ('fc662362-0692-4ad9-b66e-45ef1b63bd50'::uuid, 40814.05::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 3801/3802 INSTRUMENTO BLANCO COMBUSTIBLE NIVEL / INSTRUMENTO BLANCO AGUA NIVEL (mismo precio los dos) · con IVA era 49.385 · sin IVA'),  -- Instrumento agua/combustible aro cromado
    ('846d1c6b-5082-408d-99ad-f7baa223ab1e'::uuid, 29885.12::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 3084 LLAVE CARLING (ON)-OFF-(ON) UNIPOLAR MALACATE BLUE SEA SYSTEM · con IVA era 36.161 · sin IVA'),  -- Llave carling malacate 2 puntos
    ('737e57e3-9656-4111-bdf3-191d4362c7c5'::uuid, 106073.55::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 3871 SENSOR COMB/AGUA 115CM ROSCA · con IVA era 128.349 · sin IVA'),  -- Sensor agua 115cm
    ('baec07ec-bd58-4273-a022-4e51c2913c64'::uuid, 665495.87::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 9918 ADAPTADOR STERN THRUSTER QUICK TUNEL 250 · con IVA era 805.250 · sin IVA'),  -- Adaptador tunel sternthruster 250mm
    ('bb323bfe-b557-476c-8184-c09d50dbabdc'::uuid, 310167.77::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3402 BOMBA DE ACHIQUE 4000 GPH 12V JOHNSON PUMP · con IVA era 375.303 · sin IVA'),  -- Bomba achique 4000gph 12V
    ('ec821aff-517d-49af-be7e-a4c586598598'::uuid, 1697174.38::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3435 BOMBA DUAL PRESURIZADA 10.4 12V JOHNSON PUMP · con IVA era 2.053.581 · sin IVA'),  -- Bomba dual 10.4gpm 12v johnson pump
    ('5958c39d-9763-4f02-a7df-09655cff575c'::uuid, 1980609.92::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3703 INVERSOR CARGADOR 12V 3000W MULTIPLUS II VICTRON ENERGY · con IVA era 2.396.538 · sin IVA'),  -- Cargador inversor Victron Multiplus 12V 3000W
    ('232b7ecb-2ad2-4243-b047-14c7c6ab3475'::uuid, 101350.41::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 7137 GIRATORIO DESTORCEDOR GUSANO 10-12MM · con IVA era 122.634 · sin IVA'),  -- Destorcedor tipo "gusano" INOX p/cadena 10-12mm
    ('34b07603-3422-4c96-b28d-71aac6acb8e2'::uuid, 807208.26::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 4080 FARO REMOTO 12V BLANCO MARINCO · con IVA era 976.722 · sin IVA'),  -- Faro Marinco 12V dirigible
    ('79bb255c-bb8f-4139-9f9c-1d8f0230dae3'::uuid, 281639.67::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 4443 LUZ BANDA ROJA HELLA MARINE · con IVA era 340.784 · sin IVA'),  -- Luz banda ROJA led
    ('f1445b1d-8c0a-4998-862d-897de18f4190'::uuid, 281639.67::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 4447 LUZ BANDA VERDE HELLA MARINE · con IVA era 340.784 · sin IVA'),  -- Luz banda VERDE led
    ('bf0c57f0-d81a-4a29-a082-fc97bfe23d07'::uuid, 214809.92::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 4446 LUZ FONDEO 360 HELLA MARINE · con IVA era 259.920 · sin IVA'),  -- Luz fondeo led blanca 360
    ('7a0b267c-33d5-41cf-96bb-bce78014c14f'::uuid, 323408.26::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 4445 LUZ PROA BLANCA HELLA MARINE MASTER HEAD (la ficha ya tenía el código 4445) · con IVA era 391.324 · sin IVA'),  -- Luz de proa blanca
    ('51a44763-f845-4804-80d7-776a25aa4cd4'::uuid, 52157.02::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026 (lista del K55), 17081 SEAFLO ENTRADA DE AGUA BLANCA PRESION · con IVA era 63.110 · sin IVA'),  -- REGULADOR DE AGUA AMARRA
    ('9063db41-b321-4b28-b362-00af15c4dfd4'::uuid, 211330.58::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005538 04/09/2026 (lista del K55), 7345 QUICK SOLENOIDE MALACATE 3 TORNILLOS 150A 12V 6315 · con IVA era 255.710 · sin IVA'),  -- Solenoide Quick italy 12v
    ('31f8fe8b-015a-4fc7-aeac-cf433d8b26e5'::uuid, 44230.58::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005538 04/09/2026 (lista del K55), 9142 TAPA TANQUE CARGA WASTE 1 1/2" INOX · con IVA era 53.519 · sin IVA'),  -- Tapa tanque waste 1 1/2" cromada c/venteo
    ('75260e7d-43bf-440e-84f3-48ad1dd53337'::uuid, 1542611.57::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005538 04/09/2026 (lista del K55), 3534 TERMOTANQUE 20 GALONES 220V ALUMINIO KUUMA (cotizaron un Kuuma de 20 galones = 76 L, no el Camco) · con IVA era 1.866.560 · sin IVA'),  -- Termotanque CAMCO 76L
    ('30abdbce-f643-410e-88f0-55ad32367d64'::uuid, 126976.86::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005538 04/09/2026 (lista del K55), 3178 TOMA DE TIERRA CUADRADA 32 AMP P CABLE MARINCO · con IVA era 153.642 · sin IVA'),  -- Toma tierra Marinco 32A 220V
    ('d7d100f9-c744-45e3-825e-a0232910ce06'::uuid, 103171.9::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005538 04/09/2026 (lista del K55), 3708 PARALELO DE CARGA CYRIX - CT 12/24V 120A VICTRON ENERGY · con IVA era 124.838 · sin IVA'),  -- Victron, combinador de baterias cyrix-ct
    ('48b464a5-dd23-467e-9628-29e25af925a0'::uuid, 351446.28::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 3250 BOCINA DOBLE 12V ELECTRICA TROMPETA MARINCO (el código de barras de la ficha es 3250) · con IVA era 425.250 · sin IVA'),  -- Bocina Doble Deluxe
    ('d3183971-e558-4201-902f-229b4243c8f5'::uuid, 87293.39::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005534 04/09/2026 (lista del K55), 9944 CABLE EXTENSION PARA CONTROL DE BOWTHRUSTER (12M) QUICK (el de 12 m) · con IVA era 105.625 · sin IVA'),  -- Cable alargue bow thruster K55
    -- Trimer: cuenta corriente (dólares oficiales)
    ('0754784c-7c6d-4dee-b36f-98fd8b6d9fe9'::uuid, 599::numeric, 'USD', '2026-07-14'::date, 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff'::uuid, 'Cuenta corriente Trimer con Klase A, pedido del 14/07/2026 (obra 55-1): SILENCIADOR (S/T), 3" (10X10) · IVA sin confirmar, cargado tal cual'),  -- Silenciador CENTEK Vernalift 3´´ 150034w
    ('d8fd6b1a-254a-4a42-be56-44efdeed7011'::uuid, 1124::numeric, 'USD', '2026-07-14'::date, 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff'::uuid, 'Cuenta corriente Trimer con Klase A, pedido del 14/07/2026 (obra 55-1): SEPARADOR DE AGUA Y GASES GEN (reemplazó al de 2", que se devolvió a 848) · IVA sin confirmar, cargado tal cual'),  -- Separador de gases 3¨ 1020301
    ('87e37d26-a454-44ea-af5d-da29de5f3c34'::uuid, 2977.5::numeric, 'USD', '2026-07-27'::date, 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff'::uuid, 'Cuenta corriente Trimer con Klase A, pedido del 27/07/2026 (obra 52-23): EQUIPO FCFP25 PLATINUM, DIG · IVA sin confirmar, cargado tal cual'),  -- AIRE ACONDICIONADO 25000 FCFP25 PLATINUM
    ('39807315-9043-44a2-bc0e-5c896bc90086'::uuid, 900::numeric, 'USD', '2026-07-27'::date, 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff'::uuid, 'Cuenta corriente Trimer con Klase A, pedido del 27/07/2026 (obra 52-23): BOMBA DE AGUA 1000 GPH · IVA sin confirmar, cargado tal cual'),  -- Bomba de Aire acondicionado 1000gph
    ('c78ef8fb-f67f-423b-b667-3fa426fa4c6e'::uuid, 565::numeric, 'USD', '2026-06-01'::date, 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff'::uuid, 'Cuenta corriente Trimer con Klase A, pedido del 01/06/2026 (obra 64-21): 2 BOMBA DE AGUA 500 GPH por 1.130 · IVA sin confirmar, cargado tal cual'),  -- Bomba aire acondicionado 220v 500gph
    -- Otros papeles: Baron, Iriarte, Electro 2001 y el remito de Garmin del 55-1
    ('ee4907f6-c15e-476c-bacf-a4981ba991ef'::uuid, 16438.02::numeric, 'ARS', '2026-09-21'::date, 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'::uuid, 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%), C89099 CALEFACTOR AUTOTERM REJILLA D60 OBTURABLE · convertido a sin IVA (÷1,21; con IVA era 22,100.00) · con el 10% de descuento del presupuesto'),  -- Rejilla D60 Obturable Negra - Calefactor Autoterm
    ('dc9c422f-275a-4426-8274-cc2db661cc97'::uuid, 2590.35::numeric, 'ARS', '2026-09-14'::date, 'Casa Iriarte', '39d9cb3e-9c99-473d-9908-7cb3d5e63b9e'::uuid, 'Presupuesto Iriarte 68359 14/09/2026, PX COD45HH11/4 CODO HH 45º 11/4 PX: cotizaron el de 45°, el de 90° sigue pendiente · sin IVA'),  -- Codo 90° HH plastico 1 1/4"
    ('9b6c1f93-b234-4012-9351-bbc684c05181'::uuid, 452.1021::numeric, 'ARS', '2026-09-07'::date, 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078'::uuid, 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5 NEG, por metro · sin IVA'),  -- Rollo de cable negro 1.5mm
    ('6ed23a63-e7f9-4ccc-b272-5170ba7084a4'::uuid, 452.1021::numeric, 'ARS', '2026-09-07'::date, 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078'::uuid, 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5 ROJ, por metro · sin IVA'),  -- Rollo de cable rojo 1.5mm
    ('cd3f2ccf-fccb-4e3c-b4c0-08ca43dfa207'::uuid, 11634301.18::numeric, 'ARS', '2026-09-17'::date, 'Garmin', 'a79b3061-4caa-492f-a1e4-3eed23065de3'::uuid, 'Remito Garmin (Ultralight) 7777-00192915 del 17/09/2026, obra 55-1: valor declarado del equipo que eligió ese cliente (estéreo Fusion Apollo RA770, 3 parlantes y 2 subwoofers JL M6, 3 amplificadores Fusion Apollo) · IVA sin confirmar, cargado tal cual'),  -- Equipo de audio (elige cliente)
    -- Listas de las obras 55
    ('4ae136ee-be39-4a3f-8df9-0269044c9a13'::uuid, 34218::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Lista de la obra 55-1 (compra), Hikvision DS-2CE76D0T-EXIMF · IVA sin confirmar, cargado tal cual'),  -- CAMARA DE TECHO
    ('f692743c-c8d3-4a45-b57f-2ab8e51b88dc'::uuid, 1700::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Listas de las obras 55-1, 55-2, 55-3 y 55-4 (mismo precio en las cuatro) · IVA sin confirmar, cargado tal cual'),  -- Pistones 80N
    ('32b18854-cb66-4225-b995-f2e4265ebbb0'::uuid, 20900::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Listas de las obras 55-1 a 55-5 (mismo precio en las cinco) · IVA sin confirmar, cargado tal cual'),  -- Sensor Apertura Puerta Simple P/ Tira Led
    ('f6e2b26e-b80c-460c-a33a-d2844d7471c0'::uuid, 1200000::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Lista de la obra 55-2 · IVA sin confirmar, cargado tal cual'),  -- Horno Samsung NV7B4040VAS/BG
    -- Referencias web, sin proveedor
    ('3f4fe443-ed39-4ae5-8b00-f374f60ee86a'::uuid, 26373::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'mmarineonline.com, Kohler 18EFKOZD-SS 12V 50 Hz con cabina insonorizada, precio de lista (en oferta a 21.098,40) · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Generador Kohler 18EFKOZD/21EKOZD
    ('178b4e9e-984e-4d25-b078-709395b26913'::uuid, 6901.34::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'inetmarine.com, Vetus BOW16024D 160 kgf 24V túnel 250 mm (lista 7.267,30); la ficha no dice marca · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Bowthruster 160kg 24v 250mm
    ('fa8c5897-9457-4817-b7ca-a9a51794404c'::uuid, 6901.34::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'inetmarine.com, Vetus BOW16024D 160 kgf 24V túnel 250 mm, el mismo equipo que el de proa; la ficha no dice marca · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Sternthruster 160kg 24v 250mm
    ('279aa38d-e417-4176-a759-d0305626001b'::uuid, 1924::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'citimarinestore.com, Webasto FCF Classic 12.000 BTU (precio del de 115V; el de 230V no muestra precio) · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- AIRE ACONDICIONADO 12000 FCF12 COMUN
    ('58972e55-87c1-4429-85de-ee3dd9b1b34c'::uuid, 1670.5::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'citimarinestore.com, Webasto FCF Platinum 6.000 BTU 230V · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- Aire acondicionado 6.000 btu PLATINUM
    ('e590e3a8-fc2a-4e13-80cd-c169d952b152'::uuid, 237.95::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'citimarinestore.com, Garmin GHS 11 010-01759-00 · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- GHS 11 GARMIN
    ('f1d00116-723a-4ede-bce5-cee4fef243c1'::uuid, 129.99::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'anchorexpress.com, Shakespeare 5101 8'' Classic VHF, precio regular (en oferta a 85,99) · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- ANTENA VHF BASE INOX SHAKESPEARE 5101-S
    ('4c965220-d7ef-4a2b-9ffd-6dc7f9e8a309'::uuid, 283.86::numeric, 'USD', '2026-09-28'::date, null, null::uuid, 'fisheriessupply.com, panel Thetford de 2 botones (antes/después) para Tecma Silence 12/24V · EE.UU., sin flete ni gastos de importación · 2026-09-28'),  -- PANEL DE CONTROL TECMA THETFORD BEFORE/AFTER
    ('2586db10-4c4d-4bcf-862b-aff422fa471e'::uuid, 3181818.18::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'mobili.ar, Bosch KIN86ADD0 combi integrable panelable (otra tienda 4.110.000) · con IVA era 3.850.000 · sin IVA · 2026-09-28'),  -- Heladera Panelable K55
    ('919ed30c-8a0e-48cc-bf1d-69cfa1e423e6'::uuid, 758676.86::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'multipoint.com.ar, Samsung 50" Crystal UHD U8000F, precio de lista (en oferta a 699.999) · con IVA era 917.999 · sin IVA · 2026-09-28'),  -- TV SAMSUNG 50" Crystal UHD 4K U8000F
    ('46b7c591-8e31-4943-b576-e8beb2ded1b6'::uuid, 338842.15::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'musimundo.com, Samsung UN32H5000FGCZB 32" HD H5000F (en Cetrogar 329.999 en oferta) · con IVA era 409.999 · sin IVA · 2026-09-28'),  -- TV 32" Hd H5000 Smart
    ('bd2adb09-7da1-47b7-8d2a-459384d2d3e5'::uuid, 147003.29::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'SSM Online (MercadoLibre), FV 0412/N9 Huemul cromo (rango 177.874-296.436) · con IVA era 177.873,98 · sin IVA · 2026-09-28'),  -- Juego monocomando para mesada de cocina FV Huemul 0412/N9
    ('e5f685f6-e7af-4577-aa83-edc735855868'::uuid, 81539.99::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Haus Online (MercadoLibre), FV Polca II 0128.17 cromo (rango 84.392-117.517) · con IVA era 98.663,39 · sin IVA · 2026-09-28'),  -- Duchador con barral FV Polca 0128.17
    ('59299552-d706-4389-ad63-3e8f8aa68ca8'::uuid, 70975.35::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'foschia.com.ar, bacha simple Johnson Z52 (rango 85.880-91.900) · con IVA era 85.880,17 · sin IVA · 2026-09-28'),  -- Bacha Johnson Z52, profundidad 15cm
    ('c88ce208-4c04-4cb1-aa1e-6aca06f8337f'::uuid, 82636.36::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'fravega.com, Piazza A426 slim rectangular de apoyo, precio sin impuestos nacionales (con IVA 99.990) · 2026-09-28'),  -- Bacha Piazza A426 Blanco
    ('3aee9e24-a92d-4eb5-b9b6-3468e73d17fc'::uuid, 160363.64::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'flojumar.com, canilla rebatible de diseño fría/caliente Osculati, código 17030 (el de la ficha), precio de lista · con IVA era 194.040 · sin IVA · 2026-09-28'),  -- Canilla Osculati rebatible
    ('378b0fd3-347b-47f7-92a0-e2f0d0eb32d0'::uuid, 166727.27::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'flojumar.com, duchador de mano fría/caliente Osculati, código 17006 (no dice si es el 15.470.12), precio de lista · con IVA era 201.740 · sin IVA · 2026-09-28'),  -- DUCHADOR DE MANO OSCULATI 1547012
    ('692e7d5b-bd13-4c3f-91a6-2dad3c911ba2'::uuid, 4907.44::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Distribuidora Miler (MercadoLibre), llave Milan 2 puntos bastidor metálico Macroled (rango 4.942-6.513) · con IVA era 5.938 · sin IVA · 2026-09-28'),  -- Llave 2 puntos combinables Macroled MILAN
    ('758d53c8-2d39-41d5-adf1-56837b2d25d5'::uuid, 27619.83::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Mundo LED (MercadoLibre), tecla toma doble + USB-C 20W Milan Macroled (rango 25.202-44.039) · con IVA era 33.420 · sin IVA · 2026-09-28'),  -- Toma doble 220v + USB-C Macroled Milan
    ('82765da8-56f7-4ccd-b586-a57b9c45eff8'::uuid, 8892.6::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Grupo Dimexo, caja estanca Roker PR1005/81 162x212x81 (Electricidad Avellaneda 9.579) · con IVA era 10.760,05 · sin IVA · 2026-09-28'),  -- Caja paso Roker Pr1005
    ('4633a455-bf86-438a-99a7-a63fde82f6bf'::uuid, 16173.97::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'Tienda Keuken (MercadoLibre), cerradura magnética de puerta, frente de acero inox con imán (Herrajes Manolo 17.022) · con IVA era 19.570,5 · sin IVA · 2026-09-28'),  -- Cerraduras de puertas BRONZEN magneticas
    ('9765e3d5-30b9-44f7-aee9-77dec09d3a2d'::uuid, 72322.31::numeric, 'ARS', '2026-09-28'::date, null, null::uuid, 'MercadoLibre, Currao Sardegna 7003-37 (la ficha gemela dice 84.018) · con IVA era 87.510 · sin IVA · 2026-09-28')   -- Picaportes Currao SARDEGNA
  ) as nuevo(material_id, precio, moneda, fecha, proveedor, proveedor_id, fuente)
 where exists (select 1 from public.panol_materiales m where m.id = nuevo.material_id)
   and not exists (
     select 1 from public.panol_precios p
      where p.material_id = nuevo.material_id and p.fuente = nuevo.fuente
   );

commit;
