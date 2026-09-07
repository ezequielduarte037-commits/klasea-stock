-- Depuración de proveedores — parte 2: fusionar los duplicados de la tabla
--
-- Acá vive lo de "Trimer es Trimer, Baron es Baron": el mismo proveedor cargado
-- dos o tres veces como filas distintas, cada una con materiales, precios y
-- pedidos colgando de su propio id.
--
-- SE CORRE EN DOS PASOS Y NO ES OPCIONAL:
--
--   PASO 1  preview. Sólo lectura. Muestra qué grupos encontró, cuál dejaría
--           como bueno y cuántas referencias movería. MIRALO ANTES.
--   PASO 2  la fusión. Recién cuando el preview te cierre.
--
-- Los dos pasos usan exactamente la misma regla para agrupar, así que lo que
-- ves en el preview es lo que hace el paso 2.
--
-- Cómo agrupa: por nombre sin tildes, en minúscula, sin S.A./S.R.L./SA/SRL/Ltda
-- y sin puntos ni guiones. Es conservador a propósito: "Trimer" y "TRIMER S.A."
-- se juntan, pero "Baron" y "Barone" NO, porque son dos palabras distintas.
--
-- Cuál queda como bueno: el que más cosas tiene colgando. Si empatan, el que no
-- está TODO EN MAYÚSCULA -suele ser el mejor escrito- y después alfabético,
-- para que el resultado no dependa del orden en que salieron de la base.
--
-- A los perdedores NO se los borra: se marcan `activo = false`. Si algo salió
-- mal, la fila sigue ahí.

-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 1 · PREVIEW — sólo lectura, no cambia nada
-- ═════════════════════════════════════════════════════════════════════════════
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
),
-- Cuánto arrastra cada fila. Son las tres tablas que de verdad pesan; el paso 2
-- igual reapunta TODAS las que cuelguen, las descubre solo.
peso as (
  select
    n.*,
    (select count(*) from public.panol_materiales m           where m.proveedor_id = n.id)
    + (select count(*) from public.panol_material_proveedores x where x.proveedor_id = n.id)
    + (select count(*) from public.panol_precios pr             where pr.proveedor_id = n.id) as referencias
  from normalizado n
),
grupos as (
  select clave
  from peso
  where clave <> ''
  group by clave
  having count(*) > 1
),
ranking as (
  select
    p.*,
    row_number() over (
      partition by p.clave
      order by
        p.referencias desc,
        (p.nombre = upper(p.nombre)),   -- false primero: se prefiere el que no está todo en mayúscula
        p.nombre
    ) as puesto
  from peso p
  join grupos g on g.clave = p.clave
)
select
  clave                                                        as grupo,
  max(nombre) filter (where puesto = 1)                        as se_queda,
  max(referencias) filter (where puesto = 1)                   as sus_referencias,
  string_agg(nombre || ' (' || referencias || ')', '  |  ' order by puesto)
    filter (where puesto > 1)                                  as se_fusionan,
  sum(referencias) filter (where puesto > 1)                   as referencias_a_mover
