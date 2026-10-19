-- Las altas del mostrador conservan su historial, pero requieren revisión de RRHH/Técnica.
begin;

alter table public.rrhh_empleados
  add column if not exists provisorio boolean not null default false,
  add column if not exists alta_origen text not null default 'rrhh',
  add column if not exists alta_creado_por uuid references public.profiles(id),
  add column if not exists alta_confirmado_por uuid references public.profiles(id),
  add column if not exists alta_confirmado_at timestamptz;

comment on column public.rrhh_empleados.provisorio is
  'Persona pendiente de aprobación de RRHH o Técnica; no integra el plantel definitivo ni ficha.';

-- Sólo el origen explícito del RPC histórico: no se infiere por quién asignó una tarjeta o foto.
update public.rrhh_empleados e
   set provisorio = true, ficha = false, alta_origen = 'panol',
       alta_creado_por = (select p.id from public.profiles p
         where p.username = substring(e.notas from ' por (.+)\. Completar en RRHH\.$') limit 1)
 where e.notas like 'Externo: alta desde el mostrador de consumibles el %'
   and e.alta_origen = 'rrhh' and e.alta_confirmado_at is null;

create or replace function public.rrhh_puede_gestionar_altas(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id
    and lower(coalesce(p.role::text,'')) <> 'panol'
    and (coalesce(p.is_admin,false) or lower(coalesce(p.role::text,'')) in ('admin','rrhh','administracion','tecnica')));
$$;
revoke all on function public.rrhh_puede_gestionar_altas(uuid) from public;
grant execute on function public.rrhh_puede_gestionar_altas(uuid) to authenticated;

create or replace function public.rrhh_empleado_controlar_alta()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_panol boolean;
  v_gestor boolean;
begin
  -- Migraciones y tareas de mantenimiento sin sesión de usuario.
  if v_actor is null then return new; end if;
  select lower(coalesce(p.role::text,'')) = 'panol' into v_panol from public.profiles p where p.id = v_actor;
  v_gestor := public.rrhh_puede_gestionar_altas(v_actor);
  if tg_op = 'INSERT' then
    if coalesce(v_panol,false) then
      new.provisorio := true;
      new.alta_origen := 'panol';
    elsif not v_gestor and not new.provisorio then
      raise exception 'El alta definitiva la confirma RRHH o Técnica' using errcode = '42501';
    end if;
    new.alta_creado_por := v_actor;
    new.alta_confirmado_at := case when not new.provisorio then now() end;
    new.alta_confirmado_por := case when not new.provisorio then v_actor end;
  else
    if old.provisorio is distinct from new.provisorio and not v_gestor then
      raise exception 'El alta definitiva la confirma RRHH o Técnica' using errcode = '42501';
    end if;
    new.alta_origen := old.alta_origen;
    new.alta_creado_por := old.alta_creado_por;
    new.alta_confirmado_at := old.alta_confirmado_at;
    new.alta_confirmado_por := old.alta_confirmado_por;
    if old.provisorio and not new.provisorio then
      if nullif(trim(new.nombre),'') is null or coalesce(new.dni,'') !~ '^[0-9]{5,10}$' then
        raise exception 'Completá el nombre y un DNI válido antes de confirmar el alta';
      end if;
      new.alta_confirmado_at := now();
      new.alta_confirmado_por := v_actor;
    end if;
  end if;
  if new.provisorio then new.ficha := false; end if;
  return new;
end;
$$;

drop trigger if exists trg_rrhh_empleado_controlar_alta on public.rrhh_empleados;
create trigger trg_rrhh_empleado_controlar_alta before insert or update on public.rrhh_empleados
for each row execute function public.rrhh_empleado_controlar_alta();

-- Toda persona nueva registrada desde el mostrador queda pendiente, sea quien sea el operador.
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
      insert into public.rrhh_empleados (id, nombre, dni, grupo, contratista_id, ficha, activo, sede, notas, provisorio, alta_origen)
      values (
        coalesce(p_id, gen_random_uuid()), v_nombre, v_dni, 'contratista', v_contratista.id, false, true,
        nullif(trim(coalesce(p_sede, '')), ''),
        'Externo: alta desde el mostrador de consumibles el '
          || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
          || coalesce(' por ' || v_quien, '') || '. Completar en RRHH.', true, 'panol'
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
    'nuevo', v_emp.id = p_id, 'provisorio', v_emp.provisorio
  );
