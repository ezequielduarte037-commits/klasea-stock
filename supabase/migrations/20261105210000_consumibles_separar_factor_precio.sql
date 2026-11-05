-- La presentación física de compra no define la presentación cotizada.
-- Corrección autorizada por Ezequiel el 05/11/2026, luego de revisar las listas.
begin;
lock table public.consumibles_config in share row exclusive mode;
lock table public.consumibles_lista_items in share mode;

create table public.consumibles_config_respaldo_20261105 as
  select * from public.consumibles_config;
revoke all on public.consumibles_config_respaldo_20261105 from anon, authenticated;
alter table public.consumibles_config_respaldo_20261105 enable row level security;

alter table public.consumibles_config
  add column factor_precio_lista numeric check (factor_precio_lista > 0),
  add column precio_revision_pendiente boolean not null default false;
comment on column public.consumibles_config.factor_precio_lista is
  'Unidades de entrega que cubre el precio de lista; independiente del contenido de una caja (factor_compra).';

-- Conserva las conversiones legítimas y su comportamiento actual.
drop trigger trg_consumibles_config_touch on public.consumibles_config;
update public.consumibles_config
   set factor_precio_lista = coalesce(factor_compra, 1);

create table public.consumibles_config_audit (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  antes jsonb,
  despues jsonb not null,
  actor_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);
create index consumibles_config_audit_material_fecha on public.consumibles_config_audit(material_id, created_at desc);
alter table public.consumibles_config_audit enable row level security;
create policy consumibles_config_audit_lectura on public.consumibles_config_audit
  for select to authenticated using (public.is_panol_manager(auth.uid()));
grant select on public.consumibles_config_audit to authenticated;
revoke insert, update, delete on public.consumibles_config_audit from anon, authenticated;

create or replace function public.consumibles_config_registrar_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.consumibles_config_audit(material_id, antes, despues, actor_id, motivo)
  values (new.material_id, case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new), auth.uid(), coalesce(nullif(current_setting('klasea.consumibles_motivo',true),''),'Edición de ficha'));
  return new;
end;
$$;
revoke all on function public.consumibles_config_registrar_audit() from public;
create trigger trg_consumibles_config_audit after insert or update on public.consumibles_config
  for each row execute function public.consumibles_config_registrar_audit();

select set_config('klasea.consumibles_motivo','Corrección de precios y separación de presentaciones según auditoría 05/11/2026',true);

-- 12 casos respaldados: la lista cotiza una unidad de entrega, no una caja.
update public.consumibles_config c
   set factor_precio_lista = 1,
       costo_unitario_ars = i.costo_ars,
       costo_actualizado_at = case when c.costo_unitario_ars is distinct from i.costo_ars then now() else c.costo_actualizado_at end,
       updated_by = null, updated_at = now()
  from public.consumibles_lista_items i
 where c.costo_lista_item_id = i.id
   and i.codigo in ('S0001','S0002','S0005','D000111','TEROSON','S0003',
     'C0037','C0032','C0034','L0023','M0015','M0017');

-- Estopa y colas: el usuario confirmó retiro generalmente por peso. Las
-- cantidades de entrega se expresan en kg; no se reescriben movimientos.
update public.consumibles_config c
   set unidad_entrega = 'kg', forma_entrega = 'peso',
       factor_precio_lista = case i.codigo when 'E0011' then 1 when 'C0049' then 4 else 20 end,
       costo_unitario_ars = round(i.costo_ars / case i.codigo when 'E0011' then 1 when 'C0049' then 4 else 20 end,4),
       costo_actualizado_at = now(), updated_at = now(), updated_by = null
  from public.consumibles_lista_items i
 where c.costo_lista_item_id = i.id and i.codigo in ('E0011','C0049','C0050');

-- Los cinco sin evidencia suficiente conservan costo y cantidades; se impide
-- recalcular hasta confirmar qué presentación cubre el precio.
update public.consumibles_config c
   set factor_precio_lista = null, precio_revision_pendiente = true, updated_by = null, updated_at = now()
  from public.consumibles_lista_items i
 where c.costo_lista_item_id = i.id
   and i.codigo in ('H00161','P0056BOSCH','S0015','B00241','C00191');

-- Un precio cambiado siempre actualiza su fecha. Los clientes anteriores
-- siguen protegidos aunque todavía intenten dividir por factor_compra.
create or replace function public.consumibles_config_touch()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lista numeric;
  v_precio_cambio boolean := false;
