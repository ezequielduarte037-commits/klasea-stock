import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ── CONSTANTES ────────────────────────────────────────────────────
const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

const ESTADO_META = {
  "No enviado": { color: "#444",    bg: "transparent",           dot: "○" },
  "Parcial":    { color: "#909090", bg: "rgba(255,255,255,0.04)", dot: "◑" },
  "Completo":   { color: "#5cd679", bg: "rgba(92,214,121,0.08)", dot: "●" },
  "Rehacer":    { color: "#e05050", bg: "rgba(224,80,80,0.08)",   dot: "↺" },
};

// ── PALETA ────────────────────────────────────────────────────────
const C = {
  text:      "#c0c0c0",
  textDim:   "#606060",
  bg:        "#000",
  surface:   "#070707",
  surfaceHi: "#0e0e0e",
  border:    "rgba(255,255,255,0.07)",
  borderHi:  "rgba(255,255,255,0.13)",
};

function progreso(rows) {
  if (!rows.length) return 0;
  return Math.round(rows.filter(r => r.estado === "Completo").length / rows.length * 100);
}

// ── EDICIÓN DE NOTA INLINE ────────────────────────────────────────
function ObsInline({ value, rowId, onSave }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal]   = useState(value ?? "");
  const ref = useRef(null);

  useEffect(() => { if (edit) ref.current?.focus(); }, [edit]);

  function commit() {
    setEdit(false);
    if (val !== value) onSave(rowId, val);
  }

  if (!edit && !val) return (
    <button style={{ background:"none", border:"none", color:"#333", fontSize:11, cursor:"text", padding:0, marginTop:2 }}
      onClick={() => setEdit(true)}>
      + nota
    </button>
  );
  if (!edit) return (
    <div style={{ fontSize:11, color:"#545454", marginTop:3, fontStyle:"italic", cursor:"text" }}
      onClick={() => setEdit(true)}>{val}</div>
  );
  return (
    <input ref={ref} style={{
      background:"transparent", border:"none", borderBottom:`1px solid ${C.border}`,
      color:"#888", fontSize:11, padding:"2px 0", width:"100%", outline:"none", marginTop:3,
    }}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEdit(false); } }}
    />
  );
}

