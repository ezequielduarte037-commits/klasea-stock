-- Dos cosas que salieron de usar el modulo con obras reales.
--
-- 1) Vincular un material al catalogo en un K37 no servia para el K37 siguiente:
--    habia que volver a buscarlo a mano en cada obra. El vinculo sube a la
--    plantilla de la linea, asi que lo heredan todas las obras que se creen
--    despues. Vale para todas las lineas, no solo K37.
--
-- 2) Muchos K37 no llevan linea de eje. Hasta ahora el eje quedaba pendiente
--    para siempre o habia que archivarlo, que es distinto: archivar es "me
--    equivoque al cargarlo", "no lleva" es una decision sobre ESE barco y tiene
--    que quedar a la vista.

-- ── 1. El vinculo con el catalogo se hereda ───────────────────────────────
-- Se hace en trigger y no en el frontend para que valga tambien si el vinculo lo
-- arma otro modulo, un script o el panel de Supabase.
create or replace function public.torneria_propagar_material_a_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.material_id is null
     or new.plantilla_item_id is null
     or new.material_id is not distinct from old.material_id then
    return new;
  end if;

  -- La plantilla aprende el vinculo: lo heredan las obras futuras.
  update public.torneria_plantilla_items
     set material_id = new.material_id,
         updated_at = now()
   where id = new.plantilla_item_id
     and material_id is distinct from new.material_id;

  -- Y las obras que ya existen pero todavia NO tienen vinculo. Solo se completa
  -- lo que esta vacio: si alguien eligio otro material a proposito en su obra,
  -- no se le pisa.
  update public.torneria_items
     set material_id = new.material_id,
         updated_at = now()
   where plantilla_item_id = new.plantilla_item_id
     and id <> new.id
     and material_id is null
     and activo;

  return new;
end;
$$;

drop trigger if exists trg_torneria_propagar_material on public.torneria_items;
create trigger trg_torneria_propagar_material
  after update of material_id on public.torneria_items
  for each row execute function public.torneria_propagar_material_a_plantilla();

-- ── 2. "No lleva" ─────────────────────────────────────────────────────────
alter table public.torneria_items
  add column if not exists no_lleva boolean not null default false,
  add column if not exists no_lleva_motivo text;

comment on column public.torneria_items.no_lleva is
  'Este barco no lleva esta pieza. Distinto de activo=false: archivar es corregir una carga, "no lleva" es una decision sobre la obra y queda visible.';
comment on column public.torneria_items.no_lleva_motivo is
  'Por que este barco no la lleva. Opcional.';

-- Marcar "no lleva" tiene que apagar los viajes que existen SOLO por esa pieza.
-- Si el viaje tambien mueve otras piezas sigue vivo: la pata de gallo se manda
-- igual aunque el eje no vaya.
create or replace function public.torneria_aplicar_no_lleva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion uuid;
  v_otras integer;
begin
  if new.no_lleva is not distinct from old.no_lleva then
    return new;
  end if;

  if new.no_lleva then
    -- No se compra lo que no se lleva.
    new.compra_estado := 'no_aplica';
  end if;

  for v_operacion in
    select operacion_id
      from public.torneria_operacion_items
     where item_id = new.id
  loop
    select count(*)
      into v_otras
      from public.torneria_operacion_items oi
      join public.torneria_items i on i.id = oi.item_id
     where oi.operacion_id = v_operacion
       and oi.item_id <> new.id
       and i.activo
       and not i.no_lleva;

    if v_otras = 0 then
      update public.torneria_operaciones
         set activa = not new.no_lleva,
             updated_at = now()
       where id = v_operacion;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_torneria_aplicar_no_lleva on public.torneria_items;
create trigger trg_torneria_aplicar_no_lleva
  before update of no_lleva on public.torneria_items
  for each row execute function public.torneria_aplicar_no_lleva();

-- El avance de la obra no puede contar como pendiente algo que no se lleva.
create index if not exists idx_torneria_items_no_lleva
  on public.torneria_items (proceso_id)
  where no_lleva;
