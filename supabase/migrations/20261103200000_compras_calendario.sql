-- Calendario de compras (03/11/2026, pedido de Ezequiel): cuándo hay que
-- comprar cada ítem estándar de la matriz para que llegue a tiempo a cada barco.
--
--   se necesita    = desmolde de la obra + semana del rubro (o del ítem)
--   comprar antes  = se necesita − plazo del proveedor − margen
--
-- Las fechas las carga Compras y se van ajustando con el uso. Acá sólo se
-- guardan los parámetros; el calendario lo arma la app con la matriz, las obras
-- y el stock libre del pañol.
begin;
set local lock_timeout = '5s';

create or replace function public.compras_puede_planificar(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from public.profiles p
    where p.id = p_uid and (coalesce(p.is_admin, false) or p.role in ('admin', 'compras', 'oficina'))
  );
$$;
revoke all on function public.compras_puede_planificar(uuid) from public, anon;
grant execute on function public.compras_puede_planificar(uuid) to authenticated;

-- Semana (desde el desmolde) en que cada rubro tiene que estar en el pañol, por línea.
create table if not exists public.compras_calendario_rubros (
  linea text not null,
  categoria_id uuid not null references public.panol_categorias(id) on delete cascade,
  semana integer not null check (semana between -52 and 104),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (linea, categoria_id)
);

-- Excepción para un ítem puntual de la matriz de una línea.
create table if not exists public.compras_calendario_items (
  linea text not null,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  semana integer not null check (semana between -52 and 104),
  nota text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (linea, material_id)
);

-- Plazo de entrega por proveedor. La clave es el nombre en minúsculas, igual
-- que figura en la ficha del producto (panol_materiales.proveedor).
create table if not exists public.compras_plazos_proveedor (
  proveedor text primary key check (proveedor = lower(btrim(proveedor)) and proveedor <> ''),
  nombre text not null,
  dias integer not null check (dias between 0 and 365),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['compras_calendario_rubros', 'compras_calendario_items', 'compras_plazos_proveedor'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "calendario lectura" on public.%I', t);
    execute format('create policy "calendario lectura" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "calendario escritura" on public.%I', t);
    execute format('create policy "calendario escritura" on public.%I for all to authenticated using (public.compras_puede_planificar(auth.uid())) with check (public.compras_puede_planificar(auth.uid()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.compras_calendario_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_compras_calendario_rubros_touch on public.compras_calendario_rubros;
create trigger trg_compras_calendario_rubros_touch before insert or update on public.compras_calendario_rubros
  for each row execute function public.compras_calendario_touch();
drop trigger if exists trg_compras_calendario_items_touch on public.compras_calendario_items;
create trigger trg_compras_calendario_items_touch before insert or update on public.compras_calendario_items
  for each row execute function public.compras_calendario_touch();
drop trigger if exists trg_compras_plazos_proveedor_touch on public.compras_plazos_proveedor;
create trigger trg_compras_plazos_proveedor_touch before insert or update on public.compras_plazos_proveedor
  for each row execute function public.compras_calendario_touch();

commit;
