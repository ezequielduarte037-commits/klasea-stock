-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles · Solicitudes en vivo.
--
-- La pestaña Solicitudes de Consumibles escucha los cambios de las solicitudes
-- y sus renglones (llega una del celular, otro pañolero tilda un renglón, se
-- entrega desde otro equipo). Hasta hoy ninguna de las dos tablas estaba en la
-- publicación de realtime: el canal se suscribía pero no recibía nada, y la
-- bandeja dependía de la recarga cada minuto.
--
-- Realtime respeta la RLS de cada tabla: cada usuario recibe solo las filas
-- que ya podía leer. No cambia ningún dato.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'panol_solicitudes'
    ) then
      alter publication supabase_realtime add table public.panol_solicitudes;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'panol_solicitud_items'
    ) then
      alter publication supabase_realtime add table public.panol_solicitud_items;
    end if;
  end if;
end $$;

commit;
