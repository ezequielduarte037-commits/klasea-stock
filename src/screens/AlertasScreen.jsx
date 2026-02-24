import { useState, useMemo } from "react";
import Sidebar from "../components/Sidebar";
import useAlertas from "../hooks/useAlertas";

// ─── PALETA (igual que ObrasScreen) ─────────────────────────────────────────
const C = {
  bg:   "#09090b",
  s0:   "rgba(255,255,255,0.03)",
  s1:   "rgba(255,255,255,0.06)",
  b0:   "rgba(255,255,255,0.08)",
  b1:   "rgba(255,255,255,0.15)",
  t0:   "#f4f4f5",
  t1:   "#a1a1aa",
  t2:   "#71717a",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
};
const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

const GRAVEDAD = {
  critical: { bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.22)",  color: C.red,     icon: "🔴", label: "CRÍTICA"     },
  warning:  { bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.22)", color: C.amber,   icon: "⚠️", label: "ADVERTENCIA" },
  info:     { bg: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.22)", color: C.primary, icon: "ℹ️", label: "INFO"        },
};

const TIPO_LABEL = {
  demora_proceso:     "Demora en proceso",
  gap_entre_procesos: "Gap entre procesos",
  proceso_detenido:   "Obra detenida",
  personalizada:      "Alerta manual",
};

const filterBtn = (active, color) => ({
  border: active ? `1px solid ${color ?? C.b1}` : `1px solid rgba(255,255,255,0.04)`,
  background: active ? (color ? `${color}12` : C.s1) : "transparent",
  color: active ? (color ?? C.t0) : C.t2,
  padding: "3px 11px", borderRadius: 5, cursor: "pointer",
  fontSize: 10, fontFamily: "'Outfit', system-ui",
  fontWeight: active ? 600 : 400, whiteSpace: "nowrap",
});