from ranking
group by clave
order by sum(referencias) filter (where puesto > 1) desc nulls last, clave;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 2 · LA FUSIÓN — recién después de mirar el preview
--
-- Descomentá desde acá hasta el final del bloque y corré.
-- ═════════════════════════════════════════════════════════════════════════════
/*
do $$
declare
  g            record;
  ref          record;
  perdedores   uuid[];
  movidas      integer := 0;
  total        integer := 0;
begin
  for g in
    with normalizado as (
      select
        p.id, p.nombre,
        btrim(regexp_replace(
          regexp_replace(
            lower(translate(p.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
            '\y(s\.?a\.?s?|s\.?r\.?l\.?|srl|sa|sas|ltda?|cia|hnos)\y', '', 'g'
          ),
          '[^a-z0-9]+', ' ', 'g'
        )) as clave
      from public.panol_proveedores p
    ),
    peso as (
      select n.*,
        (select count(*) from public.panol_materiales m           where m.proveedor_id = n.id)
        + (select count(*) from public.panol_material_proveedores x where x.proveedor_id = n.id)
        + (select count(*) from public.panol_precios pr             where pr.proveedor_id = n.id) as referencias
      from normalizado n
    ),
    ranking as (
      select p.*, row_number() over (
        partition by p.clave
        order by p.referencias desc, (p.nombre = upper(p.nombre)), p.nombre
      ) as puesto
      from peso p
      where p.clave <> ''
    )
    select
      clave,
      max(id)     filter (where puesto = 1) as canonico,
      max(nombre) filter (where puesto = 1) as nombre_canonico,
      array_agg(id) filter (where puesto > 1) as duplicados
    from ranking
    group by clave
    having count(*) > 1
  loop
    perdedores := g.duplicados;
    total := total + array_length(perdedores, 1);

    -- panol_material_proveedores tiene una fila por (material, proveedor). Si
    -- un material tenía a "Trimer" Y a "TRIMER S.A." como alternativos, al
    -- reapuntar quedarían dos filas iguales y explotaría la unicidad. Se borra
    -- la del perdedor cuando el material ya tiene la del bueno.
    delete from public.panol_material_proveedores x
    where x.proveedor_id = any(perdedores)
      and exists (
        select 1 from public.panol_material_proveedores y
        where y.material_id = x.material_id and y.proveedor_id = g.canonico
      );

    -- Ahora sí: TODAS las tablas que cuelgan de panol_proveedores.id, las
    -- encuentra sola. Si mañana aparece una tabla nueva, este script la agarra.
    for ref in
      select tc.table_name as tabla, kcu.column_name as columna
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_name = 'panol_proveedores'
        and ccu.column_name = 'id'
    loop
      execute format('update public.%I set %I = $1 where %I = any($2)', ref.tabla, ref.columna, ref.columna)
      using g.canonico, perdedores;
      get diagnostics movidas = row_count;
      if movidas > 0 then
        raise notice '  % .% : % filas -> %', ref.tabla, ref.columna, movidas, g.nombre_canonico;
      end if;
    end loop;

    -- El perdedor queda desactivado, no borrado: si algo salió mal, está.
    update public.panol_proveedores
    set activo = false,
        nombre = nombre || ' [fusionado en ' || g.nombre_canonico || ']'
    where id = any(perdedores);

    raise notice 'Grupo "%": queda %', g.clave, g.nombre_canonico;
  end loop;

  raise notice 'Listo: % proveedores duplicados fusionados.', coalesce(total, 0);
end $$;

-- El texto libre del material vuelve a coincidir con el proveedor al que apunta.
-- Sin esto quedarían materiales diciendo "TRIMER S.A." pero apuntando a "Trimer".
update public.panol_materiales m
set proveedor = p.nombre
from public.panol_proveedores p
where m.proveedor_id = p.id
  and coalesce(m.proveedor, '') <> p.nombre;
*/


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 3 · CONTROL — correr después de la fusión
-- ═════════════════════════════════════════════════════════════════════════════
-- a) No debería quedar ningún grupo duplicado ENTRE LOS ACTIVOS.
-- b) Ningún material debería apuntar a un proveedor desactivado.
/*
select 'quedan duplicados activos' as control, count(*) as casos from (
  select btrim(regexp_replace(regexp_replace(lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
    '\y(s\.?a\.?s?|s\.?r\.?l\.?|srl|sa|sas|ltda?|cia|hnos)\y', '', 'g'), '[^a-z0-9]+', ' ', 'g')) as clave
  from public.panol_proveedores where coalesce(activo, true)
) t where clave <> '' group by clave having count(*) > 1
union all
select 'materiales apuntando a un proveedor desactivado', count(*)
from public.panol_materiales m
join public.panol_proveedores p on p.id = m.proveedor_id
where coalesce(p.activo, true) = false;
*/
