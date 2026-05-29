-- Vincular laminacion_pedidos con purchase_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando un técnico hace "Pedir a compras" para una Obra de laminación,
-- además de crear el purchase_request, se crea también un laminacion_pedidos
-- por cada item (en laminación NO hay tabla de items aparte: 1 row = 1 ítem).
-- Cuando ese laminacion_pedidos se marca "entregado", un trigger DB sincroniza
-- el purchase_request_item correspondiente.

alter table public.laminacion_pedidos
  add column if not exists purchase_request_item_id uuid
    references public.purchase_request_items(id) on delete set null;

alter table public.laminacion_pedidos
  add column if not exists obra_destino text;

create index if not exists idx_laminacion_pedidos_purchase_request_item_id
  on public.laminacion_pedidos(purchase_request_item_id)
  where purchase_request_item_id is not null;

comment on column public.laminacion_pedidos.purchase_request_item_id is
  'Item del purchase_request que originó este pedido de laminación (cuando viene del flow Pedir a compras).';
comment on column public.laminacion_pedidos.obra_destino is
  'Nombre de la obra de destino (texto libre, ej "K52-26"). Para no depender solo de observaciones.';

-- Trigger: cuando un laminacion_pedidos pasa a "entregado" (o cualquier estado
-- de "completado"), propagar a purchase_request_items.status = 'recibido'.
-- Si todos los items del purchase_request quedan recibidos, marcar el request
-- como recibido automáticamente.
create or replace function public.sync_laminacion_pedido_to_pr()
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
  v_completados text[] := array['entregado','recibido','completado'];
begin
  if new.purchase_request_item_id is null then
    return new;
  end if;

  -- Solo actúa cuando estado cambia a uno de los "completados"
  if (tg_op = 'UPDATE' and old.estado = new.estado) then
    return new;
  end if;

  v_pr_item_id := new.purchase_request_item_id;

  if new.estado = any(v_completados) then
    update public.purchase_request_items
       set status = 'recibido'
     where id = v_pr_item_id
     returning request_id into v_pr_id;
  elsif new.estado in ('pendiente', 'pedido') then
    -- Si vuelve a pendiente (rollback), revertir
    update public.purchase_request_items
       set status = 'pendiente'
     where id = v_pr_item_id
       and status = 'recibido'
     returning request_id into v_pr_id;
  else
    return new;
  end if;

  if v_pr_id is null then
    return new;
  end if;

  -- Auto-marcar el purchase_request como recibido si todos los items ya lo están
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

drop trigger if exists trg_laminacion_pedido_sync_pr on public.laminacion_pedidos;
create trigger trg_laminacion_pedido_sync_pr
  after insert or update of estado on public.laminacion_pedidos
  for each row execute function public.sync_laminacion_pedido_to_pr();
