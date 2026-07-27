-- Solicitudes de pañol conectadas al stock + bandeja automática de faltantes.
--
-- Reglas del circuito:
--   · Un retiro normal genera un egreso real en el ledger de pañol.
--   · Un consumible deja trazabilidad, pero su delta de stock es exactamente 0.
--   · La confirmación es atómica e idempotente: o se registran todos los
--     movimientos preparados, o no se registra ninguno.
--   · Si falta stock, el ítem pasa a "faltante" y aparece en Compras.
--   · Deshacer un retiro crea el contramovimiento correspondiente.

-- ── 1. Contexto de stock y metadatos por ítem ───────────────────────────────

alter table public.panol_solicitudes
  add column if not exists sede_origen text;

alter table public.panol_solicitudes
  drop constraint if exists panol_solicitudes_sede_origen_check;
alter table public.panol_solicitudes
  add constraint panol_solicitudes_sede_origen_check
  check (sede_origen is null or sede_origen in ('Pampa', 'Chubut'));

update public.panol_solicitudes s
   set sede_origen = p.sede
  from public.profiles p
 where s.sede_origen is null
   and s.created_by = p.id
   and p.sede in ('Pampa', 'Chubut');

alter table public.panol_solicitud_items
  add column if not exists es_consumible boolean not null default false,
  add column if not exists faltante_auto boolean not null default false,
  add column if not exists stock_disponible_al_marcar numeric;

update public.panol_solicitud_items i
   set es_consumible = coalesce(m.es_consumible, false)
  from public.panol_materiales m
 where i.material_id = m.id
   and i.es_consumible is distinct from coalesce(m.es_consumible, false);

alter table public.panol_obra_materiales_snapshot
  add column if not exists panol_solicitud_id uuid
    references public.panol_solicitudes(id) on delete set null,
  add column if not exists panol_solicitud_item_id uuid
    references public.panol_solicitud_items(id) on delete set null,
  add column if not exists reversion_de_id uuid
    references public.panol_obra_materiales_snapshot(id) on delete set null;

create index if not exists idx_panol_snapshot_solicitud
  on public.panol_obra_materiales_snapshot(panol_solicitud_id, created_at desc)
  where panol_solicitud_id is not null;

create index if not exists idx_panol_snapshot_solicitud_item
  on public.panol_obra_materiales_snapshot(panol_solicitud_item_id)
  where panol_solicitud_item_id is not null;

create unique index if not exists idx_panol_snapshot_reversion_unica
  on public.panol_obra_materiales_snapshot(reversion_de_id)
  where reversion_de_id is not null;

-- Compras también necesita ver y corregir la pantalla completa de solicitudes.
create or replace function public.panol_es_operador_solicitudes(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in
          ('admin', 'panol', 'compras', 'tecnica', 'oficina')
      )
  );
$$;

revoke all on function public.panol_es_operador_solicitudes(uuid) from public;
grant execute on function public.panol_es_operador_solicitudes(uuid) to authenticated;

-- ── 2. Stock disponible canónico ───────────────────────────────────────────

create or replace function public.panol_stock_disponible(
  p_material_id uuid,
  p_sede text default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(sum(
      case
        when s.estado in ('en_panol', 'recibido', 'parcial')
         and (
           s.recepcion_estado in ('recibido', 'parcial')
           or coalesce(s.source, '') in
             ('stock_general', 'remito', 'transferencia_ingreso', 'ajuste_ingreso')
           or left(coalesce(s.source, ''), 6) = 'stock_'
           or left(coalesce(s.source, ''), 21) = 'transferencia_ingreso'
         )
          then coalesce(s.cantidad, 0)
        when (
          s.egreso_destino_obra_id is not null
          or s.estado = 'egresado'
          or left(coalesce(s.source, ''), 6) = 'egreso'
          or left(coalesce(s.source, ''), 20) = 'transferencia_egreso'
        )
          then -abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0))
        else 0
      end
    ), 0),
    0
  )
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  where s.material_id = p_material_id
    and (
      p_sede is null
      or lower(coalesce(s.stock_sede, e.sede, '')) = lower(p_sede)
    );
