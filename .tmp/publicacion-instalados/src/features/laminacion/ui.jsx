import { useEffect } from "react";
import { X } from "lucide-react";

// Piezas chicas de Laminación. Usan las clases de estilos.js (.lam-…), así que
// se montan siempre adentro de la raíz .lam.

export function Estado({ tono = "neutro", punto = true, children, title }) {
  return <span className={`lam-estado${punto ? " punto" : ""}`} data-tono={tono} title={title}>{children}</span>;
}

export function Tag({ tono = "neutro", children }) {
  return <span className="lam-tag" data-tono={tono}>{children}</span>;
}

export function Mini({ pct = 0, tono, style }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="lam-mini" style={style} aria-hidden="true">
      <i className={!tono && v >= 100 ? "lleno" : ""} data-tono={tono} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Aviso({ tono = "rojo", icono: Icono, children, onCerrar }) {
  return (
    <div className="lam-aviso" data-tono={tono} role={tono === "rojo" ? "alert" : "status"}>
      {Icono && <Icono size={15} />}
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
    <div className="lam-vacio">
      {Icono && <div className="lam-vacio-ic"><Icono size={21} /></div>}
      {titulo && <b>{titulo}</b>}
      {texto && <div style={{ maxWidth: 420, lineHeight: 1.5 }}>{texto}</div>}
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Bloque({ icono: Icono, tono = "azul", titulo, texto, der, children, sinPad = false, i = 0, style }) {
  return (
    <section className="lam-bloque" style={{ "--i": i, ...style }}>
      {(titulo || der) && (
        <div className="lam-bloque-cab">
          {Icono && <span className="lam-bloque-ic" data-tono={tono}><Icono size={17} /></span>}
          <div style={{ minWidth: 0 }}>
            {titulo && <h2 className="lam-bloque-tit">{titulo}</h2>}
            {texto && <p className="lam-bloque-txt">{texto}</p>}
          </div>
          {der && <div className="der">{der}</div>}
        </div>
      )}
      {children && <div className={`lam-bloque-cuerpo${sinPad ? " sin-pad" : ""}`}>{children}</div>}
    </section>
  );
}

export function Cifra({ etiqueta, valor, unidad, tono }) {
  return (
    <div className="lam-cifra" data-tono={tono}>
      <div className="et">{etiqueta}</div>
      <div className="v">{valor}{unidad && <span className="u">{unidad}</span>}</div>
    </div>
  );
}

// Diálogo del módulo: tarjeta centrada en la computadora y hoja desde abajo en
// el celular. Cierra con Escape o tocando afuera, salvo mientras guarda.
export function Modal({ onCerrar, bloqueado = false, icono: Icono, tono = "azul", titulo, sub, children, pie, ancho = false }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape" && !bloqueado) onCerrar?.(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar, bloqueado]);

  return (
    <div className="lam-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !bloqueado) onCerrar?.(); }}>
      <div className={`lam-modal${ancho ? " ancho" : ""}`} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <div className="lam-modal-cab">
          {Icono && <span className="lam-modal-ic" data-tono={tono}><Icono size={17} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="lam-modal-tit">{titulo}</div>
            {sub && <div className="lam-modal-sub">{sub}</div>}
          </div>
          <button type="button" className="lam-btn-ic" onClick={onCerrar} disabled={bloqueado} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="lam-modal-cuerpo">{children}</div>
        {pie && <div className="lam-modal-pie">{pie}</div>}
      </div>
    </div>
  );
}
