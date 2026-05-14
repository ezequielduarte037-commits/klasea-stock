import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 👇 Ajustá esta ruta dependiendo de dónde guardes la imagen de Klase A en tu proyecto
import logoKlaseA from "@/assets/logos/logo-klasea.png"; 

// ── ESTADO META ───────────────────────────────────────────────────
const ESTADOS = ["Pendiente", "Enviado", "Recibido", "No lleva", "Rehacer"];
const ESTADO_META = {
  "Pendiente": { color: "#566070", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)",  dot: "○", label: "Pendiente" },
  "Enviado":   { color: "#a8b4c4", bg: "rgba(168,180,196,0.1)",  border: "rgba(168,180,196,0.25)", dot: "◑", label: "Enviado"   },
  "Recibido":  { color: "#10b981", bg: "rgba(61,206,106,0.1)",   border: "rgba(61,206,106,0.3)",   dot: "●", label: "Recibido"  },
  "No lleva":  { color: "#2c3040", bg: "transparent",            border: "transparent",            dot: "—", label: "No lleva" },
  "Rehacer":   { color: "#ef4444", bg: "rgba(224,72,72,0.1)",    border: "rgba(224,72,72,0.28)",   dot: "↺", label: "Rehacer"  },
};

// ── PRIORIDADES (Semáforo) ────────────────────────────────────────
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const PRIORIDAD_META = {
  "Baja":    { color: "#10b981", bg: "rgba(61,206,106,0.15)", label: "Baja" },      // Verde
  "Media":   { color: "#f5a623", bg: "rgba(245,166,35,0.15)", label: "Media" },     // Amarillo
  "Alta":    { color: "#ff7a00", bg: "rgba(255,122,0,0.15)",  label: "Alta" },      // Naranja
  "Urgente": { color: "#ef4444", bg: "rgba(224,72,72,0.15)",  label: "Urgente" },   // Rojo
};

// ── DESMOLDES (from Fechas_2026.xlsx) ────────────────────────────
// Gap histórico medido (días desde desmolde hasta primer envío de plantillas):
//   K37 → 37-34: desmolde 14/10/25 → plantillas 26/01/26 = 104 días
//   K52 → 52-20: desmolde 05/06/25 → plantillas 05/11/25 = 153 días
//   K42 → 42-81: desmolde 03/09/25 → plantillas 08/01/26 = 127 días
//   K43 → sin dato, promedio ~128 días
//   K34 → sin dato, promedio ~128 días

const GAP_POR_LINEA = { K37:104, K52:153, K42:127, K43:128, K34:128 };

const DESMOLDES_DATA = [
  { linea:"K34", barco:"H172",  desmolde:"2026-10-20", botada:"2026-03-23", tipo:"real"     },
  { linea:"K34", barco:"H173",  desmolde:"2026-01-06", botada:"2026-06-09", tipo:"real"     },
  { linea:"K34", barco:"H174",  desmolde:"2026-03-30", botada:"2026-08-24", tipo:"estimado" },
  { linea:"K34", barco:"H175",  desmolde:"2026-06-08", botada:"2026-11-02", tipo:"estimado" },
  { linea:"K34", barco:"H176",  desmolde:"2026-08-17", botada:"2027-01-11", tipo:"estimado" },
  { linea:"K37", barco:"37-34", desmolde:"2026-10-13", botada:"2026-03-09", tipo:"real"     },
  { linea:"K37", barco:"37-35", desmolde:"2026-11-13", botada:"2026-04-16", tipo:"real"     },
  { linea:"K37", barco:"37-36", desmolde:"2026-12-11", botada:"2026-05-07", tipo:"real"     },
  { linea:"K37", barco:"37-37", desmolde:"2026-01-12", botada:"2026-06-16", tipo:"real"     },
  { linea:"K37", barco:"37-38", desmolde:"2026-02-23", botada:"2026-07-13", tipo:"estimado" },
  { linea:"K37", barco:"37-39", desmolde:"2026-03-23", botada:"2026-08-10", tipo:"estimado" },
  { linea:"K37", barco:"37-40", desmolde:"2026-04-20", botada:"2026-09-07", tipo:"estimado" },
  { linea:"K37", barco:"37-41", desmolde:"2026-05-18", botada:"2026-10-05", tipo:"estimado" },
  { linea:"K37", barco:"37-42", desmolde:"2026-06-23", botada:"2026-11-10", tipo:"estimado" },
  { linea:"K37", barco:"37-43", desmolde:"2026-07-20", botada:"2026-12-07", tipo:"estimado" },
  { linea:"K37", barco:"37-44", desmolde:"2026-08-17", botada:"2027-01-04", tipo:"estimado" },
  { linea:"K42", barco:"42-81", desmolde:"2026-09-03", botada:"2026-03-11", tipo:"real"     },
  { linea:"K42", barco:"42-82", desmolde:"2026-02-23", botada:"2026-08-12", tipo:"estimado" },
  { linea:"K42", barco:"42-83", desmolde:"2026-07-20", botada:"2026-01-13", tipo:"estimado" },
  { linea:"K43", barco:"43-28", desmolde:"2026-08-06", botada:"2026-04-29", tipo:"real"     },
  { linea:"K43", barco:"43-29", desmolde:"2026-12-11", botada:"2026-08-26", tipo:"real"     },
  { linea:"K43", barco:"43-30", desmolde:"2026-03-16", botada:"2026-11-16", tipo:"estimado" },
  { linea:"K43", barco:"43-31", desmolde:"2026-05-04", botada:"2027-01-04", tipo:"estimado" },
  { linea:"K52", barco:"52-20", desmolde:"2026-06-05", botada:null,         tipo:"real"     },
  { linea:"K52", barco:"52-21", desmolde:"2026-09-17", botada:"2026-05-13", tipo:"real"     },
  { linea:"K52", barco:"52-22", desmolde:"2026-11-13", botada:"2026-07-09", tipo:"real"     },
  { linea:"K52", barco:"52-23", desmolde:"2026-01-12", botada:"2026-09-28", tipo:"real"     },
  { linea:"K52", barco:"52-24", desmolde:"2026-03-30", botada:"2026-11-30", tipo:"estimado" },
  { linea:"K52", barco:"52-25", desmolde:"2026-06-01", botada:"2026-01-22", tipo:"estimado" },
];

// Fecha estimada de solicitud de plantillas = desmolde + gap de línea
function fechaEstPlantilla(desmoldeStr, linea) {
  const d = new Date(desmoldeStr + "T00:00:00");
  d.setDate(d.getDate() + (GAP_POR_LINEA[linea] ?? 128));
  return d;
}

// Días hasta la fecha estimada de plantilla (negativo = ya venció)
function diasHastaPlantilla(desmoldeStr, linea) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.round((fechaEstPlantilla(desmoldeStr, linea) - hoy) / 86400000);
}

function urgenciaPlantilla(dias, tieneTemplates) {
  if (tieneTemplates)
    return { label:"Solicitadas ✓", color:"#10b981", bg:"rgba(16,185,129,0.1)",  border:"rgba(16,185,129,0.22)"  };
  if (dias < -14)
    return { label:"Vencido",       color:"#71717a", bg:"rgba(113,113,122,0.1)", border:"rgba(113,113,122,0.2)"  };
  if (dias <= 30)
    return { label:"¡Pedir ya!",    color:"#ef4444", bg:"rgba(239,68,68,0.14)",  border:"rgba(239,68,68,0.35)"   };
  if (dias <= 60)
    return { label:"Próximo",       color:"#f59e0b", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.28)"  };
  return   { label:"En tiempo",     color:"#3b82f6", bg:"rgba(59,130,246,0.08)", border:"rgba(59,130,246,0.22)"  };
}

const SQL_HISTORIAL = `-- Historial completo de envíos de plantillas
SELECT
  ml.nombre          AS linea,
  mu.codigo          AS barco,
  mup.sector,
  mup.pieza,
  mup.color,
  mup.fecha_envio,
  mup.fecha_regreso,
  mup.estado,
  mup.observaciones
FROM marm_unidad_piezas mup
JOIN marm_unidades mu ON mup.unidad_id = mu.id
JOIN marm_lineas   ml ON mu.linea_id   = ml.id
WHERE mup.fecha_envio IS NOT NULL
ORDER BY mup.fecha_envio ASC, ml.nombre, mu.codigo;`;

const SQL_POR_BARCO = `-- Resumen por barco
SELECT
  ml.nombre           AS linea,
  mu.codigo           AS barco,
  MIN(mup.fecha_envio) AS primer_envio,
  MAX(mup.fecha_envio) AS ultimo_envio,
  COUNT(*)             AS total_piezas,
  COUNT(CASE WHEN mup.estado = 'Recibido' THEN 1 END) AS recibidas
FROM marm_unidad_piezas mup
JOIN marm_unidades mu ON mup.unidad_id = mu.id
JOIN marm_lineas   ml ON mu.linea_id   = ml.id
WHERE mup.fecha_envio IS NOT NULL
GROUP BY ml.nombre, mu.codigo
ORDER BY MIN(mup.fecha_envio);`;

function pct(piezas) {
  const activas = piezas.filter(p => p.estado !== "No lleva");
  if (!activas.length) return 0;
  return Math.round(activas.filter(p => p.estado === "Recibido").length / activas.length * 100);
}

