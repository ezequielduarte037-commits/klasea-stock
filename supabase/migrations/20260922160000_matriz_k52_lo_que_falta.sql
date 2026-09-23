-- Lo que el K52 lleva y la matriz no tenía.
--
-- La matriz del K52 tenía 185 ítems contra 394 del K37 y 359 del K55.
-- Herrería y Herrajes tenían uno cada uno, y las quince piezas que Maxi
-- Herrero fabrica con "K52" en el nombre no figuraban en ninguna parte.
-- Así el costo del modelo salía corto y no había forma de darse cuenta.
--
-- Esto sale de lo que realmente consumieron el 52-22 al 52-27, no de una
-- lista escrita a mano: entra lo que aparece en dos barcos o más, y lo que
-- aparece en uno solo pero se llama K52, que no puede ser de otro modelo.
-- Los adicionales de cada obra quedan afuera: son de esa obra.
--
-- La cantidad es la mediana de lo que llevaron los barcos, así el trigger
-- que sincroniza la matriz con las obras no les cambia lo que ya tienen.
--
-- 68 ítems. Quedan 94 que aparecieron en un solo barco, para revisar aparte.

begin;

-- La tabla no tiene índice único, así que la guarda va explícita: correr
-- esto dos veces no duplica ninguna fila.
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ('33eaa48c-a5fe-4a23-b9e9-acf95e42c7ae'::uuid, 1),  -- Carpintería y alistamiento · Rejilla de plastico plana 264x126,5mm (4b)
    ('283a4dce-133b-44fd-9b82-52b030fba9af'::uuid, 1),  -- Electricidad · CABLE AMARILLO TIPO MARINCO 3X7.5MM 50AMP X12MTS (4b)
    ('f294dc1f-fcdc-4857-9091-259571a144bd'::uuid, 1),  -- Electrónica · Compas magnetico S-53 (Brujula) (4b)
    ('dee3ab68-5c3a-4960-a46d-259a1402ce29'::uuid, 1),  -- Electrónica · Plotter GPSMAP 1223xsv Garmin (4b)
    ('1c17d746-5a67-4096-867c-956781b852d5'::uuid, 2),  -- Herrajes · Bisagra 38X38X2mm 4 Tornillos (4b)
    ('8257ef3b-edfa-4b65-875c-cd30b0e2dbad'::uuid, 2),  -- Herrajes · Bisagra Inox 38X56mm 5 Tornillos (4b)
    ('e3056df0-6112-4770-b6f7-c59df1964c0f'::uuid, 1),  -- Carpintería y alistamiento · BOTAZO 60MM K52/K55 (Blanco/Negro) (3b)
    ('5bbaa83e-00e8-4248-a6f9-72bf8e4b727e'::uuid, 1),  -- Electricidad · TOMA MARINCO 50A (3b)
    ('c757c46b-dd25-48fd-ab6f-7b885ebdb30b'::uuid, 1),  -- Electrodomésticos · Calefactor Autoterm Air 4D 12V 4000W (3b)
    ('84ec4e6f-e11e-4168-845a-e82a282bd757'::uuid, 1),  -- Herrajes · Traba cadena 10-12mm (3b)
    ('fe08d3d6-a277-4b51-99d3-9180008972e5'::uuid, 1),  -- Herrería · BISAGRA DE BAUL K52 (3b)
    ('9519b16a-acdd-4b5f-8866-f94fd7f27751'::uuid, 1),  -- Herrería · PUNTERA DE BOTAZO - K52 (3b)
    ('3d06aa2f-ca29-49bb-9ef3-9786be2dfee7'::uuid, 3),  -- Herrería · Tinteros de baranda perimetral (3b)
    ('12f606c7-0922-41a4-bc7a-c7f4e6d08d0d'::uuid, 2),  -- Mecánica · ANODO DE FLAP MAGNESIO (3b)
    ('eca13a8f-ee79-4612-9116-43d21da5ab30'::uuid, 2),  -- Mecánica · ANODO TIMON 3 3/4 MAGNESIO (3b)
    ('765a1fc7-b817-4795-9889-9810059c1797'::uuid, 2),  -- Mecánica · CHAPON PLANCHADA (3b)
    ('249c937c-f53f-4a3f-8c58-e22200487852'::uuid, 1),  -- Mecánica · Sistema FLAP 24 x 12" Doble estacion (3b)
    ('646baa4a-525b-4da8-a656-208127bae392'::uuid, 2),  -- Mecánica · TAPA TANQUE ATTWOOD C/VENTEO WTR RECT (3b)
    ('23e08655-1520-4423-b3bc-bde27b97a454'::uuid, 1),  -- Mecánica · Termica malacate 80A (3b)
    ('f8e4c99d-bb13-469a-8d68-d3fd24f72235'::uuid, 2),  -- Sanitarios · Sensor nivel agua/comb.  47´¨ (3b)
    ('e004f66d-8030-44d3-85ba-94c18a35547e'::uuid, 1),  -- Carpintería y alistamiento · Ancla Bruce 30kg galvanizada (2b)
    ('f3790ba3-4720-485a-960a-806b54e3bf2d'::uuid, 50),  -- Carpintería y alistamiento · Cadena 8mm calibrada galvanizada (2b)
    ('d41e6b99-e9b8-4afb-a577-322d9fe27489'::uuid, 1),  -- Carpintería y alistamiento · Giratorio gusano cadena 6-8mm (2b)
    ('dd4ddf69-f90d-4f0d-ac1b-c858cd89eac3'::uuid, 1),  -- Carpintería y alistamiento · Grillete inoxidable largo - D10mm (3/8") (2b)
    ('54619c9e-d476-40cd-94b6-6934972561f5'::uuid, 4),  -- Carpintería y alistamiento · Omega Inoxidable Inox Barra D06mm c/u (2b)
    ('016e9e51-5638-4259-96e7-ad14eb0680ac'::uuid, 1),  -- Carpintería y alistamiento · PARRILLA LEVY (2b)
    ('fe4ff95d-5691-4806-b9c8-76cd3a09064f'::uuid, 2),  -- Carpintería y alistamiento · RETEN IMAN PARA PUERTA NEGRO ZAMAC (2b)
    ('86f16816-e441-4885-a10f-c59a1ca5f711'::uuid, 4),  -- Carpintería y alistamiento · RUEDA DE GOMA GRIS 50MM (2b)
    ('5d9cc299-25f7-42ff-8735-53dcc5cbb0fa'::uuid, 1),  -- Carpintería y alistamiento · Sapito Inox (15x55x50x0.6mm) (2b)
    ('ec117514-7f5f-42e8-8cb8-e32533e9a05b'::uuid, 1),  -- Carpintería y alistamiento · Tender lift OPACMARE OPACMARE 5220_90_09 (2b)
    ('c9c63347-f546-42ab-aca0-c31c9e9643eb'::uuid, 1),  -- Electricidad · CONJUNTO DE TABLEROS (2b)
    ('6d14a23a-1e7a-4661-ab6d-07e9872f9eb2'::uuid, 5),  -- Electricidad · CONTROL BOMBA DE ACHIQUE RULE MODEL 43 (2b)
    ('2176cf72-d0c3-413f-ae8f-8785be0dab6a'::uuid, 1),  -- Electrodomésticos · Heladera BGH 312L (2b)
    ('2d98e85a-bde0-421c-a0f0-61697283eee1'::uuid, 1),  -- Electrónica · BASE DE ANTEN VHF INOX GRANDE SHAKESPEARE (2b)
    ('1299d8bc-76d1-49cb-a670-fa8b21f52839'::uuid, 1),  -- Electrónica · ECOSONDA P319 (2b)
    ('78d38650-cbd9-4db0-912c-d4c73b830804'::uuid, 2),  -- Herrajes · ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO (2b)
    ('e4bb8731-3c9a-41a1-b3b9-8a9893132dc0'::uuid, 2),  -- Herrajes · Bisagra Inox 59X40mm 6 Tornillos (2b)
    ('49b5c301-4638-45ac-8f90-3dc5a3d2496a'::uuid, 6),  -- Herrajes · Bisagra Inox 70X38.5mm Perno abajo 4 Tornillos (2b)
    ('71d4e8a7-321f-424c-b5cd-2ed08c69517e'::uuid, 6),  -- Herrajes · Bisagra INOX 71x38mm 4 Tornillos B21256 (2b)
    ('d34d31bd-95d0-4f2d-87dd-6de830310a18'::uuid, 2),  -- Herrajes · Levantapiso - Perko 1220DPCHR (2b)
    ('f59d1862-9828-4a20-9f16-aa636e431d54'::uuid, 1),  -- Herrajes · levantapiso perko 75mm (2b)
    ('2a87a5c6-ad4a-4fef-b979-57018e235d95'::uuid, 2),  -- Herrajes · PICAPORTE SIDAÑEZ AL40009G NEGRO AXIS C/LLAVE (2b)
    ('a3c067c7-e060-44a8-b3b6-cb3e483a2f89'::uuid, 3),  -- Herrajes · PICAPORTE SIDAÑEZ AL40009G NEGRO AXIS C/ROSETA (2b)
    ('8ff29083-a562-4097-b0b6-d8e8ff01ccc8'::uuid, 1),  -- Herrería · BARRAL DE BAÑO K52 (2b)
    ('d82ce9dd-683b-40e2-9a51-f27a4e35db85'::uuid, 1),  -- Herrería · Catalina de fondeo (2b)
    ('701692de-133e-4f69-a7ff-a94f32b15b2c'::uuid, 1),  -- Herrería · ESCALERA SALA MAQUINA K52 (2b)
    ('cd110c37-1210-4f66-82d4-309d9c211895'::uuid, 1),  -- Herrería · PASAMANO POPA K52 (2b)
    ('c2fd0c04-0fee-4352-8bab-cb4bd7257592'::uuid, 2),  -- Mecánica · Tapa de tanque combustible (2b)
    ('46dcd31e-2d2c-4fef-b822-2095856b39ba'::uuid, 1),  -- Sanitarios · Bacha cocina acero Inox. Negra Hausar 60 x 45 BP-C (2b)
    ('ad170c62-bcdb-42b6-8674-8a016ef23e92'::uuid, 1),  -- Sanitarios · Epuyén Juego monocomando para mesada de cocina 041 (2b)
    ('3542b7d9-0271-479a-89fe-e0cfd774d83a'::uuid, 1),  -- Sanitarios · Regulador de presion cromado jabsco (2b)
    ('e297f845-f1ef-41c3-83d2-adcf9e351625'::uuid, 1),  -- Sanitarios · TOALLERO BARRAL LARGO EPUYEN 0164/L2 · CROMADO (2b)
    ('7e7171d2-dc44-40dd-bacf-49a563451eee'::uuid, 1),  -- Sanitarios · VALVULA ANTIRETORNO 3/4 A 1`` (2b)
    ('f387ac0d-5a3e-4c58-85cd-994dcbd87ebc'::uuid, 1),  -- Vidrios · Motor Limpiaparabrisa (2b)
    ('9d522b1a-9b29-4e74-b021-57b4401d60e6'::uuid, 1),  -- Carpintería y alistamiento · GUILLOTINA LAT BABOR HARD TOP K52 (1b)
    ('832472b2-ff64-4278-ae01-c201790b0658'::uuid, 1),  -- Carpintería y alistamiento · GUILLOTINA LAT ESTRIBOR HARD TOP K52 (1b)
    ('33bbc22a-a220-4e80-90fb-5e594b534bf9'::uuid, 1),  -- Carpintería y alistamiento · PUERTA CORREDIZA ACRILICO K52 (1b)
    ('ebe74b34-00c9-454e-ab61-dbd70826c4d1'::uuid, 1),  -- Herrajes · ESCALERA PLANCHADA K52 (1b)
    ('5f270eb7-301c-43bc-b3c5-b98a160ebd7c'::uuid, 2),  -- Herrería · BITAS K52 (1b)
    ('7d667ee3-db47-46c5-8588-3a9bcafb2ed0'::uuid, 1),  -- Herrería · CAMA MOTO DE AGUA K52 (1b)
    ('29b3a919-2afd-431b-8292-c603ae8daf05'::uuid, 2),  -- Herrería · JUEGO DE RIEL P/ PUERTA CORREDIZA K52 (1b)
    ('407956b6-862b-4ad3-a3f4-0da4ec30f043'::uuid, 1),  -- Herrería · PUERTA POPA K52 (1b)
    ('d82d7d4e-0871-4736-a55f-47b41c87b2ad'::uuid, 3),  -- Herrería · PUNTALES ASIENTO K52 (1b)
    ('b34a250b-bd2f-4786-b244-fca185eadeb9'::uuid, 3),  -- Herrería · TINTEROS ASIENTO K52 (1b)
    ('d04ec5de-25b7-4c1a-8f4f-4edcb9ae31d3'::uuid, 1),  -- Vidrios · VNA LAT DERECHA SOFT TOP CARROZA K52 62648 (1b)
    ('c8e31913-04a8-4802-b9ba-d04f10cc5724'::uuid, 1),  -- Vidrios · VNA LAT IZQ POPA SOFT TOP CARROZA K52 62651 (1b)
    ('dadc554d-be90-49ee-a763-b20462d2a0bd'::uuid, 1),  -- Vidrios · VNA LAT IZQ POPA SOFT TOP K52 62650 (1b)
    ('0b85745c-29ea-40cf-a264-00140248678a'::uuid, 1)   -- Vidrios · VNA LAT IZQUIERDA SOFT TOP CARROZA K52 62649 (1b)
  ) as nuevo(material_id, cantidad)
 where not exists (
   select 1
     from public.panol_material_modelo actual
    where actual.material_id = nuevo.material_id
      and actual.modelo = '52'
      and coalesce(actual.variante, 'standard') = 'standard'
 );

commit;
