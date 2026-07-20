import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * FechasView — planificación de fechas de producción por barco.
 *
 * Modelo:
 *  - produccion_obras: desmolde_estimado / desmolde_real / botada (manual) /
 *    botada_real / atraso_dias (proyección desplazada SIN perder la original).
 *  - fechas_eventos: catálogo de hitos (alcance por línea vía `modelos`).
 *  - fechas_offsets: semanas por línea y por hito, referidas a desmolde o botada.
 *    La clave especial __botada__ define semanas desmolde→botada por línea: si una
 *    línea NO la tiene configurada, la botada NO se inventa (se muestra "sin regla").
 *  - fechas_evento_estados: estado operativo por barco+hito
 *    (pedido / en_curso / hecho + fecha_real). "Vencido" no se guarda: se calcula
 *    y queda visible hasta que alguien actualice la fecha o marque el hito.
 *  - fechas_auditoria: historial de cambios de fechas sensibles (quién/qué/motivo).
 */

const EVENTOS_SEED = [
  { key: "madera_muebles", label: "Madera muebles", short: "Madera", modelos: null },
  { key: "teca", label: "Teca", short: "Teca", modelos: null },
  { key: "herreria", label: "Herrería", short: "Herrería", modelos: null },
  { key: "muebles", label: "Muebles", short: "Muebles", modelos: null },
  { key: "mampara", label: "Mampara ducha", short: "Mampara", modelos: null },
  { key: "parabrisas", label: "Parabrisas", short: "Parabrisas", modelos: null },
  { key: "vidrios", label: "Vidrios Mercoglass", short: "Vidrios", modelos: null },
  { key: "motor", label: "Motor", short: "Motor", modelos: null },
  { key: "grupo", label: "Grupo", short: "Grupo", modelos: null },
  { key: "tanques", label: "Tanques", short: "Tanques", modelos: null },
  { key: "baterias", label: "Baterías", short: "Baterías", modelos: null },
  { key: "botazo", label: "Botazo", short: "Botazo", modelos: null },
];

const ORDER_LS_KEY = "fechas_col_order_v2";
const VISTA_LS_KEY = "fechas_vista_v1";
const BOTADA_EVENT_KEY = "__botada__";
const DEFAULT_BOTADA_SEMANAS = 12;
const MS_DIA = 86400000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Estados operativos por hito. "pendiente" = sin fila. "vencido" es calculado.
const ESTADOS_HITO = {
  pedido: { label: "Pedido", color: C.blue, bg: "rgba(59,130,246,0.13)", border: "rgba(59,130,246,0.36)" },
  en_curso: { label: "En curso", color: C.violet, bg: "rgba(139,92,246,0.13)", border: "rgba(139,92,246,0.36)" },
  hecho: { label: "Hecho", color: C.green, bg: "rgba(16,185,129,0.13)", border: "rgba(16,185,129,0.38)" },
};

function loadColOrder(allKeys) {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_LS_KEY) || "[]");
    const valid = Array.isArray(saved) ? saved.filter((k) => allKeys.includes(k)) : [];
    const missing = allKeys.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return [...allKeys];
  }
}

