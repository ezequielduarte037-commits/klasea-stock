-- Sincroniza recepción de Pañol con el pedido de Compras.
-- Cuando todos los items vinculados a un purchase_request quedan recibidos,
-- el pedido padre pasa automáticamente a status='recibido'.

alter table public.purchase_requests
  add column if not exists delivered_at timestamptz,
  add column if not exists received_quantity text,
  add column if not exists receipt_notes text;

create or replace function public.sync_purchase_request_status_from_items(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_open int;
  v_received int;
begin
  if p_request_id is null then
    return;
  end if;

  select
    count(*)::int,
    count(*) filter (where status not in ('recibido', 'cancelado'))::int,
    count(*) filter (where status = 'recibido')::int
  into v_total, v_open, v_received
  from public.purchase_request_items
  where request_id = p_request_id;

  if coalesce(v_total, 0) = 0 then
    return;
  end if;

  if v_open = 0 and v_received > 0 then
    update public.purchase_requests
       set status = 'recibido',
           delivered_at = coalesce(delivered_at, now()),
           closed_at = coalesce(closed_at, now()),
           received_quantity = coalesce(nullif(received_quantity, ''), v_received::text || case when v_received = 1 then ' item' else ' items' end),
           receipt_notes = coalesce(nullif(receipt_notes, ''), 'Recepcionado por Pañol.'),
           updated_at = now()
     where id = p_request_id
       and status not in ('recibido', 'cancelado');
  elsif v_open > 0 then
    update public.purchase_requests
       set status = 'comprado',
           closed_at = null,
           updated_at = now()
     where id = p_request_id
       and status = 'recibido';
  end if;
end;
$$;

create or replace function public.sync_pr_item_on_panol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_next_status text;
begin
  if new.purchase_request_item_id is not null
     and new.estado is distinct from old.estado then
    select request_id
      into v_request_id
      from public.purchase_request_items
     where id = new.purchase_request_item_id;

    if v_request_id is null then
      return new;
    end if;

    v_next_status := case
      when new.estado = 'recibido' then 'recibido'
      else 'en_panol'
    end;

    update public.purchase_request_items
       set status = v_next_status,
           updated_at = now()
     where id = new.purchase_request_item_id
       and status <> 'cancelado'
       and status is distinct from v_next_status;

    perform public.sync_purchase_request_status_from_items(v_request_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_pr_item on public.panol_envio_items;
create trigger trg_sync_pr_item
after update on public.panol_envio_items
for each row execute function public.sync_pr_item_on_panol();

create or replace function public.panol_get_linked_purchase_request(p_envio uuid)
returns table (
  id uuid,
  title text,
  status text,
  received_quantity text,
  receipt_notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sede text;
  v_request_id uuid;
begin
  select e.sede, e.purchase_request_id
    into v_sede, v_request_id
    from public.panol_envios e
   where e.id = p_envio;

  if v_request_id is null then
    return;
  end if;

  if not public.can_see_envio(v_sede, v_uid) then
    raise exception 'Sin permiso';
  end if;

  return query
  select pr.id, pr.title, pr.status, pr.received_quantity, pr.receipt_notes
    from public.purchase_requests pr
   where pr.id = v_request_id;
end;
$$;

-- Backfill/corrección para pedidos ya recepcionados antes de esta migración.
update public.purchase_request_items pri
   set status = case when pei.estado = 'recibido' then 'recibido' else 'en_panol' end,
       updated_at = now()
  from public.panol_envio_items pei
 where pei.purchase_request_item_id = pri.id
   and pri.status <> 'cancelado'
   and pri.status is distinct from case when pei.estado = 'recibido' then 'recibido' else 'en_panol' end;

do $$
declare
  v_request_id uuid;
begin
  for v_request_id in
    select distinct pri.request_id
      from public.purchase_request_items pri
      join public.panol_envio_items pei on pei.purchase_request_item_id = pri.id
     where pri.request_id is not null
  loop
    perform public.sync_purchase_request_status_from_items(v_request_id);
  end loop;
end $$;

grant execute on function public.sync_purchase_request_status_from_items(uuid) to authenticated;
grant execute on function public.panol_get_linked_purchase_request(uuid) to authenticated;
