-- Torneria: materiales que se transforman en conjuntos y recorridos cuyo
-- origen puede ser un proveedor en lugar del astillero.
--
-- Los procesos existentes solo se convierten al nuevo item resultante cuando
-- el segundo viaje todavia no tiene movimientos. De ese modo no se borran ni
-- reinterpretan salidas/recepciones ya registradas.

alter table public.torneria_plantilla_items
  add column if not exists es_resultado boolean not null default false,
  add column if not exists resultado_de text[] not null default '{}';

alter table public.torneria_items
  add column if not exists es_resultado boolean not null default false,
  add column if not exists resultado_de text[] not null default '{}';

alter table public.torneria_plantilla_operaciones
  add column if not exists origen_sugerido text not null default 'Astillero';

alter table public.torneria_operaciones
  add column if not exists origen text not null default 'Astillero';

-- Las altas futuras siguen usando el RPC original. Estos triggers copian la
-- metadata nueva desde la plantilla sin tener que duplicar toda la funcion.
create or replace function public.torneria_aplicar_metadata_item_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado boolean;
  v_fuentes text[];
begin
  if new.plantilla_item_id is null then
    return new;
  end if;

  select es_resultado, resultado_de
    into v_resultado, v_fuentes
    from public.torneria_plantilla_items
   where id = new.plantilla_item_id;

  new.es_resultado := coalesce(v_resultado, false);
  new.resultado_de := coalesce(v_fuentes, '{}');
  if new.es_resultado then
    new.compra_estado := 'no_aplica';
    new.solicitado_por_torneria := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_torneria_item_metadata_plantilla
  on public.torneria_items;
create trigger trg_torneria_item_metadata_plantilla
before insert on public.torneria_items
for each row execute function public.torneria_aplicar_metadata_item_plantilla();

create or replace function public.torneria_aplicar_metadata_operacion_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text;
begin
  if new.plantilla_operacion_id is null then
    return new;
  end if;

  select origen_sugerido
    into v_origen
    from public.torneria_plantilla_operaciones
   where id = new.plantilla_operacion_id;

  new.origen := coalesce(nullif(btrim(v_origen), ''), 'Astillero');
  return new;
end;
$$;

drop trigger if exists trg_torneria_operacion_metadata_plantilla
  on public.torneria_operaciones;
create trigger trg_torneria_operacion_metadata_plantilla
before insert on public.torneria_operaciones
for each row execute function public.torneria_aplicar_metadata_operacion_plantilla();

-- Una cantidad de conjunto se define manualmente en el material resultado.
-- Al editarla se sincroniza el requerido de su segundo viaje.
create or replace function public.torneria_sincronizar_cantidad_resultado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion uuid;
begin
  if new.es_resultado
     and old.cantidad is distinct from new.cantidad then
    update public.torneria_operacion_items
       set cantidad_requerida = new.cantidad,
           updated_at = now()
     where item_id = new.id;

    for v_operacion in
      select operacion_id
        from public.torneria_operacion_items
       where item_id = new.id
    loop
      perform public.torneria_recalcular_operacion(v_operacion);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_torneria_resultado_cantidad
  on public.torneria_items;
create trigger trg_torneria_resultado_cantidad
after update of cantidad on public.torneria_items
for each row execute function public.torneria_sincronizar_cantidad_resultado();

-- Conjuntos resultantes para lineas estandar.
with resultados(
  clave, grupo, descripcion, unidad, fuentes, notas, orden
) as (
  values
    (
      'pata_gallo', 'Pata de gallo', 'Pata de gallo', 'conjunto',
      array['nucleo_pata', 'cachas_pata']::text[],
      'Se forma con nucleo y cachas. La cantidad final se carga manualmente.', 35
    ),
    (
      'timon', 'Timon', 'Timon', 'conjunto',
      array['pala_timon', 'mecha_timon']::text[],
      'Se forma con pala y mecha de timon. La cantidad final se carga manualmente.', 75
    ),
    (
      'limera_timon', 'Limera', 'Limera de timon', 'conjunto',
      array['brida_limera', 'cano_limera']::text[],
      'Se forma con bridas y cano de limera. La cantidad final se carga manualmente.', 105
    )
)
insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, solicitado_por_torneria, requiere_confirmacion,
  alerta, notas, orden, activa, es_resultado, resultado_de
)
select
  p.id, r.clave, r.grupo, r.descripcion, 1, r.unidad,
  null, false, true,
  'Defini y confirma la cantidad del conjunto resultante.',
  r.notas, r.orden, true, true, r.fuentes
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join resultados r
where upper(l.nombre) in ('K37', 'K42', 'K43', 'K52', 'K64')
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    unidad = excluded.unidad,
    proveedor_compra = null,
    solicitado_por_torneria = false,
    requiere_confirmacion = true,
    alerta = excluded.alerta,
    notas = excluded.notas,
    orden = excluded.orden,
    activa = true,
    es_resultado = true,
    resultado_de = excluded.resultado_de,
    updated_at = now();

