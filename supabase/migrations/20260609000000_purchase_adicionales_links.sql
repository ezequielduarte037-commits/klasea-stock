-- Preserve product links from purchase request items without dumping long URLs in notes.

alter table public.purchase_additional_items
  add column if not exists purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  add column if not exists link_url text;

create index if not exists idx_purchase_additional_items_request_item
  on public.purchase_additional_items(purchase_request_item_id)
  where purchase_request_item_id is not null;
