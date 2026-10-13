with retired as (
 select cm.material_id, count(*) as cantidad_retiros,
        sum(cm.cantidad) as cantidad_total_retirada,
        max(cm.created_at) as ultimo_retiro,
        array_agg(distinct cm.origen) as origenes
 from public.consumibles_movimientos cm
 where cm.tipo = 'retiro' and cm.anulado_at is null
   and cm.origen in ('mostrador','solicitud')
 group by cm.material_id
), candidates as (
 select pm.id,pm.descripcion,pm.alias,
        cc.codigo_etiqueta as "codigoEtiqueta",
        jsonb_build_object('proveedor_codigo',cc.proveedor_codigo,'proveedor_nombre',cc.proveedor_nombre) as config,
        coalesce(cc.unidad_entrega,pm.unidad_medida,'unidad') as unidad,
        pm.ubicacion,pc.nombre as rubro,
        r.cantidad_retiros,r.cantidad_total_retirada,r.ultimo_retiro,r.origenes,
        char_length(btrim(cc.codigo_etiqueta)) as largo_codigo
 from retired r
 join public.consumibles_config cc on cc.material_id=r.material_id
 join public.panol_materiales pm on pm.id=r.material_id
 left join public.panol_categorias pc on pc.id=pm.categoria_id
 where cc.codigo_etiqueta is not null and btrim(cc.codigo_etiqueta)<>''
   and pm.activo is distinct from false and pm.es_consumible=true
), recent as (
 select id from candidates order by ultimo_retiro desc,id limit 5
), long_code as (
 select id from candidates where largo_codigo=10 order by ultimo_retiro desc,id limit 1
), selected as (
 select id from long_code
 union
 select id from candidates
 where id not in (select id from long_code)
 order by id
)
select * from candidates
where id in (select id from long_code)
   or id in (select id from candidates
             where id not in (select id from long_code)
             order by ultimo_retiro desc,id
             limit (select case when exists(select 1 from long_code) then 4 else 5 end))
order by ultimo_retiro desc,id;
