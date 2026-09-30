// Formatos de fecha y semana del módulo Obras.
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export const MS_DIA = 86_400_000;

export function fCorta(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fMedia(d) {
  if (!d) return "—";
  return `${fCorta(d)}/${String(d.getFullYear()).slice(2)}`;
}

export function fMes(d, conAnio = true) {
  if (!d) return "—";
  return conAnio ? `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MESES[d.getMonth()];
}

export function fLarga(d) {
  if (!d) return "—";
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

export const nombreMes = (i) => MESES[i];

export function semanaRel(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return "Sin ubicar";
  if (n === 0) return "S0";
  return `S${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

export function iniciales(nombre) {
  return String(nombre || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}
