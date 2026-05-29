-- purchase_request_items.destination
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite que cada ítem del pedido tenga su propio destino libre:
--   - "Stock Chubut 2120"
--   - "Stock Pampa 1050"
--   - "Obra K52-26"
--   - etc.
-- Un mismo purchase_request puede agrupar ítems para varios destinos
-- (caso típico de los emails reales: "Obra K52-26 + Stock Pampa + Stock Chubut").

alter table public.purchase_request_items
  add column if not exists destination text;

comment on column public.purchase_request_items.destination is
  'Texto libre con el destino del ítem: "Obra K52-26", "Stock Chubut 2120", "Stock Pampa 1050", etc.';

create index if not exists idx_purchase_request_items_destination
  on public.purchase_request_items(destination)
  where destination is not null;
