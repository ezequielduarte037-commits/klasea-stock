-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: correcciones de la revisión adversarial (Codex, 10/10/2026)
-- sobre 20261010120000_consumibles_base.sql, antes del arranque del martes.
--
--   1. Conteo y retiro simultáneos: todo movimiento toma el mismo candado por
--      material y sede que el RPC de conteo. Sin eso, un retiro sin confirmar
--      queda afuera del teórico y el conteo lo descuenta dos veces.
--   2. Anular un conteo que tiene conteos posteriores rompe la cadena de
--      diferencias (los posteriores se calcularon contra él): se rechaza.
--   3. El conteo acepta un id del cliente: si se reintenta después de perder la
--      respuesta, devuelve el mismo movimiento en vez de recalcular.
--   4. Espejo de solicitudes: si se deshace un retiro y se vuelve a confirmar,
--      vuelve a entrar (la unicidad de snapshot_id pasa a ser solo entre filas
--      vigentes).
--   5. Desde el cliente no se puede elegir la fecha, el autor, el costo de un
--      retiro ni el nombre de otro empleado: los pone la base.
--   6. NaN e infinitos no entran en ninguna cantidad.
--   7. La unidad de entrega no cambia si el consumible ya tiene movimientos
--      (cambiaría el significado de todo el historial).
--   8. Alta de consumible (material + config) en una sola transacción e
--      idempotente, para el pañolero que cuenta el lunes.
--   9. Vista de retiros por solicitud sin producto vinculado: salieron del pañol
--      pero no pueden entrar al registro hasta que alguien elija el producto.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 6. Sin NaN ni infinitos ─────────────────────────────────────────────────

alter table public.consumibles_movimientos
  drop constraint if exists consumibles_movimientos_finitos;
alter table public.consumibles_movimientos
  add constraint consumibles_movimientos_finitos check (
    cantidad not in ('NaN', 'Infinity', '-Infinity')
    and (gramos is null or gramos not in ('NaN', 'Infinity'))
    and (contado is null or contado not in ('NaN', 'Infinity'))
    and (teorico is null or teorico not in ('NaN', 'Infinity', '-Infinity'))
    and (costo_unitario_ars is null or costo_unitario_ars not in ('NaN', 'Infinity'))
  );

-- ── 1 y 5. Candado por material y sede, y campos que pone la base ───────────

-- Nombre y DNI del empleado para congelarlos en el movimiento. Va aparte y con
-- permisos de su dueño porque no todos los operadores leen rrhh_empleados.
create or replace function public.consumibles_datos_empleado(p_id uuid, out nombre text, out dni text)
language sql
stable
security definer
set search_path = public
as $f$
  select e.nombre, e.dni
    from public.rrhh_empleados e
   where e.id = p_id
     and public.panol_es_operador_solicitudes(auth.uid());
$f$;

revoke all on function public.consumibles_datos_empleado(uuid) from public;
grant execute on function public.consumibles_datos_empleado(uuid) to authenticated;

-- Corre con los permisos de QUIEN INSERTA (no security definer) para poder
-- distinguir: desde la app current_user es 'authenticated'; desde el espejo de
-- solicitudes o el RPC de conteo es el dueño de esas funciones, que sí pueden
-- fijar fecha y costo.
create or replace function public.consumibles_movimiento_completar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_emp record;
  v_costo numeric;
  v_desde_app boolean := current_user in ('authenticated', 'anon');
begin
  perform pg_advisory_xact_lock(hashtext('consumibles:' || new.material_id::text || ':' || new.sede));

  if v_desde_app then
    -- La cola sin conexión del mostrador manda la hora real del retiro. Se
    -- acepta si es de las últimas 24 h; cualquier otra fecha, ahora.
    if new.created_at is null
       or new.created_at < now() - interval '24 hours'
       or new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    end if;
    new.created_by := auth.uid();
  else
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  -- El costo de un retiro o una devolución es el vigente; el de un ingreso
  -- puede venir de la factura.
  select c.costo_unitario_ars into v_costo
    from public.consumibles_config c
   where c.material_id = new.material_id;
  if new.tipo <> 'ingreso' and v_desde_app then
    new.costo_unitario_ars := v_costo;
  else
    new.costo_unitario_ars := coalesce(new.costo_unitario_ars, v_costo);
  end if;

  -- Nombre y DNI salen siempre de RRHH cuando hay empleado.
  if new.empleado_id is not null then
    select d.nombre, d.dni into v_emp from public.consumibles_datos_empleado(new.empleado_id) d;
    if v_emp.nombre is not null then
      new.empleado_nombre := v_emp.nombre;
      new.empleado_dni := v_emp.dni;
    end if;
  end if;

  return new;
end;
$$;

-- ── 2. No anular un conteo que tiene conteos posteriores ────────────────────

