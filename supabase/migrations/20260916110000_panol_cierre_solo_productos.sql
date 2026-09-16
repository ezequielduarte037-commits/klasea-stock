-- Un requisito de matriz representa una necesidad generica; no es un producto
-- fisico. El cierre de obra solo puede liberar productos concretos y deja los
-- saldos genericos bloqueados hasta que el operario identifica el SKU real.

begin;

create or replace function public.panol_cierre_requisitos_sin_producto(p_cierre_id uuid)
returns table (
  requisito_material_id uuid,
  descripcion text,
  codigo text,
  unidad text,
  cantidad numeric,
  productos_posibles bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra uuid;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;

  select c.obra_id into v_obra
    from public.panol_obra_cierres c
   where c.id = p_cierre_id;
  if not found then raise exception 'No se encontro la revision'; end if;

  return query
  select
    m.id,
    m.descripcion,
    m.codigo,
    coalesce(m.unidad_medida, 'unidad'),
    round(sum(public.panol_stock_movimiento_delta(
      s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
    ))::numeric, 3) as cantidad,
    (
      select count(*)
        from public.panol_requisito_productos rp
        join public.panol_materiales producto
          on producto.id = rp.producto_material_id
         and producto.activo is distinct from false
         and producto.es_requisito is distinct from true
       where rp.requisito_material_id = m.id
         and rp.activo
    ) as productos_posibles
  from public.panol_obra_materiales_snapshot s
  join public.panol_materiales m
    on m.id = s.material_id
   and m.es_requisito
  where s.obra_id = v_obra
    and not public.panol_cierre_snapshot_anulado(
      s.notas, s.egreso_nota, s.source, s.stock_nota
    )
  group by m.id, m.descripcion, m.codigo, m.unidad_medida
  having sum(public.panol_stock_movimiento_delta(
    s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
  )) > 0.0001
  order by m.descripcion, m.id;
end;
$$;

comment on function public.panol_cierre_requisitos_sin_producto(uuid) is
  'Lista saldo fisico de una obra que aun esta registrado contra requisitos genericos de matriz.';

create or replace function public.panol_cierre_identificar_producto(
  p_cierre_id uuid,
  p_requisito_material_id uuid,
  p_producto_material_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre public.panol_obra_cierres%rowtype;
  v_requisito public.panol_materiales%rowtype;
  v_producto public.panol_materiales%rowtype;
  v_saldo record;
  v_total numeric := 0;
  v_nota text;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para identificar productos del cierre';
  end if;

  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;
  if not found then raise exception 'No se encontro la revision'; end if;
  if v_cierre.estado = 'conciliada' then
    raise exception 'La revision ya esta cerrada';
  end if;

  select * into v_requisito
    from public.panol_materiales
   where id = p_requisito_material_id
     and es_requisito;
  if not found then raise exception 'El item elegido no es un requisito de matriz'; end if;

  select * into v_producto
    from public.panol_materiales
   where id = p_producto_material_id
     and activo is distinct from false
     and es_requisito is distinct from true;
  if not found then raise exception 'Elegir un producto concreto activo'; end if;

  if not exists (
    select 1
      from public.panol_requisito_productos rp
     where rp.requisito_material_id = p_requisito_material_id
       and rp.producto_material_id = p_producto_material_id
       and rp.activo
  ) then
    raise exception 'El producto elegido no corresponde al requisito %', v_requisito.descripcion;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', v_cierre.obra_id::text, p_requisito_material_id::text, 'cierre_producto'), 0
  ));

  -- La reclasificacion se hace por sede para conservar la ubicacion real. La
  -- salida generica y la entrada concreta tienen el mismo valor y se compensan.
  for v_saldo in
    select
      nullif(btrim(coalesce(s.stock_sede, e.sede, '')), '') as sede,
      round(sum(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
      ))::numeric, 3) as cantidad
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.obra_id = v_cierre.obra_id
      and s.material_id = p_requisito_material_id
      and not public.panol_cierre_snapshot_anulado(
        s.notas, s.egreso_nota, s.source, s.stock_nota
      )
    group by 1
    having sum(public.panol_stock_movimiento_delta(
      s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
    )) > 0.0001
  loop
    v_nota := concat(
      'Identificacion en cierre de obra: ', v_requisito.descripcion,
      ' -> ', v_producto.descripcion
    );

    insert into public.panol_obra_materiales_snapshot (
      obra_id, obra_origen_id, material_id, requisito_material_id,
      descripcion, codigo, cantidad, cantidad_egresada, unidad, proveedor,
      tipo, tipo_label, notas, source, estado, recepcion_estado,
      recepcion_updated_at, stock_sede, stock_nota, egreso_at, egreso_por,
      egreso_nota, producto_asignado_at, producto_asignado_por,
      producto_asignacion_origen
    ) values (
      v_cierre.obra_id, v_cierre.obra_id, v_requisito.id, v_requisito.id,
      v_requisito.descripcion, v_requisito.codigo, v_saldo.cantidad,
      v_saldo.cantidad, coalesce(v_requisito.unidad_medida, 'unidad'),
      v_requisito.proveedor, 'reclasificacion', 'Identificacion de sobrante',
      v_nota, 'reclasificacion_egreso', 'egresado', 'egresado', now(),
      v_saldo.sede, v_nota, now(), v_uid, v_nota, now(), v_uid,
      'panol_reclasificacion'
    );

    insert into public.panol_obra_materiales_snapshot (
      obra_id, obra_origen_id, material_id, requisito_material_id,
      descripcion, codigo, cantidad, unidad, proveedor,
      tipo, tipo_label, precio_unitario, moneda, notas, source,
      estado, recepcion_estado, recepcion_updated_at, stock_sede,
      stock_nota, producto_asignado_at, producto_asignado_por,
      producto_asignacion_origen
    ) values (
      v_cierre.obra_id, v_cierre.obra_id, v_producto.id, v_requisito.id,
      v_producto.descripcion, v_producto.codigo, v_saldo.cantidad,
      coalesce(v_producto.unidad_medida, v_requisito.unidad_medida, 'unidad'),
      v_producto.proveedor, 'reclasificacion', 'Producto concreto identificado',
      v_producto.precio_unitario, v_producto.moneda, v_nota,
      'reclasificacion_ingreso', 'en_panol', 'recibido', now(),
      v_saldo.sede, v_nota, now(), v_uid, 'panol_reclasificacion'
    );

    v_total := v_total + v_saldo.cantidad;
  end loop;

  if v_total <= 0.0001 then
    raise exception 'El requisito ya no tiene saldo pendiente de identificar';
  end if;

  perform public.panol_cierre_registrar_evento(
    p_cierre_id,
    'producto_identificado',
    jsonb_build_object(
      'requisito_material_id', v_requisito.id,
      'requisito', v_requisito.descripcion,
      'producto_material_id', v_producto.id,
      'producto', v_producto.descripcion,
      'cantidad', v_total
    )
  );
  perform public.panol_cierre_refrescar_items(p_cierre_id);

  return jsonb_build_object(
    'requisito_material_id', v_requisito.id,
    'producto_material_id', v_producto.id,
    'cantidad', v_total
  );
