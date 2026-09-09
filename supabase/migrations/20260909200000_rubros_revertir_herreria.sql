-- Herrería: marcha atrás y criterio por proveedor
--
-- La depuración de rubros metió en Herrería cosas que no van, por dos reglas mal
-- puestas de mi parte: una guarda que mandaba a Herrería cualquier cosa que
-- dijera "inox", y otra que sacó de Mecánica el corte según plano "Pata de
-- gallo", que es la pata del eje.
--
-- El criterio correcto no es el material, es quién lo provee:
--
--   Famiq, Aceros Fitzner, Hierros Tigre, Centriaceros, Inoxalum  ->  Mecánica
--     Nos venden el material crudo -chapas, barras, caños, cortes, bridas-
--     para que lo trabaje el herrero. Eso no es herrería todavía.
--
--   Maxi Herrero  ->  Herrería
--     Es el que fabrica las piezas terminadas: barandas, bitas, cornamusas,
--     pasamanos, punteras, escaleras.
--
--   Rebollar  ->  A asignar
--     Es ferretería: bulones, tuercas, arandelas, abrazaderas.
--
--   Baron  ->  Carpintería y alistamiento
--     Es náutica: omegas, cáncamos, sapitos, grilletes, ganchos, manijas.
--
-- Los materiales sin proveedor cargado siguen la regla de su gemelo: los que son
-- material crudo -chapas, barras, caños, bridas, recortes- van con los de Famiq,
-- y los grilletes, anclas y omegas van con los de Baron. Dejarlos en Herrería
-- partiría en dos el mismo grupo de cosas.
--
-- Se mueven 81 materiales.
--
-- Correr entero en el editor SQL de Supabase.

begin;

