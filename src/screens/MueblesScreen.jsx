import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  sans:    "'Outfit', system-ui, sans-serif",
  mono:    "'JetBrains Mono', monospace",
  green:   "#10b981",
  red:     "#ef4444",
  amber:   "#f59e0b",
  primary: "#3b82f6",
};
const GLASS = { backdropFilter: "blur(32px) saturate(130%)", WebkitBackdropFilter: "blur(32px) saturate(130%)" };
const INP = { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0, padding: "7px 10px", borderRadius: 7, fontSize: 12, outline: "none", width: "100%", fontFamily: C.sans };

const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];
const ESTADO_META = {
  "No enviado": { color: C.t2,    bg: "transparent" },
  "Parcial":    { color: C.t1,    bg: "rgba(255,255,255,0.04)" },
  "Completo":   { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Rehacer":    { color: C.red,   bg: "rgba(239,68,68,0.1)" },
};

const BUCKET = "muebles-imagenes";

function progreso(rows) {
  if (!rows.length) return 0;
  return Math.round(rows.filter(r => r.estado === "Completo").length / rows.length * 100);
}

// ─── ObsInline ────────────────────────────────────────────────────
function ObsInline({ value, rowId, onSave }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const ref = useRef(null);
  useEffect(() => { if (edit) ref.current?.focus(); }, [edit]);
  function commit() { setEdit(false); if (val !== value) onSave(rowId, val); }
  if (!edit && !val) return <button style={{ background: "none", border: "none", color: C.t2, fontSize: 11, cursor: "text", padding: 0, marginTop: 2, fontFamily: C.sans }} onClick={() => setEdit(true)}>+ nota</button>;
  if (!edit) return <div style={{ fontSize: 11, color: C.t2, marginTop: 3, fontStyle: "italic", cursor: "text" }} onClick={() => setEdit(true)}>{val}</div>;
  return <input ref={ref} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 11, padding: "2px 0", width: "100%", outline: "none", marginTop: 3, fontFamily: C.sans }} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEdit(false); } }} />;
}

// ─── Lightbox ─────────────────────────────────────────────────────
function Lightbox({ images, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onPrev, onNext]);
  const img = images[index];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.95)", ...GLASS, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>×</button>
      <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", fontFamily: C.mono, fontSize: 11, color: C.t2, letterSpacing: 2 }}>{index + 1} / {images.length}</div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); onPrev(); }} style={{ position: "absolute", left: 20, background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
      <div style={{ maxWidth: "88vw", maxHeight: "88vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }} onClick={e => e.stopPropagation()}>
        <img src={img.url} alt={img.nombre} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 10 }} />
        <div style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>{img.nombre}</div>
      </div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); onNext(); }} style={{ position: "absolute", right: 20, background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
    </div>
  );
}

