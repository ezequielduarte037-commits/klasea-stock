// Lo propio del login que no es interfaz: cuándo corresponde la intro de marca.
// El dibujo del oleaje vive en lib/oleaje.js.

import { arrancaEnModoColector } from "@/lib/modoColector";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { hasCompletedOnboarding } from "@/features/cliente/onboardingStorage";

/**
 * Si al entrar corresponde la intro "Klase A · Marcando tendencia".
 *
 * No en el colector del pañol: es un Android viejo, se usa con guantes y se
 * entra varias veces por turno. Tampoco para el cliente que todavía no vio su
 * onboarding, que ya arranca con una experiencia de pantalla completa.
 */
export function debeMostrarIntro(perfil) {
  if (!perfil || leerMovimientoReducido()) return false;
  if (arrancaEnModoColector(perfil.role)) return false;
  try {
    if (perfil.role === "panol" && window.localStorage.getItem("klasea.panol.modo-liviano") === "true") return false;
  } catch { /* storage bloqueado: se decide con lo demás */ }
  if (perfil.role === "cliente" && !hasCompletedOnboarding(perfil.id)) return false;
  return true;
}
