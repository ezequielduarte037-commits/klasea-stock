-- Depuración de proveedores — diagnóstico
--
-- SOLO LECTURA: no modifica nada. Correr las cuatro consultas por separado en
-- el editor SQL de Supabase y pasarme la salida.
--
-- Sirve para contestar tres cosas antes de tocar un solo dato:
--   · cuántos proveedores hay de verdad y cuántos son el mismo escrito distinto
--   · cuánto arrastra cada uno (materiales, precios, remitos, pedidos)
--   · cuáles ya no existen y hay que sacar de encima de los materiales
--
-- El merge se escribe DESPUÉS, con estos números a la vista: fusionar a ciegas
-- es como quedaron las cajas chicas.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUÉ TABLAS CUELGAN DE PROVEEDORES
--
-- Antes de fusionar hay que saber a dónde hay que reapuntar las referencias.
-- Si aparece una tabla que no esperábamos, el merge tiene que contemplarla.
-- ─────────────────────────────────────────────────────────────────────────────
select
  tc.table_name   as tabla,
  kcu.column_name as columna
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name = 'panol_proveedores'
  and ccu.column_name = 'id'
order by tc.table_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LOS GRUPOS DE DUPLICADOS
--
-- Agrupa por nombre normalizado: sin tildes, en minúscula, sin S.A. / S.R.L. /
-- SA / SRL, sin puntos ni guiones y con los espacios de más comidos. Así
-- "Trimer", "TRIMER S.A." y "trimer sa" caen en el mismo grupo.
--
-- Sólo salen los grupos con más de uno: esos son los que hay que fusionar.
-- ─────────────────────────────────────────────────────────────────────────────
with normalizado as (
  select
    p.id,
    p.nombre,
    coalesce(p.activo, true) as activo,
    btrim(regexp_replace(
      regexp_replace(
        lower(translate(p.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
        '\y(s\.?a\.?s?|s\.?r\.?l\.?|srl|sa|sas|ltda?|cia|hnos)\y', '', 'g'
      ),
      '[^a-z0-9]+', ' ', 'g'
    )) as clave
  from public.panol_proveedores p
)
select
  clave                                                as nombre_normalizado,
  count(*)                                             as cuantos,
  string_agg(nombre || case when activo then '' else ' (inactivo)' end, '  |  ' order by nombre) as escrito_como,
  string_agg(id::text, ',' order by nombre)            as ids
from normalizado
where clave <> ''
group by clave
having count(*) > 1
order by count(*) desc, clave;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CUÁNTO ARRASTRA CADA PROVEEDOR
--
-- El que tiene más cosas colgando suele ser el que conviene dejar como bueno.
-- Los que están en cero son candidatos a borrar sin drama.
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.nombre,
  coalesce(p.activo, true)                                                  as activo,
  (select count(*) from public.panol_materiales m           where m.proveedor_id = p.id) as materiales_principal,
  (select count(*) from public.panol_material_proveedores x where x.proveedor_id = p.id) as materiales_alternativo,
  (select count(*) from public.panol_precios pr             where pr.proveedor_id = p.id) as precios_historial,
  (select count(*) from public.panol_materiales m2
     where lower(btrim(m2.proveedor)) = lower(btrim(p.nombre)))             as materiales_por_nombre,
  p.id
from public.panol_proveedores p
order by
  (select count(*) from public.panol_materiales m where m.proveedor_id = p.id) desc,
  p.nombre;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. NOMBRES SUELTOS QUE NO SON NINGÚN PROVEEDOR
--
-- `panol_materiales.proveedor` es texto libre y convive con `proveedor_id`.
-- Acá salen los nombres escritos a mano que no coinciden con ningún proveedor
-- de la tabla: ahí es donde viven las cosas raras.
-- ─────────────────────────────────────────────────────────────────────────────
select
  btrim(m.proveedor)  as escrito_en_el_material,
  count(*)            as materiales,
  bool_or(m.proveedor_id is not null) as alguno_tiene_id
from public.panol_materiales m
where m.proveedor is not null
  and btrim(m.proveedor) <> ''
  and not exists (
    select 1 from public.panol_proveedores p
    where lower(btrim(p.nombre)) = lower(btrim(m.proveedor))
  )
group by btrim(m.proveedor)
order by count(*) desc;
