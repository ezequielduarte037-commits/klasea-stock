-- Salidas de material sólo con tarjeta (desde el 19/11/2026).
--
-- Desde esa fecha, en Chubut no sale nada del pañol (consumibles ni
-- materiales de barco) sin la tarjeta NFC de quien retira. Si se la olvidó,
-- una persona de Técnica autoriza ese retiro con su PIN personal y queda
-- registrado quién autorizó. Laminación Pampa sigue como hasta ahora: el
-- stock de la sede Pampa no pide tarjeta.
--
-- Asignar o reemplazar una tarjeta también pide el PIN de Técnica (salvo que
-- el que está logueado sea de Técnica o admin). Desvincular no: saca acceso.
--
-- Los que están exentos de la regla son los usuarios con rol admin o tecnica:
-- correcciones, regularizaciones y scripts siguen funcionando.

-- ── 1. PIN de Técnica ──────────────────────────────────────────────────────

create table if not exists public.tecnica_pines (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  actualizado_at timestamptz not null default now()
);
alter table public.tecnica_pines enable row level security;
revoke all on public.tecnica_pines from anon, authenticated;

create table if not exists public.tecnica_pin_intentos (
  id bigserial primary key,
  actor_id uuid,
  tecnico_id uuid,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists tecnica_pin_intentos_actor_idx on public.tecnica_pin_intentos(actor_id, created_at desc);
create index if not exists tecnica_pin_intentos_tecnico_idx on public.tecnica_pin_intentos(tecnico_id, created_at desc);
alter table public.tecnica_pin_intentos enable row level security;
revoke all on public.tecnica_pin_intentos from anon, authenticated;

create table if not exists public.tecnica_autorizaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('retiro_sin_tarjeta', 'tarjeta')),
  empleado_id uuid references public.rrhh_empleados(id) on delete set null,
  tecnico_id uuid not null references public.profiles(id),
  actor_id uuid references public.profiles(id) default auth.uid(),
  sede text,
  motivo text,
  created_at timestamptz not null default now(),
  usada_at timestamptz
);
create index if not exists tecnica_autorizaciones_fecha_idx on public.tecnica_autorizaciones(created_at desc);
alter table public.tecnica_autorizaciones enable row level security;
revoke all on public.tecnica_autorizaciones from anon;
grant select on public.tecnica_autorizaciones to authenticated;

create or replace function public.es_tecnica_o_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Por rol, no por is_admin: hay usuarios de pañol con is_admin.
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and lower(coalesce(p.role::text, '')) in ('admin', 'tecnica')
  );
$$;
revoke all on function public.es_tecnica_o_admin(uuid) from public, anon;
grant execute on function public.es_tecnica_o_admin(uuid) to authenticated;

drop policy if exists "tecnica autorizaciones lectura" on public.tecnica_autorizaciones;
create policy "tecnica autorizaciones lectura"
  on public.tecnica_autorizaciones for select to authenticated
  using (public.es_tecnica_o_admin(auth.uid()) or actor_id = auth.uid());

-- Fecha de arranque. Antes, la regla valida lo que viene pero no bloquea.
create or replace function public.retiro_tarjeta_obligatoria()
returns boolean
language sql
stable
as $$
  select now() >= timestamptz '2026-11-19 00:00:00-03';
$$;
grant execute on function public.retiro_tarjeta_obligatoria() to authenticated;

create or replace function public.tecnica_mi_pin()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'puede', public.es_tecnica_o_admin(auth.uid()),
    'tiene', exists (select 1 from public.tecnica_pines where profile_id = auth.uid()),
    'actualizado_at', (select actualizado_at from public.tecnica_pines where profile_id = auth.uid())
  );
$$;
revoke all on function public.tecnica_mi_pin() from public, anon;
grant execute on function public.tecnica_mi_pin() to authenticated;

create or replace function public.tecnica_guardar_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  if not public.es_tecnica_o_admin(auth.uid()) then
    raise exception 'Sólo Técnica puede tener PIN de autorización.';
  end if;
  if v_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN tiene que tener 6 números.';
  end if;
  if v_pin ~ '^(.)\1{5}$' or v_pin in ('123456', '654321', '012345', '543210', '123123', '112233') then
    raise exception 'Ese PIN es muy fácil de adivinar. Elegí otro.';
  end if;
  insert into public.tecnica_pines (profile_id, pin_hash, actualizado_at)
  values (auth.uid(), extensions.crypt(v_pin, extensions.gen_salt('bf')), now())
  on conflict (profile_id) do update
     set pin_hash = excluded.pin_hash, actualizado_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.tecnica_guardar_pin(text) from public, anon;
grant execute on function public.tecnica_guardar_pin(text) to authenticated;

