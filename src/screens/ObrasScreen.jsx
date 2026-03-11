import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import Sidebar from "./Sidebar";
import MapaProduccion from "./MapaProduccion";
import PanelDetallesObra from "./PanelDetallesObra";
import PlanificacionView from "./PlanificacionView";

import { supabase } from "../supabaseClient";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const num = (v) => parseFloat(v) || 0;
const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;
const fmtDate    = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
const fmtDateFull= d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const diasDesde  = f => !f ? 0 : Math.max(0, Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000));
const diasHasta  = f => !f ? null : Math.floor((new Date(f + "T00:00:00") - Date.now()) / 86400000);

const STORAGE_BUCKET = "obra-archivos";

async function safeQuery(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

function extIcon(nombre) {
  const ext = (nombre ?? "").split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "📄";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼";
  if (["dwg","dxf"].includes(ext)) return "DWG";
  if (["xlsx","xls","csv"].includes(ext)) return "📊";
  if (["docx","doc","txt"].includes(ext)) return "📝";
  if (["zip","rar","7z"].includes(ext)) return "ZIP";
  return "FILE";
}

function fmtBytes(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function ocUrgencia(oc) {
  if (!oc.fecha_limite_pedido) return null;
  const d = diasHasta(oc.fecha_limite_pedido);
  if (d === null) return null;
  if (d < 0)   return { nivel: "vencida",  color: "#ef4444", label: `Vencida hace ${Math.abs(d)}d`, dias: d };
  if (d === 0) return { nivel: "hoy",      color: "#ef4444", label: "Vence hoy",                    dias: d };
  if (d <= 3)  return { nivel: "urgente",  color: "#ef4444", label: `Vence en ${d}d`,               dias: d };
  if (d <= 7)  return { nivel: "proxima",  color: "#f59e0b", label: `Vence en ${d}d`,               dias: d };
  return         { nivel: "ok",       color: "#10b981", label: `Vence en ${d}d`,               dias: d };
}

// ─── PALETA ────────────────────────────────────────────────────────────────────
const C = {
  bg:    "#06070a",
  s0:    "rgba(255,255,255,0.025)",
  s1:    "rgba(255,255,255,0.05)",
  s2:    "rgba(255,255,255,0.08)",
  b0:    "rgba(255,255,255,0.07)",
  b1:    "rgba(255,255,255,0.13)",
  b2:    "rgba(255,255,255,0.22)",
  t0:    "#e8eaf0",
  t1:    "#8b9ab5",
  t2:    "#4e5a70",
  mono:  "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
  sans:  "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  purple:  "#8b5cf6",
  neon: {
    blue:   "rgba(59,130,246,0.6)",
    green:  "rgba(16,185,129,0.6)",
    amber:  "rgba(245,158,11,0.6)",
    red:    "rgba(239,68,68,0.6)",
    purple: "rgba(139,92,246,0.6)",
  },
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.22)",  label: "Activa",    glow: "0 0 12px rgba(59,130,246,0.35)"  },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)",  label: "Pausada",   glow: "0 0 12px rgba(245,158,11,0.35)"  },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)",  label: "Terminada", glow: "0 0 12px rgba(16,185,129,0.35)"  },
    cancelada: { dot: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)",   label: "Cancelada", glow: "0 0 12px rgba(239,68,68,0.35)"   },
  },
  etapa: {
    pendiente:  { dot: "#3d4a5c", bar: "rgba(255,255,255,0.03)", text: "#4e5a70", label: "Pendiente"  },
    en_curso:   { dot: "#3b82f6", bar: "rgba(59,130,246,0.12)",  text: "#60a5fa", label: "En curso"   },
    completado: { dot: "#10b981", bar: "rgba(16,185,129,0.12)",  text: "#34d399", label: "Completado" },
    bloqueado:  { dot: "#ef4444", bar: "rgba(239,68,68,0.12)",   text: "#f87171", label: "Bloqueado"  },
  },
  tarea: {
    pendiente:   { dot: "#3d4a5c", text: "#4e5a70", label: "Pendiente"    },
    en_progreso: { dot: "#3b82f6", text: "#60a5fa", label: "En progreso"  },
    finalizada:  { dot: "#10b981", text: "#34d399", label: "Finalizada"   },
    bloqueada:   { dot: "#ef4444", text: "#f87171", label: "Bloqueada"    },
    cancelada:   { dot: "#3d4a5c", text: "#4e5a70", label: "Cancelada"    },
  },
  prioridad: {
    baja:    { color: "#3d4a5c", label: "Baja"    },
    media:   { color: "#3b82f6", label: "Media"   },
    alta:    { color: "#f59e0b", label: "Alta"    },
    critica: { color: "#ef4444", label: "Crítica" },
  },
  oc: {
    pendiente:  { dot: "#3d4a5c", bg: "rgba(61,74,92,0.14)",    border: "rgba(61,74,92,0.28)",    label: "Pendiente"  },
    solicitada: { dot: "#3b82f6", bg: "rgba(59,130,246,0.09)",  border: "rgba(59,130,246,0.22)",  label: "Solicitada" },
    aprobada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.22)",  label: "Aprobada"   },
    en_camino:  { dot: "#8b5cf6", bg: "rgba(139,92,246,0.09)",  border: "rgba(139,92,246,0.22)",  label: "En camino"  },
    recibida:   { dot: "#10b981", bg: "rgba(16,185,129,0.09)",  border: "rgba(16,185,129,0.22)",  label: "Recibida"   },
    cancelada:  { dot: "#ef4444", bg: "rgba(239,68,68,0.09)",   border: "rgba(239,68,68,0.22)",   label: "Cancelada"  },
  },
};

// ─── GLASS ────────────────────────────────────────────────────────────────────
const GLASS = {
  backdropFilter: "blur(28px) saturate(160%) brightness(1.04)",
  WebkitBackdropFilter: "blur(28px) saturate(160%) brightness(1.04)",
};

const GLASS_CARD = {
  backdropFilter: "blur(20px) saturate(140%)",
  WebkitBackdropFilter: "blur(20px) saturate(140%)",
};

const COLOR_PRESETS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#64748b","#0ea5e9","#f43f5e"];

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
// FIX: @import removido — agregá en index.html:
// <link rel="preconnect" href="https://fonts.googleapis.com">
// <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
export const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  select option { background: #0a0c12; color: #8b9ab5; }

  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.18); border-radius: 99px; transition: background .2s; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(59,130,246,0.38); }

  input:focus, select:focus, textarea:focus {
    border-color: rgba(59,130,246,0.45) !important;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.10), 0 0 14px rgba(59,130,246,0.10) !important;
    outline: none;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(16px) scale(0.985); }
    to   { opacity: 1; transform: translateY(0)    scale(1);     }
  }
  @keyframes slideLeft {
    from { opacity: 0; transform: translateX(12px); }
    to   { opacity: 1; transform: translateX(0);    }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes gPulse {
    0%, 100% { opacity: 1;   }
    50%       { opacity: 0.5; }
  }
  @keyframes neonFlicker {
    0%, 100% { opacity: 1;    }
    92%       { opacity: 1;    }
    93%       { opacity: 0.7;  }
    94%       { opacity: 1;    }
    96%       { opacity: 0.82; }
    97%       { opacity: 1;    }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes progressShimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes dotPing {
    0%        { transform: scale(1);   opacity: 1;  }
    70%, 100% { transform: scale(2.2); opacity: 0;  }
  }
  @keyframes borderGlow {
    0%, 100% { border-color: rgba(59,130,246,0.25); box-shadow: 0 0 8px  rgba(59,130,246,0.15); }
    50%       { border-color: rgba(59,130,246,0.55); box-shadow: 0 0 18px rgba(59,130,246,0.30); }
  }
  @keyframes gridFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  button:not([disabled]):hover { opacity: 0.82; transition: opacity .15s; }
  button { transition: opacity .15s, box-shadow .2s, border-color .2s; }

  .bg-technical {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 72% 42% at 50% -8%,  rgba(59,130,246,0.09)  0%, transparent 68%),
      radial-gradient(ellipse 40% 30% at 94% 90%,  rgba(245,158,11,0.03)  0%, transparent 55%),
      radial-gradient(ellipse 30% 25% at 4%  80%,  rgba(139,92,246,0.03)  0%, transparent 50%);
  }
  .bg-technical::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(59,130,246,0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59,130,246,0.035) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse 100% 100% at 50% 0%, black 30%, transparent 80%);
    animation: gridFade 1.2s ease forwards;
  }
  .bg-technical::after {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(59,130,246,0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59,130,246,0.018) 1px, transparent 1px);
    background-size: 8px 8px;
    mask-image: radial-gradient(ellipse 60% 40% at 50% 0%, black 0%, transparent 70%);
  }
`;

// ─── INPUT BASE ───────────────────────────────────────────────────────────────
const INP = {
  background: "rgba(255,255,255,0.033)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "#e8eaf0",
  padding: "8px 12px",
  borderRadius: 7,
  fontSize: 12,
  outline: "none",
  width: "100%",
  fontFamily: "'JetBrains Mono', monospace",
  transition: "border-color .2s, box-shadow .2s",
  letterSpacing: "0.02em",
};

// ─── DOT ─────────────────────────────────────────────────────────────────────
const Dot = ({ color, size = 7, glow = false, ping = false }) => (
  <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color,
      boxShadow: glow ? `0 0 6px ${color}, 0 0 14px ${color}60` : "none",
      position: "relative", zIndex: 1,
    }} />
    {ping && (
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color, opacity: 0.5,
        animation: "dotPing 1.6s cubic-bezier(0,0,0.2,1) infinite",
      }} />
    )}
  </div>
);

// ─── CHIP ─────────────────────────────────────────────────────────────────────
const Chip = ({ label, dot, bg, border }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase",
    padding: "3px 9px", borderRadius: 4,
    background: bg, color: dot, border: `1px solid ${border}`,
    fontWeight: 600, whiteSpace: "nowrap",
    fontFamily: "'JetBrains Mono', monospace",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05)`,
  }}>
    <div style={{ width: 4, height: 4, borderRadius: "50%", background: dot, flexShrink: 0, boxShadow: `0 0 5px ${dot}` }} />
    {label}
  </span>
);

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
const ProgressBar = ({ value, color, height = 3, animated = false }) => {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden", position: "relative" }}>
      <div style={{
        height: "100%", width: `${clamped}%`, borderRadius: 99,
        transition: "width .6s cubic-bezier(.4,0,.2,1)", position: "relative",
        background: animated && clamped > 0
          ? `linear-gradient(90deg, ${color}50, ${color}, ${color}50)`
          : `linear-gradient(90deg, ${color}60, ${color}dd)`,
        backgroundSize: animated ? "200% 100%" : "100% 100%",
        animation: animated && clamped > 0 ? "progressShimmer 2.5s linear infinite" : "none",
        boxShadow: clamped > 0 ? `0 0 8px ${color}55` : "none",
      }} />
      {clamped > 0 && height >= 3 && (
        <div style={{
          position: "absolute", top: 0, left: 0,
          height: 1, width: `${clamped}%`,
          background: `linear-gradient(90deg, transparent, ${color}90)`,
          borderRadius: 99,
        }} />
      )}
    </div>
  );
};

// ─── BTN ─────────────────────────────────────────────────────────────────────
function Btn({ onClick, type = "button", children, variant = "ghost", disabled = false, sx = {}, style = {}, ...rest }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 11 },
    outline: { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", backdropFilter: "blur(8px)", color: C.t0, padding: "6px 14px", borderRadius: 7, fontSize: 12, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" },
    primary: { border: "1px solid rgba(59,130,246,0.40)", background: "rgba(59,130,246,0.14)", backdropFilter: "blur(12px)", color: "#93c5fd", padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 0 16px rgba(59,130,246,0.18), inset 0 1px 0 rgba(255,255,255,0.08)" },
    danger:  { border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.07)", color: "#fca5a5", padding: "6px 14px", borderRadius: 7, fontSize: 12, boxShadow: "0 0 12px rgba(239,68,68,0.10)" },
    sm:      { border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, fontSize: 10 },
    confirm: { border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 0 18px rgba(239,68,68,0.18)" },
    green:   { border: "1px solid rgba(16,185,129,0.38)", background: "rgba(16,185,129,0.11)", color: "#6ee7b7", padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 0 16px rgba(16,185,129,0.15)" },
    amber:   { border: "1px solid rgba(245,158,11,0.38)", background: "rgba(245,158,11,0.09)", color: "#fcd34d", padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 0 16px rgba(245,158,11,0.14)" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} {...rest}
      style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1, fontFamily: C.sans, transition: "opacity .15s, box-shadow .2s, border-color .2s", letterSpacing: "0.01em", ...V[variant], ...style, ...sx }}>
      {children}
    </button>
  );
}

// ─── INPUT WRAPPER ────────────────────────────────────────────────────────────
function InputSt({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600, fontFamily: C.mono }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

// ─── OVERLAY ─────────────────────────────────────────────────────────────────
function Overlay({ onClose, children, maxWidth = 540, fullHeight = false }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(4,5,8,0.88)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        display: "flex", justifyContent: "center",
        alignItems: fullHeight ? "stretch" : "flex-start",
        padding: fullHeight ? 0 : "40px 16px",
        overflowY: fullHeight ? "hidden" : "auto",
        animation: "fadeIn .15s ease",
      }}
    >
      <div style={{
        background: "rgba(10,12,18,0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: fullHeight ? 0 : 14,
        width: "100%", maxWidth: fullHeight ? "100%" : maxWidth,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.75), 0 0 60px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
        animation: "slideUp .20s cubic-bezier(.16,1,.3,1)",
        fontFamily: C.sans, display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
        ...(fullHeight ? { height: "100vh" } : { maxHeight: "92vh" }),
      }}>
        <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.45), transparent)", pointerEvents: "none" }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden",
          backgroundImage: ["linear-gradient(rgba(59,130,246,0.018) 1px, transparent 1px)", "linear-gradient(90deg, rgba(59,130,246,0.018) 1px, transparent 1px)"].join(", "),
          backgroundSize: "32px 32px", opacity: 0.6,
        }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, ...(fullHeight ? {} : { overflow: "hidden" }) }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ nombre, tipo, advertencia, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel} maxWidth={400}>
      <div style={{ padding: 28, textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 18px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)", boxShadow: "0 0 24px rgba(239,68,68,0.18), inset 0 0 12px rgba(239,68,68,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, animation: "borderGlow 2.5s ease infinite" }}>⚠</div>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 8 }}>Confirmar eliminación</div>
        <div style={{ fontSize: 15, color: C.t0, fontWeight: 600, marginBottom: 8 }}>Eliminar {tipo}</div>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: "#f87171", marginBottom: 12, padding: "6px 14px", borderRadius: 6, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", display: "inline-block" }}>{nombre}</div>
        <div style={{ fontSize: 11, color: C.t1, marginBottom: 24, lineHeight: 1.7, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7 }}>{advertencia}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Btn variant="confirm" onClick={onConfirm}>Sí, eliminar</Btn>
          <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ─── ORDEN COMPRA SECTION ─────────────────────────────────────────────────────
