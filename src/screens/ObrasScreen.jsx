import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ── UTILS ────────────────────────────────────────────────────────
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const fmtDate = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
const diasDesde = f => !f ? 0 : Math.max(0, Math.floor((Date.now() - new Date(f + "T00:00:00").getTime()) / 86400000));
const diasEntre = (a, b) => (!a || !b) ? null : Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const today = () => new Date().toISOString().slice(0, 10);

// ── TOKENS DE DISEÑO ─────────────────────────────────────────────
const C = {
  // Fondos y superficies — tinte azul profundo muy sutil
  bg:  "#03050c",
  s0:  "rgba(255,255,255,0.028)",   // surface base (glass)
  s1:  "rgba(255,255,255,0.048)",   // surface mid
  s2:  "rgba(255,255,255,0.072)",   // surface highlight
  // Bordes
  b0:  "rgba(255,255,255,0.08)",    // border normal
  b1:  "rgba(255,255,255,0.15)",    // border highlight
  b2:  "rgba(255,255,255,0.26)",    // border strong
  // Texto
  t0:  "#dde2ea",   // text primary
  t1:  "#566070",   // text dim
  t2:  "#2c3040",   // text muted
  // Estados de obra
  activa:    { dot: "#3dce6a", label: "Activa",    chip: ["rgba(61,206,106,0.1)",  "rgba(61,206,106,0.28)"] },
  pausada:   { dot: "#e0b040", label: "Pausada",   chip: ["rgba(224,176,64,0.1)",  "rgba(224,176,64,0.28)"] },
  terminada: { dot: "#4a5060", label: "Terminada", chip: ["rgba(74,80,96,0.15)",   "rgba(74,80,96,0.3)"]    },
  cancelada: { dot: "#e04848", label: "Cancelada", chip: ["rgba(224,72,72,0.1)",   "rgba(224,72,72,0.28)"]  },
  // Estados de proceso
  pendiente:  { bar: "rgba(255,255,255,0.018)", text: "#2e3440", glow: false },
  en_curso:   { bar: "rgba(200,150,20,0.22)",   text: "#e0b040", glow: true  },
  completado: { bar: "rgba(40,110,65,0.25)",    text: "#3dce6a", glow: false },
  demorado:   { bar: "rgba(200,50,50,0.28)",    text: "#e04848", glow: true  },
  // Tipo aviso
  aviso:        { color: "#6888b8", label: "Aviso"        },
  compra:       { color: "#c89040", label: "Compra"       },
  recordatorio: { color: "#606878", label: "Recordatorio" },
};

