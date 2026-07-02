-- ============================================================================
-- CÓDIGO DE BARRA PARA MATERIALES
-- ============================================================================
-- Agrega la columna codigo_barra a panol_materiales para soportar
-- lectores de código de barras tipo keyboard-wedge.

alter table public.panol_materiales 
  add column if not exists codigo_barra text;

create index if not exists idx_panol_materiales_codigo_barra 
  on public.panol_materiales(codigo_barra);

comment on column public.panol_materiales.codigo_barra is 
  'Código de barras escaneable (lector keyboard-wedge). Único por material.';
