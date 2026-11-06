-- Corrección del 06/11/2026 (pedido de Ezequiel). Respaldo previo: antes.json
-- Egreso del 14/10 12:27 (maxi.adm, retira Mariano Ramírez, destino 55-1): la
-- línea "Stock Chubut" del conteo inicial (15 relojes de nivel de combustible)
-- salió entera porque la pantalla de egreso arranca con todo lo disponible.
-- El reloj que se llevó Mariano ya está registrado aparte (el que se le había
-- pasado a la 55-1 desde la 37-38). En el estante hay 30, así que esta línea no
-- salió: vuelve a ser stock libre de Chubut y el sistema queda en 30.
select set_config('request.jwt.claim.sub', 'b93b4fda-590a-41b7-8382-317aa74917e1', true),
       set_config('request.jwt.claims', '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);

update public.panol_obra_materiales_snapshot
   set estado = 'en_panol',
       obra_id = null,
       egreso_destino_obra_id = null,
       cantidad_egresada = 0,
       retirado_por = null,
       egreso_at = null,
       egreso_por = null,
       stock_nota = trim(coalesce(stock_nota, '') || ' [06/11: anulado el egreso del 14/10 a la 55-1, salió por error; los 15 siguen en el estante]')
 where id = '3cfee2e4-8fbd-4844-9de9-f25ee87dbf88' and cantidad = 15 and cantidad_egresada = 15 and estado = 'egresado';
