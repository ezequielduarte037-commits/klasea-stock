-- Soporte para recepcion por escaneo en Panol.
-- El lector matchea codigo_barra del material, por eso cada item del envio
-- necesita conservar el material_id del snapshot que lo origino.

alter table public.panol_envio_items
  add column if not exists material_id uuid references public.panol_materiales(id) on delete set null;

create index if not exists idx_panol_envio_items_material_id
  on public.panol_envio_items(material_id)
  where material_id is not null;

update public.panol_envio_items pei
   set material_id = s.material_id
  from public.panol_obra_materiales_snapshot s
 where pei.material_id is null
   and pei.obra_snapshot_item_id = s.id
   and s.material_id is not null;

create or replace function public.panol_envio_item_set_material_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.material_id is null and new.obra_snapshot_item_id is not null then
    select s.material_id
      into new.material_id
      from public.panol_obra_materiales_snapshot s
     where s.id = new.obra_snapshot_item_id
       and s.material_id is not null
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_panol_envio_item_set_material_id on public.panol_envio_items;
create trigger trg_panol_envio_item_set_material_id
before insert or update of obra_snapshot_item_id, material_id
on public.panol_envio_items
for each row
execute function public.panol_envio_item_set_material_id();
