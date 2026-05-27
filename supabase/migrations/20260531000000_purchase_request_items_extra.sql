alter table public.purchase_request_items
  add column if not exists image_url  text,
  add column if not exists image_path text,
  add column if not exists link_url   text;
