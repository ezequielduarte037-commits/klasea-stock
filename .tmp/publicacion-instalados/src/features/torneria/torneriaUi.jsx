import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { C } from "@/theme";
import { BUTTON } from "./torneriaStyles";

export function Field({ label, hint, children, full = false }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{
        color: C.dim,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ color: C.dim, fontSize: 12, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, width = 640 }) {
  return (
    <div
      className="tor-modal-fondo"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tor-modal" role="dialog" aria-modal="true" aria-label={title} style={{ "--ancho": `${width}px` }}>
        <div className="tor-modal-cab">
          <div style={{ minWidth: 0 }}>
            <div className="tor-modal-tit">{title}</div>
            {subtitle && <div className="tor-modal-sub">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ui-btn ui-btn-icono" style={{ flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
        <div className="tor-modal-cuerpo">{children}</div>
        {footer && <div className="tor-modal-pie">{footer}</div>}
      </div>
    </div>
  );
}

// Menú de acciones de una obra. En el celular es una hoja que sube desde abajo
// (al alcance del pulgar); en escritorio, un popover pegado al botón que lo abrió.
// Va por portal porque la barra que lo contiene tiene backdrop-filter, y un
// elemento fijo adentro de un ancestro con filtro se posiciona contra ese
// ancestro y no contra la pantalla.
export function MenuAcciones({ hoja = false, titulo = null, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (hoja) {
    return createPortal(
      <>
        <div className="tor-hoja-fondo" onClick={onClose} />
        <div className="tor-hoja" role="menu">
          <div className="tor-hoja-asa" />
          {titulo && <div className="tor-hoja-tit">{titulo}</div>}
          {children}
        </div>
      </>,
      document.body,
    );
  }
  return (
    <>
      {createPortal(<div className="tor-menu-fondo" onClick={onClose} />, document.body)}
      <div className="tor-menu" role="menu">{children}</div>
    </>
  );
}

export function Opcion({ icon: Icon, label, hint = null, peligro = false, onClick }) {
  return (
    <button type="button" role="menuitem" className="tor-opcion" data-peligro={peligro ? "1" : undefined} onClick={onClick}>
      {Icon && <Icon size={18} />}
      <span style={{ minWidth: 0 }}>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

// Los colores del theme son variables CSS ("var(--blue)"): pegarles un alfa
// hexadecimal (`${color}44`) produce CSS inválido que el navegador descarta, y
// el borde queda invisible. Cada estado lleva su borde del theme.
const STATUS_META = {
  pendiente: { label: "Pendiente", color: C.dim, bg: C.panel, borde: C.border },
  enviado: { label: "Fuera del astillero", color: C.blue, bg: C.blueL, borde: C.blueB },
  parcial: { label: "Regreso parcial", color: C.violet, bg: C.violetL, borde: C.violetB },
  recibido: { label: "Recibido", color: C.green, bg: C.greenL, borde: C.greenB },
  cancelado: { label: "Cancelado", color: C.red, bg: C.redL, borde: C.redB },
  pendiente_solicitud: { label: "Por solicitar", color: C.dim, bg: C.panel, borde: C.border },
  solicitado: { label: "Solicitado", color: C.blue, bg: C.blueL, borde: C.blueB },
  comprado: { label: "Comprado", color: C.violet, bg: C.violetL, borde: C.violetB },
  recibido_astillero: { label: "En astillero", color: C.green, bg: C.greenL, borde: C.greenB },
  no_aplica: { label: "No aplica", color: C.dim, bg: C.panel, borde: C.border },
};

export { STATUS_META };

export function StatusBadge({ status, compact = false, label = null }) {
  const meta = STATUS_META[status] ?? STATUS_META.pendiente;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      minHeight: compact ? 24 : 28,
      padding: compact ? "3px 7px" : "4px 9px",
      borderRadius: 999,
      border: `1px solid ${meta.borde}`,
      background: meta.bg,
      color: meta.color,
      fontSize: compact ? 10 : 11,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: meta.color,
      }} />
      {label || meta.label}
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

// ─── Piezas chicas con las clases de torneriaEstilos (.tor-…) ───────────────

export function Estado({ tono = "neutro", punto = true, children, title }) {
  return <span className={`tor-estado${punto ? " punto" : ""}`} data-tono={tono} title={title}>{children}</span>;
}

export function Tag({ tono = "neutro", children }) {
  return <span className="tor-tag" data-tono={tono}>{children}</span>;
}

export function Dias({ dias, demora = 15, title = "Días desde la última salida" }) {
  if (dias == null) return null;
  return (
    <span className={`tor-dias${dias >= demora ? " demora" : ""}`} title={title}>
      {dias} d
    </span>
  );
}

// Avance de una obra en un anillo: se lee de lejos y no ocupa una fila.
export function Anillo({ pct = 0, size = 44, grosor = 4 }) {
  const valor = Math.max(0, Math.min(100, Number(pct) || 0));
  const radio = (size - grosor) / 2;
  const largo = 2 * Math.PI * radio;
  return (
    <span className={`tor-anillo${valor >= 100 ? " lleno" : ""}`} style={{ width: size, height: size }} aria-label={`${valor}% del circuito`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className="fondo" cx={size / 2} cy={size / 2} r={radio} fill="none" strokeWidth={grosor} />
        <circle
          className="arco" cx={size / 2} cy={size / 2} r={radio} fill="none" strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={largo} strokeDashoffset={largo * (1 - valor / 100)}
        />
      </svg>
      <b style={{ fontSize: size >= 56 ? 14 : 11.5 }}>{valor}</b>
    </span>
  );
}

export function Vacio({ icono: Icono, titulo, texto, chico = false, children }) {
  return (
    <div className={`tor-vacio${chico ? " chico" : ""}`}>
      {Icono && !chico && <div className="tor-vacio-ic"><Icono size={22} /></div>}
      {titulo && <b>{titulo}</b>}
      {texto && <div style={{ maxWidth: 380, lineHeight: 1.5 }}>{texto}</div>}
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
