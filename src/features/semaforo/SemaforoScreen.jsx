import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function AnimNum({ to, color }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = val;
    const diff = to - start;
    if (diff === 0) return;
    const duration = 600;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setVal(Math.round(start + diff * progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [to]);
  return <span style={{ color, fontFamily: C.mono, fontWeight: 800 }}>{val}</span>;
}

export default function SemaforoScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const clock = useClock();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("semaforo-produccion");
      if (fnError) throw fnError;
      if (result.error) throw new Error(result.error);
      setData(result);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const getColor = (estado) => {
    if (estado === "rojo") return C.red;
    if (estado === "ambar") return C.amber;
    return C.green;
  };

  const getAnimation = (estado) => {
    if (estado === "rojo") return "pulse-red 1s ease-in-out infinite";
    if (estado === "ambar") return "pulse-amber 2s ease-in-out infinite";
    return "none";
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ width: isMobile ? 0 : 280, flexShrink: 0, height: "100vh", overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          height: 54, flexShrink: 0,
          background: "rgba(7,8,13,0.94)",
          backdropFilter: "blur(32px) saturate(130%)",
          borderBottom: `1px solid ${C.border}`,
          padding: isMobile ? "0 12px 0 52px" : "0 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: 3, textTransform: "uppercase", fontFamily: C.mono }}>Semáforo de Producción</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Estado de Obras en Tiempo Real</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {lastUpdate && (
              <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>
                Actualizado: {lastUpdate.toLocaleTimeString("es-AR")}
              </div>
            )}
            <div style={{ fontSize: 14, fontFamily: C.mono, color: C.muted }}>
              {clock.toLocaleTimeString("es-AR")}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : 24 }}>
          {loading && !data && (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: C.dim, fontSize: 14 }}>
              Cargando datos...
            </div>
          )}

          {error && (
            <div style={{ padding: 20, background: "rgba(239,68,68,0.1)", border: `1px solid ${C.red}`, borderRadius: 12, color: C.red, fontSize: 14 }}>
              Error: {error}
            </div>
          )}

          {data && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                <KpiCard label="Obras Activas" value={data.kpis.total} color={C.blue} />
                <KpiCard label="Sin Riesgo" value={data.kpis.verdes} color={C.green} />
                <KpiCard label="En Riesgo" value={data.kpis.ambar} color={C.amber} />
                <KpiCard label="Bloqueadas" value={data.kpis.rojas} color={C.red} />
              </div>

              {/* Obras Grid */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 }}>
                {data.obras.map(obra => (
                  <ObraCard key={obra.obra_id} obra={obra} getColor={getColor} getAnimation={getAnimation} />
                ))}
              </div>

              {data.obras.length === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: C.dim, fontSize: 14 }}>
                  No hay obras activas en este momento.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(248,113,113,0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 20px 4px rgba(248,113,113,0.2); }
        }
        @keyframes pulse-amber {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: C.mono, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, lineHeight: 1 }}>
        <AnimNum to={value} color={color} />
      </div>
    </div>
  );
}

function ObraCard({ obra, getColor, getAnimation }) {
  const color = getColor(obra.estado);
  const animation = getAnimation(obra.estado);

  return (
    <div style={{
      background: C.panel,
      border: `2px solid ${color}`,
      borderRadius: 14,
      padding: 20,
      animation,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{obra.obra_codigo}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{obra.linea_nombre}</div>
        </div>
        <div style={{
          width: 14, height: 14, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 12px ${color}80`,
          flexShrink: 0,
        }} />
      </div>

      {/* Etapa actual */}
      {obra.etapa_actual && (
        <div style={{ fontSize: 13, color: C.muted }}>
          Etapa: <strong style={{ color: C.text }}>{obra.etapa_actual}</strong>
        </div>
      )}

      {/* Días garantizados */}
      <div style={{
        background: "rgba(0,0,0,0.3)",
        borderRadius: 10,
        padding: "16px 20px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 42, fontWeight: 800, color, lineHeight: 1, fontFamily: C.mono }}>
          {obra.dias_garantizados}
        </div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 6, letterSpacing: 1, textTransform: "uppercase" }}>
          días garantizados
        </div>
      </div>

      {/* Quiebres */}
      {obra.quiebres && obra.quiebres.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.amber, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono, fontWeight: 700 }}>
            Materiales críticos
          </div>
          {obra.quiebres.map((q, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {q.rubro} <span style={{ color: C.dim, fontWeight: 400 }}>({q.faltantes} ítems)</span>
              </div>
              {q.materiales && q.materiales.slice(0, 3).map((m, j) => (
                <div key={j} style={{ fontSize: 11, color: C.muted, paddingLeft: 8, lineHeight: 1.4 }}>
                  • {m.descripcion}
                  {m.lead_time_dias && (
                    <span style={{ color: C.amber, marginLeft: 6 }}>
                      (lead: {Math.round(m.lead_time_dias)}d)
                    </span>
                  )}
                </div>
              ))}
              {q.materiales && q.materiales.length > 3 && (
                <div style={{ fontSize: 11, color: C.dim, paddingLeft: 8 }}>
                  +{q.materiales.length - 3} más...
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fecha bloqueo */}
      {obra.fecha_bloqueo && (
        <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>
          Bloqueo estimado: {new Date(obra.fecha_bloqueo).toLocaleDateString("es-AR")}
        </div>
      )}
    </div>
  );
}
