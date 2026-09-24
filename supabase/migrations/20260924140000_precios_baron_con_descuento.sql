-- Precios de Baron con el descuento de cada remito, y lo que no coincidía con el
-- remito del 52-26 (10/09/2026) que pasó Ezequiel.
--
-- 1. DESCUENTO: Baron les factura a lista de consumidor final y al pie descuenta.
--    El total que se paga es el monto en dólares ("son u$s ...") al 1.535. Los
--    precios se habían cargado a lista (÷1,21 por el IVA) sin ese descuento, así
--    que quedaban alrededor de 10% arriba. Descuento de cada documento, leído del
--    pie o sacado del total en dólares:
--      presupuesto 21/09 (obra 37-43) ....... 10%  (lo dice el mismo presupuesto)
--      remitos 02/09 H175 (accesorios) ....... 10%  (USD 3.319)
--      remito 02/09 H175 (electrónica) ....... 5,02% (USD 2.337)
--      remito 10/09 52-26 .................... 10%  (USD 5.298)
--      remito 10/09 52-26 (compás) ........... 5,29% (USD 135)
--      remito 15/09 43-30 .................... 8,58% (USD 29)
--      remito 15/09 55-2 ..................... 5,61% (USD 38)
--      remito 17/09 85-2-3 ................... 10%  (USD 504)
--    Los precios de referencia sacados de baron.com.ar siguen a lista.
-- 2. REMITO DEL 52-26, lo que no coincidía:
--    · el kit Whale frío-calor (K01536) y los inodoros con bidet se habían cargado
--      en otro ítem o no se habían cargado; el del inodoro tenía una referencia de
--      otras obras ($906.000, sin proveedor) que se borra para que valga la real
--    · el cabo Dacron que el catálogo llama "6MM" es el de 8 mm (C57229)
--    · el pasacable es el de 6 mm (P23025), no el de 8 mm
--    · las rejillas del calefactor Autoterm no tenían precio

begin;

