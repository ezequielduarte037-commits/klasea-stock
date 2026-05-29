-- Vincular pedidos legacy con purchase_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando un técnico hace "Pedir a compras" para Stock Chubut/Pampa, además
-- de crear el purchase_request, se crea también un pedidos+pedido_items
-- legacy para que aparezca en el panel "Pedidos pendientes" de PanolScreen.
-- Estas columnas atan ambos sistemas.

-- ── Columnas de enlace ─────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists purchase_request_id uuid references public.purchase_requests(id) on delete set null;

alter table public.pedido_items
  add column if not exists purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null;

create index if not exists idx_pedidos_purchase_request_id
  on public.pedidos(purchase_request_id)
  where purchase_request_id is not null;

create index if not exists idx_pedido_items_purchase_request_item_id
  on public.pedido_items(purchase_request_item_id)
  where purchase_request_item_id is not null;

comment on column public.pedidos.purchase_request_id is
  'Si este pedido fue auto-creado desde un purchase_request (flow Pedir a compras), apunta al request original.';
comment on column public.pedido_items.purchase_request_item_id is
  'Item del purchase_request original que originó este pedido_item.';

-- ── Trigger: al marcar un pedido_item como recibido (nota_recepcion no-null),
-- propagar a purchase_request_items.status = 'recibido' si está vinculado.
-- También chequea si todos los items del purchase_request ya están recibidos
-- y en ese caso auto-marca el purchase_request como recibido. ─────────────
create or replace function public.sync_pedido_item_to_pr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr_item_id uuid;
  v_pr_id uuid;
  v_total int;
  v_recibidos int;
begin
  -- Solo si se acaba de marcar como recibido (nota_recepcion pasó de null a algo)
  if new.purchase_request_item_id is null then
    return new;
  end if;
  if (tg_op = 'UPDATE' and old.nota_recepcion is not distinct from new.nota_recepcion) then
    return new;
  end if;
  if new.nota_recepcion is null then
    -- Si se borró la nota (rollback de "no llegó"), revertir el item a pendiente
    update public.purchase_request_items
       set status = 'pendiente'
     where id = new.purchase_request_item_id
       and status = 'recibido';
    return new;
  end if;

  v_pr_item_id := new.purchase_request_item_id;

  -- Marcar el item del request como recibido
  update public.purchase_request_items
     set status = 'recibido'
   where id = v_pr_item_id
   returning request_id into v_pr_id;

  if v_pr_id is null then
    return new;
  end if;

  -- Si todos los items del request están recibidos o cancelados → request recibido
  select count(*),
         count(*) filter (where status in ('recibido','cancelado'))
    into v_total, v_recibidos
    from public.purchase_request_items
   where request_id = v_pr_id;

  if v_total > 0 and v_total = v_recibidos then
    update public.purchase_requests
       set status = 'recibido',
           delivered_at = coalesce(delivered_at, now())
     where id = v_pr_id
       and status not in ('recibido','cancelado');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedido_item_sync_pr on public.pedido_items;
create trigger trg_pedido_item_sync_pr
  after insert or update of nota_recepcion on public.pedido_items
  for each row execute function public.sync_pedido_item_to_pr();
