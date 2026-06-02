-- Habilitar Realtime para el Mapa de Producción
-- ─────────────────────────────────────────────────────────────────────────────
-- Para que los .on("postgres_changes", ...) del frontend reciban eventos, las
-- tablas tienen que estar en la publicación `supabase_realtime`.
--   • mapa_config   → layout/notas del mapa (se editan entre usuarios)
--   • obra_memorias → memorias descriptivas por obra
-- produccion_obras ya estaba en la publicación (de ahí venía el realtime previo).
-- Guardamos cada ADD para que sea idempotente (no falle si ya está incluida).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mapa_config'
  ) then
    alter publication supabase_realtime add table public.mapa_config;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'obra_memorias'
  ) then
    alter publication supabase_realtime add table public.obra_memorias;
  end if;
end $$;
