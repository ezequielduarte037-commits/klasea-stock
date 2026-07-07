-- Adicionales/opcionales por obra como items reales vinculables al catalogo.
-- La tabla puede haber sido creada manualmente en bases anteriores; por eso
-- todo queda idempotente y tolerante.

do $$
begin
  if to_regclass('public.panol_obra_addons') is not null then
    alter table public.panol_obra_addons
      add column if not exists material_id uuid,
      add column if not exists codigo text,
      add column if not exists unidad text,
      add column if not exists categoria_id uuid,
      add column if not exists proveedor_id uuid,
      add column if not exists precio_unitario numeric,
      add column if not exists moneda text,
      add column if not exists imagen_url text,
      add column if not exists links jsonb not null default '[]'::jsonb,
      add column if not exists codigo_barra text,
      add column if not exists variantes jsonb not null default '[]'::jsonb;

    update public.panol_obra_addons
       set links = '[]'::jsonb
     where links is null
        or jsonb_typeof(links) <> 'array';

    if not exists (
      select 1
        from pg_constraint
       where conname = 'panol_obra_addons_material_id_fkey'
         and conrelid = 'public.panol_obra_addons'::regclass
    ) then
      alter table public.panol_obra_addons
        add constraint panol_obra_addons_material_id_fkey
        foreign key (material_id) references public.panol_materiales(id)
        on delete set null;
    end if;

    comment on column public.panol_obra_addons.material_id is
      'Material del catalogo asociado al adicional/opcional de esta obra.';
  end if;
end $$;
