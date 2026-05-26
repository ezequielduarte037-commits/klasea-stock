-- Purchase Requests: costos, fechas de entrega y recepción
-- Agrega columnas para presupuesto, seguimiento y confirmación de recepción.

alter table public.purchase_requests
  add column if not exists estimated_amount    decimal(12,2),
  add column if not exists actual_amount       decimal(12,2),
  add column if not exists estimated_delivery_at date,
  add column if not exists delivered_at        timestamptz,
  add column if not exists received_quantity   text,
  add column if not exists receipt_notes       text,
  add column if not exists invoice_url         text,
  add column if not exists invoice_path        text;

comment on column public.purchase_requests.estimated_amount    is 'Monto presupuestado / cotizado (ingresado por compras al cotizar)';
comment on column public.purchase_requests.actual_amount       is 'Costo real de la compra (ingresado al comprar)';
comment on column public.purchase_requests.estimated_delivery_at is 'Fecha estimada de entrega acordada con el proveedor';
comment on column public.purchase_requests.delivered_at        is 'Momento en que se registró la recepción';
comment on column public.purchase_requests.received_quantity   is 'Cantidad recibida (ej. "10 unidades", "3 m²")';
comment on column public.purchase_requests.receipt_notes       is 'Novedades al recibir el pedido';
comment on column public.purchase_requests.invoice_url         is 'URL del comprobante / factura adjunta';
comment on column public.purchase_requests.invoice_path        is 'Path en storage de la factura adjunta';

-- Bucket para facturas/comprobantes (mismo bucket, se reusa)
-- Ya existe: purchase-request-photos
