-- Corrige la asignación de tarjetas NFC en Pañol.
--
-- La función devuelve una columna llamada nfc_uid y, al mismo tiempo, leía
-- rrhh_empleados.nfc_uid sin alias al validar duplicados. En PL/pgSQL eso
-- vuelve ambigua la referencia y PostgreSQL cancela la operación.
create or replace function public.panol_asignar_tarjeta_nfc(
  p_empleado_id uuid,
  p_nfc_uid text,
  p_foto_url text default null
)
returns table (
  empleado_id uuid,
  dni text,
  nombre text,
  grupo text,
  sede text,
  activo boolean,
  nfc_uid text,
  foto_url text,
  nfc_asignado_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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
    v_emp.dni::text,
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
$$;

revoke all on function public.panol_asignar_tarjeta_nfc(uuid, text, text) from public;
grant execute on function public.panol_asignar_tarjeta_nfc(uuid, text, text) to authenticated;
