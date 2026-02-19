import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ── ESTADO META ───────────────────────────────────────────────────
const ESTADOS = ["Pendiente", "Enviado", "Recibido", "No lleva", "Rehacer"];
const ESTADO_META = {
  "Pendiente": { color: "#444",    bg: "transparent",            dot: "○" },
  "Enviado":   { color: "#a0a0a0", bg: "rgba(160,160,160,0.08)", dot: "◑" },
  "Recibido":  { color: "#30d158", bg: "rgba(48,209,88,0.10)",   dot: "●" },
  "No lleva":  { color: "#333",    bg: "transparent",            dot: "—" },
  "Rehacer":   { color: "#ff453a", bg: "rgba(255,69,58,0.10)",   dot: "↺" },
};

function pct(piezas) {
  const activas = piezas.filter(p => p.estado !== "No lleva");
  if (!activas.length) return 0;
  return Math.round(activas.filter(p => p.estado === "Recibido").length / activas.length * 100);
}

// ── MODAL DETALLE PIEZA ───────────────────────────────────────────
function PiezaModal({ pieza, onClose, onSave, esAdmin }) {
  const [form, setForm] = useState({
    color:         pieza.color         ?? "",
    fecha_envio:   pieza.fecha_envio   ?? "",
    fecha_regreso: pieza.fecha_regreso ?? "",
    observaciones: pieza.observaciones ?? "",
    foto_ref:      pieza.foto_ref      ?? "",
  });

  const S = {
    overlay: {
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(0,0,0,0.8)", backdropFilter:"blur(12px)",
      display:"flex", alignItems:"center", justifyContent:"center",
    },
    card: {
      background:"rgba(8,8,8,0.98)", border:"1px solid rgba(255,255,255,0.09)",
      borderRadius:18, padding:28, width:"min(520px,92vw)",
      maxHeight:"88vh", overflowY:"auto", position:"relative",
      boxShadow:"0 32px 64px rgba(0,0,0,0.8)",
    },
    close: {
      position:"absolute", top:14, right:14,
      background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
      color:"#fff", width:30, height:30, borderRadius:"50%",
      cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
    },
    label: { fontSize:10, letterSpacing:1.5, opacity:0.4, display:"block", marginBottom:4, marginTop:14 },
    input: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",
      color:"#fff", padding:"9px 12px", borderRadius:10, width:"100%", fontSize:13,
    },
    textarea: {
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",
      color:"#fff", padding:"9px 12px", borderRadius:10, width:"100%",
      fontSize:13, resize:"vertical", minHeight:70,
    },
    btnSave: {
      marginTop:18, width:"100%", padding:"11px",
      background:"#fff", color:"#000", fontWeight:900,
      border:"none", borderRadius:10, cursor:"pointer", fontSize:14,
    },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>
        <button style={S.close} onClick={onClose}>×</button>

        <div style={{ fontSize:10, opacity:0.4, letterSpacing:2, textTransform:"uppercase" }}>{pieza.sector}</div>
        <h2 style={{ margin:"4px 0 0", color:"#fff", fontFamily:"Montserrat,system-ui", fontSize:18 }}>
          {pieza.pieza}
          {pieza.opcional && <span style={{ marginLeft:8, fontSize:10, color:"#666" }}>OPCIONAL</span>}
        </h2>

        <label style={S.label}>COLOR / MATERIAL</label>
        <input style={S.input} placeholder="Ej: Purastone Travertino Navona"
          value={form.color} onChange={e => setForm(f=>({...f,color:e.target.value}))} />

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
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
          Guardar
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
  const [piezas,   setPiezas]   = useState([]);   // marm_unidad_piezas de la unidad sel

  // UI
  const [lineaId,  setLineaId]  = useState(null);
  const [unidadId, setUnidadId] = useState(null);
  const [q,        setQ]        = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [modalPieza, setModalPieza] = useState(null);

  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  // Nuevos
  const [newLinea,   setNewLinea]   = useState("");
  const [newUnidad,  setNewUnidad]  = useState("");
  const [showAddPieza, setShowAddPieza] = useState(false);
  const [formPieza, setFormPieza] = useState({ pieza:"", sector:"" });

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

  useEffect(() => { cargarLineas(); }, []);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(null); setPiezas([]); } }, [lineaId]);
  useEffect(() => { if (unidadId) cargarPiezas(unidadId); }, [unidadId]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("rt-marm")
      .on("postgres_changes", { event:"*", schema:"public", table:"marm_unidad_piezas" }, () => {
        if (unidadId) cargarPiezas(unidadId);
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

  // También agregar a la plantilla de la línea
  async function agregarPiezaAPlantilla() {
    if (!formPieza.pieza.trim() || !formPieza.sector.trim() || !lineaId) return;
    const { data:lp, error } = await supabase.from("marm_linea_piezas").insert({
      linea_id: lineaId,
      pieza:    formPieza.pieza.trim(),
      sector:   formPieza.sector.trim(),
    }).select().single();
    if (error) return setErr(error.message);
    // Agregar a esta unidad también
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

  const pctColor = porcentaje === 100 ? "#30d158" : porcentaje > 0 ? "#a0a0a0" : "#333";

  // ── ESTILOS ───────────────────────────────────────────────────
  const S = {
    page:   { background:"#000", minHeight:"100vh", color:"#d0d0d0", fontFamily:"Roboto,system-ui,Arial" },
    layout: { display:"grid", gridTemplateColumns:"280px 1fr", minHeight:"100vh" },
    main:   { display:"grid", gridTemplateColumns:"260px 1fr", height:"100vh", overflow:"hidden" },

    panel:  { height:"100vh", overflowY:"auto", borderRight:"1px solid rgba(255,255,255,0.06)", background:"#030303" },
    detail: { height:"100vh", overflowY:"auto", padding:24 },

    card: { border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, background:"rgba(255,255,255,0.015)", padding:14, marginBottom:10 },
    input: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", padding:"8px 12px", borderRadius:10, fontSize:13, width:"100%" },
    inputSm: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", padding:"6px 10px", borderRadius:8, fontSize:12 },
    btn:  { border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.06)", color:"#fff", padding:"7px 14px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:12 },
    btnPrim: { border:"none", background:"#fff", color:"#000", padding:"10px 20px", borderRadius:10, cursor:"pointer", fontWeight:900, fontSize:13 },
    btnDanger: { border:"1px solid rgba(255,69,58,0.2)", background:"rgba(255,69,58,0.06)", color:"#ff453a", padding:"4px 8px", borderRadius:6, cursor:"pointer", fontSize:11 },
    btnGhost: { border:"1px solid transparent", background:"transparent", color:"#444", padding:"4px 8px", cursor:"pointer", fontSize:12, borderRadius:6 },
    label: { fontSize:10, letterSpacing:1.5, opacity:0.4, display:"block", marginBottom:4 },
    small: { fontSize:11, opacity:0.4 },
  };

  const lineaBtn = (sel) => ({
    width:"100%", textAlign:"left", padding:"10px 16px",
    border:"none", borderBottom:"1px solid rgba(255,255,255,0.04)",
    background: sel ? "rgba(255,255,255,0.07)" : "transparent",
    color: sel ? "#fff" : "#888",
    cursor:"pointer", fontWeight: sel ? 700 : 400, fontSize:13,
    display:"flex", justifyContent:"space-between", alignItems:"center",
  });

  const unidadBtn = (sel) => ({
    ...lineaBtn(sel),
    paddingLeft:24, fontSize:12,
    borderLeft: sel ? "2px solid rgba(255,255,255,0.3)" : "2px solid transparent",
  });

  const estadoBtn = (estado) => {
    const m = ESTADO_META[estado] ?? ESTADO_META["Pendiente"];
    return {
      background: m.bg, color: m.color,
      border: `1px solid ${m.color}33`,
      padding:"5px 10px", borderRadius:8,
      cursor:"pointer", fontSize:12, fontWeight:600, outline:"none",
    };
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={S.main}>
          {/* ── PANEL IZQ: Líneas + Unidades ── */}
          <div style={S.panel}>
            <div style={{ padding:"18px 16px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily:"Montserrat,system-ui", fontSize:15, color:"#fff", fontWeight:700 }}>Marmolería</div>
              <div style={S.small}>Plantillas por línea · Checklist por barco</div>
            </div>

            {lineas.map(l => {
              const selLinea = lineaId === l.id;
              return (
                <div key={l.id}>
                  <button style={lineaBtn(selLinea)} onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                    <span>🪨 {l.nombre}</span>
                    {esAdmin && selLinea && (
                      <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>🗑</span>
                    )}
                  </button>

                  {selLinea && (
                    <>
                      {unidades.map(u => (
                        <button key={u.id} style={unidadBtn(unidadId === u.id)} onClick={() => setUnidadId(u.id)}>
                          <span>{u.codigo}</span>
                          {esAdmin && unidadId === u.id && (
                            <span style={S.btnDanger} onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>🗑</span>
                          )}
                        </button>
                      ))}

                      {esAdmin && (
                        <div style={{ padding:"6px 16px 10px 24px", display:"flex", gap:6 }}>
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

            {esAdmin && (
              <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", marginTop:8 }}>
                <div style={S.label}>NUEVA LÍNEA</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input style={{ ...S.inputSm, flex:1 }} placeholder="Ej: K65"
                    value={newLinea} onChange={e => setNewLinea(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={S.btn} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── PANEL DER: Checklist ── */}
          <div style={S.detail}>
            {!unidadId ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", opacity:0.3, flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:36 }}>🪨</div>
                <div>Seleccioná un barco para ver su checklist</div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ fontFamily:"Montserrat,system-ui", fontSize:22, margin:0, color:"#fff" }}>
                      {unidadSel?.codigo}
                    </h2>
                    <div style={{ ...S.small, marginTop:3 }}>
                      {lineaSel?.nombre} · {piezas.filter(p=>p.estado!=="No lleva").length} piezas activas
                    </div>
                  </div>
                  {esAdmin && (
                    <button style={S.btn} onClick={() => setShowAddPieza(v => !v)}>
                      {showAddPieza ? "✕ Cancelar" : "+ Pieza extra"}
                    </button>
                  )}
                </div>

                {err && <div style={{ ...S.card, borderColor:"rgba(255,69,58,0.3)", color:"#ffbdbd" }}>{err}</div>}

                {/* Progress */}
                <div style={{ ...S.card, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ display:"flex", gap:16, fontSize:12 }}>
                      <span style={{ color:"#30d158" }}>● {stats.recibido} recibidas</span>
                      <span style={{ color:"#a0a0a0" }}>◑ {stats.enviado} enviadas</span>
                      <span style={{ color:"#444"    }}>○ {stats.pendiente} pendientes</span>
                      {stats.rehacer > 0 && <span style={{ color:"#ff453a" }}>↺ {stats.rehacer} rehacer</span>}
                    </div>
                    <span style={{ fontFamily:"Montserrat,system-ui", fontSize:22, fontWeight:900, color:pctColor }}>
                      {porcentaje}%
                    </span>
                  </div>
                  <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${porcentaje}%`, background:pctColor, borderRadius:99, transition:"width 0.5s ease" }} />
                  </div>
                </div>

                {/* Agregar pieza extra */}
                {showAddPieza && esAdmin && (
                  <div style={{ ...S.card, borderColor:"rgba(255,255,255,0.1)" }}>
                    <div style={{ ...S.label, marginBottom:8 }}>AGREGAR PIEZA</div>
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
                        + Agregar a plantilla {lineaSel?.nombre}
                      </button>
                    </div>
                    <div style={{ ...S.small, marginTop:8 }}>
                      "Solo a este barco" agrega únicamente aquí. "Agregar a plantilla" la incluye en todos los barcos nuevos de {lineaSel?.nombre}.
                    </div>
                  </div>
                )}

                {/* Filtros */}
                <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                  {["todos", ...ESTADOS].map(e => (
                    <button key={e} style={{
                      ...S.btn, fontSize:11, padding:"5px 10px",
                      background: filtroEstado===e ? "rgba(255,255,255,0.12)" : "transparent",
                      color: filtroEstado===e ? "#fff" : "#555",
                      border: filtroEstado===e ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                    }} onClick={() => setFiltroEstado(e)}>
                      {ESTADO_META[e]?.dot ?? ""} {e==="todos"?"Todas":e}
                    </button>
                  ))}
                  <input style={{ ...S.inputSm, flex:1, minWidth:120 }}
                    placeholder="Buscar pieza, sector, color…"
                    value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {/* Checklist por sector */}
                {loading ? (
                  <div style={{ textAlign:"center", opacity:0.4, padding:40 }}>Cargando…</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ textAlign:"center", opacity:0.35, padding:40 }}>
                    {q || filtroEstado!=="todos" ? "Sin resultados con este filtro." : "Sin piezas. Usá '+ Pieza extra' para agregar."}
                  </div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => {
                    const recib = rows.filter(p=>p.estado==="Recibido").length;
                    const activas = rows.filter(p=>p.estado!=="No lleva").length;
                    return (
                      <div key={sector} style={{ marginBottom:22 }}>
                        {/* Sector header */}
                        <div style={{
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          paddingBottom:8, marginBottom:4,
                          borderBottom:"1px solid rgba(255,255,255,0.06)",
                        }}>
                          <div style={{ fontSize:10, letterSpacing:2, fontWeight:700, opacity:0.45, textTransform:"uppercase" }}>
                            {sector}
                          </div>
                          <div style={{ fontSize:11, opacity:0.35 }}>
                            {recib}/{activas}
                          </div>
                        </div>

                        {rows.map(p => {
                          const meta = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                          const noLleva = p.estado === "No lleva";
                          return (
                            <div key={p.id} style={{
                              display:"grid",
                              gridTemplateColumns:"1fr 140px auto",
                              gap:10, alignItems:"center",
                              padding:"10px 0",
                              borderBottom:"1px solid rgba(255,255,255,0.03)",
                              opacity: noLleva ? 0.35 : 1,
                            }}>
                              {/* Nombre pieza + color + fechas */}
                              <div>
                                <div
                                  style={{ color: p.estado==="Recibido" ? "#555" : "#d0d0d0", fontSize:13, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
                                  onClick={() => setModalPieza(p)}
                                >
                                  <span style={{ color:meta.color, fontSize:11 }}>{meta.dot}</span>
                                  {p.pieza}
                                  {p.opcional && <span style={{ fontSize:9, color:"#444", letterSpacing:1 }}>OPCIONAL</span>}
                                </div>

                                {/* Color/material */}
                                {p.color && (
                                  <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{p.color}</div>
                                )}

                                {/* Fechas inline */}
                                {(p.fecha_envio || p.fecha_regreso) && (
                                  <div style={{ fontSize:10, opacity:0.4, marginTop:2, display:"flex", gap:10 }}>
                                    {p.fecha_envio   && <span>Env: {p.fecha_envio}</span>}
                                    {p.fecha_regreso && <span>Reg: {p.fecha_regreso}</span>}
                                  </div>
                                )}

                                {/* Obs */}
                                {p.observaciones && (
                                  <div style={{ fontSize:11, color:"#555", marginTop:2, fontStyle:"italic" }}>{p.observaciones}</div>
                                )}
                              </div>

                              {/* Estado select */}
                              <select style={estadoBtn(p.estado)}
                                value={p.estado}
                                onChange={e => setEstado(p.id, e.target.value)}>
                                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>

                              {/* Acciones */}
                              <div style={{ display:"flex", gap:4 }}>
                                <button style={S.btnGhost} onClick={() => setModalPieza(p)} title="Editar detalle">✏️</button>
                                {esAdmin && (
                                  <button style={S.btnGhost} onClick={() => eliminarPieza(p.id)} title="Quitar pieza">🗑</button>
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

      {/* Modal pieza */}
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
