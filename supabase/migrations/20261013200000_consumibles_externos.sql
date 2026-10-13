-- Consumibles: externos que retiran del pañol (herreros, vidrieros, instaladores).
--
-- Vienen a hacer un trabajo puntual, no son del astillero ni de las cuadrillas
-- contratistas, y retiran consumibles. Decisión de Ezequiel (13/10):
--   - Se cargan en RRHH como contratistas que no fichan, con su empresa como
--     contratista marcada `externo`. Así aparecen en el buscador del mostrador
--     como cualquiera y RRHH los completa después (DNI, foto, tarjeta).
--   - El pañol los da de alta en el momento desde el mostrador (RPC
--     consumibles_alta_externo): el pañol no escribe rrhh_empleados.
--   - Lo que se llevan va como costo de la obra; cada retiro guarda la empresa
--     para sumarla aparte y descontarla si corresponde.
--   - El mostrador pide quién del astillero autoriza (columna autorizado_por).
--
-- El pañol no lee rrhh_contratistas: la empresa le llega por
-- consumibles_externos() y queda congelada en cada movimiento.

begin;

-- ── 1. Empresa externa ──────────────────────────────────────────────────────

alter table public.rrhh_contratistas
  add column if not exists externo boolean not null default false;

comment on column public.rrhh_contratistas.externo is
  'Empresa que viene a hacer trabajos puntuales (herrería, vidrios, instalaciones). Sus retiros de consumibles piden autorización y se suman por empresa.';

-- ── 2. La empresa queda en cada movimiento ──────────────────────────────────

alter table public.consumibles_movimientos
  add column if not exists empleado_empresa text,
  add column if not exists empleado_externo boolean not null default false;

comment on column public.consumibles_movimientos.empleado_empresa is
  'Contratista de RRHH de quien retira, congelado al registrar (como el nombre y el DNI).';

create or replace function public.consumibles_empresa_empleado(p_id uuid, out empresa text, out externo boolean)
returns record
language sql
stable
security definer
set search_path = public
as $$
  select c.nombre, coalesce(c.externo, false)
    from public.rrhh_empleados e
    join public.rrhh_contratistas c on c.id = e.contratista_id
   where e.id = p_id
     and e.grupo = 'contratista'
     and public.panol_es_operador_solicitudes(auth.uid());
$$;

revoke all on function public.consumibles_empresa_empleado(uuid) from public;
grant execute on function public.consumibles_empresa_empleado(uuid) to authenticated;

create or replace function public.consumibles_movimiento_completar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_emp record;
  v_empresa text;
  v_externo boolean;
  v_costo numeric;
  v_cupo numeric;
  v_hoy numeric;
  v_dia_desde timestamptz;
  v_desde_app boolean := current_user in ('authenticated', 'anon');
begin
  perform pg_advisory_xact_lock(hashtext('consumibles:' || new.material_id::text || ':' || new.sede));

  if v_desde_app then
    -- La cola sin conexión del mostrador manda la hora real del retiro. Se
    -- acepta hasta 72 h atrás; más vieja, se registra ahora y se anota.
    if new.created_at is null or new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    elsif new.created_at < now() - interval '72 hours' then
      new.nota := concat_ws(' · ', nullif(new.nota, ''),
        'Hora real ' || to_char(new.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ', registrado tarde');
      new.created_at := now();
    end if;
    new.created_by := auth.uid();
  else
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  -- El costo de un retiro o una devolución es el vigente; el de un ingreso
  -- puede venir de la factura.
  select c.costo_unitario_ars, c.cupo_diario into v_costo, v_cupo
    from public.consumibles_config c
   where c.material_id = new.material_id;
  if new.tipo <> 'ingreso' and v_desde_app then
    new.costo_unitario_ars := v_costo;
  else
    new.costo_unitario_ars := coalesce(new.costo_unitario_ars, v_costo);
  end if;

  -- Nombre, DNI y empresa (si es contratista) salen siempre de RRHH cuando hay empleado.
  if new.empleado_id is not null then
    select d.nombre, d.dni into v_emp from public.consumibles_datos_empleado(new.empleado_id) d;
    if v_emp.nombre is not null then
      new.empleado_nombre := v_emp.nombre;
      new.empleado_dni := v_emp.dni;
    end if;
    select x.empresa, x.externo into v_empresa, v_externo from public.consumibles_empresa_empleado(new.empleado_id) x;
    new.empleado_empresa := v_empresa;
    new.empleado_externo := coalesce(v_externo, false);
  end if;

  -- Cupo diario por persona y producto, en el día de Argentina del retiro.
  -- Con el candado de arriba, el saldo que se lee es el que vale.
  if new.tipo = 'retiro' and new.empleado_id is not null and v_cupo is not null and not new.fuera_cupo then
    v_dia_desde := date_trunc('day', new.created_at at time zone 'America/Argentina/Buenos_Aires')
                   at time zone 'America/Argentina/Buenos_Aires';
    select coalesce(sum(-m.cantidad), 0) into v_hoy
      from public.consumibles_movimientos m
     where m.empleado_id = new.empleado_id
       and m.material_id = new.material_id
       and m.tipo = 'retiro'
       and m.anulado_at is null
       and m.created_at >= v_dia_desde
       and m.created_at < v_dia_desde + interval '1 day';
    if v_hoy + abs(new.cantidad) > v_cupo then
      new.fuera_cupo := true;
    end if;
  end if;

  return new;
end;
$$;

-- ── 3. Lo que el mostrador necesita saber de los externos ───────────────────

create or replace function public.consumibles_externos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.panol_es_operador_solicitudes(auth.uid()) then null else jsonb_build_object(
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
        from public.rrhh_contratistas c
       where c.externo and coalesce(c.activo, true)
    ), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'contratista_id', c.id, 'empresa', c.nombre))
        from public.rrhh_empleados e
        join public.rrhh_contratistas c on c.id = e.contratista_id
       where c.externo and e.grupo = 'contratista' and coalesce(e.activo, true)
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.consumibles_externos() from public;
grant execute on function public.consumibles_externos() to authenticated;