create or replace function public.consumibles_movimiento_solo_anular()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.anulado_at is not null then
    raise exception 'El movimiento ya está anulado';
  end if;
  if (to_jsonb(new) - array['anulado_at', 'anulado_por', 'anulado_motivo'])
     is distinct from (to_jsonb(old) - array['anulado_at', 'anulado_por', 'anulado_motivo']) then
    raise exception 'Un movimiento de consumibles no se edita: anulalo y cargalo de nuevo';
  end if;
  if new.anulado_at is null then
    raise exception 'Solo se puede anular el movimiento';
  end if;
  if old.tipo = 'inventario' and exists (
    select 1
      from public.consumibles_movimientos x
     where x.material_id = old.material_id
       and x.sede = old.sede
       and x.tipo = 'inventario'
       and x.anulado_at is null
       and x.id <> old.id
       and x.created_at >= old.created_at
  ) then
    raise exception 'Hay un conteo posterior de este producto: si este estaba mal, volvé a contar en vez de anularlo';
  end if;
  new.anulado_por := coalesce(auth.uid(), new.anulado_por);
  return new;
end;
$$;

-- ── 3. Conteo idempotente ───────────────────────────────────────────────────

drop function if exists public.consumibles_registrar_conteo(uuid, text, numeric, numeric, text, uuid);

