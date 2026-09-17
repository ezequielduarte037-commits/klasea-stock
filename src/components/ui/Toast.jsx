import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, Info, X, AlertCircle } from "lucide-react";
import { C } from "@/theme";
import { DrawnCheck } from "./motion";

const ToastCtx = createContext(null);

// La advertencia va en cian: el ámbar no se usa en el sistema.
const TONE = {
  success: { color: C.green, soft: C.greenL, Icon: null },
  error:   { color: C.red, soft: C.redL, Icon: AlertCircle },
  warning: { color: C.cyan, soft: C.cyanL, Icon: AlertTriangle },
  info:    { color: C.blue, soft: C.blueL, Icon: Info },
};

// Lo que tarda la salida animada antes de sacar el aviso de la lista.
const SALIDA_MS = 180;

let _id = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, saliendo: true } : t)));
    window.setTimeout(() => {
      setItems((list) => list.filter((t) => t.id !== id));
    }, SALIDA_MS);
  }, []);

  const push = useCallback((tone, message, opts = {}) => {
    const id = ++_id;
    const ttl = opts.ttl ?? (tone === "error" ? 6000 : 3500);
    setItems((list) => [...list, { id, tone, message, ttl, saliendo: false }]);
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  // Memoizado a proposito. Sin esto, `api` es un objeto nuevo en cada render
  // del provider —o sea cada vez que aparece o se va un toast— y como media app
  // tiene `toast` en las dependencias de sus useCallback/useEffect, mostrar un
  // cartelito invalidaba esos hooks y disparaba recargas completas. En el stock
  // de panol eso significaba volver a pedir 1.850 filas y 835 materiales.
  const api = useMemo(() => ({
    success: (m, o) => push("success", m, o),
    error:   (m, o) => push("error",   m, o),
    warning: (m, o) => push("warning", m, o),
    info:    (m, o) => push("info",    m, o),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastViewport items={items} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Fallback silencioso si alguien lo usa fuera del Provider: log + no-op
    const fallback = (m) => { try { console.log("[toast]", m); } catch { /* noop */ } };
    return { success: fallback, error: fallback, warning: fallback, info: fallback, dismiss: () => {} };
  }
  return ctx;
}

function ToastViewport({ items, dismiss }) {
  if (!items.length) return null;
  return (
    <div className="ui-toasts" aria-live="polite">
      <style>{CSS}</style>
      {items.map((t) => {
        const { color, soft, Icon } = TONE[t.tone] || TONE.info;
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={t.saliendo ? "ui-toast ui-toast-sale" : "ui-toast"}
          >
            <div className="ui-toast-icono" style={{ color, background: soft }}>
              {Icon ? <Icon size={15} strokeWidth={2.2} /> : <DrawnCheck size={17} color={color} delay={80} />}
            </div>
            <div className="ui-toast-texto">{t.message}</div>
            <button type="button" className="ui-toast-cerrar" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <X size={14} />
            </button>
            {t.ttl > 0 && (
              <span
                className="ui-toast-tiempo"
                style={{ background: color, animationDuration: `${t.ttl}ms` }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const CSS = `
  .ui-toasts {
    position: fixed; z-index: 99999;
    right: 18px; bottom: 18px;
    display: grid; gap: 8px;
    width: min(380px, calc(100vw - 36px));
    pointer-events: none;
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .ui-toast {
    position: relative; overflow: hidden;
    pointer-events: auto;
    display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: 11px;
    padding: 11px 10px 12px 12px;
    border: 1px solid var(--border-2); border-radius: 14px;
    background: var(--panel-solid-2);
    box-shadow: var(--elev-2);
    color: var(--text);
    font-size: 13.5px; line-height: 1.45;
    animation: ui-toast-entra .26s cubic-bezier(.22,1,.36,1);
  }
  .ui-toast-sale { animation: ui-toast-sale .18s ease-in forwards; }
  .ui-toast-icono {
    width: 30px; height: 30px; border-radius: 9px;
    display: grid; place-items: center;
    flex-shrink: 0;
  }
  .ui-toast-texto { padding-top: 5px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .ui-toast-cerrar {
    width: 28px; height: 28px; min-height: 0;
    display: grid; place-items: center;
    border: 0; border-radius: 8px;
    background: transparent; color: var(--dim);
    transition: background-color .15s, color .15s;
  }
  .ui-toast-cerrar:hover { background: var(--panel-2); color: var(--text); }
  .ui-toast-tiempo {
    position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
    opacity: .55;
    transform-origin: left center;
    animation-name: ui-toast-tiempo; animation-timing-function: linear; animation-fill-mode: forwards;
  }
  @keyframes ui-toast-entra { from { opacity: 0; transform: translateY(12px) scale(.97); } }
  @keyframes ui-toast-sale { to { opacity: 0; transform: translateY(8px) scale(.97); } }
  @keyframes ui-toast-tiempo { to { transform: scaleX(0); } }

  /* Celular: abajo y a todo el ancho, por encima de la barra del sistema. */
  @media (max-width: 640px) {
    .ui-toasts {
      left: 12px; right: 12px; width: auto;
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    }
  }
`;
