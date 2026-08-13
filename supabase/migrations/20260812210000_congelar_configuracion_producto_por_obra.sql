-- Congela la configuracion vigente de la linea al crear cada snapshot.
-- Incluso cuando la linea todavia no tiene un SKU concreto elegido, la obra
-- debe conservar ese estado pendiente y no heredar silenciosamente cambios
-- futuros hechos para barcos nuevos.
create or replace function public.panol_snapshot_aplicar_configuracion_linea()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_requisito uuid := coalesce(new.requisito_material_id, new.material_id);
  v_modelo text;
  v_config record;
begin
  if v_requisito is null
     or lower(coalesce(new.source, 'matriz')) <> 'matriz'
     or coalesce(new.es_adicional, false) then
    return new;
  end if;

  new.requisito_material_id := v_requisito;
  v_modelo := public.panol_modelo_de_obra(new.obra_id);

  select producto_predeterminado_id, especificaciones_defecto
    into v_config
    from public.panol_material_modelo
   where material_id = v_requisito
     and regexp_replace(regexp_replace(upper(modelo), '[^A-Z0-9]+', '', 'g'), '^K', '') = v_modelo
     and coalesce(variante, 'standard') = 'standard'
   order by id
   limit 1;

  if found then
    -- La procedencia se fija aunque el producto siga pendiente. Eso distingue
    -- una obra ya creada de una obra futura y evita herencias accidentales.
    new.producto_asignacion_origen := coalesce(new.producto_asignacion_origen, 'matriz_linea');
    new.especificaciones_origen := coalesce(new.especificaciones_origen, 'matriz_linea');

    if v_config.producto_predeterminado_id is not null
       and (new.material_id is null or new.material_id = v_requisito) then
      new.material_id := v_config.producto_predeterminado_id;
      new.producto_asignado_at := coalesce(new.producto_asignado_at, now());
    end if;

    if coalesce(new.especificaciones, '{}'::jsonb) = '{}'::jsonb then
      new.especificaciones := coalesce(v_config.especificaciones_defecto, '{}'::jsonb);
    end if;
  end if;

  return new;
end;
$$;