end;
$$;
revoke all on function public.consumibles_alta_externo(uuid,text,text,text,text) from public;
grant execute on function public.consumibles_alta_externo(uuid,text,text,text,text) to authenticated;

-- RRHH/Técnica pueden completar una persona provisoria y confirmar, o crear un alta nueva.
-- El formulario sólo modifica estos campos; el servidor conserva el origen e historial.
create or replace function public.rrhh_guardar_alta_empleado(p_id uuid, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_emp public.rrhh_empleados;
  v_nombre text := trim(coalesce(p_datos->>'nombre',''));
  v_dni text := trim(coalesce(p_datos->>'dni',''));
  v_grupo text := coalesce(p_datos->>'grupo','casa');
  v_nfc text;
begin
  if not public.rrhh_puede_gestionar_altas(auth.uid()) then
    raise exception 'El alta definitiva la confirma RRHH o Técnica' using errcode = '42501';
  end if;
  if v_nombre = '' or v_dni !~ '^[0-9]{5,10}$' then
    raise exception 'Completá el nombre y un DNI válido antes de confirmar el alta';
  end if;
  if v_grupo not in ('casa','contratista','sin_asignar') then raise exception 'Revisá el grupo'; end if;
  if nullif(p_datos->>'sede','') is not null and p_datos->>'sede' not in ('Pampa','Chubut') then raise exception 'Revisá la sede'; end if;
  if p_id is not null then
    select * into v_emp from public.rrhh_empleados where id = p_id for update;
    if not found then raise exception 'No se encontró la persona provisoria'; end if;
    if not v_emp.provisorio then raise exception 'Este legajo ya está confirmado. Actualizá la lista'; end if;
  end if;
  v_nfc := case when p_datos ? 'nfc_uid'
    then nullif(upper(regexp_replace(coalesce(p_datos->>'nfc_uid',''),'[^0-9a-zA-Z]','','g')),'') else v_emp.nfc_uid end;
  if p_id is null then
    insert into public.rrhh_empleados(nombre,dni,grupo,sede,contratista_id,ficha,activo,notas,nfc_uid,foto_url,nfc_asignado_at,nfc_asignado_por)
    values(v_nombre,v_dni,v_grupo,nullif(p_datos->>'sede',''),
      case when v_grupo='contratista' then nullif(p_datos->>'contratista_id','')::uuid end,
      coalesce((p_datos->>'ficha')::boolean,true),coalesce((p_datos->>'activo')::boolean,true),
      nullif(trim(p_datos->>'notas'),''),v_nfc,nullif(trim(p_datos->>'foto_url'),''),
      case when v_nfc is not null then now() end,case when v_nfc is not null then auth.uid() end)
    returning * into v_emp;
  else
    update public.rrhh_empleados set nombre=v_nombre,dni=v_dni,grupo=v_grupo,sede=nullif(p_datos->>'sede',''),
      contratista_id=case when v_grupo='contratista' then nullif(p_datos->>'contratista_id','')::uuid end,
      ficha=coalesce((p_datos->>'ficha')::boolean,ficha),activo=coalesce((p_datos->>'activo')::boolean,activo),
      notas=case when p_datos ? 'notas' then nullif(trim(p_datos->>'notas'),'') else notas end,
      foto_url=case when p_datos ? 'foto_url' then nullif(trim(p_datos->>'foto_url'),'') else foto_url end,
      nfc_asignado_at=case when v_nfc is distinct from nfc_uid then case when v_nfc is not null then now() end else nfc_asignado_at end,
      nfc_asignado_por=case when v_nfc is distinct from nfc_uid then case when v_nfc is not null then auth.uid() end else nfc_asignado_por end,
      nfc_uid=v_nfc,provisorio=false
    where id=p_id returning * into v_emp;
  end if;
  return to_jsonb(v_emp);
end;
$$;
revoke all on function public.rrhh_guardar_alta_empleado(uuid,jsonb) from public;
grant execute on function public.rrhh_guardar_alta_empleado(uuid,jsonb) to authenticated;

create index if not exists rrhh_empleados_provisorios_idx on public.rrhh_empleados(created_at desc) where provisorio;
notify pgrst, 'reload schema';
commit;
