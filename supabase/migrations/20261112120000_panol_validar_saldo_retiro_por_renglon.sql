begin;

create or replace function public.panol_egresar_obra_materiales(
  p_snapshot_ids uuid[],
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_destino_obra_id uuid default null,
  p_cantidades jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
  v_row record;
  v_ubicacion record;
  v_saldo numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_raw_qty text;
  v_qty numeric;
  v_available numeric;
  v_destino uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if array_length(p_snapshot_ids, 1) is null then return 0; end if;

  -- Las transferencias consumen saldo mediante otro movimiento y dejan
  -- intacto el renglón original. Bloquear las mismas ubicaciones antes de
  -- bloquear renglones serializa el retiro con la transferencia.
  for v_ubicacion in
    select distinct s.material_id, coalesce(s.stock_sede, e.sede, '') as sede, s.obra_id
      from public.panol_obra_materiales_snapshot s
      join public.panol_materiales m on m.id = s.material_id
      left join public.panol_envios e on e.id = s.panol_envio_id
     where s.id = any(p_snapshot_ids)
       and m.activo is distinct from false
       and m.es_requisito is distinct from true
     order by sede, s.obra_id, s.material_id
  loop
    perform public.panol_preparar_stock_producto(
      v_ubicacion.material_id, null, null, v_ubicacion.sede, v_ubicacion.obra_id, 0
    );
  end loop;

  for v_row in
    select s.*, e.sede as envio_sede, m.es_requisito
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    left join public.panol_materiales m on m.id = s.material_id
    where s.id = any(p_snapshot_ids)
    order by s.id
    for update of s
  loop
    if not (
      public.is_panol_manager(v_uid)
      or public.can_receive_envio(coalesce(v_row.envio_sede, v_row.stock_sede), v_uid)
    ) then raise exception 'Sin permiso para egresar uno o más materiales'; end if;
    if v_row.es_requisito then
      raise exception 'El material % requiere elegir un producto concreto antes de egresarlo', v_row.descripcion;
    end if;
    if public.panol_stock_movimiento_delta(
      v_row.source, v_row.estado, v_row.recepcion_estado,
      v_row.cantidad, v_row.cantidad_egresada
    ) <= 0 then
      raise exception 'El material % no tiene stock disponible en este renglón', v_row.descripcion;
    end if;

    v_available := greatest(coalesce(v_row.cantidad, 0), 0);
    v_raw_qty := p_cantidades ->> v_row.id::text;
    if v_raw_qty is null then
      v_qty := v_available;
    elsif replace(v_raw_qty, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_qty := replace(v_raw_qty, ',', '.')::numeric;
    else
      raise exception 'Cantidad inválida para %', v_row.descripcion;
    end if;
    if v_qty <= 0 or v_qty > v_available + 0.000001 then
      raise exception 'Stock insuficiente para %. Disponible: %, solicitado: %', v_row.descripcion, v_available, v_qty;
    end if;

    if v_row.material_id is not null then
      v_saldo := public.panol_stock_disponible_ubicacion(
        v_row.material_id, coalesce(v_row.stock_sede, v_row.envio_sede, ''), v_row.obra_id
      );
      if v_qty > v_saldo + 0.000001 then
        raise exception 'El saldo de % en esta ubicación cambió. Disponible: %, solicitado: %. Actualizá el stock y volvé a intentar.',
          v_row.descripcion, v_saldo, v_qty;
      end if;
    end if;

    v_destino := nullif(p_destino_obra_id, v_row.obra_id);
    if v_qty >= v_available - 0.000001 then
      update public.panol_obra_materiales_snapshot
         set estado = 'egresado',
             obra_origen_id = coalesce(obra_origen_id, obra_id),
             obra_id = coalesce(v_destino, obra_id),
             egreso_destino_obra_id = v_destino,
             egreso_at = now(), egreso_por = v_uid, egreso_nota = v_nota,
             retirado_por = v_retirado, sector_destino = v_sector,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_available,
             updated_at = now()
       where id = v_row.id;
    else
      update public.panol_obra_materiales_snapshot
         set cantidad = v_available - v_qty,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_qty,
             updated_at = now()
       where id = v_row.id;

      -- Es una fila de historial: el descuento ya ocurrió al reducir la fila
      -- original. Por eso su source deliberadamente no comienza con `egreso`.
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, requisito_material_id,
        descripcion, codigo, cantidad, unidad, proveedor, rubro,
        tipo, tipo_label, precio_unitario, moneda, notas, source, orden,
        estado, purchase_request_id, purchase_request_item_id,
        panol_envio_id, panol_envio_item_id, recepcion_estado,
        recepcion_cantidad_recibida, recepcion_nota, recepcion_updated_at,
        egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino,
        egreso_destino_obra_id, cantidad_egresada, stock_sede, stock_nota,
        es_adicional, producto_asignado_at, producto_asignado_por,
        producto_asignacion_origen
      ) values (
        coalesce(v_destino, v_row.obra_id),
        coalesce(v_row.obra_origen_id, v_row.obra_id),
        v_row.material_id, coalesce(v_row.requisito_material_id, v_row.material_id),
        v_row.descripcion, v_row.codigo, v_qty, v_row.unidad, v_row.proveedor, v_row.rubro,
        v_row.tipo, v_row.tipo_label, v_row.precio_unitario, v_row.moneda,
        v_row.notas, 'historial_retiro_parcial', v_row.orden, 'egresado',
        v_row.purchase_request_id, v_row.purchase_request_item_id,
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egresado',
        v_qty::text, v_row.recepcion_nota, now(), now(), v_uid, v_nota,
        v_retirado, v_sector, v_destino, v_qty,
        v_row.stock_sede, v_row.stock_nota, coalesce(v_row.es_adicional, false),
        v_row.producto_asignado_at, v_row.producto_asignado_por,
        v_row.producto_asignacion_origen
      );
    end if;

    v_count := v_count + 1;
    if v_row.panol_envio_id is not null then
      insert into public.panol_envio_eventos(
        envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
      ) values (
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egreso_material',
        v_row.estado, 'egresado',
        concat_ws(' - ', v_nota, case when v_destino is not null then 'Reasignado' end),
        v_uid
      );
    end if;
  end loop;

  return v_count;
end;
$$;

commit;
