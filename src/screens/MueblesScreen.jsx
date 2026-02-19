import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ── HELPERS ──────────────────────────────────────────────────────
const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

const ESTADO_META = {
  "No enviado": { color: "#555",    bg: "transparent",             label: "—"       },
  "Parcial":    { color: "#a0a0a0", bg: "rgba(160,160,160,0.08)",  label: "Parcial" },
  "Completo":   { color: "#30d158", bg: "rgba(48,209,88,0.10)",    label: "✓"       },
  "Rehacer":    { color: "#ff453a", bg: "rgba(255,69,58,0.10)",    label: "↺ Rehacer"},
};

function progreso(rows) {
  if (!rows.length) return 0;
  return Math.round((rows.filter(r => r.estado === "Completo").length / rows.length) * 100);
}

// ── MODAL MUEBLE ────────────────────────────────────────────────
function MuebleModal({ mueble, onClose, onSave, onDelete, isAdmin }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    nombre:      mueble.nombre      || "",
    sector:      mueble.sector      || "",
    descripcion: mueble.descripcion || "",
    medidas:     mueble.medidas     || "",
    material:    mueble.material    || "",
    imagen_url:  mueble.imagen_url  || "",
  });

  const S = {
    overlay: {
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    },
    card: {
      background: "rgba(10,10,10,0.95)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18, padding: 28,
      width: "min(580px, 92vw)", maxHeight: "88vh", overflowY: "auto",
      position: "relative",
      boxShadow: "0 32px 64px rgba(0,0,0,0.8)",
    },
    closeBtn: {
      position: "absolute", top: 16, right: 16,
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff", width: 32, height: 32, borderRadius: "50%",
      cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
    },
    label: { fontSize: 10, letterSpacing: 1.5, opacity: 0.45, display: "block", marginBottom: 5, marginTop: 14 },
    input: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff", padding: "10px 12px", borderRadius: 10, width: "100%", fontSize: 14,
    },
    textarea: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff", padding: "10px 12px", borderRadius: 10, width: "100%",
      fontSize: 14, minHeight: 80, resize: "vertical",
    },
    btnSave: {
      marginTop: 20, width: "100%", padding: "12px",
      background: "#fff", color: "#000", fontWeight: 900,
      border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14,
    },
    btnDelete: {
      marginTop: 10, width: "100%", padding: "12px",
      background: "rgba(255,69,58,0.08)", color: "#ff453a",
      border: "1px solid rgba(255,69,58,0.25)", borderRadius: 10,
      cursor: "pointer", fontSize: 14, fontWeight: 700,
    },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>×</button>

        {!edit ? (
          <>
            <div style={{ paddingRight: 32 }}>
              <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                {form.sector}
              </div>
              <h2 style={{ margin: 0, color: "#fff", fontFamily: "Montserrat, system-ui", fontSize: 20 }}>
                {form.nombre}
              </h2>
            </div>

            {form.imagen_url && (
              <div style={{ marginTop: 16, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                <img src={form.imagen_url} alt={form.nombre} style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "#000" }} />
              </div>
            )}

            {[["Descripción", form.descripcion], ["Medidas", form.medidas], ["Material", form.material]].map(([k, v]) =>
              v ? (
                <div key={k}>
                  <span style={S.label}>{k.toUpperCase()}</span>
                  <div style={{ color: "#ccc", fontSize: 14, lineHeight: 1.6 }}>{v}</div>
                </div>
              ) : null
            )}

            {isAdmin && (
              <button style={{ ...S.btnSave, background: "rgba(255,255,255,0.08)", color: "#fff", marginTop: 20 }}
                onClick={() => setEdit(true)}>✏️ Editar ficha</button>
            )}
            {isAdmin && (
              <button style={S.btnDelete}
                onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?\nSe eliminará de todos los barcos.")) { onDelete(mueble.id); onClose(); } }}>
                🗑 Eliminar del catálogo
              </button>
            )}
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 4px", color: "#fff" }}>Editar ficha</h3>
            {[
              ["Nombre", "nombre", "input"],
              ["Sector", "sector", "input"],
              ["Descripción", "descripcion", "textarea"],
              ["Medidas", "medidas", "input"],
              ["Material", "material", "input"],
              ["URL imagen", "imagen_url", "input"],
            ].map(([label, key, type]) => (
              <div key={key}>
                <label style={S.label}>{label.toUpperCase()}</label>
                {type === "textarea"
                  ? <textarea style={S.textarea} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} />
                  : <input style={S.input} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} />
                }
              </div>
            ))}
            <button style={S.btnSave} onClick={() => { if (!form.nombre.trim()) return alert("Nombre requerido"); onSave(mueble.id, form); setEdit(false); }}>
              Guardar cambios
            </button>
            <button style={{ ...S.btnDelete, marginTop: 10 }} onClick={() => setEdit(false)}>Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── MAIN SCREEN ──────────────────────────────────────────────────
