-- ============================================================================
-- Obras: reordenamiento atómico de etapas y archivos de tareas de plantilla.
-- ============================================================================

-- 1. Permiso reutilizable para cambios estructurales de Producción.

create or replace function public.is_produccion_editor(p_user_id uuid)
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
         or p.role::text in ('admin', 'oficina', 'tecnica')
       )
  );
$$;

revoke all on function public.is_produccion_editor(uuid) from public;
grant execute on function public.is_produccion_editor(uuid) to authenticated;

-- 2. Reordenar toda una línea en una única transacción.
--
-- Primero lleva los registros a un rango temporal libre y después aplica
-- 1..N. Esto también funciona si existe una restricción UNIQUE por línea/orden.

create or replace function public.produccion_reordenar_etapas(
  p_linea_id uuid,
  p_proceso_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_linea integer;
  v_total_recibido integer;
  v_base_temporal integer;
begin
  if auth.uid() is null or not public.is_produccion_editor(auth.uid()) then
    raise exception 'No tenés permiso para reordenar esta línea';
  end if;
  if p_linea_id is null then
    raise exception 'Falta la línea de producción';
  end if;
  if p_proceso_ids is null or coalesce(array_length(p_proceso_ids, 1), 0) = 0 then
    raise exception 'La línea no tiene etapas para ordenar';
  end if;

  select count(*)
    into v_total_linea
    from public.linea_procesos lp
   where lp.linea_id = p_linea_id;

  select count(distinct ids.id)
    into v_total_recibido
    from unnest(p_proceso_ids) as ids(id);

  if v_total_recibido <> array_length(p_proceso_ids, 1) then
    raise exception 'La lista contiene etapas repetidas';
  end if;
  if v_total_recibido <> v_total_linea then
    raise exception 'El orden debe incluir las % etapas de la línea', v_total_linea;
  end if;
  if exists (
    select 1
      from unnest(p_proceso_ids) as ids(id)
      left join public.linea_procesos lp
        on lp.id = ids.id
       and lp.linea_id = p_linea_id
     where lp.id is null
  ) then
    raise exception 'Hay una etapa que no pertenece a la línea seleccionada';
  end if;

  select coalesce(max(lp.orden), 0) + v_total_linea + 1000
    into v_base_temporal
    from public.linea_procesos lp
   where lp.linea_id = p_linea_id;

  update public.linea_procesos lp
     set orden = v_base_temporal + desired.pos::integer
    from unnest(p_proceso_ids) with ordinality as desired(id, pos)
   where lp.id = desired.id
     and lp.linea_id = p_linea_id;

  update public.linea_procesos lp
     set orden = desired.pos::integer
    from unnest(p_proceso_ids) with ordinality as desired(id, pos)
   where lp.id = desired.id
     and lp.linea_id = p_linea_id;

  return v_total_recibido;
end;
$$;

revoke all on function public.produccion_reordenar_etapas(uuid, uuid[]) from public;
grant execute on function public.produccion_reordenar_etapas(uuid, uuid[]) to authenticated;

-- 3. Planos y documentos de las tareas de la plantilla de línea.

create table if not exists public.linea_proceso_tarea_archivos (
  id uuid primary key default gen_random_uuid(),
  linea_proceso_tarea_id uuid not null
    references public.linea_proceso_tareas(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null unique,
  url_publica text not null,
  tipo_mime text,
  tamano_bytes bigint not null default 0 check (tamano_bytes >= 0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_linea_proceso_tarea_archivos_tarea
  on public.linea_proceso_tarea_archivos(linea_proceso_tarea_id, created_at);

comment on table public.linea_proceso_tarea_archivos is
  'Planos y documentos base de una tarea de la plantilla. Las obras que nacen de esa tarea los consultan como adjuntos heredados.';

alter table public.linea_proceso_tarea_archivos enable row level security;

drop policy if exists "linea tarea archivos authenticated select"
  on public.linea_proceso_tarea_archivos;
create policy "linea tarea archivos authenticated select"
  on public.linea_proceso_tarea_archivos
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "linea tarea archivos production insert"
  on public.linea_proceso_tarea_archivos;
create policy "linea tarea archivos production insert"
  on public.linea_proceso_tarea_archivos
  for insert to authenticated
  with check (
    public.is_produccion_editor(auth.uid())
    and coalesce(created_by, auth.uid()) = auth.uid()
  );

drop policy if exists "linea tarea archivos production update"
  on public.linea_proceso_tarea_archivos;
create policy "linea tarea archivos production update"
  on public.linea_proceso_tarea_archivos
  for update to authenticated
  using (public.is_produccion_editor(auth.uid()))
  with check (public.is_produccion_editor(auth.uid()));

drop policy if exists "linea tarea archivos production delete"
  on public.linea_proceso_tarea_archivos;
create policy "linea tarea archivos production delete"
  on public.linea_proceso_tarea_archivos
  for delete to authenticated
  using (public.is_produccion_editor(auth.uid()));

grant select, insert, update, delete
  on public.linea_proceso_tarea_archivos
  to authenticated;

-- 4. Auditoría para conservar quién agregó o quitó cada plano.

create table if not exists public.produccion_tarea_archivos_auditoria (
  id bigint generated always as identity primary key,
  archivo_id uuid,
  linea_proceso_tarea_id uuid,
  accion text not null check (accion in ('insert', 'update', 'delete')),
  nombre_archivo text,
  datos_antes jsonb,
  datos_despues jsonb,
  actor_id uuid,
  actor_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_produccion_tarea_archivos_audit_tarea
  on public.produccion_tarea_archivos_auditoria(
    linea_proceso_tarea_id,
    created_at desc
  );

create or replace function public.produccion_tarea_archivo_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_actor uuid := auth.uid();
  v_actor_nombre text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  select p.username
    into v_actor_nombre
    from public.profiles p
   where p.id = v_actor;

  insert into public.produccion_tarea_archivos_auditoria (
    archivo_id,
    linea_proceso_tarea_id,
    accion,
    nombre_archivo,
    datos_antes,
    datos_despues,
    actor_id,
    actor_nombre
  )
  values (
    (v_row ->> 'id')::uuid,
    (v_row ->> 'linea_proceso_tarea_id')::uuid,
    lower(tg_op),
    v_row ->> 'nombre_archivo',
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    v_actor,
    coalesce(v_actor_nombre, 'sistema')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_produccion_tarea_archivo_auditar
  on public.linea_proceso_tarea_archivos;
create trigger trg_produccion_tarea_archivo_auditar
after insert or update or delete on public.linea_proceso_tarea_archivos
for each row execute function public.produccion_tarea_archivo_auditar();

alter table public.produccion_tarea_archivos_auditoria enable row level security;
drop policy if exists "produccion tarea archivos audit authenticated select"
  on public.produccion_tarea_archivos_auditoria;
create policy "produccion tarea archivos audit authenticated select"
  on public.produccion_tarea_archivos_auditoria
  for select to authenticated
  using (auth.uid() is not null);
grant select on public.produccion_tarea_archivos_auditoria to authenticated;

-- 5. Storage: el bucket ya es usado por archivos de tareas reales. Se amplía
-- para cualquier documento técnico de hasta 50 MB y se reserva una carpeta
-- independiente para las plantillas.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'obra-archivos',
  'obra-archivos',
  true,
  52428800,
  null
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = null;

drop policy if exists "produccion plantillas archivos insert"
  on storage.objects;
create policy "produccion plantillas archivos insert"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'obra-archivos'
    and (storage.foldername(name))[1] = 'plantillas-tareas'
    and public.is_produccion_editor(auth.uid())
  );

drop policy if exists "produccion plantillas archivos select"
  on storage.objects;
create policy "produccion plantillas archivos select"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'obra-archivos'
    and (storage.foldername(name))[1] = 'plantillas-tareas'
  );

drop policy if exists "produccion plantillas archivos delete"
  on storage.objects;
create policy "produccion plantillas archivos delete"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'obra-archivos'
    and (storage.foldername(name))[1] = 'plantillas-tareas'
    and public.is_produccion_editor(auth.uid())
  );

