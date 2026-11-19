-- 55-1: la copia vieja del adicional "Cerraduras de puertas BRONZEN (K55)" quedó
-- sin material y la lista la mostraba aparte del adicional ya vinculado al
-- catálogo. Se le pone el mismo material para que sea una sola fila.
update public.panol_obra_materiales_snapshot
   set material_id='4633a455-bf86-438a-99a7-a63fde82f6bf', requisito_material_id='4633a455-bf86-438a-99a7-a63fde82f6bf'
 where id='72bdb28c-3f14-4ecb-8f90-0b2a80d8e611' and material_id is null and estado='pendiente' and purchase_request_id is null
returning id, estado, material_id;
