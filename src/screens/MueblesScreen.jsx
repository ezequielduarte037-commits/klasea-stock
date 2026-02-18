import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

// --- COMPONENTE MODAL (FICHA TÉCNICA + EDICIÓN TOTAL) ---
function MuebleModal({ mueble, onClose, isEditMode, onSave }) {
  // Estado local para el formulario del modal
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
    title: { margin: 0, color: "#fff", fontSize: 22, fontFamily: "Montserrat, sans-serif" },
    sector: { color: getSectorColor(mueble.sector), fontSize: 13, fontWeight: 900, textTransform: "uppercase", marginTop: 4, letterSpacing: 1 },
    imageBox: { width: "100%", height: 250, background: "#000", border: "1px dashed #333", borderRadius: 12, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    img: { width: "100%", height: "100%", objectFit: "contain" },
    label: { color: "#888", fontSize: 12, marginTop: 12, display: "block", marginBottom: 4 },
    textDisplay: { color: "#ddd", fontSize: 15, lineHeight: 1.5 },
    input: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 14 },
    inputTitle: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 18, fontWeight: 900, marginBottom: 8 },
    textArea: { background: "#222", border: "1px solid #444", color: "#fff", padding: "10px", borderRadius: 8, width: "100%", fontSize: 14, minHeight: 80, resize: "vertical" },
    btnSave: { marginTop: 20, width: "100%", padding: 12, background: "#fff", color: "#000", fontWeight: 900, border: "none", borderRadius: 10, cursor: "pointer" }
  };

  const handleSave = () => {
    // Validar mínimo
    if (!form.nombre.trim()) return alert("El nombre es obligatorio");
    onSave(mueble.id, form);
    onClose();
  };

  return (
    <div style={S_Modal.overlay} onClick={onClose}>
      <div style={S_Modal.card} onClick={e => e.stopPropagation()}>
        <button style={S_Modal.closeBtn} onClick={onClose}>&times;</button>
        
        {/* CABECERA EDITABLE */}
        {isEditMode ? (
          <div style={{ marginBottom: 20, borderBottom: "1px solid #333", paddingBottom: 15 }}>
             <label style={S_Modal.label}>Nombre del Mueble</label>
             <input 
               style={S_Modal.inputTitle} 
               value={form.nombre} 
               onChange={e => setForm({...form, nombre: e.target.value})} 
               placeholder="Ej: Bajo Mesada"
             />
             <label style={S_Modal.label}>Sector (Cocina, Baño, etc)</label>
             <input 
               style={S_Modal.input} 
               value={form.sector} 
               onChange={e => setForm({...form, sector: e.target.value})} 
               placeholder="Ej: Cocina"
             />
          </div>
        ) : (
          <>
            <h2 style={S_Modal.title}>{mueble.nombre}</h2>
            <div style={S_Modal.sector}>{mueble.sector}</div>
          </>
        )}

        {/* AREA DE IMAGEN */}
        <div style={S_Modal.imageBox}>
          {form.imagen_url ? (
            <img src={form.imagen_url} alt="Plano" style={S_Modal.img} />
          ) : (
            <span style={{color:"#444"}}>Sin imagen (Click en editar para agregar URL)</span>
          )}
        </div>

        {/* FORMULARIO */}
        {isEditMode ? (
          <div style={{marginTop: 20}}>
            <label style={S_Modal.label}>URL de Imagen (Click derecho en foto -> Copiar dirección)</label>
            <input style={S_Modal.input} value={form.imagen_url} onChange={e => setForm({...form, imagen_url: e.target.value})} placeholder="https://..." />

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div>
                <label style={S_Modal.label}>Medidas (mm)</label>
                <input style={S_Modal.input} value={form.medidas} onChange={e => setForm({...form, medidas: e.target.value})} placeholder="Ej: 800x600" />
              </div>
              <div>
                <label style={S_Modal.label}>Material</label>
                <input style={S_Modal.input} value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="Ej: Roble" />
              </div>
            </div>

            <label style={S_Modal.label}>Descripción / Notas de Armado</label>
            <textarea style={S_Modal.textArea} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />

            <button style={S_Modal.btnSave} onClick={handleSave}>GUARDAR CAMBIOS</button>
          </div>
        ) : (
          /* MODO LECTURA */
          <div style={{marginTop: 20}}>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom: 15}}>
              <div>
                <span style={S_Modal.label}>MEDIDAS</span>
                <div style={S_Modal.textDisplay}>{form.medidas || "—"}</div>
              </div>
              <div>
                <span style={S_Modal.label}>MATERIAL</span>
                <div style={S_Modal.textDisplay}>{form.material || "—"}</div>
              </div>
            </div>
            <div>
              <span style={S_Modal.label}>DESCRIPCIÓN</span>
              <div style={S_Modal.textDisplay}>{form.descripcion || "Sin descripción adicional."}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // DATA
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  const [rows, setRows] = useState([]); 

  // MODAL
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMuebleData, setSelectedMuebleData] = useState(null); // Datos del catálogo (prod_muebles)
  const [editModeModal, setEditModeModal] = useState(false);

  // CARGAS
  async function cargarLineas() {
    const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre");
    setLineas(data ?? []);
    if (!lineaId && data?.length) setLineaId(data[0].id);
  }

  async function cargarUnidades(lid) {
    if (!lid) return;
    const { data } = await supabase.from("prod_unidades").select("id,codigo").eq("linea_id", lid).eq("activa", true).order("codigo");
    setUnidades(data ?? []);
    setUnidadId(data?.[0]?.id || "");
  }

  async function cargarChecklist(uid) {
    if (!uid) { setRows([]); return; }
    // Traemos también los datos de la ficha técnica (prod_muebles)
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select(`
        id, estado, obs, 
        prod_muebles ( id, nombre, sector, descripcion, medidas, material, imagen_url )
      `)
      .eq("unidad_id", uid);

    if (error) return setErr(error.message);

    const mapped = (data ?? []).map((x) => ({
      id: x.id, // ID del checklist
      estado: x.estado,
      obs: x.obs ?? "",
      // Datos del Catálogo (Mueble Real)
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

  // EFECTOS
  useEffect(() => { if (isAdmin) cargarLineas(); }, [isAdmin]);
  useEffect(() => { if (lineaId) cargarUnidades(lineaId); }, [lineaId]);
  useEffect(() => { cargarChecklist(unidadId); }, [unidadId]);

  // ACCIONES
  async function setEstado(rowId, estado) {
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    if (!error) setRows(prev => prev.map(r => r.id === rowId ? { ...r, estado } : r));
  }

  async function saveObs(rowId, obs) {
    await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
  }

  // ABRIR MODAL
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
    setEditModeModal(false); 
    setModalOpen(true);
  }

  // GUARDAR EDICION DEL MUEBLE (CATALOGO)
  async function saveMuebleCatalog(muebleId, newValues) {
    setErr("");
    const { error } = await supabase.from("prod_muebles").update(newValues).eq("id", muebleId);
    if (error) return setErr("Error guardando ficha: " + error.message);
    
    setMsg("✅ Ficha y nombre actualizados");
    setTimeout(() => setMsg(""), 3000);
    cargarChecklist(unidadId); // Recargar para ver cambios
  }

  // AGRUPACIÓN VISUAL
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
    
    // Header Sector
    sectorHeader: (sector) => ({
      marginTop: 20, marginBottom: 10, paddingLeft: 10, 
      borderLeft: `4px solid ${getSectorColor(sector)}`,
      fontWeight: 900, color: "#fff", fontSize: 14, letterSpacing: 1, textTransform: "uppercase"
    }),
    
    // Row Item
    itemRow: {
      display: "grid", gridTemplateColumns: "40px 1fr 140px 1fr", gap: 12, 
      alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1a1a1a"
    },
    
    // Botones e Inputs
    btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 700 },
    input: { background: "transparent", border: "none", borderBottom: "1px solid #333", color: "#ddd", padding: "5px", width: "100%", fontSize: 13, outline: "none" },
    
    // Icono Ojo
    iconBtn: { background: "transparent", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.7, padding:0, display:"flex", alignItems:"center" },
    
    // Tabs Lineas
    tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
    tab: (on) => ({
      padding: "6px 12px", borderRadius: 999, border: "1px solid #333",
      background: on ? "#eee" : "transparent", color: on ? "#000" : "#888", cursor: "pointer", fontWeight: 700, fontSize: 12
    }),
  };

  if (!isAdmin) return <div style={S.page}><div style={{ padding: 20 }}>Acceso restringido</div></div>;

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          
          {msg && <div style={{...S.card, borderColor: "#1d5a2b", color: "#a6ffbf"}}>{msg}</div>}

          {/* CONTROL SUPERIOR */}
          <div style={S.card}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
               <h2 style={{color:"#fff", margin:0}}>Producción Muebles</h2>
               <div style={{fontSize:12, opacity:0.6}}>Click en el 👁️ o nombre para ver la Ficha Técnica</div>
            </div>
            
            <div style={{marginTop: 15, display:"flex", gap:20, alignItems:"flex-start"}}>
              {/* Selector Linea */}
              <div style={{flex:1}}>
                <div style={{fontSize:11, opacity:0.5, marginBottom:6}}>LÍNEA DE PRODUCCIÓN</div>
                <div style={S.tabs}>
                  {lineas.map(l => (
                    <button key={l.id} style={S.tab(l.id === lineaId)} onClick={() => setLineaId(l.id)}>{l.nombre}</button>
                  ))}
                </div>
              </div>
              
              {/* Selector Barco */}
              <div style={{flex:1}}>
                 <div style={{fontSize:11, opacity:0.5, marginBottom:6}}>UNIDAD / BARCO</div>
                 <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                    {unidades.map(u => (
                      <button key={u.id} style={S.tab(u.id === unidadId)} onClick={() => setUnidadId(u.id)}>{u.codigo}</button>
                    ))}
                    {!unidades.length && <div style={{opacity:0.5, fontSize:12}}>Seleccioná línea...</div>}
                 </div>
              </div>
            </div>
          </div>

          {/* LISTA PRINCIPAL */}
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
                       
                       {/* 1. Icono Ficha Tecnica */}
                       <button style={S.iconBtn} onClick={() => openMuebleDetail(r)} title="Ver Ficha Técnica">
                          {r.imagen_url ? "📸" : "📄"}
                       </button>

                       {/* 2. Nombre (Clickeable también) */}
                       <div 
                          style={{color: "#fff", fontWeight: 500, cursor: "pointer"}} 
                          onClick={() => openMuebleDetail(r)}
                       >
                          {r.nombre}
                          {/* Mini indicador si tiene medidas cargadas */}
                          {r.medidas && <span style={{fontSize:10, opacity:0.5, marginLeft:6}}>{r.medidas}</span>}
                       </div>

                       {/* 3. Selector Estado */}
                       <select 
                          style={getStatusStyle(r.estado)} 
                          value={r.estado} 
                          onChange={(e) => setEstado(r.id, e.target.value)}
                       >
                          {ESTADOS.map(x => <option key={x} value={x} style={{color:"#000"}}>{x}</option>)}
                       </select>

                       {/* 4. Observaciones Rapidas */}
                       <input 
                          style={S.input} 
                          value={r.obs} 
                          placeholder="Nota rápida..."
                          onChange={(e) => setRows(prev => prev.map(p => p.id === r.id ? { ...p, obs: e.target.value } : p))} 
                          onBlur={() => saveObs(r.id, r.obs)} 
                       />
                     </div>
                   ))}
                 </div>
               ))}
               
               {!rows.length && <div style={{padding:20, opacity:0.5, textAlign:"center"}}>Sin muebles asignados.</div>}
             </div>
          )}

          {/* MODAL DE FICHA TECNICA */}
          {modalOpen && selectedMuebleData && (
            <MuebleModal 
               mueble={selectedMuebleData} 
               onClose={() => setModalOpen(false)}
               isEditMode={editModeModal} // Podríamos poner un toggle si queres editar en caliente
               onSave={saveMuebleCatalog}
            />
          )}

          {/* BOTON FLOTANTE PARA ACTIVAR MODO EDICION DEL MODAL (Truco UI) */}
          {modalOpen && isAdmin && (
             <div style={{position:"fixed", bottom:20, right:20, zIndex:1000}}>
                <button 
                  style={{background: editModeModal ? "#ffd60a" : "#333", color: editModeModal ? "#000" : "#fff", border:"none", padding:"10px 20px", borderRadius:20, fontWeight:900, cursor:"pointer", boxShadow:"0 4px 12px rgba(0,0,0,0.5)"}}
                  onClick={() => setEditModeModal(!editModeModal)}
                >
                   {editModeModal ? "Modo Lectura" : "✏️ Editar Ficha"}
                </button>
             </div>
          )}

        </main>
      </div>
    </div>
  );
}