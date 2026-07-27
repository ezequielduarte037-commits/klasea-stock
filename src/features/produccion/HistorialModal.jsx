import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { History, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { C } from "@/theme";
import { fetchHistorial } from "@/features/produccion/comprasObraApi";

// ─────────────────────────────────────────────────────────────────────────────
// Historial de cambios de una etapa. Las filas las escribe un trigger en la
// base, así que registra todo: entre por esta pantalla, por otra, o por SQL.
// ─────────────────────────────────────────────────────────────────────────────

const ICONO = {
  insert: { icon: Plus, color: "var(--green)", soft: "var(--green-soft)", borde: "var(--green-border)" },
  update: { icon: Pencil, color: "var(--blue)", soft: "var(--blue-soft)", borde: "var(--blue-border)" },
  delete: { icon: Trash2, color: "var(--red)", soft: "var(--red-soft)", borde: "var(--red-border)" },
};

function cuando(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (mismoDia) return `hoy ${hora}`;
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

export default function HistorialModal({ etapa, obraCompraEtapaId = null, compraEtapaId = null, onClose }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchHistorial({ obraCompraEtapaId, compraEtapaId })
      .then((r) => { if (alive) setFilas(r); })
      .catch(() => { if (alive) setFilas([]); })
      .finally(() => { if (alive) setCargando(false); });
    return () => { alive = false; };
  }, [obraCompraEtapaId, compraEtapaId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 210, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "10vh 16px 16px", background: "var(--overlay)",
        backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)", maxHeight: "72vh", display: "flex", flexDirection: "column", overflow: "hidden",
          background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
          boxShadow: "0 32px 70px -20px var(--shadow-strong)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 12px 13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: C.violetL, border: `1px solid ${C.violetB}`, color: C.violet }}>
            <History size={15} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 850, color: C.text }}>Historial de cambios</div>
            {etapa && <div style={{ fontSize: 11.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ce-ghost"
            style={{ width: 28, height: 28, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: C.panel2, color: C.dim, cursor: "pointer" }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
          {cargando && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, color: C.dim, padding: "30px 14px", fontSize: 13 }}>
              <Loader2 size={16} className="spin" /> Cargando historial…
            </div>
          )}

          {!cargando && !filas.length && (
            <div style={{ textAlign: "center", padding: "30px 14px", color: C.dim, fontSize: 13 }}>
              Todavía no hay cambios registrados en esta etapa.
            </div>
          )}

          {!cargando && filas.map((f, i) => {
            const est = ICONO[f.accion] || ICONO.update;
            const Icon = est.icon;
            const ultimo = i === filas.length - 1;
            return (
              <div key={f.id} style={{ display: "flex", gap: 11, padding: "3px 6px" }}>
                {/* línea de tiempo */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: est.soft, border: `1px solid ${est.borde}`, color: est.color }}>
                    <Icon size={12} />
                  </span>
                  {!ultimo && <span style={{ flex: 1, width: 1, background: C.border, marginTop: 3 }} />}
                </div>
                <div style={{ minWidth: 0, paddingBottom: ultimo ? 4 : 13, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{f.descripcion || "Cambio registrado"}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    <b style={{ fontWeight: 750, color: C.muted }}>{f.actor_nombre || "sistema"}</b> · {cuando(f.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
