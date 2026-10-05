-- SQL COMPLETO PARA SUPABASE. Copiar desde esta primera línea hasta FIN DEL ARCHIVO.
-- En SQL Editor: reemplazar toda la consulta anterior y ejecutar sin seleccionar un fragmento.
-- Generado desde supabase/migrations/20261005133000_torneria_recepciones_anticipadas.sql; puede volver a ejecutarse.

begin;

-- Una recepción física para la obra puede preceder al pedido de Tornería.
-- Reservamos cantidades de filas concretas del ledger, sin crear compras ni
-- sumar stock. El stock general conserva su dueño hasta asignarlo en Pañol.
set local lock_timeout = '5s';

alter table public.torneria_items
  add column if not exists compra_estado_sin_panol text;

create table if not exists public.torneria_recepciones_panol (
  item_id uuid not null references public.torneria_items(id) on delete cascade,
  snapshot_id uuid not null references public.panol_obra_materiales_snapshot(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id),
  cantidad numeric not null check (cantidad > 0),
  cantidad_egresada numeric not null default 0
    check (cantidad_egresada >= 0 and cantidad_egresada <= cantidad),
  recibido_at timestamptz not null,
  primary key (item_id, snapshot_id)
);
alter table public.torneria_recepciones_panol enable row level security;
drop policy if exists "torneria recepciones lectura" on public.torneria_recepciones_panol;
create policy "torneria recepciones lectura" on public.torneria_recepciones_panol
  for select to authenticated using (public.is_torneria_viewer(auth.uid()));
grant select on public.torneria_recepciones_panol to authenticated;

-- La cantidad de una recepción parcial es la que se recibió, no la avisada.
create or replace function public.torneria_stock_recibido(s public.panol_obra_materiales_snapshot)
returns numeric language sql stable set search_path = public as $$
  select case
    when s.recepcion_estado = 'parcial' then
      least(greatest(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada), 0),
        case when replace(btrim(s.recepcion_cantidad_recibida), ',', '.') ~ '^\d+(\.\d+)?$'
          then replace(btrim(s.recepcion_cantidad_recibida), ',', '.')::numeric else 0 end)
    else public.panol_stock_movimiento_delta(
      s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada)
  end;
$$;

-- Igual que el pedido: una pieza usa item.cantidad; un lote usa la receta.
create or replace function public.torneria_materiales_requeridos(p_item_id uuid)
returns table(material_id uuid, cantidad numeric)
language sql stable set search_path = public as $$
  select m.material_id,
         case when count(*) over () = 1 then i.cantidad else m.cantidad end
    from public.torneria_items i
    join public.torneria_item_materiales m on m.item_id = i.id
   where i.id = p_item_id
  union all
  select i.material_id, i.cantidad from public.torneria_items i
   where i.id = p_item_id and i.material_id is not null
     and not exists (select 1 from public.torneria_item_materiales m where m.item_id = i.id);
$$;

