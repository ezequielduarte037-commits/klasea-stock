// Helpers compartidos de ubicación física del pañol (mapa + picker + chips).

export const ZONA_COLORS = {
  A: "#3b82f6", B: "#8b5cf6", C: "#06b6d4", D: "#10b981", E: "#f59e0b",
  F: "#ec4899", G: "#84cc16", H: "#f97316", I: "#14b8a6", J: "#6366f1",
  K: "#a855f7", P: "#ef4444", V: "#eab308",
};

export function zonaColor(codigo) {
  return ZONA_COLORS[String(codigo || "").charAt(0).toUpperCase()] || "#64748b";
}

// "G2-3" → { cod: "G2", nivel: 3 } · "AFUERA" → { afuera: true }
export function parseUbicacion(u) {
  const raw = String(u || "").toUpperCase().trim();
  if (!raw) return { cod: "", nivel: null, afuera: false };
  if (raw === "AFUERA") return { cod: "AFUERA", nivel: null, afuera: true };
  const [cod, niv] = raw.split(/[-·\s]+/);
  const nivel = Number(niv);
  return { cod: cod || "", nivel: Number.isFinite(nivel) && nivel > 0 ? nivel : null, afuera: false };
}
