begin;
set local lock_timeout = '4s';
set local statement_timeout = '45s';
select set_config('request.jwt.claims',
  '{"sub":"b93b4fda-590a-41b7-8382-317aa74917e1","role":"authenticated"}', true);
create temp table t_regularizar(
  obra text, obra_id uuid, item_id uuid, descripcion text, operacion_id uuid, componente_id uuid primary key,
  material_id uuid, compra_item uuid, compra_id uuid, modo text, cantidad numeric,
  cantidad_viaje numeric, snapshot_planificado uuid, aviso_pendiente uuid, snapshot_fisico uuid,
  aviso_recibido uuid
) on commit drop;
