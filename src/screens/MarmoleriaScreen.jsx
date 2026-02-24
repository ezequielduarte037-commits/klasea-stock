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
  "Recibido":  { color: "#3dce6a", bg: "rgba(61,206,106,0.1)",   border: "rgba(61,206,106,0.3)",   dot: "●", label: "Recibido"  },
  "No lleva":  { color: "#2c3040", bg: "transparent",            border: "transparent",            dot: "—", label: "No lleva" },
  "Rehacer":   { color: "#e04848", bg: "rgba(224,72,72,0.1)",    border: "rgba(224,72,72,0.28)",   dot: "↺", label: "Rehacer"  },
};

// ── PRIORIDADES (Semáforo) ────────────────────────────────────────
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const PRIORIDAD_META = {
  "Baja":    { color: "#3dce6a", bg: "rgba(61,206,106,0.15)", label: "Baja" },      // Verde
  "Media":   { color: "#f5a623", bg: "rgba(245,166,35,0.15)", label: "Media" },     // Amarillo
  "Alta":    { color: "#ff7a00", bg: "rgba(255,122,0,0.15)",  label: "Alta" },      // Naranja
  "Urgente": { color: "#e04848", bg: "rgba(224,72,72,0.15)",  label: "Urgente" },   // Rojo
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
      background:"rgba(3,5,12,0.88)",
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
      fontSize:9, letterSpacing:2, color:"#566070", display:"block", 
      marginBottom:6, marginTop:16, textTransform:"uppercase", fontWeight:600 
    },
    input: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
      color:"#dde2ea", padding:"9px 12px", borderRadius:9, width:"100%", fontSize:13,
      outline:"none", boxSizing:"border-box", transition:"border-color 0.15s",
    },
    textarea: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
      color:"#dde2ea", padding:"9px 12px", borderRadius:9, width:"100%",
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

        <div style={{ fontSize:9, color:"#566070", letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>{pieza.sector}</div>
        <h2 style={{ margin:"6px 0 0", color:"#dde2ea", fontFamily:"'Outfit',system-ui", fontSize:17, fontWeight:700 }}>
          {pieza.pieza}
          {pieza.opcional && <span style={{ marginLeft:8, fontSize:9, color:"#566070", letterSpacing:1.5 }}>OPCIONAL</span>}
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

  const pctColor = porcentaje === 100 ? "#3dce6a" : porcentaje > 0 ? "#a8b4c4" : "#2c3040";

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
  const S = {
    page: { 
      background:"#03050c", 
      minHeight:"100vh", 
      color:"#dde2ea",
      fontFamily:"'Outfit', 'IBM Plex Sans', system-ui, sans-serif" 
    },
    layout: { 
      display:"grid", 
      gridTemplateColumns:"280px 1fr", 
      minHeight:"100vh" 
    },
    main: { 
      display:"grid", 
      gridTemplateColumns:"252px 1fr", 
      height:"100vh", 
      overflow:"hidden" 
    },
    panel: {
      height:"100vh", 
      overflowY:"auto",
      borderRight:"1px solid rgba(255,255,255,0.06)",
      background:"rgba(3,5,12,0.98)",
    },
    detail: { 
      height:"100vh", 
      overflowY:"auto", 
      padding:"22px 28px" 
    },
    card: {
      border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:14,
      background:"rgba(255,255,255,0.025)",
      backdropFilter:"blur(20px)",
      padding:"14px 16px", 
      marginBottom:10,
    },
    input: {
      background:"rgba(255,255,255,0.04)", 
      border:"1px solid rgba(255,255,255,0.09)",
      color:"#dde2ea", 
      padding:"8px 12px", 
      borderRadius:9, 
      fontSize:13,
      width:"100%", 
      outline:"none", 
      transition:"border-color 0.15s", 
      boxSizing:"border-box",
    },
    inputSm: {
      background:"rgba(255,255,255,0.04)", 
      border:"1px solid rgba(255,255,255,0.09)",
      color:"#dde2ea", 
      padding:"6px 10px", 
      borderRadius:8, 
      fontSize:12,
      outline:"none", 
      transition:"border-color 0.15s",
    },
    btn: {
      border:"1px solid rgba(255,255,255,0.1)",
      background:"rgba(255,255,255,0.05)",
      color:"#a8b4c4", 
      padding:"7px 14px", 
      borderRadius:9,
      cursor:"pointer", 
      fontWeight:600, 
      fontSize:12,
      transition:"border-color 0.15s, color 0.15s",
    },
    btnPrim: {
      border:"1px solid rgba(255,255,255,0.2)",
      background:"rgba(255,255,255,0.9)", 
      color:"#080c14",
      padding:"9px 18px", 
      borderRadius:9,
      cursor:"pointer", 
      fontWeight:700, 
      fontSize:13,
      transition:"opacity 0.15s",
    },
    btnDanger: {
      border:"1px solid rgba(224,72,72,0.2)",
      background:"rgba(224,72,72,0.08)", 
      color:"#e04848",
      padding:"3px 8px", 
      borderRadius:6, 
      cursor:"pointer", 
      fontSize:11,
      transition:"background 0.15s",
    },
    btnGhost: {
      border:"none", 
      background:"transparent",
      color:"rgba(255,255,255,0.2)", 
      padding:"4px 6px",
      cursor:"pointer", 
      fontSize:14, 
      borderRadius:6,
      transition:"color 0.15s",
    },
    label: { 
      fontSize:9, 
      letterSpacing:2, 
      color:"#566070", 
      display:"block", 
      marginBottom:4, 
      textTransform:"uppercase", 
      fontWeight:600 
    },
    small: { 
      fontSize:11, 
      color:"#566070" 
    },
  };

  const lineaBtn = (sel) => ({
    width:"100%", textAlign:"left", padding:"10px 16px",
    border:"none", borderBottom:"1px solid rgba(255,255,255,0.04)",
    background: sel ? "rgba(255,255,255,0.06)" : "transparent",
    color: sel ? "#dde2ea" : "#566070",
    cursor:"pointer", fontWeight: sel ? 600 : 400, fontSize:13,
    display:"flex", justifyContent:"space-between", alignItems:"center",
    transition:"background 0.12s, color 0.12s",
  });

  const unidadBtn = (sel) => ({
    width:"100%", textAlign:"left",
    padding: sel ? "9px 16px 9px 20px" : "9px 16px 9px 22px",
    border:"none", borderBottom:"1px solid rgba(255,255,255,0.03)",
    borderLeft: sel ? "2px solid rgba(255,255,255,0.25)" : "2px solid transparent",
    background: sel ? "rgba(255,255,255,0.04)" : "transparent",
    color: sel ? "#dde2ea" : "#3a4455",
    cursor:"pointer", fontWeight: sel ? 600 : 400, fontSize:12,
    display:"flex", justifyContent:"space-between", alignItems:"center",
    transition:"background 0.12s, color 0.12s",
  });

  const estadoBtn = (estado) => {
    const m = ESTADO_META[estado] ?? ESTADO_META["Pendiente"];
    return {
      background: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
      padding:"4px 10px", borderRadius:8,
      cursor:"pointer", fontSize:11, fontWeight:600, outline:"none",
      transition:"background 0.15s",
      fontFamily:"'Outfit', system-ui",
    };
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        .linea-btn:hover { background: rgba(255,255,255,0.05) !important; color: #a8b4c4 !important; }
        .unidad-btn:hover { background: rgba(255,255,255,0.03) !important; color: #8090a0 !important; }
        .pieza-row:hover { background: rgba(255,255,255,0.03) !important; }
        .btn-ghost-h:hover { color: rgba(255,255,255,0.5) !important; }
        input:focus, select:focus, textarea:focus { border-color: rgba(255,255,255,0.2) !important; }
        select option { background: #080c18; color: #dde2ea; }
      `}</style>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={S.main}>
          
          {/* ── PANEL IZQ: Líneas + Unidades ── */}
          <div style={S.panel}>
            <div style={{ padding:"18px 16px 12px", borderBottom:"1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize:14, color:"#dde2ea", fontWeight:700, letterSpacing:0.4 }}>Marmolería</div>
                <div style={{ ...S.small, marginTop:2 }}>Líneas · Checklist</div>
              </div>
              
              {/* Nuevo Botón Exportar PDF General */}
              <button 
                style={{ ...S.btnPrim, padding: "6px 10px", fontSize: 11, background: "rgba(61,206,106,0.15)", color: "#3dce6a", borderColor: "rgba(61,206,106,0.4)" }} 
                onClick={exportarPDFGeneral}
                disabled={isExporting}
              >
                {isExporting ? "Generando..." : "↓ PDF"}
              </button>
            </div>

            {/* Botón para volver al Dashboard general */}
            <div style={{ padding: "8px 16px" }}>
              <button 
                onClick={() => setUnidadId(null)}
                style={{ 
                  width: "100%", padding: "8px 0", 
                  background: !unidadId ? "rgba(255,255,255,0.1)" : "transparent", 
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, 
                  color: "#dde2ea", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  transition: "background 0.2s"
                }}
              >
                🏠 Ver Todo (Dashboard)
              </button>
            </div>

            {/* Listado de Líneas y Barcos */}
            {lineas.map(l => {
              const selLinea = lineaId === l.id;
              return (
                <div key={l.id}>
                  <button style={lineaBtn(selLinea)} className="linea-btn" onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                    <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:5, height:5, borderRadius:"50%", background: selLinea ? "#dde2ea" : "#2c3040", flexShrink:0 }} />
                      {l.nombre}
                    </span>
                    {esAdmin && selLinea && (
                      <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>✕</span>
                    )}
                  </button>

                  {selLinea && (
                    <>
                      {unidades.map(u => (
                        <button key={u.id} style={unidadBtn(unidadId === u.id)} className="unidad-btn" onClick={() => setUnidadId(u.id)}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{u.codigo}</span>
                          {esAdmin && unidadId === u.id && (
                            <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>✕</span>
                          )}
                        </button>
                      ))}

                      {/* Input para agregar un nuevo barco */}
                      {esAdmin && (
                        <div style={{ padding:"6px 14px 10px 20px", display:"flex", gap:6 }}>
                          <input style={{ ...S.inputSm, flex:1 }} placeholder="Nuevo barco (ej: 37-36)"
                            value={newUnidad} onChange={e => setNewUnidad(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && crearUnidad()} />
                          <button style={S.btn} onClick={crearUnidad}>+</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Input para agregar una nueva línea */}
            {esAdmin && (
              <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", marginTop:"auto" }}>
                <div style={S.label}>Nueva línea</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input style={{ ...S.inputSm, flex:1 }} placeholder="Ej: K65"
                    value={newLinea} onChange={e => setNewLinea(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={S.btn} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── PANEL DER: Checklist o Dashboard General ── */}
          <div style={S.detail}>
            
            {/* Si NO hay unidad seleccionada mostramos el DASHBOARD GLOBAL */}
            {!unidadId ? (
              <div>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontSize: 22, color: "#dde2ea", fontWeight: 700, margin: 0 }}>Panel General de Envíos</h1>
                  <p style={{ color: "#566070", fontSize: 13, marginTop: 4 }}>
                    Resumen de todas las piezas que están en estado "Enviado" o "Rehacer" en toda la fábrica.
                  </p>
                </div>

                {dashboard.length === 0 ? (
                  <div style={{ textAlign:"center", padding:40, color:"#566070", background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.1)" }}>
                    No hay piezas pendientes de marmolería en este momento. ¡Todo al día!
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {dashboard.map(p => {
                      const prio = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                      return (
                        <div key={p.id} className="pieza-row" style={{ 
                          display:"grid", 
                          gridTemplateColumns:"80px 1.5fr 1fr 100px 100px 40px", 
                          gap:14, 
                          alignItems:"center", 
                          background:"rgba(255,255,255,0.02)", 
                          border:"1px solid rgba(255,255,255,0.05)", 
                          padding:"12px 16px", 
                          borderRadius:10 
                        }}>
                          
                          {/* Columna Barco */}
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", color:"#dde2ea", fontWeight:700 }}>
                            {p.codigo_barco}
                          </div>
                          
                          {/* Columna Pieza y Sector */}
                          <div>
                            <div style={{ color: "#dde2ea", fontSize: 14, fontWeight: 600 }}>{p.pieza}</div>
                            <div style={{ color: "#566070", fontSize: 11, marginTop: 2 }}>{p.sector} • {p.color || "Sin color asignado"}</div>
                          </div>

                          {/* Columna Prioridad (Semáforo) */}
                          <div>
                            <span style={{ 
                              background: prio.bg, color: prio.color, 
                              padding: "4px 8px", borderRadius: 6, 
                              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 
                            }}>
                              {p.prioridad || "Media"}
                            </span>
                          </div>

                          {/* Columna Fecha Envío */}
                          <div style={{ fontSize: 12, color: "#a8b4c4", fontFamily:"'JetBrains Mono',monospace" }}>
                            {p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "-"}
                          </div>

                          {/* Columna Estado */}
                          <div>
                            <span style={{...estadoBtn(p.estado), padding: "4px 8px", fontSize: 10 }}>{p.estado}</span>
                          </div>

                          {/* Acción Editar */}
                          <button style={S.btnGhost} className="btn-ghost-h" onClick={() => setModalPieza(p)} title="Editar Detalles">✎</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Si SÍ hay unidad seleccionada, mostramos el CHECKLIST DE ESE BARCO */
              <>
                {/* Header del barco */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, color:"#dde2ea", fontWeight:700, letterSpacing:0.5 }}>
                        {unidadSel?.codigo}
                      </span>
                      <span style={{ fontSize:11, color:"#566070", letterSpacing:1.5, textTransform:"uppercase" }}>
                        {lineaSel?.nombre}
                      </span>
                    </div>
                    <div style={{ ...S.small, marginTop:4 }}>
                      {piezas.filter(p=>p.estado!=="No lleva").length} piezas activas
                    </div>
                  </div>
                  
                  {/* Botones de acción del barco */}
                  <div style={{ display: "flex", gap: 10 }}>
                    {esAdmin && (
                      <button style={S.btn} onClick={() => setShowAddPieza(v => !v)}>
                        {showAddPieza ? "✕ Cancelar" : "+ Pieza extra"}
                      </button>
                    )}
                  </div>
                </div>

                {err && <div style={{ ...S.card, borderColor:"rgba(255,69,58,0.3)", color:"#ffbdbd" }}>{err}</div>}

                {/* Tarjeta de Progreso General del Barco */}
                <div style={{ ...S.card, padding:"14px 18px", marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                      {[
                        { label:"Recibidas",  val:stats.recibido,  color:"#3dce6a" },
                        { label:"Enviadas",   val:stats.enviado,   color:"#a8b4c4" },
                        { label:"Pendientes", val:stats.pendiente, color:"#566070" },
                        ...(stats.rehacer > 0 ? [{ label:"Rehacer", val:stats.rehacer, color:"#e04848" }] : []),
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <div style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }} />
                          <span style={{ fontSize:11, color:"#566070" }}>{val}</span>
                          <span style={{ fontSize:10, color:"#2c3040", letterSpacing:0.5 }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:700, color:pctColor, letterSpacing:-0.5 }}>
                      {porcentaje}<span style={{ fontSize:12, fontWeight:400, opacity:0.6 }}>%</span>
                    </span>
                  </div>
                  <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", width:`${porcentaje}%`,
                      background: porcentaje === 100
                        ? "linear-gradient(90deg, #3dce6a, #2eb85c)"
                        : "linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.15))",
                      borderRadius:99, transition:"width 0.5s ease",
                    }} />
                  </div>
                </div>

                {/* Panel de Agregar Pieza Extra Manual */}
                {showAddPieza && esAdmin && (
                  <div style={{ ...S.card, borderColor:"rgba(255,255,255,0.1)" }}>
                    <div style={{ ...S.label, marginBottom:8 }}>AGREGAR PIEZA EXTRA AL CHECKLIST</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 140px", gap:8, marginBottom:10 }}>
                      <input style={S.input} placeholder="Nombre de la pieza (ej: Alzada)" value={formPieza.pieza}
                        onChange={e => setFormPieza(f=>({...f,pieza:e.target.value}))} />
                      <input style={S.input} placeholder="Sector" value={formPieza.sector}
                        onChange={e => setFormPieza(f=>({...f,sector:e.target.value}))} />
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={S.btnPrim} onClick={agregarPiezaManual}>
                        Solo a este barco
                      </button>
                      <button style={{ ...S.btn, fontSize:12 }} onClick={agregarPiezaAPlantilla}>
                        + Agregar a plantilla general de {lineaSel?.nombre}
                      </button>
                    </div>
                    <div style={{ ...S.small, marginTop:8 }}>
                      "Solo a este barco" agrega únicamente en el casco actual. "Agregar a plantilla" la incluye en el listado base para todos los próximos barcos.
                    </div>
                  </div>
                )}

                {/* Filtros de la lista del barco */}
                <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                  {["todos", ...ESTADOS].map(e => {
                    const m = ESTADO_META[e];
                    const active = filtroEstado === e;
                    return (
                      <button key={e} onClick={() => setFiltroEstado(e)} style={{
                        padding:"4px 10px", borderRadius:8, cursor:"pointer",
                        fontSize:11, fontWeight:600, border:"1px solid",
                        borderColor: active ? (m?.border ?? "rgba(255,255,255,0.2)") : "rgba(255,255,255,0.07)",
                        background: active ? (m?.bg ?? "rgba(255,255,255,0.08)") : "transparent",
                        color: active ? (m?.color ?? "#dde2ea") : "#3a4455",
                        transition:"all 0.12s",
                      }}>
                        {e === "todos" ? "Todas" : e}
                      </button>
                    );
                  })}
                  <div style={{ flex:1, minWidth:120, position:"relative" }}>
                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#566070", pointerEvents:"none" }}>⌕</span>
                    <input style={{ ...S.inputSm, width:"100%", paddingLeft:28 }}
                      placeholder="Buscar pieza, sector..."
                      value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                </div>

                {/* Listado de Checklist Dividido Por Sector */}
                {loading ? (
                  <div style={{ textAlign:"center", padding:40, fontSize:11, color:"#2c3040", letterSpacing:2, textTransform:"uppercase", fontFamily:"'JetBrains Mono',monospace" }}>Cargando datos...</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ textAlign:"center", padding:40 }}>
                    <div style={{ fontSize:11, color:"#2c3040", letterSpacing:2, textTransform:"uppercase" }}>
                      {q || filtroEstado!=="todos" ? "Sin resultados para el filtro" : "Checklist vacío — usá '+ Pieza extra'"}
                    </div>
                  </div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => {
                    const recib = rows.filter(p=>p.estado==="Recibido").length;
                    const activas = rows.filter(p=>p.estado!=="No lleva").length;
                    const colorActualSector = rows[0]?.color || "";

                    return (
                      <div key={sector} style={{ marginBottom:24 }}>
                        {/* Cabecera del Sector con el asignador de Color Masivo */}
                        <div style={{
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          paddingBottom:8, marginBottom:2,
                          borderBottom:"1px solid rgba(255,255,255,0.05)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize:9, letterSpacing:2.5, fontWeight:700, color:"#2c3040", textTransform:"uppercase" }}>
                              {sector}
                            </span>
                            
                            {/* Input de color por sector exclusivo para Admin/Oficina */}
                            {esAdmin ? (
                              <input
                                defaultValue={colorActualSector}
                                placeholder="Definir material del sector..."
                                style={{
                                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
                                  color: "#a8b4c4", padding: "4px 8px", borderRadius: 6, fontSize: 10,
                                  outline: "none", width: "190px", transition: "border-color 0.2s"
                                }}
                                onBlur={(e) => {
                                  if (e.target.value !== colorActualSector) {
                                    cambiarColorSector(sector, e.target.value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.target.blur(); // Dispara el onBlur automáticamente
                                }}
                                title="Escribí el color/material y presioná Enter para aplicarlo a todo este sector"
                              />
                            ) : (
                              colorActualSector && <span style={{ fontSize:10, color:"#566070" }}>{colorActualSector}</span>
                            )}
                          </div>
                          
                          <span style={{ fontSize:10, color:"#2c3040", fontFamily:"'JetBrains Mono',monospace" }}>
                            {recib}/{activas}
                          </span>
                        </div>

                        {/* Piezas del sector */}
                        {rows.map(p => {
                          const meta = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                          const noLleva = p.estado === "No lleva";
                          const prio = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"]; // Semáforo por pieza

                          return (
                            <div key={p.id} className="pieza-row" style={{
                              display:"grid",
                              gridTemplateColumns:"1fr 130px 56px",
                              gap:10, alignItems:"center",
                              padding:"9px 6px",
                              borderBottom:"1px solid rgba(255,255,255,0.03)",
                              opacity: noLleva ? 0.3 : 1,
                              borderRadius:6,
                              transition:"background 0.1s",
                            }}>
                              
                              {/* Nombre pieza, semáforo y fechas */}
                              <div style={{ cursor:"pointer" }} onClick={() => setModalPieza(p)}>
                                <div style={{
                                  color: p.estado==="Recibido" ? "#3a4455" : "#dde2ea",
                                  fontSize:13, fontWeight:500,
                                  display:"flex", alignItems:"center", gap:8,
                                }}>
                                  
                                  {/* Puntito indicador del Estado (Pendiente, Enviado...) */}
                                  <div style={{
                                    width:6, height:6, borderRadius:"50%",
                                    background: meta.color, flexShrink:0,
                                    boxShadow: p.estado === "Recibido" ? `0 0 6px ${meta.color}88` : "none",
                                  }} />
                                  
                                  {/* Nombre de la pieza y Semáforo de prioridad */}
                                  {p.pieza}
                                  <div 
                                    style={{ width: 8, height: 8, borderRadius: "50%", background: prio.color, boxShadow: `0 0 6px ${prio.color}66`, marginLeft: 4 }} 
                                    title={`Prioridad: ${p.prioridad || 'Media'}`} 
                                  />
                                  
                                  {p.opcional && <span style={{ fontSize:9, color:"#2c3040", letterSpacing:1.5 }}>OPCIONAL</span>}
                                </div>

                                {/* Mostrar fechas directamente en la lista para hacerlo escaneable */}
                                {(p.fecha_envio || p.fecha_regreso) && (
                                  <div style={{ fontSize:9, color:"#2c3040", marginTop:3, paddingLeft:14, display:"flex", gap:10, fontFamily:"'JetBrains Mono',monospace" }}>
                                    {p.fecha_envio   && <span>Env {p.fecha_envio.split("-").reverse().join("/")}</span>}
                                    {p.fecha_regreso && <span>Reg {p.fecha_regreso.split("-").reverse().join("/")}</span>}
                                  </div>
                                )}
                                
                                {p.observaciones && (
                                  <div style={{ fontSize:11, color:"#3a4455", marginTop:2, paddingLeft:14, fontStyle:"italic" }}>{p.observaciones}</div>
                                )}
                              </div>

                              {/* Selector Rápido de Estado */}
                              <select style={estadoBtn(p.estado)}
                                value={p.estado}
                                onChange={e => setEstado(p.id, e.target.value)}>
                                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>

                              {/* Acciones de la Pieza */}
                              <div style={{ display:"flex", gap:2, justifyContent:"flex-end" }}>
                                <button style={S.btnGhost} className="btn-ghost-h" onClick={() => setModalPieza(p)} title="Editar Detalles Completos">✎</button>
                                {esAdmin && (
                                  <button style={S.btnGhost} className="btn-ghost-h" onClick={() => eliminarPieza(p.id)} title="Quitar pieza de la lista">×</button>
                                )}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </>
            )}
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