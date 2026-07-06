-- Persistencia de decisiones del asistente de duplicados del catalogo.
-- Permite marcar pares de materiales como "no son duplicados" para que no
-- reaparezcan cada vez que se recalcula la heuristica en el frontend.

create table if not exists public.panol_material_duplicate_decisions (
  id uuid primary key default gen_random_uuid(),
  material_a_id uuid not null references public.panol_materiales(id) on delete cascade,
  material_b_id uuid not null references public.panol_materiales(id) on delete cascade,
  decision text not null default 'not_duplicate',
  group_key text,
  reason text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_material_duplicate_decisions_order_chk check (material_a_id < material_b_id),
  constraint panol_material_duplicate_decisions_decision_chk check (decision in ('not_duplicate'))
);

create unique index if not exists idx_panol_material_duplicate_decisions_pair
  on public.panol_material_duplicate_decisions(material_a_id, material_b_id);

create index if not exists idx_panol_material_duplicate_decisions_material_a
  on public.panol_material_duplicate_decisions(material_a_id);

create index if not exists idx_panol_material_duplicate_decisions_material_b
  on public.panol_material_duplicate_decisions(material_b_id);

create or replace function public.touch_panol_material_duplicate_decisions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_panol_material_duplicate_decisions_updated_at
  on public.panol_material_duplicate_decisions;

create trigger trg_panol_material_duplicate_decisions_updated_at
  before update on public.panol_material_duplicate_decisions
  for each row
  execute function public.touch_panol_material_duplicate_decisions_updated_at();

alter table public.panol_material_duplicate_decisions enable row level security;

drop policy if exists "panol_material_duplicate_decisions_select_authenticated"
  on public.panol_material_duplicate_decisions;
create policy "panol_material_duplicate_decisions_select_authenticated"
  on public.panol_material_duplicate_decisions
  for select
  to authenticated
  using (true);

drop policy if exists "panol_material_duplicate_decisions_insert_authenticated"
  on public.panol_material_duplicate_decisions;
create policy "panol_material_duplicate_decisions_insert_authenticated"
  on public.panol_material_duplicate_decisions
  for insert
  to authenticated
  with check (true);

drop policy if exists "panol_material_duplicate_decisions_update_authenticated"
  on public.panol_material_duplicate_decisions;
create policy "panol_material_duplicate_decisions_update_authenticated"
  on public.panol_material_duplicate_decisions
  for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.panol_material_duplicate_decisions to authenticated;
