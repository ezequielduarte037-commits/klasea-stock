// Formatos compartidos de Revisiones técnicas.

export const fmtNum = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 }));

export function fmtDia(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function diaSemana(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isFinite(d.getTime()) ? DIAS[d.getDay()] : "";
}

// "unidad" es lo más común en el catálogo: se pluraliza para que se lea natural.
export const unidadDe = (unidad, cantidad) => (!unidad || unidad === "unidad" ? (Number(cantidad) === 1 ? "unidad" : "unidades") : unidad);
