import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, cancelLabel, tone }
  const resolverRef = useRef(null);

  const ask = useCallback((opts = {}) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setState({
      title: opts.title || "¿Confirmar?",
      message: opts.message || "",
      confirmLabel: opts.confirmLabel || "Confirmar",
      cancelLabel: opts.cancelLabel || "Cancelar",
      tone: opts.tone || "default", // 'default' | 'danger'
    });
  }), []);

  const close = useCallback((value) => {
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && <ConfirmModal state={state} onClose={close} />}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) {
    // Fallback: usar window.confirm si no hay provider montado
    return ({ message } = {}) => Promise.resolve(window.confirm(message || "¿Confirmar?"));
  }
  return ctx;
}

// En la computadora es una tarjeta centrada; en el celular sube como hoja
// desde abajo, con los botones a todo el ancho y al alcance del pulgar.
function ConfirmModal({ state, onClose }) {
  const danger = state.tone === "danger";
  const Icono = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="ui-confirm-fondo"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(false); }}
    >
      <style>{CSS}</style>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ui-confirm-titulo"
        className={danger ? "ui-confirm ui-confirm-peligro" : "ui-confirm"}
      >
        <div className="ui-confirm-cuerpo">
          <div className="ui-confirm-icono"><Icono size={19} strokeWidth={2.1} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="ui-confirm-titulo" className="ui-confirm-titulo">{state.title}</div>
            {state.message && <div className="ui-confirm-mensaje">{state.message}</div>}
          </div>
        </div>

        <div className="ui-confirm-acciones">
          <button type="button" className="ui-confirm-cancelar" onClick={() => onClose(false)} autoFocus={!danger}>
            {state.cancelLabel}
          </button>
          <button type="button" className="ui-confirm-aceptar" onClick={() => onClose(true)} autoFocus={danger}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .ui-confirm-fondo {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 99998;
    display: grid; place-items: center;
    padding: 20px;
    background: var(--overlay);
    -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    font-family: 'Outfit', system-ui, sans-serif;
    animation: ui-confirm-fondo .16s ease-out;
  }
  .ui-confirm {
    --ui-tono: var(--blue); --ui-tono-soft: var(--blue-soft);
    width: min(440px, 100%);
    padding: 20px;
    border: 1px solid var(--border-2); border-radius: 18px;
    background: var(--panel-solid);
    box-shadow: var(--elev-2);
    color: var(--text);
    animation: ui-confirm-entra .22s cubic-bezier(.22,1,.36,1);
  }
  .ui-confirm-peligro { --ui-tono: var(--red); --ui-tono-soft: var(--red-soft); }
  .ui-confirm-cuerpo { display: flex; align-items: flex-start; gap: 14px; }
  .ui-confirm-icono {
    width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
    display: grid; place-items: center;
    color: var(--ui-tono); background: var(--ui-tono-soft);
  }
  .ui-confirm-titulo { font-size: 16.5px; font-weight: 650; line-height: 1.3; padding-top: 2px; }
  .ui-confirm-mensaje { margin-top: 6px; font-size: 14px; line-height: 1.55; color: var(--muted); white-space: pre-wrap; }
  .ui-confirm-acciones { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  .ui-confirm-cancelar, .ui-confirm-aceptar {
    min-height: 40px; padding: 0 16px;
    border-radius: 11px;
    font-family: inherit; font-size: 14px; font-weight: 600;
    transition: background-color .15s, border-color .15s, filter .15s, transform .15s;
  }
  .ui-confirm-cancelar { border: 1px solid var(--border-2); background: transparent; color: var(--muted); }
  .ui-confirm-cancelar:hover { background: var(--panel-2); color: var(--text); }
  .ui-confirm-aceptar { border: 1px solid transparent; background: var(--ui-tono); color: var(--inverse-text); }
  .ui-confirm-aceptar:hover { filter: brightness(1.07); }
  .ui-confirm-aceptar:active, .ui-confirm-cancelar:active { transform: scale(.98); }
  @keyframes ui-confirm-fondo { from { opacity: 0; } }
  @keyframes ui-confirm-entra { from { opacity: 0; transform: translateY(8px) scale(.97); } }
  @keyframes ui-confirm-sube { from { transform: translateY(100%); } }

  @media (max-width: 640px) {
    .ui-confirm-fondo { place-items: end stretch; padding: 0; }
    .ui-confirm {
      width: 100%;
      padding: 22px 18px calc(18px + env(safe-area-inset-bottom, 0px));
      border-radius: 22px 22px 0 0; border-bottom: 0;
      animation: ui-confirm-sube .28s cubic-bezier(.22,1,.36,1);
    }
    .ui-confirm::before {
      content: ""; display: block;
      width: 38px; height: 4px; border-radius: 99px;
      margin: -10px auto 16px;
      background: var(--border-2);
    }
    .ui-confirm-acciones { flex-direction: column-reverse; gap: 8px; margin-top: 20px; }
    .ui-confirm-cancelar, .ui-confirm-aceptar { width: 100%; min-height: 48px; font-size: 15px; }
  }
`;
