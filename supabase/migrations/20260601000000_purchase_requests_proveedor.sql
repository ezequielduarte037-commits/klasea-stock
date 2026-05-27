-- Purchase Requests: campo "proveedor" simple
-- Texto libre por ahora; si en el futuro se vuelve entidad propia, se migra a FK.

alter table public.purchase_requests
  add column if not exists proveedor text;

comment on column public.purchase_requests.proveedor is
  'Nombre del proveedor (texto libre). Se carga al cotizar/comprar.';

create index if not exists idx_purchase_requests_proveedor
  on public.purchase_requests(proveedor)
  where proveedor is not null;
