export function puedeGestionarAltas(profile) {
  if (!profile || profile.role === "panol") return false;
  return Boolean(profile.is_admin) || ["admin", "rrhh", "administracion", "tecnica"].includes(profile.role);
}

export function empleadosDeVista(empleados = [], vista = "activos") {
  return empleados.filter((e) => vista === "provisorios"
    ? e.provisorio === true
    : vista === "externos" ? e.externo === true && e.activo !== false
    : e.provisorio !== true && (vista === "ex" ? e.activo === false : e.activo !== false && e.externo !== true));
}
