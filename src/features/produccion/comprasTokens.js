import { C } from "@/theme";

// ─────────────────────────────────────────────────────────────────────────────
// Tokens y helpers de estilo de Compras por Etapa. Van aparte de comprasUI.jsx
// porque ese archivo exporta sólo componentes (si no, se rompe el fast refresh
// de Vite y lo marca el lint).
// ─────────────────────────────────────────────────────────────────────────────

export const GRAD_VIOLET = "linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#3b82f6 100%)";
export const GRAD_BLUE = "linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)";
export const GLOW_VIOLET = "0 8px 22px -8px rgba(124,92,246,.55)";
export const GLOW_BLUE = "0 6px 16px -6px rgba(37,99,235,.5)";

export const INPUT = {
  width: "100%", boxSizing: "border-box", background: C.panelSolid,
  border: `1px solid ${C.border}`, color: C.text, borderRadius: 10,
  padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none",
};

export const LBL = {
  fontSize: 10, color: C.dim, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase",
};

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Convierte un hex en rgba con la opacidad dada (0-100). Se usa para teñir
// fondos y bordes con el color de cada etapa sin definir una variable por color.
export const tint = (hex, a) => {
  const h = String(hex || "#64748b").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a / 100})`;
};
