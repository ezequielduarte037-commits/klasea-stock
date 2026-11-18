-- ezequiel.adm (rol compras) también autoriza con PIN, como Técnica.
-- Pedido de Ezequiel el 18/11/2026. Va por id y no por is_admin: hay
-- usuarios de pañol con is_admin que no tienen que quedar exentos.

create or replace function public.es_tecnica_o_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and (
         lower(coalesce(p.role::text, '')) in ('admin', 'tecnica')
         or p.id = 'b93b4fda-590a-41b7-8382-317aa74917e1'::uuid  -- ezequiel.adm
       )
  );
$$;

-- Quiénes pueden autorizar: la misma regla.
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
   where public.es_tecnica_o_admin(p.id)
     and coalesce(p.activo, true)
   order by p.username;
$$;

-- Verificar el PIN: la misma regla.
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
     and public.es_tecnica_o_admin(p.id)
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
