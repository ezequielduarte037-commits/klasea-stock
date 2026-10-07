-- Regularizacion temporal de egresos que quedaron sin registrar al iniciar el
-- sistema. Consume directamente el saldo de la misma obra y conserva auditoria.
begin;

create or replace function public.panol_cierre_egresar(
  p_item_id uuid,
  p_cantidad numeric,
  p_sede text,
  p_observacion text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.panol_obra_cierre_items%rowtype;
  v_cierre public.panol_obra_cierres%rowtype;
  v_previa public.panol_obra_cierre_resoluciones%rowtype;
  v_cierre_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_snapshot uuid;
  v_codigo_obra text;
  v_disponible numeric;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para revisar materiales de obra';
  end if;
  if p_cantidad is null or p_cantidad::text in ('NaN', 'Infinity', '-Infinity')
     or p_cantidad <= 0 or p_cantidad <> round(p_cantidad, 3) then
    raise exception 'Ingresá una cantidad mayor a cero con hasta tres decimales';
  end if;
  if v_sede is null or v_sede not in ('Pampa', 'Chubut') then
    raise exception 'Elegí el pañol de origen';
  end if;
  if v_key is null then raise exception 'Falta la clave de la operación'; end if;

  -- Mismo orden que resolver, refrescar y conciliar: cabecera, luego item.
  select cierre_id into v_cierre_id
    from public.panol_obra_cierre_items where id = p_item_id;
  if v_cierre_id is null then raise exception 'No se encontró el material a revisar'; end if;
  select * into v_cierre from public.panol_obra_cierres
   where id = v_cierre_id for update;
  if not found then raise exception 'No se encontró la revisión'; end if;
  select * into v_item from public.panol_obra_cierre_items
   where id = p_item_id for update;
  if not found then raise exception 'No se encontró el material a revisar'; end if;

  -- Una respuesta perdida se puede reintentar sin duplicar la salida, incluso
  -- si entretanto se cerro la revision. Cambiar de accion requiere otra clave.
  select * into v_previa from public.panol_obra_cierre_resoluciones
   where item_id = p_item_id
     and (idempotency_key = v_key or starts_with(idempotency_key, v_key || ':'))
   order by created_at, id limit 1;
  if found then
    if v_previa.tipo = 'utilizado' and v_previa.snapshot_id is not null
       and v_previa.idempotency_key = v_key || ':utilizado'
       and v_previa.cantidad = p_cantidad
       and v_previa.sede = v_sede
       and coalesce(v_previa.observacion, '') = coalesce(v_obs, '')
       and not exists (
         select 1 from public.panol_obra_cierre_resoluciones
          where item_id = p_item_id and id <> v_previa.id
            and (idempotency_key = v_key or starts_with(idempotency_key, v_key || ':'))
       ) then
      return p_item_id;
    end if;
    raise exception 'Este reintento ya registró otra operación. Actualizá la pantalla antes de continuar.';
  end if;

  if v_cierre.estado = 'conciliada' then raise exception 'La revisión ya está cerrada'; end if;
  if v_item.tipo_origen <> 'reservado' or v_item.material_id is null
     or not exists (
       select 1 from public.panol_materiales
        where id = v_item.material_id and es_requisito is distinct from true
     ) then
    raise exception 'Elegí un producto concreto con saldo asignado a esta obra';
  end if;

  perform public.panol_cierre_refrescar_items(v_cierre.id);
  select * into v_item from public.panol_obra_cierre_items where id = p_item_id for update;
  if p_cantidad > v_item.cantidad_pendiente + 0.0001 then
    raise exception 'La cantidad supera lo pendiente (% %)', v_item.cantidad_pendiente, coalesce(v_item.unidad, 'u');
  end if;

  -- Toma los mismos locks de stock que el egreso normal sin reclasificar nada.
  -- Este atajo solo consume el producto concreto de esta obra y esta sede.
  perform public.panol_preparar_stock_producto(
    v_item.material_id, null, null, v_sede, v_cierre.obra_id, 0
  );
  select greatest(coalesce(sum(public.panol_stock_movimiento_delta(
    s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
  )), 0), 0) into v_disponible
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  where s.material_id = v_item.material_id and s.obra_id = v_cierre.obra_id
    and lower(coalesce(s.stock_sede, e.sede, '')) = lower(v_sede)
    and not public.panol_cierre_snapshot_anulado(s.notas, s.egreso_nota, s.source, s.stock_nota);
  if p_cantidad > v_disponible + 0.000001 then
    raise exception 'Stock insuficiente en % para esta obra. Disponible: %', v_sede, v_disponible;
  end if;

  select codigo into v_codigo_obra from public.produccion_obras where id = v_cierre.obra_id;
  v_snapshot := public.panol_egresar_producto(
    p_material_id := v_item.material_id,
    p_cantidad := p_cantidad,
    p_unidad := coalesce(v_item.unidad, 'unidad'),
    p_sede := v_sede,
    p_obra_id := v_cierre.obra_id,
    p_destino_obra_id := null,
    p_nota := concat_ws(' · ', 'Regularización de egreso no registrado', v_codigo_obra, v_obs)
  );
  insert into public.panol_obra_cierre_resoluciones (
    item_id, cierre_id, tipo, cantidad, observacion, usuario_id, snapshot_id, sede, idempotency_key
  ) values (
    p_item_id, v_cierre.id, 'utilizado', p_cantidad, v_obs, v_uid,
    v_snapshot, v_sede, v_key || ':utilizado'
  );
  update public.panol_obra_cierre_items
     set cantidad_utilizada = cantidad_utilizada + p_cantidad,
         observacion = coalesce(v_obs, observacion)
   where id = p_item_id;
  update public.panol_obra_cierres
     set estado = 'en_revision', responsable_id = coalesce(responsable_id, v_uid)
   where id = v_cierre.id;

  -- Stock, resolucion y contadores se guardan juntos o se revierten juntos.
  perform public.panol_cierre_refrescar_items(v_cierre.id);
  perform public.panol_cierre_registrar_evento(v_cierre.id, 'egreso_regularizado',
    jsonb_build_object('item_id', p_item_id, 'snapshot_id', v_snapshot,
      'cantidad', p_cantidad, 'sede', v_sede, 'obra_id', v_cierre.obra_id));
  return p_item_id;
end;
$$;

comment on function public.panol_cierre_egresar(uuid, numeric, text, text, text) is
  'Regulariza un egreso hacia la misma obra desde sobrantes, sin liberar al stock general, con auditoria e idempotencia.';
revoke all on function public.panol_cierre_egresar(uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.panol_cierre_egresar(uuid, numeric, text, text, text) to authenticated;

-- Los egresos regularizados tambien cuentan como material revisado.

create or replace function public.panol_cierre_recalcular_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.panol_obra_cierre_items%rowtype;
  v_bruto numeric;
  v_pendiente numeric;
  v_por_devolver numeric;
  v_estado text;
  v_saldo boolean;
  v_clasificado numeric;
begin
  select * into v_item from public.panol_obra_cierre_items where id = p_item_id;
  if not found then return; end if;

  v_por_devolver := greatest(coalesce(v_item.cantidad_sobrante_declarada, 0), 0);

  if v_item.tipo_origen = 'reservado' then
    -- Liberar baja cantidad_reservada. La aclaración documenta sin liberar.
    v_bruto := greatest(coalesce(v_item.cantidad_reservada, 0), 0);
    v_pendiente := round(greatest(v_bruto - coalesce(v_item.cantidad_aclaracion, 0), 0)::numeric, 3);
    v_clasificado := coalesce(v_item.cantidad_utilizada, 0) + coalesce(v_item.cantidad_recibida, 0) + coalesce(v_item.cantidad_aclaracion, 0);
  else
    v_bruto := greatest(
      coalesce(v_item.cantidad_entregada, 0) - coalesce(v_item.cantidad_devuelta_previa, 0),
      0
    );
    -- Sobrante declarado NO cierra el renglón: queda por devolver.
    v_pendiente := round(greatest(
      v_bruto
        - coalesce(v_item.cantidad_utilizada, 0)
        - coalesce(v_item.cantidad_recibida, 0)
        - coalesce(v_item.cantidad_danada, 0)
        - coalesce(v_item.cantidad_aclaracion, 0)
        - coalesce(v_item.cantidad_sobrante_declarada, 0),
      0
    )::numeric, 3);
    v_clasificado := coalesce(v_item.cantidad_utilizada, 0)
                  + coalesce(v_item.cantidad_recibida, 0)
                  + coalesce(v_item.cantidad_danada, 0)
                  + coalesce(v_item.cantidad_aclaracion, 0)
                  + coalesce(v_item.cantidad_sobrante_declarada, 0);
  end if;

  v_saldo := v_clasificado > 0.0001 or v_bruto <= 0.0001;

  if v_pendiente <= 0.0001 and v_por_devolver > 0.0001 then
    -- Clasificado, pero falta la recepción física del sobrante.
    v_estado := 'parcial';
  elsif v_pendiente <= 0.0001 and coalesce(v_item.cantidad_aclaracion, 0) > 0.0001 and v_bruto > 0.0001
     and coalesce(v_item.cantidad_utilizada, 0)
       + coalesce(v_item.cantidad_recibida, 0)
       + coalesce(v_item.cantidad_danada, 0)
       + coalesce(v_item.cantidad_sobrante_declarada, 0) <= 0.0001 then
    v_estado := 'excepcion';
  elsif v_pendiente <= 0.0001 and v_por_devolver <= 0.0001 then
    v_estado := 'resuelto';
  elsif v_clasificado > 0.0001 then
    v_estado := 'parcial';
  else
    v_estado := 'pendiente';
  end if;

  update public.panol_obra_cierre_items
     set cantidad_pendiente = v_pendiente,
         saldo_conocido = v_saldo,
         estado = v_estado
   where id = p_item_id;
end;
$$;

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
          or coalesce(i.cantidad_utilizada, 0) > 0.0001
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
      or coalesce(i.cantidad_utilizada, 0) > 0.0001
    );

  if v_abiertos > 0 then
    raise exception 'Todavia hay % sobrante(s) sin liberar, egresar o documentar.', v_abiertos;
  end if;
  if v_excepciones > 0 and not public.panol_cierre_puede_excepcion(v_uid) then
    raise exception 'Hay diferencias documentadas. Debe cerrar la revision un usuario autorizado.';
  end if;

  select jsonb_build_object(
    'liberados', coalesce(sum(i.cantidad_recibida), 0),
    'egresados', coalesce(sum(i.cantidad_utilizada), 0),
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
      or coalesce(i.cantidad_utilizada, 0) > 0.0001
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

commit;
