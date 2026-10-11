-- Consumibles: 11 mangueras de la lista de Rebollar vienen sin medida ("MANG
-- CRISTAL C/ALAMB ATOX DIAM", sin el número): quedaban con el nombre repetido
-- y en el pañol no se podía saber cuál es cuál. Se les agrega el código de
-- Rebollar al nombre hasta que Rebollar pase los diámetros.

begin;

update public.panol_materiales m
   set descripcion = m.descripcion || ' (' || c.proveedor_codigo || ')'
  from public.consumibles_config c
 where c.material_id = m.id
   and m.es_consumible
   and m.activo is distinct from false
   and c.proveedor_codigo is not null
   and m.descripcion not like '%(' || c.proveedor_codigo || ')'
   and lower(m.descripcion) in (
     select lower(m2.descripcion)
       from public.panol_materiales m2
      where m2.es_consumible and m2.activo is distinct from false
      group by lower(m2.descripcion)
     having count(*) > 1
   );

commit;
