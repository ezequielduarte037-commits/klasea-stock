select 'huerfano' as tipo, e.sede, i.estado, e.titulo, i.id, i.material_id,
  i.cantidad, i.cantidad_recibida, i.marcado_at
from public.panol_envio_items i
join public.panol_envios e on e.id=i.envio_id
where i.estado in ('recibido','parcial') and i.obra_snapshot_item_id is null
  and e.obra_id is null and i.purchase_request_item_id is null
  and i.marcado_at >= '2026-11-17 00:00:00-03'
  and not exists (select 1 from public.panol_obra_materiales_snapshot s where s.panol_envio_item_id=i.id)
order by i.marcado_at;
