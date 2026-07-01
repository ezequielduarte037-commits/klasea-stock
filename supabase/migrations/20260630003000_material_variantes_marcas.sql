-- Variantes propias del material: marcas/modelos aceptables para un mismo producto.
-- Ej: descripcion = 'TV 32"', variantes = ['LG', 'Samsung'].

alter table public.panol_materiales
  add column if not exists variantes jsonb not null default '[]'::jsonb;

update public.panol_materiales
   set variantes = '[]'::jsonb
 where variantes is null
    or jsonb_typeof(variantes) <> 'array';
