-- Import completo de filas STD K55 desde 01_todas_las_filas_k55.csv.
-- Incluye filas que antes estaban en revision; los posibles duplicados se limpian despues.
begin;

create temp table k55_std_raw (
  excel_row int not null,
  descripcion text not null,
  cantidad numeric not null,
  unidad_medida text,
  proveedor text,
  categoria_id uuid not null,
  notas text,
  revisado boolean not null default false
) on commit drop;

insert into k55_std_raw (excel_row, descripcion, cantidad, unidad_medida, proveedor, categoria_id, notas, revisado) values
  (2, 'Abrazadera inox 1"', 32, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 2.
Sistema/Plano: Sist. Agua Fria
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (3, 'Abrazadera inox 1½"', 38, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 3.
Sistema/Plano: Sist. Agua Fria
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (4, 'Abrazadera inox 3/4"', 44, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 4.
Sistema/Plano: Sist. Agua Fria
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (5, 'Adaptador tunel sternthruster 250mm', 1, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 5.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (6, 'Aire acondicionado 16000 BTU', 3, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 6.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (7, 'Aire acondicionado 6.000 btu', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 7.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (8, 'Anafe vitrocerámica 2 hornallas', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 8.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar', false),
  (9, 'Ancla Bruce 30kg galvanizada', 1, 'unid', 'Baron', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 9.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=Comprar', true),
  (10, 'Ánodo de flaps', 2, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 10.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (11, 'Ánodo eje 2 3/4"', 2, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 11.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (14, 'Antena Starlink mini (Kit)', 1, 'unid', 'MercadoLibre', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 14.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=Comprar', false),
  (15, 'Antena VHF + base', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 15.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (16, 'Antirruido metalizado sala maquinas', 30, 'm2', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 16.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco', false),
  (17, 'Automatico Johnson pump 20A', 4, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 17.
Sistema/Plano: Achique
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (21, 'Bacha Johnson Z52, profundidad 15cm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 21.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=NO VA', false),
  (22, 'Bacha Piazza A426 Blanco', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 22.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: modelo/definicion pendiente
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Especificar', false),
  (23, 'Baranda hueco flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 23.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (24, 'Baranda perimetral +18 tinteros K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 24.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (25, 'Barra 2 1/2" inox 316 L=1000mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 25.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (26, 'Barra 2 3/4" inox 316 L=3000mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 26.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (28, 'Barral de ropero', 2, 'mts', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 28.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (29, 'Base mesa chica flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 29.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (30, 'Base mesa grande flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 30.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (31, 'Baterías 12v 180Ah', 13, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 31.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: modelo/definicion pendiente | sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Especificar', false),
  (32, 'Bisagra codo 0 + base con clip', 20, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 32.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (34, 'Bisagra codo 9 + base con clip', 34, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 34.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (35, 'Bisagra oculta para puertas', 21, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 35.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar, 55-2=NO VA', false),
  (36, 'Bisagra oculta para puertas - OPCIONAL sin vestidor', 18, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 36.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=NO VA, 55-2=Comprar', false),
  (37, 'Bisagra tipo piano', 1.5, 'mts', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 37.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (39, 'Bitas K55', 8, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 39.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: proveedor nuevo Maxi Herrero
Estado por obra: 55-1=Comprar', false),
  (40, 'Bocina Marinco doble INOX electrica 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 40.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (41, 'Bomba achique 2000gph 12V', 3, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 41.
Sistema/Plano: Achique
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (42, 'Bomba achique 4000gph 12V', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 42.
Sistema/Plano: Achique
Flag original: STD', true),
  (43, 'Bomba aire acondicionado 220v 500gph', 4, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 43.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (44, 'Bomba dual 10.4gpm 12v johnson pump', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 44.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante', false),
  (46, 'Botazo plástico blanco', 44, 'mts', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 46.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (49, 'Brida cuadrada inox 316, medidas 300 mm interior x 400 mm exterior, espesor = 1/4"', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 49.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (50, 'Brida de 100 mm interior x 160 mm exterior x 3/8. Inox 316', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 50.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (51, 'Brida de 85 mm interior x 160 mm exterior x 3/8". Inox 316', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 51.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (52, 'Bridas inox + bocina mecanizada y perforada', 2, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 52.
Flag original: STD', true),
  (53, 'Buje reduc. 1 1/2" x 1" plástico', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 53.
Flag original: STD', true),
  (54, 'Buje reduc. 1 1/2" x 3/4" plástico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 54.
Flag original: STD', true),
  (55, 'Buje reduc. 1 1/4" x 1" plástico', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 55.
Flag original: STD', true),
  (56, 'Buje reduc. 1" x 3/4" plástico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 56.
Flag original: STD', true),
  (57, 'Buje reduc. 3/4" x 1/2" plástico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 57.
Flag original: STD', true),
  (58, 'Bujes de bronce y goma para eje de 2 3/4"', 3, 'unid', 'Parra', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 58.
Sistema/Plano: Sist. Motor
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (60, 'Cable tipo Marinco 3x10mm', 12, 'mts', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 60.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (62, 'Cableado A salon K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 62.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (63, 'Cableado B camarote principal K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 63.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (64, 'Cableado C cocina K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 64.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (65, 'Cableado D camarote de proa K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 65.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (66, 'Cabos 18mm x 12m negro', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 66.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (67, 'Cadena 10mm calibrada galvanizada', 50, 'mts', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 67.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (68, 'Caja drenaje ducha 1000 GPH', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 68.
Sistema/Plano: Sist. Agua
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (69, 'Caja paso Roker Pr1005', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 69.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco', false),
  (70, 'Caja paso Roker Pr1010/106', 4, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 70.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco', false),
  (71, 'Cajas exteriores cambre', 3, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 71.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (72, 'Calefactor Autoterm Air 4D 12V 4000W', 2, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 72.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=Comprar, 55-2=Comprar, 55-3=Comprar', true),
  (73, 'Cañeria termofusion 1"', 56, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 73.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (74, 'Canilla de bacha flybridge', 1, 'unid', 'Baron', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 74.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (75, 'Canilla de cocina', 1, 'unid', 'MercadoLibre', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 75.
Sistema/Plano: Sist. Agua
Flag original: STD
Estado por obra: 55-1=Comprar, 55-2=NO VA, 55-3=Revisar, 55-4=Revisar', true),
  (77, 'Caño corrugado flex 1"', 10, 'mts', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 77.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (78, 'Caño D. exterior = 90 mm, e = 4 mm, L = 1100 mm. Inox 316', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 78.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (79, 'Caño inox 316 de 1/2", L = 1,5 m', 1.5, 'mts', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 79.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (80, 'Caño inox 316 de 3/4", L = 3 m', 3, 'mts', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 80.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (81, 'CAÑO POLIAMIDA REFORZADO DE 1/4"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 81.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (82, 'Caño schedule 80, 3 1/2" nominal, L = 285 mm Inox 316', 4, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 82.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (83, 'Cargador inversor Victron Multiplus 12V 3000W', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 83.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (85, 'Catalina de fondeo K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 85.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (86, 'CAVA 8 BOTELLAS PHILCO - PHCAV08N2', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 86.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido', false),
  (90, 'Cerramiento completo (Lona)', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 90.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (91, 'Chapa de inox 316 de 3 x 1,5 m, espesor = 2 mm', 1.5, 'mts', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 91.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (92, 'Chapa de proa K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 92.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (93, 'Chapas de inox 316 de 2 x 1,25 m, espesor = 2 mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 93.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (94, 'Chapas de inox 316 de 2 x 1,25 m, espesor = 3 mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 94.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (95, 'Chapas de inox 316 de 3 x 1,5 m, espesor = 3 mm', 5, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 95.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (96, 'Chapas inox 316 de 400 x 400 mm, espesor = 1/4"', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 96.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (97, 'Codo 90° HH bronce 1"', 8, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 97.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (98, 'Codo 90° HH plastico 1 1/4"', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 98.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (99, 'Codo 90ª MH bronce 1"', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 99.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (100, 'Codo 90ª MH bronce 1/2"', 8, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 100.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (101, 'Codo 90ª MH bronce 3/4"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 101.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (102, 'Codo 90ª MH plastico 1 1/2"', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 102.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (103, 'Compas magnético reglamentario (negro)', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 103.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (104, 'Conector "T" c/espiga WHALE WX1521', 11, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 104.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (105, 'Conector "T" WHALE WX1502', 21, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 105.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (106, 'Conector Codo c/espiga WHALE WX1522', 10, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 106.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (107, 'Conector Codo WHALE WX1503', 6, 'unid', 'Trimer', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 107.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante', false),
  (108, 'Conector rosca H termofusion 1"', 6, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 108.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (111, 'Guía telescóp. cierre suave 20cm', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 111.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=NO VA, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (112, 'Guía telescóp. cierre suave 25cm', 3, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 112.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (113, 'Guía telescóp. cierre suave 40cm', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 113.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (114, 'Guía telescóp. cierre suave 45cm', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 114.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (115, 'Corredera ocultas Bronzen LARGO 500mm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 115.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar, 55-2=Revisar, 55-3=Revisar, 55-4=Revisar', false),
  (116, 'Cuchara bronce Nro 104', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 116.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (117, 'Cuchara bronce ranurada toma 1/2"', 1, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 117.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (118, 'CUPLA DE BRONCE 1/2"', 1, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 118.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (119, 'Cupla Inoxidable 1 1/2"', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 119.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (120, 'Cupla Inoxidable 1 1/4"', 3, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 120.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (121, 'Cupla Inoxidable 1"', 5, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 121.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (122, 'Cupla Inoxidable 1/2"', 3, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 122.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (123, 'Cupla Inoxidable 1/4"', 5, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 123.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (124, 'Cupla Inoxidable 2"', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 124.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (125, 'Cupla Inoxidable 3/4"', 3, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 125.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (126, 'Cupla termofusion 1"', 8, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 126.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (127, 'Defensas blancas con cabo negro 8mm - 4m', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 127.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (129, 'Destorcedor tipo "gusano" INOX p/cadena 10-12mm', 1, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 129.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (130, 'Direccion electro asistida twin disk', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 130.
Sistema/Plano: Sist. Timon
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (133, 'Duchador con barral FV Polca', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 133.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (135, 'Duchador frio calor WHALE Twist', 1, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 135.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (137, 'Ducto p/extractor de 3"', 3, 'unid', 'Trimer', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 137.
Sistema/Plano: Sist. Sanitario
Flag original: STD', true),
  (138, 'Ecosonda', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 138.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido', false),
  (140, 'EMPALME ESPIGA PARA MANGUERA 1" PLASTICO', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 140.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (141, 'Enchufe hembra', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 141.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (142, 'Enchufe macho', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 142.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (143, 'Entrada agua potable (marina)', 1, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 143.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (144, 'Entrerrosca 1" bronce', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 144.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (145, 'Entrerrosca 1/2" bronce', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 145.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (146, 'Entrerrosca 1/2" plastico', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 146.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (147, 'Entrerrosca 3/4" bronce', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 147.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (148, 'Entrerrosca de reduccion 3/4" x 1/2" plastico', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 148.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (149, 'Epuyén – Juego monocomando para mesada de cocina (cromado)', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 149.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido', false),
  (151, 'Escalera flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 151.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (153, 'Extractor Rule 3" 12V', 2, 'unid', 'Trimer', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 153.
Sistema/Plano: Sist. Sanitario
Flag original: STD
A revisar: posible marca/variante', false),
  (154, 'Fabricadora de hielo WHITE ICE ACERO INOXIDABLE', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 154.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (155, 'Faro Marinco 12V dirigible', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 155.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (156, 'Ficha Marinco hembra 32A 220V', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 156.
Sistema/Plano: Sist. Electrico
Flag original: STD', true),
  (157, 'Filtro agua 1"', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 157.
Sistema/Plano: Sist. Sanitario
Flag original: STD
Estado por obra: 55-1=Revisar', true),
  (158, 'Filtro agua 3/4"', 2, 'unid', 'Casa Iriarte', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 158.
Sistema/Plano: Sist. Sanitario
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (159, 'Flexible mallado para agua 1/2" X 40cm', 8, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 159.
Sistema/Plano: Sist. Sanitario
Flag original: STD', true),
  (160, 'Flexible mallado para agua 1/2" X 50cm', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 160.
Sistema/Plano: Sist. Sanitario
Flag original: STD', true),
  (162, 'Funda para ficha Marinco 32A 220V', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 162.
Sistema/Plano: Sist. Electrico
Flag original: STD', true),
  (163, 'Generador Kohler 18EFKOZD/21EKOZD', 1, 'unid', 'Trimer', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 163.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Estado por obra: 55-1=En Chubut', false),
  (164, 'Giratorio gusano cadena 10-12mm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 164.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (170, 'Horno Samsung NV7B4040VAS/BG', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 170.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar', false),
  (171, 'Imanes para puertas de muebles', 46, 'unid', 'Rincon del Herraje', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 171.
Sistema/Plano: Muebles
Flag original: STD
Estado por obra: 55-1=En Chubut, 55-2=Revisar, 55-3=Comprar, 55-4=Comprar', true),
  (173, 'Inodoro Tecma Thetford silence 2 plusg con bidet y tapa 12v', 2, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 173.
Sistema/Plano: Sist. Sanitario
Flag original: STD', true),
  (174, 'Instrumento agua/combustible aro cromado', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 174.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (175, 'Joystick doble Quick italy', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 175.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (176, 'Juego monocomando para bañera y ducha Epuyén 0106/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 176.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (178, 'Juego monocomando para lavatorio Epuyén 0206/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 178.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (182, 'Limpia Parabrisas pantograficos', 2, 'unid', 'Tableros Costa', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 182.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: modelo/definicion pendiente | sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Estado por obra: 55-1=En Chubut, 55-2=Especificar', false),
  (183, 'Llave carling malacate 2 puntos', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 183.
Sistema/Plano: Sist. Electrico
Flag original: STD', true),
  (184, 'Llave corte batería remota Blue Sea', 6, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 184.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Barco', true),
  (185, 'Llave de paso Whale WX1573', 4, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 185.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (187, 'Luces de lectura', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 187.
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (189, 'Luz banda ROJA led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 189.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (190, 'Luz banda VERDE led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 190.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (191, 'Luz fondeo led blanca 360', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 191.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (192, 'Luz navegacion proa blanca led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 192.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (193, 'luz popa led blanca', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 193.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (195, 'Malacate Quick italy 1500 watts 12v acero inoxidable', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 195.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=Revisar', false),
  (196, 'Manguera cristal alambre 1"', 65, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 196.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (197, 'Manguera cristal alambre 1½"', 50, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 197.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (198, 'Manguera cristal alambre 3/4"', 65, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 198.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (199, 'Mesa ratona en salon, EL LINK ES UN EJEMPLO', 1, 'unid', 'MercadoLibre', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 199.
Sistema/Plano: Muebles
Flag original: STD
A revisar: modelo/definicion pendiente
Estado por obra: 55-1=Especificar', false),
  (202, 'Multicontrol Victron con cable (para cargador inversor)', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 202.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (203, 'Niple de inox 316 de 1/2", L= 100 mm', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 203.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (204, 'Niple de inox 316 de 3/4", L = 100 mm', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 204.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (205, 'Ojo de buey', 5, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 205.
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (206, 'Panel bomba de achique Johnson pump', 5, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 206.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: posible marca/variante', false),
  (208, 'Pantalla tactil de timonera interior, modelo?? accesorios??', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 208.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (210, 'Pasamanos escalera flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 210.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (211, 'Pasamanos varios K55', 13, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 211.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (212, 'Percha Epuyén 0166/L2 Cromado', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 212.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (214, 'Perfil aluminio tira LED', 110, 'mts', 'MercadoLibre', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 214.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (215, 'Perfiles de aluminio para tiras led', 110, 'unid', 'MercadoLibre', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 215.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: modelo/definicion pendiente | sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Estado por obra: 55-1=Especificar', false),
  (217, 'Picaportes Currao SARDEGNA - ver color', 14, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 217.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin rubro | posible marca/variante
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar, 55-2=NO VA', false),
  (219, 'Placa de honeycomb (terciado de 6 mm + núcleo de panal de abeja de 15 mm + terciado de 6 mm) de 1,2 mts x 2,45 mts', 22, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 219.
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco, 55-2=En Barco', false),
  (221, 'Plaquetas p/precintos', 500, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 221.
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (222, 'Plotter de flybridge STD, modelo?? accesorios??', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 222.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (224, 'Portarrollo Epuyén 0167/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 224.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (226, 'Precinto 35 CM', 500, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 226.
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (228, 'Puertitas cockpit K55', 2, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 228.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (229, 'Punteras de plástico para perfil tira LED', 60, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 229.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (231, 'Racor H a codo de 1 1/2" plastico', 5, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 231.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (232, 'Racor H a codo de 1" plastico', 12, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 232.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (233, 'Racor H a codo de 1/2" plastico', 5, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 233.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (234, 'Racor H a codo de 3/4" plastico', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 234.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (235, 'Racor M 1" x 25mm bronce', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 235.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (236, 'Racor M 3/4" bronce', 6, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 236.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (237, 'Racor M a codo de 1" plastico', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 237.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (238, 'Racor M a codo de 1/2" plastico', 8, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 238.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (239, 'Racor M a codo de 3/4" plastico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 239.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (240, 'Racor M de 1" plastico', 5, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 240.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (241, 'Racor M de 1/2" plastico', 2, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 241.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (242, 'Racor M de 3/4" plastico', 7, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 242.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (243, 'Racor M de bronce 1 1/2" x 38mm', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 243.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (244, 'Radio VHF', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 244.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido', false),
  (245, 'Recorte chapa de inox 316 de 400mm x 250mm x 1/2" de espesor', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 245.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (246, 'Recorte chapa de inox 316 según plantilla "Patas de gallo - K52", e = ?', 4, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 246.
Sistema/Plano: Sist. Motor
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (247, 'REGULADOR DE AGUA AMARRA', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 247.
Sistema/Plano: Sist. Agua
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (248, 'Rejilla D60 Obturable Negra - Calefactor Autoterm', 4, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 248.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=Comprar', true),
  (249, 'Rejilla D60 Orientable Negra - Calefactor Autoterm', 2, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 249.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=Comprar', true),
  (250, 'Rejilla D90 Obturable Negra - Calefactor Autoterm', 5, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 250.
Sistema/Plano: Sist. A.C.
Flag original: STD
Estado por obra: 55-1=Comprar', true),
  (251, 'Resorte a gas para escalera - MODELO A DEFINIR', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 251.
Sistema/Plano: Muebles
Flag original: STD
A revisar: modelo/definicion pendiente
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Especificar, 55-2=Especificar, 55-3=Especificar, 55-4=Especificar', false),
  (252, 'Resorte a gas para puertas de alacenas - 60N', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 252.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (253, 'Resorte a gas para puertas de alacenas - 80N', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 253.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar, 55-2=Comprar, 55-3=Revisar, 55-4=Revisar', false),
  (254, 'Rollo de cable negro 1.5mm', 100, 'mts', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 254.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (255, 'Rollo de cable rojo 1.5mm', 100, 'mts', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 255.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (256, 'Sapito desagote ancla', 2, 'unid', 'Baron', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 256.
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (257, 'Sello PSS para eje 2-3/4", tubo 4"', 2, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 257.
Sistema/Plano: Sist. Timon
Flag original: STD', true),
  (258, 'Sensor agua 115cm', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 258.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (259, 'Separador agua-gases 2" Centek 1020200 (grupo)', 1, 'unid', 'Trimer', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 259.
Sistema/Plano: Sist. Motor
Flag original: STD', true),
  (260, 'Silenciador escape 2" Centek 1500027w (grupo)', 1, 'unid', 'Trimer', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 260.
Sistema/Plano: Sist. Motor
Flag original: STD', true),
  (261, 'Silenciador Vernalift 6" Centek 16X16 (motor)', 2, 'unid', 'Trimer', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 261.
Sistema/Plano: Sist. Motor
Flag original: STD', true),
  (265, 'Solenoide Quick italy 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 265.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (266, 'Sopapa bañera c/codo Delta 1½"', 7, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 266.
Sistema/Plano: Sist. Sanitario
Flag original: STD', true),
  (267, 'Soporte elevador TV - JC35VT-1000', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 267.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (268, 'Soporte pared TV brazo', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 268.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco, 55-2=Comprar', false),
  (269, 'Soporte pared TV', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 269.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (270, 'Soportes de barral de ropero', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 270.
Sistema/Plano: Muebles
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=Comprar, 55-3=Comprar, 55-4=Comprar', false),
  (271, 'Soportes tapiceria banco cockpit K55', 3, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 271.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (272, 'Soportes tapiceria banco proa K55', 7, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 272.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (273, 'Soportes tapiceria flybridge K55', 13, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 273.
Sistema/Plano: Herrajes Std.
Flag original: STD
A revisar: sin rubro | proveedor nuevo Maxi Herrero
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false),
  (274, 'Stern thurster Quick doble helice 6,5kw 250mm 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 274.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (275, 'T plástica espiga 1 1/2"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 275.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (276, 'T con espiga rosca central de 1" plastico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 276.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (277, 'Tableros electricos COSTA', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 277.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: modelo/definicion pendiente | sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Especificar', false),
  (278, 'Tablón Okume', 300, 'pies', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 278.
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut, 55-2=En Chubut', false),
  (279, 'Tambucho de proa - Cuadrado 60x60cm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 279.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (280, 'Tanque acumulador presion Flojet-Jabsco', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 280.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
Estado por obra: 55-1=En Chubut', false),
  (281, 'Tanques de agua', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 281.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro | proveedor astillero=fabricacion interna
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Proveedor original: Astillero (fabricacion interna).', false),
  (282, 'Tanques de combustible con visor', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 282.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: modelo/definicion pendiente | sin rubro | proveedor astillero=fabricacion interna
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Proveedor original: Astillero (fabricacion interna).
Estado por obra: 55-1=Especificar', false),
  (283, 'Tapa tanque agua 1 1/2" cromada c/venteo', 1, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 283.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (284, 'Tapa tanque combustible 2" cromada c/venteo', 2, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 284.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (285, 'Tapa tanque waste 1 1/2" cromada c/venteo', 1, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 285.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (286, 'Tapon rosca M de 1/2" plastico', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 286.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (287, 'T termofusion 1" rosca central H 1/2"', 16, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 287.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (289, 'Tender lift OPACMARE 5222/90.04', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 289.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=NO VA, 55-2=NO VA, 55-3=NO VA, 55-4=Pedido', false),
  (290, 'Termica malacate 130 AMP', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 290.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (291, 'Termotanque CAMCO 76L', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 291.
Sistema/Plano: Sist. Agua
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (292, 'Tira LED blanco cálido', 110, 'mts', 'MercadoLibre', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 292.
Sistema/Plano: Sist. Electrico
Flag original: STD', true),
  (293, 'Toallero Epuyén 0163/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 293.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Pedido, 55-2=NO VA', false),
  (295, 'Toma pasacasco 1 1/2" bronce', 6, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 295.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (296, 'Toma pasacasco 1" bronce', 9, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 296.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (297, 'Toma pasacasco 3/4" bronce', 6, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 297.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (298, 'Toma 1" plastico', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 298.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (299, 'Toma tierra Marinco 32A 220V', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 299.
Sistema/Plano: Sist. Electrico
Flag original: STD
Estado por obra: 55-1=En Chubut', true),
  (300, 'Tomas cambre de 20 amp', 2, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 300.
Sistema/Plano: Sist. Electrico
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (301, 'Traba cadena 10-12mm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 301.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin rubro
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false),
  (302, 'Tubo bowthruster D= 250mm, e= 9 mm, L = 1,50 m', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 302.
Sistema/Plano: Alistamiento
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Barco', false),
  (303, 'Tubo Whale azul 15mm WX7152', 60, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 303.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (304, 'Tubo Whale rojo 15mm WX7154', 50, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 304.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (305, 'TV 24" Noblex', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 305.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (306, 'TV 32" Hd H5000 Smart', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 306.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=Comprar', false),
  (307, 'TV SAMSUNG 43" FULL HD T5300', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 307.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=En Chubut', false),
  (308, 'TV SAMSUNG 50" Crystal UHD 4K U8000F', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 308.
Sistema/Plano: Electrodomesticos
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.
Estado por obra: 55-1=NO VA', false),
  (310, 'Union doble 1" termofusion', 4, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 310.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: sin proveedor en Excel.', false),
  (311, 'Union rosca H 1/2" WHALE WX1532', 23, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 311.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (313, 'Union rosca M 1/2" WHALE WX1514', 19, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 313.
Sistema/Plano: Sist. Agua
Flag original: STD
A revisar: posible marca/variante
A revisar: sin proveedor en Excel.', false),
  (315, 'Union rosca M 1/2" bronce x caño poliamida 1/4" con tuerca y virola', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 315.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (317, 'Valvula de un solo sentido para bombas de achique 1 1/2"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 317.
Sistema/Plano: Achique
Flag original: STD', true),
  (318, 'Valvula de un solo sentido para bombas de achique 1"', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 318.
Sistema/Plano: Achique
Flag original: STD', true),
  (320, 'Válvula esférica 1" HH', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 320.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (321, 'Válvula esférica 1/2" HH', 9, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 321.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (322, 'Válvula esférica 3/4" HH', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 322.
Sistema/Plano: Sist. Agua
Flag original: STD', true),
  (324, 'Victron, combinador de baterias cyrix-ct', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 324.
Sistema/Plano: Sist. Electrico
Flag original: STD', true),
  (325, 'Visores con bolita para tanques combustible', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 325.
Sistema/Plano: Sist. Combustible
Flag original: STD
A revisar: sin proveedor en Excel.', false);

create temp table k55_std_manual_target (
  excel_row int not null,
  material_id uuid not null,
  cantidad numeric not null,
  nota text
) on commit drop;

insert into k55_std_manual_target (excel_row, material_id, cantidad, nota) values
  (12, '335658f9-b72a-41cf-ab2c-bceb8dfb7fe3'::uuid, 1, 'Import K55 Excel fila 12.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut'),
  (13, '29687db1-d64d-4f74-bd3c-fb8a51af0a57'::uuid, 2, 'Import K55 Excel fila 13.
Sistema/Plano: Alistamiento
Flag original: STD
Estado por obra: 55-1=En Chubut');

-- Crear faltantes por descripcion exacta. Si ya existe, se reutiliza.
insert into public.panol_materiales (categoria_id, descripcion, proveedor, unidad_medida, moneda, notas, origen, revisado, activo)
select r.categoria_id, r.descripcion, r.proveedor, coalesce(nullif(btrim(r.unidad_medida), ''), 'unid'), 'USD', r.notas, 'import_k55_excel', r.revisado, true
from k55_std_raw r
where not exists (
  select 1 from public.panol_materiales m
  where lower(btrim(m.descripcion)) = lower(btrim(r.descripcion))
);

-- Setear K55 para todos los STD por descripcion exacta.
with matched_raw as (
  select distinct on (lower(btrim(r.descripcion)))
    m.id as material_id, r.cantidad
  from k55_std_raw r
  join public.panol_materiales m on lower(btrim(m.descripcion)) = lower(btrim(r.descripcion))
  order by lower(btrim(r.descripcion)), m.created_at desc nulls last, m.id
), all_targets as (
  select material_id, cantidad from matched_raw
  union all
  select material_id, cantidad from k55_std_manual_target
)
insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
select material_id, '55', 'standard', cantidad from all_targets
on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;

-- Conservar notas nuevas en materiales existentes sin duplicarlas textualmente.
update public.panol_materiales m
set notas = btrim(concat_ws(E'\n', nullif(btrim(coalesce(m.notas, '')), ''), r.notas))
from k55_std_raw r
where lower(btrim(m.descripcion)) = lower(btrim(r.descripcion))
  and nullif(btrim(coalesce(r.notas, '')), '') is not null
  and position(lower(left(btrim(r.notas), 80)) in lower(coalesce(m.notas, ''))) = 0;

update public.panol_materiales m
set notas = btrim(concat_ws(E'\n', nullif(btrim(coalesce(m.notas, '')), ''), t.nota))
from k55_std_manual_target t
where m.id = t.material_id
  and nullif(btrim(coalesce(t.nota, '')), '') is not null
  and position(lower(left(btrim(t.nota), 80)) in lower(coalesce(m.notas, ''))) = 0;

select 'std_excel_total' as paso, 261::int as filas;
select 'std_raw' as paso, count(*)::int as filas from k55_std_raw;
select 'std_manual_target' as paso, count(*)::int as filas from k55_std_manual_target;
select 'k55_standard_total' as paso, count(*)::int as filas from public.panol_material_modelo where modelo='55' and variante='standard';

commit;
