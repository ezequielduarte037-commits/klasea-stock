-- El oficio es de la persona, no de cada asignacion.
--
-- La migracion anterior lo puso en rrhh_empleado_obras pensando en que alguien
-- pudiera ser carpintero en una obra y ayudante en otra. En la practica del
-- astillero eso no pasa: Gustavo es carpintero, y despues esta en las obras que
-- esta. Tenerlo por asignacion obligaba a repetir el mismo dato en cada obra y
-- hacia la carga tediosa sin ganar nada.
--
-- Se mueve al empleado. La columna de la asignacion queda como override opcional
-- para el caso raro, pero la fuente normal es el empleado.

alter table public.rrhh_empleados
  add column if not exists oficio_id uuid references public.rrhh_oficios(id) on delete set null;

comment on column public.rrhh_empleados.oficio_id is
  'Oficio de la persona: carpintero, electricista, etc. Define que categorias de material puede retirar sin advertencia.';

create index if not exists idx_rrhh_empleados_oficio
  on public.rrhh_empleados (oficio_id)
  where oficio_id is not null;

-- Los que ya tengan oficio cargado en alguna asignacion vigente lo heredan.
update public.rrhh_empleados e
set oficio_id = sub.oficio_id
from (
  select distinct on (eo.empleado_id) eo.empleado_id, eo.oficio_id
    from public.rrhh_empleado_obras eo
   where eo.oficio_id is not null
     and eo.hasta is null
   order by eo.empleado_id, eo.desde desc
) sub
where sub.empleado_id = e.id
  and e.oficio_id is null;

-- ── El veredicto ahora mira el oficio del empleado ────────────────────────
create or replace function public.panol_evaluar_retiro(
  p_empleado_id uuid,
  p_material_ids uuid[]
)
returns table (
  material_id uuid,
  estado text,
  motivo text
)
language sql
stable
security invoker
set search_path = public
as $$
  with empleado as (
    select e.id, e.nombre, e.oficio_id
      from public.rrhh_empleados e
     where e.id = p_empleado_id
  ),
  asignaciones as (
    select eo.obra_id
      from public.rrhh_empleado_obras eo
     where eo.empleado_id = p_empleado_id
       and eo.desde <= current_date
       and (eo.hasta is null or eo.hasta >= current_date)
  ),
  -- Oficio del empleado; si alguna asignacion trae override, tambien cuenta.
  oficios_persona as (
    select oficio_id from empleado where oficio_id is not null
    union
    select eo.oficio_id
      from public.rrhh_empleado_obras eo
     where eo.empleado_id = p_empleado_id
       and eo.oficio_id is not null
       and eo.desde <= current_date
       and (eo.hasta is null or eo.hasta >= current_date)
  ),
  categorias_ok as (
    select distinct oc.categoria_id
      from public.rrhh_oficio_categorias oc
     where oc.oficio_id in (select oficio_id from oficios_persona)
  ),
  mats as (
    select m.id,
           array_remove(
             array[m.categoria_id] || coalesce(
               array(select mc.categoria_id
                       from public.panol_material_categorias mc
                      where mc.material_id = m.id), '{}'::uuid[]),
             null
           ) as categorias
      from public.panol_materiales m
     where m.id = any(p_material_ids)
  ),
  obras_material as (
    select s.material_id, array_agg(distinct s.obra_id) as obras
      from public.panol_obra_materiales_snapshot s
     where s.material_id = any(p_material_ids)
       and s.obra_id is not null
       and coalesce(s.estado, '') <> 'egresado'
     group by s.material_id
  )
  select
    mats.id as material_id,
    case
      when not exists (select 1 from empleado) then 'sin_datos'
      -- Si el material esta asignado a obras y ninguna es suya.
      when om.obras is not null
       and exists (select 1 from asignaciones)
       and not exists (select 1 from asignaciones a where a.obra_id = any(om.obras))
        then 'otra_obra'
      -- Si su oficio tiene categorias definidas y esta no esta entre ellas.
      when exists (select 1 from categorias_ok)
       and not exists (select 1 from categorias_ok c where c.categoria_id = any(mats.categorias))
        then 'otro_oficio'
      else 'ok'
    end as estado,
    case
      when not exists (select 1 from empleado) then 'No se reconoce al empleado.'
      when om.obras is not null
       and exists (select 1 from asignaciones)
       and not exists (select 1 from asignaciones a where a.obra_id = any(om.obras))
        then 'Este material esta asignado a otra obra.'
      when exists (select 1 from categorias_ok)
       and not exists (select 1 from categorias_ok c where c.categoria_id = any(mats.categorias))
        then 'Este material no es del oficio del empleado.'
      else null
    end as motivo
  from mats
  left join obras_material om on om.material_id = mats.id;
$$;

grant execute on function public.panol_evaluar_retiro(uuid, uuid[]) to authenticated;

-- ── Guardado masivo desde la ficha operativa ─────────────────────────────
-- La pantalla edita el oficio y todas las obras de una persona de una vez. La
-- sincronizacion vive en una RPC para no dejar media ficha guardada si falla
-- una de las asignaciones.
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
  if not exists (
    select 1
      from public.profiles p
     where p.id = v_uid
       and (
         coalesce(p.is_admin, false)
         or lower(coalesce(p.role::text, '')) in ('admin', 'rrhh', 'administracion')
       )
  ) then
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

revoke all on function public.rrhh_guardar_ficha_operativa(uuid, uuid, uuid[]) from public;
grant execute on function public.rrhh_guardar_ficha_operativa(uuid, uuid, uuid[]) to authenticated;
