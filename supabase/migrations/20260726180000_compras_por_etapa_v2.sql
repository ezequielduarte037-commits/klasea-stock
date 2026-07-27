-- ═════════════════════════════════════════════════════════════════════════════
-- Compras por Etapa v2 — desacople de las etapas de COMPRA respecto de las
-- etapas de PRODUCCIÓN.
--
-- Problema que resuelve: hasta ahora un pedido nacía 1 a 1 de una etapa de
-- producción (linea_procesos). En la práctica las compras de una obra se hacen
-- en unas pocas tandas ("etapa 1 de compras", "etapa 2"…) que NO coinciden con
-- las etapas productivas: una tanda de compra puede cubrir varias etapas de
-- producción, y se decide obra por obra.
--
-- Jerarquía nueva:
--   Obra → Etapa de COMPRA (N por obra, la arma el encargado)
--            └→ Etapas de PRODUCCIÓN asignadas (1..N)
--                 └→ materiales de la receta (linea_proceso_materiales)
--                      └→ opcionalmente atados a una TAREA de la etapa
--
-- Las etapas de compra se pueden predefinir por modelo (plantilla) y se copian
-- a la obra al arrancar; desde ahí son 100% editables sin tocar la plantilla.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 0. Formalizar lo que hoy existe sólo en el dashboard ────────────────────
-- Estas tres tablas se crearon a mano y nunca tuvieron migración. Se declaran
-- con IF NOT EXISTS para que un entorno nuevo (o un `db reset`) las levante
-- igual, sin pisar nada en producción.

