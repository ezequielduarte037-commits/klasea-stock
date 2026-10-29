-- Matriz K52 · Electricidad: correcciones sobre el papel impreso del 16/10/2026,
-- confirmadas por Ezequiel el 29/10/2026 para hacer el pedido.
--
-- Ojo: el trigger trg_panol_material_modelo_sync_obras copia las cantidades
-- nuevas a las listas de las obras K52 (52-23 a 52-28). Los ítems que salen de
-- la matriz o se reemplazan NO se borran de esas listas (el trigger no toca
-- snapshots en DELETE) y los nuevos tampoco se agregan a obras ya creadas.
--
-- Las luces de cortesía y la Hella tope se
-- dejan con su nombre.
--
-- Respaldo previo: backups/matriz-k52-electricidad-20261029/antes.json

begin;

-- 1. Cantidades
update public.panol_material_modelo mm
   set cantidad = v.cantidad
  from (values
    ('7776dc16-40ce-4b95-9ed1-171fb154fdab'::uuid, 2),    -- Base porta fusible Omega (1)
    ('2b5133b1-f6a0-4ec4-b46e-9366774a3550'::uuid, 4),    -- Bornera T2 100A (10)
    ('720989d1-307b-41ce-8b83-2d76c001bbb0'::uuid, 5),    -- Bornera telefónica 10x50 (10)
    ('61b81276-132b-4e03-a5fe-cbd846534a8f'::uuid, 200),  -- Cable 1x0,75 amarillo (100)
    ('14f56f37-8596-4b28-a128-f54d146d2968'::uuid, 100),  -- Cable 1x0,75 blanco (70)
    ('56148b65-2748-43ce-afef-7cb430418fa9'::uuid, 200),  -- Cable 1x0,75 naranja (100)
    ('e57d0b12-437b-40f4-ade6-5cf2213af221'::uuid, 200),  -- Cable 1x0,75 negro (100)
    ('136ad371-70db-4268-9a76-f1f99f7cda30'::uuid, 100),  -- Cable 1x0,75 rojo (70)
    ('1420f15d-e6c4-4026-b023-3d57a632267d'::uuid, 3),    -- Cinta aislante roja (5)
    ('16938806-9461-4452-bdfa-5d0dd999c1bf'::uuid, 8),    -- Cinta aislante negra (15)
    ('31b30100-04c8-49ae-8ede-6d132c6f8038'::uuid, 12),   -- Cinta de tela (2)
    ('001ed112-45be-4d85-a5b9-8cfa803f01ca'::uuid, 2),    -- Flux pasta (1)
    ('8e0f48d5-0df2-4f34-8165-9b9480116ca8'::uuid, 12),   -- Pulsador consola c/retención azul (11)
    ('549e4500-63de-4325-9c8a-11c80c5bd220'::uuid, 1)     -- Caja paso Roker Pr1010/106 (2)
  ) as v(material_id, cantidad)
 where mm.material_id = v.material_id
   and mm.modelo = '52'
   and mm.variante = 'standard';

-- 2. Tachados en el papel: salen de la matriz (el producto sigue en el catálogo).
--    Se sacan también los que se reemplazan en el punto 3.
delete from public.panol_material_modelo
 where modelo = '52'
   and material_id in (
     '16d2bb95-bad1-489d-94bd-b5f46a43c8ff',  -- Base porta fusible Omega mini
     '14463a57-4288-49c9-93fd-5d921b9f7dc9',  -- Cable 1x1 gris
     '85019e0f-82e7-4f77-a025-e5da83c31d01',  -- Cinta aislante marrón
     '18ebeaca-2a42-43f0-ba79-57866ff64665',  -- Cinta aislante verde
     '70c5422f-f250-4ee7-94a4-1a62073ca67e',  -- Fusible (caramelo) mini 40A
     '93af3f2a-2586-402b-9bba-6af8141faee2',  -- Luz popa LED blanca Hella Marine
     'c7cceea3-1375-4dcb-9b32-cc6d0324e78f',  -- Cable 1x1 amarillo  -> 1x1 rojo
     'da28b375-131c-49c6-8984-e45d505230e2',  -- Cable 1x1 violeta   -> 1x0,75 violeta
     '008f2f3a-5004-4d37-8645-af914c5df086',  -- Fusible grande 150A -> grande 40A
     '87101f58-3cc5-4f40-a64f-200505aacee5',  -- Pasa cable D=06mm   -> D=10mm
     '2e58d896-760e-48a9-b2e3-4f0445c167c6',  -- Termo negro 4 mm    -> 2 mm
     '508851ee-f09e-4669-8a80-6856aa5343b0'   -- Termo negro 13 mm   -> 8 mm
   );

