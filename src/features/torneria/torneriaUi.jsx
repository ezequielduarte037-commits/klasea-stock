import { X } from "lucide-react";
import { C } from "@/theme";
import { BUTTON } from "./torneriaStyles";

export function Field({ label, hint, children, full = false }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{
        color: C.dim,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ color: C.dim, fontSize: 11, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, width = 640 }) {
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "grid",
        placeItems: "center",
        padding: 14,
        background: "var(--overlay)",
        backdropFilter: "blur(7px)",
        WebkitBackdropFilter: "blur(7px)",
      }}
    >
      <div style={{
        width: `min(${width}px, 100%)`,
        maxHeight: "min(88vh, 820px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 18,
        border: `1px solid ${C.border2}`,
        background: C.panelSolid,
        boxShadow: "0 30px 90px var(--shadow-strong)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          padding: "16px 16px 13px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 850 }}>{title}</div>
            {subtitle && (
              <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45, marginTop: 3 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{
            ...BUTTON,
            width: 36,
            minHeight: 36,
            padding: 0,
            flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16, overflowY: "auto" }}>{children}</div>
        {footer && (
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${C.border}`,
            background: C.panel,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_META = {
  pendiente: { label: "Pendiente", color: C.dim, bg: C.panel },
  enviado: { label: "En taller", color: C.blue, bg: C.blueL },
  parcial: { label: "Parcial", color: C.violet, bg: C.violetL },
  recibido: { label: "Recibido", color: C.green, bg: C.greenL },
  cancelado: { label: "Cancelado", color: C.red, bg: C.redL },
  pendiente_solicitud: { label: "Por solicitar", color: C.dim, bg: C.panel },
  solicitado: { label: "Solicitado", color: C.blue, bg: C.blueL },
  comprado: { label: "Comprado", color: C.violet, bg: C.violetL },
  recibido_astillero: { label: "En astillero", color: C.green, bg: C.greenL },
  no_aplica: { label: "No aplica", color: C.dim, bg: C.panel },
};

export function StatusBadge({ status, compact = false }) {
  const meta = STATUS_META[status] ?? STATUS_META.pendiente;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      minHeight: compact ? 24 : 28,
      padding: compact ? "3px 7px" : "4px 9px",
      borderRadius: 999,
      border: `1px solid ${meta.color}44`,
      background: meta.bg,
      color: meta.color,
      fontSize: compact ? 10 : 11,
      fontWeight: 850,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: meta.color,
        boxShadow: `0 0 8px ${meta.color}66`,
      }} />
      {meta.label}
    </span>
  );
}

export function ProgressBar({ value, color = C.blue, height = 5 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ height, borderRadius: 99, overflow: "hidden", background: C.panel2 }}>
      <div style={{
        height: "100%",
        width: `${pct}%`,
        borderRadius: 99,
        background: color,
        transition: "width .3s ease",
      }} />
    </div>
  );
}