export default function AlertasScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const { alertas, stats, loading, resolverAlerta, recargar } = useAlertas();

  const [filtroGravedad, setFiltroGravedad] = useState("todas");
  const [filtroTipo,     setFiltroTipo]     = useState("todos");
  const [msg,            setMsg]            = useState("");

  const filtradas = useMemo(() => {
    return alertas
      .filter(a => {
        if (filtroGravedad !== "todas" && a.gravedad !== filtroGravedad) return false;
        if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
        return true;
      })
      .sort((a, b) => {
        const ord = { critical: 0, warning: 1, info: 2 };
        return (ord[a.gravedad] ?? 3) - (ord[b.gravedad] ?? 3);
      });
  }, [alertas, filtroGravedad, filtroTipo]);

  async function handleResolver(id) {
    await resolverAlerta(id, profile?.username ?? "usuario");
    setMsg("✅ Alerta resuelta");
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .alerta-row { animation: slideUp 0.18s ease both; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Alertas</div>
              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
                Centro de notificaciones
              </div>
            </div>

            {[
              { label: "Críticas",     val: stats.criticas, color: C.red     },
              { label: "Advertencias", val: stats.warnings, color: C.amber   },
              { label: "Info",         val: stats.infos,    color: C.primary },
            ].map(s => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`,
                borderLeft: `2px solid ${s.color}`,
              }}>
                <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}

            <button onClick={recargar} style={{
              border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
              padding: "6px 14px", borderRadius: 8, cursor: "pointer",
              fontSize: 11, fontFamily: C.sans,
            }}>
              ↺ Actualizar
            </button>
          </div>

          {/* ── FILTERBAR ── */}
          <div style={{
            height: 36, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0, overflowX: "auto",
          }}>
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Gravedad</span>
            <button style={filterBtn(filtroGravedad === "todas")} onClick={() => setFiltroGravedad("todas")}>Todas</button>
            {Object.entries(GRAVEDAD).map(([key, g]) => (
              <button key={key} style={filterBtn(filtroGravedad === key, g.color)} onClick={() => setFiltroGravedad(key)}>
                {g.icon} {g.label}
              </button>
            ))}
            <div style={{ width: 1, height: 12, background: C.b0, margin: "0 4px", flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Tipo</span>
            <button style={filterBtn(filtroTipo === "todos")} onClick={() => setFiltroTipo("todos")}>Todos</button>
            {Object.entries(TIPO_LABEL).map(([key, label]) => (
              <button key={key} style={filterBtn(filtroTipo === key)} onClick={() => setFiltroTipo(key)}>
                {label}
              </button>
            ))}
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            <div style={{ width: "min(960px,100%)", margin: "0 auto" }}>

              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Total activas", val: stats.total,    color: "#888"    },
                  { label: "Críticas",      val: stats.criticas, color: C.red     },
                  { label: "Advertencias",  val: stats.warnings, color: C.amber   },
                  { label: "Informativas",  val: stats.infos,    color: C.primary },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: "12px 14px", borderRadius: 10,
                    border: `1px solid ${s.color}20`, background: `${s.color}08`,
                  }}>
                    <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Toast */}
              {msg && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8, marginBottom: 12,
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
                  color: C.green, fontSize: 12,
                }}>
                  {msg}
                </div>
              )}

              {loading && (
                <div style={{ textAlign: "center", color: C.t2, padding: 40, fontSize: 11,
                  letterSpacing: 2, textTransform: "uppercase", fontFamily: C.mono }}>
                  Cargando…
                </div>
              )}

              {!loading && filtradas.length === 0 && (
                <div style={{
                  textAlign: "center", padding: 50, color: C.t2,
                  background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12,
                  fontSize: 12,
                }}>
                  ✅ Sin alertas activas con este filtro
                </div>
              )}

              {filtradas.map((a, i) => {
                const g = GRAVEDAD[a.gravedad] ?? GRAVEDAD.info;
                return (
                  <div key={a.id} className="alerta-row" style={{
                    border: `1px solid ${g.border}`,
                    background: g.bg,
                    borderRadius: 10, padding: "14px 16px", marginBottom: 8,
                    animationDelay: `${i * 0.03}s`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        {/* Badges */}
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 8, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
                            padding: "2px 8px", borderRadius: 5,
                            background: `${g.color}18`, color: g.color, border: `1px solid ${g.color}30`,
                          }}>
                            {g.icon} {g.label}
                          </span>
                          <span style={{
                            fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase",
                            padding: "2px 8px", borderRadius: 5,
                            background: C.s0, color: C.t2, border: `1px solid ${C.b0}`,
                          }}>
                            {TIPO_LABEL[a.tipo] ?? a.tipo}
                          </span>
                        </div>

                        {/* Mensaje */}
                        <div style={{ color: C.t0, fontWeight: 600, fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
                          {a.mensaje}
                        </div>

                        {/* Meta */}
                        <div style={{ fontSize: 10, color: C.t2, display: "flex", gap: 14, flexWrap: "wrap" }}>
                          {a.produccion_obras?.codigo && <span>🏗 {a.produccion_obras.codigo}</span>}
                          {a.procesos?.nombre && <span>{a.procesos.icono ?? "⚙️"} {a.procesos.nombre}</span>}
                          {a.dias_reales != null && <span>⏱ {a.dias_reales} días reales</span>}
                          {a.dias_esperados != null && <span>📋 {Math.round(a.dias_esperados)} esperados</span>}
                          <span>📅 {new Date(a.created_at).toLocaleDateString("es-AR")}</span>
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          onClick={() => handleResolver(a.id)}
                          style={{
                            border: "1px solid rgba(16,185,129,0.3)",
                            background: "rgba(16,185,129,0.08)",
                            color: C.green, padding: "6px 14px",
                            borderRadius: 8, cursor: "pointer",
                            fontSize: 11, fontWeight: 600, fontFamily: C.sans, flexShrink: 0,
                          }}
                        >
                          ✓ Resolver
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
