// Piezas de UI compartidas del módulo RRHH (estilo consistente con el resto del sistema).
import { C } from "@/theme";

export const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0,
  padding: "7px 10px", borderRadius: 7, fontSize: 13, outline: "none", fontFamily: C.sans,
};

export const BTN = {
  padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
  fontFamily: C.sans, fontWeight: 600, transition: "all .15s",
  background: C.s0, border: `1px solid ${C.b0}`, color: C.t1,
};

export const BTN_PRIMARY = {
  ...BTN,
  background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa",
};

export const BTN_GREEN = {
  ...BTN,
  background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: C.green,
};

export const LBL = {
  fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block",
  marginBottom: 4, textTransform: "uppercase", fontWeight: 700,
};

export const GRUPO_META = {
  casa:        { label: "Casa",        color: "#60a5fa" },
  contratista: { label: "Contratista", color: "#fbbf24" },
  sin_asignar: { label: "Sin asignar", color: "#f87171" },
};

export function GrupoBadge({ grupo, contratistaNombre }) {
  const meta = GRUPO_META[grupo] ?? GRUPO_META.sin_asignar;
  const label = grupo === "contratista" && contratistaNombre ? contratistaNombre : meta.label;
  return (
    <span style={{
      fontSize: 11, color: meta.color, background: `${meta.color}14`,
      border: `1px solid ${meta.color}33`, padding: "2px 8px", borderRadius: 5,
      fontFamily: C.sans, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

export function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "14px 18px", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: color ?? C.t0, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.t2, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function Cargando() {
  return <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Cargando…</div>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 16, margin: "16px 0" }}>
      <div style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>Error: {String(error?.message ?? error)}</div>
      {onRetry && <button onClick={onRetry} style={BTN}>Reintentar</button>}
    </div>
  );
}

// Cuando todavía no se corrió el SQL de las tablas en el dashboard.
export function SetupPendiente({ onRetry }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 22, maxWidth: 560 }}>
        <div style={{ fontSize: 14, color: C.amber, fontWeight: 700, marginBottom: 8 }}>⚠ Faltan crear las tablas de RRHH</div>
        <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, marginBottom: 14 }}>
          Hay que correr el SQL del módulo RRHH en <strong>Supabase → SQL Editor</strong> (el bloque que está en el chat:
          tablas <code style={{ fontFamily: C.mono, fontSize: 12 }}>rrhh_*</code> + seed de empleados y contratistas).
          Después tocá Reintentar.
        </div>
        <button onClick={onRetry} style={BTN_PRIMARY}>Reintentar</button>
      </div>
    </div>
  );
}

export function Th({ children, right }) {
  return (
    <th style={{
      textAlign: right ? "right" : "left", padding: "7px 10px", fontSize: 10,
      letterSpacing: 1.2, color: C.t2, textTransform: "uppercase", fontWeight: 700,
      borderBottom: `1px solid ${C.b0}`, whiteSpace: "nowrap", position: "sticky", top: 0,
      background: C.bg, zIndex: 2,
    }}>{children}</th>
  );
}

export function Td({ children, right, mono, color, style }) {
  return (
    <td style={{
      padding: "8px 10px", fontSize: 13, color: color ?? C.t0,
      textAlign: right ? "right" : "left",
      fontFamily: mono ? C.mono : C.sans,
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      whiteSpace: "nowrap", ...style,
    }}>{children}</td>
  );
}
