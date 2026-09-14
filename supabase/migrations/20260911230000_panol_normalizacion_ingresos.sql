-- Bandeja de normalizacion de productos nacidos en ingresos de Panol.
-- La decision es atomica: identidad del catalogo + pertenencia estandar por
-- linea se guardan juntas. El kardex historico no se reescribe.

create or replace function public.panol_normalizar_material_ingreso(
  p_material_id uuid,
  p_descripcion text,
  p_alias text default null,
  p_decision text default 'puntual',
  p_modelos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_descripcion text := nullif(trim(coalesce(p_descripcion, '')), '');
  v_modelo record;
  v_lineas jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.is_panol_manager(v_uid) then
    raise exception 'Sin permisos para normalizar el catalogo de Panol';
  end if;
  if p_material_id is null or v_descripcion is null then
    raise exception 'Falta el producto o su nombre';
  end if;
  if v_decision not in ('estandar', 'puntual') then
    raise exception 'Decision invalida';
  end if;
  if jsonb_typeof(coalesce(p_modelos, '[]'::jsonb)) <> 'array' then
    raise exception 'Las lineas deben enviarse como una lista';
  end if;
  if not exists (
    select 1
      from public.panol_materiales
     where id = p_material_id
       and activo is distinct from false
       and es_requisito is distinct from true
  ) then
    raise exception 'El producto no existe, esta archivado o es un requisito generico';
  end if;

  perform set_config('app.audit_origin', 'normalizacion_ingreso', true);

  -- Sólo reemplaza la pertenencia base. Los paquetes condicionales
  -- (linea_eje, variantes, etc.) se preservan porque expresan otra regla.
  delete from public.panol_material_modelo
   where material_id = p_material_id
     and coalesce(variante, 'standard') = 'standard';

  if v_decision = 'estandar' then
    for v_modelo in
      select
        regexp_replace(regexp_replace(upper(trim(value ->> 'modelo')), '[^A-Z0-9]+', '', 'g'), '^K', '') as modelo,
        case
          when replace(coalesce(value ->> 'cantidad', ''), ',', '.') ~ '^[0-9]+([.][0-9]+)?$'
            then replace(value ->> 'cantidad', ',', '.')::numeric
          else 0
        end as cantidad
      from jsonb_array_elements(coalesce(p_modelos, '[]'::jsonb))
    loop
      continue when v_modelo.modelo = '' or v_modelo.cantidad <= 0;
      insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
      values (p_material_id, v_modelo.modelo, v_modelo.cantidad, 'standard')
      on conflict (material_id, modelo, variante)
      do update set cantidad = excluded.cantidad;
    end loop;

    select coalesce(
      jsonb_agg(
        jsonb_build_object('modelo', modelo, 'cantidad', cantidad)
        order by modelo
      ),
      '[]'::jsonb
    )
      into v_lineas
      from public.panol_material_modelo
     where material_id = p_material_id
       and coalesce(variante, 'standard') = 'standard';

    if jsonb_array_length(v_lineas) = 0 then
      raise exception 'Un producto estandar necesita al menos una linea con cantidad';
    end if;
  end if;

  update public.panol_materiales
     set descripcion = v_descripcion,
         alias = nullif(trim(coalesce(p_alias, '')), ''),
         revisado = true
   where id = p_material_id;

  return jsonb_build_object(
    'material_id', p_material_id,
    'decision', v_decision,
    'modelos', v_lineas
  );
end;
$$;

revoke all on function public.panol_normalizar_material_ingreso(uuid,text,text,text,jsonb) from public;
grant execute on function public.panol_normalizar_material_ingreso(uuid,text,text,text,jsonb) to authenticated;

comment on function public.panol_normalizar_material_ingreso(uuid,text,text,text,jsonb) is
  'Revisa un producto creado desde el circuito de Panol y define atomicamente si integra la matriz estandar de una o mas lineas o si queda como compra puntual.';
