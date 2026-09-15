-- Compras trabaja por PEDIDO; Tornería y Obras leen por LÍNEA.
--
-- Compras le da "Comprado" al pedido entero -que es el botón grande y es como
-- trabajan- y las líneas de adentro quedan en 'pendiente'. Pero el trigger que
-- sincroniza Tornería por pedido saltea a propósito los materiales que tienen
-- vínculo fino (purchase_request_item_id), porque el dato por línea es más
-- preciso. Resultado: nadie mueve la línea, y el material queda colgado.
--
-- Al 15/09/2026 eran 32 materiales de Tornería en tres obras -52-26, 55-5 y
-- ANTAGO-A-30-: el pedido decía "comprado" hace tres semanas y Tornería seguía
-- mostrando "solicitado".
--
-- La decisión: la línea sigue siendo la fuente de verdad, y mover el pedido
-- empuja a sus líneas. Así Tornería Y Obras se enteran por el mismo camino que
-- ya existe, sin agregar una segunda fuente de verdad ni cambiarle la forma de
-- trabajar a Compras.

-- Orden de avance de una línea. 'cancelado' queda fuera a propósito: no es una
-- etapa del recorrido, es una salida.
create or replace function public.purchase_item_rank(p_status text)
returns integer
language sql
immutable
as $rank$
  select case p_status
    when 'pendiente' then 0
    when 'pedido'    then 1
    when 'parcial'   then 2
    when 'en_panol'  then 2
    when 'recibido'  then 3
    else null
  end;
$rank$;

comment on function public.purchase_item_rank(text) is
  'Cuán avanzada está una línea de pedido. Sirve para no hacerla retroceder: el pedido empuja, nunca tira para atrás.';

-- El pedido empuja a sus líneas, nunca las hace retroceder.
--
-- 'comprado' del pedido baja como 'pedido' en la línea, no como 'recibido': el
-- vocabulario del sistema ya dice que "pedido significa comprado/encargado pero
-- todavía no recibido" (ver 20260810151000_panol_aviso_no_es_recepcion).
create or replace function public.purchase_request_arrastra_lineas()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_destino text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_destino := case new.status
    when 'comprado' then 'pedido'
    when 'recibido' then 'recibido'
    else null
  end;

  -- 'nuevo', 'en_revision', 'cotizando' y 'cancelado' no arrastran. Cancelar el
  -- pedido no se propaga porque que Compras lo cancele no significa que el área
  -- ya no necesite el material: eso lo decide una persona.
  if v_destino is null then
    return new;
  end if;

  update public.purchase_request_items
     set status = v_destino,
         updated_at = now()
   where request_id = new.id
     and status <> 'cancelado'
     and public.purchase_item_rank(status) is not null
     and public.purchase_item_rank(status) < public.purchase_item_rank(v_destino);

  return new;
end;
$fn$;

drop trigger if exists trg_purchase_request_arrastra_lineas on public.purchase_requests;
create trigger trg_purchase_request_arrastra_lineas
  after update of status on public.purchase_requests
  for each row execute function public.purchase_request_arrastra_lineas();

-- 'parcial' se agregó después de escribir la sincronización a Tornería y quedó
-- sin mapear: una línea en "Recibido parcial" no movía nada y el material se
-- quedaba en el estado anterior para siempre.
--
-- Va a 'comprado' y no a 'recibido_astillero' porque llegó una parte: decir que
-- está en el astillero habilitaría a Tornería a planificar un viaje con material
-- que todavía no tiene entero.
create or replace function public.torneria_sincronizar_compra_desde_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estado text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_estado := case new.status
    when 'pendiente' then 'solicitado'
    when 'pedido' then 'comprado'
    when 'parcial' then 'comprado'
    when 'en_panol' then 'recibido_astillero'
    when 'recibido' then 'recibido_astillero'
    else null
  end;

  -- 'cancelado' no se mapea: que compras cancele el item no significa que
  -- torneria ya no necesite el material. Queda como estaba y alguien decide.
  if v_estado is null then
    return new;
  end if;

  update public.torneria_items
     set compra_estado = v_estado,
         updated_at = now()
   where purchase_request_item_id = new.id
     and compra_estado <> 'no_aplica'
     and not no_lleva
     and compra_estado is distinct from v_estado;

  return new;
end;
$fn$;

-- ── Puesta al día ───────────────────────────────────────────────────────────
--
-- Sólo los pedidos en 'comprado' con líneas atrasadas. Son 102 líneas al
-- 15/09/2026, 32 de ellas de Tornería.
--
-- Los pedidos que ya están en 'recibido' con líneas sin marcar NO se tocan: son
-- 323 líneas de pedidos históricos, y marcarlas recibidas ahora inventaría una
-- recepción que nunca se registró -con su fecha de hoy- y arrastraría 43 filas
-- de Obras. De acá en adelante el trigger se encarga; lo viejo queda como está.
update public.purchase_request_items i
   set status = 'pedido',
       updated_at = now()
  from public.purchase_requests r
 where r.id = i.request_id
   and r.status = 'comprado'
   and i.status <> 'cancelado'
   and public.purchase_item_rank(i.status) is not null
   and public.purchase_item_rank(i.status) < public.purchase_item_rank('pedido');