create or replace function public.torneria_reconciliar_panol(p_obra_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item record;
  v_material record;
  v_stock record;
  v_falta numeric;
  v_tomar numeric;
  v_disponible numeric;
  v_completo boolean;
  v_fecha timestamptz;
  v_asignados uuid[];
  v_guard text := coalesce(current_setting('klasea.torneria_panol_sync', true), '');
begin
  if p_obra_id is null or v_guard = 'on' then return; end if;
  -- No esperar con filas del ledger bloqueadas por otra recepción de la obra.
  if not pg_try_advisory_xact_lock(hashtextextended('torneria-panol:' || p_obra_id, 0)) then
    raise exception 'La obra está actualizando sus recepciones. Reintentá.' using errcode = '40001';
  end if;
  perform set_config('klasea.torneria_panol_sync', 'on', true);
  select coalesce(array_agg(distinct r.item_id), '{}'::uuid[]) into v_asignados
    from public.torneria_recepciones_panol r join public.torneria_items i on i.id = r.item_id
    join public.torneria_procesos p on p.id = i.proceso_id where p.obra_id = p_obra_id;

  -- Se revisa lo aún disponible; las salidas físicas quedan como evidencia.
  delete from public.torneria_recepciones_panol r using public.torneria_items i, public.torneria_procesos p
   where r.item_id = i.id and i.proceso_id = p.id and p.obra_id = p_obra_id
     and r.cantidad_egresada = 0;

  for v_item in
    select i.*, p.estado as proceso_estado from public.torneria_items i
    join public.torneria_procesos p on p.id = i.proceso_id
    where p.obra_id = p_obra_id
      and (i.compra_estado_sin_panol is not null or (
        p.estado in ('activo', 'borrador', 'pausado') and i.activo and not i.no_lleva
        and not i.es_resultado and i.compra_estado not in ('no_aplica', 'recibido_astillero')
        and (i.purchase_request_id is null or i.id = any(v_asignados))
        and not exists (
          select 1 from public.torneria_operacion_items oi
          join public.torneria_movimiento_items mi on mi.operacion_item_id = oi.id
          join public.torneria_movimientos mv on mv.id = mi.movimiento_id
          where oi.item_id = i.id and mv.tipo = 'salida'
        )))
    order by i.created_at, i.orden, i.id
  loop
    v_completo := false;
    if v_item.proceso_estado in ('activo', 'borrador', 'pausado')
       and v_item.activo and not v_item.no_lleva and not v_item.es_resultado
       and v_item.compra_estado <> 'no_aplica' then
      v_completo := exists (select 1 from public.torneria_materiales_requeridos(v_item.id));
      for v_material in select * from public.torneria_materiales_requeridos(v_item.id) loop
        select greatest(v_material.cantidad - coalesce(sum(r.cantidad), 0), 0) into v_falta
          from public.torneria_recepciones_panol r
         where r.item_id = v_item.id and r.material_id = v_material.material_id;
        -- Los egresos antiguos pueden estar en filas negativas separadas.
        -- Respetar el saldo neto evita reconocer existencias que ya se retiraron.
        select greatest(coalesce(sum(public.torneria_stock_recibido(s)), 0) - coalesce((
          select sum(r.cantidad - r.cantidad_egresada) from public.torneria_recepciones_panol r
          join public.panol_obra_materiales_snapshot original on original.id = r.snapshot_id
          where original.obra_id = p_obra_id and r.material_id = v_material.material_id), 0), 0)
          into v_disponible
          from public.panol_obra_materiales_snapshot s
         where s.obra_id = p_obra_id and s.material_id = v_material.material_id;
        for v_stock in
          select s.id, public.torneria_stock_recibido(s) - coalesce((
              select sum(r.cantidad - r.cantidad_egresada)
              from public.torneria_recepciones_panol r where r.snapshot_id = s.id), 0) as disponible,
            coalesce(s.recepcion_updated_at, s.created_at) as recibido_at
          from public.panol_obra_materiales_snapshot s
          join public.panol_materiales m on m.id = s.material_id
          where s.obra_id = p_obra_id and s.material_id = v_material.material_id
            and not coalesce(m.es_requisito, false)
            -- No tomar compras reservadas por el circuito anterior.
            and not exists (
              select 1 from public.torneria_items otro
              where otro.id <> v_item.id and otro.activo and not otro.no_lleva
                and otro.purchase_request_item_id = s.purchase_request_item_id
            )
          order by s.recepcion_updated_at nulls last, s.created_at, s.id
        loop
          exit when v_falta <= 0;
          v_tomar := least(v_falta, greatest(v_stock.disponible, 0), v_disponible);
          if v_tomar > 0 then
            insert into public.torneria_recepciones_panol(item_id, snapshot_id, material_id, cantidad, recibido_at)
            values (v_item.id, v_stock.id, v_material.material_id, v_tomar, v_stock.recibido_at)
            on conflict (item_id, snapshot_id) do update
              set cantidad = torneria_recepciones_panol.cantidad + excluded.cantidad;
            v_falta := v_falta - v_tomar;
            v_disponible := v_disponible - v_tomar;
          end if;
        end loop;
        v_completo := v_completo and v_falta <= 0;
      end loop;
    end if;

    if v_completo then
      select max(r.recibido_at) into v_fecha from public.torneria_recepciones_panol r where r.item_id = v_item.id;
      update public.torneria_items
         set compra_estado_sin_panol = coalesce(compra_estado_sin_panol, compra_estado),
             compra_estado = 'recibido_astillero', recibido_astillero_at = v_fecha
       where id = v_item.id and (compra_estado <> 'recibido_astillero' or recibido_astillero_at is distinct from v_fecha);
    elsif v_item.compra_estado_sin_panol is not null then
      -- Una corrección/anulación del ingreso no puede dejar una recepción falsa.
      update public.torneria_items
         set compra_estado = case when no_lleva or es_resultado then 'no_aplica' else compra_estado_sin_panol end,
             compra_estado_sin_panol = null, recibido_astillero_at = null
       where id = v_item.id;
    end if;
  end loop;
  perform set_config('klasea.torneria_panol_sync', v_guard, true);
end;
$$;
revoke all on function public.torneria_reconciliar_panol(uuid) from public;

create or replace function public.torneria_panol_desde_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.torneria_reconciliar_panol(old.obra_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.obra_id is distinct from old.obra_id) then
    perform public.torneria_reconciliar_panol(new.obra_id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_torneria_panol_recepcion on public.panol_obra_materiales_snapshot;
create trigger trg_torneria_panol_recepcion
after insert or delete or update of obra_id, material_id, cantidad, estado, recepcion_estado, recepcion_cantidad_recibida
on public.panol_obra_materiales_snapshot for each row execute function public.torneria_panol_desde_snapshot();

create or replace function public.torneria_panol_desde_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proceso_id uuid;
begin
  if tg_table_name = 'torneria_item_materiales' then
    select proceso_id into v_proceso_id from public.torneria_items where id = coalesce(new.item_id, old.item_id);
  else v_proceso_id := coalesce(new.proceso_id, old.proceso_id);
  end if;
  perform public.torneria_reconciliar_panol((select obra_id from public.torneria_procesos where id = v_proceso_id));
  return null;
end;
$$;
drop trigger if exists trg_torneria_panol_item on public.torneria_items;
create trigger trg_torneria_panol_item
after insert or delete or update of material_id, cantidad, activo, no_lleva, es_resultado
on public.torneria_items for each row execute function public.torneria_panol_desde_item();
drop trigger if exists trg_torneria_panol_materiales on public.torneria_item_materiales;
create trigger trg_torneria_panol_materiales
after insert or update or delete on public.torneria_item_materiales
for each row execute function public.torneria_panol_desde_item();

create or replace function public.torneria_panol_desde_proceso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.torneria_reconciliar_panol(new.obra_id);
  return null;
end;
$$;
drop trigger if exists trg_torneria_panol_proceso on public.torneria_procesos;
create trigger trg_torneria_panol_proceso
after update of estado on public.torneria_procesos
for each row execute function public.torneria_panol_desde_proceso();

-- La compra adelantada no inventa una solicitud hecha hoy por Tornería.
create or replace function public.torneria_items_estampar_compra()
returns trigger language plpgsql as $$
begin
  if new.compra_estado is distinct from old.compra_estado then
    case new.compra_estado
      when 'pendiente_solicitud' then
        new.solicitado_at := null; new.comprado_at := null; new.recibido_astillero_at := null;
      when 'solicitado' then new.solicitado_at := coalesce(new.solicitado_at, now());
      when 'comprado' then
        new.solicitado_at := coalesce(new.solicitado_at, now()); new.comprado_at := coalesce(new.comprado_at, now());
      when 'recibido_astillero' then
        if new.compra_estado_sin_panol is null then new.solicitado_at := coalesce(new.solicitado_at, now()); end if;
        new.recibido_astillero_at := coalesce(new.recibido_astillero_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

-- Consumo proporcional en salidas parciales. Una edición o segundo viaje no
-- vuelve a descontar las cantidades que ya salieron del astillero.
create or replace function public.torneria_salida_egresa_panol_anticipado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mov record; v_item record; v_r record; v_s public.panol_obra_materiales_snapshot%rowtype;
  v_total numeric; v_objetivo numeric; v_sacar numeric; v_saldo numeric; v_nota text;
  v_guard text := coalesce(current_setting('klasea.torneria_panol_sync', true), '');
begin
  select * into v_mov from public.torneria_movimientos where id = new.movimiento_id;
  if v_mov.tipo <> 'salida' then return new; end if;
  select i.id, i.clave, p.obra_id, oi.cantidad_requerida into v_item
    from public.torneria_operacion_items oi join public.torneria_items i on i.id = oi.item_id
    join public.torneria_procesos p on p.id = i.proceso_id where oi.id = new.operacion_item_id;
  if not exists (select 1 from public.torneria_recepciones_panol r where r.item_id = v_item.id) then return new; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('torneria-panol:' || v_item.obra_id, 0)) then
    raise exception 'La obra está actualizando sus recepciones. Reintentá.' using errcode = '40001';
  end if;
  perform set_config('klasea.torneria_panol_sync', 'on', true);
  select coalesce(sum(mi.cantidad), 0) into v_total from public.torneria_movimiento_items mi
    join public.torneria_movimientos mv on mv.id = mi.movimiento_id
   where mi.operacion_item_id = new.operacion_item_id and mv.tipo = 'salida';
  v_nota := 'Retirado por Tornería · ' || v_item.clave || coalesce(' · remito ' || nullif(v_mov.remito, ''), '');
  for v_r in select * from public.torneria_recepciones_panol where item_id = v_item.id order by recibido_at, snapshot_id for update loop
    v_objetivo := v_r.cantidad * least(v_total / nullif(v_item.cantidad_requerida, 0), 1);
    v_sacar := greatest(v_objetivo - v_r.cantidad_egresada, 0);
    if v_sacar <= 0 then continue; end if;
    select * into v_s from public.panol_obra_materiales_snapshot where id = v_r.snapshot_id for update;
    v_saldo := public.torneria_stock_recibido(v_s);
    if v_saldo < v_sacar then raise exception 'El stock reservado de % cambió. Revisá el ingreso en Pañol.', v_s.descripcion; end if;
    update public.torneria_recepciones_panol set cantidad_egresada = cantidad_egresada + v_sacar
      where item_id = v_r.item_id and snapshot_id = v_r.snapshot_id;
    if v_saldo = v_sacar then
      update public.panol_obra_materiales_snapshot
         set estado = 'egresado', cantidad = v_saldo, cantidad_egresada = cantidad_egresada + v_sacar,
             obra_origen_id = coalesce(obra_origen_id, obra_id), egreso_at = v_mov.fecha,
             egreso_por = auth.uid(), egreso_nota = v_nota, retirado_por = v_mov.responsable, sector_destino = 'Tornería'
       where id = v_s.id;
    else
      update public.panol_obra_materiales_snapshot
         set cantidad = v_saldo - v_sacar,
             recepcion_cantidad_recibida = (v_saldo - v_sacar)::text, updated_at = now()
       where id = v_s.id;
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, descripcion, codigo, cantidad, unidad,
        proveedor, rubro, precio_unitario, moneda, source, estado,
        recepcion_estado, stock_sede, cantidad_egresada, egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino)
      values (v_s.obra_id, v_s.obra_id, v_s.material_id, v_s.descripcion, v_s.codigo, v_sacar, v_s.unidad,
        v_s.proveedor, v_s.rubro, v_s.precio_unitario, v_s.moneda,
        'torneria_retiro', 'egresado', 'recibido', v_s.stock_sede, v_sacar, v_mov.fecha, auth.uid(), v_nota, v_mov.responsable, 'Tornería');
    end if;
  end loop;
  perform set_config('klasea.torneria_panol_sync', v_guard, true);
  return new;
end;
$$;
drop trigger if exists trg_torneria_salida_egresa_panol_anticipado on public.torneria_movimiento_items;
create trigger trg_torneria_salida_egresa_panol_anticipado
after insert on public.torneria_movimiento_items
for each row execute function public.torneria_salida_egresa_panol_anticipado();

-- El producto exacto, sólo para renglones de bocina sin otro catálogo elegido.
-- El tubo resultante del K55 no es materia prima y queda fuera.
do $$
declare v_material uuid;
begin
  select (array_agg(id))[1] into v_material from public.panol_materiales
   where lower(regexp_replace(descripcion, '\s+', '', 'g')) =
     lower(regexp_replace('Tubo PRFV (tubo bocina) D.int=75mm, D.ext=92mm, largo=1m', '\s+', '', 'g'))
   having count(*) = 1;
  if v_material is not null then
    update public.torneria_plantilla_items set material_id = v_material
     where clave = 'tubo_bocina' and not es_resultado and material_id is null;
    insert into public.torneria_plantilla_item_materiales(plantilla_item_id, material_id, cantidad)
    select id, v_material, cantidad from public.torneria_plantilla_items
     where clave = 'tubo_bocina' and not es_resultado and material_id = v_material
    on conflict (plantilla_item_id, material_id) do nothing;
    update public.torneria_items set material_id = v_material
     where clave = 'tubo_bocina' and not es_resultado and material_id is null;
    insert into public.torneria_item_materiales(item_id, material_id, cantidad)
    select id, v_material, cantidad from public.torneria_items
     where clave = 'tubo_bocina' and not es_resultado and material_id = v_material
    on conflict (item_id, material_id) do nothing;
  end if;
end;
$$;

-- Puesta al día: sólo recepciones reales aún en stock. No reinterpretar salidas.
do $$ declare v_obra uuid; begin
  for v_obra in select obra_id from public.torneria_procesos loop
    perform public.torneria_reconciliar_panol(v_obra);
  end loop;
end; $$;

-- Lectura de stock general para Tornería sin abrir acceso al ledger completo.
create or replace function public.torneria_stock_general(p_material_ids uuid[])
returns table(material_id uuid, sede text, cantidad numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_torneria_viewer(auth.uid()), false) then raise exception 'Sin permiso para consultar Tornería'; end if;
  return query select s.material_id, coalesce(s.stock_sede, e.sede, 'Sin sede'), sum(public.torneria_stock_recibido(s))
    from public.panol_obra_materiales_snapshot s left join public.panol_envios e on e.id = s.panol_envio_id
   where s.obra_id is null and s.material_id = any(p_material_ids)
   group by s.material_id, coalesce(s.stock_sede, e.sede, 'Sin sede')
   having sum(public.torneria_stock_recibido(s)) > 0;
end;
$$;
revoke all on function public.torneria_stock_general(uuid[]) from public;
grant execute on function public.torneria_stock_general(uuid[]) to authenticated;

-- El puente anterior sigue para compras vinculadas sin recepción anticipada.
create or replace function public.torneria_salida_egresa_panol()
returns trigger
language plpgsql
security definer
set search_path = public
as $egreso$
declare
  v_mov  record;
  v_item record;
  v_fila record;
  v_nota text;
begin
  select m.tipo, m.destino, m.responsable, m.remito, m.fecha
    into v_mov
    from public.torneria_movimientos m
   where m.id = new.movimiento_id;

  -- Una recepcion es el regreso del taller: no saca nada del galpon.
  if v_mov.tipo is distinct from 'salida' then
    return new;
  end if;

  select ti.clave, ti.purchase_request_item_id
    into v_item
    from public.torneria_operacion_items oi
    join public.torneria_items ti on ti.id = oi.item_id
   where oi.id = new.operacion_item_id;

  -- Los ingresos anticipados se descuentan por cantidad en su propio trigger.
  -- Sin ninguno de los vínculos no hay fila de Pañol que dar de baja.
  if v_item.purchase_request_item_id is null or exists (
    select 1 from public.torneria_recepciones_panol r
    join public.torneria_operacion_items oi on oi.item_id = r.item_id
    where oi.id = new.operacion_item_id
  ) then
    return new;
  end if;

  v_nota := 'Retirado por Torneria'
    || coalesce(' · ' || nullif(btrim(v_mov.destino), ''), '')
    || coalesce(' · remito ' || nullif(btrim(v_mov.remito), ''), '')
    || coalesce(' · ' || nullif(btrim(v_item.clave), ''), '');

  for v_fila in
    select s.id, s.cantidad, s.descripcion, pm.es_requisito
      from public.panol_obra_materiales_snapshot s
      left join public.panol_materiales pm on pm.id = s.material_id
     where s.purchase_request_item_id = v_item.purchase_request_item_id
       and public.panol_stock_movimiento_delta(
             s.source, s.estado, s.recepcion_estado,
             s.cantidad, s.cantidad_egresada) > 0
       for update of s
  loop
    -- Un material generico necesita que alguien elija el producto concreto
    -- antes de salir. Eso no se puede resolver desde el circuito, y frenar la
    -- salida de Torneria por una regla de panol seria peor: queda en el stock
    -- y avisa.
    if v_fila.es_requisito then
      raise notice 'Torneria: "%" queda en el stock de panol, falta elegir el producto concreto', v_fila.descripcion;
      continue;
    end if;

    update public.panol_obra_materiales_snapshot
       set estado            = 'egresado',
           obra_origen_id    = coalesce(obra_origen_id, obra_id),
           egreso_at         = coalesce(v_mov.fecha, now()),
           egreso_por        = auth.uid(),
           egreso_nota       = v_nota,
           retirado_por      = nullif(btrim(coalesce(v_mov.responsable, '')), ''),
           sector_destino    = 'Tornería',
           cantidad_egresada = coalesce(cantidad_egresada, 0) + greatest(coalesce(cantidad, 0), 0),
           updated_at        = now()
     where id = v_fila.id;
  end loop;

  return new;
end
$egreso$;

commit;

select
  'OK: integración activada' as resultado,
  (select count(*) from public.torneria_recepciones_panol) as recepciones_asignadas,
  (select count(*) from public.torneria_items
    where compra_estado_sin_panol is not null
      and compra_estado = 'recibido_astillero') as materiales_reconocidos;

-- FIN DEL ARCHIVO: la última consulta debe devolver OK: integración activada.
