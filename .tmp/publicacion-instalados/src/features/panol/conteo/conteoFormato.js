/* Formatos y colores que comparten "Conteo de hoy" y el historial. */

export const TONOS = {
  cyan: ["var(--cyan)", "var(--cyan-soft)", "var(--cyan-border)"],
  green: ["var(--green)", "var(--green-soft)", "var(--green-border)"],
  blue: ["var(--blue)", "var(--blue-soft)", "var(--blue-border)"],
  violet: ["var(--violet)", "var(--violet-soft)", "var(--violet-border)"],
  red: ["var(--red)", "var(--red-soft)", "var(--red-border)"],
  dim: ["var(--dim)", "var(--panel-2)", "var(--border)"],
};

export function fechaLarga(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long" });
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function fechaCorta(iso) {
  return String(iso || "").split("-").reverse().slice(0, 2).join("/");
}

export function diaCorto(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function hora(at) {
  if (!at) return "";
  return new Date(at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "tomas.viyagra" → "Tomas Viyagra". */
export function nombreLindo(nombres, uid) {
  const crudo = uid ? nombres?.get?.(uid) : "";
  if (!crudo) return uid ? "Alguien" : "—";
  return crudo
    .split(/[._\s]+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

export function primerNombre(nombres, uid) {
  return nombreLindo(nombres, uid).split(" ")[0];
}
