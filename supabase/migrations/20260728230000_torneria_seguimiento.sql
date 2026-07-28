-- Seguimiento operativo de materiales de mecanica enviados a Torneria/Plegadora.
-- El modelo separa materiales, operaciones y movimientos porque varias piezas
-- comienzan separadas y luego viajan juntas como un conjunto.

-- El frontend ya contemplaba este rol, pero el enum de la base todavía no.
-- IF NOT EXISTS permite volver a ejecutar la migración sin duplicarlo.
alter type public.user_role add value if not exists 'mecanica';

create or replace function public.is_torneria_viewer(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and (
        coalesce(p.is_admin, false)
        or p.role::text in ('admin', 'oficina', 'tecnica', 'compras', 'mecanica')
      )
  );
$$;

create or replace function public.is_torneria_editor(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_torneria_viewer(p_uid);
$$;

create table if not exists public.torneria_plantillas (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references public.lineas_produccion(id) on delete cascade,
  nombre text not null,
  descripcion text,
  activa boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (linea_id)
);

create table if not exists public.torneria_plantilla_items (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.torneria_plantillas(id) on delete cascade,
  clave text not null,
  grupo text not null,
  descripcion text not null,
  cantidad numeric not null default 1 check (cantidad > 0),
  unidad text not null default 'unidad',
  proveedor_compra text,
  material_id uuid references public.panol_materiales(id) on delete set null,
  solicitado_por_torneria boolean not null default true,
  requiere_confirmacion boolean not null default false,
  alerta text,
  notas text,
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plantilla_id, clave)
);

create table if not exists public.torneria_plantilla_operaciones (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.torneria_plantillas(id) on delete cascade,
  clave text not null,
  grupo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('torneria', 'plegadora', 'astillero', 'otro')),
  viaje integer check (viaje is null or viaje > 0),
  destino_sugerido text,
  descripcion text,
  depende_de text[] not null default '{}',
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plantilla_id, clave)
);

create table if not exists public.torneria_plantilla_operacion_items (
  operacion_id uuid not null references public.torneria_plantilla_operaciones(id) on delete cascade,
  item_id uuid not null references public.torneria_plantilla_items(id) on delete cascade,
  cantidad numeric not null check (cantidad > 0),
  primary key (operacion_id, item_id)
);

create table if not exists public.torneria_procesos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  plantilla_id uuid references public.torneria_plantillas(id) on delete set null,
  nombre text not null,
  estado text not null default 'activo'
    check (estado in ('borrador', 'activo', 'completado', 'pausado', 'cancelado')),
  taller_torneria text not null default 'Torneria',
  taller_plegadora text not null default 'Plegadora',
  responsable text,
  notas text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id)
);

create table if not exists public.torneria_items (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid not null references public.torneria_procesos(id) on delete cascade,
  plantilla_item_id uuid references public.torneria_plantilla_items(id) on delete set null,
  clave text not null,
  grupo text not null,
  descripcion text not null,
  cantidad numeric not null default 1 check (cantidad > 0),
  unidad text not null default 'unidad',
  proveedor_compra text,
  material_id uuid references public.panol_materiales(id) on delete set null,
  solicitado_por_torneria boolean not null default true,
  compra_estado text not null default 'pendiente_solicitud'
    check (compra_estado in (
      'pendiente_solicitud', 'solicitado', 'comprado', 'recibido_astillero', 'no_aplica'
    )),
  requiere_confirmacion boolean not null default false,
  alerta text,
  confirmado_at timestamptz,
  confirmado_por uuid references public.profiles(id) on delete set null,
  notas text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proceso_id, clave)
);

create table if not exists public.torneria_operaciones (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid not null references public.torneria_procesos(id) on delete cascade,
  plantilla_operacion_id uuid references public.torneria_plantilla_operaciones(id) on delete set null,
  clave text not null,
  grupo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('torneria', 'plegadora', 'astillero', 'otro')),
  viaje integer check (viaje is null or viaje > 0),
  destino text,
  descripcion text,
  depende_de text[] not null default '{}',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'parcial', 'recibido', 'cancelado')),
  orden integer not null default 0,
  activa boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proceso_id, clave)
);

create table if not exists public.torneria_operacion_items (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.torneria_operaciones(id) on delete cascade,
  item_id uuid not null references public.torneria_items(id) on delete cascade,
  cantidad_requerida numeric not null check (cantidad_requerida > 0),
  cantidad_enviada numeric not null default 0 check (cantidad_enviada >= 0),
  cantidad_recibida numeric not null default 0 check (cantidad_recibida >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operacion_id, item_id)
);

