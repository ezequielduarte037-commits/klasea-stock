-- Segunda tanda de precios del K52.
--
-- Tres fuentes, en este orden de preferencia:
--   1. Listas de otras obras: el mismo material ya tenía precio en otro
--      barco. Varios coinciden en tres barcos distintos, que es la mejor
--      señal de que el número es el que se paga.
--   2. Presupuestos de proveedor ya cargados (la bocina Marinco de Flojumar).
--   3. Referencia web, con proveedor "Referencia web" para que se lea
--      distinto de una cotización. Los de dólares son listas de EE.UU. o
--      Europa: NO incluyen flete ni gastos de importación, así que en
--      Argentina el equipo sale más. Los de pesos son precios de góndola
--      con IVA y van divididos por 1,21, como todo en la base.
--
-- Dos materiales están repetidos en la matriz del K52 (el monocomando de
-- cocina 0411.04 y el toallero 0164, cada uno también como "· CROMADO").
-- Se cotiza uno solo de cada par: el otro hay que marcarlo como incluido o
-- sacarlo de la matriz, si no el barco lo paga dos veces.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('0ca36882-c0d6-46b5-b0d0-e9bbedae7164', 30000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Lista de la obra 52-23 · IVA sin confirmar, cargado tal cual'),  -- Luces cuadradas techo blanco calido
  ('9821b887-9f3c-447e-b161-e19e3b54c053', 2662, 'USD', '2026-09-23', 'Lista de obra', null, 'Lista de la obra 37-40'),  -- Fabricadora de hielo
  ('f59d1862-9828-4a20-9f16-aa636e431d54', 301652.89, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito Baron 02/09 (C42005 cierre Perko s/llave 75mm), aplicado en la obra H-175 · con IVA era 365.000 · sin IVA'),  -- levantapiso perko 75mm
  ('1be5810e-0c5c-4f85-902b-b45d51ff8ebb', 26.68, 'USD', '2026-09-23', 'Lista de obra', null, 'Listas de las obras 37-39, 37-40 y 37-41 (mismo precio en las tres)'),  -- Brida 120mm ext x 50mm int, chapa 3/8" inox 316
  ('a320d678-ae28-4c52-9386-79a6f011e16e', 276640, 'ARS', '2026-09-23', 'Aceros Fitzner', 'dca97f48-7e22-46d7-b552-d5e0ff13d483', 'Listas de las obras 52-25, 55-3 y 55-4 (mismo precio en las tres) · IVA sin confirmar, cargado tal cual'),  -- Caño schedule 80, 3 1/2" nominal, L = 285 mm Inox 
  ('2e94aa22-fe15-46b5-a546-f15690305955', 4887.45, 'ARS', '2026-08-25', 'Casa Iriarte', '39d9cb3e-9c99-473d-9908-7cb3d5e63b9e', 'Presupuesto Casa Iriarte 33116 (CODO HEMBRA HEMBRA 1/2 FUNDIDO), usado en 37-39/40/41'),  -- CODO HH 1/2
  ('e622a42d-03f6-47b8-af8b-ffcdce2df700', 130, 'USD', '2026-09-23', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Listas de las obras 37-39, 37-40 y 37-42 (mismo precio en las tres)'),  -- Corte 230x350mm chapa 1/2" 316 inox.
  ('46dcd31e-2d2c-4fef-b822-2095856b39ba', 255000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Lista de la obra 55-2 · IVA sin confirmar, cargado tal cual'),  -- Bacha cocina acero Inox. Negra Hausar 60 x 45 BP-C
  ('357e9ba0-a9e6-4820-a4f9-2315e40e48bc', 906000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Listas de las obras H-175 y 37-41 · IVA sin confirmar, cargado tal cual'),  -- Inodoro con bidet SEAFLO Sfmte1-07 12v
  ('fb26bbe0-e1a0-4a2e-b0ea-815715860597', 351446.28, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005534 04/09 (BOCINA DOBLE 12V ELECTRICA TROMPETA MARINCO) · con IVA era 425.250 · sin IVA'),  -- Bocina Marinco doble INOX electrica 12v
  ('3e09b5e5-b8e0-43dc-addb-84e84a5b73b9', 3881.64, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Side-Power SE80/185T-12V, precio de venta EE.UU. (rango 3.882-4.694) · 2026-09-23'),  -- Bowthruster 96Kg 12v SE80
  ('146c111a-ea7a-4795-932d-0495ff74d284', 3881.64, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Side-Power SE80/185T-12V, precio de venta EE.UU. (rango 3.882-4.694) · 2026-09-23'),  -- Sternthruster 96kg 12v
  ('910a60e0-61a0-458f-988e-758798199eb0', 580.5, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Side-Power túnel de popa compuesto 185mm (SM90052i), venta EE.UU. (lista 645) · 2026-09-23'),  -- Tunel Stern 185mm
  ('4e3ccdd5-91e1-4269-a0e5-438d2307daa3', 1824, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Maxwell RC8-8 12V 1000W cadena 8mm, BOE Marine (rango 1.654-2.305) · 2026-09-23'),  -- MALACATE 1000W CAD 8MM MAXWELL
  ('114634e7-f49b-4509-a876-a7b3b08d2d35', 1163.7, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Vitrifrigo D30A, precio de venta (lista 1.293) · 2026-09-23'),  -- Heladera cajon Vitrifrigo D30A
  ('1299d8bc-76d1-49cb-a670-fa8b21f52839', 245, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Airmar P319 50/200kHz, P2 Marine · 2026-09-23'),  -- ECOSONDA P319
  ('ec117514-7f5f-42e8-8cb8-e32533e9a05b', 13730, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Opacmare 5220 800kg 24V inox, precio de venta (lista 17.163) · 2026-09-23'),  -- Tender lift OPACMARE OPACMARE 5220_90_09
  ('39e6dbda-c7b5-428d-ac8f-e39ad762151e', 898, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Lista oficial PSS 2026, sello tipo A eje 2½" tubo 3½" · 2026-09-23'),  -- Sello PSS para eje 2 1/2", tubo 3 1/2"
  ('d553e65c-1370-4101-a848-e71d52f864e5', 75.53, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Rule 37A SuperSwitch, Fisheries Supply · 2026-09-23'),  -- Switch automático Rule 37A P/Bomba de achique (Roj
  ('3542b7d9-0271-479a-89fe-e0cfd774d83a', 70.49, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Jabsco 44411-2045 cromado 45psi (lista 86,61) · 2026-09-23'),  -- Regulador de presion cromado jabsco
  ('279aa38d-e417-4176-a759-d0305626001b', 1775, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Webasto FCF Classic 12000 BTU 230V, Flagship Marine (lista 2.816) · 2026-09-23'),  -- AIRE ACONDICIONADO 12000 FCF12 COMUN
  ('589ba7bb-da68-4c38-a128-4f5248f1b2e4', 1129, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Victron MultiPlus 12/2000/80-32 230V, €1.045 en Europa (≈ USD 1.129; en EE.UU. figura USD 2.607) · 2026-09-23'),  -- INVER/CARG.MUL.2000W,12V-80A
  ('4252bbcd-315f-4a58-a310-a3bcf66ddb29', 82.04, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Maxwell P102938 control up/down, Fisheries Supply · 2026-09-23'),  -- Control Malacate MAXWELL P102938
  ('c78ef8fb-f67f-423b-b667-3fa426fa4c6e', 205, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Bomba de agua de mar para aire acondicionado 500 GPH 230V: equivalentes SeaFlo/KoolAir USD 200-210 (la March no publica precio) · 2026-09-23'),  -- Bomba aire acondicionado 220v 500gph
  ('e596e2bf-99b4-43c7-941b-74217faf330b', 452464.46, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0411.04/L2 cromo, Materiales Nuciari (rango 547.482-648.750) · con IVA era 547.482 · sin IVA · 2026-09-23'),  -- Epuyén Juego monocomando para mesada de cocina 041
  ('02646402-69fa-4d8a-8db8-8c621473630d', 486180.99, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0106/L2-CR, Cortes · con IVA era 588.279 · sin IVA · 2026-09-23'),  -- Juego monocomando para bañera y ducha Epuyén 0106/
  ('d3a7e58e-7f9a-4568-b70e-281cb1665fbd', 220785.12, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0206/L2-CR, Grupo Anacleto (la misma tienda lo da sin IVA: 220.785,12) · con IVA era 267.150 · sin IVA · 2026-09-23'),  -- Juego monocomando para lavatorio Epuyén 0206/L2
  ('8eecd0a2-01c2-4f9d-b192-ab74d0769acc', 41585.95, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0167/L2 portarrollo, retail (rango 50.319-55.350) · con IVA era 50.319 · sin IVA · 2026-09-23'),  -- Portarrollo Epuyén 0167/L2
  ('b321889e-ec8c-460f-b325-9a14cce2e24c', 64528.1, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0164/L2 toallero barral recto, retail (rango 78.079-85.887) · con IVA era 78.079 · sin IVA · 2026-09-23'),  -- TOALLERO BARRAL LARGO EPUYEN 0164/L2
  ('09ff32da-b4ea-41b1-a229-bccbc402b29a', 56507.44, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0163/L2 toallero barral corto, retail · con IVA era 68.374 · sin IVA · 2026-09-23'),  -- Toallero Epuyén 0163/L2
  ('08151045-25ca-458b-8cbd-21b4f3110163', 26895.87, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV Epuyén 0166/L2 percha, retail · con IVA era 32.544 · sin IVA · 2026-09-23'),  -- Percha Epuyén 0166/L2
  ('d5bcec53-d88f-43d9-98e5-8e2e9a8882bc', 45144.63, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · FV 0248.01 desagüe soft touch cromo, Broncesur (rango 41.343-77.500) · con IVA era 54.625 · sin IVA · 2026-09-23'),  -- SOPAPA DESAGUE SOFT TOUCH 0248.01
  ('94bed1a6-75c6-4d5d-87d1-22fcc48b565e', 1610.74, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-10/2 (10mm², agujero 6,5mm), Electro Misiones · con IVA era 1.949 · sin IVA · 2026-09-23'),  -- Terminal de cobre 10 mm diámetro 6
  ('3c8fc4c2-96c1-4af2-9d71-6d633caabc00', 2034.71, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-16/3 (16mm², agujero 10mm), Electro Misiones · con IVA era 2.462 · sin IVA · 2026-09-23'),  -- Terminal de cobre 16 mm diámetro 3/8
  ('1238f47f-3074-44d4-9a31-b085dcdcedd3', 1913.22, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-16 (16mm², agujero 8mm), Electro Misiones · con IVA era 2.315 · sin IVA · 2026-09-23'),  -- Terminal de cobre 16 mm diámetro 5/16
  ('c3b6d3d2-0ece-4695-9cdf-ef48a7fb2c3b', 2692.56, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-25/4 (25mm², agujero 13mm), Electro Misiones · con IVA era 3.258 · sin IVA · 2026-09-23'),  -- Terminal de cobre 25 mm diámetro 1/2
  ('1bd2fe66-825b-4187-b7e1-97c20ec24ca8', 2120.66, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-25/3 (25mm², agujero 10mm), Electro Misiones · con IVA era 2.566 · sin IVA · 2026-09-23'),  -- Terminal de cobre 25 mm diámetro 3/8
  ('11a80a05-687a-4d74-b818-5dba98a5c6f8', 3738.84, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-35/3 (35mm², agujero 13mm), Electro Misiones · con IVA era 4.524 · sin IVA · 2026-09-23'),  -- Terminal de cobre 35 mm diámetro 1/2
  ('39f6713c-ff87-469e-9bfc-9d0e06e3af4b', 3328.93, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-35/2 (35mm², agujero 10mm), Electro Misiones · con IVA era 4.028 · sin IVA · 2026-09-23'),  -- Terminal de cobre 35 mm diámetro 3/8
  ('eb383121-6300-4745-a2a6-233b8e40c6ba', 4452.07, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-50/3 (50mm², agujero 13mm), Electro Misiones · con IVA era 5.387 · sin IVA · 2026-09-23'),  -- Terminal de cobre 50 mm diámetro 1/2
  ('f04b3f8e-ff74-4a10-8a6c-dd9d3eb4b204', 4095.04, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-50/2 (50mm², agujero 10mm), Electro Misiones · con IVA era 4.955 · sin IVA · 2026-09-23'),  -- Terminal de cobre 50 mm diámetro 3/8
  ('6df07c17-e793-4e2b-a536-1b3738438540', 6377.69, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC-70/2 (70mm², agujero 13mm; el de 3/8 no figura), Electro Misiones · con IVA era 7.717 · sin IVA · 2026-09-23'),  -- Terminal de cobre 70 mm diámetro 3/8
  ('2e533249-dd3a-4a75-8bde-b9ab7347469b', 8314.88, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · LCT SCC95/1 (95mm², agujero 13mm; el de 3/8 no figura), Electro Misiones · con IVA era 10.061 · sin IVA · 2026-09-23'),  -- Terminal de cobre 95 mm diámetro 3/8
  ('c7cceea3-1375-4dcb-9b32-cc6d0324e78f', 322.93, 'ARS', '2026-08-27', 'Electro 2001', null, 'Presupuesto Electro 2001 P 0001-00144364: precio del 1x1 en otro color (el calibre cuesta igual en todos)'),  -- Cable 1x1 amarillo
  ('14463a57-4288-49c9-93fd-5d921b9f7dc9', 322.93, 'ARS', '2026-08-27', 'Electro 2001', null, 'Presupuesto Electro 2001 P 0001-00144364: precio del 1x1 en otro color (el calibre cuesta igual en todos)'),  -- Cable 1x1 gris
  ('da28b375-131c-49c6-8984-e45d505230e2', 322.93, 'ARS', '2026-08-27', 'Electro 2001', null, 'Presupuesto Electro 2001 P 0001-00144364: precio del 1x1 en otro color (el calibre cuesta igual en todos)');  -- Cable 1x1 violeta

commit;
