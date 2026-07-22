// Helpers de permisos centralizados.
// Mantener acá toda la lógica de "qué rol puede hacer qué" para no andar
// repitiendo (y eventualmente olvidando) condiciones por cada pantalla.

/**
 * Acceso amplio tipo administrador: poder editar/borrar/aprobar
 * en la mayoría de las pantallas del sistema.
 *
 * Incluye:
 *   - is_admin = true (flag explícito en profiles)
 *   - role = 'admin'
 *   - role = 'tecnica' (oficina técnica → opera todo el astillero)
 *
 * NO incluye 'compras', 'oficina', etc. — esos son roles operativos
 * normales para el resto del sistema.
 *
 * Nota: para la pantalla de Configuración (gestión de usuarios) seguimos
 * usando un check más estricto (admin real), ver ConfiguracionScreen.
 *
 * Nota 2: para la pantalla de Compras hay un check propio (`isPurchaseManager`)
 * en purchaseRequestsApi.js — tecnica NO es manager ahí, es solicitante.
 */
export function hasAdminAccess(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  const role = profile.role;
  return role === "admin" || role === "tecnica";
}

/**
 * Rol 'administracion': personal administrativo del astillero.
 *
 * NO confundir con 'admin' (que es acceso total al sistema). Administración
 * tiene un alcance chico y explícito:
 *   - RRHH: ver y editar (legajos, presentismo, extras)
 *   - Precios: cargar remitos y actualizar precios, con historial
 *
 * No entra a producción (obras, laminación, pañol, compras, etc.).
 */
export function isAdministracion(profile) {
  return profile?.role === "administracion";
}

/** Quién puede ver/editar el módulo RRHH. */
export function canAccessRrhh(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return ["admin", "rrhh", "tecnica", "administracion"].includes(profile.role);
}

/** Quién puede entrar a la pantalla de Precios (carga de remitos y actualización). */
export function canAccessPrecios(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return ["admin", "tecnica", "compras", "administracion"].includes(profile.role);
}
