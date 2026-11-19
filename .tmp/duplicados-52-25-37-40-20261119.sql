-- Ítems que la lista de obra mostraba dos veces (19/11/2026).
--
-- 52-25 · Tender lift: se pidió como adicional el 19/10 y al día siguiente
-- llegó uno por transferencia desde la 55-3 (retirado el 28/10). El ingreso no
-- estaba atado al pedido, así que la lista mostraba "Adicional · Pedido" y otra
-- fila "Fuera de matriz · Entregado". Se ata la transferencia al ítem del
-- pedido (igual que un remito de un adicional, ver 526e379b) y la lista la toma
-- como la entrega de ese adicional. No se borra nada.
--
-- 37-40 · Cable de acero anticolisión: mismo caso que la 37-43 (pedido como
-- "Adicional" un ítem del condicionante el 22/10). El pedido pasa al renglón
-- del condicionante y se borra el adicional sobrante. No toca el pedido de
-- Compras.

begin;

do $$
declare v_mal int;
begin
  -- 52-25
  select count(*) into v_mal
  from panol_obra_materiales_snapshot ad, panol_obra_materiales_snapshot tr
  where ad.id='1c7cbaa0-ea0f-4627-bc7b-ac64bb07e375' and tr.id='baac79f0-86e4-49a9-95e1-ad9f1b902126'
    and ad.source='adicional_obra' and ad.purchase_request_item_id='31e8436c-f0a7-4a57-8d4b-35895ca8be6c'
    and tr.source='transferencia_ingreso' and tr.purchase_request_item_id is null
    and ad.obra_id=tr.obra_id and ad.material_id=tr.material_id;
  if v_mal<>1 then raise exception '52-25: el tender lift cambió desde la revisión. No se aplica.'; end if;

  -- 37-40
  select count(*) into v_mal
  from panol_obra_materiales_snapshot ad, panol_obra_materiales_snapshot sib
  where ad.id='cb2a1497-cd3a-4152-9c14-7b569786b3b0' and sib.id='886d31e4-a73f-4a8f-9d7c-70a628365c12'
    and ad.source='adicional_obra' and ad.purchase_request_item_id is not null
    and ad.recepcion_estado is null and ad.panol_envio_id is null and ad.panol_envio_item_id is null and ad.egreso_at is null
    and sib.source='condicionante' and sib.purchase_request_item_id is null and sib.purchase_request_id is null
    and sib.panol_envio_id is null and sib.recepcion_estado is null and sib.egreso_at is null
    and ad.obra_id=sib.obra_id
    and coalesce(ad.requisito_material_id,ad.material_id)=coalesce(sib.requisito_material_id,sib.material_id)
    and not exists (select 1 from panol_envio_items e where e.obra_snapshot_item_id=ad.id);
  if v_mal<>1 then raise exception '37-40: el cable anticolisión cambió desde la revisión. No se aplica.'; end if;
end $$;

select set_config('app.audit_origin','correccion_duplicados_adicional',true);
select set_config('app.audit_note','Ítem duplicado en la lista de obra (19/11)',true);

-- 52-25: la transferencia es la entrega del adicional.
update panol_obra_materiales_snapshot tr
   set purchase_request_id=ad.purchase_request_id, purchase_request_item_id=ad.purchase_request_item_id
  from panol_obra_materiales_snapshot ad
 where tr.id='baac79f0-86e4-49a9-95e1-ad9f1b902126' and ad.id='1c7cbaa0-ea0f-4627-bc7b-ac64bb07e375';

-- 37-40: el pedido pasa al renglón del condicionante.
create temp table zz_cable on commit drop as
select id, estado, purchase_request_id, purchase_request_item_id
from panol_obra_materiales_snapshot where id='cb2a1497-cd3a-4152-9c14-7b569786b3b0';

update panol_obra_materiales_snapshot set purchase_request_id=null, purchase_request_item_id=null
 where id='cb2a1497-cd3a-4152-9c14-7b569786b3b0';
update panol_obra_materiales_snapshot s
   set estado=z.estado, purchase_request_id=z.purchase_request_id, purchase_request_item_id=z.purchase_request_item_id,
       tipo_pedido='adicional', es_adicional=true
  from zz_cable z where s.id='886d31e4-a73f-4a8f-9d7c-70a628365c12';
update panol_obra_materiales_snapshot_audit set snapshot_id='886d31e4-a73f-4a8f-9d7c-70a628365c12'
 where snapshot_id='cb2a1497-cd3a-4152-9c14-7b569786b3b0';
delete from panol_obra_addons where obra_snapshot_id='cb2a1497-cd3a-4152-9c14-7b569786b3b0';
delete from panol_obra_materiales_snapshot where id='cb2a1497-cd3a-4152-9c14-7b569786b3b0';

commit;
