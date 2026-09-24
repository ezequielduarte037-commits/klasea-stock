-- K52: lo que faltaba de Favicur, filtros de agua de mar de 2", luces de la
-- bandeja de estandarización y las decisiones de la bandeja que ya estaban tomadas.
--
-- 1. FAVICUR: la lista de excepciones de Grupo COES (cliente 3210) del
--    03/09/2026, vigente desde el 29/07, trae los 84 renglones. Cruzados contra
--    el catálogo por código, 41 ya estaban cargados con el mismo precio y faltaban
--    5: la 62507 y la 62508 del K52 y la 60776, 60777 y 60778 del FLY-43.
--    Con esto el K52 tiene precio para todos sus vidrios del soft top. Las 10
--    laterales son 5 por banda, así que no hay repetidas.
--    Además, la 62650 es la DERECHA de popa según Favicur; el catálogo decía IZQ.
-- 2. FILTROS DE AGUA DE MAR DE LOS MOTORES: son de 2", como las tomas. Sale el
--    de 1 1/2" y entra un requisito genérico de 2" (la marca se decide después).
--    No hay ninguno de 2" en el catálogo ni en Baron (tiene Seaflo hasta 1 1/2").
--    Referencia sin proveedor: Groco ARG-2000-S en Fisheries Supply, EE.UU.
-- 3. LUCES QUE ESTÁN EN ESTANDARIZACIÓN: la de tope y la de popa Hella Marine
--    (las cargaron el 55-1 al 55-3 y el 64-21), la de fondeo de base plana
--    (Hunter H-175) y los 6 plafones bajo agua (el 52-25 llevó 6 y en el K55 son
--    estándar). La de tope toma el precio de Flojumar del 04/09, que la cotizó
--    como "luz de proa blanca Hella Marine"; la de popa, una referencia web.
-- 4. BANDEJA DE ESTANDARIZACIÓN, línea 52: quedan como no estándar, con su motivo,
--    las piezas que ya se definieron fuera del estándar y que la bandeja mostraba
--    pendientes: la heladera BGH, las guillotinas y la bomba del aire del hard top
--    y el tender lift.

begin;

-- ─── 1. Favicur ─────────────────────────────────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', nuevo.fuente
  from (values
    ('9ebe22d6-5c17-4ca1-83f6-019fca93c56a'::uuid, 119671.92::numeric, 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07) · 62507 VNA.LAT.IZQ.C/BC. KLASE A K-52 BABOR GRIS'),
    ('d110b778-9b89-4905-a844-4df05e328c99'::uuid, 134234.88::numeric, 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07) · 62508 VNA.LAT.DER.C/BC. KLASE A K-52 ESTRIBOR-C/VANO GRIS'),
    ('6828a7af-e0fb-4ff5-85a2-e82c2a743c98'::uuid, 252684.57::numeric, 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07) · 60776 VNA.LAT.DER FAVICUR - FLY-43 - ESTRIBOR - C/VANO GRIS'),
    ('7dca4e22-48e6-49fb-bf5d-c4a842c75726'::uuid, 173415.85::numeric, 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07) · 60777 VNA.LAT.IZQ. FAVICUR - FLY-43 - BABOR - C/VANO GRIS'),
    ('f5151b54-2a3d-496d-b868-02b11d36e42f'::uuid, 172682.52::numeric, 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07) · 60778 VNA.LAT.DER FAVICUR - FLY-43 - ESTRIBOR - C/VANO GRIS')
  ) as nuevo(material_id, precio, fuente)
 where not exists (
   select 1 from public.panol_precios p
    where p.material_id = nuevo.material_id and p.proveedor = 'Favicur' and p.fecha = '2026-09-03'
 );

update public.panol_materiales
   set descripcion = 'VNA LAT DER POPA SOFT TOP K52 62650'
 where id = 'dadc554d-be90-49ee-a763-b20462d2a0bd'
   and descripcion = 'VNA LAT IZQ POPA SOFT TOP K52 62650';

update public.panol_matriz_condicionante_items
   set descripcion = 'VNA LAT DER POPA SOFT TOP K52 62650'
 where material_id = 'dadc554d-be90-49ee-a763-b20462d2a0bd'
   and descripcion = 'VNA LAT IZQ POPA SOFT TOP K52 62650';

-- ─── 2. Filtros de agua de mar de 2" ───────────────────────────────────────
delete from public.panol_material_modelo
 where material_id = '18c68ccb-4fdb-4c50-af42-1b332dc666e0'   -- Filtro de agua 1 1/2" inox
   and modelo = '52';

insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_requisito, producto_por_obra, activo, origen, notas)
select 'Filtro de agua de mar 2"', 'unidad', 'e67e5b92-0cba-469c-9242-62faceedaf05', true, false, true, 'matriz-k52',
       'Requisito genérico de la matriz: filtro de agua de mar para los motores, de 2" como las tomas. La marca y el modelo se deciden después. Referencia: Groco ARG-2000-S.'
 where not exists (select 1 from public.panol_materiales where descripcion = 'Filtro de agua de mar 2"');