$$;

revoke all on function public.panol_stock_disponible(uuid, text) from public;
grant execute on function public.panol_stock_disponible(uuid, text) to authenticated;

-- ── 3. Bandeja de faltantes para Compras ───────────────────────────────────

create table if not exists public.panol_faltantes_compras (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references public.panol_solicitudes(id) on delete set null,
  solicitud_item_id uuid unique references public.panol_solicitud_items(id) on delete set null,
  material_id uuid references public.panol_materiales(id) on delete set null,
  obra_id uuid references public.produccion_obras(id) on delete set null,

  solicitud_numero int,
  descripcion text not null,
  codigo text,
  cantidad_solicitada numeric not null default 1,
  stock_disponible numeric not null default 0,
  cantidad_faltante numeric not null default 1,
  unidad text,
  obra_texto text,
  sede text,
  sector text,
  prioridad text not null default 'normal',
  es_consumible boolean not null default false,
  motivo text,

  estado text not null default 'nuevo',
  notas_compras text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  resuelto_por uuid references public.profiles(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.panol_faltantes_compras
  drop constraint if exists panol_faltantes_compras_estado_check;
alter table public.panol_faltantes_compras
  add constraint panol_faltantes_compras_estado_check
  check (estado in ('nuevo', 'en_revision', 'pedido', 'comprado', 'resuelto', 'descartado'));

create index if not exists idx_panol_faltantes_estado
  on public.panol_faltantes_compras(estado, prioridad, created_at desc);
create index if not exists idx_panol_faltantes_sede
  on public.panol_faltantes_compras(sede, estado);
create index if not exists idx_panol_faltantes_material
  on public.panol_faltantes_compras(material_id)
  where material_id is not null;

create table if not exists public.panol_faltantes_compras_historial (
  id bigint generated by default as identity primary key,
  faltante_id uuid references public.panol_faltantes_compras(id) on delete cascade,
  accion text not null,
  estado_anterior text,
  estado_nuevo text,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_panol_faltantes_historial
  on public.panol_faltantes_compras_historial(faltante_id, created_at desc);

create or replace function public.compras_puede_gestionar_faltantes(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in ('admin', 'compras')
      )
  );
$$;

revoke all on function public.compras_puede_gestionar_faltantes(uuid) from public;
grant execute on function public.compras_puede_gestionar_faltantes(uuid) to authenticated;

alter table public.panol_faltantes_compras enable row level security;
alter table public.panol_faltantes_compras_historial enable row level security;

drop policy if exists "faltantes compras select manager" on public.panol_faltantes_compras;
create policy "faltantes compras select manager"
  on public.panol_faltantes_compras for select to authenticated
  using (public.compras_puede_gestionar_faltantes());

drop policy if exists "faltantes compras update manager" on public.panol_faltantes_compras;
create policy "faltantes compras update manager"
  on public.panol_faltantes_compras for update to authenticated
  using (public.compras_puede_gestionar_faltantes())
  with check (public.compras_puede_gestionar_faltantes());

drop policy if exists "faltantes historial select manager" on public.panol_faltantes_compras_historial;
create policy "faltantes historial select manager"
  on public.panol_faltantes_compras_historial for select to authenticated
  using (public.compras_puede_gestionar_faltantes());

grant select, update on public.panol_faltantes_compras to authenticated;
grant select on public.panol_faltantes_compras_historial to authenticated;

create or replace function public.panol_faltante_fill_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  new.updated_at := now();
  if new.estado in ('resuelto', 'descartado') and old.estado is distinct from new.estado then
    new.resuelto_por := auth.uid();
    new.resuelto_at := now();
  elsif new.estado not in ('resuelto', 'descartado') then
    new.resuelto_por := null;
    new.resuelto_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_faltante_fill_actor on public.panol_faltantes_compras;
create trigger trg_panol_faltante_fill_actor
before update on public.panol_faltantes_compras
for each row execute function public.panol_faltante_fill_actor();

create or replace function public.panol_faltante_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.panol_faltantes_compras_historial(
    faltante_id, accion, estado_anterior, estado_nuevo,
    datos_anteriores, datos_nuevos, actor_id
  )
  values (
    new.id,
    case when tg_op = 'INSERT' then 'creado' else 'actualizado' end,
    case when tg_op = 'UPDATE' then old.estado end,
    new.estado,
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_panol_faltante_audit on public.panol_faltantes_compras;
create trigger trg_panol_faltante_audit
after insert or update on public.panol_faltantes_compras
for each row execute function public.panol_faltante_audit();

-- ── 4. Detección y sincronización automática de faltantes ──────────────────

create or replace function public.panol_solicitud_item_control_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede text;
  v_consumible boolean := false;
  v_stock numeric := 0;
begin
  if new.material_id is not null then
    select coalesce(m.es_consumible, false)
      into v_consumible
      from public.panol_materiales m
     where m.id = new.material_id;
    new.es_consumible := coalesce(v_consumible, false);
  else
    new.es_consumible := coalesce(new.es_consumible, false);
  end if;

  select s.sede_origen
    into v_sede
    from public.panol_solicitudes s
   where s.id = new.solicitud_id;

  if new.material_id is not null and not new.es_consumible and v_sede is not null then
    v_stock := public.panol_stock_disponible(new.material_id, v_sede);
    if new.estado in ('pendiente', 'preparado', 'reemplazado')
       and coalesce(new.cantidad, 0) > v_stock then
      new.estado := 'faltante';
      new.faltante_auto := true;
      new.stock_disponible_al_marcar := v_stock;
    elsif new.estado <> 'faltante' then
      new.faltante_auto := false;
      new.stock_disponible_al_marcar := null;
    end if;
  elsif new.estado <> 'faltante' then
    new.faltante_auto := false;
    new.stock_disponible_al_marcar := null;
  end if;

  if new.estado = 'faltante' and new.stock_disponible_al_marcar is null then
    new.stock_disponible_al_marcar := case
      when new.material_id is null or new.es_consumible then 0
      else public.panol_stock_disponible(new.material_id, v_sede)
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_panol_solicitud_item_control_stock on public.panol_solicitud_items;
create trigger trg_panol_solicitud_item_control_stock
before insert or update of material_id, cantidad, estado on public.panol_solicitud_items
for each row execute function public.panol_solicitud_item_control_stock();

create or replace function public.panol_solicitud_sync_faltante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol record;
  v_stock numeric := 0;
begin
  if tg_op = 'DELETE' then
    update public.panol_faltantes_compras
       set estado = 'descartado',
           motivo = coalesce(motivo, 'El ítem fue eliminado de la solicitud.')
     where solicitud_item_id = old.id
       and estado not in ('resuelto', 'descartado');
    return old;
  end if;

  select *
    into v_sol
    from public.panol_solicitudes
   where id = new.solicitud_id;

  if new.estado = 'faltante' then
    v_stock := greatest(coalesce(new.stock_disponible_al_marcar, 0), 0);
    insert into public.panol_faltantes_compras(
      solicitud_id, solicitud_item_id, material_id, obra_id,
      solicitud_numero, descripcion, codigo, cantidad_solicitada,
      stock_disponible, cantidad_faltante, unidad, obra_texto, sede,
      sector, prioridad, es_consumible, motivo, created_by, updated_by
    )
    values (
      new.solicitud_id, new.id, new.material_id, v_sol.obra_id,
      v_sol.numero, new.descripcion, new.codigo, new.cantidad,
      v_stock, greatest(coalesce(new.cantidad, 0) - v_stock, 0),
      new.unidad, v_sol.obra_texto, v_sol.sede_origen,
      v_sol.sector, v_sol.prioridad, new.es_consumible,
      case
        when new.faltante_auto then 'Stock insuficiente detectado automáticamente.'
        else 'Marcado como faltante por pañol.'
      end,
      coalesce(v_sol.created_by, auth.uid()), auth.uid()
    )
    on conflict (solicitud_item_id) do update set
      solicitud_id = excluded.solicitud_id,
      material_id = excluded.material_id,
      obra_id = excluded.obra_id,
      solicitud_numero = excluded.solicitud_numero,
      descripcion = excluded.descripcion,
      codigo = excluded.codigo,
      cantidad_solicitada = excluded.cantidad_solicitada,
      stock_disponible = excluded.stock_disponible,
      cantidad_faltante = excluded.cantidad_faltante,
      unidad = excluded.unidad,
      obra_texto = excluded.obra_texto,
      sede = excluded.sede,
      sector = excluded.sector,
      prioridad = excluded.prioridad,
      es_consumible = excluded.es_consumible,
      motivo = excluded.motivo,
      estado = case
        when public.panol_faltantes_compras.estado in ('pedido', 'comprado')
          then public.panol_faltantes_compras.estado
        else 'nuevo'
      end,
      resuelto_por = null,
      resuelto_at = null,
      updated_by = auth.uid(),
      updated_at = now();
  else
    update public.panol_faltantes_compras
       set estado = 'resuelto',
           motivo = case
             when motivo is null then 'El ítem dejó de estar marcado como faltante.'
             else motivo
           end
     where solicitud_item_id = new.id
       and estado not in ('resuelto', 'descartado');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_panol_solicitud_sync_faltante on public.panol_solicitud_items;
create trigger trg_panol_solicitud_sync_faltante
after insert or update of material_id, descripcion, codigo, cantidad, unidad, estado
or delete on public.panol_solicitud_items
for each row execute function public.panol_solicitud_sync_faltante();

-- Al cambiar la sede se recalculan los ítems aún no entregados.
create or replace function public.panol_solicitud_recalcular_por_sede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sede_origen is distinct from new.sede_origen then
    update public.panol_solicitud_items
       set cantidad = cantidad,
           estado = case
             when estado = 'faltante' and faltante_auto then 'pendiente'
             else estado
           end
     where solicitud_id = new.id
       and estado in ('pendiente', 'preparado', 'reemplazado', 'faltante');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_solicitud_recalcular_por_sede on public.panol_solicitudes;
create trigger trg_panol_solicitud_recalcular_por_sede
after update of sede_origen on public.panol_solicitudes
for each row execute function public.panol_solicitud_recalcular_por_sede();

-- ── 5. Confirmación atómica del retiro ─────────────────────────────────────

create or replace function public.panol_confirmar_retiro_solicitud(
  p_solicitud_id uuid,
  p_empleado_id uuid default null,
  p_nombre text default null,
  p_dni text default null,
  p_metodo text default 'manual',
  p_nfc_uid text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sol record;
  v_item record;
  v_linea record;
  v_material record;
  v_stock numeric;
  v_requerido numeric;
  v_restante numeric;
  v_pendientes int := 0;
  v_faltantes int := 0;
  v_egresos int := 0;
  v_consumibles int := 0;
  v_nota text;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if not public.panol_es_operador_solicitudes(v_uid) then
    raise exception 'Sin permiso para confirmar retiros';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta identificar a la persona que retira';
  end if;
  if p_metodo not in ('nfc', 'manual') then
    raise exception 'Método de retiro inválido';
  end if;

  select *
    into v_sol
    from public.panol_solicitudes
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud inexistente';
  end if;
  if v_sol.estado = 'entregado' then
    return jsonb_build_object('ok', true, 'alreadyDelivered', true);
  end if;
  if v_sol.estado <> 'listo' then
    return jsonb_build_object(
      'ok', false, 'code', 'estado',
      'message', 'La solicitud debe estar en Listo para retirar.'
    );
  end if;
  if v_sol.sede_origen is null then
    return jsonb_build_object(
      'ok', false, 'code', 'sede',
      'message', 'Elegí la sede de la que sale el stock.'
    );
  end if;

  -- Serializa los movimientos del ledger durante el control y el descuento.
  lock table public.panol_obra_materiales_snapshot in share row exclusive mode;

  select count(*)
    into v_pendientes
    from public.panol_solicitud_items
   where solicitud_id = p_solicitud_id
     and estado = 'pendiente';

  if v_pendientes > 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'pendientes',
      'message', format('Quedan %s ítems pendientes de preparar.', v_pendientes)
    );
  end if;

  -- Se controla por material agrupado: dos renglones del mismo material no
  -- pueden consumir dos veces la misma disponibilidad.
  for v_item in
    select
      i.material_id,
      sum(i.cantidad) as cantidad
    from public.panol_solicitud_items i
    left join public.panol_materiales m on m.id = i.material_id
    where i.solicitud_id = p_solicitud_id
      and i.estado in ('preparado', 'reemplazado')
      and i.material_id is not null
      and not coalesce(i.es_consumible, m.es_consumible, false)
    group by i.material_id
    order by i.material_id
  loop
    v_stock := public.panol_stock_disponible(v_item.material_id, v_sol.sede_origen);
    v_requerido := coalesce(v_item.cantidad, 0);
    if v_requerido > v_stock then
      v_restante := v_stock;
      for v_linea in
        select id, cantidad
          from public.panol_solicitud_items
         where solicitud_id = p_solicitud_id
           and material_id = v_item.material_id
           and estado in ('preparado', 'reemplazado')
         order by orden, created_at, id
      loop
        if coalesce(v_linea.cantidad, 0) <= v_restante then
          v_restante := v_restante - coalesce(v_linea.cantidad, 0);
        else
          update public.panol_solicitud_items
             set estado = 'faltante',
                 faltante_auto = true,
                 stock_disponible_al_marcar = v_restante
           where id = v_linea.id;
          v_restante := 0;
          v_faltantes := v_faltantes + 1;
        end if;
      end loop;
    end if;
  end loop;

  if v_faltantes > 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'faltantes', 'faltantes', v_faltantes,
      'message', 'Cambió el stock: los materiales insuficientes se enviaron a Faltantes de Compras.'
    );
  end if;

  if not exists (
    select 1 from public.panol_solicitud_items
    where solicitud_id = p_solicitud_id
      and estado in ('preparado', 'reemplazado')
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'sin_items',
      'message', 'No hay ítems preparados para entregar.'
    );
  end if;

  v_nota := format(
    'Retiro por solicitud de pañol N° %s · %s',
    v_sol.numero,
    btrim(p_nombre)
  );

  for v_item in
    select
      i.*,
      coalesce(i.es_consumible, m.es_consumible, false) as consumible_real
    from public.panol_solicitud_items i
    left join public.panol_materiales m on m.id = i.material_id
    where i.solicitud_id = p_solicitud_id
      and i.estado in ('preparado', 'reemplazado')
    order by i.orden, i.created_at
  loop
    select
      null::text as descripcion,
      null::text as codigo,
      null::text as unidad_medida,
      null::text as proveedor,
      null::numeric as precio_unitario,
      null::text as moneda
      into v_material;

    if v_item.material_id is not null then
      select
        m.descripcion, m.codigo, m.unidad_medida, m.proveedor,
        m.precio_unitario, m.moneda
        into v_material
        from public.panol_materiales m
       where m.id = v_item.material_id;
    end if;

    if v_item.consumible_real then
      -- Sin destino de egreso y sin source "egreso": todas las pantallas de
      -- stock lo computan como delta 0, pero el movimiento queda auditable.
      insert into public.panol_obra_materiales_snapshot(
        obra_id, material_id, descripcion, codigo, cantidad, unidad, proveedor,
        tipo, tipo_label, precio_unitario, moneda, notas, source, estado,
        recepcion_estado, recepcion_updated_at, stock_sede, stock_nota,
        egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino,
        cantidad_egresada, es_adicional, panol_solicitud_id,
        panol_solicitud_item_id
      )
      values (
        v_sol.obra_id, v_item.material_id,
        coalesce(v_item.descripcion, v_material.descripcion, 'Consumible'),
        coalesce(v_item.codigo, v_material.codigo),
        v_item.cantidad,
        coalesce(v_item.unidad, v_material.unidad_medida, 'unidad'),
        v_material.proveedor,
        'consumible', 'Retiro consumible por solicitud',
        v_material.precio_unitario, v_material.moneda,
        v_nota || ' · [sin impacto stock]',
        'solicitud_consumible_retiro', 'en_panol',
        null, now(), v_sol.sede_origen,
        'Consumible sin stock controlado · cantidad retirada: ' || v_item.cantidad::text,
        now(), v_uid, v_nota, btrim(p_nombre), v_sol.sector,
        0, false, p_solicitud_id, v_item.id
      );
      v_consumibles := v_consumibles + 1;
    else
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, descripcion, codigo, cantidad,
        unidad, proveedor, tipo, tipo_label, precio_unitario, moneda, notas,
        source, estado, recepcion_estado, recepcion_updated_at, stock_sede,
        stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
        sector_destino, egreso_destino_obra_id, cantidad_egresada,
        es_adicional, panol_solicitud_id, panol_solicitud_item_id
      )
      values (
        null, null, v_item.material_id,
        coalesce(v_item.descripcion, v_material.descripcion, 'Material'),
        coalesce(v_item.codigo, v_material.codigo),
        v_item.cantidad,
        coalesce(v_item.unidad, v_material.unidad_medida, 'unidad'),
        v_material.proveedor,
        'solicitud', 'Egreso por solicitud de pañol',
        v_material.precio_unitario, v_material.moneda,
        v_nota, 'egreso_solicitud', 'egresado', 'egresado', now(),
        v_sol.sede_origen, v_nota, now(), v_uid, v_nota,
        btrim(p_nombre), v_sol.sector, v_sol.obra_id, v_item.cantidad,
        false, p_solicitud_id, v_item.id
      );
      v_egresos := v_egresos + 1;
    end if;
  end loop;

  update public.panol_solicitudes
     set retirado_por_id = p_empleado_id,
         retirado_por_nombre = btrim(p_nombre),
         retirado_por_dni = nullif(btrim(coalesce(p_dni, '')), ''),
         retirado_metodo = p_metodo,
         retirado_nfc_uid = nullif(btrim(coalesce(p_nfc_uid, '')), ''),
         retirado_at = now(),
         estado = 'entregado'
   where id = p_solicitud_id;

  return jsonb_build_object(
    'ok', true,
    'egresos', v_egresos,
    'consumibles', v_consumibles
  );
end;
$$;

revoke all on function public.panol_confirmar_retiro_solicitud(uuid, uuid, text, text, text, text) from public;
grant execute on function public.panol_confirmar_retiro_solicitud(uuid, uuid, text, text, text, text) to authenticated;

-- ── 6. Reversión atómica ───────────────────────────────────────────────────

create or replace function public.panol_anular_retiro_solicitud(
  p_solicitud_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sol record;
  v_mov record;
  v_revertidos int := 0;
  v_consumibles int := 0;
  v_marca text := '[anulado] Retiro de solicitud deshecho';
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if not public.panol_es_operador_solicitudes(v_uid) then
    raise exception 'Sin permiso para deshacer retiros';
  end if;

  select *
    into v_sol
    from public.panol_solicitudes
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud inexistente';
  end if;
  if v_sol.estado <> 'entregado' then
    return jsonb_build_object('ok', true, 'alreadyReverted', true);
  end if;

  lock table public.panol_obra_materiales_snapshot in share row exclusive mode;

  for v_mov in
    select *
      from public.panol_obra_materiales_snapshot
     where panol_solicitud_id = p_solicitud_id
       and source in ('egreso_solicitud', 'solicitud_consumible_retiro')
       and lower(coalesce(notas, '') || ' ' || coalesce(egreso_nota, ''))
           not like '%[anulado]%'
     order by created_at, id
  loop
    if v_mov.source = 'egreso_solicitud' then
      insert into public.panol_obra_materiales_snapshot(
        obra_id, material_id, descripcion, codigo, cantidad, unidad, proveedor,
        rubro, tipo, tipo_label, precio_unitario, moneda, notas, source,
        estado, recepcion_estado, recepcion_updated_at, stock_sede, stock_nota,
        egreso_por, cantidad_egresada, es_adicional, panol_solicitud_id,
        panol_solicitud_item_id, reversion_de_id
      )
      values (
        v_mov.obra_id, v_mov.material_id, v_mov.descripcion, v_mov.codigo,
        abs(coalesce(nullif(v_mov.cantidad_egresada, 0), v_mov.cantidad, 0)),
        v_mov.unidad, v_mov.proveedor, v_mov.rubro,
        'reversion', 'Reversión de retiro por solicitud',
        v_mov.precio_unitario, v_mov.moneda,
        'Reversión del movimiento ' || v_mov.id::text,
        'stock_solicitud_reversion', 'en_panol', 'recibido', now(),
        v_mov.stock_sede, 'Stock restituido al deshacer retiro',
        v_uid, 0, coalesce(v_mov.es_adicional, false),
        p_solicitud_id, v_mov.panol_solicitud_item_id, v_mov.id
      );
      v_revertidos := v_revertidos + 1;
    else
      -- El consumible ya tenía delta 0: sólo se anula su registro.
      v_consumibles := v_consumibles + 1;
    end if;

    update public.panol_obra_materiales_snapshot
       set notas = concat_ws(' · ', nullif(notas, ''), v_marca),
           egreso_nota = concat_ws(' · ', nullif(egreso_nota, ''), v_marca),
           stock_nota = concat_ws(' · ', nullif(stock_nota, ''), v_marca)
     where id = v_mov.id;
  end loop;

  update public.panol_solicitudes
     set retirado_por_id = null,
         retirado_por_nombre = null,
         retirado_por_dni = null,
         retirado_metodo = null,
         retirado_nfc_uid = null,
         retirado_at = null,
         estado = 'listo'
   where id = p_solicitud_id;

  return jsonb_build_object(
    'ok', true,
    'revertidos', v_revertidos,
    'consumiblesAnulados', v_consumibles
  );
end;
$$;

revoke all on function public.panol_anular_retiro_solicitud(uuid) from public;
grant execute on function public.panol_anular_retiro_solicitud(uuid) to authenticated;

-- Evita que un update directo saltee el ledger. Los RPC anteriores insertan o
-- revierten los movimientos antes de cambiar la cabecera, por lo que pasan.
create or replace function public.panol_solicitud_proteger_estado_entregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'entregado' and old.estado <> 'entregado' then
    if new.retirado_at is null or not exists (
      select 1
      from public.panol_obra_materiales_snapshot m
      where m.panol_solicitud_id = new.id
        and m.source in ('egreso_solicitud', 'solicitud_consumible_retiro')
        and lower(coalesce(m.notas, '') || ' ' || coalesce(m.egreso_nota, ''))
            not like '%[anulado]%'
    ) then
      raise exception 'Confirmá el retiro desde la firma para generar los movimientos de stock';
    end if;
  end if;

  if old.estado = 'entregado' and new.estado <> 'entregado' and exists (
    select 1
    from public.panol_obra_materiales_snapshot m
    where m.panol_solicitud_id = new.id
      and m.source in ('egreso_solicitud', 'solicitud_consumible_retiro')
      and lower(coalesce(m.notas, '') || ' ' || coalesce(m.egreso_nota, ''))
          not like '%[anulado]%'
  ) then
    raise exception 'Deshacé el retiro desde el comprobante para revertir el stock';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_panol_solicitud_proteger_entregado on public.panol_solicitudes;
create trigger trg_panol_solicitud_proteger_entregado
before update of estado, retirado_at on public.panol_solicitudes
for each row execute function public.panol_solicitud_proteger_estado_entregado();

comment on column public.panol_solicitudes.sede_origen is
  'Sede física de la que se descuenta stock al confirmar el retiro.';
comment on column public.panol_solicitud_items.es_consumible is
  'Snapshot del tipo de material. Los consumibles se registran sin delta de stock.';
comment on table public.panol_faltantes_compras is
  'Bandeja automática de materiales faltantes detectados en solicitudes de pañol.';
