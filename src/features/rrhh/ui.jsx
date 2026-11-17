// Piezas de UI compartidas del módulo RRHH (estilo consistente con el resto del sistema).
import { C } from "@/theme";
import CargandoBloque from "@/components/ui/Cargando";

// Aire Azimut (a prueba): filete fino, casi sin radio, letra liviana. Lo usan
// RRHH y todo Materiales, así que el cambio de aspecto llega a los dos. Quien
// necesita un botón más chico adentro de una fila le pisa el padding, como
// hasta ahora.
export const INP = {
  background: "transparent", border: `1px solid ${C.b1}`, color: C.t0,
  padding: "9px 12px", borderRadius: 3, fontSize: 14, fontWeight: 400, lineHeight: "20px", outline: "none", fontFamily: C.sans,
};

export const BTN = {
  padding: "9px 14px", borderRadius: 3, cursor: "pointer", fontSize: 13, lineHeight: "18px", letterSpacing: ".02em",
  fontFamily: C.sans, fontWeight: 500, transition: "background-color .15s, border-color .15s, color .15s",
  background: "transparent", border: `1px solid ${C.b1}`, color: C.t0,
};

export const BTN_PRIMARY = {
  ...BTN,
  background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue,
};

export const BTN_GREEN = {
  ...BTN,
  background: C.greenL, border: `1px solid ${C.greenB}`, color: C.green,
};

export const LBL = {
  fontSize: 10.5, letterSpacing: ".18em", color: C.t2, display: "block",
  marginBottom: 6, textTransform: "uppercase", fontWeight: 500,
};

// Colores por tokens de tema (adaptan a claro/oscuro). Antes eran hex del modo
// oscuro hardcodeados y en claro se veían lavados (sobre todo el amarillo).
export const GRUPO_META = {
  casa:        { label: "Casa",        color: C.blue,  bg: C.blueL,  border: C.blueB },
  contratista: { label: "Contratista", color: C.cyan, bg: C.cyanL, border: C.cyanB },
  sin_asignar: { label: "Sin asignar", color: C.red,   bg: C.redL,   border: C.redB },
};

export function GrupoBadge({ grupo, contratistaNombre }) {
  const meta = GRUPO_META[grupo] ?? GRUPO_META.sin_asignar;
  const label = grupo === "contratista" && contratistaNombre ? contratistaNombre : meta.label;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg,
      border: `1px solid ${meta.border}`, padding: "2px 8px 2px 6px", borderRadius: 999,
      fontFamily: C.sans, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, color }) {
  const accent = color ?? C.t2;
  return (
    <div style={{ position: "relative", background: "transparent", border: `1px solid ${C.b0}`, borderRadius: 3, padding: "16px 18px", minWidth: 110, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: C.sans, fontSize: 28, fontWeight: 300, color: color ?? C.t0, lineHeight: 1, letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, fontWeight: 300, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: C.t2, fontWeight: 500 }}>{label}</div>
        {Icon && <Icon size={14} color={accent} strokeWidth={1.6} />}
      </div>
    </div>
  );
}

export function Cargando(props) {
  return <CargandoBloque {...props} />;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div style={{ background: C.redL, border: `1px solid ${C.redB}`, borderRadius: "var(--r-md)", padding: 16, margin: "16px 0" }}>
      <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>Error: {String(error?.message ?? error)}</div>
      {onRetry && <button onClick={onRetry} style={BTN}>Reintentar</button>}
    </div>
  );
}

// Cuando todavía no se corrió el SQL de las tablas en el dashboard.
export function SetupPendiente({ onRetry }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: C.cyanL, border: `1px solid ${C.cyanB}`, borderRadius: "var(--r-md)", padding: 22, maxWidth: 560 }}>
        <div style={{ fontSize: 14, color: C.cyan, fontWeight: 600, marginBottom: 8 }}>⚠ Faltan crear las tablas de RRHH</div>
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
      textAlign: right ? "right" : "left", padding: "0 12px", height: 38, fontSize: 10.5,
      letterSpacing: ".16em", color: C.t2, textTransform: "uppercase", fontWeight: 500,
      borderBottom: `1px solid ${C.b0}`, whiteSpace: "nowrap", position: "sticky", top: 0,
      background: "var(--bg)", zIndex: 2,
    }}>{children}</th>
  );
}

export function Td({ children, right, mono, color, style }) {
  return (
    <td style={{
      padding: "9px 12px", fontSize: 13.5, color: color ?? C.t0,
      textAlign: right ? "right" : "left",
      fontFamily: mono ? C.mono : C.sans,
      borderBottom: `1px solid ${C.b0}`,
      whiteSpace: "nowrap", ...style,
    }}>{children}</td>
  );
}