// ── MODAL DETALLE PIEZA ───────────────────────────────────────────
function PiezaModal({ pieza, onClose, onSave, esAdmin }) {
  const [form, setForm] = useState({
    fecha_envio:   pieza.fecha_envio   ?? "",
    fecha_regreso: pieza.fecha_regreso ?? "",
    observaciones: pieza.observaciones ?? "",
    foto_ref:      pieza.foto_ref      ?? "",
    prioridad:     pieza.prioridad     ?? "Media",
  });

  const S = {
    overlay: {
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(9,9,11,0.88)",
      backdropFilter:"blur(40px) saturate(140%)",
      WebkitBackdropFilter:"blur(40px) saturate(140%)",
      display:"flex", alignItems:"center", justifyContent:"center",
    },
    card: {
      background:"rgba(6,10,22,0.96)",
      backdropFilter:"blur(60px)",
      WebkitBackdropFilter:"blur(60px)",
      border:"1px solid rgba(255,255,255,0.12)",
      borderRadius:18, padding:"28px 26px", width:"min(520px,92vw)",
      maxHeight:"88vh", overflowY:"auto", position:"relative",
      boxShadow:"0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
    close: {
      position:"absolute", top:16, right:16,
      background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
      color:"rgba(255,255,255,0.5)", width:28, height:28, borderRadius:"50%",
      cursor:"pointer", fontSize:18, lineHeight:1,
      display:"flex", alignItems:"center", justifyContent:"center",
      transition:"color 0.15s",
    },
    label: { 
      fontSize:9, letterSpacing:2, color:"#71717a", display:"block", 
      marginBottom:6, marginTop:16, textTransform:"uppercase", fontWeight:600 
    },
    input: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
      color:"#f4f4f5", padding:"9px 12px", borderRadius:9, width:"100%", fontSize:13,
      outline:"none", boxSizing:"border-box", transition:"border-color 0.15s",
    },
    textarea: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
      color:"#f4f4f5", padding:"9px 12px", borderRadius:9, width:"100%",
      fontSize:13, resize:"vertical", minHeight:70, outline:"none", boxSizing:"border-box",
    },
    btnSave: {
      marginTop:20, width:"100%", padding:"12px",
      background:"rgba(255,255,255,0.92)", color:"#080c14", fontWeight:700,
      border:"none", borderRadius:10, cursor:"pointer", fontSize:14,
      letterSpacing:0.2, transition:"opacity 0.15s",
    },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>
        <button style={S.close} onClick={onClose}>×</button>

        <div style={{ fontSize:9, color:"#71717a", letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>{pieza.sector}</div>
        <h2 style={{ margin:"6px 0 0", color:"#f4f4f5", fontFamily:"'Outfit',system-ui", fontSize:17, fontWeight:700 }}>
          {pieza.pieza}
          {pieza.opcional && <span style={{ marginLeft:8, fontSize:9, color:"#71717a", letterSpacing:1.5 }}>OPCIONAL</span>}
        </h2>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop: 16 }}>
          <div>
            <label style={S.label}>APURO / PRIORIDAD</label>
            <select style={S.input} value={form.prioridad} onChange={e => setForm(f=>({...f,prioridad:e.target.value}))}>
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>{/* Espacio vacío para grilla */}</div>
          <div>
            <label style={S.label}>FECHA ENVÍO</label>
            <input style={S.input} type="date"
              value={form.fecha_envio} onChange={e => setForm(f=>({...f,fecha_envio:e.target.value}))} />
          </div>
          <div>
            <label style={S.label}>FECHA REGRESO</label>
            <input style={S.input} type="date"
              value={form.fecha_regreso} onChange={e => setForm(f=>({...f,fecha_regreso:e.target.value}))} />
          </div>
        </div>

        <label style={S.label}>OBSERVACIONES</label>
        <textarea style={S.textarea} placeholder="Notas, aclaraciones..."
          value={form.observaciones} onChange={e => setForm(f=>({...f,observaciones:e.target.value}))} />

        <label style={S.label}>FOTO / REFERENCIA</label>
        <input style={S.input} placeholder="URL o descripción de foto"
          value={form.foto_ref} onChange={e => setForm(f=>({...f,foto_ref:e.target.value}))} />

        {form.foto_ref && form.foto_ref.startsWith("http") && (
          <img src={form.foto_ref} alt="" style={{ width:"100%", borderRadius:10, marginTop:10, maxHeight:200, objectFit:"contain", background:"#000" }} />
        )}

        <button style={S.btnSave} onClick={() => { onSave(pieza.id, form); onClose(); }}>
          Guardar Cambios
        </button>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function MarmoleriaScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  // Data
  const [lineas,   setLineas]   = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [piezas,   setPiezas]   = useState([]);   
  const [dashboard, setDashboard] = useState([]); // Datos para el panel global

  // UI
  const [lineaId,  setLineaId]  = useState(null);
  const [unidadId, setUnidadId] = useState(null);
  const [q,        setQ]        = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [modalPieza, setModalPieza] = useState(null);

  // Vista: "general" | "plantilla" | "barco" | "desmoldes" | "historial"
  const [viewMode, setViewMode] = useState("general");
  const [plantillaLinea, setPlantillaLinea] = useState([]);
  const [plantillaLoading, setPlantillaLoading] = useState(false);

  const [loading, setLoading]   = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [err, setErr]           = useState("");

  // Desmoldes & Historial
  const [desmoldesStatus,  setDesmoldesStatus]  = useState(new Set()); // codigos con plantillas ya enviadas
  const [historialEnvios,  setHistorialEnvios]  = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [showSQLModal,     setShowSQLModal]      = useState(false);
  const [sqlCopiado,       setSqlCopiado]        = useState("");

  // Nuevos campos
  const [newLinea,   setNewLinea]   = useState("");
  const [newUnidad,  setNewUnidad]  = useState("");
  const [showAddPieza, setShowAddPieza] = useState(false);
  const [formPieza, setFormPieza] = useState({ pieza:"", sector:"" });

  // Edición rápida (Líneas y Unidades)
  const [editLineaId, setEditLineaId] = useState(null);
  const [editLineaNombre, setEditLineaNombre] = useState("");
  const [editUnidadId, setEditUnidadId] = useState(null);
  const [editUnidadCodigo, setEditUnidadCodigo] = useState("");

  // ── DATOS DERIVADOS ───────────────────────────────────────────
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);
  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId),    [lineas, lineaId]);
  const porcentaje = useMemo(() => pct(piezas), [piezas]);

  const piezasFiltradas = useMemo(() => {
    let rows = piezas;
    if (filtroEstado !== "todos") rows = rows.filter(p => p.estado === filtroEstado);
    const qq = q.toLowerCase();
    if (qq) rows = rows.filter(p =>
      p.pieza.toLowerCase().includes(qq) ||
      p.sector.toLowerCase().includes(qq) ||
      (p.color ?? "").toLowerCase().includes(qq)
    );
    return rows;
  }, [piezas, filtroEstado, q]);

  const porSector = useMemo(() => {
    const map = {};
    piezasFiltradas.forEach(p => {
      if (!map[p.sector]) map[p.sector] = [];
      map[p.sector].push(p);
    });
    return map;
  }, [piezasFiltradas]);

  const stats = useMemo(() => ({
    total:     piezas.filter(p => p.estado !== "No lleva").length,
    recibido:  piezas.filter(p => p.estado === "Recibido").length,
    enviado:   piezas.filter(p => p.estado === "Enviado").length,
    pendiente: piezas.filter(p => p.estado === "Pendiente").length,
    rehacer:   piezas.filter(p => p.estado === "Rehacer").length,
  }), [piezas]);

  const pctColor = porcentaje === 100 ? "#10b981" : porcentaje > 0 ? "#a8b4c4" : "#2c3040";

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargarLineas() {
    const { data } = await supabase.from("marm_lineas").select("id,nombre").eq("activa",true).order("nombre");
    setLineas(data ?? []);
  }

  async function cargarUnidades(lid) {
    const { data } = await supabase.from("marm_unidades").select("id,codigo").eq("linea_id",lid).eq("activa",true).order("codigo");
    setUnidades(data ?? []);
  }

  async function cargarPiezas(uid) {
    setLoading(true);
    const { data, error } = await supabase
      .from("marm_unidad_piezas")
      .select("*")
      .eq("unidad_id", uid)
      .order("sector").order("created_at");
    if (error) setErr(error.message);
    setPiezas(data ?? []);
    setLoading(false);
  }

  // Cargar info de todas las unidades para el dashboard
  async function cargarDashboardGeneral() {
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo").eq("activa", true);
    if (!unidadesDB?.length) return;

    const idsUnidades = unidadesDB.map(u => u.id);
    const { data: piezasDB } = await supabase.from("marm_unidad_piezas")
      .select("*")
      .in("estado", ["Enviado", "Rehacer"])
      .in("unidad_id", idsUnidades)
      .order("fecha_envio", { ascending: false });

    const mapeadas = (piezasDB || []).map(p => {
      const u = unidadesDB.find(x => x.id === p.unidad_id);
      return { ...p, codigo_barco: u?.codigo || '-' };
    });
    
    setDashboard(mapeadas);
  }

  // Cargar qué barcos ya tienen plantillas enviadas (para panel Desmoldes)
  async function cargarDesmoldesStatus() {
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo").eq("activa", true);
    const { data: piezasDB }   = await supabase.from("marm_unidad_piezas").select("unidad_id").not("fecha_envio","is",null);
    const idsConEnvio = new Set((piezasDB || []).map(p => p.unidad_id));
    const codigos = new Set((unidadesDB || []).filter(u => idsConEnvio.has(u.id)).map(u => u.codigo));
    setDesmoldesStatus(codigos);
  }

  // Cargar historial completo de envíos (equivalente al SQL)
  async function cargarHistorialEnvios() {
    setHistorialLoading(true);
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo, linea_id").eq("activa", true);
    const { data: lineasDB }   = await supabase.from("marm_lineas").select("id, nombre").eq("activa", true);
    const { data: piezas }     = await supabase.from("marm_unidad_piezas")
      .select("unidad_id, pieza, sector, color, fecha_envio, fecha_regreso, estado, observaciones")
      .not("fecha_envio","is",null)
      .order("fecha_envio", { ascending: true });
    const mapped = (piezas || []).map(p => {
      const u = (unidadesDB || []).find(x => x.id === p.unidad_id);
      const l = (lineasDB   || []).find(x => x.id === u?.linea_id);
      return { ...p, codigo_barco: u?.codigo ?? "—", linea: l?.nombre ?? "—" };
    });
    setHistorialEnvios(mapped);
    setHistorialLoading(false);
  }

  useEffect(() => { 
    cargarLineas(); 
    cargarDashboardGeneral();
    cargarDesmoldesStatus();
  }, []);

  useEffect(() => { 
    if (lineaId) { 
      cargarUnidades(lineaId); 
      cargarPlantillaLinea(lineaId);
      setUnidadId(null); 
      setPiezas([]);
      setViewMode("plantilla");
    } 
  }, [lineaId]);

  useEffect(() => { 
    if (unidadId) {
      cargarPiezas(unidadId);
      setViewMode("barco");
    } else if (!lineaId) {
      cargarDashboardGeneral();
    }
  }, [unidadId]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("rt-marm")
      .on("postgres_changes", { event:"*", schema:"public", table:"marm_unidad_piezas" }, () => {
        if (unidadId) cargarPiezas(unidadId);
        cargarDashboardGeneral();
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [unidadId]);

  // ── ACCIONES ──────────────────────────────────────────────────
  async function crearLinea() {
    if (!newLinea.trim()) return;
    const { error } = await supabase.from("marm_lineas").insert({ nombre: newLinea.trim().toUpperCase() });
    if (error) return setErr(error.message);
    setNewLinea("");
    cargarLineas();
  }

  async function eliminarLinea(lid) {
    if (!window.confirm("¿Eliminar esta línea y todos sus barcos?")) return;
    await supabase.from("marm_lineas").update({ activa:false }).eq("id", lid);
    setLineaId(null);
    cargarLineas();
  }

  async function guardarEditLinea(id) {
    if (!editLineaNombre.trim()) {
      setEditLineaId(null);
      return;
    }
    await supabase.from("marm_lineas").update({ nombre: editLineaNombre.trim().toUpperCase() }).eq("id", id);
    setEditLineaId(null);
    cargarLineas();
  }

  async function crearUnidad() {
    if (!newUnidad.trim() || !lineaId) return;
    // 1. Crear unidad
    const { data: u, error } = await supabase
      .from("marm_unidades")
      .insert({ linea_id:lineaId, codigo:newUnidad.trim() })
      .select().single();
    if (error) return setErr(error.message);

    // 2. Copiar plantilla de la línea automáticamente
    const { data: plantilla } = await supabase
      .from("marm_linea_piezas")
      .select("*")
      .eq("linea_id", lineaId)
      .order("orden");

    if (plantilla?.length) {
      const inserts = plantilla.map(p => ({
        unidad_id: u.id,
        pieza_id:  p.id,
        pieza:     p.pieza,
        sector:    p.sector,
        opcional:  p.opcional,
        estado:    "Pendiente",
      }));
      await supabase.from("marm_unidad_piezas").insert(inserts);
    }

    setNewUnidad("");
    cargarUnidades(lineaId);
    setUnidadId(u.id);
  }

  async function eliminarUnidad(uid) {
    if (!window.confirm("¿Eliminar este barco y su checklist?")) return;
    await supabase.from("marm_unidades").update({ activa:false }).eq("id", uid);
    setUnidadId(null);
    setPiezas([]);
    cargarUnidades(lineaId);
  }

  async function cargarPlantillaLinea(lid) {
    setPlantillaLoading(true);
    const { data } = await supabase
      .from("marm_linea_piezas")
      .select("*")
      .eq("linea_id", lid)
      .order("sector").order("orden");
    setPlantillaLinea(data ?? []);
    setPlantillaLoading(false);
  }

  async function eliminarPiezaPlantilla(piezaId) {
    if (!window.confirm("¿Quitar esta pieza de la plantilla? No afecta barcos existentes.")) return;
    await supabase.from("marm_linea_piezas").delete().eq("id", piezaId);
    setPlantillaLinea(prev => prev.filter(p => p.id !== piezaId));
  }

  async function guardarEditUnidad(id) {
    if (!editUnidadCodigo.trim()) {
      setEditUnidadId(null);
      return;
    }
    await supabase.from("marm_unidades").update({ codigo: editUnidadCodigo.trim() }).eq("id", id);
    setEditUnidadId(null);
    cargarUnidades(lineaId);
  }

  async function setEstado(piezaId, estado) {
    // Si cambia a Recibido y no tiene fecha_regreso, poner hoy
    const upd = { estado };
    if (estado === "Recibido") upd.fecha_regreso = upd.fecha_regreso || new Date().toISOString().slice(0,10);
    if (estado === "Enviado")  upd.fecha_envio   = upd.fecha_envio   || new Date().toISOString().slice(0,10);
    await supabase.from("marm_unidad_piezas").update(upd).eq("id", piezaId);
    setPiezas(prev => prev.map(p => p.id === piezaId ? {...p, ...upd} : p));
  }

  async function guardarDetalle(piezaId, form) {
    // Convertir strings vacíos a null para columnas date
    const formLimpio = {
      ...form,
      fecha_envio:   form.fecha_envio   || null,
      fecha_regreso: form.fecha_regreso || null,
      observaciones: form.observaciones || null,
      foto_ref:      form.foto_ref      || null,
    };

    const { data, error } = await supabase
      .from("marm_unidad_piezas")
      .update(formLimpio)
      .eq("id", piezaId)
      .select()
      .single();

    if (error) { setErr("Error al guardar: " + error.message); return; }

    setPiezas(prev => prev.map(p => p.id === piezaId ? { ...p, ...(data ?? formLimpio) } : p));
    cargarDashboardGeneral();
  }

  async function cambiarColorSector(sector, nuevoColor) {
    const piezasSector = piezas.filter(p => p.sector === sector);
    const ids = piezasSector.map(p => p.id);
    if (!ids.length) return;

    // Actualizar visualmente al instante
    setPiezas(prev => prev.map(p => p.sector === sector ? { ...p, color: nuevoColor } : p));

    // Actualizar en la base de datos
    const { error } = await supabase
      .from("marm_unidad_piezas")
      .update({ color: nuevoColor })
      .in("id", ids);

    if (error) {
      setErr("Error al actualizar el color: " + error.message);
      cargarPiezas(unidadId); // Revierte en caso de error
    }
  }

  async function agregarPiezaManual() {
    if (!formPieza.pieza.trim() || !formPieza.sector.trim() || !unidadId) return;
    const { error } = await supabase.from("marm_unidad_piezas").insert({
      unidad_id: unidadId,
      pieza:     formPieza.pieza.trim(),
      sector:    formPieza.sector.trim(),
      estado:    "Pendiente",
    });
    if (error) return setErr(error.message);
    setFormPieza({ pieza:"", sector:"" });
    setShowAddPieza(false);
    cargarPiezas(unidadId);
  }

  async function eliminarPieza(piezaId) {
    if (!window.confirm("¿Quitar esta pieza del checklist?")) return;
    await supabase.from("marm_unidad_piezas").delete().eq("id", piezaId);
    setPiezas(prev => prev.filter(p => p.id !== piezaId));
  }

  // Agregar a la plantilla general de la línea
  async function agregarPiezaAPlantilla() {
    if (!formPieza.pieza.trim() || !formPieza.sector.trim() || !lineaId) return;
    const { data:lp, error } = await supabase.from("marm_linea_piezas").insert({
      linea_id: lineaId,
      pieza:    formPieza.pieza.trim(),
      sector:   formPieza.sector.trim(),
    }).select().single();
    if (error) return setErr(error.message);
    
    if (unidadId) {
      await supabase.from("marm_unidad_piezas").insert({
        unidad_id: unidadId,
        pieza_id:  lp.id,
        pieza:     lp.pieza,
        sector:    lp.sector,
        estado:    "Pendiente",
      });
    }
    setFormPieza({ pieza:"", sector:"" });
    setShowAddPieza(false);
    if (unidadId) cargarPiezas(unidadId);
  }

  // ── EXPORTACIÓN GLOBAL A PDF CON LOGO ─────────────────────────────
  async function exportarPDFGeneral() {
    setIsExporting(true);
    try {
      // 1. Cargar jsPDF
      const doc = new jsPDF();
      
      // 2. Agregar el logo de Klase A
      const img = new Image();
      img.src = logoKlaseA;
      // Esperamos que la imagen cargue por si acaso (para evitar errores en algunos navegadores)
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // Si falla la imagen, que siga igual
      });
      // Posición x, y, ancho, alto. Ajustá los números si el logo se ve deforme
      doc.addImage(img, 'PNG', 14, 12, 45, 15);

      // 3. Títulos
      doc.setFontSize(16);
      doc.text("Reporte de Marmolería", 14, 38);
      
      doc.setFontSize(10);
      doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 44);

      if (!dashboard || dashboard.length === 0) {
        alert("No hay piezas enviadas en ninguna de las obras para exportar.");
        setIsExporting(false);
        return;
      }

      // 4. Ordenamos para el PDF (por barco y luego sector)
      const dataPDF = [...dashboard].sort((a, b) => {
        if (a.codigo_barco !== b.codigo_barco) return a.codigo_barco.localeCompare(b.codigo_barco);
        return (a.sector || "").localeCompare(b.sector || "");
      });

      // 5. Preparamos las filas para la tabla (igual al Google Sheets de ejemplo)
      // Pre-computar el color por barco+sector (tomando el primero no vacío)
      const colorPorSector = {};
      dataPDF.forEach(p => {
        const key = `${p.codigo_barco}__${p.sector}`;
        if (!colorPorSector[key] && (p.color || p.sector_color)) {
          colorPorSector[key] = p.color || p.sector_color;
        }
      });

      const rows = dataPDF.map(p => {
        let fechaEnvioFormateada = p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "-";
        const key = `${p.codigo_barco}__${p.sector}`;
        const colorMostrar = p.color || p.sector_color || colorPorSector[key] || "-";
        return [
          p.codigo_barco,
          fechaEnvioFormateada,
          p.pieza || "-",
          colorMostrar,
          p.sector || "-",
          "1",
          p.estado,
          p.observaciones || ""
        ];
      });

      // 6. Generar Tabla
      autoTable(doc, {
        startY: 50, // Arranca más abajo para no pisar el logo ni los títulos
        head: [["Unidad", "Fecha envío", "Tipo plantilla", "Color", "Sector", "Cantidad", "Estado", "Observaciones"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [14, 18, 28] }, // Color oscuro tipo UI
        columnStyles: { 
          7: { cellWidth: 35 } // Darle más ancho a la columna de observaciones
        } 
      });

      // 7. Guardar el archivo
      doc.save(`Marmoleria_Global_${new Date().toLocaleDateString().replace(/\//g, "-")}.pdf`);
      
    } catch (e) {
      console.error(e);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsExporting(false);
    }
  }

  // ── ESTILOS ───────────────────────────────────────────────────
  const C2 = {
    bg:      "#07080d",
    s0:      "rgba(255,255,255,0.03)",
    s1:      "rgba(255,255,255,0.055)",
    b0:      "rgba(255,255,255,0.07)",
    b1:      "rgba(255,255,255,0.14)",
    t0:      "#eeeef0",
    t1:      "#9da3b0",
    t2:      "#555d6e",
    mono:    "'JetBrains Mono', monospace",
    sans:    "'Outfit', system-ui, sans-serif",
    green:   "#10b981",
    red:     "#ef4444",
    amber:   "#f59e0b",
    primary: "#3b82f6",
    blue:    "#3b82f6",
  };
  const GLASS = { backdropFilter:"blur(32px) saturate(130%)", WebkitBackdropFilter:"blur(32px) saturate(130%)" };
  const INP   = { background:"rgba(255,255,255,0.04)", border:`1px solid ${C2.b0}`, color:C2.t0, padding:"7px 10px", borderRadius:7, fontSize:12, outline:"none", width:"100%", fontFamily:C2.sans, boxSizing:"border-box" };
  const INP_SM = { ...INP, padding:"5px 8px", fontSize:11 };

  const lineaNavBtn = (sel) => ({
    width:"100%", textAlign:"left", padding:"9px 14px",
    border:"none", borderBottom:`1px solid rgba(255,255,255,0.025)`,
    background: sel ? "rgba(59,130,246,0.1)" : "transparent",
    color: sel ? "#93b4ff" : C2.t2,
    cursor:"pointer", fontSize:12, fontWeight: sel ? 600 : 400,
    display:"flex", justifyContent:"space-between", alignItems:"center",
    fontFamily: C2.sans,
    borderLeft: sel ? `2px solid ${C2.primary}` : "2px solid transparent",
    transition:"all 0.15s",
  });

  const unidadNavBtn = (sel) => ({
    ...lineaNavBtn(sel),
    paddingLeft:24, fontSize:11,
    background: sel ? "rgba(59,130,246,0.08)" : "transparent",
    color: sel ? C2.t0 : "#3a4455",
    borderLeft: sel ? `2px solid ${C2.primary}` : "2px solid transparent",
  });

  const estadoSelectStyle = (estado) => {
    const m = ESTADO_META[estado] ?? ESTADO_META["Pendiente"];
    return {
      background: m.bg, color: m.color,
      border: `1px solid ${m.border || C2.b0}`,
      padding:"4px 9px", borderRadius:7,
      cursor:"pointer", fontSize:11, fontWeight:600, outline:"none",
      fontFamily: C2.sans,
    };
  };

  // ── KPI data ────────────────────────────────────────────────
  const kpis = [
    {
      label:"Total Envíos",
      value: dashboard.filter(p => p.estado === "Enviado").length,
      sub: `${dashboard.length} en seguimiento`,
      color:"#3b82f6",
      icon:(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
        </svg>
      ),
    },
    {
      label:"Pendientes",
      value: dashboard.filter(p => p.estado === "Enviado").length,
      sub: "Sin confirmar recepción",
      color:"#f59e0b",
      icon:(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      label:"Para Rehacer",
      value: dashboard.filter(p => p.estado === "Rehacer").length,
      sub: dashboard.filter(p=>p.estado==="Rehacer").length > 0 ? "Crítico — requiere atención" : "Sin ítems críticos",
      color: dashboard.filter(p=>p.estado==="Rehacer").length > 0 ? "#ef4444" : "#10b981",
      icon:(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      label:"Completado",
      value: `${unidadId ? porcentaje : (() => {
        const total = dashboard.length; if(!total) return 0;
        return Math.round(dashboard.filter(p=>p.estado==="Recibido").length / total * 100);
      })()}%`,
      sub: unidadId ? `${stats.recibido}/${stats.total} piezas recibidas` : "Promedio general",
      color:"#10b981",
      big: true,
      icon:(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
    },
  ];


  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ background:C2.bg, position:"fixed", inset:0, overflow:"hidden", color:C2.t0, fontFamily:C2.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        select option { background:#0a0c12; color:#9da3b0; }
        ::-webkit-scrollbar { width:2px; height:2px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.06); border-radius:99px; }
        input:focus, select:focus, textarea:focus { border-color:rgba(59,130,246,0.4) !important; outline:none; }
        @keyframes slideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(8px)}  to{opacity:1;transform:translateX(0)} }
        @keyframes kpiFadeIn { from{opacity:0;transform:translateY(8px) scale(0.97)} to{opacity:1;transform:none} }
        .pieza-row:hover { background:rgba(255,255,255,0.022) !important; }
        .dash-row:hover  { background:rgba(255,255,255,0.025) !important; }
        .nav-btn-item:hover { background:rgba(255,255,255,0.03) !important; color:#9da3b0 !important; }
        .kpi-card { transition:transform 0.18s ease, border-color 0.18s ease; }
        .kpi-card:hover { transform:translateY(-2px) !important; border-color:rgba(255,255,255,0.1) !important; }
        .action-btn:hover { opacity:0.75; }
        .edit-btn:hover { color:#eeeef0 !important; }
        .del-btn:hover  { color:#ef4444 !important; }
      `}</style>

      {/* Fondo ambiental */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, background:[
        "radial-gradient(ellipse 90% 45% at 50% -5%, rgba(59,130,246,0.06) 0%, transparent 60%)",
        "radial-gradient(ellipse 35% 25% at 5% 100%, rgba(16,185,129,0.03) 0%, transparent 50%)",
      ].join(",") }}/>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, opacity:0.38,
        backgroundImage:["linear-gradient(rgba(255,255,255,0.013) 1px,transparent 1px)","linear-gradient(90deg,rgba(255,255,255,0.013) 1px,transparent 1px)"].join(","),
        backgroundSize:"52px 52px" }}/>

      <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", height:"100vh", overflow:"hidden", position:"relative", zIndex:1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{ height:54, background:"rgba(7,8,13,0.94)", backdropFilter:"blur(32px) saturate(130%)", WebkitBackdropFilter:"blur(32px) saturate(130%)",
            borderBottom:`1px solid ${C2.b0}`, padding:"0 22px",
            display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>

            {/* Título */}
            <div style={{ display:"flex", flexDirection:"column", gap:1, minWidth:0, flexShrink:0 }}>
              <span style={{ fontSize:7.5, color:C2.t2, letterSpacing:3, textTransform:"uppercase", fontFamily:C2.mono, lineHeight:1 }}>Producción</span>
              <span style={{ fontSize:15, fontWeight:700, color:C2.t0, lineHeight:1.15, letterSpacing:-0.2 }}>
                Marmolería
                {unidadId && <span style={{ fontWeight:400, color:C2.t2, fontSize:13 }}> · {lineaSel?.nombre} — {unidadSel?.codigo}</span>}
              </span>
            </div>

            <div style={{ width:1, height:24, background:C2.b0, flexShrink:0 }} />

            {/* Stats chips */}
            {unidadId ? (
              <div style={{ display:"flex", gap:5 }}>
                {[
                  { label:"Recibidas",  n:stats.recibido,  c:C2.green },
                  { label:"Enviadas",   n:stats.enviado,   c:C2.t1   },
                  { label:"Pendientes", n:stats.pendiente, c:C2.t2   },
                  ...(stats.rehacer > 0 ? [{ label:"Rehacer", n:stats.rehacer, c:C2.red }] : []),
                ].map(({ label, n, c }) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:6,
                    background:C2.s0, border:`1px solid ${C2.b0}`, borderLeft:`2px solid ${c}` }}>
                    <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:c, lineHeight:1 }}>{n}</span>
                    <span style={{ fontSize:8, color:C2.t1, letterSpacing:2, textTransform:"uppercase" }}>{label}</span>
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:6,
                  background: pctColor === C2.green ? "rgba(16,185,129,0.08)" : C2.s0,
                  border:`1px solid ${pctColor === C2.green ? "rgba(16,185,129,0.2)" : C2.b0}` }}>
                  <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:pctColor }}>{porcentaje}%</span>
                </div>
              </div>
            ) : (
              dashboard.length > 0 && (
                <div style={{ display:"flex", gap:5 }}>
                  {[
                    { label:"Enviadas", n:dashboard.filter(p=>p.estado==="Enviado").length, c:C2.t1 },
                    { label:"Rehacer",  n:dashboard.filter(p=>p.estado==="Rehacer").length, c:C2.red },
                  ].filter(x => x.n > 0).map(({ label, n, c }) => (
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", borderRadius:6,
                      background:C2.s0, border:`1px solid ${C2.b0}`, borderLeft:`2px solid ${c}` }}>
                      <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:c }}>{n}</span>
                      <span style={{ fontSize:8, color:C2.t1, letterSpacing:2, textTransform:"uppercase" }}>{label}</span>
                    </div>
                  ))}
                </div>
              )
            )}

            <div style={{ flex:1 }} />

            {/* Acciones */}
            {unidadId && esAdmin && (
              <button className="action-btn" onClick={() => setShowAddPieza(v => !v)} style={{
                display:"flex", alignItems:"center", gap:6,
                border:`1px solid ${C2.b0}`, background:"transparent", color:C2.t1,
                padding:"6px 13px", borderRadius:8, cursor:"pointer", fontFamily:C2.sans, fontSize:11, transition:"opacity 0.15s" }}>
                <span style={{ fontSize:14, lineHeight:1 }}>{showAddPieza ? "✕" : "+"}</span>
                {showAddPieza ? "Cancelar" : "Pieza extra"}
              </button>
            )}
            <button className="action-btn" onClick={exportarPDFGeneral} disabled={isExporting} style={{
              display:"flex", alignItems:"center", gap:6,
              border:"1px solid rgba(16,185,129,0.28)", background:"rgba(16,185,129,0.07)",
              color:C2.green, padding:"6px 14px", borderRadius:8, cursor:"pointer",
              fontFamily:C2.sans, fontSize:11, transition:"opacity 0.15s", fontWeight:600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isExporting ? "Generando…" : "Exportar PDF"}
            </button>
          </div>

          {/* ── KPI CARDS ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, padding:"14px 22px 0", flexShrink:0 }}>
            {kpis.map((k, i) => (
              <div key={k.label} className="kpi-card" style={{
                background:"linear-gradient(135deg, rgba(255,255,255,0.038) 0%, rgba(255,255,255,0.016) 100%)",
                border:`1px solid ${C2.b0}`, borderRadius:12,
                padding:"14px 16px 13px", position:"relative", overflow:"hidden",
                animation:`kpiFadeIn 0.45s cubic-bezier(0.22,1,0.36,1) ${i*60}ms both`,
              }}>
                <div style={{ position:"absolute", top:-24, right:-24, width:90, height:90, borderRadius:"50%",
                  background:`${k.color}16`, filter:"blur(22px)", pointerEvents:"none" }}/>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9 }}>
                  <span style={{ fontSize:8.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:600, fontFamily:C2.mono }}>
                    {k.label}
                  </span>
                  <div style={{ color:`${k.color}80`, display:"flex" }}>{k.icon}</div>
                </div>
                <div style={{ fontFamily:C2.mono, fontSize:k.big ? 30 : 26, fontWeight:800,
                  color:k.color, lineHeight:1, letterSpacing:"-1px", marginBottom:6 }}>
                  {k.value}
                </div>
                <div style={{ fontSize:10, color:C2.t2, lineHeight:1.4 }}>{k.sub}</div>
                <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, borderRadius:"0 0 12px 12px",
                  background:`linear-gradient(90deg, transparent, ${k.color}45, transparent)` }}/>
              </div>
            ))}
          </div>

          {/* ── FILTERBAR ── */}
          {unidadId && (
            <div style={{ height:38, background:"rgba(7,8,13,0.88)", backdropFilter:"blur(32px) saturate(130%)", WebkitBackdropFilter:"blur(32px) saturate(130%)",
              borderBottom:`1px solid ${C2.b0}`, padding:"0 22px", marginTop:12,
              display:"flex", alignItems:"center", gap:5, flexShrink:0, overflowX:"auto" }}>
              <span style={{ fontSize:8, color:C2.t2, letterSpacing:2, textTransform:"uppercase", flexShrink:0, fontFamily:C2.mono }}>Estado</span>
              {["todos", ...ESTADOS].map(e => {
                const m = ESTADO_META[e];
                const active = filtroEstado === e;
                return (
                  <button key={e} onClick={() => setFiltroEstado(e)} style={{
                    border: active ? `1px solid ${m?.border ?? C2.b1}` : "1px solid transparent",
                    background: active ? (m?.bg ?? C2.s1) : "transparent",
                    color: active ? (m?.color ?? C2.t0) : C2.t2,
                    padding:"2px 10px", borderRadius:5, cursor:"pointer", fontSize:10,
                    whiteSpace:"nowrap", fontFamily:C2.sans, transition:"all 0.12s",
                  }}>{e === "todos" ? "Todas" : e}</button>
                );
              })}
              <div style={{ width:1, height:12, background:C2.b0, margin:"0 4px", flexShrink:0 }} />
              <input style={{ ...INP_SM, width:190, flexShrink:0 }}
                placeholder="⌕  Buscar pieza o sector…"
                value={q} onChange={e => setQ(e.target.value)} />
            </div>
          )}

          {/* ── SPLIT CONTENT ── */}
          <div style={{ flex:1, overflow:"hidden", display:"grid", gridTemplateColumns:"236px 1fr", marginTop: unidadId ? 0 : 12 }}>

            {/* ── LEFT NAV ── */}
            <div style={{ borderRight:`1px solid ${C2.b0}`, background:"rgba(7,8,13,0.97)", display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

              {/* Encabezado nav */}
              <div style={{ padding:"11px 14px 9px", borderBottom:`1px solid ${C2.b0}`, flexShrink:0 }}>
                <div style={{ fontSize:7.5, letterSpacing:3, color:C2.t2, textTransform:"uppercase", fontFamily:C2.mono, marginBottom:1 }}>Líneas</div>
                <div style={{ fontSize:11, color:C2.t1, fontWeight:500 }}>Proyectos activos</div>
              </div>

              {/* Panel general btn */}
              <button className="nav-btn-item" onClick={() => { setUnidadId(null); setLineaId(null); setViewMode("general"); cargarDashboardGeneral(); }} style={{
                width:"100%", textAlign:"left", padding:"10px 14px",
                border:"none", borderBottom:`1px solid rgba(255,255,255,0.025)`,
                background: viewMode === "general" && !unidadId && !lineaId ? "rgba(59,130,246,0.09)" : "transparent",
                color: viewMode === "general" && !unidadId && !lineaId ? "#93b4ff" : C2.t2,
                cursor:"pointer", fontSize:11, fontWeight: viewMode === "general" && !unidadId && !lineaId ? 600 : 400,
                display:"flex", alignItems:"center", gap:8, fontFamily:C2.sans,
                letterSpacing:0.3, textTransform:"uppercase",
                borderLeft: viewMode === "general" && !unidadId && !lineaId ? `2px solid ${C2.primary}` : "2px solid transparent",
                transition:"all 0.15s",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
                Panel General
              </button>

              {/* Desmoldes btn */}
              {(() => {
                const selDesmoldes = viewMode === "desmoldes" && !unidadId;
                const urgentes = DESMOLDES_DATA.filter(d => {
                  const dias = diasHastaPlantilla(d.desmolde, d.linea);
                  return !desmoldesStatus.has(d.barco) && dias >= -14 && dias <= 30;
                }).length;
                return (
                  <button className="nav-btn-item" onClick={() => { setUnidadId(null); setLineaId(null); setViewMode("desmoldes"); }} style={{
                    width:"100%", textAlign:"left", padding:"10px 14px",
                    border:"none", borderBottom:`1px solid rgba(255,255,255,0.025)`,
                    background: selDesmoldes ? "rgba(239,68,68,0.07)" : "transparent",
                    color: selDesmoldes ? "#fca5a5" : C2.t2,
                    cursor:"pointer", fontSize:11, fontWeight: selDesmoldes ? 600 : 400,
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    fontFamily:C2.sans, letterSpacing:0.3, textTransform:"uppercase",
                    borderLeft: selDesmoldes ? "2px solid #ef4444" : "2px solid transparent",
                    transition:"all 0.15s",
                  }}>
                    <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      Desmoldes
                    </span>
                    {urgentes > 0 && (
                      <span style={{ fontSize:9, fontWeight:800, color:"#ef4444", background:"rgba(239,68,68,0.15)",
                        border:"1px solid rgba(239,68,68,0.3)", padding:"1px 6px", borderRadius:99, fontFamily:C2.mono }}>
                        {urgentes}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* Historial btn */}
              {(() => {
                const selHistorial = viewMode === "historial" && !unidadId;
                return (
                  <button className="nav-btn-item" onClick={() => { setUnidadId(null); setLineaId(null); setViewMode("historial"); cargarHistorialEnvios(); }} style={{
                    width:"100%", textAlign:"left", padding:"10px 14px",
                    border:"none", borderBottom:`1px solid rgba(255,255,255,0.025)`,
                    background: selHistorial ? "rgba(168,180,196,0.07)" : "transparent",
                    color: selHistorial ? "#a8b4c4" : C2.t2,
                    cursor:"pointer", fontSize:11, fontWeight: selHistorial ? 600 : 400,
                    display:"flex", alignItems:"center", gap:8, fontFamily:C2.sans,
                    letterSpacing:0.3, textTransform:"uppercase",
                    borderLeft: selHistorial ? "2px solid #a8b4c4" : "2px solid transparent",
                    transition:"all 0.15s",
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    Historial
                  </button>
                );
              })()}

              {/* Líneas + unidades */}
              <div style={{ flex:1, overflowY:"auto" }}>
                {lineas.map(l => {
                  const selLinea = lineaId === l.id;
                  return (
                    <div key={l.id}>
                      <button className="nav-btn-item" style={{
                        width:"100%", textAlign:"left", padding:"9px 14px",
                        border:"none", borderBottom:`1px solid rgba(255,255,255,0.025)`,
                        background: selLinea ? "rgba(59,130,246,0.09)" : "transparent",
                        color: selLinea ? "#93b4ff" : C2.t2,
                        cursor:"pointer", fontSize:12, fontWeight: selLinea ? 600 : 400,
                        display:"flex", justifyContent:"space-between", alignItems:"center",
                        fontFamily:C2.sans,
                        borderLeft: selLinea ? `2px solid ${C2.primary}` : "2px solid transparent",
                        transition:"all 0.15s",
                      }} onClick={() => { setLineaId(l.id); setUnidadId(null); setViewMode("plantilla"); }}>
                        <span style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0 }}>
                          <div style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
                            background: selLinea ? C2.primary : "#2c3546",
                            boxShadow: selLinea ? `0 0 8px ${C2.primary}88` : "none",
                            transition:"all 0.2s" }} />
                          {editLineaId === l.id ? (
                            <input autoFocus style={{ ...INP_SM, flex:1, margin:0, padding:"2px 6px", fontSize:11 }}
                              value={editLineaNombre}
                              onChange={e => setEditLineaNombre(e.target.value)}
                              onBlur={() => guardarEditLinea(l.id)}
                              onKeyDown={e => e.key === "Enter" && guardarEditLinea(l.id)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.nombre}</span>
                          )}
                        </span>
                        {esAdmin && selLinea && editLineaId !== l.id && (
                          <div style={{ display:"flex", gap:2, flexShrink:0 }}>
                            <span className="edit-btn" onClick={e => { e.stopPropagation(); setEditLineaNombre(l.nombre); setEditLineaId(l.id); }}
                              style={{ fontSize:10, color:C2.t2, cursor:"pointer", padding:"2px 5px", borderRadius:4, transition:"color 0.12s" }}>✎</span>
                            <span className="del-btn" onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}
                              style={{ fontSize:13, color:C2.t2, cursor:"pointer", padding:"2px 5px", borderRadius:4, transition:"color 0.12s" }}>×</span>
                          </div>
                        )}
                      </button>

                      {selLinea && (
                        <>
                          {unidades.map(u => (
                            <button key={u.id} className="nav-btn-item" style={{
                              width:"100%", textAlign:"left", padding:"8px 14px 8px 24px",
                              border:"none", borderBottom:`1px solid rgba(255,255,255,0.02)`,
                              background: unidadId===u.id ? "rgba(59,130,246,0.07)" : "transparent",
                              color: unidadId===u.id ? C2.t0 : "#3a4455",
                              cursor:"pointer", fontSize:11,
                              display:"flex", alignItems:"center", justifyContent:"space-between",
                              fontFamily:C2.mono,
                              borderLeft: unidadId===u.id ? `2px solid ${C2.primary}` : "2px solid transparent",
                              transition:"all 0.15s",
                            }} onClick={() => setUnidadId(u.id)}>
                              {editUnidadId === u.id ? (
                                <input autoFocus style={{ ...INP_SM, flex:1, padding:"2px 6px", fontSize:11, fontFamily:C2.mono }}
                                  value={editUnidadCodigo}
                                  onChange={e => setEditUnidadCodigo(e.target.value)}
                                  onBlur={() => guardarEditUnidad(u.id)}
                                  onKeyDown={e => e.key === "Enter" && guardarEditUnidad(u.id)}
                                  onClick={e => e.stopPropagation()} />
                              ) : (
                                <span style={{ flex:1 }}>{u.codigo}</span>
                              )}
                              {esAdmin && unidadId === u.id && editUnidadId !== u.id && (
                                <div style={{ display:"flex", gap:2 }}>
                                  <span className="edit-btn" onClick={e => { e.stopPropagation(); setEditUnidadCodigo(u.codigo); setEditUnidadId(u.id); }}
                                    style={{ fontSize:10, color:C2.t2, cursor:"pointer", padding:"2px 4px", transition:"color 0.12s" }}>✎</span>
                                  <span className="del-btn" onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}
                                    style={{ fontSize:12, color:C2.t2, cursor:"pointer", padding:"2px 4px", transition:"color 0.12s" }}>×</span>
                                </div>
                              )}
                            </button>
                          ))}
                          {esAdmin && (
                            <div style={{ padding:"5px 14px 8px 24px", display:"flex", gap:5 }}>
                              <input style={{ ...INP_SM, flex:1 }} placeholder="Nuevo barco…"
                                value={newUnidad} onChange={e => setNewUnidad(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && crearUnidad()} />
                              <button style={{ border:`1px solid ${C2.b0}`, background:C2.s0, color:C2.t0, padding:"4px 10px", borderRadius:7, cursor:"pointer", fontFamily:C2.sans }} onClick={crearUnidad}>+</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Nueva línea */}
              {esAdmin && (
                <div style={{ padding:"10px 14px", borderTop:`1px solid ${C2.b0}`, flexShrink:0 }}>
                  <div style={{ fontSize:8, letterSpacing:2, color:C2.t2, textTransform:"uppercase", marginBottom:5, fontFamily:C2.mono }}>Nueva línea</div>
                  <div style={{ display:"flex", gap:5 }}>
                    <input style={{ ...INP_SM, flex:1 }} placeholder="Ej: K65"
                      value={newLinea} onChange={e => setNewLinea(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && crearLinea()} />
                    <button style={{ border:`1px solid ${C2.b0}`, background:C2.s0, color:C2.t0, padding:"4px 10px", borderRadius:7, cursor:"pointer", fontFamily:C2.sans }} onClick={crearLinea}>+</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── PANEL DERECHO ── */}
            <div style={{ height:"100%", overflowY:"auto" }}>

              {/* ════ DESMOLDES — PENDIENTES DE PLANTILLA ════ */}
              {viewMode === "desmoldes" && !unidadId && (() => {
                const fmtDate = s => s ? s.split("-").reverse().join("/") : "—";
                const rows = DESMOLDES_DATA.map(d => {
                  const gap = GAP_POR_LINEA[d.linea] ?? 128;
                  const estFecha = fechaEstPlantilla(d.desmolde, d.linea);
                  const estStr = estFecha.toISOString().split("T")[0];
                  const dias = diasHastaPlantilla(d.desmolde, d.linea);
                  return { ...d, gap, estStr, dias, tieneTemplates: desmoldesStatus.has(d.barco) };
                }).sort((a, b) => a.dias - b.dias);

                const urgentes = rows.filter(r => !r.tieneTemplates && r.dias >= -14 && r.dias <= 30).length;

                return (
                  <div style={{ padding:"22px 26px", animation:"slideUp .28s ease" }}>
                    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:8, color:C2.t2, letterSpacing:3, textTransform:"uppercase", fontFamily:C2.mono, marginBottom:5 }}>Producción 2026</div>
                        <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:C2.t0, letterSpacing:-0.3 }}>Desmoldes & Plantillas</h1>
                        <p style={{ color:C2.t2, fontSize:11, margin:"4px 0 0" }}>
                          Fecha estimada = desmolde + gap histórico por línea
                          &nbsp;·&nbsp; K37 <strong style={{ color:C2.t1 }}>104d</strong>
                          &nbsp;· K42 <strong style={{ color:C2.t1 }}>127d</strong>
                          &nbsp;· K43/K34 <strong style={{ color:C2.t1 }}>~128d</strong>
                          &nbsp;· K52 <strong style={{ color:C2.t1 }}>153d</strong>
                        </p>
                      </div>
                      {urgentes > 0 && (
                        <div style={{ padding:"6px 14px", borderRadius:8, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", textAlign:"center", flexShrink:0 }}>
                          <div style={{ fontFamily:C2.mono, fontSize:20, fontWeight:800, color:"#ef4444" }}>{urgentes}</div>
                          <div style={{ fontSize:8, color:"#ef4444", letterSpacing:1.5, textTransform:"uppercase" }}>Pedir ya</div>
                        </div>
                      )}
                    </div>

                    <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`, borderRadius:12, overflow:"hidden" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"55px 76px 100px 50px 110px 90px 130px",
                        gap:8, padding:"9px 16px", borderBottom:`1px solid ${C2.b0}`,
                        background:"rgba(255,255,255,0.02)" }}>
                        {["Línea","Barco","Desmolde","Gap","Est. plantilla","Días","Estado"].map((h,i) => (
                          <div key={i} style={{ fontSize:7.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:700, fontFamily:C2.mono }}>{h}</div>
                        ))}
                      </div>

                      {rows.map((d, idx) => {
                        const urg = urgenciaPlantilla(d.dias, d.tieneTemplates);
                        const diasLabel = d.dias > 0 ? `En ${d.dias}d`
                          : d.dias === 0 ? "Hoy"
                          : `Hace ${Math.abs(d.dias)}d`;
                        const diasColor = d.tieneTemplates ? C2.t2
                          : d.dias <= 30 && d.dias >= -14 ? "#ef4444"
                          : d.dias <= 60 ? "#f59e0b"
                          : C2.t2;
                        const highlight = !d.tieneTemplates && d.dias >= -14 && d.dias <= 30;
                        return (
                          <div key={d.barco} style={{
                            display:"grid", gridTemplateColumns:"55px 76px 100px 50px 110px 90px 130px",
                            gap:8, alignItems:"center", padding:"10px 16px",
                            borderBottom:`1px solid rgba(255,255,255,0.025)`,
                            background: highlight ? "rgba(239,68,68,0.03)" : "transparent",
                            animation:`slideUp 0.28s ease ${Math.min(idx,12)*18}ms both`,
                          }}>
                            <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>{d.linea}</div>
                            <div style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color: highlight ? C2.t0 : C2.t1 }}>{d.barco}</div>
                            <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>{fmtDate(d.desmolde)}</div>
                            <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>+{d.gap}d</div>
                            <div style={{ fontFamily:C2.mono, fontSize:11, fontWeight: highlight ? 700 : 400, color: highlight ? "#fca5a5" : C2.t1 }}>{fmtDate(d.estStr)}</div>
                            <div>
                              <span style={{ fontFamily:C2.mono, fontSize:12, fontWeight:700, color:diasColor }}>{diasLabel}</span>
                            </div>
                            <div>
                              <span style={{ fontSize:9, letterSpacing:0.8, textTransform:"uppercase", padding:"3px 9px",
                                borderRadius:99, fontWeight:700,
                                background:urg.bg, color:urg.color, border:`1px solid ${urg.border}` }}>
                                {urg.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop:10, fontSize:10, color:C2.t2 }}>
                      Gap = días históricos entre desmolde y primer envío de plantillas en esa línea.
                      "Solicitadas" = el barco tiene al menos una pieza con fecha de envío registrada.
                    </div>
                  </div>
                );
              })()}

              {/* ════ HISTORIAL DE ENVÍOS (SQL) ════ */}
              {viewMode === "historial" && !unidadId && (
                <div style={{ padding:"22px 26px", animation:"slideUp .28s ease" }}>
                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:18 }}>
                    <div>
                      <div style={{ fontSize:8, color:C2.t2, letterSpacing:3, textTransform:"uppercase", fontFamily:C2.mono, marginBottom:5 }}>Registro</div>
                      <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:C2.t0, letterSpacing:-0.3 }}>Historial de Envíos</h1>
                      <p style={{ color:C2.t2, fontSize:11, margin:"4px 0 0" }}>
                        Todas las plantillas enviadas desde que empezaste a usar el programa
                        {historialEnvios.length > 0 && <> — <strong style={{ color:C2.t1 }}>{historialEnvios.length} registros</strong></>}
                      </p>
                    </div>
                    <button className="action-btn" onClick={() => setShowSQLModal(true)} style={{
                      display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, cursor:"pointer",
                      border:`1px solid ${C2.b0}`, background:"rgba(255,255,255,0.03)", color:C2.t2,
                      fontFamily:C2.mono, fontSize:11, transition:"opacity 0.15s",
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                      </svg>
                      Ver SQL
                    </button>
                  </div>

                  {historialLoading ? (
                    <div style={{ textAlign:"center", padding:60, fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>
                      Cargando historial…
                    </div>
                  ) : historialEnvios.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 40px", color:C2.t2,
                      background:C2.s0, borderRadius:14, border:`1px dashed ${C2.b0}` }}>
                      <div style={{ fontSize:28, marginBottom:12, opacity:0.3 }}>◎</div>
                      <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>
                        Sin registros — los envíos con fecha aparecerán aquí
                      </div>
                    </div>
                  ) : (() => {
                    // Agrupar por barco para resumen
                    const porBarco = {};
                    historialEnvios.forEach(p => {
                      if (!porBarco[p.codigo_barco]) porBarco[p.codigo_barco] = { linea:p.linea, piezas:[], primerEnvio:p.fecha_envio, ultimoEnvio:p.fecha_envio };
                      porBarco[p.codigo_barco].piezas.push(p);
                      if (p.fecha_envio < porBarco[p.codigo_barco].primerEnvio) porBarco[p.codigo_barco].primerEnvio = p.fecha_envio;
                      if (p.fecha_envio > porBarco[p.codigo_barco].ultimoEnvio)  porBarco[p.codigo_barco].ultimoEnvio  = p.fecha_envio;
                    });
                    return (
                      <>
                        {/* Tabla principal */}
                        <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`, borderRadius:12, overflow:"hidden" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"80px 100px 1fr 110px 110px 118px",
                            gap:10, padding:"9px 18px", borderBottom:`1px solid ${C2.b0}`,
                            background:"rgba(255,255,255,0.02)" }}>
                            {["Barco","Sector","Pieza / Color","Fecha envío","Fecha regreso","Estado"].map((h,i) => (
                              <div key={i} style={{ fontSize:7.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:700, fontFamily:C2.mono }}>{h}</div>
                            ))}
                          </div>
                          {historialEnvios.map((p, idx) => {
                            const m = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                            return (
                              <div key={idx} style={{
                                display:"grid", gridTemplateColumns:"80px 100px 1fr 110px 110px 118px",
                                gap:10, alignItems:"center", padding:"9px 18px",
                                borderBottom:`1px solid rgba(255,255,255,0.025)`,
                                transition:"background 0.12s",
                              }} className="dash-row">
                                <div style={{ fontFamily:C2.mono, fontSize:12, fontWeight:700, color:C2.t0 }}>{p.codigo_barco}</div>
                                <div style={{ fontSize:10, color:C2.t2 }}>{p.sector}</div>
                                <div>
                                  <div style={{ fontSize:12, color:C2.t0, fontWeight:500 }}>{p.pieza}</div>
                                  {p.color && <div style={{ fontSize:10, color:C2.t2, marginTop:1 }}>{p.color}</div>}
                                </div>
                                <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t1 }}>
                                  {p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "—"}
                                </div>
                                <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>
                                  {p.fecha_regreso ? p.fecha_regreso.split("-").reverse().join("/") : "—"}
                                </div>
                                <div>
                                  <span style={{ fontSize:9, letterSpacing:1, textTransform:"uppercase", padding:"3px 8px",
                                    borderRadius:99, fontWeight:700, background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>
                                    {p.estado}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ════ DASHBOARD GLOBAL ════ */}
              {viewMode === "general" && !unidadId && (
                <div style={{ padding:"22px 26px", animation:"slideUp .28s ease" }}>

                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:8, color:C2.t2, letterSpacing:3, textTransform:"uppercase", fontFamily:C2.mono, marginBottom:5 }}>Panel General</div>
                      <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:C2.t0, letterSpacing:-0.3 }}>Envíos en Seguimiento</h1>
                      <p style={{ color:C2.t2, fontSize:11, marginTop:4, margin:"4px 0 0" }}>
                        Piezas en estado <strong style={{ color:C2.t1 }}>Enviado</strong> o <strong style={{ color:C2.red }}>Rehacer</strong> en toda la fábrica
                      </p>
                    </div>
                  </div>

                  {dashboard.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 40px", color:C2.t2,
                      background:C2.s0, borderRadius:14, border:`1px dashed ${C2.b0}` }}>
                      <div style={{ fontSize:28, marginBottom:12, opacity:0.3 }}>◎</div>
                      <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>Todo al día — sin piezas pendientes</div>
                    </div>
                  ) : (
                    <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`, borderRadius:12, overflow:"hidden" }}>
                      {/* Header tabla */}
                      <div style={{ display:"grid", gridTemplateColumns:"92px 1.6fr 1fr 108px 124px 38px",
                        gap:12, padding:"9px 18px", borderBottom:`1px solid ${C2.b0}`,
                        background:"rgba(255,255,255,0.02)" }}>
                        {["Barco","Pieza / Sector","Prioridad","Fecha envío","Estado",""].map((h,i) => (
                          <div key={i} style={{ fontSize:7.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:700, fontFamily:C2.mono }}>{h}</div>
                        ))}
                      </div>
                      {dashboard.map((p, idx) => {
                        const prio = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                        const m    = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                        return (
                          <div key={p.id} className="dash-row" style={{
                            display:"grid", gridTemplateColumns:"92px 1.6fr 1fr 108px 124px 38px",
                            gap:12, alignItems:"center", padding:"11px 18px",
                            borderBottom:`1px solid rgba(255,255,255,0.025)`,
                            animation:`slideUp 0.3s ease ${Math.min(idx,8) * 28}ms both`,
                            transition:"background 0.12s",
                          }}>
                            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <div style={{ width:5, height:5, borderRadius:"50%", background:m.color,
                                boxShadow:`0 0 6px ${m.color}80`, flexShrink:0 }}/>
                              <span style={{ fontFamily:C2.mono, color:C2.t0, fontWeight:700, fontSize:12 }}>{p.codigo_barco}</span>
                            </div>
                            <div>
                              <div style={{ color:C2.t0, fontSize:12, fontWeight:600 }}>{p.pieza}</div>
                              <div style={{ color:C2.t2, fontSize:10, marginTop:2 }}>{p.sector}{p.color ? ` · ${p.color}` : ""}</div>
                            </div>
                            <div>
                              <span style={{ fontSize:8, letterSpacing:1.5, textTransform:"uppercase",
                                padding:"3px 9px", borderRadius:99, fontWeight:700,
                                background:prio.bg, color:prio.color }}>
                                {p.prioridad || "Media"}
                              </span>
                            </div>
                            <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>
                              {p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "—"}
                            </div>
                            <div>
                              <span style={{ fontSize:9, letterSpacing:1, textTransform:"uppercase",
                                padding:"3px 9px", borderRadius:99, fontWeight:700,
                                background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>
                                {p.estado}
                              </span>
                            </div>
                            <button className="edit-btn" onClick={() => setModalPieza(p)}
                              style={{ border:"none", background:"transparent", color:C2.t2, cursor:"pointer",
                                fontSize:12, padding:"4px", borderRadius:5, transition:"color 0.12s" }}>✎</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ════ PLANTILLA DE LÍNEA ════ */}
              {viewMode === "plantilla" && !unidadId && lineaId && (
                <div style={{ padding:"22px 26px", animation:"slideUp .28s ease" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:8, color:C2.t2, letterSpacing:3, textTransform:"uppercase", fontFamily:C2.mono, marginBottom:5 }}>Plantilla de línea</div>
                      <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:C2.t0, letterSpacing:-0.3 }}>
                        {lineaSel?.nombre}
                        <span style={{ fontWeight:400, color:C2.t2, fontSize:13 }}> — {plantillaLinea.length} piezas</span>
                      </h1>
                      <p style={{ color:C2.t2, fontSize:11, margin:"4px 0 0" }}>
                        Estas piezas se copian automáticamente a cada nuevo barco de esta línea
                      </p>
                    </div>
                  </div>

                  {plantillaLoading ? (
                    <div style={{ textAlign:"center", padding:40, fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>Cargando…</div>
                  ) : plantillaLinea.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 40px", color:C2.t2,
                      background:C2.s0, borderRadius:14, border:`1px dashed ${C2.b0}` }}>
                      <div style={{ fontSize:28, marginBottom:12, opacity:0.3 }}>◫</div>
                      <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>Plantilla vacía — agregá piezas desde un barco</div>
                    </div>
                  ) : (() => {
                    // Agrupar por sector
                    const porSectorPlantilla = {};
                    plantillaLinea.forEach(p => {
                      if (!porSectorPlantilla[p.sector]) porSectorPlantilla[p.sector] = [];
                      porSectorPlantilla[p.sector].push(p);
                    });
                    return (
                      <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`, borderRadius:12, overflow:"hidden" }}>
                        {/* Header */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 60px 38px",
                          gap:12, padding:"9px 18px", borderBottom:`1px solid ${C2.b0}`,
                          background:"rgba(255,255,255,0.02)" }}>
                          {["Pieza","Sector","Opcional",""].map((h,i) => (
                            <div key={i} style={{ fontSize:7.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:700, fontFamily:C2.mono }}>{h}</div>
                          ))}
                        </div>
                        {Object.entries(porSectorPlantilla).map(([sector, rows]) => (
                          <div key={sector}>
                            {/* Cabecera sector */}
                            <div style={{ padding:"7px 18px", background:"rgba(255,255,255,0.01)",
                              borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                              <span style={{ fontSize:8, letterSpacing:2.5, fontWeight:700, color:C2.t2, textTransform:"uppercase", fontFamily:C2.mono }}>{sector}</span>
                              <span style={{ marginLeft:8, fontSize:9, color:C2.t2, fontFamily:C2.mono }}>({rows.length})</span>
                            </div>
                            {rows.map(p => (
                              <div key={p.id} className="pieza-row" style={{
                                display:"grid", gridTemplateColumns:"1fr 140px 60px 38px",
                                gap:12, alignItems:"center", padding:"10px 18px",
                                borderBottom:`1px solid rgba(255,255,255,0.025)`,
                                transition:"background 0.1s",
                              }}>
                                <div style={{ color:C2.t0, fontSize:12, fontWeight:500 }}>{p.pieza}</div>
                                <div style={{ color:C2.t2, fontSize:11, fontFamily:C2.mono }}>{p.sector}</div>
                                <div>
                                  {p.opcional ? (
                                    <span style={{ fontSize:8, letterSpacing:1.5, textTransform:"uppercase",
                                      padding:"2px 7px", borderRadius:99, background:"rgba(255,255,255,0.04)",
                                      color:C2.t2, border:`1px solid ${C2.b0}` }}>OPC</span>
                                  ) : (
                                    <span style={{ fontSize:8, color:"rgba(255,255,255,0.1)" }}>—</span>
                                  )}
                                </div>
                                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                                  {esAdmin && (
                                    <button className="del-btn" style={{ border:"none", background:"transparent",
                                      color:C2.t2, padding:"3px 5px", cursor:"pointer", fontSize:14,
                                      borderRadius:5, transition:"color 0.12s" }}
                                      onClick={() => eliminarPiezaPlantilla(p.id)} title="Quitar de plantilla">×</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ════ CHECKLIST DEL BARCO ════ */}
              {viewMode === "barco" && unidadId && (
                <div style={{ padding:"18px 24px", animation:"slideLeft .2s ease" }}>

                  {err && <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(239,68,68,0.07)",
                    border:"1px solid rgba(239,68,68,0.18)", color:"#f87171", fontSize:12, marginBottom:12 }}>{err}</div>}

                  {/* Barra progreso */}
                  <div style={{ background:C2.s0, border:`1px solid ${C2.b0}`, borderRadius:12, padding:"14px 18px", marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <div style={{ fontSize:11, color:C2.t2 }}>
                        <span style={{ color:C2.t1, fontWeight:600 }}>{stats.recibido}</span> de {stats.total} piezas recibidas
                      </div>
                      <span style={{ fontFamily:C2.mono, fontSize:22, fontWeight:800, color:pctColor, letterSpacing:"-0.5px" }}>
                        {porcentaje}<span style={{ fontSize:12, opacity:0.4 }}>%</span>
                      </span>
                    </div>
                    <div style={{ height:4, background:"rgba(255,255,255,0.05)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", width:`${porcentaje}%`,
                        background: porcentaje === 100
                          ? `linear-gradient(90deg, ${C2.green}80, ${C2.green})`
                          : `linear-gradient(90deg, rgba(59,130,246,0.7), rgba(59,130,246,0.35))`,
                        borderRadius:99, transition:"width .5s ease",
                        boxShadow: porcentaje === 100 ? `0 0 10px ${C2.green}55` : "none",
                      }} />
                    </div>
                  </div>

                  {/* Panel agregar pieza */}
                  {showAddPieza && esAdmin && (
                    <div style={{ background:C2.s0, border:`1px solid ${C2.b0}`, borderRadius:10, padding:14, marginBottom:14, animation:"slideUp .2s ease" }}>
                      <div style={{ fontSize:8.5, letterSpacing:2, textTransform:"uppercase", color:C2.t2, marginBottom:8, fontFamily:C2.mono }}>Agregar pieza extra</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 140px", gap:8, marginBottom:10 }}>
                        <input style={INP} placeholder="Nombre de la pieza (ej: Alzada)" value={formPieza.pieza} onChange={e => setFormPieza(f=>({...f,pieza:e.target.value}))} />
                        <input style={INP} placeholder="Sector" value={formPieza.sector} onChange={e => setFormPieza(f=>({...f,sector:e.target.value}))} />
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={agregarPiezaManual} style={{ border:"1px solid rgba(59,130,246,0.3)", background:"rgba(59,130,246,0.1)", color:"#60a5fa", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontFamily:C2.sans, fontSize:12, fontWeight:600 }}>Solo este barco</button>
                        <button onClick={agregarPiezaAPlantilla} style={{ border:`1px solid ${C2.b0}`, background:"transparent", color:C2.t1, padding:"7px 14px", borderRadius:8, cursor:"pointer", fontFamily:C2.sans, fontSize:12 }}>+ Plantilla de {lineaSel?.nombre}</button>
                      </div>
                      <div style={{ marginTop:8, fontSize:10, color:C2.t2 }}>
                        "Solo este barco" agrega al checklist actual. "Plantilla" la incluye en futuros barcos de esta línea.
                      </div>
                    </div>
                  )}

                  {/* Listado por sector */}
                  {loading ? (
                    <div style={{ textAlign:"center", padding:40, fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>Cargando…</div>
                  ) : Object.keys(porSector).length === 0 ? (
                    <div style={{ textAlign:"center", padding:"50px 0", fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>
                      {q || filtroEstado !== "todos" ? "Sin resultados para el filtro" : "Checklist vacío — usá '+ Pieza extra'"}
                    </div>
                  ) : (
                    Object.entries(porSector).map(([sector, rows]) => {
                      const recib   = rows.filter(p => p.estado === "Recibido").length;
                      const activas = rows.filter(p => p.estado !== "No lleva").length;
                      const colorSector = rows[0]?.color || "";
                      return (
                        <div key={sector} style={{ marginBottom:24 }}>
                          {/* Cabecera sector */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                            paddingBottom:7, marginBottom:3, borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:8.5, letterSpacing:2.5, fontWeight:700, color:C2.t2, textTransform:"uppercase", fontFamily:C2.mono }}>{sector}</span>
                              {esAdmin ? (
                                <input defaultValue={colorSector} placeholder="Material del sector…"
                                  style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`,
                                    color:C2.t1, padding:"3px 8px", borderRadius:6, fontSize:10, outline:"none", width:180 }}
                                  onBlur={e => { if (e.target.value !== colorSector) cambiarColorSector(sector, e.target.value); }}
                                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                                  title="Presioná Enter para aplicar a todo el sector" />
                              ) : (
                                colorSector && <span style={{ fontSize:10, color:C2.t2 }}>{colorSector}</span>
                              )}
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ width:52, height:2.5, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
                                <div style={{ height:"100%",
                                  width:`${activas ? recib/activas*100 : 0}%`,
                                  background: recib===activas && activas>0 ? C2.green : C2.primary,
                                  borderRadius:99, transition:"width 0.4s" }}/>
                              </div>
                              <span style={{ fontSize:9.5, color:C2.t2, fontFamily:C2.mono }}>{recib}/{activas}</span>
                            </div>
                          </div>

                          {/* Piezas */}
                          {rows.map(p => {
                            const meta    = ESTADO_META[p.estado]    ?? ESTADO_META["Pendiente"];
                            const prio    = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                            const noLleva = p.estado === "No lleva";
                            return (
                              <div key={p.id} className="pieza-row" style={{
                                display:"grid", gridTemplateColumns:"1fr 128px 46px",
                                gap:10, alignItems:"center",
                                padding:"8px 6px", borderBottom:`1px solid rgba(255,255,255,0.025)`,
                                opacity: noLleva ? 0.27 : 1, borderRadius:6, transition:"background 0.1s",
                              }}>
                                <div style={{ cursor:"pointer" }} onClick={() => setModalPieza(p)}>
                                  <div style={{ color: p.estado === "Recibido" ? C2.t2 : C2.t0,
                                    fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:7 }}>
                                    <div style={{ width:5, height:5, borderRadius:"50%", background:meta.color, flexShrink:0,
                                      boxShadow: p.estado==="Recibido" ? `0 0 5px ${meta.color}80` : "none" }}/>
                                    {p.pieza}
                                    <div style={{ width:5, height:5, borderRadius:"50%", background:prio.color,
                                      boxShadow:`0 0 4px ${prio.color}55`, flexShrink:0 }} title={`Prioridad: ${p.prioridad||"Media"}`}/>
                                    {p.opcional && <span style={{ fontSize:8, color:C2.t2, letterSpacing:1.5, fontFamily:C2.mono }}>OPC</span>}
                                  </div>
                                  {(p.fecha_envio || p.fecha_regreso) && (
                                    <div style={{ fontSize:9, color:C2.t2, marginTop:2, paddingLeft:12, display:"flex", gap:10, fontFamily:C2.mono }}>
                                      {p.fecha_envio   && <span>↑ {p.fecha_envio.split("-").reverse().join("/")}</span>}
                                      {p.fecha_regreso && <span>↓ {p.fecha_regreso.split("-").reverse().join("/")}</span>}
                                    </div>
                                  )}
                                  {p.observaciones && (
                                    <div style={{ fontSize:10, color:C2.t2, marginTop:2, paddingLeft:12, fontStyle:"italic", opacity:0.65 }}>{p.observaciones}</div>
                                  )}
                                </div>

                                <select style={estadoSelectStyle(p.estado)} value={p.estado} onChange={e => setEstado(p.id, e.target.value)}>
                                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>

                                <div style={{ display:"flex", gap:2, justifyContent:"flex-end" }}>
                                  <button className="edit-btn" style={{ border:"none", background:"transparent", color:C2.t2, padding:"3px 5px", cursor:"pointer", fontSize:12, borderRadius:5, transition:"color 0.12s" }}
                                    onClick={() => setModalPieza(p)} title="Editar">✎</button>
                                  {esAdmin && (
                                    <button className="del-btn" style={{ border:"none", background:"transparent", color:C2.t2, padding:"3px 5px", cursor:"pointer", fontSize:14, borderRadius:5, transition:"color 0.12s" }}
                                      onClick={() => eliminarPieza(p.id)} title="Quitar">×</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalPieza && (
        <PiezaModal
          pieza={modalPieza}
          onClose={() => setModalPieza(null)}
          onSave={guardarDetalle}
          esAdmin={esAdmin}
        />
      )}

      {/* ── SQL MODAL ── */}
      {showSQLModal && (
        <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.85)",
          backdropFilter:"blur(40px)", display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setShowSQLModal(false)}>
          <div style={{ background:"rgba(7,10,20,0.97)", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:16, padding:"26px", width:"min(680px,92vw)", maxHeight:"88vh", overflowY:"auto",
            position:"relative", boxShadow:"0 32px 80px rgba(0,0,0,0.8)" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSQLModal(false)} style={{ position:"absolute", top:14, right:14,
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.5)", width:28, height:28, borderRadius:"50%",
              cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>

            <div style={{ fontSize:8, color:"#71717a", letterSpacing:3, textTransform:"uppercase", marginBottom:6, fontFamily:"'JetBrains Mono', monospace" }}>Supabase SQL Editor</div>
            <h2 style={{ margin:"0 0 4px", fontSize:17, fontWeight:700, color:"#f4f4f5", fontFamily:"'Outfit', system-ui" }}>Consultas SQL</h2>
            <p style={{ margin:"0 0 20px", fontSize:11, color:"#71717a" }}>
              Copiá estas queries y corrélas en el <strong style={{ color:"#a8b4c4" }}>SQL Editor</strong> de tu proyecto Supabase
            </p>

            {[
              { title:"Historial completo por pieza", sql: SQL_HISTORIAL },
              { title:"Resumen por barco", sql: SQL_POR_BARCO },
            ].map(({ title, sql }) => (
              <div key={title} style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"#a8b4c4" }}>{title}</span>
                  <button onClick={() => { navigator.clipboard.writeText(sql); setSqlCopiado(title); setTimeout(() => setSqlCopiado(""), 2000); }} style={{
                    border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)",
                    color: sqlCopiado === title ? "#10b981" : "#9da3b0", padding:"4px 12px", borderRadius:7,
                    cursor:"pointer", fontSize:10, fontFamily:"'JetBrains Mono', monospace",
                    letterSpacing:0.5, transition:"color 0.2s",
                  }}>
                    {sqlCopiado === title ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
                <pre style={{ margin:0, padding:"14px 16px", background:"rgba(0,0,0,0.5)",
                  border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, overflowX:"auto",
                  fontSize:11, color:"#7dd3fc", fontFamily:"'JetBrains Mono', monospace",
                  lineHeight:1.7, whiteSpace:"pre" }}>
                  {sql}
                </pre>
              </div>
            ))}

            <div style={{ marginTop:8, padding:"10px 14px", background:"rgba(59,130,246,0.06)",
              border:"1px solid rgba(59,130,246,0.15)", borderRadius:8, fontSize:10, color:"#93b4ff" }}>
              💡 Las tablas son: <code style={{ fontFamily:"'JetBrains Mono', monospace" }}>marm_lineas</code>, <code style={{ fontFamily:"'JetBrains Mono', monospace" }}>marm_unidades</code>, <code style={{ fontFamily:"'JetBrains Mono', monospace" }}>marm_unidad_piezas</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