-- En K55 la brida de bocina sigue siendo un componente separado: puede salir
-- en otro movimiento, pero forma parte del retorno que da origen a la pata.
with resultados(
  clave, grupo, descripcion, unidad, fuentes, notas, orden
) as (
  values
    (
      'pata_gallo', 'Pata de gallo', 'Pata de gallo', 'conjunto',
      array['nucleo_pata', 'cachas_pata', 'brida_bocina']::text[],
      'Nucleo, cachas y brida de bocina se controlan por separado y vuelven como conjunto.', 45
    ),
    (
      'timon', 'Timon', 'Timon', 'conjunto',
      array['pala_timon', 'mecha_timon']::text[],
      'Se forma con pala y mecha de timon. La cantidad final se carga manualmente.', 75
    ),
    (
      'limera_timon', 'Limera', 'Limera de timon', 'conjunto',
      array['brida_limera', 'cano_limera']::text[],
      'Se forma con bridas y cano de limera. La cantidad final se carga manualmente.', 105
    )
)
insert into public.torneria_plantilla_items(
  plantilla_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, solicitado_por_torneria, requiere_confirmacion,
  alerta, notas, orden, activa, es_resultado, resultado_de
)
select
  p.id, r.clave, r.grupo, r.descripcion, 1, r.unidad,
  null, false, true,
  'Defini y confirma la cantidad del conjunto resultante.',
  r.notas, r.orden, true, true, r.fuentes
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
cross join resultados r
where upper(l.nombre) = 'K55'
on conflict (plantilla_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    unidad = excluded.unidad,
    proveedor_compra = null,
    solicitado_por_torneria = false,
    requiere_confirmacion = true,
    alerta = excluded.alerta,
    notas = excluded.notas,
    orden = excluded.orden,
    activa = true,
    es_resultado = true,
    resultado_de = excluded.resultado_de,
    updated_at = now();

-- Nombres operativos del segundo viaje y origen de los materiales entregados
-- directamente por proveedores.
update public.torneria_plantilla_operaciones
set nombre = case clave
      when 'pata_conjunto_t2' then 'Enviar Pata de gallo'
      when 'timon_conjunto_t2' then 'Enviar Timon'
      when 'limera_conjunto_t2' then 'Enviar Limera de timon'
      else nombre
    end,
    descripcion = case clave
      when 'pata_conjunto_t2' then 'Segundo viaje del conjunto ya armado.'
      when 'timon_conjunto_t2' then 'Segundo viaje del timon ya armado.'
      when 'limera_conjunto_t2' then 'Segundo viaje de la limera de timon ya armada.'
      else descripcion
    end,
    updated_at = now()
where clave in ('pata_conjunto_t2', 'timon_conjunto_t2', 'limera_conjunto_t2');

update public.torneria_plantilla_operaciones
set nombre = 'Bulones y lote de bronceria/bujes',
    descripcion = 'Los proveedores entregan directamente en Torneria y el conjunto vuelve al astillero.',
    origen_sugerido = 'Proveedor',
    updated_at = now()
where clave = 'manchon_t1';

update public.torneria_plantilla_items
set descripcion = 'Lote de bronceria y bujes',
    notas = 'El proveedor lo envia directamente a Torneria y luego vuelve al astillero.',
    updated_at = now()
where clave = 'bronces_torneria';

-- Palma de pata de gallo K55: Torneria y, despues de volver, Plegadora.
insert into public.torneria_plantilla_operaciones(
  plantilla_id, clave, grupo, nombre, tipo, viaje, origen_sugerido,
  destino_sugerido, descripcion, depende_de, orden, activa
)
select
  p.id, 'pata_palma_plegadora_t2', 'Pata de gallo',
  'Plegar Palma de pata de gallo', 'plegadora', 2, 'Astillero',
  'Plegadora', 'Sale a Plegadora despues de regresar de Torneria.',
  array['pata_palma_t1']::text[], 45, true
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
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

-- Los segundos viajes de la plantilla transportan el conjunto resultante, no
-- vuelven a listar todos sus materiales de origen.
delete from public.torneria_plantilla_operacion_items poi
using public.torneria_plantilla_operaciones po
where po.id = poi.operacion_id
  and po.clave in ('pata_conjunto_t2', 'timon_conjunto_t2', 'limera_conjunto_t2');

with links(op_clave, item_clave) as (
  values
    ('pata_conjunto_t2', 'pata_gallo'),
    ('timon_conjunto_t2', 'timon'),
    ('limera_conjunto_t2', 'limera_timon'),
    ('pata_palma_plegadora_t2', 'palma_pata')
)
insert into public.torneria_plantilla_operacion_items(
  operacion_id, item_id, cantidad
)
select po.id, pi.id, pi.cantidad
from public.torneria_plantilla_operaciones po
join links x on x.op_clave = po.clave
join public.torneria_plantilla_items pi
  on pi.plantilla_id = po.plantilla_id
 and pi.clave = x.item_clave
on conflict (operacion_id, item_id) do update
set cantidad = excluded.cantidad;

-- Copia los conjuntos en procesos existentes solamente cuando su segundo viaje
-- aun no tiene movimientos.
with mapa(op_clave, item_clave) as (
  values
    ('pata_conjunto_t2', 'pata_gallo'),
    ('timon_conjunto_t2', 'timon'),
    ('limera_conjunto_t2', 'limera_timon')
),
elegibles as (
  select distinct pr.id as proceso_id, pr.plantilla_id, op.id as operacion_id, m.item_clave
  from public.torneria_procesos pr
  join public.torneria_operaciones op on op.proceso_id = pr.id
  join mapa m on m.op_clave = op.clave
  where not exists (
    select 1 from public.torneria_movimientos mov where mov.operacion_id = op.id
  )
)
insert into public.torneria_items(
  proceso_id, plantilla_item_id, clave, grupo, descripcion, cantidad, unidad,
  proveedor_compra, material_id, solicitado_por_torneria, compra_estado,
  requiere_confirmacion, alerta, notas, orden, activo, es_resultado,
  resultado_de, created_by, updated_by
)
select
  e.proceso_id, pi.id, pi.clave, pi.grupo, pi.descripcion, pi.cantidad, pi.unidad,
  null, null, false, 'no_aplica',
  true, pi.alerta, pi.notas, pi.orden, true, true,
  pi.resultado_de, pr.created_by, pr.updated_by
from elegibles e
join public.torneria_procesos pr on pr.id = e.proceso_id
join public.torneria_plantilla_items pi
  on pi.plantilla_id = e.plantilla_id
 and pi.clave = e.item_clave
on conflict (proceso_id, clave) do update
set grupo = excluded.grupo,
    descripcion = excluded.descripcion,
    unidad = excluded.unidad,
    proveedor_compra = null,
    solicitado_por_torneria = false,
    compra_estado = 'no_aplica',
    es_resultado = true,
    resultado_de = excluded.resultado_de,
    activo = true,
    updated_at = now();

-- Reemplaza los componentes viejos de esos tramos sin actividad.
delete from public.torneria_operacion_items oi
using public.torneria_operaciones op
where oi.operacion_id = op.id
  and op.clave in ('pata_conjunto_t2', 'timon_conjunto_t2', 'limera_conjunto_t2')
  and not exists (
    select 1 from public.torneria_movimientos mov where mov.operacion_id = op.id
  );

with mapa(op_clave, item_clave) as (
  values
    ('pata_conjunto_t2', 'pata_gallo'),
    ('timon_conjunto_t2', 'timon'),
    ('limera_conjunto_t2', 'limera_timon')
)
insert into public.torneria_operacion_items(
  operacion_id, item_id, cantidad_requerida
)
select op.id, it.id, it.cantidad
from public.torneria_operaciones op
join mapa m on m.op_clave = op.clave
join public.torneria_items it
  on it.proceso_id = op.proceso_id
 and it.clave = m.item_clave
where not exists (
  select 1 from public.torneria_movimientos mov where mov.operacion_id = op.id
)
on conflict (operacion_id, item_id) do update
set cantidad_requerida = excluded.cantidad_requerida,
    updated_at = now();

-- Agrega el segundo viaje de Palma a los K55 ya creados.
insert into public.torneria_operaciones(
  proceso_id, plantilla_operacion_id, clave, grupo, nombre, tipo, viaje,
  origen, destino, descripcion, depende_de, orden, activa, created_by, updated_by
)
select
  pr.id, po.id, po.clave, po.grupo, po.nombre, po.tipo, po.viaje,
  po.origen_sugerido, po.destino_sugerido, po.descripcion, po.depende_de,
  po.orden, true, pr.created_by, pr.updated_by
from public.torneria_procesos pr
join public.produccion_obras obra on obra.id = pr.obra_id
join public.torneria_plantilla_operaciones po
  on po.plantilla_id = pr.plantilla_id
 and po.clave = 'pata_palma_plegadora_t2'
where upper(obra.linea_nombre) = 'K55'
on conflict (proceso_id, clave) do nothing;

insert into public.torneria_operacion_items(
  operacion_id, item_id, cantidad_requerida
)
select op.id, it.id, it.cantidad
from public.torneria_operaciones op
join public.torneria_items it
  on it.proceso_id = op.proceso_id
 and it.clave = 'palma_pata'
where op.clave = 'pata_palma_plegadora_t2'
on conflict (operacion_id, item_id) do update
set cantidad_requerida = excluded.cantidad_requerida,
    updated_at = now();

-- Metadata visible para procesos ya existentes.
update public.torneria_operaciones
set nombre = case clave
      when 'pata_conjunto_t2' then 'Enviar Pata de gallo'
      when 'timon_conjunto_t2' then 'Enviar Timon'
      when 'limera_conjunto_t2' then 'Enviar Limera de timon'
      else nombre
    end,
    descripcion = case clave
      when 'pata_conjunto_t2' then 'Segundo viaje del conjunto ya armado.'
      when 'timon_conjunto_t2' then 'Segundo viaje del timon ya armado.'
      when 'limera_conjunto_t2' then 'Segundo viaje de la limera de timon ya armada.'
      else descripcion
    end,
    updated_at = now()
where clave in ('pata_conjunto_t2', 'timon_conjunto_t2', 'limera_conjunto_t2');

update public.torneria_operaciones
set nombre = 'Bulones y lote de bronceria/bujes',
    descripcion = 'Los proveedores entregan directamente en Torneria y el conjunto vuelve al astillero.',
    origen = 'Proveedor',
    updated_at = now()
where clave = 'manchon_t1';

update public.torneria_items
set descripcion = 'Lote de bronceria y bujes',
    notas = 'El proveedor lo envia directamente a Torneria y luego vuelve al astillero.',
    updated_at = now()
where clave = 'bronces_torneria';

-- En K55 nucleo y brida permanecen como componentes independientes dentro de
-- la operacion: se pueden registrar en salidas separadas y recibir juntos.
update public.torneria_plantilla_operaciones po
set nombre = 'Nucleos y bridas de bocina por separado',
    descripcion = 'Registrar cada salida por separado; pueden volver juntos desde Torneria.',
    updated_at = now()
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where po.plantilla_id = p.id
  and po.clave = 'pata_nucleo_bocina_t1'
  and upper(l.nombre) = 'K55';

update public.torneria_operaciones op
set nombre = 'Nucleos y bridas de bocina por separado',
    descripcion = 'Registrar cada salida por separado; pueden volver juntos desde Torneria.',
    updated_at = now()
from public.torneria_procesos pr
join public.produccion_obras obra on obra.id = pr.obra_id
where op.proceso_id = pr.id
  and op.clave = 'pata_nucleo_bocina_t1'
  and upper(obra.linea_nombre) = 'K55';

do $$
declare
  v_operacion uuid;
begin
  for v_operacion in
    select id
    from public.torneria_operaciones
    where clave in (
      'pata_conjunto_t2',
      'timon_conjunto_t2',
      'limera_conjunto_t2',
      'pata_palma_plegadora_t2'
    )
  loop
    perform public.torneria_recalcular_operacion(v_operacion);
  end loop;
end $$;

