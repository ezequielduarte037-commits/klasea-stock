import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import {
  getProductionStageSchedule,
  PRODUCTION_STAGE_OFFSET_PREFIX,
  productionStageOffsetsMap,
} from "@/features/obras/fechasEngine";
import {
  hasMatrixDetailColumns, matrixDetailPatch, propagarPredecesorasObra, safeQuery, today,
} from "@/features/obras/obrasHelpers";
import { planDeObra } from "./plan";

// Datos del módulo Obras: obras, etapas, tareas, líneas y su plantilla, con los
// cambios en vivo aplicados en memoria (sin volver a bajar las ~3.500 tareas).
// Las acciones actualizan la pantalla al instante y después guardan.

const ordenar = (a, b) => (a.orden ?? 0) - (b.orden ?? 0);

export function useObrasData() {
  const idCanal = useId();
  const [obras, setObras] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [lProcs, setLProcs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [offsetRows, setOffsetRows] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [archCounts, setArchCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const [mapaPuestos, setMapaPuestos] = useState(null);
  const [mapaNotas, setMapaNotas] = useState(null);
  const [mapaMemorias, setMapaMemorias] = useState(null);
  const mapaDebounceRef = useRef(null);

  const cargar = useCallback(async () => {
    const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.all([
      safeQuery(supabase.from("produccion_obras").select("*").eq("solo_stock", false).order("created_at", { ascending: false })),
      safeQuery(supabase.from("obra_etapas").select("*").order("obra_id").order("orden").limit(5000)),
      safeQuery(supabase.from("obra_tareas").select("*").order("etapa_id").order("orden").limit(10000)),
      safeQuery(supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden")),
      safeQuery(supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden")),
      safeQuery(supabase.from("obra_timeline").select("*").order("created_at")),
      safeQuery(supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false })),
      safeQuery(supabase.from("fechas_offsets").select("evento_key, modelo, semanas, referencia, updated_at").eq("modelo", "*").like("evento_key", `${PRODUCTION_STAGE_OFFSET_PREFIX}%`)),
      safeQuery(supabase.from("produccion_obra_periodos_no_laborables").select("*").order("fecha_desde")),
    ]);
    setObras(r1); setEtapas(r2); setTareas(r3); setLineas(r4); setLProcs(r5);
    setTimeline(r6); setOrdenes(r7); setOffsetRows(r8); setPeriodos(r9);

    // Archivos propios de cada tarea + planos heredados de la tarea de plantilla.
    const [propios, heredados] = await Promise.all([
      safeQuery(supabase.from("obra_tarea_archivos").select("tarea_id").not("tarea_id", "is", null)),
      safeQuery(supabase.from("linea_proceso_tarea_archivos").select("linea_proceso_tarea_id").not("linea_proceso_tarea_id", "is", null)),
    ]);
    const cuenta = {};
    propios.forEach((row) => { cuenta[row.tarea_id] = (cuenta[row.tarea_id] ?? 0) + 1; });
    const porPlantilla = {};
    heredados.forEach((row) => { porPlantilla[row.linea_proceso_tarea_id] = (porPlantilla[row.linea_proceso_tarea_id] ?? 0) + 1; });
    r3.forEach((t) => { if (t.linea_proceso_tarea_id) cuenta[t.id] = (cuenta[t.id] ?? 0) + (porPlantilla[t.linea_proceso_tarea_id] ?? 0); });
    setArchCounts(cuenta);
    setLoading(false);
  }, []);

  const cargarMapaConfig = useCallback(async () => {
    const { data } = await supabase.from("mapa_config").select("*").eq("id", "singleton").single();
    if (!data) return;
    if (data.puestos?.length) setMapaPuestos(data.puestos);
    if (data.notas) setMapaNotas(data.notas);
    if (data.memorias) setMapaMemorias(data.memorias);
  }, []);

  const guardarMapa = useCallback((patch, setter, value) => {
    setter(value);
    clearTimeout(mapaDebounceRef.current);
    mapaDebounceRef.current = setTimeout(() => {
      supabase.from("mapa_config").upsert({ id: "singleton", ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
    }, 800);
  }, []);

  useEffect(() => {
    const inicial = setTimeout(() => { cargar(); cargarMapaConfig(); }, 0);
    let debounce = null;
    const recargar = () => { clearTimeout(debounce); debounce = setTimeout(cargar, 350); };
    let pendiente = false;
    const siVisible = () => { if (document.hidden) { pendiente = true; return; } recargar(); };
    const alVolver = () => { if (!document.hidden && pendiente) { pendiente = false; recargar(); } };
    document.addEventListener("visibilitychange", alVolver);

    // INSERT/UPDATE/DELETE con la fila que trae el evento: costo de red cero.
    // `pertenece` replica el filtro de la consulta original.
    const aplicar = (setter, pertenece = () => true) => (payload) => {
      if (document.hidden) { pendiente = true; return; }
      const fila = payload.new && Object.keys(payload.new).length ? payload.new : null;
      if (payload.eventType === "DELETE") {
        const id = payload.old?.id;
        if (!id) { recargar(); return; }
        setter((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      if (!fila?.id) { recargar(); return; }
      setter((prev) => {
        const i = prev.findIndex((r) => r.id === fila.id);
        if (!pertenece(fila)) return i === -1 ? prev : prev.filter((r) => r.id !== fila.id);
        if (i === -1) return [...prev, fila];
        const next = prev.slice();
        next[i] = { ...next[i], ...fila };
        return next;
      });
    };
    let mapaTimer = null;
    const mapaDebounced = () => { clearTimeout(mapaTimer); mapaTimer = setTimeout(cargarMapaConfig, 400); };
    const canal = supabase.channel(`rt-obras-${idCanal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, aplicar(setObras, (o) => o.solo_stock === false))
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_etapas" }, aplicar(setEtapas))
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tareas" }, aplicar(setTareas))
      .on("postgres_changes", { event: "*", schema: "public", table: "linea_procesos" }, siVisible)
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_offsets" }, siVisible)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra" }, siVisible)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tarea_archivos" }, siVisible)
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obra_periodos_no_laborables" }, siVisible)
      .on("postgres_changes", { event: "*", schema: "public", table: "mapa_config" }, mapaDebounced)
      .subscribe();
    return () => {
      clearTimeout(inicial); clearTimeout(debounce); clearTimeout(mapaTimer);
      document.removeEventListener("visibilitychange", alVolver);
      supabase.removeChannel(canal);
    };
  }, [cargar, cargarMapaConfig, idCanal]);

  // ── Derivados ──────────────────────────────────────────────────
  const stageOffsets = useMemo(() => productionStageOffsetsMap(offsetRows), [offsetRows]);
  const procesoById = useMemo(() => new Map(lProcs.map((p) => [p.id, p])), [lProcs]);
  const lineaById = useMemo(() => new Map(lineas.map((l) => [l.id, l])), [lineas]);
  const procsPorLinea = useMemo(() => {
    const map = new Map();
    lProcs.forEach((p) => { if (!map.has(p.linea_id)) map.set(p.linea_id, []); map.get(p.linea_id).push(p); });
    map.forEach((lista) => lista.sort(ordenar));
    return map;
  }, [lProcs]);
  const periodosPorObra = useMemo(() => {
    const map = new Map();
    periodos.forEach((p) => { if (!map.has(p.obra_id)) map.set(p.obra_id, []); map.get(p.obra_id).push(p); });
    return map;
  }, [periodos]);
  const tareasPorEtapa = useMemo(() => {
    const map = new Map();
    tareas.forEach((t) => { if (!map.has(t.etapa_id)) map.set(t.etapa_id, []); map.get(t.etapa_id).push(t); });
    map.forEach((lista) => lista.sort(ordenar));
    return map;
  }, [tareas]);

  // Etapas de cada obra: las propias; si todavía no se crearon, las de la
  // plantilla de su línea ("virtuales", con el estado de obra_timeline).
  const etapasPorObra = useMemo(() => {
    const reales = new Map();
    etapas.forEach((e) => { if (!reales.has(e.obra_id)) reales.set(e.obra_id, []); reales.get(e.obra_id).push(e); });
    const tl = new Map(timeline.map((t) => [`${t.obra_id}|${t.linea_proceso_id}`, t]));
    const res = new Map();
    for (const obra of obras) {
      const propias = (reales.get(obra.id) || []).slice().sort(ordenar);
      const lista = propias.length ? propias : (procsPorLinea.get(obra.linea_id) || []).map((p) => {
        const t = tl.get(`${obra.id}|${p.id}`);
        return {
          id: `virtual-${obra.id}-${p.id}`, obra_id: obra.id, isVirtual: true, linea_proceso_id: p.id,
          nombre: p.nombre, orden: p.orden, color: p.color, dias_estimados: p.dias_estimados,
          descripcion: p.descripcion, responsable: p.responsable, personas_necesarias: p.personas_necesarias,
          involucrados: p.involucrados, observaciones: p.observaciones,
          estado: t?.estado === "completado" ? "completado" : t?.estado === "en_curso" ? "en_curso" : "pendiente",
          fecha_fin_real: t?.fecha_fin,
        };
      });
      const obraPeriodos = periodosPorObra.get(obra.id) || [];
      res.set(obra.id, lista.map((etapa) => ({
        ...etapa,
        cronograma: getProductionStageSchedule({
          obra, etapa,
          proceso: procesoById.get(etapa.linea_proceso_id) || null,
          offsetWeeks: etapa.linea_proceso_id ? stageOffsets.get(etapa.linea_proceso_id) : null,
          nonWorkingPeriods: obraPeriodos,
        }),
      })));
    }
    return res;
  }, [obras, etapas, timeline, procsPorLinea, periodosPorObra, procesoById, stageOffsets]);

  const planes = useMemo(() => {
    const map = new Map();
    for (const obra of obras) {
      map.set(obra.id, planDeObra({
        obra,
        etapas: etapasPorObra.get(obra.id) || [],
        tareasPorEtapa,
        periodos: periodosPorObra.get(obra.id) || [],
      }));
    }
    return map;
  }, [obras, etapasPorObra, tareasPorEtapa, periodosPorObra]);

  // ── Acciones ───────────────────────────────────────────────────
  const parcharObra = (id, patch) => setObras((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const cambiarEstadoObra = useCallback(async (obraId, estado) => {
    const patch = { estado, ...(estado === "terminada" ? { fecha_fin_real: today() } : {}) };
    parcharObra(obraId, patch);
    const { error } = await supabase.from("produccion_obras").update(patch).eq("id", obraId);
    if (error) { cargar(); throw error; }
    if (estado === "terminada") {
      try {
        const { asegurarCierreObra } = await import("@/features/panol/obraCierreApi");
        await asegurarCierreObra(obraId);
      } catch (e) { console.warn("cierre de materiales:", e); }
    }
  }, [cargar]);

  const actualizarObra = useCallback(async (obraId, patch) => {
    parcharObra(obraId, patch);
    const { error } = await supabase.from("produccion_obras").update(patch).eq("id", obraId);
    if (error) { cargar(); throw error; }
  }, [cargar]);

  const guardarDesmolde = useCallback(async (obra, fecha) => {
    const nueva = fecha || null;
    const anterior = obra.desmolde_estimado?.slice(0, 10) || null;
    if (nueva === anterior) return;
    await actualizarObra(obra.id, { desmolde_estimado: nueva });
    await supabase.from("fechas_auditoria").insert({
      obra_id: obra.id, evento_key: null, campo: "desmolde_estimado",
      valor_anterior: anterior, valor_nuevo: nueva, motivo: "edición desde Obras",
    });
  }, [actualizarObra]);

  const eliminarObra = useCallback(async (obra) => {
    setObras((prev) => prev.filter((o) => o.id !== obra.id));
    const { error } = await supabase.from("produccion_obras").delete().eq("id", obra.id);
    if (error) { cargar(); throw error; }
    await supabase.from("laminacion_obras").delete().eq("nombre", obra.codigo);
  }, [cargar]);

  // Crea en obra_etapas todas las etapas de la plantilla de una vez. Si se
  // creara una sola, la obra pasaría a mostrar sólo esa.
  const materializarEtapas = useCallback(async (obra) => {
    const lista = etapasPorObra.get(obra.id) || [];
    if (!lista.some((e) => e.isVirtual)) return lista;
    const procs = procsPorLinea.get(obra.linea_id) || [];
    if (!procs.length) throw new Error("La línea de esta obra no tiene etapas.");
    const virtual = new Map(lista.map((e) => [e.linea_proceso_id, e]));
    const { data, error } = await supabase.from("obra_etapas").insert(procs.map((p, i) => ({
      obra_id: obra.id, linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden ?? i + 1,
      color: p.color ?? "#64748b", dias_estimados: p.dias_estimados,
      estado: virtual.get(p.id)?.estado ?? "pendiente",
      ...(hasMatrixDetailColumns(p) ? { descripcion: p.descripcion ?? null, ...matrixDetailPatch(p) } : {}),
    }))).select();
    if (error) throw error;
    setEtapas((prev) => [...prev.filter((e) => !data.some((d) => d.id === e.id)), ...data]);
    return data;
  }, [etapasPorObra, procsPorLinea]);

  const etapaReal = useCallback(async (obra, etapa) => {
    if (!etapa.isVirtual) return etapa;
    const creadas = await materializarEtapas(obra);
    return creadas.find((e) => e.linea_proceso_id === etapa.linea_proceso_id) || null;
  }, [materializarEtapas]);

  const cambiarEstadoEtapa = useCallback(async (obra, etapa, estado) => {
    const real = await etapaReal(obra, etapa);
    if (!real) return;
    const patch = { estado, fecha_fin_real: estado === "completado" ? today() : null };
    setEtapas((prev) => prev.map((e) => (e.id === real.id ? { ...e, ...patch } : e)));
    const { error } = await supabase.from("obra_etapas").update(patch).eq("id", real.id);
    if (error) { cargar(); throw error; }
  }, [etapaReal, cargar]);

  const confirmarEtapas = useCallback(async (obra, lista) => {
    const reales = await Promise.all(lista.map((e) => etapaReal(obra, e)));
    const ids = reales.filter(Boolean).map((e) => e.id);
    if (!ids.length) return 0;
    const patch = { estado: "completado", fecha_fin_real: today() };
    setEtapas((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)));
    const { error } = await supabase.from("obra_etapas").update(patch).in("id", ids);
    if (error) { cargar(); throw error; }
    return ids.length;
  }, [etapaReal, cargar]);

  // Tildar una tarea: si la etapa estaba pendiente, pasa sola a En curso.
  const cambiarEstadoTarea = useCallback(async (tarea, estado) => {
    const patch = { estado, fecha_fin_real: estado === "finalizada" ? today() : null };
    setTareas((prev) => prev.map((t) => (t.id === tarea.id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("obra_tareas").update(patch).eq("id", tarea.id);
    if (error) { cargar(); throw error; }
    const etapa = etapas.find((e) => e.id === tarea.etapa_id);
    if (etapa && ["finalizada", "en_progreso"].includes(estado) && (etapa.estado || "pendiente") === "pendiente") {
      setEtapas((prev) => prev.map((e) => (e.id === etapa.id ? { ...e, estado: "en_curso" } : e)));
      await supabase.from("obra_etapas").update({ estado: "en_curso" }).eq("id", etapa.id);
      return { etapaEnCurso: true };
    }
    return {};
  }, [etapas, cargar]);

  const crearTarea = useCallback(async (obra, etapa, nombre) => {
    const real = await etapaReal(obra, etapa);
    if (!real) return null;
    const hermanas = tareasPorEtapa.get(real.id) || [];
    const orden = hermanas.length ? Math.max(...hermanas.map((t) => t.orden ?? 0)) + 1 : 1;
    const { data, error } = await supabase.from("obra_tareas").insert({
      obra_id: obra.id, etapa_id: real.id, nombre: nombre.trim(), orden, estado: "pendiente", prioridad: "media",
    }).select().single();
    if (error) throw error;
    setTareas((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
    return data;
  }, [etapaReal, tareasPorEtapa]);

  const eliminarTarea = useCallback(async (tarea) => {
    setTareas((prev) => prev.filter((t) => t.id !== tarea.id));
    const archivos = await safeQuery(supabase.from("obra_tarea_archivos").select("storage_path").eq("tarea_id", tarea.id));
    if (archivos.length) await supabase.storage.from("obra-archivos").remove(archivos.map((a) => a.storage_path));
    const { error } = await supabase.from("obra_tareas").delete().eq("id", tarea.id);
    if (error) { cargar(); throw error; }
  }, [cargar]);

  // Copia las tareas de la plantilla de la línea a una obra que no tiene.
  const importarTareas = useCallback(async (obra) => {
    const reales = await materializarEtapas(obra);
    const procIds = reales.map((e) => e.linea_proceso_id).filter(Boolean);
    if (!procIds.length) throw new Error("Las etapas no tienen proceso de línea asociado.");
    const { data: plantilla, error: e1 } = await supabase.from("linea_proceso_tareas").select("*").in("linea_proceso_id", procIds).order("orden");
    if (e1) throw e1;
    if (!plantilla?.length) throw new Error("La plantilla de esta línea no tiene tareas. Se cargan en Configuración → Tareas.");
    const filas = [];
    for (const etapa of reales) {
      for (const tp of plantilla.filter((t) => t.linea_proceso_id === etapa.linea_proceso_id)) {
        filas.push({
          obra_id: obra.id, etapa_id: etapa.id, linea_proceso_tarea_id: tp.id, nombre: tp.nombre, orden: tp.orden ?? 999,
          estado: "pendiente", prioridad: tp.prioridad ?? "media", descripcion: tp.descripcion ?? null,
          responsable: tp.responsable ?? null, dias_estimados: tp.dias_estimados ?? null, horas_estimadas: tp.horas_estimadas ?? null,
          personas_necesarias: tp.personas_necesarias ?? null, observaciones: tp.observaciones ?? null,
        });
      }
    }
    const { error: e2 } = await supabase.from("obra_tareas").insert(filas);
    if (e2) throw e2;
    await propagarPredecesorasObra(obra.id, plantilla);
    await cargar();
    return filas.length;
  }, [materializarEtapas, cargar]);

  // Tareas con el mismo nombre dentro de una etapa (la plantilla se trajo más
  // de una vez). Queda la copia con más avance; las que tienen archivos propios
  // no se tocan.
  const repetidasDeObra = useCallback((obraId) => {
    const sobran = [];
    for (const etapa of etapasPorObra.get(obraId) || []) {
      const grupos = new Map();
      for (const t of tareasPorEtapa.get(etapa.id) || []) {
        const k = String(t.nombre || "").trim().toLowerCase();
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(t);
      }
      const rango = { finalizada: 0, en_progreso: 1 };
      grupos.forEach((lista) => {
        if (lista.length < 2) return;
        const orden = lista.slice().sort((a, b) => (rango[a.estado] ?? 2) - (rango[b.estado] ?? 2) || (a.orden ?? 0) - (b.orden ?? 0));
        sobran.push(...orden.slice(1));
      });
    }
    return sobran;
  }, [etapasPorObra, tareasPorEtapa]);

  const quitarRepetidas = useCallback(async (obraId) => {
    const candidatas = repetidasDeObra(obraId);
    if (!candidatas.length) return 0;
    const conArchivos = new Set((await safeQuery(supabase.from("obra_tarea_archivos").select("tarea_id").in("tarea_id", candidatas.map((t) => t.id)))).map((r) => r.tarea_id));
    const ids = candidatas.filter((t) => !conArchivos.has(t.id)).map((t) => t.id);
    if (!ids.length) return 0;
    setTareas((prev) => prev.filter((t) => !ids.includes(t.id)));
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("obra_tareas").delete().in("id", ids.slice(i, i + 200));
      if (error) { cargar(); throw error; }
    }
    return ids.length;
  }, [repetidasDeObra, cargar]);

  return {
    loading, cargar, repetidasDeObra,
    obras, etapas, tareas, lineas, lProcs, timeline, ordenes, periodos, archCounts,
    stageOffsets, procesoById, lineaById, procsPorLinea, periodosPorObra, tareasPorEtapa, etapasPorObra, planes,
    mapa: {
      puestos: mapaPuestos, notas: mapaNotas, memorias: mapaMemorias,
      guardarPuestos: (v) => guardarMapa({ puestos: v }, setMapaPuestos, v),
      guardarNotas: (v) => guardarMapa({ notas: v }, setMapaNotas, v),
      guardarMemorias: (v) => guardarMapa({ memorias: v }, setMapaMemorias, v),
    },
    acciones: {
      cambiarEstadoObra, actualizarObra, guardarDesmolde, eliminarObra,
      cambiarEstadoEtapa, confirmarEtapas, cambiarEstadoTarea, crearTarea, eliminarTarea, importarTareas,
      materializarEtapas, quitarRepetidas,
    },
  };
}
