import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Monitor, RefreshCcw, Route, Smartphone } from "lucide-react";
import { loadAdminActivity } from "@/features/configuracion/adminActivityApi";
import { C } from "@/theme";

const ROUTE_LABELS = {
  "/": "Inicio",
  "/obras": "Obras",
  "/materiales": "Materiales",
  "/compras": "Compras",
  "/compras-etapa": "Compras por etapa",
  "/laminacion": "Laminación",
  "/madera": "Maderas",
  "/muebles": "Muebles",
  "/torneria": "Tornería",
  "/marmoleria": "Marmolería",
  "/calendario": "Logística",
  "/rrhh": "Recursos humanos",
  "/stock-panol": "Stock de pañol",
  "/solicitudes-panol": "Solicitudes de pañol",
  "/configuracion": "Configuración",
};

function routeLabel(route) {
  if (!route) return "Sin sección";
  return ROUTE_LABELS[route] || route.replace(/^\//, "") || "Inicio";
}

function durationSeconds(session) {
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || session.last_seen_at || session.started_at).getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

function fmtDuration(seconds = 0) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ""}`;
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function deviceLabel(value) {
  if (value === "mobile") return "Celular";
  if (value === "tablet") return "Tablet";
  if (value === "desktop") return "PC";
  return "Dispositivo";
}

export default function AdminActivityPanel() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState({ sessions: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (days = range) => {
    setLoading(true);
    setError("");
    try {
      setData(await loadAdminActivity(days));
    } catch (err) {
      setError(err?.message || "No se pudo cargar la actividad.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(range); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, range]);

  const stats = useMemo(() => {
    const sessions = data.sessions || [];
    const events = data.events || [];
    const uniqueDays = new Set(sessions.map((session) => String(session.started_at).slice(0, 10)));
    const totalSeconds = sessions.reduce((total, session) => total + durationSeconds(session), 0);
    const routes = new Map();
    events.filter((event) => event.event_type === "page_view" || event.event_type === "session_start")
      .forEach((event) => {
        const route = event.route || "/";
        routes.set(route, (routes.get(route) || 0) + 1);
      });
    const topRoutes = [...routes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([route, count]) => ({ route, count }));
    return {
      sessions: sessions.length,
      activeDays: uniqueDays.size,
      totalSeconds,
      lastSeen: sessions[0]?.last_seen_at || null,
      topRoutes,
    };
  }, [data]);

  const kpis = [
    { label: "Ingresos", value: stats.sessions, detail: `últimos ${range} días`, color: C.blue, icon: <Activity size={13} /> },
    { label: "Días activos", value: stats.activeDays, detail: `${Math.round((stats.activeDays / range) * 100)}% del período`, color: C.green, icon: <Route size={13} /> },
    { label: "Tiempo estimado", value: fmtDuration(stats.totalSeconds), detail: "pestaña activa", color: C.violet, icon: <Clock3 size={13} /> },
    { label: "Última actividad", value: stats.lastSeen ? fmtDate(stats.lastSeen) : "Sin datos", detail: "cuenta Admin", color: C.amber, icon: <Monitor size={13} /> },
  ];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, color: C.t0, fontWeight: 800 }}>Actividad de la cuenta Admin</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
            Accesos y módulos visitados. No se registran contraseñas, formularios, IP ni contenido escrito.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[7, 30, 90].map((days) => (
            <button key={days} type="button" onClick={() => setRange(days)} style={{
              border: `1px solid ${range === days ? C.blueB : C.b0}`,
              background: range === days ? C.blueS : C.panel,
              color: range === days ? C.blue : C.t2,
              borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 11, fontWeight: 800,
            }}>{days} días</button>
          ))}
          <button type="button" onClick={() => load(range)} disabled={loading} title="Actualizar" style={{
            width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8,
            border: `1px solid ${C.b0}`, background: C.panel, color: C.t1, cursor: "pointer",
          }}><RefreshCcw size={14} /></button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", marginBottom: 16, borderRadius: 10, background: C.redS, border: `1px solid ${C.redB}`, color: C.red, fontSize: 12 }}>
          {error.includes("does not exist") ? "Falta aplicar la migración de actividad en Supabase." : error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 16 }}>
        {kpis.map(({ label, value, detail, color, icon }) => (
          <div key={label} style={{ border: `1px solid ${C.b0}`, background: C.card, borderRadius: 12, padding: "14px 15px", minHeight: 96 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.t2, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
              <span style={{ width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7, color, background: `${color}15`, border: `1px solid ${color}28` }}>{icon}</span>
              {label}
            </div>
            <div style={{ fontFamily: C.mono, color: C.t0, fontSize: typeof value === "number" ? 24 : 14, fontWeight: 850, marginTop: 10 }}>{value}</div>
            <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>{detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 12, alignItems: "start" }}>
        <section style={{ border: `1px solid ${C.b0}`, background: C.card, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.b0}`, color: C.t0, fontSize: 12, fontWeight: 800 }}>Módulos más visitados</div>
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {stats.topRoutes.map((item, index) => {
              const max = stats.topRoutes[0]?.count || 1;
              return (
                <div key={item.route} style={{ padding: "9px 10px", borderRadius: 9, background: C.panel }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: C.t1, fontWeight: 750 }}>{index + 1}. {routeLabel(item.route)}</span>
                    <span style={{ color: C.blue, fontFamily: C.mono }}>{item.count}</span>
                  </div>
                  <div style={{ height: 3, background: C.s1, borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(6, (item.count / max) * 100)}%`, background: C.blue, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
            {!loading && !stats.topRoutes.length && <div style={{ padding: 24, textAlign: "center", color: C.t2, fontSize: 12 }}>Todavía no hay navegación registrada.</div>}
          </div>
        </section>

        <section style={{ border: `1px solid ${C.b0}`, background: C.card, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.b0}`, color: C.t0, fontSize: 12, fontWeight: 800 }}>Últimas sesiones</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr>{["Inicio", "Duración", "Páginas", "Última sección", "Dispositivo"].map((label) => <th key={label} style={{ textAlign: "left", padding: "10px 12px", color: C.t2, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>{label}</th>)}</tr></thead>
              <tbody>
                {(data.sessions || []).slice(0, 30).map((session) => {
                  const DeviceIcon = session.device_type === "mobile" ? Smartphone : Monitor;
                  return (
                    <tr key={session.id}>
                      <td style={{ padding: "11px 12px", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 11, fontFamily: C.mono }}>{fmtDate(session.started_at)}</td>
                      <td style={{ padding: "11px 12px", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 11 }}>{fmtDuration(durationSeconds(session))}</td>
                      <td style={{ padding: "11px 12px", borderBottom: `1px solid ${C.b0}`, color: C.blue, fontSize: 11, fontFamily: C.mono }}>{session.page_views || 0}</td>
                      <td style={{ padding: "11px 12px", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 11 }}>{routeLabel(session.last_route)}</td>
                      <td style={{ padding: "11px 12px", borderBottom: `1px solid ${C.b0}`, color: C.t2, fontSize: 11 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><DeviceIcon size={12} />{deviceLabel(session.device_type)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && <div style={{ padding: 30, textAlign: "center", color: C.t2, fontSize: 12 }}>Cargando actividad…</div>}
            {!loading && !(data.sessions || []).length && <div style={{ padding: 30, textAlign: "center", color: C.t2, fontSize: 12 }}>El historial comenzará con el próximo ingreso de Admin.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
