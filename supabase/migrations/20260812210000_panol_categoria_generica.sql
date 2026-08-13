-- Los productos que se crean solos al recepcionar (remito / ingreso a pañol) no
-- tienen rubro: quedan para que alguien los clasifique después. Pero
-- panol_materiales.categoria_id es NOT NULL, así que sin un rubro genérico el
-- insert fallaba con:
--   null value in column "categoria_id" of relation "panol_materiales"
-- Este migration garantiza que ese rubro exista y alinea la RPC de egresos, que
-- comparaba con lower() sin sacar acentos y por eso nunca matcheaba "Sin categoría"
-- (y terminaba metiendo el producto en el primer rubro real de la lista).

insert into public.panol_categorias (nombre, orden)
select 'Sin categoría', 999
where not exists (
  select 1
    from public.panol_categorias c
   where translate(lower(btrim(coalesce(c.nombre, ''))), 'áéíóúü', 'aeiouu')
         in ('sin categoria', 'varios', 'otros', 'general')
);

create or replace function public.panol_crear_catalog_material(
  p_descripcion text,
  p_codigo text default null,
  p_unidad text default 'unidad',
  p_proveedor text default null,
  p_precio_unitario numeric default null,
  p_moneda text default 'ARS',
  p_categoria_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_codigo text := nullif(upper(btrim(coalesce(p_codigo, ''))), '');
  v_unidad text := coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad');
  v_proveedor text := nullif(btrim(coalesce(p_proveedor, '')), '');
  v_moneda text := case when upper(coalesce(p_moneda, 'ARS')) = 'USD' then 'USD' else 'ARS' end;
  v_categoria_id uuid := p_categoria_id;
  v_material record;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_panol_manager(v_uid) then
    raise exception 'Sin permiso para crear materiales desde egresos';
  end if;

  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  if v_categoria_id is null then
    -- Sólo el rubro genérico: si no hay ninguno, preferimos fallar con un mensaje
    -- claro antes que archivar el producto en un rubro real que no le corresponde.
    select c.id
      into v_categoria_id
      from public.panol_categorias c
     where translate(lower(btrim(coalesce(c.nombre, ''))), 'áéíóúü', 'aeiouu')
           in ('sin categoria', 'varios', 'otros', 'general')
     order by c.orden nulls last, c.nombre nulls last
     limit 1;
  end if;

  if v_categoria_id is null then
    raise exception 'No hay un rubro "Sin categoría" en el catálogo. Crealo en Materiales y volvé a intentar.';
  end if;

  insert into public.panol_materiales(
    categoria_id,
    codigo,
    descripcion,
    proveedor,
    unidad_medida,
    precio_unitario,
    moneda,
    origen,
    revisado,
    activo
  )
  values (
    v_categoria_id,
    v_codigo,
    v_desc,
    v_proveedor,
    v_unidad,
    p_precio_unitario,
    v_moneda,
    'egreso',
    false,
    true
  )
  returning
    id,
    categoria_id,
    codigo,
    descripcion,
    proveedor,
    unidad_medida,
    precio_unitario,
    moneda,
    activo
  into v_material;

  return jsonb_build_object(
    'id', v_material.id,
    'categoria_id', v_material.categoria_id,
    'codigo', coalesce(v_material.codigo, ''),
    'descripcion', coalesce(v_material.descripcion, v_desc),
    'proveedor', coalesce(v_material.proveedor, ''),
    'unidad', coalesce(v_material.unidad_medida, v_unidad),
    'precio_unitario', v_material.precio_unitario,
    'moneda', coalesce(v_material.moneda, v_moneda),
    'activo', coalesce(v_material.activo, true)
  );
end;
$$;

grant execute on function public.panol_crear_catalog_material(text,text,text,text,numeric,text,uuid) to authenticated;
