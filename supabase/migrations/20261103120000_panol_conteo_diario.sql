-- Conteo diario del pañol: cada día, por sede, una lista de ~20 productos de
-- barco para contar a ciegas (el que cuenta no ve el número del sistema).
--
-- La lista la arma la app (con la misma cuenta de stock que el resto de las
-- pantallas) y la guarda acá; el primero que abre "Conteo de hoy" la crea y
-- los demás la reciben igual (único por sede y fecha).
--
-- Reglas al registrar (03/11/2026, propuesta aprobada por Ezequiel):
--   · coincide → ok.
--   · diferencia chica (hasta 2 unidades o 5 %, lo que sea mayor) → se ajusta
--     el stock libre en el momento.
--   · diferencia grande → pide un segundo conteo de OTRA persona. Si confirma
--     el primero, se ajusta; si da lo del sistema, ok; si no, queda a revisar.
--   · un faltante que el stock libre no cubre (el resto está reservado para
--     obras) nunca se ajusta solo: queda a revisar.
-- Los ajustes van al ledger como 'ajuste_ingreso' (suma) o
-- 'egreso_ajuste_conteo' (resta), sin obra, en la sede del conteo.
begin;
set local lock_timeout = '5s';

create table if not exists public.panol_conteo_lotes (
  id uuid primary key default gen_random_uuid(),
  sede text not null check (sede in ('Pampa', 'Chubut')),
  fecha date not null,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sede, fecha)
);

create table if not exists public.panol_conteo_items (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.panol_conteo_lotes(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  orden integer not null default 0,
  clase text not null check (clase in ('A', 'B', 'C', 'evento', 'arrastre')),
  motivo text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'ok', 'ajustado', 'recontar', 'revisar', 'descartado', 'pasado')),
  unidad text,
  teorico numeric,
  contado numeric,
  contado_por uuid references auth.users(id) on delete set null,
  contado_at timestamptz,
  recontado numeric,
  recontado_por uuid references auth.users(id) on delete set null,
  recontado_at timestamptz,
  ajuste numeric,
  ajuste_snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  nota text,
  updated_at timestamptz not null default now(),
  unique (lote_id, material_id)
);

create index if not exists panol_conteo_items_material_idx on public.panol_conteo_items(material_id, contado_at desc);
create index if not exists panol_conteo_items_estado_idx on public.panol_conteo_items(estado) where estado in ('pendiente', 'recontar', 'revisar');

alter table public.panol_conteo_lotes enable row level security;
alter table public.panol_conteo_items enable row level security;
drop policy if exists "conteo lotes lectura" on public.panol_conteo_lotes;
create policy "conteo lotes lectura" on public.panol_conteo_lotes for select to authenticated using (true);
drop policy if exists "conteo items lectura" on public.panol_conteo_items;
create policy "conteo items lectura" on public.panol_conteo_items for select to authenticated using (true);
revoke all on public.panol_conteo_lotes from anon, authenticated;
revoke all on public.panol_conteo_items from anon, authenticated;
grant select on public.panol_conteo_lotes to authenticated;
grant select on public.panol_conteo_items to authenticated;

-- Quién resuelve lo que quedó a revisar: administración, no el que cuenta.
create or replace function public.panol_conteo_puede_resolver(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from public.profiles p
    where p.id = p_uid and (coalesce(p.is_admin, false) or p.role in ('admin', 'oficina'))
  );
$$;
revoke all on function public.panol_conteo_puede_resolver(uuid) from public, anon;
grant execute on function public.panol_conteo_puede_resolver(uuid) to authenticated;

-- Tolerancia de una diferencia "chica".
create or replace function public.panol_conteo_tolerancia(p_teorico numeric)
returns numeric
language sql
immutable
as $$
  select greatest(2, abs(coalesce(p_teorico, 0)) * 0.05);
$$;