-- ─── 3. Precios de referencia de las luces y el filtro ──────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, nuevo.moneda, nuevo.fecha, nuevo.proveedor, nuevo.proveedor_id, nuevo.fuente
  from (values
    ((select id from public.panol_materiales where descripcion = 'Filtro de agua de mar 2"' limit 1), 867::numeric, 'USD', '2026-09-24'::date, null, null, 'Precio de referencia del requisito (la marca se decide después): fisheriessupply.com, Groco ARG-2000-S de bronce, 2" NPT, canasto inox · lista USD 867 en EE.UU., sin impuestos ni envío'),
    ('f186215b-531e-4459-82b3-c3d43c4d9eab'::uuid, 323408.26::numeric, 'ARS', '2026-09-04'::date, 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b'::uuid, 'Presupuesto Flojumar 0001-00005536 04/09/2026: luz de proa blanca Hella Marine, la luz de tope blanca Hella · convertido a sin IVA (÷1,21; con IVA era 391.324,00)'),
    ('93af3f2a-2586-402b-9bba-6af8141faee2'::uuid, 62.99::numeric, 'USD', '2026-09-24'::date, null, null, 'wholesalemarine.com, Hella Marine Stern Navigation Light 2 NM White Housing 12V (65473) · lista USD 62,99 en EE.UU., sin impuestos ni envío')
  ) as nuevo(material_id, precio, moneda, fecha, proveedor, proveedor_id, fuente)
 where nuevo.material_id is not null
   and not exists (
     select 1 from public.panol_precios p
      where p.material_id = nuevo.material_id and p.fecha = nuevo.fecha and p.fuente = nuevo.fuente
   );

-- ─── 4. Filas nuevas de la matriz del K52 (estándar) ─────────────────────────
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ((select id from public.panol_materiales where descripcion = 'Filtro de agua de mar 2"' limit 1), 2::numeric),  -- Filtro de agua de mar 2" (genérico, motores)
    ('f186215b-531e-4459-82b3-c3d43c4d9eab'::uuid, 1::numeric),  -- LUZ LED HELLA MARINE TOPE BLANCA
    ('93af3f2a-2586-402b-9bba-6af8141faee2'::uuid, 1::numeric),  -- LUZ POPA LED BLANCA HELLA MARINE
    ('7ffb7afa-16e4-4259-8311-5592818755ec'::uuid, 1::numeric),  -- LUZ FONDEO BASE PLANA LED
    ('5bbb827c-e3e5-40cd-8538-5946c36558ab'::uuid, 6::numeric)   -- Plafon Five oceans sumergible (Luz bajo agua)
  ) as nuevo(material_id, cantidad)
 where nuevo.material_id is not null
   and not exists (
     select 1
       from public.panol_material_modelo actual
      where actual.material_id = nuevo.material_id
        and actual.modelo = '52'
        and coalesce(actual.variante, 'standard') = 'standard'
   );

-- ─── 5. Bandeja de estandarización, línea 52 ────────────────────────────────
-- Sin revisor: la decisión viene de la definición de la matriz, no de una
-- revisión en el pañol. Si el pañol ya decidió algo, se respeta.
insert into public.panol_material_normalizaciones (material_id, modelo, decision, cantidad, revisado_por, motivo_no_estandar, observacion_no_estandar)
select nuevo.material_id, '52', 'puntual', null, null, nuevo.motivo, nuevo.observacion
  from (values
    ('2176cf72-d0c3-413f-ae8f-8785be0dab6a'::uuid, 'otro', 'La heladera estándar del K52 es la Samsung RB31FSRNDSA. El 52-23 y el 52-24 llevaron además esta BGH.'),  -- Heladera BGH 312L
    ('9d522b1a-9b29-4e74-b021-57b4401d60e6'::uuid, 'condicionante', 'Va con el hard top, que no es estándar en el K52: condicionante "Hard top".'),  -- GUILLOTINA LAT BABOR HARD TOP K52
    ('832472b2-ff64-4278-ae01-c201790b0658'::uuid, 'condicionante', 'Va con el hard top, que no es estándar en el K52: condicionante "Hard top".'),  -- GUILLOTINA LAT ESTRIBOR HARD TOP K52
    ('39807315-9043-44a2-bc0e-5c896bc90086'::uuid, 'condicionante', 'El 52-23 la llevó con el aire de 25.000 BTU porque es hard top: condicionante "Hard top" del K52.'),  -- Bomba de Aire acondicionado 1000gph
    ('ec117514-7f5f-42e8-8cb8-e32533e9a05b'::uuid, 'condicionante', 'No es estándar en el K52: condicionante "Tender lift".')   -- Tender lift OPACMARE OPACMARE 5220_90_09
  ) as nuevo(material_id, motivo, observacion)
on conflict (material_id, modelo) do nothing;

commit;
