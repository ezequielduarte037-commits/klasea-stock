import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

// Colores para diferenciar sectores visualmente
const SECTOR_COLORS = {
  "Cocina": "#ffd60a",  // Amarillo
  "Baño": "#30d158",    // Verde
  "Baños": "#30d158",
  "Cockpit": "#0a84ff", // Azul
  "Camarote": "#bf5af2", // Violeta
  "Exterior": "#ff9f0a", // Naranja
  "Salón": "#ff453a",   // Rojo
  "General": "#8e8e93"  // Gris
};

function getSectorColor(sector) {
  const key = Object.keys(SECTOR_COLORS).find(k => (sector || "").includes(k));
  return key ? SECTOR_COLORS[key] : SECTOR_COLORS["General"];
}

// Lógica de colores para el ESTADO (Verde si está OK, Rojo si falla)
function getStatusStyle(estado) {
  let color = "#666"; // Por defecto (No enviado)
  let borderColor = "#333";

  if (estado === "Completo") {
    color = "#30d158"; // Verde
    borderColor = "#30d158";
  } else if (estado === "Rehacer") {
    color = "#ff453a"; // Rojo
    borderColor = "#ff453a";
  } else if (estado === "Parcial") {
    color = "#ffd60a"; // Amarillo
    borderColor = "#ffd60a";
  }

  return {
    background: "#0b0b0b",
    color: color,
    border: `1px solid ${borderColor}`,
    padding: "6px 10px",
    borderRadius: 10,
    width: "100%",
    fontWeight: estado === "No enviado" ? "400" : "900", // Negrita si tiene estado activo
    cursor: "pointer",
    outline: "none"
  };
}

