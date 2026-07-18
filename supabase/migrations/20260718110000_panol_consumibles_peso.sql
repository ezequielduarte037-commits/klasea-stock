-- Consumibles + peso unitario para conteo por balanza.
-- Idempotente: se puede correr varias veces sin romper entornos ya migrados.

alter table public.panol_materiales
  add column if not exists es_consumible boolean not null default false,
  add column if not exists peso_unitario_g numeric,
  add column if not exists peso_muestra_piezas numeric,
  add column if not exists peso_calibrado_at timestamptz;

create index if not exists idx_panol_materiales_consumibles
  on public.panol_materiales (es_consumible, descripcion)
  where activo is distinct from false;

comment on column public.panol_materiales.es_consumible is
  'Marca materiales que se gestionan como consumibles en panol.';

comment on column public.panol_materiales.peso_unitario_g is
  'Peso unitario en gramos para estimar cantidad desde balanza.';

comment on column public.panol_materiales.peso_muestra_piezas is
  'Cantidad de piezas usada en la ultima calibracion de peso.';

comment on column public.panol_materiales.peso_calibrado_at is
  'Fecha/hora de la ultima calibracion de peso unitario.';
