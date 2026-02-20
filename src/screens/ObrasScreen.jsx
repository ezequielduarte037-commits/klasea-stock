import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";
import useAlertas from "../hooks/useAlertas";

/* ─── helpers ───────────────────────────────────────────── */
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
function diasDesde(f) {
  if (!f) return null;
  return Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000);
}
function diasEntre(a, b) {
  if (!a || !b) return null;
  return Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}
function inferirLinea(codigo) {
  if (!codigo) return "Sin línea";
  const m = codigo.match(/^[Kk]?(\d+)/);
  return m ? `K${m[1]}` : codigo.split("-")[0].toUpperCase();
}

/* ─── constants ─────────────────────────────────────────── */
const ESTADO_OBRA = {
  activa:    { label: "ACTIVA",    dot: "#30d158", bg: "rgba(48,209,88,0.08)",   border: "rgba(48,209,88,0.2)"   },
  pausada:   { label: "PAUSADA",   dot: "#ffd60a", bg: "rgba(255,214,10,0.08)",  border: "rgba(255,214,10,0.2)"  },
  terminada: { label: "TERMINADA", dot: "#555",    bg: "rgba(80,80,80,0.08)",    border: "rgba(80,80,80,0.2)"    },
  cancelada: { label: "CANCEL.",   dot: "#ff453a", bg: "rgba(255,69,58,0.08)",   border: "rgba(255,69,58,0.2)"   },
};
const ACCION_COLORS = {
  notificacion: { color: "#0a84ff", bg: "rgba(10,132,255,0.1)",  border: "rgba(10,132,255,0.25)", icon: "🔔" },
  compra:       { color: "#30d158", bg: "rgba(48,209,88,0.1)",   border: "rgba(48,209,88,0.25)",  icon: "🛒" },
  tarea:        { color: "#ffd60a", bg: "rgba(255,214,10,0.1)",  border: "rgba(255,214,10,0.25)", icon: "☑️" },
  alerta:       { color: "#ff453a", bg: "rgba(255,69,58,0.1)",   border: "rgba(255,69,58,0.25)",  icon: "🚨" },
};

