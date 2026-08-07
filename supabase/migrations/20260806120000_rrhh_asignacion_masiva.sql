-- Edicion masiva de oficio y obras para RRHH.
-- Permite seleccionar un grupo de empleados y aplicar la misma configuracion
-- sin dejar resultados parciales si alguna asignacion falla.

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
  if not exists (
    select 1
      from public.profiles p
     where p.id = v_uid
       and (
         coalesce(p.is_admin, false)
         or lower(coalesce(p.role::text, '')) in ('admin', 'rrhh', 'administracion')
       )
  ) then
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

revoke all on function public.rrhh_guardar_fichas_operativas(uuid[], boolean, uuid, uuid[], text) from public;
grant execute on function public.rrhh_guardar_fichas_operativas(uuid[], boolean, uuid, uuid[], text) to authenticated;
