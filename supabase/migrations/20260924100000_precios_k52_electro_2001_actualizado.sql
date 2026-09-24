-- Presupuesto actualizado de Electro 2001 para la eléctrica del K52.
--
-- P 0001-00146184 del 23/09/2026, a Hunter Yachts, en pesos y SIN IVA (el IVA
-- va aparte al pie). Cotiza la lista eléctrica del K52 con sus cantidades.
--
-- · 53 precios de Electro 2001, uno por renglón cotizado.
-- · Los 7 renglones con "*" a $0,185 son cosas que Electro 2001 no vende (bases
--   omega, cable 1x1 amarillo, fusibles caramelo, terminales para estañar):
--   esas siguen con el precio que tenían.
-- · Los precintos van por bolsa de 100: la matriz dice 20, 15 y 15 y el
--   presupuesto 2000, 1500 y 1500 unidades. Así el total da igual al papel.
-- · Se borran 34 precios de referencia sin proveedor del 23/09 de esos
--   mismos materiales (webs como Electro Misiones, Paternal o Fisheries): tienen
--   la misma fecha que el presupuesto y podían quedar adelante. Se borran por id.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('d388dfe8-9e67-4e56-88c6-6d2a46532268', 58176.99, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 1: R75D Base NH T03 1x 630A, Chint RT36-3 · sin IVA'),  -- BASE PORTA FUSIBLE NH 500A
  ('fa9e38c0-6eeb-4219-a018-67a9a5a2c5d1', 7362.02, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 2: R75A Base NH T00 1x 160A, Chint RT36-00 · sin IVA'),  -- BASE PORTA FUSIBLE NH-00 160
  ('111df4b4-cc26-4701-8569-7cdd0805cb09', 3236.26, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 5: E378 Bornera 2x 25A 4,76 mm baquelita, TEA T2-25 · sin IVA'),  -- BORNERA · T2 25A
  ('67da918f-7795-4475-9019-6a7df6281061', 4485.34, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 6: E379 Bornera 2x 60A 6,35 mm baquelita, TEA T2-60 (la matriz dice 50A) · sin IVA'),  -- BORNERA · T2 50A
  ('2b5133b1-f6a0-4ec4-b46e-9366774a3550', 7409.33, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 7: E380 Bornera 2x 100A 8 mm baquelita, TEA T2-100 · sin IVA'),  -- BORNERA · T2 100A
  ('8fdb34dd-0aeb-4549-b6a1-462ac98209b3', 4286.63, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 8: B166 Bornera 3x 25A 4,76 mm baquelita, TEA T3-25 · sin IVA'),  -- BORNERA · T3 25A
  ('720989d1-307b-41ce-8b83-2d76c001bbb0', 22720.06, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 9: E436 Bornera TE 10 bornes 50A, TEA TL10-50 · sin IVA'),  -- BORNERA tipo telefónica 10x50
  ('4389f3b4-4c88-4876-877c-868f61e27e0d', 290.11, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 10: UQ47 Cable electrónica 1x0,50 amarillo extraflexible, Feplast 17004 · sin IVA'),  -- Cable 1x0,50 amarillo
  ('c3a5806b-1bd6-4076-ac80-820238720d57', 290.11, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 11: 6JOR Cable electrónica 1x0,50 negro extraflexible, Feplast 17004 · sin IVA'),  -- Cable 1x0,50 negro
  ('fcacc636-44bb-44c3-9c80-5d2383280656', 290.11, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 12: EZ76 Cable electrónica 1x0,50 rojo extraflexible, Feplast 17004 · sin IVA'),  -- Cable 1x0,50 rojo
  ('61b81276-132b-4e03-a5fe-cbd846534a8f', 329.67, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 13: UQ65 Cable electrónica 1x0,75 amarillo extraflexible, Feplast 17005 · sin IVA'),  -- Cable 1x0,75 amarillo
  ('14f56f37-8596-4b28-a128-f54d146d2968', 329.67, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 14: UQ39 Cable electrónica 1x0,75 blanco extraflexible, Feplast 17005 · sin IVA'),  -- Cable 1x0,75 blanco
  ('56148b65-2748-43ce-afef-7cb430418fa9', 329.67, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 15: UQ42 Cable electrónica 1x0,75 naranja extraflexible, Feplast 17005 · sin IVA'),  -- Cable 1x0,75 naranja
  ('e57d0b12-437b-40f4-ade6-5cf2213af221', 329.67, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 16: 6JOS Cable electrónica 1x0,75 negro extraflexible, Feplast 17005 · sin IVA'),  -- Cable 1x0,75 negro
  ('136ad371-70db-4268-9a76-f1f99f7cda30', 329.67, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 17: UQ38 Cable electrónica 1x0,75 rojo extraflexible, Feplast 17005 · sin IVA'),  -- Cable 1x0,75 rojo
  ('14463a57-4288-49c9-93fd-5d921b9f7dc9', 402.2, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 19: QZ00 Cable normalizado 1x1 mm² gris, Feplast 17006 · sin IVA'),  -- Cable 1x1 gris
  ('9e691a1c-1ca3-4c83-a43a-2de0b7507e11', 322.93, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 20: SD85 Cable normalizado 1x1 mm² negro UF-CAT5, MH 103 · sin IVA'),  -- Cable 1x1 negro
  ('da28b375-131c-49c6-8984-e45d505230e2', 402.2, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 21: QZ03 Cable normalizado 1x1 mm² violeta, Feplast 17006 · sin IVA'),  -- Cable 1x1 violeta
  ('4547dfc7-1056-4148-b7eb-0ddefbee2e7c', 452.1, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 22: G701 Cable normalizado 1x1,5 mm² marrón UF-CAT5, MH 104 · sin IVA'),  -- Cable 1x1,5 marron
  ('8a10200e-47c0-4173-a112-de255de16685', 452.1, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 23: G699 Cable normalizado 1x1,5 mm² celeste UF-CAT5, MH 104 · sin IVA'),  -- Cable 1x1,5 azul
  ('adbada2a-ba35-437b-8194-951e74e4ded6', 37523.58, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 24: W3VP Contactor 3x18A 1NA bobina 220 Vca, ABB AX18-30-10-80 · sin IVA'),  -- Contactor tripolar 3x18A bobina 220V 1NA SK118A10M
  ('b2eb71d3-9eef-4e89-8db2-b5dcca4b35f0', 304.16, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 25: Y214 Terminal preaislado unión 2,5-6 mm² amarillo, LCDLT C14 · sin IVA'),  -- Empalme preaislado amarillo 6 mm
  ('aa05e60e-0bef-440e-a86a-81441849d180', 135.58, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 26: Y196 Terminal preaislado unión 1-2,5 mm² azul, LCDLT B16 · sin IVA'),  -- Empalme preaislado azul 2,5 mm
  ('f9204a66-e0d4-4459-bf3b-940a432e0a65', 5507.32, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 29: R73Y Cartucho fusible NH T00 100A gL-gG, Chint · sin IVA'),  -- FUSIBLE NH · 100A
  ('0d91ef6d-d125-4309-8e8e-56ccee5a96e0', 5507.32, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 30: R74A Cartucho fusible NH T00 160A gL-gG, Chint · sin IVA'),  -- FUSIBLE NH · 160A
  ('a4a76896-a036-486e-bfaf-ca284f058fa6', 28956.01, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 31: R74T Cartucho fusible NH T03 500A gL-gG, Chint · sin IVA'),  -- FUSIBLE NH · 500A
  ('d2699f54-1b84-4fb9-b58e-a523a1ef091f', 110427.16, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 32: Q241 Gabinete 330x465x180 puerta de cristal, Roker PRG 350/1 · sin IVA'),  -- Gabinete PVC Roker PRG 350-1 puerta de cristal (32
  ('7e31e916-53fb-45ab-a11d-a32d3b967c99', 1714.36, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 33: JD34 Plaqueta para precinto adhesiva 30x35 mm, Sybyd 2000/3TAD · sin IVA'),  -- Placa de montaje blanca Sybyd 30x35 mm
  ('659b782d-4fdc-4557-9d65-c7d60b55dfb4', 2049.63, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 34: JD12 Precinto 150 x 3,6 mm, Sybyd 2002 (Electro 2001 cotiza 2000) · precio de la bolsa de 100 (20,496 cada uno): la matriz cuenta los precintos de a 100 · sin IVA'),  -- Precinto 150 x 3,5 mm
  ('e89568d2-9686-4ac1-8ade-49cf9962fe5c', 4768.09, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 35: L784 Precinto 250 x 4,8 mm, Sybyd 2033 (Electro 2001 cotiza 1500) · precio de la bolsa de 100 (47,681 cada uno): la matriz cuenta los precintos de a 100 · sin IVA'),  -- Precinto 245 x 4,6 mm
  ('01a3d2a8-5f95-403b-a185-0b4ed49eb894', 5900.79, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 36: W375 Precinto 300 x 4,8 mm, Sybyd 2034 (Electro 2001 cotiza 1500) · precio de la bolsa de 100 (59,008 cada uno): la matriz cuenta los precintos de a 100 · sin IVA'),  -- Precinto 300 x 5 mm
  ('94bed1a6-75c6-4d5d-87d1-22fcc48b565e', 918.53, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 37: E930 Terminal de cobre 10 mm² ojal 6,4 mm, LCDLT SCC 10/2 · sin IVA'),  -- Terminal de cobre 10 mm diámetro 6
  ('3c8fc4c2-96c1-4af2-9d71-6d633caabc00', 1228.59, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 38: ID45 Terminal de cobre 16 mm² ojal 9,5 mm, LCDLT SCC 16/3 · sin IVA'),  -- Terminal de cobre 16 mm diámetro 3/8
  ('1238f47f-3074-44d4-9a31-b085dcdcedd3', 1155.52, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 39: E933 Terminal de cobre 16 mm² ojal 8 mm, LCDLT SCC 16/2 · sin IVA'),  -- Terminal de cobre 16 mm diámetro 5/16
  ('c3b6d3d2-0ece-4695-9cdf-ef48a7fb2c3b', 1625.85, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 40: R595 Terminal de cobre 25 mm² ojal 12,7 mm, LCDLT SCC 25/4 · sin IVA'),  -- Terminal de cobre 25 mm diámetro 1/2
  ('1bd2fe66-825b-4187-b7e1-97c20ec24ca8', 1280.83, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 41: E936 Terminal de cobre 25 mm² ojal 9,5 mm, LCDLT SCC 25/3 · sin IVA'),  -- Terminal de cobre 25 mm diámetro 3/8
  ('39f6713c-ff87-469e-9bfc-9d0e06e3af4b', 2010.51, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 42: E938 Terminal de cobre 35 mm² ojal 9,5 mm, LCDLT SCC 35/2 · sin IVA'),  -- Terminal de cobre 35 mm diámetro 3/8
  ('11a80a05-687a-4d74-b818-5dba98a5c6f8', 2258.17, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 43: E939 Terminal de cobre 35 mm² ojal 12,7 mm, LCDLT SCC 35/3 · sin IVA'),  -- Terminal de cobre 35 mm diámetro 1/2
  ('eb383121-6300-4745-a2a6-233b8e40c6ba', 2856.74, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 44: E942 Terminal de cobre 50 mm² ojal 12,7 mm, LCDLT SCC 50/3 · sin IVA'),  -- Terminal de cobre 50 mm diámetro 1/2
  ('f04b3f8e-ff74-4a10-8a6c-dd9d3eb4b204', 2627.7, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 45: E941 Terminal de cobre 50 mm² ojal 9,5 mm, LCDLT SCC 50/2 · sin IVA'),  -- Terminal de cobre 50 mm diámetro 3/8
  ('6df07c17-e793-4e2b-a536-1b3738438540', 4102.51, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 46: E943 Terminal de cobre 70 mm² ojal 9,5 mm, LCDLT SCC 70/1 · sin IVA'),  -- Terminal de cobre 70 mm diámetro 3/8
  ('2e533249-dd3a-4a75-8bde-b9ab7347469b', 6016.59, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 47: ID47 Terminal de cobre 95 mm² ojal 9,5 mm, LCDLT SCC 95/0 · sin IVA'),  -- Terminal de cobre 95 mm diámetro 3/8
  ('058baaaf-6592-45f8-baa0-bd5d527d506a', 229.02, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 50: RZ77 Terminal preaislado ojal 5 mm amarillo 2,5-6 mm², LCDLT C3 · sin IVA'),  -- Terminal preaislado ojal amarillo 5 mm
  ('0479045a-af1b-4edd-b8e6-568040410ca8', 330.62, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 51: Y206 Terminal preaislado ojal 8 mm amarillo 2,5-6 mm², LCDLT C5 · sin IVA'),  -- Terminal preaislado ojal amarillo 8 mm
  ('a5f5ea54-421f-4a2f-b8ce-eab24856748c', 322.39, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 52: Y207 Terminal preaislado ojal 10 mm amarillo 2,5-6 mm², LCDLT C6 · sin IVA'),  -- Terminal preaislado ojal amarillo 10 mm
  ('9719049a-dc63-4943-83e5-bc54cf7b5259', 128.92, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 53: Y187 Terminal preaislado ojal 5 mm azul 1-2,5 mm², LCDLT B4 · sin IVA'),  -- Terminal preaislado ojal azul 5 mm
  ('f4c6f370-46d9-420f-a7fb-7ad04e90207b', 167.86, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 54: Y188 Terminal preaislado ojal 6 mm azul 1-2,5 mm², LCDLT B5 · sin IVA'),  -- Terminal preaislado ojal azul 6 mm
  ('2c7f60ac-938d-4e4c-8e98-33f0d6d1077f', 111.6, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 55: Y215 Terminal preaislado pala hembra 6,3 amarillo 2,5-6 mm², LCDLT C15 · sin IVA'),  -- Terminal preaislado pala hembra amarillo 6 mm
  ('5e83ec78-fa2c-44ca-b53e-d0c70da059b0', 111.6, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 56: Y198 Terminal preaislado pala hembra 6,3 azul 1-2,5 mm², LCDLT B18 · sin IVA'),  -- Terminal preaislado pala hembra azul 2,5 mm
  ('2e58d896-760e-48a9-b2e3-4f0445c167c6', 669.96, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 57: 0LNE Termocontraíble 4,8 mm (3/16") negro, Compet Phiterm · sin IVA'),  -- Termo contraíble negro 4 mm
  ('e5d2c031-a72d-4f3a-9733-ffcd79b1b386', 1249.08, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 58: 0LNH Termocontraíble 12,2 mm (1/2") negro, Compet Phiterm: el de 10 mm redondeado al tamaño siguiente · sin IVA'),  -- Termo contraíble negro 10 mm
  ('508851ee-f09e-4669-8a80-6856aa5343b0', 1805.49, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 59: 0NOD Termocontraíble 16,1 mm (5/8") negro, Compet Phiterm: el de 13 mm redondeado al tamaño siguiente · sin IVA'),  -- Termo contraíble negro 13 mm
  ('6a0e2668-0baa-41c2-9475-9972c625e379', 3452.33, 'ARS', '2026-09-23', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00146184 del 23/09/2026, renglón 60: F231 Módulo toma 220V 20A, Cambre Siglo XXI 6915 · sin IVA');  -- Tomas cambre de 20 amp

delete from public.panol_precios
 where id in (
   '604d3f32-4146-464c-9c67-5880de349993',  -- BASE PORTA FUSIBLE NH 500A
   'd6afa39c-d3f9-4454-b6d0-1bcc5c99b2ca',  -- BORNERA · T2 25A
   '127ae301-ee8b-4bf9-867c-c9f076b74c93',  -- BORNERA · T2 50A
   'ecb7d7a4-b047-4353-8684-d19a78e7cf96',  -- BORNERA · T2 100A
   '5afa72f5-074e-4028-9e78-16c3a1210bab',  -- BORNERA · T3 25A
   '8cd09ee8-063c-4327-aa83-a94f25e5f613',  -- BORNERA tipo telefónica 10x50
   'a5a1a7a4-ca56-45c5-918c-5d62a25b45af',  -- Cable 1x0,50 amarillo
   '95f73ba7-ef5a-4e76-ba73-7ad758caaadc',  -- Cable 1x0,50 negro
   '79215d87-2aca-4d38-9a64-43adacb9e167',  -- Cable 1x0,50 rojo
   'e01dd265-abf8-413b-80d3-4c748a392171',  -- Contactor tripolar 3x18A bobina 220V 1NA SK118A10M
   '11c45e7f-436c-4f15-b565-f06c1452154f',  -- Empalme preaislado amarillo 6 mm
   'bc2e59db-681a-4a3c-9ccb-4f50aa7255f2',  -- FUSIBLE NH · 100A
   '52e0842e-2987-42b6-ac8c-c8fccd9cd585',  -- Gabinete PVC Roker PRG 350-1 puerta de cristal (32
   '5203ef91-c6ea-4e47-b1bd-832ee2eab506',  -- Precinto 150 x 3,5 mm
   'f918b517-33e1-407d-92c7-c7fe18998ff4',  -- Precinto 245 x 4,6 mm
   '099a14f6-a9b5-47fe-850f-9e9cc928831a',  -- Terminal de cobre 10 mm diámetro 6
   'f2db5ca9-f45d-4116-a558-813b543bea62',  -- Terminal de cobre 16 mm diámetro 3/8
   '55d67328-c0c3-4cb4-9eab-22b432537c1f',  -- Terminal de cobre 16 mm diámetro 5/16
   '35632302-b38a-4fa2-b862-f6b51bc89f79',  -- Terminal de cobre 25 mm diámetro 1/2
   '20b91be3-8fb0-468b-9c7b-c6d1689b7d6a',  -- Terminal de cobre 25 mm diámetro 3/8
   'b25240cf-8676-44af-bdb5-0423be9bb7a6',  -- Terminal de cobre 35 mm diámetro 3/8
   '78017db8-be0b-4d93-a277-7f0c1e1cd65c',  -- Terminal de cobre 35 mm diámetro 1/2
   '3e54fc87-e2c8-4cfe-8cf9-50948eda9fb6',  -- Terminal de cobre 50 mm diámetro 1/2
   'bf9db8f0-b8ce-40de-b56d-5a285650f1d7',  -- Terminal de cobre 50 mm diámetro 3/8
   'd1b19132-de48-472d-bc70-a9575b6bace2',  -- Terminal de cobre 70 mm diámetro 3/8
   '5db6e961-6b81-4249-a614-93d10891df9f',  -- Terminal de cobre 95 mm diámetro 3/8
   '8d22d2ca-2afa-4300-b599-dde58113ff53',  -- Terminal preaislado ojal amarillo 8 mm
   'b44cbe5f-830b-40c7-9cb2-9388492e062a',  -- Terminal preaislado ojal amarillo 10 mm
   '59859645-e45d-4b89-9b34-d31dbde57d27',  -- Terminal preaislado ojal azul 6 mm
   '301327ec-72e1-478c-a8a2-0c27133ae20e',  -- Terminal preaislado pala hembra amarillo 6 mm
   '824a2a5b-0cdc-4554-bf17-cc569f87182a',  -- Termo contraíble negro 4 mm
   'ed0a74b3-e872-41db-997b-cda2bffdb8c1',  -- Termo contraíble negro 10 mm
   '70b71245-862d-4452-bbd6-874b2b538dbe',  -- Termo contraíble negro 13 mm
   '880d2593-12a0-4c6b-8874-ad513e99fef1'   -- Tomas cambre de 20 amp
 )
   and proveedor is null and proveedor_id is null and fecha = '2026-09-23';

commit;
