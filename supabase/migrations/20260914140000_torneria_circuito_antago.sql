-- La plantilla de Torneria de la linea Antago se creo con sus 15 materiales y
-- sin un solo paso del circuito: la copia de operaciones nunca corrio. La obra
-- ANTAGO-A-30 (creada el 25/08/2026) heredo ese vacio: 15 materiales pedidos a
-- Compras y 0 viajes. Sin viajes no hay nada que enviar ni recibir, y hasta el
-- arreglo de TorneriaScreen la pantalla lo mostraba como circuito terminado
-- porque "todos los tramos cerrados" es trivialmente cierto cuando no hay
-- ninguno.
--
-- Los 15 materiales de Antago son identicos —clave por clave, cantidad por
-- cantidad, proveedor por proveedor— a los de K37/K42/K43/K52/K64, que comparten
-- el mismo circuito de 14 pasos. Eso es lo que se carga aca.
--
-- La migracion es aditiva e idempotente: no toca pasos, movimientos ni
-- cantidades que ya existan, y solo completa obras que hoy no tienen ningun
-- viaje cargado.

do $$
declare
  v_plantilla uuid;
begin
  select p.id
    into v_plantilla
    from public.torneria_plantillas p
    join public.lineas_produccion l on l.id = p.linea_id
   where lower(trim(l.nombre)) = 'antago'
   limit 1;

  if v_plantilla is null then
    raise notice 'Sin plantilla de Torneria para la linea Antago: nada que hacer.';
    return;
  end if;

  -- 1) Los 14 pasos del circuito estandar.
  insert into public.torneria_plantilla_operaciones(
    plantilla_id, clave, grupo, nombre, tipo, viaje, destino_sugerido, descripcion, depende_de, orden
  )
  values
    (v_plantilla, 'pata_nucleo_t1',        'Pata de gallo', 'Mecanizar nucleos',                 'torneria',  1, 'Torneria',  'Primera salida de los nucleos.',                                                      '{}',                                     10),
    (v_plantilla, 'pata_cachas_plegadora', 'Pata de gallo', 'Plegar cachas',                     'plegadora', 1, 'Plegadora', 'Las cachas salen y vuelven al astillero.',                                            '{}',                                     20),
    (v_plantilla, 'pata_conjunto_t2',      'Pata de gallo', 'Enviar Pata de gallo',              'torneria',  2, 'Torneria',  'Segundo viaje del conjunto ya armado.',                                               '{pata_nucleo_t1,pata_cachas_plegadora}', 30),
    (v_plantilla, 'pata_palma_t1',         'Pata de gallo', 'Mecanizar palmas',                  'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                     40),
    (v_plantilla, 'pata_eje_t1',           'Pata de gallo', 'Mecanizar ejes',                    'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                     50),
    (v_plantilla, 'timon_pala_t1',         'Timon',         'Mecanizar palas',                   'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                     60),
    (v_plantilla, 'timon_mecha_t1',        'Timon',         'Mecanizar mechas',                  'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                     70),
    (v_plantilla, 'timon_conjunto_t2',     'Timon',         'Enviar Timon',                      'torneria',  2, 'Torneria',  'Segundo viaje del timon ya armado.',                                                  '{timon_pala_t1,timon_mecha_t1}',         80),
    (v_plantilla, 'limera_brida_t1',       'Limera',        'Mecanizar bridas',                  'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                     90),
    (v_plantilla, 'limera_cano_t1',        'Limera',        'Mecanizar cano',                    'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                    100),
    (v_plantilla, 'limera_conjunto_t2',    'Limera',        'Enviar Limera de timon',            'torneria',  2, 'Torneria',  'Segundo viaje de la limera de timon ya armada.',                                      '{limera_brida_t1,limera_cano_t1}',      110),
    (v_plantilla, 'escape_t1',             'Escape',        'Mecanizar bridas de escape',        'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                    120),
    (v_plantilla, 'bocina_t1',             'Bocina',        'Mecanizar tubos de bocina',         'torneria',  1, 'Torneria',  null,                                                                                  '{}',                                    130),
    (v_plantilla, 'manchon_t1',            'Manchon',       'Bulones y lote de bronceria/bujes', 'torneria',  1, 'Torneria',  'Los proveedores entregan directamente en Torneria y el conjunto vuelve al astillero.', '{}',                                    140)
  on conflict (plantilla_id, clave) do nothing;

  -- 2) Que pieza viaja en cada paso.
  insert into public.torneria_plantilla_operacion_items(operacion_id, item_id, cantidad)
  select op.id, it.id, v.cantidad
    from (values
      ('pata_nucleo_t1',        'nucleo_pata',      2::numeric),
      ('pata_cachas_plegadora', 'cachas_pata',      4),
      ('pata_conjunto_t2',      'pata_gallo',       1),
      ('pata_palma_t1',         'palma_pata',       2),
      ('pata_eje_t1',           'eje',              2),
      ('timon_pala_t1',         'pala_timon',       2),
      ('timon_mecha_t1',        'mecha_timon',      2),
      ('timon_conjunto_t2',     'timon',            1),
      ('limera_brida_t1',       'brida_limera',     2),
      ('limera_cano_t1',        'cano_limera',      1),
      ('limera_conjunto_t2',    'limera_timon',     1),
      ('escape_t1',             'brida_escape',     2),
      ('bocina_t1',             'tubo_bocina',      2),
      ('manchon_t1',            'bulones_manchon',  1),
      ('manchon_t1',            'bronces_torneria', 1)
    ) as v(op_clave, item_clave, cantidad)
    join public.torneria_plantilla_operaciones op
      on op.plantilla_id = v_plantilla and op.clave = v.op_clave
    join public.torneria_plantilla_items it
      on it.plantilla_id = v_plantilla and it.clave = v.item_clave
  on conflict (operacion_id, item_id) do nothing;

  -- 3) Las obras de la linea que ya existen y quedaron sin circuito. El destino
  --    se calcula igual que en torneria_crear_proceso para que una obra
  --    rellenada aca sea indistinguible de una creada hoy.
  insert into public.torneria_operaciones(
    proceso_id, plantilla_operacion_id, clave, grupo, nombre, tipo, viaje,
    destino, descripcion, depende_de, orden
  )
  select
    pr.id, po.id, po.clave, po.grupo, po.nombre, po.tipo, po.viaje,
    case
      when po.tipo = 'torneria' then 'Torneria'
      when po.tipo = 'plegadora' then 'Plegadora'
      else po.destino_sugerido
    end,
    po.descripcion, po.depende_de, po.orden
    from public.torneria_procesos pr
    join public.torneria_plantilla_operaciones po
      on po.plantilla_id = v_plantilla and po.activa
   where pr.plantilla_id = v_plantilla
     and not exists (
       select 1 from public.torneria_operaciones o where o.proceso_id = pr.id
     )
  on conflict (proceso_id, clave) do nothing;

  -- 4) Y las piezas de cada paso recien creado. Se emparejan por clave porque
  --    los items de la obra son copias de los de la plantilla.
  insert into public.torneria_operacion_items(operacion_id, item_id, cantidad_requerida)
  select o.id, it.id, poi.cantidad
    from public.torneria_operaciones o
    join public.torneria_procesos pr on pr.id = o.proceso_id
    join public.torneria_plantilla_operacion_items poi on poi.operacion_id = o.plantilla_operacion_id
    join public.torneria_plantilla_items pit on pit.id = poi.item_id
    join public.torneria_items it on it.proceso_id = o.proceso_id and it.clave = pit.clave
   where pr.plantilla_id = v_plantilla
  on conflict (operacion_id, item_id) do nothing;
end $$;
