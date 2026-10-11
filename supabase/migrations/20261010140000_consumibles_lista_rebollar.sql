-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: lista de precios de Rebollar (CMR Insumos Industriales),
-- vigente desde el 2026-10-08.
--
-- GENERADA por scripts/consumibles/lista-rebollar.mjs (2026-10-10) a partir de
-- "lista.xlsx". No editar a mano: se regenera con la lista siguiente.
--
--   · 1 lista (proveedor_id = panol_proveedores "Rebollar"),
--     dólar oficial vendedor BNA 1540 (2026-10-08).
--   · 649 renglones (3 notas al pie quedan en la lista, no son productos).
--   · 160 renglones vinculados a un consumible (cruce inequívoco).
--     56 dudosos y 6 sin par van a
--     docs/consumibles/conciliacion-rebollar.csv para resolver en la pestaña
--     Catálogo → Conciliar.
--   · Config para los 222 consumibles activos, en orden de rubro y
--     descripción (KA0001…), forma de entrega por regla
--     (unidad 93, canje 68, peso 57, fraccionado 4),
--     158 con costo por unidad de entrega y 30 favoritos del mostrador
--     (los más retirados por solicitud).
--
-- Idempotente: se puede correr dos veces. La lista se reconoce por proveedor y
-- fecha; los renglones por (lista, código); la config por material, y en una
-- config que ya existía solo se completan los campos vacíos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. La lista ─────────────────────────────────────────────────────────────
-- Una por proveedor y fecha de vigencia: si ya está (cargada a mano desde la
-- pestaña Precios, o porque esto ya corrió), se usa esa.
insert into public.consumibles_listas (proveedor_id, proveedor_nombre, vigente_desde, archivo_nombre, dolar_vendedor, notas)
select
  (select p.id from public.panol_proveedores p where p.id = 'de493c26-c058-4177-bf00-ba83d21eb4cc'::uuid),
  'Rebollar',
  date '2026-10-08',
  'lista.xlsx',
  1540,
  'Carga inicial (2026-10-10) desde "lista.xlsx", hoja "Lista Klase A".
Dólar oficial vendedor BNA del 2026-10-08: 1540 (api.argentinadatos.com).
Nota de la lista: Los precios indicados "+IVA" no incluyen IVA. Los indicados "Final" son finales con remito.
Nota de la lista: Los precios en USD se valorizan con el tipo de cambio vendedor del BNA del día de entrega de la mercadería.
Nota de la lista: Consultar los descuentos adicionales por cantidad, que se aplican sobre pago en efectivo contraentrega.'
where not exists (select 1 from public.consumibles_listas where proveedor_nombre = 'Rebollar' and vigente_desde = date '2026-10-08');

-- ── 2. Los renglones ────────────────────────────────────────────────────────
-- costo_ars = precio en pesos sin IVA por unidad de compra ("+IVA" y "Final"
-- van igual; USD × dólar). material_id solo en los vínculos inequívocos.
drop table if exists pg_temp._cns_items;
create temp table _cns_items (
  codigo text, descripcion text, medida text, precio numeric, moneda text,
  condicion text, costo_ars numeric, unidad_compra text, contenido numeric, material_id uuid
) on commit drop;

