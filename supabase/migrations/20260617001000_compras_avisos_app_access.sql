-- Avisos a compras desde la app.
-- Permite que tecnica/oficina y panol creen avisos, y que compras/admin los gestione.

create extension if not exists pgcrypto;

create table if not exists public.compras_avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  material text,
  project_id uuid references public.produccion_obras(id) on delete set null,
  destino text,
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'en_proceso', 'resuelto', 'descartado')),
  origen text not null default 'web',
  source_ref text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  resuelto_por uuid references public.profiles(id) on delete set null,
  resuelto_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compras_aviso_comentarios (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.compras_avisos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.compras_avisos
  add column if not exists titulo text,
  add column if not exists detalle text,
  add column if not exists material text,
  add column if not exists project_id uuid,
  add column if not exists destino text,
  add column if not exists prioridad text not null default 'media',
  add column if not exists estado text not null default 'nuevo',
  add column if not exists origen text not null default 'web',
  add column if not exists source_ref text,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists resuelto_por uuid,
  add column if not exists resuelto_en timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.compras_aviso_comentarios
  add column if not exists aviso_id uuid,
  add column if not exists author_id uuid default auth.uid(),
  add column if not exists body text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.compras_avisos'::regclass
      and conname = 'compras_avisos_project_id_fkey'
  ) then
    alter table public.compras_avisos
      add constraint compras_avisos_project_id_fkey
      foreign key (project_id) references public.produccion_obras(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.compras_avisos'::regclass
      and conname = 'compras_avisos_created_by_fkey'
  ) then
    alter table public.compras_avisos
      add constraint compras_avisos_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.compras_avisos'::regclass
      and conname = 'compras_avisos_resuelto_por_fkey'
  ) then
    alter table public.compras_avisos
      add constraint compras_avisos_resuelto_por_fkey
      foreign key (resuelto_por) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.compras_aviso_comentarios'::regclass
      and conname = 'compras_aviso_comentarios_aviso_id_fkey'
  ) then
    alter table public.compras_aviso_comentarios
      add constraint compras_aviso_comentarios_aviso_id_fkey
      foreign key (aviso_id) references public.compras_avisos(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.compras_aviso_comentarios'::regclass
      and conname = 'compras_aviso_comentarios_author_id_fkey'
  ) then
    alter table public.compras_aviso_comentarios
      add constraint compras_aviso_comentarios_author_id_fkey
      foreign key (author_id) references public.profiles(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_compras_avisos_estado on public.compras_avisos(estado);
create index if not exists idx_compras_avisos_created_by on public.compras_avisos(created_by);
create index if not exists idx_compras_avisos_created_at on public.compras_avisos(created_at desc);
create index if not exists idx_compras_aviso_comentarios_aviso on public.compras_aviso_comentarios(aviso_id, created_at);

drop trigger if exists trg_compras_avisos_updated_at on public.compras_avisos;
create trigger trg_compras_avisos_updated_at
before update on public.compras_avisos
for each row execute function public.touch_updated_at();

drop trigger if exists trg_compras_aviso_comentarios_updated_at on public.compras_aviso_comentarios;
create trigger trg_compras_aviso_comentarios_updated_at
before update on public.compras_aviso_comentarios
for each row execute function public.touch_updated_at();

create or replace function public.can_manage_compras_aviso(p_uid uuid)
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
      and (coalesce(p.is_admin, false) or p.role in ('admin', 'compras'))
  );
$$;

create or replace function public.can_create_compras_aviso(p_uid uuid)
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
        or p.role in ('admin', 'compras', 'tecnica', 'oficina', 'panol')
      )
  );
$$;

create or replace function public.can_access_compras_aviso(p_aviso uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.can_manage_compras_aviso(p_uid)
    or exists (
      select 1
      from public.compras_avisos a
      where a.id = p_aviso
        and a.created_by = p_uid
    )
  );
$$;

alter table public.compras_avisos enable row level security;
alter table public.compras_aviso_comentarios enable row level security;

drop policy if exists "avisos visibles para compras y creador" on public.compras_avisos;
create policy "avisos visibles para compras y creador"
  on public.compras_avisos for select
  using (public.can_access_compras_aviso(id, auth.uid()));

drop policy if exists "avisos insert tecnica panol compras" on public.compras_avisos;
create policy "avisos insert tecnica panol compras"
  on public.compras_avisos for insert
  with check (
    created_by = auth.uid()
    and public.can_create_compras_aviso(auth.uid())
  );

drop policy if exists "avisos update compras" on public.compras_avisos;
create policy "avisos update compras"
  on public.compras_avisos for update
  using (public.can_manage_compras_aviso(auth.uid()))
  with check (public.can_manage_compras_aviso(auth.uid()));

drop policy if exists "avisos delete compras" on public.compras_avisos;
create policy "avisos delete compras"
  on public.compras_avisos for delete
  using (public.can_manage_compras_aviso(auth.uid()));

drop policy if exists "comentarios avisos visibles" on public.compras_aviso_comentarios;
create policy "comentarios avisos visibles"
  on public.compras_aviso_comentarios for select
  using (public.can_access_compras_aviso(aviso_id, auth.uid()));

drop policy if exists "comentarios avisos insert participantes" on public.compras_aviso_comentarios;
create policy "comentarios avisos insert participantes"
  on public.compras_aviso_comentarios for insert
  with check (
    author_id = auth.uid()
    and public.can_access_compras_aviso(aviso_id, auth.uid())
  );

drop policy if exists "comentarios avisos update autor compras" on public.compras_aviso_comentarios;
create policy "comentarios avisos update autor compras"
  on public.compras_aviso_comentarios for update
  using (author_id = auth.uid() or public.can_manage_compras_aviso(auth.uid()))
  with check (author_id = auth.uid() or public.can_manage_compras_aviso(auth.uid()));

drop policy if exists "comentarios avisos delete autor compras" on public.compras_aviso_comentarios;
create policy "comentarios avisos delete autor compras"
  on public.compras_aviso_comentarios for delete
  using (author_id = auth.uid() or public.can_manage_compras_aviso(auth.uid()));

grant select, insert, update, delete on public.compras_avisos to authenticated;
grant select, insert, update, delete on public.compras_aviso_comentarios to authenticated;
grant execute on function public.can_manage_compras_aviso(uuid) to authenticated;
grant execute on function public.can_create_compras_aviso(uuid) to authenticated;
grant execute on function public.can_access_compras_aviso(uuid, uuid) to authenticated;
