-- K52: pasan a estándar lo de Baron que estaba en la bandeja de estandarización,
-- la caja de batería, el silenciador y el separador de agua y gases de 3" y el
-- regulador de presión Seaflo. Lo definió Ezequiel el 24/09/2026 ("todo lo que
-- sea Baron y está en estandarización, ponelo como estándar").
--
-- Cantidades: las que llevó el casco que los tiene (52-22, 52-23, 52-25 o 52-26).
--
-- Dos casos de Baron que NO se suman como otro renglón:
--   · "Ancla Bruce 30kg galvanizada" de la bandeja es el mismo ancla que ya está
--     en la matriz, cargado con otro ítem del catálogo: queda como estaba.
--   · El pasacable que el pañol cargó como D=08mm es el de 6 mm según el remito
--     de Baron del 10/09 (P23025): entra el de 6 mm.
--
-- La bandeja queda al día: los que pasan a estándar dejan de figurar como
-- no estándar en la línea 52.

begin;

insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ('9805411b-d676-4486-a310-730cb1b9cbed'::uuid, 1::numeric),  -- ANCLA 32KG GALVANIZADO DELTA (52-26)
    ('e775154e-57f7-4b20-a837-e3194309e638'::uuid, 2::numeric),  -- MANIJA INOX CAÑO OVAL 170X40MM (52-26)
    ('bf6a01f6-93c7-47f1-8fdf-cdd903a6422d'::uuid, 2::numeric),  -- GIRATORIO BUTACA (52-26)
    ('6ecf947f-e9c3-4d18-b70a-48c69db47de9'::uuid, 1::numeric),  -- TRABACADENA INOX STOPPER 80X70MM (52-26)
    ('09780a31-1f34-4dd1-8f8d-d452e8980a86'::uuid, 1::numeric),  -- CAJA PORTA BATERIA 431X257X256 (52-26)
    ('87101f58-3cc5-4f40-a64f-200505aacee5'::uuid, 3::numeric),  -- Pasa cable - Recto D=06mm (52-26, P23025)
    ('a001cf4b-9629-48ed-a6ac-3ebcc09d6aa7'::uuid, 2::numeric),  -- Rejillas Plastico Seaflo D76x92 Blanca (52-22)
    ('2972dabe-5a20-4477-a249-8856b7f3c77b'::uuid, 1::numeric),  -- Conector ANTENA Union Corta (YC1102) (52-26)
    ('1a30fa8d-5e98-4b44-a368-34462ee7d9e8'::uuid, 3::numeric),  -- Conector Antena Macho P/VHF P/RG58 (YC101) (52-26)
    ('8b509a47-aa1e-4395-a8dd-52782cc8f7da'::uuid, 2::numeric),  -- Pasador Inoxidable 316, Heavy Duty de 3-1/2" (52-26)
    ('b2ace13f-e5a3-458b-a1c0-417cfb3ba839'::uuid, 1::numeric),  -- CANCAMO 80X50MM 4 TORNILLOS B10121 (52-26)
    ('0754784c-7c6d-4dee-b36f-98fd8b6d9fe9'::uuid, 2::numeric),  -- Silenciador CENTEK Vernalift 3" 150034w (52-23)
    ('d8fd6b1a-254a-4a42-be56-44efdeed7011'::uuid, 1::numeric),  -- Separador de gases 3" 1020301 (52-23)
    ('8d181543-0791-4639-845b-faba3e724c79'::uuid, 1::numeric)   -- REGULADOR DE PRESION BLANCO SEAFLO (52-25)
  ) as nuevo(material_id, cantidad)
 where not exists (
   select 1 from public.panol_material_modelo actual
    where actual.material_id = nuevo.material_id and actual.modelo = '52'
      and coalesce(actual.variante, 'standard') = 'standard'
 );

-- Bandeja: de no estándar a estándar, con su cantidad.
update public.panol_material_normalizaciones n
   set decision = 'estandar',
       cantidad = nuevo.cantidad,
       motivo_no_estandar = null,
       observacion_no_estandar = null,
       revisado_at = now()
  from (values
    ('9805411b-d676-4486-a310-730cb1b9cbed'::uuid, 1::numeric),
    ('e775154e-57f7-4b20-a837-e3194309e638'::uuid, 2::numeric),
    ('bf6a01f6-93c7-47f1-8fdf-cdd903a6422d'::uuid, 2::numeric),
    ('6ecf947f-e9c3-4d18-b70a-48c69db47de9'::uuid, 1::numeric),
    ('09780a31-1f34-4dd1-8f8d-d452e8980a86'::uuid, 1::numeric),
    ('a001cf4b-9629-48ed-a6ac-3ebcc09d6aa7'::uuid, 2::numeric),
    ('2972dabe-5a20-4477-a249-8856b7f3c77b'::uuid, 1::numeric),
    ('1a30fa8d-5e98-4b44-a368-34462ee7d9e8'::uuid, 3::numeric),
    ('8b509a47-aa1e-4395-a8dd-52782cc8f7da'::uuid, 2::numeric),
    ('b2ace13f-e5a3-458b-a1c0-417cfb3ba839'::uuid, 1::numeric),
    ('0754784c-7c6d-4dee-b36f-98fd8b6d9fe9'::uuid, 2::numeric),
    ('d8fd6b1a-254a-4a42-be56-44efdeed7011'::uuid, 1::numeric),
    ('8d181543-0791-4639-845b-faba3e724c79'::uuid, 1::numeric)
  ) as nuevo(material_id, cantidad)
 where n.material_id = nuevo.material_id
   and n.modelo = '52'
   and n.decision = 'puntual';

update public.panol_material_normalizaciones
   set motivo_no_estandar = 'otro',
       observacion_no_estandar = 'El remito de Baron del 52-26 dice D=06mm (P23025): el estándar es el "Pasa cable - Recto D=06mm".',
       revisado_at = now()
 where material_id = '648ab628-f54e-47e6-bbbc-b2bec288a75e'   -- Pasa cable - Recto D=08mm
   and modelo = '52'
   and decision = 'puntual';

commit;
