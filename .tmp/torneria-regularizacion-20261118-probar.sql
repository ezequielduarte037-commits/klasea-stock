begin;
set local lock_timeout = '4s';
set local statement_timeout = '45s';
select set_config('request.jwt.claims',
  '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);
create temp table t_regularizar(
  obra text, obra_id uuid, item_id uuid, descripcion text, operacion_id uuid, componente_id uuid primary key,
  material_id uuid, compra_item uuid, compra_id uuid, modo text, cantidad numeric,
  cantidad_viaje numeric, snapshot_planificado uuid, aviso_pendiente uuid, snapshot_fisico uuid,
  aviso_recibido uuid
) on commit drop;

insert into t_regularizar values
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','335e16dc-f5c3-4f46-86fc-badc378490bd','Brida de limera','a75ea3b9-c96d-45c4-b9fd-3509d8444f80','a92ba21c-886c-4222-ba74-45aead328e3b','1be5810e-0c5c-4f85-902b-b45d51ff8ebb','9833b76a-39f6-4b0c-a604-4b9ee0968b60','b5b2bcba-ef19-4afa-b440-c7e29b2232a0','recibir',2,2,'9388918b-efc9-4ab1-8e3a-ddaf6601ef3f','6deb6741-50e4-4e80-a272-315169920895','9388918b-efc9-4ab1-8e3a-ddaf6601ef3f',null),
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','8fa22618-1161-4baf-8699-b946d866e855','Cano de limera','fb353a95-c11e-4e37-95d7-1bc1314afb59','a169c831-7fa9-4826-b5c0-a6b85ae1eda9','ba94a996-06d8-4f10-9826-de313b84e6b9','2009f1bf-46c2-41ef-a8e7-001d554c8eb7','b5b2bcba-ef19-4afa-b440-c7e29b2232a0','recibir',0.9,1,'bddb6de1-66be-4c4b-a113-ff39bd91d86c','2e09ec11-f4d6-44ab-bf40-478235e347a2','bddb6de1-66be-4c4b-a113-ff39bd91d86c',null),
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','b18c1980-dc6b-488f-bc90-cab83cc1620a','Palma de pata de gallo','a4f3a73f-8ca0-4ed7-8d3b-a9419b56c553','4a88e131-2fb5-4c29-83c6-e6c05211ab6f','e622a42d-03f6-47b8-af8b-ffcdce2df700','4b9efd93-c596-4687-9039-89cab9bd548e','b5b2bcba-ef19-4afa-b440-c7e29b2232a0','recibir',2,2,'12038472-ea8a-4e15-a6c5-6b09fa327748','9146403e-e42a-4f59-a9d1-d7679d5b9b6b','12038472-ea8a-4e15-a6c5-6b09fa327748',null),
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','166b7091-f1a2-43e0-aab8-4c4831bbd201','Brida de salida de escape','5b3b795a-7bd4-4863-8d28-b7d62a5cdde4','d161a195-f024-442f-b1e0-153e4e3d124a','4dd09492-3f39-4e87-9952-2ad2ee589dd5','13ee3055-71b5-4dca-afd2-4c5820f5f829','b5b2bcba-ef19-4afa-b440-c7e29b2232a0','recibir',2,2,'6526b240-feec-4dc0-a7f3-a519c04a03da','bca5cb77-3982-4df3-bb5a-4e1df662468c','6526b240-feec-4dc0-a7f3-a519c04a03da',null),
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','c8c12b71-542f-4c8a-a958-6bc0157fe906','Tubo de bocina','7959413e-eff5-4e8d-ae35-5a42781aa332','b86edd49-c308-4265-8b52-300120e3ac47','c65feda3-74db-4b56-95b1-22fd62ab65df','00984b6c-cd1b-47fa-b106-c4457b134f8f','b5b2bcba-ef19-4afa-b440-c7e29b2232a0','reutilizar',2,2,'797728a6-c68d-493c-a4d1-521537df741e','9af41673-f729-441a-9935-88e12643cbf5','464a328a-d273-40dc-aba4-4335eccd4b7d','34170c60-f7f5-4e7d-9a5e-2c30d0d3100b'),
('52-27','f75fef37-f0d8-4ce5-b206-32b9c3e2aa57','363fef9c-2e43-4a0c-be07-28d02d166c05','Bulones de manchon','0aed3068-76ef-4cb4-a86c-ddf4b7ca5a0f','f560fed2-cfbf-40e0-8b63-b0fb9c66f9ad','5568f4f7-7f8f-4b9c-b984-8417117e5394',null,null,'directo',12,1,null,null,null,null),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','b48d4530-54b7-4228-8b74-28f0a4f3a808','Brida de limera','f06826a3-6fd5-460c-beed-7f19ceb62f8a','414f57ff-4167-481f-9ae2-e33ba4fd01c3','1be5810e-0c5c-4f85-902b-b45d51ff8ebb','cc710ee3-5c6d-439b-b7a6-24883ac76694','42d275e0-30cc-40d0-98f3-f6a644dcfdac','recibir',2,2,'5bbceb23-8f8f-4dda-ada2-7167a411c804','d27f8b28-8cc9-419c-9c3f-7e75d9494baf','5bbceb23-8f8f-4dda-ada2-7167a411c804',null),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','73a32308-e7b3-4f89-9cf8-c8d42023488d','Cano de limera','bcce6ffc-a9eb-4ac5-8d56-3e6bae0e81be','ee9e5276-63b6-4327-9c17-b249ccaf26ff','ba94a996-06d8-4f10-9826-de313b84e6b9','a61a08ef-c03e-45c9-9046-b2dfe1691466','42d275e0-30cc-40d0-98f3-f6a644dcfdac','recibir',0.9,1,'21f4f086-ae57-473a-afa0-b92864cb5ffc','134cd1b4-ed51-4861-8a15-22d658907361','21f4f086-ae57-473a-afa0-b92864cb5ffc',null),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','f20962b9-6205-4a8b-a35a-d7be83376bb8','Palma de pata de gallo','8ee015f0-6911-423c-84c4-e0d4204fde7e','3dbbaa76-73f3-40b8-8fef-fcfe5cb6c667','e622a42d-03f6-47b8-af8b-ffcdce2df700','b52d7a98-0098-409e-8ba5-627f3ecc9d22','42d275e0-30cc-40d0-98f3-f6a644dcfdac','recibir',2,2,'2cb09ab1-3334-4f41-aacb-ac4631fb6af4','cfef24e9-0aa6-4d5b-bf7f-0f90ad08423c','2cb09ab1-3334-4f41-aacb-ac4631fb6af4',null),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','4036243f-bbe7-44d4-bb31-c68c330665ef','Brida de salida de escape','8ea1adb5-f0f6-45d8-a443-3a264677af1f','95177464-83dd-4e9e-b8c8-13ef25cc94ba','4dd09492-3f39-4e87-9952-2ad2ee589dd5','cf99738f-c8bc-44dc-9359-f5813d6c205a','42d275e0-30cc-40d0-98f3-f6a644dcfdac','recibir',2,2,'e39b7165-7c85-432f-8cfa-0d96280ed4c0','b1c7774c-b273-4ea1-9606-a745ad4b7de5','e39b7165-7c85-432f-8cfa-0d96280ed4c0',null),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','020c9023-d555-4c18-9aac-4b5323a4ac2c','Tubo de bocina','d8174e3d-d7df-473f-bc42-6cfff1e461b0','e876efcc-bce6-48ce-a94a-f0e4808460dc','c65feda3-74db-4b56-95b1-22fd62ab65df','ffaa272e-bc25-4b0e-9c41-e4b6acdc62c3','42d275e0-30cc-40d0-98f3-f6a644dcfdac','reutilizar',2,2,'5b40fe66-5129-45ad-bf20-615fab673754','43fd8202-9a32-4281-b4bf-44e3a9a6d64b','9ed17aae-3a52-45fd-805a-4bf2fb449da7','f28496af-4127-488e-8f03-93b321ce783a'),
('52-28','6150fe8e-adb8-40ec-9191-99f38f191990','610d6265-7b65-4ac3-a0ad-571edc03c994','Bulones de manchon','bd77ec0a-4ad1-4149-9b4e-c2b836110d5d','876d57f4-d7ac-4bdd-8a1d-eb5f0a866d00','5568f4f7-7f8f-4b9c-b984-8417117e5394',null,null,'directo',12,1,null,null,null,null),
('55-6','5d5e2bc3-fb86-4e6a-962e-e9b0c35ebd4f','698cafd7-0b91-464e-b58c-f686e6bbf35a','Palma de pata de gallo','4f56b778-4007-4411-a9bf-21185f07cc6b','a9e60f16-43ac-473f-98e7-8f17d044c1bf','2ccbcb4a-b028-4abb-ab9a-6bee17bba405','7669c693-bcd2-4709-a37c-55ce2cabc21d','fcf21987-0b5e-4bc4-b539-2c3641acba4c','recibir',2,2,'31294b81-6303-49bf-a8a1-6b097e73717c','0689f7a8-c361-45d9-87c8-1aa46a69972f','31294b81-6303-49bf-a8a1-6b097e73717c',null);

