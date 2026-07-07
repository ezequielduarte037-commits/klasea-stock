import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

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
const BOTADA_EVENT_KEY = "__botada__";
const DEFAULT_BOTADA_SEMANAS = 12;
const MS_DIA = 86400000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const iso = (s) => (s ? String(s).slice(0, 10) : "");

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
  const [pedidos, setPedidos] = useState([]);
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

  const pedidosMap = useMemo(() => {
    const map = {};
    pedidos.forEach((p) => { map[`${p.obra_id}|${p.evento_key}`] = p; });
    return map;
  }, [pedidos]);

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

  async function cargarPedidos() {
    const { data, error } = await supabase
      .from("fechas_evento_estados")
      .select("obra_id,evento_key,estado,pedido_at,pedido_por,nota");
    if (error) return;
    setPedidos(data ?? []);
  }

  useEffect(() => {
    cargarOffsets();
    cargarEventos();
    cargarPedidos();
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
        cargarPedidos();
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

  const withFechas = useCallback((f) => {
    const ov = desmoldes[f.id] || {};
    const est = "desmolde_estimado" in ov ? ov.desmolde_estimado : f.desmolde_estimado;
    const real = "desmolde_real" in ov ? ov.desmolde_real : f.desmolde_real;
    const botada = "botada" in ov ? ov.botada : f.botada;
    const atrasoDias = Number("atraso_dias" in ov ? ov.atraso_dias : f.atraso_dias) || 0;
    const atrasoMotivo = "atraso_motivo" in ov ? ov.atraso_motivo : f.atraso_motivo;
    const efectivo = real || est || null;
    const desmBase = parseISO(efectivo);
    const botManual = parseISO(botada);
    return {
      est,
      real,
      botada: botada || null,
      efectivo,
      atrasoDias,
      atrasoMotivo,
      desmBase,
      desmRef: addDias(desmBase, atrasoDias),
      botManual,
      botRef: botManual ? addDias(botManual, atrasoDias) : null,
    };
  }, [desmoldes]);

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

  function pedidoKey(obraId, eventoKey) {
    return `${obraId}|${eventoKey}`;
  }

  function getPedido(obraId, eventoKey) {
    return pedidosMap[pedidoKey(obraId, eventoKey)] || null;
  }

  async function togglePedido(obraId, eventoKey) {
    const key = pedidoKey(obraId, eventoKey);
    const actual = pedidosMap[key];
    savingRef.current = true;
    try {
      if (actual) {
        await supabase.from("fechas_evento_estados").delete().eq("obra_id", obraId).eq("evento_key", eventoKey);
        setPedidos((prev) => prev.filter((p) => !(p.obra_id === obraId && p.evento_key === eventoKey)));
      } else {
        const row = {
          obra_id: obraId,
          evento_key: eventoKey,
          estado: "pedido",
          pedido_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("fechas_evento_estados").upsert(row, { onConflict: "obra_id,evento_key" });
        if (error) {
          setErr("No se pudo marcar como pedido: " + error.message);
          return;
        }
        setPedidos((prev) => [...prev.filter((p) => !(p.obra_id === obraId && p.evento_key === eventoKey)), row]);
      }
    } finally {
      setTimeout(() => { savingRef.current = false; }, 400);
    }
  }

  async function setFechaObra(obraId, field, value) {
    const val = value || null;
    const prev = currentField(obraId, field);
    if (field === "desmolde_real" && prev && val !== prev) {
      const accion = val ? "cambiar" : "borrar";
      const ok = window.confirm(`Vas a ${accion} el desmolde real. Esta fecha ya representa un hito ocurrido y afecta todos los cálculos. ¿Confirmás el cambio?`);
      if (!ok) return;
    }

    const patch = { [field]: val };
    await updateObra(obraId, patch);
  }

  async function setAtrasoObra(obraId, dias) {
    const atraso = Number(dias || 0);
    await updateObra(obraId, {
      atraso_dias: atraso,
      atraso_motivo: atraso > 0 ? "vacaciones" : null,
      atraso_updated_at: new Date().toISOString(),
    });
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

  const agenda = useMemo(() => {
    const rows = [];
    filas.forEach((f) => {
      const fechas = withFechas(f);
      eventos.filter((ev) => scopeAplica(ev, f.token)).forEach((ev) => {
        if (pedidosMap[pedidoKey(f.id, ev.key)]) return;
        const off = getOffset(ev.key, f.token);
        if (!off) return;
        const ref = off.referencia === "botada" ? fechas.botRef : fechas.desmRef;
        if (!ref) return;
        const fecha = addSemanas(ref, off.semanas);
        const dias = diasHasta(fecha);
        if (dias === null || dias < -3 || dias > 45) return;
        rows.push({ id: `${f.id}-${ev.key}`, codigo: f.codigo, token: f.token, evento: ev.label, fecha, dias, color: f.color });
      });
    });
    return rows.sort((a, b) => a.dias - b.dias).slice(0, 8);
  }, [filas, eventos, getOffset, pedidosMap, withFechas]);

  const th = {
    padding: "9px 10px",
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
    padding: "7px 10px",
    fontSize: 12.5,
    color: C.t1,
    borderBottom: `1px solid ${C.b0}`,
    whiteSpace: "nowrap",
    fontFamily: C.mono,
  };
  const dateInput = {
    width: 126,
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
      `}</style>

      <div style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 14, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.t0, letterSpacing: -0.3 }}>Fechas de producción</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 3, maxWidth: 760, lineHeight: 1.35 }}>
              Cronograma por barco. Los vencidos quedan marcados hasta que se actualice la fecha.
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

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px,1fr) 160px 170px", gap: 8, marginTop: 10 }}>
          <input
            style={inputStyle}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar barco..."
          />
          <select style={inputStyle} value={lineaFiltro} onChange={(e) => setLineaFiltro(e.target.value)}>
            <option value="todas">Todas las líneas</option>
            {tokens.map((t) => <option key={t} value={t}>Línea {t}</option>)}
          </select>
          <select style={inputStyle} value={editor ? "tiempos" : "cronograma"} onChange={(e) => setEditor(e.target.value === "tiempos")}>
            <option value="cronograma">Cronograma</option>
            {esGestion && <option value="tiempos">Tiempos por línea</option>}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.b0}`, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto", color: C.t2, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", fontWeight: 850 }}>
            Agenda próxima
            <span style={{ color: C.t0, fontFamily: C.mono }}>{agenda.length}</span>
          </div>
          {agenda.length === 0 ? (
            <div style={{ fontSize: 12, color: C.t3 }}>Sin vencimientos próximos para estos filtros.</div>
          ) : (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", minWidth: 0, paddingBottom: 1 }}>
              {agenda.map((a) => {
                const col = colorPorDias(a.dias);
                return (
                  <div key={a.id} style={{
                    flex: "0 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    border: `1px solid ${C.b0}`,
                    background: C.bg,
                    borderRadius: 999,
                    padding: "4px 8px",
                    fontSize: 11.5,
                    lineHeight: 1,
                  }}>
                    <span style={{ color: a.color, fontWeight: 900, fontFamily: C.mono }}>{a.codigo}</span>
                    <span style={{ color: C.t1, fontWeight: 750 }}>{a.evento}</span>
                    <span style={{ color: col.fg, fontWeight: 900 }}>{a.dias < 0 ? `hace ${-a.dias}d` : a.dias === 0 ? "hoy" : `en ${a.dias}d`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {err && (
        <div style={{ padding: "8px 12px", borderRadius: 9, background: "rgba(239,68,68,0.12)", border: `1px solid ${C.red}`, color: C.red, fontSize: 12.5, marginBottom: 12 }}>
          {err}
        </div>
      )}

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
              <div style={{ fontSize: 12.5, color: C.t0, fontWeight: 850 }}>Botada estimada</div>
              <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>Si el barco no tiene botada cargada, se calcula desde el desmolde con estas semanas.</div>
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

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 11.5, color: C.t2 }}>
        <Legend color={C.red} text="Ya / menos de 14 días" />
        <Legend color={C.amber} text="Pronto" />
        <Legend color={C.green} text="Con tiempo" />
        <Legend color={C.blue} text="Atraso aplicado" />
        <Legend color={C.t3} text="Ya pasó" />
      </div>

      {filas.length === 0 && (
        <div style={{ padding: 30, color: C.t2 }}>No hay barcos en producción cargados.</div>
      )}

      {grupos.map(([token, lista]) => {
        const eventosLinea = eventos.filter((ev) => scopeAplica(ev, token));
        return (
          <div key={token} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
              padding: "10px 12px",
              borderRadius: 12,
              background: `linear-gradient(90deg, ${lista[0]?.color || C.t2}20, ${C.s0})`,
              border: `1px solid ${C.b0}`,
              borderLeft: `3px solid ${lista[0]?.color || C.t2}`,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: lista[0]?.color || C.t2, boxShadow: `0 0 10px ${lista[0]?.color || C.t2}` }} />
              <span style={{ fontSize: 15, fontWeight: 900, color: C.t0 }}>Línea {token}</span>
              <span style={pill()}>{lista.length} barco{lista.length !== 1 ? "s" : ""}</span>
              <span style={pill()}>{eventosLinea.length} ítem{eventosLinea.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ overflowX: "auto", border: `1px solid ${C.b1}`, borderRadius: 14, background: C.bg }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, left: 0, zIndex: 2, minWidth: 82 }}>Barco</th>
                    <th style={th}>Desmolde est.</th>
                    <th style={th}>Desmolde real</th>
                    <th style={th}>Botada est.</th>
                    <th style={th}>Atraso</th>
                    {eventosLinea.map((ev) => (
                      <th
                        key={ev.key}
                        draggable
                        onDragStart={() => setDragKey(ev.key)}
                        onDragEnd={() => setDragKey(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); moveCol(dragKey, ev.key); setDragKey(null); }}
                        title={`${ev.label} · ${eventoScopeLabel(ev)}`}
                        style={{
                          ...th,
                          textAlign: "center",
                          cursor: "grab",
                          userSelect: "none",
                          opacity: dragKey === ev.key ? 0.4 : 1,
                          background: dragKey && dragKey !== ev.key ? "rgba(34,211,238,0.10)" : th.background,
                        }}
                      >
                        <span style={{ color: C.t3, marginRight: 4, fontSize: 9 }}>::</span>
                        {isMobile ? ev.short : ev.label}
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
                        <td style={{ ...td, fontWeight: 850, color: C.t0, position: "sticky", left: 0, background: C.bg }}>{f.codigo}</td>
                        <td style={td}>
                          {esGestion ? (
                            <input className="fv-date-input" type="date" value={iso(fechas.est)} onChange={(e) => setFechaObra(f.id, "desmolde_estimado", e.target.value)} style={dateInput} />
                          ) : (
                            <span style={{ color: fechas.est ? C.t1 : C.t3 }}>{fmtFecha(parseISO(fechas.est))}</span>
                          )}
                        </td>
                        <td style={td}>
                          {esGestion ? (
                            <input className="fv-date-input" type="date" value={iso(fechas.real)} onChange={(e) => setFechaObra(f.id, "desmolde_real", e.target.value)} style={{ ...dateInput, borderColor: fechas.real ? "rgba(16,185,129,0.45)" : C.b1 }} />
                          ) : (
                            <span style={{ color: fechas.real ? C.green : C.t3 }}>{fmtFecha(parseISO(fechas.real))}</span>
                          )}
                        </td>
                        <td style={td}>
                          {esGestion ? (
                            <input className="fv-date-input" type="date" value={iso(fechas.botada)} onChange={(e) => setFechaObra(f.id, "botada", e.target.value)} style={{ ...dateInput, borderColor: fechas.botManual ? "rgba(59,130,246,0.45)" : C.b1 }} />
                          ) : (
                            <span style={{ color: fechas.botManual ? C.blue : C.t3 }}>{fmtFecha(fechas.botManual)}</span>
                          )}
                        </td>
                        <td style={td}>
                          {esGestion ? (
                            <select value={String(fechas.atrasoDias)} onChange={(e) => setAtrasoObra(f.id, e.target.value)} style={{ ...inputStyle, padding: "5px 7px", minWidth: 112, color: fechas.atrasoDias > 0 ? C.blue : C.t2, fontFamily: C.sans }}>
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
                        {eventosLinea.map((ev) => {
                          const off = getOffset(ev.key, f.token);
                          const ref = off && (off.referencia === "botada" ? fechas.botRef : fechas.desmRef);
                          if (!off || !ref) {
                            return <td key={ev.key} style={{ ...td, textAlign: "center", color: C.t3 }}>-</td>;
                          }
                          const fecha = addSemanas(ref, off.semanas);
                          const dias = diasHasta(fecha);
                          const col = colorPorDias(dias);
                          const diasTxt = dias === null ? "" : dias < 0 ? `hace ${-dias}d` : dias === 0 ? "hoy" : `en ${dias}d`;
                          const pedido = getPedido(f.id, ev.key);
                          return (
                            <td key={ev.key} style={{ ...td, textAlign: "center", background: pedido ? "rgba(16,185,129,0.12)" : col.bg, padding: "5px 8px" }} title={`${ev.label}: ${off.semanas > 0 ? "+" : ""}${off.semanas} sem desde ${off.referencia}${fechas.atrasoDias > 0 ? ` · atraso +${fechas.atrasoDias}d` : ""}`}>
                              <div style={{ color: pedido ? C.green : col.fg, fontWeight: dias !== null && dias >= 0 && dias < 30 ? 900 : 650 }}>{fmtFecha(fecha)}</div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 2 }}>
                                {diasTxt && <span style={{ fontSize: 9.5, color: pedido ? C.green : col.fg, opacity: 0.85, fontFamily: C.sans, fontWeight: 800 }}>{diasTxt}</span>}
                                {esGestion && (
                                  <button
                                    type="button"
                                    onClick={() => togglePedido(f.id, ev.key)}
                                    title={pedido ? "Desmarcar pedido" : "Marcar como pedido"}
                                    style={{
                                      border: `1px solid ${pedido ? "rgba(16,185,129,0.35)" : C.b1}`,
                                      background: pedido ? "rgba(16,185,129,0.16)" : C.s1,
                                      color: pedido ? C.green : C.t2,
                                      borderRadius: 999,
                                      padding: "1px 6px",
                                      fontSize: 9.5,
                                      fontWeight: 850,
                                      fontFamily: C.sans,
                                      cursor: "pointer",
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {pedido ? "Pedido" : "Pedir"}
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

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
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}80` }} />
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.58)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onMouseDown={onClose}>
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