insert into _cns_items values
  ('A0001'::text, 'Macho Acoples-Macho Rosca'::text, null::text, 954.52::numeric, 'ARS'::text, '+IVA'::text, 954.52::numeric, 'unidad'::text, 1::numeric, null::uuid),
  ('A00011', 'Macho Acoples-Hembra Rosca', null, 1187.9, 'ARS', '+IVA', 1187.9, 'unidad', 1, null),
  ('A000111', 'Macho Acoples-Espiga', null, 1484.84, 'ARS', '+IVA', 1484.84, 'unidad', 1, null),
  ('A0001111', 'Espiga-Macho Rosca', null, 1039.5, 'ARS', '+IVA', 1039.5, 'unidad', 1, null),
  ('A0002', 'Acople Rapido 1/4 Completo', null, 4963, 'ARS', '+IVA', 4963, 'unidad', 1, null),
  ('A0004', 'AGUARRAS x 4Lts', null, 20756.98, 'ARS', '+IVA', 20756.98, 'litro', 4, null),
  ('A0005', 'ALAMBRE EN ROLLO X 1KG', null, 6615.46, 'ARS', 'Final', 6615.46, 'kg', 1, null),
  ('A0006', 'ANTEOJO LIBUS ARGON TRANSP', null, 2144.6145, 'ARS', 'Final', 2144.6145, 'unidad', 1, 'e77f1598-f623-467d-9d04-a536b37acd5f'),
  ('A0008', 'Autopolish x 900cm3', null, 11221, 'ARS', 'Final', 11221, 'litro', 0.9, 'c41224aa-205e-475b-984b-89a636ec30c2'),
  ('AB0000816', 'ABRAZ PERF INOX BANDA 9mm', '8-16', 1722.2486, 'ARS', 'Final', 1722.2486, 'unidad', 1, null),
  ('AB0001222', 'ABRAZ PERF INOX BANDA 12mm', '12-22', 2655.0928, 'ARS', 'Final', 2655.0928, 'unidad', 1, null),
  ('AB0001627', 'ABRAZ PERF INOX BANDA 12mm', '16-27', 2752.2884, 'ARS', 'Final', 2752.2884, 'unidad', 1, null),
  ('AB0002335', 'ABRAZ PERF INOX BANDA 12mm', '23-35', 2822.6126, 'ARS', 'Final', 2822.6126, 'unidad', 1, null),
  ('AB0003250', 'ABRAZ PERF INOX BANDA 12mm', '32-50', 3216.9783, 'ARS', 'Final', 3216.9783, 'unidad', 1, null),
  ('AB0004248', 'ABRAZ PERF INOX SUPER PRESION', '42-48', 7620.3143, 'ARS', 'Final', 7620.3143, 'unidad', 1, null),
  ('AB0005058', 'ABRAZ PERF INOX SUPER PRESION', '50-58', 8610.0896, 'ARS', 'Final', 8610.0896, 'unidad', 1, null),
  ('AB0005070', 'ABRAZ PERF INOX BANDA 12mm', '50-70', 3288.6817, 'ARS', 'Final', 3288.6817, 'unidad', 1, null),
  ('AB006270', 'ABRAZ PERF INOX SUPER PRESION', '62-70', 9049.9228, 'ARS', 'Final', 9049.9228, 'unidad', 1, null),
  ('AB007482', 'ABRAZ PERF INOX SUPER PRESION', '74-82', 9029.93, 'ARS', 'Final', 9029.93, 'unidad', 1, null),
  ('AB008088', 'ABRAZ PERF INOX SUPER PRESION', '80-88', 10303.0853, 'ARS', 'Final', 10303.0853, 'unidad', 1, null),
  ('AB008694', 'ABRAZ PERF INOX SUPER PRESION', '86-94', 9874.6062, 'ARS', 'Final', 9874.6062, 'unidad', 1, null),
  ('AB0090110', 'ABRAZ PERF INOX BANDA 12mm', '90-110', 4072.4732, 'ARS', 'Final', 4072.4732, 'unidad', 1, null),
  ('AB092100', 'ABRAZ PERF INOX SUPER PRESION', '92-100', 10070.424, 'ARS', 'Final', 10070.424, 'unidad', 1, null),
  ('AB110118', 'ABRAZ PERF INOX SUPER PRESION', '110-118', 11026.5355, 'ARS', 'Final', 11026.5355, 'unidad', 1, null),
  ('AB136144', 'ABRAZ PERF INOX SUPER PRESION', '134-144', 12284.7598, 'ARS', 'Final', 12284.7598, 'unidad', 1, null),
  ('AB158164', 'ABRAZ PERF INOX SUPER PRESION', '158-164', 14273.3791, 'ARS', 'Final', 14273.3791, 'unidad', 1, null),
  ('AB162172', 'ABRAZ PERF INOX SUPER PRESION', '162-172', 15702.9163, 'ARS', 'Final', 15702.9163, 'unidad', 1, null),
  ('AB270280', 'ABRAZ PERF INOX SUPER PRESION B24mm', '270-280', 39686.4, 'ARS', 'Final', 39686.4, 'unidad', 1, null),
  ('ABRAZ002', 'Abraz tipo cremallera AISI304', '8 x 22 band 8mm', 1270.2421, 'ARS', 'Final', 1270.2421, 'unidad', 1, null),
  ('AEROSOL1', 'Aerosol Negro Mate Doble A', null, 4856.8, 'ARS', '+IVA', 4856.8, 'unidad', 1, null),
  ('AEROSOL2', 'Aerosol Negro Brilante Doble A', null, 4856.8, 'ARS', '+IVA', 4856.8, 'unidad', 1, null),
  ('ALCOHOL96', 'ALCOHOL 96 X LITRO', null, 4676, 'ARS', 'Final', 4676, 'litro', 1, null),
  ('ALCOHOLBID', 'ALCOHOL 96 BIDON x 5Lts', null, 13470, 'ARS', 'Final', 13470, 'litro', 5, null),
  ('ALICATE', 'ALICATE', null, 16287.93, 'ARS', 'Final', 16287.93, 'unidad', 1, null),
  ('ALLFREME22', 'Allen MET cab frezada AISI304', 'M4 x 45', 0.605429, 'USD', 'Final', 932.3609, 'unidad', 1, null),
  ('B0001', 'BALDE ALBAÑIL', null, 2108.2, 'ARS', 'Final', 2108.2, 'unidad', 1, null),
  ('B0007', 'Barbijo Simil N95', null, 699.04, 'ARS', 'Final', 699.04, 'unidad', 1, null),
  ('B0023', 'BLEM', null, 6890, 'ARS', 'Final', 6890, 'unidad', 1, null),
  ('B00231', 'BASE ORBITAL DIAM.150', null, 31921.93, 'ARS', '+IVA', 31921.93, 'unidad', 1, null),
  ('B00232', 'BASE CON ABROJO DIAM. 150', null, 7400, 'ARS', '+IVA', 7400, 'unidad', 1, null),
  ('B00241', 'BOLSA DE CONSORCIO REFORZADA', '130-100', 474.03, 'ARS', 'Final', 474.03, 'unidad', 1, null),
  ('B002421', 'BOLSA DE CONSORCIO REFORZADA', '50-70', 286.4677, 'ARS', 'Final', 286.4677, 'unidad', 1, null),
  ('B00245', 'BOLSA DE CONSORCIO REFORZADA', '100-110', 424.03, 'ARS', 'Final', 424.03, 'unidad', 1, null),
  ('B007-3TEL', 'BARBIJO 3 TELAS', null, 56.63, 'ARS', 'Final', 56.63, 'unidad', 1, null),
  ('C0001', 'CARTON ROLLO', null, 11570, 'ARS', 'Final', 11570, 'unidad', 1, '20b0748e-0807-46bf-aa2f-48b525ba21d5'),
  ('C0003', 'CEPILLO CERDA BLANDA', null, 12800, 'ARS', 'Final', 12800, 'unidad', 1, 'e5e97fd5-d50f-4267-809f-4c4f5a4e3217'),
  ('C0006', 'CERA DESMOLDE X 4Lts - BALDE', null, 74031.6, 'ARS', 'Final', 74031.6, 'litro', 4, null),
  ('C0007', 'Cera Suiza x 18000cc', null, 173974, 'ARS', 'Final', 173974, 'litro', 18, null),
  ('C0009', 'CHAPITA PARA MASILLAR 12 X 10', null, 1993.17, 'ARS', 'Final', 1993.17, 'unidad', 1, null),
  ('C0010', 'CHAPITA PARA MASILLAR 8 X 10', null, 1358.98, 'ARS', 'Final', 1358.98, 'unidad', 1, null),
  ('C00101', 'CHAPITAS PARA MASILLAR -JUEGO', null, 2667.18, 'ARS', 'Final', 2667.18, 'unidad', 1, '13f8161f-a496-4fca-b913-2b833e950c62'),
  ('C0011', 'Ciano en GEL x 25ml', null, 8383.673, 'ARS', 'Final', 8383.673, 'litro', 0.025, null),
  ('C0012', 'Ciano x 25ml', null, 7571.88, 'ARS', 'Final', 7571.88, 'litro', 0.025, null),
  ('C0013', 'CINTA AISLADORA 10Mt-3M Blanca', null, 2846.3917, 'ARS', '+IVA', 2846.3917, 'metro', 10, null),
  ('C0017', 'CINTA AISLADORA 20Mts-3M Negra', null, 2534, 'ARS', '+IVA', 2534, 'metro', 20, null),
  ('C00171', 'CINTA AISLADORA 20Mt-3M Blanca', null, 3609.6144, 'ARS', '+IVA', 3609.6144, 'metro', 20, null),
  ('C001721', 'CINTA AISLADORA 20Mt-3M VERDE', null, 3970.5758, 'ARS', '+IVA', 3970.5758, 'metro', 20, null),
  ('C00174', 'CINTA AISLADORA DOBLE A NEGRA', null, 1656.36, 'ARS', '+IVA', 1656.36, 'unidad', 1, null),
  ('C00175', 'CINTA AISLADORA DOBLE A ROJA', null, 986.8684, 'ARS', '+IVA', 986.8684, 'unidad', 1, null),
  ('C00176', 'CINTA AISLADORA DOBLE A BLANCA', null, 986.8684, 'ARS', '+IVA', 986.8684, 'unidad', 1, null),
  ('C00191', 'CINTA DOBLE FAZ 36mm RAPIFIX', null, 12115.8, 'ARS', '+IVA', 12115.8, 'unidad', 1, '94a44c07-0b23-49fd-8554-223dff0241fb'),
  ('C0023', 'CINTA EMBALAR 48x80MT TRANSP', null, 1878.84, 'ARS', 'Final', 1878.84, 'metro', 80, null),
  ('C0024', 'CINTA METRICA X 3Mts', null, 5178.7235, 'ARS', 'Final', 5178.7235, 'unidad', 1, null),
  ('C0025', 'CINTA METRICA X 5Mts', null, 7390.8272, 'ARS', 'Final', 7390.8272, 'unidad', 1, null),
  ('C00261', 'CINTA METRICA EVEL x 8MTS', null, 21730, 'ARS', 'Final', 21730, 'unidad', 1, null),
  ('C00263', 'CINTA METRICA EVEL x 5MTS', null, 11640, 'ARS', 'Final', 11640, 'unidad', 1, null),
  ('C0030', 'Cinta papel DobleA AZUL 48mm', null, 5448, 'ARS', '+IVA', 5448, 'unidad', 1, null),
  ('C0031', 'Cinta papel DobleA VERDE 18mm', null, 2038.4, 'ARS', '+IVA', 2038.4, 'unidad', 1, '8c47e2ea-e691-46df-8e0c-afee00d06027'),
  ('C0032', 'Cinta papel DobleA VERDE 48mm', null, 5287.36, 'ARS', '+IVA', 5287.36, 'unidad', 1, null),
  ('C0034', 'Cinta DobleA #988 18mm x 50mts', null, 2059.2, 'ARS', '+IVA', 2059.2, 'metro', 50, null),
  ('C0035', 'Cinta DobleA #988 24mm x 50mts', null, 2786, 'ARS', '+IVA', 2786, 'metro', 50, null),
  ('C0037', 'Cinta DobleA #988 48mm x 50mts', null, 5423.6, 'ARS', '+IVA', 5423.6, 'metro', 50, null),
  ('C0038', 'CLAVO CON CABEZA X Kg 8-20', null, 8335.7439, 'ARS', 'Final', 8335.7439, 'kg', 1, null),
  ('C0039', 'CLAVO CON CABEZA X Kg 9-25', null, 8335.7431, 'ARS', 'Final', 8335.7431, 'kg', 1, null),
  ('C0043', 'CLAVO SIN CABEZA X Kg 8-20', null, 7636.78, 'ARS', 'Final', 7636.78, 'kg', 1, null),
  ('C0044', 'CLAVO SIN CABEZA X Kg 9-25', null, 7636.78, 'ARS', 'Final', 7636.78, 'kg', 1, null),
  ('C0045', 'CLAVO SIN CABEZA X Kg 10-40', null, 7636.78, 'ARS', 'Final', 7636.78, 'kg', 1, null),
  ('C0046', 'CLAVO SIN CABEZA X Kg 9-30', null, 7636.78, 'ARS', 'Final', 7636.78, 'kg', 1, null),
  ('C00461', 'CLAVO SIN CABEZA xKG 9-35', null, 7636.78, 'ARS', 'Final', 7636.78, 'kg', 1, null),
  ('C0049', 'Cola Vinilica 1011 FANA 4 Kgs.', null, 11.51, 'USD', 'Final', 17725.4, 'kg', 4, null),
  ('C0050', 'Cola Vinilica 1011 FANA x 20', null, 82504.5144, 'ARS', 'Final', 82504.5144, 'unidad', 1, null),
  ('C0053', 'CUTTER ECONOMICO X 18CM', null, 1596, 'ARS', 'Final', 1596, 'unidad', 1, null),
  ('C0054', 'CUTTER-HOJA REPUESTO x 10UNID', null, 1808.0777, 'ARS', '+IVA', 1808.0777, 'unidad', 10, '92629e6e-fe1e-4047-8fa8-44b388ef6b71'),
  ('CENTROCHIC', 'CENTRO/SOPORTE COPA CHICO', null, 6553.82, 'ARS', 'Final', 6553.82, 'unidad', 1, null),
  ('CENTROGDE', 'CENTRO/SOPORTE COPA GRANDE', null, 11329.36, 'ARS', 'Final', 11329.36, 'unidad', 1, null),
  ('D000111', 'DILUYENTE x Lt', null, 2.17, 'USD', 'Final', 3341.8, 'litro', 1, null),
  ('D00041', 'Disco de Lija 115mm #24', null, 1.11, 'USD', '+IVA', 1709.4, 'unidad', 1, null),
  ('D0005', 'Disco de Lija 115mm #36', null, 0.99, 'USD', '+IVA', 1524.6, 'unidad', 1, null),
  ('D0007', 'Disco de Lija 115mm #60', null, 0.86, 'USD', '+IVA', 1324.4, 'unidad', 1, 'fd0645c1-cf8f-470d-a578-a64d28213cb5'),
  ('D0012', 'Disco de Lija 180mm #24', null, 1.79, 'USD', '+IVA', 2756.6, 'unidad', 1, null),
  ('D0013', 'Disco de Lija 180mm #36', null, 1.77, 'USD', '+IVA', 2725.8, 'unidad', 1, null),
  ('D0019', 'DISCO DIAMANT CONTINUO 4,1/2', null, 5493.8508, 'ARS', '+IVA', 5493.8508, 'unidad', 1, null),
  ('D0020', 'DISCO DIAMANT MULTIUSO 4,1/2', null, 9218.7457, 'ARS', '+IVA', 9218.7457, 'unidad', 1, null),
  ('D0022', 'DISCO MULTIMATERIAL BOSCH115mm', null, 15037, 'ARS', '+IVA', 15037, 'unidad', 1, null),
  ('D00221', 'DISCO MULTIPROPOSITO NEGRO', null, 7183, 'ARS', '+IVA', 7183, 'unidad', 1, null),
  ('D00222', 'DISCO MULTIUSO BREMEN', null, 13484.02, 'ARS', '+IVA', 13484.02, 'unidad', 1, null),
  ('D0023', 'Disco orbital 127mm # 40', null, 416.556, 'ARS', '+IVA', 416.556, 'unidad', 1, null),
  ('D0024', 'Disco orbital 127mm # 60', null, 310.0059, 'ARS', '+IVA', 310.0059, 'unidad', 1, null),
  ('D0025', 'Disco orbital 127mm # 80', null, 310.0059, 'ARS', '+IVA', 310.0059, 'unidad', 1, null),
  ('D0026', 'Disco orbital 127mm # 100', null, 207.7008, 'ARS', '+IVA', 207.7008, 'unidad', 1, null),
  ('D0027', 'Disco orbital 127mm # 120', null, 207.7008, 'ARS', '+IVA', 207.7008, 'unidad', 1, null),
  ('D0028', 'Disco orbital 127mm # 150', null, 207.7031, 'ARS', '+IVA', 207.7031, 'unidad', 1, null),
  ('D0029', 'Disco orbital 127mm # 180', null, 207.7008, 'ARS', '+IVA', 207.7008, 'unidad', 1, null),
  ('D0030', 'Disco orbital 127mm # 220', null, 207.7008, 'ARS', '+IVA', 207.7008, 'unidad', 1, null),
  ('D0033', 'Disco orbital 127mm # 320', null, 207.7008, 'ARS', '+IVA', 207.7008, 'unidad', 1, null),
  ('D0036', 'Disco orbital 127mm # 600', null, 416.556, 'ARS', '+IVA', 416.556, 'unidad', 1, null),
  ('D0041', 'Disco orbital 154mm # 40', null, 588.924, 'ARS', '+IVA', 588.924, 'unidad', 1, 'fe2602e3-65c7-4e65-993e-3e05d24d4c66'),
  ('D0042', 'Disco orbital 154mm # 60', null, 526.338, 'ARS', '+IVA', 526.338, 'unidad', 1, 'd43c7bcb-2747-4983-b552-8046f65ec36a'),
  ('D0043', 'Disco orbital 154mm # 80', null, 526.338, 'ARS', '+IVA', 526.338, 'unidad', 1, 'f00af2d7-244d-4869-b156-373ba84cc12b'),
  ('D0044', 'Disco orbital 154mm # 100', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, null),
  ('D0045', 'Disco orbital 154mm # 120', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, '7ced8879-cb7e-40e2-8b5a-4b5c6bdd905f'),
  ('D0046', 'Disco orbital 154mm # 150', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, '003911f7-20f4-4834-b46f-795ce683c100'),
  ('D0047', 'Disco orbital 154mm # 180', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, '4f884c6c-1928-4c0f-8250-77d84c1c3a28'),
  ('D0048', 'Disco orbital 154mm # 220', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, '9f65bbe7-42a3-4438-840f-e3739434f0d1'),
  ('D0049', 'Disco orbital 154mm # 240', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, '1b1ab73d-5991-4299-9f12-9baec388a311'),
  ('D0050', 'Disco orbital 154mm # 280', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, null),
  ('D0051', 'Disco orbital 154mm # 320', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, null),
  ('D0052', 'Disco orbital 154mm # 360', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, 'a4650d8b-71c4-404d-8f5c-58598b63f03e'),
  ('D0053', 'Disco orbital 154mm # 400', null, 449.5727, 'ARS', '+IVA', 449.5727, 'unidad', 1, null),
  ('D0054', 'Disco orbital 154mm # 600', null, 618.719, 'ARS', '+IVA', 618.719, 'unidad', 1, '94c8bba9-47c1-4646-9b5b-4b9ddfe8baee'),
  ('D0056', 'Disco orbital 154mm # 1000', null, 866.2304, 'ARS', '+IVA', 866.2304, 'unidad', 1, null),
  ('D0061', 'Discos de corte 4,1/2 DobleA', null, 1415.6792, 'ARS', '+IVA', 1415.6792, 'unidad', 1, null),
  ('D00611', 'Discos de corte 4,1/2 Tyrolit', null, 2785.264, 'ARS', '+IVA', 2785.264, 'unidad', 1, null),
  ('D0063', 'Discos de corte 7', null, 2810.1363, 'ARS', '+IVA', 2810.1363, 'unidad', 1, 'ae59aebb-abe3-43c5-b938-25bbe06193a9'),
  ('D00641', 'Disco Corte Norton 4 1/2', null, 403.65, 'ARS', '+IVA', 403.65, 'unidad', 1, null),
  ('D0065', 'Discos de desbaste 4,1/2', null, 2602.2072, 'ARS', '+IVA', 2602.2072, 'unidad', 1, null),
  ('D0068', 'DISCO ABROJO diam. 180 #40', null, 1568.85, 'ARS', '+IVA', 1568.85, 'unidad', 1, null),
  ('D0069', 'DISCO ABROJO diam. 180 #60', null, 1568.85, 'ARS', '+IVA', 1568.85, 'unidad', 1, null),
  ('D0070', 'DISCO ABROJO diam. 180 #80', null, 1568.85, 'ARS', '+IVA', 1568.85, 'unidad', 1, null),
  ('D0073', 'DISCO ABROJO diam. 180 #150', null, 1661.42, 'ARS', '+IVA', 1661.42, 'unidad', 1, null),
  ('E0001', 'ELECTRODO 2,5 x KG', null, 7200, 'ARS', '+IVA', 7200, 'kg', 1, null),
  ('E00011', 'ELECTRODO 3,25 x KG', null, 7200, 'ARS', '+IVA', 7200, 'kg', 1, null),
  ('E0002', 'ESPATULA NRO 40', null, 1714.89, 'ARS', 'Final', 1714.89, 'unidad', 1, null),
  ('E0003', 'ESPATULA NRO 60', null, 2022.7, 'ARS', 'Final', 2022.7, 'unidad', 1, null),
  ('E0004', 'ESPATULA NRO 80', null, 2190.76, 'ARS', 'Final', 2190.76, 'unidad', 1, null),
  ('E0005', 'ESPATULA NRO 100', null, 2508.98, 'ARS', 'Final', 2508.98, 'unidad', 1, null),
  ('E00051', 'ESPATULA NRO 120', null, 2594.83, 'ARS', 'Final', 2594.83, 'unidad', 1, null),
  ('E0006', 'Faja Lumbar', null, 6683.04, 'ARS', 'Final', 6683.04, 'unidad', 1, null),
  ('E0007', 'ESPATULA NRO 160', null, 2865.0529, 'ARS', 'Final', 2865.0529, 'unidad', 1, null),
  ('E0010', 'ESPATULA RECTIFICADA', null, 12480, 'ARS', 'Final', 12480, 'unidad', 1, null),
  ('E0011', 'Estopa Blanca Lustre- x Kg', null, 2380, 'ARS', 'Final', 2380, 'kg', 1, '381657c8-f674-4dff-85fc-62db7944878f'),
  ('E0014', 'Espatula Plastica Mediana', null, 510.33, 'ARS', 'Final', 510.33, 'unidad', 1, null),
  ('E0015', 'Espatula Plastica Grande', null, 687.43, 'ARS', 'Final', 687.43, 'unidad', 1, null),
  ('EZETA0250', 'BROCA ACERO RAPIDO', '2,50mm', 2377, 'ARS', '+IVA', 2377, 'unidad', 1, null),
  ('EZETA0300', 'BROCA ACERO RAPIDO', '3,00mm', 2614.56, 'ARS', '+IVA', 2614.56, 'unidad', 1, null),
  ('EZETA0800', 'BROCA ACERO RAPIDO', '8,00mm', 8008.0322, 'ARS', '+IVA', 8008.0322, 'unidad', 1, null),
  ('EZETA0975', 'BROCA ACERO RAPIDO', '9,75mm', 12266.4375, 'ARS', '+IVA', 12266.4375, 'unidad', 1, null),
  ('EZETA1000', 'BROCA ACERO RAPIDO', '10,00mm', 13646.0206, 'ARS', '+IVA', 13646.0206, 'unidad', 1, null),
  ('EZETA1500', 'BROCA ACERO RAPIDO', '15,00mm', 54657.0063, 'ARS', '+IVA', 54657.0063, 'unidad', 1, null),
  ('EZETA1600', 'BROCA ACERO RAPIDO', '16,00mm', 63482.18, 'ARS', '+IVA', 63482.18, 'unidad', 1, null),
  ('F0002', '3,5 X 16 FIX', null, 0.004, 'USD', '+IVA', 6.16, 'unidad', 1, '28f984cd-c62f-4819-875c-1bfc5832f217'),
  ('F0003', '3,5 X 20 FIX', null, 0.005068, 'USD', '+IVA', 7.8044, 'unidad', 1, '4cf6eef8-9991-4443-80ab-483f7c970297'),
  ('F0004', '3,5 X 25 FIX', null, 0.006, 'USD', '+IVA', 9.24, 'unidad', 1, null),
  ('F0005', '3,5 X 30 FIX', null, 0.008, 'USD', '+IVA', 12.32, 'unidad', 1, '6882b214-d787-428e-9b8e-07ee15aa1891'),
  ('F0006', '3,5 X 35 FIX', null, 0.01, 'USD', '+IVA', 15.4, 'unidad', 1, 'ed7e0692-6a90-41d3-9532-3c9decdb3e5c'),
  ('F0007', '3,5 X 40 FIX', null, 0.013, 'USD', '+IVA', 20.02, 'unidad', 1, 'eb166b14-4d2d-4e69-8dc8-f982407596c0'),
  ('F0008', '4 X 16 FIX', null, 0.005, 'USD', '+IVA', 7.7, 'unidad', 1, null),
  ('F0009', '4 X 20 FIX', null, 0.006, 'USD', '+IVA', 9.24, 'unidad', 1, 'ab266d74-7a91-4c1d-809a-e24a9b64d3e0'),
  ('F0010', '4 X 25 FIX', null, 0.006, 'USD', '+IVA', 9.24, 'unidad', 1, 'cf156009-67b8-4f38-91bb-9a9f813d4319'),
  ('F0011', '4 X 30 FIX', null, 0.008, 'USD', '+IVA', 12.32, 'unidad', 1, '78b47ac2-5e45-4894-966d-d22e7738a125'),
  ('F0012', '4 X 35 FIX', null, 0.007, 'USD', '+IVA', 10.78, 'unidad', 1, '301c6077-8eff-4366-bfbe-8292644aa954'),
  ('F0013', '4 X 40 FIX', null, 0.009, 'USD', '+IVA', 13.86, 'unidad', 1, 'ea4338f3-b971-4e32-8412-5d1ed1f54d93'),
  ('F0014', '4 X 45 FIX', null, 0.013, 'USD', '+IVA', 20.02, 'unidad', 1, '421da6ca-f729-4848-9027-31b338207b9a'),
  ('F0015', '4 X 50 FIX', null, 0.014, 'USD', '+IVA', 21.56, 'unidad', 1, 'b55cda81-8158-44c9-800c-4f19bc12cdc9'),
  ('F0016', '4,5 X 60 FIX', null, 0.02133, 'USD', '+IVA', 32.8482, 'unidad', 1, '92ee2f1b-52bf-4dd0-9f1b-2569907f397f'),
  ('F0017', '5 X 100 FIX', null, 0.041, 'USD', '+IVA', 63.14, 'unidad', 1, null),
  ('F00171', '4,5 X 70 FIX', null, 0.0245, 'USD', '+IVA', 37.73, 'unidad', 1, null),
  ('F0019', '5 X 80 FIX', null, 0.031, 'USD', '+IVA', 47.74, 'unidad', 1, null),
  ('F0020', '5 X 90 FIX', null, 0.039, 'USD', '+IVA', 60.06, 'unidad', 1, null),
  ('F00201', '5 x 120 FIX', null, 0.04058, 'USD', '+IVA', 62.4932, 'unidad', 1, null),
  ('F0022', 'Fana 96 - Lata x 14 Kg.', null, 91.4, 'USD', 'Final', 140756, 'kg', 14, 'd4c5a533-b1db-423d-a87f-87b21b6632af'),
  ('F0024', 'Diluyente FANA 18Lts, 14Kg', null, 79.55, 'USD', 'Final', 122507, 'litro', 18, null),
  ('F0025', 'Diluyente FANA 4Lts. - 2,8kg', null, 18.35, 'USD', 'Final', 28259, 'litro', 4, null),
  ('F00251', 'FANA SPRAY 32 X 14KG', null, 158408.1279, 'ARS', 'Final', 158408.1279, 'kg', 14, null),
  ('F0027', 'FICHA MACHO', null, 1632, 'ARS', 'Final', 1632, 'unidad', 1, null),
  ('F0028', 'Film x 1100', null, 6086.124, 'ARS', 'Final', 6086.124, 'unidad', 1, '44697e09-829b-4800-a82b-e45c91a750ff'),
  ('F0029', 'Film x 2400', null, 8836.6571, 'ARS', 'Final', 8836.6571, 'unidad', 1, 'c0cc1c9f-613e-43c3-b3ef-3aba50dafaf1'),
  ('F0030', 'Film x 550', null, 5205.5179, 'ARS', 'Final', 5205.5179, 'unidad', 1, '8eb4bbf4-cfd6-4935-adcc-d0286b492420'),
  ('F0031', 'FILM PROTECTOR ANCHO 10cm', null, 2478, 'ARS', 'Final', 2478, 'unidad', 1, null),
  ('F0032', 'FILM PROTECTOR ANCHO 50cm', null, 14774.21, 'ARS', 'Final', 14774.21, 'unidad', 1, null),
  ('F0033', 'FILTRO 3M 6001', null, 23791, 'ARS', 'Final', 23791, 'unidad', 1, null),
  ('F0034', 'PREFILTRO 3M 5N11', null, 3332.3101, 'ARS', 'Final', 3332.3101, 'unidad', 1, null),
  ('F0035', 'Retenedor 3M 501 P/PREFILTRO', null, 8397, 'ARS', 'Final', 8397, 'unidad', 1, null),
  ('F0037', 'FILTRO PINTURA FILPINT x10uni', null, 2691.53, 'ARS', '+IVA', 2691.53, 'unidad', 10, null),
  ('F00371', 'FILTRO PINTURA x10uni', null, 2149.88, 'ARS', '+IVA', 2149.88, 'unidad', 10, null),
  ('F0042', 'FLAP #40 IMPORTADO INOX', null, 2537.0363, 'ARS', '+IVA', 2537.0363, 'unidad', 1, null),
  ('F0043', 'FLAP #60 IMPORTADO INOX', null, 1771.4958, 'ARS', '+IVA', 1771.4958, 'unidad', 1, null),
  ('FIXDRYW812', 'FIX NEGRO DRYWALL 8x1 1/2', null, 14.34, 'ARS', '+IVA', 14.34, 'unidad', 1, null),
  ('FIXDRYW82', 'FIX NEGRO DRYWALL 8x2', null, 18.41, 'ARS', '+IVA', 18.41, 'unidad', 1, null),
  ('G0003', 'Gomitas Celeste grandes', null, 2443.32, 'ARS', 'Final', 2443.32, 'unidad', 1, '19789a90-b5ca-45f0-aac5-e3d652f2b292'),
  ('G0004', 'Gomitas Celeste mediana', null, 1736.56, 'ARS', 'Final', 1736.56, 'unidad', 1, null),
  ('G0005', 'GRASA DE LITIO x Kg', null, 17447.81, 'ARS', '+IVA', 17447.81, 'kg', 1, null),
  ('G0006', 'GUANTE VAQUETA x PAR', null, 4236, 'ARS', 'Final', 4236, 'par', 1, '2d977824-2baa-4a58-ac05-a523c3ac9c2a'),
  ('G0007', 'Guante moteado x Par', null, 691.0785, 'ARS', 'Final', 691.0785, 'par', 1, null),
  ('G0008', 'Guantes de latex x 100', null, 5200, 'ARS', 'Final', 5200, 'unidad', 100, 'c1866f5f-546a-4384-accb-713ac9943897'),
  ('G0009', 'GUANTES DE NITRILO X 100unid', null, 6955, 'ARS', 'Final', 6955, 'unidad', 100, null),
  ('G0010', 'GUANTE DE TELA NEGRO x par', null, 1066.45, 'ARS', '+IVA', 1066.45, 'par', 1, 'e08f7200-e3ee-4408-ba92-48f44664a78c'),
  ('GROW0002', 'Arandela Grower AISI304', '5/32', 0.009502, 'USD', 'Final', 14.633, 'unidad', 1, null),
  ('GROW0004', 'Arandela Grower AISI304', '1/4', 0.016041, 'USD', 'Final', 24.703, 'unidad', 1, null),
  ('GROW0005', 'Arandela Grower AISI304', '5/16', 0.026771, 'USD', 'Final', 41.2268, 'unidad', 1, null),
  ('GROW0006', 'Arandela Grower AISI304', '3/8', 0.035627, 'USD', 'Final', 54.8656, 'unidad', 1, null),
  ('GROW0008', 'Arandela Grower AISI304', '1/2', 0.066356, 'USD', 'Final', 102.1879, 'unidad', 1, null),
  ('GROW0010', 'Arandela Grower AISI304', '5/8', 0.140071, 'USD', 'Final', 215.7089, 'unidad', 1, null),
  ('H0001', 'S1122 HF/VFHoja SIERRA Blister', null, 29300.2609, 'ARS', '+IVA', 29300.2609, 'unidad', 1, null),
  ('H0002', 'S1130CF SIERRA SABLE Blister', null, 51083.07, 'ARS', '+IVA', 51083.07, 'unidad', 1, null),
  ('H00022', 'SIERRA SABLE PAYA 9"', null, 26780, 'ARS', '+IVA', 26780, 'unidad', 1, null),
  ('H00023', 'SIERRA SABLE BOSCH EDGE', null, 42700, 'ARS', '+IVA', 42700, 'unidad', 1, null),
  ('H00024', 'S1241HM SIERRA SABLE BOSH', null, 38417, 'ARS', '+IVA', 38417, 'unidad', 1, null),
  ('H00025', 'SIERRA SABLE FIBER RL 9"', null, 22930, 'ARS', '+IVA', 22930, 'unidad', 1, null),
  ('H0003', 'T101AO Hoja calar Blister', null, 10581.9804, 'ARS', '+IVA', 10581.9804, 'unidad', 1, '79b259eb-50ef-45c0-827b-ed7d39a6f6d1'),
  ('H0005', 'T101B Hoja calar Blister', null, 10229.2902, 'ARS', '+IVA', 10229.2902, 'unidad', 1, 'cae1afc1-7bd3-47da-b220-222004528ea6'),
  ('H0006', 'T101BR Hoja calar Blister', null, 11190.8023, 'ARS', '+IVA', 11190.8023, 'unidad', 1, null),
  ('H0010', 'T118B Hoja calar Blister', null, 10240.8866, 'ARS', '+IVA', 10240.8866, 'unidad', 1, '83d8bec2-4adb-419a-8c40-41d6f59302a0'),
  ('H0015', 'T127D Hoja calar Blister', null, 11492.548, 'ARS', '+IVA', 11492.548, 'unidad', 1, null),
  ('H0016', 'T130RIF Hoja calar Blister', null, 29900, 'ARS', '+IVA', 29900, 'unidad', 1, null),
  ('H00161', 'T130RF PRO Hoja calar Blister', null, 19458.2, 'ARS', '+IVA', 19458.2, 'unidad', 1, null),
  ('H00163', 'T130 STARRET', null, 7432, 'ARS', '+IVA', 7432, 'unidad', 1, null),
  ('H0019', 'T244D Hoja calar Blister', null, 8289.1224, 'ARS', '+IVA', 8289.1224, 'unidad', 1, null),
  ('H0020', 'T301CD Hoja calar Blister', null, 12026.9205, 'ARS', '+IVA', 12026.9205, 'unidad', 1, '9456ce41-659c-4aac-9877-ce614ea2fb31'),
  ('H0022', 'T318B Hoja calar Blister', null, 10694.57, 'ARS', '+IVA', 10694.57, 'unidad', 1, null),
  ('H00221', 'T345XF Hoja calar Blister', null, 8711.81, 'ARS', '+IVA', 8711.81, 'unidad', 1, null),
  ('H0023', 'S1136 CHF SIERRA SABLE', null, 50806.087, 'ARS', '+IVA', 50806.087, 'unidad', 1, null),
  ('HEX0004', 'Bulon hexagonal AISI304', '3/16 X 3/4', 0.087362, 'USD', 'Final', 134.5369, 'unidad', 1, null),
  ('HEX0017', 'Bulon hexagonal AISI304', '1/4 x 3/4', 0.095763, 'USD', 'Final', 147.4749, 'unidad', 1, null),
  ('HEX0019', 'Bulon hexagonal AISI304', '1/4 X 1', 0.107608, 'USD', 'Final', 165.717, 'unidad', 1, null),
  ('HEX0020', 'Bulon hexagonal AISI304', '1/4 X 1 1/4', 0.126013, 'USD', 'Final', 194.0595, 'unidad', 1, null),
  ('HEX0021', 'Bulon hexagonal AISI304', '1/4 X 1 1/2', 0.149196, 'USD', 'Final', 229.762, 'unidad', 1, null),
  ('HEX0023', 'Bulon hexagonal AISI304', '1/4 X 2"', 0.182812, 'USD', 'Final', 281.5307, 'unidad', 1, null),
  ('HEX0025', 'Bulon hexagonal AISI304', '1/4 X 2 1/2', 0.220735, 'USD', 'Final', 339.9323, 'unidad', 1, null),
  ('HEX0027', 'Bulon hexagonal AISI304', '1/4 X 3', 0.266229, 'USD', 'Final', 409.9929, 'unidad', 1, null),
  ('HEX0029', 'Bulon hexagonal AISI304', '1/4 X 4', 0.409939, 'USD', 'Final', 631.3055, 'unidad', 1, null),
  ('HEX0040', 'Bulon hexagonal AISI304', '5/16 X 1 1/2', 0.207277, 'USD', 'Final', 319.2062, 'unidad', 1, null),
  ('HEX0042', 'Bulon hexagonal AISI304', '5/16 X 2"', 0.246988, 'USD', 'Final', 380.3611, 'unidad', 1, null),
  ('HEX0057', 'Bulon hexagonal AISI304', '3/8 X 1"', 0.245776, 'USD', 'Final', 378.4948, 'unidad', 1, null),
  ('HEX0059', 'Bulon hexagonal AISI304', '3/8 X 1 1/2', 0.296629, 'USD', 'Final', 456.8088, 'unidad', 1, null),
  ('HEX0061', 'Bulon hexagonal AISI304', '3/8 X 2"', 0.357261, 'USD', 'Final', 550.1815, 'unidad', 1, null),
  ('HEX0063', 'Bulon hexagonal AISI304', '3/8 X 2 1/2', 0.472066, 'USD', 'Final', 726.9817, 'unidad', 1, null),
  ('HEX0065', 'Bulon hexagonal AISI304', '3/8 X 3"', 0.473739, 'USD', 'Final', 729.5576, 'unidad', 1, null),
  ('HEX0067', 'Bulon hexagonal AISI304', '3/8 X 4"', 0.770145, 'USD', 'Final', 1186.0238, 'unidad', 1, null),
  ('HEX0091', 'Bulon hexagonal AISI304', '1/2- 12 X 1"', 0.465381, 'USD', 'Final', 716.6874, 'unidad', 1, null),
  ('HEX0093', 'Bulon hexagonal AISI304', '1/2- 12 X 1 1/2', 0.565413, 'USD', 'Final', 870.7363, 'unidad', 1, null),
  ('HEX0095', 'Bulon hexagonal AISI304', '1/2- 12 X 2"', 0.658979, 'USD', 'Final', 1014.8273, 'unidad', 1, null),
  ('HEX0099', 'Bulon hexagonal AISI304', '1/2- 12 X 3"', 1.019978, 'USD', 'Final', 1570.7664, 'unidad', 1, null),
  ('HEX0100', 'Bulon hexagonal AISI304', '1/2- 12 X 3 1/2', 1.111028, 'USD', 'Final', 1710.9838, 'unidad', 1, null),
  ('HEX0101', 'Bulon hexagonal AISI304', '1/2- 12 X 4"', 1.214587, 'USD', 'Final', 1870.4634, 'unidad', 1, null),
  ('HEX0144', 'Bulon hexagonal AISI304', '5/8 X 2 1/2', 1.736824, 'USD', 'Final', 2674.7084, 'unidad', 1, null),
  ('HEX0146', 'Bulon hexagonal AISI304', '5/8 X 3"', 1.591888, 'USD', 'Final', 2451.5069, 'unidad', 1, null),
  ('HEX0147', 'Bulon hexagonal AISI304', '5/8 X 3 1/2', 1.892718, 'USD', 'Final', 2914.7851, 'unidad', 1, null),
  ('HEX0160', 'Bulon hexagonal AISI304', '3/4 X 3 1/2', 2.921779, 'USD', 'Final', 4499.5397, 'unidad', 1, null),
  ('INTERFACE1', 'INTERFACE 6"', null, 7189, 'ARS', 'Final', 7189, 'unidad', 1, null),
  ('K0001', 'KEROSENE X LTS', null, 3870, 'ARS', 'Final', 3870, 'litro', 1, null),
  ('L0002', 'LAMPARA LED CLASICA 14W FRIA', null, 1872, 'ARS', '+IVA', 1872, 'unidad', 1, null),
  ('L0003', 'LED HIGH WATTAGE 40W FRIA 220V', null, 6858.8, 'ARS', '+IVA', 6858.8, 'unidad', 1, null),
  ('L0005', 'Lapiz Carpintero IMPOR NEGRO', null, 662.2068, 'ARS', 'Final', 662.2068, 'unidad', 1, '62b57b9c-6438-4344-8f51-83a1160ec3f6'),
  ('L0008', 'LIJA AL AGUA AA #80', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, 'bcd4e024-9a52-4662-aebe-ac237c68976e'),
  ('L0011', 'LIJA AL AGUA AA #150', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, null),
  ('L0012', 'LIJA AL AGUA AA#180', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, null),
  ('L0013', 'LIJA AL AGUA AA #220', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, 'de60eee1-6711-4901-81df-0912caa2ab95'),
  ('L0014', 'LIJA AL AGUA AA #240', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, null),
  ('L0015', 'LIJA AL AGUA AA #280', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, '90c43d1c-ebc9-42f6-ad71-fb533b934c46'),
  ('L0016', 'LIJA AL AGUA AA #320', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, '358a3383-a1ce-4f00-8b6a-bf1affa5ab81'),
  ('L0017', 'LIJA AL AGUA AA #360', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, 'aa22601c-0ead-4a0c-bc9a-c6aa385efcfd'),
  ('L0018', 'LIJA AL AGUA AA #400', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, '9e410cec-df14-4230-ba67-3c95f012685d'),
  ('L0019', 'LIJA AL AGUA AA #600', null, 580.777392, 'ARS', '+IVA', 580.7774, 'unidad', 1, '411ccf42-dc1c-4b15-b798-23ece38d7cf7'),
  ('L0020', 'LIJA A/AGUA AA MICROGRANO#1000', null, 905.84208, 'ARS', '+IVA', 905.8421, 'unidad', 1, '111f6a93-734d-4136-a613-c8eba4bfe8c6'),
  ('L0021', 'LIJA A/AGUA AA MICROGRANO#1200', null, 905.84208, 'ARS', '+IVA', 905.8421, 'unidad', 1, '10591c1b-fea8-4f79-83d0-ae27374db9e2'),
  ('L0022', 'LIJA A/AGUA AA MICROGRANO#1500', null, 905.84208, 'ARS', '+IVA', 905.8421, 'unidad', 1, '1a7f4d50-5ce1-4646-b244-f8f280a80559'),
  ('L0023', 'LIJA A/AGUA AA MICROGRANO#2000', null, 1334.929232, 'ARS', '+IVA', 1334.9292, 'unidad', 1, '7e0fbbba-c99c-4a01-8695-412b6c17f8ae'),
  ('L0025', 'LIJA EN BANDA Ø 100', null, 4449.8835, 'ARS', '+IVA', 4449.8835, 'unidad', 1, null),
  ('L0028', 'LIJA EN BANDA 6300 X 150 #40', null, 27657.6329, 'ARS', '+IVA', 27657.6329, 'unidad', 1, null),
  ('L0029', 'LIJA EN BANDA 6300 X 150 #60', null, 23245.5541, 'ARS', '+IVA', 23245.5541, 'unidad', 1, '3546bdb3-4773-47af-90cd-b56f51ae394d'),
  ('L0037', 'Lija en rollo 0,12x45mts #36', null, 143906.136313, 'ARS', '+IVA', 143906.1363, 'metro', 45, null),
  ('L0038', 'Lija en rollo 0,12x45mts #40', null, 130522.723738, 'ARS', '+IVA', 130522.7237, 'metro', 45, null),
  ('L0040', 'Lija en rollo 0,12x45mts #60', null, 108139.720039, 'ARS', '+IVA', 108139.72, 'metro', 45, null),
  ('L0041', 'Lija en rollo 0,12x45mts #80', null, 99070.544446, 'ARS', '+IVA', 99070.5444, 'metro', 45, null),
  ('L0042', 'Lija en rollo 0,12x45mts #100', null, 90004.097657, 'ARS', '+IVA', 90004.0977, 'metro', 45, null),
  ('L00431', 'Rollo Lija #40 Importado', null, 113360, 'ARS', 'Final', 113360, 'unidad', 1, null),
  ('L00432', 'Rollo Lija #60 Importado', null, 74280, 'ARS', 'Final', 74280, 'unidad', 1, null),
  ('L00433', 'Rollo Lija #80 Importado', null, 66830, 'ARS', 'Final', 66830, 'unidad', 1, null),
  ('L0062', 'LIJA IMPORTADA NO PAST #80', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, 'fa83271a-0173-44e1-bea9-47d7cb66e2ad'),
  ('L0063', 'LIJA IMPORTADA NO PAST #100', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '379d4e08-dd4f-46b2-bfc6-65b2c22b0d7e'),
  ('L0064', 'LIJA IMPORTADA NO PAST #120', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '1ea820f0-6958-45d6-905e-af3bd8639cc2'),
  ('L0065', 'LIJA IMPORTADA NO PAST #150', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '9ff616b7-37c6-4486-a77e-710ba31ae472'),
  ('L0066', 'LIJA IMPORTADA NO PAST #180', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '8274facf-ade4-4ac0-97cf-a88334e37b67'),
  ('L0067', 'LIJA IMPORTADA NO PAST #220', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '0a1ca42b-499c-46d2-b2e5-16a96fb77278'),
  ('L0068', 'LIJA IMPORTADA NO PAST #240', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '505d6c87-3791-452f-9ed2-450dffa57a1c'),
  ('L0069', 'LIJA IMPORTADA NO PAST #280', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '94e927f6-ba1e-430a-93d7-b18131f401be'),
  ('L0070', 'LIJA IMPORTADA NO PAST #320', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, 'bf694874-4ab1-42ea-9ed9-6db3359ffbe3'),
  ('L0072', 'LIJA IMPORTADA NO PAST #400', null, 0.35, 'USD', '+IVA', 539, 'unidad', 1, '07e0062c-1831-4935-8dab-3d7a5f5a9b27'),
  ('LIJA100XMT', 'LIJA X METRO #100', null, 2111.7483, 'ARS', '+IVA', 2111.7483, 'metro', 1, null),
  ('LIJA36XMTS', 'LIJA X METRO #36', null, 3379.0735, 'ARS', '+IVA', 3379.0735, 'metro', 1, null),
  ('LIJA60XMTS', 'LIJA X METRO #60', null, 2537.4148, 'ARS', '+IVA', 2537.4148, 'metro', 1, null),
  ('LIJA80XMTS', 'LIJA X METRO #80', null, 2324.5815, 'ARS', '+IVA', 2324.5815, 'metro', 1, null),
  ('M00001', 'MAMELUCO SIN LAMINAR 60gr', null, 4743.3725, 'ARS', 'Final', 4743.3725, 'unidad', 1, null),
  ('M0001', 'MAMELUCO BLANCO LAMINADO', null, 5143.0949, 'ARS', 'Final', 5143.0949, 'unidad', 1, null),
  ('M0001REF', 'MAMELUCO BLANCO REFORZADO', null, 6830, 'ARS', 'Final', 6830, 'unidad', 1, null),
  ('M0002', 'MANDRIL P/PIROBANDA Ø 10', null, 14246.5562, 'ARS', 'Final', 14246.5562, 'unidad', 1, null),
  ('M0003', 'MANDRIL P/PIROBANDA Ø 15', null, 16357.1684, 'ARS', 'Final', 16357.1684, 'unidad', 1, null),
  ('M0004', 'MANDRIL P/PIROBANDA Ø 19', null, 16608.4225, 'ARS', 'Final', 16608.4225, 'unidad', 1, null),
  ('M0005', 'MANDRIL P/PIROBANDA Ø 25', null, 16859.691, 'ARS', 'Final', 16859.691, 'unidad', 1, null),
  ('M0006', 'MANDRIL P/PIROBANDA Ø 30', null, 19246.6768, 'ARS', 'Final', 19246.6768, 'unidad', 1, null),
  ('M0007', 'MANDRIL P/PIROBANDA Ø 45', null, 23744.2748, 'ARS', 'Final', 23744.2748, 'unidad', 1, null),
  ('M0008', 'Mango p/Rodillo NRO. 10', null, 1092.2538, 'ARS', 'Final', 1092.2538, 'unidad', 1, '360ec214-81e9-4f34-859c-26578cfb4f9f'),
  ('M0009', 'Mango p/Rodillo NRO. 17', null, 1128.8424, 'ARS', 'Final', 1128.8424, 'unidad', 1, '7316bf81-7917-4e54-af5a-b26c1b54d5d6'),
  ('M0010', 'Mascara 3M 6200', null, 48987, 'ARS', 'Final', 48987, 'unidad', 1, null),
  ('M0015', 'Masilla Finish Zeocar x 4Kg', null, 34170, 'ARS', '+IVA', 34170, 'kg', 4, 'c46658a8-dc4b-4fcd-9e81-8324f92abb79'),
  ('M0016', 'Masilla Zeocar Azul x 1Kg', null, 10998.0455, 'ARS', '+IVA', 10998.0455, 'kg', 1, null),
  ('M0017', 'Masilla Zeocar Azul x4KG', null, 26862, 'ARS', '+IVA', 26862, 'kg', 4, null),
  ('M0018', 'METRO MADERA X 1MTS', null, 4994, 'ARS', 'Final', 4994, 'unidad', 1, null),
  ('M0023', 'MECHA DIAM 2', null, 791.68, 'ARS', '+IVA', 791.68, 'unidad', 1, '705c6ec5-9273-451c-a86d-18d856927899'),
  ('M0024', 'MECHA DIAM 2,25', null, 803.83, 'ARS', '+IVA', 803.83, 'unidad', 1, 'c9aba7e9-dcf9-4937-a662-fd15e3d033c4'),
  ('M0025', 'MECHA DIAM 2,50', null, 803.83, 'ARS', '+IVA', 803.83, 'unidad', 1, '747f7336-76ef-435e-b181-f7c083fe4491'),
  ('M0026', 'MECHA DIAM 2,75', null, 898.5, 'ARS', '+IVA', 898.5, 'unidad', 1, 'f8c08c1d-6aed-437c-ad4a-180156f9da11'),
  ('M0027', 'MECHA DIAM 3', null, 898.5, 'ARS', '+IVA', 898.5, 'unidad', 1, 'd0af23fb-00ef-4fd4-aade-beacf528caf0'),
  ('M0028', 'MECHA DIAM 3,25', null, 995.26, 'ARS', '+IVA', 995.26, 'unidad', 1, 'd1a7e791-1d3c-4c1e-a633-56933fb74ebc'),
  ('M0029', 'MECHA DIAM 3,50', null, 995.26, 'ARS', '+IVA', 995.26, 'unidad', 1, '7d35f6d6-8fd2-4e2a-b3cd-968f5af99d24'),
  ('M0030', 'MECHA DIAM 3,75', null, 1186.48, 'ARS', '+IVA', 1186.48, 'unidad', 1, '113f2eb4-c994-4376-9daf-329c87403ece'),
  ('M0031', 'MECHA DIAM 4', null, 1186.48, 'ARS', '+IVA', 1186.48, 'unidad', 1, 'f66e70d8-f3b6-4e19-8e15-8abbfbaa8b55'),
  ('M0032', 'MECHA DIAM 4,25', null, 1368.48, 'ARS', '+IVA', 1368.48, 'unidad', 1, '0a8ac6cd-7767-4df9-81d9-413d0095edd2'),
  ('M0033', 'MECHA DIAM 4,50', null, 1368.48, 'ARS', '+IVA', 1368.48, 'unidad', 1, '70edb02b-dae4-42b7-8c80-777324c2b13d'),
  ('M0034', 'MECHA DIAM 4,75', null, 1589.54, 'ARS', '+IVA', 1589.54, 'unidad', 1, '07bac757-3165-4514-943e-6b5e197abdeb'),
  ('M0035', 'MECHA DIAM 5', null, 1589.54, 'ARS', '+IVA', 1589.54, 'unidad', 1, '6b209144-b074-4c66-ae6e-c00c2173144b'),
  ('M0036', 'MECHA DIAM 5,25', null, 1679.6, 'ARS', '+IVA', 1679.6, 'unidad', 1, '96209e71-3209-4b91-8552-b9b0f859cf1e'),
  ('M0037', 'MECHA DIAM 5,50', null, 1679.6, 'ARS', '+IVA', 1679.6, 'unidad', 1, '656f98f2-7f9d-46cd-a25d-78a2ff2f8aa8'),
  ('M0038', 'MECHA DIAM 5,75', null, 2087.13, 'ARS', '+IVA', 2087.13, 'unidad', 1, '8682b8a5-7ec2-4d95-977b-4dadd6724acc'),
  ('M0039', 'MECHA DIAM 6', null, 2087.13, 'ARS', '+IVA', 2087.13, 'unidad', 1, 'ed27abd7-7c8d-40d3-b918-f711ebc3fc8f'),
  ('M0040', 'MECHA DIAM 6,25', null, 2431.6, 'ARS', '+IVA', 2431.6, 'unidad', 1, 'e7acca3f-8d47-4927-8fe5-2cea545015ee'),
  ('M0041', 'MECHA DIAM 6,50', null, 2431.6, 'ARS', '+IVA', 2431.6, 'unidad', 1, '7a5992e7-5377-4481-9c21-3dd1a0d43cef'),
  ('M0042', 'MECHA DIAM 6,75', null, 2884.15, 'ARS', '+IVA', 2884.15, 'unidad', 1, 'f14d550d-2118-4b25-a976-1a62c53b84e5'),
  ('M0043', 'MECHA DIAM 7', null, 2884.15, 'ARS', '+IVA', 2884.15, 'unidad', 1, 'aa8fc913-c26a-485c-960f-4cb5d16049d4'),
  ('M0044', 'MECHA DIAM 7,25', null, 3161.08, 'ARS', '+IVA', 3161.08, 'unidad', 1, '0a71ff7c-bd54-4bb4-9d67-d0c8c3c07d1f'),
  ('M0045', 'MECHA DIAM 7,5', null, 3161.08, 'ARS', '+IVA', 3161.08, 'unidad', 1, '1b144795-b2fa-4dd2-a05c-299dd318c417'),
  ('M0046', 'MECHA DIAM 7,75', null, 3494.3, 'ARS', '+IVA', 3494.3, 'unidad', 1, 'f9376277-a73c-4357-bb13-9c60d5fbddfe'),
  ('M0047', 'MECHA DIAM 8', null, 3619.09, 'ARS', '+IVA', 3619.09, 'unidad', 1, '0806abbc-339d-49e4-83f7-d5720c704145'),
  ('M00471', 'MECHA DIAM 8,25', null, 4230.05, 'ARS', '+IVA', 4230.05, 'unidad', 1, 'e20ce8ad-fca3-482f-9535-04b7a076effd'),
  ('M0048', 'MECHA DIAM 8,50', null, 4230.05, 'ARS', '+IVA', 4230.05, 'unidad', 1, null),
  ('M00481', 'MECHA DIAM 8,75', null, 4663.78, 'ARS', '+IVA', 4663.78, 'unidad', 1, '585df7c6-88d2-4bac-96e2-0e2bc39e2ff9'),
  ('M0049', 'MECHA DIAM 9', null, 4663.78, 'ARS', '+IVA', 4663.78, 'unidad', 1, '8d16a78d-b216-42e9-ba9e-243f539eb6af'),
  ('M00491', 'MECHA DIAM 9,25', null, 5008.9, 'ARS', '+IVA', 5008.9, 'unidad', 1, '8e7a4474-8057-4432-92b6-27d07ed4d4d7'),
  ('M0050', 'MECHA DIAM 9,5', null, 5008.9, 'ARS', '+IVA', 5008.9, 'unidad', 1, '7c2c7126-294e-4b46-b1af-186ef108f44e'),
  ('M00501', 'MECHA DIAM 9,75', null, 5134.82, 'ARS', '+IVA', 5134.82, 'unidad', 1, '0f8a17d8-8600-4b6a-95b5-bb98b4104aae'),
  ('M0051', 'MECHA DIAM 10', null, 5254.24, 'ARS', '+IVA', 5254.24, 'unidad', 1, 'c08aed36-691c-4b41-80c6-6ec8245a984a'),
  ('M0053', 'MECHA DIAM 11', null, 6910.2, 'ARS', '+IVA', 6910.2, 'unidad', 1, '269d3010-8c76-4a73-835f-95c9b1e16641'),
  ('M0055', 'MECHA DIAM 12', null, 8327.56, 'ARS', '+IVA', 8327.56, 'unidad', 1, '2ef47738-76b6-465d-bb2a-8175ba11a553'),
  ('M0057', 'MECHA DIAM 13', null, 10505.87, 'ARS', '+IVA', 10505.87, 'unidad', 1, '273efba0-d07b-4295-bd25-855a14242952'),
  ('M0059', 'MECHA DIAM 14', null, 18415.72, 'ARS', '+IVA', 18415.72, 'unidad', 1, null),
  ('MANG013', 'MANG CRISTAL C/ALAMB ATOX DIAM', null, 4950.4, 'ARS', '+IVA', 4950.4, 'unidad', 1, null),
  ('MANG014', 'MANG CRISTAL C/ALAMB ATOX DIAM', null, 6554.6208, 'ARS', '+IVA', 6554.6208, 'unidad', 1, null),
  ('MANG015', 'MANG CRISTAL C/ALAMB ATOX DIAM', null, 9623.0938, 'ARS', '+IVA', 9623.0938, 'unidad', 1, null),
  ('MANG016', 'MANG CRISTAL C/ALAMB ATOX DIAM', null, 14328.9317, 'ARS', '+IVA', 14328.9317, 'unidad', 1, null),
  ('MANG017', 'MANG CRISTAL C/ALAMB ATOX DIAM', null, 19446.0739, 'ARS', '+IVA', 19446.0739, 'unidad', 1, null),
  ('MANG021', 'MANG MALLADA ROJA DIAM 10mm', null, 2962.5537, 'ARS', '+IVA', 2962.5537, 'unidad', 1, null),
  ('MANG026', 'MANG CRISTAL HIDROCAR DIAM', null, 1562.4504, 'ARS', '+IVA', 1562.4504, 'unidad', 1, null),
  ('MANG028', 'MANG CRISTAL HIDROCAR DIAM', null, 3968.7813, 'ARS', '+IVA', 3968.7813, 'unidad', 1, null),
  ('MANG029', 'MANG CRISTAL HIDROCAR DIAM', null, 4659.2, 'ARS', '+IVA', 4659.2, 'unidad', 1, null),
  ('MANG031', 'MANG MALLADA ATOXICA (SOLYON)', null, 3970.3459, 'ARS', '+IVA', 3970.3459, 'unidad', 1, null),
  ('MANG0332', 'MANG GOMA Y TELA DIAM 38mm', null, 32949, 'ARS', '+IVA', 32949, 'unidad', 1, null),
  ('MANG034', 'MANG GOMA Y TELA DIAM 127mm', null, 135406, 'ARS', '+IVA', 135406, 'unidad', 1, null),
  ('MANG036', 'MANG GOMA Y TELA DIAM 150mm', null, 163775, 'ARS', '+IVA', 163775, 'unidad', 1, null),
  ('MANG037', 'MANG GOMA Y TELA DIAM 90mm', null, 63067.8645, 'ARS', '+IVA', 63067.8645, 'unidad', 1, null),
  ('MANG0381', 'MANG GOMA Y TELA DIAM 76mm', null, 54221.0244, 'ARS', '+IVA', 54221.0244, 'unidad', 1, null),
  ('MANG0382', 'MANG GOMA Y TELA DIAM 250mm', null, 268300, 'ARS', '+IVA', 268300, 'unidad', 1, null),
  ('MANG041', 'MANG GOMA, TELA Y ALAMBRE DIAM', null, 41919.36, 'ARS', '+IVA', 41919.36, 'unidad', 1, null),
  ('MANG042', 'MANG GOMA, TELA Y ALAMBRE DIAM', null, 46185.53, 'ARS', '+IVA', 46185.53, 'unidad', 1, null),
  ('MANG0422', 'MANG GOMA, TELA Y ALAMBRE DIAM', null, 54666.5805, 'ARS', '+IVA', 54666.5805, 'unidad', 1, null),
  ('MANG054', 'MANGUERA RECYLON PLUS', null, 2749.705, 'ARS', '+IVA', 2749.705, 'unidad', 1, null),
  ('MECHCOPA32', 'MECHA COPA DIAM32', null, 7340, 'ARS', '+IVA', 7340, 'unidad', 1, null),
  ('MECHCOPA57', 'MECHA COPA DIAM57', null, 10760.049, 'ARS', '+IVA', 10760.049, 'unidad', 1, null),
  ('MECHCOPA76', 'MECHA COPA DIAM76', null, 14077.2799, 'ARS', '+IVA', 14077.2799, 'unidad', 1, null),
  ('NYLONBURBU', 'PLURIBOL x25mts', null, 20940, 'ARS', 'Final', 20940, 'metro', 25, null),
  ('P0001', 'PAÑO LUSTRE PICO ROJO', null, 8858, 'ARS', 'Final', 8858, 'unidad', 1, '55d89204-3c9c-4f10-9c94-31ec9ce89162'),
  ('P0004', 'PAPEL HIGIENICO x 30 rollos', null, 16455.2388, 'ARS', 'Final', 16455.2388, 'rollo', 30, null),
  ('P00041', 'PAPEL HIGIENICO ROLLO GRANDE', null, 1837.5, 'ARS', 'Final', 1837.5, 'unidad', 1, null),
  ('P0005', 'Pasta Fina Zeocar X 1kg', null, 12220, 'ARS', '+IVA', 12220, 'kg', 1, 'dda985d8-ed0c-4bff-8cb7-6d4a21e86b8a'),
  ('P00113', 'PASTA GRUESA ZEOCAR X 1/2 KG', null, 7627, 'ARS', '+IVA', 7627, 'kg', 0.5, null),
  ('P0013', 'PINCEL LETRISTA/RETOQUE Nro 2', null, 869.71, 'ARS', 'Final', 869.71, 'unidad', 1, null),
  ('P0014', 'PINCEL LETRISTA/RETOQUE Nro 4', null, 1094.39, 'ARS', 'Final', 1094.39, 'unidad', 1, null),
  ('P0015', 'PINCEL LETRISTA/RETOQUE Nro 6', null, 1297.33, 'ARS', 'Final', 1297.33, 'unidad', 1, null),
  ('P0016', 'PINCEL LETRISTA/RETOQUE Nro 8', null, 1507.5, 'ARS', 'Final', 1507.5, 'unidad', 1, null),
  ('P00161', 'PINCEL LETRISTA/RETOQUE Nro 10', null, 1978.6, 'ARS', 'Final', 1978.6, 'unidad', 1, null),
  ('P0017', 'Pincel Nº 20 - Cerda CHINA', null, 832, 'ARS', 'Final', 832, 'unidad', 1, '5545e48b-f7cd-4b99-8bf9-a10729bb57a1'),
  ('P0019', 'Pincel Nº 25 - Cerda CHINA', null, 1073, 'ARS', 'Final', 1073, 'unidad', 1, '84583c11-0060-4540-874c-d1a972e0482c'),
  ('P0021', 'PINCEL Nro 10', null, 771.1095, 'ARS', 'Final', 771.1095, 'unidad', 1, null),
  ('P0027', 'PIROBANDA Ø 10 #36/40', null, 3276.0307, 'ARS', '+IVA', 3276.0307, 'unidad', 1, null),
  ('P0029', 'PIROBANDA Ø 15 #36/40', null, 3742.508, 'ARS', '+IVA', 3742.508, 'unidad', 1, null),
  ('P0031', 'PIROBANDA Ø 19 #36/40', null, 3953.6339, 'ARS', '+IVA', 3953.6339, 'unidad', 1, null),
  ('P0033', 'PIROBANDA Ø 25 #36/40', null, 4285.1733, 'ARS', '+IVA', 4285.1733, 'unidad', 1, null),
  ('P0035', 'PIROBANDA Ø 30 #36/40', null, 4493.4944, 'ARS', '+IVA', 4493.4944, 'unidad', 1, null),
  ('P0037', 'PIROBANDA Ø 45 #36/40', null, 4905.6696, 'ARS', '+IVA', 4905.6696, 'unidad', 1, null),
  ('P00391', 'PISTOLA SOPLETEO', null, 9566.58, 'ARS', '+IVA', 9566.58, 'unidad', 1, null),
  ('P00392', 'PISTOLA SOPLETEO LARGA', null, 10404.18, 'ARS', '+IVA', 10404.18, 'unidad', 1, null),
  ('P0040', 'PLASTILINA GRANDE', null, 3170, 'ARS', 'Final', 3170, 'unidad', 1, null),
  ('P0041GRIS', 'POXIPOL 700ml GRIS', null, 80788.581, 'ARS', '+IVA', 80788.581, 'litro', 0.7, null),
  ('P0041TRANS', 'POXIPOL 700ml TRANSPARENTE', null, 80788.581, 'ARS', '+IVA', 80788.581, 'litro', 0.7, null),
  ('P0043', 'POXIPOL MEDIANO x 70ml', null, 13233.4525, 'ARS', '+IVA', 13233.4525, 'litro', 0.07, null),
  ('P0045', 'PRECINTOS X 15cm x100unid', null, 1866.46, 'ARS', '+IVA', 1866.46, 'unidad', 100, null),
  ('P0047', 'PRECINTOS X 25cm x100unid', null, 3184.8, 'ARS', '+IVA', 3184.8, 'unidad', 100, null),
  ('P0048', 'PRECINTOS X 30cm x100unid', null, 4572.91, 'ARS', '+IVA', 4572.91, 'unidad', 100, null),
  ('P0049', 'PRECINTOS X 40cm x100unid', null, 6410, 'ARS', 'Final', 6410, 'unidad', 100, null),
  ('P00492', 'PRIMER TEROSON', null, 139723.75, 'ARS', 'Final', 139723.75, 'unidad', 1, null),
  ('P0051', 'PROTECCION AUDITIVA', null, 612.86, 'ARS', 'Final', 612.86, 'unidad', 1, null),
  ('P0053', 'PUNTAS PH1 X 50MM', null, 692, 'ARS', 'Final', 692, 'unidad', 1, null),
  ('P0053BOSCH', 'PUNTAS PH1 X 50MM BOSCH', null, 1355.03, 'ARS', '+IVA', 1355.03, 'unidad', 1, null),
  ('P0055', 'PUNTAS PH2 X 50MM', null, 692, 'ARS', 'Final', 692, 'unidad', 1, null),
  ('P00561', 'PH2x65 IMPACTO DOBLE PUNTA BOSCH', null, 1775.36, 'ARS', '+IVA', 1775.36, 'unidad', 1, null),
  ('P0056BOSCH', 'PUNTAS PH2 X 50MM BOSCH', null, 1148.14, 'ARS', '+IVA', 1148.14, 'unidad', 1, null),
  ('P0059', 'PUNTAS PH3 X 50MM', null, 692, 'ARS', 'Final', 692, 'unidad', 1, '63c0b9b2-bb24-4aa0-a493-c7c0eea9d035'),
  ('P0068', 'Prolongador Schneider 4 tomas', null, 12350, 'ARS', '+IVA', 12350, 'unidad', 1, null),
  ('PARFIJ0004', 'Parker cab fijadora AISI304', '4 X 1/2', 0.01828, 'USD', '+IVA', 28.1512, 'unidad', 1, '5f0dd58c-fa4b-4f12-b7b2-c661fecc872d'),
  ('PARFIJ0006', 'Parker cab fijadora AISI304', '4 X 3/4', 0.02047, 'USD', '+IVA', 31.5238, 'unidad', 1, '7be577d9-e434-434c-a325-f2ed23ca1db3'),
  ('PARFIJ0008', 'Parker cab fijadora AISI304', '4 X 1"', 0.02226, 'USD', '+IVA', 34.2804, 'unidad', 1, null),
  ('PARFIJ0011', 'Parker cab fijadora AISI304', '6 X 1/2', 0.02236, 'USD', '+IVA', 34.4344, 'unidad', 1, '8bb458bf-cd08-44c7-8339-8048e3b21b8c'),
  ('PARFIJ0013', 'Parker cab fijadora AISI304', '6 X 3/4', 0.02566, 'USD', '+IVA', 39.5164, 'unidad', 1, '76a43fab-b682-490a-b13d-403f799bf1e2'),
  ('PARFIJ0015', 'Parker cab fijadora AISI304', '6 X 1"', 0.02885, 'USD', '+IVA', 44.429, 'unidad', 1, 'caee3fae-dd8a-467c-b129-fb4425c8a9cf'),
  ('PARFIJ0016', 'Parker cab fijadora AISI304', '6 X 1 1/4', 0.032009, 'USD', '+IVA', 49.2946, 'unidad', 1, null),
  ('PARFIJ0017', 'Parker cab fijadora AISI304', '6 X 1 1/2', 0.034684, 'USD', '+IVA', 53.4132, 'unidad', 1, null),
  ('PARFIJ0019', 'Parker cab fijadora AISI304', '8 X 1/2', 0.03159, 'USD', '+IVA', 48.6486, 'unidad', 1, null),
  ('PARFIJ0021', 'Parker cab fijadora AISI304', '8 X 3/4', 0.032675, 'USD', '+IVA', 50.3203, 'unidad', 1, null),
  ('PARFIJ0023', 'Parker cab fijadora AISI304', '8 X 1"', 0.04101, 'USD', '+IVA', 63.1554, 'unidad', 1, '65d8d16a-6c6e-4e57-8075-ef670875d92a'),
  ('PARFIJ0024', 'Parker cab fijadora AISI304', '8 X 1 1/4', 0.04719, 'USD', '+IVA', 72.6726, 'unidad', 1, '0605008c-886f-4211-bff6-c498c6cd5e54'),
  ('PARFIJ0025', 'Parker cab fijadora AISI304', '8 X 1 1/2', 0.0463, 'USD', '+IVA', 71.302, 'unidad', 1, null),
  ('PARFIJ0027', 'Parker cab fijadora AISI304', '8 X 2"', 0.052801, 'USD', '+IVA', 81.3137, 'unidad', 1, null),
  ('PARFIJ0029', 'Parker cab fijadora AISI304', '10 X 1/2', 0.033435, 'USD', '+IVA', 51.4901, 'unidad', 1, null),
  ('PARFIJ0031', 'Parker cab fijadora AISI304', '10 X 3/4', 0.041708, 'USD', '+IVA', 64.2304, 'unidad', 1, 'd0a92751-7828-4975-ac73-f95c09d006ec'),
  ('PARFIJ0033', 'Parker cab fijadora AISI304', '10 X 1"', 0.043373, 'USD', '+IVA', 66.7945, 'unidad', 1, null),
  ('PARFIJ0034', 'Parker cab fijadora AISI304', '10 X 1 1/4', 0.044268, 'USD', '+IVA', 68.1727, 'unidad', 1, null),
  ('PARFIJ0035', 'Parker cab fijadora AISI304', '10 X 1 1/2', 0.055621, 'USD', '+IVA', 85.6566, 'unidad', 1, null),
  ('PARFIJ0037', 'Parker cab fijadora AISI304', '10 X 2"', 0.064446, 'USD', '+IVA', 99.2463, 'unidad', 1, null),
  ('PARFIJ0039', 'Parker cab fijadora AISI304', '10 X 2 1/2', 0.074883, 'USD', '+IVA', 115.3199, 'unidad', 1, null),
  ('PARFIJ0040', 'Parker cab fijadora AISI304', '12 X 1/2', 0.05628, 'USD', '+IVA', 86.6712, 'unidad', 1, null),
  ('PARFIJ0042', 'Parker cab fijadora AISI304', '12 X 3/4', 0.05687, 'USD', '+IVA', 87.5797, 'unidad', 1, null),
  ('PARFIJ0044', 'Parker cab fijadora AISI304', '12 X 1"', 0.062885, 'USD', '+IVA', 96.8425, 'unidad', 1, null),
  ('PARFIJ0045', 'Parker cab fijadora AISI304', '12 X 1 1/4', 0.066298, 'USD', '+IVA', 102.0988, 'unidad', 1, null),
  ('PARFIJ0046', 'Parker cab fijadora AISI304', '12 X 1 1/2', 0.070231, 'USD', '+IVA', 108.1565, 'unidad', 1, null),
  ('PARFIJ0051', 'Parker cab fijadora AISI304', '14 X 1/2', 0.09876, 'USD', '+IVA', 152.0904, 'unidad', 1, null),
  ('PARFIJ0053', 'Parker cab fijadora AISI304', '14 X 3/4', 0.07942, 'USD', '+IVA', 122.3071, 'unidad', 1, null),
  ('PARFIJ0055', 'Parker cab fijadora AISI304', '14 X 1"', 0.089587, 'USD', '+IVA', 137.964, 'unidad', 1, '2f7331b8-61ed-4912-a87e-63b88418a628'),
  ('PARFIJ0056', 'Parker cab fijadora AISI304', '14 X 1 1/4', 0.099681, 'USD', '+IVA', 153.5088, 'unidad', 1, '81234934-0c7f-4aad-acd2-916874b80d36'),
  ('PARFIJ0057', 'Parker cab fijadora AISI304', '14 X 1 1/2', 0.11688, 'USD', '+IVA', 179.9952, 'unidad', 1, null),
  ('PARFRE0004', 'Parker cab frezada AISI304', '4 x 1/2', 0.01828, 'USD', '+IVA', 28.1512, 'unidad', 1, '10aac20f-882e-4d0e-8f8b-eb12ed4abbf2'),
  ('PARFRE0006', 'Parker cab frezada AISI304', '4 x 3/4', 0.02047, 'USD', '+IVA', 31.5238, 'unidad', 1, 'bffe7f48-2855-43d2-bdf1-0bbb320a8798'),
  ('PARFRE0008', 'Parker cab frezada AISI304', '4 x 1"', 0.02226, 'USD', '+IVA', 34.2804, 'unidad', 1, 'e4d322e7-c385-4419-abad-7d2a16377cca'),
  ('PARFRE0011', 'Parker cab frezada AISI304', '6 x 1/2', 0.02236, 'USD', '+IVA', 34.4344, 'unidad', 1, '2a2215a0-7fab-4076-94ec-2e25b68c7819'),
  ('PARFRE0013', 'Parker cab frezada AISI304', '6 x 3/4', 0.02566, 'USD', '+IVA', 39.5164, 'unidad', 1, 'ab32d2fa-e101-48d9-b0bf-0db349abffdc'),
  ('PARFRE0015', 'Parker cab frezada AISI304', '6 x 1"', 0.02885, 'USD', '+IVA', 44.429, 'unidad', 1, null),
  ('PARFRE0016', 'Parker cab frezada AISI304', '6 x 1 1/4', 0.03169, 'USD', '+IVA', 48.8026, 'unidad', 1, null),
  ('PARFRE0017', 'Parker cab frezada AISI304', '6 x 1 1/2', 0.03434, 'USD', '+IVA', 52.8836, 'unidad', 1, null),
  ('PARFRE0019', 'Parker cab frezada AISI304', '8 x 1/2', 0.028284, 'USD', '+IVA', 43.5575, 'unidad', 1, null),
  ('PARFRE0021', 'Parker cab frezada AISI304', '8 x 3/4', 0.032675, 'USD', '+IVA', 50.3203, 'unidad', 1, '50e545fd-3349-4a0e-bc59-75dbb2ff381f'),
  ('PARFRE0023', 'Parker cab frezada AISI304', '8 x 1"', 0.03684, 'USD', '+IVA', 56.7336, 'unidad', 1, null),
  ('PARFRE0024', 'Parker cab frezada AISI304', '8 x 1 1/4', 0.04019, 'USD', '+IVA', 61.8926, 'unidad', 1, null),
  ('PARFRE0025', 'Parker cab frezada AISI304', '8 x 1 1/2', 0.0447, 'USD', '+IVA', 68.838, 'unidad', 1, '9a9d6481-1c9e-4657-be6d-813732a9193a'),
  ('PARFRE0027', 'Parker cab frezada AISI304', '8 x 2"', 0.05228, 'USD', '+IVA', 80.5112, 'unidad', 1, null),
  ('PARFRE0029', 'Parker cab frezada AISI304', '10 x 1/2', 0.033435, 'USD', '+IVA', 51.4901, 'unidad', 1, null),
  ('PARFRE0031', 'Parker cab frezada AISI304', '10 x 3/4', 0.041708, 'USD', '+IVA', 64.2304, 'unidad', 1, null),
  ('PARFRE0033', 'Parker cab frezada AISI304', '10 x 1"', 0.043373, 'USD', '+IVA', 66.7945, 'unidad', 1, 'd8a79b2a-8fae-4ffd-b23d-5379ae3c61cb'),
  ('PARFRE0034', 'Parker cab frezada AISI304', '10 x 1 1/4', 0.044268, 'USD', '+IVA', 68.1727, 'unidad', 1, null),
  ('PARFRE0035', 'Parker cab frezada AISI304', '10 x 1 1/2', 0.055621, 'USD', '+IVA', 85.6566, 'unidad', 1, null),
  ('PARFRE0037', 'Parker cab frezada AISI304', '10 x 2"', 0.064446, 'USD', '+IVA', 99.2463, 'unidad', 1, null),
  ('PARFRE0039', 'Parker cab frezada AISI304', '10 x 2 1/2', 0.074883, 'USD', '+IVA', 115.3199, 'unidad', 1, null),
  ('PARFRE0042', 'Parker cab frezada AISI304', '12 x 3/4', 0.05687, 'USD', '+IVA', 87.5797, 'unidad', 1, null),
  ('PARFRE0044', 'Parker cab frezada AISI304', '12 x 1"', 0.062885, 'USD', '+IVA', 96.8425, 'unidad', 1, null),
  ('PARFRE0045', 'Parker cab frezada AISI304', '12 x 1 1/4', 0.066298, 'USD', '+IVA', 102.0988, 'unidad', 1, null),
  ('PARFRE0046', 'Parker cab frezada AISI304', '12 x 1 1/2', 0.070231, 'USD', '+IVA', 108.1565, 'unidad', 1, '39ad84e1-a5fd-43e5-86a6-98e5d0dda5ec'),
  ('PARFRE0050', 'Parker cab frezada AISI304', '12 x 2 1/2', 0.086736, 'USD', '+IVA', 133.573, 'unidad', 1, null),
  ('PARFRE0055', 'Parker cab frezada AISI304', '14 x 1"', 0.089587, 'USD', '+IVA', 137.964, 'unidad', 1, 'afc0f0fa-1b9d-4e56-bf82-f76f353eb61e'),
  ('PARFRE0057', 'Parker cab frezada AISI304', '14 x 1 1/2', 0.105436, 'USD', '+IVA', 162.371, 'unidad', 1, null),
  ('PARFRE0062', 'Parker cab frezada AISI304', '14 x 2 3/4', 0.1737, 'USD', '+IVA', 267.498, 'unidad', 1, null),
  ('PARGOT0004', 'Parker cab gota AISI304', '4 x 1/2', 0.018461, 'USD', '+IVA', 28.4293, 'unidad', 1, null),
  ('PARGOT0006', 'Parker cab gota AISI304', '4 x 3/4', 0.020677, 'USD', '+IVA', 31.8428, 'unidad', 1, null),
  ('PARGOT0008', 'Parker cab gota AISI304', '4 x 1"', 0.022477, 'USD', '+IVA', 34.6152, 'unidad', 1, null),
  ('PARGOT0011', 'Parker cab gota AISI304', '6 x 1/2', 0.02236, 'USD', '+IVA', 34.4344, 'unidad', 1, null),
  ('PARGOT0013', 'Parker cab gota AISI304', '6 x 3/4', 0.02566, 'USD', '+IVA', 39.5164, 'unidad', 1, 'c84173d9-d68e-4196-abb8-4b556c655631'),
  ('PARGOT0015', 'Parker cab gota AISI304', '6 x 1"', 0.02885, 'USD', '+IVA', 44.429, 'unidad', 1, 'cc31fa33-2afa-45a5-9a73-f5d6115d3935'),
  ('PARGOT0016', 'Parker cab gota AISI304', '6 x 1 1/4', 0.032009, 'USD', '+IVA', 49.2946, 'unidad', 1, null),
  ('PARGOT0017', 'Parker cab gota AISI304', '6 x 1 1/2', 0.03434, 'USD', '+IVA', 52.8836, 'unidad', 1, null),
  ('PARGOT0019', 'Parker cab gota AISI304', '8 x 1/2', 0.03159, 'USD', '+IVA', 48.6486, 'unidad', 1, '328f0e7a-321d-4cd0-ba01-28014f329cdf'),
  ('PARGOT0021', 'Parker cab gota AISI304', '8 x 3/4', 0.0363, 'USD', '+IVA', 55.902, 'unidad', 1, null),
  ('PARGOT0023', 'Parker cab gota AISI304', '8 x 1"', 0.04101, 'USD', '+IVA', 63.1554, 'unidad', 1, '2dbeb6a0-da40-4842-bb21-8aed35bd91da'),
  ('PARGOT0024', 'Parker cab gota AISI304', '8 x 1 1/4', 0.04501, 'USD', '+IVA', 69.3154, 'unidad', 1, null),
  ('PARGOT0025', 'Parker cab gota AISI304', '8 x 1 1/2', 0.05009, 'USD', '+IVA', 77.1386, 'unidad', 1, '66aadab1-ed4a-4591-bb97-34b6801a85a7'),
  ('PARGOT0027', 'Parker cab gota AISI304', '8 x 2"', 0.052801, 'USD', '+IVA', 81.3137, 'unidad', 1, null),
  ('PARGOT0029', 'Parker cab gota AISI304', '10 X 1/2', 0.033435, 'USD', '+IVA', 51.4901, 'unidad', 1, null),
  ('PARGOT0031', 'Parker cab gota AISI304', '10 X 3/4', 0.041708, 'USD', '+IVA', 64.2304, 'unidad', 1, 'c5dcb072-711c-47c4-94da-6d66f335780d'),
  ('PARGOT0033', 'Parker cab gota AISI304', '10 X 1"', 0.043373, 'USD', '+IVA', 66.7945, 'unidad', 1, null),
  ('PARGOT0034', 'Parker cab gota AISI304', '10 X 1 1/4', 0.044268, 'USD', '+IVA', 68.1727, 'unidad', 1, null),
  ('PARGOT0035', 'Parker cab gota AISI304', '10 X 1 1/2', 0.055621, 'USD', '+IVA', 85.6566, 'unidad', 1, null),
  ('PARGOT0040', 'Parker cab gota AISI304', '12 X 1/2', 0.05628, 'USD', '+IVA', 86.6712, 'unidad', 1, null),
  ('PARGOT0042', 'Parker cab gota AISI304', '12 X 3/4', 0.05687, 'USD', '+IVA', 87.5797, 'unidad', 1, null),
  ('PARGOT0044', 'Parker cab gota AISI304', '12 X 1"', 0.06969, 'USD', '+IVA', 107.3226, 'unidad', 1, null),
  ('PARGOT0045', 'Parker cab gota AISI304', '12 X 1 1/4', 0.066298, 'USD', '+IVA', 102.0988, 'unidad', 1, null),
  ('PARGOT0046', 'Parker cab gota AISI304', '12 X 1 1/2', 0.070231, 'USD', '+IVA', 108.1565, 'unidad', 1, null),
  ('PARGOT0051', 'Parker cab gota AISI304', '14 X 1/2', 0.084, 'USD', '+IVA', 129.36, 'unidad', 1, null),
  ('PARGOT0053', 'Parker cab gota AISI304', '14 X 3/4', 0.10706, 'USD', '+IVA', 164.8724, 'unidad', 1, null),
  ('PARGOT0055', 'Parker cab gota AISI304', '14 X 1"', 0.09944, 'USD', '+IVA', 153.1376, 'unidad', 1, null),
  ('PARGOT0056', 'Parker cab gota AISI304', '14 X 1 1/4', 0.099681, 'USD', '+IVA', 153.5088, 'unidad', 1, null),
  ('PARGOT0057', 'Parker cab gota AISI304', '14 X 1 1/2', 0.105436, 'USD', '+IVA', 162.371, 'unidad', 1, null),
  ('PEROXIDO10', 'PEROXIDO', null, 5858.75, 'ARS', '+IVA', 5858.75, 'unidad', 1, '94d6b696-99e1-4e0e-bd5c-d7eec711afbc'),
  ('PISTOLA310', 'PISTOLA APLICADORA X 310', null, 6530, 'ARS', '+IVA', 6530, 'unidad', 1, null),
  ('PISTOLA600', 'PISTOLA APLICADORA X 600', null, 24870, 'ARS', '+IVA', 24870, 'unidad', 1, null),
  ('PLA0002', 'Arandela plana AISI304', '5/32 x 12 x 1', 0.009974, 'USD', 'Final', 15.3602, 'unidad', 1, '2938616a-a66b-4085-88ee-6ec6fdbdb949'),
  ('PLA0003', 'Arandela plana AISI304', '3/16 x 13 x 1', 0.009927, 'USD', 'Final', 15.2876, 'unidad', 1, '549a4b87-5a8d-4986-9526-c71f8f9e3e4d'),
  ('PLA0004', 'Arandela plana AISI304', '1/4 x 14 x 1,50', 0.014153, 'USD', 'Final', 21.795, 'unidad', 1, null),
  ('PLA0005', 'Arandela plana AISI304', '5/16 x18 x1,50', 0.020016, 'USD', 'Final', 30.8244, 'unidad', 1, 'e5efc4ae-cf98-4182-9a9f-23e7783670e1'),
  ('PLA0006', 'Arandela plana AISI304', '3/8 x20 x1,50', 0.026823, 'USD', 'Final', 41.3067, 'unidad', 1, null),
  ('PLA0008', 'Arandela plana AISI304', '1/2 x 28 x 2', 0.077502, 'USD', 'Final', 119.3536, 'unidad', 1, '6da0f5dd-aced-43df-a0b7-af49758a5fd0'),
  ('PLA0010', 'Arandela plana AISI304', '5/8 x 35 x 2,5', 0.163936, 'USD', 'Final', 252.4618, 'unidad', 1, null),
  ('PLA0011', 'Arandela plana AISI304', '3/4 x 40 x 3', 0.220659, 'USD', 'Final', 339.8152, 'unidad', 1, null),
  ('PLACHA0004', 'Arandela chapista AISI304', '3/8 X10,50 X 35', 0.203829, 'USD', 'Final', 313.8972, 'unidad', 1, null),
  ('R0027', 'CATALIZADOR P/RESINA UREICAxKG', null, 10205.58, 'ARS', 'Final', 10205.58, 'kg', 1, null),
  ('R0028', 'Resina Ureica x KG', null, 4432.4326, 'ARS', 'Final', 4432.4326, 'kg', 1, null),
  ('R0029', 'RESPALDO Ø4,1/2', null, 3959.6914, 'ARS', '+IVA', 3959.6914, 'unidad', 1, null),
  ('R0030', 'RESPALDO Ø7', null, 4956.5578, 'ARS', '+IVA', 4956.5578, 'unidad', 1, null),
  ('R0031', 'Rodillo Epoxi Nro 11', null, 867, 'ARS', 'Final', 867, 'unidad', 1, null),
  ('R0032', 'Rodillo Epoxi Nro 5', null, 606.3514, 'ARS', 'Final', 606.3514, 'unidad', 1, '729ee7fc-bc79-4c50-a897-cd66fb6318be'),
  ('R0033', 'Rodillo Epoxi Nro 8', null, 751.33, 'ARS', 'Final', 751.33, 'unidad', 1, 'fc6cc486-596a-42cc-9325-61a01844df00'),
  ('R0034', 'Rodi p/resinar (repuesto) 10cm', null, 855, 'ARS', 'Final', 855, 'unidad', 1, '0115261b-0ba6-4d7c-8fea-a512aea75fac'),
  ('R0035', 'Rodi p/resinar (repuesto) 17cm', null, 1225, 'ARS', 'Final', 1225, 'unidad', 1, '7df56169-6788-41a5-8ce9-3899671a6dd4'),
  ('R0036', 'RODILLO EPOXI Nro 17 DIAM 40', null, 1260, 'ARS', 'Final', 1260, 'unidad', 1, null),
  ('S00008', 'SELLADOR SILOC PU52 X 310ml', null, 22044.35, 'ARS', '+IVA', 22044.35, 'litro', 0.31, null),
  ('S0001', 'Sellador 3M PU550 Blanco x 310', null, 7.47, 'USD', 'Final', 11503.8, 'unidad', 1, '52c4964e-4904-4173-ae1d-ee568e0c0f2d'),
  ('S0002', 'Sellador 3M PU550 Negro x 310', null, 7.47, 'USD', 'Final', 11503.8, 'unidad', 1, '64027b3c-7d1f-4ebd-a8a5-5df4a1d3b047'),
  ('S00021', 'Sellador 3M PU550 GRIS x 310', null, 7.47, 'USD', 'Final', 11503.8, 'unidad', 1, null),
  ('S0003', 'Sellador 3M PU550 Blanco x 600', null, 8.62, 'USD', 'Final', 13274.8, 'unidad', 1, null),
  ('S0004', 'Sellador 3M PU550 Negro x 600', null, 8.62, 'USD', 'Final', 13274.8, 'unidad', 1, '3d45eb0a-5f8b-4170-8b55-acb73792aad3'),
  ('S0005', 'SELLADOR 3M 4000UV', null, 32.8, 'USD', '+IVA', 50512, 'unidad', 1, '95fe4aef-e051-42f2-9d52-61e0332c5f55'),
  ('S0007', 'Sellador Kekol K830 Marron', null, 11.4, 'USD', '+IVA', 17556, 'unidad', 1, null),
  ('S00072', 'KEKOL PU K5148 x1/2KG', null, 9857.77, 'ARS', '+IVA', 9857.77, 'kg', 0.5, null),
  ('S0015', 'SELLADOR SILOC 8600 X 420 gr', null, 60848.45, 'ARS', '+IVA', 60848.45, 'kg', 0.42, null),
  ('S0018', 'SELLAD JUNTAS THREEBONDx100ml', null, 17329.14, 'ARS', 'Final', 17329.14, 'litro', 0.1, null),
  ('S0020', 'SIERRA de ACERO RAPIDO 24D', null, 2303.7334, 'ARS', 'Final', 2303.7334, 'unidad', 1, null),
  ('S00211', 'SILICONA NEUTRA TRANSPARENTE', null, 5952.68, 'ARS', '+IVA', 5952.68, 'unidad', 1, null),
  ('SUPERH51', 'SUPER H5 x1/2KG', null, 6379.2, 'ARS', '+IVA', 6379.2, 'kg', 0.5, null),
  ('T00012', 'TARUGO NRO 10', null, 117.7202, 'ARS', '+IVA', 117.7202, 'unidad', 1, null),
  ('T0002', 'Taco Lijado mediano', null, 4044.37, 'ARS', 'Final', 4044.37, 'unidad', 1, null),
  ('T00031', 'TEFLON 1/2 X 10Mts', null, 684.3732, 'ARS', 'Final', 684.3732, 'metro', 10, null),
  ('T0005', 'THINNER X 20Lts', null, 67106.6, 'ARS', 'Final', 67106.6, 'litro', 20, null),
  ('T0005X1', 'THINNER X LITRO', null, 3355.33, 'ARS', 'Final', 3355.33, 'litro', 1, null),
  ('T0006', 'THINNER ORO X 4Lts', null, 26446, 'ARS', 'Final', 26446, 'litro', 4, null),
  ('T00061', 'THINNER ORO X Lts', null, 6015.04, 'ARS', 'Final', 6015.04, 'litro', 1, null),
  ('T0008', 'TIJERA 12"', null, 25660.7505, 'ARS', 'Final', 25660.7505, 'unidad', 1, null),
  ('T0009', 'Trapo Blanco CAMISETA x Kilo', null, 3280, 'ARS', 'Final', 3280, 'kg', 1, null),
  ('T0010', 'Trapo Rejilla Pesada Lavacoche', null, 2310, 'ARS', 'Final', 2310, 'unidad', 1, null),
  ('T0012', 'TARUGO NRO 6', null, 47.6737, 'ARS', '+IVA', 47.6737, 'unidad', 1, null),
  ('T00133', 'TRABAROSCA THREEBOND X 15GRS', null, 13539.1082, 'ARS', '+IVA', 13539.1082, 'kg', 0.015, null),
  ('T012', 'TARUGO Nro 8', null, 67.3036, 'ARS', '+IVA', 67.3036, 'unidad', 1, null),
  ('TCA0002', 'Tuerca hexagonal AISI304', '5/32 x 3 x 5/16', 0.052497, 'USD', 'Final', 80.8452, 'unidad', 1, null),
  ('TCA0003', 'Tuerca hexagonal AISI304', '3/16 x3,30 x3/8', 0.017027, 'USD', 'Final', 26.2211, 'unidad', 1, null),
  ('TCA0004', 'Tuerca hexagonal AISI304', '1/4x 5,50 x7/16', 0.031145, 'USD', 'Final', 47.9631, 'unidad', 1, null),
  ('TCA0005', 'Tuerca hexagonal AISI304', '5/16 x6,70 x1/2', 0.049395, 'USD', 'Final', 76.0681, 'unidad', 1, null),
  ('TCA0006', 'Tuerca hexagonal AISI304', '3/8 x 8,30 x 14', 0.068082, 'USD', 'Final', 104.846, 'unidad', 1, null),
  ('TCA0008', 'Tuerca hexagonal AISI304', '1/2-12x7/16x3/4', 0.158408, 'USD', 'Final', 243.9484, 'unidad', 1, null),
  ('TCA0011', 'Tuerca hexagonal AISI304', '5/8 x14 x15/16', 0.350252, 'USD', 'Final', 539.3875, 'unidad', 1, null),
  ('TCA0012', 'Tuerca hexagonal AISI304', '3/4x16,3x1.1/8', 0.568247, 'USD', 'Final', 875.1001, 'unidad', 1, null),
  ('TCA0014', 'Tuerca hexagonal AISI304', '1"x 22 x 1.1/2', 2.405106, 'USD', 'Final', 3703.8636, 'unidad', 1, null),
  ('TCAAUT003', 'Tuerca autofrenante AISI304', '3/16', 0.056129, 'USD', 'Final', 86.4392, 'unidad', 1, '54e40759-be53-4a6c-b354-b297e97676e6'),
  ('TCAAUT004', 'Tuerca autofrenante AISI304', '1/4', 0.061671, 'USD', 'Final', 94.9739, 'unidad', 1, '3b3536bf-2501-4b54-aa72-abb1462f27a1'),
  ('TCAAUT005', 'Tuerca autofrenante AISI304', '5/16', 0.069031, 'USD', 'Final', 106.3073, 'unidad', 1, null),
  ('TCAAUT006', 'Tuerca autofrenante AISI304', '3/8', 0.093839, 'USD', 'Final', 144.512, 'unidad', 1, null),
  ('TCAAUT008', 'Tuerca autofrenante AISI304', '1/2', 0.283829, 'USD', 'Final', 437.0959, 'unidad', 1, null),
  ('TCAAUT011', 'Tuerca autofrenante AISI304', '5/8', 0.615432, 'USD', 'Final', 947.7656, 'unidad', 1, null),
  ('TCAAUT012', 'Tuerca autofrenante AISI304', '3/4', 0.993589, 'USD', 'Final', 1530.1275, 'unidad', 1, null),
  ('TCABRON004', 'Tca hexag torneada BRONCE', '1/4 X 5 X 7/16', 0.145445, 'USD', 'Final', 223.9846, 'unidad', 1, null),
  ('TCABRON005', 'Tca hexag torneada BRONCE', '5/16 X 6 X 14', 0.249646, 'USD', 'Final', 384.4543, 'unidad', 1, null),
  ('TCABRON006', 'Tca hexag torneada BRONCE', '3/8 X 8,30 X 14', 0.308677, 'USD', 'Final', 475.363, 'unidad', 1, null),
  ('TCABRON007', 'Tca hexag torneada BRONCE', '1/2 X7/16 X3/4', 1.048976, 'USD', 'Final', 1615.423, 'unidad', 1, null),
  ('TCACIE002', 'Tuerca ciega AISI304', '5/32 x8.5 x5/16', 0.309264, 'USD', 'Final', 476.2665, 'unidad', 1, null),
  ('TCACIE003', 'Tuerca ciega AISI304', '3/16 x7,50 x3/8', 0.272452, 'USD', 'Final', 419.5759, 'unidad', 1, null),
  ('TCACIE004', 'Tuerca ciega AISI304', '1/4x10,50x7/16', 0.234645, 'USD', 'Final', 361.3526, 'unidad', 1, null),
  ('TCACIEME01', 'Tuerca MET ciega AISI304', 'M4,00- 07', 0.142465, 'USD', 'Final', 219.3959, 'unidad', 1, null),
  ('TCACIEME02', 'Tuerca MET ciega AISI304', 'M5,00- 08', 0.145432, 'USD', 'Final', 223.9659, 'unidad', 1, null),
  ('TCAMET002', 'Tuerca MET hexagonal AISI304', 'M4 x 3.20 x 7', 0.07771, 'USD', 'Final', 119.6732, 'unidad', 1, null),
  ('TCAMET003', 'Tuerca MET hexagonal AISI304', 'M5 x 4 x 8', 0.059249, 'USD', 'Final', 91.2434, 'unidad', 1, null),
  ('TCAMET004', 'Tuerca MET hexagonal AISI304', 'M6 x 5 x 10', 0.069593, 'USD', 'Final', 107.1725, 'unidad', 1, null),
  ('TCAMET005', 'Tuerca MET hexagonal AISI304', 'M8 x 6.50 x 13', 0.090645, 'USD', 'Final', 139.5932, 'unidad', 1, null),
  ('TCAMET006', 'Tuerca MET hexagonal AISI304', 'M10 x 8 x 17', 0.172769, 'USD', 'Final', 266.0639, 'unidad', 1, null),
  ('TCAMET007', 'Tuerca MET hexagonal AISI304', 'M12 x 10 x 19', 0.480853, 'USD', 'Final', 740.5138, 'unidad', 1, null),
  ('TCAZ38', 'TUERCA ZINCADA 3/8', null, 46.3726, 'ARS', 'Final', 46.3726, 'unidad', 1, null),
  ('TEROSON', 'Teroson 939 Ngro x420gr', null, 23596, 'ARS', 'Final', 23596, 'kg', 0.42, '3cb1010d-45b7-4198-a0ba-5a09f99d6319'),
  ('TIRAF001', 'Tirafondo cab hexag AISI304', '1/4 x 1"', 0.103317, 'USD', 'Final', 159.1075, 'unidad', 1, null),
  ('TIRAF002', 'Tirafondo cab hexag AISI304', '1/4 x 1 1/4', 0.115022, 'USD', 'Final', 177.1337, 'unidad', 1, null),
  ('TIRAF003', 'Tirafondo cab hexag AISI304', '1/4 x 1 1/2', 0.128136, 'USD', 'Final', 197.3288, 'unidad', 1, null),
  ('TIRAF005', 'Tirafondo cab hexag AISI304', '1/4 x 2"', 0.167484, 'USD', 'Final', 257.9254, 'unidad', 1, '9432712b-4725-4599-89d6-0da868af6022'),
  ('TIRAF006', 'Tirafondo cab hexag AISI304', '1/4 x 2 1/2', 0.187524, 'USD', 'Final', 288.7872, 'unidad', 1, '6b8cc2b5-df13-40ab-bdbd-d9b6025e7eb6'),
  ('TIRAF008', 'Tirafondo cab hexag AISI304', '1/4 x 3 1/2', 0.265354, 'USD', 'Final', 408.6453, 'unidad', 1, null),
  ('TIRAF014', 'Tirafondo cab hexag AISI304', '5/16 x 1"', 0.195888, 'USD', 'Final', 301.667, 'unidad', 1, null),
  ('TIRAF015', 'Tirafondo cab hexag AISI304', '5/16 x 1 1/4', 0.202969, 'USD', 'Final', 312.5726, 'unidad', 1, null),
  ('TIRAF016', 'Tirafondo cab hexag AISI304', '5/16 x 1 1/2', 0.20415, 'USD', 'Final', 314.3904, 'unidad', 1, null),
  ('TIRAF018', 'Tirafondo cab hexag AISI304', '5/16 x 2"', 0.245452, 'USD', 'Final', 377.9963, 'unidad', 1, null),
  ('TIRAF019', 'Tirafondo cab hexag AISI304', '5/16 x 2 1/2', 0.283213, 'USD', 'Final', 436.1486, 'unidad', 1, null),
  ('TIRAF020', 'Tirafondo cab hexag AISI304', '5/16 x 3"', 0.336314, 'USD', 'Final', 517.9236, 'unidad', 1, null),
  ('TIRAF022', 'Tirafondo cab hexag AISI304', '5/16 x 4"', 0.436622, 'USD', 'Final', 672.3976, 'unidad', 1, null),
  ('TIRAF027', 'Tirafondo cab hexag AISI304', '3/8 x 1"', 0.291907, 'USD', 'Final', 449.5367, 'unidad', 1, null),
  ('TIRAF029', 'Tirafondo cab hexag AISI304', '3/8 x 1 1/2', 0.345619, 'USD', 'Final', 532.2525, 'unidad', 1, null),
  ('TIRAF031', 'Tirafondo cab hexag AISI304', '3/8 x 2"', 0.443701, 'USD', 'Final', 683.2993, 'unidad', 1, null),
  ('TIRAF032', 'Tirafondo cab hexag AISI304', '3/8 x 2 1/2', 0.526602, 'USD', 'Final', 810.9677, 'unidad', 1, null),
  ('TIRAF033', 'Tirafondo cab hexag AISI304', '3/8 x 3"', 0.621502, 'USD', 'Final', 957.1135, 'unidad', 1, null),
  ('TIRAF034', 'Tirafondo cab hexag AISI304', '3/8 x 3 1/2', 0.70699, 'USD', 'Final', 1088.7639, 'unidad', 1, null),
  ('TIZAS', 'TIZA BLANCA BARNIZADA', null, 246.2576, 'ARS', 'Final', 246.2576, 'unidad', 1, 'b61647f2-2994-4a10-856b-f48b493e2f0c'),
  ('TORFIJ0017', 'Tornillo cab fijadora AISI304', '5/32 X 1/2', 0.09315, 'USD', 'Final', 143.4515, 'unidad', 1, null),
  ('TORFIJ0019', 'Tornillo cab fijadora AISI304', '5/32 X 3/4', 0.105169, 'USD', 'Final', 161.96, 'unidad', 1, null),
  ('TORFIJ0027', 'Tornillo cab fijadora AISI304', '3/16 X 1/2', 0.081438, 'USD', 'Final', 125.4148, 'unidad', 1, null),
  ('TORFIJ0029', 'Tornillo cab fijadora AISI304', '3/16 X 3/4', 0.090658, 'USD', 'Final', 139.6127, 'unidad', 1, null),
  ('TORFIJ0030', 'Tornillo cab fijadora AISI304', '3/16 X 7/8', 0.092195, 'USD', 'Final', 141.9809, 'unidad', 1, null),
  ('TORFIJ0031', 'Tornillo cab fijadora AISI304', '3/16 X 1', 0.097418, 'USD', 'Final', 150.0238, 'unidad', 1, null),
  ('TORFIJ0032', 'Tornillo cab fijadora AISI304', '3/16 X 1 1/4', 0.106023, 'USD', 'Final', 163.2756, 'unidad', 1, null),
  ('TORFIJ0033', 'Tornillo cab fijadora AISI304', '3/16 X 1 1/2', 0.113707, 'USD', 'Final', 175.1083, 'unidad', 1, null),
  ('TORFIJ0037', 'Tornillo cab fijadora AISI304', '3/16 X 2 1/2', 0.149048, 'USD', 'Final', 229.5343, 'unidad', 1, null),
  ('TORFIJ0039', 'Tornillo cab fijadora AISI304', '3/16 X 3', 0.162875, 'USD', 'Final', 250.8269, 'unidad', 1, null),
  ('TORFIJ0044', 'Tornillo cab fijadora AISI304', '1/4 X 1', 0.127705, 'USD', 'Final', 196.6664, 'unidad', 1, null),
  ('TORFIJ0048', 'Tornillo cab fijadora AISI304', '1/4 X 2', 0.20075, 'USD', 'Final', 309.1551, 'unidad', 1, null),
  ('TORFIJ0052', 'Tornillo cab fijadora AISI304', '1/4 X 3', 0.220584, 'USD', 'Final', 339.6995, 'unidad', 1, '8b6623ac-3160-4ce7-abba-06c1e9b3158b'),
  ('TORFIJME14', 'Tornillo MET fijadora AISI304', 'M4 X 20', 0.145365, 'USD', 'Final', 223.8619, 'unidad', 1, null),
  ('TORFIJME17', 'Tornillo MET fijadora AISI304', 'M4 X 35', 0.175768, 'USD', 'Final', 270.683, 'unidad', 1, null),
  ('TORFIJME23', 'Tornillo MET fijadora AISI304', 'M5 X 20', 0.122114, 'USD', 'Final', 188.055, 'unidad', 1, null),
  ('TORFIJME24', 'Tornillo MET fijadora AISI304', 'M5 X 25', 0.132357, 'USD', 'Final', 203.8298, 'unidad', 1, null),
  ('TORFIJME27', 'Tornillo MET fijadora AISI304', 'M5 X 40', 0.170729, 'USD', 'Final', 262.9232, 'unidad', 1, null),
  ('TORFIJME33', 'Tornillo MET fijadora AISI304', 'M6 X 20', 0.160161, 'USD', 'Final', 246.6482, 'unidad', 1, null),
  ('TORFRE0015', 'Tornillo frezado POZI AISI304', '5/32 X 3/8', 0.088643, 'USD', 'Final', 136.5104, 'unidad', 1, null),
  ('TORFRE0022', 'Tornillo frezado POZI AISI304', '5/32 X 1 1/2', 0.117545, 'USD', 'Final', 181.0198, 'unidad', 1, null),
  ('TORFRE0030', 'Tornillo frezado POZI AISI304', '3/16 X 1/2', 0.09188, 'USD', 'Final', 141.4958, 'unidad', 1, null),
  ('TORFRE0032', 'Tornillo frezado POZI AISI304', '3/16 X 3/4', 0.090658, 'USD', 'Final', 139.6127, 'unidad', 1, '751a63ff-bceb-4099-b931-d5acc482cac1'),
  ('TORFRE0034', 'Tornillo frezado POZI AISI304', '3/16 X 1"', 0.096803, 'USD', 'Final', 149.0767, 'unidad', 1, null),
  ('TORFRE0036', 'Tornillo frezado POZI AISI304', '3/16 X 1 1/2', 0.113707, 'USD', 'Final', 175.1083, 'unidad', 1, null),
  ('TORFRE0038', 'Tornillo frezado POZI AISI304', '3/16 X 2"', 0.131113, 'USD', 'Final', 201.9139, 'unidad', 1, null),
  ('TORFRE0040', 'Tornillo frezado POZI AISI304', '3/16 X 2 1/2', 0.149048, 'USD', 'Final', 229.5343, 'unidad', 1, null),
  ('TORFRE0041', 'Tornillo frezado POZI AISI304', '3/16 X 3"', 0.162875, 'USD', 'Final', 250.8269, 'unidad', 1, null),
  ('TORFRE0047', 'Tornillo frezado POZI AISI304', '1/4 X 1 1/4', 0.16216, 'USD', 'Final', 249.7271, 'unidad', 1, null),
  ('TORFRE0048', 'Tornillo frezado POZI AISI304', '1/4 X 1 1/2', 0.176473, 'USD', 'Final', 271.769, 'unidad', 1, null),
  ('TORFRE0050', 'Tornillo frezado POZI AISI304', '1/4 X 2"', 0.184614, 'USD', 'Final', 284.3051, 'unidad', 1, null),
  ('TORFRE0051', 'Tornillo frezado POZI AISI304', '1/4 X 2 1/4', 0.182852, 'USD', 'Final', 281.5917, 'unidad', 1, null),
  ('TORFRE0052', 'Tornillo frezado POZI AISI304', '1/4 X 2 1/2', 0.197361, 'USD', 'Final', 303.9363, 'unidad', 1, null),
  ('TORFRE0054', 'Tornillo frezado POZI AISI304', '1/4 X 3"', 0.242544, 'USD', 'Final', 373.5179, 'unidad', 1, null),
  ('TORFRE0063', 'Tornillo frezado POZI AISI304', '5/16 X 2"', 0.3656, 'USD', 'Final', 563.0239, 'unidad', 1, null),
  ('TORFRE0065', 'Tornillo frezado POZI AISI304', '5/16 X 3"', 0.495972, 'USD', 'Final', 763.7969, 'unidad', 1, null),
  ('TORFRE0072', 'Tornillo frezado POZI AISI304', '3/8 X 2"', 0.587997, 'USD', 'Final', 905.516, 'unidad', 1, null),
  ('TORFRE0076', 'Tornillo frezado POZI AISI304', '3/8 X 3"', 0.785393, 'USD', 'Final', 1209.5052, 'unidad', 1, null),
  ('TORGOT0029', 'Tornillo cab gota AISI304', '3/16 x 1/2', 0.079066, 'USD', 'Final', 121.762, 'unidad', 1, null),
  ('TORGOT0031', 'Tornillo cab gota AISI304', '3/16 x 3/4', 0.088017, 'USD', 'Final', 135.5463, 'unidad', 1, null),
  ('TORGOT0033', 'Tornillo cab gota AISI304', '3/16 x 1"', 0.094581, 'USD', 'Final', 145.6541, 'unidad', 1, null),
  ('TORGOT0035', 'Tornillo cab gota AISI304', '3/16 x 1 1/2', 0.135058, 'USD', 'Final', 207.989, 'unidad', 1, null),
  ('TORGOT0051', 'Tornillo cab gota AISI304', '1/4 x 2"', 0.166256, 'USD', 'Final', 256.0347, 'unidad', 1, null),
  ('VARROSC004', 'Varilla roscada AISI304', '1/4', 1.525235, 'USD', 'Final', 2348.8611, 'unidad', 1, null),
  ('VARROSC005', 'Varilla roscada AISI304', '5/16', 2.789522, 'USD', 'Final', 4295.8638, 'unidad', 1, null),
  ('VARROSC006', 'Varilla roscada AISI304', '3/8', 3.484137, 'USD', 'Final', 5365.5706, 'unidad', 1, null),
  ('VARROSC008', 'Varilla roscada AISI304', '1/2', 7.878949, 'USD', 'Final', 12133.5812, 'unidad', 1, null),
  ('VARROSC012', 'Varilla roscada AISI304', '3/4', 14.939521, 'USD', 'Final', 23006.8624, 'unidad', 1, null),
  ('VARROSC014', 'Varilla roscada AISI304', '1"- 8', 34.057853, 'USD', 'Final', 52449.0936, 'unidad', 1, null),
  ('W0001', 'WD-40 Grande', null, 10052.58, 'ARS', '+IVA', 10052.58, 'unidad', 1, 'eadb6acc-7f2d-4dfb-9416-d8ac60500a0c');

