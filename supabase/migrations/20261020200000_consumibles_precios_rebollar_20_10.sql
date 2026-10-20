-- Consumibles: precios de Rebollar vigentes al 20/10/2026.
--
-- Se comparó la lista del 20/10 (CSV) con la vigente del 08/10: mismos 649
-- códigos, sin altas ni bajas y 6 subas reales. El resto de las diferencias
-- eran redondeos del CSV en el quinto decimal y no se tocan. Pedido de Ezequiel
-- (20/10): actualizar sólo los precios, sin cargar una lista nueva.
--
-- Se actualiza el precio del renglón en la lista vigente y el costo por unidad
-- de entrega del producto (costo / factor de compra, como hace la app). Los
-- movimientos ya registrados conservan su costo: no se revaloriza el pasado.
--
--   G0008 Guantes de latex x 100          5.200      → 5.400       (+3,8%)
--   L0037 Lija en rollo 0,12x45mts #36    143.906,14 → 146.064,64  (+1,5%)
--   L0038 Lija en rollo 0,12x45mts #40    130.522,72 → 132.510,28  (+1,5%)
--   L0040 Lija en rollo 0,12x45mts #60    108.139,72 → 109.761,81  (+1,5%)
--   L0041 Lija en rollo 0,12x45mts #80     99.070,54 → 100.556,05  (+1,5%)
--   L0042 Lija en rollo 0,12x45mts #100    90.004,10 →  91.354,06  (+1,5%)

begin;

create temp table _nuevos (codigo text primary key, precio_antes numeric, precio numeric) on commit drop;
insert into _nuevos values
  ('G0008', 5200, 5400),
  ('L0037', 143906.136313, 146064.64),
  ('L0038', 130522.723738, 132510.28),
  ('L0040', 108139.720039, 109761.81),
  ('L0041', 99070.544446, 100556.05),
  ('L0042', 90004.097657, 91354.06);

do $$
begin
  -- Que estén todos en la lista vigente con el precio de antes: si alguien los
  -- cambió mientras tanto, no se pisa.
  if (select count(*)
        from public.consumibles_lista_items i
        join _nuevos n on n.codigo = i.codigo and abs(i.precio - n.precio_antes) < 0.000001
       where i.lista_id = '6640acbd-3a3d-4492-8b06-74dea0d62951') <> 6 then
    raise exception 'Los renglones no están como se esperaba (precio de antes distinto o faltan): revisar a mano';
  end if;
end $$;

update public.consumibles_lista_items i
   set precio = n.precio,
       costo_ars = round(n.precio, 4)
  from _nuevos n
 where i.lista_id = '6640acbd-3a3d-4492-8b06-74dea0d62951'
   and i.codigo = n.codigo;

update public.consumibles_config c
   set costo_unitario_ars = round(i.costo_ars / nullif(c.factor_compra, 0), 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items i
  join _nuevos n on n.codigo = i.codigo
 where i.lista_id = '6640acbd-3a3d-4492-8b06-74dea0d62951'
   and c.costo_lista_item_id = i.id;

commit;
