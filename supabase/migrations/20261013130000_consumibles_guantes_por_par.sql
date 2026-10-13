-- Consumibles: los guantes se compran en cajas de 100 (50 pares) y se entregan
-- por par. La carga desde la lista les dejó el precio de la caja como costo de
-- cada par: un par de látex valía $5.200 en vez de $104 y el histórico salía
-- inflado en $7 millones. Factor 50 y costo por par.

begin;

update public.consumibles_config c
   set unidad_compra = 'caja',
       factor_compra = 50,
       costo_unitario_ars = round(li.costo_ars / 50, 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items li
 where li.id = c.costo_lista_item_id
   and c.unidad_entrega = 'par'
   and coalesce(li.contenido, 1) = 100
   and (c.factor_compra is null or c.factor_compra = 1);

commit;
