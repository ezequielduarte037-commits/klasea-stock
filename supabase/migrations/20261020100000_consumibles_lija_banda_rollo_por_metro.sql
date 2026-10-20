-- Consumibles: la lija en banda 6300 x 150 (L0028 #40, L0029 #60) viene en rollo
-- de 45 m y se retira por metro; el costo tomaba el precio del rollo entero.
--
-- Estaban con unidad de entrega "unidad" y factor de compra 1, así que cada
-- retiro (metros) figuraba a $27.657,63 / $23.245,55 el metro. Rollo de 45 m
-- (Ezequiel, 20/10): compra por rollo, factor 45, entrega por metro y costo por
-- metro = rollo / 45 ($614,61 y $516,57).
--
-- Un movimiento no se edita (trigger consumibles_movimiento_solo_anular), así que
-- cada retiro vigente se anula con su motivo y se vuelve a cargar igual (misma
-- persona, sector, lote, solicitud, remito y hora) con el costo por metro. Misma
-- técnica que 20261019200000 (cartón en rollo). No hay conteos de estos
-- productos, así que el cambio de unidad no toca el stock.

begin;

create temp table _lija on commit drop as
select c.material_id
  from public.consumibles_config c
 where c.codigo_etiqueta in ('L0028', 'L0029')
   and c.unidad_entrega = 'unidad'
   and coalesce(c.factor_compra, 1) = 1;

do $$
begin
  if (select count(*) from _lija) <> 2 then
    raise exception 'La lija en banda no está como se esperaba (L0028 y L0029, por unidad, factor 1): revisar a mano';
  end if;
  if exists (
    select 1 from public.consumibles_movimientos m
     where m.material_id in (select material_id from _lija)
       and m.anulado_at is null
       and (m.snapshot_id is not null or m.correccion_de is not null or m.tipo <> 'retiro')
  ) then
    raise exception 'Hay movimientos de la lija enganchados a pañol, a una corrección o que no son retiros: revisar a mano';
  end if;
end $$;

create temp table _lija_rehacer on commit drop as
select m.*
  from public.consumibles_movimientos m
 where m.material_id in (select material_id from _lija)
   and m.anulado_at is null;

update public.consumibles_movimientos m
   set anulado_at = now(),
       anulado_motivo = 'Costo corregido: la lija en banda viene en rollo de 45 m y se retira por metro; figuraba al precio del rollo entero. Se volvió a cargar igual con el costo por metro.'
 where m.id in (select id from _lija_rehacer);

update public.consumibles_config c
   set unidad_compra = 'rollo',
       factor_compra = 45,
       unidad_entrega = 'metro',
       costo_unitario_ars = round(li.costo_ars / 45, 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items li
 where li.id = c.costo_lista_item_id
   and c.material_id in (select material_id from _lija);

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
  from _lija_rehacer r
 order by r.created_at;

commit;
