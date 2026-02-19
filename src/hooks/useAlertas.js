import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function useAlertas(obraId = null) {
  const [alertas,   setAlertas]   = useState([]);
  const [promedios, setPromedios] = useState([]);
  const [gaps,      setGaps]      = useState([]);
  const [config,    setConfig]    = useState({});
  const [loading,   setLoading]   = useState(true);

  async function cargar() {
    setLoading(true);

    const [rA, rP, rG, rC] = await Promise.all([
      supabase
        .from("alertas")
        .select("*, procesos(nombre,icono,color), produccion_obras(codigo)")
        .eq("resuelta", false)
        .order("created_at", { ascending: false }),

      supabase.from("v_promedios_proceso").select("*"),

      supabase.from("v_promedios_gap").select("*"),

      supabase
        .from("sistema_config")
        .select("clave,valor")
        .in("clave", ["alerta_tolerancia_pct", "alertas_activas", "dias_gap_alerta"]),
    ]);

    let alertasFiltradas = rA.data ?? [];
    if (obraId) {
      alertasFiltradas = alertasFiltradas.filter(a => a.obra_id === obraId);
    }

    setAlertas(alertasFiltradas);
    setPromedios(rP.data ?? []);
    setGaps(rG.data ?? []);

    const cfg = {};
    (rC.data ?? []).forEach(c => {
      cfg[c.clave] = isNaN(Number(c.valor)) ? c.valor : Number(c.valor);
    });
    setConfig(cfg);
    setLoading(false);
  }

  useEffect(() => {
    cargar();

    // Disparar evaluación en servidor
    supabase.rpc("fn_evaluar_alertas", obraId ? { p_obra_id: obraId } : {});

    const ch = supabase
      .channel("rt-alertas")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, cargar)
      .subscribe();

    // Re-evaluar cada 5 minutos
    const interval = setInterval(() => {
      supabase.rpc("fn_evaluar_alertas", obraId ? { p_obra_id: obraId } : {});
      cargar();
    }, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
  }, [obraId]);

  // Mapa proceso_id -> promedio
  const promediosPorProceso = useMemo(() => {
    const map = {};
    promedios.forEach(p => {
      map[p.proceso_id] = p.promedio_real ?? p.dias_configurados;
    });
    return map;
  }, [promedios]);

  // Mapa "ant_id:sig_id" -> promedio_gap
  const promediosGapKey = useMemo(() => {
    const map = {};
    gaps.forEach(g => {
      map[`${g.proceso_anterior_id}:${g.proceso_siguiente_id}`] = g.promedio_gap;
    });
    return map;
  }, [gaps]);

  async function resolverAlerta(alertaId, resueltaPor) {
    await supabase.from("alertas").update({
      resuelta:     true,
      resuelta_en:  new Date().toISOString(),
      resuelta_por: resueltaPor,
    }).eq("id", alertaId);
    await cargar();
  }

  const stats = useMemo(() => ({
    total:    alertas.length,
    criticas: alertas.filter(a => a.gravedad === "critical").length,
    warnings: alertas.filter(a => a.gravedad === "warning").length,
    infos:    alertas.filter(a => a.gravedad === "info").length,
  }), [alertas]);

  return {
    alertas,
    promediosPorProceso,
    promediosGapKey,
    config,
    loading,
    stats,
    resolverAlerta,
    recargar: cargar,
  };
}
