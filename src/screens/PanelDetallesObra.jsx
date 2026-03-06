/**
 * PanelDetallesObra.jsx
 * Panel lateral deslizante que muestra detalles de una obra
 * al seleccionar un puesto en el mapa interactivo.
 *
 * Props:
 *   puesto     { id, label }     — datos del slot del mapa
 *   obra       object | null     — obra asignada a ese puesto (puede ser null)
 *   etapas     array             — todas las etapas (se filtra por obra.id)
 *   ordenes    array             — todas las OC (se filtra por obra.id)
 *   onClose    () => void
 *   onEditarObra  (obra) => void  — abre el modal de edición
 *   onAsignarPuesto (puesto, obra) => void — para vincular/desvincular
 *   esGestion  bool
 */
import { useMemo } from "react";

// ─── Paleta (espeja ObrasScreen) ──────────────────────────────────────────────
const C = {
  bg:     "#09090b",
  s0:     "rgba(255,255,255,0.03)",
  s1:     "rgba(255,255,255,0.06)",
  s2:     "rgba(255,255,255,0.10)",
  b0:     "rgba(255,255,255,0.08)",
  b1:     "rgba(255,255,255,0.15)",
  t0:     "#f4f4f5",
  t1:     "#a1a1aa",
  t2:     "#71717a",
  sans:   "'Outfit', system-ui, sans-serif",
  mono:   "'JetBrains Mono', monospace",
  green:  "#10b981",
  amber:  "#f59e0b",
  red:    "#ef4444",
  blue:   "#3b82f6",
  purple: "#8b5cf6",
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.25)",  label: "Activa"    },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.25)",  label: "Pausada"   },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.25)",  label: "Terminada" },
    cancelada: { dot: "#ef4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)",   label: "Cancelada" },
  },
  etapa: {
    pendiente:  { dot: "#52525b", bar: "rgba(255,255,255,0.05)", text: "#71717a", label: "Pendiente"  },
    en_curso:   { dot: "#3b82f6", bar: "rgba(59,130,246,0.18)",  text: "#3b82f6", label: "En curso"   },
    completado: { dot: "#10b981", bar: "rgba(16,185,129,0.18)",  text: "#10b981", label: "Completado" },
    bloqueado:  { dot: "#ef4444", bar: "rgba(239,68,68,0.18)",   text: "#ef4444", label: "Bloqueado"  },
  },
  oc: {
    pendiente:  { dot: "#52525b", label: "Pendiente"  },
    solicitada: { dot: "#3b82f6", label: "Solicitada" },
    aprobada:   { dot: "#f59e0b", label: "Aprobada"   },
    en_camino:  { dot: "#8b5cf6", label: "En camino"  },
    recibida:   { dot: "#10b981", label: "Recibida"   },
    cancelada:  { dot: "#ef4444", label: "Cancelada"  },
  },
};

const GLASS = { backdropFilter: "blur(32px) saturate(140%)", WebkitBackdropFilter: "blur(32px) saturate(140%)" };

const num  = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const pct  = (done, total) => total > 0 ? Math.round((done / total) * 100) : 0;
const fmtD = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const diasHasta = f => !f ? null : Math.floor((new Date(f + "T00:00:00") - Date.now()) / 86400000);

function ocUrgencia(oc) {
  const d = diasHasta(oc.fecha_limite_pedido);
  if (d === null) return null;
  if (d < 0)   return { color: C.red,   label: `Vencida ${Math.abs(d)}d` };
  if (d === 0) return { color: C.red,   label: "Vence hoy" };
  if (d <= 3)  return { color: C.red,   label: `Vence en ${d}d` };
  if (d <= 7)  return { color: C.amber, label: `Vence en ${d}d` };
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const Dot = ({ color, size = 7 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}80` }} />
);

const ProgressBar = ({ value, color, height = 3 }) => (
  <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden", flex: 1 }}>
    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${color}60, ${color})`, borderRadius: 99, transition: "width .5s ease" }} />
  </div>
);

