// Piezas chicas de Memorias.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CSS_MEMORIAS } from "./estilos";

export function Anillo({ pct, tono }) {
  const r = 18;
  const largo = 2 * Math.PI * r;
  return (
    <div className="mem-anillo" data-tono={tono} aria-label={`${pct}% definido`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="fondo" cx="22" cy="22" r={r} />
        <circle className="valor" cx="22" cy="22" r={r} strokeDasharray={largo} strokeDashoffset={largo * (1 - Math.min(100, pct) / 100)} />
      </svg>
      <span>{pct}%</span>
    </div>
  );
}

export function Barra({ pct, tono }) {
  return (
    <div className="mem-barra" data-tono={tono}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Estado({ tono = "neutro", children, sinPunto = false }) {
  return <span className={`mem-estado${sinPunto ? " sin-punto" : ""}`} data-tono={tono}>{children}</span>;
}

// Diálogo: tarjeta centrada en la computadora, hoja desde abajo en el celular.
export function Modal({ titulo, sub, onCerrar, pie, children, ancho }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return createPortal(
    <div className="mem-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <style href="klasea-memorias" precedence="default">{CSS_MEMORIAS}</style>
      <div className="mem-modal" role="dialog" aria-modal="true" aria-label={titulo} style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <div className="mem-modal-cab">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{titulo}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="mem-btn-ic chico" onClick={onCerrar} aria-label="Cerrar"><X size={15} /></button>
        </div>
        <div className="mem-modal-cuerpo">{children}</div>
        {pie && <div className="mem-modal-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