-- ─── 1. Descuento de cada documento ─────────────────────────────────────────
update public.panol_precios p
   set precio_unitario = nuevo.precio,
       fuente = p.fuente || ' · ' || nuevo.nota
  from (values
    ('bb17f165-2c8d-4efd-bf07-6c6d9dedb0c5'::uuid, 13611.57::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- BASE ANTENA VHF PLASTICA A15467: 15123.97 → 13611.57
    ('de9f4655-6c10-4648-8a91-2f3754e46ea2'::uuid, 12272.72::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- GANCHO INOXIDABLE PORTA DEFENSA: 13636.36 → 12272.72
    ('dc27f808-2841-4cc1-a283-2395a2122410'::uuid, 16140.49::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Enchufe Toma (12V-24V) USB 12V redondo: 17933.88 → 16140.49
    ('aa53e5f8-9aba-438e-b7e9-17685463850d'::uuid, 871304.13::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- Malacate X1 500W · Lofrans: 917355.37 → 871304.13
    ('ea504bbd-c16a-45de-a8e6-694bc55554ac'::uuid, 109894.22::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- Compas Ritchie Embutir Blanco 50w: 115702.48 → 109894.22
    ('431494f3-5b1d-4592-be4c-20ecc3fa9041'::uuid, 25354.16::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- LOFRANS JOYSTICK UP/DOWN: 26694.21 → 25354.16
    ('50bad908-eb32-477e-ab5c-5d472bbf1544'::uuid, 23234.78::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- Piston 18Kg e 437mm c 260mm: 24462.81 → 23234.78
    ('62dc1b18-502e-4992-a86e-30b1f14c8a18'::uuid, 14678.73::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- BOMBA ACHIQUE ELECT AUTOMATICO SEAFLO 20 AMPS: 15454.55 → 14678.73
    ('47b75189-ae6e-4423-b52a-9b2044ef9e35'::uuid, 16641.12::numeric, 'con el 5,02% de descuento del remito (total USD 2.337)'),  -- CONTROL BOMBA DE ACHIQUE SEAFLO B27011: 17520.66 → 16641.12
    ('01ce7cdb-bc65-479d-88eb-f38d1776b206'::uuid, 13165.29::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Pasador Inoxidable 316, Heavy Duty de 3-1/2": 14628.1 → 13165.29
    ('402a5970-e96a-4584-a50c-2002333df2d2'::uuid, 21347.11::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- BICHERO PLASTI 2 TRAMOS 120/210CM: 23719.01 → 21347.11
    ('353ee528-cdae-45ea-aced-d861c64df987'::uuid, 290826.45::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- DUCHADOR TWIST AGUA FR/CAL C/MANGUERA: 323140.5 → 290826.45
    ('212924e1-bd32-42e4-a384-db1a50f971fc'::uuid, 45743.81::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- TRABACADENA INOX STOPPER 80X70MM: 50826.45 → 45743.81
    ('76ae30b1-10c1-4deb-9dd5-3964e4255b54'::uuid, 10636.36::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- GIRATORIO BUTACA: 11818.18 → 10636.36
    ('4e6b025a-ff1d-4fbc-8f13-0df960d576ae'::uuid, 3897.52::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- SOPORTE BICHERO Inoxidable 25-32mm (PAR): 4330.58 → 3897.52
    ('7d65939a-48c0-48d0-8375-20d4899849f5'::uuid, 31834.71::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Levantapiso - Perko 1220DPCHR: 35371.9 → 31834.71
    ('3d663ecd-84c7-4eb2-bf5d-ac2aafd728b1'::uuid, 5169.42::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Llave abre Tapa Tanque inox: 5743.8 → 5169.42
    ('c6863c76-0ed6-4fa2-8ee4-f1bbd51eb45a'::uuid, 6664.46::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Grillete inoxidable largo - D10mm (3/8"): 7404.96 → 6664.46
    ('f76add64-f763-4c38-8a45-ce61c661b7a7'::uuid, 23057.85::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- MANIJA INOX CAÑO OPVAL 170X40MM: 25619.83 → 23057.85
    ('4d02b534-6f31-4698-8494-584b1aa8bffa'::uuid, 996.7::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Omega Inoxidable Inox Barra D06mm c/u: 1107.44 → 996.7
    ('ab765926-21a9-4de0-81cf-87a8e774597d'::uuid, 4886.78::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Bisagra Inox 59X40mm 6 Tornillos: 5429.75 → 4886.78
    ('a3d3bb06-3eb9-415e-aa01-2749e56695f4'::uuid, 5504.13::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Bisagra INOX 71x38mm 4 Tornillos B21256: 6115.7 → 5504.13
    ('55419b31-f0fe-457b-b301-8f17dd6f3f4a'::uuid, 5013.23::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Bisagra 38X38X2mm 4 Tornillos: 5570.25 → 5013.23
    ('eeb64471-fa73-4121-83c4-484b71ff1f48'::uuid, 6032.23::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- Bisagra Inox 38X56mm 5 Tornillos: 6702.48 → 6032.23
    ('5ed41d2a-8fe5-4662-a05a-68c2a970b5de'::uuid, 219421.49::numeric, 'con el 10% de descuento del remito (total USD 5.298)'),  -- ANCLA 32KG GALVANIZADO DELTA: 243801.65 → 219421.49
    ('71ec8c50-d83c-42d9-81bf-8a9807bac315'::uuid, 101754.55::numeric, 'con el 5,29% de descuento del remito (total USD 135)'),  -- Compas magnetico S-53 (Brujula): 107438.02 → 101754.55
    ('e5fc7508-8841-46b4-8eb4-bbb53836a421'::uuid, 21003.94::numeric, 'con el 8,58% de descuento del remito del 43-30 (total USD 29)'),  -- Manijas 305mm Inoxidable: 22975.21 → 21003.94
    ('5a285086-f30f-4454-b7f1-e333b1b00787'::uuid, 21003.94::numeric, 'con el 8,58% de descuento del remito del 43-30 (total USD 29)'),  -- Manijas 305mm Inoxidable: 22975.21 → 21003.94
    ('8c5a683a-ef1d-46ae-a7f5-aba7a9d00809'::uuid, 5341.65::numeric, 'con el 8,58% de descuento del remito del 43-30 (total USD 29)'),  -- Bisagra - Five Oceans Inox 38x104mm 5 Tornill: 5842.98 → 5341.65
    ('31ed89d1-b8df-4b16-952a-26d753a33288'::uuid, 24260.57::numeric, 'con el 5,61% de descuento del remito del 55-2 (total USD 38)'),  -- Piston 27kg e 510mm c 305mm: 25702.48 → 24260.57
    ('4853f6e6-e564-4664-b07a-8e962f88cf96'::uuid, 56157.02::numeric, 'con el 10% de descuento del remito (total USD 504)'),  -- BOMBA ACHIQUE ELECT P/DUCHA 750GPH FIVE OCEAN: 62396.69 → 56157.02
    ('1688bd21-665f-4ff8-86b6-792762409225'::uuid, 47380.17::numeric, 'con el 10% de descuento del remito (total USD 504)'),  -- BOMBA ACHIQUE ELECT P/DUCHA SEAFLO 750GPH 12V: 52644.63 → 47380.17
    ('bd4d0019-8873-4c26-823f-02e182f993df'::uuid, 45000::numeric, 'con el 10% de descuento del remito (total USD 504)'),  -- Plafon Five oceans sumergible (Luz bajo agua): 50000 → 45000
    ('e2c01b4a-334b-41cf-92cd-8f1e3f29bc7e'::uuid, 39942.15::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- TAPA DE INSPECCIÓN RECTANGULAR: 44380.17 → 39942.15
    ('0dc04c99-f360-460d-830e-e4186b093034'::uuid, 24991.74::numeric, 'con el 10% de descuento del presupuesto'),  -- CAJA PORTA BATERIA 431X257X256: 27768.6 → 24991.74
    ('6002fad7-3cc5-4f5b-8fcc-9c8a321532c5'::uuid, 72148.76::numeric, 'con el 10% de descuento del presupuesto'),  -- Canilla OSCULATI frío calor cromada: 80165.29 → 72148.76
    ('f3dc0e8f-f6bb-4c3f-97bd-be04cbacf728'::uuid, 78842.98::numeric, 'con el 10% de descuento del presupuesto'),  -- TAPA TANQUE ATTWOOD C/VENTEO WTR RECT: 87603.31 → 78842.98
    ('121f2768-2ba1-4c2b-bd39-33d15e79adde'::uuid, 34512.4::numeric, 'con el 10% de descuento del presupuesto'),  -- Tapa de tanque combustible: 38347.11 → 34512.4
    ('70e6dfa9-e4a8-45a0-a979-368e8b967ab1'::uuid, 271487.6::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- levantapiso perko 75mm: 301652.89 → 271487.6
    ('538e3d53-dbfd-43d0-a6fd-d9a173cdce80'::uuid, 6991.74::numeric, 'con el 10% de descuento del presupuesto'),  -- Rejilla obturable 4-3/4": 7768.6 → 6991.74
    ('a802ba82-5e0f-4ce8-905e-1d0deb42d4c3'::uuid, 6255.37::numeric, 'con el 10% de descuento del presupuesto'),  -- CALEFACTOR AUTOTERM ADAPT P/REJILLA D60 NEGRA: 6950.41 → 6255.37
    ('33ff4688-2e32-4097-b114-a2941b6c723e'::uuid, 16438.01::numeric, 'con el 10% de descuento del presupuesto'),  -- Rejillas obturables plástico negro 60mm: 18264.46 → 16438.01
    ('a8c5f7bd-2d46-4064-96ee-169cf7497ee1'::uuid, 11305.78::numeric, 'con el 10% de descuento del presupuesto'),  -- Rejillas orientables negro 60mm: 12561.98 → 11305.78
    ('093f297c-5097-41b5-8bc5-7ceaed7e4b0f'::uuid, 98181.82::numeric, 'con el 10% de descuento del presupuesto'),  -- Boton P/Cubierta (UP/DOWN) Inox Negro: 109090.91 → 98181.82
    ('1836d0ec-65aa-44d8-9afd-0ba5261805fd'::uuid, 98181.82::numeric, 'con el 10% de descuento del presupuesto'),  -- Boton P/Cubierta (Up/Down) Inox: 109090.91 → 98181.82
    ('a1121cfd-c327-427c-911c-9214dc098c49'::uuid, 54818.18::numeric, 'con el 10% de descuento del presupuesto'),  -- Giratorio gusano cadena 6-8mm: 60909.09 → 54818.18
    ('b596a1b7-cb8f-419a-aa86-edd36b6614ef'::uuid, 47603.3::numeric, 'con el 10% de descuento del presupuesto'),  -- Corte Termico 100 amp Lofrans: 52892.56 → 47603.3
    ('e6de7b73-e365-45de-9cf4-11e7994c6666'::uuid, 15991.74::numeric, 'con el 10% de descuento del presupuesto'),  -- Rejilla - Bronce - Perko 330DP2CHR (3 1/4") C: 17768.6 → 15991.74
    ('a846d32f-8d7b-4027-b118-730ae91fe89b'::uuid, 6032.23::numeric, 'con el 10% de descuento del presupuesto'),  -- Bisagra grande perno arriba: 6702.48 → 6032.23
    ('4df7cd7a-af59-427f-81f4-a4936320cae8'::uuid, 6619.83::numeric, 'con el 10% de descuento del presupuesto'),  -- Bisagra  Inox 30x80mm 6 Tornillos: 7355.37 → 6619.83
    ('46c7f881-9c1b-4cd7-a55e-f948b0dd8fb3'::uuid, 2610.75::numeric, 'con el 10% de descuento del presupuesto'),  -- Punto fijo 6mm 4 agujeros: 2900.83 → 2610.75
    ('edf25c85-77f6-401c-a85a-a51ecb86848f'::uuid, 2610.75::numeric, 'con el 10% de descuento del presupuesto'),  -- CANCAMO RECTANGULAR 4 TORNILLOS B10155: 2900.83 → 2610.75
    ('049c831d-5b5e-4ae6-98ab-4fcaa270d378'::uuid, 1695.87::numeric, 'con el 10% de descuento del presupuesto'),  -- Grillete inoxidable largo - D06mm (1/4") G200: 1884.3 → 1695.87
    ('da577461-95d5-4a1f-8421-f08ee99bf47c'::uuid, 2692.57::numeric, 'con el 10% de descuento del presupuesto'),  -- Grillete omega 8mm: 2991.74 → 2692.57
    ('878c1413-0c46-4233-94f5-92f1a92f49b1'::uuid, 2692.57::numeric, 'con el 10% de descuento del presupuesto'),  -- Grillete inoxidable largo - D08mm (5/16") G20: 2991.74 → 2692.57
    ('cbbe4288-ffc5-419e-8cd7-03a011dc44e6'::uuid, 7073.55::numeric, 'con el 10% de descuento del presupuesto'),  -- Levantapiso Embutir Redondo D=55mm Cromado: 7859.5 → 7073.55
    ('4b851fb1-91bc-4eb5-a666-543c2b7282d6'::uuid, 10859.51::numeric, 'con el 10% de descuento del presupuesto'),  -- Cierre Traba Ventana Corrediza 75mm: 12066.12 → 10859.51
    ('e7da95b5-b717-47fa-b8fc-1261f3d284b5'::uuid, 690.99::numeric, 'con el 10% de descuento del presupuesto'),  -- Omega Inoxidable Inox Barra D05mm: 767.77 → 690.99
    ('056e05a4-da96-4275-b8c7-6e72ac4a8989'::uuid, 3324.79::numeric, 'con el 10% de descuento del presupuesto'),  -- ACCESORIO DE FIJACIÓN EN L PARA RESORTE HIDRA: 3694.21 → 3324.79
    ('2fe41fc1-3e12-4995-9038-d7dbdcf8d5f7'::uuid, 3161.16::numeric, 'con el 10% de descuento del presupuesto'),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 3512.4 → 3161.16
    ('71a8d416-07e5-4161-a9bb-0b66770ba3c1'::uuid, 3161.16::numeric, 'con el 10% de descuento del presupuesto'),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 3512.4 → 3161.16
    ('8436934b-8b02-4840-82f8-b7c71633ced6'::uuid, 2543.8::numeric, 'con el 10% de descuento del presupuesto'),  -- Sapito Inox (15x55x50x0.6mm): 2826.45 → 2543.8
    ('7da8b6bb-3214-4f54-b924-7892abc8a976'::uuid, 44925.62::numeric, 'con el 10% de descuento del presupuesto'),  -- Cierre - Perko - Perko 932DP2 C/U: 49917.36 → 44925.62
    ('6441a555-cf51-4812-b945-81752fec0d56'::uuid, 1487.6::numeric, 'con el 10% de descuento del presupuesto'),  -- CABO RETORCIDO BLANCO 12MM: 1652.89 → 1487.6
    ('8ff36dd8-6845-4417-81bb-ba5ca363ed9f'::uuid, 13611.57::numeric, 'con el 10% de descuento del presupuesto'),  -- Cabo Bola - Puño de mono 10 mm: 15123.97 → 13611.57
    ('a652ce23-23ab-4d2b-bb9b-5c1ee04975e0'::uuid, 1227.28::numeric, 'con el 10% de descuento del presupuesto'),  -- ESLABON UNION FIVE GALVANIZADO D=06mm 5-O: 1363.64 → 1227.28
    ('eea56faa-2492-4021-b8ca-9b616b00f1f9'::uuid, 90743.81::numeric, 'con el 10% de descuento del presupuesto'),  -- AISLANTE COMPOSITE CHICA 122x61x3 PLACA ANTI-: 100826.45 → 90743.81
    ('8da7f0b3-ccc6-4d91-8413-95fc0657856e'::uuid, 104876.04::numeric, 'con el 10% de descuento del presupuesto'),  -- Ancla Delta 16kg galvanizada: 116528.93 → 104876.04
    ('3bd2c92f-ebf0-45b7-bf29-4453ead2a2f2'::uuid, 3666.94::numeric, 'con el 10% de descuento del presupuesto'),  -- Cadena 6mm calibrada galvanizada: 4074.38 → 3666.94
    ('63a9dbe0-ec76-4d87-9b3f-5be3e3a48440'::uuid, 34586.78::numeric, 'con el 10% de descuento del presupuesto'),  -- DEFENSA INFLABLE MA BLANCA 21 X 62 CM: 38429.75 → 34586.78
    ('e8955561-3c8c-4398-858f-64abe7803b1d'::uuid, 3957.02::numeric, 'con el 10% de descuento del presupuesto'),  -- CABO DACRON FIVE OC SOLID BLACK 16MM: 4396.69 → 3957.02
    ('1d44bfda-5a42-4bda-8526-361cdf93de31'::uuid, 132396.7::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- ESCALERA INOX S/PLAT 3ESC DESLI 5O: 147107.44 → 132396.7
    ('04038321-587a-43e3-ad0c-ee368572be71'::uuid, 71107.43::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Tapa estanco plastica - 60.5 x 35.0: 79008.26 → 71107.43
    ('aa9b34e5-bb26-4b3c-af57-b8baedcdd700'::uuid, 39942.15::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- TAPA ESTANCO PLASTI 27.0x37.5cm CON LLAVE: 44380.17 → 39942.15
    ('d788e0f1-69ad-499b-a107-b9abe4193fab'::uuid, 907438.01::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- TERMOTANQUE KUUMA 06 GALONES 240V: 1008264.46 → 907438.01
    ('122c0113-ca36-43e6-af9d-a2f0bd09ef69'::uuid, 90743.81::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- AISLANTE COMPOSITE CHICA 122x61x3 PLACA ANTI-: 100826.45 → 90743.81
    ('7949f24c-137d-4afd-adc1-b674d72cf764'::uuid, 3666.94::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Cadena 6mm calibrada galvanizada: 4074.38 → 3666.94
    ('f191770c-d9e9-496a-b0a7-82d6e38e1dcb'::uuid, 34586.78::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- DEFENSA INFLABLE MA BLANCA 21 X 62 CM: 38429.75 → 34586.78
    ('2e0dcb4c-166a-4e2f-8da0-4d444389202b'::uuid, 24991.74::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- CAJA PORTA BATERIA 431X257X256: 27768.6 → 24991.74
    ('18ff9105-d9c4-44cb-9bde-662701d59ddf'::uuid, 72148.76::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Canilla OSCULATI frío calor cromada: 80165.29 → 72148.76
    ('c8fda388-10d1-4ac1-b4ff-9248a1e53ef7'::uuid, 87768.59::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- KIT DUCHADOR NR 120x210x65mm: 97520.66 → 87768.59
    ('4577c990-5ce2-46b8-95ad-ed4833b25658'::uuid, 7661.16::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Rejilla obturable 4-3/4": 8512.4 → 7661.16
    ('9a7285fa-451f-43d6-8ce3-61021dad847f'::uuid, 34512.4::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Tapa de tanque combustible: 38347.11 → 34512.4
    ('013ccaf8-fcf3-4a51-b8b7-1b1dc0518403'::uuid, 98181.82::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Boton P/Cubierta (Up/Down) Inox: 109090.91 → 98181.82
    ('f49f87db-2563-498a-89cc-cd118711707c'::uuid, 98181.82::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Boton P/Cubierta (UP/DOWN) Inox Negro: 109090.91 → 98181.82
    ('79191155-f97d-40b9-a0d9-a76dd1a1c37e'::uuid, 3890.08::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Rejillas Plastico Seaflo D76x92 Blanca: 4322.31 → 3890.08
    ('f97eb777-74a0-4dfd-8349-fb9524a305d7'::uuid, 7809.92::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Posavasos inox: 8677.69 → 7809.92
    ('8f721fac-d87d-4c19-b85c-a06f964b5f0c'::uuid, 11008.26::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- VALVULA ANTIRETORNO 3/4 A 1``: 12231.4 → 11008.26
    ('e90c631d-e75a-4493-b2a2-3186405d2d53'::uuid, 86280.99::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- LUZ BANDA ATTWOOD INOX C/LEDS: 95867.77 → 86280.99
    ('06dbef8d-84c0-4be1-ac58-45d05c9c279c'::uuid, 1814.88::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Sapito Inox (12x44x40x0.6mm): 2016.53 → 1814.88
    ('0aa5f706-7dff-48ee-b4a2-c22313b690b5'::uuid, 31165.29::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Levantapiso redondo con traba: 34628.1 → 31165.29
    ('06f317ea-df79-4ac7-a79a-f7e91c83919c'::uuid, 10859.51::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Cierre Traba Ventana Corrediza 75mm: 12066.12 → 10859.51
    ('c404ed48-d1d6-480c-a897-b7d693c7716b'::uuid, 16809.92::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- LUZ FONDEO BASE PLANA LED: 18677.69 → 16809.92
    ('da5bea09-4150-4d04-a02e-58a718f79f77'::uuid, 54818.18::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Giratorio gusano cadena 6-8mm: 60909.09 → 54818.18
    ('ac57877b-24ed-4388-ba96-b68bea765b17'::uuid, 47603.3::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Corte Termico 100 amp Lofrans: 52892.56 → 47603.3
    ('d694ee4e-85cd-4282-bcaa-16bc23500ceb'::uuid, 58314.05::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- BOCINA ELECT INOX SIMPLE 5-O 405: 64793.39 → 58314.05
    ('28bdcef5-7395-49cd-9572-e0964b676967'::uuid, 5890.91::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- ENCHUFE 5-O ENCENDEDOR C/TAPA: 6545.45 → 5890.91
    ('9873c71f-6fdf-41fd-8925-21224cf384b3'::uuid, 25512.4::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- LUZ POPA C/LED INOX: 28347.11 → 25512.4
    ('436f7d04-67e4-475c-b5d9-736d64f6934b'::uuid, 25512.4::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Levantapisos exterior: 28347.11 → 25512.4
    ('6ee907df-1365-4c37-9169-8ad2a84cdad3'::uuid, 1695.87::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Grillete inoxidable largo - D06mm (1/4") G200: 1884.3 → 1695.87
    ('87b49709-ecbc-4c33-9f22-4e9cb1f0588c'::uuid, 2692.57::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Grillete omega 8mm: 2991.74 → 2692.57
    ('51b97250-28f8-40f4-8129-8849498bd72b'::uuid, 2692.57::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Grillete inoxidable largo - D08mm (5/16") G20: 2991.74 → 2692.57
    ('85a0bd8f-fa3a-48eb-8be1-5da5b61f1c9c'::uuid, 3302.48::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 3669.42 → 3302.48
    ('54b0a302-ff6d-4eb3-a895-54a99afca248'::uuid, 3131.41::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO: 3479.34 → 3131.41
    ('03d770f5-1fba-457e-a9e3-deeb13d36f07'::uuid, 6619.83::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Bisagra  Inox 30x80mm 6 Tornillos: 7355.37 → 6619.83
    ('e03e8011-10e5-4b66-bea2-85a234caabc1'::uuid, 3830.58::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Bisagra Inox 48X30mm PERNO ARRIBA 6 Tornillos: 4256.2 → 3830.58
    ('3dbbf530-08b5-471e-b455-e3a947f3d81b'::uuid, 10338.84::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Conector ANTENA Union Corta (YC1102): 11487.6 → 10338.84
    ('07464e33-7ec4-4730-84d6-fdd204037504'::uuid, 7073.55::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Levantapiso Embutir Redondo D=55mm Cromado: 7859.5 → 7073.55
    ('15e677cd-1e0a-462f-9e29-6eca953d7d31'::uuid, 3317.36::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- CANCAMO 80X50MM 4 TORNILLOS B10121: 3685.95 → 3317.36
    ('7829a3c5-dcf2-42e3-9ed6-abf3a1d8836f'::uuid, 5496.7::numeric, 'con el 10% de descuento del remito (total USD 3.319)'),  -- Bisagra Inox 70X38.5mm Perno abajo 4 Tornillo: 6107.44 → 5496.7
    ('2c979c23-3fd7-4dc3-85a3-e33683731ab0'::uuid, 3458.68::numeric, 'con el 10% de descuento del remito (total USD 3.319)')   -- Conector Antena Macho P/VHF P/RG58 (YC101): 3842.98 → 3458.68
  ) as nuevo(id, precio, nota)
 where p.id = nuevo.id
   and p.fuente not like '%descuento del%';

-- ─── 2. Remito del 52-26: renglones en el ítem correcto ─────────────────────
update public.panol_materiales
   set descripcion = 'CABO DACRON FIVE OC SOLID BLACK 8MM'
 where id = 'f1299d11-f00d-4344-8364-bd34577755fe'
   and descripcion = 'CABO DACRON FIVE OC SOLID BLACK 6MM';

delete from public.panol_precios
 where id = '44e7b982-adc3-4849-b7de-fa3e023ecdaf'   -- Inodoro con bidet SEAFLO Sfmte1-07: referencia de otras obras
   and proveedor is null;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', nuevo.fuente
  from (values
    ('a480d9c4-782b-4797-a3b1-add592ac95f0'::uuid, 290826.45::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · K01536 KIT WHALE FRIO-CALOR 2.5 MTS · con IVA era 391.000 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),  -- Duchador frio calor WHALE Twist K01536
    ('357e9ba0-a9e6-4820-a4f9-2315e40e48bc'::uuid, 684297.52::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · I14388 INODORO NAUTICO ELECT OVAL C/BIDET SILENC · con IVA era 920.000 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),  -- Inodoro con bidet SEAFLO Sfmte1-07 12v
    ('87101f58-3cc5-4f40-a64f-200505aacee5'::uuid, 5585.95::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · P23025 PASACABLE RECTO FIVE OCEANS D=06mm · con IVA era 7.510 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),  -- Pasa cable - Recto D=06mm
    ('f1299d11-f00d-4344-8364-bd34577755fe'::uuid, 900::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · C57229 CABO DACRON FIVE OC SOLID BLACK D08mm · con IVA era 1.210 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),  -- CABO DACRON FIVE OC SOLID BLACK 6MM
    ('b2830c16-2f31-4bb0-9b7e-60368c734e8b'::uuid, 49090.91::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · C89393 CALEFACTOR AUTOTERM REJILLA D90 OBT C/ADAPT · con IVA era 66.000 · sin IVA · con el 10% de descuento del remito (total USD 5.298)'),  -- Rejilla D90 Obturable Negra - Calefactor Autoterm
    ('d98179e7-c15c-4c02-bb97-187c72a2f428'::uuid, 11305.79::numeric, 'Remito valorizado Baron 10/09/2026 (obra 52-26) · C89943 CALEFACTOR AUTOTERM REJILLA D60 ORIENT NEGRA · con IVA era 15.200 · sin IVA · con el 10% de descuento del remito (total USD 5.298)')   -- Rejilla D60 Orientable Negra - Calefactor Autoterm
  ) as nuevo(material_id, precio, fuente)
 where not exists (
   select 1 from public.panol_precios p
    where p.material_id = nuevo.material_id and p.proveedor = 'Baron' and p.fecha = '2026-09-10'
 );

-- ─── 3. La copia de la ficha, al día con el historial ───────────────────────
-- Igual que en la 20260922190000: sólo los materiales que tocó esta migración.
update public.panol_materiales material
   set precio_unitario = ultimo.precio_unitario,
       moneda = ultimo.moneda
  from (
    select distinct on (material_id) material_id, precio_unitario, moneda
      from public.panol_precios
     where precio_unitario is not null
     order by material_id, fecha desc nulls last, created_at desc
  ) ultimo
 where ultimo.material_id = material.id
   and material.id in (
     select material_id from public.panol_precios where fuente like '%descuento del%'
   )
   and (material.precio_unitario is distinct from ultimo.precio_unitario
        or coalesce(material.moneda, 'ARS') is distinct from coalesce(ultimo.moneda, 'ARS'));

commit;
