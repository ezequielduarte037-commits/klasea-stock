-- Clasificacion de pedidos y movimientos de panol: estandar vs adicional/opcional.

alter table public.purchase_requests
  add column if not exists es_adicional boolean not null default false;

alter table public.panol_obra_materiales_snapshot
  add column if not exists es_adicional boolean not null default false;

create index if not exists idx_purchase_requests_es_adicional
  on public.purchase_requests(es_adicional);

create index if not exists idx_panol_snapshot_es_adicional
  on public.panol_obra_materiales_snapshot(es_adicional);

update public.panol_obra_materiales_snapshot s
   set es_adicional = coalesce(pr.es_adicional, false)
  from public.purchase_requests pr
 where s.purchase_request_id = pr.id
   and s.es_adicional is distinct from coalesce(pr.es_adicional, false);

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

  if not (
    public.is_panol_manager(v_uid)
    or public.can_receive_envio(p_sede, v_uid)
  ) then
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

drop function if exists public.panol_ingresar_stock_general(uuid,text,text,numeric,text,text,text);
drop function if exists public.panol_ingresar_stock_general(uuid,text,text,numeric,text,text,text,boolean);

create or replace function public.panol_ingresar_stock_general(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_nota text default null,
  p_es_adicional boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para ingresar stock general';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

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
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    es_adicional
  )
  values (
    null,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    null,
    'stock_general',
    'Stock general',
    v_material.precio_unitario,
    v_material.moneda,
    nullif(btrim(coalesce(p_nota, '')), ''),
    'stock_general',
    'en_panol',
    'recibido',
    now(),
    v_sede,
    nullif(btrim(coalesce(p_nota, '')), ''),
    coalesce(p_es_adicional, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.panol_ingresar_stock_general(uuid,text,text,numeric,text,text,text,boolean) to authenticated;

drop function if exists public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text);
drop function if exists public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean);

create or replace function public.panol_egresar_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_id uuid default null,
  p_destino_obra_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_es_adicional boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para egresar producto';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
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
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    egreso_at,
    egreso_por,
    egreso_nota,
    retirado_por,
    sector_destino,
    egreso_destino_obra_id,
    cantidad_egresada,
    es_adicional
  )
  values (
    p_obra_id,
    p_obra_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    null,
    'egreso_producto',
    'Egreso manual',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'egreso_producto',
    'egresado',
    'egresado',
    now(),
    v_sede,
    v_nota,
    now(),
    v_uid,
    v_nota,
    v_retirado,
    v_sector,
    p_destino_obra_id,
    p_cantidad,
    coalesce(p_es_adicional, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean) to authenticated;

drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text);
drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean);

create or replace function public.panol_transferir_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_origen_id uuid default null,
  p_obra_destino_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_es_adicional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_egreso uuid;
  v_ingreso uuid;
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_obra_destino_id is null then
    raise exception 'Obra destino requerida';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para transferir producto';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
    tipo,
    tipo_label,
    precio_unitario,
    moneda,
    notas,
    source,
    estado,
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    egreso_at,
    egreso_por,
    egreso_nota,
    retirado_por,
    egreso_destino_obra_id,
    cantidad_egresada,
    es_adicional
  )
  values (
    p_obra_origen_id,
    p_obra_origen_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    'transferencia',
    'Transferencia a obra',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'transferencia_egreso',
    'egresado',
    'egresado',
    now(),
    v_sede,
    v_nota,
    now(),
    v_uid,
    v_nota,
    v_retirado,
    p_obra_destino_id,
    p_cantidad,
    coalesce(p_es_adicional, false)
  )
  returning id into v_egreso;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
    tipo,
    tipo_label,
    precio_unitario,
    moneda,
    notas,
    source,
    estado,
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    es_adicional
  )
  values (
    p_obra_destino_id,
    p_obra_origen_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    'transferencia',
    'Transferencia recibida',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'transferencia_ingreso',
    'en_panol',
    'recibido',
    now(),
    v_sede,
    v_nota,
    coalesce(p_es_adicional, false)
  )
  returning id into v_ingreso;

  return jsonb_build_object('egreso_id', v_egreso, 'ingreso_id', v_ingreso);
end;
$$;