end;
$$;

comment on function public.panol_cierre_identificar_producto(uuid, uuid, uuid) is
  'Reclasifica el saldo generico de una obra al producto concreto elegido sin cambiar el stock total.';

create or replace function public.panol_cierre_recalcular_cabecera(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panol_obra_cierres c
     set items_total = coalesce(s.total, 0),
         items_pendientes = coalesce(s.pendientes, 0)
    from (
      select
        count(*)::int as total,
        count(*) filter (
          where i.estado in ('pendiente', 'parcial')
             or coalesce(i.cantidad_pendiente, 0) > 0.0001
        )::int as pendientes
      from public.panol_obra_cierre_items i
      join public.panol_materiales m
        on m.id = i.material_id
       and m.es_requisito is distinct from true
      where i.cierre_id = p_cierre_id
        and i.tipo_origen = 'reservado'
        and (
          coalesce(i.cantidad_reservada, 0) > 0.0001
          or coalesce(i.cantidad_recibida, 0) > 0.0001
          or coalesce(i.cantidad_aclaracion, 0) > 0.0001
        )
    ) s
   where c.id = p_cierre_id
     and c.estado <> 'conciliada';

  -- Los requisitos genericos no generan un renglon liberable, pero cuentan
  -- como pendientes para que la lista de obras no muestre una revision lista.
  update public.panol_obra_cierres c
     set items_total = c.items_total + coalesce(g.total, 0),
         items_pendientes = c.items_pendientes + coalesce(g.total, 0)
    from (
      select count(*)::int as total
      from (
        select s.material_id
        from public.panol_obra_materiales_snapshot s
        join public.panol_materiales m
          on m.id = s.material_id
         and m.es_requisito
        where s.obra_id = (
          select cierre.obra_id
            from public.panol_obra_cierres cierre
           where cierre.id = p_cierre_id
        )
          and not public.panol_cierre_snapshot_anulado(
            s.notas, s.egreso_nota, s.source, s.stock_nota
          )
        group by s.material_id
        having sum(public.panol_stock_movimiento_delta(
          s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
        )) > 0.0001
      ) pendientes_genericos
    ) g
   where c.id = p_cierre_id
     and c.estado <> 'conciliada';
end;
$$;

create or replace function public.panol_cierre_refrescar_items(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cierre public.panol_obra_cierres%rowtype;
  v_obra uuid;
  v_uid uuid := auth.uid();
begin
  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;

  if not found then raise exception 'No se encontro la revision de materiales'; end if;
  if v_cierre.estado = 'conciliada' then raise exception 'La revision ya esta cerrada'; end if;
  if v_uid is not null and not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para actualizar la revision de materiales';
  end if;

  v_obra := v_cierre.obra_id;

  update public.panol_obra_cierre_items
     set cantidad_reservada = 0
   where cierre_id = p_cierre_id
     and tipo_origen = 'reservado';

  insert into public.panol_obra_cierre_items (
    cierre_id, material_id, descripcion, codigo, unidad, tipo_origen,
    clave_material, cantidad_reservada, sede_sugerida
  )
  select
    p_cierre_id, g.material_id, g.descripcion, g.codigo, g.unidad,
    'reservado', g.clave, g.reservada, g.sede
  from (
    select
      s.material_id::text as clave,
      s.material_id,
      (array_agg(coalesce(nullif(btrim(s.descripcion), ''), '(sin descripcion)')
        order by s.created_at desc))[1] as descripcion,
      (array_agg(nullif(btrim(s.codigo), ''))
        filter (where nullif(btrim(s.codigo), '') is not null))[1] as codigo,
      coalesce(
        (array_agg(nullif(btrim(s.unidad), ''))
          filter (where nullif(btrim(s.unidad), '') is not null))[1],
        'unidad'
      ) as unidad,
      round(sum(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
      ))::numeric, 3) as reservada,
      (array_agg(coalesce(s.stock_sede, e.sede))
        filter (where coalesce(s.stock_sede, e.sede) is not null))[1] as sede
    from public.panol_obra_materiales_snapshot s
    join public.panol_materiales m
      on m.id = s.material_id
     and m.es_requisito is distinct from true
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.obra_id = v_obra
      and not public.panol_cierre_snapshot_anulado(
        s.notas, s.egreso_nota, s.source, s.stock_nota
      )
    group by s.material_id
  ) g
  where g.reservada > 0.0001
  on conflict (cierre_id, tipo_origen, clave_material) do update
    set material_id = excluded.material_id,
        descripcion = excluded.descripcion,
        codigo = coalesce(excluded.codigo, panol_obra_cierre_items.codigo),
        unidad = coalesce(excluded.unidad, panol_obra_cierre_items.unidad),
        cantidad_reservada = excluded.cantidad_reservada,
        sede_sugerida = coalesce(excluded.sede_sugerida, panol_obra_cierre_items.sede_sugerida);

  perform public.panol_cierre_recalcular_item(i.id)
    from public.panol_obra_cierre_items i
   where i.cierre_id = p_cierre_id
     and i.tipo_origen = 'reservado';

  perform public.panol_cierre_recalcular_cabecera(p_cierre_id);
end;
$$;

comment on function public.panol_cierre_refrescar_items(uuid) is
  'Recalcula solamente productos fisicos que siguen en panol; los requisitos genericos se identifican por separado.';

create or replace function public.panol_cierre_conciliar(p_cierre_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre public.panol_obra_cierres%rowtype;
  v_abiertos int;
  v_excepciones int;
  v_sin_producto int;
  v_resumen jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para cerrar la revision';
  end if;

  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;
  if not found then raise exception 'No se encontro la revision'; end if;
  if v_cierre.estado = 'conciliada' then return v_cierre.resumen; end if;

  perform public.panol_cierre_refrescar_items(p_cierre_id);

  select count(*) into v_sin_producto
    from public.panol_cierre_requisitos_sin_producto(p_cierre_id);
  if v_sin_producto > 0 then
    raise exception 'Hay % requisito(s) de matriz sin producto fisico identificado.', v_sin_producto;
  end if;

  select
    count(*) filter (
      where i.estado in ('pendiente', 'parcial')
         or coalesce(i.cantidad_pendiente, 0) > 0.0001
    ),
    count(*) filter (
      where i.estado = 'excepcion' or coalesce(i.cantidad_aclaracion, 0) > 0.0001
    )
  into v_abiertos, v_excepciones
  from public.panol_obra_cierre_items i
  join public.panol_materiales m
    on m.id = i.material_id
   and m.es_requisito is distinct from true
  where i.cierre_id = p_cierre_id
    and i.tipo_origen = 'reservado'
    and (
      coalesce(i.cantidad_reservada, 0) > 0.0001
      or coalesce(i.cantidad_recibida, 0) > 0.0001
      or coalesce(i.cantidad_aclaracion, 0) > 0.0001
    );

  if v_abiertos > 0 then
    raise exception 'Todavia hay % sobrante(s) sin liberar o documentar.', v_abiertos;
  end if;
  if v_excepciones > 0 and not public.panol_cierre_puede_excepcion(v_uid) then
    raise exception 'Hay diferencias documentadas. Debe cerrar la revision un usuario autorizado.';
  end if;

  select jsonb_build_object(
    'liberados', coalesce(sum(i.cantidad_recibida), 0),
    'diferencias', coalesce(sum(i.cantidad_aclaracion), 0),
    'items', count(*)
  )
  into v_resumen
  from public.panol_obra_cierre_items i
  join public.panol_materiales m
    on m.id = i.material_id
   and m.es_requisito is distinct from true
  where i.cierre_id = p_cierre_id
    and i.tipo_origen = 'reservado'
    and (
      coalesce(i.cantidad_reservada, 0) > 0.0001
      or coalesce(i.cantidad_recibida, 0) > 0.0001
      or coalesce(i.cantidad_aclaracion, 0) > 0.0001
    );

  update public.panol_obra_cierres
     set estado = 'conciliada',
         conciliada_at = now(),
         conciliada_por = v_uid,
         resumen = v_resumen,
         items_pendientes = 0
   where id = p_cierre_id;

  perform public.panol_cierre_registrar_evento(p_cierre_id, 'conciliada', v_resumen);
  return v_resumen;
end;
$$;

comment on function public.panol_cierre_conciliar(uuid) is
  'Cierra la revision solo cuando todos los saldos genericos fueron identificados y los productos fisicos resueltos.';

revoke all on function public.panol_cierre_requisitos_sin_producto(uuid) from public, anon, authenticated;
revoke all on function public.panol_cierre_identificar_producto(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.panol_cierre_requisitos_sin_producto(uuid) to authenticated;
grant execute on function public.panol_cierre_identificar_producto(uuid, uuid, uuid) to authenticated;

-- Regenera solamente las revisiones abiertas. Las cerradas conservan su foto
-- historica y sus resoluciones.
do $$
declare
  v_cierre_id uuid;
begin
  for v_cierre_id in
    select id
      from public.panol_obra_cierres
     where estado in ('pendiente', 'en_revision')
     order by id
  loop
    perform public.panol_cierre_refrescar_items(v_cierre_id);
  end loop;
end;
$$;

commit;
