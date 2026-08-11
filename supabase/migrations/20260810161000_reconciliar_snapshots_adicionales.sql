-- La necesidad adicional vive en panol_obra_addons y su historial operativo en
-- panol_obra_materiales_snapshot. Algunos avisos creados desde Compras dejaron
-- el snapshot como "manual", aunque el pedido padre era adicional. La pantalla
-- no podía reconocer que ambos registros representaban el mismo renglón.

update public.panol_obra_materiales_snapshot snapshot
   set es_adicional = true,
       tipo = 'addon',
       tipo_label = 'Adicional',
       source = 'addon',
       updated_at = now()
 where (
     coalesce(snapshot.es_adicional, false)
     or snapshot.tipo = 'addon'
     or snapshot.source = 'addon'
     or exists (
       select 1
         from public.purchase_requests pedido
        where pedido.id = snapshot.purchase_request_id
          and coalesce(pedido.es_adicional, false)
     )
     or exists (
       select 1
         from public.purchase_request_items item
         join public.purchase_requests pedido on pedido.id = item.request_id
        where item.id = snapshot.purchase_request_item_id
          and coalesce(pedido.es_adicional, false)
     )
   )
   and (
     coalesce(snapshot.es_adicional, false) is distinct from true
     or snapshot.tipo is distinct from 'addon'
     or snapshot.source is distinct from 'addon'
   );

comment on column public.panol_obra_materiales_snapshot.es_adicional is
  'Identifica snapshots cuyo renglón operativo proviene de un adicional de la obra, aunque se haya creado desde Compras o Pañol.';
