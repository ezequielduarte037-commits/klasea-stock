-- Ingresos necesita productos, presentaciones y códigos; no el cálculo de stock.
-- Un solo resultado JSON evita encadenar páginas vacías y lotes por código.
begin;

create or replace function public.consumibles_catalogo_ingresos()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with materiales as materialized (
    select id, codigo, codigo_barra, descripcion, alias, unidad_medida,
           categoria_id, ubicacion, proveedor
      from public.panol_materiales
     where es_consumible is true and activo is distinct from false
  )
  select jsonb_build_object(
    'materiales', coalesce((
      select jsonb_agg(jsonb_strip_nulls(to_jsonb(m)) order by descripcion, id)
        from materiales m
    ), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_strip_nulls(to_jsonb(c)))
        from (select id, nombre, parent_id from public.panol_categorias) c
    ), '[]'::jsonb),
    'configuraciones', coalesce((
      select jsonb_agg(jsonb_strip_nulls(to_jsonb(c))) from (
        select c.material_id, c.forma_entrega, c.unidad_entrega,
               c.costo_unitario_ars, c.factor_compra, c.unidad_compra,
               c.proveedor_codigo, c.codigo_etiqueta, c.activo_mostrador
          from public.consumibles_config c
          join materiales m on m.id = c.material_id
      ) c
    ), '[]'::jsonb),
    'codigos', coalesce((
      select jsonb_agg(jsonb_build_object('material_id', b.material_id, 'codigo', b.codigo)
                       order by b.material_id, b.codigo)
        from public.panol_material_codigos_barra b
        join materiales m on m.id = b.material_id
       where b.activo is true
    ), '[]'::jsonb)
  );
$$;

-- Conserva las políticas de cada tabla: no usa permisos del creador.
revoke all on function public.consumibles_catalogo_ingresos() from public, anon;
grant execute on function public.consumibles_catalogo_ingresos() to authenticated, service_role;

commit;
