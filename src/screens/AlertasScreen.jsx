import { useState, useMemo } from "react";
import Sidebar from "../components/Sidebar";
import useAlertas from "../hooks/useAlertas";

const GRAVEDAD = {
  critical: { bg: "rgba(255,69,58,0.08)",  border: "rgba(255,69,58,0.3)",  color: "#ff453a", icon: "🔴", label: "CRÍTICA"     },
  warning:  { bg: "rgba(255,214,10,0.07)", border: "rgba(255,214,10,0.3)", color: "#ffd60a", icon: "⚠️", label: "ADVERTENCIA" },
  info:     { bg: "rgba(10,132,255,0.07)", border: "rgba(10,132,255,0.3)", color: "#0a84ff", icon: "ℹ️", label: "INFO"        },
};

const TIPO_LABEL = {
  demora_proceso:     "Demora en proceso",
  gap_entre_procesos: "Gap entre procesos",
  proceso_detenido:   "Obra detenida",
  personalizada:      "Alerta manual",
};

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

  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: 20, overflowY: "auto" },
    content: { width: "min(1000px,100%)", margin: "0 auto" },
    card:    { border: "1px solid #1e1e1e", borderRadius: 14, background: "#070707", padding: 16, marginBottom: 12 },
    btn:     { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700 },
    filterBtn: (act, color) => ({
      border: act ? `1px solid ${color ?? "#444"}` : "1px solid transparent",
      background: act ? (color ? `${color}15` : "#1a1a1a") : "transparent",
      color: act ? (color ?? "#fff") : "#555",
      padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: act ? 700 : 400,
      transition: "all 0.15s",
    }),
    statCard: (color) => ({
      padding: "14px 16px", borderRadius: 12,
      border: `1px solid ${color}33`,
      background: `${color}0a`,
    }),
    pill: (color) => ({
      fontSize: 10, fontWeight: 900, letterSpacing: 1,
      padding: "2px 8px", borderRadius: 6,
      background: `${color}22`, color,
      border: `1px solid ${color}44`,
    }),
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h1 style={{ fontFamily: "Montserrat, system-ui, Arial", fontSize: 22, margin: 0, color: "#fff" }}>
                  Alertas
                </h1>
                <div style={{ fontSize: 12, opacity: 0.45, marginTop: 3 }}>
                  Centro de notificaciones de producción
                </div>
              </div>
              <button style={S.btn} onClick={recargar}>↺ Actualizar</button>
            </div>

            {msg && (
              <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf", marginBottom: 12 }}>
                {msg}
              </div>
            )}

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Total activas", val: stats.total,    color: "#888"    },
                { label: "Críticas",      val: stats.criticas, color: "#ff453a" },
                { label: "Advertencias",  val: stats.warnings, color: "#ffd60a" },
                { label: "Informativas",  val: stats.infos,    color: "#0a84ff" },
              ].map(s => (
                <div key={s.label} style={S.statCard(s.color)}>
                  <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: s.color, fontFamily: "Montserrat, system-ui" }}>
                    {s.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Filtros gravedad */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <button style={S.filterBtn(filtroGravedad === "todas")} onClick={() => setFiltroGravedad("todas")}>
                Todas
              </button>
              {Object.entries(GRAVEDAD).map(([key, g]) => (
                <button key={key} style={S.filterBtn(filtroGravedad === key, g.color)}
                  onClick={() => setFiltroGravedad(key)}>
                  {g.icon} {g.label}
                </button>
              ))}
            </div>

            {/* Filtros tipo */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <button style={S.filterBtn(filtroTipo === "todos")} onClick={() => setFiltroTipo("todos")}>
                Todos los tipos
              </button>
              {Object.entries(TIPO_LABEL).map(([key, label]) => (
                <button key={key} style={S.filterBtn(filtroTipo === key)} onClick={() => setFiltroTipo(key)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Lista */}
            {loading && (
              <div style={{ ...S.card, textAlign: "center", opacity: 0.4, padding: 30 }}>Cargando…</div>
            )}

            {!loading && filtradas.length === 0 && (
              <div style={{ ...S.card, textAlign: "center", padding: 50, opacity: 0.35 }}>
                ✅ Sin alertas activas con este filtro
              </div>
            )}

            {filtradas.map(a => {
              const g = GRAVEDAD[a.gravedad] ?? GRAVEDAD.info;
              return (
                <div key={a.id} style={{ ...S.card, borderColor: g.border, background: g.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>

                      {/* Badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 15 }}>{g.icon}</span>
                        <span style={S.pill(g.color)}>{g.label}</span>
                        <span style={{ ...S.pill("#555"), color: "#888" }}>
                          {TIPO_LABEL[a.tipo] ?? a.tipo}
                        </span>
                      </div>

                      {/* Mensaje */}
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 8, lineHeight: 1.4 }}>
                        {a.mensaje}
                      </div>

                      {/* Meta */}
                      <div style={{ fontSize: 11, opacity: 0.45, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {a.produccion_obras?.codigo && (
                          <span>🏗 {a.produccion_obras.codigo}</span>
                        )}
                        {a.procesos?.nombre && (
                          <span>{a.procesos.icono ?? "⚙️"} {a.procesos.nombre}</span>
                        )}
                        {a.dias_reales != null && (
                          <span>⏱ {a.dias_reales} días reales</span>
                        )}
                        {a.dias_esperados != null && (
                          <span>📋 {Math.round(a.dias_esperados)} esperados</span>
                        )}
                        <span>📅 {new Date(a.created_at).toLocaleDateString("es-AR")}</span>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        style={{ ...S.btn, borderColor: "#30d15844", color: "#30d158", flexShrink: 0 }}
                        onClick={() => handleResolver(a.id)}>
                        ✓ Resolver
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        </main>
      </div>
    </div>
  );
}
