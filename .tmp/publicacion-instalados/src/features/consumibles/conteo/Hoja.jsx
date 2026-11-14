import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import useDialogo from "../useDialogo";

/**
 * Hoja — panel que sube desde abajo en el celular y es un diálogo centrado (o
 * un panel lateral) en la PC. Va en un portal a <body>: dentro del contenedor
 * de Consumibles, que scrollea, un panel fijo quedaba recortado o tapado.
 *
 * `clase` se suma a la capa para que el CSS de cada pestaña (que va con su
 * clase raíz, ej. `.cnt`) también alcance a lo que está adentro de la hoja.
 *
 *   completa  en el celular ocupa toda la pantalla (el conteo la usa así)
 *   lateral   en la PC se abre pegada a la derecha, a todo el alto
 */
export default function Hoja({ abierta, onCerrar, titulo, sub, children, pie, clase = "", ancho = 460, completa = false, lateral = false, etiqueta }) {
  const panelRef = useRef(null);
  useDialogo(panelRef, onCerrar, abierta);
  // El último onCerrar en un ref: si la pantalla de atrás se redibuja (llega un
  // conteo del otro celular), el efecto no se vuelve a montar ni roba el foco
  // del campo donde se está escribiendo.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; }, [onCerrar]);

  if (!abierta) return null;

  return createPortal(
    <div
      className={`cns-capa ${clase}${completa ? " is-completa" : ""}${lateral ? " is-lateral" : ""}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarRef.current?.(); }}
    >
      <style href="klasea-cns-hoja" precedence="default">{CSS}</style>
      <div
        ref={panelRef}
        className="cns-hoja"
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta || (typeof titulo === "string" ? titulo : undefined)}
        tabIndex={-1}
        style={{ "--cns-hoja-ancho": `${ancho}px` }}
      >
        {(titulo || onCerrar) && (
          <header className="cns-hoja-cab">
            <div className="cns-hoja-tit">
              {titulo && <h2>{titulo}</h2>}
              {sub && <div className="cns-hoja-sub">{sub}</div>}
            </div>
            {onCerrar && (
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono cns-hoja-x" onClick={onCerrar} aria-label="Cerrar">
                <X size={20} />
              </button>
            )}
          </header>
        )}
        <div className="cns-hoja-cuerpo">{children}</div>
        {pie && <footer className="cns-hoja-pie">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
  .cns-capa {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1200;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    background: var(--overlay);
    font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
    animation: cns-capa-in .18s ease both;
  }
  .cns-capa .cns-hoja {
    width: min(var(--cns-hoja-ancho), 100%); max-height: min(860px, 100%);
    display: flex; flex-direction: column; min-height: 0;
    background: var(--panel-solid); border: 1px solid var(--border-2); border-radius: var(--r-lg);
    box-shadow: var(--elev-2); outline: none;
    animation: cns-hoja-in .26s cubic-bezier(.22,1,.36,1) both;
  }
  .cns-capa.is-lateral { justify-content: flex-end; padding: 0; }
  .cns-capa.is-lateral .cns-hoja {
    height: 100%; max-height: none; border-radius: 0; border-width: 0 0 0 1px;
    animation-name: cns-hoja-lado;
  }
  .cns-capa .cns-hoja-cab {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 16px 16px 12px 20px; border-bottom: 1px solid var(--border);
  }
  .cns-capa .cns-hoja-tit { flex: 1; min-width: 0; }
  .cns-capa .cns-hoja-tit h2 { margin: 0; font-size: 18px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
  .cns-capa .cns-hoja-sub { margin-top: 3px; font-size: 13px; color: var(--dim); }
  .cns-capa .cns-hoja-x { margin: -4px -6px 0 0; flex-shrink: 0; }
  .cns-capa .cns-hoja-cuerpo { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; overscroll-behavior: contain; }
  .cns-capa .cns-hoja-pie {
    display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end;
    padding: 12px 20px 16px; border-top: 1px solid var(--border);
  }
  @media (max-width: 640px) {
    .cns-capa, .cns-capa.is-lateral { align-items: flex-end; justify-content: stretch; padding: 0; }
    .cns-capa .cns-hoja, .cns-capa.is-lateral .cns-hoja {
      width: 100%; max-height: 94dvh; height: auto;
      border-radius: var(--r-lg) var(--r-lg) 0 0; border-width: 1px 0 0;
      animation-name: cns-hoja-sube;
    }
    .cns-capa.is-completa .cns-hoja { height: 100dvh; max-height: 100dvh; border-radius: 0; border-width: 0; }
    .cns-capa .cns-hoja-cab { padding: calc(10px + env(safe-area-inset-top, 0px)) 10px 10px 16px; }
    .cns-capa:not(.is-completa) .cns-hoja-cab { padding-top: 14px; }
    .cns-capa .cns-hoja-cuerpo { padding: 14px 16px; }
    .cns-capa .cns-hoja-pie { padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px)); }
    .cns-capa .cns-hoja-pie > .ui-btn { flex: 1; }
  }
  @keyframes cns-capa-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cns-hoja-in { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes cns-hoja-lado { from { opacity: .4; transform: translateX(32px); } to { opacity: 1; transform: none; } }
  @keyframes cns-hoja-sube { from { transform: translateY(40px); opacity: .5; } to { transform: none; opacity: 1; } }
`;