insert into public.consumibles_lista_items
  (lista_id, codigo, descripcion, medida, precio, moneda, condicion, costo_ars, unidad_compra, contenido, material_id)
select
  l.id, i.codigo, i.descripcion, i.medida, i.precio, i.moneda, i.condicion, i.costo_ars, i.unidad_compra, i.contenido,
  (select m.id from public.panol_materiales m where m.id = i.material_id)
from _cns_items i
cross join lateral (
  select id from public.consumibles_listas where proveedor_nombre = 'Rebollar' and vigente_desde = date '2026-10-08' order by created_at limit 1
) l
on conflict (lista_id, codigo) do update
  -- Si alguien ya lo concilió a mano, se respeta.
  set material_id = coalesce(public.consumibles_lista_items.material_id, excluded.material_id);

-- ── 3. Config de cada consumible ────────────────────────────────────────────
-- En orden de rubro y descripción, así los códigos KA quedan agrupados en el
-- estante y en las etiquetas. El código se calcula acá (no con el default de
-- la secuencia) para que el orden sea exacto; después se corre la secuencia.
drop table if exists pg_temp._cns_config;
create temp table _cns_config (
  ord int, material_id uuid, forma_entrega text, unidad_entrega text, proveedor_codigo text,
  unidad_compra text, factor_compra numeric, costo_unitario_ars numeric, favorito_orden int
) on commit drop;

