-- Correcciones del 06/11/2026 (pedido de Ezequiel). Respaldo previo: antes.json
-- 1) Egreso de bisagras B21701 del 05/11 11:31 (tomas.viyagra, retira Daniel
--    Indaburu): se cargaron 48 y salieron 6. El renglón de stock (conteo físico
--    Chubut) recupera 42.
update public.panol_obra_materiales_snapshot
   set cantidad = 6, cantidad_egresada = 6, recepcion_cantidad_recibida = 6,
       egreso_nota = egreso_nota || ' [Corregido 06/11: salieron 6, se habían cargado 48]'
 where id = '17d99eb6-39f2-444c-8739-56636941f6c5' and cantidad = 48;
update public.panol_obra_materiales_snapshot
   set cantidad = cantidad + 42, cantidad_egresada = cantidad_egresada - 42
 where id = 'b9c63287-f72e-4412-a316-1d4b1393724b' and cantidad = 6 and cantidad_egresada = 92;

-- 2) La ficha 4237 de Flojumar vuelve a ser la luz de lectura mediana (el 05/11
--    quedó renombrada con el nombre de la cerradura).
update public.panol_materiales
   set descripcion = 'Luz de lectura mediana', alias = null
 where id = '49ab5b57-27e0-4c64-a84c-36fb6d2badfe';

-- 3) La cerradura magnética (Baron C42377, 55-1) se había vinculado sola a esa
--    ficha porque "C42377" contiene "4237". Queda sin producto, para que
--    Técnica la resuelva en "Productos a crear".
update public.panol_envio_items
   set material_id = null, requisito_material_id = null
 where id = '4a14cd99-be78-4964-bf6b-585980b29fe9';
update public.panol_obra_materiales_snapshot
   set material_id = null, requisito_material_id = null
 where id = 'bcdb251b-5db0-4505-9b9c-d983974053b5';
