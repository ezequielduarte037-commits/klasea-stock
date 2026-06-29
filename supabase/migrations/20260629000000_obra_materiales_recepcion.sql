-- Detalle de recepcion por item para Materiales > Obras.
-- Vincula cada item enviado a Panol con la fila fijada de materiales de obra
-- y mantiene el estado visible en la pantalla de materiales.

create table if not exists public.panol_obra_materiales_snapshot (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text not null,
  codigo text,
  cantidad numeric,
  unidad text default 'unidad',
  proveedor text,
  rubro text,
  tipo text not null default 'base',
  tipo_label text,
  precio_unitario numeric,
  moneda text,
  notas text,
  source text not null default 'matriz',
  orden int,
  estado text not null default 'pendiente',
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  panol_envio_id uuid references public.panol_envios(id) on delete set null,
  panol_envio_item_id uuid references public.panol_envio_items(id) on delete set null,
  recepcion_estado text,
  recepcion_cantidad_recibida text,
  recepcion_nota text,
  recepcion_updated_at timestamptz,
  egreso_at timestamptz,
  egreso_por uuid references public.profiles(id) on delete set null,
  egreso_nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.panol_obra_materiales_snapshot
  add column if not exists material_id uuid references public.panol_materiales(id) on delete set null,
  add column if not exists codigo text,
  add column if not exists cantidad numeric,
  add column if not exists unidad text default 'unidad',
  add column if not exists proveedor text,
  add column if not exists rubro text,
  add column if not exists tipo text not null default 'base',
  add column if not exists tipo_label text,
  add column if not exists precio_unitario numeric,
  add column if not exists moneda text,
  add column if not exists notas text,
  add column if not exists source text not null default 'matriz',
  add column if not exists orden int,
  add column if not exists estado text not null default 'pendiente',
  add column if not exists purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  add column if not exists purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  add column if not exists panol_envio_id uuid references public.panol_envios(id) on delete set null,
  add column if not exists panol_envio_item_id uuid references public.panol_envio_items(id) on delete set null,
  add column if not exists recepcion_estado text,
  add column if not exists recepcion_cantidad_recibida text,
  add column if not exists recepcion_nota text,
  add column if not exists recepcion_updated_at timestamptz,
  add column if not exists egreso_at timestamptz,
  add column if not exists egreso_por uuid references public.profiles(id) on delete set null,
  add column if not exists egreso_nota text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.panol_obra_materiales_snapshot
    drop constraint if exists panol_obra_snapshot_estado_chk;

  alter table public.panol_obra_materiales_snapshot
    add constraint panol_obra_snapshot_estado_chk
    check (estado in ('pendiente','pedido','comprado','en_panol','parcial','recibido','problema','egresado','cancelado'));

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.panol_obra_materiales_snapshot'::regclass
      and conname = 'panol_obra_snapshot_recepcion_estado_chk'
  ) then
    alter table public.panol_obra_materiales_snapshot
      add constraint panol_obra_snapshot_recepcion_estado_chk
      check (
        recepcion_estado is null
        or recepcion_estado in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.panol_obra_materiales_snapshot'::regclass
      and conname = 'panol_obra_snapshot_moneda_chk'
  ) then
    alter table public.panol_obra_materiales_snapshot
      add constraint panol_obra_snapshot_moneda_chk
      check (moneda is null or moneda in ('ARS','USD'));
  end if;
end $$;

create index if not exists idx_panol_obra_snapshot_obra
  on public.panol_obra_materiales_snapshot(obra_id, orden, created_at);

create index if not exists idx_panol_obra_snapshot_pr_item
  on public.panol_obra_materiales_snapshot(purchase_request_item_id)
  where purchase_request_item_id is not null;

create index if not exists idx_panol_obra_snapshot_estado
  on public.panol_obra_materiales_snapshot(obra_id, estado);

alter table public.panol_envio_items
  add column if not exists obra_snapshot_item_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null;

create index if not exists idx_panol_envio_items_obra_snapshot
  on public.panol_envio_items(obra_snapshot_item_id)
  where obra_snapshot_item_id is not null;

update public.panol_envio_items pei
   set obra_snapshot_item_id = s.id
  from public.panol_obra_materiales_snapshot s
 where pei.obra_snapshot_item_id is null
   and pei.purchase_request_item_id is not null
   and s.purchase_request_item_id = pei.purchase_request_item_id;