create table if not exists public.linea_proceso_materiales (
  id uuid primary key default gen_random_uuid(),
  linea_proceso_id uuid not null references public.linea_procesos(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  cantidad numeric not null default 1,
  unidad text,
  notas text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (linea_proceso_id, material_id)
);

create table if not exists public.pedidos_produccion (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references public.produccion_obras(id) on delete cascade,
  obra_etapa_id uuid references public.obra_etapas(id) on delete set null,
  linea_proceso_id uuid references public.linea_procesos(id) on delete set null,
  titulo text,
  obra_codigo text,
  etapa_nombre text,
  estado text not null default 'pendiente',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pedidos_produccion_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_produccion(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text,
  codigo text,
  cantidad numeric not null default 1,
  cantidad_recibida numeric,
  unidad text,
  notas text,
  orden int not null default 0,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 1. Plantilla de etapas de compra (por modelo) ───────────────────────────
-- Opcional: si un modelo no tiene plantilla, la obra arranca vacía y el
-- encargado carga las etapas a mano.

create table if not exists public.linea_compra_etapas (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references public.lineas_produccion(id) on delete cascade,
  nombre text not null,
  descripcion text,
  orden int not null default 0,
  color text not null default '#8b5cf6',
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_linea_compra_etapas_linea
  on public.linea_compra_etapas(linea_id, orden);

-- Qué etapas de producción cubre cada etapa de compra de la plantilla.
create table if not exists public.linea_compra_etapa_procesos (
  compra_etapa_id uuid not null references public.linea_compra_etapas(id) on delete cascade,
  linea_proceso_id uuid not null references public.linea_procesos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (compra_etapa_id, linea_proceso_id)
);

create index if not exists idx_linea_compra_etapa_procesos_proceso
  on public.linea_compra_etapa_procesos(linea_proceso_id);

-- ── 2. Etapas de compra reales de una obra ──────────────────────────────────

create table if not exists public.obra_compra_etapas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  -- de qué fila de la plantilla salió (informativo; si se borra la plantilla la
  -- etapa de la obra sobrevive).
  origen_id uuid references public.linea_compra_etapas(id) on delete set null,
  nombre text not null,
  descripcion text,
  orden int not null default 0,
  color text not null default '#8b5cf6',
  estado text not null default 'pendiente',
  fecha_objetivo date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obra_compra_etapas_obra
  on public.obra_compra_etapas(obra_id, orden);

-- Etapas de producción asignadas a una etapa de compra de la obra.
-- Apunta a linea_procesos (la plantilla del modelo) y no a obra_etapas porque
-- la receta cuelga de ahí, y porque obra_etapas se materializa perezosamente.
create table if not exists public.obra_compra_etapa_procesos (
  obra_compra_etapa_id uuid not null references public.obra_compra_etapas(id) on delete cascade,
  linea_proceso_id uuid not null references public.linea_procesos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (obra_compra_etapa_id, linea_proceso_id)
);

create index if not exists idx_obra_compra_etapa_procesos_proceso
  on public.obra_compra_etapa_procesos(linea_proceso_id);

-- ── 3. Ajustes de materiales por obra ───────────────────────────────────────
-- Los materiales de una etapa de compra se CALCULAN (unión de las recetas de
-- las etapas de producción asignadas). Esta tabla guarda sólo las desviaciones
-- de esa obra puntual, para no ensuciar la receta del modelo:
--   • ajuste    → pisa la cantidad calculada
--   • exclusion → ese material no se compra en esta obra
--   • extra     → material que no está en ninguna receta y se suma a mano
create table if not exists public.obra_compra_etapa_ajustes (
  id uuid primary key default gen_random_uuid(),
  obra_compra_etapa_id uuid not null references public.obra_compra_etapas(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  tipo text not null default 'ajuste' check (tipo in ('ajuste', 'exclusion', 'extra')),
  cantidad numeric,
  unidad text,
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_compra_etapa_id, material_id)
);

create index if not exists idx_obra_compra_etapa_ajustes_material
  on public.obra_compra_etapa_ajustes(material_id);

-- ── 4. Enganches con lo existente ───────────────────────────────────────────

-- El pedido pasa a nacer de una etapa de COMPRA. linea_proceso_id queda por
-- retrocompatibilidad (pedidos viejos) y para pedidos de una sola etapa.
alter table public.pedidos_produccion
  add column if not exists obra_compra_etapa_id uuid
  references public.obra_compra_etapas(id) on delete set null;

alter table public.pedidos_produccion alter column linea_proceso_id drop not null;
alter table public.pedidos_produccion alter column obra_etapa_id drop not null;

create index if not exists idx_pedidos_produccion_compra_etapa
  on public.pedidos_produccion(obra_compra_etapa_id);

-- Un material de la receta puede atarse a una tarea concreta de la etapa.
-- Nullable: si es null, el material es "de la etapa" en general.
alter table public.linea_proceso_materiales
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

create index if not exists idx_linea_proceso_materiales_tarea
  on public.linea_proceso_materiales(linea_proceso_tarea_id);

-- Trazabilidad en el item del pedido: de qué etapa productiva y de qué tarea
-- vino cada material. Sirve para que pañol y compras sepan para qué es.
alter table public.pedidos_produccion_items
  add column if not exists origen_proceso_id uuid
  references public.linea_procesos(id) on delete set null;

alter table public.pedidos_produccion_items
  add column if not exists origen_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

alter table public.pedidos_produccion_items
  add column if not exists origen_etapa_nombre text;

alter table public.pedidos_produccion_items
  add column if not exists origen_tarea_nombre text;

-- ── 5. updated_at automático ────────────────────────────────────────────────
-- public.touch_updated_at() ya existe (migración de purchase_requests).

drop trigger if exists trg_linea_compra_etapas_updated_at on public.linea_compra_etapas;
create trigger trg_linea_compra_etapas_updated_at
before update on public.linea_compra_etapas
for each row execute function public.touch_updated_at();

drop trigger if exists trg_obra_compra_etapas_updated_at on public.obra_compra_etapas;
create trigger trg_obra_compra_etapas_updated_at
before update on public.obra_compra_etapas
for each row execute function public.touch_updated_at();

drop trigger if exists trg_obra_compra_etapa_ajustes_updated_at on public.obra_compra_etapa_ajustes;
create trigger trg_obra_compra_etapa_ajustes_updated_at
before update on public.obra_compra_etapa_ajustes
for each row execute function public.touch_updated_at();

drop trigger if exists trg_linea_proceso_materiales_updated_at on public.linea_proceso_materiales;
create trigger trg_linea_proceso_materiales_updated_at
before update on public.linea_proceso_materiales
for each row execute function public.touch_updated_at();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Convención del proyecto: cualquier usuario autenticado lee y escribe; el
-- recorte por rol (técnica / oficina / admin editan, compras sólo gestiona
-- pedidos) se hace en la UI, igual que en el resto del módulo.

do $$
declare t text;
begin
  foreach t in array array[
    'linea_compra_etapas',
    'linea_compra_etapa_procesos',
    'obra_compra_etapas',
    'obra_compra_etapa_procesos',
    'obra_compra_etapa_ajustes',
    'linea_proceso_materiales',
    'pedidos_produccion',
    'pedidos_produccion_items'
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
