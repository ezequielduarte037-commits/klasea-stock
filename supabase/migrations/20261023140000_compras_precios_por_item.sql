-- Los importes de los renglones son por toda la cantidad indicada (quantity
-- admite texto libre). Nunca se reparte un total histórico entre productos.
begin;
set local lock_timeout = '5s';

alter table public.purchase_request_items add column if not exists actual_amount numeric(12,2);
alter table public.purchase_requests add column if not exists itemized_costs boolean not null default false;
alter table public.purchase_request_items add constraint purchase_item_amount_positive
  check (actual_amount is null or (actual_amount > 0 and actual_amount < 'Infinity'::numeric));
comment on column public.purchase_request_items.actual_amount is
  'Importe real total del renglón por toda su cantidad. No es un precio unitario.';
comment on column public.purchase_requests.itemized_costs is
  'El costo real se calcula sumando los renglones activos. False conserva pedidos históricos sin desglose.';

create or replace function public.purchase_requests_validar_precio_compra()
returns trigger language plpgsql set search_path = public as $$
declare
  v_validar boolean := false;
  v_count integer;
  v_missing integer;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    v_validar := new.status = 'comprado' or new.itemized_costs;
  else
    if old.itemized_costs and not new.itemized_costs then
      raise exception 'El total de este pedido se calcula por ítem.' using errcode='23514';
    end if;
    -- Una recepción parcial histórica no es una compra nueva.
    if pg_trigger_depth() > 1 and old.status = 'recibido' and new.status = 'comprado'
      and not old.itemized_costs and new.actual_amount is not distinct from old.actual_amount then
      return new;
    end if;
    v_validar := (new.status = 'comprado' and new.status is distinct from old.status)
      or (new.status in ('comprado','recibido') and new.actual_amount is distinct from old.actual_amount)
      or new.itemized_costs;
  end if;
  if not v_validar then return new; end if;

  select count(*), count(*) filter (where i.actual_amount is null), coalesce(sum(i.actual_amount),0)
  into v_count,v_missing,v_total from public.purchase_request_items i
  where i.request_id=new.id and i.status <> 'cancelado';

  if new.itemized_costs or (new.status='comprado' and v_count>0) then
    if new.status in ('comprado','recibido') and v_missing>0 then
      raise exception 'Cargá el importe real de cada ítem antes de confirmar la compra.' using errcode='23514';
    end if;
    if new.status='comprado' and v_count=0
      and (tg_op='INSERT' or old.status is distinct from new.status) then
      raise exception 'El pedido no tiene ítems activos para comprar.' using errcode='23514';
    end if;
    new.actual_amount := v_total;
    new.itemized_costs := true;
  elsif new.actual_amount is null or not (new.actual_amount>0 and new.actual_amount<'Infinity'::numeric) then
    raise exception 'Cargá un importe real mayor a cero para marcar la compra como Comprado.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_requests_validar_precio_compra on public.purchase_requests;
create trigger trg_purchase_requests_validar_precio_compra
before insert or update of status,actual_amount,itemized_costs on public.purchase_requests
for each row execute function public.purchase_requests_validar_precio_compra();

-- Serializa cambios de renglones con la confirmación del pedido. La RLS de
-- las tablas sigue vigente; los precios sólo los edita Compras/Administración.
create or replace function public.purchase_item_bloquear_costos()
returns trigger language plpgsql set search_path = public as $$
declare v_ids uuid[];
begin
  if tg_op='INSERT' then v_ids:=array[new.request_id];
  elsif tg_op='DELETE' then v_ids:=array[old.request_id];
  else v_ids:=array[old.request_id,new.request_id]; end if;
  perform id from public.purchase_requests where id=any(v_ids) order by id for update;
  if tg_op<>'DELETE'
    and ((tg_op='INSERT' and new.actual_amount is not null)
      or (tg_op='UPDATE' and new.actual_amount is distinct from old.actual_amount))
    and current_user not in ('postgres','service_role','supabase_admin')
    and not exists(select 1 from public.profiles where id=auth.uid() and (is_admin or role in ('admin','compras'))) then
    raise exception 'Sólo Compras puede modificar los precios.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.purchase_item_recalcular_costos()