insert into _cns_config values
  (1::int, '77791b28-1b55-4408-ae38-fb7b6f26d80a'::uuid, 'unidad'::text, 'rollo'::text, null::text, null::text, null::numeric, null::numeric, null::int),  -- Cinta Ancha Blanca 48mm
  (2, '66b569ee-dec7-4f23-a7e3-efccc23787f3', 'unidad', 'rollo', null, null, null, null, 2),  -- Cinta Ancha Verde
  (3, '94a44c07-0b23-49fd-8554-223dff0241fb', 'unidad', 'rollo', 'C00191', 'unidad', 1, 12115.8, null),  -- Cinta Doble Faz
  (4, '5bdab902-0448-4658-9614-3da512ea7cce', 'unidad', 'rollo', null, null, null, null, null),  -- Cinta Fina Blanca 18mm
  (5, '8c47e2ea-e691-46df-8e0c-afee00d06027', 'unidad', 'rollo', 'C0031', 'unidad', 1, 2038.4, 5),  -- Cinta Fina Verde 18mm
  (6, '8eb4bbf4-cfd6-4935-adcc-d0286b492420', 'unidad', 'rollo', 'F0030', 'unidad', 1, 5205.5179, 28),  -- Film 550
  (7, '44697e09-829b-4800-a82b-e45c91a750ff', 'unidad', 'rollo', 'F0028', 'unidad', 1, 6086.124, 26),  -- Film 1100
  (8, 'c0cc1c9f-613e-43c3-b3ef-3aba50dafaf1', 'unidad', 'rollo', 'F0029', 'unidad', 1, 8836.6571, null),  -- Film 2400
  (9, '9ba95d2f-d05b-4bd0-b6e5-7b9213b6c400', 'unidad', 'rollo', null, null, null, null, null),  -- Film Chico
  (10, '10497673-2538-44fa-b474-52ce2815adba', 'unidad', 'rollo', null, null, null, null, null),  -- Film Grande 2400
  (11, '83e8f83f-ce02-4682-8220-9493654c3e20', 'unidad', 'rollo', null, null, null, null, null),  -- Film Mediano
  (12, '7ced8879-cb7e-40e2-8b5a-4b5c6bdd905f', 'canje', 'unidad', 'D0045', 'unidad', 1, 449.5727, null),  -- LIJA ORBITAL GRANDE 120
  (13, '003911f7-20f4-4834-b46f-795ce683c100', 'canje', 'unidad', 'D0046', 'unidad', 1, 449.5727, null),  -- LIJA ORBITAL GRANDE 150
  (14, '4f884c6c-1928-4c0f-8250-77d84c1c3a28', 'canje', 'unidad', 'D0047', 'unidad', 1, 449.5727, null),  -- LIJA ORBITAL GRANDE 180
  (15, '94c8bba9-47c1-4646-9b5b-4b9ddfe8baee', 'canje', 'unidad', 'D0054', 'unidad', 1, 618.719, null),  -- LIJA ORBITAL GRANDE 600
  (16, '24a61407-64c1-4660-879e-f99ec396edf8', 'unidad', 'unidad', null, null, null, null, null),  -- Barbijo Blanco
  (17, 'b16be4a1-3090-4a78-b0ab-df85950ef3e9', 'unidad', 'unidad', null, null, null, null, 22),  -- Barbijo Negro
  (18, '2d977824-2baa-4a58-ac05-a523c3ac9c2a', 'unidad', 'par', 'G0006', 'par', 1, 4236, null),  -- Guantes Cuero
  (19, 'c1866f5f-546a-4384-accb-713ac9943897', 'unidad', 'par', 'G0008', 'unidad', null, null, 11),  -- Guantes Latex
  (20, 'e08f7200-e3ee-4408-ba92-48f44664a78c', 'unidad', 'par', 'G0010', 'par', 1, 1066.45, 24),  -- Guantes Tela
  (21, 'e77f1598-f623-467d-9d04-a536b37acd5f', 'unidad', 'unidad', 'A0006', 'unidad', 1, 2144.6145, null),  -- Lentes
  (22, 'fe494cb6-e39e-4572-b201-214afc42a7f9', 'unidad', 'unidad', null, null, null, null, null),  -- Mameluco
  (23, 'a65e1e97-8481-4e24-8ee5-65b32ad1ab9c', 'peso', 'unidad', null, null, null, null, null),  -- Arandela 1/2
  (24, 'fb4cdac6-a6bd-4a7d-a9bb-ada02928d6b8', 'peso', 'unidad', null, null, null, null, null),  -- Arandela 3/8
  (25, 'bf55435a-1b4d-49f1-bf4d-7b4add8c7239', 'peso', 'unidad', null, null, null, null, null),  -- Arandela 3/16
  (26, '6da0f5dd-aced-43df-a0b7-af49758a5fd0', 'peso', 'unidad', 'PLA0008', 'unidad', 1, 119.3536, null),  -- Arandela Plana 1/2
  (27, '549a4b87-5a8d-4986-9526-c71f8f9e3e4d', 'peso', 'unidad', 'PLA0003', 'unidad', 1, 15.2876, null),  -- Arandela Plana 3/16
  (28, 'e5efc4ae-cf98-4182-9a9f-23e7783670e1', 'peso', 'unidad', 'PLA0005', 'unidad', 1, 30.8244, null),  -- Arandela Plana 5/16
  (29, '2938616a-a66b-4085-88ee-6ec6fdbdb949', 'peso', 'unidad', 'PLA0002', 'unidad', 1, 15.3602, null),  -- Arandela Plana 5/32
  (30, '3b3536bf-2501-4b54-aa72-abb1462f27a1', 'peso', 'unidad', 'TCAAUT004', 'unidad', 1, 94.9739, null),  -- Autofrenante 1/4
  (31, '54e40759-be53-4a6c-b354-b297e97676e6', 'peso', 'unidad', 'TCAAUT003', 'unidad', 1, 86.4392, null),  -- Autofrenante 3/16
  (32, '3d8f9702-46e9-4f07-a204-5d62d0e2e5ab', 'peso', 'unidad', null, null, null, null, null),  -- Fijador 4 X 1 1/2
  (33, '5f0dd58c-fa4b-4f12-b7b2-c661fecc872d', 'peso', 'unidad', 'PARFIJ0004', 'unidad', 1, 28.1512, null),  -- Fijador 4 X 1/2
  (34, '7be577d9-e434-434c-a325-f2ed23ca1db3', 'peso', 'unidad', 'PARFIJ0006', 'unidad', 1, 31.5238, null),  -- Fijador 4 X 3/4
  (35, 'caee3fae-dd8a-467c-b129-fb4425c8a9cf', 'peso', 'unidad', 'PARFIJ0015', 'unidad', 1, 44.429, null),  -- Fijador 6 X 1
  (36, '8bb458bf-cd08-44c7-8339-8048e3b21b8c', 'peso', 'unidad', 'PARFIJ0011', 'unidad', 1, 34.4344, null),  -- Fijador 6 X 1/2
  (37, '76a43fab-b682-490a-b13d-403f799bf1e2', 'peso', 'unidad', 'PARFIJ0013', 'unidad', 1, 39.5164, null),  -- Fijador 6 X 3/4
  (38, '65d8d16a-6c6e-4e57-8075-ef670875d92a', 'peso', 'unidad', 'PARFIJ0023', 'unidad', 1, 63.1554, null),  -- Fijador 8 X 1
  (39, '0605008c-886f-4211-bff6-c498c6cd5e54', 'peso', 'unidad', 'PARFIJ0024', 'unidad', 1, 72.6726, null),  -- Fijador 8 X 1 1/4
  (40, 'd0a92751-7828-4975-ac73-f95c09d006ec', 'peso', 'unidad', 'PARFIJ0031', 'unidad', 1, 64.2304, null),  -- Fijador 10 X 3/4
  (41, '2f7331b8-61ed-4912-a87e-63b88418a628', 'peso', 'unidad', 'PARFIJ0055', 'unidad', 1, 137.964, null),  -- Fijador 14 X 1
  (42, '81234934-0c7f-4aad-acd2-916874b80d36', 'peso', 'unidad', 'PARFIJ0056', 'unidad', 1, 153.5088, null),  -- Fijador 14 X 1 1/4
  (43, '751a63ff-bceb-4099-b931-d5acc482cac1', 'peso', 'unidad', 'TORFRE0032', 'unidad', 1, 139.6127, null),  -- Frezado 3/16 X 3/4
  (44, 'e4d322e7-c385-4419-abad-7d2a16377cca', 'peso', 'unidad', 'PARFRE0008', 'unidad', 1, 34.2804, null),  -- Frezado 4 X 1
  (45, 'fbf791e6-3ae0-418c-a08e-c8b726b4a0af', 'peso', 'unidad', null, null, null, null, null),  -- Frezado 4 X 1 1/2
  (46, '10aac20f-882e-4d0e-8f8b-eb12ed4abbf2', 'peso', 'unidad', 'PARFRE0004', 'unidad', 1, 28.1512, null),  -- Frezado 4 X 1/2
  (47, 'bffe7f48-2855-43d2-bdf1-0bbb320a8798', 'peso', 'unidad', 'PARFRE0006', 'unidad', 1, 31.5238, null),  -- Frezado 4 X 3/4
  (48, '2a2215a0-7fab-4076-94ec-2e25b68c7819', 'peso', 'unidad', 'PARFRE0011', 'unidad', 1, 34.4344, null),  -- Frezado 6 X 1/2
  (49, 'ab32d2fa-e101-48d9-b0bf-0db349abffdc', 'peso', 'unidad', 'PARFRE0013', 'unidad', 1, 39.5164, null),  -- Frezado 6 X 3/4
  (50, '9a9d6481-1c9e-4657-be6d-813732a9193a', 'peso', 'unidad', 'PARFRE0025', 'unidad', 1, 68.838, null),  -- Frezado 8 X 1 1/2
  (51, '50e545fd-3349-4a0e-bc59-75dbb2ff381f', 'peso', 'unidad', 'PARFRE0021', 'unidad', 1, 50.3203, null),  -- Frezado 8 X 3/4
  (52, 'd8a79b2a-8fae-4ffd-b23d-5379ae3c61cb', 'peso', 'unidad', 'PARFRE0033', 'unidad', 1, 66.7945, null),  -- Frezado 10 X 1
  (53, '39ad84e1-a5fd-43e5-86a6-98e5d0dda5ec', 'peso', 'unidad', 'PARFRE0046', 'unidad', 1, 108.1565, null),  -- Frezado 12 X 1 1/2
  (54, 'afc0f0fa-1b9d-4e56-bf82-f76f353eb61e', 'peso', 'unidad', 'PARFRE0055', 'unidad', 1, 137.964, null),  -- Frezado 14 X 1
  (55, 'cc31fa33-2afa-45a5-9a73-f5d6115d3935', 'peso', 'unidad', 'PARGOT0015', 'unidad', 1, 44.429, null),  -- Gota Sebo 6 X 1
  (56, 'c84173d9-d68e-4196-abb8-4b556c655631', 'peso', 'unidad', 'PARGOT0013', 'unidad', 1, 39.5164, null),  -- Gota Sebo 6 X 3/4
  (57, '2dbeb6a0-da40-4842-bb21-8aed35bd91da', 'peso', 'unidad', 'PARGOT0023', 'unidad', 1, 63.1554, null),  -- Gota Sebo 8 X 1
  (58, '66aadab1-ed4a-4591-bb97-34b6801a85a7', 'peso', 'unidad', 'PARGOT0025', 'unidad', 1, 77.1386, null),  -- Gota Sebo 8 X 1 1/2
  (59, '328f0e7a-321d-4cd0-ba01-28014f329cdf', 'peso', 'unidad', 'PARGOT0019', 'unidad', 1, 48.6486, null),  -- Gota Sebo 8 X 1/2
  (60, 'c5dcb072-711c-47c4-94da-6d66f335780d', 'peso', 'unidad', 'PARGOT0031', 'unidad', 1, 64.2304, null),  -- Gota Sebo 10 X 3/4
  (61, '28f984cd-c62f-4819-875c-1bfc5832f217', 'peso', 'unidad', 'F0002', 'unidad', 1, 6.16, null),  -- Parafuso 3.5 X 16
  (62, '4cf6eef8-9991-4443-80ab-483f7c970297', 'peso', 'unidad', 'F0003', 'unidad', 1, 7.8044, null),  -- Parafuso 3.5 X 20
  (63, '6882b214-d787-428e-9b8e-07ee15aa1891', 'peso', 'unidad', 'F0005', 'unidad', 1, 12.32, null),  -- Parafuso 3.5 X 30
  (64, 'ed7e0692-6a90-41d3-9532-3c9decdb3e5c', 'peso', 'unidad', 'F0006', 'unidad', 1, 15.4, null),  -- Parafuso 3.5 X 35
  (65, 'eb166b14-4d2d-4e69-8dc8-f982407596c0', 'peso', 'unidad', 'F0007', 'unidad', 1, 20.02, null),  -- Parafuso 3.5 X 40
  (66, 'ab266d74-7a91-4c1d-809a-e24a9b64d3e0', 'peso', 'unidad', 'F0009', 'unidad', 1, 9.24, null),  -- Parafuso 4 X 20
  (67, 'cf156009-67b8-4f38-91bb-9a9f813d4319', 'peso', 'unidad', 'F0010', 'unidad', 1, 9.24, null),  -- Parafuso 4 X 25
  (68, '78b47ac2-5e45-4894-966d-d22e7738a125', 'peso', 'unidad', 'F0011', 'unidad', 1, 12.32, null),  -- Parafuso 4 X 30
  (69, '301c6077-8eff-4366-bfbe-8292644aa954', 'peso', 'unidad', 'F0012', 'unidad', 1, 10.78, null),  -- Parafuso 4 X 35
  (70, 'ea4338f3-b971-4e32-8412-5d1ed1f54d93', 'peso', 'unidad', 'F0013', 'unidad', 1, 13.86, null),  -- Parafuso 4 X 40
  (71, '421da6ca-f729-4848-9027-31b338207b9a', 'peso', 'unidad', 'F0014', 'unidad', 1, 20.02, null),  -- Parafuso 4 X 45
  (72, 'b55cda81-8158-44c9-800c-4f19bc12cdc9', 'peso', 'unidad', 'F0015', 'unidad', 1, 21.56, null),  -- Parafuso 4 X 50
  (73, '92ee2f1b-52bf-4dd0-9f1b-2569907f397f', 'peso', 'unidad', 'F0016', 'unidad', 1, 32.8482, null),  -- Parafuso 4.5 X 60
  (74, 'dd870c31-60f9-4490-b900-3fb480137232', 'peso', 'unidad', null, null, null, null, null),  -- Parafuso 5 X 70
  (75, '9432712b-4725-4599-89d6-0da868af6022', 'peso', 'unidad', 'TIRAF005', 'unidad', 1, 257.9254, null),  -- Tirafondo 1/4 X 2
  (76, '6b8cc2b5-df13-40ab-bdbd-d9b6025e7eb6', 'peso', 'unidad', 'TIRAF006', 'unidad', 1, 288.7872, null),  -- Tirafondo 1/4 X 2 1/2
  (77, '8b6623ac-3160-4ce7-abba-06c1e9b3158b', 'peso', 'unidad', 'TORFIJ0052', 'unidad', 1, 339.6995, null),  -- Tornillo Fijador 1/4 X 3
  (78, 'a72ebd4f-56b3-4261-bdbb-e64b47be4373', 'peso', 'unidad', null, null, null, null, null),  -- Tuerca Común 3/8
  (79, '236d2850-ec62-48bc-be3e-6f410260001b', 'peso', 'unidad', null, null, null, null, null),  -- Tuerca Común 5/16
  (80, '7349230d-efc9-4d11-b6ef-5638c0698f04', 'unidad', 'unidad', null, null, null, null, null),  -- Cutter
  (81, '34cfb062-7313-41e1-8ddc-f09d91190880', 'unidad', 'unidad', null, null, null, null, null),  -- Espatula Mediana Y Chica
  (82, '7ee3f743-c66f-4402-b13a-35fe9dfd4aab', 'unidad', 'unidad', null, null, null, null, null),  -- Gomita Azul Chica
  (83, '19789a90-b5ca-45f0-aac5-e3d652f2b292', 'unidad', 'unidad', 'G0003', 'unidad', 1, 2443.32, null),  -- Gomita Azul Grande
  (84, '13f8161f-a496-4fca-b913-2b833e950c62', 'unidad', 'unidad', 'C00101', 'unidad', 1, 2667.18, null),  -- Kit Chapitas Nuevas
  (85, 'f8084528-574d-4ad0-928e-0a09083aeb3a', 'unidad', 'unidad', null, null, null, null, null),  -- Lapiz
  (86, '62b57b9c-6438-4344-8f51-83a1160ec3f6', 'unidad', 'unidad', 'L0005', 'unidad', 1, 662.2068, null),  -- Lapiz Carpintero
  (87, '693fa687-bbb1-48f6-b330-eb28f4e288ca', 'unidad', 'unidad', null, null, null, null, null),  -- Metro
  (88, '5890cf0b-b915-4af6-a9b6-091bb79bb250', 'unidad', 'unidad', null, null, null, null, null),  -- pistola de engomar
  (89, '26784f4b-5141-4d29-985f-745d2f9123c6', 'unidad', 'unidad', null, null, null, null, null),  -- Taco Negro Goma
  (90, 'b61647f2-2994-4a10-856b-f48b493e2f0c', 'unidad', 'unidad', 'TIZAS', 'unidad', 1, 246.2576, null),  -- Tiza
  (91, '79b259eb-50ef-45c0-827b-ed7d39a6f6d1', 'canje', 'unidad', 'H0003', 'unidad', 1, 10581.9804, null),  -- Hoja Caladora 101Ao
  (92, 'cae1afc1-7bd3-47da-b220-222004528ea6', 'canje', 'unidad', 'H0005', 'unidad', 1, 10229.2902, null),  -- Hoja Caladora 101B
  (93, '9456ce41-659c-4aac-9877-ce614ea2fb31', 'canje', 'unidad', 'H0020', 'unidad', 1, 12026.9205, null),  -- Hoja Caladora T 301
  (94, '83d8bec2-4adb-419a-8c40-41d6f59302a0', 'canje', 'unidad', 'H0010', 'unidad', 1, 10240.8866, null),  -- Hoja Caladora T118B
  (95, 'ba21b540-ae5b-4be5-91b3-8fdf6cb5dd08', 'canje', 'unidad', null, null, null, null, null),  -- Hoja Caladora T130
  (96, 'c77572c2-61c4-4150-9799-824fc6e39272', 'canje', 'unidad', null, null, null, null, null),  -- Hoja Serrucho Electrico P/Plastico Blanca
  (97, 'a9a03466-da1d-424b-9627-3ce464009924', 'canje', 'unidad', null, null, null, null, null),  -- Disco Corte Chico
  (98, 'ae59aebb-abe3-43c5-b938-25bbe06193a9', 'canje', 'unidad', 'D0063', 'unidad', 1, 2810.1363, null),  -- Disco Corte N7
  (99, '0229b616-2006-4c13-99e5-b5f2cc03d8a9', 'canje', 'unidad', null, null, null, null, null),  -- Disco Desbaste Chico 4"
  (100, 'b4d55b9b-1ead-40c4-8a3a-d6329a713a2b', 'canje', 'unidad', null, null, null, null, null),  -- Disco Diamantado
  (101, 'fb32dc55-1704-4943-af87-f7ede783c4a3', 'canje', 'unidad', null, null, null, null, null),  -- Disco Flap
  (102, '286b97e7-094e-41e0-93de-5822700fa03c', 'canje', 'unidad', null, null, null, null, null),  -- Disco Lija 24
  (103, '0452f284-448b-478e-92d2-97989337480a', 'canje', 'unidad', null, null, null, null, 17),  -- Disco Lija 36
  (104, 'fd0645c1-cf8f-470d-a578-a64d28213cb5', 'canje', 'unidad', 'D0007', 'unidad', 1, 1324.4, null),  -- Disco Lija 60
  (105, '7fc70f74-9bd7-434f-9883-94fa2a654633', 'canje', 'unidad', null, null, null, null, null),  -- Disco Orbital Grande 320
  (106, 'de502f64-feb8-4ede-aa64-8d5b0f2fcd49', 'canje', 'unidad', null, null, null, null, null),  -- Disco Orbital Grande 400
  (107, '695bc121-2f56-4793-89fb-961bff28cdf8', 'canje', 'unidad', null, null, null, null, null),  -- Disco Widia P/Madera
  (108, 'bcd4e024-9a52-4662-aebe-ac237c68976e', 'unidad', 'unidad', 'L0008', 'unidad', 1, 580.7774, null),  -- Lija Al Agua 80
  (109, 'de60eee1-6711-4901-81df-0912caa2ab95', 'unidad', 'unidad', 'L0013', 'unidad', 1, 580.7774, null),  -- Lija Al Agua 220
  (110, '90c43d1c-ebc9-42f6-ad71-fb533b934c46', 'unidad', 'unidad', 'L0015', 'unidad', 1, 580.7774, null),  -- LIJA AL AGUA 280
  (111, '358a3383-a1ce-4f00-8b6a-bf1affa5ab81', 'unidad', 'unidad', 'L0016', 'unidad', 1, 580.7774, null),  -- Lija Al Agua 320
  (112, 'aa22601c-0ead-4a0c-bc9a-c6aa385efcfd', 'unidad', 'unidad', 'L0017', 'unidad', 1, 580.7774, null),  -- LIJA AL AGUA 360
  (113, '9e410cec-df14-4230-ba67-3c95f012685d', 'unidad', 'unidad', 'L0018', 'unidad', 1, 580.7774, 12),  -- Lija Al Agua 400
  (114, '411ccf42-dc1c-4b15-b798-23ece38d7cf7', 'unidad', 'unidad', 'L0019', 'unidad', 1, 580.7774, 4),  -- Lija Al Agua 600
  (115, '111f6a93-734d-4136-a613-c8eba4bfe8c6', 'unidad', 'unidad', 'L0020', 'unidad', 1, 905.8421, 7),  -- Lija Al Agua 1000
  (116, '10591c1b-fea8-4f79-83d0-ae27374db9e2', 'unidad', 'unidad', 'L0021', 'unidad', 1, 905.8421, null),  -- Lija Al Agua 1200
  (117, '1a7f4d50-5ce1-4646-b244-f8f280a80559', 'unidad', 'unidad', 'L0022', 'unidad', 1, 905.8421, 13),  -- Lija Al Agua 1500
  (118, '7e0fbbba-c99c-4a01-8695-412b6c17f8ae', 'unidad', 'unidad', 'L0023', 'unidad', 1, 1334.9292, 18),  -- Lija Al Agua 2000
  (119, '117d9743-eb3d-4854-9ac1-f6daaeb6ddc6', 'canje', 'unidad', null, null, null, null, 14),  -- Lija Banda 36
  (120, '3546bdb3-4773-47af-90cd-b56f51ae394d', 'canje', 'unidad', 'L0029', 'unidad', 1, 23245.5541, 25),  -- Lija Banda 60
  (121, 'fa83271a-0173-44e1-bea9-47d7cb66e2ad', 'unidad', 'unidad', 'L0062', 'unidad', 1, 539, null),  -- Lija En Seco 80
  (122, '379d4e08-dd4f-46b2-bfc6-65b2c22b0d7e', 'unidad', 'unidad', 'L0063', 'unidad', 1, 539, null),  -- Lija En Seco 100
  (123, '1ea820f0-6958-45d6-905e-af3bd8639cc2', 'unidad', 'unidad', 'L0064', 'unidad', 1, 539, null),  -- Lija En Seco 120
  (124, '9ff616b7-37c6-4486-a77e-710ba31ae472', 'unidad', 'unidad', 'L0065', 'unidad', 1, 539, 15),  -- Lija En Seco 150
  (125, '8274facf-ade4-4ac0-97cf-a88334e37b67', 'unidad', 'unidad', 'L0066', 'unidad', 1, 539, null),  -- Lija En Seco 180
  (126, '0a1ca42b-499c-46d2-b2e5-16a96fb77278', 'unidad', 'unidad', 'L0067', 'unidad', 1, 539, 20),  -- Lija En Seco 220
  (127, '505d6c87-3791-452f-9ed2-450dffa57a1c', 'unidad', 'unidad', 'L0068', 'unidad', 1, 539, null),  -- Lija En Seco 240
  (128, '94e927f6-ba1e-430a-93d7-b18131f401be', 'unidad', 'unidad', 'L0069', 'unidad', 1, 539, null),  -- LIJA EN SECO 280
  (129, 'bf694874-4ab1-42ea-9ed9-6db3359ffbe3', 'unidad', 'unidad', 'L0070', 'unidad', 1, 539, null),  -- Lija En Seco 320
  (130, '07e0062c-1831-4935-8dab-3d7a5f5a9b27', 'unidad', 'unidad', 'L0072', 'unidad', 1, 539, 10),  -- Lija En Seco 400
  (131, 'fe2602e3-65c7-4e65-993e-3e05d24d4c66', 'canje', 'unidad', 'D0041', 'unidad', 1, 588.924, null),  -- Lija Orbital Grande 40
  (132, 'd43c7bcb-2747-4983-b552-8046f65ec36a', 'canje', 'unidad', 'D0042', 'unidad', 1, 526.338, null),  -- Lija Orbital Grande 60
  (133, 'f00af2d7-244d-4869-b156-373ba84cc12b', 'canje', 'unidad', 'D0043', 'unidad', 1, 526.338, null),  -- Lija Orbital Grande 80
  (134, '9f65bbe7-42a3-4438-840f-e3739434f0d1', 'canje', 'unidad', 'D0048', 'unidad', 1, 449.5727, null),  -- Lija Orbital Grande 220
  (135, '1b1ab73d-5991-4299-9f12-9baec388a311', 'canje', 'unidad', 'D0049', 'unidad', 1, 449.5727, null),  -- Lija Orbital Grande 240
  (136, 'e8c26055-8c23-4b86-8970-30662aff9a70', 'canje', 'unidad', null, null, null, null, null),  -- Lija Orbital Grande 320
  (137, 'a4650d8b-71c4-404d-8f5c-58598b63f03e', 'canje', 'unidad', 'D0052', 'unidad', 1, 449.5727, null),  -- Lija Orbital Grande 360
  (138, 'b490aca8-25c5-46a3-b022-732cd9f45924', 'canje', 'unidad', null, null, null, null, null),  -- Lija Orbital Grande 400
  (139, '55d89204-3c9c-4f10-9c94-31ec9ce89162', 'unidad', 'unidad', 'P0001', 'unidad', 1, 8858, 3),  -- Pano Pulir
  (140, '2e16623a-be26-4651-a24b-8b6a7e54bb5e', 'unidad', 'unidad', null, null, null, null, null),  -- Rollo Lija Banda 80
  (141, 'db406dda-1c39-44bd-a8ac-804d5cc3a0ee', 'unidad', 'unidad', null, null, null, null, null),  -- Rollo Lija Banda 100
  (142, 'fe40fafa-fda0-4a48-849c-25be471876fb', 'unidad', 'pack', null, null, null, null, null),  -- Bolsa Residuos
  (143, '444936c5-3b5a-4142-9963-314cf656caaf', 'unidad', 'pack', null, null, null, null, null),  -- Bolsa Residuos X Pack
  (144, '20b0748e-0807-46bf-aa2f-48b525ba21d5', 'unidad', 'unidad', 'C0001', 'unidad', 1, 11570, null),  -- Carton
  (145, 'e5e97fd5-d50f-4267-809f-4c4f5a4e3217', 'unidad', 'unidad', 'C0003', 'unidad', 1, 12800, null),  -- Cepillo Limpieza
  (146, '381657c8-f674-4dff-85fc-62db7944878f', 'unidad', 'unidad', 'E0011', 'kg', null, null, 6),  -- Estopa
  (147, '31650173-7fa1-458a-aabd-f702c6326de2', 'unidad', 'unidad', null, null, null, null, 1),  -- Trapo
  (148, '705c6ec5-9273-451c-a86d-18d856927899', 'canje', 'unidad', 'M0023', 'unidad', 1, 791.68, null),  -- Mecha 2
  (149, 'c9aba7e9-dcf9-4937-a662-fd15e3d033c4', 'canje', 'unidad', 'M0024', 'unidad', 1, 803.83, null),  -- Mecha 2,25
  (150, '747f7336-76ef-435e-b181-f7c083fe4491', 'canje', 'unidad', 'M0025', 'unidad', 1, 803.83, null),  -- Mecha 2,50
  (151, 'f8c08c1d-6aed-437c-ad4a-180156f9da11', 'canje', 'unidad', 'M0026', 'unidad', 1, 898.5, null),  -- Mecha 2,75
  (152, 'd0af23fb-00ef-4fd4-aade-beacf528caf0', 'canje', 'unidad', 'M0027', 'unidad', 1, 898.5, 27),  -- Mecha 3
  (153, 'd1a7e791-1d3c-4c1e-a633-56933fb74ebc', 'canje', 'unidad', 'M0028', 'unidad', 1, 995.26, null),  -- Mecha 3,25
  (154, '7d35f6d6-8fd2-4e2a-b3cd-968f5af99d24', 'canje', 'unidad', 'M0029', 'unidad', 1, 995.26, null),  -- Mecha 3,50
  (155, '113f2eb4-c994-4376-9daf-329c87403ece', 'canje', 'unidad', 'M0030', 'unidad', 1, 1186.48, null),  -- Mecha 3,75
  (156, 'f66e70d8-f3b6-4e19-8e15-8abbfbaa8b55', 'canje', 'unidad', 'M0031', 'unidad', 1, 1186.48, null),  -- Mecha 4
  (157, '0a8ac6cd-7767-4df9-81d9-413d0095edd2', 'canje', 'unidad', 'M0032', 'unidad', 1, 1368.48, null),  -- Mecha 4,25
  (158, '70edb02b-dae4-42b7-8c80-777324c2b13d', 'canje', 'unidad', 'M0033', 'unidad', 1, 1368.48, null),  -- Mecha 4,50
  (159, '07bac757-3165-4514-943e-6b5e197abdeb', 'canje', 'unidad', 'M0034', 'unidad', 1, 1589.54, null),  -- Mecha 4,75
  (160, '6b209144-b074-4c66-ae6e-c00c2173144b', 'canje', 'unidad', 'M0035', 'unidad', 1, 1589.54, null),  -- Mecha 5
  (161, '96209e71-3209-4b91-8552-b9b0f859cf1e', 'canje', 'unidad', 'M0036', 'unidad', 1, 1679.6, null),  -- Mecha 5,25
  (162, '656f98f2-7f9d-46cd-a25d-78a2ff2f8aa8', 'canje', 'unidad', 'M0037', 'unidad', 1, 1679.6, null),  -- Mecha 5,50
  (163, '8682b8a5-7ec2-4d95-977b-4dadd6724acc', 'canje', 'unidad', 'M0038', 'unidad', 1, 2087.13, null),  -- Mecha 5,75
  (164, 'ed27abd7-7c8d-40d3-b918-f711ebc3fc8f', 'canje', 'unidad', 'M0039', 'unidad', 1, 2087.13, null),  -- Mecha 6
  (165, '7a5992e7-5377-4481-9c21-3dd1a0d43cef', 'canje', 'unidad', 'M0041', 'unidad', 1, 2431.6, null),  -- Mecha 6,5
  (166, 'e7acca3f-8d47-4927-8fe5-2cea545015ee', 'canje', 'unidad', 'M0040', 'unidad', 1, 2431.6, null),  -- Mecha 6,25
  (167, 'f14d550d-2118-4b25-a976-1a62c53b84e5', 'canje', 'unidad', 'M0042', 'unidad', 1, 2884.15, null),  -- Mecha 6,75
  (168, 'aa8fc913-c26a-485c-960f-4cb5d16049d4', 'canje', 'unidad', 'M0043', 'unidad', 1, 2884.15, null),  -- Mecha 7
  (169, '1b144795-b2fa-4dd2-a05c-299dd318c417', 'canje', 'unidad', 'M0045', 'unidad', 1, 3161.08, null),  -- Mecha 7,5
  (170, '0a71ff7c-bd54-4bb4-9d67-d0c8c3c07d1f', 'canje', 'unidad', 'M0044', 'unidad', 1, 3161.08, null),  -- Mecha 7,25
  (171, 'f9376277-a73c-4357-bb13-9c60d5fbddfe', 'canje', 'unidad', 'M0046', 'unidad', 1, 3494.3, null),  -- Mecha 7,75
  (172, '0806abbc-339d-49e4-83f7-d5720c704145', 'canje', 'unidad', 'M0047', 'unidad', 1, 3619.09, null),  -- Mecha 8
  (173, 'd2ad7b2d-4c19-4d23-b644-b718a33b73d1', 'canje', 'unidad', null, null, null, null, null),  -- Mecha 8,5
  (174, 'e20ce8ad-fca3-482f-9535-04b7a076effd', 'canje', 'unidad', 'M00471', 'unidad', 1, 4230.05, null),  -- Mecha 8,25
  (175, '7054be96-324b-4ea0-b1c5-e6192452b9aa', 'canje', 'unidad', null, null, null, null, null),  -- Mecha 8,50
  (176, '585df7c6-88d2-4bac-96e2-0e2bc39e2ff9', 'canje', 'unidad', 'M00481', 'unidad', 1, 4663.78, null),  -- Mecha 8,75
  (177, '8d16a78d-b216-42e9-ba9e-243f539eb6af', 'canje', 'unidad', 'M0049', 'unidad', 1, 4663.78, null),  -- Mecha 9
  (178, '7c2c7126-294e-4b46-b1af-186ef108f44e', 'canje', 'unidad', 'M0050', 'unidad', 1, 5008.9, null),  -- Mecha 9,5
  (179, '8e7a4474-8057-4432-92b6-27d07ed4d4d7', 'canje', 'unidad', 'M00491', 'unidad', 1, 5008.9, null),  -- Mecha 9,25
  (180, '0f8a17d8-8600-4b6a-95b5-bb98b4104aae', 'canje', 'unidad', 'M00501', 'unidad', 1, 5134.82, null),  -- Mecha 9,75
  (181, 'c08aed36-691c-4b41-80c6-6ec8245a984a', 'canje', 'unidad', 'M0051', 'unidad', 1, 5254.24, null),  -- Mecha 10
  (182, '269d3010-8c76-4a73-835f-95c9b1e16641', 'canje', 'unidad', 'M0053', 'unidad', 1, 6910.2, null),  -- Mecha 11
  (183, '2ef47738-76b6-465d-bb2a-8175ba11a553', 'canje', 'unidad', 'M0055', 'unidad', 1, 8327.56, null),  -- Mecha 12
  (184, '273efba0-d07b-4295-bd25-855a14242952', 'canje', 'unidad', 'M0057', 'unidad', 1, 10505.87, null),  -- Mecha 13
  (185, '80251a9c-d4a6-4f78-9fd3-535a23d0ad84', 'unidad', 'unidad', null, null, null, null, null),  -- Ph1
  (186, '59185545-5d1c-4822-bb43-24c6430c4f2a', 'unidad', 'unidad', null, null, null, null, null),  -- Ph2
  (187, '63c0b9b2-bb24-4aa0-a493-c7c0eea9d035', 'unidad', 'unidad', 'P0059', 'unidad', 1, 692, null),  -- Ph3
  (188, '360ec214-81e9-4f34-859c-26578cfb4f9f', 'unidad', 'unidad', 'M0008', 'unidad', 1, 1092.2538, null),  -- Mango Rodillo Chico
  (189, '7316bf81-7917-4e54-af5a-b26c1b54d5d6', 'unidad', 'unidad', 'M0009', 'unidad', 1, 1128.8424, null),  -- Mango Rodillo Grande
  (190, 'c709fc08-3f4e-4e10-9399-2df6dab24833', 'unidad', 'unidad', null, null, null, null, 29),  -- Media Filtro Para Pintura
  (191, '51ca07ea-9e35-4e0d-a380-37918dffca55', 'unidad', 'unidad', null, null, null, null, null),  -- Pincel N 10
  (192, '5545e48b-f7cd-4b99-8bf9-a10729bb57a1', 'unidad', 'unidad', 'P0017', 'unidad', 1, 832, 8),  -- Pincel N 20
  (193, '84583c11-0060-4540-874c-d1a972e0482c', 'unidad', 'unidad', 'P0019', 'unidad', 1, 1073, null),  -- Pincel N 25
  (194, '0115261b-0ba6-4d7c-8fea-a512aea75fac', 'unidad', 'unidad', 'R0034', 'unidad', 1, 855, 30),  -- Repuesto Rodillo Chico
  (195, '7df56169-6788-41a5-8ce9-3899671a6dd4', 'unidad', 'unidad', 'R0035', 'unidad', 1, 1225, null),  -- Repuesto Rodillo Grande
  (196, '729ee7fc-bc79-4c50-a897-cd66fb6318be', 'unidad', 'unidad', 'R0032', 'unidad', 1, 606.3514, null),  -- Rodillo Epoxy 5
  (197, 'fc6cc486-596a-42cc-9325-61a01844df00', 'unidad', 'unidad', 'R0033', 'unidad', 1, 751.33, 16),  -- Rodillo Epoxy 8
  (198, 'cf2441fb-ade0-45fb-a680-370c7f10dee3', 'fraccionado', 'litro', null, null, null, null, 9),  -- Acetona
  (199, 'f6a98209-d1bf-4280-807c-0c12a75de4d6', 'fraccionado', 'litro', null, null, null, null, null),  -- Alcohol Suelto
  (200, 'c41224aa-205e-475b-984b-89a636ec30c2', 'unidad', 'unidad', 'A0008', 'litro', 1, 11221, null),  -- Autopolish
  (201, '03f203dc-d775-4d48-961c-f11e8c70510a', 'unidad', 'unidad', null, null, null, null, null),  -- Chori Blanco
  (202, '72c3be6f-bcfa-4a5c-aaf2-890ea0195804', 'fraccionado', 'litro', null, null, null, null, null),  -- Diluyente Fana
  (203, 'ceffe38a-24aa-48be-b577-f3d49bcc7ffd', 'unidad', 'unidad', null, null, null, null, 19),  -- Goma Blanca Tipo Salchicha
  (204, '41bf570e-80ea-44ca-b854-3701d211f5dc', 'unidad', 'unidad', null, null, null, null, null),  -- Gotita 7430
  (205, '6bee16cb-6af2-4e6a-a9f0-653f2d6e7e17', 'unidad', 'unidad', null, null, null, null, null),  -- Gotita 7470
  (206, '8fc2e426-f1de-4903-ba0e-36dcb3934e12', 'unidad', 'litro', null, null, null, null, null),  -- Lata Diluyente Fana
  (207, 'd4c5a533-b1db-423d-a87f-87b21b6632af', 'unidad', 'unidad', 'F0022', 'kg', 1, 140756, null),  -- Lata Fana
  (208, '54940499-ae84-484b-bb21-a906a882a5bf', 'unidad', 'unidad', null, null, null, null, null),  -- MASILLA E-POXY
  (209, 'c46658a8-dc4b-4fcd-9e81-8324f92abb79', 'unidad', 'unidad', 'M0015', 'kg', 1, 34170, 23),  -- Masilla Finish
  (210, '1f646a75-13c4-4624-b150-8922f21e2c69', 'unidad', 'unidad', null, null, null, null, null),  -- Masilla Poliéster
  (211, 'dda985d8-ed0c-4bff-8cb7-6d4a21e86b8a', 'unidad', 'unidad', 'P0005', 'kg', 1, 12220, 21),  -- Pasta Fina
  (212, '94d6b696-99e1-4e0e-bd5c-d7eec711afbc', 'unidad', 'unidad', 'PEROXIDO10', 'unidad', 1, 5858.75, null),  -- Peroxido
  (213, '416f03d7-9b43-40ad-a23e-01fd7f642e76', 'unidad', 'unidad', null, null, null, null, null),  -- Poxipol
  (214, '3d45eb0a-5f8b-4170-8b55-acb73792aad3', 'unidad', 'unidad', 'S0004', 'unidad', 1, 13274.8, null),  -- SELLADOR 3M TIPO SALCHICHA NEGRO
  (215, '95fe4aef-e051-42f2-9d52-61e0332c5f55', 'unidad', 'unidad', 'S0005', 'unidad', 1, 50512, null),  -- Sellador 4000Uv
  (216, '641cd2f6-34ea-46c6-9214-22c18d6bcb4f', 'fraccionado', 'litro', null, null, null, null, null),  -- Thinner
  (217, '8f8209e6-fd7e-4d76-b8ba-6f48bd1fdefd', 'unidad', 'unidad', null, null, null, null, null),  -- chori negro
  (218, '92629e6e-fe1e-4047-8fa8-44b388ef6b71', 'unidad', 'unidad', 'C0054', 'unidad', 10, 180.8078, null),  -- HOJA CUTER
  (219, '52c4964e-4904-4173-ae1d-ee568e0c0f2d', 'unidad', 'unidad', 'S0001', 'unidad', 1, 11503.8, null),  -- Sellador 3M 550 Blanco Cartucho
  (220, '64027b3c-7d1f-4ebd-a8a5-5df4a1d3b047', 'unidad', 'unidad', 'S0002', 'unidad', 1, 11503.8, null),  -- Sellador 3M 550 Negro Cartucho
  (221, '3cb1010d-45b7-4198-a0ba-5a09f99d6319', 'unidad', 'unidad', 'TEROSON', 'kg', 1, 23596, null),  -- Tereson Negro
  (222, 'eadb6acc-7f2d-4dfb-9416-d8ac60500a0c', 'unidad', 'unidad', 'W0001', 'unidad', 1, 10052.58, null)  -- WD-40
