-- Pedidos / Recepcion a Panol - MVP.
-- Idempotente: deja el esquema del modulo de recepcion alineado con el frontend.

alter table public.profiles add column if not exists sede text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_sede_chk'
  ) then
    alter table public.profiles add constraint profiles_sede_chk
      check (sede is null or sede in ('Pampa','Chubut','Ambas'));
  end if;
end $$;

create or replace function public.is_panol_manager(p_uid uuid)
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
      and (coalesce(p.is_admin, false) or p.role in ('admin','compras'))
  );
$$;

create or replace function public.is_panol_viewer(p_uid uuid)
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
      and (coalesce(p.is_admin, false) or p.role in ('admin','compras','tecnica','oficina'))
  );
$$;

create or replace function public.can_see_envio(p_sede text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_panol_viewer(p_uid)
    or exists (
      select 1
      from public.profiles p
      where p.id = p_uid
        and p.role = 'panol'
        and coalesce(p.sede, '') in ('Ambas', p_sede)
    )
  );
$$;

create or replace function public.can_receive_envio(p_sede text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_panol_manager(p_uid) or exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.role = 'panol'
      and coalesce(p.sede, '') in ('Ambas', p_sede)
  );
$$;

create table if not exists public.panol_envios (
  id uuid primary key default gen_random_uuid(),
  origen text not null default 'manual' check (origen in ('compra','manual')),
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  titulo text not null,
  obra_id uuid references public.produccion_obras(id) on delete set null,
  sede text not null check (sede in ('Pampa','Chubut')),
  destino text,
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta','urgente')),
  observaciones text,
  estado text not null default 'enviado'
    check (estado in ('borrador','enviado','en_preparacion','parcial','recibido','cerrado','cancelado')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  recibido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recibido_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.panol_envio_items (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.panol_envios(id) on delete cascade,
  purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  codigo text,
  descripcion text not null,
  cantidad text,
  unidad text default 'unidad',
  precio_unitario numeric,
  moneda text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado')),
  cantidad_recibida text,
  nota text,
  marcado_por uuid references public.profiles(id) on delete set null,
  marcado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.panol_envio_items
  add column if not exists codigo text,
  add column if not exists precio_unitario numeric,
  add column if not exists moneda text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.panol_envio_items'::regclass
      and conname = 'panol_items_moneda_chk'
  ) then
    alter table public.panol_envio_items add constraint panol_items_moneda_chk
      check (moneda is null or moneda in ('ARS','USD'));
  end if;
end $$;

create table if not exists public.panol_envio_eventos (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.panol_envios(id) on delete cascade,
  item_id uuid references public.panol_envio_items(id) on delete cascade,
  tipo text not null,
  estado_anterior text,
  estado_nuevo text,
  nota text,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_panol_envios_sede_estado on public.panol_envios(sede, estado);
create index if not exists idx_panol_envios_pr on public.panol_envios(purchase_request_id) where purchase_request_id is not null;
create index if not exists idx_panol_envio_items_envio on public.panol_envio_items(envio_id);
create index if not exists idx_panol_envio_items_pri on public.panol_envio_items(purchase_request_item_id) where purchase_request_item_id is not null;
create index if not exists idx_panol_items_codigo on public.panol_envio_items(lower(btrim(codigo))) where codigo is not null;
create index if not exists idx_panol_items_precio_desc
  on public.panol_envio_items(lower(btrim(descripcion)), created_at desc)
  where precio_unitario is not null;
create index if not exists idx_panol_eventos_envio on public.panol_envio_eventos(envio_id, created_at desc);

drop trigger if exists trg_panol_envios_updated on public.panol_envios;
create trigger trg_panol_envios_updated
before update on public.panol_envios
for each row execute function public.touch_updated_at();

drop trigger if exists trg_panol_envio_items_updated on public.panol_envio_items;
create trigger trg_panol_envio_items_updated
before update on public.panol_envio_items
for each row execute function public.touch_updated_at();

alter table public.panol_envios enable row level security;
alter table public.panol_envio_items enable row level security;
alter table public.panol_envio_eventos enable row level security;

drop policy if exists "envios select por sede" on public.panol_envios;
create policy "envios select por sede"
  on public.panol_envios for select
  using (public.can_see_envio(sede, auth.uid()));

drop policy if exists "envios insert manager" on public.panol_envios;
create policy "envios insert manager"
  on public.panol_envios for insert
  with check (created_by = auth.uid() and public.is_panol_manager(auth.uid()));

drop policy if exists "envios update manager" on public.panol_envios;
create policy "envios update manager"
  on public.panol_envios for update
  using (public.is_panol_manager(auth.uid()))
  with check (public.is_panol_manager(auth.uid()));

drop policy if exists "envios delete manager" on public.panol_envios;
create policy "envios delete manager"
  on public.panol_envios for delete
  using (public.is_panol_manager(auth.uid()));

drop policy if exists "items select" on public.panol_envio_items;
create policy "items select"
  on public.panol_envio_items for select
  using (
    exists (
      select 1
      from public.panol_envios e
      where e.id = envio_id
        and public.can_see_envio(e.sede, auth.uid())
    )
  );

drop policy if exists "items insert manager" on public.panol_envio_items;
create policy "items insert manager"
  on public.panol_envio_items for insert
  with check (public.is_panol_manager(auth.uid()));

drop policy if exists "items update receptor" on public.panol_envio_items;
create policy "items update receptor"
  on public.panol_envio_items for update
  using (
    exists (
      select 1
      from public.panol_envios e
      where e.id = envio_id
        and public.can_receive_envio(e.sede, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.panol_envios e
      where e.id = envio_id
        and public.can_receive_envio(e.sede, auth.uid())
    )
  );

drop policy if exists "items delete manager" on public.panol_envio_items;
create policy "items delete manager"
  on public.panol_envio_items for delete
  using (public.is_panol_manager(auth.uid()));

drop policy if exists "eventos select" on public.panol_envio_eventos;
create policy "eventos select"
  on public.panol_envio_eventos for select
  using (
    exists (
      select 1
      from public.panol_envios e
      where e.id = envio_id
        and public.can_see_envio(e.sede, auth.uid())
    )
  );

drop policy if exists "eventos insert" on public.panol_envio_eventos;
create policy "eventos insert"
  on public.panol_envio_eventos for insert
  with check (
    exists (
      select 1
      from public.panol_envios e
      where e.id = envio_id
        and public.can_see_envio(e.sede, auth.uid())
    )
  );

create or replace function public.panol_recalc_estado(p_envio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  rec int;
  touched int;
  cur text;
begin
  select estado into cur from public.panol_envios where id = p_envio;
  if cur is null or cur in ('cerrado','cancelado','borrador') then
    return;
  end if;

  select count(*),
         count(*) filter (where estado = 'recibido'),
         count(*) filter (where estado <> 'pendiente')
    into n, rec, touched
  from public.panol_envio_items
  where envio_id = p_envio;

  if n = 0 then
    return;
  end if;

  update public.panol_envios
     set estado = case
                    when rec = n then 'recibido'
                    when touched > 0 then 'parcial'
                    else 'enviado'
                  end,
         recibido_at = case when rec = n then coalesce(recibido_at, now()) else recibido_at end,
         updated_at = now()
   where id = p_envio;
end;
$$;

create or replace function public.log_panol_item_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.panol_envio_eventos(envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id)
    values (new.envio_id, new.id, 'item_estado', old.estado, new.estado, new.nota, coalesce(new.marcado_por, auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_panol_item on public.panol_envio_items;
create trigger trg_log_panol_item
after update on public.panol_envio_items
for each row execute function public.log_panol_item_evento();

create or replace function public.sync_pr_item_on_panol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchase_request_item_id is not null
     and new.estado is distinct from old.estado
     and new.estado = 'recibido' then
    update public.purchase_request_items
       set status = 'recibido',
           updated_at = now()
     where id = new.purchase_request_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_pr_item on public.panol_envio_items;
create trigger trg_sync_pr_item
after update on public.panol_envio_items
for each row execute function public.sync_pr_item_on_panol();

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
  v_it jsonb;
  v_pri uuid;
  v_precio numeric;
  v_moneda text;
  v_codigo text;
begin
  if not public.is_panol_manager(v_uid) then
    raise exception 'Solo Compras/Admin pueden crear envios a Panol';
  end if;

  if p_sede not in ('Pampa','Chubut') then
    raise exception 'Sede invalida: %', p_sede;
  end if;

  insert into public.panol_envios(origen, purchase_request_id, titulo, obra_id, sede, destino, prioridad, observaciones, estado, created_by)
  values (
    coalesce(p_origen, 'manual'),
    p_purchase_request_id,
    p_titulo,
    p_obra_id,
    p_sede,
    p_destino,
    coalesce(p_prioridad, 'media'),
    p_observaciones,
    'enviado',
    v_uid
  )
  returning id into v_envio;

  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_pri := nullif(v_it->>'purchase_request_item_id', '')::uuid;
    v_precio := nullif(v_it->>'precio_unitario', '')::numeric;
    v_moneda := nullif(upper(v_it->>'moneda'), '');
    v_codigo := nullif(upper(btrim(v_it->>'codigo')), '');

    insert into public.panol_envio_items(
      envio_id, purchase_request_item_id, codigo, descripcion, cantidad, unidad, precio_unitario, moneda
    )
    values (
      v_envio,
      v_pri,
      v_codigo,
      coalesce(nullif(v_it->>'descripcion', ''), '(sin descripcion)'),
      v_it->>'cantidad',
      coalesce(nullif(v_it->>'unidad', ''), 'unidad'),
      v_precio,
      case when v_moneda in ('ARS','USD') then v_moneda else null end
    );

    if v_pri is not null then
      update public.purchase_request_items
         set status = 'en_panol',
             updated_at = now()
       where id = v_pri
         and status in ('pendiente','pedido');
    end if;
  end loop;

  insert into public.panol_envio_eventos(envio_id, tipo, estado_nuevo, actor_id)
  values (v_envio, 'creado', 'enviado', v_uid);

  return v_envio;
end;
$$;

create or replace function public.panol_marcar_items(
  p_item_ids uuid[],
  p_estado text,
  p_nota text default null,
  p_cant_recibida text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_envio uuid;
begin
  if p_estado not in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado') then
    raise exception 'Estado de item invalido: %', p_estado;
  end if;

  if array_length(p_item_ids, 1) is null then
    return;
  end if;

  if exists (
    select 1
    from public.panol_envio_items it
    join public.panol_envios e on e.id = it.envio_id
    where it.id = any(p_item_ids)
      and not public.can_receive_envio(e.sede, v_uid)
  ) then
    raise exception 'Sin permiso para recepcionar uno o mas items';
  end if;

  update public.panol_envio_items it
     set estado = p_estado,
         nota = coalesce(p_nota, it.nota),
         cantidad_recibida = case
                               when p_estado in ('recibido','parcial') then coalesce(p_cant_recibida, it.cantidad_recibida)
                               else it.cantidad_recibida
                             end,
         marcado_por = v_uid,
         marcado_at = now(),
         updated_at = now()
   where it.id = any(p_item_ids);

  for v_envio in select distinct envio_id from public.panol_envio_items where id = any(p_item_ids) loop
    perform public.panol_recalc_estado(v_envio);
  end loop;
end;
$$;

create or replace function public.panol_set_estado(p_envio uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if p_estado not in ('borrador','enviado','en_preparacion','parcial','recibido','cerrado','cancelado') then
    raise exception 'Estado de envio invalido: %', p_estado;
  end if;

  if not public.is_panol_manager(v_uid) then
    raise exception 'Solo Compras/Admin cambian el estado del envio';
  end if;

  select estado into v_old from public.panol_envios where id = p_envio;

  update public.panol_envios
     set estado = p_estado,
         closed_at = case when p_estado in ('cerrado','cancelado') then now() else closed_at end,
         updated_at = now()
   where id = p_envio;

  insert into public.panol_envio_eventos(envio_id, tipo, estado_anterior, estado_nuevo, actor_id)
  values (p_envio, 'estado', v_old, p_estado, v_uid);
end;
$$;

create or replace function public.panol_comentar_envio(p_envio uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sede text;
begin
  if coalesce(btrim(p_texto), '') = '' then
    return;
  end if;

  select sede into v_sede
  from public.panol_envios
  where id = p_envio;

  if v_sede is null then
    raise exception 'Envio inexistente';
  end if;

  if not public.can_see_envio(v_sede, v_uid) then
    raise exception 'Sin permiso';
  end if;

  insert into public.panol_envio_eventos(envio_id, tipo, nota, actor_id)
  values (p_envio, 'comentario', btrim(p_texto), v_uid);
end;
$$;

grant execute on function public.panol_crear_envio(text,text,text,uuid,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.panol_marcar_items(uuid[],text,text,text) to authenticated;
grant execute on function public.panol_set_estado(uuid,text) to authenticated;
grant execute on function public.panol_comentar_envio(uuid,text) to authenticated;