export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  // ── STATE ─────────────────────────────────────────────────────
  const [lineas,   setLineas]   = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [checklist,setChecklist]= useState([]);

  const [lineaId,  setLineaId]  = useState(null);
  const [unidadId, setUnidadId] = useState(null);
  const [q,        setQ]        = useState("");

  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  // Crear nueva unidad
  const [newUnidad,  setNewUnidad]  = useState("");
  // Crear nueva linea
  const [newLinea,   setNewLinea]   = useState("");
  // Crear nuevo mueble en checklist
  const [newMueble,  setNewMueble]  = useState({ nombre: "", sector: "" });
  const [showAddMueble, setShowAddMueble] = useState(false);

  // Modal
  const [modalData, setModalData] = useState(null);

  // Filtro estado
  const [filtroEstado, setFiltroEstado] = useState("todos");

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargarLineas() {
    const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre");
    setLineas(data ?? []);
    if (!lineaId && data?.length) setLineaId(data[0].id);
  }

  async function cargarUnidades(lid) {
    const { data } = await supabase.from("prod_unidades").select("id,codigo,color").eq("linea_id", lid).eq("activa", true).order("codigo");
    setUnidades(data ?? []);
  }

  async function cargarChecklist(uid) {
    setLoading(true);
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select("id, estado, obs, mueble_id, prod_muebles(id, nombre, sector, descripcion, medidas, material, imagen_url)")
      .eq("unidad_id", uid)
      .order("prod_muebles(sector)")
      .order("prod_muebles(nombre)");
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
    setNewLinea("");
    cargarLineas();
  }

  async function eliminarLinea(lid) {
    if (!window.confirm("¿Eliminar esta línea y todas sus unidades?")) return;
    await supabase.from("prod_lineas").delete().eq("id", lid);
    setLineaId(null);
    cargarLineas();
  }

  async function crearUnidad() {
    if (!newUnidad.trim() || !lineaId) return;
    const { data: u, error } = await supabase
      .from("prod_unidades")
      .insert({ linea_id: lineaId, codigo: newUnidad.trim(), activa: true })
      .select().single();
    if (error) return setErr(error.message);
    // Copiar plantilla de la línea
    const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lineaId);
    if (plantilla?.length) {
      await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id: u.id, mueble_id: p.mueble_id, estado: "No enviado" })));
    }
    setNewUnidad("");
    cargarUnidades(lineaId);
    setUnidadId(u.id);
  }

  async function eliminarUnidad(uid) {
    if (!window.confirm("¿Eliminar esta unidad y su checklist?")) return;
    await supabase.from("prod_unidades").delete().eq("id", uid);
    setUnidadId(null);
    setChecklist([]);
    cargarUnidades(lineaId);
  }

  async function agregarMueble() {
    if (!newMueble.nombre.trim() || !lineaId) return;
    const { data: m, error } = await supabase
      .from("prod_muebles").insert({ nombre: newMueble.nombre.trim(), sector: newMueble.sector.trim() }).select().single();
    if (error) return setErr(error.message);
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    if (unidadId) await supabase.from("prod_unidad_checklist").insert({ unidad_id: unidadId, mueble_id: m.id, estado: "No enviado" });
    setNewMueble({ nombre: "", sector: "" });
    setShowAddMueble(false);
    if (unidadId) cargarChecklist(unidadId);
  }

  async function eliminarItemChecklist(rowId) {
    if (!window.confirm("¿Quitar este ítem del checklist de esta unidad?")) return;
    await supabase.from("prod_unidad_checklist").delete().eq("id", rowId);
    cargarChecklist(unidadId);
  }

  async function setEstado(rowId, estado) {
    await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    setChecklist(prev => prev.map(r => r.id === rowId ? { ...r, estado } : r));
  }

  async function setObs(rowId, obs) {
    await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
  }

  async function editarMueble(muebleId, form) {
    await supabase.from("prod_muebles").update(form).eq("id", muebleId);
    if (unidadId) cargarChecklist(unidadId);
    setModalData(null);
  }

  async function eliminarMuebleCatalogo(muebleId) {
    await supabase.from("prod_muebles").delete().eq("id", muebleId);
    if (unidadId) cargarChecklist(unidadId);
  }

  // ── DATOS DERIVADOS ───────────────────────────────────────────
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);

  const checklistFiltrado = useMemo(() => {
    let rows = checklist;
    if (filtroEstado !== "todos") rows = rows.filter(r => r.estado === filtroEstado);
    const qq = q.toLowerCase();
    if (qq) rows = rows.filter(r =>
      (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) ||
      (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq)
    );
    return rows;
  }, [checklist, filtroEstado, q]);

  // Agrupar por sector
  const porSector = useMemo(() => {
    const map = {};
    checklistFiltrado.forEach(r => {
      const s = r.prod_muebles?.sector || "General";
      if (!map[s]) map[s] = [];
      map[s].push(r);
    });
    return map;
  }, [checklistFiltrado]);

  const pct = useMemo(() => progreso(checklist), [checklist]);

  // Stats para la unidad
  const stats = useMemo(() => ({
    total:    checklist.length,
    completo: checklist.filter(r => r.estado === "Completo").length,
    rehacer:  checklist.filter(r => r.estado === "Rehacer").length,
    parcial:  checklist.filter(r => r.estado === "Parcial").length,
  }), [checklist]);

  // Progress bar color
  const pctColor = pct === 100 ? "#30d158" : pct >= 60 ? "#a0a0a0" : "#555";

  // ── ESTILOS ───────────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { display: "grid", gridTemplateColumns: "280px 1fr", gap: 0, overflow: "hidden", height: "100vh" },
    panel:   { height: "100vh", overflowY: "auto", borderRight: "1px solid rgba(255,255,255,0.06)" },
    detail:  { height: "100vh", overflowY: "auto", padding: 24 },

    // Cards con efecto glass sutil
    card: {
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, background: "rgba(255,255,255,0.02)",
      padding: 16, marginBottom: 10,
    },
    cardHover: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
    },

    input: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff", padding: "9px 12px", borderRadius: 10,
      fontSize: 13, width: "100%",
    },
    inputSm: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff", padding: "7px 10px", borderRadius: 8, fontSize: 12,
    },
    btn: {
      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
      color: "#fff", padding: "8px 14px", borderRadius: 10,
      cursor: "pointer", fontWeight: 700, fontSize: 12,
    },
    btnPrim: {
      border: "1px solid rgba(255,255,255,0.2)", background: "#fff",
      color: "#000", padding: "9px 18px", borderRadius: 10,
      cursor: "pointer", fontWeight: 900, fontSize: 13,
    },
    btnGhost: {
      border: "1px solid transparent", background: "transparent",
      color: "#555", padding: "4px 8px", borderRadius: 6,
      cursor: "pointer", fontSize: 12,
    },
    btnDanger: {
      border: "1px solid rgba(255,69,58,0.2)", background: "rgba(255,69,58,0.06)",
      color: "#ff453a", padding: "5px 10px", borderRadius: 8,
      cursor: "pointer", fontSize: 11,
    },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.4, display: "block", marginBottom: 4 },
    small:   { fontSize: 11, opacity: 0.4 },
    tag:     { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700 },
  };

  const lineaBtn = (sel) => ({
    width: "100%", textAlign: "left", padding: "10px 16px",
    border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: sel ? "rgba(255,255,255,0.06)" : "transparent",
    color: sel ? "#fff" : "#888", cursor: "pointer",
    fontWeight: sel ? 700 : 400, fontSize: 13,
    display: "flex", justifyContent: "space-between", alignItems: "center",
  });

  const unidadBtn = (sel) => ({
    ...lineaBtn(sel),
    paddingLeft: 24, fontSize: 12,
    borderLeft: sel ? "2px solid rgba(255,255,255,0.3)" : "2px solid transparent",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  });

  const estadoSelect = (estado) => {
    const m = ESTADO_META[estado] ?? ESTADO_META["No enviado"];
    return {
      background: m.bg, color: m.color,
      border: `1px solid ${m.color}33`,
      padding: "5px 10px", borderRadius: 8,
      cursor: "pointer", fontSize: 12, fontWeight: 600,
      outline: "none",
    };
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        {/* MAIN: 2 paneles internos */}
        <div style={S.main}>

          {/* ── PANEL IZQUIERDO: Líneas + Unidades ── */}
          <div style={S.panel}>
            {/* Header panel izq */}
            <div style={{ padding: "18px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "Montserrat, system-ui", fontSize: 15, color: "#fff", fontWeight: 700 }}>
                Muebles
              </div>
              <div style={{ ...S.small, marginTop: 2 }}>Líneas de producción</div>
            </div>

            {lineas.map(l => {
              const selLinea = lineaId === l.id;
              const unidsLinea = selLinea ? unidades : [];

              return (
                <div key={l.id}>
                  {/* Botón línea */}
                  <button style={lineaBtn(selLinea)} onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                    <span>📐 {l.nombre}</span>
                    {esAdmin && selLinea && (
                      <span style={S.btnDanger}
                        onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>🗑</span>
                    )}
                  </button>

                  {/* Unidades de esta línea */}
                  {selLinea && (
                    <>
                      {unidsLinea.map(u => {
                        const selU = unidadId === u.id;
                        return (
                          <button key={u.id} style={unidadBtn(selU)} onClick={() => setUnidadId(u.id)}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {u.color && (
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color, flexShrink: 0 }} />
                              )}
                              {u.codigo}
                            </span>
                            {esAdmin && selU && (
                              <span style={S.btnDanger}
                                onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>🗑</span>
                            )}
                          </button>
                        );
                      })}

                      {/* Agregar unidad */}
                      {esAdmin && (
                        <div style={{ padding: "6px 16px 10px 24px", display: "flex", gap: 6 }}>
                          <input
                            style={{ ...S.inputSm, flex: 1 }}
                            placeholder="Nueva unidad (ej: 37-26)"
                            value={newUnidad}
                            onChange={e => setNewUnidad(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && crearUnidad()}
                          />
                          <button style={S.btn} onClick={crearUnidad}>+</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Nueva línea */}
            {esAdmin && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8 }}>
                <div style={S.label}>NUEVA LÍNEA</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...S.inputSm, flex: 1 }} placeholder="Ej: K52"
                    value={newLinea} onChange={e => setNewLinea(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={S.btn} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── PANEL DERECHO: Checklist ── */}
          <div style={S.detail}>
            {!unidadId ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.3, flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 32 }}>🪑</div>
                <div style={{ fontSize: 14 }}>Seleccioná una unidad</div>
              </div>
            ) : (
              <>
                {/* Header unidad */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontFamily: "Montserrat, system-ui", fontSize: 22, margin: 0, color: "#fff" }}>
                      {unidadSel?.codigo}
                    </h2>
                    <div style={{ ...S.small, marginTop: 3 }}>
                      {lineas.find(l => l.id === lineaId)?.nombre} · {checklist.length} ítems
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {esAdmin && (
                      <button style={S.btn} onClick={() => setShowAddMueble(v => !v)}>
                        {showAddMueble ? "✕" : "+ Mueble"}
                      </button>
                    )}
                  </div>
                </div>

                {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ffbdbd", marginBottom: 12 }}>{err}</div>}

                {/* Progress bar */}
                <div style={{ ...S.card, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                      <span style={{ color: "#30d158" }}>✓ {stats.completo}</span>
                      <span style={{ color: "#a0a0a0" }}>◑ {stats.parcial}</span>
                      <span style={{ color: "#ff453a" }}>↺ {stats.rehacer}</span>
                      <span style={{ opacity: 0.4 }}>— {stats.total - stats.completo - stats.parcial - stats.rehacer}</span>
                    </div>
                    <span style={{ fontFamily: "Montserrat, system-ui", fontSize: 20, fontWeight: 900, color: pctColor }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 99, transition: "width 0.5s ease" }} />
                  </div>
                </div>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {["todos", ...ESTADOS].map(e => (
                    <button key={e} style={{
                      ...S.btn,
                      background: filtroEstado === e ? "rgba(255,255,255,0.12)" : "transparent",
                      color: filtroEstado === e ? "#fff" : "#555",
                      border: filtroEstado === e ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                      fontSize: 11, padding: "5px 10px",
                    }} onClick={() => setFiltroEstado(e)}>
                      {e === "todos" ? "Todos" : e}
                    </button>
                  ))}
                  <input style={{ ...S.inputSm, flex: 1, minWidth: 120 }}
                    placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {/* Agregar mueble */}
                {showAddMueble && esAdmin && (
                  <div style={{ ...S.card, marginBottom: 12, borderColor: "rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
                      <input style={S.input} placeholder="Nombre del mueble" value={newMueble.nombre}
                        onChange={e => setNewMueble(f => ({...f, nombre: e.target.value}))} />
                      <input style={S.input} placeholder="Sector" value={newMueble.sector}
                        onChange={e => setNewMueble(f => ({...f, sector: e.target.value}))} />
                    </div>
                    <button style={{ ...S.btnPrim, marginTop: 10 }} onClick={agregarMueble}>Agregar al checklist</button>
                  </div>
                )}

                {/* Checklist por sector */}
                {loading ? (
                  <div style={{ textAlign: "center", opacity: 0.4, padding: 40 }}>Cargando…</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ textAlign: "center", opacity: 0.35, padding: 40 }}>
                    {q || filtroEstado !== "todos" ? "Sin resultados con este filtro" : "Sin ítems. Agregá un mueble arriba."}
                  </div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => (
                    <div key={sector} style={{ marginBottom: 20 }}>
                      {/* Sector header */}
                      <div style={{
                        fontSize: 10, letterSpacing: 2, fontWeight: 700, opacity: 0.4,
                        textTransform: "uppercase", marginBottom: 6,
                        paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        {sector}
                        <span style={{ marginLeft: 8, fontWeight: 400 }}>
                          {rows.filter(r => r.estado === "Completo").length}/{rows.length}
                        </span>
                      </div>

                      {rows.map(r => {
                        const m = r.prod_muebles;
                        const meta = ESTADO_META[r.estado] ?? ESTADO_META["No enviado"];
                        return (
                          <div key={r.id} style={{
                            display: "grid", gridTemplateColumns: "1fr 130px auto",
                            gap: 10, alignItems: "start",
                            padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            {/* Nombre + obs */}
                            <div>
                              <div
                                style={{ color: r.estado === "Completo" ? "#555" : "#d0d0d0", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                                onClick={() => setModalData(m)}
                              >
                                {r.estado === "Completo" && <span style={{ marginRight: 6, color: "#30d158", fontSize: 11 }}>✓</span>}
                                {m?.nombre ?? "—"}
                              </div>
                              <ObsInline
                                value={r.obs ?? ""}
                                rowId={r.id}
                                onSave={setObs}
                              />
                            </div>

                            {/* Estado select */}
                            <select style={estadoSelect(r.estado)}
                              value={r.estado}
                              onChange={e => setEstado(r.id, e.target.value)}>
                              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>

                            {/* Acciones */}
                            <div style={{ display: "flex", gap: 4 }}>
                              {esAdmin && (
                                <button style={S.btnGhost} title="Quitar de esta unidad"
                                  onClick={() => eliminarItemChecklist(r.id)}>🗑</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalData && (
        <MuebleModal
          mueble={modalData}
          onClose={() => setModalData(null)}
          onSave={editarMueble}
          onDelete={eliminarMuebleCatalogo}
          isAdmin={esAdmin}
        />
      )}
    </div>
  );
}

// ── OBS INLINE ────────────────────────────────────────────────────
function ObsInline({ value, rowId, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function guardar() {
    setEditing(false);
    if (val !== value) onSave(rowId, val);
  }

  if (!editing && !val) {
    return (
      <div style={{ fontSize: 11, color: "#333", marginTop: 2, cursor: "text" }}
        onClick={() => setEditing(true)}>
        + nota
      </div>
    );
  }

  if (!editing) {
    return (
      <div style={{ fontSize: 11, color: "#666", marginTop: 3, cursor: "text", fontStyle: "italic" }}
        onClick={() => setEditing(true)}>
        {val}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      style={{
        background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)",
        color: "#aaa", fontSize: 11, padding: "2px 0", marginTop: 3, width: "100%", outline: "none",
      }}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={guardar}
      onKeyDown={e => { if (e.key === "Enter") guardar(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
    />
  );
}
