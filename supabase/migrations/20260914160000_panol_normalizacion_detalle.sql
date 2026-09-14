-- Detalle opcional durante la normalizacion: identidad extendida, cantidad
-- verificada y multiples proveedores con su precio de referencia.

alter table public.panol_material_normalizaciones
  add column if not exists cantidad_verificada boolean not null default false;

comment on column public.panol_material_normalizaciones.cantidad_verificada is
  'Confirma que la cantidad por barco fue revisada por una persona; no bloquea la estandarizacion.';

create or replace function public.panol_normalizar_material_detallado_por_linea(
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
  p_cantidad_verificada boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_modelo text := regexp_replace(regexp_replace(upper(btrim(coalesce(p_modelo, ''))), '[^A-Z0-9]+', '', 'g'), '^K', '');
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_proveedor jsonb;
  v_proveedor_id uuid;
  v_proveedor_nombre text;
  v_precio numeric;
  v_moneda text;
  v_principal_id uuid;
  v_principal_nombre text;
  v_principal_precio numeric;
  v_principal_moneda text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.is_panol_manager(v_uid) then
    raise exception 'Sin permisos para normalizar el catalogo de Panol';
  end if;
  if p_material_id is null or v_descripcion is null then
    raise exception 'Falta el producto o su nombre';
  end if;
  if v_modelo = '' then raise exception 'Falta la linea de produccion'; end if;
  if v_decision not in ('estandar', 'puntual') then raise exception 'Decision invalida'; end if;
  if v_decision = 'estandar' and coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Un producto estandar necesita cantidad por barco';
  end if;
  if jsonb_typeof(coalesce(p_proveedores, '[]'::jsonb)) <> 'array' then
    raise exception 'Los proveedores deben enviarse como una lista';
  end if;
  if not exists (
    select 1 from public.panol_materiales
     where id = p_material_id
       and activo is distinct from false
       and es_requisito is distinct from true
  ) then
    raise exception 'El producto no existe, esta archivado o es un requisito generico';
  end if;
  if p_categoria_id is not null and not exists (
    select 1 from public.panol_categorias where id = p_categoria_id
  ) then
    raise exception 'El rubro elegido no existe';
  end if;
  if p_evidencia_obra_id is not null and not exists (
    select 1 from public.produccion_obras where id = p_evidencia_obra_id
  ) then
    raise exception 'La obra usada como evidencia no existe';
  end if;
  if p_evidencia_movimiento_id is not null and not exists (
    select 1 from public.panol_obra_materiales_snapshot
     where id = p_evidencia_movimiento_id and material_id = p_material_id
  ) then
    raise exception 'El ingreso usado como evidencia no pertenece al producto';
  end if;

  perform set_config('app.audit_origin', 'normalizacion_ingreso_detallada', true);

  if v_decision = 'estandar' then
    insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
    values (p_material_id, v_modelo, p_cantidad, 'standard')
    on conflict (material_id, modelo, variante)
    do update set cantidad = excluded.cantidad;
  else
    delete from public.panol_material_modelo
     where material_id = p_material_id
       and upper(regexp_replace(modelo, '^K', '')) = v_modelo
       and coalesce(variante, 'standard') = 'standard';
  end if;

  -- La lista recibida es la foto completa de proveedores elegidos. Cada uno
  -- puede quedar asociado aun sin precio, para cotizarlo mas adelante.
  delete from public.panol_material_proveedores where material_id = p_material_id;
  for v_proveedor in select value from jsonb_array_elements(coalesce(p_proveedores, '[]'::jsonb))
  loop
    begin
      v_proveedor_id := nullif(v_proveedor ->> 'proveedor_id', '')::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    continue when v_proveedor_id is null;
    select nombre into v_proveedor_nombre
      from public.panol_proveedores where id = v_proveedor_id;
    continue when v_proveedor_nombre is null;

    v_precio := case
      when replace(coalesce(v_proveedor ->> 'precio', ''), ',', '.') ~ '^[0-9]+([.][0-9]+)?$'
        then nullif(replace(v_proveedor ->> 'precio', ',', '.')::numeric, 0)
      else null
    end;
    v_moneda := case when upper(coalesce(v_proveedor ->> 'moneda', 'ARS')) = 'USD' then 'USD' else 'ARS' end;

    insert into public.panol_material_proveedores (material_id, proveedor_id, precio, moneda)
    values (p_material_id, v_proveedor_id, v_precio, v_moneda)
    on conflict (material_id, proveedor_id)
    do update set precio = excluded.precio, moneda = excluded.moneda;

    if v_principal_id is null or (v_principal_precio is null and v_precio is not null) then
      v_principal_id := v_proveedor_id;
      v_principal_nombre := v_proveedor_nombre;
      v_principal_precio := v_precio;
      v_principal_moneda := v_moneda;
    end if;

    if v_precio is not null and not exists (
      select 1 from public.panol_precios
       where material_id = p_material_id
         and proveedor_id is not distinct from v_proveedor_id
         and precio_unitario = v_precio
         and coalesce(moneda, 'ARS') = v_moneda
         and fecha = current_date
    ) then
      insert into public.panol_precios (
        material_id, proveedor_id, proveedor, precio_unitario, moneda, fuente, fecha
      ) values (
        p_material_id, v_proveedor_id, v_proveedor_nombre, v_precio, v_moneda,
        'normalizacion', current_date
      );
    end if;
  end loop;

  update public.panol_materiales
     set descripcion = v_descripcion,
         alias = nullif(btrim(coalesce(p_alias, '')), ''),
         codigo = nullif(btrim(coalesce(p_codigo, '')), ''),
         codigo_barra = nullif(btrim(coalesce(p_codigo_barra, '')), ''),
         unidad_medida = coalesce(nullif(btrim(coalesce(p_unidad_medida, '')), ''), unidad_medida, 'unidad'),
         categoria_id = p_categoria_id,
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         proveedor_id = v_principal_id,
         proveedor = v_principal_nombre,
         precio_unitario = v_principal_precio,
         moneda = case when v_principal_precio is not null then v_principal_moneda else null end,
         revisado = true
   where id = p_material_id;

  insert into public.panol_material_normalizaciones (
    material_id, modelo, decision, cantidad, cantidad_verificada,
    evidencia_obra_id, evidencia_movimiento_id, revisado_por, revisado_at
  ) values (
    p_material_id, v_modelo, v_decision,
    case when v_decision = 'estandar' then p_cantidad else null end,
    v_decision = 'estandar' and coalesce(p_cantidad_verificada, false),
    p_evidencia_obra_id, p_evidencia_movimiento_id, v_uid, now()
  )
  on conflict (material_id, modelo)
  do update set
    decision = excluded.decision,
    cantidad = excluded.cantidad,
    cantidad_verificada = excluded.cantidad_verificada,
    evidencia_obra_id = excluded.evidencia_obra_id,
    evidencia_movimiento_id = excluded.evidencia_movimiento_id,
    revisado_por = excluded.revisado_por,
    revisado_at = excluded.revisado_at;

  return jsonb_build_object(
    'material_id', p_material_id,
    'modelo', v_modelo,
    'decision', v_decision,
    'cantidad', case when v_decision = 'estandar' then p_cantidad else null end,
    'cantidad_verificada', v_decision = 'estandar' and coalesce(p_cantidad_verificada, false),
    'proveedores', coalesce(p_proveedores, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) from public;
grant execute on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) to authenticated;

comment on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) is
  'Normaliza un producto por linea y guarda datos opcionales, verificacion de cantidad y proveedores con precios.';
