begin;
set local lock_timeout = '4s';
select set_config('request.jwt.claims',
  '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);
do $$
declare
  v_brida constant uuid := '82854aee-4564-438e-8ae8-e24c23b04886';
  v_nucleo constant uuid := '26a1c65c-a1f8-448c-911f-4b4944d97d79';
  v_op_brida constant uuid := '2810b130-d638-4ab9-bb97-09ae551a0130';
  v_mov constant uuid := 'd01c9240-b0b3-4e0a-b83d-bbe63b05b94a';
  v_retiro_brida constant timestamptz := '2026-11-17T16:49:08.084626Z';
  v_recepcion public.torneria_movimientos%rowtype;
  v_detalle jsonb;
begin
  if not public.is_torneria_editor(auth.uid()) then
    raise exception 'Sin permiso para corregir movimientos de Tornería';
  end if;
  perform 1 from public.torneria_operacion_items where id in (v_brida,v_nucleo) order by id for update;
  select * into strict v_recepcion from public.torneria_movimientos where id=v_mov for update;
  if v_recepcion.tipo <> 'recepcion' or v_recepcion.operacion_id <> v_op_brida
    or v_recepcion.flete_id is not null or v_recepcion.created_at <> '2026-11-17T16:49:15.920421Z'
    or exists (select 1 from public.torneria_archivos where movimiento_id=v_mov) then
    raise exception 'El regreso de la brida cambió';
  end if;
  select jsonb_agg(to_jsonb(mi)) into v_detalle from public.torneria_movimiento_items mi where mi.movimiento_id=v_mov;
  if v_detalle is null or jsonb_array_length(v_detalle)<>1
    or v_detalle->0->>'operacion_item_id' <> v_brida::text
    or (v_detalle->0->>'cantidad')::numeric<>2 then
    raise exception 'El regreso ya no corresponde a las dos bridas';
  end if;
  if not exists (
    select 1 from public.torneria_operacion_items oi
    join public.torneria_operaciones op on op.id=oi.operacion_id
    join public.torneria_procesos p on p.id=op.proceso_id
    join public.produccion_obras o on o.id=p.obra_id
    where oi.id=v_brida and o.codigo='55-6' and oi.cantidad_enviada=2 and oi.cantidad_recibida=2
    and oi.listo_retiro_at=v_retiro_brida
  ) or not exists (
    select 1 from public.torneria_operacion_items oi
    join public.torneria_operaciones op on op.id=oi.operacion_id
    join public.torneria_procesos p on p.id=op.proceso_id
    join public.produccion_obras o on o.id=p.obra_id
    where oi.id=v_nucleo and o.codigo='52-27' and oi.cantidad_enviada=2 and oi.cantidad_recibida=0
    and oi.listo_retiro_at='2026-11-17T16:55:10.890723Z'
  ) then raise exception 'El circuito cambió desde la captura'; end if;

  insert into public.torneria_historial(proceso_id,entidad,entidad_id,accion,detalle,actor_id)
  select op.proceso_id,'movimiento',v_mov,'eliminado',
    jsonb_build_object('movimiento',to_jsonb(v_recepcion)||jsonb_build_object('items',v_detalle),
                       'motivo','Se deshace el regreso marcado por error; las dos bridas siguen listas para retirar en Tornería.'),
    auth.uid()
  from public.torneria_operaciones op where op.id=v_op_brida;
  delete from public.torneria_movimientos where id=v_mov;
  perform public.torneria_recalcular_operacion(v_op_brida);
  perform 1 from public.torneria_marcar_listo(array[v_nucleo],'retiro',false);
  if not exists (
    select 1 from public.torneria_operacion_items
    where id=v_brida and cantidad_enviada=2 and cantidad_recibida=0 and listo_retiro_at=v_retiro_brida
  ) or not exists (
    select 1 from public.torneria_operacion_items
    where id=v_nucleo and cantidad_enviada=2 and cantidad_recibida=0 and listo_retiro_at is null
  ) then raise exception 'No se recuperó el estado esperado'; end if;
end $$;
commit;
