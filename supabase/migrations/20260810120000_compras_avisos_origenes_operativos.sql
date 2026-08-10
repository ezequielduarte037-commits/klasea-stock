-- Los avisos comenzaron con origen web/WhatsApp. Los flujos operativos de
-- Compras por etapa y Devoluciones de pañol agregaron orígenes propios, pero
-- el CHECK legado no se amplió y hacía fallar toda la transacción.

alter table public.compras_avisos
  drop constraint if exists compras_avisos_origen_check;

alter table public.compras_avisos
  add constraint compras_avisos_origen_check
  check (origen in (
    'web',
    'whatsapp',
    'compras_etapa',
    'panol_devolucion'
  ));

comment on column public.compras_avisos.origen is
  'Canal o flujo que creó el aviso: web, whatsapp, compras_etapa o panol_devolucion.';