drop trigger if exists trg_panol_obra_snapshot_updated on public.panol_obra_materiales_snapshot;
create trigger trg_panol_obra_snapshot_updated
before update on public.panol_obra_materiales_snapshot
for each row execute function public.touch_updated_at();

alter table public.panol_obra_materiales_snapshot enable row level security;

drop policy if exists "snapshot select authenticated" on public.panol_obra_materiales_snapshot;
create policy "snapshot select authenticated"
  on public.panol_obra_materiales_snapshot for select
  to authenticated using (true);

drop policy if exists "snapshot insert manager" on public.panol_obra_materiales_snapshot;
create policy "snapshot insert manager"
  on public.panol_obra_materiales_snapshot for insert
  to authenticated
  with check (public.is_panol_manager(auth.uid()) or public.is_panol_viewer(auth.uid()));

drop policy if exists "snapshot update manager" on public.panol_obra_materiales_snapshot;
create policy "snapshot update manager"
  on public.panol_obra_materiales_snapshot for update
  to authenticated
  using (public.is_panol_manager(auth.uid()) or public.is_panol_viewer(auth.uid()))
  with check (public.is_panol_manager(auth.uid()) or public.is_panol_viewer(auth.uid()));

drop policy if exists "snapshot delete manager" on public.panol_obra_materiales_snapshot;
create policy "snapshot delete manager"
  on public.panol_obra_materiales_snapshot for delete
  to authenticated
  using (public.is_panol_manager(auth.uid()));

create or replace function public.panol_snapshot_estado_from_recepcion(p_estado text)
returns text
language sql
immutable
as $$
  select case
    when p_estado in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado') then 'en_panol'
    else 'en_panol'
  end;
$$;

create or replace function public.sync_obra_snapshot_from_panol_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_envio_id uuid;
begin
  v_snapshot_id := new.obra_snapshot_item_id;

  if v_snapshot_id is null and new.purchase_request_item_id is not null then
    select s.id
      into v_snapshot_id
      from public.panol_obra_materiales_snapshot s
     where s.purchase_request_item_id = new.purchase_request_item_id
     order by s.created_at desc
     limit 1;

    if v_snapshot_id is not null then
      update public.panol_envio_items
         set obra_snapshot_item_id = v_snapshot_id
       where id = new.id
         and obra_snapshot_item_id is null;
    end if;
  end if;

  if v_snapshot_id is null then
    return new;
  end if;

  select envio_id into v_envio_id
    from public.panol_envio_items
   where id = new.id;

  update public.panol_obra_materiales_snapshot s
     set estado = case
           when s.estado = 'egresado' then s.estado
           else public.panol_snapshot_estado_from_recepcion(new.estado)
         end,
         panol_envio_id = coalesce(v_envio_id, new.envio_id),
         panol_envio_item_id = new.id,
         recepcion_estado = new.estado,
         recepcion_cantidad_recibida = new.cantidad_recibida,
         recepcion_nota = new.nota,
         recepcion_updated_at = coalesce(new.marcado_at, new.updated_at, now()),
         updated_at = now()
   where s.id = v_snapshot_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_obra_snapshot_from_panol_item on public.panol_envio_items;
create trigger trg_sync_obra_snapshot_from_panol_item
after insert or update of estado, cantidad_recibida, nota, obra_snapshot_item_id, purchase_request_item_id
on public.panol_envio_items
for each row execute function public.sync_obra_snapshot_from_panol_item();

update public.panol_obra_materiales_snapshot s
   set estado = case
         when s.estado = 'egresado' then s.estado
         else public.panol_snapshot_estado_from_recepcion(last_item.estado)
       end,
       panol_envio_id = last_item.envio_id,
       panol_envio_item_id = last_item.id,
       recepcion_estado = last_item.estado,
       recepcion_cantidad_recibida = last_item.cantidad_recibida,
       recepcion_nota = last_item.nota,
       recepcion_updated_at = coalesce(last_item.marcado_at, last_item.updated_at, now()),
       updated_at = now()
  from (
    select distinct on (pei.obra_snapshot_item_id)
           pei.id,
           pei.envio_id,
           pei.obra_snapshot_item_id,
           pei.estado,
           pei.cantidad_recibida,
           pei.nota,
           pei.marcado_at,
           pei.updated_at
      from public.panol_envio_items pei
     where pei.obra_snapshot_item_id is not null
     order by pei.obra_snapshot_item_id, coalesce(pei.marcado_at, pei.updated_at, pei.created_at) desc
  ) last_item
 where s.id = last_item.obra_snapshot_item_id;