function OrdenCompraSection({ genera, tipo, desc, monto, diasPrevio = 7, onChange }) {
  return (
    <div style={{ padding: "12px 14px", background: genera ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${genera ? "rgba(245,158,11,0.22)" : "rgba(255,255,255,0.07)"}`, borderRadius: 9, marginTop: 10, transition: "all .25s ease", boxShadow: genera ? "0 0 18px rgba(245,158,11,0.08), inset 0 1px 0 rgba(245,158,11,0.06)" : "none", position: "relative", overflow: "hidden" }}>
      {genera && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.55), transparent)", pointerEvents: "none" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: genera ? 12 : 0 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: genera ? "#fcd34d" : C.t2, fontFamily: C.mono, letterSpacing: "0.04em", transition: "color .2s" }}>OC al completar etapa</span>
          {genera && <div style={{ fontSize: 9, color: C.t2, marginTop: 2, letterSpacing: "0.1em" }}>Se generará una orden de compra automáticamente</div>}
        </div>
        <button type="button" onClick={() => onChange("genera_orden_compra", !genera)} style={{ width: 38, height: 20, borderRadius: 99, border: `1px solid ${genera ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.12)"}`, flexShrink: 0, cursor: "pointer", background: genera ? "rgba(245,158,11,0.22)" : "rgba(255,255,255,0.04)", position: "relative", transition: "all .22s ease", boxShadow: genera ? "0 0 10px rgba(245,158,11,0.25)" : "none" }}>
          <div style={{ position: "absolute", top: 3, left: genera ? 18 : 3, width: 12, height: 12, borderRadius: "50%", background: genera ? "#fbbf24" : "#2d3748", transition: "left .20s ease, background .20s ease", boxShadow: genera ? "0 0 6px rgba(251,191,36,0.7)" : "none" }} />
        </button>
      </div>
      {genera && (
        <div style={{ animation: "slideUp .18s ease" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["aviso","Aviso"],["compra","Orden de compra"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => onChange("orden_compra_tipo", v)} style={{ flex: 1, padding: "6px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: C.mono, letterSpacing: "0.06em", border: tipo === v ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.07)", background: tipo === v ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.02)", color: tipo === v ? "#fcd34d" : C.t2, boxShadow: tipo === v ? "0 0 8px rgba(245,158,11,0.12)" : "none", transition: "all .18s" }}>{l}</button>
            ))}
          </div>
          <InputSt label="Descripción / Materiales">
            <textarea style={{ ...INP, resize: "vertical", minHeight: 52 }} placeholder="Materiales, proveedor sugerido…" value={desc} onChange={e => onChange("orden_compra_descripcion", e.target.value)} />
          </InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <InputSt label="Monto estimado ($)">
              <input type="number" min="0" step="0.01" style={INP} value={monto} onChange={e => onChange("orden_compra_monto_estimado", e.target.value)} />
            </InputSt>
            <InputSt label="Días de anticipación">
              <input type="number" min="0" step="1" style={INP} placeholder="7" value={diasPrevio} onChange={e => onChange("orden_compra_dias_previo", e.target.value)} />
            </InputSt>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODAL OBRA ───────────────────────────────────────────────────────────────
function ObraModal({ lineas, lProcs, lTareas = [], onSave, onClose }) {
  const [form, setForm] = useState({ codigo: "", descripcion: "", linea_id: "", fecha_inicio: today(), fecha_fin_estimada: "", notas: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const lineaSel   = lineas.find(l => l.id === form.linea_id);
  const procsLinea = form.linea_id ? lProcs.filter(p => p.linea_id === form.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigo.trim()) { setErr("El código es obligatorio."); return; }
    setSaving(true); setErr("");
    try {
      const { data: nueva, error: errObra } = await supabase.from("produccion_obras").insert({
        codigo: form.codigo.trim().toUpperCase(), descripcion: form.descripcion.trim() || null,
        tipo: "barco", estado: "activa", linea_id: form.linea_id || null,
        linea_nombre: lineaSel?.nombre ?? null, fecha_inicio: form.fecha_inicio || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null, notas: form.notas.trim() || null,
      }).select().single();
      if (errObra) { setErr(errObra.message); setSaving(false); return; }

      await supabase.from("laminacion_obras").upsert(
        { nombre: form.codigo.trim().toUpperCase(), estado: "activa", fecha_inicio: form.fecha_inicio || null },
        { onConflict: "nombre", ignoreDuplicates: true }
      );

      if (form.linea_id && procsLinea.length && nueva?.id) {
        try {
          await supabase.from("obra_etapas").insert(procsLinea.map((p, i) => ({
            obra_id: nueva.id, linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden ?? i + 1,
            color: p.color ?? "#64748b", dias_estimados: p.dias_estimados, estado: "pendiente",
            genera_orden_compra: p.genera_orden_compra ?? false, orden_compra_tipo: p.orden_compra_tipo ?? "aviso",
            orden_compra_descripcion: p.orden_compra_descripcion ?? null,
            orden_compra_monto_estimado: p.orden_compra_monto_estimado ?? null,
            orden_compra_dias_previo: p.orden_compra_dias_previo ?? 7,
          })));
          await supabase.from("obra_timeline").insert(procsLinea.map(p => ({ obra_id: nueva.id, linea_proceso_id: p.id, estado: "pendiente" })));
          const etapasIns = await supabase.from("obra_etapas").select("id, linea_proceso_id").eq("obra_id", nueva.id);
          if (!etapasIns.error && etapasIns.data?.length) {
            const procIds = etapasIns.data.map(e => e.linea_proceso_id).filter(Boolean);
            if (procIds.length) {
              const { data: tPlantilla } = await supabase.from("linea_proceso_tareas").select("*").in("linea_proceso_id", procIds).order("orden");
              if (tPlantilla?.length) {
                const tareasAInsertar = [];
                for (const etapa of etapasIns.data) {
                  for (const tp of tPlantilla.filter(t => t.linea_proceso_id === etapa.linea_proceso_id)) {
                    tareasAInsertar.push({ obra_id: nueva.id, etapa_id: etapa.id, nombre: tp.nombre, orden: tp.orden ?? 999, estado: "pendiente", prioridad: tp.prioridad ?? "media", horas_estimadas: tp.horas_estimadas ?? null, personas_necesarias: tp.personas_necesarias ?? null, observaciones: tp.observaciones ?? null });
                  }
                }
                if (tareasAInsertar.length) await supabase.from("obra_tareas").insert(tareasAInsertar);
              }
            }
          }
        } catch { }
      }
      onSave(nueva);
    } catch (ex) { setErr(ex?.message ?? "Error inesperado."); setSaving(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <div style={{ padding: "22px 26px 26px", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 6 }}>◈ NUEVO PROYECTO</div>
            <div style={{ fontSize: 16, color: C.t0, fontWeight: 700 }}>Nueva obra</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Asigná una línea para pre-cargar las etapas</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18, padding: "4px 8px" }}>×</Btn>
        </div>
        {err && <div style={{ padding: "9px 14px", marginBottom: 16, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 11, color: "#fca5a5", fontFamily: C.mono }}>⚠ {err}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <InputSt label="Código *"><input style={{ ...INP, fontFamily: C.mono, fontSize: 14, letterSpacing: "0.1em" }} required placeholder="37-105" autoFocus value={form.codigo} onChange={e => set("codigo", e.target.value)} /></InputSt>
            <InputSt label="Línea de producción"><select style={{ ...INP, cursor: "pointer" }} value={form.linea_id} onChange={e => set("linea_id", e.target.value)}><option value="">Sin asignar</option>{lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></InputSt>
          </div>
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <InputSt label="Fecha inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          </div>
          <InputSt label="Notas"><input style={INP} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
          {procsLinea.length > 0 && (
            <div style={{ marginBottom: 18, padding: "12px 14px", background: "rgba(16,185,129,0.04)", borderRadius: 9, border: "1px solid rgba(16,185,129,0.18)", boxShadow: "0 0 16px rgba(16,185,129,0.06)" }}>
              <div style={{ fontSize: 9, color: "#34d399", marginBottom: 8, fontFamily: C.mono, letterSpacing: "0.12em" }}>✓ SE CREAN {procsLinea.length} ETAPAS DESDE {lineaSel?.nombre?.toUpperCase()}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {procsLinea.map(p => <span key={p.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.03)", color: C.t1, border: "1px solid rgba(255,255,255,0.08)", fontFamily: C.mono, display: "inline-flex", alignItems: "center", gap: 4 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: p.color ?? C.t2 }} />{p.nombre}{p.genera_orden_compra ? " ●" : ""}</span>)}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Creando…" : "Crear obra"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── MODAL ETAPA ──────────────────────────────────────────────────────────────
function EtapaModal({ etapa, obraId, onSave, onClose }) {
  const isEdit = !!etapa?.id;
  const [form, setForm] = useState({
    nombre: etapa?.nombre ?? "", descripcion: etapa?.descripcion ?? "", color: etapa?.color ?? "#64748b",
    dias_estimados: etapa?.dias_estimados ?? "", fecha_inicio: etapa?.fecha_inicio ?? "",
    fecha_fin_estimada: etapa?.fecha_fin_estimada ?? "",
    genera_orden_compra: etapa?.genera_orden_compra ?? false,
    orden_compra_tipo: etapa?.orden_compra_tipo ?? "aviso",
    orden_compra_descripcion: etapa?.orden_compra_descripcion ?? "",
    orden_compra_monto_estimado: etapa?.orden_compra_monto_estimado ?? "",
    orden_compra_dias_previo: etapa?.orden_compra_dias_previo ?? 7,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, color: form.color,
      dias_estimados: form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      fecha_inicio: form.fecha_inicio || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
      genera_orden_compra: form.genera_orden_compra,
      orden_compra_tipo: form.genera_orden_compra ? form.orden_compra_tipo : null,
      orden_compra_descripcion: form.genera_orden_compra ? (form.orden_compra_descripcion.trim() || null) : null,
      orden_compra_monto_estimado: form.genera_orden_compra && form.orden_compra_monto_estimado !== "" ? num(form.orden_compra_monto_estimado) : null,
      orden_compra_dias_previo: form.genera_orden_compra ? num(form.orden_compra_dias_previo) : null,
    };
    const { error } = isEdit
      ? await supabase.from("obra_etapas").update(payload).eq("id", etapa.id)
      : await supabase.from("obra_etapas").insert({ ...payload, obra_id: obraId, orden: 999, estado: "pendiente" });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  return (
    <Overlay onClose={onClose} maxWidth={500}>
      <div style={{ padding: "22px 26px 26px", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 6 }}>{isEdit ? "◈ EDITAR ETAPA" : "◈ NUEVA ETAPA"}</div>
            <div style={{ fontSize: 16, color: C.t0, fontWeight: 700 }}>{isEdit ? "Editar etapa" : "Nueva etapa"}</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18, padding: "4px 8px" }}>×</Btn>
        </div>
        {err && <div style={{ padding: "9px 14px", marginBottom: 16, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 11, color: "#fca5a5", fontFamily: C.mono }}>⚠ {err}</div>}
        <form onSubmit={handleSubmit}>
          <InputSt label="Nombre *"><input style={INP} required autoFocus value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <InputSt label="Días estimados"><input type="number" min="0" step="0.5" style={INP} value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} /></InputSt>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <input type="color" value={form.color} onChange={e => set("color", e.target.value)} style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {COLOR_PRESETS.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 16, height: 16, borderRadius: 4, background: c, cursor: "pointer", border: form.color === c ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent", boxShadow: form.color === c ? `0 0 7px ${c}` : "none", transition: "box-shadow .15s" }} />)}
                </div>
              </div>
            </InputSt>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          </div>
          <OrdenCompraSection genera={form.genera_orden_compra} tipo={form.orden_compra_tipo} desc={form.orden_compra_descripcion} monto={form.orden_compra_monto_estimado} diasPrevio={form.orden_compra_dias_previo} onChange={set} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear etapa"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── MODAL TAREA ──────────────────────────────────────────────────────────────
function TareaModal({ tarea, etapaId, obraId, onSave, onClose }) {
  const isEdit = !!tarea?.id;
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState({
    nombre: tarea?.nombre ?? "", descripcion: tarea?.descripcion ?? "",
    estado: tarea?.estado ?? "pendiente", prioridad: tarea?.prioridad ?? "media",
    fecha_inicio: tarea?.fecha_inicio ?? "", fecha_fin_estimada: tarea?.fecha_fin_estimada ?? "",
    fecha_fin_real: tarea?.fecha_fin_real ?? "", dias_estimados: tarea?.dias_estimados ?? "",
    horas_estimadas: tarea?.horas_estimadas ?? "", horas_reales: tarea?.horas_reales ?? "",
    personas_necesarias: tarea?.personas_necesarias ?? "", responsable: tarea?.responsable ?? "",
    observaciones: tarea?.observaciones ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [archivos, setArchivos] = useState([]);
  const [loadingArch, setLoadingArch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { if (isEdit && tarea?.id) cargarArchivos(); }, []);

  async function cargarArchivos() {
    setLoadingArch(true);
    const data = await safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tarea.id).order("created_at"));
    setArchivos(data);
    setLoadingArch(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null,
      estado: form.estado, prioridad: form.prioridad,
      fecha_inicio: form.fecha_inicio || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
      fecha_fin_real: form.fecha_fin_real || null,
      dias_estimados: form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      horas_estimadas: form.horas_estimadas !== "" ? num(form.horas_estimadas) : null,
      horas_reales: form.horas_reales !== "" ? num(form.horas_reales) : null,
      personas_necesarias: form.personas_necesarias !== "" ? parseInt(form.personas_necesarias) : null,
      responsable: form.responsable.trim() || null,
      observaciones: form.observaciones.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("obra_tareas").update(payload).eq("id", tarea.id)
      : await supabase.from("obra_tareas").insert({ ...payload, etapa_id: etapaId, obra_id: obraId, orden: 999 });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  async function subirArchivo(file) {
    if (!isEdit || !tarea?.id) { setUploadErr("Guardá la tarea primero."); return; }
    setUploading(true); setUploadErr("");
    const path = `${obraId}/${etapaId}/${tarea.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (upErr) { setUploadErr(upErr.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    await supabase.from("obra_tarea_archivos").insert({ tarea_id: tarea.id, etapa_id: etapaId, obra_id: obraId, nombre_archivo: file.name, storage_path: path, url_publica: publicUrl, tipo_mime: file.type, tamano_bytes: file.size });
    setUploading(false);
    cargarArchivos();
  }

  async function eliminarArchivo(arch) {
    if (!window.confirm(`¿Eliminar "${arch.nombre_archivo}"?`)) return;
    await supabase.storage.from(STORAGE_BUCKET).remove([arch.storage_path]);
    await supabase.from("obra_tarea_archivos").delete().eq("id", arch.id);
    cargarArchivos();
  }

  const secBox = { padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, marginBottom: 12 };
  const secLabel = { fontSize: 8, letterSpacing: "0.22em", color: C.t2, marginBottom: 10, textTransform: "uppercase", fontFamily: C.mono };

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      <div style={{ padding: "18px 24px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 5 }}>{isEdit ? "◈ EDITAR TAREA" : "◈ NUEVA TAREA"}</div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 700 }}>{isEdit ? "Editar tarea" : "Nueva tarea"}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>Solo el nombre es obligatorio</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18, padding: "4px 8px" }}>×</Btn>
        </div>
        <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
          {[["general","General"],["archivos",`Archivos${archivos.length ? ` (${archivos.length})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: "7px 18px", border: "none", borderBottom: tab === k ? `2px solid ${C.primary}` : "2px solid transparent", background: "transparent", color: tab === k ? C.t0 : C.t2, fontSize: 11, cursor: "pointer", fontFamily: C.mono, fontWeight: tab === k ? 600 : 400, letterSpacing: "0.06em", transition: "color .15s" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {err && <div style={{ padding: "9px 14px", marginBottom: 14, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 11, color: "#fca5a5", fontFamily: C.mono }}>⚠ {err}</div>}

        {tab === "general" && (
          <form id="tarea-form" onSubmit={handleSubmit}>
            <InputSt label="Nombre *"><input style={{ ...INP, fontSize: 13 }} required autoFocus placeholder="Ej: Laminado de fondo" value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <div style={secLabel}>Estado</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {Object.entries(C.tarea).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.08em", border: form.estado === k ? `1px solid ${v.text}50` : "1px solid rgba(255,255,255,0.07)", background: form.estado === k ? `${v.text}12` : "rgba(255,255,255,0.02)", color: form.estado === k ? v.text : C.t2, transition: "all .15s" }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={secLabel}>Prioridad</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {Object.entries(C.prioridad).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("prioridad", k)} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.08em", border: form.prioridad === k ? `1px solid ${v.color}50` : "1px solid rgba(255,255,255,0.07)", background: form.prioridad === k ? `${v.color}14` : "rgba(255,255,255,0.02)", color: form.prioridad === k ? v.color : C.t2, transition: "all .15s" }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <InputSt label="Descripción"><textarea style={{ ...INP, resize: "vertical", minHeight: 70 }} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
            <div style={secBox}>
              <div style={secLabel}>Equipo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InputSt label="Responsable"><input style={INP} placeholder="Nombre" value={form.responsable} onChange={e => set("responsable", e.target.value)} /></InputSt>
                <InputSt label="Personas necesarias"><input type="number" min="0" step="1" style={INP} placeholder="1" value={form.personas_necesarias} onChange={e => set("personas_necesarias", e.target.value)} /></InputSt>
              </div>
            </div>
            <div style={secBox}>
              <div style={secLabel}>Fechas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
                <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
                <InputSt label="Fin real"><input type="date" style={INP} value={form.fecha_fin_real} onChange={e => set("fecha_fin_real", e.target.value)} /></InputSt>
              </div>
            </div>
            <div style={secBox}>
              <div style={secLabel}>Tiempo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Días est."><input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} /></InputSt>
                <InputSt label="Horas est."><input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.horas_estimadas} onChange={e => set("horas_estimadas", e.target.value)} /></InputSt>
                <InputSt label="Horas reales"><input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.horas_reales} onChange={e => set("horas_reales", e.target.value)} /></InputSt>
              </div>
            </div>
            <InputSt label="Observaciones"><textarea style={{ ...INP, resize: "vertical", minHeight: 62 }} value={form.observaciones} onChange={e => set("observaciones", e.target.value)} /></InputSt>
          </form>
        )}

        {tab === "archivos" && (
          <div>
            {!isEdit && <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, marginBottom: 16, fontSize: 11, color: "#fcd34d", fontFamily: C.mono }}>ℹ Guardá la tarea primero para poder subir archivos.</div>}
            {isEdit && (
              <div onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.primary; }} onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }} onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; [...(e.dataTransfer?.files ?? [])].forEach(f => subirArchivo(f)); }} style={{ border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 10, padding: "32px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16, background: "rgba(255,255,255,0.015)", transition: "border-color .2s" }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>↑</div>
                <div style={{ fontSize: 12, color: C.t0, fontWeight: 500, marginBottom: 4 }}>{uploading ? "Subiendo…" : "Arrastrá archivos aquí o hacé click"}</div>
                <div style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>DWG · DXF · PDF · PNG · XLSX · DOCX</div>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { [...(e.target.files ?? [])].forEach(f => subirArchivo(f)); e.target.value = ""; }} />
              </div>
            )}
            {uploadErr && <div style={{ padding: "7px 12px", marginBottom: 12, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 11, color: "#fca5a5", fontFamily: C.mono }}>{uploadErr}</div>}
            {loadingArch && <div style={{ textAlign: "center", padding: "28px 0", color: C.t2, fontSize: 11, fontFamily: C.mono }}>CARGANDO ARCHIVOS…</div>}
            {!loadingArch && archivos.length === 0 && isEdit && <div style={{ textAlign: "center", padding: "28px 0", color: C.t2, fontSize: 11, fontFamily: C.mono }}>Sin archivos adjuntos todavía</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {archivos.map(arch => (
                <div key={arch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 8, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                    <div style={{ fontSize: 9, color: C.t2, marginTop: 2, fontFamily: C.mono }}>{fmtBytes(arch.tamano_bytes)} · {fmtDate(arch.created_at?.slice(0, 10))}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a href={arch.url_publica} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: C.t1, textDecoration: "none", cursor: "pointer", fontFamily: C.mono }}>Ver</a>
                    <a href={arch.url_publica} download={arch.nombre_archivo} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", textDecoration: "none", cursor: "pointer", fontFamily: C.mono }}>⬇</a>
                    <button type="button" onClick={() => eliminarArchivo(arch)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", color: C.t2, cursor: "pointer" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8, flexShrink: 0, background: "rgba(10,12,18,0.5)" }}>
        {tab === "general" && <Btn type="submit" form="tarea-form" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}</Btn>}
        <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        {isEdit && tab === "general" && <Btn variant="outline" sx={{ marginLeft: "auto" }} onClick={() => setTab("archivos")}>Archivos ({archivos.length})</Btn>}
      </div>
    </Overlay>
  );
}

// ─── TAREA CARD ───────────────────────────────────────────────────────────────
function TareaCard({ tarea, esGestion, archivosCount, onCambiarEstado, onEditar, onDetalle, onEliminar }) {
  const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
  const pc = C.prioridad[tarea.prioridad ?? "media"];
  const diasVence = diasHasta(tarea.fecha_fin_estimada);
  const atrasada  = diasVence !== null && diasVence < 0  && !["finalizada","cancelada"].includes(tarea.estado);
  const urgente   = diasVence !== null && diasVence <= 2 && !["finalizada","cancelada"].includes(tarea.estado);

  return (
    <div onClick={() => onDetalle(tarea)} style={{ border: `1px solid ${atrasada ? "rgba(239,68,68,0.30)" : urgente ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.07)"}`, borderLeft: `3px solid ${pc.color}`, borderRadius: 8, background: "rgba(255,255,255,0.022)", marginBottom: 6, cursor: "pointer", transition: "border-color .15s, background .15s", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${pc.color}35, transparent)`, pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px 8px" }}>
        <div style={{ paddingTop: 3, flexShrink: 0 }}><Dot color={tc.text} size={7} glow={tarea.estado === "en_progreso"} ping={tarea.estado === "en_progreso"} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.t0, fontWeight: 500, wordBreak: "break-word" }}>{tarea.nombre}</span>
            {atrasada && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(239,68,68,0.10)", color: C.red, border: "1px solid rgba(239,68,68,0.25)", fontFamily: C.mono, letterSpacing: "0.15em", flexShrink: 0 }}>ATRASADA</span>}
            {urgente && !atrasada && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(245,158,11,0.09)", color: C.amber, border: "1px solid rgba(245,158,11,0.25)", fontFamily: C.mono, letterSpacing: "0.15em", flexShrink: 0 }}>VENCE PRONTO</span>}
          </div>
          {tarea.descripcion && <div style={{ fontSize: 10, color: C.t2, marginBottom: 7, lineHeight: 1.55, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{tarea.descripcion}</div>}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, background: `${tc.text}12`, color: tc.text, border: `1px solid ${tc.text}28`, fontFamily: C.mono, letterSpacing: "0.1em" }}>{tc.label}</span>
            <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, background: `${pc.color}10`, color: pc.color, border: `1px solid ${pc.color}28`, fontFamily: C.mono, letterSpacing: "0.1em" }}>{pc.label}</span>
            {tarea.responsable && <span style={{ fontSize: 9, color: C.t1 }}>{tarea.responsable}{tarea.personas_necesarias > 1 ? ` +${tarea.personas_necesarias - 1}` : ""}</span>}
            {(tarea.dias_estimados || tarea.horas_estimadas) && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{tarea.dias_estimados ? `${tarea.dias_estimados}d` : ""}{tarea.dias_estimados && tarea.horas_estimadas ? " / " : ""}{tarea.horas_estimadas ? `${tarea.horas_estimadas}h` : ""}</span>}
            {archivosCount > 0 && <span style={{ fontSize: 9, color: C.primary, fontFamily: C.mono }}>{archivosCount} arch.</span>}
          </div>
        </div>
        {esGestion && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 3 }}>
              {tarea.estado === "pendiente" && <button type="button" onClick={() => onCambiarEstado(tarea.id, "en_progreso")} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(59,130,246,0.30)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", cursor: "pointer", fontFamily: C.mono, whiteSpace: "nowrap" }}>▶ Iniciar</button>}
              {tarea.estado === "en_progreso" && <button type="button" onClick={() => onCambiarEstado(tarea.id, "finalizada")} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(16,185,129,0.30)", background: "rgba(16,185,129,0.08)", color: C.green, cursor: "pointer", fontFamily: C.mono, whiteSpace: "nowrap" }}>✓ Finalizar</button>}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <button type="button" onClick={() => onEditar(tarea)} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: C.t1, cursor: "pointer", fontFamily: C.mono }}>editar</button>
              <button type="button" onClick={() => onEliminar(tarea)} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "none", background: "transparent", color: C.t2, cursor: "pointer" }}>×</button>
            </div>
          </div>
        )}
      </div>
      {tarea.horas_estimadas && tarea.horas_reales && (
        <div style={{ padding: "0 12px 9px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono, letterSpacing: "0.1em" }}>HORAS</span>
            <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono }}>{tarea.horas_reales}/{tarea.horas_estimadas}h</span>
          </div>
          <ProgressBar value={pct(num(tarea.horas_reales), num(tarea.horas_estimadas))} color={tc.text} height={2} animated={tarea.estado === "en_progreso"} />
        </div>
      )}
    </div>
  );
}

// ─── MODAL DETALLE TAREA ──────────────────────────────────────────────────────
function TareaDetalleModal({ tarea, onClose, onEditar, esGestion }) {
  const [archivos, setArchivos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
  const pc = C.prioridad[tarea.prioridad ?? "media"];

  useEffect(() => { cargarArchivos(); }, []);

  async function cargarArchivos() {
    setLoading(true);
    const data = await safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tarea.id).order("created_at"));
    setArchivos(data);
    setLoading(false);
  }

  const MetaRow = ({ icon, label, value, mono }) => value ? (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "flex-start" }}>
      <span style={{ width: 20, flexShrink: 0, opacity: 0.7 }}>{icon}</span>
      <span style={{ fontSize: 10, color: C.t2, width: 130, flexShrink: 0, fontFamily: C.mono, letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 11, color: C.t0, fontFamily: mono ? C.mono : C.sans, flex: 1, lineHeight: 1.5 }}>{value}</span>
    </div>
  ) : null;

  return (
    <Overlay onClose={onClose} maxWidth={700}>
      <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 4, minHeight: 52, borderRadius: 2, background: `linear-gradient(180deg, ${pc.color}, ${pc.color}55)`, flexShrink: 0, marginTop: 2, boxShadow: `0 0 12px ${pc.color}50` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.t2, fontFamily: C.mono, marginBottom: 7 }}>◈ DETALLE DE TAREA</div>
            <div style={{ fontSize: 18, color: C.t0, fontWeight: 700, marginBottom: 10, lineHeight: 1.3 }}>{tarea.nombre}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 8, padding: "3px 10px", borderRadius: 4, background: `${tc.text}12`, color: tc.text, border: `1px solid ${tc.text}30`, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" }}>{tc.label}</span>
              <span style={{ fontSize: 8, padding: "3px 10px", borderRadius: 4, background: `${pc.color}10`, color: pc.color, border: `1px solid ${pc.color}28`, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" }}>Prioridad {pc.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
            {esGestion && <Btn variant="outline" onClick={() => { onClose(); onEditar(tarea); }}>Editar</Btn>}
            <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18, padding: "4px 8px" }}>×</Btn>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        {tarea.descripcion && (
          <div style={{ marginBottom: 20, padding: "14px 16px", background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.14)", borderRadius: 9 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, marginBottom: 8, textTransform: "uppercase", fontFamily: C.mono }}>Descripción</div>
            <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{tarea.descripcion}</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, marginBottom: 10, textTransform: "uppercase", fontFamily: C.mono }}>Equipo</div>
            <MetaRow icon="·" label="Responsable" value={tarea.responsable} />
            <MetaRow icon="👥" label="Personas" value={tarea.personas_necesarias ? `${tarea.personas_necesarias} persona${tarea.personas_necesarias > 1 ? "s" : ""}` : null} />
          </div>
          <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, marginBottom: 10, textTransform: "uppercase", fontFamily: C.mono }}>Tiempo</div>
            <MetaRow icon="📅" label="Días estimados"  value={tarea.dias_estimados  ? `${tarea.dias_estimados}d`  : null} mono />
            <MetaRow icon=""   label="Horas estimadas" value={tarea.horas_estimadas ? `${tarea.horas_estimadas}h` : null} mono />
            <MetaRow icon="⏰" label="Horas reales"    value={tarea.horas_reales    ? `${tarea.horas_reales}h`    : null} mono />
            {tarea.horas_estimadas && tarea.horas_reales && (
              <div style={{ marginTop: 10 }}>
                <ProgressBar value={pct(num(tarea.horas_reales), num(tarea.horas_estimadas))} color={tc.text} height={4} animated={tarea.estado === "en_progreso"} />
                <div style={{ fontSize: 9, color: C.t2, marginTop: 4, textAlign: "right", fontFamily: C.mono }}>{pct(num(tarea.horas_reales), num(tarea.horas_estimadas))}% completado</div>
              </div>
            )}
          </div>
        </div>
        {tarea.observaciones && (
          <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, marginBottom: 14 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, marginBottom: 8, textTransform: "uppercase", fontFamily: C.mono }}>Observaciones</div>
            <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{tarea.observaciones}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.t2, marginBottom: 10, textTransform: "uppercase", fontFamily: C.mono }}>Archivos adjuntos{archivos.length > 0 && ` (${archivos.length})`}</div>
          {loading && <div style={{ color: C.t2, fontSize: 11, fontFamily: C.mono }}>Cargando…</div>}
          {!loading && archivos.length === 0 && <div style={{ textAlign: "center", padding: "22px 0", color: C.t2, fontSize: 10, border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 9, fontFamily: C.mono }}>Sin archivos · Editá la tarea para subir planos y documentos</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {archivos.map(arch => (
              <a key={arch.id} href={arch.url_publica} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 8, background: "rgba(255,255,255,0.022)", border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none", transition: "border-color .15s" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                  <div style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{fmtBytes(arch.tamano_bytes)}</div>
                </div>
                <span style={{ fontSize: 11, color: C.t2, flexShrink: 0 }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── PREDECESSOR WARN MODAL ───────────────────────────────────────────────────
function PredecessorWarnModal({ tareaActual, bloqueantes, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel} maxWidth={420}>
      <div style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.30)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚠</div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.t2, fontFamily: C.mono, marginBottom: 5 }}>ADVERTENCIA</div>
            <div style={{ fontSize: 14, color: C.t0, fontWeight: 600 }}>Tarea con predecesoras pendientes</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.t1, marginBottom: 12, lineHeight: 1.6 }}>Querés iniciar <span style={{ color: C.t0, fontWeight: 600, fontFamily: C.mono }}>"{tareaActual}"</span> pero las siguientes tareas aún no finalizaron:</div>
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 5 }}>
          {bloqueantes.map(t => {
            const tc = C.tarea[t.estado] ?? C.tarea.pendiente;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 7, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.18)" }}>
                <Dot color={tc.text} size={6} />
                <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{t.nombre}</span>
                <span style={{ fontSize: 8, color: tc.text, background: `${tc.text}12`, padding: "2px 8px", borderRadius: 4, border: `1px solid ${tc.text}28`, fontFamily: C.mono }}>{tc.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="amber" onClick={onConfirm}>Sí, iniciar igual</Btn>
          <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ─── ETAPA TAREAS SECTION ─────────────────────────────────────────────────────
function EtapaTareasSection({ etapa, tareas, archivosCount, esGestion, onCambiarEstado, onEditar, onDetalle, onEliminar, onNueva }) {
  const finalizadas = tareas.filter(t => t.estado === "finalizada").length;
  const epct        = pct(finalizadas, tareas.length);
  const ec          = C.etapa[etapa.estado] ?? C.etapa.pendiente;
  const [predWarn, setPredWarn] = useState(null);

  function handleCambiarEstado(tareaId, nuevoEstado) {
    if (nuevoEstado !== "en_progreso") { onCambiarEstado(tareaId, nuevoEstado); return; }
    const tarea = tareas.find(t => t.id === tareaId);
    if (!tarea) { onCambiarEstado(tareaId, nuevoEstado); return; }
    const bloqueantes = tareas.filter(t => t.id !== tareaId && (t.orden ?? 0) < (tarea.orden ?? 0) && t.estado !== "finalizada" && t.estado !== "cancelada");
    if (bloqueantes.length === 0) { onCambiarEstado(tareaId, nuevoEstado); return; }
    setPredWarn({ tareaId, tareaActual: tarea.nombre, bloqueantes, nuevoEstado });
  }

  return (
    <div style={{ marginTop: 4, paddingLeft: 14, paddingBottom: 6 }}>
      {predWarn && (
        <PredecessorWarnModal
          tareaActual={predWarn.tareaActual} bloqueantes={predWarn.bloqueantes}
          onConfirm={() => { onCambiarEstado(predWarn.tareaId, predWarn.nuevoEstado); setPredWarn(null); }}
          onCancel={() => setPredWarn(null)}
        />
      )}
      {tareas.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "4px 0" }}>
          <ProgressBar value={epct} color={ec.dot} height={3} animated={etapa.estado === "en_curso"} />
          <span style={{ fontSize: 9, color: ec.text, fontFamily: C.mono, flexShrink: 0, letterSpacing: "0.08em" }}>{finalizadas}/{tareas.length} · {epct}%</span>
        </div>
      )}
      {tareas.map(tarea => (
        <TareaCard key={tarea.id} tarea={tarea} esGestion={esGestion} archivosCount={archivosCount[tarea.id] ?? 0} onCambiarEstado={handleCambiarEstado} onEditar={onEditar} onDetalle={onDetalle} onEliminar={onEliminar} />
      ))}
      {esGestion && (
        <button type="button" onClick={onNueva} style={{ width: "100%", marginTop: 6, padding: "8px 12px", borderRadius: 7, cursor: "pointer", border: "1px dashed rgba(255,255,255,0.12)", background: "transparent", color: C.t2, fontSize: 10, fontFamily: C.mono, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "border-color .15s, color .15s" }}>
          + Nueva tarea en {etapa.nombre}
        </button>
      )}
      {tareas.length === 0 && !esGestion && <div style={{ padding: "14px 0", color: C.t2, fontSize: 10, textAlign: "center", fontFamily: C.mono, letterSpacing: "0.1em" }}>Sin tareas en esta etapa</div>}
    </div>
  );
}

// ─── MODAL OC ────────────────────────────────────────────────────────────────
function OrdenCompraModal({ oc, obras, onSave, onClose }) {
  const [form, setForm] = useState({
    estado: oc.estado ?? "pendiente", tipo: oc.tipo ?? "aviso",
    descripcion: oc.descripcion ?? "", monto_estimado: oc.monto_estimado ?? "",
    monto_real: oc.monto_real ?? "", proveedor: oc.proveedor ?? "",
    numero_oc: oc.numero_oc ?? "", fecha_pedido: oc.fecha_pedido ?? "",
    fecha_estimada_entrega: oc.fecha_estimada_entrega ?? "",
    fecha_limite_pedido: oc.fecha_limite_pedido ?? "", notas: oc.notas ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const obra = obras.find(o => o.id === oc.obra_id);
  const urg  = ocUrgencia({ ...oc, fecha_limite_pedido: form.fecha_limite_pedido || oc.fecha_limite_pedido });

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setErr("");
    const payload = {
      estado: form.estado, tipo: form.tipo, descripcion: form.descripcion.trim() || null,
      monto_estimado: form.monto_estimado !== "" ? num(form.monto_estimado) : null,
      monto_real: form.monto_real !== "" ? num(form.monto_real) : null,
      proveedor: form.proveedor.trim() || null, numero_oc: form.numero_oc.trim() || null,
      fecha_pedido: form.fecha_pedido || null, fecha_estimada_entrega: form.fecha_estimada_entrega || null,
      fecha_limite_pedido: form.fecha_limite_pedido || null, notas: form.notas.trim() || null,
    };
    const { error } = await supabase.from("ordenes_compra").update(payload).eq("id", oc.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      <div style={{ padding: "24px 28px 8px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 6 }}>◈ ORDEN DE COMPRA</div>
            <div style={{ fontSize: 16, color: C.t0, fontWeight: 700 }}>{obra?.codigo ? <span style={{ fontFamily: C.mono, color: "#93c5fd" }}>{obra.codigo}</span> : "Sin obra"}</div>
            {oc.etapa_nombre && <div style={{ fontSize: 11, color: C.t2, marginTop: 3, fontFamily: C.mono }}>└ {oc.etapa_nombre}</div>}
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {urg && <div style={{ padding: "9px 14px", marginBottom: 4, borderRadius: 7, background: `${urg.color}0d`, border: `1px solid ${urg.color}35`, fontSize: 11, color: urg.color, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 14 }}>⚠</span>{urg.label}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 24px" }}>
        {err && <div style={{ padding: "9px 14px", marginBottom: 14, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5", fontFamily: C.mono }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <InputSt label="Estado">
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {Object.entries(C.oc).map(([k, v]) => (
                <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "5px 13px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: C.mono, letterSpacing: "0.08em", border: form.estado === k ? `1px solid ${v.dot}55` : `1px solid ${C.b0}`, background: form.estado === k ? v.bg : "rgba(255,255,255,0.02)", color: form.estado === k ? v.dot : C.t2, transition: "all .18s", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: form.estado === k ? v.dot : C.t2, transition: "all .18s" }} />{v.label}
                </button>
              ))}
            </div>
          </InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputSt label="Proveedor"><input style={INP} placeholder="Nombre del proveedor" value={form.proveedor} onChange={e => set("proveedor", e.target.value)} /></InputSt>
            <InputSt label="N° OC / Referencia"><input style={{ ...INP, letterSpacing: "0.1em" }} placeholder="OC-2025-001" value={form.numero_oc} onChange={e => set("numero_oc", e.target.value)} /></InputSt>
          </div>
          <InputSt label="Descripción / Materiales"><textarea style={{ ...INP, resize: "vertical", minHeight: 58 }} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputSt label="Monto estimado ($)"><input type="number" min="0" step="0.01" style={INP} value={form.monto_estimado} onChange={e => set("monto_estimado", e.target.value)} /></InputSt>
            <InputSt label="Monto real ($)"><input type="number" min="0" step="0.01" style={INP} value={form.monto_real} onChange={e => set("monto_real", e.target.value)} /></InputSt>
          </div>
          <div style={{ padding: "14px 16px", marginBottom: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.b0}`, borderRadius: 9 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.22em", color: C.t2, marginBottom: 12, textTransform: "uppercase", fontFamily: C.mono }}>◈ Fechas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <InputSt label="Límite para pedir"><input type="date" style={{ ...INP, colorScheme: "dark" }} value={form.fecha_limite_pedido} onChange={e => set("fecha_limite_pedido", e.target.value)} /></InputSt>
              <InputSt label="Pedido el"><input type="date" style={{ ...INP, colorScheme: "dark" }} value={form.fecha_pedido} onChange={e => set("fecha_pedido", e.target.value)} /></InputSt>
              <InputSt label="Entrega estimada"><input type="date" style={{ ...INP, colorScheme: "dark" }} value={form.fecha_estimada_entrega} onChange={e => set("fecha_estimada_entrega", e.target.value)} /></InputSt>
            </div>
          </div>
          <InputSt label="Notas internas"><textarea style={{ ...INP, resize: "vertical", minHeight: 54 }} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── PLANTILLA LÍNEA ─────────────────────────────────────────────────────────
function LineasEtapasModal({ linea, lProcs, lTareas = [], onClose, onSaved }) {
  const [items, setItems] = useState(lProcs.filter(p => p.linea_id === linea.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
  const [loadingAll, setLoadingAll] = useState(true);
  const [editIdx, setEditIdx] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "", orden_compra_dias_previo: 7 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [editBuf, setEditBuf] = useState({});
  const [expandedProc, setExpandedProc] = useState(null);
  const [tareasState, setTareasState] = useState([]);
  const [loadingTareas, setLoadingTareas] = useState(true);
  const [addingTarea, setAddingTarea] = useState(null);
  const [editingTarea, setEditingTarea] = useState(null);
  const [tareaForm, setTareaForm] = useState({ nombre: "", horas_estimadas: "", personas_necesarias: "", observaciones: "", prioridad: "media" });
  const [tareaEditBuf, setTareaEditBuf] = useState({});

  useEffect(() => {
    async function fetchAll() {
      setLoadingAll(true); setLoadingTareas(true);
      const { data: procs } = await supabase.from("linea_procesos").select("*").eq("linea_id", linea.id).order("orden");
      if (procs?.length) setItems(procs);
      setLoadingAll(false);
      const procIds = (procs ?? []).map(p => p.id);
      if (!procIds.length) { setLoadingTareas(false); return; }
      const { data: tData } = await supabase.from("linea_proceso_tareas").select("*").in("linea_proceso_id", procIds).order("linea_proceso_id").order("orden");
      if (tData) setTareasState(tData);
      setLoadingTareas(false);
    }
    fetchAll();
  }, [linea.id]);

  function tareasDeProc(procId) { return tareasState.filter(t => t.linea_proceso_id === procId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)); }

  async function agregarTarea(procId) {
    if (!tareaForm.nombre.trim()) return;
    setSaving(true);
    const tDeProc = tareasDeProc(procId);
    const maxOrden = tDeProc.length ? Math.max(...tDeProc.map(t => t.orden ?? 0)) : 0;
    const { data, error } = await supabase.from("linea_proceso_tareas").insert({ linea_proceso_id: procId, nombre: tareaForm.nombre.trim(), orden: maxOrden + 1, horas_estimadas: tareaForm.horas_estimadas !== "" ? num(tareaForm.horas_estimadas) : null, personas_necesarias: tareaForm.personas_necesarias !== "" ? parseInt(tareaForm.personas_necesarias) : null, observaciones: tareaForm.observaciones.trim() || null, prioridad: tareaForm.prioridad }).select().single();
    if (error) { flash(false, error.message); setSaving(false); return; }
    setTareasState(prev => [...prev, data]);
    setAddingTarea(null);
    setTareaForm({ nombre: "", horas_estimadas: "", personas_necesarias: "", observaciones: "", prioridad: "media" });
    flash(true, "Tarea agregada."); setSaving(false); onSaved();
  }

  async function guardarTarea(tareaId) {
    setSaving(true);
    const payload = { nombre: tareaEditBuf.nombre?.trim() || undefined, horas_estimadas: tareaEditBuf.horas_estimadas !== "" ? num(tareaEditBuf.horas_estimadas) : null, personas_necesarias: tareaEditBuf.personas_necesarias !== "" ? parseInt(tareaEditBuf.personas_necesarias) : null, observaciones: tareaEditBuf.observaciones?.trim() || null, prioridad: tareaEditBuf.prioridad ?? "media" };
    const { error } = await supabase.from("linea_proceso_tareas").update(payload).eq("id", tareaId);
    if (error) { flash(false, error.message); setSaving(false); return; }
    setTareasState(prev => prev.map(t => t.id === tareaId ? { ...t, ...payload } : t));
    setEditingTarea(null); setTareaEditBuf({});
    flash(true, "Tarea actualizada."); setSaving(false); onSaved();
  }

  async function eliminarTarea(tarea) {
    if (!window.confirm("¿Eliminar tarea: " + tarea.nombre + "?")) return;
    const { error } = await supabase.from("linea_proceso_tareas").delete().eq("id", tarea.id);
    if (error) { flash(false, error.message); return; }
    setTareasState(prev => prev.filter(t => t.id !== tarea.id));
    flash(true, "Tarea eliminada."); onSaved();
  }

  function flash(ok, text) { setToast({ ok, text }); setTimeout(() => setToast(null), 2600); }
  function startEdit(idx) { setEditIdx(idx); setEditBuf({ ...items[idx] }); }
  function cancelEdit() { setEditIdx(null); setEditBuf({}); }
  const eb = (k, v) => setEditBuf(f => ({ ...f, [k]: v }));

  async function saveEdit(idx) {
    setSaving(true);
    const item = items[idx];
    const payload = { nombre: editBuf.nombre?.trim() || item.nombre, dias_estimados: editBuf.dias_estimados !== "" ? num(editBuf.dias_estimados) : null, color: editBuf.color ?? item.color, genera_orden_compra: editBuf.genera_orden_compra ?? false, orden_compra_tipo: editBuf.genera_orden_compra ? (editBuf.orden_compra_tipo ?? "aviso") : null, orden_compra_descripcion: editBuf.genera_orden_compra ? (editBuf.orden_compra_descripcion?.trim() || null) : null, orden_compra_monto_estimado: editBuf.genera_orden_compra && editBuf.orden_compra_monto_estimado !== "" ? num(editBuf.orden_compra_monto_estimado) : null, orden_compra_dias_previo: editBuf.genera_orden_compra ? num(editBuf.orden_compra_dias_previo ?? 7) : null };
    const { error } = await supabase.from("linea_procesos").update(payload).eq("id", item.id);
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...payload } : it));
    setEditIdx(null); flash(true, "Guardado."); setSaving(false); onSaved();
  }

  async function addEtapa() {
    if (!newForm.nombre.trim()) return; setSaving(true);
    const maxOrden = Math.max(0, ...items.map(p => p.orden ?? 0));
    const { data, error } = await supabase.from("linea_procesos").insert({ linea_id: linea.id, nombre: newForm.nombre.trim(), dias_estimados: newForm.dias_estimados !== "" ? num(newForm.dias_estimados) : null, color: newForm.color, orden: maxOrden + 1, activo: true, genera_orden_compra: newForm.genera_orden_compra, orden_compra_tipo: newForm.genera_orden_compra ? newForm.orden_compra_tipo : null, orden_compra_descripcion: newForm.genera_orden_compra ? (newForm.orden_compra_descripcion.trim() || null) : null, orden_compra_monto_estimado: newForm.genera_orden_compra && newForm.orden_compra_monto_estimado !== "" ? num(newForm.orden_compra_monto_estimado) : null, orden_compra_dias_previo: newForm.genera_orden_compra ? num(newForm.orden_compra_dias_previo) : null }).select().single();
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => [...prev, data]); setAdding(false);
    setNewForm({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "", orden_compra_dias_previo: 7 });
    flash(true, "Etapa agregada."); setSaving(false); onSaved();
  }

  async function deleteEtapa(item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}" de la plantilla?`)) return;
    const { error } = await supabase.from("linea_procesos").delete().eq("id", item.id);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.filter(it => it.id !== item.id)); flash(true, "Eliminada."); onSaved();
  }

  async function moveItem(idx, dir) {
    const next = [...items]; const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]; setItems(next);
    await Promise.all(next.map((it, i) => supabase.from("linea_procesos").update({ orden: i + 1 }).eq("id", it.id)));
    onSaved();
  }

  const microBtn = (extra = {}) => ({ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 5, fontFamily: C.mono, transition: "all .15s", ...extra });

  return (
    <Overlay onClose={onClose} maxWidth={620}>
      {toast && <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 99999, padding: "10px 20px", borderRadius: 8, fontSize: 11, fontFamily: C.mono, background: toast.ok ? "rgba(6,20,14,0.97)" : "rgba(20,6,6,0.97)", border: `1px solid ${toast.ok ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: toast.ok ? "#6ee7b7" : "#fca5a5", boxShadow: `0 0 20px ${toast.ok ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}`, animation: "slideLeft .18s ease", display: "flex", alignItems: "center", gap: 8 }}><span>{toast.ok ? "✓" : "✕"}</span>{toast.text}</div>}
      <div style={{ padding: "22px 26px 16px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 6 }}>◈ PLANTILLA DE ETAPAS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: linea.color ?? C.t2, boxShadow: `0 0 8px ${linea.color ?? C.t2}` }} />
              <span style={{ fontSize: 15, color: C.t0, fontWeight: 700 }}>{linea.nombre}</span>
              <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{items.length} etapa{items.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 26px" }}>
        {loadingAll && <div style={{ textAlign: "center", padding: "36px 0", color: C.t2, fontSize: 11, fontFamily: C.mono }}>Cargando plantilla…</div>}
        {!loadingAll && items.length === 0 && !adding && <div style={{ textAlign: "center", padding: "36px 0", color: C.t2, fontSize: 11, fontFamily: C.mono, border: `1px dashed ${C.b0}`, borderRadius: 10 }}>Sin etapas en esta plantilla</div>}

        {!loadingAll && items.map((item, idx) => {
          const isEditing = editIdx === idx;
          const tDeProc   = tareasDeProc(item.id);
          return (
            <div key={item.id} style={{ border: `1px solid ${isEditing ? "rgba(59,130,246,0.30)" : C.b0}`, borderLeft: `3px solid ${item.color ?? "#64748b"}`, borderRadius: 9, marginBottom: 7, background: isEditing ? "rgba(59,130,246,0.04)" : "rgba(255,255,255,0.02)", transition: "all .2s ease", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.t0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nombre}</span>
                    {item.genera_orden_compra && <span style={{ fontSize: 8, color: C.amber, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", padding: "1px 7px", borderRadius: 4, fontFamily: C.mono }}>OC</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.t2, marginTop: 2, fontFamily: C.mono }}>{item.dias_estimados ? `${item.dias_estimados}d estimados` : "Sin duración"} · {tDeProc.length} tarea{tDeProc.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ ...microBtn(), opacity: idx === 0 ? 0.2 : 1 }}>↑</button>
                  <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} style={{ ...microBtn(), opacity: idx === items.length - 1 ? 0.2 : 1 }}>↓</button>
                  <button type="button" onClick={() => isEditing ? cancelEdit() : startEdit(idx)} style={{ ...microBtn(isEditing ? { color: "#93c5fd", borderColor: "rgba(59,130,246,0.35)" } : {}) }}>{isEditing ? "✕" : "✏"}</button>
                  <button type="button" onClick={() => deleteEtapa(item)} style={{ ...microBtn({ color: "#f87171" }) }}>×</button>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.b0}` }}>
                <button type="button" onClick={() => setExpandedProc(expandedProc === item.id ? null : item.id)} style={{ width: "100%", background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 10, padding: "7px 14px", display: "flex", alignItems: "center", gap: 7, fontFamily: C.mono, letterSpacing: "0.06em" }}>
                  <span style={{ transform: expandedProc === item.id ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", fontSize: 7 }}>▶</span>
                  <span>{loadingTareas ? "cargando…" : `${tDeProc.length} tarea${tDeProc.length !== 1 ? "s" : ""} en plantilla`}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: expandedProc === item.id ? "#93c5fd" : C.t2 }}>{expandedProc === item.id ? "cerrar ▴" : "ver / editar ▾"}</span>
                </button>
                {expandedProc === item.id && (
                  <div style={{ padding: "0 12px 12px", animation: "slideUp .15s ease" }}>
                    {tDeProc.map((tarea, ti) => (
                      <div key={tarea.id} style={{ borderRadius: 7, background: editingTarea === tarea.id ? "rgba(59,130,246,0.05)" : "rgba(255,255,255,0.015)", border: `1px solid ${editingTarea === tarea.id ? "rgba(59,130,246,0.28)" : C.b0}`, marginBottom: 4, padding: "7px 11px", transition: "all .18s" }}>
                        {editingTarea !== tarea.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono, minWidth: 20 }}>{ti + 1}.</span>
                            <span style={{ flex: 1, fontSize: 11, color: C.t0 }}>{tarea.nombre}</span>
                            {tarea.horas_estimadas && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{tarea.horas_estimadas}h</span>}
                            <button type="button" onClick={() => { setEditingTarea(tarea.id); setTareaEditBuf({ nombre: tarea.nombre, horas_estimadas: tarea.horas_estimadas ?? "", personas_necesarias: tarea.personas_necesarias ?? "", observaciones: tarea.observaciones ?? "", prioridad: tarea.prioridad ?? "media" }); }} style={microBtn()}>editar</button>
                            <button type="button" onClick={() => eliminarTarea(tarea)} style={microBtn({ color: "#f87171" })}>×</button>
                          </div>
                        ) : (
                          <div style={{ animation: "slideUp .14s ease" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px", gap: 6, marginBottom: 7 }}>
                              <InputSt label="Nombre"><input style={INP} autoFocus value={tareaEditBuf.nombre} onChange={e => setTareaEditBuf(f => ({ ...f, nombre: e.target.value }))} /></InputSt>
                              <InputSt label="Horas"><input type="number" min="0" step="0.5" style={INP} value={tareaEditBuf.horas_estimadas} onChange={e => setTareaEditBuf(f => ({ ...f, horas_estimadas: e.target.value }))} /></InputSt>
                              <InputSt label="Pers."><input type="number" min="1" style={INP} value={tareaEditBuf.personas_necesarias} onChange={e => setTareaEditBuf(f => ({ ...f, personas_necesarias: e.target.value }))} /></InputSt>
                            </div>
                            <InputSt label="Observaciones"><input style={INP} value={tareaEditBuf.observaciones} onChange={e => setTareaEditBuf(f => ({ ...f, observaciones: e.target.value }))} /></InputSt>
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <Btn variant="primary" onClick={() => guardarTarea(tarea.id)} disabled={saving}>Guardar</Btn>
                              <Btn variant="outline" onClick={() => { setEditingTarea(null); setTareaEditBuf({}); }}>Cancelar</Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {addingTarea === item.id ? (
                      <div style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.22)", borderRadius: 8, padding: 12, marginTop: 6, animation: "slideUp .15s ease" }}>
                        <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#93c5fd", marginBottom: 10, fontFamily: C.mono }}>◈ NUEVA TAREA EN PLANTILLA</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px", gap: 6, marginBottom: 7 }}>
                          <InputSt label="Nombre *"><input style={INP} autoFocus placeholder="Ej: Laminado de fondo" value={tareaForm.nombre} onChange={e => setTareaForm(f => ({ ...f, nombre: e.target.value }))} /></InputSt>
                          <InputSt label="Horas"><input type="number" min="0" step="0.5" style={INP} placeholder="0" value={tareaForm.horas_estimadas} onChange={e => setTareaForm(f => ({ ...f, horas_estimadas: e.target.value }))} /></InputSt>
                          <InputSt label="Pers."><input type="number" min="1" style={INP} placeholder="1" value={tareaForm.personas_necesarias} onChange={e => setTareaForm(f => ({ ...f, personas_necesarias: e.target.value }))} /></InputSt>
                        </div>
                        <InputSt label="Observaciones"><input style={INP} placeholder="Rubro, plano, referencia…" value={tareaForm.observaciones} onChange={e => setTareaForm(f => ({ ...f, observaciones: e.target.value }))} /></InputSt>
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <Btn variant="primary" onClick={() => agregarTarea(item.id)} disabled={saving || !tareaForm.nombre.trim()}>Agregar tarea</Btn>
                          <Btn variant="outline" onClick={() => { setAddingTarea(null); setTareaForm({ nombre: "", horas_estimadas: "", personas_necesarias: "", observaciones: "", prioridad: "media" }); }}>Cancelar</Btn>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAddingTarea(item.id); setTareaForm({ nombre: "", horas_estimadas: "", personas_necesarias: "", observaciones: "", prioridad: "media" }); }} style={{ width: "100%", marginTop: 5, padding: "6px", border: `1px dashed ${C.b1}`, borderRadius: 6, background: "transparent", color: C.t2, fontSize: 10, cursor: "pointer", fontFamily: C.mono, letterSpacing: "0.08em" }}>+ agregar tarea a plantilla</button>
                    )}
                  </div>
                )}
              </div>

              {isEditing && (
                <div style={{ padding: "0 14px 16px", borderTop: `1px solid ${C.b0}`, animation: "slideUp .15s ease" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#93c5fd", margin: "12px 0 10px", fontFamily: C.mono }}>◈ EDITAR ETAPA</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, marginBottom: 8 }}>
                    <InputSt label="Nombre"><input style={INP} value={editBuf.nombre ?? item.nombre} onChange={e => eb("nombre", e.target.value)} /></InputSt>
                    <InputSt label="Días estimados"><input type="number" min="0" step="0.5" style={INP} value={editBuf.dias_estimados ?? item.dias_estimados ?? ""} onChange={e => eb("dias_estimados", e.target.value)} /></InputSt>
                  </div>
                  <InputSt label="Color">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="color" value={editBuf.color ?? item.color ?? "#64748b"} onChange={e => eb("color", e.target.value)} style={{ width: 32, height: 28, border: "none", background: "none", cursor: "pointer", borderRadius: 4 }} />
                      {COLOR_PRESETS.map(c => <div key={c} onClick={() => eb("color", c)} style={{ width: 16, height: 16, borderRadius: 4, background: c, cursor: "pointer", border: (editBuf.color ?? item.color) === c ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent", boxShadow: (editBuf.color ?? item.color) === c ? `0 0 6px ${c}` : "none", transition: "all .15s" }} />)}
                    </div>
                  </InputSt>
                  <OrdenCompraSection genera={editBuf.genera_orden_compra ?? item.genera_orden_compra ?? false} tipo={editBuf.orden_compra_tipo ?? item.orden_compra_tipo ?? "aviso"} desc={editBuf.orden_compra_descripcion ?? item.orden_compra_descripcion ?? ""} monto={editBuf.orden_compra_monto_estimado ?? item.orden_compra_monto_estimado ?? ""} diasPrevio={editBuf.orden_compra_dias_previo ?? item.orden_compra_dias_previo ?? 7} onChange={eb} />
                  <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                    <Btn variant="primary" onClick={() => saveEdit(idx)} disabled={saving}>Guardar</Btn>
                    <Btn variant="outline" onClick={cancelEdit}>Cancelar</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {adding && (
          <div style={{ border: "1px solid rgba(59,130,246,0.30)", borderLeft: "3px solid rgba(59,130,246,0.70)", borderRadius: 9, padding: 16, background: "rgba(59,130,246,0.04)", marginBottom: 8, animation: "slideUp .15s ease" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#93c5fd", marginBottom: 12, fontFamily: C.mono }}>◈ NUEVA ETAPA EN PLANTILLA</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, marginBottom: 8 }}>
              <InputSt label="Nombre *"><input style={INP} autoFocus placeholder="Ej: Pintura" value={newForm.nombre} onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))} /></InputSt>
              <InputSt label="Días estimados"><input type="number" min="0" step="0.5" style={INP} value={newForm.dias_estimados} onChange={e => setNewForm(f => ({ ...f, dias_estimados: e.target.value }))} /></InputSt>
            </div>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={newForm.color} onChange={e => setNewForm(f => ({ ...f, color: e.target.value }))} style={{ width: 32, height: 28, border: "none", background: "none", cursor: "pointer", borderRadius: 4 }} />
                {COLOR_PRESETS.map(c => <div key={c} onClick={() => setNewForm(f => ({ ...f, color: c }))} style={{ width: 16, height: 16, borderRadius: 4, background: c, cursor: "pointer", border: newForm.color === c ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent", boxShadow: newForm.color === c ? `0 0 6px ${c}` : "none", transition: "all .15s" }} />)}
              </div>
            </InputSt>
            <OrdenCompraSection genera={newForm.genera_orden_compra} tipo={newForm.orden_compra_tipo} desc={newForm.orden_compra_descripcion} monto={newForm.orden_compra_monto_estimado} diasPrevio={newForm.orden_compra_dias_previo} onChange={(k, v) => setNewForm(f => ({ ...f, [k]: v }))} />
            <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
              <Btn variant="primary" onClick={addEtapa} disabled={saving || !newForm.nombre.trim()}>Agregar etapa</Btn>
              <Btn variant="outline" onClick={() => setAdding(false)}>Cancelar</Btn>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 26px", borderTop: `1px solid ${C.b0}`, display: "flex", gap: 8, flexShrink: 0, background: "rgba(255,255,255,0.01)" }}>
        {!adding && <Btn variant="primary" onClick={() => setAdding(true)}>+ Nueva etapa en plantilla</Btn>}
        <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
        <span style={{ marginLeft: "auto", fontSize: 9, color: C.t2, fontFamily: C.mono, alignSelf: "center", letterSpacing: "0.1em" }}>{items.length} etapa{items.length !== 1 ? "s" : ""} · {tareasState.length} tarea{tareasState.length !== 1 ? "s" : ""}</span>
      </div>
    </Overlay>
  );
}

// ─── VISTA ÓRDENES DE COMPRA ─────────────────────────────────────────────────
function OrdenesCompraView({ ordenes, obras, esGestion, onEditOC, onRefresh }) {
  const [filtroOCEstado, setFiltroOCEstado] = useState("activas");
  const [filtroOCObra,   setFiltroOCObra]   = useState("todas");
  const [busqueda,       setBusqueda]       = useState("");

  const alertasUrgentes = useMemo(() => ordenes.filter(oc => {
    if (!["pendiente","solicitada"].includes(oc.estado)) return false;
    const u = ocUrgencia(oc); return u && ["vencida","hoy","urgente","proxima"].includes(u.nivel);
  }), [ordenes]);

  const ocsFilt = useMemo(() => ordenes.filter(oc => {
    if (filtroOCEstado === "activas"  && ["recibida","cancelada"].includes(oc.estado)) return false;
    if (filtroOCEstado === "cerradas" && !["recibida","cancelada"].includes(oc.estado)) return false;
    if (filtroOCObra !== "todas" && oc.obra_id !== filtroOCObra) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase(); const obra = obras.find(o => o.id === oc.obra_id);
      if (!((obra?.codigo ?? "").toLowerCase().includes(q) || (oc.descripcion ?? "").toLowerCase().includes(q) || (oc.proveedor ?? "").toLowerCase().includes(q) || (oc.numero_oc ?? "").toLowerCase().includes(q) || (oc.etapa_nombre ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [ordenes, filtroOCEstado, filtroOCObra, busqueda, obras]);

  const porObra = useMemo(() => {
    const map = {};
    ocsFilt.forEach(oc => { if (!map[oc.obra_id]) map[oc.obra_id] = { obra: obras.find(o => o.id === oc.obra_id), ocs: [] }; map[oc.obra_id].ocs.push(oc); });
    return Object.values(map).sort((a, b) => { const uA = a.ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); }); const uB = b.ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); }); return uB - uA; });
  }, [ocsFilt, obras]);

  const OC_FLOW = ["pendiente","solicitada","aprobada","en_camino","recibida"];

  async function cambiarEstadoOC(ocId, estado) {
    const upd = { estado }; if (estado === "recibida") upd.fecha_recepcion = today();
    await supabase.from("ordenes_compra").update(upd).eq("id", ocId); onRefresh();
  }

  const tabBtn = (v, l) => (
    <button type="button" onClick={() => setFiltroOCEstado(v)} style={{ border: filtroOCEstado === v ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.05)`, background: filtroOCEstado === v ? C.s1 : "transparent", color: filtroOCEstado === v ? C.t0 : C.t2, padding: "4px 13px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.mono, letterSpacing: "0.08em", transition: "all .15s" }}>{l}</button>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {alertasUrgentes.length > 0 && (
        <div style={{ padding: "10px 22px", background: "rgba(239,68,68,0.05)", borderBottom: "1px solid rgba(239,68,68,0.18)", display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚠</div>
          <div>
            <div style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, fontFamily: C.mono, letterSpacing: "0.06em", marginBottom: 4 }}>{alertasUrgentes.length} ORDEN{alertasUrgentes.length > 1 ? "ES" : ""} URGENTE{alertasUrgentes.length > 1 ? "S" : ""}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {alertasUrgentes.slice(0, 4).map(oc => {
                const obra = obras.find(o => o.id === oc.obra_id);
                const u = ocUrgencia(oc);
                return <span key={oc.id} style={{ fontSize: 10, color: u?.color, fontFamily: C.mono, padding: "2px 9px", borderRadius: 4, background: `${u?.color}12`, border: `1px solid ${u?.color}30`, letterSpacing: "0.05em" }}>{obra?.codigo} · {oc.etapa_nombre} · {u?.label}</span>;
              })}
              {alertasUrgentes.length > 4 && <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>+{alertasUrgentes.length - 4} más</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "8px 22px", background: "rgba(10,12,18,0.88)", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.t2, pointerEvents: "none" }}>⌕</span>
          <input style={{ ...INP, width: 210, padding: "5px 10px 5px 28px", fontSize: 11 }} placeholder="Buscar obra, proveedor…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {tabBtn("activas","Activas")}
          {tabBtn("cerradas","Cerradas")}
          {tabBtn("todas","Todas")}
        </div>
        <select style={{ ...INP, width: 170, padding: "5px 10px", fontSize: 11 }} value={filtroOCObra} onChange={e => setFiltroOCObra(e.target.value)}>
          <option value="todas">Todas las obras</option>
          {obras.filter(o => ordenes.some(oc => oc.obra_id === o.id)).map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 9, color: C.t2, fontFamily: C.mono, letterSpacing: "0.1em" }}>{ocsFilt.length} ÓC</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
        {porObra.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: C.t2, gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", border: `1px solid ${C.b0}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>◎</div>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", fontFamily: C.mono, textTransform: "uppercase" }}>Sin órdenes de compra</div>
            <div style={{ fontSize: 10, color: C.t2, textAlign: "center", maxWidth: 280, lineHeight: 1.7 }}>Las órdenes se generan automáticamente al completar etapas configuradas con OC</div>
          </div>
        )}

        {porObra.map(({ obra, ocs }) => {
          const tieneUrgente = ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); });
          const tieneProxima = ocs.some(o => { const u = ocUrgencia(o); return u && u.nivel === "proxima"; });
          const borderColor  = tieneUrgente ? "rgba(239,68,68,0.35)" : tieneProxima ? "rgba(245,158,11,0.30)" : C.b0;
          const oC           = obra ? (C.obra[obra.estado] ?? C.obra.activa) : null;

          return (
            <div key={obra?.id ?? "sin-obra"} style={{ marginBottom: 22, border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.015)" }}>
              <div style={{ padding: "10px 18px", background: tieneUrgente ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.025)", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 12 }}>
                {oC && <Dot color={oC.dot} size={8} glow ping={tieneUrgente} />}
                <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t0, fontWeight: 700, letterSpacing: "0.08em" }}>{obra?.codigo ?? "Sin obra"}</span>
                {obra?.linea_nombre && <span style={{ fontSize: 8, color: C.t2, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: C.mono }}>{obra.linea_nombre}</span>}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{ocs.length} OC</span>
                  {tieneUrgente && <span style={{ fontSize: 8, color: C.red, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", padding: "2px 9px", borderRadius: 4, fontFamily: C.mono, letterSpacing: "0.15em" }}>URGENTE</span>}
                  {!tieneUrgente && tieneProxima && <span style={{ fontSize: 8, color: C.amber, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)", padding: "2px 9px", borderRadius: 4, fontFamily: C.mono, letterSpacing: "0.15em" }}>PRÓXIMA</span>}
                </div>
              </div>

              {ocs.map((oc, ocIdx) => {
                const urg  = ocUrgencia(oc);
                const ocC  = C.oc[oc.estado] ?? C.oc.pendiente;
                const isLast = ocIdx === ocs.length - 1;
                return (
                  <div key={oc.id} style={{ padding: "12px 18px", borderBottom: isLast ? "none" : `1px solid ${C.b0}`, display: "flex", alignItems: "flex-start", gap: 14, background: urg && ["vencida","hoy"].includes(urg.nivel) ? "rgba(239,68,68,0.025)" : "transparent" }}>
                    <div style={{ flexShrink: 0, width: 96 }}>
                      <div style={{ fontSize: 8, color: C.t2, textTransform: "uppercase", fontFamily: C.mono, letterSpacing: "0.18em", marginBottom: 5 }}>{oc.tipo ?? "aviso"}</div>
                      <span style={{ fontSize: 9, padding: "2px 9px", borderRadius: 4, background: ocC.bg, color: ocC.dot, border: `1px solid ${ocC.border}`, fontFamily: C.mono, letterSpacing: "0.08em", display: "inline-block" }}>{ocC.label}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: C.t0, fontWeight: 600 }}>{oc.etapa_nombre ?? "—"}</span>
                        {oc.numero_oc && <span style={{ fontFamily: C.mono, fontSize: 9, color: "#93c5fd", background: "rgba(59,130,246,0.10)", padding: "1px 7px", borderRadius: 4, border: "1px solid rgba(59,130,246,0.22)" }}>{oc.numero_oc}</span>}
                      </div>
                      {oc.descripcion && <div style={{ fontSize: 10, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{oc.descripcion}</div>}
                      {oc.proveedor && <div style={{ fontSize: 10, color: C.t1, marginBottom: 4 }}>{oc.proveedor}</div>}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {oc.fecha_limite_pedido && <span style={{ fontSize: 9, color: urg?.color ?? C.t2, fontFamily: C.mono }}><span style={{ opacity: 0.7 }}>límite</span> {urg ? urg.label : fmtDate(oc.fecha_limite_pedido)}</span>}
                        {oc.fecha_pedido && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}><span style={{ opacity: 0.7 }}>pedido</span> {fmtDate(oc.fecha_pedido)}</span>}
                        {oc.fecha_estimada_entrega && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}><span style={{ opacity: 0.7 }}>entrega</span> {fmtDate(oc.fecha_estimada_entrega)}</span>}
                      </div>
                    </div>
                    {(oc.monto_estimado || oc.monto_real) && (
                      <div style={{ flexShrink: 0, textAlign: "right", minWidth: 80 }}>
                        {oc.monto_real ? <div style={{ fontSize: 13, color: "#6ee7b7", fontFamily: C.mono, fontWeight: 700 }}>${Number(oc.monto_real).toLocaleString("es-AR")}</div> : <div style={{ fontSize: 12, color: C.t2, fontFamily: C.mono }}>~${Number(oc.monto_estimado).toLocaleString("es-AR")}</div>}
                        <div style={{ fontSize: 8, color: C.t2, marginTop: 2, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: C.mono }}>{oc.monto_real ? "real" : "estimado"}</div>
                      </div>
                    )}
                    {esGestion && (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                        <Btn variant="outline" sx={{ padding: "3px 11px", fontSize: 10 }} onClick={() => onEditOC(oc)}>Editar</Btn>
                        {!["recibida","cancelada"].includes(oc.estado) && (
                          <div style={{ display: "flex", gap: 3 }}>
                            {OC_FLOW.indexOf(oc.estado) < OC_FLOW.length - 1 && (
                              <button type="button" onClick={() => cambiarEstadoOC(oc.id, OC_FLOW[OC_FLOW.indexOf(oc.estado) + 1])} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(16,185,129,0.30)", background: "rgba(16,185,129,0.07)", color: "#6ee7b7", cursor: "pointer", fontFamily: C.mono, whiteSpace: "nowrap" }}>→ {C.oc[OC_FLOW[OC_FLOW.indexOf(oc.estado) + 1]]?.label}</button>
                            )}
                            <button type="button" onClick={() => cambiarEstadoOC(oc.id, "cancelada")} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontFamily: C.mono }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NAV ICONS ───────────────────────────────────────────────
const NavIcon = {
  Grid: () => (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="7" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="0.5"/><rect x="7" y="7" width="4" height="4" rx="0.5"/></svg>),
  Map:  () => (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="1,2 4,1 8,3 11,2 11,10 8,11 4,9 1,10"/><line x1="4" y1="1" x2="4" y2="9"/><line x1="8" y1="3" x2="8" y2="11"/></svg>),
  Cart: () => (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1h2l1.5 6h5l1-4H3.5"/><circle cx="5.5" cy="10" r="0.8" fill="currentColor"/><circle cx="9" cy="10" r="0.8" fill="currentColor"/></svg>),
  Cal:  () => (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="10" height="9" rx="1"/><line x1="1" y1="5" x2="11" y2="5"/><line x1="4" y1="1" x2="4" y2="3"/><line x1="8" y1="1" x2="8" y2="3"/></svg>),
  Gear: () => (<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5" cy="5" r="1.5"/><path d="M5 1v1M5 8v1M1 5h1M8 5h1M2.1 2.1l.7.7M7.2 7.2l.7.7M7.9 2.1l-.7.7M2.8 7.2l-.7.7"/></svg>),
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL — ObrasScreen
// ═══════════════════════════════════════════════════════════════
export default function ObrasScreen({ profile, signOut }) {
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || ["admin", "oficina"].includes(profile?.role);

  const [obras,    setObras]    = useState([]);
  const [etapas,   setEtapas]   = useState([]);
  const [tareas,   setTareas]   = useState([]);
  const [lineas,   setLineas]   = useState([]);
  const [lProcs,   setLProcs]   = useState([]);
  const [lTareas,  setLTareas]  = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [ordenes,  setOrdenes]  = useState([]);
  const [archCounts, setArchCounts] = useState({});
  const [loading,  setLoading]  = useState(true);

  const [filtroEstado,   setFiltroEstado]   = useState("activa");
  const [filtroLinea,    setFiltroLinea]    = useState("todas");
  const [expandedObras,  setExpandedObras]  = useState(new Set());
  const [expandedEtapas, setExpandedEtapas] = useState(new Set());

  const [mainView,      setMainView]      = useState("obras");
  const [showObraModal, setShowObraModal] = useState(false);
  const [etapaModal,    setEtapaModal]    = useState(null);
  const [tareaModal,    setTareaModal]    = useState(null);
  const [tareaDetalle,  setTareaDetalle]  = useState(null);
  const [confirmModal,  setConfirmModal]  = useState(null);
  const [lineasModal,   setLineasModal]   = useState(null);
  const [ocModal,       setOcModal]       = useState(null);
  const [mapaPanel,     setMapaPanel]     = useState(null);

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
      safeQuery(supabase.from("produccion_obras").select("*").order("created_at", { ascending: false })),
      safeQuery(supabase.from("obra_etapas").select("*").order("obra_id").order("orden")),
      safeQuery(supabase.from("obra_tareas").select("*").order("etapa_id").order("orden")),
      supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden"),
      supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden"),
      safeQuery(supabase.from("linea_proceso_tareas").select("*").order("linea_proceso_id").order("orden")),
      safeQuery(supabase.from("obra_timeline").select("*, linea_procesos(id,nombre,orden,dias_estimados,color)").order("created_at")),
      safeQuery(supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false })),
    ]);
    // FIX: assignments correctos — r6=lTareas, r7=timeline, r8=ordenes
    setObras(r1); setEtapas(r2); setTareas(r3);
    setLineas(r4.data ?? []); setLProcs(r5.data ?? []);
    setLTareas(r6); setTimeline(r7); setOrdenes(r8);

    const counts = await safeQuery(supabase.from("obra_tarea_archivos").select("tarea_id").not("tarea_id", "is", null));
    const map = {};
    counts.forEach(row => { map[row.tarea_id] = (map[row.tarea_id] ?? 0) + 1; });
    setArchCounts(map);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-v9")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras"     }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_etapas"          }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tareas"          }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra"       }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tarea_archivos"  }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── HELPERS ───────────────────────────────────────────────────
  const etapasDeObra = useCallback((obraId) => {
    const fromNew = etapas.filter(e => e.obra_id === obraId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    if (fromNew.length) return fromNew;
    const obra = obras.find(o => o.id === obraId);
    if (!obra?.linea_id) return [];
    const procs = lProcs.filter(p => p.linea_id === obra.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return procs.map(p => {
      const tl = timeline.find(t => t.obra_id === obraId && t.linea_proceso_id === p.id);
      return {
        id: `virtual-${obraId}-${p.id}`, obra_id: obraId, isVirtual: true,
        linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden,
        color: p.color, dias_estimados: p.dias_estimados,
        estado: tl?.estado === "completado" ? "completado" : tl?.estado === "en_curso" ? "en_curso" : "pendiente",
        fecha_inicio: tl?.fecha_inicio, fecha_fin_real: tl?.fecha_fin,
      };
    });
  }, [etapas, timeline, obras, lProcs]);

  const tareasDeEtapa = useCallback((etapaId) =>
    tareas.filter(t => t.etapa_id === etapaId).sort((a, b) => {
      const pOrd = { critica: 0, alta: 1, media: 2, baja: 3 };
      if (a.prioridad !== b.prioridad) return (pOrd[a.prioridad] ?? 2) - (pOrd[b.prioridad] ?? 2);
      return (a.orden ?? 0) - (b.orden ?? 0);
    }), [tareas]);

  const pctEtapa = useCallback((etapaId) => {
    if (String(etapaId).startsWith("virtual")) return 0;
    const ts = tareasDeEtapa(etapaId);
    if (!ts.length) return 0;
    return pct(ts.filter(t => t.estado === "finalizada").length, ts.length);
  }, [tareasDeEtapa]);

  const pctObra = useCallback((obraId) => {
    const es = etapasDeObra(obraId);
    if (!es.length) return 0;
    const allTareas = es.flatMap(e => !e.isVirtual ? tareasDeEtapa(e.id) : []);
    if (allTareas.length) return pct(allTareas.filter(t => t.estado === "finalizada").length, allTareas.length);
    return pct(es.filter(e => e.estado === "completado").length, es.length);
  }, [etapasDeObra, tareasDeEtapa]);

  const alertCountOC = useMemo(() => ordenes.filter(oc => {
    if (!["pendiente","solicitada"].includes(oc.estado)) return false;
    const u = ocUrgencia(oc); return u && ["vencida","hoy","urgente","proxima"].includes(u.nivel);
  }).length, [ordenes]);

  const alertCountAvisos = useMemo(() => {
    const avisosEtapas = etapas.filter(e => e.genera_orden_compra && !e.isVirtual);
    return avisosEtapas.filter(e => {
      if (!["completado","en_curso"].includes(e.estado)) return false;
      return !ordenes.some(oc => oc.obra_id === e.obra_id && oc.etapa_nombre === e.nombre);
    }).length;
  }, [etapas, ordenes]);

  // ── ACCIONES ─────────────────────────────────────────────────
  const toggleObra  = id => setExpandedObras(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleEtapa = id => setExpandedEtapas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function abrirNuevaTarea(etapa) {
    let etapaId = etapa.id;
    let obraId  = etapa.obra_id;
    if (etapa.isVirtual) {
      const { data, error } = await supabase.from("obra_etapas").insert({
        obra_id: etapa.obra_id, linea_proceso_id: etapa.linea_proceso_id,
        nombre: etapa.nombre, orden: etapa.orden ?? 999,
        color: etapa.color ?? "#64748b", dias_estimados: etapa.dias_estimados,
        estado: etapa.estado ?? "pendiente",
      }).select().single();
      if (error) { alert("No se pudo crear la etapa: " + error.message); return; }
      etapaId = data.id;
      await cargar();
    }
    setTareaModal({ etapaId, obraId });
  }

  async function cambiarEstadoObra(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = today();
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    cargar();
  }

  async function cambiarEstadoEtapa(etapaId, estado) {
    if (String(etapaId).startsWith("virtual")) return;
    const upd = { estado };
    if (estado === "completado") upd.fecha_fin_real = today();
    await supabase.from("obra_etapas").update(upd).eq("id", etapaId);
    if (estado === "completado") {
      const etapa = etapas.find(e => e.id === etapaId);
      if (etapa?.genera_orden_compra) {
        const obra = obras.find(o => o.id === etapa.obra_id);
        supabase.from("ordenes_compra").insert({
          obra_id: etapa.obra_id, etapa_id: etapa.id, etapa_nombre: etapa.nombre,
          tipo: etapa.orden_compra_tipo ?? "aviso",
          descripcion: etapa.orden_compra_descripcion ?? null,
          monto_estimado: etapa.orden_compra_monto_estimado ?? null,
          dias_previo_aviso: etapa.orden_compra_dias_previo ?? 7,
          obra_codigo: obra?.codigo ?? null, linea_nombre: obra?.linea_nombre ?? null,
          estado: "pendiente", fecha_creacion: today(),
        }).then(({ error }) => { if (error) console.warn("ordenes_compra:", error.message); });
      }
    }
    cargar();
  }

  async function cambiarEstadoTarea(tareaId, estado) {
    const upd = { estado };
    if (estado === "finalizada") upd.fecha_fin_real = today();
    await supabase.from("obra_tareas").update(upd).eq("id", tareaId);
    cargar();
  }

  function pedirBorrado(item, tipo) {
    const ads = {
      obra:  "Se borrarán sus etapas, tareas y archivos.",
      etapa: "Se borrarán las tareas y archivos de esta etapa.",
      tarea: "Se eliminará la tarea y todos sus archivos adjuntos.",
    };
    setConfirmModal({
      nombre: item.nombre ?? item.codigo, tipo, advertencia: ads[tipo],
      async onConfirm() {
        try {
          if (tipo === "obra") {
            await supabase.from("produccion_obras").delete().eq("id", item.id);
            await supabase.from("laminacion_obras").delete().eq("nombre", item.codigo);
          } else if (tipo === "etapa") {
            await supabase.from("obra_etapas").delete().eq("id", item.id);
          } else if (tipo === "tarea") {
            const archivos = await safeQuery(supabase.from("obra_tarea_archivos").select("storage_path").eq("tarea_id", item.id));
            if (archivos.length) await supabase.storage.from(STORAGE_BUCKET).remove(archivos.map(a => a.storage_path));
            await supabase.from("obra_tareas").delete().eq("id", item.id);
          }
        } catch (err) { console.error(err); }
        setConfirmModal(null); cargar();
      },
    });
  }

  async function importarTareasAObraExistente(obra) {
    const { data: etapasObra, error: eEt } = await supabase.from("obra_etapas").select("id, linea_proceso_id").eq("obra_id", obra.id);
    if (eEt || !etapasObra?.length) { alert("No se encontraron etapas en esta obra."); return; }
    const procIds = etapasObra.map(e => e.linea_proceso_id).filter(Boolean);
    if (!procIds.length) { alert("Las etapas no tienen proceso de línea asociado."); return; }
    const { data: tPlantilla } = await supabase.from("linea_proceso_tareas").select("*").in("linea_proceso_id", procIds).order("orden");
    if (!tPlantilla?.length) { alert("No hay tareas en la plantilla de esta línea."); return; }
    const tareasAInsertar = [];
    for (const etapa of etapasObra) {
      for (const tp of tPlantilla.filter(t => t.linea_proceso_id === etapa.linea_proceso_id)) {
        tareasAInsertar.push({ obra_id: obra.id, etapa_id: etapa.id, nombre: tp.nombre, orden: tp.orden ?? 999, estado: "pendiente", prioridad: tp.prioridad ?? "media", horas_estimadas: tp.horas_estimadas ?? null, personas_necesarias: tp.personas_necesarias ?? null, observaciones: tp.observaciones ?? null });
      }
    }
    if (!tareasAInsertar.length) { alert("No se encontraron tareas para importar."); return; }
    const { error } = await supabase.from("obra_tareas").insert(tareasAInsertar);
    if (error) { alert("Error al insertar tareas: " + error.message); return; }
    cargar();
  }

  // ── DERIVADOS ─────────────────────────────────────────────────
  const obrasFilt = useMemo(() => obras.filter(o => {
    if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
    if (filtroLinea  !== "todas" && o.linea_id !== filtroLinea) return false;
    return true;
  }), [obras, filtroEstado, filtroLinea]);

  const stats = useMemo(() => ({
    activas:    obras.filter(o => o.estado === "activa").length,
    pausadas:   obras.filter(o => o.estado === "pausada").length,
    terminadas: obras.filter(o => o.estado === "terminada").length,
  }), [obras]);

  const obrasConPct = useMemo(
    () => obras.map(o => ({ ...o, _pct: pctObra(o.id) })),
    [obras, pctObra]
  );

  // ══════════════════════════════════════════════════════════════
  //  HUD CIRCULAR — widget de progreso tipo instrumento naval
  // ══════════════════════════════════════════════════════════════
  function HudCircle({ value = 0, color = C.primary, size = 44, stroke = 3 }) {
    const r   = (size - stroke * 2) / 2;
    const circ = 2 * Math.PI * r;
    const dash = circ * (value / 100);
    return (
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.05)"
          strokeWidth={stroke} />
        {/* Fill */}
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 4px ${color}80)`,
            transition: "stroke-dasharray .7s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </svg>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  STAT CARD — panel de instrumentos superior
  // ══════════════════════════════════════════════════════════════
  function StatCard({ label, value, color, sublabel, icon }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 14px 6px 10px",
        borderRadius: 9,
        background: "rgba(255,255,255,0.025)",
        border: `1px solid rgba(255,255,255,0.07)`,
        borderLeft: `2px solid ${color}`,
        boxShadow: `0 0 14px ${color}18, inset 0 1px 0 rgba(255,255,255,0.04)`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        transition: "box-shadow .2s",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Glow de fondo */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 60% 80% at 10% 50%, ${color}08, transparent)`,
        }} />
        {icon && <span style={{ fontSize: 14, flexShrink: 0, position: "relative" }}>{icon}</span>}
        <div style={{ position: "relative" }}>
          <div style={{
            fontFamily: C.mono, fontSize: 18, fontWeight: 700,
            color, lineHeight: 1, letterSpacing: "-0.02em",
            textShadow: `0 0 12px ${color}60`,
          }}>
            {value}
          </div>
          <div style={{ fontSize: 8, color: C.t2, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 2 }}>
            {label}
          </div>
        </div>
        {sublabel && (
          <div style={{ fontSize: 8, color: C.t2, marginLeft: "auto", letterSpacing: "0.1em", fontFamily: C.mono, position: "relative" }}>
            {sublabel}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  NAV BUTTON
  // ══════════════════════════════════════════════════════════════
  function NavBtn({ view, label, icon, accentColor, badge }) {
    const active = mainView === view;
    return (
      <button type="button" onClick={() => { setMainView(view); if (view === "mapa") setMapaPanel(null); }}
        style={{
          padding: "5px 15px", borderRadius: 7, cursor: "pointer",
          fontSize: 11, fontFamily: C.sans, letterSpacing: "0.02em",
          border: active ? `1px solid ${accentColor ?? C.b1}55` : `1px solid ${C.b0}`,
          background: active
            ? `${accentColor ? accentColor + "18" : C.s1}`
            : "transparent",
          color: active ? (accentColor ? accentColor + "ee" : C.t0) : C.t1,
          boxShadow: active ? `0 0 16px ${accentColor ?? C.primary}20, inset 0 1px 0 rgba(255,255,255,0.06)` : "none",
          transition: "all .18s",
          position: "relative",
          display: "flex", alignItems: "center", gap: 6,
        }}>
        {icon}
        {label}
        {badge > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            minWidth: 16, height: 16, borderRadius: 8,
            background: C.red, color: "#fff",
            fontSize: 8, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
            boxShadow: "0 0 8px rgba(239,68,68,0.5)",
            fontFamily: C.mono,
          }}>{badge}</span>
        )}
      </button>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  TREE PANEL
  // ══════════════════════════════════════════════════════════════
  function TreePanel() {
    return (
      <div style={{
        width: 256, flexShrink: 0,
        borderRight: `1px solid ${C.b0}`,
        background: "rgba(8,10,15,0.90)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        position: "relative",
      }}>
        {/* Rejilla técnica lateral */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: [
            "linear-gradient(rgba(59,130,246,0.015) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(59,130,246,0.015) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "24px 24px",
        }} />

        {/* Header del panel */}
        <div style={{
          padding: "12px 14px 10px",
          borderBottom: `1px solid ${C.b0}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0, position: "relative", zIndex: 1,
          background: "rgba(255,255,255,0.01)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 1, height: 14, background: `linear-gradient(180deg, transparent, ${C.primary}, transparent)` }} />
            <span style={{ fontSize: 8, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono }}>
              PROYECTOS
            </span>
          </div>
          {esGestion && (
            <Btn variant="primary" sx={{ padding: "3px 10px", fontSize: 9 }} onClick={() => setShowObraModal(true)}>
              + Obra
            </Btn>
          )}
        </div>

        {/* Lista scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0", position: "relative", zIndex: 1 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 16px", color: C.t2, fontSize: 10, fontFamily: C.mono, letterSpacing: "0.1em" }}>
              Cargando…
            </div>
          )}

          {!loading && obrasFilt.map(obra => {
            const obraEtapas = etapasDeObra(obra.id);
            const expanded   = expandedObras.has(obra.id);
            const obrapct    = pctObra(obra.id);
            const oC         = C.obra[obra.estado] ?? C.obra.activa;

            return (
              <div key={obra.id} style={{ marginBottom: 1 }}>
                {/* Fila de obra */}
                <div
                  onClick={() => toggleObra(obra.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 14px 7px 10px", cursor: "pointer",
                    borderLeft: expanded ? `2px solid ${oC.dot}` : "2px solid transparent",
                    background: expanded ? `${oC.dot}08` : "transparent",
                    transition: "all .18s",
                  }}
                >
                  <span style={{
                    fontSize: 7, color: C.t2, width: 10, flexShrink: 0,
                    display: "inline-block",
                    transform: expanded ? "rotate(90deg)" : "none",
                    transition: "transform .18s",
                  }}>▶</span>

                  {/* HUD mini */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <HudCircle value={obrapct} color={oC.dot} size={28} stroke={2.5} />
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Dot color={oC.dot} size={5} glow ping={obra.estado === "activa" && obrapct > 0 && obrapct < 100} />
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: C.mono, fontSize: 11, color: expanded ? C.t0 : C.t1,
                      letterSpacing: "0.06em", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                      transition: "color .18s",
                    }}>
                      {obra.codigo}
                    </div>
                    {obra.linea_nombre && (
                      <div style={{ fontSize: 8, color: C.t2, letterSpacing: "0.1em", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {obra.linea_nombre}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 8, color: obrapct === 100 ? C.green : oC.dot, fontFamily: C.mono, flexShrink: 0, letterSpacing: "0.04em" }}>
                    {obrapct}%
                  </span>
                </div>

                {expanded && (
                  <div style={{ paddingBottom: 4 }}>
                    {obraEtapas.map(etapa => {
                      const etapaT = tareasDeEtapa(etapa.id);
                      const etExp  = expandedEtapas.has(etapa.id);
                      return (
                        <div key={etapa.id}>
                          <div
                            onClick={() => toggleEtapa(etapa.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "4px 14px 4px 28px", cursor: "pointer",
                              transition: "background .12s",
                            }}
                          >
                            <span style={{
                              fontSize: 6, color: C.t2, width: 8, flexShrink: 0,
                              transform: etExp ? "rotate(90deg)" : "none",
                              display: "inline-block", transition: "transform .15s",
                            }}>▶</span>
                            <div style={{
                              width: 3, height: 14, borderRadius: 2,
                              background: etapa.color ?? C.t2, flexShrink: 0,
                              boxShadow: `0 0 5px ${etapa.color ?? C.t2}60`,
                            }} />
                            <span style={{
                              flex: 1, fontSize: 10, color: C.t2,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {etapa.nombre}
                            </span>
                            {etapaT.length > 0 && (
                              <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono }}>{etapaT.length}</span>
                            )}
                          </div>

                          {etExp && (
                            <>
                              {etapaT.map(tarea => {
                                const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
                                const pc = C.prioridad[tarea.prioridad ?? "media"];
                                return (
                                  <div
                                    key={tarea.id}
                                    onClick={() => setTareaDetalle(tarea)}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 5,
                                      padding: "3px 14px 3px 46px", cursor: "pointer",
                                      transition: "background .12s",
                                    }}
                                  >
                                    <div style={{ width: 2, height: 9, borderRadius: 1, background: pc.color, flexShrink: 0 }} />
                                    <Dot color={tc.text} size={4} glow={tarea.estado === "en_progreso"} />
                                    <span style={{
                                      fontSize: 10, color: C.t2, flex: 1, minWidth: 0,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {tarea.nombre}
                                    </span>
                                  </div>
                                );
                              })}
                              {esGestion && (
                                <div
                                  onClick={() => abrirNuevaTarea(etapa)}
                                  style={{ padding: "3px 14px 3px 46px", cursor: "pointer" }}
                                >
                                  <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>+ tarea</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    {esGestion && (
                      <div
                        onClick={() => setEtapaModal({ obraId: obra.id })}
                        style={{ padding: "4px 14px 4px 28px", cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>+ etapa</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && !obrasFilt.length && (
            <div style={{
              textAlign: "center", padding: "32px 16px",
              color: C.t2, fontSize: 10, fontFamily: C.mono,
              letterSpacing: "0.1em",
            }}>
              SIN OBRAS
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  GANTT MAIN
  // ══════════════════════════════════════════════════════════════
  function GanttMain() {
    if (loading) return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: C.t2, fontSize: 10, letterSpacing: "0.25em", fontFamily: C.mono,
      }}>
        CARGANDO…
      </div>
    );

    if (!obrasFilt.length) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            border: `1px solid ${C.b0}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, color: C.t2,
            boxShadow: `0 0 30px ${C.b0}`,
          }}>◎</div>
          <div style={{ color: C.t2, fontSize: 10, letterSpacing: "0.25em", fontFamily: C.mono, textTransform: "uppercase" }}>
            Sin obras con este filtro
          </div>
          {esGestion && (
            <div style={{ marginTop: 18 }}>
              <Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn>
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
        {obrasFilt.map(obra => {
          const obraEtapas = etapasDeObra(obra.id);
          const totalDias  = obraEtapas.reduce((s, e) => s + num(e.dias_estimados), 0) || 1;
          const diasR      = diasDesde(obra.fecha_inicio);
          const obrapct    = pctObra(obra.id);
          const oC         = C.obra[obra.estado] ?? C.obra.activa;
          const expanded   = expandedObras.has(obra.id);

          return (
            <div key={obra.id} style={{ marginBottom: 18 }}>
              {/* ── OBRA ROW ── */}
              <div
                onClick={() => toggleObra(obra.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: expanded
                    ? `linear-gradient(90deg, ${oC.dot}0a, rgba(255,255,255,0.02))`
                    : "rgba(255,255,255,0.022)",
                  border: `1px solid ${expanded ? oC.border : C.b0}`,
                  borderLeft: `3px solid ${oC.dot}`,
                  cursor: "pointer",
                  boxShadow: expanded ? `0 0 20px ${oC.dot}14, inset 0 1px 0 rgba(255,255,255,0.05)` : "none",
                  transition: "all .2s ease",
                }}
              >
                {/* Caret */}
                <span style={{
                  fontSize: 9, color: C.t2, flexShrink: 0,
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform .2s", display: "inline-block",
                }}>▶</span>

                {/* HUD circular */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <HudCircle value={obrapct} color={oC.dot} size={40} stroke={3} />
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontFamily: C.mono, fontSize: 8, color: oC.dot, fontWeight: 700, lineHeight: 1, letterSpacing: "0" }}>
                      {obrapct}
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 6, color: C.t2, lineHeight: 1 }}>%</span>
                  </div>
                </div>

                {/* Código */}
                <div style={{ flex: "0 0 auto", minWidth: 90 }}>
                  <div style={{
                    fontFamily: C.mono, fontSize: 14, color: C.t0,
                    fontWeight: 700, letterSpacing: "0.06em",
                    textShadow: expanded ? `0 0 16px ${oC.dot}50` : "none",
                  }}>
                    {obra.codigo}
                  </div>
                  {obra.linea_nombre && (
                    <div style={{ fontSize: 8, color: C.t2, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 1 }}>
                      {obra.linea_nombre}
                    </div>
                  )}
                </div>

                {/* Barra de progreso */}
                <div style={{ flex: 1 }}>
                  <ProgressBar value={obrapct} color={oC.dot} height={4} animated={obra.estado === "activa"} />
                  {/* Etapas mini strip */}
                  {obraEtapas.length > 0 && (
                    <div style={{ display: "flex", height: 3, marginTop: 4, borderRadius: 2, overflow: "hidden", gap: "1px" }}>
                      {obraEtapas.map(e => {
                        const ec = C.etapa[e.estado] ?? C.etapa.pendiente;
                        return (
                          <div key={e.id} title={e.nombre} style={{
                            flex: num(e.dias_estimados) / totalDias,
                            height: "100%",
                            background: e.estado === "completado" ? "#10b981" : e.estado === "en_curso" ? "#3b82f6" : "rgba(255,255,255,0.06)",
                            borderRadius: 1,
                            boxShadow: e.estado === "en_curso" ? "0 0 4px #3b82f680" : "none",
                          }} />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Métricas */}
                <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: oC.dot, fontWeight: 700 }}>{diasR}d</div>
                    <div style={{ fontSize: 8, color: C.t2, letterSpacing: "0.1em" }}>ACTIVA</div>
                  </div>
                  {obra.fecha_fin_estimada && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.t1 }}>{fmtDate(obra.fecha_fin_estimada)}</div>
                      <div style={{ fontSize: 8, color: C.t2, letterSpacing: "0.1em" }}>FIN EST.</div>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                {esGestion && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <Btn variant="sm"
                      sx={{ fontSize: 9, padding: "2px 9px" }}
                      onClick={() => cambiarEstadoObra(obra.id, obra.estado === "activa" ? "pausada" : "activa")}>
                      {obra.estado === "activa" ? "Pausar" : "Activar"}
                    </Btn>
                    {obra.estado !== "terminada" && (
                      <Btn variant="sm"
                        sx={{ fontSize: 9, padding: "2px 9px", color: "#6ee7b7", borderColor: "rgba(16,185,129,0.30)" }}
                        onClick={() => cambiarEstadoObra(obra.id, "terminada")}>
                        ✓
                      </Btn>
                    )}
                    <button type="button"
                      onClick={() => pedirBorrado(obra, "obra")}
                      style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* ── ETAPAS EXPANDIDAS ── */}
              {expanded && (
                <div style={{ paddingLeft: 16, paddingTop: 8 }}>

                  {/* Botón importar tareas */}
                  {esGestion && !tareas.some(t => t.obra_id === obra.id) && (
                    <button type="button"
                      onClick={() => importarTareasAObraExistente(obra)}
                      style={{
                        width: "100%", marginBottom: 12,
                        padding: "10px 16px", borderRadius: 9, cursor: "pointer",
                        border: "1px solid rgba(16,185,129,0.35)",
                        background: "rgba(16,185,129,0.07)",
                        color: "#6ee7b7", fontSize: 11, fontFamily: C.sans,
                        fontWeight: 600,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: "0 0 16px rgba(16,185,129,0.08)",
                        transition: "all .18s",
                      }}>
                      ⬇ Importar tareas desde plantilla de línea
                    </button>
                  )}

                  {/* TIMELINE BAR */}
                  {obraEtapas.length > 0 && (
                    <div style={{
                      marginBottom: 12,
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.018)",
                      border: `1px solid ${C.b0}`,
                      borderRadius: 9,
                    }}>
                      {/* Etiquetas */}
                      <div style={{ display: "flex", paddingLeft: 0, marginBottom: 4 }}>
                        {obraEtapas.map(e => (
                          <div key={e.id} style={{
                            flex: num(e.dias_estimados) / totalDias,
                            fontSize: 7, color: C.t2,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            overflow: "hidden", textOverflow: "clip",
                            whiteSpace: "nowrap", textAlign: "center",
                            fontFamily: C.mono,
                          }}>
                            {e.nombre}
                          </div>
                        ))}
                      </div>
                      {/* Barra de segmentos */}
                      <div style={{
                        height: 16, display: "flex",
                        borderRadius: 6, overflow: "hidden",
                        border: `1px solid ${C.b0}`,
                        background: "rgba(0,0,0,0.40)",
                      }}>
                        {obraEtapas.map((e, idx) => {
                          const ec = C.etapa[e.estado] ?? C.etapa.pendiente;
                          const bgMap = {
                            completado: `linear-gradient(90deg, rgba(16,185,129,0.25), rgba(16,185,129,0.45))`,
                            en_curso:   `linear-gradient(90deg, rgba(59,130,246,0.20), rgba(59,130,246,0.40))`,
                            bloqueado:  `linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.30))`,
                            pendiente:  "rgba(255,255,255,0.03)",
                          };
                          return (
                            <div key={e.id} title={`${e.nombre} · ${e.estado}`} style={{
                              flex: num(e.dias_estimados) / totalDias,
                              height: "100%",
                              background: bgMap[e.estado] ?? bgMap.pendiente,
                              borderRight: idx < obraEtapas.length - 1 ? "1px solid rgba(0,0,0,0.4)" : "none",
                              boxShadow: e.estado === "en_curso" ? "inset 0 0 8px rgba(59,130,246,0.3)" : "none",
                              animation: e.estado === "en_curso" ? "gPulse 2.8s ease infinite" : "none",
                              position: "relative",
                            }}>
                              {e.estado === "completado" && (
                                <div style={{
                                  position: "absolute", inset: 0,
                                  background: "linear-gradient(180deg, rgba(16,185,129,0.15) 0%, transparent 60%)",
                                  pointerEvents: "none",
                                }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Metadatos */}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono, letterSpacing: "0.1em" }}>
                          {obraEtapas.filter(e => e.estado === "completado").length}/{obraEtapas.length} etapas completadas
                        </span>
                        <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono }}>
                          {diasR}d transcurridos
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ETAPAS */}
                  {obraEtapas.map(etapa => {
                    const etapaT = tareasDeEtapa(etapa.id);
                    const etExp  = expandedEtapas.has(etapa.id);
                    const ec     = C.etapa[etapa.estado] ?? C.etapa.pendiente;
                    const epct   = pctEtapa(etapa.id);

                    return (
                      <div key={etapa.id} style={{
                        marginBottom: 7,
                        border: `1px solid ${etExp ? C.b1 : C.b0}`,
                        borderLeft: `3px solid ${etapa.color ?? "#64748b"}`,
                        borderRadius: 9,
                        background: etExp ? "rgba(255,255,255,0.028)" : "rgba(255,255,255,0.018)",
                        boxShadow: etExp ? `0 0 14px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)` : "none",
                        transition: "all .2s ease",
                        overflow: "hidden",
                      }}>
                        {/* Cabecera de etapa */}
                        <div
                          onClick={() => toggleEtapa(etapa.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 9,
                            padding: "9px 12px", cursor: "pointer",
                          }}
                        >
                          <span style={{
                            fontSize: 7, color: C.t2, width: 9, flexShrink: 0,
                            transform: etExp ? "rotate(90deg)" : "none",
                            display: "inline-block", transition: "transform .15s",
                          }}>▶</span>

                          <div style={{ width: 118, flexShrink: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 12, color: C.t0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {etapa.nombre}
                              </span>
                              {etapa.genera_orden_compra && (
                                <span style={{
                                  fontSize: 7, color: C.amber,
                                  background: "rgba(245,158,11,0.10)",
                                  border: "1px solid rgba(245,158,11,0.22)",
                                  padding: "0px 5px", borderRadius: 3,
                                  fontFamily: C.mono, letterSpacing: "0.12em",
                                  flexShrink: 0,
                                }}>OC</span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: ec.text, marginTop: 1, fontFamily: C.mono, letterSpacing: "0.06em" }}>
                              {etapaT.length > 0
                                ? `${etapaT.filter(t => t.estado === "finalizada").length}/${etapaT.length} tareas`
                                : "Sin tareas"}
                            </div>
                          </div>

                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                            <ProgressBar value={epct} color={ec.dot} height={3} animated={etapa.estado === "en_curso"} />
                          </div>

                          <span style={{ fontFamily: C.mono, fontSize: 10, color: ec.text, flex: "0 0 30px", textAlign: "right", fontWeight: 600 }}>
                            {epct}%
                          </span>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 26px", textAlign: "right" }}>
                            {etapa.dias_estimados ?? 0}d
                          </span>

                          {/* Estado buttons */}
                          {esGestion && !etapa.isVirtual && (
                            <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {[
                                ["pendiente", "—", C.etapa.pendiente.dot],
                                ["en_curso",  "▶", C.etapa.en_curso.dot],
                                ["completado","✓", C.etapa.completado.dot],
                              ].map(([est, ico, clr]) => (
                                <button key={est} type="button"
                                  onClick={() => cambiarEstadoEtapa(etapa.id, est)}
                                  style={{
                                    width: 21, height: 21, borderRadius: 5, border: "none",
                                    cursor: "pointer", fontSize: 9,
                                    background: etapa.estado === est ? `${clr}22` : "rgba(255,255,255,0.03)",
                                    color: etapa.estado === est ? clr : C.t2,
                                    boxShadow: etapa.estado === est ? `0 0 6px ${clr}40` : "none",
                                    transition: "all .15s",
                                  }}>
                                  {ico}
                                </button>
                              ))}
                              <button type="button"
                                onClick={() => setEtapaModal({ etapa, obraId: etapa.obra_id })}
                                style={{
                                  width: 21, height: 21, borderRadius: 5, border: "none",
                                  cursor: "pointer", fontSize: 8,
                                  background: "transparent", color: C.t2,
                                  fontFamily: C.mono,
                                }}>
                                ✏
                              </button>
                              <button type="button"
                                onClick={() => pedirBorrado(etapa, "etapa")}
                                style={{
                                  border: "none", background: "transparent",
                                  color: C.t2, cursor: "pointer", fontSize: 13,
                                  padding: "0 3px", lineHeight: 1,
                                }}>
                                ×
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Tareas expandidas */}
                        {etExp && (
                          <div style={{ padding: "8px 12px 6px", borderTop: `1px solid ${C.b0}` }}>
                            <EtapaTareasSection
                              etapa={etapa}
                              tareas={etapaT}
                              archivosCount={archCounts}
                              esGestion={esGestion}
                              onCambiarEstado={cambiarEstadoTarea}
                              onEditar={t => setTareaModal({ tarea: t, etapaId: t.etapa_id, obraId: t.obra_id })}
                              onDetalle={t => setTareaDetalle(t)}
                              onEliminar={t => pedirBorrado(t, "tarea")}
                              onNueva={() => abrirNuevaTarea(etapa)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* + nueva etapa */}
                  {esGestion && (
                    <button type="button"
                      onClick={() => setEtapaModal({ obraId: obra.id })}
                      style={{
                        width: "100%", marginTop: 4,
                        padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                        border: `1px dashed ${C.b1}`,
                        background: "transparent", color: C.t2,
                        fontSize: 10, fontFamily: C.mono, letterSpacing: "0.1em",
                        transition: "border-color .15s, color .15s",
                      }}>
                      + NUEVA ETAPA
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bg,
      color: C.t0, fontFamily: C.sans, zIndex: 0,
    }}>
      <style>{`
        ${GLOBAL_STYLES}
      `}</style>

      {/* Fondo técnico con rejilla */}
      <div className="bg-technical" />

      <div style={{
        display: "grid", gridTemplateColumns: "220px 1fr",
        height: "100vh", overflow: "hidden",
        position: "relative", zIndex: 1,
      }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ══ TOPBAR — Panel de instrumentos ══ */}
          <div style={{
            height: 48,
            background: "rgba(8,10,16,0.94)",
            ...GLASS,
            borderBottom: `1px solid ${C.b0}`,
            padding: "0 18px",
            display: "flex", alignItems: "center", gap: 10,
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Línea de acento superior */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: "linear-gradient(90deg, transparent 5%, rgba(59,130,246,0.30) 30%, rgba(139,92,246,0.20) 60%, transparent 95%)",
              pointerEvents: "none",
            }} />

            {/* Stats cards */}
            <div style={{ display: "flex", gap: 6, flex: 1 }}>
              <StatCard
                label="Activas"
                value={stats.activas}
                color={C.obra.activa.dot}
                sublabel={`${obrasFilt.filter(o=>o.estado==="activa").length} vis.`}
              />
              <StatCard
                label="Pausadas"
                value={stats.pausadas}
                color={C.obra.pausada.dot}
              />
              <StatCard
                label="Terminadas"
                value={stats.terminadas}
                color={C.obra.terminada.dot}
              />
              {/* Separador vertical */}
              <div style={{ width: 1, background: C.b0, margin: "6px 4px", alignSelf: "stretch" }} />
              <StatCard
                label="Tareas hoy"
                value={tareas.filter(t => t.estado === "en_progreso").length}
                color={C.primary}
                icon="▶"
              />
              <StatCard
                label="OC urgentes"
                value={alertCountOC}
                color={alertCountOC > 0 ? C.red : C.t2}
                icon={alertCountOC > 0 ? "⚠" : undefined}
              />
            </div>

            {/* Nav buttons */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              <NavBtn view="obras"        label="Obras"        icon={<NavIcon.Grid />}  />
              <NavBtn view="mapa"         label="Mapa"         icon={<NavIcon.Map />}   accentColor="#8b5cf6" />
              <NavBtn view="ordenes"      label="Compras"      icon={<NavIcon.Cart />}  accentColor={C.amber} badge={alertCountOC} />
              <NavBtn view="planificacion" label="Planif."     icon={<NavIcon.Cal />}   accentColor={C.amber} badge={alertCountAvisos} />
            </div>

            {/* CTA nueva obra */}
            {mainView === "obras" && esGestion && (
              <Btn variant="primary" sx={{ flexShrink: 0 }} onClick={() => setShowObraModal(true)}>
                + Nueva obra
              </Btn>
            )}
          </div>

          {/* ══ FILTERBAR ══ */}
          {mainView === "obras" && (
            <div style={{
              height: 38,
              background: "rgba(8,10,16,0.88)",
              ...GLASS,
              borderBottom: `1px solid ${C.b0}`,
              padding: "0 18px",
              display: "flex", alignItems: "center", gap: 5,
              flexShrink: 0, overflowX: "auto",
              position: "relative",
            }}>
              {/* Separador de sección */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 7, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono }}>
                  ESTADO
                </span>
                {[
                  ["todos",     "Todos",     C.t1],
                  ["activa",    "Activas",   C.obra.activa.dot],
                  ["pausada",   "Pausadas",  C.obra.pausada.dot],
                  ["terminada", "Terminadas",C.obra.terminada.dot],
                ].map(([v, l, clr]) => (
                  <button key={v} type="button"
                    onClick={() => setFiltroEstado(v)}
                    style={{
                      border: filtroEstado === v ? `1px solid ${clr}40` : `1px solid rgba(255,255,255,0.05)`,
                      background: filtroEstado === v ? `${clr}14` : "transparent",
                      color: filtroEstado === v ? clr : C.t2,
                      padding: "3px 11px", borderRadius: 5, cursor: "pointer",
                      fontSize: 10, fontFamily: C.sans, letterSpacing: "0.02em",
                      boxShadow: filtroEstado === v ? `0 0 8px ${clr}20` : "none",
                      transition: "all .15s",
                    }}>
                    {l}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 14, background: C.b0, margin: "0 4px", flexShrink: 0 }} />

              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, flexWrap: "nowrap" }}>
                <span style={{ fontSize: 7, letterSpacing: "0.22em", color: C.t2, textTransform: "uppercase", fontFamily: C.mono }}>
                  LÍNEA
                </span>
                <button type="button"
                  onClick={() => setFiltroLinea("todas")}
                  style={{
                    border: filtroLinea === "todas" ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.05)`,
                    background: filtroLinea === "todas" ? C.s1 : "transparent",
                    color: filtroLinea === "todas" ? C.t0 : C.t2,
                    padding: "3px 11px", borderRadius: 5, cursor: "pointer",
                    fontSize: 10, fontFamily: C.sans, transition: "all .15s",
                  }}>
                  Todas
                </button>

                {lineas.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
                    <button type="button"
                      onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)}
                      style={{
                        border: filtroLinea === l.id ? `1px solid ${l.color ?? C.b1}40` : `1px solid rgba(255,255,255,0.05)`,
                        borderLeft: filtroLinea === l.id ? `2px solid ${l.color ?? C.primary}` : `1px solid rgba(255,255,255,0.05)`,
                        background: filtroLinea === l.id ? `${l.color ?? C.primary}12` : "transparent",
                        color: filtroLinea === l.id ? C.t0 : C.t2,
                        padding: "3px 11px", borderRadius: esGestion ? "5px 0 0 5px" : "5px",
                        cursor: "pointer", fontSize: 10, fontFamily: C.sans,
                        boxShadow: filtroLinea === l.id ? `0 0 8px ${l.color ?? C.primary}18` : "none",
                        transition: "all .15s",
                      }}>
                      {l.nombre}
                    </button>
                    {esGestion && (
                      <button type="button"
                        onClick={() => setLineasModal({ linea: l })}
                        style={{
                          border: filtroLinea === l.id ? `1px solid ${l.color ?? C.b1}30` : `1px solid rgba(255,255,255,0.05)`,
                          borderLeft: "none",
                          background: filtroLinea === l.id ? `${l.color ?? C.primary}08` : "transparent",
                          color: C.t2, padding: "3px 7px",
                          borderRadius: "0 5px 5px 0",
                          cursor: "pointer", fontSize: 9,
                          fontFamily: C.sans, transition: "all .15s",
                        }}>
                        <NavIcon.Gear />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Contador de resultados */}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono, letterSpacing: "0.1em" }}>
                  {obrasFilt.length} OBRA{obrasFilt.length !== 1 ? "S" : ""}
                </span>
                {obrasFilt.length < obras.length && (
                  <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono, opacity: 0.6 }}>
                    / {obras.length} total
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ══ VISTAS PRINCIPALES ══ */}
          {mainView === "obras" && (
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              <TreePanel />
              <GanttMain />
            </div>
          )}

          {mainView === "mapa" && (
            <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
              <MapaProduccion
                obras={obrasConPct}
                esGestion={esGestion}
                onPuestoClick={({ puesto, obra }) => setMapaPanel({ puesto, obra })}
                onAsignarObra={async (puestoId, obraId) => {
                  await supabase.from("produccion_obras").update({ puesto_mapa: puestoId }).eq("id", obraId);
                  cargar();
                }}
              />
              {mapaPanel && (
                <PanelDetallesObra
                  puesto={mapaPanel.puesto}
                  obra={mapaPanel.obra}
                  etapas={etapas}
                  ordenes={ordenes}
                  esGestion={esGestion}
                  onClose={() => setMapaPanel(null)}
                  onEditarObra={obra => { setMapaPanel(null); }}
                  onAsignarPuesto={async (puesto, obra) => {
                    await supabase.from("produccion_obras").update({ puesto_mapa: null }).eq("id", obra.id);
                    cargar();
                    setMapaPanel(null);
                  }}
                />
              )}
            </div>
          )}

          {mainView === "ordenes" && (
            <OrdenesCompraView
              ordenes={ordenes} obras={obras}
              esGestion={esGestion}
              onEditOC={oc => setOcModal(oc)}
              onRefresh={cargar}
            />
          )}

          {mainView === "planificacion" && (
            <PlanificacionView
              obras={obras} etapas={etapas}
              lProcs={lProcs} ordenes={ordenes}
              esGestion={esGestion}
              onNuevaOC={preload => setOcModal(preload)}
              onUpdateObra={async (id, fields) => {
                await supabase.from("produccion_obras").update(fields).eq("id", id);
                cargar();
              }}
              onUpdateOCEstado={async (ocId, nuevoEstado) => {
                const extra = nuevoEstado === "pedida"   ? { fecha_pedido: today() }
                            : nuevoEstado === "recibida" ? { fecha_recepcion: today() }
                            : {};
                await supabase.from("ordenes_compra").update({ estado: nuevoEstado, ...extra }).eq("id", ocId);
                cargar();
              }}
            />
          )}
        </div>
      </div>

      {/* ══ MODALES ══ */}
      {showObraModal && (
        <ObraModal
          lineas={lineas} lProcs={lProcs} lTareas={lTareas}
          onSave={nueva => {
            setShowObraModal(false); cargar();
            if (nueva?.id) setExpandedObras(s => new Set(s).add(nueva.id));
          }}
          onClose={() => setShowObraModal(false)}
        />
      )}
      {etapaModal   && <EtapaModal etapa={etapaModal.etapa} obraId={etapaModal.obraId} onSave={() => { setEtapaModal(null); cargar(); }} onClose={() => setEtapaModal(null)} />}
      {tareaModal   && <TareaModal tarea={tareaModal.tarea} etapaId={tareaModal.etapaId} obraId={tareaModal.obraId} onSave={() => { setTareaModal(null); cargar(); }} onClose={() => setTareaModal(null)} />}
      {tareaDetalle && <TareaDetalleModal tarea={tareaDetalle} esGestion={esGestion} onClose={() => setTareaDetalle(null)} onEditar={t => { setTareaDetalle(null); setTareaModal({ tarea: t, etapaId: t.etapa_id, obraId: t.obra_id }); }} />}
      {confirmModal && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}
      {lineasModal  && <LineasEtapasModal linea={lineasModal.linea} lProcs={lProcs} lTareas={lTareas} onClose={() => setLineasModal(null)} onSaved={cargar} />}
      {ocModal      && <OrdenCompraModal oc={ocModal} obras={obras} onSave={() => { setOcModal(null); cargar(); }} onClose={() => setOcModal(null)} />}
    </div>
  );
}