/* ─── shared style helpers ──────────────────────────────── */
function makeBadge(est) {
  const s = ESTADO_OBRA[est] ?? ESTADO_OBRA.activa;
  return {
    display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
    borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`,
    fontSize: 9, fontWeight: 800, color: s.dot, letterSpacing: 0.8,
  };
}
function makeChip(color) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px",
    borderRadius: 20, background: `${color}12`, border: `1px solid ${color}28`,
    fontSize: 10, color, fontWeight: 700, letterSpacing: 0.3,
  };
}

const BTN    = { border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.035)", color: "#b0b0b0", padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12 };
const BTNP   = { border: "none", background: "#fff", color: "#000", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontWeight: 800, fontSize: 12 };
const BTNSM  = { border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(255,255,255,0.3)", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600 };
const BTNDEL = { border: "1px solid rgba(255,69,58,0.22)", background: "transparent", color: "#ff453a", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600 };
const INPUT  = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 9, fontSize: 13, outline: "none" };
const LABEL  = { fontSize: 9, letterSpacing: 2, opacity: 0.3, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 700 };

/* ════════════════════════════════════════════════════════════
   ObraDetail  (standalone component — props only, no closure)
═══════════════════════════════════════════════════════════════ */
function ObraDetail({
  obra, tl, tlMap, procesos, checks, reglas, esGestion,
  procSelId, setProcSelId,
  onCambiarEstado, onIniciarProceso, onCompletarProceso,
  onToggleCheck, onAddStepFor, onConfirmDel, onAddRegla, onBorrarRegla,
  comparacion,
}) {
  const [tab, setTab] = useState("timeline");
  const checksObra    = checks.filter(c => c.obra_id === obra.id);
  const reglasObra    = reglas.filter(r => r.obra_id === obra.id);
  const selProc       = (procSelId && procSelId !== "__add__") ? procesos.find(p => p.id === procSelId) : null;
  const selTl         = selProc ? tlMap[selProc.id] : null;
  const checksProc    = selProc ? checksObra.filter(c => c.proceso_id === selProc.id) : [];
  const checksDone    = checksProc.filter(c => c.completado).length;

  const TABS = [
    { id: "timeline", label: "Timeline" },
    { id: "reglas",   label: `⚡ Reglas${reglasObra.length ? ` (${reglasObra.length})` : ""}` },
    { id: "info",     label: "Info" },
  ];

  return (
    <div style={{
      margin: "0 24px 10px 44px", borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(6,6,6,0.96)", backdropFilter: "blur(20px)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>{obra.codigo}</span>
        <span style={makeBadge(obra.estado)}>{ESTADO_OBRA[obra.estado]?.label}</span>
        {obra.descripcion && <span style={{ fontSize: 11, opacity: 0.3 }}>{obra.descripcion}</span>}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              ...BTNSM, padding: "4px 10px",
              background: tab === t.id ? "rgba(255,255,255,0.07)" : "transparent",
              color:      tab === t.id ? "#fff" : "rgba(255,255,255,0.3)",
              border:     tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
        {esGestion && (
          <div style={{ display: "flex", gap: 4 }}>
            {obra.estado !== "pausada"   && <button style={BTNSM} onClick={() => onCambiarEstado(obra.id, "pausada")}>⏸</button>}
            {obra.estado !== "activa"    && <button style={BTNSM} onClick={() => onCambiarEstado(obra.id, "activa")}>▶</button>}
            {obra.estado !== "terminada" && <button style={BTNSM} onClick={() => onCambiarEstado(obra.id, "terminada")}>✓ Fin</button>}
            <button style={BTNDEL} onClick={() => onConfirmDel(obra.id)}>🗑</button>
          </div>
        )}
      </div>

      {/* ── TAB: TIMELINE ── */}
      {tab === "timeline" && (
        <div style={{ display: "grid", gridTemplateColumns: (selProc || procSelId === "__add__") ? "1fr 290px" : "1fr" }}>

          {/* Gantt */}
          <div style={{ padding: "16px 18px", overflowX: "auto" }}>
            <div style={{ fontSize: 9, opacity: 0.22, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              PIPELINE · {obra.codigo}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: "max-content" }}>
              {procesos.map((p, idx) => {
                const t       = tlMap[p.id];
                const diasAct = t?.dias_reales ?? (t?.fecha_inicio
                  ? Math.floor((Date.now() - new Date(t.fecha_inicio + "T00:00:00")) / 86400000) : null);
                const comp    = diasAct != null ? comparacion(p.id, diasAct) : null;
                const checksP = checksObra.filter(c => c.proceso_id === p.id);
                const doneP   = checksP.filter(c => c.completado).length;
                const isSelP  = procSelId === p.id;

                const nodeColor = !t ? "rgba(255,255,255,0.08)"
                  : t.estado === "completado" ? "#30d158"
                  : t.estado === "en_curso"   ? (p.color ?? "#ffd60a")
                  : "rgba(255,255,255,0.15)";
                const textColor = !t ? "rgba(255,255,255,0.18)"
                  : t.estado === "completado" ? "#30d158"
                  : t.estado === "en_curso"   ? "#fff"
                  : "rgba(255,255,255,0.4)";

                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "flex-start" }}>
                    <div
                      onClick={() => setProcSelId(isSelP ? null : p.id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        cursor: "pointer", padding: "8px 9px 12px", minWidth: 78,
                        borderRadius: 10, transition: "all 0.15s",
                        background: isSelP ? "rgba(255,255,255,0.05)" : "transparent",
                        border:     isSelP ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                      }}
                    >
                      {/* Circle */}
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        border: `2px solid ${nodeColor}`,
                        background: !t ? "transparent"
                          : t.estado === "completado" ? "rgba(48,209,88,0.1)" : "rgba(255,255,255,0.025)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 17, position: "relative",
                        boxShadow:  t?.estado === "en_curso" ? `0 0 16px ${nodeColor}44` : "none",
                        animation:  t?.estado === "en_curso" ? "nodePulse 2.5s ease-in-out infinite" : "none",
                      }}>
                        {t?.estado === "completado" ? <span style={{ color: "#30d158", fontSize: 16 }}>✓</span>
                         : t?.estado === "en_curso"  ? <span>{p.icono}</span>
                         : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "monospace" }}>{p.orden}</span>}
                        {checksP.length > 0 && (
                          <div style={{
                            position: "absolute", top: -4, right: -4, width: 16, height: 16,
                            borderRadius: "50%", background: doneP === checksP.length ? "#30d158" : "rgba(255,214,10,0.9)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, fontWeight: 800, color: "#000", border: "1px solid #000",
                          }}>{doneP}/{checksP.length}</div>
                        )}
                      </div>
                      {/* Name */}
                      <div style={{ fontSize: 9, textAlign: "center", maxWidth: 70, lineHeight: 1.3, fontWeight: 600, wordBreak: "break-word", color: textColor }}>
                        {p.nombre}
                      </div>
                      {/* Days */}
                      {t ? (
                        <div style={{ fontSize: 8, color: comp?.color ?? "rgba(255,255,255,0.3)", fontWeight: 700, textAlign: "center" }}>
                          {diasAct != null ? `${diasAct}d` : fmtDate(t.fecha_inicio)}
                          {comp && <div style={{ opacity: 0.6 }}>prom {comp.promedio}d</div>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", textAlign: "center" }}>~{p.dias_esperados}d</div>
                      )}
                      {/* Initiate btn */}
                      {esGestion && !t && (
                        <button
                          style={{ ...BTNSM, fontSize: 8, padding: "2px 7px", marginTop: 2 }}
                          onClick={e => { e.stopPropagation(); onIniciarProceso(obra.id, p.id); }}
                        >▶</button>
                      )}
                    </div>
                    {/* Connector */}
                    {idx < procesos.length - 1 && (
                      <div style={{
                        width: 20, height: 2, flexShrink: 0, marginTop: 29, borderRadius: 1,
                        background: t?.estado === "completado"
                          ? "linear-gradient(90deg,rgba(48,209,88,0.5),rgba(48,209,88,0.1))"
                          : "rgba(255,255,255,0.05)",
                      }} />
                    )}
                  </div>
                );
              })}
              {/* Add node */}
              {esGestion && (
                <>
                  <div style={{ width: 20, height: 2, flexShrink: 0, marginTop: 29, background: "rgba(255,255,255,0.03)" }} />
                  <div
                    onClick={() => setProcSelId("__add__")}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      cursor: "pointer", padding: "8px 9px 12px", minWidth: 60, borderRadius: 10,
                      border: procSelId === "__add__" ? "1px solid rgba(255,255,255,0.1)" : "1px dashed rgba(255,255,255,0.07)",
                      background: procSelId === "__add__" ? "rgba(255,255,255,0.04)" : "transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "rgba(255,255,255,0.18)" }}>+</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.16)", fontWeight: 600 }}>Iniciar</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Side panel — selected process */}
          {selProc && (
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", padding: 16, background: "rgba(255,255,255,0.01)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{selProc.icono} {selProc.nombre}</div>
                  <div style={{ fontSize: 9, opacity: 0.28 }}>~{selProc.dias_esperados}d estimados</div>
                </div>
                <button style={BTNSM} onClick={() => setProcSelId(null)}>✕</button>
              </div>
              {selTl ? (
                <>
                  <span style={{
                    fontSize: 9, padding: "3px 8px", borderRadius: 6, fontWeight: 700, letterSpacing: 1, display: "inline-block", marginBottom: 10,
                    background: selTl.estado === "completado" ? "rgba(48,209,88,0.1)" : "rgba(255,214,10,0.08)",
                    color:      selTl.estado === "completado" ? "#30d158" : "#ffd60a",
                    border:     `1px solid ${selTl.estado === "completado" ? "rgba(48,209,88,0.2)" : "rgba(255,214,10,0.2)"}`,
                  }}>{selTl.estado.toUpperCase()}</span>
                  <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 12, lineHeight: 1.7 }}>
                    {selTl.fecha_inicio && <div>Inicio: <span style={{ color: "#d0d0d0" }}>{fmtDate(selTl.fecha_inicio)}</span></div>}
                    {selTl.fecha_fin    && <div>Fin: <span style={{ color: "#d0d0d0" }}>{fmtDate(selTl.fecha_fin)}</span></div>}
                    {selTl.dias_reales  && <div>Días: <span style={{ color: "#fff", fontWeight: 700 }}>{selTl.dias_reales}</span></div>}
                  </div>
                  {/* Checklist */}
                  {checksProc.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 9, opacity: 0.28, letterSpacing: 1.5, marginBottom: 7, textTransform: "uppercase" }}>
                        Checklist ({checksDone}/{checksProc.length})
                      </div>
                      <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 99, marginBottom: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, transition: "width 0.4s", background: "#30d158",
                          width: `${checksProc.length ? (checksDone / checksProc.length) * 100 : 0}%` }} />
                      </div>
                      {checksProc.map(c => (
                        <div key={c.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <div onClick={() => onToggleCheck(c.id, c.completado)} style={{
                            width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1, cursor: "pointer",
                            border: `1px solid ${c.completado ? "#30d158" : "rgba(255,255,255,0.15)"}`,
                            background: c.completado ? "#30d158" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#000",
                          }}>{c.completado && "✓"}</div>
                          <span style={{ fontSize: 11, lineHeight: 1.4,
                            color: c.completado ? "rgba(255,255,255,0.28)" : "#c0c0c0",
                            textDecoration: c.completado ? "line-through" : "none" }}>{c.texto}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {esGestion && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {selTl.estado === "en_curso" && (
                        <button style={{ ...BTNSM, color: "#30d158", borderColor: "rgba(48,209,88,0.3)", padding: "4px 10px" }}
                          onClick={() => onCompletarProceso(selTl.id, obra.id, selProc.id)}>✓ Completar</button>
                      )}
                      <button style={BTNSM} onClick={() => onAddStepFor({ obraId: obra.id, procesoId: selProc.id })}>+ Paso</button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 10, opacity: 0.25, marginBottom: 12 }}>Proceso no iniciado</div>
                  {esGestion && <button style={BTNP} onClick={() => onIniciarProceso(obra.id, selProc.id)}>▶ Iniciar</button>}
                </div>
              )}
            </div>
          )}

          {/* Add process panel */}
          {procSelId === "__add__" && (
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", padding: 16, background: "rgba(255,255,255,0.01)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Iniciar proceso</div>
                <button style={BTNSM} onClick={() => setProcSelId(null)}>✕</button>
              </div>
              <div style={{ fontSize: 9, opacity: 0.25, marginBottom: 10, letterSpacing: 1 }}>DISPONIBLES</div>
              {procesos.filter(p => !tlMap[p.id]).length === 0 && (
                <div style={{ fontSize: 10, opacity: 0.25, textAlign: "center", padding: 16 }}>Todos iniciados.</div>
              )}
              {procesos.filter(p => !tlMap[p.id]).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11 }}>{p.icono} {p.nombre}</span>
                  <button style={{ ...BTNSM, color: "#fff" }} onClick={() => { onIniciarProceso(obra.id, p.id); setProcSelId(p.id); }}>▶</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: REGLAS ── */}
      {tab === "reglas" && (
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Reglas de automatización</div>
              <div style={{ fontSize: 9, opacity: 0.28, marginTop: 2 }}>Acciones al completar etapas</div>
            </div>
            {esGestion && <button style={BTNP} onClick={() => onAddRegla(obra.id)}>+ Agregar</button>}
          </div>
          {reglasObra.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <div style={{ fontSize: 26, marginBottom: 10, opacity: 0.3 }}>⚡</div>
              <div style={{ fontSize: 11, opacity: 0.25, lineHeight: 1.7 }}>
                Sin reglas.<br />Creá reglas para disparar notificaciones, compras o tareas al completar etapas.
              </div>
            </div>
          ) : reglasObra.map(r => {
            const ac = ACCION_COLORS[r.accion] ?? ACCION_COLORS.notificacion;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ padding: "3px 9px", borderRadius: 6, background: ac.bg, border: `1px solid ${ac.border}`, fontSize: 9, fontWeight: 700, color: ac.color, flexShrink: 0 }}>
                  {ac.icon} {r.accion.toUpperCase()}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#d0d0d0", marginBottom: 2 }}>{r.descripcion}</div>
                  <div style={{ fontSize: 9, opacity: 0.3 }}>
                    {r.procesos ? `Después de: ${r.procesos.icono} ${r.procesos.nombre}` : "Inmediato"}
                    {r.destinatario && ` · Para: ${r.destinatario}`}
                  </div>
                </div>
                {esGestion && <button style={BTNDEL} onClick={() => onBorrarRegla(r.id)}>✕</button>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: INFO ── */}
      {tab === "info" && (
        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
            {[
              { label: "Inicio",       val: fmtDate(obra.fecha_inicio) },
              { label: "Fin estimado", val: fmtDate(obra.fecha_fin_estimada) },
              { label: "Fin real",     val: fmtDate(obra.fecha_fin_real) },
              { label: "Días en obra", val: obra.fecha_inicio ? `${diasDesde(obra.fecha_inicio)}d` : "—" },
              { label: "Tiempo total", val: obra.fecha_inicio && obra.fecha_fin_real ? `${diasEntre(obra.fecha_inicio, obra.fecha_fin_real)}d` : "—" },
              { label: "Línea",        val: obra.linea ?? inferirLinea(obra.codigo) },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 8, opacity: 0.28, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>
          {obra.notas && (
            <div style={{ marginTop: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 8, opacity: 0.28, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>NOTAS</div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{obra.notas}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════ */
export default function ObrasScreen({ profile, signOut }) {
  const role      = profile?.role ?? "invitado";
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  const [obras,    setObras]    = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [procesos, setProcesos] = useState([]);
  const [checks,   setChecks]   = useState([]);
  const [reglas,   setReglas]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [msg,      setMsg]      = useState("");

  const [expandedLineas, setExpandedLineas] = useState({});
  const [obraSelId,      setObraSelId]      = useState(null);
  const [procSelId,      setProcSelId]      = useState(null);
  const [showNuevaObra,  setShowNuevaObra]  = useState(false);
  const [showConfirmDel, setShowConfirmDel] = useState(null);
  const [showAddRegla,   setShowAddRegla]   = useState(null);
  const [addStepFor,     setAddStepFor]     = useState(null);
  const [newStepTxt,     setNewStepTxt]     = useState("");
  const [formObra,       setFormObra]       = useState({
    codigo: "", descripcion: "", linea: "", tipo: "barco",
    estado: "activa", fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin_estimada: "", notas: "",
  });
  const [formRegla, setFormRegla] = useState({ despues_de: "", accion: "notificacion", descripcion: "", destinatario: "" });

  const { alertas = [], promediosPorProceso = {}, config = {} } = useAlertas() ?? {};

  /* ─── data ─── */
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from("produccion_obras").select("*").order("created_at", { ascending: false }),
      supabase.from("obra_timeline").select("*, procesos(id,nombre,dias_esperados,orden,color,icono)").order("created_at"),
      supabase.from("procesos").select("*").eq("activo", true).order("orden"),
      supabase.from("obra_proceso_checks").select("*").order("created_at"),
      supabase.from("obra_reglas").select("*, procesos(nombre,icono)").order("created_at").maybeSingle ? undefined : supabase.from("obra_reglas").select("*, procesos(nombre,icono)").order("created_at"),
    ]);
    // r5 might fail if table doesn't exist yet
    setObras(r1.data ?? []);
    setTimeline(r2.data ?? []);
    setProcesos(r3.data ?? []);
    setChecks(r4.data ?? []);
    if (r1.error) setErr(r1.error.message);
    setLoading(false);
  }

  // Separate load for reglas to not crash if table missing
  async function cargarReglas() {
    try {
      const { data } = await supabase.from("obra_reglas").select("*, procesos(nombre,icono)").order("created_at");
      setReglas(data ?? []);
    } catch (_) { setReglas([]); }
  }

  useEffect(() => {
    cargar();
    cargarReglas();
    const ch = supabase.channel("rt-obras-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, () => { cargar(); cargarReglas(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_timeline" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_proceso_checks" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  /* ─── derived ─── */
  const alertasPorObra = useMemo(() => {
    const map = {};
    (alertas ?? []).forEach(a => {
      if (!map[a.obra_id]) map[a.obra_id] = { total: 0, criticas: 0 };
      map[a.obra_id].total++;
      if (a.gravedad === "critical") map[a.obra_id].criticas++;
    });
    return map;
  }, [alertas]);

  const obrasPorLinea = useMemo(() => {
    const map = {};
    obras.forEach(o => {
      const linea = o.linea || inferirLinea(o.codigo);
      if (!map[linea]) map[linea] = [];
      map[linea].push(o);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [obras]);

  const lineasDisponibles = useMemo(() =>
    [...new Set(obras.map(o => o.linea || inferirLinea(o.codigo)))],
    [obras]);

  const stats = useMemo(() => ({
    lineas:     obrasPorLinea.length,
    activas:    obras.filter(o => o.estado === "activa").length,
    pausadas:   obras.filter(o => o.estado === "pausada").length,
    enCurso:    timeline.filter(t => t.estado === "en_curso").length,
    terminadas: obras.filter(o => o.estado === "terminada").length,
  }), [obras, timeline, obrasPorLinea]);

  function getTimeline(obraId) {
    return timeline.filter(t => t.obra_id === obraId)
      .sort((a, b) => num(a.procesos?.orden) - num(b.procesos?.orden));
  }

  function comparacion(procesoId, diasReales) {
    const prom = promediosPorProceso?.[procesoId];
    const tol  = (config?.alerta_tolerancia_pct ?? 20) / 100;
    if (!prom || diasReales == null) return null;
    const ratio = diasReales / prom;
    return {
      promedio: Math.round(prom),
      demora: diasReales - Math.round(prom),
      color: ratio <= 1 ? "#30d158" : ratio <= 1 + tol ? "#ffd60a" : "#ff453a",
    };
  }

  function progresoPct(obraId) {
    const tl = timeline.filter(t => t.obra_id === obraId);
    if (!tl.length) return 0;
    return Math.round((tl.filter(t => t.estado === "completado").length / tl.length) * 100);
  }

  /* ─── actions ─── */
  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.codigo.trim()) return setErr("El código es obligatorio.");
    const linea = formObra.linea.trim() || inferirLinea(formObra.codigo);
    const { error } = await supabase.from("produccion_obras").insert({
      codigo: formObra.codigo.trim().toUpperCase(),
      descripcion: formObra.descripcion.trim() || null,
      linea,
      tipo: formObra.tipo,
      estado: formObra.estado,
      fecha_inicio: formObra.fecha_inicio || null,
      fecha_fin_estimada: formObra.fecha_fin_estimada || null,
      notas: formObra.notas.trim() || null,
    });
    if (error) return setErr(error.message);

    const { data: lamObra } = await supabase.from("laminacion_obras")
      .upsert({ nombre: formObra.codigo.trim().toUpperCase(), descripcion: formObra.descripcion.trim() || null,
        estado: "activa", fecha_inicio: formObra.fecha_inicio || null },
        { onConflict: "nombre", ignoreDuplicates: false }).select().single();
    if (lamObra?.id) {
      const { data: mats } = await supabase.from("laminacion_materiales").select("id");
      if (mats?.length) await supabase.from("laminacion_obra_materiales")
        .upsert(mats.map(m => ({ obra_id: lamObra.id, material_id: m.id, cantidad_necesaria: 0 })),
          { onConflict: "obra_id,material_id", ignoreDuplicates: true });
    }
    setMsg(`✅ Obra ${formObra.codigo.toUpperCase()} creada en ${linea}.`);
    setFormObra({ codigo: "", descripcion: "", linea: "", tipo: "barco", estado: "activa",
      fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin_estimada: "", notas: "" });
    setShowNuevaObra(false);
    setExpandedLineas(p => ({ ...p, [linea]: true }));
    await cargar();
  }

  async function borrarObra(obraId) {
    const obra = obras.find(o => o.id === obraId);
    if (obra?.codigo) await supabase.from("laminacion_obras").delete().eq("nombre", obra.codigo);
    const { error } = await supabase.from("produccion_obras").delete().eq("id", obraId);
    if (error) return setErr(error.message);
    setShowConfirmDel(null); setObraSelId(null);
    setMsg("🗑 Obra eliminada."); setTimeout(() => setMsg(""), 2500);
    await cargar();
  }

  async function cambiarEstado(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = new Date().toISOString().slice(0, 10);
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    await cargar();
  }

  async function iniciarProceso(obraId, procesoId) {
    const { error } = await supabase.from("obra_timeline").upsert({
      obra_id: obraId, proceso_id: procesoId,
      fecha_inicio: new Date().toISOString().slice(0, 10), estado: "en_curso",
      registrado_por: profile?.username ?? "sistema",
    }, { onConflict: "obra_id,proceso_id" });
    if (error) { setErr(error.message); return; }
    try { await supabase.rpc("fn_crear_checks_proceso", { p_obra_id: obraId, p_proceso_id: procesoId }); } catch (_) {}
    await cargar();
  }

  async function completarProceso(timelineId, obraId, procesoId) {
    await supabase.from("obra_timeline")
      .update({ fecha_fin: new Date().toISOString().slice(0, 10), estado: "completado" })
      .eq("id", timelineId);
    const reglasActivas = reglas.filter(r => r.obra_id === obraId && r.despues_de === procesoId && r.activo);
    setMsg(reglasActivas.length
      ? `✅ Completado · ${reglasActivas.length} regla(s) disparada(s).`
      : "✅ Proceso completado.");
    setTimeout(() => setMsg(""), 3000);
    await cargar();
  }

  async function toggleCheck(checkId, completado) {
    await supabase.from("obra_proceso_checks").update({
      completado: !completado,
      completado_por: !completado ? (profile?.username ?? "usuario") : null,
      completado_en:  !completado ? new Date().toISOString() : null,
    }).eq("id", checkId);
    await cargar();
  }

  async function agregarCheck() {
    if (!newStepTxt.trim() || !addStepFor) return;
    await supabase.from("obra_proceso_checks").insert({
      obra_id: addStepFor.obraId, proceso_id: addStepFor.procesoId,
      texto: newStepTxt.trim(), completado: false,
    });
    setNewStepTxt(""); setAddStepFor(null);
    await cargar();
  }

  async function guardarRegla(e) {
    e.preventDefault();
    if (!formRegla.descripcion.trim()) return;
    await supabase.from("obra_reglas").insert({
      obra_id: showAddRegla,
      despues_de: formRegla.despues_de || null,
      accion: formRegla.accion,
      descripcion: formRegla.descripcion.trim(),
      destinatario: formRegla.destinatario.trim() || null,
      creado_por: profile?.username ?? "sistema",
    });
    setFormRegla({ despues_de: "", accion: "notificacion", descripcion: "", destinatario: "" });
    setShowAddRegla(null);
    await cargarReglas();
  }

  async function borrarRegla(id) {
    await supabase.from("obra_reglas").delete().eq("id", id);
    await cargarReglas();
  }

  /* ─── render ─── */
  const OVERLAY = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(14px)",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
    zIndex: 9999, padding: "60px 20px", overflowY: "auto" };
  const MODAL = { background: "#060606", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18, padding: 28, width: "100%", maxWidth: 500,
    boxShadow: "0 40px 120px rgba(0,0,0,0.97)" };

  return (
    <div style={{ background: "#020202", minHeight: "100vh", color: "#c0c0c0", fontFamily: "'DM Sans',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,600;9..40,700;9..40,800&display=swap');
        @keyframes nodePulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.09);border-radius:3px}
      `}</style>
      <NotificacionesBell profile={profile} />
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ overflow: "auto", display: "flex", flexDirection: "column" }}>

          {/* Sticky header */}
          <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(2,2,2,0.94)",
            backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.05)",
            padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: 3, opacity: 0.2, marginBottom: 2, textTransform: "uppercase", fontWeight: 700 }}>PRODUCCIÓN</div>
              <h1 style={{ fontFamily: "'Space Mono',monospace", fontSize: 20, margin: 0, color: "#fff", fontWeight: 700, letterSpacing: 2 }}>OBRAS</h1>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { l: "LÍNEAS",   v: stats.lineas,     c: "#fff"    },
                { l: "ACTIVAS",  v: stats.activas,    c: "#30d158" },
                { l: "PAUSADAS", v: stats.pausadas,   c: "#ffd60a" },
                { l: "PROCESOS", v: stats.enCurso,    c: "#0a84ff" },
                { l: "TERM.",    v: stats.terminadas, c: "#555"    },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ padding: "5px 12px", borderRadius: 7, textAlign: "center",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 7, opacity: 0.25, letterSpacing: 1.5, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c, fontFamily: "'Space Mono',monospace", lineHeight: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {esGestion && <button style={BTNP} onClick={() => setShowNuevaObra(v => !v)}>{showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}</button>}
              <button style={BTN} onClick={() => { cargar(); cargarReglas(); }}>↻</button>
            </div>
          </div>

          <div style={{ padding: "16px 0 60px", flex: 1 }}>
            {err && <div style={{ margin: "0 24px 10px", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,69,58,0.3)", color: "#ff6b6b", background: "rgba(255,69,58,0.04)", fontSize: 12 }}>{err}</div>}
            {msg && <div style={{ margin: "0 24px 10px", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(48,209,88,0.3)", color: "#a6ffbf", background: "rgba(48,209,88,0.04)", fontSize: 12 }}>{msg}</div>}

            {/* Nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={{ margin: "0 24px 16px", padding: 18, borderRadius: 12, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.015)" }}>
                <div style={{ fontSize: 9, opacity: 0.28, letterSpacing: 2, marginBottom: 14, textTransform: "uppercase" }}>NUEVA OBRA</div>
                <form onSubmit={crearObra}>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 120px 1fr 120px 130px 130px", gap: 10 }}>
                    <div>
                      <label style={LABEL}>Línea</label>
                      <input style={{ ...INPUT, fontFamily: "'Space Mono',monospace", width: "100%" }}
                        placeholder="K43" list="lineas-list"
                        value={formObra.linea} onChange={e => setFormObra(f => ({ ...f, linea: e.target.value.toUpperCase() }))} />
                      <datalist id="lineas-list">{lineasDisponibles.map(l => <option key={l} value={l} />)}</datalist>
                    </div>
                    <div>
                      <label style={LABEL}>Código *</label>
                      <input style={{ ...INPUT, fontFamily: "'Space Mono',monospace", width: "100%" }}
                        placeholder="43-12" required
                        value={formObra.codigo} onChange={e => setFormObra(f => ({ ...f, codigo: e.target.value }))} />
                    </div>
                    <div>
                      <label style={LABEL}>Descripción</label>
                      <input style={{ ...INPUT, width: "100%" }} placeholder="Klase 43 – Casco 12"
                        value={formObra.descripcion} onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <label style={LABEL}>Estado</label>
                      <select style={{ ...INPUT, width: "100%" }} value={formObra.estado} onChange={e => setFormObra(f => ({ ...f, estado: e.target.value }))}>
                        <option value="activa">Activa</option><option value="pausada">Pausada</option>
                      </select>
                    </div>
                    <div>
                      <label style={LABEL}>Inicio</label>
                      <input type="date" style={{ ...INPUT, width: "100%" }} value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} />
                    </div>
                    <div>
                      <label style={LABEL}>Fin estimado</label>
                      <input type="date" style={{ ...INPUT, width: "100%" }} value={formObra.fecha_fin_estimada} onChange={e => setFormObra(f => ({ ...f, fecha_fin_estimada: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={LABEL}>Notas</label>
                    <input style={{ ...INPUT, width: "100%" }} value={formObra.notas} onChange={e => setFormObra(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                  <button type="submit" style={{ ...BTNP, marginTop: 14 }}>Crear obra</button>
                </form>
              </div>
            )}

            {/* Lines */}
            {loading ? (
              <div style={{ textAlign: "center", padding: 80, opacity: 0.18, fontFamily: "'Space Mono',monospace", letterSpacing: 3, fontSize: 11 }}>CARGANDO…</div>
            ) : obrasPorLinea.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80, opacity: 0.15 }}>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 36, marginBottom: 14 }}>[ ]</div>
                <div style={{ fontSize: 12 }}>Sin obras. Creá la primera.</div>
              </div>
            ) : (
              <div style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", margin: "0 24px" }}>
                {obrasPorLinea.map(([linea, obrasLinea], lineaIdx) => {
                  const isOpen      = expandedLineas[linea] ?? true;
                  const activas     = obrasLinea.filter(o => o.estado === "activa").length;
                  const term        = obrasLinea.filter(o => o.estado === "terminada").length;
                  const alertasCrit = obrasLinea.reduce((s, o) => s + (alertasPorObra[o.id]?.criticas ?? 0), 0);
                  const enCursoC    = obrasLinea.reduce((s, o) => s + timeline.filter(t => t.obra_id === o.id && t.estado === "en_curso").length, 0);

                  return (
                    <div key={linea} style={{ borderBottom: lineaIdx < obrasPorLinea.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      {/* Line header */}
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 24px", cursor: "pointer", userSelect: "none",
                          background: isOpen ? "rgba(255,255,255,0.012)" : "transparent",
                          borderBottom: isOpen ? "1px solid rgba(255,255,255,0.04)" : "1px solid transparent", transition: "background 0.15s" }}
                        onClick={() => setExpandedLineas(p => ({ ...p, [linea]: !isOpen }))}
                      >
                        <span style={{ fontSize: 9, opacity: 0.3, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>▶</span>
                        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, color: "#fff", letterSpacing: 3 }}>{linea}</span>
                        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
                        <span style={{ fontSize: 10, opacity: 0.32 }}>{obrasLinea.length} obra{obrasLinea.length !== 1 ? "s" : ""}</span>
                        {activas > 0    && <span style={makeChip("#30d158")}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#30d158", flexShrink: 0 }} />{activas} activa{activas !== 1 ? "s" : ""}</span>}
                        {enCursoC > 0  && <span style={makeChip("#0a84ff")}>{enCursoC} proceso{enCursoC !== 1 ? "s" : ""}</span>}
                        {alertasCrit > 0 && <span style={makeChip("#ff453a")}>⚠ {alertasCrit}</span>}
                        {term > 0      && <span style={{ fontSize: 10, opacity: 0.2 }}>{term} terminada{term !== 1 ? "s" : ""}</span>}
                        <div style={{ flex: 1 }} />
                        {esGestion && (
                          <button style={BTNSM} onClick={e => { e.stopPropagation(); setFormObra(f => ({ ...f, linea })); setShowNuevaObra(true); }}>
                            + Obra
                          </button>
                        )}
                      </div>

                      {/* Obra rows */}
                      {isOpen && obrasLinea.map(obra => {
                        const isSel          = obraSelId === obra.id;
                        const tl             = getTimeline(obra.id);
                        const tlMap          = Object.fromEntries(tl.map(t => [t.proceso_id, t]));
                        const al             = alertasPorObra[obra.id] ?? { total: 0, criticas: 0 };
                        const pct            = progresoPct(obra.id);
                        const dias           = diasDesde(obra.fecha_inicio);
                        const procsActivos   = tl.filter(t => t.estado !== "pendiente");

                        return (
                          <div key={obra.id}>
                            {/* Row */}
                            <div
                              style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 24px 10px 44px",
                                borderBottom: "1px solid rgba(255,255,255,0.025)",
                                background: isSel ? "rgba(255,255,255,0.022)" : "transparent",
                                cursor: "pointer", transition: "background 0.12s" }}
                              onClick={() => { setObraSelId(isSel ? null : obra.id); setProcSelId(null); }}
                            >
                              {/* Code */}
                              <div style={{ minWidth: 100 }}>
                                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>{obra.codigo}</div>
                                {obra.descripcion && <div style={{ fontSize: 9, opacity: 0.28, marginTop: 1, maxWidth: 95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.descripcion}</div>}
                              </div>

                              <span style={makeBadge(obra.estado)}>
                                <span style={{ width: 4, height: 4, borderRadius: "50%", background: ESTADO_OBRA[obra.estado]?.dot, flexShrink: 0 }} />
                                {ESTADO_OBRA[obra.estado]?.label}
                              </span>

                              {/* Pipeline strip */}
                              <div style={{ flex: 1, overflowX: "auto", display: "flex", alignItems: "center", gap: 0, padding: "2px 0" }} onClick={e => e.stopPropagation()}>
                                {procsActivos.length === 0 ? (
                                  <span style={{ fontSize: 10, opacity: 0.18, fontStyle: "italic" }}>Sin procesos — clic para iniciar</span>
                                ) : procsActivos.map((t, idx) => {
                                  const p = t.procesos;
                                  if (!p) return null;
                                  const diasAct  = t.dias_reales ?? (t.fecha_inicio ? Math.floor((Date.now() - new Date(t.fecha_inicio + "T00:00:00")) / 86400000) : null);
                                  const comp     = diasAct != null ? comparacion(p.id, diasAct) : null;
                                  const nColor   = t.estado === "completado" ? "#30d158" : t.estado === "en_curso" ? (p.color ?? "#ffd60a") : "rgba(255,255,255,0.15)";
                                  const isSelNode = isSel && procSelId === p.id;

                                  return (
                                    <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
                                      <div
                                        onClick={e => { e.stopPropagation(); setObraSelId(obra.id); setProcSelId(isSelNode ? null : p.id); }}
                                        title={`${p.nombre}${diasAct != null ? ` · ${diasAct}d` : ""}`}
                                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                                          cursor: "pointer", padding: "3px 5px", borderRadius: 7, transition: "all 0.12s",
                                          background: isSelNode ? "rgba(255,255,255,0.055)" : "transparent",
                                          border: isSelNode ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent" }}
                                      >
                                        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${nColor}`,
                                          background: t.estado === "completado" ? "rgba(48,209,88,0.1)" : "rgba(255,255,255,0.02)",
                                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                                          boxShadow: t.estado === "en_curso" ? `0 0 10px ${nColor}50` : "none",
                                          animation: t.estado === "en_curso" ? "nodePulse 2.5s ease-in-out infinite" : "none" }}>
                                          {t.estado === "completado" ? <span style={{ color: "#30d158", fontSize: 11 }}>✓</span>
                                           : t.estado === "en_curso"  ? p.icono
                                           : <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{p.orden}</span>}
                                        </div>
                                        <div style={{ fontSize: 8, maxWidth: 54, textAlign: "center", lineHeight: 1.2, fontWeight: 600,
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                          color: t.estado === "completado" ? "#30d158" : t.estado === "en_curso" ? "#fff" : "rgba(255,255,255,0.25)" }}>
                                          {p.nombre.length > 9 ? p.nombre.slice(0, 8) + "…" : p.nombre}
                                        </div>
                                        {diasAct != null && <div style={{ fontSize: 7, color: comp?.color ?? "rgba(255,255,255,0.25)", fontWeight: 700 }}>{diasAct}d</div>}
                                      </div>
                                      {idx < procsActivos.length - 1 && (
                                        <div style={{ width: 14, height: 1, flexShrink: 0,
                                          background: t.estado === "completado" ? "rgba(48,209,88,0.3)" : "rgba(255,255,255,0.06)" }} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Right meta */}
                              <div style={{ minWidth: 88, textAlign: "right", flexShrink: 0 }}>
                                {pct > 0 && (
                                  <div style={{ marginBottom: 3 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? "#30d158" : "#fff" }}>{pct}%</span>
                                    <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 99, marginTop: 2, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, transition: "width 0.4s",
                                        background: pct === 100 ? "#30d158" : "rgba(255,255,255,0.35)" }} />
                                    </div>
                                  </div>
                                )}
                                {dias != null && <div style={{ fontSize: 8, opacity: 0.25 }}>{dias}d</div>}
                                {al.criticas > 0 && <div style={{ fontSize: 9, color: "#ff453a", fontWeight: 700 }}>⚠ {al.criticas}</div>}
                              </div>
                            </div>

                            {/* Detail panel */}
                            {isSel && (
                              <ObraDetail
                                obra={obra}
                                tl={tl}
                                tlMap={tlMap}
                                procesos={procesos}
                                checks={checks}
                                reglas={reglas}
                                esGestion={esGestion}
                                procSelId={procSelId}
                                setProcSelId={setProcSelId}
                                comparacion={comparacion}
                                onCambiarEstado={cambiarEstado}
                                onIniciarProceso={iniciarProceso}
                                onCompletarProceso={completarProceso}
                                onToggleCheck={toggleCheck}
                                onAddStepFor={setAddStepFor}
                                onConfirmDel={setShowConfirmDel}
                                onAddRegla={setShowAddRegla}
                                onBorrarRegla={borrarRegla}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Borrar */}
      {showConfirmDel && (
        <div style={OVERLAY} onClick={() => setShowConfirmDel(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 10px", color: "#fff", fontSize: 14, fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>¿BORRAR OBRA?</h2>
            <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 20, lineHeight: 1.7 }}>
              Se eliminarán la obra, timeline, reglas y alertas.<br />
              <span style={{ color: "#ff453a" }}>Acción irreversible.</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...BTNDEL, padding: "8px 18px", fontSize: 12, fontWeight: 700 }} onClick={() => borrarObra(showConfirmDel)}>Sí, borrar</button>
              <button style={{ ...BTN, flex: 1 }} onClick={() => setShowConfirmDel(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Paso */}
      {addStepFor && (
        <div style={OVERLAY} onClick={() => setAddStepFor(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 14px", color: "#fff", fontSize: 13, fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>NUEVO PASO</h2>
            <input style={{ ...INPUT, width: "100%" }} placeholder="Descripción del paso…"
              value={newStepTxt} onChange={e => setNewStepTxt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && agregarCheck()} autoFocus />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={BTNP} onClick={agregarCheck}>Agregar</button>
              <button style={BTN} onClick={() => setAddStepFor(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Regla */}
      {showAddRegla && (
        <div style={OVERLAY} onClick={() => setShowAddRegla(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 5px", color: "#fff", fontSize: 13, fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>NUEVA REGLA</h2>
            <p style={{ fontSize: 10, opacity: 0.3, margin: "0 0 18px", lineHeight: 1.5 }}>Define una acción automática al completar una etapa.</p>
            <form onSubmit={guardarRegla}>
              <div style={{ marginBottom: 12 }}>
                <label style={LABEL}>Después de completar</label>
                <select style={{ ...INPUT, width: "100%" }} value={formRegla.despues_de} onChange={e => setFormRegla(f => ({ ...f, despues_de: e.target.value }))}>
                  <option value="">— Inmediato / inicio —</option>
                  {procesos.map(p => <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={LABEL}>Tipo</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                  {Object.entries(ACCION_COLORS).map(([key, ac]) => (
                    <div key={key} onClick={() => setFormRegla(f => ({ ...f, accion: key }))} style={{
                      padding: "10px 6px", borderRadius: 9, cursor: "pointer", textAlign: "center", transition: "all 0.12s",
                      background: formRegla.accion === key ? ac.bg : "transparent",
                      border:     formRegla.accion === key ? `1px solid ${ac.border}` : "1px solid rgba(255,255,255,0.06)",
                      color:      formRegla.accion === key ? ac.color : "rgba(255,255,255,0.3)",
                      fontSize: 10, fontWeight: 700,
                    }}>
                      <div style={{ fontSize: 16, marginBottom: 4 }}>{ac.icon}</div>
                      {key}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={LABEL}>Descripción *</label>
                <input style={{ ...INPUT, width: "100%" }} required
                  placeholder="Ej: Comprar grupo electrógeno…"
                  value={formRegla.descripcion} onChange={e => setFormRegla(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={LABEL}>Destinatario</label>
                <input style={{ ...INPUT, width: "100%" }} placeholder="mecanica, oficina, admin…"
                  value={formRegla.destinatario} onChange={e => setFormRegla(f => ({ ...f, destinatario: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={BTNP}>Guardar regla</button>
                <button type="button" style={BTN} onClick={() => setShowAddRegla(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