-- 3. Reemplazos
-- El violeta 0,75 entró por conteo el 16/10 en "unidad", pero son metros
-- (200 recibidos). Se alinea con el resto de los cables 1x0,75.
update public.panol_materiales
   set descripcion = 'Cable 1x0,75 violeta',
       unidad_medida = 'metro'
 where id = '3985c84a-34e5-42bf-b52a-ae10acce1770';

do $$
declare
  v_pasa uuid;
  v_termo uuid;
  v_termo8 uuid;
begin
  select id into v_pasa from public.panol_materiales
   where descripcion = 'Pasa cable - Recto D=10mm';
  if v_pasa is null then
    insert into public.panol_materiales
      (descripcion, alias, categoria_id, proveedor, proveedor_id, unidad_medida,
       es_consumible, es_requisito, origen, notas, activo)
    select 'Pasa cable - Recto D=10mm', 'PASACABLE RECTO FIVE OCEANS D=10mm',
           categoria_id, proveedor, proveedor_id, unidad_medida,
           false, false, 'matriz-k52-correccion', 'Matriz K52 corregida 29/10/2026', true
      from public.panol_materiales
     where id = '648ab628-f54e-47e6-bbbc-b2bec288a75e'  -- Pasa cable D=08mm (Baron)
    returning id into v_pasa;
  end if;

  select id into v_termo from public.panol_materiales
   where descripcion = 'Termo contraíble negro 2 mm';
  if v_termo is null then
    insert into public.panol_materiales
      (descripcion, categoria_id, proveedor, proveedor_id, unidad_medida,
       es_consumible, es_requisito, origen, notas, activo)
    select 'Termo contraíble negro 2 mm',
           categoria_id, proveedor, proveedor_id, unidad_medida,
           false, false, 'matriz-k52-correccion', 'Matriz K52 corregida 29/10/2026', true
      from public.panol_materiales
     where id = '2e58d896-760e-48a9-b2e3-4f0445c167c6'  -- Termo negro 4 mm
    returning id into v_termo;
  end if;

  select id into v_termo8 from public.panol_materiales
   where descripcion = 'Termo contraíble negro 8 mm';
  if v_termo8 is null then
    insert into public.panol_materiales
      (descripcion, categoria_id, proveedor, proveedor_id, unidad_medida,
       es_consumible, es_requisito, origen, notas, activo)
    select 'Termo contraíble negro 8 mm',
           categoria_id, proveedor, proveedor_id, unidad_medida,
           false, false, 'matriz-k52-correccion', 'Matriz K52 corregida 29/10/2026', true
      from public.panol_materiales
     where id = '508851ee-f09e-4669-8a80-6856aa5343b0'  -- Termo negro 13 mm
    returning id into v_termo8;
  end if;

  insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
  values
    ('eccc0db0-3244-4c39-b7fc-dfddcdebba90'::uuid, '52', 'standard', 100),  -- Cable 1x1 rojo
    ('3985c84a-34e5-42bf-b52a-ae10acce1770'::uuid, '52', 'standard', 100),  -- Cable 1x0,75 violeta
    ('376063e8-4687-4839-9c93-0da7244ed476'::uuid, '52', 'standard', 2),    -- Fusible grande 40A
    (v_pasa, '52', 'standard', 10),
    (v_termo, '52', 'standard', 5),
    (v_termo8, '52', 'standard', 5)
  on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;
end $$;

-- 4. Nombre sin marca (sólo lo usa el K52)
update public.panol_materiales
   set descripcion = 'Placa de montaje blanca 30x35 mm'
 where id = '7e31e916-53fb-45ab-a11d-a32d3b967c99';

-- 5. Estaño: de 10 metros a 3 bobinas. Sólo lo usa el K52 y nunca se compró
--    ni se movió; en las obras está pendiente, así que se les corrige la unidad.
update public.panol_materiales
   set unidad_medida = 'unidad'
 where id = '0cd30cb0-88ea-4cad-892e-4a923789473d';
update public.panol_material_modelo
   set cantidad = 3
 where material_id = '0cd30cb0-88ea-4cad-892e-4a923789473d'
   and modelo = '52'
   and variante = 'standard';
update public.panol_obra_materiales_snapshot
   set unidad = 'unidad', updated_at = now()
 where material_id = '0cd30cb0-88ea-4cad-892e-4a923789473d'
   and lower(coalesce(source, 'matriz')) = 'matriz'
   and unidad is distinct from 'unidad';

-- 6. No son de electricidad
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Electrodomésticos')
 where id = '7438ec40-44cc-4697-9e82-7fbaeb227954';  -- Cava 8 botellas
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Sanitarios')
 where id = '56990c06-2345-4039-9743-b6be04711462';  -- Filtro agua 3/4"

commit;
