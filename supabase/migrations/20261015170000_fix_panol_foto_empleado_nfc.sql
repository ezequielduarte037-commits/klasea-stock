-- La RPC panol_asignar_tarjeta_nfc registra 'foto_actualizada' cuando se
-- conserva la tarjeta y se cambia la foto. El CHECK original no contemplaba
-- esa acción: el historial fallaba con 23514 y revertía también la foto.
-- Se conservan las acciones anteriores y los permisos existentes.
begin;

alter table public.rrhh_empleados_nfc_historial
  drop constraint if exists rrhh_empleados_nfc_historial_accion_check;

alter table public.rrhh_empleados_nfc_historial
  add constraint rrhh_empleados_nfc_historial_accion_check
  check (accion in (
    'asignacion', 'reemplazo', 'actualizacion', 'desvinculacion', 'foto_actualizada'
  ));

commit;
