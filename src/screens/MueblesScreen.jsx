import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

// --- COLORES & ESTILOS AUXILIARES ---
const SECTOR_COLORS = {
  "Cocina": "#ffd60a", "Baño": "#30d158", "Baños": "#30d158",
  "Cockpit": "#0a84ff", "Camarote": "#bf5af2", "Exterior": "#ff9f0a",
  "Salón": "#ff453a", "General": "#8e8e93"
};

function getSectorColor(sector) {
  const key = Object.keys(SECTOR_COLORS).find(k => (sector || "").includes(k));
  return key ? SECTOR_COLORS[key] : SECTOR_COLORS["General"];
}

function getStatusStyle(estado) {
  let color = "#666"; 
  let borderColor = "#333";
  if (estado === "Completo") { color = "#30d158"; borderColor = "#30d158"; }
  else if (estado === "Rehacer") { color = "#ff453a"; borderColor = "#ff453a"; }
  else if (estado === "Parcial") { color = "#ffd60a"; borderColor = "#ffd60a"; }

  return {
    background: "#0b0b0b", color: color, border: `1px solid ${borderColor}`,
    padding: "6px 10px", borderRadius: 10, width: "100%",
    fontWeight: estado === "No enviado" ? "400" : "900", cursor: "pointer", outline: "none"
  };
}

