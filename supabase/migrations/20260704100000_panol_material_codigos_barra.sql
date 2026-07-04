-- Codigos de barra multiples por material.
-- Mantiene public.panol_materiales.codigo_barra como campo legacy/principal y
-- agrega una tabla hija para marcas, proveedores o empaques alternativos.

create table if not exists public.panol_material_codigos_barra (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  codigo text not null,
  etiqueta text,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_material_codigos_barra_codigo_not_blank check (btrim(codigo) <> '')
);

create unique index if not exists uq_panol_material_codigos_barra_codigo_activo
  on public.panol_material_codigos_barra (lower(btrim(codigo)))
  where activo;

create index if not exists idx_panol_material_codigos_barra_material
  on public.panol_material_codigos_barra (material_id)
  where activo;

create index if not exists idx_panol_material_codigos_barra_codigo
  on public.panol_material_codigos_barra (lower(btrim(codigo)));

drop trigger if exists trg_panol_material_codigos_barra_updated on public.panol_material_codigos_barra;
create trigger trg_panol_material_codigos_barra_updated
before update on public.panol_material_codigos_barra
for each row execute function public.touch_updated_at();

alter table public.panol_material_codigos_barra enable row level security;

drop policy if exists "panol_material_codigos_barra select authenticated" on public.panol_material_codigos_barra;
create policy "panol_material_codigos_barra select authenticated"
  on public.panol_material_codigos_barra for select
  using (auth.uid() is not null);

drop policy if exists "panol_material_codigos_barra insert authenticated" on public.panol_material_codigos_barra;
create policy "panol_material_codigos_barra insert authenticated"
  on public.panol_material_codigos_barra for insert
  with check (auth.uid() is not null);

drop policy if exists "panol_material_codigos_barra update authenticated" on public.panol_material_codigos_barra;
create policy "panol_material_codigos_barra update authenticated"
  on public.panol_material_codigos_barra for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "panol_material_codigos_barra delete authenticated" on public.panol_material_codigos_barra;
create policy "panol_material_codigos_barra delete authenticated"
  on public.panol_material_codigos_barra for delete
  using (auth.uid() is not null);

grant select, insert, update, delete on public.panol_material_codigos_barra to authenticated;

insert into public.panol_material_codigos_barra (material_id, codigo, etiqueta, activo)
select m.id, btrim(m.codigo_barra), 'Principal', true
from public.panol_materiales m
where nullif(btrim(m.codigo_barra), '') is not null
on conflict (lower(btrim(codigo))) where activo do nothing;

comment on table public.panol_material_codigos_barra is
  'Codigos de barra alternativos por material. Permite varios codigos para un mismo item sin duplicar catalogo.';
