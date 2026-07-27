import { C } from "@/theme";
import { GRAD_BLUE, GRAD_VIOLET, GLOW_BLUE, GLOW_VIOLET, tint } from "@/features/produccion/comprasTokens";

// ─────────────────────────────────────────────────────────────────────────────
// Piezas visuales compartidas por las pestañas de Compras por Etapa.
// Se mantienen los estilos inline y los tokens de @/theme como en el resto de
// la app; lo único que vive en CSS es la animación/hover (en el <style> de la
// pantalla contenedora, con prefijo .ce-).
//
// Los componentes que reciben un icono lo toman como prop en minúscula y lo
// reasignan a una variable en mayúscula: así JSX lo resuelve como componente y
// el lint no lo marca como no usado (misma convención que el resto del repo).
// ─────────────────────────────────────────────────────────────────────────────

/* ── estado vacío ─────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, subtitle, accent = "#8b5cf6", action = null }) {
  const Icon = icon;
  return (
    <div style={{
      display: "grid", placeItems: "center", textAlign: "center", gap: 7, padding: "40px 22px",
      background: `radial-gradient(120% 100% at 50% 0%, ${tint(accent, 7)}, transparent 70%), ${C.panel}`,
      border: `1px dashed ${C.border2}`, borderRadius: 18,
    }}>
      <div style={{
        width: 62, height: 62, borderRadius: 19, display: "grid", placeItems: "center", marginBottom: 2,
        background: `linear-gradient(145deg, ${tint(accent, 18)}, ${tint(accent, 5)})`,
        border: `1px solid ${tint(accent, 22)}`, color: accent,
      }}>
        <Icon size={28} strokeWidth={1.6} style={{ opacity: 0.92 }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 850, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.dim, maxWidth: 380, lineHeight: 1.55 }}>{subtitle}</div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* ── chip de KPI compacto ─────────────────────────────────────────────────── */
export function Kpi({ icon, valor, label, color = "var(--blue)", soft = "var(--blue-soft)", borde = "var(--blue-border)" }) {
  const Icon = icon;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 9, padding: "7px 13px 7px 9px",
      background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12,
      boxShadow: "0 1px 2px var(--shadow)",
    }}>
      <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: soft, border: `1px solid ${borde}`, color }}>
        <Icon size={14} />
      </span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.text, fontFamily: C.mono }}>{valor}</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.dim, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      </div>
    </div>
  );
}

/* ── selector de estado tipo chip ─────────────────────────────────────────── */
export function EstadoSelect({ value, options, onChange, disabled }) {
  const st = options.find((o) => o.value === value) || options[0];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "4px 9px", borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
        border: `1px solid ${st.color}40`, background: `${st.color}16`, color: st.color,
        cursor: disabled ? "default" : "pointer", outline: "none",
        boxShadow: `inset 0 0 0 1px ${st.color}0d`,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ color: "#111", background: "#fff" }}>{o.label}</option>
      ))}
    </select>
  );
}

/* ── botón primario con gradiente ─────────────────────────────────────────── */
export function Cta({ children, icon, onClick, disabled, tono = "violeta", size = "md", type = "button", title }) {
  const Icon = icon;
  const grad = tono === "azul" ? GRAD_BLUE : GRAD_VIOLET;
  const glow = tono === "azul" ? GLOW_BLUE : GLOW_VIOLET;
  const chico = size === "sm";
  return (
    <button
      type={type === "submit" ? "submit" : "button"}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="ce-cta"
      style={{
        display: "inline-flex", alignItems: "center", gap: chico ? 6 : 7, flexShrink: 0,
        borderRadius: chico ? 9 : 10, padding: chico ? "7px 13px" : "9px 16px", border: "none",
        cursor: disabled ? "default" : "pointer", fontSize: chico ? 12.5 : 13, fontWeight: 850,
        background: disabled ? C.panel2 : grad, color: disabled ? C.dim : "#fff",
        boxShadow: disabled ? "none" : glow, whiteSpace: "nowrap",
      }}
    >
      {Icon && <Icon size={chico ? 14 : 15} />}
      {children}
    </button>
  );
}

/* ── botón secundario / fantasma ──────────────────────────────────────────── */
export function Ghost({ children, icon, onClick, disabled, tono, title, size = "md" }) {
  const Icon = icon;
  const chico = size === "sm";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="ce-ghost"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
        border: `1px solid ${C.border}`, background: C.panelSolid,
        color: tono === "rojo" ? C.red : C.dim, borderRadius: chico ? 8 : 9,
        padding: chico ? "6px 10px" : "7px 12px", cursor: disabled ? "default" : "pointer",
        fontSize: chico ? 11.5 : 12.5, fontWeight: 750, whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon && <Icon size={chico ? 13 : 14} />}
      {children}
    </button>
  );
}

/* ── icono de acción cuadrado ─────────────────────────────────────────────── */
export function IconBtn({ icon, onClick, title, tono, disabled, size = 28 }) {
  const Icon = icon;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="ce-ghost"
      style={{
        width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center",
        borderRadius: 8, border: "none", background: "transparent",
        color: tono === "rojo" ? C.red : C.dim, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon size={Math.round(size * 0.54)} />
    </button>
  );
}

/* ── barra de progreso fina ───────────────────────────────────────────────── */
export function Progreso({ pct, ancho = 84, color }) {
  const v = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div style={{ width: ancho, height: 5, borderRadius: 999, background: C.panel2, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ width: `${v}%`, height: "100%", borderRadius: 999, background: color || (v === 100 ? C.green : GRAD_BLUE), transition: "width .3s ease" }} />
    </div>
  );
}

/* ── etiqueta redonda ─────────────────────────────────────────────────────── */
export function Pill({ children, color = "var(--dim)", soft = "var(--panel-2)", borde = "transparent", mono = false }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
      fontSize: 10.5, fontWeight: 850, color, background: soft,
      border: `1px solid ${borde}`, borderRadius: 999, padding: "3px 9px",
      fontFamily: mono ? C.mono : C.sans, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
