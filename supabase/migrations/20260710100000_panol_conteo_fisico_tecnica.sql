-- Conteo fisico desde el lector: permite a tecnica/oficina registrar el
-- relevamiento inicial sin convertir esas cuentas en operadores de panol.

create or replace function public.can_registrar_conteo_fisico(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_panol_manager(p_uid)
    or exists (
      select 1
      from public.profiles p
      where p.id = p_uid
        and (
          coalesce(p.is_admin, false)
          or p.role in ('admin', 'tecnica', 'oficina')
        )
    )
  );
$$;

grant execute on function public.can_registrar_conteo_fisico(uuid) to authenticated;

create or replace function public.panol_registrar_conteo_fisico(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_id uuid default null,
  p_nota text default null,
  p_movimiento text default 'ingreso'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_mov text := lower(nullif(btrim(coalesce(p_movimiento, '')), ''));
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not (
    public.can_registrar_conteo_fisico(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para registrar conteo fisico';
  end if;

  if v_sede is not null and v_sede not in ('Pampa', 'Chubut') then
    raise exception 'Sede invalida: %', v_sede;
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if v_mov is null then
    v_mov := 'ingreso';
  end if;

  if v_mov not in ('ingreso', 'egreso') then
    raise exception 'Movimiento invalido: %', v_mov;
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
    rubro,
    tipo,
    tipo_label,
    precio_unitario,
    moneda,
    notas,
    source,
    estado,
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    egreso_at,
    egreso_por,
    egreso_nota,
    retirado_por,
    sector_destino,
    egreso_destino_obra_id,
    cantidad_egresada,
    es_adicional
  )
  values (
    p_obra_id,
    case when v_mov = 'egreso' then p_obra_id else null end,
    p_material_id,
    v_desc,
    coalesce(v_codigo, v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    null,
    case when v_mov = 'egreso' then 'conteo_fisico_reversion' else 'conteo_fisico' end,
    case when v_mov = 'egreso' then 'Reversion conteo fisico' else 'Conteo fisico' end,
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    case when v_mov = 'egreso' then 'conteo_fisico_reversion' else 'conteo_fisico' end,
    case when v_mov = 'egreso' then 'egresado' else 'en_panol' end,
    case when v_mov = 'egreso' then 'egresado' else 'recibido' end,
    now(),
    v_sede,
    v_nota,
    case when v_mov = 'egreso' then now() else null end,
    case when v_mov = 'egreso' then v_uid else null end,
    case when v_mov = 'egreso' then v_nota else null end,
    case when v_mov = 'egreso' then 'conteo fisico' else null end,
    case when v_mov = 'egreso' then 'reversion conteo' else null end,
    null,
    case when v_mov = 'egreso' then p_cantidad else 0 end,
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.panol_registrar_conteo_fisico(uuid,text,text,numeric,text,text,uuid,text,text) to authenticated;
