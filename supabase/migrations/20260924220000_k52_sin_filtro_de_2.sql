-- K52: sale el "Filtro de agua de mar 2"".
--
-- Lo había creado la 20260924120000 como requisito genérico para los motores,
-- deducido de que las tomas del K52 son de 2". Ningún remito, pedido ni obra lo
-- respalda: ningún K52 cargó un filtro para los motores. Ezequiel pidió sacarlo
-- el 24/09/2026.
--
-- Se borra de la matriz y su precio de referencia (Groco, EE.UU.). El ítem queda
-- inactivo en el catálogo en vez de borrarse, por si algo lo referencia.

begin;

delete from public.panol_material_modelo
 where material_id in (
   select id from public.panol_materiales
    where descripcion = 'Filtro de agua de mar 2"' and origen = 'matriz-k52'
 );

delete from public.panol_precios
 where fuente like 'Precio de referencia del requisito (la marca se decide después): fisheriessupply.com, Groco ARG-2000-S%'
   and proveedor is null
   and material_id in (
     select id from public.panol_materiales
      where descripcion = 'Filtro de agua de mar 2"' and origen = 'matriz-k52'
   );

update public.panol_materiales
   set activo = false,
       notas = 'Dado de baja el 24/09/2026: no lo respalda ninguna compra ni obra.'
 where descripcion = 'Filtro de agua de mar 2"'
   and origen = 'matriz-k52';

commit;
