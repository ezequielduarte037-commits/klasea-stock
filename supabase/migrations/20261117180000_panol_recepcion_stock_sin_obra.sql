begin;

-- Un aviso sin obra puede no tener un renglón en el ledger todavía. La
-- confirmación de Pañol crea el movimiento y lo enlaza en la misma operación.
create or replace function public.panol_vincular_stock_al_recibir()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_envio public.panol_envios%rowtype;
  v_snapshot uuid;
  v_destino_stock boolean;
  v_cantidad_texto text;
  v_cantidad numeric;
begin
  if new.estado not in ('recibido', 'parcial') or new.purchase_request_item_id is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.obra_snapshot_item_id is not null
     and new.estado is not distinct from old.estado
     and new.cantidad_recibida is not distinct from old.cantidad_recibida then
    return new;
  end if;

  select * into v_envio from public.panol_envios where id = new.envio_id;
  if not found or v_envio.sede not in ('Pampa', 'Chubut') then
    return new;
  end if;
  v_snapshot := new.obra_snapshot_item_id;
  if v_snapshot is not null then
    select obra_id is null and source = 'stock_general' into v_destino_stock
      from public.panol_obra_materiales_snapshot where id = v_snapshot;
    if v_destino_stock is not true then return new; end if;
  elsif v_envio.obra_id is not null then
    return new;
  end if;

  if not public.can_receive_envio(v_envio.sede, auth.uid()) then
    raise exception 'Tu cuenta no puede recibir productos en %', v_envio.sede using errcode = '42501';
  end if;

  -- Un movimiento que ya apunta al aviso se reutiliza aunque el vínculo
  -- inverso se haya perdido. Esto evita duplicar existencias.
  if v_snapshot is null then
    select id into v_snapshot
      from public.panol_obra_materiales_snapshot
     where panol_envio_item_id = new.id and panol_envio_id = new.envio_id
     order by created_at desc, id
     limit 1;
    if found then
      new.obra_snapshot_item_id := v_snapshot;
      return new;
    end if;
  end if;

  v_cantidad_texto := replace(btrim(case when new.estado = 'parcial' then new.cantidad_recibida else new.cantidad end), ',', '.');
  if v_cantidad_texto is null or v_cantidad_texto !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'Indicá la cantidad recibida de "%" para ingresarla al stock.', new.descripcion using errcode = '22023';
  end if;
  v_cantidad := v_cantidad_texto::numeric;
  if v_cantidad <= 0 then
    raise exception 'La cantidad recibida de "%" debe ser mayor a cero.', new.descripcion using errcode = '22023';
  end if;

  if v_snapshot is not null then
    -- Una recepción parcial cuenta lo que llegó. Al completarla, se cuenta
    -- el total del aviso cuando el renglón de stock todavía no tuvo salidas.
    update public.panol_obra_materiales_snapshot set cantidad = v_cantidad
     where id = v_snapshot and coalesce(cantidad_egresada, 0) = 0
       and estado <> 'egresado' and cantidad is distinct from v_cantidad;
    return new;
  end if;

  insert into public.panol_obra_materiales_snapshot (
    descripcion, codigo, cantidad, unidad, material_id, requisito_material_id,
    precio_unitario, moneda, source, tipo, tipo_label, estado, stock_sede,
    especificaciones, created_by, es_adicional
  ) values (
    new.descripcion, new.codigo, v_cantidad, coalesce(nullif(btrim(new.unidad), ''), 'unidad'),
    new.material_id, coalesce(new.requisito_material_id, new.material_id), new.precio_unitario, new.moneda,
    'stock_general', 'stock_general', 'Stock general', 'pendiente', v_envio.sede,
    coalesce(new.especificaciones, '{}'::jsonb), auth.uid(), false
  ) returning id into v_snapshot;

  new.obra_snapshot_item_id := v_snapshot;
  return new;
end;
$$;

revoke all on function public.panol_vincular_stock_al_recibir() from public, anon, authenticated;
drop trigger if exists trg_panol_vincular_stock_al_recibir on public.panol_envio_items;
create trigger trg_panol_vincular_stock_al_recibir
before insert or update of estado, cantidad_recibida on public.panol_envio_items
for each row execute function public.panol_vincular_stock_al_recibir();

commit;
