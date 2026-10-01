-- Marcar un pedido como "recibido" en Compras volvía a poner en stock lo que
-- el pañol ya había entregado.
--
-- Caso real (01/10/2026): "Fv Epuyén 106/l2 Negro", obra 64-21. El 30/09 a las
-- 13:26 el pañol le entregó las 2 unidades a Centurion (renglón `egresado`). El
-- 01/10 a las 07:41 Compras pasó el pedido a "recibido";
-- trg_purchase_request_arrastra_lineas llevó la línea a 'recibido' y
-- sync_obra_snapshot_from_purchase_item copió ese estado al renglón de la obra
-- pisando el `egresado`. El renglón apareció como INGRESO +2 con los datos del
-- retiro, el stock volvió a contar 2 unidades que ya no estaban, y a las 09:33
-- se registró un segundo retiro del mismo renglón (cantidad_egresada 4 de 2).
--
-- La auditoría (panol_obra_materiales_snapshot_audit) lo muestra:
--   egresado -> recibido · origen trigger · actor davidtec · 2026-10-01 10:41:54 UTC
--
-- La versión de esta función en 20260629000000_obra_materiales_recepcion.sql ya
-- tenía la condición `s.estado <> 'egresado'`, pero la que corre en la base no:
-- las migraciones se aplican a mano y esa quedó distinta. El mismo hueco explica
-- el "Botazo plástico blanco" que el 11/09 pasó de egresado a pedido.
--
-- Lo que sale del pañol no vuelve por un cambio de estado de Compras. Si un
-- egreso estuvo mal, se corrige con "Revertir" o con la regularización de Obras
-- (panol_cambiar_estado_snapshot), que no pasan por acá.

begin;

create or replace function public.sync_obra_snapshot_from_purchase_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panol_obra_materiales_snapshot s
     set estado = case
           when new.status in ('pedido','en_panol','recibido','cancelado') then new.status
           else s.estado
         end,
         updated_at = now()
   where s.purchase_request_item_id = new.id
     and (
       s.panol_envio_item_id is null
       or new.status in ('en_panol','recibido','cancelado')
     )
     and s.estado <> 'egresado';

  return new;
end;
$$;

comment on function public.sync_obra_snapshot_from_purchase_item() is
  'Copia el estado de la línea de compra al renglón de la obra. Nunca toca un renglón egresado: lo que ya salió del pañol no vuelve por un cambio en Compras.';

commit;

-- Para comprobar después de aplicarla (tiene que devolver true):
-- select pg_get_functiondef('public.sync_obra_snapshot_from_purchase_item()'::regprocedure)
--        like '%<> ''egresado''%';
