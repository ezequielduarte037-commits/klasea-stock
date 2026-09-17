-- Técnica planifica frentes de trabajo y necesita operar la asistencia y las
-- asignaciones de oficio/obra. Este alcance no habilita altas, bajas ni la
-- importación del fichero de RRHH desde la interfaz.

create or replace function public.rrhh_es_gestor(p_user_id uuid default auth.uid())
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
        or lower(coalesce(p.role::text, '')) in ('admin', 'rrhh', 'administracion', 'tecnica')
      )
  );
$$;

create or replace function public.rrhh_guardar_ficha_operativa(
  p_empleado_id uuid,
  p_oficio_id uuid default null,
  p_obra_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cerradas integer := 0;
  v_agregadas integer := 0;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if not public.rrhh_es_gestor(v_uid) then
    raise exception 'Sin permiso para editar la ficha operativa';
  end if;
  if not exists (select 1 from public.rrhh_empleados where id = p_empleado_id) then
    raise exception 'Empleado inexistente';
  end if;

  update public.rrhh_empleados
     set oficio_id = p_oficio_id
   where id = p_empleado_id;

  update public.rrhh_empleado_obras eo
     set hasta = current_date,
         updated_at = now()
   where eo.empleado_id = p_empleado_id
     and eo.hasta is null
     and not (eo.obra_id = any(coalesce(p_obra_ids, '{}'::uuid[])));
  get diagnostics v_cerradas = row_count;

  insert into public.rrhh_empleado_obras (empleado_id, obra_id, oficio_id, desde, created_by)
  select p_empleado_id, selected.obra_id, null, current_date, v_uid
    from unnest(coalesce(p_obra_ids, '{}'::uuid[])) as selected(obra_id)
   where not exists (
     select 1
     from public.rrhh_empleado_obras eo
     where eo.empleado_id = p_empleado_id
       and eo.obra_id = selected.obra_id
       and eo.hasta is null
   );
  get diagnostics v_agregadas = row_count;

  return jsonb_build_object(
    'ok', true,
    'cerradas', v_cerradas,
    'agregadas', v_agregadas
  );
end;
$$;

create or replace function public.rrhh_guardar_fichas_operativas(
  p_empleado_ids uuid[],
  p_aplicar_oficio boolean default false,
  p_oficio_id uuid default null,
  p_obra_ids uuid[] default '{}'::uuid[],
  p_modo_obras text default 'conservar'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_empleados uuid[] := array(select distinct unnest(coalesce(p_empleado_ids, '{}'::uuid[])));
  v_obras uuid[] := array(select distinct unnest(coalesce(p_obra_ids, '{}'::uuid[])));
  v_actualizados integer := 0;
  v_cerradas integer := 0;
  v_agregadas integer := 0;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if not public.rrhh_es_gestor(v_uid) then
    raise exception 'Sin permiso para editar fichas operativas';
  end if;
  if coalesce(array_length(v_empleados, 1), 0) = 0 then
    raise exception 'Selecciona al menos un empleado';
  end if;
  if p_modo_obras not in ('conservar', 'agregar', 'reemplazar') then
    raise exception 'Modo de obras invalido';
  end if;
  if (select count(*) from public.rrhh_empleados e where e.id = any(v_empleados)) <> array_length(v_empleados, 1) then
    raise exception 'Uno o mas empleados no existen';
  end if;
  if coalesce(array_length(v_obras, 1), 0) > 0
     and (select count(*) from public.produccion_obras o where o.id = any(v_obras)) <> array_length(v_obras, 1) then
    raise exception 'Una o mas obras no existen';
  end if;

  if p_aplicar_oficio then
    update public.rrhh_empleados
       set oficio_id = p_oficio_id
     where id = any(v_empleados);
    get diagnostics v_actualizados = row_count;
  end if;

  if p_modo_obras = 'reemplazar' then
    update public.rrhh_empleado_obras eo
       set hasta = current_date,
           updated_at = now()
     where eo.empleado_id = any(v_empleados)
       and eo.hasta is null
       and not (eo.obra_id = any(v_obras));
    get diagnostics v_cerradas = row_count;
  end if;

  if p_modo_obras in ('agregar', 'reemplazar') then
    insert into public.rrhh_empleado_obras (empleado_id, obra_id, oficio_id, desde, created_by)
    select empleado.id, obra.id, null, current_date, v_uid
      from unnest(v_empleados) as empleado(id)
      cross join unnest(v_obras) as obra(id)
     where not exists (
       select 1
       from public.rrhh_empleado_obras eo
       where eo.empleado_id = empleado.id
         and eo.obra_id = obra.id
         and eo.hasta is null
     );
    get diagnostics v_agregadas = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'empleados', array_length(v_empleados, 1),
    'oficios_actualizados', v_actualizados,
    'asignaciones_cerradas', v_cerradas,
    'asignaciones_agregadas', v_agregadas
  );
end;
$$;

revoke all on function public.rrhh_guardar_ficha_operativa(uuid, uuid, uuid[]) from public;
grant execute on function public.rrhh_guardar_ficha_operativa(uuid, uuid, uuid[]) to authenticated;
revoke all on function public.rrhh_guardar_fichas_operativas(uuid[], boolean, uuid, uuid[], text) from public;
grant execute on function public.rrhh_guardar_fichas_operativas(uuid[], boolean, uuid, uuid[], text) to authenticated;