function slugifyKey(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const iso = (s) => (s ? String(s).slice(0, 10) : "");

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function parseISO(s) {
  if (!s) return null;
  const d = new Date(`${iso(s)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDias(date, dias) {
  if (!date) return null;
  return new Date(date.getTime() + Number(dias || 0) * MS_DIA);
}

function addSemanas(date, semanas) {
  if (!date) return null;
  return addDias(date, Number(semanas || 0) * 7);
}

function diasHasta(date) {
  if (!date) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - hoy.getTime()) / MS_DIA);
}

function fmtFecha(date) {
  if (!date) return "-";
  return `${String(date.getDate()).padStart(2, "0")} ${MESES[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

function diasTexto(dias) {
  if (dias === null) return "";
  if (dias < 0) return `hace ${-dias}d`;
  if (dias === 0) return "hoy";
  return `en ${dias}d`;
}

function lineToken(codigo) {
  let s = String(codigo ?? "").trim().toUpperCase().replace(/^K/, "");
  if (!s) return "-";
  if (/^[A-Z]/.test(s)) {
    const m = s.match(/^[A-Z]+/);
    return m ? m[0] : s;
  }
  return s.split(/[-\s/]/)[0] || s;
}

function normModelo(m) {
  return String(m ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, "");
}

function tokenSort(a, b) {
  const na = /^\d/.test(a);
  const nb = /^\d/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (!na && !nb) return a.localeCompare(b);
  return na ? 1 : -1;
}

function colorPorDias(dias) {
  if (dias === null) return { fg: C.t3, bg: "transparent", label: "" };
  if (dias < 0) return { fg: C.red, bg: "rgba(239,68,68,0.10)", label: "vencido" };
  if (dias < 14) return { fg: C.red, bg: "rgba(239,68,68,0.12)", label: "ya" };
  if (dias < 30) return { fg: C.amber, bg: "rgba(245,158,11,0.12)", label: "pronto" };
  return { fg: C.green, bg: "transparent", label: "" };
}

function scopeAplica(ev, token) {
  if (!Array.isArray(ev.modelos) || ev.modelos.length === 0) return true;
  return ev.modelos.some((m) => normModelo(m) === normModelo(token));
}

function eventoScopeLabel(ev) {
  if (!Array.isArray(ev.modelos) || ev.modelos.length === 0) return "Todas";
  return ev.modelos.map((m) => `Línea ${m}`).join(", ");
}

/**
 * Historial de cambios de fechas sensibles. Si la tabla todavía no existe
 * (SQL sin correr), la edición NO se frena: la auditoría es best-effort.
 */
async function auditarFecha({ obraId, eventoKey = null, campo, anterior, nuevo, motivo = "" }) {
  await supabase.from("fechas_auditoria").insert({
    obra_id: obraId,
    evento_key: eventoKey,
    campo,
    valor_anterior: anterior == null || anterior === "" ? null : String(anterior),
    valor_nuevo: nuevo == null || nuevo === "" ? null : String(nuevo),
    motivo: motivo || null,
  });
}

export default function FechasView({ obras = [], lineas = [], esGestion = false, onUpdateObra }) {
  const { isMobile } = useResponsive();
  const [offsets, setOffsets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editor, setEditor] = useState(false);
  const [buffer, setBuffer] = useState({});
  const [desmoldes, setDesmoldes] = useState({});
  const [eventosDB, setEventosDB] = useState(null);
  const [order, setOrder] = useState(() => loadColOrder(EVENTOS_SEED.map((e) => e.key)));
  const [dragKey, setDragKey] = useState(null);
  const [lineaFiltro, setLineaFiltro] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [nuevoEventoOpen, setNuevoEventoOpen] = useState(false);
  const [estados, setEstados] = useState([]);
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem(VISTA_LS_KEY) === "timeline" ? "timeline" : "tabla"; } catch { return "tabla"; }
  });
  // Popover de estado por hito: { obraId, codigo, eventoKey, evLabel, fecha, dias, x, y }
  const [hitoMenu, setHitoMenu] = useState(null);
  // Modal de edición de fecha sensible: { obraId, codigo, field, label, actual }
  const [fechaModal, setFechaModal] = useState(null);
  const savingRef = useRef(false);

  const eventosBase = eventosDB || EVENTOS_SEED;
  const allKeys = useMemo(() => eventosBase.map((e) => e.key), [eventosBase]);

  useEffect(() => {
    setOrder((prev) => {
      const valid = prev.filter((k) => allKeys.includes(k));
      const missing = allKeys.filter((k) => !valid.includes(k));
      return valid.length + missing.length === prev.length && missing.length === 0 ? prev : [...valid, ...missing];
    });
  }, [allKeys]);

  const eventos = useMemo(
    () => order.map((k) => eventosBase.find((e) => e.key === k)).filter(Boolean),
    [order, eventosBase],
  );

  const colorLinea = useMemo(() => {
    const m = {};
    lineas.forEach((l) => { m[l.id] = l.color; });
    return m;
  }, [lineas]);

  const filas = useMemo(() => obras
    .filter((o) => o.estado !== "terminada")
    .map((o) => ({
      id: o.id,
      codigo: o.codigo || "-",
      token: lineToken(o.codigo),
      color: colorLinea[o.linea_id] || C.t2,
      desmolde_estimado: o.desmolde_estimado || null,
      desmolde_real: o.desmolde_real || null,
      botada: o.botada || null,
      botada_real: o.botada_real || null,
      atraso_dias: Number(o.atraso_dias || 0),
      atraso_motivo: o.atraso_motivo || "",
    })), [obras, colorLinea]);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const map = {};
    filas.forEach((f) => {
      if (lineaFiltro !== "todas" && f.token !== lineaFiltro) return;
      if (q && !String(f.codigo).toLowerCase().includes(q)) return;
      (map[f.token] ??= []).push(f);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) =>
      (a.desmolde_real || a.desmolde_estimado || "9999").localeCompare(b.desmolde_real || b.desmolde_estimado || "9999")));
    return Object.entries(map).sort((a, b) => tokenSort(a[0], b[0]));
  }, [filas, lineaFiltro, busqueda]);

  const tokens = useMemo(() => {
    const set = new Set(filas.map((f) => f.token));
    return [...set].sort(tokenSort);
  }, [filas]);

  const estadosMap = useMemo(() => {
    const map = {};
    estados.forEach((p) => { map[`${p.obra_id}|${p.evento_key}`] = p; });
    return map;
  }, [estados]);

  useEffect(() => { setDesmoldes({}); }, [obras]);

  async function cargarOffsets() {
    const { data, error } = await supabase.from("fechas_offsets").select("*");
    if (error) setErr("Error cargando tiempos: " + error.message);
    else setOffsets(data ?? []);
    setLoading(false);
  }

  async function cargarEventos() {
    const { data, error } = await supabase.from("fechas_eventos").select("*").order("orden");
    if (error) return;
    const activos = (data ?? []).filter((e) => e.activo !== false && e.key !== BOTADA_EVENT_KEY);
    if (activos.length) {
      setEventosDB(activos.map((e) => ({
        key: e.key,
        label: e.label,
        short: e.short || e.label,
        modelos: Array.isArray(e.modelos) ? e.modelos.filter(Boolean).map(String) : null,
      })));
    }
  }

  async function cargarEstados() {
    // Con fallback: si el SQL nuevo (fecha_real/hecho_at) no se corrió, usamos el esquema viejo.
    let res = await supabase.from("fechas_evento_estados")
      .select("obra_id,evento_key,estado,pedido_at,pedido_por,nota,fecha_real,hecho_at");
    if (res.error) {
      res = await supabase.from("fechas_evento_estados")
        .select("obra_id,evento_key,estado,pedido_at,pedido_por,nota");
    }
    if (!res.error) setEstados(res.data ?? []);
  }

  useEffect(() => {
    cargarOffsets();
    cargarEventos();
    cargarEstados();
    const ch = supabase.channel("rt-fechas")
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_offsets" }, async () => {
        if (savingRef.current) return;
        const { data } = await supabase.from("fechas_offsets").select("*");
        setOffsets(data ?? []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_eventos" }, () => {
        if (savingRef.current) return;
        cargarEventos();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_evento_estados" }, () => {
        if (savingRef.current) return;
        cargarEstados();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  function moveCol(fromKey, toKey) {
    if (!fromKey || fromKey === toKey) return;
    setOrder((prev) => {
      const arr = prev.filter((k) => k !== fromKey);
      const idx = arr.indexOf(toKey);
      arr.splice(idx < 0 ? arr.length : idx, 0, fromKey);
      try { localStorage.setItem(ORDER_LS_KEY, JSON.stringify(arr)); } catch { /* noop */ }
      return arr;
    });
  }

  function resetCols() {
    try { localStorage.removeItem(ORDER_LS_KEY); } catch { /* noop */ }
    setOrder([...allKeys]);
  }

  function setVistaPersist(v) {
    setVista(v);
    try { localStorage.setItem(VISTA_LS_KEY, v); } catch { /* noop */ }
  }

  const pickOffset = useCallback((eventoKey, token) => {
    const pick = (o) => ({ semanas: Number(o.semanas), referencia: o.referencia === "botada" ? "botada" : "desmolde" });
    const exact = offsets.find((o) => o.evento_key === eventoKey && o.modelo === token);
    if (exact) return pick(exact);
    const norm = offsets.find((o) => o.evento_key === eventoKey && o.modelo !== "*" && normModelo(o.modelo) === normModelo(token));
    if (norm) return pick(norm);
    const def = offsets.find((o) => o.evento_key === eventoKey && o.modelo === "*");
    return def ? pick(def) : null;
  }, [offsets]);

  const getOffset = useCallback((eventoKey, token) => {
    const ev = eventosBase.find((e) => e.key === eventoKey);
    if (ev && !scopeAplica(ev, token)) return null;
    return pickOffset(eventoKey, token);
  }, [eventosBase, pickOffset]);

  function getExactOffset(eventoKey, modelo) {
    const r = offsets.find((o) => o.evento_key === eventoKey && o.modelo === modelo);
    return r ? String(r.semanas) : "";
  }

  function getEventoRef(eventoKey) {
    const def = offsets.find((o) => o.evento_key === eventoKey && o.modelo === "*");
    if (def) return def.referencia === "botada" ? "botada" : "desmolde";
    const any = offsets.find((o) => o.evento_key === eventoKey);
    return any?.referencia === "botada" ? "botada" : "desmolde";
  }

  /**
   * Fechas efectivas de una obra.
   * Baseline = fecha sin atraso; proyección = baseline + atraso_dias. El atraso
   * (vacaciones/pausa) desplaza la proyección SIN tocar la fecha original.
   * La botada sale de: real > manual > calculada por regla de línea (__botada__).
   * Sin regla configurada NO se inventa botada.
   */
  const withFechas = useCallback((f) => {
    const ov = desmoldes[f.id] || {};
    const est = "desmolde_estimado" in ov ? ov.desmolde_estimado : f.desmolde_estimado;
    const real = "desmolde_real" in ov ? ov.desmolde_real : f.desmolde_real;
    const botada = "botada" in ov ? ov.botada : f.botada;
    const botadaReal = "botada_real" in ov ? ov.botada_real : f.botada_real;
    const atrasoDias = Number("atraso_dias" in ov ? ov.atraso_dias : f.atraso_dias) || 0;
    const atrasoMotivo = "atraso_motivo" in ov ? ov.atraso_motivo : f.atraso_motivo;
    const efectivo = real || est || null;
    const desmBase = parseISO(efectivo);
    const botManual = parseISO(botada);
    const botReal = parseISO(botadaReal);
    const reglaBot = pickOffset(BOTADA_EVENT_KEY, f.token);
    const botCalc = !botReal && !botManual && reglaBot && desmBase ? addSemanas(desmBase, reglaBot.semanas) : null;
    const botBase = botReal || botManual || botCalc || null;
    return {
      est,
      real,
      botada: botada || null,
      botadaReal: botadaReal || null,
      efectivo,
      atrasoDias,
      atrasoMotivo,
      desmBase,
      desmRef: addDias(desmBase, atrasoDias),
      botBase,
      botRef: botBase ? addDias(botBase, atrasoDias) : null,
      botSource: botReal ? "real" : botManual ? "manual" : botCalc ? "calc" : null,
      sinReglaBotada: !botReal && !botManual && !reglaBot,
    };
  }, [desmoldes, pickOffset]);

  function currentField(obraId, field) {
    const f = filas.find((row) => row.id === obraId);
    const ov = desmoldes[obraId] || {};
    if (field in ov) return ov[field];
    return f?.[field] ?? null;
  }

  async function updateObra(obraId, patch) {
    setDesmoldes((prev) => ({ ...prev, [obraId]: { ...prev[obraId], ...patch } }));
    if (onUpdateObra) await onUpdateObra(obraId, patch);
    else await supabase.from("produccion_obras").update(patch).eq("id", obraId);
  }

  function getEstado(obraId, eventoKey) {
    return estadosMap[`${obraId}|${eventoKey}`] || null;
  }

  /** Fechas NO sensibles: edición inline con auditoría automática. */
  async function setFechaObra(obraId, field, value) {
    const val = value || null;
    const prev = currentField(obraId, field);
    if (val === prev) return;
    await updateObra(obraId, { [field]: val });
    auditarFecha({ obraId, campo: field, anterior: prev, nuevo: val, motivo: "edición inline" });
  }

  async function setAtrasoObra(obraId, dias) {
    const atraso = Number(dias || 0);
    const prev = currentField(obraId, "atraso_dias");
    await updateObra(obraId, {
      atraso_dias: atraso,
      atraso_motivo: atraso > 0 ? "vacaciones" : null,
      atraso_updated_at: new Date().toISOString(),
    });
    auditarFecha({ obraId, campo: "atraso_dias", anterior: prev, nuevo: atraso, motivo: atraso > 0 ? "vacaciones/pausa" : "atraso quitado" });
  }

  /** Guardado desde el modal de fecha sensible (desmolde real / botada real / botada est). */
  async function guardarFechaSensible({ obraId, field, nueva, motivo }) {
    const prev = currentField(obraId, field);
    try {
      await updateObra(obraId, { [field]: nueva || null });
    } catch (e) {
      if (field === "botada_real") {
        setErr("No se pudo guardar la botada real. ¿Se corrió el SQL de fechas (columna botada_real)?");
        return;
      }
      setErr("No se pudo guardar: " + (e?.message || e));
      return;
    }
    auditarFecha({ obraId, campo: field, anterior: prev, nuevo: nueva, motivo });
    setFechaModal(null);
  }

  /** Cambia el estado operativo de un hito (pedido / en curso / hecho / limpiar). */
  async function setEstadoHito(obraId, eventoKey, estado, fechaReal = null) {
    savingRef.current = true;
    try {
      if (!estado) {
        await supabase.from("fechas_evento_estados").delete().eq("obra_id", obraId).eq("evento_key", eventoKey);
        setEstados((prev) => prev.filter((p) => !(p.obra_id === obraId && p.evento_key === eventoKey)));
        return true;
      }
      const now = new Date().toISOString();
      const anterior = getEstado(obraId, eventoKey);
      const row = {
        obra_id: obraId,
        evento_key: eventoKey,
        estado,
        pedido_at: estado === "pedido" ? now : (anterior?.pedido_at ?? null),
        fecha_real: estado === "hecho" ? (fechaReal || hoyIso()) : null,
        hecho_at: estado === "hecho" ? now : null,
        updated_at: now,
      };
      let { error } = await supabase.from("fechas_evento_estados").upsert(row, { onConflict: "obra_id,evento_key" });
      if (error && estado === "pedido") {
        // Esquema viejo (sin fecha_real/hecho_at o check solo-pedido): el pedido sigue andando.
        const legacy = { obra_id: obraId, evento_key: eventoKey, estado: "pedido", pedido_at: now, updated_at: now };
        ({ error } = await supabase.from("fechas_evento_estados").upsert(legacy, { onConflict: "obra_id,evento_key" }));
        if (!error) {
          setEstados((prev) => [...prev.filter((p) => !(p.obra_id === obraId && p.evento_key === eventoKey)), legacy]);
          return true;
        }
      }
      if (error) {
        setErr("No se pudo guardar el estado. Para usar En curso/Hecho hay que correr el SQL de fechas: " + error.message);
        return false;
      }
      setEstados((prev) => [...prev.filter((p) => !(p.obra_id === obraId && p.evento_key === eventoKey)), row]);
      return true;
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function commitOffset(eventoKey, modelo, raw) {
    const trimmed = String(raw ?? "").trim().replace(",", ".");
    savingRef.current = true;
    try {
      if (trimmed === "") {
        await supabase.from("fechas_offsets").delete().eq("evento_key", eventoKey).eq("modelo", modelo);
        setOffsets((prev) => prev.filter((o) => !(o.evento_key === eventoKey && o.modelo === modelo)));
        return;
      }
      const semanas = Number(trimmed);
      if (Number.isNaN(semanas)) return;
      const prev0 = offsets.find((o) => o.evento_key === eventoKey && o.modelo === modelo);
      const referencia = prev0?.referencia || "desmolde";
      const row = { evento_key: eventoKey, modelo, semanas, referencia, updated_at: new Date().toISOString() };
      await supabase.from("fechas_offsets").upsert(row, { onConflict: "evento_key,modelo" });
      setOffsets((prev) => [...prev.filter((o) => !(o.evento_key === eventoKey && o.modelo === modelo)), row]);
    } catch (e) {
      setErr("Error guardando: " + (e?.message || e));
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function commitReferencia(eventoKey, referencia) {
    const ref = referencia === "botada" ? "botada" : "desmolde";
    savingRef.current = true;
    try {
      const filasOffset = offsets.filter((o) => o.evento_key === eventoKey);
      const base = filasOffset.length
        ? filasOffset.map((o) => ({ evento_key: eventoKey, modelo: o.modelo, semanas: Number(o.semanas) || 0 }))
        : [{ evento_key: eventoKey, modelo: "*", semanas: 0 }];
      const now = new Date().toISOString();
      const rows = base.map((r) => ({ ...r, referencia: ref, updated_at: now }));
      await supabase.from("fechas_offsets").upsert(rows, { onConflict: "evento_key,modelo" });
      setOffsets((prev) => [
        ...prev.filter((o) => o.evento_key !== eventoKey),
        ...rows.map((r) => ({ evento_key: r.evento_key, modelo: r.modelo, semanas: r.semanas, referencia: ref })),
      ]);
    } catch (e) {
      setErr("Error guardando: " + (e?.message || e));
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function commitEventoScope(ev, scope) {
    const modelos = scope === "*" ? null : [scope];
    savingRef.current = true;
    try {
      const { error } = await supabase.from("fechas_eventos").update({ modelos, updated_at: new Date().toISOString() }).eq("key", ev.key);
      if (error) {
        setErr("No se pudo cambiar el alcance: " + error.message);
        return;
      }
      setEventosDB((prev) => (prev || eventosBase).map((e) => (e.key === ev.key ? { ...e, modelos } : e)));
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function guardarNuevoEvento(form) {
    const label = form.label.trim();
    if (!label) return;
    let key = slugifyKey(label);
    if (!key) return;
    if (allKeys.includes(key)) key = `${key}_${Date.now().toString().slice(-4)}`;
    const modelos = form.scope === "*" ? null : [form.scope];
    const modeloOffset = form.scope === "*" ? "*" : form.scope;
    const semanas = Number(String(form.semanas || "0").replace(",", "."));
    savingRef.current = true;
    try {
      const orden = (eventosBase.length || 0) + 1;
      const row = {
        key,
        label,
        short: (form.short || label).trim().slice(0, 16),
        orden,
        activo: true,
        modelos,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("fechas_eventos").insert(row);
      if (error) {
        setErr("No se pudo agregar el ítem: " + error.message);
        return;
      }
      const off = {
        evento_key: key,
        modelo: modeloOffset,
        semanas: Number.isNaN(semanas) ? 0 : semanas,
        referencia: form.referencia === "botada" ? "botada" : "desmolde",
        updated_at: new Date().toISOString(),
      };
      await supabase.from("fechas_offsets").upsert(off, { onConflict: "evento_key,modelo" });
      setEventosDB((prev) => [...(prev || eventosBase), row]);
      setOffsets((prev) => [...prev, off]);
      setOrder((prev) => [...prev, key]);
      setNuevoEventoOpen(false);
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function borrarEvento(ev) {
    if (!window.confirm(`¿Quitar "${ev.label}" de la vista de fechas? No borra las fechas de los barcos.`)) return;
    savingRef.current = true;
    try {
      const row = { key: ev.key, label: ev.label, short: ev.short || ev.label, activo: false, updated_at: new Date().toISOString() };
      await supabase.from("fechas_eventos").upsert(row, { onConflict: "key" });
      setEventosDB((prev) => (prev || eventosBase).filter((e) => e.key !== ev.key));
      setOrder((prev) => prev.filter((k) => k !== ev.key));
    } catch (e) {
      setErr("No se pudo quitar: " + (e?.message || e));
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  /** Fecha proyectada de un hito para una obra (o null si no hay regla/base). */
  const fechaHito = useCallback((f, fechas, ev) => {
    const off = getOffset(ev.key, f.token);
    if (!off) return { fecha: null, motivo: "sin regla" };
    const ref = off.referencia === "botada" ? fechas.botRef : fechas.desmRef;
    if (!ref) return { fecha: null, motivo: off.referencia === "botada" ? "sin botada" : "sin desmolde" };
    return { fecha: addSemanas(ref, off.semanas), off };
  }, [getOffset]);

  // Agenda: pendientes de acá a 45 días + TODO lo vencido sin resolver (no se oculta).
  const agenda = useMemo(() => {
    const rows = [];
    filas.forEach((f) => {
      const fechas = withFechas(f);
      eventos.filter((ev) => scopeAplica(ev, f.token)).forEach((ev) => {
        const st = estadosMap[`${f.id}|${ev.key}`];
        if (st) return; // pedido / en curso / hecho: ya está gestionado
        const { fecha } = fechaHito(f, fechas, ev);
        if (!fecha) return;
        const dias = diasHasta(fecha);
        if (dias === null || dias > 45 || dias < -90) return;
        rows.push({ id: `${f.id}-${ev.key}`, obraId: f.id, codigo: f.codigo, token: f.token, evento: ev.label, fecha, dias, color: f.color });
      });
    });
    return rows.sort((a, b) => a.dias - b.dias).slice(0, 14);
  }, [filas, eventos, estadosMap, withFechas, fechaHito]);

  function focoAgenda(a) {
    setLineaFiltro(a.token);
    setBusqueda(a.codigo);
  }

  function abrirHitoMenu(e, f, fechas, ev) {
    if (!esGestion) return;
    const { fecha } = fechaHito(f, fechas, ev);
    const x = Math.min(e.clientX, (window.innerWidth || 1200) - 290);
    const y = Math.min(e.clientY, (window.innerHeight || 800) - 340);
    setHitoMenu({
      obraId: f.id,
      codigo: f.codigo,
      eventoKey: ev.key,
      evLabel: ev.label,
      fecha,
      dias: diasHasta(fecha),
      atrasoDias: fechas.atrasoDias,
      x,
      y,
    });
  }

  /* ── estilos base ── */

  const th = {
    padding: "8px 10px",
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 850,
    color: C.t2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${C.b1}`,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    background: C.s1,
    zIndex: 1,
  };
  const td = {
    padding: "6px 10px",
    fontSize: 12.5,
    color: C.t1,
    borderBottom: `1px solid ${C.b0}`,
    whiteSpace: "nowrap",
    fontFamily: C.mono,
  };
  const dateInput = {
    width: 122,
    padding: "5px 7px",
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    background: "var(--date-input-bg, var(--bg))",
    color: C.t0,
    fontFamily: C.mono,
    fontSize: 12,
    colorScheme: "var(--input-color-scheme, dark)",
  };
  const inputStyle = {
    border: `1px solid ${C.b1}`,
    background: C.bg,
    color: C.t0,
    borderRadius: 8,
    padding: "8px 10px",
    fontFamily: C.sans,
    fontSize: 12.5,
  };
  const rootStyle = {
    fontFamily: C.sans,
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: isMobile ? 12 : "16px 18px",
  };

  if (loading) {
    return (
      <div style={{ ...rootStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.t2, fontSize: 12, letterSpacing: 1.3, textTransform: "uppercase" }}>Cargando fechas...</div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <style>{`
        .fv-row:hover td { box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.055); }
        .fv-date-input::-webkit-calendar-picker-indicator { opacity: .72; cursor: pointer; }
        .fv-cell { transition: background .12s; }
        .fv-cell:hover { box-shadow: inset 0 0 0 1px ${C.b1}; border-radius: 8px; }
        .fv-dot { transition: transform .1s; }
        .fv-dot:hover { transform: scale(1.35); }
        .fv-agenda-chip { transition: border-color .12s, background .12s; }
        .fv-agenda-chip:hover { border-color: ${C.blue}; background: rgba(59,130,246,0.07); }
      `}</style>

      {/* ── Header compacto: título + acciones + filtros en una tarjeta ── */}
      <div style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 14, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.t0, letterSpacing: -0.3 }}>Fechas de producción</div>
            <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>
              Lo vencido queda marcado hasta que alguien lo actualice o lo resuelva.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {order.join() !== allKeys.join() && (
              <button type="button" onClick={resetCols} title="Restaurar el orden original de columnas" style={softBtn()}>
                Orden original
              </button>
            )}
            {esGestion && (
              <button type="button" onClick={() => setNuevoEventoOpen(true)} title="Agregar un ítem/evento" style={greenBtn()}>
                + Ítem
              </button>
            )}
            {esGestion && (
              <button type="button" onClick={() => setEditor((e) => !e)} style={blueBtn(editor)}>
                {editor ? "Cerrar tiempos" : "Configurar tiempos"}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "minmax(200px,1fr) 150px auto", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input
            style={{ ...inputStyle, gridColumn: isMobile ? "1 / -1" : "auto" }}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar barco..."
          />
          <select style={inputStyle} value={lineaFiltro} onChange={(e) => setLineaFiltro(e.target.value)}>
            <option value="todas">Todas las líneas</option>
            {tokens.map((t) => <option key={t} value={t}>Línea {t}</option>)}
          </select>
          {/* Toggle de vista: tabla operativa o timeline visual */}
          <div style={{ display: "inline-flex", border: `1px solid ${C.b1}`, background: C.bg, borderRadius: 9, padding: 3, gap: 3, justifySelf: isMobile ? "stretch" : "end" }}>
            {[["tabla", "Tabla"], ["timeline", "Timeline"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVistaPersist(key)}
                style={{
                  flex: isMobile ? 1 : "0 0 auto",
                  border: "none",
                  background: vista === key ? "rgba(59,130,246,0.13)" : "transparent",
                  color: vista === key ? C.blue : C.t2,
                  borderRadius: 7,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 850,
                  cursor: "pointer",
                  fontFamily: C.sans,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Agenda próxima: vencidos + próximos 45 días. Click = enfocar la obra ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.b0}`, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto", color: C.t2, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", fontWeight: 850 }}>
            Agenda
            <span style={{ color: C.t0, fontFamily: C.mono }}>{agenda.length}</span>
          </div>
          {agenda.length === 0 ? (
            <div style={{ fontSize: 12, color: C.t3 }}>Nada vencido ni próximo para estos filtros.</div>
          ) : (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", minWidth: 0, paddingBottom: 1 }}>
              {agenda.map((a) => {
                const col = colorPorDias(a.dias);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="fv-agenda-chip"
                    onClick={() => focoAgenda(a)}
                    title={`Enfocar ${a.codigo} · ${a.evento} · ${fmtFecha(a.fecha)}`}
                    style={{
                      flex: "0 0 auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      border: `1px solid ${a.dias < 0 ? "rgba(239,68,68,0.4)" : C.b0}`,
                      background: a.dias < 0 ? "rgba(239,68,68,0.07)" : C.bg,
                      borderRadius: 999,
                      padding: "4px 9px",
                      fontSize: 11.5,
                      lineHeight: 1,
                      cursor: "pointer",
                      fontFamily: C.sans,
                    }}
                  >
                    <span style={{ color: a.color, fontWeight: 900, fontFamily: C.mono }}>{a.codigo}</span>
                    <span style={{ color: C.t1, fontWeight: 750 }}>{a.evento}</span>
                    <span style={{ color: col.fg, fontWeight: 900 }}>{diasTexto(a.dias)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {err && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, background: "rgba(239,68,68,0.12)", border: `1px solid ${C.red}`, color: C.red, fontSize: 12.5, marginBottom: 12 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{err}</span>
          <button type="button" onClick={() => setErr("")} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={14} /></button>
        </div>
      )}

      {/* ── Editor de tiempos (gestión) ── */}
      {editor && esGestion && (
        <div style={{ border: `1px solid ${C.b1}`, borderRadius: 14, background: C.s0, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.t0 }}>Configuración de tiempos</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.45 }}>
                Negativo = antes de la referencia. Positivo = después. Los ítems con alcance por línea sólo aparecen en esa línea.
              </div>
            </div>
            <button type="button" onClick={() => setNuevoEventoOpen(true)} style={greenBtn()}>+ Ítem por línea</button>
          </div>

          <div style={{ border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "9px 12px", background: C.s1, borderBottom: `1px solid ${C.b0}` }}>
              <div style={{ fontSize: 12.5, color: C.t0, fontWeight: 850 }}>Botada estimada (regla por línea)</div>
              <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>
                Si el barco no tiene botada cargada, se proyecta desde el desmolde con estas semanas. Las líneas SIN valor no proyectan botada (muestran "sin regla") — mejor sin fecha que con una fecha inventada.
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={th}>Concepto</th>
                    <th style={{ ...th, textAlign: "center" }}>Todas</th>
                    {tokens.map((t) => <th key={t} style={{ ...th, textAlign: "center" }}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...td, fontFamily: C.sans, fontWeight: 800, color: C.t0 }}>Semanas desmolde {"->"} botada</td>
                    {["*", ...tokens].map((modelo) => {
                      const bk = `${BOTADA_EVENT_KEY}|${modelo}`;
                      const val = bk in buffer ? buffer[bk] : getExactOffset(BOTADA_EVENT_KEY, modelo);
                      return (
                        <td key={modelo} style={{ ...td, textAlign: "center", padding: "5px 6px" }}>
                          <input
                            type="number"
                            step="0.5"
                            value={val}
                            placeholder={modelo === "*" ? String(DEFAULT_BOTADA_SEMANAS) : ""}
                            onChange={(e) => setBuffer((b) => ({ ...b, [bk]: e.target.value }))}
                            onBlur={(e) => {
                              commitOffset(BOTADA_EVENT_KEY, modelo, e.target.value);
                              setBuffer((b) => { const n = { ...b }; delete n[bk]; return n; });
                            }}
                            style={smallNumberInput}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 170 }}>Ítem</th>
                  <th style={th}>Alcance</th>
                  <th style={th}>Referencia</th>
                  <th style={{ ...th, textAlign: "center" }}>Todas</th>
                  {tokens.map((t) => <th key={t} style={{ ...th, textAlign: "center" }}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={ev.key}>
                    <td style={{ ...td, fontFamily: C.sans, color: C.t0, fontWeight: 750 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{ev.label}</span>
                        <button type="button" onClick={() => borrarEvento(ev)} title="Quitar este ítem" style={iconDangerBtn}>x</button>
                      </div>
                    </td>
                    <td style={td}>
                      <select value={Array.isArray(ev.modelos) && ev.modelos.length === 1 ? ev.modelos[0] : "*"} onChange={(e) => commitEventoScope(ev, e.target.value)} style={{ ...inputStyle, padding: "5px 8px", minWidth: 120 }}>
                        <option value="*">Todas</option>
                        {tokens.map((t) => <option key={t} value={t}>Sólo {t}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={getEventoRef(ev.key)} onChange={(e) => commitReferencia(ev.key, e.target.value)} style={{ ...inputStyle, padding: "5px 8px", minWidth: 126 }}>
                        <option value="desmolde">Desmolde</option>
                        <option value="botada">Botada</option>
                      </select>
                    </td>
                    {["*", ...tokens].map((modelo) => {
                      const scoped = Array.isArray(ev.modelos) && ev.modelos.length > 0;
                      const applies = modelo === "*" ? !scoped : scopeAplica(ev, modelo);
                      const bk = `${ev.key}|${modelo}`;
                      const val = bk in buffer ? buffer[bk] : getExactOffset(ev.key, modelo);
                      return (
                        <td key={modelo} style={{ ...td, textAlign: "center", padding: "5px 6px", opacity: applies ? 1 : 0.35 }}>
                          <input
                            type="number"
                            step="0.5"
                            inputMode="numeric"
                            value={val}
                            disabled={!applies}
                            placeholder={modelo === "*" ? "-" : ""}
                            onChange={(e) => setBuffer((b) => ({ ...b, [bk]: e.target.value }))}
                            onBlur={(e) => {
                              commitOffset(ev.key, modelo, e.target.value);
                              setBuffer((b) => { const n = { ...b }; delete n[bk]; return n; });
                            }}
                            style={{ ...smallNumberInput, cursor: applies ? "text" : "not-allowed" }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leyenda unificada ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: 11.5, color: C.t2 }}>
        <Legend color={C.red} text="Vencido / <14 días" />
        <Legend color={C.amber} text="Próximo (<30d)" />
        <Legend color={C.green} text="Con tiempo" />
        <Legend color={C.blue} text="Pedido" />
        <Legend color={C.violet} text="En curso" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Check size={12} style={{ color: C.green }} /> Hecho (fecha real)
        </span>
        <Legend color={C.t3} text="Sin regla configurada" />
      </div>

      {filas.length === 0 && (
        <div style={{ padding: 30, color: C.t2 }}>No hay barcos en producción cargados.</div>
      )}

      {grupos.map(([token, lista]) => {
        const eventosLinea = eventos.filter((ev) => scopeAplica(ev, token));
        const lineColor = lista[0]?.color || C.t2;
        return (
          <div key={token} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
              padding: "9px 12px",
              borderRadius: 12,
              background: C.s0,
              border: `1px solid ${C.b0}`,
              borderLeft: `3px solid ${lineColor}`,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: lineColor }} />
              <span style={{ fontSize: 14.5, fontWeight: 900, color: C.t0 }}>Línea {token}</span>
              <span style={pill()}>{lista.length} barco{lista.length !== 1 ? "s" : ""}</span>
              <span style={pill()}>{eventosLinea.length} ítem{eventosLinea.length !== 1 ? "s" : ""}</span>
            </div>

            {isMobile ? (
              <ObrasCardsMobile
                lista={lista}
                eventosLinea={eventosLinea}
                withFechas={withFechas}
                fechaHito={fechaHito}
                getEstado={getEstado}
                esGestion={esGestion}
                onHito={abrirHitoMenu}
                onFechaSensible={(f, field, label, actual) => setFechaModal({ obraId: f.id, codigo: f.codigo, field, label, actual })}
                setFechaObra={setFechaObra}
                setAtrasoObra={setAtrasoObra}
                dateInput={dateInput}
                inputStyle={inputStyle}
              />
            ) : vista === "timeline" ? (
              <TimelineLinea
                lista={lista}
                eventosLinea={eventosLinea}
                withFechas={withFechas}
                fechaHito={fechaHito}
                getEstado={getEstado}
                esGestion={esGestion}
                onHito={abrirHitoMenu}
              />
            ) : (
              <div style={{ overflowX: "auto", border: `1px solid ${C.b1}`, borderRadius: 14, background: C.bg }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, left: 0, zIndex: 2, minWidth: 82 }}>Barco</th>
                      <th style={th}>Desmolde est.</th>
                      <th style={th}>Desmolde real</th>
                      <th style={th}>Botada</th>
                      <th style={th}>Atraso</th>
                      {eventosLinea.map((ev) => (
                        <th
                          key={ev.key}
                          draggable
                          onDragStart={() => setDragKey(ev.key)}
                          onDragEnd={() => setDragKey(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); moveCol(dragKey, ev.key); setDragKey(null); }}
                          title={`${ev.label} · ${eventoScopeLabel(ev)} · arrastrá para reordenar`}
                          style={{
                            ...th,
                            textAlign: "center",
                            cursor: "grab",
                            userSelect: "none",
                            opacity: dragKey === ev.key ? 0.4 : 1,
                            background: dragKey && dragKey !== ev.key ? "rgba(59,130,246,0.08)" : th.background,
                          }}
                        >
                          <span style={{ color: C.t3, marginRight: 4, fontSize: 9 }}>::</span>
                          {ev.short || ev.label}
                          {Array.isArray(ev.modelos) && ev.modelos.length > 0 && <span style={{ marginLeft: 5, color: C.blue }}>•</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f) => {
                      const fechas = withFechas(f);
                      return (
                        <tr key={f.id} className="fv-row">
                          <td style={{ ...td, fontWeight: 850, color: C.t0, position: "sticky", left: 0, background: C.bg, zIndex: 1 }}>{f.codigo}</td>
                          <td style={td}>
                            {esGestion ? (
                              <input className="fv-date-input" type="date" value={iso(fechas.est)} onChange={(e) => setFechaObra(f.id, "desmolde_estimado", e.target.value)} style={dateInput} />
                            ) : (
                              <span style={{ color: fechas.est ? C.t1 : C.t3 }}>{fmtFecha(parseISO(fechas.est))}</span>
                            )}
                          </td>
                          <td style={td}>
                            <FechaSensibleCell
                              valor={fechas.real}
                              color={C.green}
                              esGestion={esGestion}
                              placeholder="cargar"
                              onOpen={() => setFechaModal({ obraId: f.id, codigo: f.codigo, field: "desmolde_real", label: "Desmolde real", actual: fechas.real })}
                            />
                          </td>
                          <td style={td}>
                            <BotadaCell
                              fechas={fechas}
                              esGestion={esGestion}
                              onOpenReal={() => setFechaModal({ obraId: f.id, codigo: f.codigo, field: "botada_real", label: "Botada real", actual: fechas.botadaReal })}
                              onOpenEst={() => setFechaModal({ obraId: f.id, codigo: f.codigo, field: "botada", label: "Botada estimada", actual: fechas.botada })}
                            />
                          </td>
                          <td style={td}>
                            {esGestion ? (
                              <select value={String(fechas.atrasoDias)} onChange={(e) => setAtrasoObra(f.id, e.target.value)} style={{ ...inputStyle, padding: "5px 7px", minWidth: 108, color: fechas.atrasoDias > 0 ? C.blue : C.t2, fontFamily: C.sans }}>
                                <option value="0">Sin atraso</option>
                                <option value="7">+1 sem vac.</option>
                                <option value="14">+2 sem vac.</option>
                                <option value="21">+3 sem vac.</option>
                                <option value="28">+4 sem vac.</option>
                              </select>
                            ) : (
                              <span style={{ color: fechas.atrasoDias > 0 ? C.blue : C.t3 }}>{fechas.atrasoDias > 0 ? `+${fechas.atrasoDias}d` : "-"}</span>
                            )}
                          </td>
                          {eventosLinea.map((ev) => (
                            <HitoCell
                              key={ev.key}
                              f={f}
                              fechas={fechas}
                              ev={ev}
                              fechaHito={fechaHito}
                              estado={getEstado(f.id, ev.key)}
                              esGestion={esGestion}
                              onClick={(e) => abrirHitoMenu(e, f, fechas, ev)}
                              td={td}
                            />
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Popover de estado de hito ── */}
      {hitoMenu && (
        <HitoMenuPopover
          menu={hitoMenu}
          estado={getEstado(hitoMenu.obraId, hitoMenu.eventoKey)}
          onSet={async (estado, fechaReal) => {
            const ok = await setEstadoHito(hitoMenu.obraId, hitoMenu.eventoKey, estado, fechaReal);
            if (ok) setHitoMenu(null);
          }}
          onClose={() => setHitoMenu(null)}
        />
      )}

      {/* ── Modal de fecha sensible ── */}
      {fechaModal && (
        <EditarFechaModal
          data={fechaModal}
          onSave={guardarFechaSensible}
          onClose={() => setFechaModal(null)}
        />
      )}

      {nuevoEventoOpen && (
        <NuevoEventoModal
          tokens={tokens}
          onClose={() => setNuevoEventoOpen(false)}
          onSave={guardarNuevoEvento}
        />
      )}
    </div>
  );
}

/* ── Celda de hito (tabla): fecha proyectada + estado + click para gestionar ── */
function HitoCell({ f, fechas, ev, fechaHito, estado, esGestion, onClick, td }) {
  const { fecha, motivo } = fechaHito(f, fechas, ev);
  const st = estado?.estado && ESTADOS_HITO[estado.estado] ? estado.estado : null;
  const meta = st ? ESTADOS_HITO[st] : null;

  if (!fecha && !st) {
    return (
      <td
        className={esGestion ? "fv-cell" : undefined}
        onClick={esGestion ? onClick : undefined}
        title={motivo === "sin regla" ? `${ev.label}: sin regla configurada para esta línea` : `${ev.label}: falta la fecha base (${motivo})`}
        style={{ ...td, textAlign: "center", color: C.t3, fontSize: 10.5, fontFamily: C.sans, cursor: esGestion ? "pointer" : "default" }}
      >
        {motivo === "sin regla" ? "sin regla" : "—"}
      </td>
    );
  }

  // Hecho: manda la fecha real con check.
  if (st === "hecho") {
    const fReal = parseISO(estado.fecha_real);
    return (
      <td
        className={esGestion ? "fv-cell" : undefined}
        onClick={esGestion ? onClick : undefined}
        title={`${ev.label}: hecho${fReal ? ` el ${fmtFecha(fReal)}` : ""}`}
        style={{ ...td, textAlign: "center", background: meta.bg, padding: "5px 8px", cursor: esGestion ? "pointer" : "default" }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.green, fontWeight: 850 }}>
          <Check size={12} strokeWidth={3} />
          {fReal ? fmtFecha(fReal) : "Hecho"}
        </div>
      </td>
    );
  }

  const dias = diasHasta(fecha);
  const col = colorPorDias(dias);
  const fg = meta ? meta.color : col.fg;
  const bg = meta ? meta.bg : col.bg;
  return (
    <td
      className={esGestion ? "fv-cell" : undefined}
      onClick={esGestion ? onClick : undefined}
      title={`${ev.label} · ${fmtFecha(fecha)}${fechas.atrasoDias > 0 ? ` · incluye atraso +${fechas.atrasoDias}d` : ""}${esGestion ? " · click para gestionar" : ""}`}
      style={{ ...td, textAlign: "center", background: bg, padding: "5px 8px", cursor: esGestion ? "pointer" : "default" }}
    >
      <div style={{ color: fg, fontWeight: dias !== null && dias < 30 ? 900 : 650 }}>{fmtFecha(fecha)}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 2 }}>
        <span style={{ fontSize: 9.5, color: fg, opacity: 0.9, fontFamily: C.sans, fontWeight: 800 }}>
          {meta ? meta.label : diasTexto(dias)}
        </span>
        {meta && dias !== null && (
          <span style={{ fontSize: 9.5, color: col.fg, fontFamily: C.sans, fontWeight: 700, opacity: 0.8 }}>{diasTexto(dias)}</span>
        )}
      </div>
    </td>
  );
}

/* ── Celda de fecha sensible (desmolde real): abre modal con motivo + auditoría ── */
function FechaSensibleCell({ valor, color, esGestion, placeholder, onOpen }) {
  const d = parseISO(valor);
  if (!esGestion) {
    return <span style={{ color: d ? color : C.t3 }}>{fmtFecha(d)}</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={d ? "Cambiar (pide motivo y queda auditado)" : "Cargar fecha real"}
      style={{
        border: `1px solid ${d ? "rgba(16,185,129,0.4)" : C.b1}`,
        background: d ? "rgba(16,185,129,0.08)" : C.bg,
        color: d ? color : C.t3,
        borderRadius: 7,
        padding: "5px 9px",
        fontFamily: C.mono,
        fontSize: 12,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        minWidth: 104,
        justifyContent: "center",
      }}
    >
      {d ? <><Check size={11} strokeWidth={3} /> {fmtFecha(d)}</> : placeholder}
    </button>
  );
}

/* ── Celda de botada: real > manual > calculada por regla > sin regla ── */
function BotadaCell({ fechas, esGestion, onOpenReal, onOpenEst }) {
  const { botBase, botSource, sinReglaBotada } = fechas;
  if (botSource === "real") {
    return (
      <button type="button" disabled={!esGestion} onClick={onOpenReal} title="Botada real (auditada)" style={botadaBtn("rgba(16,185,129,0.4)", "rgba(16,185,129,0.08)", C.green, esGestion)}>
        <Check size={11} strokeWidth={3} /> {fmtFecha(botBase)}
      </button>
    );
  }
  if (botSource === "manual") {
    return (
      <button type="button" disabled={!esGestion} onClick={onOpenEst} title="Botada estimada cargada a mano · click para editar o cargar la real" style={botadaBtn("rgba(59,130,246,0.4)", "rgba(59,130,246,0.07)", C.blue, esGestion)}>
        {fmtFecha(botBase)}
      </button>
    );
  }
  if (botSource === "calc") {
    return (
      <button type="button" disabled={!esGestion} onClick={onOpenEst} title="Proyectada por regla de la línea (semanas desde desmolde) · click para fijarla a mano" style={{ ...botadaBtn(C.b1, "transparent", C.t2, esGestion), fontStyle: "italic" }}>
        ≈ {fmtFecha(botBase)}
      </button>
    );
  }
  return (
    <button type="button" disabled={!esGestion} onClick={onOpenEst} title="Esta línea no tiene regla desmolde→botada. Cargala a mano o configurá la regla en Tiempos." style={{ ...botadaBtn(C.b1, "transparent", C.t3, esGestion), fontSize: 10.5, fontFamily: C.sans }}>
      {sinReglaBotada ? "sin regla" : "cargar"}
    </button>
  );
}

function botadaBtn(border, bg, color, enabled) {
  return {
    border: `1px solid ${border}`,
    background: bg,
    color,
    borderRadius: 7,
    padding: "5px 9px",
    fontFamily: C.mono,
    fontSize: 12,
    cursor: enabled ? "pointer" : "default",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minWidth: 104,
    justifyContent: "center",
  };
}

/* ── Timeline compacto por línea (desktop) ── */
const TL_PX_DIA = 4.6;
function TimelineLinea({ lista, eventosLinea, withFechas, fechaHito, getEstado, esGestion, onHito }) {
  // Rango temporal del grupo: de la fecha más vieja (o hoy) - 7d a la más nueva + 14d.
  // Primero armo las filas, después saco min/max de todas las fechas juntas
  // (sin mutar variables durante el render).
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const rows = lista.map((f) => {
    const fechas = withFechas(f);
    const hitos = eventosLinea.map((ev) => {
      const { fecha } = fechaHito(f, fechas, ev);
      const st = getEstado(f.id, ev.key);
      const fReal = st?.estado === "hecho" ? parseISO(st.fecha_real) : null;
      return { ev, fecha: fReal || fecha, estado: st?.estado && ESTADOS_HITO[st.estado] ? st.estado : null };
    }).filter((h) => h.fecha);
    return { f, fechas, hitos };
  });
  const tiempos = rows.flatMap(({ fechas, hitos }) => [
    ...hitos.map((h) => h.fecha.getTime()),
    ...(fechas.desmRef ? [fechas.desmRef.getTime()] : []),
    ...(fechas.botRef ? [fechas.botRef.getTime()] : []),
  ]);
  const min = Math.min(hoy.getTime(), ...tiempos) - 7 * MS_DIA;
  const max = Math.max(hoy.getTime(), ...tiempos) + 14 * MS_DIA;
  const totalDias = Math.max(30, Math.round((max - min) / MS_DIA));
  const width = totalDias * TL_PX_DIA;
  const xDe = (date) => ((date.getTime() - min) / MS_DIA) * TL_PX_DIA;

  // Cabecera de meses.
  const meses = [];
  {
    const d = new Date(min);
    d.setDate(1);
    while (d.getTime() <= max) {
      const inicio = Math.max(d.getTime(), min);
      const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const fin = Math.min(sig.getTime(), max);
      meses.push({ label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, x: ((inicio - min) / MS_DIA) * TL_PX_DIA, w: ((fin - inicio) / MS_DIA) * TL_PX_DIA });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const xHoy = xDe(hoy);
  const LBL_W = 86;

  return (
    <div style={{ border: `1px solid ${C.b1}`, borderRadius: 14, background: C.bg, overflowX: "auto" }}>
      <div style={{ width: LBL_W + width, minWidth: "100%" }}>
        {/* Meses */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.b1}`, background: C.s1 }}>
          <div style={{ width: LBL_W, flexShrink: 0, position: "sticky", left: 0, background: C.s1, zIndex: 2, borderRight: `1px solid ${C.b0}` }} />
          <div style={{ position: "relative", height: 26, width }}>
            {meses.map((m) => (
              <div key={m.label + m.x} style={{ position: "absolute", left: m.x, width: m.w, top: 0, bottom: 0, borderLeft: `1px solid ${C.b0}`, display: "flex", alignItems: "center", paddingLeft: 6, fontSize: 10, fontWeight: 850, color: C.t2, textTransform: "uppercase", letterSpacing: 0.6, overflow: "hidden", whiteSpace: "nowrap" }}>
                {m.w > 34 ? m.label : ""}
              </div>
            ))}
          </div>
        </div>
        {/* Filas por barco */}
        {rows.map(({ f, fechas, hitos }) => (
          <div key={f.id} style={{ display: "flex", borderBottom: `1px solid ${C.b0}` }}>
            <div style={{ width: LBL_W, flexShrink: 0, position: "sticky", left: 0, background: C.bg, zIndex: 2, borderRight: `1px solid ${C.b0}`, padding: "0 10px", display: "flex", alignItems: "center", fontFamily: C.mono, fontWeight: 850, fontSize: 12.5, color: C.t0, minHeight: 40 }}>
              {f.codigo}
            </div>
            <div style={{ position: "relative", width, minHeight: 40 }}>
              {/* Línea de hoy */}
              <div style={{ position: "absolute", left: xHoy, top: 0, bottom: 0, width: 1.5, background: "rgba(239,68,68,0.55)" }} />
              {/* Tramo desmolde → botada */}
              {fechas.desmRef && fechas.botRef && (
                <div style={{ position: "absolute", left: xDe(fechas.desmRef), width: Math.max(2, xDe(fechas.botRef) - xDe(fechas.desmRef)), top: "50%", height: 3, transform: "translateY(-50%)", background: `${f.color}55`, borderRadius: 2 }} />
              )}
              {/* Marcadores desmolde / botada */}
              {fechas.desmRef && (
                <div title={`Desmolde ${fechas.real ? "real" : "estimado"}: ${fmtFecha(fechas.desmRef)}`} style={{ position: "absolute", left: xDe(fechas.desmRef) - 4, top: "50%", transform: "translateY(-50%) rotate(45deg)", width: 8, height: 8, background: fechas.real ? C.green : C.blue, borderRadius: 1.5 }} />
              )}
              {fechas.botRef && (
                <div title={`Botada (${fechas.botSource === "real" ? "real" : fechas.botSource === "manual" ? "manual" : "por regla"}): ${fmtFecha(fechas.botRef)}`} style={{ position: "absolute", left: xDe(fechas.botRef) - 4, top: "50%", transform: "translateY(-50%) rotate(45deg)", width: 8, height: 8, background: fechas.botSource === "real" ? C.green : C.violet, borderRadius: 1.5 }} />
              )}
              {/* Puntos de hitos */}
              {hitos.map(({ ev, fecha, estado }) => {
                const dias = diasHasta(fecha);
                const col = estado ? ESTADOS_HITO[estado].color : colorPorDias(dias).fg;
                return (
                  <button
                    key={ev.key}
                    type="button"
                    className="fv-dot"
                    onClick={(e) => onHito(e, f, fechas, ev)}
                    title={`${ev.label} · ${fmtFecha(fecha)} · ${estado ? ESTADOS_HITO[estado].label : diasTexto(dias)}`}
                    style={{
                      position: "absolute",
                      left: xDe(fecha) - 5,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: `2px solid ${C.bg}`,
                      background: col,
                      cursor: esGestion ? "pointer" : "default",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Cards para mobile: fechas principales + hitos en lista ── */
function ObrasCardsMobile({ lista, eventosLinea, withFechas, fechaHito, getEstado, esGestion, onHito, onFechaSensible, setFechaObra, setAtrasoObra, dateInput, inputStyle }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {lista.map((f) => {
        const fechas = withFechas(f);
        return (
          <div key={f.id} style={{ border: `1px solid ${C.b1}`, borderRadius: 14, background: C.bg, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: C.s0, borderBottom: `1px solid ${C.b0}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.color }} />
              <span style={{ fontFamily: C.mono, fontWeight: 900, fontSize: 14, color: C.t0 }}>{f.codigo}</span>
              {fechas.atrasoDias > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.blue, fontWeight: 850 }}>atraso +{fechas.atrasoDias}d</span>
              )}
            </div>
            <div style={{ padding: 11, display: "grid", gap: 9 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div>
                  <div style={mLbl}>Desmolde est.</div>
                  {esGestion
                    ? <input className="fv-date-input" type="date" value={iso(fechas.est)} onChange={(e) => setFechaObra(f.id, "desmolde_estimado", e.target.value)} style={{ ...dateInput, width: "100%" }} />
                    : <span style={{ fontFamily: C.mono, color: fechas.est ? C.t1 : C.t3 }}>{fmtFecha(parseISO(fechas.est))}</span>}
                </div>
                <div>
                  <div style={mLbl}>Desmolde real</div>
                  <FechaSensibleCell valor={fechas.real} color={C.green} esGestion={esGestion} placeholder="cargar" onOpen={() => onFechaSensible(f, "desmolde_real", "Desmolde real", fechas.real)} />
                </div>
                <div>
                  <div style={mLbl}>Botada</div>
                  <BotadaCell
                    fechas={fechas}
                    esGestion={esGestion}
                    onOpenReal={() => onFechaSensible(f, "botada_real", "Botada real", fechas.botadaReal)}
                    onOpenEst={() => onFechaSensible(f, "botada", "Botada estimada", fechas.botada)}
                  />
                </div>
                <div>
                  <div style={mLbl}>Atraso</div>
                  {esGestion ? (
                    <select value={String(fechas.atrasoDias)} onChange={(e) => setAtrasoObra(f.id, e.target.value)} style={{ ...inputStyle, width: "100%", padding: "6px 8px", color: fechas.atrasoDias > 0 ? C.blue : C.t2 }}>
                      <option value="0">Sin atraso</option>
                      <option value="7">+1 sem</option>
                      <option value="14">+2 sem</option>
                      <option value="21">+3 sem</option>
                      <option value="28">+4 sem</option>
                    </select>
                  ) : (
                    <span style={{ color: fechas.atrasoDias > 0 ? C.blue : C.t3 }}>{fechas.atrasoDias > 0 ? `+${fechas.atrasoDias}d` : "-"}</span>
                  )}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 8, display: "grid", gap: 4 }}>
                {eventosLinea.map((ev) => {
                  const { fecha, motivo } = fechaHito(f, fechas, ev);
                  const st = getEstado(f.id, ev.key);
                  const estado = st?.estado && ESTADOS_HITO[st.estado] ? st.estado : null;
                  const meta = estado ? ESTADOS_HITO[estado] : null;
                  const fReal = estado === "hecho" ? parseISO(st.fecha_real) : null;
                  const dias = diasHasta(fReal || fecha);
                  const col = colorPorDias(dias);
                  return (
                    <button
                      key={ev.key}
                      type="button"
                      onClick={(e) => onHito(e, f, fechas, ev)}
                      disabled={!esGestion}
                      style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "5px 2px", cursor: esGestion ? "pointer" : "default", textAlign: "left", fontFamily: C.sans, minHeight: 30 }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 750, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.label}</span>
                      {estado === "hecho" ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.green, fontFamily: C.mono, fontSize: 12, fontWeight: 850 }}>
                          <Check size={12} strokeWidth={3} /> {fReal ? fmtFecha(fReal) : "Hecho"}
                        </span>
                      ) : !fecha ? (
                        <span style={{ color: C.t3, fontSize: 10.5 }}>{motivo === "sin regla" ? "sin regla" : "—"}</span>
                      ) : (
                        <>
                          <span style={{ fontFamily: C.mono, fontSize: 12, color: meta ? meta.color : col.fg, fontWeight: 800 }}>{fmtFecha(fecha)}</span>
                          <span style={{ fontSize: 10, fontWeight: 850, color: meta ? meta.color : col.fg, background: meta ? meta.bg : col.bg, border: `1px solid ${meta ? meta.border : "transparent"}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
                            {meta ? meta.label : diasTexto(dias)}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const mLbl = { fontSize: 9.5, color: C.t3, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 };

/* ── Popover de gestión de un hito ── */
function HitoMenuPopover({ menu, estado, onSet, onClose }) {
  const actual = estado?.estado && ESTADOS_HITO[estado.estado] ? estado.estado : null;
  const [fechaReal, setFechaReal] = useState(estado?.fecha_real ? iso(estado.fecha_real) : hoyIso());
  const col = colorPorDias(menu.dias);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 6000 }} />
      <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 6001, width: 270, border: `1px solid ${C.b1}`, background: C.panelSolid || C.bg, borderRadius: 13, boxShadow: "0 18px 50px rgba(0,0,0,0.35)", overflow: "hidden", fontFamily: C.sans }}>
        <div style={{ padding: "10px 13px", borderBottom: `1px solid ${C.b0}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: C.t0 }}>{menu.evLabel}</div>
          <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontFamily: C.mono, fontWeight: 850 }}>{menu.codigo}</span>
            {menu.fecha ? (
              <>
                <span>· {fmtFecha(menu.fecha)}</span>
                <span style={{ color: col.fg, fontWeight: 850 }}>{diasTexto(menu.dias)}</span>
              </>
            ) : (
              <span>· sin fecha proyectada</span>
            )}
          </div>
          {menu.atrasoDias > 0 && (
            <div style={{ fontSize: 10.5, color: C.blue, marginTop: 3 }}>Incluye atraso de +{menu.atrasoDias}d (la fecha original se conserva).</div>
          )}
        </div>
        <div style={{ padding: 10, display: "grid", gap: 6 }}>
          {[
            [null, "Pendiente", C.t2, "transparent", C.b1],
            ["pedido", "Pedido", ESTADOS_HITO.pedido.color, ESTADOS_HITO.pedido.bg, ESTADOS_HITO.pedido.border],
            ["en_curso", "En curso", ESTADOS_HITO.en_curso.color, ESTADOS_HITO.en_curso.bg, ESTADOS_HITO.en_curso.border],
            ["hecho", "Hecho", ESTADOS_HITO.hecho.color, ESTADOS_HITO.hecho.bg, ESTADOS_HITO.hecho.border],
          ].map(([key, label, color, bg, border]) => {
            const activo = actual === key;
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() => (key === "hecho" ? onSet("hecho", fechaReal) : onSet(key))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  border: `1px solid ${activo ? border : C.b0}`,
                  background: activo ? bg : "transparent",
                  color: activo ? color : C.t1,
                  borderRadius: 9, padding: "8px 11px", cursor: "pointer",
                  fontSize: 12.5, fontWeight: activo ? 900 : 700, fontFamily: C.sans, textAlign: "left",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: key ? color : C.t3, flexShrink: 0 }} />
                {label}
                {activo && <Check size={13} style={{ marginLeft: "auto" }} />}
              </button>
            );
          })}
          <div style={{ display: "grid", gap: 4, marginTop: 2, paddingTop: 8, borderTop: `1px solid ${C.b0}` }}>
            <span style={{ fontSize: 9.5, color: C.t3, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Fecha real (al marcar hecho)</span>
            <input
              type="date"
              className="fv-date-input"
              value={fechaReal}
              onChange={(e) => setFechaReal(e.target.value)}
              style={{ border: `1px solid ${C.b1}`, background: C.bg, color: C.t0, borderRadius: 8, padding: "7px 9px", fontFamily: C.mono, fontSize: 12, colorScheme: "var(--input-color-scheme, dark)" }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Modal de edición de fecha sensible: motivo + confirmación + auditoría ── */
function EditarFechaModal({ data, onSave, onClose }) {
  const { obraId, codigo, field, label, actual } = data;
  const [nueva, setNueva] = useState(iso(actual));
  const [motivo, setMotivo] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [saving, setSaving] = useState(false);

  const esReal = field === "desmolde_real" || field === "botada_real";
  const habiaFecha = !!actual;
  // Cambiar o borrar una fecha REAL ya cargada exige confirmación fuerte.
  const requiereConfirm = esReal && habiaFecha;
  const dActual = parseISO(actual);
  const dNueva = parseISO(nueva);
  const deltaDias = dActual && dNueva ? Math.round((dNueva - dActual) / MS_DIA) : null;
  const sinCambio = iso(actual) === iso(nueva);
  const puedeGuardar = !sinCambio && (!requiereConfirm || confirmo) && (!esReal || motivo.trim() || !habiaFecha);

  async function guardar() {
    if (!puedeGuardar || saving) return;
    setSaving(true);
    await onSave({ obraId, field, nueva: nueva || null, motivo: motivo.trim() });
    setSaving(false);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.58)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onMouseDown={onClose}>
      <div style={{ width: "min(480px, 100%)", borderRadius: 16, border: `1px solid ${C.b1}`, background: C.panelSolid || C.bg, boxShadow: "0 24px 70px rgba(0,0,0,0.35)", overflow: "hidden", fontFamily: C.sans }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900, color: C.t0 }}>{label} · {codigo}</div>
            <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>
              {esReal ? "Hito real: el cambio queda auditado con motivo." : "El cambio queda registrado en el historial."}
            </div>
          </div>
          <button type="button" onClick={onClose} style={softBtn()}>Cerrar</button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={mLbl}>Fecha actual</div>
              <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 850, color: habiaFecha ? C.t0 : C.t3 }}>{fmtFecha(dActual)}</div>
            </div>
            <label style={{ display: "grid", gap: 3 }}>
              <span style={mLbl}>Fecha nueva</span>
              <input
                type="date"
                className="fv-date-input"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                style={{ border: `1px solid ${C.b1}`, background: C.bg, color: C.t0, borderRadius: 8, padding: "8px 10px", fontFamily: C.mono, fontSize: 13, colorScheme: "var(--input-color-scheme, dark)" }}
              />
            </label>
          </div>

          {deltaDias !== null && deltaDias !== 0 && (
            <div style={{ fontSize: 12, color: deltaDias > 0 ? C.amber : C.blue, fontWeight: 750 }}>
              Impacto: {deltaDias > 0 ? `+${deltaDias}` : deltaDias} días{field.startsWith("desmolde") ? " — corre todos los hitos que dependen del desmolde." : field.startsWith("botada") ? " — corre los hitos que dependen de la botada." : ""}
            </div>
          )}
          {habiaFecha && !nueva && (
            <div style={{ fontSize: 12, color: C.red, fontWeight: 800 }}>Vas a BORRAR esta fecha.</div>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span style={mLbl}>Motivo {esReal && habiaFecha ? "(obligatorio)" : "(opcional)"}</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: se desmoldó antes, corrección de carga, reprogramado por vacaciones..."
              style={{ resize: "vertical", border: `1px solid ${C.b1}`, background: C.bg, color: C.t0, borderRadius: 9, padding: "9px 10px", fontFamily: C.sans, fontSize: 12.5, lineHeight: 1.4 }}
            />
          </label>

          {requiereConfirm && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, border: `1px solid rgba(239,68,68,0.35)`, background: "rgba(239,68,68,0.07)", borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
              <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: C.t1, lineHeight: 1.4 }}>
                Entiendo que estoy modificando un <b>hito real ya ocurrido</b> y que afecta los cálculos de toda la obra.
              </span>
            </label>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.b0}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={softBtn()}>Cancelar</button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar || saving}
            style={{ ...greenBtn(), opacity: puedeGuardar && !saving ? 1 : 0.5, cursor: puedeGuardar && !saving ? "pointer" : "not-allowed" }}
          >
            {saving ? "Guardando..." : "Guardar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}

const smallNumberInput = {
  width: 58,
  textAlign: "center",
  padding: "6px 5px",
  borderRadius: 7,
  border: `1px solid ${C.b1}`,
  background: C.bg,
  color: C.t0,
  fontFamily: C.mono,
  fontSize: 12.5,
};

const iconDangerBtn = {
  border: "none",
  background: "rgba(239,68,68,0.10)",
  color: C.red,
  cursor: "pointer",
  width: 19,
  height: 19,
  borderRadius: 6,
  lineHeight: "17px",
  fontSize: 12,
  fontWeight: 900,
};

function softBtn() {
  return {
    padding: "8px 12px",
    borderRadius: 9,
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 750,
    fontFamily: C.sans,
    border: `1px solid ${C.b1}`,
    background: C.s1,
    color: C.t1,
  };
}

function greenBtn() {
  return {
    ...softBtn(),
    border: "1px solid rgba(16,185,129,0.35)",
    background: "rgba(16,185,129,0.11)",
    color: C.green,
  };
}

function blueBtn(active) {
  return {
    ...softBtn(),
    border: `1px solid ${active ? C.blue : C.b1}`,
    background: active ? "rgba(59,130,246,0.12)" : C.s1,
    color: active ? C.blue : C.t1,
  };
}

function pill() {
  return {
    fontSize: 11,
    color: C.t2,
    fontWeight: 800,
    background: C.s1,
    border: `1px solid ${C.b0}`,
    borderRadius: 999,
    padding: "3px 9px",
  };
}

function Legend({ color, text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      {text}
    </span>
  );
}

function NuevoEventoModal({ tokens, onClose, onSave }) {
  const [form, setForm] = useState({
    label: "",
    short: "",
    scope: "*",
    referencia: "desmolde",
    semanas: "-4",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.58)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onMouseDown={onClose}>
      <div style={{ width: "min(560px, 100%)", borderRadius: 16, border: `1px solid ${C.b1}`, background: C.panelSolid || C.bg, boxShadow: "0 24px 70px rgba(0,0,0,0.35)", overflow: "hidden" }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.t0 }}>Nuevo ítem de fechas</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>Puede ser global o sólo para una línea de producción.</div>
          </div>
          <button type="button" onClick={onClose} style={softBtn()}>Cerrar</button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <label style={fieldLabel}>
            Nombre
            <input autoFocus value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Ej: Tapicería, aire acondicionado..." style={modalInput} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={fieldLabel}>
              Nombre corto
              <input value={form.short} onChange={(e) => set("short", e.target.value)} placeholder="Opcional" style={modalInput} />
            </label>
            <label style={fieldLabel}>
              Alcance
              <select value={form.scope} onChange={(e) => set("scope", e.target.value)} style={modalInput}>
                <option value="*">Todas las líneas</option>
                {tokens.map((t) => <option key={t} value={t}>Sólo línea {t}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={fieldLabel}>
              Referencia
              <select value={form.referencia} onChange={(e) => set("referencia", e.target.value)} style={modalInput}>
                <option value="desmolde">Desde desmolde</option>
                <option value="botada">Desde botada</option>
              </select>
            </label>
            <label style={fieldLabel}>
              Semanas
              <input type="number" step="0.5" value={form.semanas} onChange={(e) => set("semanas", e.target.value)} style={modalInput} />
            </label>
          </div>
          <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.45, border: `1px solid ${C.b0}`, background: C.s1, borderRadius: 10, padding: 10 }}>
            Ejemplo: si se pide 6 semanas antes de botada, elegí referencia "Desde botada" y semanas "-6".
          </div>
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${C.b0}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={softBtn()}>Cancelar</button>
          <button type="button" onClick={() => onSave(form)} disabled={!form.label.trim()} style={{ ...greenBtn(), opacity: form.label.trim() ? 1 : 0.55, cursor: form.label.trim() ? "pointer" : "not-allowed" }}>Crear ítem</button>
        </div>
      </div>
    </div>
  );
}

const fieldLabel = {
  display: "grid",
  gap: 5,
  fontSize: 11,
  color: C.t2,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  fontWeight: 850,
};

const modalInput = {
  border: `1px solid ${C.b1}`,
  background: C.bg,
  color: C.t0,
  borderRadius: 9,
  padding: "10px 11px",
  fontFamily: C.sans,
  fontSize: 13,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 650,
};
