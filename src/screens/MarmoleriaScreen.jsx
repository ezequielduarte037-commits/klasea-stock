import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 👇 Ajustá esta ruta dependiendo de dónde guardes la imagen de Klase A en tu proyecto
import logoKlaseA from "../assets/logo-klasea.png"; 

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

  const [loading, setLoading]   = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [err, setErr]           = useState("");

  // Nuevos campos
  const [newLinea,   setNewLinea]   = useState("");
  const [newUnidad,  setNewUnidad]  = useState("");
  const [showAddPieza, setShowAddPieza] = useState(false);
  const [formPieza, setFormPieza] = useState({ pieza:"", sector:"" });

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
    if (!lineaId && data?.length) setLineaId(data[0].id);
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

  useEffect(() => { 
    cargarLineas(); 
    cargarDashboardGeneral();
  }, []);

  useEffect(() => { 
    if (lineaId) { 
      cargarUnidades(lineaId); 
      setUnidadId(null); 
      setPiezas([]); 
    } 
  }, [lineaId]);

  useEffect(() => { 
    if (unidadId) {
      cargarPiezas(unidadId); 
    } else {
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

  async function setEstado(piezaId, estado) {
    // Si cambia a Recibido y no tiene fecha_regreso, poner hoy
    const upd = { estado };
    if (estado === "Recibido") upd.fecha_regreso = upd.fecha_regreso || new Date().toISOString().slice(0,10);
    if (estado === "Enviado")  upd.fecha_envio   = upd.fecha_envio   || new Date().toISOString().slice(0,10);
    await supabase.from("marm_unidad_piezas").update(upd).eq("id", piezaId);
    setPiezas(prev => prev.map(p => p.id === piezaId ? {...p, ...upd} : p));
  }

  async function guardarDetalle(piezaId, form) {
    await supabase.from("marm_unidad_piezas").update(form).eq("id", piezaId);
    setPiezas(prev => prev.map(p => p.id === piezaId ? {...p, ...form} : p));
    cargarDashboardGeneral(); // Refrescar por si se cambió algo desde la vista global
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
      const rows = dataPDF.map(p => {
        let fechaEnvioFormateada = p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "-";
        return [
          p.codigo_barco,
          fechaEnvioFormateada,
          p.pieza || "-",
          p.color || "-",
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
    bg:      "#09090b",
    s0:      "rgba(255,255,255,0.03)",
    s1:      "rgba(255,255,255,0.06)",
    b0:      "rgba(255,255,255,0.08)",
    b1:      "rgba(255,255,255,0.15)",
    t0:      "#f4f4f5",
    t1:      "#a1a1aa",
    t2:      "#71717a",
    mono:    "'JetBrains Mono', monospace",
    sans:    "'Outfit', system-ui, sans-serif",
    green:   "#10b981",
    red:     "#ef4444",
    amber:   "#f59e0b",
    primary: "#3b82f6",
  };
  const GLASS = { backdropFilter:"blur(32px) saturate(130%)", WebkitBackdropFilter:"blur(32px) saturate(130%)" };
  const INP   = { background:"rgba(255,255,255,0.04)", border:`1px solid ${C2.b0}`, color:C2.t0, padding:"7px 10px", borderRadius:7, fontSize:12, outline:"none", width:"100%", fontFamily:C2.sans };
  const INP_SM = { ...INP, padding:"5px 8px", fontSize:11 };

  const lineaNavBtn = (sel) => ({
    width:"100%", textAlign:"left", padding:"9px 14px",
    border:"none", borderBottom:`1px solid rgba(255,255,255,0.03)`,
    background: sel ? C2.s1 : "transparent",
    color: sel ? C2.t0 : C2.t2,
    cursor:"pointer", fontSize:12, fontWeight: sel ? 600 : 400,
    display:"flex", justifyContent:"space-between", alignItems:"center",
    fontFamily: C2.sans,
  });

  const unidadNavBtn = (sel) => ({
    ...lineaNavBtn(sel),
    paddingLeft:22, fontSize:11,
    borderLeft: sel ? `2px solid ${C2.b1}` : "2px solid transparent",
    color: sel ? C2.t0 : "#3a4455",
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

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ background: C2.bg, minHeight:"100vh", color: C2.t0, fontFamily: C2.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        @keyframes slideUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .pieza-row:hover { background: rgba(255,255,255,0.025) !important; }
        .dash-row:hover  { background: rgba(255,255,255,0.03)  !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", minHeight:"100vh", position:"relative", zIndex:1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height:50, background:"rgba(12,12,14,0.92)", ...GLASS,
            borderBottom:`1px solid ${C2.b0}`, padding:"0 18px",
            display:"flex", alignItems:"center", gap:10, flexShrink:0,
          }}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:C2.t0 }}>Marmolería</span>
              <div style={{ width:1, height:14, background:C2.b1 }} />
              <span style={{ fontSize:10, color:C2.t2, letterSpacing:1 }}>
                {unidadId ? `${lineaSel?.nombre} › ${unidadSel?.codigo}` : "Panel general"}
              </span>

              {/* Stats chips — cuando hay barco seleccionado */}
              {unidadId && (
                <div style={{ display:"flex", gap:6, marginLeft:10 }}>
                  {[
                    { label:"Recibidas",  n: stats.recibido,  c: C2.green  },
                    { label:"Enviadas",   n: stats.enviado,   c: C2.t1     },
                    { label:"Pendientes", n: stats.pendiente, c: C2.t2     },
                    ...(stats.rehacer > 0 ? [{ label:"Rehacer", n: stats.rehacer, c: C2.red }] : []),
                  ].map(({ label, n, c }) => (
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", borderRadius:6, background:C2.s0, border:`1px solid ${C2.b0}`, borderLeft:`2px solid ${c}` }}>
                      <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:c, lineHeight:1 }}>{n}</span>
                      <span style={{ fontSize:8, color:C2.t1, letterSpacing:2, textTransform:"uppercase" }}>{label}</span>
                    </div>
                  ))}
                  {/* % badge */}
                  <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:6, background: pctColor === C2.green ? "rgba(16,185,129,0.1)" : C2.s0, border:`1px solid ${pctColor === C2.green ? "rgba(16,185,129,0.25)" : C2.b0}` }}>
                    <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:pctColor }}>{porcentaje}%</span>
                  </div>
                </div>
              )}

              {/* Stats globales — cuando NO hay barco */}
              {!unidadId && dashboard.length > 0 && (
                <div style={{ display:"flex", gap:6, marginLeft:10 }}>
                  {[
                    { label:"Enviadas", n: dashboard.filter(p=>p.estado==="Enviado").length,  c: C2.t1 },
                    { label:"Rehacer",  n: dashboard.filter(p=>p.estado==="Rehacer").length,  c: C2.red },
                  ].filter(x => x.n > 0).map(({ label, n, c }) => (
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", borderRadius:6, background:C2.s0, border:`1px solid ${C2.b0}`, borderLeft:`2px solid ${c}` }}>
                      <span style={{ fontFamily:C2.mono, fontSize:13, fontWeight:700, color:c }}>{n}</span>
                      <span style={{ fontSize:8, color:C2.t1, letterSpacing:2, textTransform:"uppercase" }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Acciones topbar */}
            {unidadId && esAdmin && (
              <button
                onClick={() => setShowAddPieza(v => !v)}
                style={{ border:`1px solid ${C2.b0}`, background:"transparent", color:C2.t1, padding:"5px 12px", borderRadius:7, cursor:"pointer", fontFamily:C2.sans, fontSize:11 }}
              >
                {showAddPieza ? "✕ Cancelar" : "+ Pieza extra"}
              </button>
            )}
            <button
              onClick={exportarPDFGeneral}
              disabled={isExporting}
              style={{ border:"1px solid rgba(16,185,129,0.3)", background:"rgba(16,185,129,0.08)", color:C2.green, padding:"5px 12px", borderRadius:7, cursor:"pointer", fontFamily:C2.sans, fontSize:11 }}
            >
              {isExporting ? "Generando…" : "↓ PDF"}
            </button>
          </div>

          {/* ── FILTERBAR (solo visible con barco seleccionado) ── */}
          {unidadId && (
            <div style={{
              height:38, background:"rgba(12,12,14,0.85)", ...GLASS,
              borderBottom:`1px solid ${C2.b0}`, padding:"0 18px",
              display:"flex", alignItems:"center", gap:4, flexShrink:0, overflowX:"auto",
            }}>
              <span style={{ fontSize:8, color:C2.t2, letterSpacing:2, textTransform:"uppercase", flexShrink:0 }}>Estado</span>
              {["todos", ...ESTADOS].map(e => {
                const m  = ESTADO_META[e];
                const active = filtroEstado === e;
                return (
                  <button key={e} onClick={() => setFiltroEstado(e)} style={{
                    border: active ? `1px solid ${m?.border ?? C2.b1}` : "1px solid rgba(255,255,255,0.04)",
                    background: active ? (m?.bg ?? C2.s1) : "transparent",
                    color: active ? (m?.color ?? C2.t0) : C2.t2,
                    padding:"2px 10px", borderRadius:5, cursor:"pointer", fontSize:10,
                    whiteSpace:"nowrap", fontFamily:C2.sans,
                  }}>{e === "todos" ? "Todas" : e}</button>
                );
              })}
              <div style={{ width:1, height:12, background:C2.b0, margin:"0 4px", flexShrink:0 }} />
              <input
                style={{ ...INP_SM, width:180, flexShrink:0 }}
                placeholder="⌕  Buscar pieza o sector…"
                value={q} onChange={e => setQ(e.target.value)}
              />
            </div>
          )}

          {/* ── SPLIT CONTENT ── */}
          <div style={{ flex:1, overflow:"hidden", display:"grid", gridTemplateColumns:"252px 1fr" }}>

            {/* ── LEFT NAV ── */}
            <div style={{ borderRight:`1px solid ${C2.b0}`, background:"rgba(9,9,11,0.98)", display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

              {/* Dashboard link */}
              <button
                onClick={() => setUnidadId(null)}
                style={{
                  width:"100%", textAlign:"left", padding:"11px 14px",
                  border:"none", borderBottom:`1px solid ${C2.b0}`,
                  background: !unidadId ? C2.s1 : "transparent",
                  color: !unidadId ? C2.t0 : C2.t2,
                  cursor:"pointer", fontSize:11, fontWeight: !unidadId ? 600 : 400,
                  display:"flex", alignItems:"center", gap:7, fontFamily:C2.sans,
                  letterSpacing:1, textTransform:"uppercase",
                  borderLeft: !unidadId ? `2px solid ${C2.primary}` : "2px solid transparent",
                }}
              >
                <span style={{ fontSize:9 }}>◈</span> Panel general
              </button>

              {/* Líneas + unidades */}
              <div style={{ flex:1, overflowY:"auto" }}>
                {lineas.map(l => {
                  const selLinea = lineaId === l.id;
                  return (
                    <div key={l.id}>
                      <button style={lineaNavBtn(selLinea)} onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                        <span style={{ display:"flex", alignItems:"center", gap:7 }}>
                          <div style={{ width:5, height:5, borderRadius:"50%", background: selLinea ? C2.t0 : "#2c3040", flexShrink:0 }} />
                          {l.nombre}
                        </span>
                        {esAdmin && selLinea && (
                          <span
                            onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}
                            style={{ fontSize:10, color:C2.red, cursor:"pointer", padding:"2px 5px", borderRadius:4 }}
                          >×</span>
                        )}
                      </button>

                      {selLinea && (
                        <>
                          {unidades.map(u => (
                            <button key={u.id} style={unidadNavBtn(unidadId === u.id)} onClick={() => setUnidadId(u.id)}>
                              <span style={{ fontFamily:C2.mono, fontSize:11 }}>{u.codigo}</span>
                              {esAdmin && unidadId === u.id && (
                                <span onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }} style={{ fontSize:10, color:C2.red, cursor:"pointer", padding:"2px 5px" }}>×</span>
                              )}
                            </button>
                          ))}
                          {esAdmin && (
                            <div style={{ padding:"5px 14px 8px 22px", display:"flex", gap:5 }}>
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
                  <div style={{ fontSize:9, letterSpacing:2, color:C2.t2, textTransform:"uppercase", marginBottom:5 }}>Nueva línea</div>
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

              {/* ══════════════════ DASHBOARD GLOBAL ══════════════════ */}
              {!unidadId && (
                <div style={{ padding:"22px 26px", animation:"slideUp .25s ease" }}>

                  {/* Header */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:9, color:C2.t2, letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>Producción</div>
                    <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:C2.t0 }}>Panel General de Envíos</h1>
                    <p style={{ color:C2.t2, fontSize:11, marginTop:4, margin:0 }}>
                      Piezas en estado Enviado o Rehacer en toda la fábrica
                    </p>
                  </div>

                  {dashboard.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 40px", color:C2.t2, background:C2.s0, borderRadius:14, border:`1px dashed ${C2.b0}` }}>
                      <div style={{ fontSize:24, marginBottom:10 }}>✓</div>
                      <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase" }}>Todo al día — sin piezas pendientes</div>
                    </div>
                  ) : (
                    <div style={{ background:C2.s0, border:`1px solid ${C2.b0}`, borderRadius:12, overflow:"hidden" }}>
                      {/* Table header */}
                      <div style={{ display:"grid", gridTemplateColumns:"90px 1.5fr 1fr 110px 110px 40px", gap:12, padding:"8px 16px", borderBottom:`1px solid ${C2.b0}` }}>
                        {["Barco","Pieza","Prioridad","Fecha envío","Estado",""].map((h,i) => (
                          <div key={i} style={{ fontSize:8, letterSpacing:2, textTransform:"uppercase", color:C2.t2, fontWeight:700 }}>{h}</div>
                        ))}
                      </div>
                      {dashboard.map(p => {
                        const prio = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                        const m    = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                        return (
                          <div key={p.id} className="dash-row" style={{
                            display:"grid", gridTemplateColumns:"90px 1.5fr 1fr 110px 110px 40px",
                            gap:12, alignItems:"center", padding:"10px 16px",
                            borderBottom:`1px solid rgba(255,255,255,0.03)`,
                          }}>
                            <div style={{ fontFamily:C2.mono, color:C2.t0, fontWeight:700, fontSize:12 }}>{p.codigo_barco}</div>
                            <div>
                              <div style={{ color:C2.t0, fontSize:12, fontWeight:600 }}>{p.pieza}</div>
                              <div style={{ color:C2.t2, fontSize:10, marginTop:2 }}>{p.sector}{p.color ? ` · ${p.color}` : ""}</div>
                            </div>
                            <div>
                              <span style={{ fontSize:8, letterSpacing:1.5, textTransform:"uppercase", padding:"3px 7px", borderRadius:99, fontWeight:700, background:prio.bg, color:prio.color }}>
                                {p.prioridad || "Media"}
                              </span>
                            </div>
                            <div style={{ fontFamily:C2.mono, fontSize:11, color:C2.t2 }}>
                              {p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "—"}
                            </div>
                            <div>
                              <span style={{ fontSize:9, letterSpacing:1, textTransform:"uppercase", padding:"3px 8px", borderRadius:99, fontWeight:700, background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>
                                {p.estado}
                              </span>
                            </div>
                            <button
                              onClick={() => setModalPieza(p)}
                              style={{ border:"none", background:"transparent", color:C2.t2, cursor:"pointer", fontSize:13, padding:"4px" }}
                            >✎</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══════════════════ CHECKLIST DEL BARCO ══════════════════ */}
              {unidadId && (
                <div style={{ padding:"20px 24px", animation:"slideLeft .2s ease" }}>

                  {err && <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", color:"#f87171", fontSize:12, marginBottom:12 }}>{err}</div>}

                  {/* Barra de progreso */}
                  <div style={{ background:C2.s0, border:`1px solid ${C2.b0}`, borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ fontSize:11, color:C2.t2 }}>
                        {stats.recibido} de {stats.total} piezas recibidas
                      </div>
                      <span style={{ fontFamily:C2.mono, fontSize:20, fontWeight:700, color:pctColor }}>
                        {porcentaje}<span style={{ fontSize:11, opacity:0.5 }}>%</span>
                      </span>
                    </div>
                    <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", width:`${porcentaje}%`,
                        background: porcentaje === 100
                          ? `linear-gradient(90deg, ${C2.green}90, ${C2.green})`
                          : `linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.12))`,
                        borderRadius:99, transition:"width .5s ease",
                      }} />
                    </div>
                  </div>

                  {/* Panel agregar pieza */}
                  {showAddPieza && esAdmin && (
                    <div style={{ background:C2.s0, border:`1px solid ${C2.b1}`, borderRadius:10, padding:14, marginBottom:14, animation:"slideUp .2s ease" }}>
                      <div style={{ fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C2.t2, marginBottom:8 }}>Agregar pieza extra</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 140px", gap:8, marginBottom:10 }}>
                        <input style={INP} placeholder="Nombre de la pieza (ej: Alzada)" value={formPieza.pieza} onChange={e => setFormPieza(f=>({...f,pieza:e.target.value}))} />
                        <input style={INP} placeholder="Sector" value={formPieza.sector} onChange={e => setFormPieza(f=>({...f,sector:e.target.value}))} />
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={agregarPiezaManual} style={{ border:"1px solid rgba(59,130,246,0.35)", background:"rgba(59,130,246,0.15)", color:"#60a5fa", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontFamily:C2.sans, fontSize:12, fontWeight:600 }}>Solo este barco</button>
                        <button onClick={agregarPiezaAPlantilla} style={{ border:`1px solid ${C2.b0}`, background:"transparent", color:C2.t1, padding:"7px 14px", borderRadius:8, cursor:"pointer", fontFamily:C2.sans, fontSize:12 }}>+ Plantilla de {lineaSel?.nombre}</button>
                      </div>
                      <div style={{ marginTop:8, fontSize:10, color:C2.t2 }}>
                        "Solo este barco" agrega en el casco actual. "Plantilla" la incluye en el listado base para futuros barcos.
                      </div>
                    </div>
                  )}

                  {/* Listado por sector */}
                  {loading ? (
                    <div style={{ textAlign:"center", padding:40, fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C2.mono }}>Cargando…</div>
                  ) : Object.keys(porSector).length === 0 ? (
                    <div style={{ textAlign:"center", padding:"50px 0", fontSize:11, color:C2.t2, letterSpacing:2, textTransform:"uppercase" }}>
                      {q || filtroEstado !== "todos" ? "Sin resultados para el filtro" : "Checklist vacío — usá '+ Pieza extra'"}
                    </div>
                  ) : (
                    Object.entries(porSector).map(([sector, rows]) => {
                      const recib         = rows.filter(p => p.estado === "Recibido").length;
                      const activas       = rows.filter(p => p.estado !== "No lleva").length;
                      const colorSector   = rows[0]?.color || "";

                      return (
                        <div key={sector} style={{ marginBottom:22 }}>
                          {/* Cabecera sector */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:7, marginBottom:2, borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:9, letterSpacing:2.5, fontWeight:700, color:C2.t2, textTransform:"uppercase" }}>{sector}</span>
                              {esAdmin ? (
                                <input
                                  defaultValue={colorSector}
                                  placeholder="Material del sector…"
                                  style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C2.b0}`, color:C2.t1, padding:"3px 8px", borderRadius:6, fontSize:10, outline:"none", width:180 }}
                                  onBlur={e => { if (e.target.value !== colorSector) cambiarColorSector(sector, e.target.value); }}
                                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                                  title="Presioná Enter para aplicar a todo el sector"
                                />
                              ) : (
                                colorSector && <span style={{ fontSize:10, color:C2.t2 }}>{colorSector}</span>
                              )}
                            </div>
                            <span style={{ fontSize:10, color:C2.t2, fontFamily:C2.mono }}>{recib}/{activas}</span>
                          </div>

                          {/* Piezas del sector */}
                          {rows.map(p => {
                            const meta    = ESTADO_META[p.estado]    ?? ESTADO_META["Pendiente"];
                            const prio    = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                            const noLleva = p.estado === "No lleva";
                            return (
                              <div key={p.id} className="pieza-row" style={{
                                display:"grid", gridTemplateColumns:"1fr 130px 52px",
                                gap:10, alignItems:"center",
                                padding:"8px 4px", borderBottom:`1px solid rgba(255,255,255,0.03)`,
                                opacity: noLleva ? 0.3 : 1, borderRadius:6, transition:"background .1s",
                              }}>
                                {/* Nombre + dots + fechas */}
                                <div style={{ cursor:"pointer" }} onClick={() => setModalPieza(p)}>
                                  <div style={{ color: p.estado === "Recibido" ? C2.t2 : C2.t0, fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:7 }}>
                                    <div style={{ width:6, height:6, borderRadius:"50%", background:meta.color, flexShrink:0, boxShadow: p.estado === "Recibido" ? `0 0 6px ${meta.color}88` : "none" }} />
                                    {p.pieza}
                                    <div style={{ width:7, height:7, borderRadius:"50%", background:prio.color, boxShadow:`0 0 5px ${prio.color}55`, flexShrink:0 }} title={`Prioridad: ${p.prioridad || "Media"}`} />
                                    {p.opcional && <span style={{ fontSize:8, color:C2.t2, letterSpacing:1.5 }}>OPCIONAL</span>}
                                  </div>
                                  {(p.fecha_envio || p.fecha_regreso) && (
                                    <div style={{ fontSize:9, color:C2.t2, marginTop:2, paddingLeft:13, display:"flex", gap:10, fontFamily:C2.mono }}>
                                      {p.fecha_envio   && <span>Env {p.fecha_envio.split("-").reverse().join("/")}</span>}
                                      {p.fecha_regreso && <span>Reg {p.fecha_regreso.split("-").reverse().join("/")}</span>}
                                    </div>
                                  )}
                                  {p.observaciones && (
                                    <div style={{ fontSize:10, color:C2.t2, marginTop:2, paddingLeft:13, fontStyle:"italic" }}>{p.observaciones}</div>
                                  )}
                                </div>

                                {/* Select estado */}
                                <select style={estadoSelectStyle(p.estado)} value={p.estado} onChange={e => setEstado(p.id, e.target.value)}>
                                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>

                                {/* Acciones */}
                                <div style={{ display:"flex", gap:2, justifyContent:"flex-end" }}>
                                  <button style={{ border:"none", background:"transparent", color:C2.t2, padding:"3px 5px", cursor:"pointer", fontSize:13, borderRadius:5 }} onClick={() => setModalPieza(p)} title="Editar">✎</button>
                                  {esAdmin && (
                                    <button style={{ border:"none", background:"transparent", color:C2.t2, padding:"3px 5px", cursor:"pointer", fontSize:14, borderRadius:5 }} onClick={() => eliminarPieza(p.id)} title="Quitar">×</button>
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

      {/* Modal pieza flotante */}
      {modalPieza && (
        <PiezaModal
          pieza={modalPieza}
          onClose={() => setModalPieza(null)}
          onSave={guardarDetalle}
          esAdmin={esAdmin}
        />
      )}
    </div>
  );
}