export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // ESTADOS PRINCIPALES
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [lineaNombre, setLineaNombre] = useState("");

  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  const [unidadCodigo, setUnidadCodigo] = useState("");

  const [rows, setRows] = useState([]); 
  const [savingObsId, setSavingObsId] = useState(null);

  // MODO EDICION
  const [modoEdicion, setModoEdicion] = useState(false);
  const [plantilla, setPlantilla] = useState([]);
  const [newMueble, setNewMueble] = useState({ nombre: "", sector: "" });
  
  // Edición puntual (rename)
  const [editingMuebleId, setEditingMuebleId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: "", sector: "" });

  // UI CREACIÓN
  const [showAddLinea, setShowAddLinea] = useState(false);
  const [newLineaNombre, setNewLineaNombre] = useState("");
  const [copyFromLineaId, setCopyFromLineaId] = useState(""); 
  const [showAddUnidad, setShowAddUnidad] = useState(false);
  const [newUnidadCodigo, setNewUnidadCodigo] = useState("");

  // --- CARGAS ---
  async function cargarLineas() {
    setErr("");
    const { data, error } = await supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre");
    if (error) return setErr(error.message);
    setLineas(data ?? []);
    if (!lineaId && data?.length) {
      setLineaId(data[0].id);
      setLineaNombre(data[0].nombre);
    }
  }

  async function cargarUnidades(lid) {
    if (!lid) return;
    setErr("");
    const { data, error } = await supabase.from("prod_unidades").select("id,codigo").eq("linea_id", lid).eq("activa", true).order("codigo");
    if (error) return setErr(error.message);
    setUnidades(data ?? []);
    setUnidadId(""); setUnidadCodigo(""); setRows([]);
    if (data?.length) {
      setUnidadId(data[0].id);
      setUnidadCodigo(data[0].codigo);
    }
  }

  async function cargarChecklist(uid) {
    if (!uid) return;
    setErr(""); setMsg("");
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select(`id, estado, obs, prod_muebles ( nombre, sector )`)
      .eq("unidad_id", uid);

    if (error) return setErr(error.message);

    const mapped = (data ?? []).map((x) => ({
      id: x.id,
      estado: x.estado,
      obs: x.obs ?? "",
      mueble: x.prod_muebles?.nombre ?? "",
      sector: x.prod_muebles?.sector ?? "General",
    }));

    mapped.sort((a, b) => a.sector.localeCompare(b.sector) || a.mueble.localeCompare(b.mueble));
    setRows(mapped);
  }

  async function cargarPlantilla(lid) {
    if (!lid) return;
    const { data, error } = await supabase
      .from("prod_linea_muebles")
      .select(`id, prod_muebles ( id, nombre, sector )`)
      .eq("linea_id", lid);

    if (error) return setErr("Error plantilla: " + error.message);

    const lista = (data ?? []).map((x) => ({
      link_id: x.id,
      mueble_id: x.prod_muebles?.id,
      nombre: x.prod_muebles?.nombre,
      sector: x.prod_muebles?.sector
    }));
    lista.sort((a, b) => (a.sector || "").localeCompare(b.sector || ""));
    setPlantilla(lista);
  }

  // --- EFECTOS ---
  useEffect(() => { if (isAdmin) cargarLineas(); }, [isAdmin]);
  useEffect(() => { 
    if (lineaId) {
      cargarUnidades(lineaId);
      if (modoEdicion) cargarPlantilla(lineaId);
    }
  }, [lineaId, modoEdicion]);
  useEffect(() => { if (unidadId && !modoEdicion) cargarChecklist(unidadId); }, [unidadId, modoEdicion]);

  // --- AGRUPACIÓN ---
  const checklistPorSector = useMemo(() => {
    const grupos = {};
    rows.forEach(r => {
      const s = r.sector || "General";
      if (!grupos[s]) grupos[s] = [];
      grupos[s].push(r);
    });
    return grupos;
  }, [rows]);

  const pct = useMemo(() => {
    if (!rows.length) return 0;
    const ok = rows.filter((r) => r.estado === "Completo").length;
    return Math.round((ok / rows.length) * 100);
  }, [rows]);

  // --- ACCIONES ---
  async function setEstado(rowId, estado) {
    setErr("");
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    if (error) return setErr(error.message);
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, estado } : r)));
  }

  async function saveObs(rowId, obs) {
    setErr(""); setSavingObsId(rowId);
    const { error } = await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
    setSavingObsId(null);
    if (error) return setErr(error.message);
  }

  async function agregarMuebleAPlantilla(e) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!lineaId || !newMueble.nombre.trim()) return setErr("Faltan datos.");

    const { data: m, error: e1 } = await supabase.from("prod_muebles")
      .insert({ nombre: newMueble.nombre.trim(), sector: newMueble.sector.trim() })
      .select().single();

    if (e1) return setErr(e1.message);

    const { error: e2 } = await supabase.from("prod_linea_muebles")
      .insert({ linea_id: lineaId, mueble_id: m.id });

    if (e2) return setErr(e2.message);
    setMsg("✅ Agregado"); setNewMueble({ nombre: "", sector: "" }); cargarPlantilla(lineaId);
  }

  async function borrarDePlantilla(linkId) {
    if (!confirm("¿Sacar este mueble de la línea?")) return;
    setErr("");
    const { error } = await supabase.from("prod_linea_muebles").delete().eq("id", linkId);
    if (error) return setErr(error.message);
    cargarPlantilla(lineaId);
  }

  async function guardarEdicionMueble(muebleId) {
    setErr("");
    const { error } = await supabase.from("prod_muebles")
      .update({ nombre: editForm.nombre, sector: editForm.sector })
      .eq("id", muebleId);
    
    if (error) return setErr(error.message);
    setEditingMuebleId(null);
    cargarPlantilla(lineaId);
  }

  function startEdit(m) {
    setEditingMuebleId(m.mueble_id);
    setEditForm({ nombre: m.nombre, sector: m.sector });
  }

  async function createLinea() {
    setErr(""); setMsg("");
    const nombre = String(newLineaNombre).trim().toUpperCase();
    if (!nombre) return setErr("Nombre inválido");
    const { data: ins, error: e1 } = await supabase.from("prod_lineas").insert([{ nombre, activa: true }]).select().single();
    if (e1) return setErr(e1.message);
    if (copyFromLineaId) {
      const { data: src } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", copyFromLineaId);
      if (src?.length) {
        await supabase.from("prod_linea_muebles").insert(src.map(r => ({ linea_id: ins.id, mueble_id: r.mueble_id })));
      }
    }
    setMsg(`Línea ${nombre} creada.`); setShowAddLinea(false); setNewLineaNombre(""); cargarLineas();
  }

  async function createUnidad() {
    setErr(""); setMsg("");
    if (!lineaId) return setErr("Seleccioná línea");
    const codigo = String(newUnidadCodigo).trim();
    if (!codigo) return setErr("Código inválido");
    const { data: u, error: e1 } = await supabase.from("prod_unidades").insert([{ linea_id: lineaId, codigo, activa: true }]).select().single();
    if (e1) return setErr(e1.message);
    const { data: p } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lineaId);
    if (p?.length) {
      await supabase.from("prod_unidad_checklist").insert(p.map(r => ({ unidad_id: u.id, mueble_id: r.mueble_id, estado: "No enviado" })));
    }
    setMsg(`Unidad ${codigo} creada.`); setShowAddUnidad(false); setNewUnidadCodigo(""); cargarUnidades(lineaId);
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main: { padding: 18 },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 14, marginBottom: 12 },
    tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" },
    tab: (on) => ({
      padding: "8px 12px", borderRadius: 999, border: "1px solid #2a2a2a",
      background: on ? "#111" : "transparent", color: on ? "#fff" : "#bbb", cursor: "pointer", fontWeight: 900,
    }),
    grid: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 },
    unitBtn: (on) => ({
      width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #2a2a2a",
      background: on ? "#111" : "transparent", color: on ? "#fff" : "#bbb", cursor: "pointer", fontWeight: 900, marginBottom: 8,
    }),
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 10px", borderRadius: 10, width: "100%" },
    select: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 10px", borderRadius: 10, width: "100%" },
    small: { fontSize: 12, opacity: 0.75 },
    btn: { padding: "8px 10px", borderRadius: 12, border: "1px solid #2a2a2a", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 },
    btnConfig: (on) => ({
      padding: "8px 10px", borderRadius: 12, border: "1px solid #2a2a2a",
      background: on ? "#2a1f00" : "transparent", color: on ? "#ffd60a" : "#666", 
      cursor: "pointer", fontWeight: 900, marginLeft: "auto"
    }),
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    
    sectorHeader: (sector) => ({
      marginTop: 16, marginBottom: 8, paddingLeft: 10, 
      borderLeft: `4px solid ${getSectorColor(sector)}`,
      fontWeight: 900, color: "#fff", fontSize: 14, letterSpacing: 1
    }),
    itemRow: {
      display: "grid", gridTemplateColumns: "1fr 140px 1fr", gap: 10, 
      alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a1a1a"
    },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 8px", borderBottom: "1px solid #1d1d1d" },
    td: { padding: "10px 8px", borderBottom: "1px solid #111", verticalAlign: "top" },
  };

  if (!isAdmin) return <div style={S.page}><div style={{ padding: 20 }}>Acceso restringido <Link to="/panol">Volver</Link></div></div>;

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div>}
          {msg && <div style={{ ...S.card, borderColor: "#1d5a2b", color: "#bfffd0" }}>{msg}</div>}

          {/* CABECERA */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff" }}>
                  {modoEdicion ? `🛠️ Editando: ${lineaNombre}` : "Producción Muebles"}
                </h2>
                <div style={S.small}>
                  {modoEdicion ? "Agregá, editá o borrá muebles de la plantilla base." : "Seleccioná un barco para ver el checklist."}
                </div>
              </div>
            </div>

            <div style={{ ...S.row, marginTop: 10 }}>
              <div style={S.tabs}>
                {lineas.map((l) => (
                  <button key={l.id} style={S.tab(l.id === lineaId)} onClick={() => { setLineaId(l.id); setLineaNombre(l.nombre); }}>
                    {l.nombre}
                  </button>
                ))}
              </div>
              {lineaId && (
                <button style={S.btnConfig(modoEdicion)} onClick={() => setModoEdicion(!modoEdicion)}>
                  {modoEdicion ? "Cerrar Editor" : "⚙️ Plantilla"}
                </button>
              )}
              <button style={S.btn} onClick={() => setShowAddLinea(!showAddLinea)}>+ Línea</button>
            </div>
            
            {showAddLinea && (
              <div style={{ marginTop: 12, ...S.row }}>
                <input style={{ ...S.input, maxWidth: 150 }} placeholder="K55" value={newLineaNombre} onChange={(e) => setNewLineaNombre(e.target.value)} />
                <select style={{ ...S.select, maxWidth: 200 }} value={copyFromLineaId} onChange={(e) => setCopyFromLineaId(e.target.value)}>
                  <option value="">(Opcional) Copiar...</option>
                  {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
                <button style={S.btn} onClick={createLinea}>Crear</button>
              </div>
            )}
          </div>

          {/* === MODO EDITOR === */}
          {modoEdicion ? (
            <div style={S.card}>
              <div style={{ ...S.row, background: "#111", padding: 10, borderRadius: 12, marginBottom: 14 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Nuevo Mueble" value={newMueble.nombre} onChange={e => setNewMueble({...newMueble, nombre: e.target.value})} />
                <input style={{ ...S.input, width: 150 }} placeholder="Sector" value={newMueble.sector} onChange={e => setNewMueble({...newMueble, sector: e.target.value})} />
                <button style={S.btn} onClick={agregarMuebleAPlantilla}>Agregar</button>
              </div>

              {plantilla.map(p => (
                <div key={p.link_id} style={S.itemRow}>
                  {editingMuebleId === p.mueble_id ? (
                    <>
                      <input style={S.input} value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})} />
                      <input style={S.input} value={editForm.sector} onChange={e => setEditForm({...editForm, sector: e.target.value})} />
                      <div style={{display:"flex", gap:5}}>
                        <button style={S.btn} onClick={() => guardarEdicionMueble(p.mueble_id)}>💾</button>
                        <button style={S.btnConfig(false)} onClick={() => setEditingMuebleId(null)}>❌</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <b style={{ color: "#fff" }}>{p.nombre}</b>
                        <div style={{ fontSize: 11, color: getSectorColor(p.sector) }}>{p.sector}</div>
                      </div>
                      <div style={S.small}>ID: {p.mueble_id}</div>
                      <div style={{ textAlign: "right", display: "flex", gap: 5, justifyContent: "flex-end" }}>
                        <button style={S.btnConfig(false)} onClick={() => startEdit(p)} title="Editar">✏️</button>
                        <button style={{...S.btnConfig(false), color: "#ff453a"}} onClick={() => borrarDePlantilla(p.link_id)} title="Borrar">🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!plantilla.length && <div style={{padding:20, textAlign:"center", opacity:0.5}}>No hay muebles en esta plantilla.</div>}
            </div>
          ) : (
            /* === MODO CHECKLIST VISUAL === */
            <div style={S.grid}>
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, color: "#fff" }}>Unidades</div>
                  <button style={S.btn} onClick={() => setShowAddUnidad(!showAddUnidad)} disabled={!lineaId}>+ Barco</button>
                </div>
                {showAddUnidad && (
                  <div style={{ marginBottom: 10, ...S.row }}>
                    <input style={S.input} placeholder={`${lineaNombre}-XX`} value={newUnidadCodigo} onChange={(e) => setNewUnidadCodigo(e.target.value)} />
                    <button style={S.btn} onClick={createUnidad}>OK</button>
                  </div>
                )}
                {unidades.map((u) => (
                  <button key={u.id} style={S.unitBtn(u.id === unidadId)} onClick={() => { setUnidadId(u.id); setUnidadCodigo(u.codigo); }}>
                    {u.codigo}
                  </button>
                ))}
                {!unidades.length && <div style={S.small}>Sin unidades.</div>}
              </div>

              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, color: "#fff" }}>{unidadCodigo || "Seleccioná barco"}</div>
                  <div style={S.small}>{unidadId ? `Progreso: ${pct}%` : ""}</div>
                </div>

                {Object.entries(checklistPorSector).map(([sector, items]) => (
                  <div key={sector}>
                    <div style={S.sectorHeader(sector)}>{sector.toUpperCase()}</div>
                    {items.map(r => (
                      <div key={r.id} style={S.itemRow}>
                        <div style={{ color: "#d0d0d0", fontWeight: 500 }}>{r.mueble}</div>
                        
                        {/* Selector con color condicional */}
                        <div>
                           <select 
                              style={getStatusStyle(r.estado)} 
                              value={r.estado} 
                              onChange={(e) => setEstado(r.id, e.target.value)}
                           >
                              {ESTADOS.map((x) => <option key={x} value={x} style={{color:"#000"}}>{x}</option>)}
                           </select>
                        </div>

                        <div>
                          <input 
                            style={{ ...S.input, padding: "6px 10px", fontSize: 12, background: "transparent", border: "none", borderBottom: "1px solid #333" }} 
                            value={r.obs} 
                            placeholder="Observación..."
                            onChange={(e) => setRows(prev => prev.map(p => p.id === r.id ? { ...p, obs: e.target.value } : p))} 
                            onBlur={() => saveObs(r.id, r.obs)} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                
                {unidadId && !rows.length && (
                  <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
                    No hay muebles asignados. Revisá la plantilla (⚙️).
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}