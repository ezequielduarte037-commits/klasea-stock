-- Import seguro K55 desde K55 seguimiento (2).xlsx, primera hoja.
-- Generado desde 15_import_seguro_exactos_y_nuevos.csv.
-- Solo aplica EXACTOS y NUEVOS sin dudas/duplicados probables.
begin;

create temp table k55_reuse (
  material_id uuid not null,
  cantidad numeric not null,
  excel_row int not null,
  item_original text not null,
  observacion text
) on commit drop;

insert into k55_reuse (material_id, cantidad, excel_row, item_original, observacion) values
  ('ac5fdea1-9bdd-4b1e-98ea-54725dcd3b3e'::uuid, 32, 2, 'Abrazadera inox 1"', null),
  ('b00cefec-d911-4619-b48e-421bfb31d246'::uuid, 38, 3, 'Abrazadera inox 1½"', null),
  ('153b39e4-c586-41ce-a180-7deeec1416d8'::uuid, 44, 4, 'Abrazadera inox 3/4"', null),
  ('cc87231c-d12b-4c0f-8bdd-e3357aca99dd'::uuid, 3, 6, 'Aire acondicionado 16000 BTU', 'Frio calor platinum, con control, cable y control inalambrico'),
  ('babc7783-bbe9-46da-bebb-9952c81747fa'::uuid, 1, 8, 'Anafe vitrocerámica 2 hornallas', 'SAMSUNG CTR432'),
  ('e476e8a2-6556-491e-aef2-c306266d642c'::uuid, 2, 10, 'Ánodo de flaps', 'PERFORMANCE METAL USA'),
  ('df54fb2c-f42c-49e8-95bf-42ed3cda26a2'::uuid, 2, 15, 'Antena VHF + base', 'SHAKESPEARE 2.4M CON BASE ACERO INOXIDABLE'),
  ('d6ea9390-4239-4aa2-9583-7e61287d5c6b'::uuid, 30, 16, 'Antirruido metalizado sala maquinas', null),
  ('f68590a3-750a-426d-ab91-b6d43f6b1cd6'::uuid, 13, 31, 'Baterías 12v 180Ah', '5 Servicio, 2 bow, 2 stern, 2 cada motor'),
  ('f60a174a-e250-4f29-b084-d7b19e4e2f12'::uuid, 34, 34, 'Bisagra codo 9 + base con clip', 'Puertas roperos'),
  ('ed03965a-9ca9-42fa-8a21-e4a13c974566'::uuid, 21, 35, 'Bisagra oculta para puertas', '7 puertas'),
  ('adc7bd8f-fe7e-4cf3-bf35-5212e176c354'::uuid, 3, 41, 'Bomba achique 2000gph 12V', 'STD RULE, variante: Johnson pump 2200gph 12V'),
  ('fafa3d1a-adf9-4d42-bd83-85a5eaf3dffa'::uuid, 44, 46, 'Botazo plástico blanco', 'Mismo modelo que el K52'),
  ('2e7c9408-e316-47fe-b7c4-6df1b622ded5'::uuid, 2, 56, 'Buje reduc. 1" x 3/4" plástico', 'PX BUJRED1X3/4'),
  ('c757c46b-dd25-48fd-ab6f-7b885ebdb30b'::uuid, 2, 72, 'Calefactor Autoterm Air 4D 12V 4000W', '(con Comando y kit instalación) Código: C89412'),
  ('aaa11322-365a-47fa-ae87-57fce52c841f'::uuid, 10, 77, 'Caño corrugado flex 1"', null),
  ('3aa6b2f5-1126-47b8-8070-36f94a65735e'::uuid, 8, 97, 'Codo 90° HH bronce 1"', null),
  ('fd140844-dc8e-42cd-9ac2-bba91eb60d3b'::uuid, 11, 104, 'Conector "T" c/espiga WHALE WX1521', 'ITEM WHALE'),
  ('8fc8817c-6b06-4776-82b7-1f3a432b1849'::uuid, 21, 105, 'Conector "T" WHALE WX1502', 'ITEM WHALE'),
  ('d49fc5d0-5fa8-4edd-8463-2797b6bc9457'::uuid, 10, 106, 'Conector Codo c/espiga WHALE WX1522', 'ITEM WHALE'),
  ('1feb1b1c-b7e3-4a4f-8bf1-6aba68e400c3'::uuid, 6, 107, 'Conector Codo WHALE WX1503', 'ITEM WHALE'),
  ('c9c72bc3-0ddf-4cba-a046-922a1a4bfb9c'::uuid, 3, 116, 'Cuchara bronce Nro 104', 'REJ104'),
  ('3d0da734-c4f8-47eb-af4f-34fa63f4690a'::uuid, 5, 121, 'Cupla Inoxidable 1"', 'TANQUES'),
  ('8d14e4c9-52d3-434f-b91a-ae8a5eeaff0f'::uuid, 3, 122, 'Cupla Inoxidable 1/2"', 'TANQUES'),
  ('83c43781-5008-4e3b-b451-d9f3a5d004ae'::uuid, 5, 123, 'Cupla Inoxidable 1/4"', 'TANQUES'),
  ('7fa2f38d-bf43-4108-8213-7a961dac9df5'::uuid, 1, 124, 'Cupla Inoxidable 2"', 'TANQUES'),
  ('4d48101b-51dd-471c-b036-f5545a434b5e'::uuid, 3, 125, 'Cupla Inoxidable 3/4"', 'TANQUES'),
  ('a480d9c4-782b-4797-a3b1-add592ac95f0'::uuid, 1, 135, 'Duchador frio calor WHALE Twist', 'Cockpit'),
  ('1cd225a8-7247-4fa4-8ac2-4de9153355ff'::uuid, 3, 137, 'Ducto p/extractor de 3"', null),
  ('4c73ef69-6754-42da-83f2-9d880d03dcf2'::uuid, 1, 143, 'Entrada agua potable (marina)', 'B29029'),
  ('87ea1a83-1b17-4dbb-81bb-305a82e08bab'::uuid, 2, 144, 'Entrerrosca 1" bronce', 'C 112 1 FU'),
  ('dfedeb19-e6a9-4b89-a9df-8ce94ded5967'::uuid, 4, 145, 'Entrerrosca 1/2" bronce', 'C 112 1/2 FU'),
  ('7a9da0a6-4f72-4e3c-b1ee-228059aa5e7b'::uuid, 4, 146, 'Entrerrosca 1/2" plastico', 'PX ENTRR1/2'),
  ('7a101f2d-5197-47d8-bd9e-ff5dc4bc67c8'::uuid, 1, 148, 'Entrerrosca de reduccion 3/4" x 1/2" plastico', 'FAG-FIL-MED3/4'),
  ('6864fa83-e55a-4e23-aae9-aaa77d0f8430'::uuid, 2, 153, 'Extractor Rule 3" 12V', null),
  ('e3596983-974f-445d-abff-6d351c34e271'::uuid, 1, 156, 'Ficha Marinco hembra 32A 220V', 'Marinco 6360CRN'),
  ('92226c96-5ae8-4ce2-b786-d55e2a321dbe'::uuid, 1, 157, 'Filtro agua 1"', 'FAG-FIL-MED1IN'),
  ('05a333d2-d432-4be9-a62c-0e9b628345ec'::uuid, 1, 162, 'Funda para ficha Marinco 32A 220V', null),
  ('11088a90-8940-4d3f-a7be-1e875ad9191c'::uuid, 6, 184, 'Llave corte batería remota Blue Sea', 'Comprobar cantidad al terminar barco 1'),
  ('ac10335d-6041-4a9c-b782-c4292069f5ff'::uuid, 4, 185, 'Llave de paso Whale WX1573', 'ITEM WHALE'),
  ('c35cb2f0-17bc-46de-91a6-08af9d306709'::uuid, 65, 196, 'Manguera cristal alambre 1"', 'MANGUERAS'),
  ('6a984479-40b7-4abe-8031-21a46f8cfd32'::uuid, 50, 197, 'Manguera cristal alambre 1½"', 'MANGUERAS'),
  ('ff86736f-ccad-4a7d-86ff-1a1ef264f95b'::uuid, 65, 198, 'Manguera cristal alambre 3/4"', 'MANGUERAS'),
  ('2ece2c3a-6001-4f6c-9799-d866475d1cf7'::uuid, 1, 202, 'Multicontrol Victron con cable (para cargador inversor)', null),
  ('28bf764a-02c9-48bd-87be-5f6b57c022f6'::uuid, 110, 214, 'Perfil aluminio tira LED', null),
  ('39a6c1ab-8840-4cd8-8943-72361d38d84c'::uuid, 2, 256, 'Sapito desagote ancla', null),
  ('867bb5f4-9568-4620-a03b-f151c8804c3c'::uuid, 1, 259, 'Separador agua-gases 2" Centek 1020200 (grupo)', null),
  ('f3bf7d52-a5fd-4cbb-abf1-b9f9fe627cf7'::uuid, 1, 260, 'Silenciador escape 2" Centek 1500027w (grupo)', null),
  ('aea0c1ce-5d96-4c67-9aa9-5d55f3e88a80'::uuid, 7, 266, 'Sopapa bañera c/codo Delta 1½"', 'SOP11/2CO'),
  ('dcc4472d-67f8-4206-8dba-5f6f93f16dd7'::uuid, 2, 269, 'Soporte pared TV', 'Camarote PROA 32", POPA 43"'),
  ('4ceb1c17-382c-45e6-bdb9-de56e2d54d71'::uuid, 1, 283, 'Tapa tanque agua 1 1/2" cromada c/venteo', 'FORESTI SUARDI'),
  ('e60e499b-2019-4aea-9e77-47800de07984'::uuid, 2, 284, 'Tapa tanque combustible 2" cromada c/venteo', 'FORESTI SUARDI'),
  ('4095c16e-4b0f-4924-92ad-067b49548242'::uuid, 110, 292, 'Tira LED blanco cálido', 'Tira de LED COB blanco cálido (2700K, +500 LED/m)'),
  ('ea15a6a2-1a99-44c3-9b1e-873c08f9b4b0'::uuid, 6, 295, 'Toma pasacasco 1 1/2" bronce', 'TO11/2C'),
  ('0d3ba5ed-e6e9-41f5-938a-77a20437cad0'::uuid, 9, 296, 'Toma pasacasco 1" bronce', 'TO1"C'),
  ('4b5668ec-7f50-4c9d-9893-6e729e249c9a'::uuid, 6, 297, 'Toma pasacasco 3/4" bronce', 'TO3/4C'),
  ('9d2ca04f-b2e5-40a2-be53-7803a385c77e'::uuid, 60, 303, 'Tubo Whale azul 15mm WX7152', 'ITEM WHALE'),
  ('55c25202-8972-4106-a9db-fccff744e4a6'::uuid, 50, 304, 'Tubo Whale rojo 15mm WX7154', 'ITEM WHALE'),
  ('892278e1-53d9-45f0-959d-939ebeccd36c'::uuid, 19, 313, 'Union rosca M 1/2" WHALE WX1514', 'ITEM WHALE'),
  ('f750313f-4ad7-48a6-98e7-da5609999787'::uuid, 1, 320, 'Válvula esférica 1" HH', 'VAE1J'),
  ('57ebb90c-239a-4bc1-b945-69f63dd9eda8'::uuid, 9, 321, 'Válvula esférica 1/2" HH', 'VAE1/2J');

