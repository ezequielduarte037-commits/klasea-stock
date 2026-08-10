-- Un aviso de recepción crea panol_envio_items en estado "pendiente".
-- Históricamente el trigger interpretaba cualquier estado del item (incluso
-- pendiente, falta_stock o rechazado) como stock físicamente recibido y
-- adelantaba el snapshot a en_panol. Solo recibido/parcial deben hacerlo.

create or replace function public.panol_snapshot_estado_from_recepcion(p_estado text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_estado, '')) in ('recibido', 'parcial') then 'en_panol'
    else null
  end;
$$;

create or replace function public.sync_obra_snapshot_from_panol_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_envio_id uuid;
  v_estado_snapshot text;
begin
  v_snapshot_id := new.obra_snapshot_item_id;

  if v_snapshot_id is null and new.purchase_request_item_id is not null then
    select s.id
      into v_snapshot_id
      from public.panol_obra_materiales_snapshot s
     where s.purchase_request_item_id = new.purchase_request_item_id
     order by s.created_at desc
     limit 1;

    if v_snapshot_id is not null then
      update public.panol_envio_items
         set obra_snapshot_item_id = v_snapshot_id
       where id = new.id
         and obra_snapshot_item_id is null;
    end if;
  end if;

  if v_snapshot_id is null then
    return new;
  end if;

  v_envio_id := new.envio_id;
  v_estado_snapshot := public.panol_snapshot_estado_from_recepcion(new.estado);

  update public.panol_obra_materiales_snapshot s
     set estado = case
           when s.estado = 'egresado' then s.estado
           when v_estado_snapshot is not null then v_estado_snapshot
           else s.estado
         end,
         panol_envio_id = coalesce(v_envio_id, s.panol_envio_id),
         panol_envio_item_id = new.id,
         recepcion_estado = new.estado,
         recepcion_cantidad_recibida = new.cantidad_recibida,
         recepcion_nota = new.nota,
         recepcion_updated_at = coalesce(new.marcado_at, new.updated_at, now()),
         updated_at = now()
   where s.id = v_snapshot_id;

  return new;
end;
$$;

-- panol_crear_envio es una función antigua y, además de insertar el aviso,
-- intenta adelantar directamente los estados. Estos guards mantienen la
-- regla en la tabla, de modo que también cubren RPCs o flujos futuros.
create or replace function public.panol_guard_snapshot_estado_recepcion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado in ('en_panol', 'recibido', 'parcial')
     and lower(coalesce(new.recepcion_estado, 'pendiente')) not in ('recibido', 'parcial') then
    if tg_op = 'INSERT' then
      new.estado := case
        when new.purchase_request_id is not null
          or new.purchase_request_item_id is not null then 'comprado'
        else 'pendiente'
      end;
    elsif old.estado not in ('en_panol', 'recibido', 'parcial', 'egresado') then
      new.estado := old.estado;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_snapshot_estado_requiere_recepcion
  on public.panol_obra_materiales_snapshot;
create trigger trg_panol_snapshot_estado_requiere_recepcion
before insert or update of estado, recepcion_estado, panol_envio_item_id
on public.panol_obra_materiales_snapshot
for each row execute function public.panol_guard_snapshot_estado_recepcion();

create or replace function public.panol_guard_purchase_item_estado_recepcion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- La RPC de creación intentaba marcar en_panol apenas generaba el aviso.
  -- Si ninguno de sus renglones fue recibido total o parcialmente, conserva
  -- el estado anterior del item de compra.
  if new.status = 'en_panol'
     and old.status is distinct from 'en_panol'
     and exists (
       select 1
         from public.panol_envio_items item
        where item.purchase_request_item_id = new.id
     )
     and not exists (
       select 1
         from public.panol_envio_items item
        where item.purchase_request_item_id = new.id
          and item.estado in ('recibido', 'parcial')
     ) then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_purchase_item_estado_requiere_recepcion
  on public.purchase_request_items;
create trigger trg_panol_purchase_item_estado_requiere_recepcion
before update of status on public.purchase_request_items
for each row execute function public.panol_guard_purchase_item_estado_recepcion();

-- Repara también los items de compra adelantados por el simple envío del
-- aviso. "pedido" significa comprado/encargado pero todavía no recibido.
update public.purchase_request_items item
   set status = 'pedido',
       updated_at = now()
 where item.status = 'en_panol'
   and exists (
     select 1
       from public.panol_envio_items envio_item
      where envio_item.purchase_request_item_id = item.id
   )
   and not exists (
     select 1
       from public.panol_envio_items recibido
      where recibido.purchase_request_item_id = item.id
        and recibido.estado in ('recibido', 'parcial')
   );

-- Corrige falsos "En pañol" históricos cuando nunca hubo una confirmación de
-- recepción para el snapshot. Si existe aunque sea una recepción parcial o
-- total, no se toca para preservar el movimiento real.
update public.panol_obra_materiales_snapshot s
   set estado = case
         when s.purchase_request_id is not null
           or s.purchase_request_item_id is not null then 'comprado'
         else 'pendiente'
       end,
       updated_at = now()
 where s.estado = 'en_panol'
   and lower(coalesce(s.recepcion_estado, '')) in ('pendiente', 'sin_info', 'falta_stock', 'rechazado')
   and not exists (
     select 1
       from public.panol_envio_items recibido
      where (
          recibido.obra_snapshot_item_id = s.id
          or (
            s.purchase_request_item_id is not null
            and recibido.purchase_request_item_id = s.purchase_request_item_id
          )
        )
        and recibido.estado in ('recibido', 'parcial')
   );

comment on function public.panol_snapshot_estado_from_recepcion(text) is
  'Traduce solo una recepción física confirmada a estado de stock. Pendiente y problemas no ingresan material a pañol.';
