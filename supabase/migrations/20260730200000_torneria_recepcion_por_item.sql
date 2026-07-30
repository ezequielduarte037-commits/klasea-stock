-- Cerrar el circuito: la recepcion real es POR ITEM, no por pedido.
--
-- El trigger anterior (trg_purchase_request_sync_torneria) escucha
-- purchase_requests.status, o sea el estado del pedido completo. Pero el flujo
-- de este sistema trabaja a nivel item: panol le da recibido a cada
-- purchase_request_items por separado, y ya existe
-- trg_sync_obra_snapshot_from_purchase_item haciendo exactamente eso para las
-- obras. Torneria se quedaba afuera.
--
-- Con un pedido de cuatro materiales que llegan en fechas distintas, el estado
-- por pedido no alcanza: diria "todo recibido" solo cuando cae el ultimo, y los
-- tiempos por material —que es el dato que se queria medir— saldrian todos
-- iguales.

alter table public.torneria_items
  add column if not exists purchase_request_item_id uuid
    references public.purchase_request_items(id) on delete set null;

comment on column public.torneria_items.purchase_request_item_id is
  'Item exacto del pedido a compras. Permite que la recepcion en panol, que es por item, mueva el estado y las fechas de ESTE material y no de todo el pedido.';

create index if not exists idx_torneria_items_purchase_request_item
  on public.torneria_items (purchase_request_item_id)
  where purchase_request_item_id is not null;

-- Mapeo de purchase_request_items.status a compra_estado.
--
-- 'en_panol' cuenta como recibido en el astillero a proposito: el panol esta
-- adentro del astillero, asi que si el material esta ahi, torneria ya lo puede
-- mandar al taller. Esperar el 'recibido' formal atrasaria el circuito por un
-- tramite.
create or replace function public.torneria_sincronizar_compra_desde_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_estado := case new.status
    when 'pendiente' then 'solicitado'
    when 'pedido' then 'comprado'
    when 'en_panol' then 'recibido_astillero'
    when 'recibido' then 'recibido_astillero'
    else null
  end;

  -- 'cancelado' no se mapea: que compras cancele el item no significa que
  -- torneria ya no necesite el material. Queda como estaba y alguien decide.
  if v_estado is null then
    return new;
  end if;

  update public.torneria_items
     set compra_estado = v_estado,
         updated_at = now()
   where purchase_request_item_id = new.id
     and compra_estado <> 'no_aplica'
     and not no_lleva
     and compra_estado is distinct from v_estado;

  return new;
end;
$$;

drop trigger if exists trg_purchase_request_item_sync_torneria on public.purchase_request_items;
create trigger trg_purchase_request_item_sync_torneria
  after update of status on public.purchase_request_items
  for each row execute function public.torneria_sincronizar_compra_desde_item();

-- El trigger por pedido sigue existiendo como red: si compras mueve el pedido
-- entero sin tocar los items, torneria igual se entera. Pero deja de pisar a los
-- items que ya tienen su propio vinculo, porque ese dato es mas preciso.
create or replace function public.torneria_sincronizar_compra_desde_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_estado := case new.status
    when 'nuevo' then 'solicitado'
    when 'en_revision' then 'solicitado'
    when 'cotizando' then 'solicitado'
    when 'comprado' then 'comprado'
    when 'recibido' then 'recibido_astillero'
    else null
  end;

  if v_estado is null then
    return new;
  end if;

  update public.torneria_items
     set compra_estado = v_estado,
         updated_at = now()
   where purchase_request_id = new.id
     and purchase_request_item_id is null
     and compra_estado <> 'no_aplica'
     and not no_lleva
     and compra_estado is distinct from v_estado;

  return new;
end;
$$;
