-- Externo es una clasificación por persona, independiente de su empresa y del alta provisoria.
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='rrhh_empleados' and column_name='externo') then
    alter table public.rrhh_empleados add column externo boolean not null default false;
    update public.rrhh_empleados e set externo=true
     where e.alta_origen='panol' or (e.grupo='contratista' and exists (
       select 1 from public.rrhh_contratistas c where c.id=e.contratista_id and c.externo));
  end if;
end;
$$;

create or replace function public.rrhh_empleado_controlar_externo()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is not null and old.externo is distinct from new.externo
     and not public.rrhh_puede_gestionar_altas(auth.uid()) then
    raise exception 'RRHH o Técnica definen quién es externo' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_rrhh_empleado_controlar_externo on public.rrhh_empleados;
create trigger trg_rrhh_empleado_controlar_externo before update of externo on public.rrhh_empleados
for each row execute function public.rrhh_empleado_controlar_externo();

create or replace function public.rrhh_definir_externo(p_id uuid,p_externo boolean)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_emp public.rrhh_empleados;
begin
  if not public.rrhh_puede_gestionar_altas(auth.uid()) then
    raise exception 'RRHH o Técnica definen quién es externo' using errcode='42501';
  end if;
  if p_externo is null then raise exception 'Elegí si la persona es externa'; end if;
  update public.rrhh_empleados set externo=p_externo where id=p_id returning * into v_emp;
  if not found then raise exception 'No se encontró la persona'; end if;
  return to_jsonb(v_emp);
end;
$$;
revoke all on function public.rrhh_definir_externo(uuid,boolean) from public;
grant execute on function public.rrhh_definir_externo(uuid,boolean) to authenticated;

create or replace function public.consumibles_empresa_empleado(p_id uuid,out empresa text,out externo boolean)
returns record language sql stable security definer set search_path=public
as $$
  select c.nombre,coalesce(e.externo,false) from public.rrhh_empleados e
  left join public.rrhh_contratistas c on c.id=e.contratista_id
  where e.id=p_id and public.panol_es_operador_solicitudes(auth.uid());
$$;
revoke all on function public.consumibles_empresa_empleado(uuid) from public;
grant execute on function public.consumibles_empresa_empleado(uuid) to authenticated;

create or replace function public.consumibles_externos()
returns jsonb language sql stable security definer set search_path=public
as $$
 select case when not public.panol_es_operador_solicitudes(auth.uid()) then null else jsonb_build_object(
   'empresas',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre) order by c.nombre)
     from public.rrhh_contratistas c where coalesce(c.activo,true) and (c.externo or exists(
       select 1 from public.rrhh_empleados e where e.contratista_id=c.id and e.externo and coalesce(e.activo,true)))),'[]'::jsonb),
   'personas',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'contratista_id',e.contratista_id,'empresa',c.nombre))
     from public.rrhh_empleados e left join public.rrhh_contratistas c on c.id=e.contratista_id
     where e.externo and coalesce(e.activo,true)),'[]'::jsonb)
 ) end;
$$;
revoke all on function public.consumibles_externos() from public;
grant execute on function public.consumibles_externos() to authenticated;

-- El RPC de aprobación y el registro provisorio se mantienen debajo con la nueva clasificación.
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
      insert into public.rrhh_empleados (id, nombre, dni, grupo, contratista_id, ficha, activo, sede, notas, provisorio, alta_origen, externo)
      values (
        coalesce(p_id, gen_random_uuid()), v_nombre, v_dni, 'contratista', v_contratista.id, false, true,
        nullif(trim(coalesce(p_sede, '')), ''),
        'Externo: alta desde el mostrador de consumibles el '
          || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
          || coalesce(' por ' || v_quien, '') || '. Completar en RRHH.', true, 'panol', true
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
    'externo', coalesce(v_emp.externo, false),
    'nuevo', v_emp.id = p_id, 'provisorio', v_emp.provisorio
  );
end;
$$;
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
    insert into public.rrhh_empleados(nombre,dni,grupo,sede,contratista_id,ficha,activo,notas,nfc_uid,foto_url,nfc_asignado_at,nfc_asignado_por,externo)
    values(v_nombre,v_dni,v_grupo,nullif(p_datos->>'sede',''),
      case when v_grupo='contratista' then nullif(p_datos->>'contratista_id','')::uuid end,
      coalesce((p_datos->>'ficha')::boolean,true),coalesce((p_datos->>'activo')::boolean,true),
      nullif(trim(p_datos->>'notas'),''),v_nfc,nullif(trim(p_datos->>'foto_url'),''),
      case when v_nfc is not null then now() end,case when v_nfc is not null then auth.uid() end,coalesce((p_datos->>'externo')::boolean,false))
    returning * into v_emp;
  else
    update public.rrhh_empleados set nombre=v_nombre,dni=v_dni,grupo=v_grupo,sede=nullif(p_datos->>'sede',''),
      contratista_id=case when v_grupo='contratista' then nullif(p_datos->>'contratista_id','')::uuid end,
      ficha=coalesce((p_datos->>'ficha')::boolean,ficha),activo=coalesce((p_datos->>'activo')::boolean,activo),
      notas=case when p_datos ? 'notas' then nullif(trim(p_datos->>'notas'),'') else notas end,
      foto_url=case when p_datos ? 'foto_url' then nullif(trim(p_datos->>'foto_url'),'') else foto_url end,
      nfc_asignado_at=case when v_nfc is distinct from nfc_uid then case when v_nfc is not null then now() end else nfc_asignado_at end,
      nfc_asignado_por=case when v_nfc is distinct from nfc_uid then case when v_nfc is not null then auth.uid() end else nfc_asignado_por end,
      nfc_uid=v_nfc,provisorio=false,externo=coalesce((p_datos->>'externo')::boolean,externo)
    where id=p_id returning * into v_emp;
  end if;
  return to_jsonb(v_emp);
end;
$$;
revoke all on function public.consumibles_alta_externo(uuid,text,text,text,text) from public;
grant execute on function public.consumibles_alta_externo(uuid,text,text,text,text) to authenticated;
revoke all on function public.rrhh_guardar_alta_empleado(uuid,jsonb) from public;
grant execute on function public.rrhh_guardar_alta_empleado(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
