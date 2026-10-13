-- Consumibles: la lija en rollo de 45 m se entrega cortada, por metro.
--
-- Los cinco rollos de Rebollar "Lija en rollo 0,12x45mts" (#36, #40, #60, #80
-- y #100) quedaron con unidad de entrega "rollo" y el precio del rollo entero
-- como costo de cada entrega. En el pañol se cortan: el 13/10 salieron "2" de
-- la #36 para Carpintería y el registro los valorizó como dos rollos de 45 m
-- ($287.812, un quinto de todo lo retirado ese día). Eran 2 metros.
--
-- Ahora: entrega por metro (fraccionado), compra por rollo de 45 m y costo por
-- metro = rollo / 45. La unidad no se puede cambiar con movimientos vigentes
-- (trigger consumibles_config_touch), así que el retiro mal cargado se anula
-- con su motivo y se vuelve a cargar igual (misma persona, sector, lote y hora)
-- en metros, con el costo por metro.

begin;

create temp table _lija_rollo on commit drop as
select c.material_id
  from public.consumibles_config c
 where c.codigo_etiqueta in ('L0037', 'L0038', 'L0040', 'L0041', 'L0042')
   and c.unidad_entrega = 'rollo';

-- Sólo hay retiros: si apareciera un conteo o un ingreso, se frena para revisarlo a mano.
do $$
begin
  if exists (
    select 1 from public.consumibles_movimientos m
     where m.material_id in (select material_id from _lija_rollo)
       and m.anulado_at is null and m.tipo <> 'retiro'
  ) then
    raise exception 'Hay conteos o ingresos de la lija en rollo: revisar antes de pasarla a metros';
  end if;
end $$;

create temp table _lija_rehacer on commit drop as
select m.*
  from public.consumibles_movimientos m
 where m.material_id in (select material_id from _lija_rollo)
   and m.anulado_at is null;

update public.consumibles_movimientos m
   set anulado_at = now(),
       anulado_motivo = 'Unidad corregida: la lija en rollo de 45 m se entrega cortada por metro. Se volvió a cargar en metros.'
 where m.id in (select id from _lija_rehacer);

update public.consumibles_config c
   set forma_entrega = 'fraccionado',
       unidad_entrega = 'metro',
       unidad_compra = 'rollo',
       factor_compra = 45,
       costo_unitario_ars = round(li.costo_ars / 45, 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items li
 where li.id = c.costo_lista_item_id
   and c.material_id in (select material_id from _lija_rollo);

-- El costo va vacío: el trigger pone el vigente (ahora, por metro).
insert into public.consumibles_movimientos (
  id, material_id, sede, tipo, cantidad, gramos, empleado_id, empleado_nombre, empleado_dni,
  metodo_firma, obra_id, sector, carril, lote, solicitud_id, costo_unitario_ars, canje,
  fuera_cupo, autorizado_por, remito, origen, nota, created_by, created_at
)
select gen_random_uuid(), r.material_id, r.sede, r.tipo, r.cantidad, r.gramos, r.empleado_id, r.empleado_nombre, r.empleado_dni,
       r.metodo_firma, r.obra_id, r.sector, r.carril, r.lote, r.solicitud_id, null, r.canje,
       r.fuera_cupo, r.autorizado_por, r.remito, r.origen,
       concat_ws(' · ', nullif(r.nota, ''), 'Recargado en metros (figuraba en rollos de 45 m)'),
       r.created_by, r.created_at
  from _lija_rehacer r;

commit;
