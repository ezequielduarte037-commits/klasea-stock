-- Consumibles: el cartón en rollo (C0001) cuesta $462,80 el metro, no $11.570.
--
-- El 13/10 se pasó la entrega a metro pero el factor de compra quedó en 1
-- porque no se sabía el largo del rollo, así que cada metro tomó el precio del
-- rollo entero de Rebollar ($11.570). Los 30 m retirados hasta el 19/10
-- figuraban como $347.100 en lugar de ~$13.900.
--
-- El rollo trae 25 m (Ezequiel, 19/10): compra por rollo, factor 25 y costo por
-- metro = rollo / 25. Con el factor puesto, la próxima lista de precios también
-- lo calcula bien (preciosLogica divide por factor_compra).
--
-- Un movimiento no se edita (trigger consumibles_movimiento_solo_anular) y la
-- corrección conserva el costo original, así que cada movimiento vigente se
-- anula con su motivo y se vuelve a cargar igual (misma persona, sector, lote,
-- solicitud, remito y hora) con el costo por metro. La unidad no cambia.

begin;

create temp table _carton on commit drop as
select c.material_id
  from public.consumibles_config c
  join public.consumibles_lista_items li on li.id = c.costo_lista_item_id
 where c.codigo_etiqueta = 'C0001'
   and c.unidad_entrega = 'metro'
   and coalesce(c.factor_compra, 1) = 1;

do $$
begin
  if (select count(*) from _carton) <> 1 then
    raise exception 'El cartón en rollo no está como se esperaba (C0001, por metro, factor 1): revisar a mano';
  end if;
  if exists (
    select 1 from public.consumibles_movimientos m
     where m.material_id in (select material_id from _carton)
       and m.anulado_at is null
       and (m.snapshot_id is not null or m.correccion_de is not null)
  ) then
    raise exception 'Hay movimientos del cartón enganchados a pañol o a una corrección: revisar a mano';
  end if;
end $$;

create temp table _carton_rehacer on commit drop as
select m.*
  from public.consumibles_movimientos m
 where m.material_id in (select material_id from _carton)
   and m.anulado_at is null;

update public.consumibles_movimientos m
   set anulado_at = now(),
       anulado_motivo = 'Costo corregido: el cartón en rollo de 25 m vale $462,80 el metro, no el rollo entero. Se volvió a cargar igual con el costo por metro.'
 where m.id in (select id from _carton_rehacer);

update public.consumibles_config c
   set unidad_compra = 'rollo',
       factor_compra = 25,
       costo_unitario_ars = round(li.costo_ars / 25, 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items li
 where li.id = c.costo_lista_item_id
   and c.material_id in (select material_id from _carton);

-- El costo va vacío: el trigger pone el vigente (ahora, por metro).
insert into public.consumibles_movimientos (
  id, material_id, sede, tipo, cantidad, gramos, contado, teorico, empleado_id, empleado_nombre, empleado_dni,
  metodo_firma, obra_id, sector, carril, lote, solicitud_id, costo_unitario_ars, canje,
  fuera_cupo, autorizado_por, remito, origen, nota, created_by, created_at, empleado_empresa, empleado_externo
)
select gen_random_uuid(), r.material_id, r.sede, r.tipo, r.cantidad, r.gramos, r.contado, r.teorico, r.empleado_id, r.empleado_nombre, r.empleado_dni,
       r.metodo_firma, r.obra_id, r.sector, r.carril, r.lote, r.solicitud_id, null, r.canje,
       r.fuera_cupo, r.autorizado_por, r.remito, r.origen,
       concat_ws(' · ', nullif(r.nota, ''), 'Recargado con costo por metro (figuraba a precio de rollo)'),
       r.created_by, r.created_at, r.empleado_empresa, r.empleado_externo
  from _carton_rehacer r
 order by r.created_at;

commit;
