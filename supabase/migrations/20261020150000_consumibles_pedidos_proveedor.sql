-- Consumibles: pedidos al proveedor (Rebollar) armados por el pañol.
--
-- Los consumibles no pasan por Compras: el pañol arma el pedido como un carrito
-- (cualquier producto, esté o no en su mínimo), lo confirma y se lo manda al
-- proveedor. Cuando llega la mercadería, Ingresos lo recibe con los renglones
-- ya cargados.
--
-- Un carrito por sede y proveedor (estado "borrador") que cualquiera del pañol
-- va completando. Al confirmarlo pasa a "pedido". Lo recibido no se guarda en el
-- renglón: sale de los ingresos vigentes que apuntan a él
-- (consumibles_movimientos.pedido_item_id), así que anular un ingreso deja el
-- renglón pendiente otra vez sin tocar nada más. "cerrado" es para dar por
-- terminado un pedido al que le falta algo que no va a venir.

begin;

create table if not exists public.consumibles_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity,
  sede text not null check (sede in ('Pampa', 'Chubut')),
  proveedor text not null default 'Rebollar',
  estado text not null default 'borrador'
    check (estado in ('borrador', 'pedido', 'cerrado', 'anulado')),
  nota text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  pedido_at timestamptz,
  pedido_por uuid references public.profiles(id),
  cerrado_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Un solo carrito abierto por sede y proveedor.
create unique index if not exists consumibles_pedidos_un_borrador
  on public.consumibles_pedidos (sede, lower(proveedor))
  where estado = 'borrador';
create index if not exists consumibles_pedidos_sede_estado
  on public.consumibles_pedidos (sede, estado, created_at desc);

create table if not exists public.consumibles_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.consumibles_pedidos(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id),
  -- En unidades de compra (cajas, rollos), como se le pide al proveedor.
  cantidad numeric not null check (cantidad > 0),
  unidad_compra text,
  -- Unidades de entrega por unidad de compra al momento de pedir.
  factor numeric not null default 1 check (factor > 0),
  -- Costo estimado por unidad de compra, sin IVA (de la lista vigente).
  costo_compra_ars numeric,
  nota text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (pedido_id, material_id)
);
create index if not exists consumibles_pedido_items_pedido
  on public.consumibles_pedido_items (pedido_id);

alter table public.consumibles_movimientos
  add column if not exists pedido_item_id uuid references public.consumibles_pedido_items(id);
create index if not exists consumibles_movimientos_pedido_item
  on public.consumibles_movimientos (pedido_item_id)
  where pedido_item_id is not null;

create or replace function public.consumibles_pedidos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.estado = 'pedido' and old.estado is distinct from 'pedido' then
    new.pedido_at := coalesce(new.pedido_at, now());
    new.pedido_por := coalesce(new.pedido_por, auth.uid());
  end if;
  if new.estado in ('cerrado', 'anulado') and old.estado is distinct from new.estado then
    new.cerrado_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consumibles_pedidos_touch on public.consumibles_pedidos;
create trigger trg_consumibles_pedidos_touch
  before update on public.consumibles_pedidos
  for each row execute function public.consumibles_pedidos_touch();

-- Los renglones se tocan solo mientras el pedido es un carrito.
create or replace function public.consumibles_pedido_items_solo_borrador()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado
    from public.consumibles_pedidos
   where id = coalesce(new.pedido_id, old.pedido_id);
  if v_estado is distinct from 'borrador' then
    raise exception 'El pedido ya se confirmó: sus renglones no se cambian';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_consumibles_pedido_items_solo_borrador on public.consumibles_pedido_items;
create trigger trg_consumibles_pedido_items_solo_borrador
  before insert or update or delete on public.consumibles_pedido_items
  for each row execute function public.consumibles_pedido_items_solo_borrador();

-- Cuánto llegó de cada renglón, en unidades de entrega (ingresos vigentes).
create or replace view public.consumibles_pedido_items_recibido
with (security_invoker = true) as
select i.id as pedido_item_id,
       coalesce(sum(m.cantidad) filter (where m.anulado_at is null), 0) as recibido_entrega
  from public.consumibles_pedido_items i
  left join public.consumibles_movimientos m
    on m.pedido_item_id = i.id
   and m.tipo = 'ingreso'
 group by i.id;

alter table public.consumibles_pedidos enable row level security;
alter table public.consumibles_pedido_items enable row level security;

drop policy if exists "consumibles_pedidos select" on public.consumibles_pedidos;
create policy "consumibles_pedidos select" on public.consumibles_pedidos
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_pedidos insert" on public.consumibles_pedidos;
create policy "consumibles_pedidos insert" on public.consumibles_pedidos
  for insert with check (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_pedidos update" on public.consumibles_pedidos;
create policy "consumibles_pedidos update" on public.consumibles_pedidos
  for update using (public.panol_es_operador_solicitudes())
  with check (public.panol_es_operador_solicitudes());

drop policy if exists "consumibles_pedido_items select" on public.consumibles_pedido_items;
create policy "consumibles_pedido_items select" on public.consumibles_pedido_items
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_pedido_items write" on public.consumibles_pedido_items;
create policy "consumibles_pedido_items write" on public.consumibles_pedido_items
  for all using (public.panol_es_operador_solicitudes())
  with check (public.panol_es_operador_solicitudes());

grant select, insert, update on public.consumibles_pedidos to authenticated;
grant select, insert, update, delete on public.consumibles_pedido_items to authenticated;
grant select on public.consumibles_pedido_items_recibido to authenticated;

commit;