// ─── GaleriaLinea ─────────────────────────────────────────────────
function GaleriaLinea({ lineaId, lineaNombre, esAdmin }) {
  const [images, setImages]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState([]);
  const [lightbox, setLightbox]   = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [search, setSearch]       = useState("");
  const fileInputRef              = useRef(null);
  const folder                    = `linea_${lineaId}`;

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 500, sortBy: { column: "created_at", order: "desc" } });
    if (!error && data) {
      const imgs = data
        .filter(f => f.name !== ".emptyFolderPlaceholder")
        .map(f => ({
          nombre: f.name.replace(/^\d+_/, ""),
          path: `${folder}/${f.name}`,
          url: supabase.storage.from(BUCKET).getPublicUrl(`${folder}/${f.name}`).data.publicUrl,
        }));
      setImages(imgs);
    }
    setLoading(false);
  }

  useEffect(() => { if (lineaId) { setSearch(""); cargar(); } }, [lineaId]);

  async function subirArchivos(files) {
    if (!files?.length) return;
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    setProgress(arr.map(f => ({ name: f.name, done: false, error: null })));
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      setProgress(p => p.map((x, j) => j === i ? { ...x, done: !error, error: error?.message ?? null } : x));
    }
    setUploading(false);
    setProgress([]);
    cargar();
  }

  async function eliminar(path, e) {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    await supabase.storage.from(BUCKET).remove([path]);
    setImages(p => p.filter(i => i.path !== path));
  }

  const filtradas = useMemo(() => {
    if (!search.trim()) return images;
    return images.filter(i => i.nombre.toLowerCase().includes(search.toLowerCase()));
  }, [images, search]);

  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); subirArchivos(e.dataTransfer.files); }, [lineaId]);

  return (
    <div style={{ padding: 22 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t0 }}>{lineaNombre}</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 2, fontFamily: C.mono }}>{images.length} imagen{images.length !== 1 ? "es" : ""}</div>
        </div>
        {esAdmin && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ padding: "8px 18px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", borderRadius: 8, cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ fontSize: 16 }}>↑</span> {uploading ? "Subiendo…" : "Subir imágenes"}
          </button>
        )}
        <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => subirArchivos(e.target.files)} />
      </div>

      {/* Upload progress */}
      {progress.length > 0 && (
        <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 8 }}>Subiendo {progress.length} archivos</div>
          {progress.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99 }}>
                <div style={{ height: "100%", width: p.done || p.error ? "100%" : "55%", background: p.error ? C.red : C.green, borderRadius: 99, transition: "width .4s ease" }} />
              </div>
              <span style={{ fontSize: 10, color: p.error ? C.red : p.done ? C.green : C.t2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {images.length > 6 && (
        <div style={{ marginBottom: 14 }}>
          <input style={{ ...INP, padding: "6px 12px" }} placeholder="Buscar por nombre…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Empty state / drop zone */}
      {!loading && images.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => esAdmin && fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? C.primary : C.b0}`, borderRadius: 14, padding: "70px 20px", textAlign: "center", cursor: esAdmin ? "pointer" : "default", background: dragging ? "rgba(59,130,246,0.05)" : "transparent", transition: "all .2s", marginTop: 20 }}
        >
          <div style={{ fontSize: 44, marginBottom: 14 }}>🖼️</div>
          <div style={{ fontSize: 14, color: C.t1, fontWeight: 500 }}>Sin imágenes para esta línea</div>
          {esAdmin && <div style={{ fontSize: 12, color: C.t2, marginTop: 6 }}>Hacé click o arrastrá imágenes para subir</div>}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ color: C.t2, fontSize: 12, padding: "40px 0", textAlign: "center" }}>Cargando imágenes…</div>
      ) : filtradas.length > 0 ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}
        >
          {/* Drop overlay */}
          {dragging && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(59,130,246,0.08)", border: "2px dashed rgba(59,130,246,0.5)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 14, color: "#60a5fa", fontWeight: 600 }}>Soltá para subir</div>
            </div>
          )}
          {filtradas.map((img) => (
            <div
              key={img.path}
              onClick={() => setLightbox(filtradas.indexOf(img))}
              className="img-card"
              style={{ position: "relative", cursor: "pointer", borderRadius: 10, overflow: "hidden", background: C.s0, border: `1px solid ${C.b0}`, aspectRatio: "4/3" }}
            >
              <img src={img.url} alt={img.nombre} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div className="img-grad" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)", opacity: 0, transition: "opacity .2s" }} />
              <div className="img-name" style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 8px 7px", opacity: 0, transition: "opacity .2s" }}>
                <div style={{ fontSize: 10, color: "#fff", fontFamily: C.sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{img.nombre}</div>
              </div>
              {esAdmin && (
                <button
                  className="img-del"
                  onClick={e => eliminar(img.path, e)}
                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: "50%", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .2s" }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      ) : search ? (
        <div style={{ color: C.t2, fontSize: 12, padding: "30px 0", textAlign: "center" }}>Sin resultados para "{search}"</div>
      ) : null}

      <style>{`
        .img-card:hover .img-grad,
        .img-card:hover .img-name,
        .img-card:hover .img-del { opacity: 1 !important; }
        .img-card:hover { border-color: rgba(255,255,255,0.18) !important; }
      `}</style>

      {lightbox !== null && (
        <Lightbox
          images={filtradas}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(i => (i - 1 + filtradas.length) % filtradas.length)}
          onNext={() => setLightbox(i => (i + 1) % filtradas.length)}
        />
      )}
    </div>
  );
}

// ─── MuebleModal ─────────────────────────────────────────────────
function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ nombre: mueble.nombre ?? "", sector: mueble.sector ?? "", descripcion: mueble.descripcion ?? "", medidas: mueble.medidas ?? "", material: mueble.material ?? "", imagen_url: mueble.imagen_url ?? "" });
  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, marginTop: 12, textTransform: "uppercase", fontWeight: 600 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", ...GLASS, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0d0d10", border: `1px solid ${C.b1}`, borderRadius: 14, padding: 24, width: "min(520px,92vw)", maxHeight: "88vh", overflowY: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
        <button style={{ position: "absolute", top: 14, right: 14, background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>×</button>
        {!edit ? (
          <>
            <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{form.sector}</div>
            <h2 style={{ margin: "4px 0 0", color: C.t0, fontFamily: C.sans, fontSize: 18, fontWeight: 700 }}>{form.nombre}</h2>
            {form.imagen_url && <img src={form.imagen_url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, marginTop: 14, background: "#000" }} />}
            {[["Descripción", form.descripcion], ["Medidas", form.medidas], ["Material", form.material]].map(([k, v]) => v ? (<div key={k}><span style={LBL}>{k}</span><div style={{ color: C.t1, fontSize: 13 }}>{v}</div></div>) : null)}
            {esAdmin && <>
              <button style={{ marginTop: 14, width: "100%", padding: "10px", background: C.s1, color: C.t0, fontWeight: 600, border: `1px solid ${C.b0}`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => setEdit(true)}>Editar ficha</button>
              <button style={{ marginTop: 8, width: "100%", padding: "10px", background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
            </>}
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 4px", color: C.t0, fontSize: 15, fontWeight: 600 }}>Editar ficha</h3>
            {[["Nombre","nombre","input"],["Sector","sector","input"],["Descripción","descripcion","textarea"],["Medidas","medidas","input"],["Material","material","input"],["URL imagen","imagen_url","input"]].map(([label,key,type]) => (
              <div key={key}>
                <label style={LBL}>{label}</label>
                {type === "textarea" ? <textarea style={{ ...INP, minHeight: 60, resize: "vertical" }} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} /> : <input style={INP} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} />}
              </div>
            ))}
            <button style={{ marginTop: 16, width: "100%", padding: "10px", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 600, border: "1px solid rgba(59,130,246,0.35)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => { if (!form.nombre.trim()) return alert("Nombre requerido"); onSave(mueble.id, form); setEdit(false); }}>Guardar cambios</button>
            <button style={{ marginTop: 8, width: "100%", padding: "10px", background: "transparent", color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => setEdit(false)}>Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────
export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  const role = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  const [lineas,       setLineas]       = useState([]);
  const [unidades,     setUnidades]     = useState([]);
  const [checklist,    setChecklist]    = useState([]);
  const [lineaId,      setLineaId]      = useState(null);
  const [unidadId,     setUnidadId]     = useState(null);
  const [activeTab,    setActiveTab]    = useState("checklist"); // "checklist" | "galeria"
  const [q,            setQ]            = useState("");
  const [filtro,       setFiltro]       = useState("todos");
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState("");
  const [newLinea,     setNewLinea]     = useState("");
  const [newUnidad,    setNewUnidad]    = useState("");
  const [showAddMueble, setShowAddMueble] = useState(false);
  const [newMueble,    setNewMueble]    = useState({ nombre: "", sector: "" });
  const [modalMueble,  setModalMueble]  = useState(null);

  async function cargarLineas() { const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa",true).order("nombre"); const rows = data ?? []; setLineas(rows); if (!lineaId && rows.length) setLineaId(rows[0].id); }
  async function cargarUnidades(lid) { const { data } = await supabase.from("prod_unidades").select("id,codigo,color").eq("linea_id",lid).eq("activa",true).order("codigo"); setUnidades(data ?? []); }
  async function cargarChecklist(uid) { setLoading(true); const { data, error } = await supabase.from("prod_unidad_checklist").select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material,imagen_url)").eq("unidad_id",uid).order("prod_muebles(sector)").order("prod_muebles(nombre)"); if (error) setErr(error.message); setChecklist(data ?? []); setLoading(false); }

  useEffect(() => { cargarLineas(); }, []);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(null); setChecklist([]); } }, [lineaId]);
  useEffect(() => { if (unidadId) cargarChecklist(unidadId); }, [unidadId]);

  async function crearLinea() { if (!newLinea.trim()) return; await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true }); setNewLinea(""); cargarLineas(); }
  async function eliminarLinea(lid) { if (!window.confirm("¿Eliminar esta línea y todas sus unidades?")) return; await supabase.from("prod_lineas").delete().eq("id",lid); setLineaId(null); cargarLineas(); }
  async function crearUnidad() { if (!newUnidad.trim() || !lineaId) return; const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id:lineaId, codigo:newUnidad.trim(), activa:true }).select().single(); if (error) return setErr(error.message); const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id",lineaId); if (plantilla?.length) await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id:u.id, mueble_id:p.mueble_id, estado:"No enviado" }))); setNewUnidad(""); cargarUnidades(lineaId); setUnidadId(u.id); }
  async function eliminarUnidad(uid) { if (!window.confirm("¿Eliminar esta unidad?")) return; await supabase.from("prod_unidades").delete().eq("id",uid); setUnidadId(null); setChecklist([]); cargarUnidades(lineaId); }
  async function agregarMueble() { if (!newMueble.nombre.trim() || !lineaId) return; const { data: m, error } = await supabase.from("prod_muebles").insert({ nombre:newMueble.nombre.trim(), sector:newMueble.sector.trim() }).select().single(); if (error) return setErr(error.message); await supabase.from("prod_linea_muebles").insert({ linea_id:lineaId, mueble_id:m.id }); if (unidadId) await supabase.from("prod_unidad_checklist").insert({ unidad_id:unidadId, mueble_id:m.id, estado:"No enviado" }); setNewMueble({ nombre:"", sector:"" }); setShowAddMueble(false); if (unidadId) cargarChecklist(unidadId); }
  async function eliminarItem(rowId) { if (!window.confirm("¿Quitar este ítem del checklist?")) return; await supabase.from("prod_unidad_checklist").delete().eq("id",rowId); setChecklist(p => p.filter(r => r.id !== rowId)); }
  async function setEstado(rowId, estado) { await supabase.from("prod_unidad_checklist").update({ estado }).eq("id",rowId); setChecklist(p => p.map(r => r.id === rowId ? {...r, estado} : r)); }
  async function setObs(rowId, obs) { await supabase.from("prod_unidad_checklist").update({ obs }).eq("id",rowId); setChecklist(p => p.map(r => r.id === rowId ? {...r, obs} : r)); }
  async function editarMueble(mid, form) { await supabase.from("prod_muebles").update(form).eq("id",mid); if (unidadId) cargarChecklist(unidadId); setModalMueble(null); }
  async function eliminarMuebleCatalogo(mid) { await supabase.from("prod_muebles").delete().eq("id",mid); if (unidadId) cargarChecklist(unidadId); }

  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId), [lineas, lineaId]);
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);
  const filtrado  = useMemo(() => { let rows = checklist; if (filtro !== "todos") rows = rows.filter(r => r.estado === filtro); const qq = q.toLowerCase(); if (qq) rows = rows.filter(r => (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) || (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq)); return rows; }, [checklist, filtro, q]);
  const porSector = useMemo(() => { const map = {}; filtrado.forEach(r => { const s = r.prod_muebles?.sector || "General"; if (!map[s]) map[s] = []; map[s].push(r); }); return map; }, [filtrado]);
  const pct = useMemo(() => progreso(checklist), [checklist]);
  const pctColor = pct === 100 ? C.green : pct >= 50 ? C.t1 : C.t2;
  const stats = useMemo(() => ({ total: checklist.length, completo: checklist.filter(r => r.estado === "Completo").length, parcial: checklist.filter(r => r.estado === "Parcial").length, rehacer: checklist.filter(r => r.estado === "Rehacer").length }), [checklist]);

  const lineaNavBtn  = (sel) => ({ width: "100%", textAlign: "left", padding: "9px 14px", border: "none", borderBottom: `1px solid rgba(255,255,255,0.03)`, background: sel ? C.s1 : "transparent", color: sel ? C.t0 : C.t2, cursor: "pointer", fontSize: 12, fontWeight: sel ? 600 : 400, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: C.sans });
  const unidadNavBtn = (sel) => ({ ...lineaNavBtn(sel), paddingLeft: 22, fontSize: 11, borderLeft: sel ? `2px solid ${C.b1}` : "2px solid transparent" });
  const estadoSelectStyle = (estado) => { const m = ESTADO_META[estado] ?? ESTADO_META["No enviado"]; return { background: m.bg, color: m.color, border: `1px solid ${m.color === C.t2 ? C.b0 : m.color + "44"}`, padding: "5px 9px", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer", outline: "none", fontFamily: C.sans }; };
  const filterTabStyle = (act) => ({ border: act ? `1px solid ${C.b1}` : "1px solid transparent", background: act ? C.s1 : "transparent", color: act ? C.t0 : C.t2, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: C.sans });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        button:not([disabled]):hover { opacity: 0.8; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        select option { background: #0f0f12; color: #a1a1aa; }
        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%); }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100vh", overflow: "hidden" }}>

          {/* ── LEFT NAV ── */}
          <div style={{ height: "100vh", overflowY: "auto", borderRight: `1px solid ${C.b0}`, background: "rgba(9,9,11,0.98)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t0 }}>Muebles</div>
              <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Líneas de producción</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {lineas.map(l => {
                const sel = lineaId === l.id;
                return (
                  <div key={l.id}>
                    <button style={lineaNavBtn(sel)} onClick={() => { setLineaId(l.id); setUnidadId(null); }}>
                      <span>{l.nombre}</span>
                      {esAdmin && sel && <span style={{ fontSize: 10, color: C.red, cursor: "pointer", padding: "2px 5px" }} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>×</span>}
                    </button>
                    {sel && unidades.map(u => (
                      <button key={u.id} style={unidadNavBtn(unidadId === u.id)} onClick={() => setUnidadId(u.id)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {u.color && <span style={{ width: 5, height: 5, borderRadius: "50%", background: u.color, flexShrink: 0 }} />}
                          {u.codigo}
                        </span>
                        {esAdmin && unidadId === u.id && <span style={{ fontSize: 10, color: C.red, padding: "2px 5px" }} onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>×</span>}
                      </button>
                    ))}
                    {sel && esAdmin && (
                      <div style={{ padding: "5px 14px 8px 22px", display: "flex", gap: 5 }}>
                        <input style={{ ...INP, flex: 1, padding: "5px 8px", fontSize: 11 }} placeholder="Nueva unidad…" value={newUnidad} onChange={e => setNewUnidad(e.target.value)} onKeyDown={e => e.key === "Enter" && crearUnidad()} />
                        <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans }} onClick={crearUnidad}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {esAdmin && (
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.b0}`, flexShrink: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 6 }}>Nueva línea</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <input style={{ ...INP, flex: 1, padding: "5px 8px", fontSize: 11 }} placeholder="Ej: K52" value={newLinea} onChange={e => setNewLinea(e.target.value)} onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans }} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── DETAIL ── */}
          <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Tabs */}
            {lineaId && (
              <div style={{ display: "flex", borderBottom: `1px solid ${C.b0}`, background: "rgba(9,9,11,0.95)", flexShrink: 0 }}>
                {[{ key: "checklist", label: "Checklist" }, { key: "galeria", label: "🖼  Galería" }].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    style={{ padding: "12px 22px", background: "transparent", border: "none", borderBottom: activeTab === t.key ? `2px solid ${C.primary}` : "2px solid transparent", color: activeTab === t.key ? C.t0 : C.t2, cursor: "pointer", fontSize: 12, fontWeight: activeTab === t.key ? 600 : 400, fontFamily: C.sans, marginBottom: -1 }}
                  >{t.label}</button>
                ))}
              </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>

              {/* GALERÍA */}
              {activeTab === "galeria" && lineaId && (
                <GaleriaLinea lineaId={lineaId} lineaNombre={lineaSel?.nombre ?? ""} esAdmin={esAdmin} />
              )}

              {/* CHECKLIST */}
              {activeTab === "checklist" && (
                !lineaId ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una línea</div>
                  </div>
                ) : !unidadId ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una unidad</div>
                  </div>
                ) : (
                  <div style={{ padding: 22 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: C.t0 }}>{unidadSel?.codigo}</div>
                        <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{lineaSel?.nombre} — {checklist.length} ítems</div>
                      </div>
                      {esAdmin && <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }} onClick={() => setShowAddMueble(v => !v)}>{showAddMueble ? "Cancelar" : "+ Ítem"}</button>}
                    </div>

                    {err && <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 12, marginBottom: 12 }}>{err}</div>}

                    {/* Progress */}
                    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.t2 }}>
                          <span style={{ color: C.green }}>{stats.completo} completo{stats.completo !== 1 ? "s" : ""}</span>
                          {stats.parcial > 0 && <span style={{ color: C.t1 }}>{stats.parcial} parcial</span>}
                          {stats.rehacer > 0 && <span style={{ color: C.red }}>{stats.rehacer} rehacer</span>}
                          <span>{stats.total - stats.completo - stats.parcial - stats.rehacer} pendientes</span>
                        </div>
                        <span style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: pctColor }}>{pct}%</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 99, transition: "width .5s ease" }} />
                      </div>
                    </div>

                    {/* Add form */}
                    {showAddMueble && esAdmin && (
                      <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                        <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 8 }}>Nuevo ítem</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
                          <input style={INP} placeholder="Nombre del mueble" value={newMueble.nombre} onChange={e => setNewMueble(f => ({...f, nombre: e.target.value}))} />
                          <input style={INP} placeholder="Sector" value={newMueble.sector} onChange={e => setNewMueble(f => ({...f, sector: e.target.value}))} />
                        </div>
                        <button style={{ marginTop: 10, padding: "8px 20px", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }} onClick={agregarMueble}>Agregar</button>
                      </div>
                    )}

                    {/* Filters */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                      {["todos", ...ESTADOS].map(e => <button key={e} style={filterTabStyle(filtro === e)} onClick={() => setFiltro(e)}>{e === "todos" ? "Todos" : e}</button>)}
                      <input style={{ ...INP, flex: 1, minWidth: 100, padding: "4px 10px", fontSize: 11 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                    </div>

                    {/* List */}
                    {loading ? (
                      <div style={{ color: C.t2, fontSize: 12, padding: "30px 0", textAlign: "center" }}>Cargando…</div>
                    ) : Object.keys(porSector).length === 0 ? (
                      <div style={{ color: C.t2, fontSize: 12, padding: "40px 0", textAlign: "center" }}>{q || filtro !== "todos" ? "Sin ítems con este filtro." : "Sin ítems. Usá '+ Ítem' para agregar."}</div>
                    ) : (
                      Object.entries(porSector).map(([sector, rows]) => {
                        const completados = rows.filter(r => r.estado === "Completo").length;
                        return (
                          <div key={sector} style={{ marginBottom: 18 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 0 6px", borderBottom: `1px solid rgba(255,255,255,0.05)`, marginBottom: 2 }}>
                              <span style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", fontWeight: 600 }}>{sector}</span>
                              <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{completados}/{rows.length}</span>
                            </div>
                            {rows.map(r => {
                              const m = r.prod_muebles;
                              return (
                                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 28px", gap: 10, alignItems: "start", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                  <div>
                                    <span style={{ color: r.estado === "Completo" ? C.t2 : C.t0, fontSize: 12, cursor: "pointer", textDecoration: r.estado === "Completo" ? "line-through" : "none" }} onClick={() => m && setModalMueble(m)}>{m?.nombre ?? "—"}</span>
                                    <ObsInline value={r.obs} rowId={r.id} onSave={setObs} />
                                  </div>
                                  <select style={estadoSelectStyle(r.estado)} value={r.estado} onChange={e => setEstado(r.id, e.target.value)}>
                                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                  </select>
                                  {esAdmin ? <button style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 14, padding: "2px" }} onClick={() => eliminarItem(r.id)} title="Quitar">×</button> : <div />}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {modalMueble && <MuebleModal mueble={modalMueble} onClose={() => setModalMueble(null)} onSave={editarMueble} onDelete={eliminarMuebleCatalogo} esAdmin={esAdmin} />}
    </div>
  );
}
