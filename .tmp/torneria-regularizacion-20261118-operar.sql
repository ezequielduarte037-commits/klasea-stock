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
    join t_regularizar v on v.componente_id=oi.id
    order by oi.id for update of oi;
  perform 1 from public.panol_envio_items ei
    where id in (select aviso_pendiente from t_regularizar union select aviso_recibido from t_regularizar)
    order by id for update;

  if exists (
    select 1 from t_regularizar v
    where not exists (
      select 1 from public.torneria_operacion_items oi
      join public.torneria_operaciones op on op.id=oi.operacion_id
      join public.torneria_items i on i.id=oi.item_id and i.proceso_id=op.proceso_id
      join public.torneria_procesos p on p.id=i.proceso_id
      join public.produccion_obras o on o.id=p.obra_id
      where oi.id=v.componente_id and op.id=v.operacion_id and i.id=v.item_id and p.obra_id=v.obra_id
        and o.codigo=v.obra and o.estado='activa' and p.estado='activo'
        and op.activa and op.tipo='torneria' and op.destino='Torneria'
        and op.origen=case when v.modo='directo' then 'Proveedor' else 'Astillero' end
        and i.activo and not i.no_lleva and not i.es_resultado
        and i.material_id=v.material_id and i.cantidad=v.cantidad
        and i.purchase_request_item_id is not distinct from v.compra_item
        and i.purchase_request_id is not distinct from v.compra_id
        and oi.cantidad_requerida=v.cantidad_viaje and oi.cantidad_enviada=0 and oi.cantidad_recibida=0
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
    select 1 from t_regularizar v
    join public.torneria_operacion_items oi on oi.id=v.componente_id
    left join public.panol_obra_materiales_snapshot s on s.id=v.snapshot_fisico
    where oi.cantidad_enviada is distinct from v.cantidad_viaje or oi.cantidad_recibida<>0
       or (v.modo<>'directo' and (s.estado is distinct from 'egresado' or s.cantidad_egresada is distinct from v.cantidad
         or s.sector_destino is distinct from 'Tornería' or public.torneria_stock_recibido(s)>0))
  ) then raise exception 'La salida no dejó el circuito y el stock en el estado esperado'; end if;
end;
$$;

select f.resultado->>'flete_id' as regularizacion, v.obra, v.descripcion, v.modo,
       v.cantidad as cantidad_material, oi.cantidad_enviada as cantidad_circuito, oi.cantidad_recibida as regreso,
       s.estado as estado_panol, s.cantidad_egresada as egreso_panol
from t_regularizar v
join public.torneria_operacion_items oi on oi.id=v.componente_id
left join public.panol_obra_materiales_snapshot s on s.id=v.snapshot_fisico
cross join t_flete f
order by v.obra, v.descripcion;