create table if not exists public.torneria_movimientos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.torneria_operaciones(id) on delete cascade,
  tipo text not null check (tipo in ('salida', 'recepcion')),
  fecha timestamptz not null default now(),
  responsable text,
  destino text,
  remito text,
  notas text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.torneria_movimiento_items (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.torneria_movimientos(id) on delete cascade,
  operacion_item_id uuid not null references public.torneria_operacion_items(id) on delete cascade,
  cantidad numeric not null check (cantidad > 0),
  unique (movimiento_id, operacion_item_id)
);

create table if not exists public.torneria_archivos (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.torneria_movimientos(id) on delete cascade,
  nombre text not null,
  storage_path text not null,
  url text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.torneria_historial (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid references public.torneria_procesos(id) on delete cascade,
  entidad text not null,
  entidad_id uuid,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_torneria_items_proceso
  on public.torneria_items(proceso_id, orden);
create index if not exists idx_torneria_operaciones_proceso
  on public.torneria_operaciones(proceso_id, orden);
create index if not exists idx_torneria_operacion_items_operacion
  on public.torneria_operacion_items(operacion_id);
create index if not exists idx_torneria_movimientos_operacion
  on public.torneria_movimientos(operacion_id, fecha desc);
create index if not exists idx_torneria_historial_proceso
  on public.torneria_historial(proceso_id, created_at desc);

-- Mantener timestamps y usuario de ultima edicion.
create or replace function public.torneria_touch_row()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'torneria_plantillas',
    'torneria_plantilla_items',
    'torneria_plantilla_operaciones',
    'torneria_procesos',
    'torneria_items',
    'torneria_operaciones',
    'torneria_operacion_items',
    'torneria_movimientos'
  ]
  loop
    execute format('drop trigger if exists trg_%I_touch on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_touch before update on public.%I for each row execute function public.torneria_touch_row()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Recalcula los acumulados de una operacion a partir de sus movimientos.
create or replace function public.torneria_recalcular_operacion(p_operacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  update public.torneria_operacion_items oi
     set cantidad_enviada = coalesce((
           select sum(mi.cantidad)
           from public.torneria_movimiento_items mi
           join public.torneria_movimientos m on m.id = mi.movimiento_id
           where mi.operacion_item_id = oi.id and m.tipo = 'salida'
         ), 0),
         cantidad_recibida = coalesce((
           select sum(mi.cantidad)
           from public.torneria_movimiento_items mi
           join public.torneria_movimientos m on m.id = mi.movimiento_id
           where mi.operacion_item_id = oi.id and m.tipo = 'recepcion'
         ), 0),
         updated_at = now()
   where oi.operacion_id = p_operacion_id;

  select case
           when count(*) = 0 then 'pendiente'
           when bool_and(cantidad_recibida >= cantidad_requerida) then 'recibido'
           when bool_or(cantidad_recibida > 0)
             or bool_or(cantidad_enviada > 0 and cantidad_enviada < cantidad_requerida)
             then 'parcial'
           when bool_and(cantidad_enviada >= cantidad_requerida) then 'enviado'
           when bool_or(cantidad_enviada > 0) then 'parcial'
           else 'pendiente'
         end
    into v_estado
    from public.torneria_operacion_items oi
    join public.torneria_items ti on ti.id = oi.item_id and ti.activo
   where oi.operacion_id = p_operacion_id;

  update public.torneria_operaciones
     set estado = coalesce(v_estado, 'pendiente'),
         updated_at = now(),
         updated_by = coalesce(auth.uid(), updated_by)
   where id = p_operacion_id
     and estado <> 'cancelado';
end;
$$;

create or replace function public.torneria_recalcular_desde_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion uuid;
begin
  if old.activo is distinct from new.activo then
    for v_operacion in
      select oi.operacion_id
      from public.torneria_operacion_items oi
      where oi.item_id = new.id
    loop
      perform public.torneria_recalcular_operacion(v_operacion);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_torneria_items_recalcular on public.torneria_items;
create trigger trg_torneria_items_recalcular
after update of activo on public.torneria_items
for each row execute function public.torneria_recalcular_desde_item();

create or replace function public.torneria_recalcular_desde_movimiento_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_op uuid;
  v_new_op uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select m.operacion_id into v_old_op
      from public.torneria_movimientos m
     where m.id = old.movimiento_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select m.operacion_id into v_new_op
      from public.torneria_movimientos m
     where m.id = new.movimiento_id;
  end if;
  if v_old_op is not null then perform public.torneria_recalcular_operacion(v_old_op); end if;
  if v_new_op is not null and v_new_op is distinct from v_old_op then
    perform public.torneria_recalcular_operacion(v_new_op);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_torneria_movimiento_items_recalcular
  on public.torneria_movimiento_items;
create trigger trg_torneria_movimiento_items_recalcular
after insert or update or delete on public.torneria_movimiento_items
for each row execute function public.torneria_recalcular_desde_movimiento_item();

create or replace function public.torneria_recalcular_desde_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.torneria_recalcular_operacion(old.operacion_id);
    return old;
  end if;
  if tg_op = 'UPDATE'
     and (old.operacion_id is distinct from new.operacion_id or old.tipo is distinct from new.tipo) then
    perform public.torneria_recalcular_operacion(old.operacion_id);
    perform public.torneria_recalcular_operacion(new.operacion_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_torneria_movimientos_recalcular
  on public.torneria_movimientos;
create trigger trg_torneria_movimientos_recalcular
after update of operacion_id, tipo or delete on public.torneria_movimientos
for each row execute function public.torneria_recalcular_desde_movimiento();

-- Crea una instancia completa para una obra copiando la plantilla de su linea.
create or replace function public.torneria_crear_proceso(
  p_obra_id uuid,
  p_plantilla_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_linea_id uuid;
  v_linea_nombre text;
  v_plantilla uuid;
  v_proceso uuid;
begin
  if not public.is_torneria_editor(v_uid) then
    raise exception 'Sin permiso para crear seguimientos de torneria';
  end if;

  select linea_id, linea_nombre
    into v_linea_id, v_linea_nombre
    from public.produccion_obras
   where id = p_obra_id;
  if not found then raise exception 'Obra inexistente'; end if;

  select coalesce(
    p_plantilla_id,
    (select id from public.torneria_plantillas where linea_id = v_linea_id and activa limit 1)
  ) into v_plantilla;
  if v_plantilla is null then
    raise exception 'La linea % no tiene plantilla de torneria', coalesce(v_linea_nombre, 'sin asignar');
  end if;

  insert into public.torneria_procesos(
    obra_id, plantilla_id, nombre, estado, created_by, updated_by
  )
  values (
    p_obra_id,
    v_plantilla,
    'Mecanica / Torneria - ' || coalesce(
      (select codigo from public.produccion_obras where id = p_obra_id),
      'Obra'
    ),
    'activo',
    v_uid,
    v_uid
  )
  returning id into v_proceso;

  insert into public.torneria_items(
    proceso_id, plantilla_item_id, clave, grupo, descripcion, cantidad, unidad,
    proveedor_compra, material_id, solicitado_por_torneria, compra_estado,
    requiere_confirmacion, alerta, notas, orden, created_by, updated_by
  )
  select
    v_proceso, pi.id, pi.clave, pi.grupo, pi.descripcion, pi.cantidad, pi.unidad,
    pi.proveedor_compra, pi.material_id, pi.solicitado_por_torneria,
    'pendiente_solicitud', pi.requiere_confirmacion, pi.alerta, pi.notas, pi.orden,
    v_uid, v_uid
  from public.torneria_plantilla_items pi
  where pi.plantilla_id = v_plantilla and pi.activa
  order by pi.orden;

  insert into public.torneria_operaciones(
    proceso_id, plantilla_operacion_id, clave, grupo, nombre, tipo, viaje,
    destino, descripcion, depende_de, orden, created_by, updated_by
  )
  select
    v_proceso, po.id, po.clave, po.grupo, po.nombre, po.tipo, po.viaje,
    case
      when po.tipo = 'torneria' then 'Torneria'
      when po.tipo = 'plegadora' then 'Plegadora'
      else po.destino_sugerido
    end,
    po.descripcion, po.depende_de, po.orden, v_uid, v_uid
  from public.torneria_plantilla_operaciones po
  where po.plantilla_id = v_plantilla and po.activa
  order by po.orden;

  insert into public.torneria_operacion_items(
    operacion_id, item_id, cantidad_requerida
  )
  select
    op.id, it.id, poi.cantidad
  from public.torneria_plantilla_operacion_items poi
  join public.torneria_plantilla_operaciones pop on pop.id = poi.operacion_id
  join public.torneria_plantilla_items pit on pit.id = poi.item_id
  join public.torneria_operaciones op
    on op.proceso_id = v_proceso and op.clave = pop.clave
  join public.torneria_items it
    on it.proceso_id = v_proceso and it.clave = pit.clave
  where pop.plantilla_id = v_plantilla;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  values (
    v_proceso, 'proceso', v_proceso, 'creado',
    jsonb_build_object('obra_id', p_obra_id, 'plantilla_id', v_plantilla),
    v_uid
  );

  return v_proceso;
exception
  when unique_violation then
    raise exception 'La obra ya tiene un seguimiento de torneria';
end;
$$;

-- Alta/edicion transaccional de salidas y recepciones parciales.
create or replace function public.torneria_guardar_movimiento(
  p_movimiento_id uuid,
  p_operacion_id uuid,
  p_tipo text,
  p_fecha timestamptz,
  p_responsable text,
  p_destino text,
  p_remito text,
  p_notas text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_proceso uuid;
begin
  if not public.is_torneria_editor(v_uid) then
    raise exception 'Sin permiso para registrar movimientos';
  end if;
  if p_tipo not in ('salida', 'recepcion') then
    raise exception 'Tipo de movimiento invalido';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Carga al menos una cantidad';
  end if;

  select proceso_id into v_proceso
    from public.torneria_operaciones where id = p_operacion_id;
  if v_proceso is null then raise exception 'Operacion inexistente'; end if;

  if p_movimiento_id is null then
    insert into public.torneria_movimientos(
      operacion_id, tipo, fecha, responsable, destino, remito, notas,
      created_by, updated_by
    )
    values (
      p_operacion_id, p_tipo, coalesce(p_fecha, now()),
      nullif(btrim(p_responsable), ''), nullif(btrim(p_destino), ''),
      nullif(btrim(p_remito), ''), nullif(btrim(p_notas), ''), v_uid, v_uid
    )
    returning id into v_id;
  else
    update public.torneria_movimientos
       set operacion_id = p_operacion_id,
           tipo = p_tipo,
           fecha = coalesce(p_fecha, fecha),
           responsable = nullif(btrim(p_responsable), ''),
           destino = nullif(btrim(p_destino), ''),
           remito = nullif(btrim(p_remito), ''),
           notas = nullif(btrim(p_notas), ''),
           updated_by = v_uid
     where id = p_movimiento_id
     returning id into v_id;
    if v_id is null then raise exception 'Movimiento inexistente'; end if;
    delete from public.torneria_movimiento_items where movimiento_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item ->> 'cantidad')::numeric, 0) <= 0 then
      continue;
    end if;
    if not exists (
      select 1
      from public.torneria_operacion_items oi
      where oi.id = (v_item ->> 'operacion_item_id')::uuid
        and oi.operacion_id = p_operacion_id
    ) then
      raise exception 'Uno de los componentes no pertenece a la operacion';
    end if;
    insert into public.torneria_movimiento_items(
      movimiento_id, operacion_item_id, cantidad
    )
    values (
      v_id,
      (v_item ->> 'operacion_item_id')::uuid,
      (v_item ->> 'cantidad')::numeric
    );
  end loop;

  if not exists (
    select 1 from public.torneria_movimiento_items where movimiento_id = v_id
  ) then
    raise exception 'Carga al menos una cantidad mayor que cero';
  end if;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  values (
    v_proceso, 'movimiento', v_id,
    case when p_movimiento_id is null then 'creado' else 'editado' end,
    jsonb_build_object('tipo', p_tipo, 'operacion_id', p_operacion_id, 'items', p_items),
    v_uid
  );

  perform public.torneria_recalcular_operacion(p_operacion_id);
  return v_id;
end;
$$;

-- Auditoria para ediciones de proceso, materiales y circuito.
create or replace function public.torneria_auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proceso uuid;
  v_entidad_id uuid;
  v_detalle jsonb;
begin
  if tg_op = 'INSERT' then
    v_entidad_id := new.id;
    v_detalle := jsonb_build_object('nuevo', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    v_entidad_id := new.id;
    v_detalle := jsonb_build_object('anterior', to_jsonb(old), 'nuevo', to_jsonb(new));
  else
    v_entidad_id := old.id;
    v_detalle := jsonb_build_object('anterior', to_jsonb(old));
  end if;

  if tg_table_name = 'torneria_procesos' then
    v_proceso := v_entidad_id;
  elsif tg_op = 'DELETE' then
    v_proceso := old.proceso_id;
  else
    v_proceso := new.proceso_id;
  end if;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  values (
    v_proceso,
    replace(tg_table_name, 'torneria_', ''),
    v_entidad_id,
    lower(tg_op),
    v_detalle,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_torneria_procesos_audit on public.torneria_procesos;
create trigger trg_torneria_procesos_audit
after update on public.torneria_procesos
for each row execute function public.torneria_auditar_cambio();

drop trigger if exists trg_torneria_items_audit on public.torneria_items;
create trigger trg_torneria_items_audit
after insert or update or delete on public.torneria_items
for each row execute function public.torneria_auditar_cambio();

drop trigger if exists trg_torneria_operaciones_audit on public.torneria_operaciones;
create trigger trg_torneria_operaciones_audit
after insert or update or delete on public.torneria_operaciones
for each row execute function public.torneria_auditar_cambio();

-- RLS
alter table public.torneria_plantillas enable row level security;
alter table public.torneria_plantilla_items enable row level security;
alter table public.torneria_plantilla_operaciones enable row level security;
alter table public.torneria_plantilla_operacion_items enable row level security;
alter table public.torneria_procesos enable row level security;
alter table public.torneria_items enable row level security;
alter table public.torneria_operaciones enable row level security;
alter table public.torneria_operacion_items enable row level security;
alter table public.torneria_movimientos enable row level security;
alter table public.torneria_movimiento_items enable row level security;
alter table public.torneria_archivos enable row level security;
alter table public.torneria_historial enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'torneria_plantillas',
    'torneria_plantilla_items',
    'torneria_plantilla_operaciones',
    'torneria_plantilla_operacion_items',
    'torneria_procesos',
    'torneria_items',
    'torneria_operaciones',
    'torneria_operacion_items',
    'torneria_movimientos',
    'torneria_movimiento_items',
    'torneria_archivos',
    'torneria_historial'
  ]
  loop
    execute format('drop policy if exists "torneria lectura" on public.%I', table_name);
    execute format(
      'create policy "torneria lectura" on public.%I for select to authenticated using (public.is_torneria_viewer(auth.uid()))',
      table_name
    );
    execute format('drop policy if exists "torneria alta" on public.%I', table_name);
    execute format(
      'create policy "torneria alta" on public.%I for insert to authenticated with check (public.is_torneria_editor(auth.uid()))',
      table_name
    );
    execute format('drop policy if exists "torneria edicion" on public.%I', table_name);
    execute format(
      'create policy "torneria edicion" on public.%I for update to authenticated using (public.is_torneria_editor(auth.uid())) with check (public.is_torneria_editor(auth.uid()))',
      table_name
    );
    execute format('drop policy if exists "torneria baja" on public.%I', table_name);
    execute format(
      'create policy "torneria baja" on public.%I for delete to authenticated using (public.is_torneria_editor(auth.uid()))',
      table_name
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.torneria_plantillas,
  public.torneria_plantilla_items,
  public.torneria_plantilla_operaciones,
  public.torneria_plantilla_operacion_items,
  public.torneria_procesos,
  public.torneria_items,
  public.torneria_operaciones,
  public.torneria_operacion_items,
  public.torneria_movimientos,
  public.torneria_movimiento_items,
  public.torneria_archivos,
  public.torneria_historial
to authenticated;
grant execute on function public.torneria_crear_proceso(uuid, uuid) to authenticated;
grant execute on function public.torneria_guardar_movimiento(
  uuid, uuid, text, timestamptz, text, text, text, text, jsonb
) to authenticated;

-- Documentos y fotos de remitos.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists "torneria documentos insert" on storage.objects;
create policy "torneria documentos insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'torneria'
    and public.is_torneria_editor(auth.uid())
  );

drop policy if exists "torneria documentos select" on storage.objects;
create policy "torneria documentos select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'torneria'
    and public.is_torneria_viewer(auth.uid())
  );

drop policy if exists "torneria documentos delete" on storage.objects;
create policy "torneria documentos delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'torneria'
    and public.is_torneria_editor(auth.uid())
  );

-- Plantillas base de las lineas relevadas en "Procesos torneria.xlsx".
insert into public.torneria_plantillas(linea_id, nombre, descripcion)
select
  l.id,
  'Circuito de Torneria ' || upper(l.nombre),
  case
    when upper(l.nombre) = 'K55'
      then 'Circuito K55: nucleo y brida de bocina vuelven soldados; luego se incorporan las cachas.'
    else 'Circuito estandar de mecanica con pasos en Torneria y Plegadora.'
  end
from public.lineas_produccion l
where upper(l.nombre) in ('K37', 'K42', 'K43', 'K52', 'K64', 'K55')
on conflict (linea_id) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    updated_at = now();

-- Materiales estandar.
with standard_items(clave, grupo, descripcion, cantidad, unidad, proveedor, confirmacion, alerta, notas, orden) as (
  values
    ('nucleo_pata', 'Pata de gallo', 'Nucleo de pata de gallo', 2::numeric, 'unidad', 'Centriaceros', false, null, null, 10),
    ('cachas_pata', 'Pata de gallo', 'Cachas de pata de gallo', 4::numeric, 'unidad', 'Famiq', false, null, 'Primero van a Plegadora.', 20),
    ('palma_pata', 'Pata de gallo', 'Palma de pata de gallo', 2::numeric, 'unidad', 'Famiq', false, null, null, 30),
    ('eje', 'Pata de gallo', 'Eje', 2::numeric, 'unidad', 'Famiq', false, null, 'La medida se puede ajustar por obra.', 40),
    ('pala_timon', 'Timon', 'Pala de timon', 2::numeric, 'unidad', 'Famiq', false, null, null, 50),
    ('mecha_timon', 'Timon', 'Mecha de timon', 2::numeric, 'unidad', 'Famiq', false, null, null, 60),
    ('brida_limera', 'Limera', 'Brida de limera', 2::numeric, 'unidad', 'Inoxalum', false, null, null, 70),
    ('cano_limera', 'Limera', 'Cano de limera', 1::numeric, 'unidad', 'Famiq', false, null, null, 80),
    ('brida_escape', 'Escape', 'Brida de salida de escape', 2::numeric, 'unidad', 'Inoxalum', false, null, null, 90),
    ('tubo_bocina', 'Bocina', 'Tubo de bocina', 2::numeric, 'unidad', 'Merplast', false, null, null, 100),
    ('bulones_manchon', 'Manchon', 'Bulones de manchon', 1::numeric, 'lote', 'Rebollar', false, null, null, 110),
    ('bronces_torneria', 'Manchon', 'Bronces de torneria: bujes, brazos y manchones', 1::numeric, 'lote', null, false, null, 'Los solicita Torneria y los compra Compras.', 120)
)
insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad, proveedor_compra,
  requiere_confirmacion, alerta, notas, orden
)
select p.id, i.clave, i.grupo, i.descripcion, i.cantidad, i.unidad, i.proveedor,
       i.confirmacion, i.alerta, i.notas, i.orden
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join standard_items i
where upper(l.nombre) in ('K37', 'K42', 'K43', 'K52', 'K64')
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = excluded.cantidad,
    unidad = excluded.unidad,
    proveedor_compra = excluded.proveedor_compra,
    requiere_confirmacion = excluded.requiere_confirmacion,
    alerta = excluded.alerta,
    notas = excluded.notas,
    orden = excluded.orden,
    updated_at = now();

-- Materiales K55. El eje queda deliberadamente sin resolver: el Excel indica
-- 2 3/4 para K55/3 y 2 1/4 para K55/4.
with k55_items(clave, grupo, descripcion, cantidad, unidad, proveedor, confirmacion, alerta, notas, orden) as (
  values
    ('nucleo_pata', 'Pata de gallo', 'Nucleo de pata de gallo', 4::numeric, 'unidad', 'Centriaceros', false, null, null, 10),
    ('cachas_pata', 'Pata de gallo', 'Cachas de pata de gallo', 4::numeric, 'unidad', 'Famiq', false, null, 'Primero van a Plegadora.', 20),
    ('palma_pata', 'Pata de gallo', 'Palma de pata de gallo', 2::numeric, 'unidad', 'Famiq', false, null, null, 30),
    ('brida_bocina', 'Pata de gallo', 'Brida de bocina', 2::numeric, 'unidad', 'Inoxalum', false, null, 'Vuelve soldada con dos nucleos de pata de gallo.', 40),
    ('eje', 'Pata de gallo', 'Eje K55 - medida a confirmar', 2::numeric, 'unidad', 'Famiq', true, 'K55/3 figura 2 3/4 y K55/4 figura 2 1/4.', 'Editar la descripcion con la medida correcta y confirmar antes de enviarlo.', 50),
    ('pala_timon', 'Timon', 'Pala de timon', 2::numeric, 'unidad', 'Famiq', false, null, null, 60),
    ('mecha_timon', 'Timon', 'Mecha de timon 2 1/2', 2::numeric, 'unidad', 'Famiq', false, null, null, 70),
    ('brida_limera', 'Limera', 'Brida de limera', 2::numeric, 'unidad', 'Inoxalum', false, null, null, 80),
    ('cano_limera', 'Limera', 'Cano de limera', 1::numeric, 'unidad', 'Famiq', false, null, null, 90),
    ('brida_escape', 'Escape', 'Brida de salida de escape', 2::numeric, 'unidad', 'Inoxalum', false, null, null, 100),
    ('bulones_manchon', 'Manchon', 'Bulones de manchon', 1::numeric, 'lote', 'Rebollar', false, null, null, 110),
    ('bronces_torneria', 'Manchon', 'Bronces de torneria: bujes, brazos y manchones', 1::numeric, 'lote', null, false, null, 'Los solicita Torneria y los compra Compras.', 120)
)
insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad, proveedor_compra,
  requiere_confirmacion, alerta, notas, orden
)
select p.id, i.clave, i.grupo, i.descripcion, i.cantidad, i.unidad, i.proveedor,
       i.confirmacion, i.alerta, i.notas, i.orden
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join k55_items i
where upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = excluded.cantidad,
    unidad = excluded.unidad,
    proveedor_compra = excluded.proveedor_compra,
    requiere_confirmacion = excluded.requiere_confirmacion,
    alerta = excluded.alerta,
    notas = excluded.notas,
    orden = excluded.orden,
    updated_at = now();

-- Operaciones estandar.
with standard_ops(clave, grupo, nombre, tipo, viaje, destino, descripcion, deps, orden) as (
  values
    ('pata_nucleo_t1', 'Pata de gallo', 'Mecanizar nucleos', 'torneria', 1, 'Torneria', 'Primera salida de los nucleos.', array[]::text[], 10),
    ('pata_cachas_plegadora', 'Pata de gallo', 'Plegar cachas', 'plegadora', 1, 'Plegadora', 'Las cachas salen y vuelven al astillero.', array[]::text[], 20),
    ('pata_conjunto_t2', 'Pata de gallo', 'Nucleos y cachas juntos', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto.', array['pata_nucleo_t1','pata_cachas_plegadora'], 30),
    ('pata_palma_t1', 'Pata de gallo', 'Mecanizar palmas', 'torneria', 1, 'Torneria', null, array[]::text[], 40),
    ('pata_eje_t1', 'Pata de gallo', 'Mecanizar ejes', 'torneria', 1, 'Torneria', null, array[]::text[], 50),
    ('timon_pala_t1', 'Timon', 'Mecanizar palas', 'torneria', 1, 'Torneria', null, array[]::text[], 60),
    ('timon_mecha_t1', 'Timon', 'Mecanizar mechas', 'torneria', 1, 'Torneria', null, array[]::text[], 70),
    ('timon_conjunto_t2', 'Timon', 'Pala y mecha juntas', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto de timon.', array['timon_pala_t1','timon_mecha_t1'], 80),
    ('limera_brida_t1', 'Limera', 'Mecanizar bridas', 'torneria', 1, 'Torneria', null, array[]::text[], 90),
    ('limera_cano_t1', 'Limera', 'Mecanizar cano', 'torneria', 1, 'Torneria', null, array[]::text[], 100),
    ('limera_conjunto_t2', 'Limera', 'Brida y cano juntos', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto de limera.', array['limera_brida_t1','limera_cano_t1'], 110),
    ('escape_t1', 'Escape', 'Mecanizar bridas de escape', 'torneria', 1, 'Torneria', null, array[]::text[], 120),
    ('bocina_t1', 'Bocina', 'Mecanizar tubos de bocina', 'torneria', 1, 'Torneria', null, array[]::text[], 130),
    ('manchon_t1', 'Manchon', 'Preparar conjunto de manchon', 'torneria', 1, 'Torneria', 'Incluye los insumos de bronce solicitados por Torneria.', array[]::text[], 140)
)
insert into public.torneria_plantilla_operaciones(
  plantilla_id, clave, grupo, nombre, tipo, viaje, destino_sugerido,
  descripcion, depende_de, orden
)
select p.id, o.clave, o.grupo, o.nombre, o.tipo, o.viaje, o.destino,
       o.descripcion, o.deps, o.orden
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join standard_ops o
where upper(l.nombre) in ('K37', 'K42', 'K43', 'K52', 'K64')
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    viaje = excluded.viaje,
    destino_sugerido = excluded.destino_sugerido,
    descripcion = excluded.descripcion,
    depende_de = excluded.depende_de,
    orden = excluded.orden,
    updated_at = now();

-- Operaciones K55.
with k55_ops(clave, grupo, nombre, tipo, viaje, destino, descripcion, deps, orden) as (
  values
    ('pata_nucleo_bocina_t1', 'Pata de gallo', 'Soldar nucleos y bridas de bocina', 'torneria', 1, 'Torneria', 'Vuelven dos conjuntos con dos nucleos y una brida cada uno.', array[]::text[], 10),
    ('pata_cachas_plegadora', 'Pata de gallo', 'Plegar cachas', 'plegadora', 1, 'Plegadora', 'Las cachas salen y vuelven al astillero.', array[]::text[], 20),
    ('pata_conjunto_t2', 'Pata de gallo', 'Conjunto soldado y cachas', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto K55.', array['pata_nucleo_bocina_t1','pata_cachas_plegadora'], 30),
    ('pata_palma_t1', 'Pata de gallo', 'Mecanizar palmas', 'torneria', 1, 'Torneria', null, array[]::text[], 40),
    ('pata_eje_t1', 'Pata de gallo', 'Mecanizar ejes', 'torneria', 1, 'Torneria', 'Confirmar medida antes de la salida.', array[]::text[], 50),
    ('timon_pala_t1', 'Timon', 'Mecanizar palas', 'torneria', 1, 'Torneria', null, array[]::text[], 60),
    ('timon_mecha_t1', 'Timon', 'Mecanizar mechas', 'torneria', 1, 'Torneria', null, array[]::text[], 70),
    ('timon_conjunto_t2', 'Timon', 'Pala y mecha juntas', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto de timon.', array['timon_pala_t1','timon_mecha_t1'], 80),
    ('limera_brida_t1', 'Limera', 'Mecanizar bridas', 'torneria', 1, 'Torneria', null, array[]::text[], 90),
    ('limera_cano_t1', 'Limera', 'Mecanizar cano', 'torneria', 1, 'Torneria', null, array[]::text[], 100),
    ('limera_conjunto_t2', 'Limera', 'Brida y cano juntos', 'torneria', 2, 'Torneria', 'Segunda salida del conjunto de limera.', array['limera_brida_t1','limera_cano_t1'], 110),
    ('escape_t1', 'Escape', 'Mecanizar bridas de escape', 'torneria', 1, 'Torneria', null, array[]::text[], 120),
    ('manchon_t1', 'Manchon', 'Preparar conjunto de manchon', 'torneria', 1, 'Torneria', 'Incluye los insumos de bronce solicitados por Torneria.', array[]::text[], 130)
)
insert into public.torneria_plantilla_operaciones(
  plantilla_id, clave, grupo, nombre, tipo, viaje, destino_sugerido,
  descripcion, depende_de, orden
)
select p.id, o.clave, o.grupo, o.nombre, o.tipo, o.viaje, o.destino,
       o.descripcion, o.deps, o.orden
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join k55_ops o
where upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    viaje = excluded.viaje,
    destino_sugerido = excluded.destino_sugerido,
    descripcion = excluded.descripcion,
    depende_de = excluded.depende_de,
    orden = excluded.orden,
    updated_at = now();

-- Relacion operacion/material para lineas estandar.
with links(op_clave, item_clave) as (
  values
    ('pata_nucleo_t1', 'nucleo_pata'),
    ('pata_cachas_plegadora', 'cachas_pata'),
    ('pata_conjunto_t2', 'nucleo_pata'),
    ('pata_conjunto_t2', 'cachas_pata'),
    ('pata_palma_t1', 'palma_pata'),
    ('pata_eje_t1', 'eje'),
    ('timon_pala_t1', 'pala_timon'),
    ('timon_mecha_t1', 'mecha_timon'),
    ('timon_conjunto_t2', 'pala_timon'),
    ('timon_conjunto_t2', 'mecha_timon'),
    ('limera_brida_t1', 'brida_limera'),
    ('limera_cano_t1', 'cano_limera'),
    ('limera_conjunto_t2', 'brida_limera'),
    ('limera_conjunto_t2', 'cano_limera'),
    ('escape_t1', 'brida_escape'),
    ('bocina_t1', 'tubo_bocina'),
    ('manchon_t1', 'bulones_manchon'),
    ('manchon_t1', 'bronces_torneria')
)
insert into public.torneria_plantilla_operacion_items(operacion_id, item_id, cantidad)
select po.id, pi.id, pi.cantidad
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
join public.torneria_plantilla_operaciones po on po.plantilla_id = p.id
join links x on x.op_clave = po.clave
join public.torneria_plantilla_items pi
  on pi.plantilla_id = p.id and pi.clave = x.item_clave
where upper(l.nombre) in ('K37', 'K42', 'K43', 'K52', 'K64')
on conflict (operacion_id, item_id) do update
set cantidad = excluded.cantidad;

-- Relacion operacion/material para K55.
with links(op_clave, item_clave) as (
  values
    ('pata_nucleo_bocina_t1', 'nucleo_pata'),
    ('pata_nucleo_bocina_t1', 'brida_bocina'),
    ('pata_cachas_plegadora', 'cachas_pata'),
    ('pata_conjunto_t2', 'nucleo_pata'),
    ('pata_conjunto_t2', 'brida_bocina'),
    ('pata_conjunto_t2', 'cachas_pata'),
    ('pata_palma_t1', 'palma_pata'),
    ('pata_eje_t1', 'eje'),
    ('timon_pala_t1', 'pala_timon'),
    ('timon_mecha_t1', 'mecha_timon'),
    ('timon_conjunto_t2', 'pala_timon'),
    ('timon_conjunto_t2', 'mecha_timon'),
    ('limera_brida_t1', 'brida_limera'),
    ('limera_cano_t1', 'cano_limera'),
    ('limera_conjunto_t2', 'brida_limera'),
    ('limera_conjunto_t2', 'cano_limera'),
    ('escape_t1', 'brida_escape'),
    ('manchon_t1', 'bulones_manchon'),
    ('manchon_t1', 'bronces_torneria')
)
insert into public.torneria_plantilla_operacion_items(operacion_id, item_id, cantidad)
select po.id, pi.id, pi.cantidad
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
join public.torneria_plantilla_operaciones po on po.plantilla_id = p.id
join links x on x.op_clave = po.clave
join public.torneria_plantilla_items pi
  on pi.plantilla_id = p.id and pi.clave = x.item_clave
where upper(l.nombre) = 'K55'
on conflict (operacion_id, item_id) do update
set cantidad = excluded.cantidad;
