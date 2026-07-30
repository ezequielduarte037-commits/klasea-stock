-- K55: los cuatro tubos fisicos del catalogo tienen dos destinos operativos.
-- Dos se mecanizan para Pata de gallo y dos se combinan con las dos bridas para
-- formar dos Tubos de bocina. El material de catalogo puede ser el mismo, pero
-- el seguimiento debe mantener separados los lotes y sus transformaciones.
--
-- Los procesos que ya tienen movimientos en el circuito viejo no se
-- reinterpretan: una salida historica de cuatro nucleos no permite saber cuales
-- eran para cada destino. La plantilla queda corregida para procesos nuevos y
-- los procesos aun no iniciados se migran automaticamente.

-- ---------------------------------------------------------------------------
-- Plantilla K55
-- ---------------------------------------------------------------------------

update public.torneria_plantilla_items pi
set cantidad = 2,
    grupo = 'Pata de gallo',
    descripcion = 'Nucleos para pata de gallo',
    notas = 'Dos tubos del catalogo destinados a formar la Pata de gallo.',
    orden = 10,
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where pi.plantilla_id = p.id
  and pi.clave = 'nucleo_pata'
  and upper(l.nombre) = 'K55';

insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, material_id, solicitado_por_torneria,
  requiere_confirmacion, alerta, notas, orden, activa,
  es_resultado, resultado_de
)
select
  pi.plantilla_id,
  'nucleo_bocina',
  'Bocina',
  'Nucleos para tubo de bocina',
  2,
  pi.unidad,
  pi.proveedor_compra,
  pi.material_id,
  pi.solicitado_por_torneria,
  false,
  null,
  'Es el mismo tubo fisico del catalogo que el nucleo de Pata de gallo, pero pertenece al lote de Bocina.',
  35,
  true,
  false,
  '{}'::text[]
from public.torneria_plantilla_items pi
join public.torneria_plantillas p on p.id = pi.plantilla_id
join public.lineas_produccion l on l.id = p.linea_id
where pi.clave = 'nucleo_pata'
  and upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = excluded.cantidad,
    unidad = excluded.unidad,
    proveedor_compra = excluded.proveedor_compra,
    material_id = coalesce(excluded.material_id, torneria_plantilla_items.material_id),
    solicitado_por_torneria = excluded.solicitado_por_torneria,
    requiere_confirmacion = false,
    alerta = null,
    notas = excluded.notas,
    orden = excluded.orden,
    activa = true,
    es_resultado = false,
    resultado_de = '{}',
    updated_at = now();

update public.torneria_plantilla_items pi
set grupo = 'Bocina',
    descripcion = 'Bridas para tubo de bocina',
    cantidad = 2,
    notas = 'Las dos bridas y los dos nucleos de Bocina regresan como dos Tubos de bocina.',
    orden = 36,
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where pi.plantilla_id = p.id
  and pi.clave = 'brida_bocina'
  and upper(l.nombre) = 'K55';

insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, solicitado_por_torneria, requiere_confirmacion,
  alerta, notas, orden, activa, es_resultado, resultado_de
)
select
  p.id,
  'tubo_bocina',
  'Bocina',
  'Tubo de bocina',
  2,
  'unidad',
  null,
  false,
  false,
  null,
  'Resultado de dos nucleos para Bocina y dos bridas. Queda terminado al regresar al astillero.',
  38,
  true,
  true,
  array['nucleo_bocina', 'brida_bocina']::text[]
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = 2,
    unidad = excluded.unidad,
    proveedor_compra = null,
    solicitado_por_torneria = false,
    requiere_confirmacion = false,
    alerta = null,
    notas = excluded.notas,
    orden = excluded.orden,
    activa = true,
    es_resultado = true,
    resultado_de = excluded.resultado_de,
    updated_at = now();

update public.torneria_plantilla_items pi
set resultado_de = array['nucleo_pata', 'cachas_pata']::text[],
    notas = 'Dos nucleos y cuatro cachas convergen en el item Pata de gallo para su segundo viaje.',
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where pi.plantilla_id = p.id
  and pi.clave = 'pata_gallo'
  and upper(l.nombre) = 'K55';

