-- Solo lectura: identidad de requisitos K52 y sus productos cromados/negros.
with familias(requisito_id, modelo_producto) as (
  values
    ('ad170c62-bcdb-42b6-8674-8a016ef23e92'::uuid, '0411.04/L2'),
    ('02646402-69fa-4d8a-8db8-8c621473630d'::uuid, '0106/L2'),
    ('d3a7e58e-7f9a-4568-b70e-281cb1665fbd'::uuid, '0206/L2'),
    ('08151045-25ca-458b-8cbd-21b4f3110163'::uuid, '0166/L2'),
    ('8eecd0a2-01c2-4f9d-b192-ab74d0769acc'::uuid, '0167/L2'),
    ('09ff32da-b4ea-41b1-a229-bccbc402b29a'::uuid, '0163/L2'),
    ('b321889e-ec8c-460f-b325-9a14cce2e24c'::uuid, '0164/L2')
)
select f.modelo_producto,
       case when p.id = f.requisito_id then 'REQUISITO/MATRIZ'
            when p.descripcion ilike '%cromado%' then 'CROMADO'
            when p.descripcion ilike '%negro%' then 'NEGRO'
            else 'OTRO' end as tipo,
       p.id,
       p.descripcion,
       p.es_requisito,
       p.variantes,
       p.activo,
       mm.cantidad as cantidad_matriz,
       mm.producto_predeterminado_id,
       rp.activo as vinculo_activo
from familias f
join public.panol_material_modelo mm
  on mm.material_id = f.requisito_id
 and regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
 and coalesce(mm.variante, 'standard') = 'standard'
join public.panol_materiales p
  on p.id = f.requisito_id
  or (p.descripcion ilike '%' || f.modelo_producto || '%'
      and (p.descripcion ilike '%cromado%' or p.descripcion ilike '%negro%'))
left join public.panol_requisito_productos rp
  on rp.requisito_material_id = f.requisito_id
 and rp.producto_material_id = p.id
order by f.modelo_producto, tipo, p.descripcion;