// ── MODAL FICHA MUEBLE ────────────────────────────────────────────
function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    nombre:      mueble.nombre      ?? "",
    sector:      mueble.sector      ?? "",
    descripcion: mueble.descripcion ?? "",
    medidas:     mueble.medidas     ?? "",
    material:    mueble.material    ?? "",
    imagen_url:  mueble.imagen_url  ?? "",
  });

  const S = {
    overlay: { position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center" },
    card:    { background:"#0a0a0a", border:`1px solid ${C.borderHi}`, borderRadius:16, padding:26, width:"min(520px,92vw)", maxHeight:"88vh", overflowY:"auto", position:"relative" },
    close:   { position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:"#fff", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" },
    label:   { fontSize:10, letterSpacing:1.5, color:C.textDim, display:"block", marginBottom:4, marginTop:12, textTransform:"uppercase" },
    input:   { background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, color:"#ddd", padding:"9px 12px", borderRadius:10, width:"100%", fontSize:13 },
    textarea:{ background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, color:"#ddd", padding:"9px 12px", borderRadius:10, width:"100%", fontSize:13, minHeight:70, resize:"vertical" },
    btnSave: { marginTop:18, width:"100%", padding:"11px", background:"#d0d0d0", color:"#000", fontWeight:700, border:"none", borderRadius:10, cursor:"pointer" },
    btnDel:  { marginTop:8, width:"100%", padding:"11px", background:"rgba(224,80,80,0.07)", color:"#e05050", border:"1px solid rgba(224,80,80,0.2)", borderRadius:10, cursor:"pointer", fontWeight:600 },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>
        <button style={S.close} onClick={onClose}>×</button>

        {!edit ? (
          <>
            <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase" }}>{form.sector}</div>
            <h2 style={{ margin:"4px 0 0", color:"#e8e8e8", fontFamily:"Montserrat,system-ui", fontSize:18 }}>{form.nombre}</h2>

            {form.imagen_url && (
              <img src={form.imagen_url} alt="" style={{ width:"100%", maxHeight:200, objectFit:"contain", borderRadius:10, marginTop:14, background:"#000" }} />
            )}
            {[["Descripción", form.descripcion], ["Medidas", form.medidas], ["Material", form.material]].map(([k, v]) => v ? (
              <div key={k}><span style={S.label}>{k}</span><div style={{ color:"#b0b0b0", fontSize:13 }}>{v}</div></div>
            ) : null)}

            {esAdmin && (
              <>
                <button style={{ ...S.btnSave, background:"rgba(255,255,255,0.06)", color:"#c0c0c0" }} onClick={() => setEdit(true)}>Editar ficha</button>
                <button style={S.btnDel} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
              </>
            )}
          </>
        ) : (
          <>
            <h3 style={{ margin:"0 0 4px", color:"#e8e8e8", fontSize:16 }}>Editar ficha</h3>
            {[["Nombre","nombre","input"],["Sector","sector","input"],["Descripción","descripcion","textarea"],["Medidas","medidas","input"],["Material","material","input"],["URL imagen","imagen_url","input"]].map(([label,key,type]) => (
              <div key={key}>
                <label style={S.label}>{label}</label>
                {type === "textarea"
                  ? <textarea style={S.textarea} value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} />
                  : <input style={S.input} value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} />
                }
              </div>
            ))}
            <button style={S.btnSave} onClick={() => { if (!form.nombre.trim()) return alert("Nombre requerido"); onSave(mueble.id, form); setEdit(false); }}>Guardar cambios</button>
            <button style={{ ...S.btnDel, marginTop:8 }} onClick={() => setEdit(false)}>Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  const [lineas,    setLineas]    = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [checklist, setChecklist] = useState([]);

  const [lineaId,   setLineaId]   = useState(null);
  const [unidadId,  setUnidadId]  = useState(null);
  const [q,         setQ]         = useState("");
  const [filtro,    setFiltro]    = useState("todos");
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");

  const [newLinea,       setNewLinea]       = useState("");
  const [newUnidad,      setNewUnidad]      = useState("");
  const [showAddMueble,  setShowAddMueble]  = useState(false);
  const [newMueble,      setNewMueble]      = useState({ nombre: "", sector: "" });
  const [modalMueble,    setModalMueble]    = useState(null);

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargarLineas() {
    const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa",true).order("nombre");
    const rows = data ?? [];
    setLineas(rows);
    if (!lineaId && rows.length) setLineaId(rows[0].id);
  }

  async function cargarUnidades(lid) {
    const { data } = await supabase.from("prod_unidades").select("id,codigo,color").eq("linea_id",lid).eq("activa",true).order("codigo");
    setUnidades(data ?? []);
  }

  async function cargarChecklist(uid) {
    setLoading(true);
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material,imagen_url)")
      .eq("unidad_id", uid)
      .order("prod_muebles(sector)").order("prod_muebles(nombre)");
    if (error) setErr(error.message);
    setChecklist(data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargarLineas(); }, []);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(null); setChecklist([]); } }, [lineaId]);
  useEffect(() => { if (unidadId) cargarChecklist(unidadId); }, [unidadId]);

  // ── ACCIONES ──────────────────────────────────────────────────
  async function crearLinea() {
    if (!newLinea.trim()) return;
    await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true });
    setNewLinea(""); cargarLineas();
  }

  async function eliminarLinea(lid) {
    if (!window.confirm("¿Eliminar esta línea y todas sus unidades?")) return;
    await supabase.from("prod_lineas").delete().eq("id", lid);
    setLineaId(null); cargarLineas();
  }

  async function crearUnidad() {
    if (!newUnidad.trim() || !lineaId) return;
    const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id:lineaId, codigo:newUnidad.trim(), activa:true }).select().single();
    if (error) return setErr(error.message);
    const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lineaId);
    if (plantilla?.length) {
      await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id:u.id, mueble_id:p.mueble_id, estado:"No enviado" })));
    }
    setNewUnidad(""); cargarUnidades(lineaId); setUnidadId(u.id);
  }

  async function eliminarUnidad(uid) {
    if (!window.confirm("¿Eliminar esta unidad?")) return;
    await supabase.from("prod_unidades").delete().eq("id", uid);
    setUnidadId(null); setChecklist([]); cargarUnidades(lineaId);
  }

  async function agregarMueble() {
    if (!newMueble.nombre.trim() || !lineaId) return;
    const { data: m, error } = await supabase.from("prod_muebles").insert({ nombre:newMueble.nombre.trim(), sector:newMueble.sector.trim() }).select().single();
    if (error) return setErr(error.message);
    await supabase.from("prod_linea_muebles").insert({ linea_id:lineaId, mueble_id:m.id });
    if (unidadId) await supabase.from("prod_unidad_checklist").insert({ unidad_id:unidadId, mueble_id:m.id, estado:"No enviado" });
    setNewMueble({ nombre:"", sector:"" }); setShowAddMueble(false);
    if (unidadId) cargarChecklist(unidadId);
  }

  async function eliminarItem(rowId) {
    if (!window.confirm("¿Quitar este ítem del checklist?")) return;
    await supabase.from("prod_unidad_checklist").delete().eq("id", rowId);
    setChecklist(p => p.filter(r => r.id !== rowId));
  }

  async function setEstado(rowId, estado) {
    await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    setChecklist(p => p.map(r => r.id === rowId ? {...r, estado} : r));
  }

  async function setObs(rowId, obs) {
    await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
    setChecklist(p => p.map(r => r.id === rowId ? {...r, obs} : r));
  }

  async function editarMueble(mid, form) {
    await supabase.from("prod_muebles").update(form).eq("id", mid);
    if (unidadId) cargarChecklist(unidadId);
    setModalMueble(null);
  }

  async function eliminarMuebleCatalogo(mid) {
    await supabase.from("prod_muebles").delete().eq("id", mid);
    if (unidadId) cargarChecklist(unidadId);
  }

  // ── DATOS DERIVADOS ───────────────────────────────────────────
  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId),   [lineas, lineaId]);
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId),[unidades, unidadId]);

  const filtrado = useMemo(() => {
    let rows = checklist;
    if (filtro !== "todos") rows = rows.filter(r => r.estado === filtro);
    const qq = q.toLowerCase();
    if (qq) rows = rows.filter(r =>
      (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) ||
      (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq)
    );
    return rows;
  }, [checklist, filtro, q]);

  const porSector = useMemo(() => {
    const map = {};
    filtrado.forEach(r => {
      const s = r.prod_muebles?.sector || "General";
      if (!map[s]) map[s] = [];
      map[s].push(r);
    });
    return map;
  }, [filtrado]);

  const pct      = useMemo(() => progreso(checklist), [checklist]);
  const pctColor = pct === 100 ? "#5cd679" : pct >= 50 ? "#909090" : "#444";

  const stats = useMemo(() => ({
    total:    checklist.length,
    completo: checklist.filter(r => r.estado === "Completo").length,
    parcial:  checklist.filter(r => r.estado === "Parcial").length,
    rehacer:  checklist.filter(r => r.estado === "Rehacer").length,
  }), [checklist]);

  // ── ESTILOS ───────────────────────────────────────────────────
  const S = {
    page:   { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Roboto,system-ui,Arial" },
    outer:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    inner:  { display: "grid", gridTemplateColumns: "220px 1fr", height: "100vh", overflow: "hidden" },

    // Panel izquierdo de líneas/unidades
    nav:    { height: "100vh", overflowY: "auto", borderRight: `1px solid ${C.border}`, background: "#030303", display: "flex", flexDirection: "column" },

    // Panel derecho
    detail: { height: "100vh", overflowY: "auto" },

    card:   { border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, padding: 14, marginBottom: 8 },
    input:  { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: "#d8d8d8", padding: "8px 12px", borderRadius: 10, fontSize: 13, width: "100%" },
    inputSm:{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: "#d0d0d0", padding: "6px 10px", borderRadius: 8, fontSize: 12 },
    btn:    { border: `1px solid ${C.border}`, background: C.surfaceHi, color: "#c0c0c0", padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12 },
    btnPrim:{ border: "none", background: "#c8c8c8", color: "#000", padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 },
    btnGhost:{ border:"1px solid transparent", background:"transparent", color:"#3a3a3a", padding:"4px 8px", cursor:"pointer", fontSize:12, borderRadius:6 },
    btnDanger:{ border:"1px solid rgba(224,80,80,0.2)", background:"rgba(224,80,80,0.05)", color:"#e05050", padding:"3px 8px", borderRadius:6, cursor:"pointer", fontSize:11 },
    label:  { fontSize: 10, letterSpacing: 1.5, color: C.textDim, display: "block", marginBottom: 4, textTransform: "uppercase" },
  };

  // Nav items
  const lineaNavStyle = (sel) => ({
    width: "100%", textAlign: "left", padding: "9px 14px",
    border: "none", borderBottom: `1px solid rgba(255,255,255,0.03)`,
    background: sel ? C.surfaceHi : "transparent",
    color: sel ? "#e0e0e0" : "#707070",
    cursor: "pointer", fontSize: 13, fontWeight: sel ? 600 : 400,
    display: "flex", justifyContent: "space-between", alignItems: "center",
  });

  const unidadNavStyle = (sel) => ({
    ...lineaNavStyle(sel),
    paddingLeft: 22, fontSize: 12,
    borderLeft: sel ? `2px solid rgba(255,255,255,0.25)` : "2px solid transparent",
    color: sel ? "#d0d0d0" : "#505050",
  });

  const estadoSelectStyle = (estado) => {
    const m = ESTADO_META[estado] ?? ESTADO_META["No enviado"];
    return {
      background: m.bg, color: m.color,
      border: `1px solid ${m.color === "#444" ? "#222" : m.color + "44"}`,
      padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
      cursor: "pointer", outline: "none",
    };
  };

  const filterTabStyle = (act) => ({
    border: `1px solid ${act ? C.borderHi : "transparent"}`,
    background: act ? C.surfaceHi : "transparent",
    color: act ? "#c0c0c0" : "#484848",
    padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11,
  });

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.outer}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={S.inner}>
          {/* ── NAV: Líneas y Unidades ── */}
          <div style={S.nav}>
            <div style={{ padding: "16px 14px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: "Montserrat,system-ui", fontSize: 14, color: "#e0e0e0", fontWeight: 700 }}>Muebles</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Líneas de producción</div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {lineas.map(l => {
                const sel = lineaId === l.id;
                return (
                  <div key={l.id}>
                    {/* Línea */}
                    <button style={lineaNavStyle(sel)} onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                      <span>{l.nombre}</span>
                      {esAdmin && sel && (
                        <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>×</span>
                      )}
                    </button>

                    {/* Unidades de esta línea */}
                    {sel && unidades.map(u => (
                      <button key={u.id} style={unidadNavStyle(unidadId === u.id)} onClick={() => setUnidadId(u.id)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {u.color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.color, flexShrink: 0 }} />}
                          {u.codigo}
                        </span>
                        {esAdmin && unidadId === u.id && (
                          <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>×</span>
                        )}
                      </button>
                    ))}

                    {/* Input nueva unidad */}
                    {sel && esAdmin && (
                      <div style={{ padding: "5px 14px 8px 22px", display: "flex", gap: 5 }}>
                        <input style={{ ...S.inputSm, flex: 1 }} placeholder="Nueva unidad…"
                          value={newUnidad} onChange={e => setNewUnidad(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && crearUnidad()} />
                        <button style={{ ...S.btn, padding: "5px 10px" }} onClick={crearUnidad}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nueva línea */}
            {esAdmin && (
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
                <div style={S.label}>Nueva línea</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <input style={{ ...S.inputSm, flex: 1 }} placeholder="Ej: K52"
                    value={newLinea} onChange={e => setNewLinea(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={{ ...S.btn, padding: "5px 10px" }} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── DETALLE: Checklist ── */}
          <div style={S.detail}>
            {!unidadId ? (
              /* Placeholder vacío */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#2a2a2a", letterSpacing: 2, textTransform: "uppercase" }}>
                  Seleccioná una unidad
                </div>
              </div>
            ) : (
              <div style={{ padding: 24 }}>
                {/* ── Header ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                  <div>
                    <h2 style={{ fontFamily: "Montserrat,system-ui", fontSize: 20, margin: 0, color: "#e8e8e8", fontWeight: 700 }}>
                      {unidadSel?.codigo}
                    </h2>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>
                      {lineaSel?.nombre} — {checklist.length} ítems
                    </div>
                  </div>
                  {esAdmin && (
                    <button style={S.btn} onClick={() => setShowAddMueble(v => !v)}>
                      {showAddMueble ? "Cancelar" : "+ Ítem"}
                    </button>
                  )}
                </div>

                {err && <div style={{ ...S.card, borderColor: "rgba(224,80,80,0.25)", color: "#e08080", marginBottom: 12 }}>{err}</div>}

                {/* ── Barra de progreso ── */}
                <div style={{ ...S.card, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.textDim }}>
                      <span style={{ color: "#5cd679" }}>{stats.completo} completo{stats.completo !== 1 ? "s" : ""}</span>
                      {stats.parcial > 0  && <span style={{ color: "#909090" }}>{stats.parcial} parcial</span>}
                      {stats.rehacer > 0  && <span style={{ color: "#e05050" }}>{stats.rehacer} rehacer</span>}
                      <span>{stats.total - stats.completo - stats.parcial - stats.rehacer} pendiente{stats.total - stats.completo - stats.parcial - stats.rehacer !== 1 ? "s" : ""}</span>
                    </div>
                    <span style={{ fontFamily: "Montserrat,system-ui", fontSize: 20, fontWeight: 900, color: pctColor }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 99, transition: "width 0.5s ease" }} />
                  </div>
                </div>

                {/* ── Formulario nuevo ítem ── */}
                {showAddMueble && esAdmin && (
                  <div style={{ ...S.card, borderColor: C.borderHi }}>
                    <div style={S.label}>Nuevo ítem</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
                      <input style={S.input} placeholder="Nombre del mueble"
                        value={newMueble.nombre} onChange={e => setNewMueble(f => ({...f, nombre: e.target.value}))} />
                      <input style={S.input} placeholder="Sector"
                        value={newMueble.sector} onChange={e => setNewMueble(f => ({...f, sector: e.target.value}))} />
                    </div>
                    <button style={{ ...S.btnPrim, marginTop: 10 }} onClick={agregarMueble}>Agregar</button>
                  </div>
                )}

                {/* ── Filtros ── */}
                <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  {["todos", ...ESTADOS].map(e => (
                    <button key={e} style={filterTabStyle(filtro === e)} onClick={() => setFiltro(e)}>
                      {e === "todos" ? "Todos" : e}
                    </button>
                  ))}
                  <input style={{ ...S.inputSm, flex: 1, minWidth: 100 }}
                    placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {/* ── Lista por sector ── */}
                {loading ? (
                  <div style={{ color: C.textDim, fontSize: 13, padding: "30px 0", textAlign: "center" }}>Cargando…</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ color: "#2a2a2a", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                    {q || filtro !== "todos" ? "Sin ítems con este filtro." : "Sin ítems. Usá '+ Ítem' para agregar."}
                  </div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => {
                    const completados = rows.filter(r => r.estado === "Completo").length;
                    return (
                      <div key={sector} style={{ marginBottom: 20 }}>
                        {/* Sector header */}
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "0 0 7px",
                          borderBottom: `1px solid rgba(255,255,255,0.05)`,
                          marginBottom: 2,
                        }}>
                          <span style={{ fontSize: 10, letterSpacing: 2, color: "#484848", textTransform: "uppercase", fontWeight: 600 }}>
                            {sector}
                          </span>
                          <span style={{ fontSize: 10, color: "#383838" }}>
                            {completados}/{rows.length}
                          </span>
                        </div>

                        {/* Ítems */}
                        {rows.map(r => {
                          const m    = r.prod_muebles;
                          const meta = ESTADO_META[r.estado] ?? ESTADO_META["No enviado"];
                          return (
                            <div key={r.id} style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 120px 28px",
                              gap: 10, alignItems: "start",
                              padding: "9px 0",
                              borderBottom: `1px solid rgba(255,255,255,0.03)`,
                            }}>
                              {/* Nombre + nota */}
                              <div>
                                <span
                                  style={{
                                    color: r.estado === "Completo" ? "#404040" : "#b8b8b8",
                                    fontSize: 13, cursor: "pointer",
                                    textDecoration: r.estado === "Completo" ? "line-through" : "none",
                                  }}
                                  onClick={() => m && setModalMueble(m)}
                                >
                                  {m?.nombre ?? "—"}
                                </span>
                                <ObsInline value={r.obs} rowId={r.id} onSave={setObs} />
                              </div>

                              {/* Select estado */}
                              <select style={estadoSelectStyle(r.estado)}
                                value={r.estado}
                                onChange={e => setEstado(r.id, e.target.value)}>
                                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>

                              {/* Eliminar */}
                              {esAdmin ? (
                                <button style={S.btnGhost} onClick={() => eliminarItem(r.id)} title="Quitar">×</button>
                              ) : <div />}
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

      {modalMueble && (
        <MuebleModal
          mueble={modalMueble}
          onClose={() => setModalMueble(null)}
          onSave={editarMueble}
          onDelete={eliminarMuebleCatalogo}
          esAdmin={esAdmin}
        />
      )}
    </div>
  );
}
