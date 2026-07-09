-- Permite que tecnica cree avisos/envios a panol sin convertirla en manager
-- ni darle permiso de recepcion/egreso.

create or replace function public.can_create_panol_envio(p_sede text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_panol_manager(p_uid)
    or public.can_receive_envio(p_sede, p_uid)
    or exists (
      select 1
      from public.profiles p
      where p.id = p_uid
        and (coalesce(p.is_admin, false) or p.role = 'tecnica')
    )
  );
$$;

grant execute on function public.can_create_panol_envio(text, uuid) to authenticated;

create or replace function public.panol_crear_envio(
  p_titulo text,
  p_sede text,
  p_prioridad text default 'media',
  p_obra_id uuid default null,
  p_destino text default null,
  p_observaciones text default null,
  p_origen text default 'manual',
  p_purchase_request_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_envio uuid;
  v_item_id uuid;
  v_it jsonb;
  v_pri uuid;
  v_snapshot uuid;
  v_precio numeric;
  v_moneda text;
  v_codigo text;
  v_obra_item uuid;
  v_material uuid;
  v_cantidad numeric;
  v_recepcion_estado text;
  v_request_es_adicional boolean := false;
  v_item_es_adicional boolean := false;
begin
  if p_sede not in ('Pampa','Chubut') then
    raise exception 'Sede invalida: %', p_sede;
  end if;

  if not public.can_create_panol_envio(p_sede, v_uid) then
    raise exception 'Sin permiso para crear ingresos a Panol';
  end if;

  if p_purchase_request_id is not null then
    select coalesce(pr.es_adicional, false)
      into v_request_es_adicional
      from public.purchase_requests pr
     where pr.id = p_purchase_request_id;
  end if;

  insert into public.panol_envios(origen, purchase_request_id, titulo, obra_id, sede, destino, prioridad, observaciones, estado, recibido_por, recibido_at, created_by)
  values (
    coalesce(p_origen, 'manual'),
    p_purchase_request_id,
    p_titulo,
    p_obra_id,
    p_sede,
    p_destino,
    coalesce(p_prioridad, 'media'),
    p_observaciones,
    case when p_origen = 'remito' then 'recibido' else 'enviado' end,
    case when p_origen = 'remito' then v_uid else null end,
    case when p_origen = 'remito' then now() else null end,
    v_uid
  )
  returning id into v_envio;

  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_pri := nullif(v_it->>'purchase_request_item_id', '')::uuid;
    v_snapshot := nullif(v_it->>'obra_snapshot_item_id', '')::uuid;
    v_obra_item := coalesce(nullif(v_it->>'obra_id', '')::uuid, p_obra_id);
    v_material := nullif(v_it->>'material_id', '')::uuid;
    v_precio := nullif(v_it->>'precio_unitario', '')::numeric;
    v_moneda := nullif(upper(v_it->>'moneda'), '');
    v_codigo := nullif(upper(btrim(v_it->>'codigo')), '');
    v_recepcion_estado := coalesce(nullif(v_it->>'recepcion_estado', ''), case when p_origen = 'remito' then 'recibido' else 'pendiente' end);
    v_item_es_adicional := coalesce(nullif(v_it->>'es_adicional', '')::boolean, v_request_es_adicional, false);

    if v_pri is not null then
      select coalesce(pr.es_adicional, v_item_es_adicional)
        into v_item_es_adicional
        from public.purchase_request_items pri
        join public.purchase_requests pr on pr.id = pri.request_id
       where pri.id = v_pri;
    end if;

    if v_recepcion_estado not in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado') then
      v_recepcion_estado := 'pendiente';
    end if;

    v_cantidad := null;
    if nullif(v_it->>'cantidad', '') is not null
       and replace(v_it->>'cantidad', ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_cantidad := replace(v_it->>'cantidad', ',', '.')::numeric;
    end if;

    if v_snapshot is null and v_pri is not null then
      select s.id
        into v_snapshot
        from public.panol_obra_materiales_snapshot s
       where s.purchase_request_item_id = v_pri
       order by s.created_at desc
       limit 1;
    end if;

    if v_snapshot is null and (v_obra_item is not null or p_origen = 'remito') then
      insert into public.panol_obra_materiales_snapshot(
        obra_id,
        material_id,
        descripcion,
        codigo,
        cantidad,
        unidad,
        proveedor,
        rubro,
        tipo,
        tipo_label,
        precio_unitario,
        moneda,
        notas,
        source,
        estado,
        purchase_request_id,
        purchase_request_item_id,
        recepcion_estado,
        recepcion_cantidad_recibida,
        recepcion_nota,
        recepcion_updated_at,
        stock_sede,
        stock_nota,
        es_adicional
      )
      values (
        v_obra_item,
        v_material,
        coalesce(nullif(v_it->>'descripcion', ''), '(sin descripcion)'),
        v_codigo,
        v_cantidad,
        coalesce(nullif(v_it->>'unidad', ''), 'unidad'),
        nullif(v_it->>'proveedor', ''),
        nullif(v_it->>'rubro', ''),
        coalesce(
          nullif(v_it->>'tipo', ''),
          case when v_obra_item is null then 'stock_general' when p_origen = 'remito' then 'remito' else 'manual' end
        ),
        coalesce(
          nullif(v_it->>'tipo_label', ''),
          case when v_obra_item is null then 'Stock general' when p_origen = 'remito' then 'Remito' else 'Manual' end
        ),
        v_precio,
        case when v_moneda in ('ARS','USD') then v_moneda else null end,
        nullif(v_it->>'notas', ''),
        coalesce(p_origen, 'manual'),
        'en_panol',
        p_purchase_request_id,
        v_pri,
        v_recepcion_estado,
        case when v_recepcion_estado in ('recibido','parcial') then nullif(v_it->>'cantidad', '') else null end,
        p_observaciones,
        now(),
        p_sede,
        p_titulo,
        v_item_es_adicional
      )
      returning id into v_snapshot;
    end if;

    insert into public.panol_envio_items(
      envio_id, purchase_request_item_id, obra_snapshot_item_id,
      codigo, descripcion, cantidad, unidad, precio_unitario, moneda, estado, cantidad_recibida
    )
    values (
      v_envio,
      v_pri,
      v_snapshot,
      v_codigo,
      coalesce(nullif(v_it->>'descripcion', ''), '(sin descripcion)'),
      v_it->>'cantidad',
      coalesce(nullif(v_it->>'unidad', ''), 'unidad'),
      v_precio,
      case when v_moneda in ('ARS','USD') then v_moneda else null end,
      v_recepcion_estado,
      case when v_recepcion_estado in ('recibido','parcial') then nullif(v_it->>'cantidad', '') else null end
    )
    returning id into v_item_id;

    if v_pri is not null then
      update public.purchase_request_items
         set status = 'en_panol',
             updated_at = now()
       where id = v_pri
         and status in ('pendiente','pedido','comprado');
    end if;

    if v_snapshot is not null then
      update public.panol_obra_materiales_snapshot
         set estado = 'en_panol',
             purchase_request_id = coalesce(p_purchase_request_id, purchase_request_id),
             purchase_request_item_id = coalesce(v_pri, purchase_request_item_id),
             panol_envio_id = v_envio,
             panol_envio_item_id = v_item_id,
             recepcion_estado = v_recepcion_estado,
             recepcion_cantidad_recibida = case when v_recepcion_estado in ('recibido','parcial') then coalesce(nullif(v_it->>'cantidad', ''), recepcion_cantidad_recibida) else recepcion_cantidad_recibida end,
             recepcion_nota = coalesce(p_observaciones, recepcion_nota),
             recepcion_updated_at = now(),
             stock_sede = coalesce(stock_sede, p_sede),
             es_adicional = v_item_es_adicional,
             updated_at = now()
       where id = v_snapshot;
    end if;
  end loop;

  insert into public.panol_envio_eventos(envio_id, tipo, estado_nuevo, nota, actor_id)
  values (v_envio, 'creado', case when p_origen = 'remito' then 'recibido' else 'enviado' end, p_observaciones, v_uid);

  return v_envio;
end;
$$;

grant execute on function public.panol_crear_envio(text,text,text,uuid,text,text,text,uuid,jsonb) to authenticated;
