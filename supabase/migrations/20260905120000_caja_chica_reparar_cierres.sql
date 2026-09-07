-- OPCIONAL. Repara las cajas chicas que quedaron pisadas por el bug de cierre.
--
-- Que pasaba: al cerrar una caja el update mandaba los seis campos del cierre y
-- no solo los dos que se estaban cambiando, asi que cada cierre borraba el
-- nombre, la fecha de inicio, las notas y el dueño de esa caja. El codigo ya
-- esta arreglado (`normalizeClosurePatch` en cajaChicaApi.js): esto es solo para
-- las filas que ya quedaron mal.
--
-- Lo que SE PUEDE recuperar sale de los movimientos de cada caja, que nunca se
-- tocaron: la fecha del mas viejo, la del mas nuevo y de quien eran.
-- Lo que NO se puede recuperar es el nombre original: se perdio al pisarse. A
-- las que quedaron con el nombre generico se les arma uno con su rango de
-- fechas, que al menos las distingue entre si.
--
-- Es idempotente y no toca ninguna caja que tenga sus datos completos.
-- Correr en el editor SQL de Supabase y revisar el SELECT del final.

begin;

-- 1. Fecha de inicio: la del movimiento mas viejo de esa caja.
update public.purchase_cashbox_closures c
set fecha_desde = m.desde
from (
  select cierre_id, min(fecha) as desde
  from public.purchase_cashbox_entries
  where cierre_id is not null
  group by cierre_id
) m
where m.cierre_id = c.id
  and c.fecha_desde is null;

-- 2. Fecha de fin de las cerradas que quedaron sin ella.
update public.purchase_cashbox_closures c
set fecha_hasta = m.hasta
from (
  select cierre_id, max(fecha) as hasta
  from public.purchase_cashbox_entries
  where cierre_id is not null
  group by cierre_id
) m
where m.cierre_id = c.id
  and c.estado = 'cerrado'
  and c.fecha_hasta is null;

-- 3. Dueño: si TODOS los movimientos de la caja son del mismo cadete, la caja
--    es de ese cadete. Si estan mezclados no se toca: adivinar seria peor.
--    (uuid no tiene min(): como el HAVING deja pasar solo los grupos con un
--     unico dueño, se toma ese del array de distintos.)
update public.purchase_cashbox_closures c
set owner_id = m.owner_id
from (
  select cierre_id, (array_agg(distinct owner_id))[1] as owner_id
  from public.purchase_cashbox_entries
  where cierre_id is not null
    and owner_id is not null
  group by cierre_id
  having count(distinct owner_id) = 1
) m
where m.cierre_id = c.id
  and c.owner_id is null;

-- 4. Nombre: solo a las que quedaron con el generico y ya tienen fechas.
--    "Caja 14/05 al 21/05" en vez de diez renglones identicos.
update public.purchase_cashbox_closures c
set nombre = 'Caja '
  || to_char(c.fecha_desde::date, 'DD/MM')
  || ' al '
  || to_char(c.fecha_hasta::date, 'DD/MM')
where c.nombre = 'Cierre caja chica'
  and c.fecha_desde is not null
  and c.fecha_hasta is not null;

commit;

-- Como quedo. Si aparecen filas con "sin fechas" son cajas sin ningun
-- movimiento cargado: de esas no hay nada de donde sacar los datos.
select
  coalesce(p.username, '(caja de compras)') as caja,
  c.nombre,
  c.estado,
  coalesce(to_char(c.fecha_desde::date, 'DD/MM/YY') || ' a ' || to_char(c.fecha_hasta::date, 'DD/MM/YY'), 'sin fechas') as periodo,
  (select count(*) from public.purchase_cashbox_entries e where e.cierre_id = c.id) as movimientos
from public.purchase_cashbox_closures c
left join public.profiles p on p.id = c.owner_id
order by c.estado, c.fecha_desde desc nulls last;
