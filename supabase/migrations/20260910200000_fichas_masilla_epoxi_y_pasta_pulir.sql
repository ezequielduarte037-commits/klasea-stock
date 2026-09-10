-- Los dos consumibles que quedaron en "A reconciliar"
--
-- QUÉ PASÓ, fila por fila
--
--   MASILLA E-POXY   fila d7521828 · 08/09 10:34 · retiró Gavilán Pedro Daniel
--   PASTA DE PULIR   fila 4e15217a · 08/09 10:18 · retiró Frias Gastón Darío
--
-- Las dos salieron de una solicitud de pañol donde el ítem se escribió a mano:
-- el pedido tiene `material_id` vacío, así que el egreso también. El sistema no
-- sabe qué son -para él es texto- y por eso ni el filtro de consumibles ni nada
-- las puede sacar del stock maestro.
--
-- "hoja de cuter" salía en la misma lista y ya no está: esa sí tenía par exacto
-- en el catálogo y se ligó. Estas dos no existen en el catálogo.
--
--
-- LO QUE ESTE SQL SÍ RESUELVE
-- Crea las dos fichas como consumibles y liga las filas sueltas. A partir de
-- ahí dejan de ser "texto sin ficha": pasan a ser consumibles de verdad, salen
-- del stock maestro y de "A reconciliar", y su saldo se ve en el apartado de
-- Consumibles, que es donde corresponde.
--
-- LO QUE NO RESUELVE, Y HAY QUE SABERLO
-- El saldo va a seguir en -1 en los dos casos, y no es un error de cuenta:
--
--   Masilla epoxi:  entró 1 el 13/08, salieron 2 (11/08 y 08/09)  ->  -1
--   Pasta de pulir: no entró nunca, salió 1 (08/09)               ->  -1
--
-- Se entregó material que nunca se registró como recibido. Eso no lo puede
-- arreglar una migración: o aparece el remito que falta, o se anula el egreso
-- si nunca pasó, o se hace un conteo físico que fije el número real. Es una
-- decisión de pañol.
--
-- Ojo con la pasta de pulir: en el catálogo existe "Pano Pulir" con 113 de
-- saldo, pero es otra cosa -un paño, no una pasta abrasiva-. Por eso va ficha
-- propia y no se junta con esa.
--
-- Correr entero en el editor SQL. Sin `begin` ni `commit`: el editor de
-- Supabase ya corre todo dentro de su propia transacción.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Las fichas
--
-- El nombre es el que escribió quien lo pidió, normalizado. La unidad es
-- "unidad" porque así se pidieron las dos.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_consumible, activo, notas)
select 'Masilla epoxi', 'unidad', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', true, true,
       'Ficha creada para cerrar retiros que se habían pedido a mano.'
 where not exists (select 1 from public.panol_materiales where lower(descripcion) = 'masilla epoxi');

insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_consumible, activo, notas)
select 'Pasta de pulir gruesa', 'unidad', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', true, true,
       'Ficha creada para cerrar retiros que se habían pedido a mano. No es lo mismo que "Pano Pulir".'
 where not exists (select 1 from public.panol_materiales where lower(descripcion) = 'pasta de pulir gruesa');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ligar los pedidos escritos a mano
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_solicitud_items i
   set material_id = m.id
  from public.panol_materiales m
 where m.descripcion = 'Masilla epoxi'
   and i.material_id is null
   and lower(i.descripcion) in ('masilla epoxi', 'masilla e-poxy');

update public.panol_solicitud_items i
   set material_id = m.id
  from public.panol_materiales m
 where m.descripcion = 'Pasta de pulir gruesa'
   and i.material_id is null
   and lower(i.descripcion) = 'pasta de pulir gruesa';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ligar los movimientos del pañol
--
-- Son los que se ven en "A reconciliar", más el ingreso de masilla del 13/08
-- que también había quedado suelto.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot s
   set material_id = m.id,
       requisito_material_id = m.id,
       rubro = 'Consumibles',
       updated_at = now()
  from public.panol_materiales m
 where m.descripcion = 'Masilla epoxi'
   and s.material_id is null
   and lower(s.descripcion) in ('masilla epoxi', 'masilla e-poxy');

update public.panol_obra_materiales_snapshot s
   set material_id = m.id,
       requisito_material_id = m.id,
       rubro = 'Consumibles',
       updated_at = now()
  from public.panol_materiales m
 where m.descripcion = 'Pasta de pulir gruesa'
   and s.material_id is null
   and lower(s.descripcion) = 'pasta de pulir gruesa';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. De paso: el ingreso de "hoja cuter" del 13/08 que quedó suelto
--
-- Es un +1 sin ficha. No molesta en "A reconciliar" porque es positivo, pero
-- está afuera de la cuenta de HOJA CUTER, que hoy da 89 en vez de 90.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot
   set material_id = '92629e6e-fe1e-4047-8fa8-44b388ef6b71',
       requisito_material_id = '92629e6e-fe1e-4047-8fa8-44b388ef6b71',
       rubro = 'Consumibles',
       updated_at = now()
 where material_id is null
   and lower(descripcion) in ('hoja cuter', 'hoja de cuter');


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════

-- Las dos fichas nuevas, marcadas como consumibles.
select m.descripcion, m.es_consumible, c.nombre as rubro
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
 where m.descripcion in ('Masilla epoxi', 'Pasta de pulir gruesa');

-- Tiene que dar 0 filas: ya no queda nada suelto con esos nombres.
select id, descripcion, estado, source
  from public.panol_obra_materiales_snapshot
 where material_id is null
   and (descripcion ilike '%masilla e%' or descripcion ilike '%pasta de pulir%' or descripcion ilike '%cuter%');

-- El saldo de cada una. Masilla y pasta van a dar -1: es el ingreso que falta,
-- no un error de la migración. Hoja cuter tiene que pasar de 89 a 90.
select m.descripcion,
       sum(case when s.estado = 'egresado'
                then -coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0)
                else coalesce(s.cantidad, 0) end) as saldo
  from public.panol_materiales m
  join public.panol_obra_materiales_snapshot s on s.material_id = m.id
 where m.descripcion in ('Masilla epoxi', 'Pasta de pulir gruesa', 'HOJA CUTER')
 group by 1;

-- Lo que sigue sin ficha y da negativo. Son 31 en total y las de arriba salen
-- de esta lista; el resto no son consumibles.
select descripcion, count(*) as filas
  from public.panol_obra_materiales_snapshot
 where material_id is null and estado = 'egresado'
 group by 1
 order by 2 desc;
