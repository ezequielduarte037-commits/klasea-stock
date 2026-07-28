-- Plazos productivos por línea y períodos no laborables por obra.
--
-- La duración total de una etapa vive en linea_procesos/obra_etapas.
-- Las tareas pueden ejecutarse en simultáneo y no se suman para obtener
-- el fin de una etapa.

alter table public.lineas_produccion
  add column if not exists semanas_produccion_estimadas numeric(7,2);

comment on column public.lineas_produccion.semanas_produccion_estimadas is
  'Plazo general estimado de producción para una obra de esta línea. Es informativo y no reemplaza la duración explícita de cada etapa.';

do $$
begin
  alter table public.lineas_produccion
    add constraint lineas_produccion_semanas_estimadas_chk
    check (semanas_produccion_estimadas is null or semanas_produccion_estimadas > 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.produccion_obra_periodos_no_laborables (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  tipo text not null default 'vacaciones',
  fecha_desde date not null,
  fecha_hasta date not null,
  descripcion text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint produccion_periodos_tipo_chk
    check (tipo in ('vacaciones', 'pausa', 'feriado')),
  constraint produccion_periodos_fechas_chk
    check (fecha_hasta >= fecha_desde)
);

create index if not exists idx_produccion_periodos_obra_fechas
  on public.produccion_obra_periodos_no_laborables (obra_id, fecha_desde, fecha_hasta);

comment on table public.produccion_obra_periodos_no_laborables is
  'Vacaciones, pausas y feriados propios de una obra que se excluyen del cálculo de días productivos.';

comment on column public.produccion_obras.atraso_dias is
  'Ajuste manual adicional en días. Las vacaciones planificadas se registran como períodos no laborables para evitar doble conteo.';

comment on column public.produccion_obras.atraso_motivo is
  'Motivo del ajuste manual adicional aplicado al cronograma.';

alter table public.produccion_obra_periodos_no_laborables enable row level security;

drop policy if exists "produccion_periodos_select_authenticated" on public.produccion_obra_periodos_no_laborables;
create policy "produccion_periodos_select_authenticated"
  on public.produccion_obra_periodos_no_laborables
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "produccion_periodos_insert_authenticated" on public.produccion_obra_periodos_no_laborables;
create policy "produccion_periodos_insert_authenticated"
  on public.produccion_obra_periodos_no_laborables
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "produccion_periodos_update_authenticated" on public.produccion_obra_periodos_no_laborables;
create policy "produccion_periodos_update_authenticated"
  on public.produccion_obra_periodos_no_laborables
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "produccion_periodos_delete_authenticated" on public.produccion_obra_periodos_no_laborables;
create policy "produccion_periodos_delete_authenticated"
  on public.produccion_obra_periodos_no_laborables
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update, delete
  on public.produccion_obra_periodos_no_laborables
  to authenticated;

do $$
begin
  alter publication supabase_realtime
    add table public.produccion_obra_periodos_no_laborables;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