with nuevas_operaciones(
  clave, grupo, nombre, tipo, viaje, origen, destino, descripcion, dependencias, orden
) as (
  values
    (
      'pata_nucleo_t1',
      'Pata de gallo',
      'Mecanizar nucleos para Pata de gallo',
      'torneria',
      1,
      'Astillero',
      'Torneria',
      'Salen los dos nucleos reservados para Pata de gallo.',
      array[]::text[],
      10
    ),
    (
      'bocina_componentes_t1',
      'Bocina',
      'Armar Tubos de bocina',
      'torneria',
      1,
      'Astillero',
      'Torneria',
      'Los dos nucleos y las dos bridas pueden salir separados y regresan como dos Tubos de bocina.',
      array[]::text[],
      15
    )
)
insert into public.torneria_plantilla_operaciones(
  plantilla_id, clave, grupo, nombre, tipo, viaje, origen_sugerido,
  destino_sugerido, descripcion, depende_de, orden, activa
)
select
  p.id, op.clave, op.grupo, op.nombre, op.tipo, op.viaje, op.origen,
  op.destino, op.descripcion, op.dependencias, op.orden, true
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join nuevas_operaciones op
where upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    viaje = excluded.viaje,
    origen_sugerido = excluded.origen_sugerido,
    destino_sugerido = excluded.destino_sugerido,
    descripcion = excluded.descripcion,
    depende_de = excluded.depende_de,
    orden = excluded.orden,
    activa = true,
    updated_at = now();

update public.torneria_plantilla_operaciones po
set activa = false,
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where po.plantilla_id = p.id
  and po.clave = 'pata_nucleo_bocina_t1'
  and upper(l.nombre) = 'K55';

update public.torneria_plantilla_operaciones po
set depende_de = array['pata_nucleo_t1', 'pata_cachas_plegadora']::text[],
    nombre = 'Enviar Pata de gallo',
    descripcion = 'Segundo viaje del item Pata de gallo ya formado.',
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where po.plantilla_id = p.id
  and po.clave = 'pata_conjunto_t2'
  and upper(l.nombre) = 'K55';

with links(op_clave, item_clave) as (
  values
    ('pata_nucleo_t1', 'nucleo_pata'),
    ('bocina_componentes_t1', 'nucleo_bocina'),
    ('bocina_componentes_t1', 'brida_bocina')
)
insert into public.torneria_plantilla_operacion_items(
  operacion_id, item_id, cantidad
)
select po.id, pi.id, pi.cantidad
from public.torneria_plantilla_operaciones po
join public.torneria_plantillas p on p.id = po.plantilla_id
join public.lineas_produccion l on l.id = p.linea_id
join links x on x.op_clave = po.clave
join public.torneria_plantilla_items pi
  on pi.plantilla_id = po.plantilla_id
 and pi.clave = x.item_clave
where upper(l.nombre) = 'K55'
on conflict (operacion_id, item_id) do update
set cantidad = excluded.cantidad;

-- ---------------------------------------------------------------------------
-- Procesos K55 existentes que todavia no iniciaron este circuito
-- ---------------------------------------------------------------------------

create temporary table tmp_torneria_k55_split_elegibles
on commit drop
as
select distinct pr.id as proceso_id
from public.torneria_procesos pr
join public.produccion_obras obra on obra.id = pr.obra_id
join public.torneria_operaciones vieja
  on vieja.proceso_id = pr.id
 and vieja.clave = 'pata_nucleo_bocina_t1'
where upper(obra.linea_nombre) = 'K55'
  and not exists (
    select 1
    from public.torneria_movimientos mov
    join public.torneria_operaciones op on op.id = mov.operacion_id
    where op.proceso_id = pr.id
      and op.clave in ('pata_nucleo_bocina_t1', 'pata_conjunto_t2')
  );

update public.torneria_items item
set cantidad = 2,
    grupo = 'Pata de gallo',
    descripcion = 'Nucleos para pata de gallo',
    notas = 'Dos tubos del catalogo destinados a formar la Pata de gallo.',
    orden = 10,
    updated_at = now()
