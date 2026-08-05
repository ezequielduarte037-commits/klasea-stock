-- Permitir la categoria 'ot' en los adjuntos de logistica.
--
-- El selector de la pantalla ofrece cinco categorias (OT/plano, remito, factura,
-- foto, otro) pero el check de la tabla solo aceptaba cuatro: al elegir
-- "OT / plano" la insercion fallaba con
--   violates check constraint "calendario_eventos_archivos_categoria_check".
--
-- La categoria es legitima —a un flete se le adjunta la orden de trabajo o el
-- plano de lo que se traslada— asi que se agrega al check en vez de sacarla de
-- la pantalla.

alter table public.calendario_eventos_archivos
  drop constraint if exists calendario_eventos_archivos_categoria_check;

alter table public.calendario_eventos_archivos
  add constraint calendario_eventos_archivos_categoria_check
  check (categoria in ('ot', 'remito', 'factura', 'foto', 'otro'));

comment on column public.calendario_eventos_archivos.categoria is
  'Tipo de adjunto: ot (orden de trabajo o plano), remito, factura, foto u otro. Mantener en sintonia con ARCHIVO_CATEGORIAS de LogisticaCalendarioScreen.jsx.';
