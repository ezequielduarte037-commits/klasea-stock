-- Sin proveedores inventados en el historial de precios.
--
-- Los precios de lista sacados de una web, los estimados y los tomados de la
-- lista de otra obra se habían cargado con un proveedor de mentira
-- ("Referencia web", "Estimado", "Lista de obra"). No son proveedores: se ven
-- mezclados con Baron, Trimer o Famiq como si alguien los hubiera cotizado.
--
-- Pasan a quedar SIN proveedor. El precio, la fecha y la fuente se conservan:
-- la fuente sigue diciendo de dónde salió cada número (la tienda, el papel o la
-- cuenta), sin el rótulo "Referencia web" adelante.
--
-- El programa ya cuenta los precios sin proveedor (materiales/api.js,
-- proveedoresDeMaterial): antes los descartaba, por eso se les había puesto un
-- nombre. Cuando llegue una cotización de verdad, entra con su proveedor.

begin;

update public.panol_precios
   set proveedor = null,
       proveedor_id = null,
       fuente = case
         when fuente like 'Referencia web · %' then regexp_replace(fuente, '^Referencia web · ', '')
         when fuente like 'Estimado · %' then regexp_replace(fuente, '^Estimado · ', 'Estimado: ')
         else fuente
       end
 where proveedor in ('Referencia web', 'Estimado', 'Lista de obra');

commit;
