-- Metadata para materializar automaticamente items de compras recibidos.
-- Permite enlazar un item de compra con el catalogo de laminacion y evitar duplicados.

alter table public.purchase_request_items
  add column if not exists material_id uuid references public.laminacion_materiales(id) on delete set null,
  add column if not exists materialized_at timestamptz,
  add column if not exists materialized_result jsonb;

create index if not exists idx_purchase_request_items_material_id
  on public.purchase_request_items(material_id)
  where material_id is not null;

create index if not exists idx_purchase_request_items_materialized_at
  on public.purchase_request_items(materialized_at)
  where materialized_at is not null;

comment on column public.purchase_request_items.material_id is
  'Material de laminacion asociado cuando el item viene desde una plantilla de linea.';

comment on column public.purchase_request_items.materialized_at is
  'Fecha en la que el item recibido fue materializado como ingreso/stock automatico.';

comment on column public.purchase_request_items.materialized_result is
  'Resumen JSON del resultado de materializacion automatica para auditoria.';
