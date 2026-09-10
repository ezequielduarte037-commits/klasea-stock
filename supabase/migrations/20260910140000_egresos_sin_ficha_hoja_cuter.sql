-- Egresos sin ficha de catálogo: los dos que tienen par exacto
--
-- En "A reconciliar" aparecen materiales con stock -1. No es un error de
-- cuenta: son egresos que salieron sin entrada, porque la fila nunca se ató a
-- una ficha del catálogo.
--
-- De dónde salen: el circuito de solicitudes permite pedir por texto libre.
-- Alguien escribe "hoja de cuter" en la solicitud, pañol se lo entrega, y queda
-- una salida de un material que el sistema no conoce. Son 13 de 746 items de
-- solicitud, y casi todos son consumibles: lijas, hojas de cutter, masillas,
-- cintas. Tiene sentido: quien va al pañol a pedir una lija la escribe a mano
-- porque es más rápido que buscarla en el catálogo.
--
-- Este SQL resuelve los dos únicos que tienen par exacto en el catálogo:
-- "hoja de cuter" y "hoja cuter", que son HOJA CUTER.
--
-- Es seguro: HOJA CUTER tiene 90 unidades de saldo (entraron 100 por remito),
-- así que estos dos egresos de 1 se descuentan contra existencias reales y el
-- -1 desaparece en vez de mudarse.
--
-- Los otros 11 no existen en el catálogo y hay que crearlos. No los invento acá:
-- van en la lista aparte.
--
-- Correr entero en el editor SQL de Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El pedido queda atado a la ficha
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_solicitud_items
   set material_id = '92629e6e-fe1e-4047-8fa8-44b388ef6b71'  -- HOJA CUTER
 where id in (
  '2400a446-ac25-49cd-9eca-e81cd5060575',  -- "hoja de cuter"
  '906e4a59-275f-4f7f-824d-21ae0b968219'   -- "hoja cuter"
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El egreso también
--
-- Sin esto el movimiento sigue suelto: la fila del pedido apunta a la ficha
-- pero la del pañol no, y el stock se sigue leyendo mal.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot
   set material_id = '92629e6e-fe1e-4047-8fa8-44b388ef6b71',
       requisito_material_id = coalesce(requisito_material_id, '92629e6e-fe1e-4047-8fa8-44b388ef6b71'),
       rubro = 'Consumibles'
 where id in (
  '9a78833f-73a0-4078-8281-c2b4e02366af',  -- "hoja de cuter"
  'b8246368-ea63-47fe-8a84-8b37f54ec2fa'   -- "hoja cuter"
);

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════

-- El saldo de HOJA CUTER después de absorber los dos egresos.
select sum(case when estado = 'egresado'
                then -coalesce(nullif(cantidad_egresada, 0), cantidad, 0)
                else coalesce(cantidad, 0) end) as saldo_hoja_cuter
  from public.panol_obra_materiales_snapshot
 where material_id = '92629e6e-fe1e-4047-8fa8-44b388ef6b71';

-- Lo que queda sin ficha, para tenerlo a la vista. Son los 11 que hay que crear.
select i.descripcion, count(*) as pedidos, max(i.created_at)::date as ultimo
  from public.panol_solicitud_items i
 where i.material_id is null
 group by 1
 order by 3 desc;
