-- Purchase adicionales: operational sheets by boat/project.

create extension if not exists pgcrypto;

create table if not exists public.purchase_additional_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid references public.produccion_obras(id) on delete set null,
  notes text,
  status text not null default 'activo'
    check (status in ('activo', 'archivado')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_additional_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.purchase_additional_boards(id) on delete cascade,
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  entry_date date,
  provider text,
  detail text not null,
  amount numeric(14,2),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  link_url text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_additional_boards_project
  on public.purchase_additional_boards(project_id)
  where project_id is not null;

create unique index if not exists idx_purchase_additional_boards_project_active_unique
  on public.purchase_additional_boards(project_id)
  where project_id is not null and status = 'activo';

create unique index if not exists idx_purchase_additional_boards_name_active_unique
  on public.purchase_additional_boards(lower(name))
  where status = 'activo';

create index if not exists idx_purchase_additional_items_board
  on public.purchase_additional_items(board_id, entry_date desc nulls last);

create index if not exists idx_purchase_additional_items_request
  on public.purchase_additional_items(purchase_request_id)
  where purchase_request_id is not null;

drop trigger if exists trg_purchase_additional_boards_updated_at on public.purchase_additional_boards;
create trigger trg_purchase_additional_boards_updated_at
before update on public.purchase_additional_boards
for each row execute function public.touch_updated_at();

drop trigger if exists trg_purchase_additional_items_updated_at on public.purchase_additional_items;
create trigger trg_purchase_additional_items_updated_at
before update on public.purchase_additional_items
for each row execute function public.touch_updated_at();

alter table public.purchase_additional_boards enable row level security;
alter table public.purchase_additional_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_boards' and policyname = 'purchase users can read additional boards') then
    create policy "purchase users can read additional boards"
      on public.purchase_additional_boards for select
      using (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_boards' and policyname = 'purchase users can create additional boards') then
    create policy "purchase users can create additional boards"
      on public.purchase_additional_boards for insert
      with check (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_boards' and policyname = 'purchase users can update additional boards') then
    create policy "purchase users can update additional boards"
      on public.purchase_additional_boards for update
      using (public.is_purchase_user(auth.uid()))
      with check (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_boards' and policyname = 'purchase users can delete additional boards') then
    create policy "purchase users can delete additional boards"
      on public.purchase_additional_boards for delete
      using (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_items' and policyname = 'purchase users can read additional items') then
    create policy "purchase users can read additional items"
      on public.purchase_additional_items for select
      using (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_items' and policyname = 'purchase users can create additional items') then
    create policy "purchase users can create additional items"
      on public.purchase_additional_items for insert
      with check (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_items' and policyname = 'purchase users can update additional items') then
    create policy "purchase users can update additional items"
      on public.purchase_additional_items for update
      using (public.is_purchase_user(auth.uid()))
      with check (public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_additional_items' and policyname = 'purchase users can delete additional items') then
    create policy "purchase users can delete additional items"
      on public.purchase_additional_items for delete
      using (public.is_purchase_user(auth.uid()));
  end if;
end $$;

insert into public.purchase_additional_boards(name, notes)
select v.name, 'Importado desde Adicionales (1).xlsx'
from (values
  ('K64-19 - Tramposa'),
  ('MONACO'),
  ('K37-38'),
  ('NINA')
) as v(name)
where not exists (
  select 1
  from public.purchase_additional_boards b
  where lower(b.name) = lower(v.name)
);

with seed(board_name, entry_date, provider, detail, amount) as (
  values
    ('K64-19 - Tramposa', date '2026-04-30', 'HIDRAULICA DELTA', 'FLEXIBLES', null::numeric),
    ('K64-19 - Tramposa', date '2026-04-30', 'MARIANO', '10 LUCES CORTESIA', 130000.00),
    ('K64-19 - Tramposa', date '2026-05-13', 'TRIMER', 'ANODOS + CHAPA FLAP', 1505000.00),
    ('K64-19 - Tramposa', date '2026-05-13', 'FLOJUMAR', 'REPUESTOS FLAP', 68550.00),
    ('K64-19 - Tramposa', date '2026-05-13', 'CASA IRIARTE', 'NIPLES, CODOS, VALVULAS', 277188.12),
    ('K64-19 - Tramposa', date '2026-05-13', 'PINTURERIA PLATERO', 'ANTIFOULING', 1579885.00),
    ('MONACO', date '2026-05-21', 'DANIEL FLETE', 'TRASLADO MULTIPLES HOJAS DE FORMICA', 70000.00),
    ('MONACO', date '2026-05-20', 'FORMICOLOR S.A', 'FORMICA CHOCOLATE "MONACO"', 229060.00),
    ('MONACO', date '2026-05-19', 'GRUPO MARQUEZ', 'ANAFE CTR264KC01 "MONACO"', 794000.00),
    ('MONACO', date '2026-05-26', 'ACRILICOS VICTORIA', 'JUEGO DE POSAVASOS', 225000.00),
    ('MONACO', date '2026-05-13', 'MERCADO LIBRE', 'BACHA COCINA', 70000.00),
    ('MONACO', date '2026-05-27', 'COOKING SOLUTIONS', 'MICROONDAS', 650000.00),
    ('MONACO', date '2026-05-13', 'FLOJUMAR', 'REPUESTOS FLAP BENNET TRABAS', 102855.00),
    ('MONACO', date '2026-05-13', 'TRIMER', 'CHAPON TPA3612 FLAP', 615000.00),
    ('MONACO', null::date, 'DEKTON', 'Pendiente', null::numeric),
    ('MONACO', null::date, 'ARBA', 'Pendiente', null::numeric),
    ('MONACO', null::date, 'PNA', 'Pendiente', null::numeric),
    ('MONACO', null::date, 'SEGURO', 'Pendiente', null::numeric),
    ('MONACO', null::date, 'FELIPE DETAILING', 'DETAILING SALA DE MAQUINAS', null::numeric),
    ('MONACO', null::date, 'FONDO', 'Pendiente', null::numeric),
    ('MONACO', null::date, 'GALLUS', 'Pendiente', 4970000.00),
    ('NINA', date '2026-05-14', 'BARON', 'TAPA ESTANCO', 89100.00)
)
insert into public.purchase_additional_items(board_id, entry_date, provider, detail, amount)
select b.id, s.entry_date, s.provider, s.detail, s.amount
from seed s
join public.purchase_additional_boards b on lower(b.name) = lower(s.board_name)
where not exists (
  select 1
  from public.purchase_additional_items i
  where i.board_id = b.id
    and coalesce(i.entry_date, date '1900-01-01') = coalesce(s.entry_date, date '1900-01-01')
    and coalesce(lower(i.provider), '') = coalesce(lower(s.provider), '')
    and lower(i.detail) = lower(s.detail)
    and coalesce(i.amount, -1) = coalesce(s.amount, -1)
);
