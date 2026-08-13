-- Hunter y Antago pasan por el circuito de Pañol aunque no se fabriquen en el
-- astillero. Se guardan en produccion_obras para reutilizar todas las FK de
-- ingresos, egresos, compras y solicitudes, pero sin linea_id: así no generan
-- matriz, etapas, tareas ni hitos de producción.
alter table public.produccion_obras
  add column if not exists solo_stock boolean not null default false;

comment on column public.produccion_obras.solo_stock is
  'Obra externa disponible para trazabilidad y stock, excluida de la planificación de fabricación.';

create or replace function public.panol_crear_obra_externa(
  p_codigo text,
  p_modelo text,
  p_descripcion text default null
)
returns public.produccion_obras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_modelo text := upper(trim(coalesce(p_modelo, '')));
  v_nombre_modelo text;
  v_obra public.produccion_obras%rowtype;
  v_role text;
  v_is_admin boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No hay usuario autenticado.';
  end if;

  select role::text, coalesce(is_admin, false)
    into v_role, v_is_admin
    from public.profiles
   where id = auth.uid();

  if not v_is_admin and coalesce(v_role, '') not in ('admin', 'tecnica', 'panol') then
    raise exception 'No tenés permisos para crear embarcaciones externas.';
  end if;

  if v_modelo not in ('HUNTER', 'ANTAGO') then
    raise exception 'El tipo debe ser Hunter o Antago.';
  end if;
  if v_codigo = '' then
    raise exception 'Ingresá el código o identificación del barco.';
  end if;

  v_nombre_modelo := case v_modelo when 'HUNTER' then 'Hunter' else 'Antago' end;

  if exists (
    select 1 from public.produccion_obras where upper(trim(codigo)) = v_codigo
  ) then
    raise exception 'Ya existe una obra con el código %.', v_codigo;
  end if;

  insert into public.produccion_obras(
    codigo,
    descripcion,
    tipo,
    estado,
    solo_stock,
    linea_id,
    linea_nombre,
    fecha_inicio,
    fecha_fin_estimada,
    desmolde_estimado,
    puesto_mapa,
    bahia_pampa
  ) values (
    v_codigo,
    nullif(trim(coalesce(p_descripcion, '')), ''),
    'barco',
    'activa',
    true,
    null,
    v_nombre_modelo,
    null,
    null,
    null,
    null,
    null
  )
  returning * into v_obra;

  return v_obra;
end;
$$;

revoke all on function public.panol_crear_obra_externa(text,text,text) from public;
grant execute on function public.panol_crear_obra_externa(text,text,text) to authenticated;
