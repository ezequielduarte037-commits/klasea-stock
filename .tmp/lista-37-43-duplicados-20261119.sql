-- 37-43: renglones duplicados por pedir como "Adicional" ítems de la matriz o
-- de un condicionante (parrilla Kenyon 12/11, grifería negra 17/11).
--
-- La función materiales_pedir_adicional_obra creaba un adicional nuevo con el
-- pedido y dejaba el renglón de la matriz pendiente. Acá el pedido pasa al
-- renglón de la matriz (con su historial) y se borra el adicional sobrante.
-- No toca el pedido de Compras: sus ítems siguen siendo los mismos.
-- Aplicar después de publicada la app del 19/11 (la lista vieja separaba un
-- renglón de matriz con es_adicional y lo volvía a mostrar dos veces).

begin;

create temp table zz_par(ad uuid, sib uuid, addon uuid) on commit drop;
insert into zz_par values
  ('111bbd26-b011-427a-8fcf-5a5755043ca3','c095d55c-62e1-463b-8865-7a84d0b2b14f','2bd1803f-f709-47d7-af7d-ace89312e7f7'), -- PARRILLA KENYON
  ('36896227-51c3-4a90-98e1-e192d4328c84','65d17cc7-9618-4101-97aa-11367b872576','1c4a7dff-3bf5-47eb-9cf9-7fc7fbdb6776'), -- Codo pared ducha negro
  ('cc475cbd-d10e-4af5-bbe8-bee76cafbf55','116be6ac-9a42-4ec1-ae5e-9e7529dc2120','192c5dab-936e-4aa9-aec9-029db75086d6'), -- Monocomando cocina negro
  ('fcf7db72-20f1-462c-9bf4-6b6d207fbc27','66e365a5-1e67-467d-81b9-9f605117f013','e5960830-e0ef-4435-95ae-0682e2f6a428'), -- Percha negra
  ('bb2560a1-9462-4a55-8b78-7e9ad1b9afd9','86dc7a15-3b63-4b7b-a828-c3f988bae0d8','410d5f0a-ee21-4852-80be-9b11330fa935'), -- Monocomando lavatorio negro
  ('0853275b-dfe6-42aa-abf3-d57812cd15b7','0803c5e6-2fb6-4e1f-a7ed-8f9326f1a499','3a6f7623-5f07-44ce-a0a2-3a17bed4fafe'), -- Set duchador negro
  ('f7ff91d9-c005-48c7-98b2-f542fe31cdf7','a0d2ada7-fe57-4b54-a660-0fc4f90c581e','f146983b-0841-4306-aa11-517e91cf24b4'); -- Monocomando ducha negro

-- Freno: si alguno ya no está como se revisó (se recibió, se movió, cambió de
-- obra), no se hace nada.
do $$
declare v_mal int;
begin
  select count(*) into v_mal
  from zz_par z
  left join panol_obra_materiales_snapshot ad on ad.id=z.ad
  left join panol_obra_materiales_snapshot sib on sib.id=z.sib
  where ad.id is null or sib.id is null
     or ad.source<>'adicional_obra' or ad.purchase_request_item_id is null
     or ad.recepcion_estado is not null or ad.panol_envio_id is not null or ad.panol_envio_item_id is not null or ad.egreso_at is not null
     or sib.purchase_request_id is not null or sib.purchase_request_item_id is not null
     or sib.panol_envio_id is not null or sib.panol_envio_item_id is not null
     or sib.recepcion_estado is not null or sib.egreso_at is not null
     or ad.obra_id<>sib.obra_id
     or coalesce(ad.requisito_material_id,ad.material_id)<>coalesce(sib.requisito_material_id,sib.material_id)
     or exists (select 1 from panol_envio_items e where e.obra_snapshot_item_id=z.ad);
  if v_mal>0 then raise exception 'Cambió el estado de % renglones desde la revisión. No se aplica.', v_mal; end if;
end $$;

select set_config('app.audit_origin','correccion_duplicados_adicional',true);
select set_config('app.audit_note','Pedido adicional pasado al renglón de la matriz (duplicado 37-43)',true);

create temp table zz_link on commit drop as
select z.*, ad.estado, ad.purchase_request_id, ad.purchase_request_item_id
from zz_par z join panol_obra_materiales_snapshot ad on ad.id=z.ad;

update panol_obra_materiales_snapshot s
   set purchase_request_id=null, purchase_request_item_id=null
  from zz_link l where s.id=l.ad;

update panol_obra_materiales_snapshot s
   set estado=l.estado, purchase_request_id=l.purchase_request_id, purchase_request_item_id=l.purchase_request_item_id,
       tipo_pedido='adicional', es_adicional=true
  from zz_link l where s.id=l.sib;

update panol_obra_materiales_snapshot_audit a set snapshot_id=z.sib from zz_par z where a.snapshot_id=z.ad;
delete from panol_obra_addons a using zz_par z where a.id=z.addon and a.obra_snapshot_id=z.ad;
delete from panol_obra_materiales_snapshot s using zz_par z where s.id=z.ad;

commit;
