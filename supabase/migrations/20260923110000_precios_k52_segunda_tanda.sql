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

-- (23/09) Se sacaron 14 renglones que ahora tienen precio de Trimer (ver
-- 20260923140000_precios_k52_trimer.sql) y 1 de Famiq, la placa de 230x350
-- (ver 20260923160000_precios_k52_famiq.sql).

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('0ca36882-c0d6-46b5-b0d0-e9bbedae7164', 30000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Lista de la obra 52-23 · IVA sin confirmar, cargado tal cual'),  -- Luces cuadradas techo blanco calido
  ('f59d1862-9828-4a20-9f16-aa636e431d54', 301652.89, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito Baron 02/09 (C42005 cierre Perko s/llave 75mm), aplicado en la obra H-175 · con IVA era 365.000 · sin IVA'),  -- levantapiso perko 75mm
  ('1be5810e-0c5c-4f85-902b-b45d51ff8ebb', 26.68, 'USD', '2026-09-23', 'Lista de obra', null, 'Listas de las obras 37-39, 37-40 y 37-41 (mismo precio en las tres)'),  -- Brida 120mm ext x 50mm int, chapa 3/8" inox 316
  ('a320d678-ae28-4c52-9386-79a6f011e16e', 276640, 'ARS', '2026-09-23', 'Aceros Fitzner', 'dca97f48-7e22-46d7-b552-d5e0ff13d483', 'Listas de las obras 52-25, 55-3 y 55-4 (mismo precio en las tres) · IVA sin confirmar, cargado tal cual'),  -- Caño schedule 80, 3 1/2" nominal, L = 285 mm Inox 
  ('2e94aa22-fe15-46b5-a546-f15690305955', 4887.45, 'ARS', '2026-08-25', 'Casa Iriarte', '39d9cb3e-9c99-473d-9908-7cb3d5e63b9e', 'Presupuesto Casa Iriarte 33116 (CODO HEMBRA HEMBRA 1/2 FUNDIDO), usado en 37-39/40/41'),  -- CODO HH 1/2
  ('46dcd31e-2d2c-4fef-b822-2095856b39ba', 255000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Lista de la obra 55-2 · IVA sin confirmar, cargado tal cual'),  -- Bacha cocina acero Inox. Negra Hausar 60 x 45 BP-C
  ('357e9ba0-a9e6-4820-a4f9-2315e40e48bc', 906000, 'ARS', '2026-09-23', 'Lista de obra', null, 'Listas de las obras H-175 y 37-41 · IVA sin confirmar, cargado tal cual'),  -- Inodoro con bidet SEAFLO Sfmte1-07 12v
  ('fb26bbe0-e1a0-4a2e-b0ea-815715860597', 351446.28, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005534 04/09 (BOCINA DOBLE 12V ELECTRICA TROMPETA MARINCO) · con IVA era 425.250 · sin IVA'),  -- Bocina Marinco doble INOX electrica 12v
  ('1299d8bc-76d1-49cb-a670-fa8b21f52839', 245, 'USD', '2026-09-23', 'Referencia web', null, 'Referencia web · Airmar P319 50/200kHz, P2 Marine · 2026-09-23'),  -- ECOSONDA P319
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
