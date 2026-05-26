alter table public.purchase_requests
  add column if not exists source text,
  add column if not exists source_ref text,
  add column if not exists source_url text;

create index if not exists idx_purchase_requests_source on public.purchase_requests(source);
