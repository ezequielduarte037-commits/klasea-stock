import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/supabaseClient";

export default function useAlertas(obraId = null, { enabled = true, summaryOnly = false } = {}) {
  const [alertas,   setAlertas]   = useState([]);
  const [promedios, setPromedios] = useState([]);
  const [gaps,      setGaps]      = useState([]);
  const [config,    setConfig]    = useState({});
  const [loading,   setLoading]   = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const alertasQuery = summaryOnly
      ? supabase
          .from("alertas")
          .select("id,obra_id,tipo,gravedad,mensaje,created_at")
          .eq("resuelta", false)
          .order("created_at", { ascending: false })
          .limit(50)
      : supabase
          .from("alertas")
          .select("*, procesos(nombre,icono,color), produccion_obras(codigo)")
          .eq("resuelta", false)
          .order("created_at", { ascending: false });

    const [rA, rP, rG, rC] = await Promise.all([
      alertasQuery,
      summaryOnly ? Promise.resolve({ data: [] }) : supabase.from("v_promedios_proceso").select("*"),
      summaryOnly ? Promise.resolve({ data: [] }) : supabase.from("v_promedios_gap").select("*"),
      summaryOnly
        ? Promise.resolve({ data: [] })
        : supabase
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
  }, [obraId, summaryOnly]);

  useEffect(() => {
    if (!enabled) {
      const resetTimer = window.setTimeout(() => {
        setAlertas([]);
        setPromedios([]);
        setGaps([]);
        setConfig({});
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const initialTimer = window.setTimeout(() => { void cargar(); }, 0);

    // Disparar evaluación en servidor
    if (!summaryOnly) {
      void supabase.rpc("fn_evaluar_alertas", obraId ? { p_obra_id: obraId } : {});
    }

    let refreshTimer = null;
    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => { void cargar(); }, 450);
    };

    const ch = supabase
      .channel(`rt-alertas-${summaryOnly ? "summary" : "full"}-${obraId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, scheduleRefresh)
      .subscribe();

    const handleVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", handleVisible);

    // Re-evaluar cada 5 minutos
    const interval = summaryOnly ? null : window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("fn_evaluar_alertas", obraId ? { p_obra_id: obraId } : {});
      scheduleRefresh();
    }, 10 * 60 * 1000);

    return () => {
      supabase.removeChannel(ch);
      window.clearTimeout(initialTimer);
      window.clearTimeout(refreshTimer);
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [obraId, cargar, enabled, summaryOnly]);

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
