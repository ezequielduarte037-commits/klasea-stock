-- Reparacion idempotente para instalaciones donde el modulo de egresos
-- quedo con RPCs actualizadas pero sin columnas de tracking en snapshot.

alter table public.panol_obra_materiales_snapshot
  alter column obra_id drop not null,
  add column if not exists obra_origen_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists egreso_destino_obra_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists cantidad_egresada numeric not null default 0,
  add column if not exists egreso_at timestamptz,
  add column if not exists egreso_por uuid references public.profiles(id) on delete set null,
  add column if not exists egreso_nota text,
  add column if not exists retirado_por text,
  add column if not exists sector_destino text,
  add column if not exists stock_sede text,
  add column if not exists stock_nota text,
  add column if not exists es_adicional boolean not null default false;

create index if not exists idx_panol_obra_snapshot_egreso_at
  on public.panol_obra_materiales_snapshot(egreso_at desc)
  where egreso_at is not null;

create index if not exists idx_panol_obra_snapshot_egreso_destino
  on public.panol_obra_materiales_snapshot(egreso_destino_obra_id)
  where egreso_destino_obra_id is not null;

create index if not exists idx_panol_obra_snapshot_stock_general
  on public.panol_obra_materiales_snapshot(stock_sede, estado)
  where obra_id is null;

alter table public.panol_obra_materiales_snapshot
  drop constraint if exists panol_obra_snapshot_estado_chk;

alter table public.panol_obra_materiales_snapshot
  add constraint panol_obra_snapshot_estado_chk
  check (
    estado in (
      'pendiente',
      'pedido',
      'comprado',
      'en_panol',
      'parcial',
      'recibido',
      'problema',
      'sin_info',
      'falta_stock',
      'rechazado',
      'egresado',
      'cancelado'
    )
  ) not valid;

alter table public.panol_obra_materiales_snapshot
  drop constraint if exists panol_obra_snapshot_recepcion_estado_chk;

alter table public.panol_obra_materiales_snapshot
  add constraint panol_obra_snapshot_recepcion_estado_chk
  check (
    recepcion_estado is null
    or recepcion_estado in (
      'pendiente',
      'recibido',
      'parcial',
      'sin_info',
      'falta_stock',
      'rechazado',
      'egresado'
    )
  ) not valid;
