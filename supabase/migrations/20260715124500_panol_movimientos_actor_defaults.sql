-- Trazabilidad de actores en pañol.
-- De ahora en adelante, los movimientos de stock y los productos creados
-- guardan el usuario autenticado por defecto cuando el RPC/insert no lo setea explícitamente.

alter table public.panol_obra_materiales_snapshot
  add column if not exists egreso_por uuid references public.profiles(id) on delete set null;

alter table public.panol_obra_materiales_snapshot
  alter column egreso_por set default auth.uid();

alter table public.panol_materiales
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

create index if not exists idx_panol_materiales_created_by
  on public.panol_materiales(created_by);

comment on column public.panol_obra_materiales_snapshot.egreso_por is
  'Usuario que registro el movimiento de panol. Historicamente usado para egresos; ahora tambien identifica ingresos/asignaciones.';

comment on column public.panol_materiales.created_by is
  'Usuario que creo el material en el catalogo.';
