import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle } from "lucide-react";

const ToastCtx = createContext(null);

const TONE = {
  success: { color: "#10b981", Icon: CheckCircle2 },
  error:   { color: "#ef4444", Icon: AlertCircle },
  warning: { color: "#f59e0b", Icon: AlertTriangle },
  info:    { color: "#60a5fa", Icon: Info },
};

let _id = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone, message, opts = {}) => {
    const id = ++_id;
    const ttl = opts.ttl ?? (tone === "error" ? 6000 : 3500);
    setItems((list) => [...list, { id, tone, message, ttl }]);
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const api = {
    success: (m, o) => push("success", m, o),
    error:   (m, o) => push("error",   m, o),
    warning: (m, o) => push("warning", m, o),
    info:    (m, o) => push("info",    m, o),
    dismiss,
  };

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
  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { transform: translateY(10px) scale(0.97); opacity: 0; }
          to   { transform: translateY(0)    scale(1);    opacity: 1; }
        }
        @keyframes toast-out {
          to { transform: translateY(8px) scale(0.97); opacity: 0; }
        }
      `}</style>
      <div style={{
        position: "fixed",
        bottom: 18, right: 18, zIndex: 99999,
        display: "grid", gap: 8,
        maxWidth: "calc(100vw - 36px)",
        fontFamily: "'Outfit', system-ui, sans-serif",
        pointerEvents: "none",
      }}>
        {items.map((t) => {
          const { color, Icon } = TONE[t.tone] || TONE.info;
          return (
            <div key={t.id} style={{
              pointerEvents: "auto",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 10,
              alignItems: "start",
              minWidth: 260,
              maxWidth: 380,
              padding: "11px 13px",
              borderRadius: 11,
              border: `1px solid ${color}44`,
              background: "rgba(14,14,18,0.92)",
              backdropFilter: "blur(20px) saturate(140%)",
              WebkitBackdropFilter: "blur(20px) saturate(140%)",
              boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 0 1px ${color}10`,
              color: "#f4f4f5",
              fontSize: 12.5,
              lineHeight: 1.45,
              animation: "toast-in .18s cubic-bezier(.22,1,.36,1)",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                display: "grid", placeItems: "center",
                background: `${color}1a`,
                color,
                flexShrink: 0,
                marginTop: -1,
              }}>
                <Icon size={14} />
              </div>
              <div style={{ whiteSpace: "pre-wrap", paddingTop: 2 }}>{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  padding: 2,
                  marginTop: -1,
                  lineHeight: 0,
                }}
              ><X size={13} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}
