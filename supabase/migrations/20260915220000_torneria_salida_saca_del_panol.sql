-- La salida del circuito de Torneria saca el material del stock de panol.
--
-- QUE PASABA. Cuando panol recibe una compra de Torneria, el renglon queda en
-- el ledger (panol_obra_materiales_snapshot) con estado 'recibido', y eso SUMA
-- al stock: la barra esta fisicamente en el galpon, asi que esta bien que sume.
-- El problema es la salida. Torneria y panol no se hablaban: los botones
-- "Registrar salida" y "Registrar regreso" mueven el circuito y no tocan el
-- ledger. Resultado: la barra se iba al torno y el sistema la seguia contando
-- como stock para siempre. Al 2026-09-15 habia 9 renglones asi (obras 52-26,
-- 55-5 y ANTAGO-A-30, sede Chubut) y otros 27 en camino, con CERO egresos a
-- Torneria en toda la historia de la base.
--
-- COMO SE RESUELVE. El encargado de mecanica ya marca la salida cuando el
-- material se va al taller: ese es el momento fisico en que deja el galpon, y
-- es el unico dato que hace falta. El disparador viaja por el puente que ya
-- existia -purchase_request_item_id, que comparten el renglon de Torneria y la
-- fila del ledger- y da de baja el stock sin que nadie de panol tenga que
-- hacer nada. Es la idea: Torneria sigue trabajando en su circuito y el stock
-- se acomoda solo.
--
-- POR QUE SECURITY DEFINER. panol_egresar_obra_materiales exige
-- is_panol_manager o can_receive_envio, y una cuenta de mecanica no es ninguna
-- de las dos. Si el egreso dependiera de ese permiso habria que darle a
-- mecanica la llave del panol entero. Corriendo como definer, el circuito
-- egresa lo suyo y nada mas.
--
-- POR QUE ES IDEMPOTENTE. torneria_guardar_movimiento, al editar un
-- movimiento, borra sus items y los reinserta: el disparador se vuelve a
-- ejecutar. Como solo toca filas que todavia tienen stock -delta > 0 segun
-- panol_stock_movimiento_delta, la misma funcion que usa el resto del sistema-
-- la segunda pasada no encuentra nada y no hace nada.
--
-- NO TOCA EL PASADO. Es un disparador, no un backfill: las 142 salidas ya
-- registradas quedan como estan. Los 9 renglones que hoy inflan el stock estan
-- en 'recibido_astillero' esperando su salida, asi que salen solos la primera
-- vez que mecanica los mande al torno.
--
-- SIN INDICE, A PROPOSITO. La primera version de esto creaba un indice sobre
-- panol_obra_materiales_snapshot(purchase_request_item_id) y provoco un
-- deadlock al aplicarla en horario de trabajo: un create index toma ShareLock
-- y frena TODA escritura al ledger del panol mientras se construye. Ademas no
-- hacia falta: la tabla tiene 9.674 filas, el disparador hace una busqueda por
-- salida y las salidas son unas pocas por dia. Si algun dia crece de verdad,
-- el indice va aparte y con CREATE INDEX CONCURRENTLY, que no bloquea.

create or replace function public.torneria_salida_egresa_panol()
returns trigger
language plpgsql
security definer
set search_path = public
as $egreso$
declare
  v_mov  record;
  v_item record;
  v_fila record;
  v_nota text;
begin
  select m.tipo, m.destino, m.responsable, m.remito, m.fecha
    into v_mov
    from public.torneria_movimientos m
   where m.id = new.movimiento_id;

  -- Una recepcion es el regreso del taller: no saca nada del galpon.
  if v_mov.tipo is distinct from 'salida' then
    return new;
  end if;

  select ti.clave, ti.purchase_request_item_id
    into v_item
    from public.torneria_operacion_items oi
    join public.torneria_items ti on ti.id = oi.item_id
   where oi.id = new.operacion_item_id;

  -- Sin compra enganchada no hay fila de panol que dar de baja: es material que
  -- el proveedor entrego directo en el taller, o que nunca paso por el galpon.
  if v_item.purchase_request_item_id is null then
    return new;
  end if;

  v_nota := 'Retirado por Torneria'
    || coalesce(' · ' || nullif(btrim(v_mov.destino), ''), '')
    || coalesce(' · remito ' || nullif(btrim(v_mov.remito), ''), '')
    || coalesce(' · ' || nullif(btrim(v_item.clave), ''), '');

  for v_fila in
    select s.id, s.cantidad, s.descripcion, pm.es_requisito
      from public.panol_obra_materiales_snapshot s
      left join public.panol_materiales pm on pm.id = s.material_id
     where s.purchase_request_item_id = v_item.purchase_request_item_id
       and public.panol_stock_movimiento_delta(
             s.source, s.estado, s.recepcion_estado,
             s.cantidad, s.cantidad_egresada) > 0
       for update of s
  loop
    -- Un material generico necesita que alguien elija el producto concreto
    -- antes de salir. Eso no se puede resolver desde el circuito, y frenar la
    -- salida de Torneria por una regla de panol seria peor: queda en el stock
    -- y avisa.
    if v_fila.es_requisito then
      raise notice 'Torneria: "%" queda en el stock de panol, falta elegir el producto concreto', v_fila.descripcion;
      continue;
    end if;

    update public.panol_obra_materiales_snapshot
       set estado            = 'egresado',
           obra_origen_id    = coalesce(obra_origen_id, obra_id),
           egreso_at         = coalesce(v_mov.fecha, now()),
           egreso_por        = auth.uid(),
           egreso_nota       = v_nota,
           retirado_por      = nullif(btrim(coalesce(v_mov.responsable, '')), ''),
           sector_destino    = 'Tornería',
           cantidad_egresada = coalesce(cantidad_egresada, 0) + greatest(coalesce(cantidad, 0), 0),
           updated_at        = now()
     where id = v_fila.id;
  end loop;

  return new;
end
$egreso$;

-- Esto corre contra la base viva. Crear el trigger necesita bloqueo exclusivo
-- sobre la tabla, y si hay una consulta en curso se queda esperando con la
-- puerta cerrada para todos los demas. Con el timeout falla en 5 segundos y se
-- reintenta, en vez de colgarse o llevarse puesto a otro proceso.
set lock_timeout = '5s';

drop trigger if exists trg_torneria_salida_egresa_panol on public.torneria_movimiento_items;
create trigger trg_torneria_salida_egresa_panol
  after insert on public.torneria_movimiento_items
  for each row execute function public.torneria_salida_egresa_panol();

comment on function public.torneria_salida_egresa_panol() is
  'Al registrar una salida en el circuito de Torneria, da de baja del stock de panol el material comprado para ese renglon. Viaja por purchase_request_item_id y solo toca filas que todavia suman stock, asi que reeditar el movimiento no descuenta dos veces.';
