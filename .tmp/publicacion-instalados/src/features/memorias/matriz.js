// Qué de la memoria ya resuelve la matriz de la línea. Lógica pura.
//
// Si la matriz trae un equipo como estándar (sin condición ni variante), todos
// los barcos de esa línea lo llevan: no hay nada que preguntarle al cliente.
// Se calcula de la matriz cada vez (no está escrito a mano), así que si la
// matriz cambia, la memoria se acomoda sola.
import { sinTildes } from "./acabados";

// Cómo reconocer cada cosa en el nombre del material (palabras enteras).
export const EN_MATRIZ = {
  starlink: { incluye: ["starlink"] },
  radar: { incluye: ["radar"], excluye: ["arco radar", "cableado"] },
  plotter: { incluye: ["plotter", "gpsmap", "chartplotter"] },
  faro: { incluye: ["faro"] },
  pluma: { incluye: ["pluma", "davit"] },
  mesa_fly: { incluye: ["mesa fly", "mesa del fly"] },
  fabricadora_hielo: { incluye: ["fabricadora de hielo", "maquina de hielo", "icemaker"] },
  aire_acondicionado: { incluye: ["aire acondicionado"], excluye: ["bomba"] },
  calefactor: { incluye: ["calefactor"], excluye: ["rejilla", "ducto", "adapt"] },
  bow_thruster: { incluye: ["bowthruster", "bow thruster"], excluye: ["tubo", "tunel", "cable", "panel"] },
  sternthruster: { incluye: ["sternthruster", "stern thruster"], excluye: ["tubo", "tunel", "adaptador"] },
  flaps: { incluye: ["sistema flap", "sistema de flaps", "flaps"], excluye: ["control", "chapa", "chapon", "repuesto"] },
  grupo_electrogeno: { incluye: ["grupo electrogeno", "generador"] },
  // Partes de la electrónica (no son campos propios de la memoria).
  vhf: { incluye: ["vhf"], excluye: ["antena"] },
  piloto: { incluye: ["piloto automatico"] },
  ais: { incluye: ["ais"] },
};

const palabra = (texto, frag) => new RegExp(`(^|[^a-z0-9])${frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(texto);

function coincide(regla, descripcion) {
  const n = sinTildes(descripcion);
  if (regla.excluye?.some((f) => palabra(n, f))) return false;
  return regla.incluye.some((f) => palabra(n, f));
}

// filas: [{ descripcion, materialId, condicional }] de un modelo. Devuelve
// Map(clave → { descripcion, materialId }) con lo que viene de serie.
export function deSerieDe(filas) {
  const out = new Map();
  for (const [clave, regla] of Object.entries(EN_MATRIZ)) {
    const hit = filas.find((f) => !f.condicional && coincide(regla, f.descripcion));
    if (hit) out.set(clave, { descripcion: hit.descripcion.trim(), materialId: hit.materialId || null });
  }
  return out;
}

// Opciones de la línea que corresponden a una parte de la electrónica.
export function claveDeOpcion(nombre) {
  for (const [clave, regla] of Object.entries(EN_MATRIZ)) if (coincide(regla, nombre)) return clave;
  return null;
}