// ── DRAG-AND-DROP LIST ────────────────────────────────────────────
function DragList({ items, onReorder, renderItem }) {
  const drag = useRef(null);
  const [over, setOver] = useState(null);
  return (
    <div>
      {items.map((item, i) => (
        <div key={item.id ?? i} draggable
          onDragStart={() => { drag.current = i; }}
          onDragOver={e  => { e.preventDefault(); setOver(i); }}
          onDrop={e => {
            e.preventDefault();
            if (drag.current == null || drag.current === i) { setOver(null); return; }
            const next = [...items];
            const [m] = next.splice(drag.current, 1);
            next.splice(i, 0, m);
            drag.current = null; setOver(null);
            onReorder(next);
          }}
          onDragEnd={() => { drag.current = null; setOver(null); }}
          style={{
            opacity: drag.current === i ? 0.3 : 1,
            borderTop: over === i && drag.current !== i ? `2px solid ${C.b2}` : "2px solid transparent",
          }}>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

// ── TOGGLE ────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={onChange} style={{
      width: 32, height: 18, borderRadius: 99, flexShrink: 0,
      border: `1px solid ${on ? "rgba(61,206,106,0.4)" : "rgba(255,255,255,0.12)"}`,
      background: on ? "rgba(61,206,106,0.2)" : "rgba(255,255,255,0.04)",
      position: "relative", cursor: "pointer",
      transition: "background .2s, border-color .2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: on ? 15 : 3,
        width: 10, height: 10, borderRadius: "50%",
        background: on ? "#3dce6a" : "rgba(255,255,255,0.3)",
        transition: "left .2s, background .2s",
        boxShadow: on ? "0 0 6px rgba(61,206,106,0.5)" : "none",
      }} />
    </button>
  );
}

// ── CHIP ESTADO ───────────────────────────────────────────────────
function Chip({ estado }) {
  const m = C[estado] ?? C.activa;
  return (
    <span style={{
      fontSize: 8, letterSpacing: 2, textTransform: "uppercase", padding: "3px 9px",
      borderRadius: 99, background: m.chip[0], color: m.dot,
      border: `1px solid ${m.chip[1]}`,
      fontWeight: 600,
      boxShadow: `0 0 8px ${m.dot}22`,
    }}>
      {m.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function ObrasScreen({ profile, signOut }) {
  const role      = profile?.role ?? "invitado";
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  // ── Data ─────────────────────────────────────────────────────
  const [obras,      setObras]      = useState([]);
  const [timeline,   setTimeline]   = useState([]);   // obra_timeline con linea_procesos
  const [lineas,     setLineas]     = useState([]);
  const [lProcs,     setLProcs]     = useState([]);   // linea_procesos
  const [procGlobal, setProcGlobal] = useState([]);   // procesos (legado)
  const [avisos,     setAvisos]     = useState([]);
  const [config,     setConfig]     = useState({});
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [msg,        setMsg]        = useState("");

  // ── UI state ─────────────────────────────────────────────────
  const [view,         setView]         = useState("gantt");   // gantt | cards
  const [selId,        setSelId]        = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("activa");
  const [filtroLinea,  setFiltroLinea]  = useState("todas");
  const [showNueva,    setShowNueva]    = useState(false);
  const [showAvisos,   setShowAvisos]   = useState(false);
  const [showConfig,   setShowConfig]   = useState(false);
  const [cfgTab,       setCfgTab]       = useState("lineas");
  const [cfgLinea,     setCfgLinea]     = useState(null);

  const [formObra, setFormObra] = useState({
    codigo: "", descripcion: "", linea_id: "",
    fecha_inicio: today(), fecha_fin_estimada: "", notas: "",
  });
  const [formLinea, setFormLinea] = useState({ nombre: "", color: "#5a6870" });
  const [formProc,  setFormProc]  = useState({
    nombre: "", dias_estimados: "7", color: "#5a5a5a",
    genera_aviso: false, tipo_aviso: "aviso", aviso_mensaje: "",
  });

  function flash(ok, txt) {
    if (ok) setMsg(txt); else setErr(txt);
    setTimeout(() => { setMsg(""); setErr(""); }, 3500);
  }

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from("produccion_obras").select("*").order("created_at", { ascending: false }),
      // Carga timeline con join a linea_procesos Y procesos (legado)
      supabase.from("obra_timeline")
        .select("*, linea_procesos(id,nombre,orden,dias_estimados,color,genera_aviso,tipo_aviso,aviso_mensaje), procesos(id,nombre,orden,dias_esperados,color)")
        .order("created_at"),
      supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden"),
      supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden"),
      supabase.from("procesos").select("*").eq("activo", true).order("orden"),
      supabase.from("produccion_avisos").select("*").order("created_at", { ascending: false }).limit(60),
      supabase.from("sistema_config").select("*"),
    ]);
    setObras(r1.data ?? []);
    setTimeline(r2.data ?? []);
    setLineas(r3.data ?? []);
    setLProcs(r4.data ?? []);
    setProcGlobal(r5.data ?? []);
    setAvisos(r6.data ?? []);
    // Parse config
    const cfg = {};
    (r7.data ?? []).forEach(row => {
      try { cfg[row.clave] = row.tipo === "number" ? num(row.valor) : row.tipo === "boolean" ? row.valor === "true" : row.valor; }
      catch { cfg[row.clave] = row.valor; }
    });
    setConfig(cfg);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_timeline" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_avisos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── HELPERS DE DATOS ──────────────────────────────────────────
  // Procesos de la línea de una obra (según linea_id), ordenados
  const procsDeObra = useCallback((obra) => {
    if (obra?.linea_id) {
      return lProcs.filter(p => p.linea_id === obra.linea_id).sort((a, b) => a.orden - b.orden);
    }
    return procGlobal;  // fallback legacy
  }, [lProcs, procGlobal]);

  // Timeline entries de una obra
  const tlDeObra = useCallback((obraId) =>
    timeline.filter(t => t.obra_id === obraId), [timeline]);

  // Estado del proceso para una obra: match por linea_proceso_id o proceso_id
  const estadoProc = useCallback((obraId, proc, isLinea) => {
    const tl = tlDeObra(obraId);
    if (isLinea) return tl.find(t => t.linea_proceso_id === proc.id) ?? null;
    return tl.find(t => t.proceso_id === proc.id) ?? null;
  }, [tlDeObra]);

  // % completado de una obra
  const pctObra = useCallback((obra) => {
    const procs = procsDeObra(obra);
    if (!procs.length) return 0;
    const tl   = tlDeObra(obra.id);
    const isLinea = !!obra.linea_id;
    const done = procs.filter(p => {
      const t = isLinea ? tl.find(x => x.linea_proceso_id === p.id) : tl.find(x => x.proceso_id === p.id);
      return t?.estado === "completado";
    }).length;
    return Math.round((done / procs.length) * 100);
  }, [procsDeObra, tlDeObra]);

  // Días totales estimados de la línea
  const diasEstimados = useCallback((obra) =>
    procsDeObra(obra).reduce((s, p) => s + num(p.dias_estimados ?? p.dias_esperados), 0),
    [procsDeObra]);

  // Colores de estado de proceso
  function procColor(t, proc) {
    if (!t || t.estado === "pendiente" || !t.estado) return C.pendiente;
    if (t.estado === "completado") return C.completado;
    if (t.estado === "en_curso") {
      const est = num(proc?.dias_estimados ?? proc?.dias_esperados ?? 999);
      const real = diasDesde(t.fecha_inicio);
      return real > est * 1.2 ? C.demorado : C.en_curso;
    }
    return C.pendiente;
  }

  // Promedios históricos por proceso (para alertas)
  const promedios = useMemo(() => {
    const map = {};
    timeline.forEach(t => {
      if (!t.fecha_inicio || !t.fecha_fin) return;
      const id  = t.linea_proceso_id ?? t.proceso_id;
      const dias = diasEntre(t.fecha_inicio, t.fecha_fin);
      if (!id || dias == null) return;
      if (!map[id]) map[id] = [];
      map[id].push(dias);
    });
    const result = {};
    Object.entries(map).forEach(([id, vals]) =>
      result[id] = vals.reduce((a, b) => a + b, 0) / vals.length);
    return result;
  }, [timeline]);

  // Avisos pendientes
  const avisosPend = useMemo(() => avisos.filter(a => a.estado === "pendiente"), [avisos]);

  // Obras filtradas
  const obrasFilt = useMemo(() => obras.filter(o => {
    if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
    if (filtroLinea !== "todas" && o.linea_id !== filtroLinea) return false;
    return true;
  }), [obras, filtroEstado, filtroLinea]);

  // Stats
  const stats = useMemo(() => ({
    activas:    obras.filter(o => o.estado === "activa").length,
    pausadas:   obras.filter(o => o.estado === "pausada").length,
    terminadas: obras.filter(o => o.estado === "terminada").length,
    avisos:     avisosPend.length,
  }), [obras, avisosPend]);

  const obraSel = useMemo(() => obras.find(o => o.id === selId), [obras, selId]);

  // ── ACCIONES ──────────────────────────────────────────────────
  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.codigo.trim()) return flash(false, "Código obligatorio.");
    const linea = lineas.find(l => l.id === formObra.linea_id);
    const { data: nueva, error } = await supabase.from("produccion_obras").insert({
      codigo:             formObra.codigo.trim().toUpperCase(),
      descripcion:        formObra.descripcion.trim() || null,
      tipo:               "barco",
      estado:             "activa",
      linea_id:           formObra.linea_id || null,
      linea_nombre:       linea?.nombre ?? null,
      fecha_inicio:       formObra.fecha_inicio || null,
      fecha_fin_estimada: formObra.fecha_fin_estimada || null,
      notas:              formObra.notas.trim() || null,
    }).select().single();
    if (error) return flash(false, error.message);

    // Sync a laminacion_obras
    await supabase.from("laminacion_obras").upsert({
      nombre: formObra.codigo.trim().toUpperCase(), estado: "activa",
      fecha_inicio: formObra.fecha_inicio || null,
    }, { onConflict: "nombre", ignoreDuplicates: true });

    // Crear timeline entries para cada proceso de la línea
    if (formObra.linea_id && nueva?.id) {
      const procs = lProcs.filter(p => p.linea_id === formObra.linea_id);
      if (procs.length) {
        await supabase.from("obra_timeline").insert(
          procs.map(p => ({ obra_id: nueva.id, linea_proceso_id: p.id, estado: "pendiente" }))
        );
      }
    }

    flash(true, `Obra ${formObra.codigo.toUpperCase()} creada.`);
    setFormObra({ codigo: "", descripcion: "", linea_id: "", fecha_inicio: today(), fecha_fin_estimada: "", notas: "" });
    setShowNueva(false);
    cargar();
  }

  async function cambiarEstado(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = today();
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    cargar();
  }

  async function iniciarProc(obraId, tlId, proc, isLinea) {
    // Si ya tiene un registro, actualizarlo; si no, insertar
    if (tlId) {
      await supabase.from("obra_timeline").update({
        estado: "en_curso", fecha_inicio: today(),
        registrado_por: profile?.username ?? "sistema",
      }).eq("id", tlId);
    } else {
      const row = { obra_id: obraId, estado: "en_curso", fecha_inicio: today(), registrado_por: profile?.username ?? "sistema" };
      if (isLinea) row.linea_proceso_id = proc.id; else row.proceso_id = proc.id;
      await supabase.from("obra_timeline").insert(row);
    }
    // Generar aviso si corresponde
    if (proc?.genera_aviso && proc?.aviso_mensaje) {
      const obra = obras.find(o => o.id === obraId);
      await supabase.from("produccion_avisos").insert({
        obra_id: obraId, obra_codigo: obra?.codigo ?? "—",
        proceso_nombre: proc.nombre, tipo: proc.tipo_aviso ?? "aviso",
        mensaje: proc.aviso_mensaje, estado: "pendiente",
      });
    }
    cargar();
  }

  async function completarProc(tlId) {
    await supabase.from("obra_timeline").update({
      estado: "completado", fecha_fin: today(),
    }).eq("id", tlId);
    cargar();
  }

  async function resolverAviso(id) {
    await supabase.from("produccion_avisos").update({
      estado: "resuelto", resuelto_at: new Date().toISOString(),
      resuelto_por: profile?.username ?? "sistema",
    }).eq("id", id);
    cargar();
  }

  // Config
  async function crearLinea(e) {
    e.preventDefault();
    if (!formLinea.nombre.trim()) return;
    const maxOrd = Math.max(0, ...lineas.map(l => l.orden ?? 0));
    const { error } = await supabase.from("lineas_produccion")
      .insert({ nombre: formLinea.nombre.trim().toUpperCase(), color: formLinea.color, orden: maxOrd + 1 });
    if (error) return flash(false, error.message);
    setFormLinea({ nombre: "", color: "#5a6870" });
    cargar(); flash(true, "Línea creada.");
  }

  async function crearProc(e) {
    e.preventDefault();
    if (!cfgLinea || !formProc.nombre.trim()) return;
    const maxOrd = Math.max(0, ...lProcs.filter(p => p.linea_id === cfgLinea).map(p => p.orden ?? 0));
    const { error } = await supabase.from("linea_procesos").insert({
      linea_id:      cfgLinea,
      nombre:        formProc.nombre.trim(),
      orden:         maxOrd + 1,
      dias_estimados: num(formProc.dias_estimados) || 7,
      color:         formProc.color,
      genera_aviso:  formProc.genera_aviso,
      tipo_aviso:    formProc.tipo_aviso,
      aviso_mensaje: formProc.aviso_mensaje.trim() || null,
      activo:        true,
    });
    if (error) return flash(false, error.message);
    setFormProc({ nombre: "", dias_estimados: "7", color: "#5a5a5a", genera_aviso: false, tipo_aviso: "aviso", aviso_mensaje: "" });
    cargar(); flash(true, "Etapa creada.");
  }

  async function reordenarProcs(newList) {
    await Promise.all(newList.map((p, i) =>
      supabase.from("linea_procesos").update({ orden: i + 1 }).eq("id", p.id)));
    cargar();
  }

  async function toggleProc(id, activo) {
    await supabase.from("linea_procesos").update({ activo: !activo }).eq("id", id);
    cargar();
  }

  async function eliminarLinea(id) {
    if (!window.confirm("¿Eliminar esta línea y todos sus procesos?")) return;
    await supabase.from("lineas_produccion").update({ activa: false }).eq("id", id);
    if (cfgLinea === id) setCfgLinea(null);
    cargar();
  }

  async function eliminarProc(id) {
    if (!window.confirm("¿Eliminar esta etapa?")) return;
    await supabase.from("linea_procesos").delete().eq("id", id);
    cargar();
  }

  // ── ESTILOS ───────────────────────────────────────────────────
  const GLASS = {
    background: C.s0,
    backdropFilter: "blur(40px) saturate(130%)",
    WebkitBackdropFilter: "blur(40px) saturate(130%)",
  };

  const S = {
    page:   { background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: "'Outfit', 'IBM Plex Sans', system-ui, sans-serif" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:   { display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" },

    topbar: {
      ...GLASS,
      background: "rgba(3,5,12,0.80)",
      borderBottom: `1px solid ${C.b0}`,
      padding: "0 22px", height: 52,
      display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
      position: "sticky", top: 0, zIndex: 200,
    },
    filterbar: {
      ...GLASS,
      background: "rgba(3,5,12,0.72)",
      borderBottom: `1px solid ${C.b0}`,
      padding: "0 22px", height: 40,
      display: "flex", alignItems: "center", gap: 5, flexShrink: 0, overflowX: "auto",
    },
    scroll: { flex: 1, overflowY: "auto", padding: "20px 22px" },

    card:   { border: `1px solid ${C.b0}`, borderRadius: 12, ...GLASS, padding: 16, marginBottom: 8 },
    cardHi: { border: `1px solid ${C.b1}`, borderRadius: 12, ...GLASS, background: C.s1, padding: 16, marginBottom: 8 },

    input:  {
      background: "rgba(255,255,255,0.05)", border: `1px solid ${C.b0}`,
      color: C.t0, padding: "8px 12px", borderRadius: 8, fontSize: 12,
      outline: "none", width: "100%",
      transition: "border-color 0.15s",
    },
    label:  { fontSize: 9, letterSpacing: 2.2, color: C.t1, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 },

    btn:    {
      border: `1px solid ${C.b0}`, background: "rgba(255,255,255,0.05)",
      color: C.t0, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
      transition: "border-color 0.15s, background 0.15s",
    },
    btnPri: {
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.92)",
      color: "#080c14", padding: "7px 18px", borderRadius: 8,
      cursor: "pointer", fontWeight: 700, fontSize: 12, letterSpacing: 0.2,
      transition: "opacity 0.15s",
    },
    btnSm:  {
      border: `1px solid ${C.b0}`, background: "transparent",
      color: C.t1, padding: "3px 10px", borderRadius: 6,
      cursor: "pointer", fontSize: 11,
      transition: "border-color 0.15s, color 0.15s",
    },
    btnGh:  { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13 },

    pill: (act) => ({
      border: act ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)",
      background: act ? "rgba(255,255,255,0.08)" : "transparent",
      color: act ? C.t0 : C.t1, padding: "4px 12px", borderRadius: 6,
      cursor: "pointer", fontSize: 11, whiteSpace: "nowrap",
      transition: "all 0.13s",
    }),

    overlay: {
      position: "fixed", inset: 0,
      background: "rgba(3,5,12,0.88)",
      backdropFilter: "blur(28px) saturate(140%)",
      WebkitBackdropFilter: "blur(28px) saturate(140%)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      zIndex: 9000, padding: "40px 16px", overflowY: "auto",
    },
    modal: {
      background: "rgba(8,12,22,0.92)",
      backdropFilter: "blur(60px) saturate(160%)",
      WebkitBackdropFilter: "blur(60px) saturate(160%)",
      border: `1px solid ${C.b1}`, borderRadius: 16, padding: 28,
      width: "100%", maxWidth: 520,
      boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
    modalLg: {
      background: "rgba(8,12,22,0.92)",
      backdropFilter: "blur(60px) saturate(160%)",
      WebkitBackdropFilter: "blur(60px) saturate(160%)",
      border: `1px solid ${C.b1}`, borderRadius: 16, padding: 28,
      width: "100%", maxWidth: 900,
      boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
  };

  // ═══════════════════════════════════════════════════════════════
  //  GANTT VIEW
  // ═══════════════════════════════════════════════════════════════
  function GanttView() {
    if (!obrasFilt.length)
      return <div style={{ ...S.card, textAlign: "center", padding: 64, color: C.t2, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Sin obras con este filtro</div>;

    // Agrupar por línea
    const grupos = {};
    obrasFilt.forEach(o => {
      const key = o.linea_nombre ?? "Sin línea";
      if (!grupos[key]) grupos[key] = { linea_id: o.linea_id, obras: [] };
      grupos[key].obras.push(o);
    });

    return (
      <div>
        {Object.entries(grupos).map(([key, grupo]) => {
          const isLinea  = !!grupo.linea_id;
          const procs    = isLinea
            ? lProcs.filter(p => p.linea_id === grupo.linea_id).sort((a, b) => a.orden - b.orden)
            : procGlobal;
          const totalDias = procs.reduce((s, p) => s + num(p.dias_estimados ?? p.dias_esperados), 0) || 1;
          const linInfo  = lineas.find(l => l.id === grupo.linea_id);

          return (
            <div key={key} style={{ marginBottom: 32 }}>

              {/* ── Cabecera de línea ── */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 8, paddingBottom: 8,
                borderBottom: `1px solid ${C.b0}`,
              }}>
                {linInfo && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: linInfo.color,
                    boxShadow: `0 0 8px ${linInfo.color}88`,
                    flexShrink: 0,
                  }} />
                )}
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: C.t0, textTransform: "uppercase", fontWeight: 500 }}>{key}</span>
                <span style={{ fontSize: 10, color: C.t2, letterSpacing: 0.5 }}>· {grupo.obras.length} obra{grupo.obras.length !== 1 ? "s" : ""}</span>
              </div>

              {/* ── Headers de proceso ── */}
              <div style={{ display: "flex", paddingLeft: 130, marginBottom: 4 }}>
                {procs.map(p => (
                  <div key={p.id} style={{
                    flex: num(p.dias_estimados ?? p.dias_esperados) / totalDias,
                    fontSize: 8, color: C.t2, letterSpacing: 1.2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    paddingRight: 3, minWidth: 0, textTransform: "uppercase", fontWeight: 600,
                  }}>
                    {p.nombre}
                  </div>
                ))}
                <div style={{ width: 80, flexShrink: 0 }} />
              </div>

              {/* ── Filas de obras ── */}
              {grupo.obras.map(obra => {
                const sel       = selId === obra.id;
                const tl        = tlDeObra(obra.id);
                const pct       = pctObra(obra);
                const diasEst   = diasEstimados(obra);
                const diasReales= diasDesde(obra.fecha_inicio);
                const ratio     = diasEst > 0 ? diasReales / diasEst : 0;
                const timeColor = ratio <= 0.85 ? C.completado.text : ratio <= 1.1 ? C.en_curso.text : C.demorado.text;
                const est       = C[obra.estado] ?? C.activa;

                return (
                  <div key={obra.id}>
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 0,
                        padding: "4px 0", cursor: "pointer", borderRadius: 6,
                        background: sel ? "rgba(255,255,255,0.04)" : "transparent",
                        borderRadius: 8,
                        transition: "background 0.15s",
                      }}
                      onClick={() => setSelId(sel ? null : obra.id)}
                    >
                      {/* Label */}
                      <div style={{ width: 130, flexShrink: 0, paddingRight: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: est.dot, flexShrink: 0 }} />
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                            color: sel ? C.t0 : "#7a8090", fontWeight: sel ? 600 : 400,
                            letterSpacing: 0.8,
                            transition: "color 0.15s",
                          }}>
                            {obra.codigo}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: C.t2, paddingLeft: 10, marginTop: 1 }}>
                          {pct}% · {diasReales}d
                        </div>
                      </div>

                      {/* Barra Gantt */}
                      <div style={{
                        flex: 1, height: 28, display: "flex", overflow: "hidden",
                        borderRadius: 6, border: `1px solid ${C.b0}`,
                        background: "rgba(255,255,255,0.02)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
                      }}>
                        {procs.map((p, pi) => {
                          const t    = isLinea
                            ? tl.find(x => x.linea_proceso_id === p.id)
                            : tl.find(x => x.proceso_id === p.id);
                          const col  = procColor(t, p);
                          const flex = num(p.dias_estimados ?? p.dias_esperados) / totalDias;
                          const pulse = t?.estado === "en_curso" && col === C.en_curso;
                          return (
                            <div key={p.id} style={{
                              flex, height: "100%",
                              background: t?.estado === "completado"
                                ? `linear-gradient(90deg, ${col.bar}, rgba(40,120,70,0.35))`
                                : t?.estado === "en_curso"
                                  ? `linear-gradient(90deg, ${col.bar}, rgba(200,150,20,0.32))`
                                  : col.bar,
                              borderRight: pi < procs.length - 1 ? "1px solid rgba(0,0,0,0.3)" : "none",
                              transition: "background .4s",
                              position: "relative",
                              ...(t?.estado === "en_curso" ? { animation: "gantt-pulse 2.5s ease-in-out infinite" } : {}),
                            }}
                              title={`${p.nombre} · ${t?.estado ?? "pendiente"} · ${p.dias_estimados ?? p.dias_esperados}d est.`}
                            />
                          );
                        })}
                      </div>

                      {/* Días */}
                      <div style={{ width: 80, paddingLeft: 10, flexShrink: 0, textAlign: "right" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: timeColor }}>
                          {diasReales}/{diasEst}d
                        </span>
                      </div>
                    </div>

                    {/* ── Detalle expandido ── */}
                    {sel && <GanttDetail obra={obra} procs={procs} isLinea={isLinea} />}
                  </div>
                );
              })}
            </div>
          );
        })}

        <style>{`
          @keyframes gantt-pulse { 0%,100%{opacity:1} 50%{opacity:.7} }
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500;700&display=swap');
        `}</style>
      </div>
    );
  }

  // ── DETALLE EXPANDIDO ─────────────────────────────────────────
  function GanttDetail({ obra, procs, isLinea }) {
    const tl     = tlDeObra(obra.id);
    const est    = C[obra.estado] ?? C.activa;
    const linInfo = lineas.find(l => l.id === obra.linea_id);

    return (
      <div style={{
        margin: "6px 0 14px 130px", padding: "18px 20px",
        background: "rgba(255,255,255,0.032)",
        backdropFilter: "blur(40px) saturate(130%)",
        WebkitBackdropFilter: "blur(40px) saturate(130%)",
        border: `1px solid ${C.b1}`, borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, color: C.t0, fontWeight: 700, letterSpacing: 1 }}>
                {obra.codigo}
              </span>
              <Chip estado={obra.estado} />
              {linInfo && (
                <span style={{ fontSize: 9, color: C.t1, letterSpacing: 2, textTransform: "uppercase" }}>
                  {linInfo.nombre}
                </span>
              )}
            </div>
            {obra.descripcion && <div style={{ fontSize: 11, color: C.t1 }}>{obra.descripcion}</div>}
          </div>
          {esGestion && (
            <div style={{ display: "flex", gap: 5 }}>
              {obra.estado !== "activa"    && <button style={S.btnSm} onClick={() => cambiarEstado(obra.id, "activa")}>Activar</button>}
              {obra.estado !== "pausada"   && <button style={S.btnSm} onClick={() => cambiarEstado(obra.id, "pausada")}>Pausar</button>}
              {obra.estado !== "terminada" && (
                <button style={{ ...S.btnSm, color: C.completado.text, borderColor: "rgba(50,100,70,0.3)" }}
                  onClick={() => cambiarEstado(obra.id, "terminada")}>
                  Terminar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabla de procesos */}
        <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 10 }}>
          {procs.map((p, idx) => {
            const t        = isLinea ? tl.find(x => x.linea_proceso_id === p.id) : tl.find(x => x.proceso_id === p.id);
            const col      = procColor(t, p);
            const est2     = num(p.dias_estimados ?? p.dias_esperados);
            const diasAct  = t?.fecha_inicio ? (t.fecha_fin ? diasEntre(t.fecha_inicio, t.fecha_fin) : diasDesde(t.fecha_inicio)) : null;
            const prom     = promedios[p.id];
            const pctBar   = diasAct != null && est2 > 0 ? Math.min(100, Math.round((diasAct / est2) * 100)) : 0;

            return (
              <div key={p.id} style={{
                display: "grid", gridTemplateColumns: "200px 1fr 100px 130px",
                gap: 10, alignItems: "center",
                padding: "8px 10px",
                margin: "2px 0",
                borderRadius: 8,
                background: t ? "rgba(255,255,255,0.02)" : "transparent",
                border: t ? `1px solid rgba(255,255,255,0.04)` : "1px solid transparent",
                transition: "background 0.2s",
              }}>
                {/* Nombre */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: t ? col.text : C.t2, flexShrink: 0, boxShadow: t && t.estado !== "pendiente" ? `0 0 6px ${col.text}88` : "none" }} />
                  <span style={{ fontSize: 12, color: t ? "#a8a8a8" : C.t1 }}>{p.nombre}</span>
                  {p.genera_aviso && <span style={{ fontSize: 8, color: C[p.tipo_aviso]?.color ?? C.t2, letterSpacing: 0.5 }}>·aviso</span>}
                </div>

                {/* Barra */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pctBar}%`,
                    background: `linear-gradient(90deg, ${col.text}cc, ${col.text})`,
                    borderRadius: 99, transition: "width .5s ease",
                  }} />
                </div>

                {/* Días */}
                <div style={{ textAlign: "right" }}>
                  {diasAct != null ? (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: col.text }}>
                      {diasAct}/{est2}d
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: C.t2 }}>{est2}d est.</span>
                  )}
                  {prom && diasAct != null && (
                    <div style={{ fontSize: 9, color: C.t2, marginTop: 1 }}>
                      prom. {Math.round(prom)}d
                    </div>
                  )}
                </div>

                {/* Acciones */}
                {esGestion ? (
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {(!t || t.estado === "pendiente") && (
                      <button style={{ ...S.btnSm, fontSize: 10 }}
                        onClick={() => iniciarProc(obra.id, t?.id ?? null, p, isLinea)}>
                        Iniciar
                      </button>
                    )}
                    {t?.estado === "en_curso" && (
                      <button style={{ ...S.btnSm, fontSize: 10, color: C.completado.text, borderColor: "rgba(44,100,70,0.3)" }}
                        onClick={() => completarProc(t.id)}>
                        Completar
                      </button>
                    )}
                    {t?.estado === "completado" && (
                      <span style={{ fontSize: 10, color: C.t2, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtDate(t.fecha_fin)}
                      </span>
                    )}
                  </div>
                ) : <div />}
              </div>
            );
          })}
          {!procs.length && (
            <div style={{ color: C.t2, fontSize: 12, textAlign: "center", padding: "10px 0" }}>
              Sin procesos asignados. Asigná una línea a la obra para ver etapas.
            </div>
          )}
        </div>

        {/* Fechas */}
        <div style={{ display: "flex", gap: 18, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.b0}` }}>
          {[["Inicio", obra.fecha_inicio], ["Fin est.", obra.fecha_fin_estimada], ["Fin real", obra.fecha_fin_real]]
            .filter(([, v]) => v)
            .map(([label, val]) => (
              <div key={label}>
                <div style={S.label}>{label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.t0, opacity: 0.65, letterSpacing: 0.5 }}>{fmtDate(val)}</div>
              </div>
            ))}
          {obra.fecha_inicio && !obra.fecha_fin_real && (
            <div>
              <div style={S.label}>En producción</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.t0, opacity: 0.65, letterSpacing: 0.5 }}>
                {diasDesde(obra.fecha_inicio)}d
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CARDS VIEW ────────────────────────────────────────────────
  function CardsView() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 8 }}>
        {obrasFilt.map(obra => {
          const procs    = procsDeObra(obra);
          const isLinea  = !!obra.linea_id;
          const tl       = tlDeObra(obra.id);
          const pct      = pctObra(obra);
          const diasEst  = diasEstimados(obra);
          const diasR    = diasDesde(obra.fecha_inicio);
          const ratio    = diasEst > 0 ? diasR / diasEst : 0;
          const timeCol  = ratio <= 0.85 ? C.completado.text : ratio <= 1.1 ? C.en_curso.text : C.demorado.text;
          const est      = C[obra.estado] ?? C.activa;
          const avisPend = avisos.filter(a => a.obra_id === obra.id && a.estado === "pendiente").length;
          const linInfo  = lineas.find(l => l.id === obra.linea_id);
          const sel      = selId === obra.id;

          return (
            <div key={obra.id}
              style={{
                ...S.card, cursor: "pointer", marginBottom: 0,
                border: `1px solid ${sel ? C.b1 : C.b0}`,
                background: sel ? "rgba(255,255,255,0.055)" : C.s0,
                transition: "background 0.15s, border-color 0.15s, transform 0.12s",
              }}
              onClick={() => setSelId(sel ? null : obra.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "#d8d8d8", fontWeight: 600 }}>
                    {obra.codigo}
                  </span>
                  {linInfo && (
                    <div style={{ fontSize: 9, color: C.t1, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
                      {linInfo.nombre}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexDirection: "column", alignItems: "flex-end" }}>
                  <Chip estado={obra.estado} />
                  {avisPend > 0 && (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: "rgba(200,144,64,0.1)", color: C.compra.color, border: "1px solid rgba(200,144,64,0.28)", letterSpacing: 0.5 }}>
                      {avisPend} aviso{avisPend !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Barra mini */}
              <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 9 }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: `linear-gradient(90deg, ${timeCol}88, ${timeCol})`,
                  borderRadius: 99, transition: "width .5s",
                }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: C.t1 }}>{pct}% completado</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: timeCol }}>
                  {diasR}/{diasEst}d
                </span>
              </div>

              {sel && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.b0}`, paddingTop: 10 }}>
                  <GanttDetail obra={obra} procs={procs} isLinea={isLinea} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── MODAL AVISOS ──────────────────────────────────────────────
  function ModalAvisos() {
    return (
      <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowAvisos(false)}>
        <div style={{ ...S.modalLg, maxWidth: 640 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, color: C.t0, fontWeight: 600, letterSpacing: 0.2 }}>Avisos internos</div>
              <div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}>{avisosPend.length} pendiente{avisosPend.length !== 1 ? "s" : ""}</div>
            </div>
            <button style={{ ...S.btnGh, fontSize: 18, lineHeight: 1 }} onClick={() => setShowAvisos(false)}>×</button>
          </div>

          {avisos.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.t2, fontSize: 13 }}>Sin avisos generados</div>
          )}

          {["pendiente", "resuelto"].map(estado => {
            const rows = avisos.filter(a => a.estado === estado);
            if (!rows.length) return null;
            return (
              <div key={estado} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.t2, marginBottom: 7, textTransform: "uppercase" }}>
                  {estado === "pendiente" ? "Pendientes" : "Resueltos"}
                </div>
                {rows.map(a => {
                  const ti = C[a.tipo] ?? C.aviso;
                  return (
                    <div key={a.id} style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: "11px 14px", borderRadius: 10, marginBottom: 5,
                      background: estado === "pendiente" ? "rgba(255,255,255,0.04)" : "transparent",
                      backdropFilter: estado === "pendiente" ? "blur(20px)" : "none",
                      border: `1px solid ${estado === "pendiente" ? C.b0 : "transparent"}`,
                      opacity: estado === "resuelto" ? 0.35 : 1,
                      transition: "opacity 0.2s",
                    }}>
                      <span style={{
                        fontSize: 8, padding: "3px 7px", borderRadius: 4, letterSpacing: 1,
                        color: ti.color, border: `1px solid ${ti.color}44`, background: `${ti.color}14`,
                        flexShrink: 0, marginTop: 1, textTransform: "uppercase",
                      }}>{ti.label}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#a0a0a0" }}>{a.obra_codigo}</span>
                          <span style={{ fontSize: 11, color: C.t1 }}>{a.proceso_nombre}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{a.mensaje}</div>
                        <div style={{ fontSize: 9, color: C.t2, marginTop: 3 }}>
                          {new Date(a.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {estado === "pendiente" && esGestion && (
                        <button style={{ ...S.btnSm, fontSize: 10, color: C.completado.text, borderColor: "rgba(44,100,70,0.3)", flexShrink: 0 }}
                          onClick={() => resolverAviso(a.id)}>
                          Resolver
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── MODAL CONFIG LÍNEAS ───────────────────────────────────────
  function ModalConfig() {
    const procsDeLinea = cfgLinea
      ? lProcs.filter(p => p.linea_id === cfgLinea).sort((a, b) => a.orden - b.orden)
      : [];
    const lineaSel = lineas.find(l => l.id === cfgLinea);

    return (
      <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowConfig(false)}>
        <div style={S.modalLg}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, color: C.t0, fontWeight: 600, letterSpacing: 0.2 }}>Líneas de producción</div>
              <div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}>Configuración de líneas y etapas</div>
            </div>
            <button style={{ ...S.btnGh, fontSize: 18, lineHeight: 1 }} onClick={() => setShowConfig(false)}>×</button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 3, borderBottom: `1px solid ${C.b0}`, marginBottom: 18, paddingBottom: 6 }}>
            {[["lineas", "Líneas"], ["procesos", "Etapas de línea"]].map(([v, l]) => (
              <button key={v} style={S.pill(cfgTab === v)} onClick={() => setCfgTab(v)}>{l}</button>
            ))}
          </div>

          {/* TAB LÍNEAS */}
          {cfgTab === "lineas" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, marginBottom: 10, textTransform: "uppercase" }}>Líneas activas</div>
                {lineas.map(l => (
                  <div key={l.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10, marginBottom: 5, cursor: "pointer",
                    background: cfgLinea === l.id ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${cfgLinea === l.id ? C.b1 : C.b0}`,
                    backdropFilter: "blur(20px)",
                    transition: "background 0.15s, border-color 0.15s",
                    boxShadow: cfgLinea === l.id ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "none",
                  }}
                    onClick={() => { setCfgLinea(l.id); setCfgTab("procesos"); }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, boxShadow: `0 0 8px ${l.color}88` }} />
                      <span style={{ fontSize: 13, color: C.t0 }}>{l.nombre}</span>
                      <span style={{ fontSize: 10, color: C.t1 }}>
                        {lProcs.filter(p => p.linea_id === l.id).length} etapas
                      </span>
                    </div>
                    <button style={S.btnGh} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>×</button>
                  </div>
                ))}
                {!lineas.length && <div style={{ color: C.t2, fontSize: 11, padding: "16px 0", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", textAlign: "center" }}>Sin líneas configuradas</div>}
              </div>

              <div>
                <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, marginBottom: 10, textTransform: "uppercase" }}>Nueva línea</div>
                <form onSubmit={crearLinea}>
                  <label style={S.label}>Nombre</label>
                  <input style={{ ...S.input, marginBottom: 10 }} required placeholder="K65"
                    value={formLinea.nombre} onChange={e => setFormLinea(f => ({ ...f, nombre: e.target.value }))} />
                  <label style={S.label}>Color</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <input type="color" style={{ width: 30, height: 30, border: "none", background: "none", cursor: "pointer" }}
                      value={formLinea.color} onChange={e => setFormLinea(f => ({ ...f, color: e.target.value }))} />
                    <input style={S.input} value={formLinea.color} onChange={e => setFormLinea(f => ({ ...f, color: e.target.value }))} />
                  </div>
                  <button type="submit" style={S.btnPri}>Crear línea</button>
                </form>
              </div>
            </div>
          )}

          {/* TAB ETAPAS */}
          {cfgTab === "procesos" && (
            <div>
              {!cfgLinea ? (
                <div style={{ color: C.t2, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                  Seleccioná una línea en el tab anterior
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

                  {/* Lista drag & drop */}
                  <div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                      {lineaSel && <div style={{ width: 7, height: 7, borderRadius: "50%", background: lineaSel.color }} />}
                      <span style={{ fontSize: 12, color: "#b0b0b0" }}>{lineaSel?.nombre}</span>
                      <span style={{ fontSize: 10, color: C.t1 }}>— arrastrá ⠿ para reordenar</span>
                    </div>
                    <DragList
                      items={procsDeLinea}
                      onReorder={reordenarProcs}
                      renderItem={(p) => (
                        <div style={{
                          display: "grid", gridTemplateColumns: "14px 1fr 52px 32px 24px",
                          gap: 8, alignItems: "center",
                          padding: "8px 12px", borderRadius: 8, marginBottom: 3,
                          background: "rgba(255,255,255,0.04)",
                          backdropFilter: "blur(20px)",
                          border: `1px solid ${C.b0}`,
                          opacity: p.activo ? 1 : 0.3,
                          transition: "opacity 0.2s",
                        }}>
                          <span style={{ color: C.t2, fontSize: 13, cursor: "grab", userSelect: "none" }}>⠿</span>
                          <div>
                            <div style={{ fontSize: 12, color: "#a8a8a8" }}>{p.nombre}</div>
                            {p.genera_aviso && (
                              <div style={{ fontSize: 9, color: C[p.tipo_aviso]?.color ?? C.t1, letterSpacing: 0.5 }}>
                                {C[p.tipo_aviso]?.label}
                              </div>
                            )}
                          </div>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.t1, textAlign: "right" }}>{p.dias_estimados}d</span>
                          <Toggle on={p.activo} onChange={() => toggleProc(p.id, p.activo)} />
                          <button style={S.btnGh} onClick={() => eliminarProc(p.id)}>×</button>
                        </div>
                      )}
                    />
                    {!procsDeLinea.length && (
                      <div style={{ color: C.t2, fontSize: 11, textAlign: "center", padding: "24px 0", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Sin etapas · Creá la primera</div>
                    )}
                  </div>

                  {/* Form nueva etapa */}
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, marginBottom: 10, textTransform: "uppercase" }}>Nueva etapa</div>
                    <form onSubmit={crearProc}>
                      <label style={S.label}>Nombre *</label>
                      <input style={{ ...S.input, marginBottom: 10 }} required placeholder="Ej: Mecánica etapa 1"
                        value={formProc.nombre} onChange={e => setFormProc(f => ({ ...f, nombre: e.target.value }))} />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={S.label}>Días estimados</label>
                          <input type="number" min="0.5" step="0.5" style={S.input}
                            value={formProc.dias_estimados} onChange={e => setFormProc(f => ({ ...f, dias_estimados: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Color</label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input type="color" style={{ width: 30, height: 30, border: "none", background: "none", cursor: "pointer" }}
                              value={formProc.color} onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                            <input style={{ ...S.input }} value={formProc.color} onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                          </div>
                        </div>
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
                        <Toggle on={formProc.genera_aviso} onChange={() => setFormProc(f => ({ ...f, genera_aviso: !f.genera_aviso }))} />
                        <span style={{ fontSize: 11, color: "#808080" }}>Genera aviso al iniciar</span>
                      </label>

                      {formProc.genera_aviso && (
                        <>
                          <label style={S.label}>Tipo</label>
                          <select style={{ ...S.input, marginBottom: 8 }}
                            value={formProc.tipo_aviso} onChange={e => setFormProc(f => ({ ...f, tipo_aviso: e.target.value }))}>
                            <option value="aviso">Aviso</option>
                            <option value="compra">Orden de compra</option>
                            <option value="recordatorio">Recordatorio</option>
                          </select>
                          <label style={S.label}>Mensaje</label>
                          <input style={{ ...S.input, marginBottom: 10 }} placeholder="Ej: Verificar stock herrajes"
                            value={formProc.aviso_mensaje} onChange={e => setFormProc(f => ({ ...f, aviso_mensaje: e.target.value }))} />
                        </>
                      )}

                      <button type="submit" style={{ ...S.btnPri, width: "100%", marginTop: 4 }}>Agregar etapa</button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {(err || msg) && (
            <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 7, fontSize: 12,
              background: err ? "rgba(180,60,60,0.08)" : "rgba(44,100,70,0.08)",
              color: err ? "#c07070" : "#60b070", border: `1px solid ${err ? "rgba(180,60,60,0.2)" : "rgba(44,100,70,0.2)"}` }}>
              {err || msg}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ ...S.page, position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        select option { background: #080c18; color: #c8ccd8; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
        .obras-bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 80% 40% at 50% -8%, rgba(18,44,100,0.18) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 90% 90%, rgba(10,30,60,0.12) 0%, transparent 60%);
        }
        .obras-layout { position: relative; z-index: 1; }
        @keyframes gantt-pulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
        @keyframes glow-pulse {
          0%,100%{ box-shadow: 0 0 6px rgba(224,176,64,0.35), 0 0 18px rgba(224,176,64,0.10); }
          50%    { box-shadow: 0 0 14px rgba(224,176,64,0.55), 0 0 36px rgba(224,176,64,0.18); }
        }
        @keyframes glow-red {
          0%,100%{ box-shadow: 0 0 6px rgba(224,72,72,0.35), 0 0 18px rgba(224,72,72,0.10); }
          50%    { box-shadow: 0 0 14px rgba(224,72,72,0.55), 0 0 36px rgba(224,72,72,0.18); }
        }
        input:focus, select:focus { border-color: rgba(255,255,255,0.22) !important; }
        button:hover { opacity: 0.85; }
      `}</style>
      <div className="obras-bg-glow" />

      <div style={S.layout} className="obras-layout">
        <Sidebar profile={profile} signOut={signOut} />

        <div style={S.main}>

          {/* ── TOP BAR ── */}
          <div style={S.topbar}>

            {/* Stats */}
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              {[
                { label: "Activas",    val: stats.activas,    c: C.activa.dot    },
                { label: "Pausadas",   val: stats.pausadas,   c: C.pausada.dot   },
                { label: "Terminadas", val: stats.terminadas, c: C.terminada.dot },
              ].map(({ label, val, c }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "5px 12px 5px 10px", borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${C.b0}`,
                  borderLeft: `2px solid ${c}`,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: c, lineHeight: 1 }}>
                    {val}
                  </span>
                  <span style={{ fontSize: 9, color: C.t1, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 600 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: 1, background: "#070707", border: `1px solid ${C.b0}`, borderRadius: 6, padding: 2 }}>
              {[["gantt", "Gantt"], ["cards", "Cards"]].map(([v, l]) => (
                <button key={v} style={{ ...S.pill(view === v), borderRadius: 4 }} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>

            {/* Avisos */}
            <button style={{ ...S.btn, position: "relative", paddingRight: avisosPend.length ? 26 : 14 }}
              onClick={() => setShowAvisos(true)}>
              Avisos
              {avisosPend.length > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 5,
                  width: 14, height: 14, borderRadius: "50%",
                  background: C.compra.color, color: "#fff",
                  fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {avisosPend.length}
                </span>
              )}
            </button>

            {/* Config líneas */}
            {esGestion && (
              <button style={S.btn} onClick={() => setShowConfig(true)}>Líneas</button>
            )}

            {/* Nueva obra */}
            {esGestion && (
              <button style={S.btnPri} onClick={() => setShowNueva(true)}>+ Nueva obra</button>
            )}
          </div>

          {/* ── FILTER BAR ── */}
          <div style={S.filterbar}>
            <span style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", flexShrink: 0 }}>Estado</span>
            {["todos", "activa", "pausada", "terminada"].map(e => (
              <button key={e} style={S.pill(filtroEstado === e)} onClick={() => setFiltroEstado(e)}>
                {e === "todos" ? "Todos" : (C[e]?.label ?? e)}
              </button>
            ))}
            <div style={{ width: 1, height: 14, background: C.b0, margin: "0 4px", flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", flexShrink: 0 }}>Línea</span>
            <button style={S.pill(filtroLinea === "todas")} onClick={() => setFiltroLinea("todas")}>Todas</button>
            {lineas.map(l => (
              <button key={l.id} style={{
                ...S.pill(filtroLinea === l.id),
                borderLeft: `2px solid ${filtroLinea === l.id ? l.color : "transparent"}`,
              }}
                onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)}>
                {l.nombre}
              </button>
            ))}
          </div>

          {/* ── CONTENT ── */}
          <div style={S.scroll}>
            {(err || msg) && (
              <div style={{ padding: "8px 12px", borderRadius: 7, fontSize: 12, marginBottom: 10,
                background: err ? "rgba(180,60,60,0.08)" : "rgba(44,100,70,0.08)",
                color: err ? "#c07070" : "#60b070",
                border: `1px solid ${err ? "rgba(180,60,60,0.2)" : "rgba(44,100,70,0.2)"}` }}>
                {err || msg}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: C.t2, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Cargando…</div>
            ) : view === "gantt" ? <GanttView /> : <CardsView />}
          </div>
        </div>
      </div>

      {/* ── MODAL NUEVA OBRA ── */}
      {showNueva && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNueva(false)}>
          <div style={S.modal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 16, color: C.t0, fontWeight: 600, letterSpacing: 0.2 }}>Nueva obra</div>
                <div style={{ fontSize: 11, color: C.t1, marginTop: 3, letterSpacing: 0.3 }}>Completá los campos y asigná una línea de producción</div>
              </div>
              <button style={{ ...S.btnGh, fontSize: 18, lineHeight: 1 }} onClick={() => setShowNueva(false)}>×</button>
            </div>
            <form onSubmit={crearObra}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Código *</label>
                  <input style={S.input} required placeholder="37-42"
                    value={formObra.codigo} onChange={e => setFormObra(f => ({ ...f, codigo: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label style={S.label}>Línea de producción</label>
                  <select style={S.input} value={formObra.linea_id}
                    onChange={e => setFormObra(f => ({ ...f, linea_id: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={S.label}>Descripción</label>
                <input style={S.input} value={formObra.descripcion}
                  onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Fecha inicio</label>
                  <input type="date" style={S.input} value={formObra.fecha_inicio}
                    onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Fin estimado</label>
                  <input type="date" style={S.input} value={formObra.fecha_fin_estimada}
                    onChange={e => setFormObra(f => ({ ...f, fecha_fin_estimada: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Notas</label>
                <input style={S.input} value={formObra.notas}
                  onChange={e => setFormObra(f => ({ ...f, notas: e.target.value }))} />
              </div>
              {formObra.linea_id && (
                <div style={{ fontSize: 11, color: C.t1, marginBottom: 16, padding: "10px 14px", background: "rgba(61,206,106,0.05)", borderRadius: 8, border: `1px solid rgba(61,206,106,0.18)` }}>
                  Se crean automáticamente {lProcs.filter(p => p.linea_id === formObra.linea_id).length} etapas
                  de la línea {lineas.find(l => l.id === formObra.linea_id)?.nombre}.
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={S.btnPri}>Crear obra</button>
                <button type="button" style={S.btn} onClick={() => setShowNueva(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAvisos && <ModalAvisos />}
      {showConfig && <ModalConfig />}
    </div>
  );
}