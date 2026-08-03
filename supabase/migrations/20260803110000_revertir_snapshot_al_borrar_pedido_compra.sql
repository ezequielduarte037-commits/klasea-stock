-- Al borrar un pedido de compras, los ítems de la obra que dependían de ese
-- pedido no pueden conservar el estado "pedido" o "comprado". Esas filas son
-- planificación, no un movimiento físico: vuelven a Pendiente y se liberan
-- para poder incluirlas en un nuevo pedido.
--
-- Si ya hubo envío a pañol, recepción o egreso, se conserva el estado real.

create or replace function public.revertir_snapshot_al_borrar_pedido_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.audit_origin', 'pedido_eliminado', true);
  perform set_config(
    'app.audit_note',
    'Pedido de compras eliminado: se revierte el estado de planificación.',
    true
  );

  update public.panol_obra_materiales_snapshot snapshot
     set estado = 'pendiente',
         purchase_request_id = null,
         purchase_request_item_id = null,
         updated_at = now()
   where (
       snapshot.purchase_request_id = old.id
       or snapshot.purchase_request_item_id in (
         select item.id
           from public.purchase_request_items item
          where item.request_id = old.id
       )
     )
     and snapshot.estado in ('pedido', 'comprado')
     and snapshot.panol_envio_id is null
     and snapshot.panol_envio_item_id is null
     and snapshot.egreso_at is null;

  return old;
end;
$$;

drop trigger if exists trg_purchase_request_revertir_snapshot_al_borrar on public.purchase_requests;
create trigger trg_purchase_request_revertir_snapshot_al_borrar
before delete on public.purchase_requests
for each row
execute function public.revertir_snapshot_al_borrar_pedido_compra();

-- Repara los falsos "comprado" que ya quedaron sin pedido asociado por
-- eliminaciones anteriores. No toca filas con un circuito real de pañol.
do $$
begin
  perform set_config('app.audit_origin', 'reparacion_pedido_eliminado', true);
  perform set_config(
    'app.audit_note',
    'Se corrigió un estado de compra sin pedido asociado.',
    true
  );

  update public.panol_obra_materiales_snapshot
     set estado = 'pendiente',
         updated_at = now()
   where estado in ('pedido', 'comprado')
     and purchase_request_id is null
     and purchase_request_item_id is null
     and panol_envio_id is null
     and panol_envio_item_id is null
     and egreso_at is null;
end;
$$;