create or replace function public.sync_obra_snapshot_from_purchase_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panol_obra_materiales_snapshot s
     set estado = case
           when new.status in ('pedido','en_panol','recibido','cancelado') then new.status
           else s.estado
         end,
         updated_at = now()
   where s.purchase_request_item_id = new.id
     and (
       s.panol_envio_item_id is null
       or new.status in ('en_panol','recibido','cancelado')
     )
     and s.estado <> 'egresado';

  return new;
end;
$$;

drop trigger if exists trg_sync_obra_snapshot_from_purchase_item on public.purchase_request_items;
create trigger trg_sync_obra_snapshot_from_purchase_item
after update of status on public.purchase_request_items
for each row execute function public.sync_obra_snapshot_from_purchase_item();

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
    v_snapshot := nullif(v_it->>'obra_snapshot_item_id', '')::uuid;
    v_precio := nullif(v_it->>'precio_unitario', '')::numeric;
    v_moneda := nullif(upper(v_it->>'moneda'), '');
    v_codigo := nullif(upper(btrim(v_it->>'codigo')), '');

    if v_snapshot is null and v_pri is not null then
      select s.id
        into v_snapshot
        from public.panol_obra_materiales_snapshot s
       where s.purchase_request_item_id = v_pri
       order by s.created_at desc
       limit 1;
    end if;

    insert into public.panol_envio_items(
      envio_id, purchase_request_item_id, obra_snapshot_item_id,
      codigo, descripcion, cantidad, unidad, precio_unitario, moneda
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
      case when v_moneda in ('ARS','USD') then v_moneda else null end
    )
    returning id into v_item_id;

    if v_pri is not null then
      update public.purchase_request_items
         set status = 'en_panol',
             updated_at = now()
       where id = v_pri
         and status in ('pendiente','pedido');
    end if;

    if v_snapshot is not null then
      update public.panol_obra_materiales_snapshot
         set estado = 'en_panol',
             purchase_request_id = coalesce(p_purchase_request_id, purchase_request_id),
             purchase_request_item_id = coalesce(v_pri, purchase_request_item_id),
             panol_envio_id = v_envio,
             panol_envio_item_id = v_item_id,
             recepcion_estado = 'pendiente',
             recepcion_updated_at = now(),
             updated_at = now()
       where id = v_snapshot;
    end if;
  end loop;

  insert into public.panol_envio_eventos(envio_id, tipo, estado_nuevo, actor_id)
  values (v_envio, 'creado', 'enviado', v_uid);

  return v_envio;
end;
$$;

create or replace function public.panol_egresar_obra_materiales(
  p_snapshot_ids uuid[],
  p_nota text default null
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
begin
  if array_length(p_snapshot_ids, 1) is null then
    return 0;
  end if;

  for v_row in
    select
      s.id,
      s.estado as old_estado,
      s.panol_envio_id,
      s.panol_envio_item_id,
      e.sede
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.id = any(p_snapshot_ids)
  loop
    if not (
      public.is_panol_manager(v_uid)
      or (v_row.sede is not null and public.can_receive_envio(v_row.sede, v_uid))
    ) then
      raise exception 'Sin permiso para egresar uno o mas materiales';
    end if;

    if v_row.old_estado in ('en_panol','recibido','parcial','problema') then
      update public.panol_obra_materiales_snapshot
         set estado = 'egresado',
             egreso_at = now(),
             egreso_por = v_uid,
             egreso_nota = v_nota,
             updated_at = now()
       where id = v_row.id
         and estado <> 'egresado';

      if found then
        v_count := v_count + 1;

        if v_row.panol_envio_id is not null then
          insert into public.panol_envio_eventos(
            envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
          )
          values (
            v_row.panol_envio_id,
            v_row.panol_envio_item_id,
            'egreso_material',
            v_row.old_estado,
            'egresado',
            v_nota,
            v_uid
          );
        end if;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.panol_snapshot_estado_from_recepcion(text) to authenticated;
grant execute on function public.panol_crear_envio(text,text,text,uuid,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.panol_egresar_obra_materiales(uuid[],text) to authenticated;