from tmp_torneria_k55_split_elegibles e
where item.proceso_id = e.proceso_id
  and item.clave = 'nucleo_pata';

update public.torneria_items item
set grupo = 'Bocina',
    descripcion = 'Bridas para tubo de bocina',
    cantidad = 2,
    notas = 'Las dos bridas y los dos nucleos de Bocina regresan como dos Tubos de bocina.',
    orden = 36,
    updated_at = now()
from tmp_torneria_k55_split_elegibles e
where item.proceso_id = e.proceso_id
  and item.clave = 'brida_bocina';

insert into public.torneria_items(
  proceso_id, plantilla_item_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, material_id, solicitado_por_torneria, compra_estado,
  purchase_request_id, purchase_request_item_id,
  solicitado_at, comprado_at, recibido_astillero_at,
  requiere_confirmacion, alerta, notas, orden, activo,
  es_resultado, resultado_de, created_by, updated_by
)
select
  source.proceso_id,
  template.id,
  'nucleo_bocina',
  'Bocina',
  'Nucleos para tubo de bocina',
  2,
  source.unidad,
  source.proveedor_compra,
  source.material_id,
  source.solicitado_por_torneria,
  source.compra_estado,
  source.purchase_request_id,
  source.purchase_request_item_id,
  source.solicitado_at,
  source.comprado_at,
  source.recibido_astillero_at,
  false,
  null,
  'Mismo producto fisico del catalogo que el nucleo para Pata de gallo; este lote se reserva para Bocina.',
  35,
  true,
  false,
  '{}'::text[],
  source.created_by,
  source.updated_by
from tmp_torneria_k55_split_elegibles e
join public.torneria_items source
  on source.proceso_id = e.proceso_id
 and source.clave = 'nucleo_pata'
join public.torneria_procesos pr on pr.id = e.proceso_id
join public.torneria_plantilla_items template
  on template.plantilla_id = pr.plantilla_id
 and template.clave = 'nucleo_bocina'
on conflict (proceso_id, clave) do update
set plantilla_item_id = excluded.plantilla_item_id,
    grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = 2,
    unidad = excluded.unidad,
    proveedor_compra = excluded.proveedor_compra,
    material_id = coalesce(excluded.material_id, torneria_items.material_id),
    solicitado_por_torneria = excluded.solicitado_por_torneria,
    compra_estado = excluded.compra_estado,
    purchase_request_id = excluded.purchase_request_id,
    purchase_request_item_id = excluded.purchase_request_item_id,
    solicitado_at = excluded.solicitado_at,
    comprado_at = excluded.comprado_at,
    recibido_astillero_at = excluded.recibido_astillero_at,
    requiere_confirmacion = false,
    alerta = null,
    notas = excluded.notas,
    orden = excluded.orden,
    activo = true,
    es_resultado = false,
    resultado_de = '{}',
    updated_at = now();

insert into public.torneria_items(
  proceso_id, plantilla_item_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, material_id, solicitado_por_torneria, compra_estado,
  requiere_confirmacion, alerta, notas, orden, activo,
  es_resultado, resultado_de, created_by, updated_by
)
select
  pr.id,
  template.id,
  template.clave,
  template.grupo,
  template.descripcion,
  2,
  template.unidad,
  null,
  null,
  false,
  'no_aplica',
  false,
  null,
  template.notas,
  template.orden,
  true,
  true,
  template.resultado_de,
  pr.created_by,
  pr.updated_by
from tmp_torneria_k55_split_elegibles e
join public.torneria_procesos pr on pr.id = e.proceso_id
join public.torneria_plantilla_items template
  on template.plantilla_id = pr.plantilla_id
 and template.clave = 'tubo_bocina'
on conflict (proceso_id, clave) do update
set plantilla_item_id = excluded.plantilla_item_id,
    grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    cantidad = 2,
    unidad = excluded.unidad,
    proveedor_compra = null,
    material_id = null,
    solicitado_por_torneria = false,
    compra_estado = 'no_aplica',
    requiere_confirmacion = false,
    alerta = null,
    notas = excluded.notas,
    orden = excluded.orden,
    activo = true,
    es_resultado = true,
    resultado_de = excluded.resultado_de,
    updated_at = now();

