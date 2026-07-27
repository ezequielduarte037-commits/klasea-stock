-- ═════════════════════════════════════════════════════════════════════════════
-- Compras por Etapa — los materiales pasan a vivir DENTRO de la etapa de compra.
--
-- Antes los materiales se heredaban de la "receta" de cada etapa de producción
-- (linea_proceso_materiales) y la etapa de compra sólo los resolvía. Era
-- invisible: creabas una etapa y no había forma de cargarle materiales desde
-- donde los estabas buscando.
--
-- Ahora:
--   linea_compra_etapas  → linea_compra_etapa_materiales   (plantilla del modelo)
--   obra_compra_etapas   → obra_compra_etapa_materiales    (la obra real)
--
-- La etapa de producción queda como una ETIQUETA opcional en cada material
-- (linea_proceso_id), para saber para qué es lo que se compra. Ya no define
-- qué se compra.
--
-- linea_proceso_materiales NO se toca: la sigue usando la matriz de materiales
-- (MaterialesScreen) para pintar a qué etapa pertenece cada material.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Materiales de la plantilla (por modelo) ──────────────────────────────

create table if not exists public.linea_compra_etapa_materiales (
  id uuid primary key default gen_random_uuid(),
  compra_etapa_id uuid not null references public.linea_compra_etapas(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  cantidad numeric not null default 1,
  unidad text,
  notas text,
  -- Etiqueta opcional: a qué etapa productiva corresponde este material.
  linea_proceso_id uuid references public.linea_procesos(id) on delete set null,
  orden int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (compra_etapa_id, material_id)
);

create index if not exists idx_lcem_etapa on public.linea_compra_etapa_materiales(compra_etapa_id, orden);
create index if not exists idx_lcem_material on public.linea_compra_etapa_materiales(material_id);

-- ── 2. Materiales de la etapa de compra de la obra ──────────────────────────

create table if not exists public.obra_compra_etapa_materiales (
  id uuid primary key default gen_random_uuid(),
  obra_compra_etapa_id uuid not null references public.obra_compra_etapas(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  cantidad numeric not null default 1,
  unidad text,
  notas text,
  linea_proceso_id uuid references public.linea_procesos(id) on delete set null,
  orden int not null default 0,
  -- De dónde salió: copiado de la plantilla, de otra etapa, o cargado a mano.
  origen text not null default 'manual' check (origen in ('manual', 'plantilla', 'copia')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_compra_etapa_id, material_id)
);

create index if not exists idx_ocem_etapa on public.obra_compra_etapa_materiales(obra_compra_etapa_id, orden);
create index if not exists idx_ocem_material on public.obra_compra_etapa_materiales(material_id);

-- ── 3. La tabla de ajustes ya no hace falta ─────────────────────────────────
-- Los materiales se guardan enteros en la etapa, así que no hay una "receta
-- base" contra la cual registrar desviaciones.
drop table if exists public.obra_compra_etapa_ajustes;

-- ── 4. Auditoría: quién cambió qué y cuándo ─────────────────────────────────
-- Se llena por trigger, no desde el cliente: así queda registro aunque el
-- cambio entre por otra pantalla, por SQL o por un script.

create table if not exists public.compras_auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id uuid,
  -- Denormalizado para poder traer el historial de una etapa con un solo filtro.
  obra_compra_etapa_id uuid,
  compra_etapa_id uuid,
  accion text not null,
  descripcion text,
  datos_antes jsonb,
  datos_despues jsonb,
  actor_id uuid,
  actor_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_compras_audit_etapa_obra
  on public.compras_auditoria(obra_compra_etapa_id, created_at desc);
create index if not exists idx_compras_audit_etapa_plantilla
  on public.compras_auditoria(compra_etapa_id, created_at desc);

-- El trigger necesita leer profiles y panol_materiales para dejar el registro
-- legible ("Ezequiel cambió Resina epoxi de 100 a 120"), por eso va como
-- security definer con search_path fijo.
create or replace function public.compras_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_actor uuid := auth.uid();
  v_nombre text;
  v_desc text;
  v_mat text;
  v_etapa_obra uuid;
  v_etapa_tpl uuid;
begin
  v_new := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_old := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;

  select username into v_nombre from profiles where id = v_actor;

  if TG_TABLE_NAME = 'obra_compra_etapas' then
    v_etapa_obra := (v_new ->> 'id')::uuid;
    v_desc := case TG_OP
      when 'INSERT' then 'Creó la etapa "' || coalesce(v_new ->> 'nombre', '') || '"'
      when 'DELETE' then 'Borró la etapa "' || coalesce(v_new ->> 'nombre', '') || '"'
      when 'UPDATE' then
        case when (v_old ->> 'nombre') is distinct from (v_new ->> 'nombre')
          then 'Renombró la etapa: "' || coalesce(v_old ->> 'nombre', '') || '" → "' || coalesce(v_new ->> 'nombre', '') || '"'
        when (v_old ->> 'estado') is distinct from (v_new ->> 'estado')
          then 'Cambió el estado a "' || coalesce(v_new ->> 'estado', '') || '"'
        else 'Editó la etapa "' || coalesce(v_new ->> 'nombre', '') || '"' end
      end;

  elsif TG_TABLE_NAME = 'obra_compra_etapa_materiales' then
    v_etapa_obra := (v_new ->> 'obra_compra_etapa_id')::uuid;
    select descripcion into v_mat from panol_materiales where id = (v_new ->> 'material_id')::uuid;
    v_mat := coalesce(v_mat, 'un material');
    v_desc := case TG_OP
      when 'INSERT' then 'Agregó ' || v_mat || ' (' || coalesce(v_new ->> 'cantidad', '') || ' ' || coalesce(v_new ->> 'unidad', '') || ')'
      when 'DELETE' then 'Quitó ' || v_mat
      when 'UPDATE' then
        case when (v_old ->> 'cantidad') is distinct from (v_new ->> 'cantidad')
          then 'Cambió la cantidad de ' || v_mat || ': ' || coalesce(v_old ->> 'cantidad', '') || ' → ' || coalesce(v_new ->> 'cantidad', '')
        else 'Editó ' || v_mat end
      end;

  elsif TG_TABLE_NAME = 'linea_compra_etapas' then
    v_etapa_tpl := (v_new ->> 'id')::uuid;
    v_desc := case TG_OP
      when 'INSERT' then 'Creó la etapa de plantilla "' || coalesce(v_new ->> 'nombre', '') || '"'
      when 'DELETE' then 'Borró la etapa de plantilla "' || coalesce(v_new ->> 'nombre', '') || '"'
      else 'Editó la etapa de plantilla "' || coalesce(v_new ->> 'nombre', '') || '"' end;

  elsif TG_TABLE_NAME = 'linea_compra_etapa_materiales' then
    v_etapa_tpl := (v_new ->> 'compra_etapa_id')::uuid;
    select descripcion into v_mat from panol_materiales where id = (v_new ->> 'material_id')::uuid;
    v_mat := coalesce(v_mat, 'un material');
    v_desc := case TG_OP
      when 'INSERT' then 'Agregó ' || v_mat || ' a la plantilla'
      when 'DELETE' then 'Quitó ' || v_mat || ' de la plantilla'
      else 'Editó ' || v_mat || ' en la plantilla' end;
  end if;

  insert into compras_auditoria (
    tabla, registro_id, obra_compra_etapa_id, compra_etapa_id, accion,
    descripcion, datos_antes, datos_despues, actor_id, actor_nombre
  ) values (
    TG_TABLE_NAME,
    (v_new ->> 'id')::uuid,
    v_etapa_obra,
    v_etapa_tpl,
    lower(TG_OP),
    v_desc,
    v_old,
    case when TG_OP = 'DELETE' then null else v_new end,
    v_actor,
    coalesce(v_nombre, 'sistema')
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists trg_audit_obra_compra_etapas on public.obra_compra_etapas;
create trigger trg_audit_obra_compra_etapas
after insert or update or delete on public.obra_compra_etapas
for each row execute function public.compras_auditar();

drop trigger if exists trg_audit_obra_compra_etapa_materiales on public.obra_compra_etapa_materiales;
create trigger trg_audit_obra_compra_etapa_materiales
after insert or update or delete on public.obra_compra_etapa_materiales
for each row execute function public.compras_auditar();

drop trigger if exists trg_audit_linea_compra_etapas on public.linea_compra_etapas;
create trigger trg_audit_linea_compra_etapas
after insert or update or delete on public.linea_compra_etapas
for each row execute function public.compras_auditar();

drop trigger if exists trg_audit_linea_compra_etapa_materiales on public.linea_compra_etapa_materiales;
create trigger trg_audit_linea_compra_etapa_materiales
after insert or update or delete on public.linea_compra_etapa_materiales
for each row execute function public.compras_auditar();

-- ── 5. updated_at ───────────────────────────────────────────────────────────

drop trigger if exists trg_lcem_updated_at on public.linea_compra_etapa_materiales;
create trigger trg_lcem_updated_at
before update on public.linea_compra_etapa_materiales
for each row execute function public.touch_updated_at();

drop trigger if exists trg_ocem_updated_at on public.obra_compra_etapa_materiales;
create trigger trg_ocem_updated_at
before update on public.obra_compra_etapa_materiales
for each row execute function public.touch_updated_at();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Igual que el resto del módulo: autenticado lee y escribe. Compras, técnica y
-- oficina trabajan sobre las mismas etapas.

do $$
declare t text;
begin
  foreach t in array array[
    'linea_compra_etapa_materiales',
    'obra_compra_etapa_materiales'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated all" on public.%I', t, t);
    execute format(
      'create policy "%s authenticated all" on public.%I for all to authenticated '
      || 'using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- La auditoría es sólo de lectura para la app: las filas las escribe el trigger.
alter table public.compras_auditoria enable row level security;
drop policy if exists "compras_auditoria authenticated select" on public.compras_auditoria;
create policy "compras_auditoria authenticated select"
  on public.compras_auditoria for select to authenticated
  using (auth.uid() is not null);
grant select on public.compras_auditoria to authenticated;