-- Mecánica: 31
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Mecánica')
 where id in (
  '14e3ed22-3ed2-4ac1-855e-1053f6574196',  -- Chapas de inox 316 de 2 x 1,25 m, espesor = 2 mm
  '1be5810e-0c5c-4f85-902b-b45d51ff8ebb',  -- [Famiq] Brida 120mm ext x 50mm int, chapa 3/8" inox 316
  '2044fee6-d4a7-4eec-b880-41249329df07',  -- Barra 2 3/4" inox 316 L=3000mm
  '22da7c19-af90-477f-b21c-355aee2a6718',  -- [Aceros Fitzner] Caño s costura inox Sch.80, 3" nominal 600 mm
  '25a70994-7b15-4c23-891c-93686914e482',  -- Barra 2 1/2" inox 316 L=1000mm
  '26847f65-792e-4dc0-b6e6-4af0144b43ec',  -- Chapas de inox 316 de 2 x 1,25 m, espesor = 3 mm
  '2ccbcb4a-b028-4abb-ab9a-6bee17bba405',  -- Recorte chapa de inox 316 de 400mm x 250mm x 1/2" de espesor
  '2d19c37f-10d0-4582-b813-dc6299dd0ea6',  -- Chapa de inox 316 de 3 x 1,5 m, espesor = 2 mm
  '33c0fd9a-947e-4005-8fcb-3dc10673b0a3',  -- [Aceros Fitzner] Caño s costura inox Sch.10, 2" nominal
  '3883241f-a539-47d5-a0ca-02b8d50ed1f4',  -- [Famiq] Corte chapa 1/4" inox 316 según plano "Pata de gallo K42 y K37
  '39ef06e7-5640-43ca-96b4-f6de91c5aad7',  -- Chapas inox 316 de 400 x 400 mm, espesor = 1/4"
  '3c73ea17-fec8-46c4-8151-4c58d6d0c8a7',  -- [Famiq] Caño 127 x 2mm inox 316
  '3fa142f5-1a71-4546-b4bd-d7e87339522e',  -- Brida de 100 mm interior x 160 mm exterior x 3/8. Inox 316
  '4ca2b106-8267-43c0-a70c-a841c536acc8',  -- [Hierros Tigre] Planchuela hierro 120mm x 4mm
  '53668ce1-598d-4cdf-a782-8ce25bc061fc',  -- [Famiq] Barra 2 1/4" inox 316 L=3000mm
  '64babc61-efb9-488b-a65d-3291151f6593',  -- Brida cuadrada inox 316, medidas 300 mm interior x 400 mm exte
  '95aa870c-e1b5-4e35-ab85-b95d0a4adaae',  -- Chapas de inox 316 de 3 x 1,5 m, espesor = 3 mm
  '987b3238-ab87-452b-83f4-9bff41bb810c',  -- Caño inox 316 de 3/4", L = 3 m
  '9f6cb5b8-edd0-4687-85a5-dd8c8b0a5a1d',  -- [Famiq] Brida 200mm ext x 100mm int, chapa 3mm inox 316
  'a320d678-ae28-4c52-9386-79a6f011e16e',  -- Caño schedule 80, 3 1/2" nominal, L = 285 mm Inox 316
  'b74c2bfd-6d03-4976-a9a0-f05cb20be4d4',  -- [Famiq] Corte s plantilla chapa 1/4" inox 316 - corte n°1
  'c7046ec3-80de-43a6-9311-86d2c78559c8',  -- Recorte chapa de inox 316 según plantilla "Patas de gallo - K5
  'ca15af05-7168-429d-9de8-f666844a2ab9',  -- Caño D. exterior = 90 mm, e = 4 mm, L = 1100 mm. Inox 316
  'ce62fc2a-0a6c-408f-aaeb-5892a341d8fe',  -- [Famiq] Corte s plantilla chapa 1/2" inox 316 - corte n°2
  'd3b24dd9-f8c4-4e48-9b78-d37a2b26f8a5',  -- Tubo PRFV Dint=76mm, esp=7mm - tubo bocina
  'db5c2f6c-cc63-4afe-9362-c1ab4e0fda1b',  -- [Famiq] Curva para soldar 90° 127x2mm inox 316
  'deba011f-9a79-42d7-bafb-2349b3518d02',  -- Caño inox 316 de 1/2", L = 1,5 m
  'e2ebe07b-8bb9-497a-983a-e7e6abc47394',  -- Brida de 85 mm interior x 160 mm exterior x 3/8". Inox 316
  'e622a42d-03f6-47b8-af8b-ffcdce2df700',  -- [Famiq] Corte 230x350mm chapa 1/2" 316 - corte n°3
  'e637593f-8683-438a-99eb-45cd08214427',  -- [Famiq] Chapa de 2mm Inox. 316 ( x 1,5m) · 3M
  'f5baef75-d71b-4fae-a5f3-b4136d8daeeb'   -- [Famiq] Chapa de 2mm Inox. 316 ( x 1,5m)
);