-- Escribe el ajuste en el ledger. p_cantidad > 0 suma, < 0 resta.
create or replace function public.panol_conteo_escribir_ajuste(p_item public.panol_conteo_items, p_sede text, p_cantidad numeric, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mat record;
  v_id uuid;
  v_qty numeric := abs(p_cantidad);
  v_suma boolean := p_cantidad > 0;
begin
  if v_qty < 0.0001 then return null; end if;
  select descripcion, codigo, unidad_medida, proveedor, precio_unitario, moneda
    into v_mat from public.panol_materiales where id = p_item.material_id;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, material_id, descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, precio_unitario, moneda, notas, source, estado,
    recepcion_estado, recepcion_updated_at, stock_sede, stock_nota,
    egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino, cantidad_egresada, es_adicional
  ) values (
    null, p_item.material_id, coalesce(v_mat.descripcion, 'Material'), v_mat.codigo, v_qty,
    coalesce(p_item.unidad, v_mat.unidad_medida, 'unidad'), nullif(btrim(coalesce(v_mat.proveedor, '')), ''),
    case when v_suma then 'ajuste_ingreso' else 'egreso_ajuste_conteo' end,
    case when v_suma then 'Ajuste por conteo' else 'Faltante por conteo' end,
    v_mat.precio_unitario, v_mat.moneda, p_nota,
    case when v_suma then 'ajuste_ingreso' else 'egreso_ajuste_conteo' end,
    case when v_suma then 'en_panol' else 'egresado' end,
    case when v_suma then 'recibido' else 'egresado' end,
    now(), p_sede, p_nota,
    case when v_suma then null else now() end,
    case when v_suma then null else v_uid end,
    case when v_suma then null else p_nota end,
    case when v_suma then null else 'conteo diario' end,
    case when v_suma then null else 'Ajuste de conteo' end,
    case when v_suma then 0 else v_qty end,
    false
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.panol_conteo_escribir_ajuste(public.panol_conteo_items, text, numeric, text) from public, anon, authenticated;

-- Crea el lote del día (o devuelve el que ya existe). p_items es la lista que
-- arma la app: [{material_id, clase, motivo, unidad}]. Lo pendiente de días
-- anteriores de la misma sede pasa a 'pasado' (la app lo trae como 'arrastre').
create or replace function public.panol_conteo_crear_lote(p_sede text, p_fecha date, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lote uuid;
  v_item jsonb;
  v_orden integer := 0;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.can_registrar_conteo_fisico(v_uid) then raise exception 'Sin permiso para contar stock'; end if;
  if p_sede not in ('Pampa', 'Chubut') then raise exception 'Sede invalida: %', p_sede; end if;
  if p_fecha is null or p_fecha > current_date + 1 then raise exception 'Fecha invalida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La lista esta vacia'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'La lista es demasiado larga'; end if;

  select id into v_lote from public.panol_conteo_lotes where sede = p_sede and fecha = p_fecha;
  if v_lote is not null then return v_lote; end if;

  insert into public.panol_conteo_lotes(sede, fecha, creado_por)
  values (p_sede, p_fecha, v_uid)
  on conflict (sede, fecha) do nothing
  returning id into v_lote;
  if v_lote is null then
    -- Otro equipo lo creó en el mismo instante.
    select id into v_lote from public.panol_conteo_lotes where sede = p_sede and fecha = p_fecha;
    return v_lote;
  end if;

  update public.panol_conteo_items i
  set estado = 'pasado', updated_at = now()
  from public.panol_conteo_lotes l
  where l.id = i.lote_id and l.sede = p_sede and l.fecha < p_fecha and i.estado = 'pendiente';

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_orden := v_orden + 1;
    insert into public.panol_conteo_items(lote_id, material_id, orden, clase, motivo, unidad)
    values (
      v_lote,
      (v_item->>'material_id')::uuid,
      v_orden,
      coalesce(nullif(v_item->>'clase', ''), 'C'),
      nullif(btrim(coalesce(v_item->>'motivo', '')), ''),
      nullif(btrim(coalesce(v_item->>'unidad', '')), '')
    )
    on conflict (lote_id, material_id) do nothing;
  end loop;

  return v_lote;
end;
$$;
revoke all on function public.panol_conteo_crear_lote(text, date, jsonb) from public, anon;
grant execute on function public.panol_conteo_crear_lote(text, date, jsonb) to authenticated;

-- Registra un conteo. p_teorico y p_libre los calcula la app en el momento
-- (total físico de la sede y lo libre de esa sede). Devuelve el renglón.
create or replace function public.panol_conteo_registrar(p_item_id uuid, p_contado numeric, p_teorico numeric, p_libre numeric, p_nota text default null)
returns public.panol_conteo_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.panol_conteo_items;
  v_sede text;
  v_tol numeric;
  v_dif numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_snap uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.can_registrar_conteo_fisico(v_uid) then raise exception 'Sin permiso para contar stock'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'Carga cuantos hay (0 si no hay ninguno)'; end if;
  if p_teorico is null then raise exception 'Falta el stock del sistema'; end if;

  select * into v_item from public.panol_conteo_items where id = p_item_id for update;
  if v_item.id is null then raise exception 'Renglon de conteo inexistente'; end if;
  select sede into v_sede from public.panol_conteo_lotes where id = v_item.lote_id;
  v_tol := public.panol_conteo_tolerancia(p_teorico);

  if v_item.estado = 'pendiente' then
    v_dif := p_contado - p_teorico;
    update public.panol_conteo_items set
      contado = p_contado, contado_por = v_uid, contado_at = now(), teorico = p_teorico,
      nota = coalesce(v_nota, nota), updated_at = now()
    where id = v_item.id returning * into v_item;

    if abs(v_dif) < 0.0001 then
      update public.panol_conteo_items set estado = 'ok' where id = v_item.id returning * into v_item;
    elsif abs(v_dif) <= v_tol and (v_dif > 0 or coalesce(p_libre, 0) + v_dif >= -0.0001) then
      v_snap := public.panol_conteo_escribir_ajuste(v_item, v_sede, v_dif, 'Conteo diario ' || to_char(now(), 'DD/MM'));
      update public.panol_conteo_items set estado = 'ajustado', ajuste = v_dif, ajuste_snapshot_id = v_snap
      where id = v_item.id returning * into v_item;
    else
      update public.panol_conteo_items set estado = 'recontar' where id = v_item.id returning * into v_item;
    end if;
    return v_item;
  end if;

  if v_item.estado = 'recontar' then
    if v_item.contado_por = v_uid then raise exception 'El segundo conteo lo tiene que hacer otra persona'; end if;
    update public.panol_conteo_items set
      recontado = p_contado, recontado_por = v_uid, recontado_at = now(), teorico = p_teorico,
      nota = coalesce(v_nota, nota), updated_at = now()
    where id = v_item.id returning * into v_item;
    v_dif := p_contado - p_teorico;

    if abs(v_dif) < 0.0001 then
      update public.panol_conteo_items set estado = 'ok' where id = v_item.id returning * into v_item;
    elsif abs(p_contado - v_item.contado) <= public.panol_conteo_tolerancia(p_contado)
      and (v_dif > 0 or coalesce(p_libre, 0) + v_dif >= -0.0001) then
      v_snap := public.panol_conteo_escribir_ajuste(v_item, v_sede, v_dif, 'Conteo diario confirmado por segundo conteo ' || to_char(now(), 'DD/MM'));
      update public.panol_conteo_items set estado = 'ajustado', ajuste = v_dif, ajuste_snapshot_id = v_snap
      where id = v_item.id returning * into v_item;
    else
      update public.panol_conteo_items set estado = 'revisar' where id = v_item.id returning * into v_item;
    end if;
    return v_item;
  end if;

  raise exception 'Este renglon ya se conto';
end;
$$;
revoke all on function public.panol_conteo_registrar(uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.panol_conteo_registrar(uuid, numeric, numeric, numeric, text) to authenticated;

-- Lo que quedó a revisar lo cierra administración: aplicar el ajuste (aunque
-- deje el libre en negativo, para reconciliar después) o descartarlo.
create or replace function public.panol_conteo_resolver(p_item_id uuid, p_aplicar boolean, p_cantidad numeric, p_teorico numeric, p_nota text default null)
returns public.panol_conteo_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.panol_conteo_items;
  v_sede text;
  v_dif numeric;
  v_snap uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.panol_conteo_puede_resolver(v_uid) then raise exception 'Solo administracion resuelve diferencias'; end if;
  select * into v_item from public.panol_conteo_items where id = p_item_id for update;
  if v_item.id is null then raise exception 'Renglon de conteo inexistente'; end if;
  if v_item.estado not in ('revisar', 'recontar') then raise exception 'Este renglon no esta pendiente de revision'; end if;
  select sede into v_sede from public.panol_conteo_lotes where id = v_item.lote_id;

  if not coalesce(p_aplicar, false) then
    update public.panol_conteo_items set estado = 'descartado', resuelto_por = v_uid, resuelto_at = now(),
      nota = coalesce(v_nota, nota), updated_at = now()
    where id = v_item.id returning * into v_item;
    return v_item;
  end if;

  if p_cantidad is null or p_cantidad < 0 then raise exception 'Cantidad invalida'; end if;
  if p_teorico is null then raise exception 'Falta el stock del sistema'; end if;
  v_dif := p_cantidad - p_teorico;
  v_snap := public.panol_conteo_escribir_ajuste(v_item, v_sede, v_dif, coalesce(v_nota, 'Diferencia de conteo resuelta por administracion'));
  update public.panol_conteo_items set
    estado = case when abs(v_dif) < 0.0001 then 'ok' else 'ajustado' end,
    ajuste = nullif(v_dif, 0), ajuste_snapshot_id = v_snap, teorico = p_teorico,
    resuelto_por = v_uid, resuelto_at = now(), nota = coalesce(v_nota, nota), updated_at = now()
  where id = v_item.id returning * into v_item;
  return v_item;
end;
$$;
revoke all on function public.panol_conteo_resolver(uuid, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.panol_conteo_resolver(uuid, boolean, numeric, numeric, text) to authenticated;

commit;
