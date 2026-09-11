import { C } from "@/theme";

/**
 * La paleta del módulo de Compras.
 *
 * Vive aparte de `comprasUI` porque un archivo que exporta componentes no
 * puede exportar además constantes sin romper el refresco en caliente de Vite.
 *
 * Sin ámbar: en este sistema el amarillo no se usa.
 */
/** Los tonos del módulo, con su fondo y su borde ya resueltos. */
export const TONOS = {
  neutro: { color: C.dim, bg: C.panel, border: C.border },
  info: { color: C.blue, bg: C.blueL, border: C.blueB },
  critico: { color: C.red, bg: C.redL, border: C.redB },
  ok: { color: C.green, bg: C.greenL, border: C.greenB },
  curso: { color: C.cyan, bg: C.cyanL, border: C.cyanB },
  cerrar: { color: C.teal, bg: C.tealL, border: C.tealB },
  aviso: { color: C.violet, bg: C.violetL, border: C.violetB },
  // "Atención / falta hacer / en camino" es el rol que solía ocupar el ámbar.
  // Va en cyan, que es el reemplazo que quedó definido para todo el sistema.
  atencion: { color: C.cyan, bg: C.cyanL, border: C.cyanB },
};

export function tono(nombre) {
  return TONOS[nombre] || TONOS.neutro;
}
