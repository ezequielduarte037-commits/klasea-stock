-- Planos por material de Torneria.
--
-- Se guarda la misma estructura que usan los adjuntos de Compras:
-- [{ url, path, name, type, size }].
-- La plantilla conserva los planos de la linea para obras futuras y cada
-- instancia mantiene una copia que puede personalizarse solo para esa obra.

alter table public.torneria_plantilla_items
  add column if not exists planos jsonb not null default '[]'::jsonb;

alter table public.torneria_items
  add column if not exists planos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'torneria_plantilla_items_planos_array_chk'
      and conrelid = 'public.torneria_plantilla_items'::regclass
  ) then
    alter table public.torneria_plantilla_items
      add constraint torneria_plantilla_items_planos_array_chk
      check (jsonb_typeof(planos) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'torneria_items_planos_array_chk'
      and conrelid = 'public.torneria_items'::regclass
  ) then
    alter table public.torneria_items
      add constraint torneria_items_planos_array_chk
      check (jsonb_typeof(planos) = 'array');
  end if;
end $$;

comment on column public.torneria_plantilla_items.planos is
  'Planos y documentos predeterminados del material para toda la linea.';
comment on column public.torneria_items.planos is
  'Planos y documentos vigentes del material para esta obra.';

-- El alta de una obra ya copia los items desde la plantilla. Este trigger
-- completa la metadata agregada despues del RPC original, incluidos los planos.
create or replace function public.torneria_aplicar_metadata_item_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado boolean;
  v_fuentes text[];
  v_planos jsonb;
begin
  if new.plantilla_item_id is null then
    return new;
  end if;

  select es_resultado, resultado_de, planos
    into v_resultado, v_fuentes, v_planos
    from public.torneria_plantilla_items
   where id = new.plantilla_item_id;

  new.es_resultado := coalesce(v_resultado, false);
  new.resultado_de := coalesce(v_fuentes, '{}');
  new.planos := coalesce(v_planos, '[]'::jsonb);
  if new.es_resultado then
    new.compra_estado := 'no_aplica';
    new.solicitado_por_torneria := false;
  end if;
  return new;
end;
$$;