function Btn({ onClick, children, variant = "ghost", style = {} }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 11 },
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    danger:  { border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ cursor: "pointer", fontFamily: C.sans, transition: "opacity .15s", ...V[variant], ...style }}
    >
      {children}
    </button>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function PanelDetallesObra({
  puesto,
  obra,
  etapas = [],
  ordenes = [],
  onClose,
  onEditarObra,
  onAsignarPuesto,
  esGestion = false,
}) {
  // Etapas de esta obra
  const obraEtapas = useMemo(
    () => etapas.filter(e => e.obra_id === obra?.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [etapas, obra?.id]
  );

  // OC de esta obra (solo críticas = pendiente/solicitada con urgencia)
  const ocObra = useMemo(
    () => ordenes.filter(oc => oc.obra_id === obra?.id),
    [ordenes, obra?.id]
  );
  const ocCriticas = useMemo(
    () => ocObra.filter(oc => {
      if (!["pendiente","solicitada","aprobada"].includes(oc.estado)) return false;
      const u = ocUrgencia(oc);
      return u !== null;
    }).sort((a, b) => diasHasta(a.fecha_limite_pedido) - diasHasta(b.fecha_limite_pedido)),
    [ocObra]
  );

  // Progreso global
  const progreso = useMemo(() => {
    if (!obra) return 0;
    if (!obraEtapas.length) return 0;
    return pct(obraEtapas.filter(e => e.estado === "completado").length, obraEtapas.length);
  }, [obraEtapas, obra]);

  const oC = obra ? (C.obra[obra.estado] ?? C.obra.activa) : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 50, right: 0,
        width: 340,
        height: "calc(100vh - 50px)",
        background: "rgba(10,10,14,0.97)",
        borderLeft: `1px solid ${C.b1}`,
        ...GLASS,
        display: "flex",
        flexDirection: "column",
        zIndex: 800,
        fontFamily: C.sans,
        animation: "slideLeft .2s ease",
      }}
    >
      <style>{`
        @keyframes slideLeft { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes gPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: `1px solid ${C.b0}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          {/* Puesto badge */}
          <div style={{
            padding: "3px 9px",
            background: C.s1, border: `1px solid ${C.b1}`,
            borderRadius: 6, flexShrink: 0,
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.t1, letterSpacing: 1 }}>
              PUESTO {puesto?.label ?? "—"}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={onClose} style={{ fontSize: 18, padding: "0 6px", lineHeight: 1 }}>×</Btn>
        </div>

        {obra ? (
          <>
            {/* Código + estado */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 18, color: C.t0, fontWeight: 700 }}>{obra.codigo}</span>
              <span style={{
                fontSize: 8, letterSpacing: 2, textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 99,
                background: oC.bg, color: oC.dot, border: `1px solid ${oC.border}`,
                fontWeight: 600,
              }}>{oC.label}</span>
            </div>
            {obra.descripcion && (
              <div style={{ fontSize: 12, color: C.t1, marginBottom: 8, lineHeight: 1.4 }}>
                {obra.descripcion}
              </div>
            )}
            {/* Progreso global */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ProgressBar value={progreso} color={oC.dot} height={4} />
              <span style={{ fontFamily: C.mono, fontSize: 11, color: oC.dot, flexShrink: 0 }}>{progreso}%</span>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: C.t1 }}>Puesto disponible</span>
            <span style={{ fontSize: 11, color: C.t2 }}>No hay obra asignada a este puesto.</span>
          </div>
        )}
      </div>

      {/* ── Scroll body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>

        {/* ── DATOS OBRA ── */}
        {obra && (
          <>
            {/* Meta info */}
            <Section title="Información">
              <Grid2>
                <MetaField label="Inicio"    value={fmtD(obra.fecha_inicio)} />
                <MetaField label="Fin est."  value={fmtD(obra.fecha_fin_estimada)} />
                {obra.linea_nombre && <MetaField label="Línea" value={obra.linea_nombre} />}
                {obra.fecha_fin_real && <MetaField label="Fin real" value={fmtD(obra.fecha_fin_real)} />}
              </Grid2>
              {obra.notas && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: C.s0, borderRadius: 7, border: `1px solid ${C.b0}`, fontSize: 11, color: C.t1, lineHeight: 1.5 }}>
                  {obra.notas}
                </div>
              )}
            </Section>

            {/* ── ETAPAS ── */}
            {obraEtapas.length > 0 && (
              <Section title="Etapas">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {obraEtapas.map(etapa => {
                    const ec = C.etapa[etapa.estado] ?? C.etapa.pendiente;
                    return (
                      <div key={etapa.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px", borderRadius: 7,
                        background: etapa.estado === "en_curso" ? ec.bar : C.s0,
                        border: `1px solid ${etapa.estado === "en_curso" ? "rgba(59,130,246,0.2)" : C.b0}`,
                        animation: etapa.estado === "en_curso" ? "gPulse 2.5s ease infinite" : "none",
                      }}>
                        <Dot color={ec.dot} size={6} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: C.t0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {etapa.nombre}{etapa.genera_orden_compra ? " ●" : ""}
                          </div>
                          {etapa.dias_estimados && (
                            <div style={{ fontSize: 9, color: C.t2, marginTop: 1 }}>{etapa.dias_estimados}d est.</div>
                          )}
                        </div>
                        <span style={{ fontSize: 9, color: ec.text, flexShrink: 0, fontFamily: C.mono }}>{ec.label}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── ÓRDENES DE COMPRA CRÍTICAS ── */}
            {ocCriticas.length > 0 && (
              <Section title="⚠ OC Críticas" accent={C.amber}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ocCriticas.map(oc => {
                    const u = ocUrgencia(oc);
                    const ocC = C.oc[oc.estado] ?? C.oc.pendiente;
                    return (
                      <div key={oc.id} style={{
                        padding: "8px 10px", borderRadius: 7,
                        background: "rgba(245,158,11,0.05)",
                        border: "1px solid rgba(245,158,11,0.2)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <Dot color={ocC.dot} size={6} />
                          <span style={{ fontSize: 11, color: C.t0, flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {oc.descripcion ?? oc.tipo ?? "OC"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: ocC.dot, letterSpacing: 1, textTransform: "uppercase" }}>{ocC.label}</span>
                          {u && (
                            <span style={{
                              fontSize: 8, padding: "2px 6px", borderRadius: 4,
                              background: `${u.color}18`, color: u.color,
                              border: `1px solid ${u.color}35`,
                              fontWeight: 600, letterSpacing: 0.5,
                            }}>{u.label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── TODAS LAS OC (resumen) ── */}
            {ocObra.length > 0 && ocCriticas.length === 0 && (
              <Section title="Órdenes de compra">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {ocObra.map(oc => {
                    const ocC = C.oc[oc.estado] ?? C.oc.pendiente;
                    return (
                      <span key={oc.id} style={{
                        fontSize: 9, padding: "3px 8px", borderRadius: 99,
                        background: C.s1, color: ocC.dot,
                        border: `1px solid ${C.b0}`, fontWeight: 600,
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: ocC.dot, flexShrink: 0, display: "inline-block" }} />
                        {oc.descripcion?.substring(0, 18) ?? ocC.label}
                      </span>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Estado vacío ── */}
        {!obra && (
          <div style={{
            marginTop: 20, padding: "28px 16px", borderRadius: 10,
            background: C.s0, border: `1px dashed ${C.b0}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>⊕</div>
            <div style={{ fontSize: 12, color: C.t1, marginBottom: 6 }}>Puesto libre</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>
              Asigná una obra a este puesto desde la vista de grilla<br />
              editando el campo <span style={{ fontFamily: C.mono, color: C.t1 }}>puesto_mapa</span>.
            </div>
          </div>
        )}
      </div>

      {/* ── Footer acciones ── */}
      {esGestion && obra && (
        <div style={{
          padding: "10px 16px",
          borderTop: `1px solid ${C.b0}`,
          display: "flex", gap: 8, flexShrink: 0,
        }}>
          <Btn variant="primary" onClick={() => onEditarObra?.(obra)} style={{ flex: 1, textAlign: "center" }}>
            ✎ Editar obra
          </Btn>
          <Btn variant="outline" onClick={() => onAsignarPuesto?.(puesto, obra)} style={{ fontSize: 10, padding: "6px 10px" }}>
            Desvincular
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────
function Section({ title, children, accent }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 8, letterSpacing: 2, textTransform: "uppercase",
        color: accent ?? "rgba(255,255,255,0.3)",
        marginBottom: 7, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {title}
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {children}
    </div>
  );
}

function MetaField({ label, value }) {
  return (
    <div style={{ padding: "6px 9px", background: "rgba(255,255,255,0.025)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#f4f4f5", fontFamily: "'JetBrains Mono', monospace" }}>{value ?? "—"}</div>
    </div>
  );
}
