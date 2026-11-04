begin;

-- Los cambios directos siguen siendo sólo para el carrito. El RPC valida el
-- pedido completo y usa esta marca durante la corrección.
create or replace function public.consumibles_pedido_items_solo_borrador()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_estado text;
begin
  if tg_op = 'UPDATE' and new.pedido_id is distinct from old.pedido_id then
    raise exception 'No se puede mover un renglón a otro pedido';
  end if;

  select estado into v_estado
    from public.consumibles_pedidos
   where id = v_pedido
   for share;

  if v_estado = 'borrador' or (
    v_estado = 'pedido'
    and current_user in ('postgres', 'supabase_admin')
    and current_setting('klasea.corrigiendo_pedido_consumibles', true) = v_pedido::text
  ) then
    return coalesce(new, old);
  end if;
  raise exception 'El pedido ya se confirmó: usá Editar pedido';
end;
$$;

-- El primer ingreso y la corrección se ordenan con el mismo bloqueo del pedido.
create function public.consumibles_bloquear_pedido_al_recibir()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform p.id
    from public.consumibles_pedidos p
    join public.consumibles_pedido_items i on i.pedido_id = p.id
   where i.id = new.pedido_item_id
   for share of p;
  return new;
end;
$$;

create trigger trg_consumibles_bloquear_pedido_al_recibir
  before insert or update of pedido_item_id on public.consumibles_movimientos
  for each row when (new.pedido_item_id is not null)
  execute function public.consumibles_bloquear_pedido_al_recibir();

create or replace view public.consumibles_pedido_items_recibido
with (security_invoker = true) as
select i.id as pedido_item_id,
       coalesce(sum(m.cantidad) filter (where m.tipo = 'ingreso' and m.anulado_at is null), 0) as recibido_entrega,
       count(m.id) > 0 as tiene_movimientos
  from public.consumibles_pedido_items i
  left join public.consumibles_movimientos m on m.pedido_item_id = i.id
 group by i.id;

create function public.consumibles_corregir_pedido(
  p_pedido uuid, p_version timestamptz, p_items jsonb, p_nota text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.consumibles_pedidos%rowtype;
  v_materiales uuid[];
  v_total integer;
begin
  if not public.panol_es_operador_solicitudes() then
    raise exception 'No tenés permiso para editar pedidos de consumibles' using errcode = '42501';
  end if;

  select * into v_pedido from public.consumibles_pedidos where id = p_pedido for update;
  if v_pedido.estado is distinct from 'pedido' then
    raise exception 'El pedido debe estar confirmado y abierto para editarlo';
  end if;
  if v_pedido.updated_at is distinct from p_version then
    raise exception 'El pedido cambió en otro equipo. Cancelá la edición y actualizá la lista';
  end if;
  if exists (
    select 1
      from public.consumibles_movimientos m
      join public.consumibles_pedido_items i on i.id = m.pedido_item_id
     where i.pedido_id = p_pedido
  ) then
    raise exception 'El pedido ya tiene ingresos registrados';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Cargá los productos del pedido';
  end if;
  select array_agg(material_id), count(*) into v_materiales, v_total
    from jsonb_to_recordset(p_items) as r(material_id uuid, cantidad numeric)
   where material_id is not null and cantidad > 0 and cantidad < 'Infinity'::numeric;
  if v_total = 0 or v_total <> jsonb_array_length(p_items)
      or v_total <> (select count(distinct id) from unnest(v_materiales) as t(id)) then
    raise exception 'Dejá al menos un producto y cargá cantidades mayores a cero sin repetir productos';
  end if;

  perform set_config('klasea.corrigiendo_pedido_consumibles', p_pedido::text, true);

  delete from public.consumibles_pedido_items
   where pedido_id = p_pedido and material_id <> all(v_materiales);

  insert into public.consumibles_pedido_items as i
    (pedido_id, material_id, cantidad, unidad_compra, factor, costo_compra_ars)
  select p_pedido, r.material_id, r.cantidad, r.unidad_compra, coalesce(r.factor, 1), r.costo_compra_ars
    from jsonb_to_recordset(p_items) as r(
      material_id uuid, cantidad numeric, unidad_compra text, factor numeric, costo_compra_ars numeric
    )
  on conflict (pedido_id, material_id) do update
    set cantidad = excluded.cantidad
    where i.cantidad is distinct from excluded.cantidad;

  perform set_config('klasea.corrigiendo_pedido_consumibles', '', true);

  update public.consumibles_pedidos
     set nota = nullif(btrim(p_nota), '')
   where id = p_pedido
   returning * into v_pedido;

  return jsonb_build_object(
    'updated_at', v_pedido.updated_at,
    'nota', v_pedido.nota,
    'items', (select jsonb_agg(to_jsonb(i)) from public.consumibles_pedido_items i where i.pedido_id = p_pedido)
  );
end;
$$;

revoke all on function public.consumibles_corregir_pedido(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.consumibles_corregir_pedido(uuid, timestamptz, jsonb, text) to authenticated;

commit;
