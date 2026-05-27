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
