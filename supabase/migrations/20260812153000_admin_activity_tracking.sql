-- Auditoria minima de uso para la cuenta propietaria "Admin".
-- Registra sesiones y modulos visitados, sin contenido de formularios,
-- credenciales, IP ni datos personales adicionales.

create table if not exists public.admin_activity_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  initial_route text,
  last_route text,
  page_views integer not null default 0 check (page_views >= 0),
  device_type text not null default 'unknown'
    check (device_type in ('desktop', 'tablet', 'mobile', 'unknown')),
  timezone text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.admin_activity_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('session_start', 'page_view', 'session_end')),
  route text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists admin_activity_sessions_started_idx
  on public.admin_activity_sessions (started_at desc);
create index if not exists admin_activity_sessions_user_seen_idx
  on public.admin_activity_sessions (user_id, last_seen_at desc);
create index if not exists admin_activity_events_occurred_idx
  on public.admin_activity_events (occurred_at desc);
create index if not exists admin_activity_events_route_idx
  on public.admin_activity_events (route, occurred_at desc)
  where route is not null;

alter table public.admin_activity_sessions enable row level security;
alter table public.admin_activity_events enable row level security;

create or replace function public.can_read_admin_activity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.username, ''))) = 'ezequiel.adm'
  );
$$;

revoke all on function public.can_read_admin_activity() from public;
grant execute on function public.can_read_admin_activity() to authenticated;

drop policy if exists "real admins read tracked sessions" on public.admin_activity_sessions;
create policy "real admins read tracked sessions"
  on public.admin_activity_sessions for select
  to authenticated
  using (public.can_read_admin_activity());

drop policy if exists "real admins read tracked events" on public.admin_activity_events;
create policy "real admins read tracked events"
  on public.admin_activity_events for select
  to authenticated
  using (public.can_read_admin_activity());

create or replace function public.register_admin_activity(
  p_session_id uuid,
  p_event_type text,
  p_route text default null,
  p_duration_seconds integer default null,
  p_device_type text default 'unknown',
  p_timezone text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_event_type text := lower(coalesce(p_event_type, ''));
  v_route text := nullif(left(trim(coalesce(p_route, '')), 300), '');
  v_device text := lower(coalesce(p_device_type, 'unknown'));
begin
  if v_user_id is null or p_session_id is null then
    return false;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = v_user_id;

  -- Solo se rastrea la cuenta solicitada. Ningun otro usuario genera filas.
  if lower(trim(coalesce(v_username, ''))) <> 'admin' then
    return false;
  end if;

  if v_event_type not in ('session_start', 'page_view', 'heartbeat', 'session_end') then
    raise exception 'Tipo de actividad no permitido';
  end if;
  if v_device not in ('desktop', 'tablet', 'mobile', 'unknown') then
    v_device := 'unknown';
  end if;

  insert into public.admin_activity_sessions (
    id, user_id, username, started_at, last_seen_at, ended_at,
    initial_route, last_route, page_views, device_type, timezone
  ) values (
    p_session_id, v_user_id, v_username, now(), now(),
    case when v_event_type = 'session_end' then now() else null end,
    v_route, v_route,
    case when v_event_type in ('session_start', 'page_view') then 1 else 0 end,
    v_device, nullif(left(coalesce(p_timezone, ''), 100), '')
  )
  on conflict (id) do update set
    last_seen_at = now(),
    ended_at = case
      when v_event_type = 'session_end' then now()
      else public.admin_activity_sessions.ended_at
    end,
    last_route = coalesce(v_route, public.admin_activity_sessions.last_route),
    page_views = public.admin_activity_sessions.page_views
      + case when v_event_type = 'page_view' then 1 else 0 end;

  if v_event_type <> 'heartbeat' then
    insert into public.admin_activity_events (
      session_id, user_id, event_type, route, duration_seconds, metadata
    ) values (
      p_session_id,
      v_user_id,
      v_event_type,
      v_route,
      greatest(coalesce(p_duration_seconds, 0), 0),
      case
        when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
          then coalesce(p_metadata, '{}'::jsonb)
        else '{}'::jsonb
      end
    );
  end if;

  return true;
end;
$$;

revoke all on function public.register_admin_activity(uuid, text, text, integer, text, text, jsonb) from public;
grant execute on function public.register_admin_activity(uuid, text, text, integer, text, text, jsonb) to authenticated;

comment on table public.admin_activity_sessions is
  'Sesiones de uso de la cuenta Admin. No almacena contenido escrito, IP ni credenciales.';
comment on table public.admin_activity_events is
  'Navegacion minima por modulo de la cuenta Admin para auditoria interna.';