;

insert into public.consumibles_config (
  material_id, codigo_etiqueta, forma_entrega, unidad_entrega,
  proveedor_nombre, proveedor_codigo, unidad_compra, factor_compra,
  costo_unitario_ars, costo_lista_item_id, costo_actualizado_at, favorito_orden
)
select
  n.material_id,
  'KA' || lpad((b.base + n.rn)::text, 4, '0'),
  n.forma_entrega,
  n.unidad_entrega,
  case when li.id is not null then 'Rebollar' end,
  case when li.id is not null then n.proveedor_codigo end,
  case when li.id is not null then n.unidad_compra end,
  case when li.id is not null then n.factor_compra end,
  case when li.id is not null then n.costo_unitario_ars end,
  li.id,
  case when li.id is not null then now() end,
  n.favorito_orden
from (
  select c.*, row_number() over (order by c.ord) as rn
  from _cns_config c
  join public.panol_materiales m on m.id = c.material_id
  where not exists (select 1 from public.consumibles_config x where x.material_id = c.material_id)
) n
cross join (
  select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) as base
  from public.consumibles_config
) b
left join public.consumibles_lista_items li
  on li.lista_id = (select id from public.consumibles_listas where proveedor_nombre = 'Rebollar' and vigente_desde = date '2026-10-08' order by created_at limit 1)
 and li.codigo = n.proveedor_codigo
 and li.material_id = n.material_id;

