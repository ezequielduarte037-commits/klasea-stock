-- purchase_request_items.material_id ahora es polimórfico
-- ─────────────────────────────────────────────────────────────────────────────
-- La FK original apuntaba a laminacion_materiales(id), pero el campo necesita
-- alojar también UUIDs de materiales (madera) y eventualmente otros catálogos.
-- Dropeamos la FK y agregamos catalog_source para saber a qué tabla va.

alter table public.purchase_request_items
  drop constraint if exists purchase_request_items_material_id_fkey;

alter table public.purchase_request_items
  add column if not exists catalog_source text;

comment on column public.purchase_request_items.material_id is
  'UUID del material en el catálogo correspondiente. Polimórfico: puede apuntar a laminacion_materiales o a materiales (madera). El campo catalog_source indica de qué tabla viene.';

comment on column public.purchase_request_items.catalog_source is
  'Origen del material_id: "laminacion" (tabla laminacion_materiales), "madera" (tabla materiales), o null para texto libre.';

create index if not exists idx_purchase_request_items_catalog_source
  on public.purchase_request_items(catalog_source)
  where catalog_source is not null;
