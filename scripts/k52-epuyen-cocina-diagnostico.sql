-- Sólo lectura: revisar si el artículo de cocina es requisito, SKU físico,
-- o ambos, antes de crear productos o modificar su historia.
select
  (select jsonb_agg(jsonb_build_object(
      'id', p.id, 'descripcion', p.descripcion, 'es_requisito', p.es_requisito,
      'activo', p.activo, 'vinculo_activo', rp.activo
    ) order by p.descripcion)
   from public.panol_requisito_productos rp
   join public.panol_materiales p on p.id = rp.producto_material_id
   where rp.requisito_material_id = 'ad170c62-bcdb-42b6-8674-8a016ef23e92') as productos_vinculados,
  (select jsonb_agg(jsonb_build_object(
      'modelo', mm.modelo, 'cantidad', mm.cantidad,
      'producto_predeterminado_id', mm.producto_predeterminado_id
    ) order by mm.modelo)
   from public.panol_material_modelo mm
   where mm.material_id = 'ad170c62-bcdb-42b6-8674-8a016ef23e92') as matrices,
  (select jsonb_agg(to_jsonb(grupo) order by grupo.material_id, grupo.estado)
   from (
     select s.material_id, s.estado, count(*) as filas,
            sum(s.cantidad) as cantidad,
            count(*) filter (where s.purchase_request_id is not null
              or s.purchase_request_item_id is not null
              or s.panol_envio_item_id is not null) as filas_comprometidas
     from public.panol_obra_materiales_snapshot s
     join public.produccion_obras o on o.id = s.obra_id
     where coalesce(s.requisito_material_id, s.material_id) = 'ad170c62-bcdb-42b6-8674-8a016ef23e92'
       and regexp_replace(upper(o.linea_nombre), '[^0-9]', '', 'g') = '52'
     group by s.material_id, s.estado
   ) grupo) as historial_k52,
  (select jsonb_agg(jsonb_build_object(
      'tipo', i.tipo_item, 'cantidad', i.cantidad,
      'material_id', i.material_id, 'descripcion', m.descripcion,
      'activo', i.activo
    ) order by m.descripcion, i.tipo_item)
   from public.panol_matriz_condicionantes c
   join public.panol_matriz_condicionante_items i on i.condicionante_id = c.id
   join public.panol_materiales m on m.id = i.material_id
   where regexp_replace(upper(c.modelo), '[^0-9]', '', 'g') = '52'
     and lower(c.nombre) = lower('Elementos de baño NEGRO')) as opcion_bano_negro;
