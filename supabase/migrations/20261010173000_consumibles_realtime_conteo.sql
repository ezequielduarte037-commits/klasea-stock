-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: conteo en vivo entre celulares (inventario del lunes 12/10/2026).
--
-- La pestaña Conteo escucha los inserts de consumibles_movimientos de su sede
-- para mostrar al instante lo que contó el otro pañolero. Sin la tabla en la
-- publicación igual funciona (consulta cada 15 s); con esto, el aviso llega en
-- menos de un segundo. Realtime respeta la RLS de la tabla: sólo reciben los
-- operadores que ya pueden leerla.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'consumibles_movimientos'
  ) then
    alter publication supabase_realtime add table public.consumibles_movimientos;
  end if;
end $$;

commit;
