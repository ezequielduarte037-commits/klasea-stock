export function fmtMoney(value, moneda) {
  if (value == null || value === "") return "Sin precio";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Sin precio";
  const prefix = moneda === "USD" ? "USD " : moneda === "ARS" ? "$ " : "";
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

// Texto para un atributo `title`. El tooltip nativo del navegador no puede
// cortar palabras: si la nota es una URL larga sin espacios —pegar un link de
// Mercado Libre o Google Shopping es lo más común— arma un cartel enorme que se
// sale de la pantalla. Se recorta antes de que eso pase; el texto completo se ve
// abriendo la nota.
export function textoTooltip(value, max = 140) {
  const limpio = String(value ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1)}…`;
}

export function fmtDate(value) {
  if (!value) return "sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
