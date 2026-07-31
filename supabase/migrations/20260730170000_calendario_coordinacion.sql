-- Calendario: la coordinación es parte del evento, no una nota al margen.
--
-- Un desmolde no es una fecha: es grúa + camión + cuadrilla acordados. Hasta
-- ahora eso vivía (cuando vivía) mezclado en `notas`, invisible sin abrir el
-- evento. La columna `coordinacion` guarda el checklist como jsonb
-- ([{ "item": "Grúa", "ok": true }, ...]).
--
-- ¿Por qué jsonb y no una tabla hija? Los ítems son pocos (3-4), salen de
-- presets por tipo, nunca se consultan solos ni se filtran en SQL: siempre
-- se leen y se escriben junto con su evento. Una tabla hija agregaría joins
-- y RLS sin comprar nada.
--
-- El front NO depende de esta columna: si falta, guarda sin ella y oculta
-- los indicadores. Migrarla habilita el checklist, no lo exige.

alter table public.calendario_eventos
  add column if not exists coordinacion jsonb not null default '[]'::jsonb;

comment on column public.calendario_eventos.coordinacion is
  'Checklist de coordinación del movimiento: [{"item":"Grúa","ok":false},...]. Los presets salen del front por tipo de evento.';
