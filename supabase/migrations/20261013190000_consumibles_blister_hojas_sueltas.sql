-- Consumibles: las hojas de calar y de sierra se entregan sueltas.
--
-- Rebollar cotiza el blíster de 5 hojas, pero el pañol abre el blíster y
-- entrega hojas (confirmado por Ezequiel el 13/10). Con la unidad en "unidad"
-- y el precio del blíster, cada hoja se valorizaba como cinco. El 13/10
-- salieron 2 hojas T118B y quedaron como 2 blísteres ($20.482 en vez de $4.096).
--
-- Ahora: entrega por hoja, compra por blíster de 5 y costo por hoja = blíster
-- / 5. Si algún blíster trae otra cantidad, se corrige el factor en Catálogo
-- (el factor se puede cambiar con retiros; la unidad no). Mismo camino que la
-- lija en rollo: lo mal cargado se anula con su motivo y se vuelve a cargar
-- igual, en hojas.

begin;

create temp table _blister on commit drop as
select c.material_id
  from public.consumibles_config c
 where c.codigo_etiqueta in ('H0001', 'H0002', 'H0003', 'H0005', 'H0006', 'H0010', 'H0015',
                             'H0016', 'H00161', 'H0019', 'H0020', 'H0022', 'H00221')
   and c.unidad_entrega = 'unidad';

do $$
begin
  if exists (
    select 1 from public.consumibles_movimientos m
     where m.material_id in (select material_id from _blister)
       and m.anulado_at is null and m.tipo <> 'retiro'
  ) then
    raise exception 'Hay conteos o ingresos de hojas en blíster: revisar antes de pasarlas a hojas';
  end if;
end $$;

create temp table _blister_rehacer on commit drop as
select m.*
  from public.consumibles_movimientos m
 where m.material_id in (select material_id from _blister)
   and m.anulado_at is null;

update public.consumibles_movimientos m
   set anulado_at = now(),
       anulado_motivo = 'Unidad corregida: las hojas del blíster se entregan sueltas. Se volvió a cargar en hojas.'
 where m.id in (select id from _blister_rehacer);

update public.consumibles_config c
   set unidad_entrega = 'hoja',
       unidad_compra = 'blister',
       factor_compra = 5,
       costo_unitario_ars = round(li.costo_ars / 5, 4),
       costo_actualizado_at = now()
  from public.consumibles_lista_items li
 where li.id = c.costo_lista_item_id
   and c.material_id in (select material_id from _blister);

insert into public.consumibles_movimientos (
  id, material_id, sede, tipo, cantidad, gramos, empleado_id, empleado_nombre, empleado_dni,
  metodo_firma, obra_id, sector, carril, lote, solicitud_id, costo_unitario_ars, canje,
  fuera_cupo, autorizado_por, remito, origen, nota, created_by, created_at
)
select gen_random_uuid(), r.material_id, r.sede, r.tipo, r.cantidad, r.gramos, r.empleado_id, r.empleado_nombre, r.empleado_dni,
       r.metodo_firma, r.obra_id, r.sector, r.carril, r.lote, r.solicitud_id, null, r.canje,
       r.fuera_cupo, r.autorizado_por, r.remito, r.origen,
       concat_ws(' · ', nullif(r.nota, ''), 'Recargado en hojas (figuraba como blísteres)'),
       r.created_by, r.created_at
  from _blister_rehacer r;

commit;
