-- SQL COMPLETO PARA SUPABASE. Copiar desde esta primera línea hasta FIN DEL ARCHIVO.
-- En SQL Editor: reemplazar toda la consulta anterior y ejecutar sin seleccionar un fragmento.
-- Generado desde supabase/migrations/20261007180000_panol_recepcion_otra_sede_separa.sql; puede volver a ejecutarse.

begin;

create or replace function public.panol_snapshot_ocupado_en_otra_sede(
  p_snapshot_id uuid,
  p_sede text,
  p_envio_item_id uuid default null
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.panol_obra_materiales_snapshot s
     where s.id = p_snapshot_id
       and s.stock_sede is not null
       and s.stock_sede <> p_sede
       and s.recepcion_estado in ('recibido', 'parcial')
       and s.panol_envio_item_id is distinct from p_envio_item_id
  );
$$;

create or replace function public.panol_separar_recepcion_otra_sede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede text;
  v_snapshot_id uuid;
  v_previo public.panol_obra_materiales_snapshot%rowtype;
  v_nuevo uuid;
  v_cantidad numeric;
begin
  if new.estado not in ('recibido', 'parcial') then
    return new;
  end if;

  select e.sede into v_sede
    from public.panol_envios e
   where e.id = new.envio_id;
  if v_sede not in ('Pampa', 'Chubut') then
    return new;
  end if;

  v_snapshot_id := new.obra_snapshot_item_id;
  if v_snapshot_id is null and new.purchase_request_item_id is not null then
    select s.id into v_snapshot_id
      from public.panol_obra_materiales_snapshot s
     where s.purchase_request_item_id = new.purchase_request_item_id
     order by s.created_at desc
     limit 1;
  end if;
  if v_snapshot_id is null then
    return new;
  end if;

  if not public.panol_snapshot_ocupado_en_otra_sede(v_snapshot_id, v_sede, new.id) then
    new.obra_snapshot_item_id := v_snapshot_id;
    return new;
  end if;

  select * into v_previo
    from public.panol_obra_materiales_snapshot
   where id = v_snapshot_id;
  if not found then
    return new;
  end if;

  v_cantidad := v_previo.cantidad;
  begin
    if nullif(btrim(coalesce(new.cantidad, '')), '') is not null
       and replace(new.cantidad, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_cantidad := replace(new.cantidad, ',', '.')::numeric;
    end if;
  exception when others then
    v_cantidad := v_previo.cantidad;
  end;

  insert into public.panol_obra_materiales_snapshot (
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor, rubro,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, purchase_request_id, purchase_request_item_id,
    recepcion_estado, recepcion_cantidad_recibida, recepcion_nota,
    recepcion_updated_at, stock_sede, stock_nota, es_adicional,
    variante, especificaciones
  ) values (
    v_previo.obra_id, v_previo.obra_origen_id, v_previo.material_id, v_previo.requisito_material_id,
    coalesce(nullif(btrim(new.descripcion), ''), v_previo.descripcion),
    coalesce(nullif(btrim(new.codigo), ''), v_previo.codigo),
    v_cantidad,
    coalesce(nullif(btrim(new.unidad), ''), v_previo.unidad, 'unidad'),
    v_previo.proveedor, v_previo.rubro,
    coalesce(v_previo.tipo, 'remito'),
    coalesce(v_previo.tipo_label, 'Remito'),
    v_previo.precio_unitario, v_previo.moneda, v_previo.notas,
    coalesce(v_previo.source, 'remito'),
    'en_panol',
    v_previo.purchase_request_id, coalesce(new.purchase_request_item_id, v_previo.purchase_request_item_id),
    new.estado,
    new.cantidad_recibida,
    new.nota,
    now(),
    v_sede,
    v_sede,
    v_previo.es_adicional,
    v_previo.variante,
    coalesce(v_previo.especificaciones, '{}'::jsonb)
  ) returning id into v_nuevo;

  new.obra_snapshot_item_id := v_nuevo;
  return new;
end;
$$;

drop trigger if exists trg_panol_separar_recepcion_otra_sede on public.panol_envio_items;
create trigger trg_panol_separar_recepcion_otra_sede
before insert or update of estado, cantidad_recibida, obra_snapshot_item_id, purchase_request_item_id
on public.panol_envio_items
for each row execute function public.panol_separar_recepcion_otra_sede();

create or replace function public.panol_fijar_sede_recepcion_fisica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede text;
  v_snapshot_id uuid;
begin
  if new.estado not in ('recibido', 'parcial') then return new; end if;

  select e.sede into v_sede
    from public.panol_envios e where e.id = new.envio_id;
  if v_sede not in ('Pampa', 'Chubut') then
    raise exception 'El aviso no tiene una sede física válida';
  end if;
  if not public.can_receive_envio(v_sede, auth.uid()) then
    raise exception 'Tu cuenta no puede recibir productos en %', v_sede;
  end if;

  v_snapshot_id := new.obra_snapshot_item_id;
  if v_snapshot_id is null then return new; end if;

  update public.panol_obra_materiales_snapshot
     set stock_sede = v_sede,
         updated_at = now()
   where id = v_snapshot_id
     and stock_sede is distinct from v_sede
     and not public.panol_snapshot_ocupado_en_otra_sede(id, v_sede, new.id);
  return new;
end;
$$;

create or replace function public.panol_conservar_recepcion_sede()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sede_nueva text;
begin
  if old.recepcion_estado not in ('recibido', 'parcial') then return new; end if;
  if old.stock_sede is null then return new; end if;
  if new.panol_envio_item_id is not distinct from old.panol_envio_item_id then
    return new;
  end if;
  if new.panol_envio_item_id is null then return new; end if;

  select e.sede into v_sede_nueva
    from public.panol_envio_items i
    join public.panol_envios e on e.id = i.envio_id
   where i.id = new.panol_envio_item_id;

  if v_sede_nueva is not null and v_sede_nueva is distinct from old.stock_sede then
    new.panol_envio_id := old.panol_envio_id;
    new.panol_envio_item_id := old.panol_envio_item_id;
    new.recepcion_estado := old.recepcion_estado;
    new.recepcion_cantidad_recibida := old.recepcion_cantidad_recibida;
    new.recepcion_nota := old.recepcion_nota;
    new.recepcion_updated_at := old.recepcion_updated_at;
    new.stock_sede := old.stock_sede;
    if old.estado = 'egresado' then
      new.estado := old.estado;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_conservar_recepcion_sede
  on public.panol_obra_materiales_snapshot;
create trigger trg_panol_conservar_recepcion_sede
before update of panol_envio_item_id, stock_sede, recepcion_estado, recepcion_cantidad_recibida
on public.panol_obra_materiales_snapshot
for each row execute function public.panol_conservar_recepcion_sede();

grant execute on function public.panol_snapshot_ocupado_en_otra_sede(uuid, text, uuid) to authenticated;

commit;
