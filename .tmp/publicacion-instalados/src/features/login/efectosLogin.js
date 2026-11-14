// Lo propio del login que no es interfaz: cuándo corresponde la intro de marca.
// El dibujo del oleaje vive en lib/oleaje.js.

import { arrancaEnModoColector } from "@/lib/modoColector";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";

/**
 * Si al entrar corresponde la intro "Klase A · Marcando tendencia".
 *
 * No en el colector del pañol: es un Android viejo, se usa con guantes y se
 * entra varias veces por turno. El cliente sí la ve: su manual ya no abre el
 * recorrido 3D solo, así que la intro de marca es su bienvenida.
 */
export function debeMostrarIntro(perfil) {
  if (!perfil || leerMovimientoReducido()) return false;
  if (arrancaEnModoColector(perfil.role)) return false;
  try {
    if (perfil.role === "panol" && window.localStorage.getItem("klasea.panol.modo-liviano") === "true") return false;
  } catch { /* storage bloqueado: se decide con lo demás */ }
  return true;
}
