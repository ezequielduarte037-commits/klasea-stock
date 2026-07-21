-- Ausencias programadas de RRHH (reposos, vacaciones y licencias).
-- Preview: esta migracion es aditiva. No borra ni modifica las justificaciones
-- diarias existentes; Presentismo combina ambos origenes durante la transicion.

create extension if not exists pgcrypto;

create or replace function public.rrhh_es_gestor(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (coalesce(p.is_admin, false) or lower(coalesce(p.role::text, '')) in ('admin', 'rrhh'))
  );
$$;

revoke all on function public.rrhh_es_gestor(uuid) from public;
grant execute on function public.rrhh_es_gestor(uuid) to authenticated;

create table if not exists public.rrhh_ausencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.rrhh_empleados(id) on delete cascade,
  tipo text not null default 'otro',
  desde date not null,
  hasta date not null,
  detalle text,
  estado text not null default 'activo',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  anulada_por uuid references public.profiles(id) on delete set null,
  anulada_at timestamptz,
  anulacion_motivo text
);

alter table public.rrhh_ausencias
  add column if not exists tipo text not null default 'otro',
  add column if not exists desde date,
  add column if not exists hasta date,
  add column if not exists detalle text,
  add column if not exists estado text not null default 'activo',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists anulada_por uuid references public.profiles(id) on delete set null,
  add column if not exists anulada_at timestamptz,
  add column if not exists anulacion_motivo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rrhh_ausencias'::regclass
      and conname = 'rrhh_ausencias_fechas_chk'
  ) then
    alter table public.rrhh_ausencias
      add constraint rrhh_ausencias_fechas_chk check (hasta >= desde);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rrhh_ausencias'::regclass
      and conname = 'rrhh_ausencias_tipo_chk'
  ) then
    alter table public.rrhh_ausencias
      add constraint rrhh_ausencias_tipo_chk
      check (tipo in ('reposo', 'vacaciones', 'licencia', 'tramite', 'otro'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rrhh_ausencias'::regclass
      and conname = 'rrhh_ausencias_estado_chk'
  ) then
    alter table public.rrhh_ausencias
      add constraint rrhh_ausencias_estado_chk check (estado in ('activo', 'anulado'));
  end if;
end $$;

create index if not exists rrhh_ausencias_empleado_fechas_idx
  on public.rrhh_ausencias (empleado_id, desde, hasta);

create index if not exists rrhh_ausencias_periodo_activo_idx
  on public.rrhh_ausencias (desde, hasta)
  where estado = 'activo';

create unique index if not exists rrhh_ausencias_periodo_unico_idx
  on public.rrhh_ausencias (empleado_id, tipo, desde, hasta)
  where estado = 'activo';

create or replace function public.rrhh_ausencias_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.updated_by is null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists rrhh_ausencias_set_updated_at on public.rrhh_ausencias;
create trigger rrhh_ausencias_set_updated_at
before update on public.rrhh_ausencias
for each row execute function public.rrhh_ausencias_set_updated_at();

alter table public.rrhh_ausencias enable row level security;

drop policy if exists "rrhh_ausencias_select_authenticated" on public.rrhh_ausencias;
create policy "rrhh_ausencias_select_authenticated"
on public.rrhh_ausencias
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "rrhh_ausencias_insert_manager" on public.rrhh_ausencias;
create policy "rrhh_ausencias_insert_manager"
on public.rrhh_ausencias
for insert
to authenticated
with check (public.rrhh_es_gestor(auth.uid()));

drop policy if exists "rrhh_ausencias_update_manager" on public.rrhh_ausencias;
create policy "rrhh_ausencias_update_manager"
on public.rrhh_ausencias
for update
to authenticated
using (public.rrhh_es_gestor(auth.uid()))
with check (public.rrhh_es_gestor(auth.uid()));

drop policy if exists "rrhh_ausencias_delete_manager" on public.rrhh_ausencias;
create policy "rrhh_ausencias_delete_manager"
on public.rrhh_ausencias
for delete
to authenticated
using (public.rrhh_es_gestor(auth.uid()));

grant select, insert, update, delete on public.rrhh_ausencias to authenticated;

create or replace function public.rrhh_crear_ausencias(
  p_empleado_ids uuid[],
  p_desde date,
  p_hasta date,
  p_tipo text,
  p_detalle text default null
)
returns setof public.rrhh_ausencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado_id uuid;
  v_tipo text;
  v_detalle text;
  v_existing public.rrhh_ausencias%rowtype;
  v_saved public.rrhh_ausencias%rowtype;
begin
  if not public.rrhh_es_gestor(auth.uid()) then
    raise exception 'Solo RRHH o un administrador pueden registrar ausencias.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_empleado_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una persona.' using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El periodo seleccionado no es valido.' using errcode = '22023';
  end if;

  v_tipo := translate(
    lower(btrim(coalesce(p_tipo, 'otro'))),
    chr(225) || chr(233) || chr(237) || chr(243) || chr(250),
    'aeiou'
  );
  if v_tipo not in ('reposo', 'vacaciones', 'licencia', 'tramite', 'otro') then
    v_tipo := 'otro';
  end if;
  v_detalle := nullif(btrim(coalesce(p_detalle, '')), '');

  foreach v_empleado_id in array p_empleado_ids loop
    if not exists (
      select 1 from public.rrhh_empleados e where e.id = v_empleado_id
    ) then
      raise exception 'Empleado inexistente: %', v_empleado_id using errcode = '23503';
    end if;

    select a.*
      into v_existing
    from public.rrhh_ausencias a
    where a.empleado_id = v_empleado_id
      and a.estado = 'activo'
      and daterange(a.desde, a.hasta, '[]') && daterange(p_desde, p_hasta, '[]')
    order by a.created_at desc
    limit 1;

    if v_existing.id is not null
       and (v_existing.desde <> p_desde or v_existing.hasta <> p_hasta or v_existing.tipo <> v_tipo) then
      raise exception 'La persona ya tiene una ausencia activa superpuesta (% a %).', v_existing.desde, v_existing.hasta
        using errcode = '23P01';
    end if;

    if v_existing.id is not null then
      update public.rrhh_ausencias
      set detalle = v_detalle,
          updated_by = auth.uid(),
          updated_at = now()
      where id = v_existing.id
      returning * into v_saved;
    else
      insert into public.rrhh_ausencias (
        empleado_id, tipo, desde, hasta, detalle, estado, created_by, updated_by
      ) values (
        v_empleado_id, v_tipo, p_desde, p_hasta, v_detalle, 'activo', auth.uid(), auth.uid()
      )
      returning * into v_saved;
    end if;

    return next v_saved;
    v_existing := null;
  end loop;
end;
$$;

revoke all on function public.rrhh_crear_ausencias(uuid[], date, date, text, text) from public;
grant execute on function public.rrhh_crear_ausencias(uuid[], date, date, text, text) to authenticated;

comment on table public.rrhh_ausencias is
  'Periodos de ausencia justificada de RRHH. Es la fuente de verdad para reposos, vacaciones y licencias.';
comment on column public.rrhh_ausencias.detalle is
  'Motivo o referencia administrativa visible en Presentismo y sus exportaciones.';
comment on column public.rrhh_ausencias.estado is
  'Activo mientras aplica; anulado conserva la trazabilidad sin afectar el presentismo.';
