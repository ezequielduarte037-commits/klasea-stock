import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

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

function ConfirmModal({ state, onClose }) {
  const danger = state.tone === "danger";
  const accent = danger ? "#ef4444" : "#60a5fa";

  return (
    <>
      <style>{`
        @keyframes cd-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cd-modal-in {
          from { transform: translateY(6px) scale(0.97); opacity: 0; }
          to   { transform: translateY(0)   scale(1);    opacity: 1; }
        }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(false); }}
        style={{
          position: "fixed", inset: 0, zIndex: 99998,
          background: "rgba(2,2,4,0.6)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "grid", placeItems: "center",
          padding: 20,
          animation: "cd-backdrop-in .14s ease-out",
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        <div role="dialog" aria-modal="true" style={{
          width: "min(420px, 100%)",
          background: "rgba(15,15,18,0.97)",
          border: `1px solid ${accent}33`,
          borderRadius: 14,
          boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px ${accent}10`,
          padding: "18px 18px 16px",
          color: "#f4f4f5",
          animation: "cd-modal-in .18s cubic-bezier(.22,1,.36,1)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              display: "grid", placeItems: "center",
              background: `${accent}1a`,
              color: accent,
              flexShrink: 0,
            }}>
              <AlertTriangle size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{state.title}</div>
              {state.message && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(255,255,255,0.7)" }}>
                  {state.message}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button
              type="button"
              onClick={() => onClose(false)}
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
              autoFocus={!danger}
            >
              {state.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onClose(true)}
              style={{
                border: `1px solid ${accent}66`,
                background: `${accent}1c`,
                color: accent,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "inherit",
                letterSpacing: 0.2,
              }}
              autoFocus={danger}
            >
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
