-- Depuración de rubros, segunda parte: el rubro congelado en el snapshot
--
-- La lista de una obra no lee la categoría del material: lee
-- `panol_obra_materiales_snapshot.rubro`, un texto que se copió cuando se creó
-- la fila y no se volvió a tocar. Por eso, después de la primera migración, las
-- obras seguían mostrando "Carpintería y varios", "Tapicería" y "Baron / Varios".
--
-- De 7.718 filas, 3.473 tienen ese texto y 5 de sus valores ya no existen como
-- categoría.
--
-- El código ya se arregló: el rubro se resuelve del material y el texto guardado
-- sólo se usa cuando la fila no llegó a ningún material. Este SQL pone al día la
-- columna igual, porque las planillas y las exportaciones la leen directo.
--
-- Correr entero en el editor SQL de Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lo que quedó colgado de la migración anterior
--
-- Los materiales que quedaron "a asignar" no recibían update, así que los que
-- estaban en Tanques se quedaron ahí y el rubro no se pudo borrar.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'A asignar')
 where id in (
  '125ed442-6b3b-451c-b570-075a2152ed92',  -- Sellador
  '40a8c512-a8e1-4133-8848-e5c1377da6e3',  -- Goma p/hidrocarburos 3 mm
  '49c8b32f-28f3-43d9-a9de-6d4994285643',  -- Sellador · Threebond
  '82f25dd3-0722-4643-8945-5d6e3d534a16',  -- Tanque acumulador presion Flojet-Jabsco
  'fcaa64ab-a5b3-471e-a63c-185f2170e1fb'   -- Manguera de venteo 19mm int.
);

delete from public.panol_categorias c
 where c.nombre = 'Tanques'
   and not exists (select 1 from public.panol_materiales m where m.categoria_id = c.id)
   and not exists (select 1 from public.panol_categorias h where h.parent_id = c.id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Poner al día el rubro guardado de las filas que sí tienen material
--
-- Misma regla que usa la interfaz: los consumibles se cuentan todos juntos, el
-- resto conserva su nombre propio aunque cuelgue de otro rubro.
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
      join public.panol_categorias c     on c.id = m.categoria_id
      left join public.panol_categorias padre on padre.id = c.parent_id
  ) v
 where s.material_id = v.material_id
   and s.rubro is distinct from v.rubro;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Las filas que no llegan a un material
--
-- Son 44: adicionales cargados a mano, filas de remito que nunca se ataron al
-- catálogo, y algunas que apuntan a un material que ya no existe. No hay de
-- dónde resolver el rubro, así que se renombra el texto.
--
-- No hace falta filtrar por material_id: el paso 2 ya pisó todas las filas que
-- sí llegan a un material, así que lo que todavía tiene un nombre muerto es
-- exactamente esto.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot
   set rubro = case rubro
     when 'Carpintería y varios'   then 'Carpintería y alistamiento'
     when 'Tapicería'              then 'Herrería'
     when 'Sanitarios / Griferías' then 'Griferías'
     when 'Tanques'                then 'Mecánica'
     else 'A asignar'
   end
 where rubro in ('Carpintería y varios', 'Tapicería', 'Sanitarios / Griferías', 'Tanques', 'Sin sector', 'Baron / Varios');

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════

-- Tiene que dar 0 filas: ningún rubro guardado puede ser un rubro que ya no existe.
select s.rubro, count(*) as filas
  from public.panol_obra_materiales_snapshot s
 where s.rubro is not null
   and not exists (select 1 from public.panol_categorias c where c.nombre = s.rubro)
 group by 1
 order by 2 desc;

-- Cómo queda el rubro guardado.
select coalesce(rubro, '(se resuelve del material)') as rubro, count(*) as filas
  from public.panol_obra_materiales_snapshot
 group by 1
 order by 2 desc;

-- Tiene que dar 0 filas: los tres rubros disueltos ya no existen.
select nombre from public.panol_categorias
 where nombre in ('Tapicería', 'Tanques', 'Sin categoría', 'Carpintería y varios');
