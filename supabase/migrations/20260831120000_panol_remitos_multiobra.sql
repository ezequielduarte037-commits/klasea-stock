-- Un remito puede corresponder a varias obras aunque el PDF exista una sola vez.
-- Esta relacion es solamente documental: no crea items, reservas ni movimientos
-- de stock. `panol_comprobantes.obra_id` se conserva para clientes viejos cuando
-- hay exactamente una obra; con dos o mas queda NULL para no inventar un destino
-- de stock al abrir el ingreso.

create table if not exists public.panol_comprobante_obras (
  comprobante_id uuid not null
    references public.panol_comprobantes(id) on delete cascade,
  obra_id uuid not null
    references public.produccion_obras(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
    references public.profiles(id) on delete set null,
  primary key (comprobante_id, obra_id)
);

create index if not exists panol_comprobante_obras_obra_idx
  on public.panol_comprobante_obras (obra_id, created_at desc);

-- Todo lo clasificado antes de este cambio sigue apareciendo en su obra.
insert into public.panol_comprobante_obras (comprobante_id, obra_id, created_by)
select c.id, c.obra_id, c.created_by
from public.panol_comprobantes c
where c.origen_carga = 'scanner_panol'
  and c.obra_id is not null
on conflict (comprobante_id, obra_id) do nothing;

alter table public.panol_comprobante_obras enable row level security;

drop policy if exists "scanner panol comprobante obras lectura"
  on public.panol_comprobante_obras;
create policy "scanner panol comprobante obras lectura"
on public.panol_comprobante_obras for select to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol comprobante obras alta"
  on public.panol_comprobante_obras;
create policy "scanner panol comprobante obras alta"
on public.panol_comprobante_obras for insert to authenticated
with check (
  public.puede_operar_scanner_panol(auth.uid())
  and (created_by is null or created_by = auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol comprobante obras baja"
  on public.panol_comprobante_obras;
create policy "scanner panol comprobante obras baja"
on public.panol_comprobante_obras for delete to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

-- Reemplaza todas las asociaciones en una sola transaccion. Ademas mantiene el
-- `obra_id` legado solamente cuando la eleccion no es ambigua.
create or replace function public.panol_asignar_obras_remito(
  p_comprobante_id uuid,
  p_obra_ids uuid[] default array[]::uuid[]
)
returns table (obra_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitadas uuid[] := coalesce(p_obra_ids, array[]::uuid[]);
  v_validas uuid[];
  v_cantidad_solicitada integer;
begin
  if not public.puede_operar_scanner_panol(auth.uid()) then
    raise exception 'No tenes permiso para clasificar remitos.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.panol_comprobantes c
    where c.id = p_comprobante_id
      and c.origen_carga = 'scanner_panol'
  ) then
    raise exception 'El remito no existe o no pertenece al scanner.' using errcode = 'P0002';
  end if;

  select count(distinct solicitadas.id)
  into v_cantidad_solicitada
  from unnest(v_solicitadas) as solicitadas(id);

  select coalesce(array_agg(distinct o.id), array[]::uuid[])
  into v_validas
  from public.produccion_obras o
  where o.id = any(v_solicitadas);

  if cardinality(v_validas) <> v_cantidad_solicitada then
    raise exception 'Una de las obras seleccionadas ya no existe.' using errcode = '23503';
  end if;

  delete from public.panol_comprobante_obras po
  where po.comprobante_id = p_comprobante_id;

  insert into public.panol_comprobante_obras (comprobante_id, obra_id, created_by)
  select p_comprobante_id, seleccionadas.id, auth.uid()
  from unnest(v_validas) as seleccionadas(id)
  on conflict (comprobante_id, obra_id) do nothing;

  update public.panol_comprobantes c
  set obra_id = case when cardinality(v_validas) = 1 then v_validas[1] else null end,
      updated_at = now()
  where c.id = p_comprobante_id;

  return query
  select po.obra_id
  from public.panol_comprobante_obras po
  where po.comprobante_id = p_comprobante_id
  order by po.created_at, po.obra_id;
end;
$$;

revoke all on function public.panol_asignar_obras_remito(uuid, uuid[]) from public;
grant execute on function public.panol_asignar_obras_remito(uuid, uuid[]) to authenticated;

grant select, insert, delete on public.panol_comprobante_obras to authenticated;

comment on table public.panol_comprobante_obras is
  'Obras en las que debe encontrarse un remito archivado. No distribuye cantidades ni modifica stock.';
comment on function public.panol_asignar_obras_remito(uuid, uuid[]) is
  'Reemplaza atomicamente las obras documentales de un remito escaneado.';
