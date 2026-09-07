-- Depuración de proveedores — parte 3: el código de producto pegado al nombre
--
-- El problema de verdad. En `panol_proveedores` hay una fila por cada CÓDIGO DE
-- PRODUCTO, no por proveedor: "Baron A95562", "Baron B10155", "Baron C42533"...
-- Todas son Baron. Salieron de una importación vieja que concatenó el proveedor
-- con el código del artículo.
--
-- Por eso la búsqueda de duplicados por nombre normalizado dio vacío: "baron
-- a95562" y "baron b10155" son claves distintas. No eran duplicados de nombre,
-- eran nombres contaminados.
--
-- HAY ALGO QUE RESCATAR ANTES DE FUSIONAR. Ese código es con lo que se le pide
-- a Baron. Si se fusiona sin más, los materiales quedan bien clasificados pero
-- se pierde el número con el que se compran. Así que el orden es:
--
--   1. el código se copia al material (sólo si el material no tiene uno)
--   2. recién ahí los materiales se reapuntan al proveedor limpio
--   3. las filas con código se desactivan
--
-- SE CORRE EN DOS PASOS. El PASO 1 es sólo lectura: miralo antes.

-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 1 · PREVIEW — sólo lectura
--
-- Qué se considera "código pegado": el último pedazo del nombre, si son 3 o más
-- dígitos, con hasta 3 letras adelante. Así entra "A95562", "B10155" y
-- "CL80300700", y NO entra "Fana 96" ni "3M" ni "Ferretería 24".
-- ═════════════════════════════════════════════════════════════════════════════
with partido as (
  select
    p.id,
    p.nombre,
    coalesce(p.activo, true)                                             as activo,
    btrim(regexp_replace(p.nombre, '\s+[A-Z]{0,3}[0-9]{3,}$', ''))       as base,
    substring(p.nombre from '\s+([A-Z]{0,3}[0-9]{3,})$')                 as codigo,
    (select count(*) from public.panol_materiales m where m.proveedor_id = p.id) as materiales
  from public.panol_proveedores p
),
solo_con_codigo as (
  select * from partido where codigo is not null and length(base) >= 3
)
select
  c.base                                                   as proveedor_real,
  count(*)                                                 as filas_con_codigo,
  sum(c.materiales)                                        as materiales_afectados,
  exists (
    select 1 from public.panol_proveedores p2
    where lower(translate(btrim(p2.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
        = lower(translate(c.base,           'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
  )                                                        as ya_existe_limpio,
  string_agg(c.codigo, ', ' order by c.codigo)             as codigos
from solo_con_codigo c
group by c.base
order by count(*) desc, c.base;


-- Y aparte: los nombres con barra, que son otra cosa. "Baron/Trimer" no es un
-- proveedor con código, es dos proveedores en un renglón — el mismo caso que
-- Mercoglass/Favicur. NO se tocan acá: decime qué hacer con cada uno.
select
  p.nombre,
  coalesce(p.activo, true) as activo,
  (select count(*) from public.panol_materiales m where m.proveedor_id = p.id) as materiales
from public.panol_proveedores p
where p.nombre like '%/%'
order by 3 desc;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 2 · EL ARREGLO — descomentar después de mirar el preview
-- ═════════════════════════════════════════════════════════════════════════════
/*
begin;

-- ── 2.a  Se crea el proveedor limpio si no existía ──────────────────────────
insert into public.panol_proveedores (nombre, activo)
select distinct btrim(regexp_replace(p.nombre, '\s+[A-Z]{0,3}[0-9]{3,}$', '')), true
from public.panol_proveedores p
where p.nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$'
  and length(btrim(regexp_replace(p.nombre, '\s+[A-Z]{0,3}[0-9]{3,}$', ''))) >= 3
  and not exists (
    select 1 from public.panol_proveedores q
    where lower(translate(btrim(q.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
        = lower(translate(btrim(regexp_replace(p.nombre, '\s+[A-Z]{0,3}[0-9]{3,}$', '')),
                          'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
  );

-- ── 2.b  EL CÓDIGO SE SALVA ─────────────────────────────────────────────────
-- Va al material y sólo si el material no tenía uno propio. Un código cargado a
-- mano gana siempre: éste sale de una importación vieja y es el menos confiable
-- de los dos.
update public.panol_materiales m
set codigo = substring(p.nombre from '\s+([A-Z]{0,3}[0-9]{3,})$')
from public.panol_proveedores p
where m.proveedor_id = p.id
  and p.nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$'
  and coalesce(btrim(m.codigo), '') = '';

-- ── 2.c  Los materiales pasan al proveedor limpio ───────────────────────────
update public.panol_materiales m
set proveedor_id = limpio.id,
    proveedor    = limpio.nombre
from public.panol_proveedores sucio
join public.panol_proveedores limpio
  on lower(translate(btrim(limpio.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
   = lower(translate(btrim(regexp_replace(sucio.nombre, '\s+[A-Z]{0,3}[0-9]{3,}$', '')),
                     'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
 and limpio.id <> sucio.id
 and limpio.nombre !~ '\s+[A-Z]{0,3}[0-9]{3,}$'
where m.proveedor_id = sucio.id
  and sucio.nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$';

-- ── 2.d  Los alternativos, igual ────────────────────────────────────────────
-- Primero se borran los que quedarían repetidos: un material podía tener a
-- "Baron A95562" y a "Baron B10155" como alternativos, y los dos van a Baron.
delete from public.panol_material_proveedores x
using public.panol_proveedores sucio
where x.proveedor_id = sucio.id
  and sucio.nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$';

-- ── 2.e  Las filas con código se desactivan ─────────────────────────────────
-- No se borran: si algún código resultó importante, la fila sigue ahí.
update public.panol_proveedores
set activo = false
where nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$'
  and coalesce(activo, true);

commit;
*/


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 3 · CONTROL — después del arreglo, los tres tienen que dar 0
-- ═════════════════════════════════════════════════════════════════════════════
/*
select 'proveedores con codigo todavia activos' as control, count(*) as casos
from public.panol_proveedores
where nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$' and coalesce(activo, true)
union all
select 'materiales colgados de un proveedor desactivado', count(*)
from public.panol_materiales m
join public.panol_proveedores p on p.id = m.proveedor_id
where coalesce(p.activo, true) = false
union all
select 'materiales que perdieron el codigo', count(*)
from public.panol_materiales m
join public.panol_proveedores p on p.id = m.proveedor_id
where p.nombre ~ '\s+[A-Z]{0,3}[0-9]{3,}$'
  and coalesce(btrim(m.codigo), '') = '';
*/
