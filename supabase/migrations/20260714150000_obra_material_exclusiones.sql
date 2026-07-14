-- Exclusiones puntuales de materiales estándar por obra.
-- Permite que un item siga en la matriz de la línea, pero no aplique a una obra concreta.

create table if not exists public.panol_obra_material_exclusiones (
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (obra_id, material_id)
);

create index if not exists idx_panol_obra_material_exclusiones_material
  on public.panol_obra_material_exclusiones(material_id);

alter table public.panol_obra_material_exclusiones enable row level security;

drop policy if exists "panol_obra_material_exclusiones authenticated select" on public.panol_obra_material_exclusiones;
create policy "panol_obra_material_exclusiones authenticated select"
  on public.panol_obra_material_exclusiones
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_material_exclusiones authenticated insert" on public.panol_obra_material_exclusiones;
create policy "panol_obra_material_exclusiones authenticated insert"
  on public.panol_obra_material_exclusiones
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "panol_obra_material_exclusiones authenticated update" on public.panol_obra_material_exclusiones;
create policy "panol_obra_material_exclusiones authenticated update"
  on public.panol_obra_material_exclusiones
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "panol_obra_material_exclusiones authenticated delete" on public.panol_obra_material_exclusiones;
create policy "panol_obra_material_exclusiones authenticated delete"
  on public.panol_obra_material_exclusiones
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update, delete on public.panol_obra_material_exclusiones to authenticated;
