select table_name, string_agg(column_name, ',' order by ordinal_position) columns
from information_schema.columns where table_schema='public' and table_name in
('profiles','purchase_requests','purchase_request_items','panol_envios','panol_envio_items','panol_obra_materiales_snapshot',
 'produccion_obras','panol_materiales','panol_material_proveedores','panol_material_codigos_barra','panol_material_variantes') group by 1 order by 1;
select id,username,role,is_admin from public.profiles where username ilike '%gaston%' or id='b93b4fda-590a-41b7-8382-317aa74917e1';
select count(*) as avisos_existentes from public.panol_envios where concat_ws(' ',titulo,observaciones) ilike '%85732%';
