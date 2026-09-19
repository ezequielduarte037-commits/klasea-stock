-- Restablece sólo los requisitos de piso sin compras ni movimientos que hayan
-- heredado un producto fijo por error. No toca entregas, stock ni historial.

update public.panol_obra_materiales_snapshot snapshot
   set material_id = requisito.id,
       producto_asignado_at = null,
       producto_asignado_por = null,
       producto_asignacion_origen = null,
       especificaciones = '{}'::jsonb,
       especificaciones_origen = null,
       updated_at = now()
  from public.panol_materiales requisito
 where requisito.id = snapshot.requisito_material_id
   and requisito.producto_por_obra is true
   and snapshot.material_id is distinct from requisito.id
   and snapshot.purchase_request_id is null
   and snapshot.panol_envio_id is null
   and snapshot.panol_envio_item_id is null
   and coalesce(snapshot.estado, 'pendiente') = 'pendiente'
   and coalesce(snapshot.recepcion_estado, 'pendiente') = 'pendiente';