// --- MODAL (FICHA TÉCNICA) ---
function MuebleModal({ mueble, onClose, onSave, onDelete, isAdmin }) {
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [form, setForm] = useState({
    nombre: mueble.nombre || "",
    sector: mueble.sector || "",
    descripcion: mueble.descripcion || "",
    medidas: mueble.medidas || "",
    material: mueble.material || "",
    imagen_url: mueble.imagen_url || ""
  });

  const S_Modal = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(5px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999 },
    card: { background: "#111", border: "1px solid #333", borderRadius: 16, width: "min(600px, 90vw)", padding: 24, maxHeight: "90vh", overflowY: "auto", position: "relative" },
    closeBtn: { position: "absolute", top: 16, right: 16, background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" },
    
    headerRow: { display: "flex", alignItems: "center", gap: 10, paddingRight: 30 },
    title: { margin: 0, color: "#fff", fontSize: 22, fontFamily: "Montserrat, sans-serif" },
    editBtn: { background: "#333", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 },
    
    sector: { color: getSectorColor(mueble.sector), fontSize: 13, fontWeight: 900, textTransform: "uppercase", marginTop: 4, letterSpacing: 1 },
    imageBox: { width: "100%", height: 250, background: "#000", border: "1px dashed #333", borderRadius: 12, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    img: { width: "100%", height: "100%", objectFit: "contain" },
    label: { color: "#888", fontSize: 12, marginTop: 12, display: "block", marginBottom: 4 },
    textDisplay: { color: "#ddd", fontSize: 15, lineHeight: 1.5 },
    input: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 14 },
    inputTitle: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 18, fontWeight: 900, marginBottom: 8 },
    textArea: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 14, minHeight: 80, resize: "vertical" },
    btnSave: { marginTop: 20, width: "100%", padding: 12, background: "#fff", color: "#000", fontWeight: 900, border: "none", borderRadius: 10, cursor: "pointer" },
    btnDelete: { marginTop: 10, width: "100%", padding: 12, background: "rgba(255, 69, 58, 0.1)", color: "#ff453a", fontWeight: 900, border: "1px solid #ff453a", borderRadius: 10, cursor: "pointer" }
  };

  const handleSave = () => {
    if (!form.nombre.trim()) return alert("El nombre es obligatorio");
    onSave(mueble.id, form);
    setIsEditMode(false);
  };
  
  const handleDelete = () => {
    if (window.confirm("⚠️ ¿Estás seguro de borrar este mueble DEL CATÁLOGO?\n\nSe borrará de TODOS los barcos.")) {
       onDelete(mueble.id);
       onClose();
    }
  };

  return (
    <div style={S_Modal.overlay} onClick={onClose}>
      <div style={S_Modal.card} onClick={e => e.stopPropagation()}>
        <button style={S_Modal.closeBtn} onClick={onClose}>&times;</button>
        
        <div style={S_Modal.headerRow}>
           {!isEditMode && <h2 style={S_Modal.title}>{form.nombre}</h2>}
           {isAdmin && !isEditMode && (
             <button style={S_Modal.editBtn} onClick={() => setIsEditMode(true)} title="Editar Ficha">✏️</button>
           )}
        </div>

        {!isEditMode && <div style={S_Modal.sector}>{form.sector}</div>}

        {isEditMode ? (
          <div style={{ marginTop: 20 }}>
             <label style={S_Modal.label}>Nombre del Mueble</label>
             <input style={S_Modal.inputTitle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
             <label style={S_Modal.label}>Sector</label>
             <input style={S_Modal.input} value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} />
             
             <label style={S_Modal.label}>URL Imagen</label>
             <input style={S_Modal.input} value={form.imagen_url} onChange={e => setForm({...form, imagen_url: e.target.value})} />

             <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div><label style={S_Modal.label}>Medidas</label><input style={S_Modal.input} value={form.medidas} onChange={e => setForm({...form, medidas: e.target.value})} /></div>
              <div><label style={S_Modal.label}>Material</label><input style={S_Modal.input} value={form.material} onChange={e => setForm({...form, material: e.target.value})} /></div>
            </div>

            <label style={S_Modal.label}>Descripción</label>
            <textarea style={S_Modal.textArea} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />

            <button style={S_Modal.btnSave} onClick={handleSave}>GUARDAR CAMBIOS</button>
            <button style={S_Modal.btnDelete} onClick={handleDelete}>ELIMINAR DEL SISTEMA</button>
            <button style={{...S_Modal.btnDelete, background:"transparent", border:"none", marginTop:0, color:"#888"}} onClick={() => setIsEditMode(false)}>Cancelar</button>
          </div>
        ) : (
          <>
            <div style={S_Modal.imageBox}>
              {form.imagen_url ? (
                <img src={form.imagen_url} alt="Plano" style={S_Modal.img} />
              ) : (
                <span style={{color:"#444"}}>Sin imagen</span>
              )}
            </div>
            
            <div style={{marginTop: 20}}>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom: 15}}>
                <div><span style={S_Modal.label}>MEDIDAS</span><div style={S_Modal.textDisplay}>{form.medidas || "—"}</div></div>
                <div><span style={S_Modal.label}>MATERIAL</span><div style={S_Modal.textDisplay}>{form.material || "—"}</div></div>
              </div>
              <div><span style={S_Modal.label}>DESCRIPCIÓN</span><div style={S_Modal.textDisplay}>{form.descripcion || "Sin descripción."}</div></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [modoConfig, setModoConfig] = useState(false);

  // DATA
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  
  // DATOS DE LA UNIDAD SELECCIONADA
  const [unidadData, setUnidadData] = useState(null);
  
  // --- NUEVO: ESTADO TEMPORAL PARA EL COLOR ---
  const [tempColor, setTempColor] = useState("");

  const [rows, setRows] = useState([]); 

  // CREACIÓN
  const [newLinea, setNewLinea] = useState("");
  const [newUnidad, setNewUnidad] = useState("");
  const [newMueble, setNewMueble] = useState({ nombre: "", sector: "" });

  // MODAL
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMuebleData, setSelectedMuebleData] = useState(null);

  // --- CARGAS ---
  async function cargarLineas() {
    const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre");
    setLineas(data ?? []);
    if (!lineaId && data?.length) setLineaId(data[0].id);
  }

  async function cargarUnidades(lid) {
    if (!lid) { setUnidades([]); return; }
    // IMPORTANTE: Asegurate de haber corrido el SQL para agregar la columna 'color'
    const { data } = await supabase.from("prod_unidades").select("id,codigo,color").eq("linea_id", lid).eq("activa", true).order("codigo");
    setUnidades(data ?? []);
    if (!unidadId && data?.length) setUnidadId(data[0].id);
  }

  // EFECTO PARA ACTUALIZAR DATOS DE LA UNIDAD ACTUAL Y EL INPUT TEMPORAL
  useEffect(() => {
    if (unidadId && unidades.length) {
      const u = unidades.find(x => x.id === unidadId);
      setUnidadData(u || null);
      setTempColor(u?.color || ""); // Prellenamos el input con lo que venga de la base
    } else {
      setUnidadData(null);
      setTempColor("");
    }
  }, [unidadId, unidades]);

  async function cargarChecklist(uid) {
    if (!uid) { setRows([]); return; }
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select(`
        id, estado, obs, 
        prod_muebles ( id, nombre, sector, descripcion, medidas, material, imagen_url )
      `)
      .eq("unidad_id", uid);

    if (error) return setErr(error.message);

    const mapped = (data ?? []).map((x) => ({
      id: x.id,
      estado: x.estado,
      obs: x.obs ?? "",
      mueble_id: x.prod_muebles?.id,
      nombre: x.prod_muebles?.nombre ?? "Desconocido",
      sector: x.prod_muebles?.sector ?? "General",
      descripcion: x.prod_muebles?.descripcion,
      medidas: x.prod_muebles?.medidas,
      material: x.prod_muebles?.material,
      imagen_url: x.prod_muebles?.imagen_url
    }));

    mapped.sort((a, b) => a.sector.localeCompare(b.sector) || a.nombre.localeCompare(b.nombre));
    setRows(mapped);
  }

  useEffect(() => { if (isAdmin) cargarLineas(); }, [isAdmin]);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(""); } }, [lineaId]);
  useEffect(() => { if (unidadId) cargarChecklist(unidadId); else setRows([]); }, [unidadId]);

  // --- ACCIONES GESTION ---
  async function crearLinea() {
    if (!newLinea.trim()) return;
    const { error } = await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true });
    if (error) return setErr(error.message);
    setNewLinea(""); cargarLineas();
  }
  async function borrarLinea() {
    if (!lineaId || !confirm("¿Borrar línea?")) return;
    await supabase.from("prod_lineas").delete().eq("id", lineaId);
    setLineaId(""); cargarLineas();
  }
  async function crearUnidad() {
    if (!lineaId || !newUnidad.trim()) return;
    const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id: lineaId, codigo: newUnidad.trim(), activa: true }).select().single();
    if (error) return setErr(error.message);
    
    const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lineaId);
    if (plantilla?.length) {
      const inserts = plantilla.map(p => ({ unidad_id: u.id, mueble_id: p.mueble_id, estado: "No enviado" }));
      await supabase.from("prod_unidad_checklist").insert(inserts);
    }
    setNewUnidad(""); cargarUnidades(lineaId);
  }
  async function borrarUnidad() {
    if (!unidadId || !confirm("¿Borrar barco?")) return;
    await supabase.from("prod_unidades").delete().eq("id", unidadId);
    setUnidadId(""); cargarUnidades(lineaId);
  }

  async function agregarMueble(e) {
    e.preventDefault();
    if (!lineaId || !newMueble.nombre) return;
    const { data: m, error: e1 } = await supabase.from("prod_muebles").insert({ nombre: newMueble.nombre, sector: newMueble.sector }).select().single();
    if (e1) return setErr(e1.message);
    const { error: e2 } = await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    if (e2) return setErr(e2.message);
    if (unidadId) {
      await supabase.from("prod_unidad_checklist").insert({ unidad_id: unidadId, mueble_id: m.id, estado: "No enviado" });
      cargarChecklist(unidadId);
    }
    setNewMueble({ nombre: "", sector: "" });
    setMsg("✅ Mueble agregado"); setTimeout(() => setMsg(""), 2000);
  }

  async function borrarMueble(row) {
    if (!confirm("¿Quitar mueble de este barco?")) return;
    await supabase.from("prod_unidad_checklist").delete().eq("id", row.id);
    cargarChecklist(unidadId);
  }

  // --- ACCION: GUARDAR COLOR (AHORA ES MANUAL) ---
  async function saveColorToDb() {
    if (!unidadId) return;
    const { error } = await supabase.from("prod_unidades").update({ color: tempColor }).eq("id", unidadId);
    if (error) return setErr("Error color: " + error.message);
    
    // Actualizamos localmente y mostramos feedback
    setUnidadData(prev => ({ ...prev, color: tempColor }));
    setUnidades(prev => prev.map(u => u.id === unidadId ? { ...u, color: tempColor } : u));
    setMsg("✅ Color guardado");
    setTimeout(() => setMsg(""), 2000);
  }

  // --- ACCIONES OPERATIVAS ---
  async function setEstado(rowId, estado) {
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    if (!error) setRows(prev => prev.map(r => r.id === rowId ? { ...r, estado } : r));
  }
  async function saveObs(rowId, obs) {
    await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
  }
  function openMuebleDetail(row) {
    setSelectedMuebleData({
      id: row.mueble_id,
      nombre: row.nombre,
      sector: row.sector,
      descripcion: row.descripcion,
      medidas: row.medidas,
      material: row.material,
      imagen_url: row.imagen_url
    });
    setModalOpen(true);
  }
  async function saveMuebleCatalog(muebleId, newValues) {
    const { error } = await supabase.from("prod_muebles").update(newValues).eq("id", muebleId);
    if (error) return setErr(error.message);
    cargarChecklist(unidadId);
  }
  async function deleteMuebleCatalog(muebleId) {
    const { error } = await supabase.from("prod_muebles").delete().eq("id", muebleId);
    if (error) return setErr(error.message);
    cargarChecklist(unidadId);
  }

  const checklistPorSector = useMemo(() => {
    const grupos = {};
    rows.forEach(r => {
      if (!grupos[r.sector]) grupos[r.sector] = [];
      grupos[r.sector].push(r);
    });
    return grupos;
  }, [rows]);

  const pct = useMemo(() => {
    if (!rows.length) return 0;
    const ok = rows.filter((r) => r.estado === "Completo").length;
    return Math.round((ok / rows.length) * 100);
  }, [rows]);

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main: { padding: 18 },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 14, marginBottom: 12 },
    sectorHeader: (sector) => ({ marginTop: 20, marginBottom: 10, paddingLeft: 10, borderLeft: `4px solid ${getSectorColor(sector)}`, fontWeight: 900, color: "#fff", fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }),
    itemRow: { display: "grid", gridTemplateColumns: "40px 1fr 140px 1fr 30px", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1a1a1a" },
    btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 700 },
    btnSaveSmall: { padding: "6px 12px", borderRadius: 8, border: "none", background: "#ffd60a", color: "#000", cursor: "pointer", fontWeight: 900, fontSize: 13, marginLeft: 10 },
    btnDanger: { padding: "8px 12px", borderRadius: 10, border: "1px solid #5a1d1d", background: "#2a0b0b", color: "#ffbdbd", cursor: "pointer", fontWeight: 700 },
    input: { background: "transparent", border: "none", borderBottom: "1px solid #333", color: "#ddd", padding: "5px", width: "100%", fontSize: 13, outline: "none" },
    iconBtn: { background: "transparent", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.7, padding:0, display:"flex", alignItems:"center" },
    tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
    tab: (on) => ({ padding: "6px 12px", borderRadius: 999, border: "1px solid #333", background: on ? "#eee" : "transparent", color: on ? "#000" : "#888", cursor: "pointer", fontWeight: 700, fontSize: 12 }),
    configPanel: { background: "#1a1a1a", padding: 15, borderRadius: 12, marginBottom: 20, border: "1px dashed #444" },
    
    // Header especial de Unidad
    unitHeader: { background: "linear-gradient(90deg, #111 0%, #070707 100%)", border: "1px solid #333", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 15 },
    unitTitle: { fontSize: 20, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: 1 },
    unitColorInput: { background: "transparent", border: "none", borderBottom: "1px dashed #666", color: "#ffd60a", fontSize: 20, fontWeight: 900, width: 200, outline: "none" }
  };

  if (!isAdmin) return <div style={S.page}><div style={{ padding: 20 }}>Acceso restringido</div></div>;

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          {err && <div style={{...S.card, borderColor: "#5a1d1d", color: "#ffbdbd"}}>{err}</div>}
          {msg && <div style={{...S.card, borderColor: "#1d5a2b", color: "#a6ffbf"}}>{msg}</div>}

          {/* CABECERA */}
          <div style={S.card}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
               <h2 style={{color:"#fff", margin:0}}>Producción Muebles</h2>
               <button style={{...S.btn, background: modoConfig ? "#ffd60a" : "#111", color: modoConfig ? "#000" : "#fff"}} onClick={() => setModoConfig(!modoConfig)}>
                 {modoConfig ? "⚙️ CONFIG (ON)" : "🔧 Configurar"}
               </button>
            </div>
            
            {modoConfig && (
              <div style={{marginTop: 20}}>
                <div style={S.configPanel}>
                  <h4 style={{marginTop:0, color:"#fff"}}>1. Gestionar Líneas</h4>
                  <div style={{display:"flex", gap:10}}>
                    <input style={{...S.input, background:"#000", border:"1px solid #333", borderRadius:6, padding:8}} placeholder="Nueva Línea (ej: K60)" value={newLinea} onChange={e=>setNewLinea(e.target.value)} />
                    <button style={S.btn} onClick={crearLinea}>+ Crear</button>
                    {lineaId && <button style={S.btnDanger} onClick={borrarLinea}>Borrar Línea</button>}
                  </div>
                </div>
                {lineaId && (
                  <div style={S.configPanel}>
                    <h4 style={{marginTop:0, color:"#fff"}}>2. Gestionar Barcos</h4>
                    <div style={{display:"flex", gap:10}}>
                      <input style={{...S.input, background:"#000", border:"1px solid #333", borderRadius:6, padding:8}} placeholder="Nuevo Barco (ej: 60-01)" value={newUnidad} onChange={e=>setNewUnidad(e.target.value)} />
                      <button style={S.btn} onClick={crearUnidad}>+ Crear</button>
                      {unidadId && <button style={S.btnDanger} onClick={borrarUnidad}>Borrar Barco</button>}
                    </div>
                  </div>
                )}
                {lineaId && (
                  <div style={S.configPanel}>
                    <h4 style={{marginTop:0, color:"#fff"}}>3. Mueble a Plantilla</h4>
                    <form onSubmit={agregarMueble} style={{display:"flex", gap:10}}>
                      <input style={{...S.input, background:"#000", border:"1px solid #333", borderRadius:6, padding:8}} placeholder="Nombre" value={newMueble.nombre} onChange={e=>setNewMueble({...newMueble, nombre:e.target.value})} />
                      <input style={{...S.input, background:"#000", border:"1px solid #333", borderRadius:6, padding:8}} placeholder="Sector" value={newMueble.sector} onChange={e=>setNewMueble({...newMueble, sector:e.target.value})} />
                      <button style={S.btn} type="submit">+ Agregar</button>
                    </form>
                  </div>
                )}
              </div>
            )}

            <div style={{marginTop: 15, display:"flex", gap:20, opacity: modoConfig ? 0.5 : 1}}>
              <div style={{flex:1}}>
                <div style={S.tabs}>
                  {lineas.map(l => <button key={l.id} style={S.tab(l.id === lineaId)} onClick={() => setLineaId(l.id)}>{l.nombre}</button>)}
                </div>
              </div>
              <div style={{flex:1}}>
                 <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                    {unidades.map(u => <button key={u.id} style={S.tab(u.id === unidadId)} onClick={() => setUnidadId(u.id)}>{u.codigo}</button>)}
                 </div>
              </div>
            </div>
          </div>

          {/* HEADER DE UNIDAD (ARREGLADO: INPUT RÁPIDO + BOTÓN GUARDAR) */}
          {unidadData && (
            <div style={S.unitHeader}>
               <div style={{fontSize: 24}}>⛵</div>
               <div>
                  <div style={{fontSize: 12, opacity: 0.6, letterSpacing: 1.5}}>FICHA TÉCNICA</div>
                  <div style={S.unitTitle}>BARCO {unidadData.codigo}</div>
               </div>
               <div style={{height: 40, width: 1, background: "#333", margin: "0 20px"}}></div>
               <div style={{display: "flex", alignItems: "center"}}>
                  <div>
                    <div style={{fontSize: 12, opacity: 0.6, letterSpacing: 1.5}}>ACABADO / CHAPA</div>
                    <input 
                        style={S.unitColorInput} 
                        value={tempColor} 
                        placeholder="Definir Color..." 
                        onChange={(e) => setTempColor(e.target.value)}
                    />
                  </div>
                  {/* Botón de guardar explícito */}
                  <button style={S.btnSaveSmall} onClick={saveColorToDb}>
                     💾 GUARDAR
                  </button>
               </div>
            </div>
          )}

          {/* LISTA */}
          {unidadId && (
             <div style={S.card}>
               <div style={{display:"flex", justifyContent:"space-between", marginBottom:10}}>
                  <div style={{fontWeight:900, color:"#fff"}}>Progreso: {pct}%</div>
               </div>

               {Object.entries(checklistPorSector).map(([sector, items]) => (
                 <div key={sector}>
                   <div style={S.sectorHeader(sector)}>{sector}</div>
                   {items.map(r => (
                     <div key={r.id} style={S.itemRow}>
                       <button style={S.iconBtn} onClick={() => openMuebleDetail(r)} title="Ficha Técnica">
                          {r.imagen_url ? "📸" : "📄"}
                       </button>
                       <div style={{color: "#fff", fontWeight: 500, cursor: "pointer"}} onClick={() => openMuebleDetail(r)}>
                          {r.nombre}
                          <div style={{fontSize:10, opacity:0.5}}>{r.medidas}</div>
                       </div>
                       
                       {/* Selector de Estado con FIX VISUAL */}
                       <select style={getStatusStyle(r.estado)} value={r.estado} onChange={(e) => setEstado(r.id, e.target.value)}>
                          {ESTADOS.map(x => (
                            <option key={x} value={x} style={{background: "#111", color: "#fff"}}>{x}</option>
                          ))}
                       </select>

                       <input style={S.input} value={r.obs} placeholder="Nota..." onChange={(e) => setRows(prev => prev.map(p => p.id === r.id ? { ...p, obs: e.target.value } : p))} onBlur={() => saveObs(r.id, r.obs)} />
                       {modoConfig && <button style={{...S.iconBtn, color:"#ff453a", opacity:1}} onClick={() => borrarMueble(r)}>🗑️</button>}
                     </div>
                   ))}
                 </div>
               ))}
               {!rows.length && <div style={{padding:20, opacity:0.5, textAlign:"center"}}>Sin muebles.</div>}
             </div>
          )}

          {modalOpen && selectedMuebleData && (
            <MuebleModal 
               mueble={selectedMuebleData} 
               onClose={() => setModalOpen(false)}
               onSave={saveMuebleCatalog}
               onDelete={deleteMuebleCatalog}
               isAdmin={isAdmin}
            />
          )}
        </main>
      </div>
    </div>
  );
}