-- Deshace el ingreso de 3 "Soporte elevador TV JC35VT-1000" (52-25, 52-26, 52-27)
-- recibidos por error a las 11:50 del 19/11/2026 (eran soportes de pared).
create temp table zz_map(snap uuid, item uuid, envio uuid, pri uuid, pr uuid) on commit drop;
insert into zz_map values
 ('401c44d2-d29b-415d-a9f5-128779663543','17895382-6194-48e3-8224-405ee496a8e4','8fc465da-15e1-4098-b41e-46f5244d587c','408e5a6e-27d7-4a0c-974d-f737b872e847','c51ec468-338b-4aa4-8295-ac14f0788ad1'),
 ('b2e1a148-7229-4f54-8c18-d360af0012da','3adc19f5-6aaf-4d3f-a358-7024ac24b118','8ae9e5d7-1493-42c3-bf20-703fb1f8d226','32edd837-591a-490a-a99e-60a0c76cf184','d92e4b2c-1f2c-4a52-8f93-eeece4647ed6'),
 ('81e8f59b-7f20-4d6e-8d0d-53d55cf40ba5','389f02d6-1233-406f-a18d-392501dad059','77ff3066-2b54-4c60-b9a3-d4b67466c838','b890ecd1-35b7-4e06-8d4a-a5f1809416ec','0c1d4007-bca0-48e0-b2c1-27e1812293e7');

-- 1. Renglones del aviso: otra vez pendientes
update panol_envio_items i set estado='pendiente', marcado_at=null, marcado_por=null, cantidad_recibida=null
 from zz_map m where i.id=m.item;

-- 2. Pedido de Compras (renglón): otra vez "pedido", como lo dejó Compras al comprar
update purchase_request_items p set status='pedido', received_quantity=null,
   status_changed_at=e.created_at, status_changed_by=e.created_by
 from zz_map m join panol_envios e on e.id=m.envio where p.id=m.pri;

-- 3. Renglón de la obra: pedido, recepción pendiente
update panol_obra_materiales_snapshot s set estado='pedido', recepcion_estado='pendiente',
   recepcion_cantidad_recibida=null, recepcion_updated_at=e.created_at
 from zz_map m join panol_envios e on e.id=m.envio where s.id=m.snap;

-- 4. Aviso: enviado, sin recepción
update panol_envios e set estado='enviado', recibido_at=null, recibido_por=null, closed_at=null
 from zz_map m where e.id=m.envio;

-- 5. Pedido de Compras: comprado, sin datos de entrega
update purchase_requests r set status='comprado', delivered_at=null, closed_at=null,
   received_quantity=null, receipt_notes=null,
   status_changed_at=e.created_at, status_changed_by=e.created_by
 from zz_map m join panol_envios e on e.id=m.envio where r.id=m.pr;

-- 6. Sacar del historial del aviso las 3 recepciones erróneas
delete from panol_envio_eventos v using zz_map m
 where v.item_id=m.item and v.tipo='item_estado' and v.estado_nuevo='recibido'
   and v.created_at between '2026-11-19 11:50' and '2026-11-19 11:51';

-- 7. El trigger de Compras pone la fecha de hoy al cambiar el estado: devolver la de la compra
update purchase_request_items p set status_changed_at=e.created_at, status_changed_by=e.created_by
 from zz_map m join panol_envios e on e.id=m.envio where p.id=m.pri;

-- 8. Sacar también el evento "recibido -> pendiente" que agrega el trigger al deshacer
delete from panol_envio_eventos v using zz_map m
 where v.item_id=m.item and v.tipo='item_estado' and v.estado_anterior='recibido'
   and v.estado_nuevo='pendiente' and v.created_at=now();
