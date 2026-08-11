-- Compras y Laminación representan dos hechos distintos:
--   * purchase_requests.status = 'recibido' cierra el circuito comercial.
--   * laminacion_movimientos registra una recepción física confirmada.
--
-- Se revierte la materialización automática histórica para evitar stock duplicado.
-- Antes de borrar del libro operativo, guardamos una copia recuperable y privada.

create table if not exists public.laminacion_movimientos_auto_compras_revertidos as
select
  movimiento.*,
  now()::timestamptz as revertido_at,
  ''::text as revertido_motivo
from public.laminacion_movimientos movimiento
where false;

alter table public.laminacion_movimientos_auto_compras_revertidos enable row level security;

comment on table public.laminacion_movimientos_auto_compras_revertidos is
  'Respaldo privado de ingresos automáticos eliminados del stock de Laminación el 11/08/2026.';

insert into public.laminacion_movimientos_auto_compras_revertidos
select
  movimiento.*,
  now(),
  'Revertido: marcar recibido en Compras no confirma una recepción física.'
from public.laminacion_movimientos movimiento
where movimiento.tipo = 'ingreso'
  and movimiento.observaciones ilike 'Auto desde compras PR-%'
  and not exists (
    select 1
    from public.laminacion_movimientos_auto_compras_revertidos respaldo
    where respaldo.id = movimiento.id
  );

delete from public.laminacion_movimientos movimiento
where movimiento.tipo = 'ingreso'
  and movimiento.observaciones ilike 'Auto desde compras PR-%';

update public.purchase_request_items item
set
  materialized_at = null,
  materialized_result = null
where item.materialized_result ->> 'type' = 'laminacion';

comment on column public.purchase_request_items.materialized_at is
  'Campo legado. Compras ya no materializa ingresos físicos de Laminación.';

comment on column public.purchase_request_items.materialized_result is
  'Campo legado. Compras ya no materializa ingresos físicos de Laminación.';
