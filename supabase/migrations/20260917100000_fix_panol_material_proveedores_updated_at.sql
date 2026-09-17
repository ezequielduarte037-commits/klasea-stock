-- La tabla pudo existir antes de la migración de matriz y, por eso,
-- `create table if not exists` no agregó esta columna en instalaciones
-- existentes. La RPC de estandarización la usa al guardar los términos
-- propios de cada proveedor.
alter table public.panol_material_proveedores
  add column if not exists updated_at timestamptz not null default now();