create temp table k55_new (
  descripcion text not null,
  cantidad numeric not null,
  unidad_medida text,
  proveedor text,
  categoria_id uuid not null,
  notas text,
  revisado boolean not null default false,
  excel_row int not null
) on commit drop;

insert into k55_new (descripcion, cantidad, unidad_medida, proveedor, categoria_id, notas, revisado, excel_row) values
  ('Adaptador tunel sternthruster 250mm', 1, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 5.
Flag original: STD
Rubro original: Mecanica', true, 5),
  ('Ancla Bruce 30kg galvanizada', 1, 'unid', 'Baron', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 9.
Flag original: STD
Rubro original: Carpinteria', true, 9),
  ('Antena Starlink mini (Kit)', 1, 'unid', 'MercadoLibre', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 14.
OBS: https://www.mercadolibre.com.ar/kit-de-internet-via-satelite-starlink-mini-blanco/p/MLA40656539?pdp_filters=shipping:fulfillment#intervention_type=full&position=1&search_layout=grid&type=cart_intervention&tracking_id=1b74b38a-9d24-4561-abcc-a33a89df7c66
Flag original: STD
Rubro original: Electricidad', true, 14),
  ('Automatico Johnson pump 20A', 4, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 17.
OBS: BOMBAS DE ACHIQUE
Flag original: STD
Rubro original: Electricidad', true, 17),
  ('Bacha Johnson Z52, profundidad 15cm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 21.
OBS: PROFUNDIDAD 15cm, con sopapa, para cocina
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 21),
  ('Bacha Piazza A426 Blanco', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 22.
OBS: Baños proa y popa
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 22),
  ('Baranda hueco flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 23.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 23),
  ('Baranda perimetral +18 tinteros K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 24.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 24),
  ('Barral de ropero', 2, 'mts', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 28.
OBS: Vestidor y camarote proa
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 28),
  ('Base mesa chica flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 29.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 29),
  ('Base mesa grande flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 30.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 30),
  ('Bisagra tipo piano', 1.5, 'mts', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 37.
OBS: Muebles babor salon, estribor camarote popa
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 37),
  ('Bitas K55', 8, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 39.
OBS: 2 en planchada y 2 en pasamanos 4 cruzadas y lineales
Flag original: STD
Rubro original: Carpinteria', true, 39),
  ('Bocina Marinco doble INOX electrica 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 40.
Flag original: STD
Rubro original: Electricidad', true, 40),
  ('Bomba aire acondicionado 220v 500gph', 4, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 43.
OBS: Koolair pump PM 500-230
Flag original: STD
Rubro original: Electricidad', true, 43),
  ('Bomba dual 10.4gpm 12v johnson pump', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 44.
OBS: Presurizadora de agua potable
Flag original: STD
Rubro original: Electricidad', true, 44),
  ('Brida cuadrada inox 316, medidas 300 mm interior x 400 mm exterior, espesor = 1/4"', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 49.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 49),
  ('Brida de 100 mm interior x 160 mm exterior x 3/8. Inox 316', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 50.
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 50),
  ('Brida de 85 mm interior x 160 mm exterior x 3/8". Inox 316', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 51.
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 51),
  ('Bridas inox + bocina mecanizada y perforada', 2, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 52.
Flag original: STD
Rubro original: Mecanica', true, 52),
  ('Cable tipo Marinco 3x10mm', 12, 'mts', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 60.
Flag original: STD
Rubro original: Electricidad', true, 60),
  ('Cableado A salon K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 62.
OBS: Merniez
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 62),
  ('Cableado B camarote principal K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 63.
OBS: Merniez
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 63),
  ('Cableado C cocina K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 64.
OBS: Merniez
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 64),
  ('Cableado D camarote de proa K55', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 65.
OBS: Merniez
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 65),
  ('Cabos 18mm x 12m negro', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 66.
OBS: Amarre
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 66),
  ('Caja paso Roker Pr1005', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 69.
OBS: 162x212x81mm
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 69),
  ('Caja paso Roker Pr1010/106', 4, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 70.
OBS: 300x230x106mm
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 70),
  ('Cajas exteriores cambre', 3, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 71.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 71),
  ('Cañeria termofusion 1"', 56, 'mts', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 73.
OBS: TERMOFUSION
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 73),
  ('Canilla de bacha flybridge', 1, 'unid', 'Baron', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 74.
OBS: Código: C34856
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 74),
  ('Canilla de cocina', 1, 'unid', 'MercadoLibre', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 75.
OBS: https://fvsa.com/productos/0412-96p-augusta-profesional-juego-monocomando-para-mesada-de-cocina/
Flag original: STD
Rubro original: Sanitarios', true, 75),
  ('Caño D. exterior = 90 mm, e = 4 mm, L = 1100 mm. Inox 316', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 78.
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 78),
  ('CAÑO POLIAMIDA REFORZADO DE 1/4"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 81.
OBS: M PA6SP1/4
Flag original: STD
Rubro original: Sanitarios', true, 81),
  ('Catalina de fondeo K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 85.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 85),
  ('CAVA 8 BOTELLAS PHILCO - PHCAV08N2', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 86.
OBS: https://www.philco.com.ar/products/cavas/94PHCAV08N2?srsltid=AfmBOoplwU3k_1q1kg7FczB9AeICWNUXnRLehyzwn8GPbZH1MsdEn-hw
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 86),
  ('Cerramiento completo (Lona)', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 90.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 90),
  ('Chapa de proa K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 92.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 92),
  ('Chapas de inox 316 de 2 x 1,25 m, espesor = 2 mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 93.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 93),
  ('Chapas de inox 316 de 2 x 1,25 m, espesor = 3 mm', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 94.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 94),
  ('Chapas de inox 316 de 3 x 1,5 m, espesor = 3 mm', 5, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 95.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 95),
  ('Chapas inox 316 de 400 x 400 mm, espesor = 1/4"', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 96.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 96),
  ('Compas magnético reglamentario (negro)', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 103.
OBS: https://www.baron.com.ar/articulo/ritchie-s-53-negro/c13666
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 103),
  ('Conector rosca H termofusion 1"', 6, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 108.
OBS: TERMOFUSION
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 108),
  ('Guía telescóp. cierre suave 20cm', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 111.
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 111),
  ('Guía telescóp. cierre suave 40cm', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 113.
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 113),
  ('Corredera ocultas Bronzen LARGO 500mm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 115.
OBS: https://www.mercadolibre.com.ar/sistema-corredera-pocket-door-mueble-oculto-500mm-par-color-negro/p/MLA48512423#polycard_client=search-desktop&be_origin=backend&search_layout=grid&position=3&type=product&tracking_id=fab1bd4e-5ba8-450b-89e1-d5f2ab5188d3&wid=MLA2055674764&sid=search
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 115),
  ('Destorcedor tipo "gusano" INOX p/cadena 10-12mm', 1, 'unid', 'Flojumar', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 129.
Flag original: STD
Rubro original: Mecanica', true, 129),
  ('Direccion electro asistida twin disk', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 130.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 130),
  ('Ecosonda', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 138.
OBS: AIRMAR P319 (010-10194-21)
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 138),
  ('EMPALME ESPIGA PARA MANGUERA 1" PLASTICO', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 140.
Flag original: STD
Rubro original: Sanitarios', true, 140),
  ('Enchufe hembra', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 141.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 141),
  ('Enchufe macho', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 142.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 142),
  ('Epuyén – Juego monocomando para mesada de cocina (cromado)', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 149.
OBS: 0411.04/L2-CR
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 149),
  ('Escalera flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 151.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 151),
  ('Faro Marinco 12V dirigible', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 155.
Flag original: STD
Rubro original: Electricidad', true, 155),
  ('Flexible mallado para agua 1/2" X 40cm', 8, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 159.
OBS: FLAG-AF2076-1/
Flag original: STD
Rubro original: Sanitarios', true, 159),
  ('Flexible mallado para agua 1/2" X 50cm', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 160.
OBS: FLAG-AF2076-1/
Flag original: STD
Rubro original: Sanitarios', true, 160),
  ('Generador Kohler 18EFKOZD/21EKOZD', 1, 'unid', 'Trimer', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 163.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 163),
  ('Horno Samsung NV7B4040VAS/BG', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 170.
OBS: EMPOTRABLE
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 170),
  ('Imanes para puertas de muebles', 46, 'unid', 'Rincon del Herraje', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 171.
OBS: Rincon del herraje
Flag original: STD
Rubro original: Carpinteria', true, 171),
  ('Inodoro Tecma Thetford silence 2 plusg con bidet y tapa 12v', 2, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 173.
OBS: INODOROS. HOLDING TANK
Flag original: STD
Rubro original: Sanitarios', true, 173),
  ('Instrumento agua/combustible aro cromado', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 174.
OBS: ?
Flag original: STD
Rubro original: Electricidad', true, 174),
  ('Joystick doble Quick italy', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 175.
OBS: CABLE Y DERIVACION 2 ESTACIONES QUICK
Flag original: STD
Rubro original: Electricidad', true, 175),
  ('Juego monocomando para bañera y ducha Epuyén 0106/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 176.
OBS: Griferia 2 baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 176),
  ('Juego monocomando para lavatorio Epuyén 0206/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 178.
OBS: Griferia 2 baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 178),
  ('Limpia Parabrisas pantograficos', 2, 'unid', 'Tableros Costa', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 182.
OBS: Tableros Costa
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 182),
  ('Llave carling malacate 2 puntos', 2, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 183.
Flag original: STD
Rubro original: Electricidad', true, 183),
  ('Luz banda ROJA led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 189.
OBS: KIT HELLA MARINE LED
Flag original: STD
Rubro original: Electricidad', true, 189),
  ('Luz banda VERDE led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 190.
OBS: KIT HELLA MARINE LED
Flag original: STD
Rubro original: Electricidad', true, 190),
  ('Luz fondeo led blanca 360', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 191.
OBS: KIT HELLA MARINE LED
Flag original: STD
Rubro original: Electricidad', true, 191),
  ('Luz navegacion proa blanca led', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 192.
OBS: KIT HELLA MARINE LED
Flag original: STD
Rubro original: Electricidad', true, 192),
  ('luz popa led blanca', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 193.
OBS: KIT HELLA MARINE LED
Flag original: STD
Rubro original: Electricidad', true, 193),
  ('Malacate Quick italy 1500 watts 12v acero inoxidable', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 195.
OBS: Fondeo
Flag original: STD
Rubro original: Electricidad', true, 195),
  ('Niple de inox 316 de 3/4", L = 100 mm', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 204.
OBS: TANQUES
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 204),
  ('Ojo de buey', 5, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 205.
OBS: Cam.Popa x2, Cam.Medio x1, Ambos baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 205),
  ('Panel bomba de achique Johnson pump', 5, 'unid', 'Flojumar', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 206.
OBS: BOMBAS DE ACHIQUE
Flag original: STD
Rubro original: Sanitarios', true, 206),
  ('Pasamanos escalera flybridge K55', 1, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 210.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 210),
  ('Pasamanos varios K55', 13, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 211.
OBS: 7 solarium proa, 4 carroza, 2 planchada
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 211),
  ('Percha Epuyén 0166/L2 Cromado', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 212.
OBS: Griferia 2 baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 212),
  ('Perfiles de aluminio para tiras led', 110, 'unid', 'MercadoLibre', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 215.
OBS: Seccion 17mm x 7mm
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 215),
  ('Picaportes Currao SARDEGNA - ver color', 14, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 217.
OBS: 7 puertas - STD
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 217),
  ('Placa de honeycomb (terciado de 6 mm + núcleo de panal de abeja de 15 mm + terciado de 6 mm) de 1,2 mts x 2,45 mts', 22, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 219.
OBS: ?
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 219),
  ('Plaquetas p/precintos', 500, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 221.
OBS: VARIOS
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 221),
  ('Portarrollo Epuyén 0167/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 224.
OBS: Griferia 2 baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 224),
  ('Precinto 35 CM', 500, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 226.
OBS: VARIOS
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 226),
  ('Puertitas cockpit K55', 2, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 228.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 228),
  ('Racor H a codo de 1 1/2" plastico', 5, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 231.
OBS: PX CODRAC11/2
Flag original: STD
Rubro original: Sanitarios', true, 231),
  ('Racor H a codo de 1/2" plastico', 5, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 233.
OBS: PX CODRAC11/2
Flag original: STD
Rubro original: Sanitarios', true, 233),
  ('Racor H a codo de 3/4" plastico', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 234.
OBS: PX CODRAC3/4H
Flag original: STD
Rubro original: Sanitarios', true, 234),
  ('Racor M a codo de 1/2" plastico', 8, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 238.
OBS: PX RACCOD1/2M
Flag original: STD
Rubro original: Sanitarios', true, 238),
  ('Racor M a codo de 3/4" plastico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 239.
OBS: C 110 1 X 3/4 FL
Flag original: STD
Rubro original: Sanitarios', true, 239),
  ('Racor M de bronce 1 1/2" x 38mm', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 243.
OBS: C127 11/2X11/2
Flag original: STD
Rubro original: Sanitarios', true, 243),
  ('Radio VHF', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 244.
OBS: Garmin VHF 215 Marine Radio (010-02097-00)
Garmin GHS 11 wired VHF Handset (010-01759-00)
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 244),
  ('Recorte chapa de inox 316 según plantilla "Patas de gallo - K52", e = ?', 4, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 246.
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 246),
  ('REGULADOR DE AGUA AMARRA', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 247.
Flag original: STD
Rubro original: Electricidad', true, 247),
  ('Rejilla D60 Obturable Negra - Calefactor Autoterm', 4, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 248.
OBS: C89099
Flag original: STD
Rubro original: Sanitarios', true, 248),
  ('Rejilla D60 Orientable Negra - Calefactor Autoterm', 2, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 249.
OBS: C89943
Flag original: STD
Rubro original: Sanitarios', true, 249),
  ('Rejilla D90 Obturable Negra - Calefactor Autoterm', 5, 'unid', 'Baron', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 250.
OBS: C89108
Flag original: STD
Rubro original: Sanitarios', true, 250),
  ('Resorte a gas para puertas de alacenas - 60N', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 252.
OBS: Hafele 60N
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 252),
  ('Resorte a gas para puertas de alacenas - 80N', 4, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 253.
OBS: Hafele 80N
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 253),
  ('Rollo de cable negro 1.5mm', 100, 'mts', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 254.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 254),
  ('Rollo de cable rojo 1.5mm', 100, 'mts', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 255.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 255),
  ('Silenciador Vernalift 6" Centek 16X16 (motor)', 2, 'unid', 'Trimer', 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 261.
Flag original: STD
Rubro original: Mecanica', true, 261),
  ('Solenoide Quick italy 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 265.
Flag original: STD
Rubro original: Electricidad', true, 265),
  ('Soporte elevador TV - JC35VT-1000', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 267.
OBS: Soporte TV Salon
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 267),
  ('Soportes de barral de ropero', 6, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 270.
OBS: Vestidor y camarote proa
Flag original: STD
Rubro original: Carpinteria
A revisar: sin proveedor en Excel.', false, 270),
  ('Soportes tapiceria banco cockpit K55', 3, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 271.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 271),
  ('Soportes tapiceria banco proa K55', 7, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 272.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 272),
  ('Soportes tapiceria flybridge K55', 13, 'unid', 'Maxi Herrero', 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 273.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.', false, 273),
  ('Stern thurster Quick doble helice 6,5kw 250mm 12v', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 274.
Flag original: STD
Rubro original: Electricidad', true, 274),
  ('T con espiga rosca central de 1" plastico', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 276.
OBS: PX BUJRED3/4X1
Flag original: STD
Rubro original: Sanitarios', true, 276),
  ('Tableros electricos COSTA', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 277.
OBS: 395x245mm
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 277),
  ('Tablón Okume', 300, 'pies', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 278.
OBS: Chequear cantidad real en barco 4
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 278),
  ('Tambucho de proa - Cuadrado 60x60cm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 279.
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 279),
  ('Tanque acumulador presion Flojet-Jabsco', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 280.
Flag original: STD
Rubro original: Electricidad', true, 280),
  ('Tanques de agua', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 281.
OBS: Capacidad total 700 Lts
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Proveedor original: Astillero (fabricacion interna).', false, 281),
  ('Tanques de combustible con visor', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 282.
OBS: Capacidad total 1800 Lts
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
Proveedor original: Astillero (fabricacion interna).', false, 282),
  ('Tapon rosca M de 1/2" plastico', 3, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 286.
OBS: PX TAN 1/2
Flag original: STD
Rubro original: Sanitarios', true, 286),
  ('T termofusion 1" rosca central H 1/2"', 16, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 287.
OBS: TERMOFUSION
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 287),
  ('Tender lift OPACMARE 5222/90.04', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 289.
OBS: STD
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 289),
  ('Termica malacate 130 AMP', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 290.
Flag original: STD
Rubro original: Electricidad', true, 290),
  ('Termotanque CAMCO 76L', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 291.
Flag original: STD
Rubro original: Electricidad', true, 291),
  ('Toallero Epuyén 0163/L2 Cromado', 2, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 293.
OBS: Griferia 2 baños
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 293),
  ('Tomas cambre de 20 amp', 2, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 300.
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 300),
  ('Traba cadena 10-12mm', 1, 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'Import K55 Excel fila 301.
OBS: Fondeo
Flag original: STD
A revisar: sin rubro/categoria en Excel; asignado a categoria generica.
A revisar: sin proveedor en Excel.', false, 301),
  ('Tubo bowthruster D= 250mm, e= 9 mm, L = 1,50 m', 1, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 302.
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 302),
  ('TV 24" Noblex', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 305.
OBS: TV Camarote MEDIO
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 305),
  ('TV SAMSUNG 43" FULL HD T5300', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 307.
OBS: TV Camarote POPA
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 307),
  ('TV SAMSUNG 50" Crystal UHD 4K U8000F', 1, 'unid', null, '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 308.
OBS: https://shop.samsung.com/ar/50--crystal-uhd-4k-u8000f/p?skuId=139438
Flag original: STD
Rubro original: Electricidad
A revisar: sin proveedor en Excel.', false, 308),
  ('Union doble 1" termofusion', 4, 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 310.
OBS: TERMOFUSION
Flag original: STD
Rubro original: Sanitarios
A revisar: sin proveedor en Excel.', false, 310),
  ('Union rosca M 1/2" bronce x caño poliamida 1/4" con tuerca y virola', 1, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 315.
OBS: C 681/4X1/2
Flag original: STD
Rubro original: Sanitarios', true, 315),
  ('Valvula de un solo sentido para bombas de achique 1 1/2"', 2, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 317.
OBS: VALRET1/2 COM
Flag original: STD
Rubro original: Sanitarios', true, 317),
  ('Valvula de un solo sentido para bombas de achique 1"', 4, 'unid', 'Casa Iriarte', '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'Import K55 Excel fila 318.
OBS: VALRET 1 COM
Flag original: STD
Rubro original: Sanitarios', true, 318),
  ('Victron, combinador de baterias cyrix-ct', 1, 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'Import K55 Excel fila 324.
OBS: Pendiente de compra 01/04
Flag original: STD
Rubro original: Electricidad', true, 324),
  ('Visores con bolita para tanques combustible', 2, 'unid', null, 'e67e5b92-0cba-469c-9242-62faceedaf05'::uuid, 'Import K55 Excel fila 325.
OBS: Definir piezas / insumos
Flag original: STD
Rubro original: Mecanica
A revisar: sin proveedor en Excel.', false, 325);

-- 1) Reusar materiales exactos existentes: solo setear cantidad K55.
insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
select material_id, '55', 'standard', cantidad
from k55_reuse
on conflict (material_id, modelo, variante) do update
set cantidad = excluded.cantidad;

-- Agregar observaciones K55 a materiales reusados, etiquetadas para no perder contexto.
update public.panol_materiales m
set notas = btrim(concat_ws(E'\n', nullif(btrim(coalesce(m.notas, '')), ''), '[K55 Excel fila ' || r.excel_row || '] ' || btrim(r.observacion)))
from k55_reuse r
where m.id = r.material_id
  and nullif(btrim(coalesce(r.observacion, '')), '') is not null
  and position(lower(btrim(r.observacion)) in lower(coalesce(m.notas, ''))) = 0;

-- 2) Crear materiales nuevos si no existen por descripcion exacta normalizada.
insert into public.panol_materiales (
  categoria_id, descripcion, proveedor, unidad_medida, moneda, notas, origen, revisado, activo
)
select
  n.categoria_id,
  n.descripcion,
  n.proveedor,
  coalesce(nullif(btrim(n.unidad_medida), ''), 'unid'),
  'USD',
  n.notas,
  'import_k55_excel',
  n.revisado,
  true
from k55_new n
where not exists (
  select 1
  from public.panol_materiales m
  where lower(btrim(m.descripcion)) = lower(btrim(n.descripcion))
);

-- 3) Setear cantidad K55 para los nuevos, usando el material creado o ya existente por descripcion exacta.
with matched_new as (
  select distinct on (lower(btrim(n.descripcion)))
    m.id as material_id,
    n.cantidad
  from k55_new n
  join public.panol_materiales m
    on lower(btrim(m.descripcion)) = lower(btrim(n.descripcion))
  order by lower(btrim(n.descripcion)), m.created_at desc nulls last, m.id
)
insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
select material_id, '55', 'standard', cantidad
from matched_new
on conflict (material_id, modelo, variante) do update
set cantidad = excluded.cantidad;

-- 4) Resumen verificable dentro de la misma transaccion.
select 'reusar_existentes' as paso, count(*)::int as filas from k55_reuse;
select 'crear_nuevos_input' as paso, count(*)::int as filas from k55_new;
select 'nuevos_insertados_origen_k55' as paso, count(*)::int as filas from public.panol_materiales where origen = 'import_k55_excel';
select 'k55_modelo_safe_import' as paso, count(*)::int as filas
from public.panol_material_modelo mm
where mm.modelo = '55'
  and mm.variante = 'standard'
  and (
    mm.material_id in (select material_id from k55_reuse)
    or mm.material_id in (
      select m.id
      from k55_new n
      join public.panol_materiales m on lower(btrim(m.descripcion)) = lower(btrim(n.descripcion))
    )
  );

rollback;