returns trigger language plpgsql set search_path = public as $$
declare v_ids uuid[];
begin
  if tg_op='INSERT' then v_ids:=array[new.request_id];
  elsif tg_op='DELETE' then v_ids:=array[old.request_id];
  else v_ids:=array[old.request_id,new.request_id]; end if;
  update public.purchase_requests r
  set actual_amount=(select coalesce(sum(i.actual_amount),0) from public.purchase_request_items i
    where i.request_id=r.id and i.status<>'cancelado')
  where r.id=any(v_ids) and r.itemized_costs;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_purchase_item_bloquear_costos before insert or update or delete on public.purchase_request_items
for each row execute function public.purchase_item_bloquear_costos();
create trigger trg_purchase_item_recalcular_costos after insert or delete or update of actual_amount,status,request_id on public.purchase_request_items
for each row execute function public.purchase_item_recalcular_costos();

-- Una sola transacción: valida la lista completa, guarda importes y calcula
-- el total. Si falla cualquier fila, no se confirma ninguna parte del pedido.
create or replace function public.purchase_request_guardar_costos(
  p_request_id uuid,p_items jsonb,p_actual_amount numeric default null,p_confirmar boolean default true
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_request public.purchase_requests%rowtype;
  v_count integer;
  v_total numeric;
begin
  if current_user not in ('postgres','service_role','supabase_admin') and not exists(
    select 1 from public.profiles where id=auth.uid() and (is_admin or role in ('admin','compras'))
  ) then raise exception 'Sólo Compras puede modificar los precios.' using errcode='42501'; end if;

  select * into v_request from public.purchase_requests where id=p_request_id for update;
  if not found then raise exception 'El pedido no existe o no tenés acceso.' using errcode='42501'; end if;
  perform id from public.purchase_request_items where request_id=p_request_id order by id for update;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'Falta el detalle de precios por ítem.' using errcode='23514'; end if;
  select count(*) into v_count from public.purchase_request_items where request_id=p_request_id and status<>'cancelado';
  if jsonb_array_length(p_items)<>v_count then
    raise exception 'Cambió la lista de ítems. Volvé a abrir la confirmación y revisá los precios.' using errcode='23514'; end if;

  if v_count>0 then
    if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object'
      or coalesce(jsonb_typeof(x->'actual_amount'),'null')<>'number') then
      raise exception 'Cargá el importe real de cada ítem antes de confirmar la compra.' using errcode='23514'; end if;
    if (select count(distinct x.id) from jsonb_to_recordset(p_items) x(id uuid,actual_amount numeric))<>v_count
      or exists(select 1 from jsonb_to_recordset(p_items) x(id uuid,actual_amount numeric)
        where x.id is null or round(x.actual_amount,2)<=0 or x.actual_amount>='Infinity'::numeric
          or not exists(select 1 from public.purchase_request_items i where i.id=x.id and i.request_id=p_request_id and i.status<>'cancelado')) then
      raise exception 'Revisá los ítems y sus importes: cada uno debe tener un precio mayor a cero.' using errcode='23514'; end if;
    update public.purchase_request_items i set actual_amount=round(x.actual_amount,2)
    from jsonb_to_recordset(p_items) x(id uuid,actual_amount numeric)
    where i.id=x.id and i.request_id=p_request_id;
    select sum(actual_amount) into v_total from public.purchase_request_items where request_id=p_request_id and status<>'cancelado';
  else
    v_total:=round(p_actual_amount,2);
    if v_total is null or not (v_total>0 and v_total<'Infinity'::numeric) then
      raise exception 'Cargá un importe real mayor a cero para la compra sin ítems.' using errcode='23514'; end if;
  end if;
  update public.purchase_requests set actual_amount=v_total,
    itemized_costs=(v_count>0 or v_request.itemized_costs),
    status=case when p_confirmar then 'comprado' else status end
  where id=p_request_id returning * into v_request;
  return jsonb_build_object('request',to_jsonb(v_request),'items',(
    select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb)
    from public.purchase_request_items i where i.request_id=p_request_id));
end;
$$;
revoke all on function public.purchase_request_guardar_costos(uuid,jsonb,numeric,boolean) from public,anon;
grant execute on function public.purchase_request_guardar_costos(uuid,jsonb,numeric,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
