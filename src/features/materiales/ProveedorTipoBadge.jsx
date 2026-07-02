import { proveedorTipoUi, proveedorTooltip, PROVEEDOR_SIN_CLASIFICAR_UI } from "./proveedorMeta";

export default function ProveedorTipoBadge({ meta, showUnclassified = false, compact = false }) {
  if (!meta) return null;
  const ui = proveedorTipoUi(meta.tipo) || (showUnclassified ? PROVEEDOR_SIN_CLASIFICAR_UI : null);
  if (!ui) return null;

  return (
    <span
      title={proveedorTooltip(meta)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: ui.color,
        background: ui.bg,
        border: `1px solid ${ui.border}`,
        borderRadius: 999,
        padding: compact ? "1px 6px" : "3px 8px",
        fontSize: compact ? 9.5 : 10.5,
        fontWeight: 900,
        lineHeight: 1.2,
        letterSpacing: 0.35,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {ui.label}
    </span>
  );
}