-- Los que ya tenían config (creada desde la app): solo se completa lo vacío.
update public.consumibles_config c
   set proveedor_nombre = coalesce(c.proveedor_nombre, 'Rebollar'),
       proveedor_codigo = v.proveedor_codigo,
       unidad_compra = coalesce(c.unidad_compra, v.unidad_compra),
       factor_compra = coalesce(c.factor_compra, v.factor_compra),
       costo_unitario_ars = coalesce(c.costo_unitario_ars, v.costo_unitario_ars),
       costo_lista_item_id = coalesce(c.costo_lista_item_id, li.id),
       costo_actualizado_at = coalesce(c.costo_actualizado_at, now())
  from _cns_config v
  join public.consumibles_lista_items li
    on li.lista_id = (select id from public.consumibles_listas where proveedor_nombre = 'Rebollar' and vigente_desde = date '2026-10-08' order by created_at limit 1)
   and li.codigo = v.proveedor_codigo
   and li.material_id = v.material_id
 where c.material_id = v.material_id
   and c.proveedor_codigo is null
   and v.proveedor_codigo is not null;

update public.consumibles_config c
   set favorito_orden = v.favorito_orden
  from _cns_config v
 where c.material_id = v.material_id
   and c.favorito_orden is null
   and v.favorito_orden is not null
   and not exists (select 1 from public.consumibles_config x where x.favorito_orden = v.favorito_orden);

-- La secuencia sigue desde el último código usado.
select setval(
  'public.consumibles_codigo_seq',
  (select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) + 1 from public.consumibles_config),
  false
);

commit;
