with historical as (
  select coalesce(sol.retirado_at,s.egreso_at,s.created_at) as fecha,
         case when m.activo is distinct from false then m.id
              when cardinality(fus.ids)=1 then fus.ids[1] end as material_id,
         'retiro_historico'::text as fuente,
         abs(coalesce(nullif(s.cantidad_egresada,0),s.cantidad,0)) as cantidad
  from public.panol_obra_materiales_snapshot s
  left join public.panol_solicitudes sol on sol.id=s.panol_solicitud_id
  join public.panol_materiales m on m.id=s.material_id
  left join lateral (
    select array_agg(a.id) as ids
    from public.panol_materiales a
    join public.consumibles_config c on c.material_id=a.id
    where m.activo=false and a.activo is distinct from false and a.es_consumible=true
      and lower(btrim(m.descripcion)) = any(string_to_array(lower(coalesce(a.alias,'')),' · '))
  ) fus on true
  where s.source='solicitud_consumible_retiro'
    and lower(coalesce(s.notas,'') || ' ' || coalesce(s.egreso_nota,'')) not like '%[anulado]%'
    and abs(coalesce(nullif(s.cantidad_egresada,0),s.cantidad,0))>0
), movements as (
  select cm.material_id,cm.created_at as fecha,'registro_'||cm.tipo as fuente,abs(cm.cantidad) as cantidad
  from public.consumibles_movimientos cm where cm.anulado_at is null
  union all
  select material_id,fecha,fuente,cantidad from historical where material_id is not null
), latest as (
  select material_id,max(fecha) as ultimo_movimiento,count(*) as cantidad_movimientos,
         array_agg(distinct fuente) as fuentes
  from movements group by material_id
)
select pm.id,pm.descripcion,pm.alias,cc.codigo_etiqueta as "codigoEtiqueta",
       jsonb_build_object('proveedor_codigo',cc.proveedor_codigo,'proveedor_nombre',cc.proveedor_nombre) as config,
       coalesce(cc.unidad_entrega,pm.unidad_medida,'unidad') as unidad,
       pm.ubicacion,pc.nombre as rubro,
       l.ultimo_movimiento,l.cantidad_movimientos,l.fuentes,
       char_length(btrim(cc.codigo_etiqueta)) as largo_codigo
from latest l
join public.panol_materiales pm on pm.id=l.material_id
join public.consumibles_config cc on cc.material_id=pm.id
left join public.panol_categorias pc on pc.id=pm.categoria_id
where pm.activo is distinct from false and pm.es_consumible=true
  and nullif(btrim(cc.codigo_etiqueta),'') is not null
order by ultimo_movimiento desc,pm.id;
