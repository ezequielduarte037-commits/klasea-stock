-- Reparacion idempotente: el trigger touch_updated_at necesita columna updated_at.
-- Si la tabla venia de una version anterior, cambiar estado de un aviso fallaba con:
-- record "new" has no field "updated_at".

alter table if exists public.compras_avisos
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.compras_aviso_comentarios
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_compras_avisos_updated_at on public.compras_avisos;
create trigger trg_compras_avisos_updated_at
before update on public.compras_avisos
for each row execute function public.touch_updated_at();

drop trigger if exists trg_compras_aviso_comentarios_updated_at on public.compras_aviso_comentarios;
create trigger trg_compras_aviso_comentarios_updated_at
before update on public.compras_aviso_comentarios
for each row execute function public.touch_updated_at();
