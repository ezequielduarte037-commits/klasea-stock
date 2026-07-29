-- Archivar pedidos de laminación que quedaron viejos.
--
-- El problema: en Ingresos se acumulan órdenes que nunca se recibieron y
-- probablemente no se reciban. Ensucian la recepción y el contador de
-- pendientes, y no hay forma de sacarlas de en medio sin borrarlas.
--
-- Por qué una columna aparte y no un estado 'archivado':
--   1. El estado guarda un hecho del pedido (pendiente / entregado / cancelado).
--      Archivar es una decisión de la pantalla, no un cambio en el pedido: si
--      el material finalmente llega, tiene que volver a estar 'pendiente' tal
--      como estaba, sin tener que adivinar en qué estado estaba antes.
--   2. Ya existe trg_laminacion_pedido_sync_pr, que corre 'after update of
--      estado' y sincroniza purchase_requests. Archivar no es una entrega ni
--      una cancelación: no tiene que disparar esa sincronización.
--
-- 'cancelado' sigue significando lo que significaba: la compra se dio de baja.
-- Archivado es "no lo quiero ver, pero si aparece lo recibo".

alter table public.laminacion_pedidos
  add column if not exists archivado_at timestamptz,
  add column if not exists archivado_por uuid references public.profiles(id) on delete set null,
  add column if not exists archivado_motivo text;

comment on column public.laminacion_pedidos.archivado_at is
  'Fecha en que se archivó. NULL = activo. Archivar no cambia el estado del pedido: al desarchivar vuelve exactamente como estaba.';
comment on column public.laminacion_pedidos.archivado_por is
  'Quién lo archivó. Queda registro porque sacar un pedido de la recepción es una decisión, no un dato.';
comment on column public.laminacion_pedidos.archivado_motivo is
  'Motivo opcional escrito al archivar (por ejemplo: "el proveedor nunca lo entregó").';

-- Parcial: los archivados son pocos frente al total, y todas las consultas de
-- la pantalla filtran por "activos" (archivado_at is null) o listan archivados.
create index if not exists idx_laminacion_pedidos_archivado_at
  on public.laminacion_pedidos (archivado_at)
  where archivado_at is not null;