grant execute on function public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean) to authenticated;

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
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_raw_qty text;
  v_qty numeric;
  v_available numeric;
  v_new_id uuid;
begin
  if array_length(p_snapshot_ids, 1) is null then
    return 0;
  end if;

  for v_row in
    select
      s.*,
      e.sede as envio_sede
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.id = any(p_snapshot_ids)
  loop
    if not (
      public.is_panol_manager(v_uid)
      or (coalesce(v_row.envio_sede, v_row.stock_sede) is not null and public.can_receive_envio(coalesce(v_row.envio_sede, v_row.stock_sede), v_uid))
    ) then
      raise exception 'Sin permiso para egresar uno o mas materiales';
    end if;

    if v_row.estado in ('en_panol','recibido','parcial','problema') then
      v_available := greatest(coalesce(v_row.cantidad, 1), 0);
      v_raw_qty := p_cantidades ->> v_row.id::text;
      v_qty := null;
      if v_raw_qty is not null and replace(v_raw_qty, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
        v_qty := replace(v_raw_qty, ',', '.')::numeric;
      end if;

      if v_available <= 0 then
        v_available := 1;
      end if;

      if v_qty is null or v_qty <= 0 or v_qty >= v_available then
        update public.panol_obra_materiales_snapshot
           set estado = 'egresado',
               obra_origen_id = coalesce(obra_origen_id, obra_id),
               obra_id = coalesce(p_destino_obra_id, obra_id),
               egreso_destino_obra_id = p_destino_obra_id,
               egreso_at = now(),
               egreso_por = v_uid,
               egreso_nota = v_nota,
               retirado_por = v_retirado,
               sector_destino = v_sector,
               cantidad_egresada = coalesce(cantidad_egresada, 0) + v_available,
               updated_at = now()
         where id = v_row.id
           and estado <> 'egresado';
      else
        update public.panol_obra_materiales_snapshot
           set cantidad = v_available - v_qty,
               cantidad_egresada = coalesce(cantidad_egresada, 0) + v_qty,
               updated_at = now()
         where id = v_row.id
           and estado <> 'egresado';

        insert into public.panol_obra_materiales_snapshot(
          obra_id,
          obra_origen_id,
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
          orden,
          estado,
          purchase_request_id,
          purchase_request_item_id,
          panol_envio_id,
          panol_envio_item_id,
          recepcion_estado,
          recepcion_cantidad_recibida,
          recepcion_nota,
          recepcion_updated_at,
          egreso_at,
          egreso_por,
          egreso_nota,
          retirado_por,
          sector_destino,
          egreso_destino_obra_id,
          cantidad_egresada,
          stock_sede,
          stock_nota,
          es_adicional
        )
        values (
          coalesce(p_destino_obra_id, v_row.obra_id),
          coalesce(v_row.obra_origen_id, v_row.obra_id),
          v_row.material_id,
          v_row.descripcion,
          v_row.codigo,
          v_qty,
          v_row.unidad,
          v_row.proveedor,
          v_row.rubro,
          v_row.tipo,
          v_row.tipo_label,
          v_row.precio_unitario,
          v_row.moneda,
          v_row.notas,
          'egreso_parcial',
          v_row.orden,
          'egresado',
          v_row.purchase_request_id,
          v_row.purchase_request_item_id,
          v_row.panol_envio_id,
          v_row.panol_envio_item_id,
          v_row.recepcion_estado,
          v_row.recepcion_cantidad_recibida,
          v_row.recepcion_nota,
          v_row.recepcion_updated_at,
          now(),
          v_uid,
          v_nota,
          v_retirado,
          v_sector,
          p_destino_obra_id,
          v_qty,
          v_row.stock_sede,
          v_row.stock_nota,
          coalesce(v_row.es_adicional, false)
        )
        returning id into v_new_id;
      end if;

      v_count := v_count + 1;

      if v_row.panol_envio_id is not null then
        insert into public.panol_envio_eventos(
          envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
        )
        values (
          v_row.panol_envio_id,
          v_row.panol_envio_item_id,
          'egreso_material',
          v_row.estado,
          'egresado',
          concat_ws(' - ', v_nota, case when p_destino_obra_id is not null then 'Reasignado' else null end),
          v_uid
        );
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.panol_egresar_obra_materiales(uuid[],text,text,text,uuid,jsonb) to authenticated;
