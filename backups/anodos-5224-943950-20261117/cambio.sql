select set_config('request.jwt.claims', json_build_object('sub','b93b4fda-590a-41b7-8382-317aa74917e1','role','authenticated')::text, true);
-- Flap: el pedido del 03/11 pisó el renglón egresado de agosto; vuelve a egresado y el pedido pasa al adicional pendiente.
update public.panol_obra_materiales_snapshot set estado='egresado', purchase_request_item_id=null, purchase_request_id=null, updated_at=now()
 where id='38d02f50-f87f-4998-9d2c-58380dc947c5' and estado='pedido' and recepcion_estado='egresado' and purchase_request_item_id='418154fe-8d19-4545-9b07-63144a0cf475';
update public.panol_obra_materiales_snapshot set purchase_request_item_id='418154fe-8d19-4545-9b07-63144a0cf475', updated_at=now()
 where id='3dbdb692-9d5d-4777-b595-aac787eb3de7' and estado='pendiente' and purchase_request_item_id is null;
-- Comprado sin importe: control apagado sólo dentro de esta transacción (OK de Ezequiel, 17/11).
alter table public.purchase_requests disable trigger trg_purchase_requests_validar_precio_compra;
update public.purchase_requests set status='comprado' where id='943950cc-94fb-48a9-b83b-8ad5c30e878a' and status='en_revision';
alter table public.purchase_requests enable trigger trg_purchase_requests_validar_precio_compra;