create temp table t_flete(resultado jsonb) on commit drop;
do $$
declare
  v record;
  v_payload jsonb;
  v_nota constant text := 'Regularización de ingreso y salida. Material ya en Tornería, informado en capturas del 17/11/2026.';
  v_reutilizado constant text := 'Ingreso confirmado en el aviso Tubos de bocina K52. Se vincula al pedido sin duplicar el ingreso.';
begin
  if not public.is_torneria_editor(auth.uid()) or not public.can_receive_envio('Chubut',auth.uid()) then
    raise exception 'El operador debe poder registrar recepción y movimientos de Tornería';
  end if;
  if (select count(*) from t_regularizar) <> 13 then
    raise exception 'Cantidad inesperada de renglones';
  end if;

  perform 1 from public.torneria_operacion_items oi
    join t_regularizar plan on plan.componente_id=oi.id
    order by oi.id for update of oi;
  perform 1 from public.panol_envio_items ei
    where id in (select aviso_pendiente from t_regularizar union select aviso_recibido from t_regularizar)
    order by id for update;

  if exists (
    select 1 from t_regularizar plan
    where not exists (
      select 1 from public.torneria_operacion_items oi
      join public.torneria_operaciones op on op.id=oi.operacion_id
      join public.torneria_items i on i.id=oi.item_id and i.proceso_id=op.proceso_id
      join public.torneria_procesos p on p.id=i.proceso_id
      join public.produccion_obras o on o.id=p.obra_id
      where oi.id=plan.componente_id and op.id=plan.operacion_id and i.id=plan.item_id and p.obra_id=plan.obra_id
        and o.codigo=plan.obra and o.estado='activa' and p.estado='activo'
        and op.activa and op.tipo='torneria' and op.destino='Torneria'
        and op.origen=case when plan.modo='directo' then 'Proveedor' else 'Astillero' end
        and i.activo and not i.no_lleva and not i.es_resultado
        and i.material_id=plan.material_id and i.cantidad=plan.cantidad
        and i.purchase_request_item_id is not distinct from plan.compra_item
        and i.purchase_request_id is not distinct from plan.compra_id
        and oi.cantidad_requerida=plan.cantidad_viaje and oi.cantidad_enviada=0 and oi.cantidad_recibida=0
        and not exists (select 1 from public.torneria_movimiento_items mi where mi.operacion_item_id=oi.id)
    )
  ) then raise exception 'Cambió el circuito o ya hay una salida para un renglón'; end if;

  for v in select * from t_regularizar where modo <> 'directo' order by obra, descripcion loop
    if not exists (
      select 1 from public.panol_envio_items i
      join public.panol_envios e on e.id=i.envio_id
      join public.panol_obra_materiales_snapshot s on s.id=i.obra_snapshot_item_id
      join public.purchase_request_items c on c.id=v.compra_item
      where i.id=v.aviso_pendiente and i.estado='pendiente' and e.sede='Chubut'
        and i.material_id=v.material_id and i.purchase_request_item_id=v.compra_item
        and s.id=v.snapshot_planificado and s.obra_id=v.obra_id
        and s.cantidad=v.cantidad and s.recepcion_estado='pendiente' and s.estado='comprado'
        and c.request_id=v.compra_id and c.status='pedido'
    ) then raise exception 'Cambió el aviso de Pañol: % %', v.obra, v.descripcion; end if;

    if v.modo='reutilizar' then
      if not exists (
        select 1 from public.panol_obra_materiales_snapshot s
        join public.panol_envio_items mi on mi.id=s.panol_envio_item_id
        join public.panol_envios e on e.id=mi.envio_id
        where s.id=v.snapshot_fisico and s.obra_id=v.obra_id and s.material_id=v.material_id
          and s.cantidad=v.cantidad and s.stock_sede='Chubut' and s.source='manual'
          and s.purchase_request_item_id is null and s.purchase_request_id is null
          and s.recepcion_estado='recibido' and public.torneria_stock_recibido(s)=v.cantidad
          and mi.id=v.aviso_recibido and mi.obra_snapshot_item_id=s.id and mi.estado='recibido'
          and mi.purchase_request_item_id is null and e.titulo='Tubos de bocina K52'
      ) then raise exception 'Cambió el ingreso ya confirmado de bocina para %', v.obra; end if;
      if exists (
        select 1 from public.torneria_recepciones_panol where snapshot_id=v.snapshot_fisico
      ) then raise exception 'El ingreso de bocina ya está reservado para otro renglón'; end if;

      perform public.panol_marcar_items(array[v.aviso_pendiente],'rechazado',
        v_reutilizado,null);
      update public.panol_envio_items set purchase_request_item_id=v.compra_item
        where id=v.aviso_recibido;
      update public.panol_obra_materiales_snapshot
        set purchase_request_id=v.compra_id, purchase_request_item_id=v.compra_item,
            recepcion_nota=concat_ws(' · ',recepcion_nota,v_reutilizado), updated_at=now()
        where id=v.snapshot_fisico;
      update public.purchase_request_items
        set status='recibido', received_quantity=v.cantidad::text
        where id=v.compra_item;
      perform public.sync_purchase_request_status_from_items(v.compra_id);
    else
      perform public.panol_marcar_items(array[v.aviso_pendiente],'recibido',v_nota,v.cantidad::text);
    end if;

    if not exists (
      select 1 from public.torneria_items i
      join public.panol_obra_materiales_snapshot s on s.id=v.snapshot_fisico
      where i.id=v.item_id and i.compra_estado='recibido_astillero'
        and s.recepcion_estado='recibido' and public.torneria_stock_recibido(s)=v.cantidad
        and s.purchase_request_item_id=v.compra_item
    ) then raise exception 'El ingreso no quedó disponible en el circuito: % %', v.obra, v.descripcion; end if;
  end loop;

  perform 1 from public.torneria_marcar_listo(array(select componente_id from t_regularizar), 'envio', true);
  select jsonb_agg(jsonb_build_object('operacion_id', operacion_id, 'items', items) order by operacion_id) into v_payload
  from (
    select operacion_id, jsonb_agg(jsonb_build_object('operacion_item_id',componente_id,'cantidad',cantidad_viaje) order by componente_id) items
    from t_regularizar group by operacion_id
  ) grupo;
  insert into t_flete values (
    public.torneria_guardar_flete('salida',now(),null,'Torneria',null,v_nota,v_payload)
  );

  if exists (
    select 1 from t_regularizar plan
    join public.torneria_operacion_items oi on oi.id=plan.componente_id
    left join public.panol_obra_materiales_snapshot s on s.id=plan.snapshot_fisico
    where oi.cantidad_enviada is distinct from plan.cantidad_viaje or oi.cantidad_recibida<>0
       or (plan.modo<>'directo' and (s.estado is distinct from 'egresado' or s.cantidad_egresada is distinct from plan.cantidad
         or s.sector_destino is distinct from 'Tornería' or public.torneria_stock_recibido(s)>0))
  ) then raise exception 'La salida no dejó el circuito y el stock en el estado esperado'; end if;
end;
$$;

select f.resultado->>'flete_id' as regularizacion, plan.obra, plan.descripcion, plan.modo,
       plan.cantidad as cantidad_material, oi.cantidad_enviada as cantidad_circuito, oi.cantidad_recibida as regreso,
       s.estado as estado_panol, s.cantidad_egresada as egreso_panol
from t_regularizar plan
join public.torneria_operacion_items oi on oi.id=plan.componente_id
left join public.panol_obra_materiales_snapshot s on s.id=plan.snapshot_fisico
cross join t_flete f
order by plan.obra, plan.descripcion;


rollback;
