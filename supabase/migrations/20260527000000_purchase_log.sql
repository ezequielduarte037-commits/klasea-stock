create table if not exists public.purchase_log (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount decimal(12,2),
  provider text,
  notes text,
  invoice_url text,
  invoice_path text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  purchased_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_log enable row level security;

create policy "purchase_log_select"
  on public.purchase_log for select
  using (public.is_purchase_user(auth.uid()));

create policy "purchase_log_insert"
  on public.purchase_log for insert
  with check (public.is_purchase_user(auth.uid()));

create policy "purchase_log_update"
  on public.purchase_log for update
  using (public.is_purchase_user(auth.uid()));

create policy "purchase_log_delete"
  on public.purchase_log for delete
  using (public.is_purchase_user(auth.uid()));

create index if not exists idx_purchase_log_created_by on public.purchase_log(created_by);
create index if not exists idx_purchase_log_purchased_at on public.purchase_log(purchased_at desc);
