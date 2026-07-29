-- Garantiza el circuito especial de Palma de pata de gallo exclusivamente en
-- K55, incluso para procesos existentes cuyo linea_nombre estaba vacio o tenia
-- un formato distinto. La pertenencia a K55 se determina por la plantilla.

-- La correccion puede ejecutarse aunque la migracion general de conjuntos
-- todavia no se haya aplicado.
alter table public.torneria_plantilla_operaciones
  add column if not exists origen_sugerido text not null default 'Astillero';

alter table public.torneria_operaciones
  add column if not exists origen text not null default 'Astillero';

insert into public.torneria_plantilla_operaciones(
  plantilla_id, clave, grupo, nombre, tipo, viaje, origen_sugerido,
  destino_sugerido, descripcion, depende_de, orden, activa
)
select
  p.id,
  'pata_palma_plegadora_t2',
  'Pata de gallo',
  'Plegar Palma de pata de gallo',
  'plegadora',
  2,
  'Astillero',
  'Plegadora',
  'Segundo viaje: sale a Plegadora despues de regresar de Torneria.',
  array['pata_palma_t1']::text[],
  45,
  true
from public.torneria_plantillas p
join public.lineas_produccion l on l.id = p.linea_id
where regexp_replace(upper(l.nombre), '\s+', '', 'g') = 'K55'
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

insert into public.torneria_plantilla_operacion_items(
  operacion_id, item_id, cantidad
)
select po.id, pi.id, pi.cantidad
from public.torneria_plantilla_operaciones po
join public.torneria_plantilla_items pi
  on pi.plantilla_id = po.plantilla_id
 and pi.clave = 'palma_pata'
where po.clave = 'pata_palma_plegadora_t2'
on conflict (operacion_id, item_id) do update
set cantidad = excluded.cantidad;

-- La existencia de esta operacion en la plantilla ya identifica una plantilla
-- K55; no dependemos del texto linea_nombre guardado en la obra.
insert into public.torneria_operaciones(
  proceso_id, plantilla_operacion_id, clave, grupo, nombre, tipo, viaje,
  origen, destino, descripcion, depende_de, orden, activa, created_by, updated_by
)
select
  pr.id,
  po.id,
  po.clave,
  po.grupo,
  po.nombre,
  po.tipo,
  po.viaje,
  po.origen_sugerido,
  po.destino_sugerido,
  po.descripcion,
  po.depende_de,
  po.orden,
  true,
  pr.created_by,
  pr.updated_by
from public.torneria_procesos pr
join public.torneria_plantilla_operaciones po
  on po.plantilla_id = pr.plantilla_id
 and po.clave = 'pata_palma_plegadora_t2'
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

insert into public.torneria_operacion_items as actual(
  operacion_id, item_id, cantidad_requerida
)
select op.id, it.id, it.cantidad
from public.torneria_operaciones op
join public.torneria_items it
  on it.proceso_id = op.proceso_id
 and it.clave = 'palma_pata'
where op.clave = 'pata_palma_plegadora_t2'
on conflict (operacion_id, item_id) do update
set cantidad_requerida = case
      when actual.cantidad_enviada = 0
       and actual.cantidad_recibida = 0
        then excluded.cantidad_requerida
      else actual.cantidad_requerida
    end,
    updated_at = now();

do $$
declare
  v_operacion uuid;
begin
  for v_operacion in
    select id
    from public.torneria_operaciones
    where clave = 'pata_palma_plegadora_t2'
  loop
    perform public.torneria_recalcular_operacion(v_operacion);
  end loop;
end $$;
