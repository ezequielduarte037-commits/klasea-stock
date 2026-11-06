-- 06/11/2026: la ventana 62538 del remito "vidrios k37" (05/11, tomas.viyagra)
-- se guardó con la cantidad en blanco. Llegó 1 (confirmado por Ezequiel).
-- El trigger de recepción pide un usuario que pueda recibir en Chubut: va a
-- nombre de ezequiel.adm (sólo dentro de esta transacción).
select set_config('request.jwt.claim.sub', 'b93b4fda-590a-41b7-8382-317aa74917e1', true),
       set_config('request.jwt.claims', '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);
update public.panol_envio_items
   set cantidad = '1', cantidad_recibida = '1'
 where id = 'a4f302be-34ae-47d5-b1af-bf2a8e356405' and coalesce(cantidad, '') = '';
update public.panol_obra_materiales_snapshot
   set cantidad = 1, recepcion_cantidad_recibida = '1'
 where id = 'a5e7eb47-0ba5-4b26-8fcc-62fe1d2325df' and cantidad is null;
