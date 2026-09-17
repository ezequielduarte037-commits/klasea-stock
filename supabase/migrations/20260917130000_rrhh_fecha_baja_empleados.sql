-- Fecha real de baja para ordenar y auditar los ex empleados desde RRHH.
-- No se inventa una fecha para bajas históricas: si no quedó registrada, la
-- pantalla lo indica y la fila queda después de las bajas fechadas.

alter table public.rrhh_empleados
  add column if not exists fecha_baja timestamptz;

comment on column public.rrhh_empleados.fecha_baja is
  'Momento en que el empleado fue dado de baja (activo pasó a false). Se borra al reactivarlo.';

create or replace function public.rrhh_empleados_registrar_fecha_baja()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.activo is false and (tg_op = 'INSERT' or old.activo is distinct from false) then
    new.fecha_baja := coalesce(new.fecha_baja, now());
  elsif tg_op = 'UPDATE' and old.activo is false and new.activo is distinct from false then
    new.fecha_baja := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rrhh_empleados_fecha_baja on public.rrhh_empleados;
create trigger trg_rrhh_empleados_fecha_baja
  before insert or update of activo on public.rrhh_empleados
  for each row execute function public.rrhh_empleados_registrar_fecha_baja();

create index if not exists idx_rrhh_empleados_ex_fecha_baja
  on public.rrhh_empleados (fecha_baja desc)
  where activo is false;
