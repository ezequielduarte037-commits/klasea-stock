-- Matriz K52: los precintos se piden por bolsa de 100 (confirmado por Ezequiel
-- el 02/11/2026; Electro 2001 y Janored los cotizaron así). La cantidad de la
-- matriz (20, 15 y 15) ya eran bolsas; lo que estaba mal era la unidad.
--
-- Sólo los usa el K52, nunca se compraron ni se movieron y en las obras están
-- pendientes. El trigger de la matriz copia cantidades, no unidades: por eso se
-- corrige también la unidad en las listas de las obras.

begin;

update public.panol_materiales
   set unidad_medida = 'Bolsa x100'
 where id in (
   '659b782d-4fdc-4557-9d65-c7d60b55dfb4',  -- Precinto 150 x 3,5 mm
   'e89568d2-9686-4ac1-8ade-49cf9962fe5c',  -- Precinto 245 x 4,6 mm
   '01a3d2a8-5f95-403b-a185-0b4ed49eb894'   -- Precinto 300 x 5 mm
 );

update public.panol_obra_materiales_snapshot
   set unidad = 'Bolsa x100', updated_at = now()
 where material_id in (
   '659b782d-4fdc-4557-9d65-c7d60b55dfb4',
   'e89568d2-9686-4ac1-8ade-49cf9962fe5c',
   '01a3d2a8-5f95-403b-a185-0b4ed49eb894'
 )
   and lower(coalesce(source, 'matriz')) = 'matriz'
   and unidad is distinct from 'Bolsa x100';

commit;
