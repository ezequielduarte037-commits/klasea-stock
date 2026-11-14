import { useEffect } from "react";
import { X } from "lucide-react";

// Piezas chicas del módulo Muebles. Usan las clases de estilos.js (.mbl-…),
// así que se montan siempre adentro de la raíz .mbl.

export function Estado({ tono = "neutro", punto = true, children, title }) {
  return <span className={`mbl-estado${punto ? " punto" : ""}`} data-tono={tono} title={title}>{children}</span>;
}

export function Tag({ tono = "neutro", children, icono: Icono }) {
  return (
    <span className="mbl-tag" data-tono={tono}>
      {Icono && <Icono size={11} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export function Mini({ pct = 0, style }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="mbl-mini" style={style} aria-hidden="true">
      <i className={v >= 100 ? "lleno" : ""} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Aviso({ tono = "rojo", children, onCerrar }) {
  return (
    <div className="mbl-aviso" data-tono={tono} role={tono === "rojo" ? "alert" : "status"}>
      <span>{children}</span>
      {onCerrar && (
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar aviso">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Vacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="mbl-vacio">
      {Icono && <div className="mbl-vacio-ic"><Icono size={22} /></div>}
      {titulo && <b>{titulo}</b>}
      {texto && <div style={{ maxWidth: 380, lineHeight: 1.5 }}>{texto}</div>}
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

// Diálogo del módulo: tarjeta centrada en la computadora y hoja desde abajo en
// el celular. Cierra con Escape o tocando afuera, salvo mientras guarda.
export function Modal({ onCerrar, bloqueado = false, icono: Icono, tono = "azul", titulo, sub, children, pie, ancho = false, etiqueta }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape" && !bloqueado) onCerrar?.(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar, bloqueado]);

  return (
    <div
      className="mbl-modal-fondo"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !bloqueado) onCerrar?.(); }}
    >
      <div className={`mbl-modal${ancho ? " ancho" : ""}`} role="dialog" aria-modal="true" aria-label={etiqueta || (typeof titulo === "string" ? titulo : undefined)}>
        <div className="mbl-modal-cab">
          {Icono && <span className="mbl-modal-ic" data-tono={tono}><Icono size={17} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mbl-modal-tit">{titulo}</div>
            {sub && <div className="mbl-modal-sub">{sub}</div>}
          </div>
          <button type="button" className="mbl-btn-ic" onClick={onCerrar} disabled={bloqueado} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="mbl-modal-cuerpo">{children}</div>
        {pie && <div className="mbl-modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

// Casilla de una tarea: un botón entero, cómodo con el dedo.
export function Tarea({ hecha, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={`mbl-tarea${hecha ? " on" : ""}`}
      onClick={onClick}
      disabled={disabled}
      role="checkbox"
      aria-checked={Boolean(hecha)}
    >
      <span className="mbl-check" aria-hidden="true">
        {hecha && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}