update public.torneria_items item
set resultado_de = array['nucleo_pata', 'cachas_pata']::text[],
    notas = 'Dos nucleos y cuatro cachas convergen en el item Pata de gallo para su segundo viaje.',
    updated_at = now()
from tmp_torneria_k55_split_elegibles e
where item.proceso_id = e.proceso_id
  and item.clave = 'pata_gallo';

insert into public.torneria_operaciones(
  proceso_id, plantilla_operacion_id, clave, grupo, nombre, tipo, viaje,
  origen, destino, descripcion, depende_de, orden, activa,
  created_by, updated_by
)
select
  pr.id, template.id, template.clave, template.grupo, template.nombre,
  template.tipo, template.viaje, template.origen_sugerido,
  template.destino_sugerido, template.descripcion, template.depende_de,
  template.orden, true, pr.created_by, pr.updated_by
from tmp_torneria_k55_split_elegibles e
join public.torneria_procesos pr on pr.id = e.proceso_id
join public.torneria_plantilla_operaciones template
  on template.plantilla_id = pr.plantilla_id
 and template.clave in ('pata_nucleo_t1', 'bocina_componentes_t1')
on conflict (proceso_id, clave) do update
set plantilla_operacion_id = excluded.plantilla_operacion_id,
    grupo = excluded.grupo,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    viaje = excluded.viaje,
    origen = excluded.origen,
    destino = excluded.destino,
    descripcion = excluded.descripcion,
    depende_de = excluded.depende_de,
    orden = excluded.orden,
    activa = true,
    updated_at = now();

update public.torneria_operaciones op
set activa = false,
    updated_at = now()
from tmp_torneria_k55_split_elegibles e
where op.proceso_id = e.proceso_id
  and op.clave = 'pata_nucleo_bocina_t1';

update public.torneria_operaciones op
set depende_de = array['pata_nucleo_t1', 'pata_cachas_plegadora']::text[],
    nombre = 'Enviar Pata de gallo',
    descripcion = 'Segundo viaje del item Pata de gallo ya formado.',
    updated_at = now()
from tmp_torneria_k55_split_elegibles e
where op.proceso_id = e.proceso_id
  and op.clave = 'pata_conjunto_t2';

with links(op_clave, item_clave) as (
  values
    ('pata_nucleo_t1', 'nucleo_pata'),
    ('bocina_componentes_t1', 'nucleo_bocina'),
    ('bocina_componentes_t1', 'brida_bocina')
)
insert into public.torneria_operacion_items(
  operacion_id, item_id, cantidad_requerida
)
select op.id, item.id, item.cantidad
from tmp_torneria_k55_split_elegibles e
join public.torneria_operaciones op on op.proceso_id = e.proceso_id
join links x on x.op_clave = op.clave
join public.torneria_items item
  on item.proceso_id = e.proceso_id
 and item.clave = x.item_clave
on conflict (operacion_id, item_id) do update
set cantidad_requerida = excluded.cantidad_requerida,
    updated_at = now();

insert into public.torneria_historial(
  proceso_id, entidad, entidad_id, accion, detalle, actor_id
)
select
  e.proceso_id,
  'proceso',
  e.proceso_id,
  'circuito_k55_actualizado',
  jsonb_build_object(
    'nucleos_pata', 2,
    'nucleos_bocina', 2,
    'bridas_bocina', 2,
    'tubos_bocina_resultantes', 2
  ),
  auth.uid()
from tmp_torneria_k55_split_elegibles e
where not exists (
  select 1
  from public.torneria_historial h
  where h.proceso_id = e.proceso_id
    and h.accion = 'circuito_k55_actualizado'
);

do $$
declare
  v_operacion uuid;
begin
  for v_operacion in
    select op.id
    from public.torneria_operaciones op
    join tmp_torneria_k55_split_elegibles e on e.proceso_id = op.proceso_id
    where op.clave in ('pata_nucleo_t1', 'bocina_componentes_t1', 'pata_conjunto_t2')
  loop
    perform public.torneria_recalcular_operacion(v_operacion);
  end loop;
end $$;