create or replace function public.consumibles_registrar_conteo(
  p_material_id uuid,
  p_sede text,
  p_contado numeric,
  p_gramos numeric default null,
  p_nota text default null,
  p_lote uuid default null,
  p_id uuid default null
)
returns public.consumibles_movimientos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teorico numeric;
  v_row public.consumibles_movimientos;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para contar stock';
  end if;
  if p_contado is null or p_contado < 0 or p_contado in ('NaN', 'Infinity') then
    raise exception 'La cantidad contada tiene que ser un número de cero para arriba';
  end if;
  if p_sede is null or p_sede not in ('Pampa', 'Chubut') then
    raise exception 'Elegí la sede del pañol';
  end if;

  -- Reintento del mismo conteo: devuelve lo que ya se grabó, sin recalcular.
  if p_id is not null then
    select * into v_row from public.consumibles_movimientos where id = p_id;
    if found then
      return v_row;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('consumibles:' || p_material_id::text || ':' || p_sede));

  select coalesce(sum(cantidad), 0)
    into v_teorico
    from public.consumibles_movimientos
   where material_id = p_material_id
     and sede = p_sede
     and anulado_at is null;

  insert into public.consumibles_movimientos (
    id, material_id, sede, tipo, cantidad, contado, teorico, gramos, lote, origen, nota
  )
  values (
    coalesce(p_id, gen_random_uuid()), p_material_id, p_sede, 'inventario',
    p_contado - v_teorico, p_contado, v_teorico,
    p_gramos, p_lote, 'conteo', nullif(trim(coalesce(p_nota, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.consumibles_registrar_conteo(uuid, text, numeric, numeric, text, uuid, uuid) to authenticated;

-- ── 4. Espejo: un retiro deshecho y vuelto a confirmar vuelve a entrar ──────

alter table public.consumibles_movimientos
  drop constraint if exists consumibles_movimientos_snapshot_id_key;
create unique index if not exists consumibles_mov_snapshot_vigente_idx
  on public.consumibles_movimientos (snapshot_id)
  where snapshot_id is not null and anulado_at is null;

create or replace function public.consumibles_espejo_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.retirado_at is not null and old.retirado_at is null then
    insert into public.consumibles_movimientos (
      material_id, sede, tipo, cantidad,
      empleado_id, empleado_nombre, empleado_dni, metodo_firma,
      obra_id, sector, carril, solicitud_id, snapshot_id, origen, nota, created_at
    )
    select
      s.material_id,
      coalesce(s.stock_sede, new.sede_origen),
      'retiro',
      -abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad)),
      new.retirado_por_id, new.retirado_por_nombre, new.retirado_por_dni,
      case when new.retirado_metodo in ('nfc', 'manual') then new.retirado_metodo end,
      coalesce(s.obra_id, new.obra_id),
      coalesce(s.sector_destino, new.sector),
      'planificado',
      new.id,
      s.id,
      'solicitud',
      'Solicitud N° ' || new.numero,
      new.retirado_at
    from public.panol_obra_materiales_snapshot s
    where s.panol_solicitud_id = new.id
      and s.source = 'solicitud_consumible_retiro'
      and s.material_id is not null
      and coalesce(s.stock_sede, new.sede_origen) in ('Pampa', 'Chubut')
      and coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0) <> 0
      and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
      and not exists (
        select 1 from public.consumibles_movimientos x
         where x.snapshot_id = s.id and x.anulado_at is null
      )
    -- Mismo orden de candados que cualquier otro carrito: evita bloqueos cruzados.
    order by s.material_id;

  elsif old.retirado_at is not null and new.retirado_at is null then
    update public.consumibles_movimientos
       set anulado_at = now(),
           anulado_por = auth.uid(),
           anulado_motivo = 'Retiro de solicitud deshecho'
     where solicitud_id = new.id
       and origen = 'solicitud'
       and anulado_at is null;
  end if;

  return new;
end;
$$;

-- ── 7. La unidad de entrega no cambia con historial ─────────────────────────

create or replace function public.consumibles_config_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unidad_entrega is distinct from old.unidad_entrega and exists (
    select 1 from public.consumibles_movimientos m
     where m.material_id = new.material_id and m.anulado_at is null
  ) then
    raise exception 'Este consumible ya tiene movimientos en %: cambiar la unidad cambiaría todo su historial', old.unidad_entrega;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- ── 8. Alta de consumible en una transacción ────────────────────────────────

create or replace function public.consumibles_crear(
  p_id uuid,
  p_descripcion text,
  p_unidad text default 'unidad',
  p_categoria_id uuid default null,
  p_proveedor text default null,
  p_ubicacion text default null,
  p_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_unidad text := coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad');
  v_categoria uuid := p_categoria_id;
  v_cfg public.consumibles_config;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para dar de alta consumibles';
  end if;
  if p_id is null then
    raise exception 'Falta el id del consumible nuevo';
  end if;
  if v_desc is null then
    raise exception 'Falta la descripción';
  end if;

  -- Reintento: si ya se creó, no se duplica.
  if not exists (select 1 from public.panol_materiales where id = p_id) then
    if v_categoria is null then
      select c.id into v_categoria
        from public.panol_categorias c
       where translate(lower(btrim(coalesce(c.nombre, ''))), 'áéíóúü', 'aeiouu')
             in ('sin categoria', 'a asignar', 'varios', 'otros', 'general')
       order by c.orden nulls last, c.nombre nulls last
       limit 1;
    end if;
    if v_categoria is null then
      raise exception 'No hay un rubro "Sin categoría" ni "A asignar": elegí el rubro';
    end if;

    insert into public.panol_materiales (
      id, descripcion, unidad_medida, categoria_id, proveedor, ubicacion,
      es_consumible, origen, revisado, activo
    )
    values (
      p_id, v_desc, v_unidad, v_categoria, nullif(btrim(coalesce(p_proveedor, '')), ''),
      nullif(upper(btrim(coalesce(p_ubicacion, ''))), ''),
      true, 'consumibles', false, true
    );
  end if;

  insert into public.consumibles_config (
    material_id, forma_entrega, unidad_entrega, proveedor_nombre, proveedor_codigo,
    unidad_compra, factor_compra, lote_compra, costo_unitario_ars, costo_lista_item_id,
    costo_actualizado_at
  )
  select
    p_id,
    coalesce(r.forma_entrega, 'unidad'),
    coalesce(r.unidad_entrega, v_unidad),
    r.proveedor_nombre, r.proveedor_codigo, r.unidad_compra, r.factor_compra,
    r.lote_compra, r.costo_unitario_ars, r.costo_lista_item_id,
    case when r.costo_unitario_ars is not null then now() end
  from jsonb_populate_record(null::public.consumibles_config, coalesce(p_config, '{}'::jsonb)) r
  on conflict (material_id) do nothing;

  select * into v_cfg from public.consumibles_config where material_id = p_id;
  return jsonb_build_object('material_id', p_id, 'codigo_etiqueta', v_cfg.codigo_etiqueta, 'config', to_jsonb(v_cfg));
end;
$$;

grant execute on function public.consumibles_crear(uuid, text, text, uuid, text, text, jsonb) to authenticated;

-- ── 9. Retiros por solicitud que no pudieron entrar al registro ─────────────

create or replace view public.consumibles_retiros_sin_producto
with (security_invoker = true) as
select
  s.id as snapshot_id,
  s.panol_solicitud_id as solicitud_id,
  sol.numero,
  coalesce(s.egreso_at, sol.retirado_at, s.created_at) as fecha,
  s.descripcion,
  s.cantidad,
  s.unidad,
  coalesce(sol.retirado_por_nombre, sol.retira) as retira,
  coalesce(s.stock_sede, sol.sede_origen) as sede
from public.panol_obra_materiales_snapshot s
join public.panol_solicitudes sol on sol.id = s.panol_solicitud_id
where s.source = 'solicitud_consumible_retiro'
  and s.material_id is null
  and sol.retirado_at >= timestamptz '2026-10-10 00:00:00-03'
  and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%';

grant select on public.consumibles_retiros_sin_producto to authenticated;

commit;
