-- Una compra que no integra la matriz base conserva el motivo por línea.
-- Las decisiones puntuales existentes siguen siendo válidas y pueden
-- completarse desde la bandeja sin modificar los movimientos históricos.
alter table public.panol_material_normalizaciones
  add column if not exists motivo_no_estandar text,
  add column if not exists observacion_no_estandar text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.panol_material_normalizaciones'::regclass
       and conname = 'panol_normalizaciones_motivo_no_estandar_check'
  ) then
    alter table public.panol_material_normalizaciones
      add constraint panol_normalizaciones_motivo_no_estandar_check
      check (motivo_no_estandar is null or motivo_no_estandar in ('adicional', 'condicionante', 'compra_puntual', 'otro'));
  end if;
end;
$$;

comment on column public.panol_material_normalizaciones.motivo_no_estandar is
  'Motivo por línea cuando la compra no integra la matriz base. No crea reglas condicionantes automáticamente.';
comment on column public.panol_material_normalizaciones.observacion_no_estandar is
  'Explicación de la decisión no estándar, independiente de las notas generales del producto.';

-- Envolver la función detallada mantiene en una sola transacción la decisión,
-- proveedores y precios existentes junto con el motivo de la excepción.
create or replace function public.panol_normalizar_material_clasificado_por_linea(
  p_material_id uuid,
  p_descripcion text,
  p_alias text,
  p_modelo text,
  p_decision text,
  p_cantidad numeric,
  p_evidencia_obra_id uuid,
  p_evidencia_movimiento_id uuid,
  p_codigo text,
  p_codigo_barra text,
  p_unidad_medida text,
  p_categoria_id uuid,
  p_notas text,
  p_proveedores jsonb,
  p_cantidad_verificada boolean,
  p_motivo_no_estandar text,
  p_observacion_no_estandar text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo_no_estandar, '')), '');
  v_observacion text := nullif(btrim(coalesce(p_observacion_no_estandar, '')), '');
  v_result jsonb;
begin
  if v_decision = 'puntual' then
    if v_motivo is null or v_motivo not in ('adicional', 'condicionante', 'compra_puntual', 'otro') then
      raise exception 'Elegí un motivo para la decisión no estándar';
    end if;
    if v_observacion is null then
      raise exception 'Escribí una observación para la decisión no estándar';
    end if;
  end if;

  v_result := public.panol_normalizar_material_detallado_por_linea(
    p_material_id, p_descripcion, p_alias, p_modelo, p_decision, p_cantidad,
    p_evidencia_obra_id, p_evidencia_movimiento_id, p_codigo, p_codigo_barra,
    p_unidad_medida, p_categoria_id, p_notas, p_proveedores, p_cantidad_verificada
  );

  update public.panol_material_normalizaciones
     set motivo_no_estandar = case when v_decision = 'puntual' then v_motivo else null end,
         observacion_no_estandar = case when v_decision = 'puntual' then v_observacion else null end
   where material_id = p_material_id and modelo = v_result ->> 'modelo';
  if not found then
    raise exception 'No se pudo guardar el motivo de la decisión';
  end if;

  return v_result || jsonb_build_object(
    'motivo_no_estandar', case when v_decision = 'puntual' then v_motivo else null end,
    'observacion_no_estandar', case when v_decision = 'puntual' then v_observacion else null end
  );
end;
$$;

revoke all on function public.panol_normalizar_material_clasificado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,text) from public;
grant execute on function public.panol_normalizar_material_clasificado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,text) to authenticated;
