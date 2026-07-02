-- Overrides de condicionantes por obra.
-- Si no hay fila para una obra/condicionante, aplica activo_por_defecto de la matriz.

create table if not exists public.panol_obra_matriz_condicionantes (
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  condicionante_id uuid not null references public.panol_matriz_condicionantes(id) on delete cascade,
  activo boolean not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (obra_id, condicionante_id)
);

create index if not exists idx_panol_obra_matriz_condicionantes_cond
  on public.panol_obra_matriz_condicionantes(condicionante_id);

alter table public.panol_obra_matriz_condicionantes enable row level security;

drop policy if exists "panol_obra_matriz_condicionantes authenticated select" on public.panol_obra_matriz_condicionantes;
create policy "panol_obra_matriz_condicionantes authenticated select"
  on public.panol_obra_matriz_condicionantes
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_matriz_condicionantes authenticated insert" on public.panol_obra_matriz_condicionantes;
create policy "panol_obra_matriz_condicionantes authenticated insert"
  on public.panol_obra_matriz_condicionantes
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "panol_obra_matriz_condicionantes authenticated update" on public.panol_obra_matriz_condicionantes;
create policy "panol_obra_matriz_condicionantes authenticated update"
  on public.panol_obra_matriz_condicionantes
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "panol_obra_matriz_condicionantes authenticated delete" on public.panol_obra_matriz_condicionantes;
create policy "panol_obra_matriz_condicionantes authenticated delete"
  on public.panol_obra_matriz_condicionantes
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update, delete on public.panol_obra_matriz_condicionantes to authenticated;