-- ── 4. Alta en el momento desde el mostrador ────────────────────────────────

create or replace function public.consumibles_alta_externo(
  p_id uuid,
  p_nombre text,
  p_empresa text,
  p_dni text default null,
  p_sede text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_empresa text := regexp_replace(trim(coalesce(p_empresa, '')), '\s+', ' ', 'g');
  v_dni text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_contratista public.rrhh_contratistas;
  v_emp public.rrhh_empleados;
  v_quien text;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para dar de alta externos';
  end if;
  if length(v_nombre) < 3 then
    raise exception 'Escribí el apellido y el nombre';
  end if;
  if length(v_empresa) < 2 then
    raise exception 'Escribí la empresa (o el nombre del que lo manda)';
  end if;
  if v_dni is not null and length(v_dni) not between 7 and 8 then
    raise exception 'El DNI tiene que tener 7 u 8 números';
  end if;

  -- Reintento del mismo alta: devuelve lo ya creado.
  select * into v_emp from public.rrhh_empleados where id = p_id;
  if not found and v_dni is not null then
    -- Ya está en RRHH con ese DNI (externo o no): se usa esa persona.
    select * into v_emp from public.rrhh_empleados where dni = v_dni;
  end if;

  if v_emp.id is null then
    perform pg_advisory_xact_lock(hashtext('consumibles:externo:' || lower(v_empresa)));
    select * into v_contratista
      from public.rrhh_contratistas
     where lower(trim(nombre)) = lower(v_empresa)
     order by externo desc, created_at
     limit 1;
    if v_contratista.id is null then
      insert into public.rrhh_contratistas (nombre, activo, externo)
      values (v_empresa, true, true)
      returning * into v_contratista;
    end if;

    -- La misma persona de la misma empresa ya cargada sin DNI: no se duplica.
    select * into v_emp
      from public.rrhh_empleados
     where contratista_id = v_contratista.id
       and lower(regexp_replace(trim(nombre), '\s+', ' ', 'g')) = lower(v_nombre)
     limit 1;

    if v_emp.id is null then
      select nullif(trim(username), '') into v_quien from public.profiles where id = auth.uid();
      insert into public.rrhh_empleados (id, nombre, dni, grupo, contratista_id, ficha, activo, sede, notas)
      values (
        coalesce(p_id, gen_random_uuid()), v_nombre, v_dni, 'contratista', v_contratista.id, false, true,
        nullif(trim(coalesce(p_sede, '')), ''),
        'Externo: alta desde el mostrador de consumibles el '
          || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
          || coalesce(' por ' || v_quien, '') || '. Completar en RRHH.'
      )
      returning * into v_emp;
    end if;
  end if;

  select * into v_contratista from public.rrhh_contratistas where id = v_emp.contratista_id;

  return jsonb_build_object(
    'id', v_emp.id,
    'nombre', v_emp.nombre,
    'dni', v_emp.dni,
    'sede', v_emp.sede,
    'activo', v_emp.activo,
    'foto_url', v_emp.foto_url,
    'nfc_uid', v_emp.nfc_uid,
    'empresa', case when v_emp.grupo = 'contratista' then v_contratista.nombre end,
    'externo', v_emp.grupo = 'contratista' and coalesce(v_contratista.externo, false),
    'nuevo', v_emp.id = p_id
  );
end;
$$;

revoke all on function public.consumibles_alta_externo(uuid, text, text, text, text) from public;
grant execute on function public.consumibles_alta_externo(uuid, text, text, text, text) to authenticated;

commit;