-- Quiénes pueden autorizar (tienen PIN). Sólo id y usuario.
create or replace function public.tecnica_autorizadores()
returns table (id uuid, usuario text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username::text
    from public.tecnica_pines t
    join public.profiles p on p.id = t.profile_id
   where lower(coalesce(p.role::text, '')) in ('admin', 'tecnica')
     and coalesce(p.activo, true)
   order by p.username;
$$;
revoke all on function public.tecnica_autorizadores() from public, anon;
grant execute on function public.tecnica_autorizadores() to authenticated;

-- Verifica el PIN y deja la autorización. Un PIN mal puesto no lanza error:
-- devuelve ok=false para que el intento fallido quede guardado (si lanzara,
-- se desharía el registro y no habría límite de intentos).
create or replace function public.tecnica_autorizar(
  p_tecnico_id uuid,
  p_pin text,
  p_tipo text,
  p_empleado_id uuid default null,
  p_sede text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_usuario text;
  v_fallos_actor int;
  v_fallos_tecnico int;
  v_emp record;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;
  if not (public.panol_es_operador_solicitudes(v_actor) or public.panol_puede_gestionar_nfc(v_actor)) then
    raise exception 'Sin permiso para pedir autorizaciones.';
  end if;
  if p_tipo not in ('retiro_sin_tarjeta', 'tarjeta') then
    raise exception 'Tipo de autorización inválido.';
  end if;

  select count(*) filter (where actor_id = v_actor),
         count(*) filter (where tecnico_id = p_tecnico_id)
    into v_fallos_actor, v_fallos_tecnico
    from public.tecnica_pin_intentos
   where not ok
     and created_at > now() - interval '15 minutes'
     and (actor_id = v_actor or tecnico_id = p_tecnico_id);
  if v_fallos_actor >= 5 or v_fallos_tecnico >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados PIN incorrectos. Esperá 15 minutos y probá de nuevo.');
  end if;

  select t.pin_hash, p.username::text into v_hash, v_usuario
    from public.tecnica_pines t
    join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_tecnico_id
     and lower(coalesce(p.role::text, '')) in ('admin', 'tecnica')
     and coalesce(p.activo, true);
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no tiene PIN de autorización.');
  end if;

  if extensions.crypt(btrim(coalesce(p_pin, '')), v_hash) <> v_hash then
    insert into public.tecnica_pin_intentos (actor_id, tecnico_id, ok) values (v_actor, p_tecnico_id, false);
    return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.',
      'restantes', greatest(0, 4 - v_fallos_actor));
  end if;

  if p_tipo = 'retiro_sin_tarjeta' then
    select e.id, e.nombre, coalesce(e.activo, true) activo into v_emp
      from public.rrhh_empleados e where e.id = p_empleado_id;
    if v_emp.id is null then
      return jsonb_build_object('ok', false, 'error', 'Elegí a la persona que retira.');
    end if;
    if not v_emp.activo then
      return jsonb_build_object('ok', false, 'error', v_emp.nombre || ' figura inactivo en RRHH.');
    end if;
  end if;

  insert into public.tecnica_pin_intentos (actor_id, tecnico_id, ok) values (v_actor, p_tecnico_id, true);
  insert into public.tecnica_autorizaciones (tipo, empleado_id, tecnico_id, actor_id, sede, motivo)
  values (p_tipo, p_empleado_id, p_tecnico_id, v_actor,
          nullif(btrim(coalesce(p_sede, '')), ''), nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'tecnico', v_usuario);
end;
$$;
revoke all on function public.tecnica_autorizar(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.tecnica_autorizar(uuid, text, text, uuid, text, text) to authenticated;

-- ── 2. La regla del retiro ─────────────────────────────────────────────────
-- p_retiro: { empleado_id, nfc_uid, autorizacion_id }. Devuelve
-- { metodo_firma: 'nfc' | 'pin' | null, empleado_id, nombre, autorizacion_id }
-- o lanza el error que ve el pañolero.

create or replace function public.retiro_exigir_firma(p_retiro jsonb, p_sede text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_emp_id uuid := nullif(coalesce(p_retiro, '{}'::jsonb) ->> 'empleado_id', '')::uuid;
  v_uid text := upper(regexp_replace(coalesce(p_retiro ->> 'nfc_uid', ''), '[^0-9A-Za-z]', '', 'g'));
  v_aut_id uuid := nullif(coalesce(p_retiro, '{}'::jsonb) ->> 'autorizacion_id', '')::uuid;
  v_nombre text;
  v_tarjeta text;
  v_activo boolean := false;
  v_aut_ok uuid;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;

  if v_emp_id is not null then
    select e.nombre, upper(regexp_replace(coalesce(e.nfc_uid, ''), '[^0-9A-Za-z]', '', 'g')), coalesce(e.activo, true)
      into v_nombre, v_tarjeta, v_activo
      from public.rrhh_empleados e where e.id = v_emp_id;
    if not found then v_emp_id := null; v_activo := false; end if;
  end if;

  if v_emp_id is not null and v_activo and length(v_uid) >= 4 and v_tarjeta = v_uid then
    return jsonb_build_object('metodo_firma', 'nfc', 'empleado_id', v_emp_id, 'nombre', v_nombre);
  end if;

  if v_aut_id is not null and v_emp_id is not null then
    update public.tecnica_autorizaciones a
       set usada_at = coalesce(a.usada_at, now())
     where a.id = v_aut_id
       and a.tipo = 'retiro_sin_tarjeta'
       and a.empleado_id = v_emp_id
       and a.actor_id = v_actor
       and a.created_at > now() - interval '2 hours'
    returning a.id into v_aut_ok;
    if v_aut_ok is not null then
      return jsonb_build_object('metodo_firma', 'pin', 'empleado_id', v_emp_id, 'nombre', v_nombre,
        'autorizacion_id', v_aut_ok);
    end if;
  end if;

  -- Laminación Pampa, Técnica/admin y, hasta la fecha de arranque, todos.
  if lower(btrim(coalesce(p_sede, ''))) = 'pampa'
     or public.es_tecnica_o_admin(v_actor)
     or not public.retiro_tarjeta_obligatoria() then
    return jsonb_build_object('metodo_firma', null, 'empleado_id', v_emp_id, 'nombre', v_nombre, 'exento', true);
  end if;

  if length(v_uid) >= 4 then
    raise exception 'La tarjeta apoyada no es la de %. Sin la tarjeta de quien retira no sale material.',
      coalesce(v_nombre, 'quien retira');
  end if;
  if v_aut_id is not null then
    raise exception 'La autorización de Técnica venció o es de otra persona. Pedila de nuevo.';
  end if;
  raise exception 'Sin tarjeta no sale material: apoyá la tarjeta de quien retira o pedí el PIN de Técnica.';
end;
$$;
revoke all on function public.retiro_exigir_firma(jsonb, text) from public, anon;
grant execute on function public.retiro_exigir_firma(jsonb, text) to authenticated;

-- ── 3. Columnas para saber quién retiró y cómo ─────────────────────────────

alter table public.panol_obra_materiales_snapshot
  add column if not exists retirado_empleado_id uuid references public.rrhh_empleados(id) on delete set null,
  add column if not exists retiro_metodo text,
  add column if not exists retiro_autorizacion_id uuid references public.tecnica_autorizaciones(id) on delete set null;

alter table public.panol_solicitudes
  add column if not exists retiro_autorizacion_id uuid references public.tecnica_autorizaciones(id) on delete set null;

alter table public.consumibles_movimientos
  add column if not exists nfc_uid text,
  add column if not exists retiro_autorizacion_id uuid references public.tecnica_autorizaciones(id) on delete set null;

alter table public.consumibles_movimientos drop constraint if exists consumibles_movimientos_metodo_firma_check;
alter table public.consumibles_movimientos add constraint consumibles_movimientos_metodo_firma_check
  check (metodo_firma = any (array['nfc'::text, 'manual'::text, 'sin_tarjeta'::text, 'pin'::text]));

-- ── 4. Consumibles: el mostrador inserta directo, el control va en un trigger ─
-- Sólo lo que llega desde la app (current_user authenticated). Las funciones
-- de la base (entregas, espejo de solicitudes, correcciones) corren como
-- dueño y se controlan adentro o son correcciones de algo ya firmado.

-- Sin security definer a propósito: current_user tiene que ser el de la app.
create or replace function public.consumibles_exigir_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_firma jsonb;
begin
  if new.tipo <> 'retiro' or current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_firma := public.retiro_exigir_firma(
    jsonb_build_object('empleado_id', new.empleado_id, 'nfc_uid', new.nfc_uid, 'autorizacion_id', new.retiro_autorizacion_id),
    new.sede);
  if v_firma ->> 'metodo_firma' is not null then
    new.metodo_firma := v_firma ->> 'metodo_firma';
  end if;
  if v_firma ->> 'metodo_firma' is distinct from 'pin' then
    new.retiro_autorizacion_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consumibles_exigir_firma on public.consumibles_movimientos;
create trigger trg_consumibles_exigir_firma
  before insert on public.consumibles_movimientos
  for each row when (new.tipo = 'retiro')
  execute function public.consumibles_exigir_firma();

-- ── 5. Egresos de materiales: reciben quién retira (p_retiro) ─────────────
-- Se agrega un parámetro con default al final, así que hay que borrar la
-- versión vieja: si no, quedarían dos funciones con el mismo nombre. Una
-- pestaña vieja que llame sin p_retiro sigue resolviendo a la nueva y, desde
-- la fecha de arranque, la base le contesta que hace falta la tarjeta.

drop function if exists public.panol_egresar_carrito(jsonb, uuid, text, text, text);
drop function if exists public.panol_egresar_producto(uuid, text, text, numeric, text, text, uuid, uuid, text, text, text, boolean, text, uuid);
drop function if exists public.panol_egresar_obra_materiales(uuid[], text, text, text, uuid, jsonb);
drop function if exists public.panol_confirmar_retiro_solicitud(uuid, uuid, text, text, text, text);
drop function if exists public.consumibles_entregar_solicitud(uuid, uuid, text, text, text, text);
drop function if exists public.panol_asignar_tarjeta_nfc(uuid, text, text);

CREATE OR REPLACE FUNCTION public.panol_egresar_obra_materiales(p_snapshot_ids uuid[], p_nota text DEFAULT NULL::text, p_retirado_por text DEFAULT NULL::text, p_sector_destino text DEFAULT NULL::text, p_destino_obra_id uuid DEFAULT NULL::uuid, p_cantidades jsonb DEFAULT '{}'::jsonb, p_retiro jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
  v_row record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_raw_qty text;
  v_qty numeric;
  v_available numeric;
  v_firma jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if array_length(p_snapshot_ids, 1) is null then return 0; end if;

  for v_row in
    select s.*, e.sede as envio_sede, m.es_requisito
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    left join public.panol_materiales m on m.id = s.material_id
    where s.id = any(p_snapshot_ids)
    order by s.id
    for update of s
  loop
    if not (
      public.is_panol_manager(v_uid)
      or public.can_receive_envio(coalesce(v_row.envio_sede, v_row.stock_sede), v_uid)
    ) then raise exception 'Sin permiso para egresar uno o más materiales'; end if;
    -- Sin tarjeta no sale (salvo Pampa, Técnica o admin).
    v_firma := public.retiro_exigir_firma(p_retiro, coalesce(v_row.envio_sede, v_row.stock_sede));
    v_retirado := coalesce(v_retirado, v_firma ->> 'nombre');
    if v_row.es_requisito then
      raise exception 'El material % requiere elegir un producto concreto antes de egresarlo', v_row.descripcion;
    end if;
    if public.panol_stock_movimiento_delta(
      v_row.source, v_row.estado, v_row.recepcion_estado,
      v_row.cantidad, v_row.cantidad_egresada
    ) <= 0 then
      raise exception 'El material % no tiene stock disponible en este renglón', v_row.descripcion;
    end if;

    v_available := greatest(coalesce(v_row.cantidad, 0), 0);
    v_raw_qty := p_cantidades ->> v_row.id::text;
    if v_raw_qty is null then
      v_qty := v_available;
    elsif replace(v_raw_qty, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_qty := replace(v_raw_qty, ',', '.')::numeric;
    else
      raise exception 'Cantidad inválida para %', v_row.descripcion;
    end if;
    if v_qty <= 0 or v_qty > v_available + 0.000001 then
      raise exception 'Stock insuficiente para %. Disponible: %, solicitado: %', v_row.descripcion, v_available, v_qty;
    end if;

    if v_qty >= v_available - 0.000001 then
      update public.panol_obra_materiales_snapshot
         set estado = 'egresado',
             obra_origen_id = coalesce(obra_origen_id, obra_id),
             obra_id = coalesce(p_destino_obra_id, obra_id),
             egreso_destino_obra_id = p_destino_obra_id,
             egreso_at = now(), egreso_por = v_uid, egreso_nota = v_nota,
             retirado_por = v_retirado, sector_destino = v_sector,
             retirado_empleado_id = nullif(v_firma ->> 'empleado_id', '')::uuid,
             retiro_metodo = v_firma ->> 'metodo_firma',
             retiro_autorizacion_id = nullif(v_firma ->> 'autorizacion_id', '')::uuid,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_available,
             updated_at = now()
       where id = v_row.id;
    else
      update public.panol_obra_materiales_snapshot
         set cantidad = v_available - v_qty,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_qty,
             updated_at = now()
       where id = v_row.id;

      -- Es una fila de historial: el descuento ya ocurrió al reducir la fila
      -- original. Por eso su source deliberadamente no comienza con `egreso`.
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, requisito_material_id,
        descripcion, codigo, cantidad, unidad, proveedor, rubro,
        tipo, tipo_label, precio_unitario, moneda, notas, source, orden,
        estado, purchase_request_id, purchase_request_item_id,
        panol_envio_id, panol_envio_item_id, recepcion_estado,
        recepcion_cantidad_recibida, recepcion_nota, recepcion_updated_at,
        egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino,
        retirado_empleado_id, retiro_metodo, retiro_autorizacion_id,
        egreso_destino_obra_id, cantidad_egresada, stock_sede, stock_nota,
        es_adicional, producto_asignado_at, producto_asignado_por,
        producto_asignacion_origen
      ) values (
        coalesce(p_destino_obra_id, v_row.obra_id),
        coalesce(v_row.obra_origen_id, v_row.obra_id),
        v_row.material_id, coalesce(v_row.requisito_material_id, v_row.material_id),
        v_row.descripcion, v_row.codigo, v_qty, v_row.unidad, v_row.proveedor, v_row.rubro,
        v_row.tipo, v_row.tipo_label, v_row.precio_unitario, v_row.moneda,
        v_row.notas, 'historial_retiro_parcial', v_row.orden, 'egresado',
        v_row.purchase_request_id, v_row.purchase_request_item_id,
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egresado',
        v_qty::text, v_row.recepcion_nota, now(), now(), v_uid, v_nota,
        v_retirado, v_sector, nullif(v_firma ->> 'empleado_id', '')::uuid, v_firma ->> 'metodo_firma', nullif(v_firma ->> 'autorizacion_id', '')::uuid, p_destino_obra_id, v_qty,
        v_row.stock_sede, v_row.stock_nota, coalesce(v_row.es_adicional, false),
        v_row.producto_asignado_at, v_row.producto_asignado_por,
        v_row.producto_asignacion_origen
      );
    end if;

    v_count := v_count + 1;
    if v_row.panol_envio_id is not null then
      insert into public.panol_envio_eventos(
        envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
      ) values (
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egreso_material',
        v_row.estado, 'egresado',
        concat_ws(' - ', v_nota, case when p_destino_obra_id is not null then 'Reasignado' end),
        v_uid
      );
    end if;
  end loop;

  return v_count;
end;
$function$;
revoke all on function public.panol_egresar_obra_materiales(uuid[], text, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.panol_egresar_obra_materiales(uuid[], text, text, text, uuid, jsonb, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.panol_egresar_producto(p_material_id uuid DEFAULT NULL::uuid, p_descripcion text DEFAULT NULL::text, p_codigo text DEFAULT NULL::text, p_cantidad numeric DEFAULT 1, p_unidad text DEFAULT 'unidad'::text, p_sede text DEFAULT NULL::text, p_obra_id uuid DEFAULT NULL::uuid, p_destino_obra_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text, p_retirado_por text DEFAULT NULL::text, p_sector_destino text DEFAULT NULL::text, p_es_adicional boolean DEFAULT false, p_variante text DEFAULT NULL::text, p_producto_material_id uuid DEFAULT NULL::uuid, p_retiro jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_material public.panol_materiales%rowtype;
  v_material_id uuid;
  v_requisito_id uuid;
  v_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_firma jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_id is null then raise exception 'Elegir un producto del catalogo antes de egresarlo'; end if;
  if v_sede is null then raise exception 'Elegir la sede de origen'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if not (public.is_panol_manager(v_uid) or public.can_receive_envio(v_sede, v_uid)) then
    raise exception 'Sin permiso para egresar producto';
  end if;
  -- Sin tarjeta no sale (salvo Pampa, Técnica o admin).
  v_firma := public.retiro_exigir_firma(p_retiro, v_sede);
  v_retirado := coalesce(v_retirado, v_firma ->> 'nombre');

  select r.material_id, r.requisito_material_id
    into v_material_id, v_requisito_id
    from public.panol_preparar_stock_producto(
      p_material_id, p_producto_material_id, p_variante,
      v_sede, p_obra_id, p_cantidad
    ) r;

  select * into v_material from public.panol_materiales where id = v_material_id;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor, rubro,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
    sector_destino, retirado_empleado_id, retiro_metodo, retiro_autorizacion_id, egreso_destino_obra_id, cantidad_egresada,
    es_adicional, variante, producto_asignado_at,
    producto_asignacion_origen
  ) values (
    p_obra_id, p_obra_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor, null, 'egreso_producto', 'Egreso manual',
    v_material.precio_unitario, v_material.moneda, v_nota, 'egreso_producto',
    'egresado', 'egresado', now(), v_sede, v_nota, now(), v_uid, v_nota,
    v_retirado, v_sector, nullif(v_firma ->> 'empleado_id', '')::uuid, v_firma ->> 'metodo_firma', nullif(v_firma ->> 'autorizacion_id', '')::uuid, p_destino_obra_id, p_cantidad,
    coalesce(p_es_adicional, false), null, now(),
    case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_id;

  return v_id;
end;
$function$;
revoke all on function public.panol_egresar_producto(uuid, text, text, numeric, text, text, uuid, uuid, text, text, text, boolean, text, uuid, jsonb) from public, anon;
grant execute on function public.panol_egresar_producto(uuid, text, text, numeric, text, text, uuid, uuid, text, text, text, boolean, text, uuid, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.panol_egresar_carrito(p_items jsonb, p_destino_obra_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text, p_retirado_por text DEFAULT NULL::text, p_sector_destino text DEFAULT NULL::text, p_retiro jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito esta vacio';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'El carrito supera los 100 renglones'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id := public.panol_egresar_producto(
      nullif(v_item ->> 'material_id', '')::uuid,
      nullif(v_item ->> 'descripcion', ''),
      nullif(v_item ->> 'codigo', ''),
      replace(coalesce(nullif(v_item ->> 'cantidad', ''), '0'), ',', '.')::numeric,
      coalesce(nullif(v_item ->> 'unidad', ''), 'unidad'),
      nullif(v_item ->> 'sede', ''),
      nullif(v_item ->> 'obra_id', '')::uuid,
      p_destino_obra_id,
      p_nota,
      p_retirado_por,
      p_sector_destino,
      coalesce((v_item ->> 'es_adicional')::boolean, false),
      nullif(v_item ->> 'variante', ''),
      nullif(v_item ->> 'producto_material_id', '')::uuid,
      p_retiro
    );
    v_ids := v_ids || jsonb_build_array(v_id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('cantidad', v_count, 'egreso_ids', v_ids);
end;
$function$;
revoke all on function public.panol_egresar_carrito(jsonb, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.panol_egresar_carrito(jsonb, uuid, text, text, text, jsonb) to authenticated;

-- ── 6. Solicitudes (materiales y consumibles) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.panol_confirmar_retiro_solicitud(p_solicitud_id uuid, p_empleado_id uuid DEFAULT NULL::uuid, p_nombre text DEFAULT NULL::text, p_dni text DEFAULT NULL::text, p_metodo text DEFAULT 'manual'::text, p_nfc_uid text DEFAULT NULL::text, p_autorizacion_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_firma jsonb;
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

  -- Sin tarjeta no sale (salvo Pampa, Técnica o admin).
  v_firma := public.retiro_exigir_firma(
    jsonb_build_object('empleado_id', p_empleado_id, 'nfc_uid', p_nfc_uid, 'autorizacion_id', p_autorizacion_id),
    v_sol.sede_origen);

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
         retiro_autorizacion_id = nullif(v_firma ->> 'autorizacion_id', '')::uuid,
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
$function$;
revoke all on function public.panol_confirmar_retiro_solicitud(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.panol_confirmar_retiro_solicitud(uuid, uuid, text, text, text, text, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.consumibles_entregar_solicitud(p_solicitud_id uuid, p_empleado_id uuid DEFAULT NULL::uuid, p_nombre text DEFAULT NULL::text, p_dni text DEFAULT NULL::text, p_metodo text DEFAULT 'nfc'::text, p_nfc_uid text DEFAULT NULL::text, p_autorizacion_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sol record;
  v_emp_nombre text;
  v_emp_dni text;
  v_nombre text;
  v_dni text;
  v_n int := 0;
  v_libres int;
  v_materiales int;
  v_firma jsonb;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para entregar solicitudes';
  end if;
  if coalesce(p_metodo, '') not in ('nfc', 'manual', 'sin_tarjeta') then
    raise exception 'Método de firma inválido';
  end if;

  select * into v_sol from public.panol_solicitudes where id = p_solicitud_id for update;
  if not found then
    raise exception 'Solicitud inexistente';
  end if;
  -- Reintento después de perder la respuesta: ya está, no se registra de nuevo.
  if v_sol.estado = 'entregado' then
    return jsonb_build_object('ok', true, 'ya_entregada', true, 'numero', v_sol.numero);
  end if;
  if v_sol.estado = 'cancelado' then
    raise exception 'La solicitud N° % está cancelada', v_sol.numero;
  end if;
  if v_sol.sede_origen is null or v_sol.sede_origen not in ('Pampa', 'Chubut') then
    raise exception 'Elegí de qué pañol sale la solicitud (Chubut o Pampa)';
  end if;

  if p_empleado_id is not null then
    select e.nombre, e.dni into v_emp_nombre, v_emp_dni from public.rrhh_empleados e where e.id = p_empleado_id;
  end if;
  v_nombre := coalesce(v_emp_nombre, nullif(btrim(coalesce(p_nombre, '')), ''));
  v_dni := coalesce(v_emp_dni, nullif(btrim(coalesce(p_dni, '')), ''));
  if v_nombre is null then
    raise exception 'Falta quién retira';
  end if;

  -- Nada sale sin registro: un renglón sin producto del catálogo no se puede
  -- descontar, y un material de obra no es un consumible.
  select count(*) filter (where i.material_id is null),
         count(*) filter (where i.material_id is not null and not coalesce(m.es_consumible, false))
    into v_libres, v_materiales
    from public.panol_solicitud_items i
    left join public.panol_materiales m on m.id = i.material_id
   where i.solicitud_id = v_sol.id
     and coalesce(i.cantidad, 0) > 0
     and i.estado in ('pendiente', 'preparado', 'reemplazado');
  if v_libres > 0 then
    raise exception 'Hay % renglón(es) escritos a mano: elegí el producto del catálogo antes de entregar', v_libres;
  end if;
  if v_materiales > 0 then
    raise exception 'La solicitud trae % material(es) que no son consumibles: entregalos desde Solicitudes de materiales', v_materiales;
  end if;

  -- Sin tarjeta no sale (salvo Pampa, Técnica o admin).
  v_firma := public.retiro_exigir_firma(
    jsonb_build_object('empleado_id', p_empleado_id, 'nfc_uid', p_nfc_uid, 'autorizacion_id', p_autorizacion_id),
    v_sol.sede_origen);

  insert into public.consumibles_movimientos (
    material_id, sede, tipo, cantidad,
    empleado_id, empleado_nombre, empleado_dni, metodo_firma,
    obra_id, sector, carril, lote, solicitud_id, origen, nota
  )
  select
    i.material_id, v_sol.sede_origen, 'retiro', -abs(i.cantidad),
    p_empleado_id, v_nombre, v_dni, coalesce(v_firma ->> 'metodo_firma', p_metodo),
    v_sol.obra_id, v_sol.sector, 'planificado', v_sol.id, v_sol.id, 'solicitud',
    'Solicitud N° ' || v_sol.numero
  from public.panol_solicitud_items i
  where i.solicitud_id = v_sol.id
    and i.material_id is not null
    and coalesce(i.cantidad, 0) > 0
    and i.estado in ('pendiente', 'preparado', 'reemplazado')
  -- Mismo orden de candados que el mostrador: no se bloquean entre sí.
  order by i.material_id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'La solicitud N° % no tiene nada para entregar', v_sol.numero;
  end if;

  update public.panol_solicitud_items
     set estado = 'preparado', updated_at = now()
   where solicitud_id = v_sol.id
     and estado = 'pendiente'
     and coalesce(cantidad, 0) > 0;

  update public.panol_solicitudes
     set estado = 'entregado',
         retirado_por_id = p_empleado_id,
         retirado_por_nombre = v_nombre,
         retirado_por_dni = v_dni,
         retirado_metodo = case when p_metodo = 'nfc' then 'nfc' else 'manual' end,
         retirado_nfc_uid = nullif(btrim(coalesce(p_nfc_uid, '')), ''),
         retiro_autorizacion_id = nullif(v_firma ->> 'autorizacion_id', '')::uuid,
         retirado_at = now(),
         updated_at = now()
   where id = v_sol.id;

  return jsonb_build_object('ok', true, 'movimientos', v_n, 'numero', v_sol.numero, 'retira', v_nombre);
end;
$function$;
revoke all on function public.consumibles_entregar_solicitud(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.consumibles_entregar_solicitud(uuid, uuid, text, text, text, text, uuid) to authenticated;

-- ── 7. Tarjetas: PIN para dar o cambiar, y alta de externos con tarjeta ───

CREATE OR REPLACE FUNCTION public.panol_asignar_tarjeta_nfc(p_empleado_id uuid, p_nfc_uid text, p_foto_url text DEFAULT NULL::text, p_autorizacion_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(empleado_id uuid, dni text, nombre text, grupo text, sede text, activo boolean, nfc_uid text, foto_url text, nfc_asignado_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := upper(regexp_replace(coalesce(p_nfc_uid, ''), '[^0-9A-Za-z]', '', 'g'));
  v_emp public.rrhh_empleados%rowtype;
  v_duenio public.rrhh_empleados%rowtype;
  v_foto text := nullif(btrim(coalesce(p_foto_url, '')), '');
  v_accion text;
  v_misma_tarjeta boolean;
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;
  if length(v_uid) < 4 or length(v_uid) > 128 then
    raise exception 'La tarjeta NFC no tiene un UID válido.';
  end if;

  select e.*
  into v_emp
  from public.rrhh_empleados as e
  where e.id = p_empleado_id
  for update;

  if not found then
    raise exception 'El empleado no existe en el maestro de RRHH.';
  end if;
  if not coalesce(v_emp.activo, true) then
    raise exception 'El empleado está inactivo en RRHH.';
  end if;

  v_misma_tarjeta :=
    upper(regexp_replace(coalesce(v_emp.nfc_uid, ''), '[^0-9A-Za-z]', '', 'g')) = v_uid;

  select e.*
  into v_duenio
  from public.rrhh_empleados as e
  where e.id <> p_empleado_id
    and upper(regexp_replace(coalesce(e.nfc_uid, ''), '[^0-9A-Za-z]', '', 'g')) = v_uid
  limit 1;

  if found then
    raise exception 'La tarjeta ya está asignada a % (DNI %).', v_duenio.nombre, v_duenio.dni;
  end if;

  v_accion := case
    when nullif(btrim(coalesce(v_emp.nfc_uid, '')), '') is null then 'asignacion'
    when not v_misma_tarjeta then 'reemplazo'
    when v_foto is not null then 'foto_actualizada'
    else 'actualizacion'
  end;

  -- Dar o cambiar una tarjeta pide el PIN de Técnica. Técnica, admin y RRHH
  -- (que ya edita el maestro) no lo necesitan. Cada PIN sirve una sola vez.
  if v_accion in ('asignacion', 'reemplazo')
     and not public.es_tecnica_o_admin(auth.uid())
     and lower(coalesce((select p.role::text from public.profiles p where p.id = auth.uid()), '')) not in ('rrhh', 'administracion') then
    update public.tecnica_autorizaciones a
       set usada_at = now(), empleado_id = coalesce(a.empleado_id, p_empleado_id)
     where a.id = p_autorizacion_id
       and a.tipo = 'tarjeta'
       and a.actor_id = auth.uid()
       and a.usada_at is null
       and a.created_at > now() - interval '15 minutes'
       and (a.empleado_id is null or a.empleado_id = p_empleado_id);
    if not found then
      raise exception 'Dar o cambiar una tarjeta necesita el PIN de alguien de Técnica.';
    end if;
  end if;

  update public.rrhh_empleados as e
  set
    nfc_uid = v_uid,
    foto_url = coalesce(v_foto, e.foto_url),
    nfc_asignado_at = case when v_misma_tarjeta then e.nfc_asignado_at else now() end,
    nfc_asignado_por = case when v_misma_tarjeta then e.nfc_asignado_por else auth.uid() end
  where e.id = p_empleado_id;

  insert into public.rrhh_empleados_nfc_historial (
    empleado_id,
    empleado_dni,
    empleado_nombre,
    accion,
    nfc_uid_anterior,
    nfc_uid_nuevo,
    foto_url_anterior,
    foto_url_nueva,
    actor_id
  ) values (
    v_emp.id,
    coalesce(v_emp.dni::text, ''),
    v_emp.nombre::text,
    v_accion,
    v_emp.nfc_uid,
    v_uid,
    v_emp.foto_url,
    coalesce(v_foto, v_emp.foto_url),
    auth.uid()
  );

  return query
  select
    e.id,
    e.dni::text,
    e.nombre::text,
    e.grupo::text,
    e.sede::text,
    coalesce(e.activo, true),
    e.nfc_uid::text,
    e.foto_url::text,
    e.nfc_asignado_at
  from public.rrhh_empleados as e
  where e.id = p_empleado_id;
end;
$function$;
revoke all on function public.panol_asignar_tarjeta_nfc(uuid, text, text, uuid) from public, anon;
grant execute on function public.panol_asignar_tarjeta_nfc(uuid, text, text, uuid) to authenticated;

-- Externo nuevo (herrero, vidriero, instalador) con su tarjeta, en un paso.
-- Usa el mismo alta que el mostrador (queda provisorio para que RRHH complete
-- los datos) y le asigna la tarjeta con la autorización de Técnica. Si algo
-- falla (la tarjeta es de otro, el PIN venció) no queda nada creado.
create or replace function public.panol_alta_externo_con_tarjeta(
  p_id uuid,
  p_nombre text,
  p_empresa text,
  p_dni text default null,
  p_sede text default null,
  p_nfc_uid text default null,
  p_foto_url text default null,
  p_autorizacion_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := upper(regexp_replace(coalesce(p_nfc_uid, ''), '[^0-9A-Za-z]', '', 'g'));
  v_alta jsonb;
  v_emp_id uuid;
begin
  if not public.panol_puede_gestionar_nfc(auth.uid()) then
    raise exception 'No tenés permiso para gestionar tarjetas NFC.';
  end if;
  if length(v_uid) < 4 then
    raise exception 'Apoyá la tarjeta que se le va a dar.';
  end if;

  v_alta := public.consumibles_alta_externo(coalesce(p_id, gen_random_uuid()), p_nombre, p_empresa, p_dni, p_sede);
  v_emp_id := (v_alta ->> 'id')::uuid;
  if coalesce((v_alta ->> 'activo')::boolean, true) = false then
    raise exception '% figura dado de baja en RRHH.', v_alta ->> 'nombre';
  end if;

  perform 1 from public.panol_asignar_tarjeta_nfc(v_emp_id, v_uid, p_foto_url, p_autorizacion_id);

  return v_alta || jsonb_build_object('nfc_uid', v_uid);
end;
$$;
revoke all on function public.panol_alta_externo_con_tarjeta(uuid, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.panol_alta_externo_con_tarjeta(uuid, text, text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
