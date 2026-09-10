-- Consumibles: poner de acuerdo la marca con el rubro
--
-- En el sistema hay DOS definiciones de "consumible" y no coinciden:
--
--   1. La marca `panol_materiales.es_consumible`   -> 214 materiales
--   2. El rubro "Consumibles" y sus 10 subrubros   -> 219 materiales
--
-- El apartado de Consumibles y el filtro del stock maestro usan la marca. El
-- rubro se usa para agrupar en las listas. Cinco materiales están en el rubro
-- y no tienen la marca, así que se cuelan en el stock maestro y en la pestaña
-- "A reconciliar". "HOJA CUTER" es uno de esos.
--
-- Al revés no pasa: no hay ningún material marcado que esté fuera del rubro.
--
-- Correr entero en el editor SQL de Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Los que son consumibles de verdad y les falta la marca
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set es_consumible = true
 where id in (
  '92629e6e-fe1e-4047-8fa8-44b388ef6b71',  -- HOJA CUTER            [Consumibles]
  '5890cf0b-b915-4af6-a9b6-091bb79bb250'   -- pistola de engomar    [Herramientas menores]
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Los que no son consumibles y quedaron en el rubro por error
--
-- Están los tres en "Cintas y film", que es un subrubro de Consumibles. Una
-- bacha, un borne y un ancla de 20kg no son consumibles: entraron ahí de
-- arrastre. Van a "A asignar" para que alguien les ponga el rubro que va.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'A asignar')
 where id in (
  '513fe591-d29c-4fba-9eb6-1a2c5957afe1',  -- BACHA DE VIDRIO OVALADA
  '5ad641a2-fc40-4a9b-8832-f3b5d5db3522',  -- Borne Nautico
  'cab62d08-fac1-4ef8-b7c0-086bfcb471a4'   -- ANCLA 20KG BRUCE GALVANIZADA
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Poner al día el rubro guardado del snapshot de estos materiales
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

-- Tiene que dar 0 filas: nada puede quedar en el rubro Consumibles sin la marca.
with arbol as (
  select c.id
    from public.panol_categorias c
    left join public.panol_categorias p on p.id = c.parent_id
   where c.nombre = 'Consumibles' or p.nombre = 'Consumibles'
)
select m.descripcion, c.nombre as rubro
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
 where m.categoria_id in (select id from arbol)
   and m.es_consumible is distinct from true;

-- Tiene que dar 0 filas: nada marcado puede quedar fuera del rubro.
with arbol as (
  select c.id
    from public.panol_categorias c
    left join public.panol_categorias p on p.id = c.parent_id
   where c.nombre = 'Consumibles' or p.nombre = 'Consumibles'
)
select m.descripcion, c.nombre as rubro
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
 where m.es_consumible is true
   and m.categoria_id not in (select id from arbol);

-- Las dos cuentas tienen que dar igual.
select 'con la marca' as cuenta, count(*) from public.panol_materiales where es_consumible is true
union all
select 'en el rubro', count(*)
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
  left join public.panol_categorias p on p.id = c.parent_id
 where c.nombre = 'Consumibles' or p.nombre = 'Consumibles';
