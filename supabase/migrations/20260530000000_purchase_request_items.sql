create table public.purchase_request_items (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.purchase_requests(id) on delete cascade,
  description   text not null,
  quantity      text,
  unit          text default 'unidad',
  status        text not null default 'pendiente'
                check (status in ('pendiente','en_panol','pedido','recibido','cancelado')),
  notes         text,
  image_url     text,
  image_path    text,
  link_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_purchase_request_items_request on public.purchase_request_items(request_id);

alter table public.purchase_request_items enable row level security;

create policy "Authenticated can read items"
  on public.purchase_request_items for select
  to authenticated using (true);

create policy "Authenticated can insert items"
  on public.purchase_request_items for insert
  to authenticated with check (true);

create policy "Authenticated can update items"
  on public.purchase_request_items for update
  to authenticated using (true);

create policy "Authenticated can delete items"
  on public.purchase_request_items for delete
  to authenticated using (true);