-- Carpintería y alistamiento: 25
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Carpintería y alistamiento')
 where id in (
  '10c0a029-9d78-4884-85bd-cec0e0c8f7e7',  -- [Baron] GANCHO INOXIDABLE PORTA DEFENSA
  '16b55472-e333-4b70-9324-384e24f484a0',  -- Porta caña inoxidable con tapa
  '1c716ca4-05e1-4bf5-953f-562966eae5ef',  -- [Baron] Boton P/Cubierta (Up/Down) Inox
  '2c484eea-6054-4f9c-99c0-e8621199debb',  -- [Baron] Omegas inox chicos
  '335923e9-c7a6-4bc7-9b44-39dea9898c29',  -- [Baron] Manijas 305mm Inoxidable
  '39747ed4-88a4-409c-9f3c-30331412ba0a',  -- [Baron] Omega Inoxidable Inox Barra D05mm (PAR)
  '3cb02ccc-16d0-4ead-858c-63b252fb96c8',  -- [Baron] CANCAMO RECTANGULAR 4 TORNILLOS B10155
  '48691257-85e0-43a4-8bac-ed25c1dad24b',  -- [Baron] SOPORTE BICHERO Inoxidable 25-32mm (PAR)
  '4e4c3725-4460-463a-8edc-e61c63678b74',  -- [Baron] Gancho de inoxidable 316. Largo 102mm
  '53213c0f-9f0a-4f64-beca-64d595e9fd99',  -- [Baron] ESCALERA INOX S/PLAT 3ESC DESLI 5O
  '54619c9e-d476-40cd-94b6-6934972561f5',  -- [Baron] Omega Inoxidable Inox Barra D06mm c/u
  '5d9cc299-25f7-42ff-8735-53dcc5cbb0fa',  -- [Baron] Sapito Inox (15x55x50x0.6mm)
  '98def276-146e-405c-b5b0-2e6db713d9b1',  -- [Baron] Grillete omega 8mm
  'b2ace13f-e5a3-458b-a1c0-417cfb3ba839',  -- [Baron] CANCAMO 80X50MM 4 TORNILLOS B10121
  'b8ec0799-ebf3-4e14-9ff4-21269dda5fda',  -- [Baron] Cierre Americano Inoxidable
  'bb25f442-7a22-44e7-9531-8676157df05a',  -- [Baron] Sapito Inox (12x44x40x0.6mm)
  'c044b9ef-6003-4d75-b4f6-a7e52de54a00',  -- Ancla DELTA 40kg INOX
  'c30fcfdc-acbc-4cc0-9d37-f37a2bed9998',  -- [Baron] Grillete inoxidable largo - D08mm (5/16") G20052
  'cb15d1ff-0411-45bf-8a46-5f22cc31e478',  -- [Baron] Omega Inoxidable 42x17mm Inox 316
  'd2cdeef5-654e-44d3-8993-cf3c04d4f58f',  -- Grillete inoxidable corazón INOX316 -
  'dd4ddf69-f90d-4f0d-ac1b-c858cd89eac3',  -- Grillete inoxidable largo - D10mm (3/8")
  'f4a56af4-e018-411a-a9f1-1dee3f6db079',  -- [Baron] Posavasos inox
  'f5b9ca19-1832-46a8-ab19-20b29acd7287',  -- [Baron] Omega Inoxidable Inox Barra D04mm c/u
  'f96b4dfd-286b-4017-9aee-ec80ab83e775',  -- [Baron] Boton P/Cubierta (UP/DOWN) Inox Negro
  'fa7f1942-6ccf-40fb-aeca-a7e3849002f8'   -- Grillete inoxidable largo - D06mm (1/4") G20039
);

-- A asignar: 20
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'A asignar')
 where id in (
  '0b1acc5e-30e2-445e-8349-c4d46e764399',  -- [Rebollar] Tuerca autofrenante galv. 3/8"
  '0ce9b426-6c58-4a6b-86e5-fc9440d5ec24',  -- [Rebollar] Abrazadera inox 10mm int.
  '246fd3ba-c543-4f6f-85e9-a2eaa47ca250',  -- [Rebollar] Bulón inox 1/2"x3"
  '316d9b57-8ada-4f87-a04a-78c978c5a118',  -- [Rebollar] Varilla roscada 3/8" inox
  '37f2b427-9e92-4290-9500-d6089dd1d28d',  -- [Rebollar] Tuerca 3/4" inox
  '4674f480-2d6a-4a84-a40f-ceafc14f2b0e',  -- [Rebollar] Abrazadera inox 3/4"
  '4d3c511a-aaee-44ec-beaa-e898bef4e4f6',  -- [Rebollar] Tuerca de Inox 1/2"
  '5f0c0f47-4619-4709-ac96-5221783bba81',  -- [Rebollar] Tornillos inox botazo cab.fresada
  '66898dc3-3a17-449f-977f-f65df822fa24',  -- [Rebollar] Arandela inox 3/8"
  '6a96585a-e70f-4fcd-9381-34c621c7e183',  -- [Rebollar] Bulón inox 5/8"x2"
  '7b28de47-de76-49bb-88b3-e60241d2f3e4',  -- [Rebollar] Abrazadera sup.pres. 135-145mm inox (mang.5" int.)
  '8776258e-5327-4471-bdd8-c5103c75f4f1',  -- [Rebollar] Abrazadera inox sup-pres 100-130mm
  'a91520e0-0373-4f45-85e6-6fdf6d82c580',  -- [Rebollar] Varilla roscada 3/4" inox
  'ac5fdea1-9bdd-4b1e-98ea-54725dcd3b3e',  -- [Rebollar] Abrazadera inox 1"
  'b00cefec-d911-4619-b48e-421bfb31d246',  -- [Rebollar] Abrazadera inox 1½"
  'cd6f3be7-8fc8-4df1-9d39-f30698c7f3ea',  -- [Rebollar] Tuerca autofrenante de Inox. 1/4"
  'db0b73ed-2339-4720-8dd1-758ec292af44',  -- [Rebollar] Bulón inox 1/2" x 2 1/2"
  'e6ecd8f3-e5e8-4ed0-8bdc-edaae7b1819d',  -- [Rebollar] Arandela de Inox. 1/4"
  'ed8c112d-23f1-421c-b354-480aeac9846f',  -- [Rebollar] Bulon de Inox 1/4" x 1 1/4" todo rosca
  'f2a9c02d-313e-4ff3-8fcb-9cc657464af7'   -- [Rebollar] Abrazadera inox sup-pres 50-70mm
);

-- Herrería: 5
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Herrería')
 where id in (
  '0a361e66-d4f2-46d1-bc87-2306fee5e39e',  -- [Maxi Herrero] PUNTERAS DE BOTAZO - K37
  '4d8976eb-a02a-41a8-b778-d692afeff8f4',  -- [Maxi Herrero] BISAGRA BUTACA
  '701692de-133e-4f69-a7ff-a94f32b15b2c',  -- [Maxi Herrero] Escalera sala de maquina
  'f9802115-c870-4709-85ae-7c0907ac6bcd',  -- [Maxi Herrero] HERRAJE DE STARLINK
  'fe08d3d6-a277-4b51-99d3-9180008972e5'   -- [Maxi Herrero] BISAGRA DE BAUL K52
);


-- ─────────────────────────────────────────────────────────────────────────────
-- El rubro guardado del snapshot, para las filas de obra de estos materiales.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot s
   set rubro = v.rubro
  from (
    select m.id as material_id,
           case when padre.nombre = 'Consumibles' or c.nombre = 'Consumibles'
                then 'Consumibles'
                else c.nombre
           end as rubro
      from public.panol_materiales m
      join public.panol_categorias c          on c.id = m.categoria_id
      left join public.panol_categorias padre on padre.id = c.parent_id
  ) v
 where s.material_id = v.material_id
   and s.rubro is distinct from v.rubro;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════

-- Cómo queda Herrería, por proveedor. Tiene que quedar Maxi Herrero y poco más.
select coalesce(nullif(m.proveedor, ''), p.nombre, '(sin proveedor)') as proveedor,
       count(*) as materiales
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
  left join public.panol_proveedores p on p.id = m.proveedor_id
 where c.nombre = 'Herrería'
 group by 1
 order by 2 desc;

-- Tiene que dar 0: nada de un proveedor de acero puede quedar en Herrería.
select count(*) as acereros_en_herreria_debe_dar_0
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
  left join public.panol_proveedores p on p.id = m.proveedor_id
 where c.nombre = 'Herrería'
   and coalesce(nullif(m.proveedor, ''), p.nombre, '') ~* 'famiq|centriacero|inoxalum|fitzner|hierros tigre|johnson acero';

-- Tiene que dar 0: nada de Maxi Herrero puede quedar fuera de Herrería.
select count(*) as maxi_fuera_de_herreria_debe_dar_0
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
  left join public.panol_proveedores p on p.id = m.proveedor_id
 where c.nombre <> 'Herrería'
   and coalesce(nullif(m.proveedor, ''), p.nombre, '') ilike 'maxi herrero';
