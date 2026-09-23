-- Precios sacados de los remitos que ya estaban en el pañol.
--
-- Abrí los 86 comprobantes cargados. La mayoría son notas de entrega sin
-- plata -Trimer, Favicur, Electro 2001, Garmin, Mercoglass, Gabriel
-- Sanitarios e Inoxalum mandan cantidades y nada más-, pero los de Baron y
-- los de Rincón del Herraje vienen valorizados renglón por renglón. Esos
-- precios estaban en el sistema desde el primer día, adentro de un PDF que
-- nadie podía sumar.
--
-- Dos de los remitos de Baron son de la obra 52-26, así que traen la
-- herrería y los herrajes del K52 con precio real, no de referencia.
--
-- Baron cotiza a consumidor final: sus unitarios vienen con IVA y acá van
-- divididos por 1,21, con el número original anotado en la fuente. Rincón
-- presupuesta neto y va tal cual.
--
-- Quedaron afuera:
--   · V18004 VHF UNIDEN UM385 CON DSC BLANCO · el código no está en el catálogo
--   · F20030 FLAPS LENCO ELECTRICOS 12X12 C/CONTROL C/INDICADOR · el código no está en el catálogo
--   · A15006 ANTENA VHF 6DB SHAKESPEARE EXTR PLASTICO · el código no está en el catálogo
--   · C89393 CALEFACTOR AUTOTERM REJILLA D90 OBT C/ADAPT · el código no está en el catálogo
--   · P23025 PASACABLE RECTO FIVE OCEANS D=06mm · la ficha del catálogo dice otra medida
--   · C89012 CALEFACTOR AUTOTERM MANGUERA AIRE D90 X METRO · el código no está en el catálogo
--   · C89013 CALEFACTOR AUTOTERM MANGUERA AIRE D60 X METRO · el código no está en el catálogo

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('5781d639-197d-4e6a-9e8e-e0af0fac6d2c', 15123.97, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, hoja 2) · ANTENA 5-O BASE PLASTICO MANIJA · con IVA era 18.300 · sin IVA'),  -- BASE ANTENA VHF PLASTICA A15467
  ('10c0a029-9d78-4884-85bd-cec0e0c8f7e7', 13636.36, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, hoja 2) · GANCHO INOXIDABLE PORTA DEFENSA · con IVA era 16.500 · sin IVA'),  -- GANCHO INOXIDABLE PORTA DEFENSA
  ('521d64c9-6ca7-46b0-81fd-ca4694a98173', 17933.88, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, hoja 2) · ENCHUFE Five Oceans Toma USB 12V · con IVA era 21.700 · sin IVA'),  -- Enchufe Toma (12V-24V) USB 12V redondo
  ('7955257b-9941-4edf-8052-c04ea7310087', 917355.37, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · CABRESTANTE LOFRANS X1 500W-12V ALUMINIO 6MM · con IVA era 1.110.000 · sin IVA'),  -- Malacate X1 500W · Lofrans
  ('31b36484-f155-4a39-a649-19eb1d6b74eb', 115702.48, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · COMPAS RITCHIE F-50W EMBUTIR BLANCO · con IVA era 140.000 · sin IVA'),  -- Compas Ritchie Embutir Blanco 50w
  ('72660701-9b60-4eab-8acb-aff35fb84b7f', 26694.21, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · CABRESTANTE LOFRANS JOYSTICK UP/DOWN · con IVA era 32.300 · sin IVA'),  -- LOFRANS JOYSTICK UP/DOWN
  ('bcfc6635-8690-45ce-801e-545a1b4cf34c', 24462.81, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · RESORTE HIDRAULICO SPRINGLIFT 17.2/10.2 40lb · con IVA era 29.600 · sin IVA'),  -- Piston 18Kg e 437mm c 260mm
  ('5a5659dd-6219-4bed-9719-fc5ee5792ea1', 15454.55, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · BOMBA ACHIQUE ELECT AUTOMATICO SEAFLO 20 AMPS · con IVA era 18.700 · sin IVA'),  -- BOMBA ACHIQUE ELECT AUTOMATICO SEAFLO 20 AMPS
  ('8febebf8-0fc3-47c8-aab8-22a59d3f1e1e', 17520.66, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175, electrónica) · BOMBA ACHIQUE ELECT TABLERO SEAFLO 3 POS · con IVA era 21.200 · sin IVA'),  -- CONTROL BOMBA DE ACHIQUE SEAFLO B27011
  ('8b509a47-aa1e-4395-a8dd-52782cc8f7da', 14628.1, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · PASADOR INOX 316 HEAVY DUTY 3-1/2 · con IVA era 17.700 · sin IVA'),  -- Pasador Inoxidable 316, Heavy Duty de 3-1/2"
  ('cba38028-9ec0-4dfe-957d-0e95ceae0210', 23719.01, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BICHERO PLASTICO 2 TRAMOS 120/210cm · con IVA era 28.700 · sin IVA'),  -- BICHERO PLASTI 2 TRAMOS 120/210CM
  ('fb8c7b49-f1c0-4425-b303-1efac78f39a9', 323140.5, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · KIT WHALE FRIO-CALOR 2.5 MTS · con IVA era 391.000 · sin IVA'),  -- DUCHADOR TWIST AGUA FR/CAL C/MANGUERA
  ('6ecf947f-e9c3-4d18-b70a-48c69db47de9', 50826.45, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · TRABACADENA INOX STOPPER 80x70mm · con IVA era 61.500 · sin IVA'),  -- TRABACADENA INOX STOPPER 80X70MM
  ('bf6a01f6-93c7-47f1-8fdf-cdd903a6422d', 11818.18, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BUTACA GIRATORIO P/BUTACA · con IVA era 14.300 · sin IVA'),  -- GIRATORIO BUTACA
  ('48691257-85e0-43a4-8bac-ed25c1dad24b', 4330.58, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · SOPORTE P/BICHERO INOX 25-32mm · con IVA era 5.240 · sin IVA'),  -- SOPORTE BICHERO Inoxidable 25-32mm (PAR)
  ('d34d31bd-95d0-4f2d-87dd-6de830310a18', 35371.9, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · LEVANTAPISO PERKO 1220DPCHR · con IVA era 42.800 · sin IVA'),  -- K52 · Levantapiso - Perko 1220DPCHR
  ('9a8d6d69-4db2-489c-bcac-1aa4c917c6e8', 5743.8, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · TAPA TANQUE ACC ABRE TAPA TANQUE INOX · con IVA era 6.950 · sin IVA'),  -- Llave abre Tapa Tanque inox
  ('dd4ddf69-f90d-4f0d-ac1b-c858cd89eac3', 7404.96, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · GRILLETE INOX LARGO D10mm 3/8 FIVE OCEANS · con IVA era 8.960 · sin IVA'),  -- K52 · Grillete inoxidable largo - D10mm (3/8")
  ('e775154e-57f7-4b20-a837-e3194309e638', 25619.83, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · MANIJA INOX CAÑO OVAL 170x40mm · con IVA era 31.000 · sin IVA'),  -- MANIJA INOX CAÑO OPVAL 170X40MM
  ('54619c9e-d476-40cd-94b6-6934972561f5', 1107.44, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · OMEGA INOX BARRA D06mm C/U · con IVA era 1.340 · sin IVA'),  -- K52 · Omega Inoxidable Inox Barra D06mm c/u
  ('e4bb8731-3c9a-41a1-b3b9-8a9893132dc0', 5429.75, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BISAGRA INOX 59X40mm 6 TORNILLOS · con IVA era 6.570 · sin IVA'),  -- K52 · Bisagra Inox 59X40mm 6 Tornillos
  ('71d4e8a7-321f-424c-b5cd-2ed08c69517e', 6115.7, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BISAGRA INOX 71x38mm 4 TORNILLOS · con IVA era 7.400 · sin IVA'),  -- K52 · Bisagra INOX 71x38mm 4 Tornillos B21256
  ('1c17d746-5a67-4096-867c-956781b852d5', 5570.25, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BISAGRA INOX 38X38x2 4 TORNILLOS · con IVA era 6.740 · sin IVA'),  -- K52 · Bisagra 38X38X2mm 4 Tornillos
  ('8257ef3b-edfa-4b65-875c-cd30b0e2dbad', 6702.48, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · BISAGRA INOX 38X56mm 5 TORNILLOS · con IVA era 8.110 · sin IVA'),  -- K52 · Bisagra Inox 38X56mm 5 Tornillos
  ('9805411b-d676-4486-a310-730cb1b9cbed', 243801.65, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26) · ANCLA DELTA FIVE OCEANS GALVANIZADO 32KGS · con IVA era 295.000 · sin IVA'),  -- ANCLA 32KG GALVANIZADO DELTA
  ('f294dc1f-fcdc-4857-9091-259571a144bd', 107438.02, 'ARS', '2026-09-10', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 10/09/2026 (obra 52-26, segundo remito) · COMPAS RITCHIE S-53 NEGRO · con IVA era 130.000 · sin IVA'),  -- K52 · Compas magnetico S-53 (Brujula)
  ('335923e9-c7a6-4bc7-9b44-39dea9898c29', 22975.21, 'ARS', '2026-09-15', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 15/09/2026 (obras 43-30 y 55-2) · MANIJA INOX OVAL 305mm T=5/16 · con IVA era 27.800 · sin IVA'),  -- Manijas 305mm Inoxidable
  ('f875dab1-bff2-46d9-b1d7-7e27b1d87e06', 22975.21, 'ARS', '2026-09-15', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 15/09/2026 (obras 43-30 y 55-2) · MANIJA INOX OVAL 305mm T=5/16 · con IVA era 27.800 · sin IVA'),  -- Manijas 305mm Inoxidable
  ('14a574aa-9932-46a3-9731-b35a7acfeb6b', 5842.98, 'ARS', '2026-09-15', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 15/09/2026 (obras 43-30 y 55-2) · BISAGRA FIVE OCEANS INOX 38x104mm · con IVA era 7.070 · sin IVA'),  -- Bisagra - Five Oceans Inox 38x104mm 5 Tornillo
  ('dfc15286-b90f-4960-8ec8-baf0338ddbec', 25702.48, 'ARS', '2026-09-15', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 15/09/2026 (obras 43-30 y 55-2) · RESORTE HIDRAULICO SPRINGLIFT 20/12 60 lb · con IVA era 31.100 · sin IVA'),  -- Piston 27kg e 510mm c 305mm
  ('db862582-6f91-4174-be2a-aec1a98ddd2a', 62396.69, 'ARS', '2026-09-17', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 17/09/2026 (obra 85-2-3) · BOMBA ACHIQUE ELECT P/DUCHA HD 750GPH 24V · con IVA era 75.500 · sin IVA'),  -- BOMBA ACHIQUE ELECT P/DUCHA 750GPH FIVE OCEANS
  ('1e493639-82a4-457f-beec-f18f2a86d137', 52644.63, 'ARS', '2026-09-17', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 17/09/2026 (obra 85-2-3) · BOMBA ACHIQUE ELECT P/DUCHA SEAFLO 750GPH 12V · con IVA era 63.700 · sin IVA'),  -- BOMBA ACHIQUE ELECT P/DUCHA SEAFLO 750GPH 12V
  ('5bbb827c-e3e5-40cd-8538-5946c36558ab', 50000, 'ARS', '2026-09-17', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 17/09/2026 (obra 85-2-3) · PLAFON FIVE OCEANS BAJO LDF BCO/AZUL · con IVA era 60.500 · sin IVA'),  -- Plafon Five oceans sumergible (Luz bajo agua)
  ('fe4ff95d-5691-4806-b9c8-76cd3a09064f', 6726.3425, 'ARS', '2026-09-15', 'Rincón del Herraje', 'f3b2b046-6b7a-412d-a451-bafcd006f772', 'Presupuesto Rincón del Herraje CC00101032 15/09/2026 · RETEN PUERTA MAGNETICO ZAMAC NEGRO 629-808B · sin IVA');  -- K52 · RETEN IMAN PARA PUERTA NEGRO ZAMAC

commit;
