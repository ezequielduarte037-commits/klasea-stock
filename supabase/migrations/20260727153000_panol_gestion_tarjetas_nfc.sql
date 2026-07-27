-- Gestión controlada de tarjetas NFC desde Pañol.
-- Pañol puede buscar y vincular tarjetas, pero nunca crear empleados:
-- el maestro de RRHH sigue siendo la única fuente de personas habilitadas.

create or replace function public.panol_puede_gestionar_nfc(p_user_id uuid default auth.uid())
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
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in ('admin', 'panol', 'tecnica', 'oficina')
      )
  );
$$;

revoke all on function public.panol_puede_gestionar_nfc(uuid) from public;
grant execute on function public.panol_puede_gestionar_nfc(uuid) to authenticated;

create table if not exists public.rrhh_empleados_nfc_historial (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.rrhh_empleados(id) on delete set null,
  empleado_dni text not null,
  empleado_nombre text not null,
  accion text not null check (accion in ('asignacion', 'reemplazo', 'actualizacion', 'desvinculacion')),
  nfc_uid_anterior text,
  nfc_uid_nuevo text,
  foto_url_anterior text,
  foto_url_nueva text,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists rrhh_empleados_nfc_historial_empleado_idx
  on public.rrhh_empleados_nfc_historial(empleado_id, created_at desc);

alter table public.rrhh_empleados_nfc_historial enable row level security;

drop policy if exists "rrhh nfc historial lectura gestores" on public.rrhh_empleados_nfc_historial;
create policy "rrhh nfc historial lectura gestores"
  on public.rrhh_empleados_nfc_historial
  for select to authenticated
  using (public.panol_puede_gestionar_nfc(auth.uid()));

revoke all on public.rrhh_empleados_nfc_historial from anon;
grant select on public.rrhh_empleados_nfc_historial to authenticated;

create or replace function public.panol_buscar_empleado_por_dni(p_dni text)
returns table (
  empleado_id uuid,
  dni text,
  nombre text,
  grupo text,
  sede text,
  activo boolean,
  nfc_uid text,
  foto_url text,
  nfc_asignado_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g');
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;
  if length(v_dni) < 5 or length(v_dni) > 10 then
    raise exception 'Ingresá un DNI válido.';
  end if;

  return query
  select
    e.id,
    e.dni::text,
    e.nombre::text,
    e.grupo::text,
    e.sede::text,
    coalesce(e.activo, true),
    e.nfc_uid::text,
    e.foto_url::text,
    e.nfc_asignado_at
  from public.rrhh_empleados e
  where regexp_replace(e.dni::text, '[^0-9]', '', 'g') = v_dni
    and coalesce(e.activo, true)
  limit 1;
end;
$$;

create or replace function public.panol_buscar_empleado_por_nfc(p_nfc_uid text)
returns table (
  empleado_id uuid,
  dni text,
  nombre text,
  sede text,
  activo boolean,
  nfc_uid text,
  foto_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid text := upper(regexp_replace(coalesce(p_nfc_uid, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;
  if length(v_uid) < 4 then return; end if;

  return query
  select
    e.id,
    e.dni::text,
    e.nombre::text,
    e.sede::text,
    coalesce(e.activo, true),
    e.nfc_uid::text,
    e.foto_url::text
  from public.rrhh_empleados e
  where upper(regexp_replace(coalesce(e.nfc_uid, ''), '[^0-9A-Za-z]', '', 'g')) = v_uid
  limit 1;
end;
$$;

create or replace function public.panol_asignar_tarjeta_nfc(
  p_empleado_id uuid,
  p_nfc_uid text,
  p_foto_url text default null
)
returns table (
  empleado_id uuid,
  dni text,
  nombre text,
  grupo text,
  sede text,
  activo boolean,
  nfc_uid text,
  foto_url text,
  nfc_asignado_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := upper(regexp_replace(coalesce(p_nfc_uid, ''), '[^0-9A-Za-z]', '', 'g'));
  v_emp public.rrhh_empleados%rowtype;
  v_duenio public.rrhh_empleados%rowtype;
  v_foto text := nullif(btrim(coalesce(p_foto_url, '')), '');
  v_accion text;
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;
  if length(v_uid) < 4 or length(v_uid) > 128 then
    raise exception 'La tarjeta NFC no tiene un UID válido.';
  end if;

  select * into v_emp
  from public.rrhh_empleados
  where id = p_empleado_id
  for update;

  if not found then
    raise exception 'El empleado no existe en el maestro de RRHH.';
  end if;
  if not coalesce(v_emp.activo, true) then
    raise exception 'El empleado está inactivo en RRHH.';
  end if;

  select * into v_duenio
  from public.rrhh_empleados
  where id <> p_empleado_id
    and upper(regexp_replace(coalesce(nfc_uid, ''), '[^0-9A-Za-z]', '', 'g')) = v_uid
  limit 1;

  if found then
    raise exception 'La tarjeta ya está asignada a % (DNI %).', v_duenio.nombre, v_duenio.dni;
  end if;

  v_accion := case
    when nullif(btrim(coalesce(v_emp.nfc_uid, '')), '') is null then 'asignacion'
    when upper(regexp_replace(v_emp.nfc_uid, '[^0-9A-Za-z]', '', 'g')) <> v_uid then 'reemplazo'
    else 'actualizacion'
  end;

  update public.rrhh_empleados e
  set
    nfc_uid = v_uid,
    foto_url = coalesce(v_foto, e.foto_url),
    nfc_asignado_at = now(),
    nfc_asignado_por = auth.uid()
  where e.id = p_empleado_id;

  insert into public.rrhh_empleados_nfc_historial (
    empleado_id, empleado_dni, empleado_nombre, accion,
    nfc_uid_anterior, nfc_uid_nuevo,
    foto_url_anterior, foto_url_nueva, actor_id
  ) values (
    v_emp.id, v_emp.dni::text, v_emp.nombre::text, v_accion,
    v_emp.nfc_uid, v_uid,
    v_emp.foto_url, coalesce(v_foto, v_emp.foto_url), auth.uid()
  );

  return query
  select
    e.id,
    e.dni::text,
    e.nombre::text,
    e.grupo::text,
    e.sede::text,
    coalesce(e.activo, true),
    e.nfc_uid::text,
    e.foto_url::text,
    e.nfc_asignado_at
  from public.rrhh_empleados e
  where e.id = p_empleado_id;
end;
$$;

create or replace function public.panol_desvincular_tarjeta_nfc(p_empleado_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp public.rrhh_empleados%rowtype;
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;

  select * into v_emp
  from public.rrhh_empleados
  where id = p_empleado_id
  for update;

  if not found then raise exception 'El empleado no existe en RRHH.'; end if;
  if nullif(btrim(coalesce(v_emp.nfc_uid, '')), '') is null then return; end if;

  update public.rrhh_empleados
  set nfc_uid = null, nfc_asignado_at = null, nfc_asignado_por = auth.uid()
  where id = p_empleado_id;

  insert into public.rrhh_empleados_nfc_historial (
    empleado_id, empleado_dni, empleado_nombre, accion,
    nfc_uid_anterior, nfc_uid_nuevo,
    foto_url_anterior, foto_url_nueva, actor_id
  ) values (
    v_emp.id, v_emp.dni::text, v_emp.nombre::text, 'desvinculacion',
    v_emp.nfc_uid, null,
    v_emp.foto_url, v_emp.foto_url, auth.uid()
  );
end;
$$;

revoke all on function public.panol_buscar_empleado_por_dni(text) from public;
revoke all on function public.panol_buscar_empleado_por_nfc(text) from public;
revoke all on function public.panol_asignar_tarjeta_nfc(uuid, text, text) from public;
revoke all on function public.panol_desvincular_tarjeta_nfc(uuid) from public;
grant execute on function public.panol_buscar_empleado_por_dni(text) to authenticated;
grant execute on function public.panol_buscar_empleado_por_nfc(text) to authenticated;
grant execute on function public.panol_asignar_tarjeta_nfc(uuid, text, text) to authenticated;
grant execute on function public.panol_desvincular_tarjeta_nfc(uuid) to authenticated;

-- Las fotos son públicas porque se muestran como avatar en Pañol. La escritura
-- queda limitada a los mismos roles que pueden gestionar las tarjetas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rrhh-fotos',
  'rrhh-fotos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rrhh fotos gestores insert" on storage.objects;
create policy "rrhh fotos gestores insert"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rrhh-fotos'
    and public.panol_puede_gestionar_nfc(auth.uid())
  );

drop policy if exists "rrhh fotos lectura publica" on storage.objects;
create policy "rrhh fotos lectura publica"
  on storage.objects
  for select to public
  using (bucket_id = 'rrhh-fotos');
