-- Depuración de proveedores — parte 1: los nombres escritos a mano
--
-- `panol_materiales.proveedor` es texto libre y convive con `proveedor_id`. En
-- 45 materiales había un nombre escrito a mano que no coincidía con ningún
-- proveedor de la tabla, y NINGUNO tenía el vínculo puesto. Este script los
-- separa en tres grupos, según lo que confirmó Ezequiel:
--
--   A. LO QUE YA EXISTE con otra escritura  -> se vincula al proveedor real
--   B. PROVEEDORES DE VERDAD que faltaban   -> se crean y se vinculan
--   C. COSAS RARAS                          -> quedan SIN proveedor
--
-- El grupo C es el que importa entender: ahí no hay proveedores. Hay una sub
-- empresa del astillero (Hunter Desing, 9 materiales), marcas de motores que no
-- son a quién se le compra (Volvo, Mercury), un nombre demasiado genérico
-- (Patagonia) y un "no se" literal. Esos materiales quedan sin proveedor a
-- propósito: aparecen en el grupo rojo de Costo del barco, con su selector,
-- para que se les asigne el que de verdad los vende.
--
-- NO cubre los duplicados DENTRO de panol_proveedores -Trimer/TRIMER S.A. y
-- compañía-: eso es la parte 2 y necesita la consulta 2 del diagnóstico.
--
-- Es idempotente: correrlo dos veces no duplica ni pisa nada.
-- Correr en el editor SQL de Supabase y mirar los dos SELECT del final.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Los que ya existen, escritos distinto
--
-- Compara sin tildes y sin mayúsculas, así "RINCON DEL HERRAJE" encuentra a
-- "Rincón del Herraje". De paso deja el nombre bien escrito en el material.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales m
set proveedor_id = p.id,
    proveedor    = p.nombre
from public.panol_proveedores p
where m.proveedor_id is null
  and m.proveedor is not null
  and lower(translate(btrim(m.proveedor), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
    = lower(translate(btrim(p.nombre),    'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'));


-- ─────────────────────────────────────────────────────────────────────────────
-- B. Los proveedores de verdad que faltaban en la tabla
--
-- Náutica Folino venía escrito de tres formas -"NAUTICA FOLINO", "NAUTICO
-- FOLINO" y "Nautica Folino"- y son 11 materiales del mismo proveedor.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.panol_proveedores (nombre, activo)
select nuevo.nombre, true
from (values
  ('Náutica Folino'),
  ('Turbodiesel'),
  ('Nor Hidráulica'),
  ('Grupo Propeller'),
  ('Novotec'),
  ('Gabriel Sanitarios'),
  ('Power Bat'),
  ('Herrería Montes'),
  ('Alejandro Merniez')
) as nuevo(nombre)
where not exists (
  select 1 from public.panol_proveedores p
  where lower(translate(btrim(p.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
      = lower(translate(nuevo.nombre,    'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
);

-- Y ahora sí, los materiales a su proveedor. Cada renglón lista todas las
-- formas en que estaba escrito.
update public.panol_materiales m
set proveedor_id = p.id,
    proveedor    = p.nombre
from public.panol_proveedores p,
     (values
       ('Náutica Folino',    array['NAUTICA FOLINO', 'NAUTICO FOLINO', 'Nautica Folino']),
       ('Turbodiesel',       array['TURBODIESEL']),
       ('Nor Hidráulica',    array['NOR HIDRAULICA']),
       ('Grupo Propeller',   array['GRUPO PROPELLER']),
       ('Novotec',           array['NOVOTEC']),
       ('Gabriel Sanitarios',array['GABRIEL SANITARIOS']),
       ('Power Bat',         array['Power Bat']),
       ('Herrería Montes',   array['HERRERIA MONTES']),
       ('Alejandro Merniez', array['ALEJANDRO MERNIEZ'])
     ) as mapa(canonico, escrituras)
where m.proveedor_id is null
  and btrim(m.proveedor) = any (mapa.escrituras)
  and lower(translate(btrim(p.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
    = lower(translate(mapa.canonico,   'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'));


-- ─────────────────────────────────────────────────────────────────────────────
-- C. Las cosas raras: sin proveedor
--
-- No se borra el material ni nada más: sólo se vacía el campo, porque lo que
-- decía no era un proveedor. Quedan a la vista en Costo del barco, en el grupo
-- "Sin proveedor asignado", para reasignarlos al que realmente los vende.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales m
set proveedor    = null,
    proveedor_id = null
where m.proveedor_id is null
  and btrim(m.proveedor) in (
    'HUNTER DESING',   -- sub empresa del astillero, no un proveedor (9)
    'VOLVO PENTA',     -- marca de motores (2)
    'VOLVO',           -- idem (1)
    'MERCURY',         -- marca de motores (1)
    'PATAGONIA',       -- demasiado genérico para saber a quién se le compra (1)
    'no se'            -- literal (1)
  );

commit;


-- ─────────────────────────────────────────────────────────────────────────────
-- CÓMO QUEDÓ
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.nombre                        as proveedor,
  count(m.id)                     as materiales_vinculados
from public.panol_proveedores p
join public.panol_materiales m on m.proveedor_id = p.id
where p.nombre in (
  'Náutica Folino', 'Turbodiesel', 'Nor Hidráulica', 'Grupo Propeller', 'Novotec',
  'Gabriel Sanitarios', 'Power Bat', 'Herrería Montes', 'Alejandro Merniez', 'Rincón del Herraje'
)
group by p.nombre
order by count(m.id) desc;


-- LO QUE QUEDÓ SIN RESOLVER
--
-- Deberían quedar sólo los nombres que no me animé a interpretar: "MAXI" es
-- muy probablemente Maxi Herrero, pero con un material en juego prefiero que lo
-- confirmes vos antes que adivinar. Si aparece algo más acá, decímelo.
select
  btrim(m.proveedor) as escrito_a_mano,
  count(*)           as materiales
from public.panol_materiales m
where m.proveedor_id is null
  and m.proveedor is not null
  and btrim(m.proveedor) <> ''
group by btrim(m.proveedor)
order by count(*) desc;