begin
  if tg_op = 'INSERT' then
    if not new.precio_revision_pendiente then
      new.factor_precio_lista := coalesce(new.factor_precio_lista,new.factor_compra,1);
    end if;
  else
    if new.precio_revision_pendiente and old.costo_lista_item_id is not null and (
      new.costo_unitario_ars is distinct from old.costo_unitario_ars or
      new.costo_lista_item_id is distinct from old.costo_lista_item_id or
      new.factor_precio_lista is distinct from old.factor_precio_lista
    ) then
      raise exception 'Precio pendiente de confirmar: indicá qué presentación cubre la lista antes de cambiar el costo';
    end if;
    v_precio_cambio := new.factor_precio_lista is distinct from old.factor_precio_lista
      or (old.precio_revision_pendiente and not new.precio_revision_pendiente);
    if new.factor_compra is distinct from old.factor_compra
      and not v_precio_cambio
      and new.costo_lista_item_id is not distinct from old.costo_lista_item_id then
      -- Incluye el caso de un cliente viejo que vacía el factor y manda costo null.
      new.costo_unitario_ars := old.costo_unitario_ars;
    end if;
    -- Alta vinculada desde un cliente anterior, que no envía la base de precio.
    if old.costo_lista_item_id is null and new.costo_lista_item_id is not null
      and new.factor_precio_lista is not distinct from old.factor_precio_lista
      and not new.precio_revision_pendiente then
      new.factor_precio_lista := coalesce(new.factor_compra,1);
    end if;
  end if;
  if not new.precio_revision_pendiente and not coalesce(new.factor_precio_lista > 0,false) then
    raise exception 'Indicá cuántas unidades de entrega cubre el precio de lista';
  end if;
  if new.costo_lista_item_id is not null and not new.precio_revision_pendiente then
    select costo_ars into v_lista from public.consumibles_lista_items where id = new.costo_lista_item_id;
    if v_lista is not null and (v_precio_cambio or
      (tg_op = 'UPDATE' and new.costo_unitario_ars is distinct from old.costo_unitario_ars
        and new.factor_precio_lista is distinct from coalesce(new.factor_compra,1)
        and abs(new.costo_unitario_ars - round(v_lista / coalesce(new.factor_compra,1),4)) < 0.0001)) then
      new.costo_unitario_ars := round(v_lista / new.factor_precio_lista,4);
    end if;
  end if;
  if tg_op = 'INSERT' or new.costo_unitario_ars is distinct from old.costo_unitario_ars then
    new.costo_actualizado_at := now();
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger trg_consumibles_config_touch before insert or update on public.consumibles_config
  for each row execute function public.consumibles_config_touch();

do $$
begin
  if (select count(*) from public.consumibles_config c join public.consumibles_lista_items i on i.id=c.costo_lista_item_id
      where i.codigo in ('S0001','S0002','S0005','D000111','TEROSON','S0003','C0037','C0032','C0034','L0023','M0015','M0017')
      and c.factor_precio_lista=1 and c.costo_unitario_ars=i.costo_ars) <> 12 then
    raise exception 'No se verificaron las 12 correcciones de precio';
  end if;
  if (select count(*) from public.consumibles_config where precio_revision_pendiente) <> 5 then
    raise exception 'No se verificaron los 5 casos protegidos';
  end if;
  if (select count(*) from public.consumibles_config c join public.consumibles_lista_items i on i.id=c.costo_lista_item_id
      where i.codigo in ('E0011','C0049','C0050') and c.unidad_entrega='kg' and c.forma_entrega='peso'
      and c.costo_unitario_ars=round(i.costo_ars/c.factor_precio_lista,4)) <> 3 then
    raise exception 'No se verificaron las 3 presentaciones por kg';
  end if;
  if exists (select 1 from public.consumibles_config c join public.consumibles_config_respaldo_20261105 b using(material_id)
    where (to_jsonb(c) - array['factor_precio_lista','precio_revision_pendiente','costo_unitario_ars','costo_actualizado_at','updated_by','updated_at','unidad_entrega','forma_entrega'])
      is distinct from (to_jsonb(b) - array['costo_unitario_ars','costo_actualizado_at','updated_by','updated_at','unidad_entrega','forma_entrega'])) then
    raise exception 'Cambió un campo ajeno a la corrección';
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
