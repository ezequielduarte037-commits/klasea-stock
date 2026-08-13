-- Destraba el stock de Pañol que quedó apuntando a un requisito genérico.
--
-- Qué pasó: 20260812170000_materiales_requisitos_productos.sql marcó como
-- `es_requisito` a TODO material con un array `variantes` no vacío, y creó un
-- producto concreto por variante. Después reasignó los snapshots... pero sólo
-- los que tenían la columna `variante` cargada:
--
--     where coalesce(requisito_material_id, material_id) = v_req.id
--       and lower(btrim(coalesce(variante, ''))) = lower(btrim(v_variante))
--
-- El stock que NO tenía variante elegida se quedó apuntando al material que
-- acababa de convertirse en requisito. Como panol_egresar_snapshots y
-- panol_transferir_snapshots cortan con "Este registro es un requisito
-- genérico...", esa mercadería quedó imposible de egresar o transferir, sin
-- ninguna pantalla de Pañol donde elegir el producto concreto.
--
-- Esta migración resuelve los dos casos que se pueden arreglar sin adivinar.
-- Es idempotente: se puede correr de nuevo sin efectos.

-- ─── Caso 1 ──────────────────────────────────────────────────────────────────
-- Materiales marcados como requisito que no tienen NINGÚN producto concreto.
-- Nunca fueron un requisito real: tenían un `variantes` con entradas vacías
-- (["", " "]), que el bucle de la migración saltea con `continue when null`.
-- Sin productos no hay nada que elegir, así que la marca sólo bloquea stock.
-- Ojo: panol_materiales NO tiene updated_at (ver 20260810160000, donde escribirlo
-- rompía la función entera). No agregar acá.
update public.panol_materiales m
   set es_requisito = false
 where m.es_requisito
   and not exists (
     select 1
       from public.panol_requisito_productos rp
      where rp.requisito_material_id = m.id
        and rp.activo
   );

-- ─── Caso 2 ──────────────────────────────────────────────────────────────────
-- Snapshots parados en un requisito que tiene UN SOLO producto concreto: no hay
-- ambigüedad posible, el producto es ese. Con dos o más no se toca nada: elegir
-- por el operario podría asignar el color o la medida equivocada al stock real.
-- array_agg y no min(): Postgres no define min()/max() para uuid. Como el HAVING
-- garantiza una sola fila por requisito, el primer elemento es el único.
with unicos as (
  select rp.requisito_material_id,
         (array_agg(rp.producto_material_id))[1] as producto_material_id
    from public.panol_requisito_productos rp
   where rp.activo
   group by rp.requisito_material_id
  having count(*) = 1
)
update public.panol_obra_materiales_snapshot s
   set material_id = u.producto_material_id,
       requisito_material_id = coalesce(s.requisito_material_id, s.material_id),
       producto_asignado_at = coalesce(s.producto_asignado_at, s.updated_at, now()),
       producto_asignacion_origen = coalesce(s.producto_asignacion_origen, 'migracion_variante'),
       updated_at = now()
  from unicos u
  join public.panol_materiales m on m.id = u.requisito_material_id
 -- Sólo las filas realmente trabadas: las que APUNTAN al requisito. Un snapshot
 -- que ya tiene producto concreto no se toca, aunque conserve el requisito en
 -- requisito_material_id (que es lo normal y correcto).
 where s.material_id = u.requisito_material_id
   and m.es_requisito;

-- La identidad concreta tiene que llegar también a compras y a recepción, si no
-- el ítem queda resuelto en Pañol pero genérico en las otras pantallas. Se acota
-- a los que hoy apuntan a un requisito: el resto puede diferir a propósito.
update public.purchase_request_items pri
   set material_id = s.material_id,
       requisito_material_id = s.requisito_material_id,
       catalog_source = 'panol',
       updated_at = now()
  from public.panol_obra_materiales_snapshot s
  join public.panol_materiales pm on pm.id = s.material_id
 where s.purchase_request_item_id = pri.id
   and pm.es_requisito is distinct from true
   and exists (
     select 1 from public.panol_materiales rm
      where rm.id = pri.material_id and rm.es_requisito
   );

update public.panol_envio_items pei
   set material_id = s.material_id,
       requisito_material_id = s.requisito_material_id,
       updated_at = now()
  from public.panol_obra_materiales_snapshot s
  join public.panol_materiales pm on pm.id = s.material_id
 where pei.obra_snapshot_item_id = s.id
   and pm.es_requisito is distinct from true
   and exists (
     select 1 from public.panol_materiales rm
      where rm.id = pei.material_id and rm.es_requisito
   );

-- ─── Diagnóstico ─────────────────────────────────────────────────────────────
-- Lo que queda acá es genuinamente ambiguo: un requisito con varios productos y
-- stock que nunca eligió cuál. Hay que resolverlo a mano desde Materiales →
-- obra → "Producto asignado". Esta vista es para ver de un vistazo cuánto falta.
create or replace view public.panol_stock_requisitos_sin_resolver as
select s.id                as snapshot_id,
       s.obra_id,
       s.cantidad,
       s.estado,
       s.sector_destino,
       m.id                as requisito_material_id,
       m.descripcion       as requisito_descripcion,
       (select count(*)
          from public.panol_requisito_productos rp
         where rp.requisito_material_id = m.id
           and rp.activo)  as productos_posibles
  from public.panol_obra_materiales_snapshot s
  join public.panol_materiales m on m.id = s.material_id
 where m.es_requisito;

comment on view public.panol_stock_requisitos_sin_resolver is
  'Stock de Pañol que sigue apuntando a un requisito genérico y no se puede egresar hasta elegirle el producto concreto.';

grant select on public.panol_stock_requisitos_sin_resolver to authenticated;
