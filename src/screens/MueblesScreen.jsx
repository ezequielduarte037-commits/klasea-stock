import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── Design tokens ─────────────────────────────────────────────────
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
const INP   = { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0, padding: "7px 10px", borderRadius: 7, fontSize: 12, outline: "none", width: "100%", fontFamily: C.sans };

const BUCKET  = "muebles-galeria"; // bucket público en Supabase Storage
const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];
const ESTADO_META = {
  "No enviado": { color: C.t2,    bg: "transparent" },
  "Parcial":    { color: C.t1,    bg: "rgba(255,255,255,0.04)" },
  "Completo":   { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Rehacer":    { color: C.red,   bg: "rgba(239,68,68,0.1)" },
};

function progreso(rows) {
  if (!rows.length) return 0;
  return Math.round(rows.filter(r => r.estado === "Completo").length / rows.length * 100);
}

// ─── Thumbnail cache & hook ─────────────────────────────────────────
const thumbCache = {};
function useThumbnail(muebleId) {
  const [url, setUrl] = useState(thumbCache[muebleId] ?? null);
  useEffect(() => {
    if (!muebleId || thumbCache[muebleId] !== undefined) return;
    thumbCache[muebleId] = null; // mark loading
    supabase
      .from("prod_mueble_imagenes")
      .select("url")
      .eq("mueble_id", muebleId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single()
      .then(({ data }) => {
        const u = data?.url ?? null;
        thumbCache[muebleId] = u;
        setUrl(u);
      });
  }, [muebleId]);
  return url;
}

// ─── MiniThumb ─────────────────────────────────────────────────────
function MiniThumb({ muebleId, size = 52, onClick }) {
  const url = useThumbnail(muebleId);
  if (!url) return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, color: "rgba(255,255,255,0.1)",
        cursor: onClick ? "pointer" : "default",
      }}
    >🪑</div>
  );
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        overflow: "hidden", cursor: onClick ? "pointer" : "default",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

// ─── Lightbox ──────────────────────────────────────────────────────
function Lightbox({ images, index, onClose, setIndex }) {
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  setIndex(i => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex(i => (i + 1) % images.length);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [images.length]);
  const img = images[index];
  if (!img) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.96)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.b0}`, color: C.t0, width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>×</button>
      <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", fontFamily: C.mono, fontSize: 11, color: C.t2, letterSpacing: 2 }}>{index + 1} / {images.length}</div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); setIndex(i => (i - 1 + images.length) % images.length); }} style={{ position: "absolute", left: 18, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.b0}`, color: C.t0, width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={img.url} alt={img.nombre} style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 10 }} />
        <div style={{ fontSize: 11, color: C.t2, fontFamily: C.sans }}>{img.nombre}</div>
      </div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); setIndex(i => (i + 1) % images.length); }} style={{ position: "absolute", right: 18, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.b0}`, color: C.t0, width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
    </div>
  );
}

// ─── GaleriaMueble ─────────────────────────────────────────────────
function GaleriaMueble({ muebleId, esAdmin }) {
  const [images,    setImages]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [setupErr,  setSetupErr]  = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState([]);
  const [lightbox,  setLightbox]  = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const fileRef = useRef(null);

  async function cargar() {
    setLoading(true);
    setSetupErr(null);
    const { data, error } = await supabase
      .from("prod_mueble_imagenes")
      .select("id,url,nombre,created_at")
      .eq("mueble_id", muebleId)
      .order("created_at", { ascending: false });
    if (error) {
      setSetupErr({ tipo: "tabla", msg: error.message });
      setLoading(false);
      return;
    }
    setImages(data ?? []);
    setLoading(false);
  }
  useEffect(() => { cargar(); }, [muebleId]);

  async function subirArchivos(files) {
    const arr = Array.from(files ?? []).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    setProgress(arr.map(f => ({ name: f.name, done: false, error: null })));
    const nuevas = [];
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${muebleId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) {
        setProgress(p => p.map((x,j) => j===i ? {...x, error: upErr.message, done: true} : x));
        if (upErr.message.toLowerCase().includes("bucket")) setSetupErr({ tipo: "bucket", msg: upErr.message });
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data: row, error: dbErr } = await supabase.from("prod_mueble_imagenes").insert({ mueble_id: muebleId, url: publicUrl, nombre: file.name }).select().single();
      if (dbErr) {
        setProgress(p => p.map((x,j) => j===i ? {...x, error: dbErr.message, done: true} : x));
        if (dbErr.message.includes("does not exist") || dbErr.code === "42P01") setSetupErr({ tipo: "tabla", msg: dbErr.message });
      } else {
        nuevas.push(row);
        setProgress(p => p.map((x,j) => j===i ? {...x, done: true} : x));
      }
    }
    setImages(prev => [...nuevas, ...prev]);
    setUploading(false);
    setTimeout(() => setProgress([]), 2000);
  }

  async function eliminar(img, e) {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${img.nombre}"?`)) return;
    const parts = img.url.split(`/${BUCKET}/`);
    if (parts[1]) await supabase.storage.from(BUCKET).remove([parts[1]]);
    await supabase.from("prod_mueble_imagenes").delete().eq("id", img.id);
    setImages(p => p.filter(x => x.id !== img.id));
  }

  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); subirArchivos(e.dataTransfer.files); }, [muebleId]);

  const SQL_TABLA = `create table prod_mueble_imagenes (
  id uuid primary key default gen_random_uuid(),
  mueble_id uuid references prod_muebles(id) on delete cascade,
  url text not null,
  nombre text,
  created_at timestamptz default now()
);`;

  if (setupErr) return (
    <div style={{ marginTop: 18 }}>
      <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, color: "#f87171", fontWeight: 600, marginBottom: 8 }}>
          {setupErr.tipo === "bucket" ? "⚠ Falta crear el bucket de Storage" : "⚠ Falta crear la tabla en la base de datos"}
        </div>
        <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.6 }}>
          {setupErr.tipo === "bucket" ? (
            <>Andá a <strong style={{ color: C.t1 }}>Supabase → Storage → New bucket</strong>, nombre: <code style={{ background: C.s1, padding: "1px 5px", borderRadius: 4, color: C.t0, fontFamily: C.mono }}>{BUCKET}</code>, marcalo como <strong style={{ color: C.t1 }}>Public</strong>.</>
          ) : (
            <>Andá a <strong style={{ color: C.t1 }}>Supabase → SQL Editor</strong> y ejecutá este SQL:</>
          )}
        </div>
        {setupErr.tipo === "tabla" && (
          <pre style={{ background: "#0a0a0d", border: `1px solid ${C.b0}`, borderRadius: 8, padding: 12, fontSize: 11, color: C.t1, overflowX: "auto", margin: "0 0 10px", fontFamily: C.mono, lineHeight: 1.7 }}>{SQL_TABLA}</pre>
        )}
        <div style={{ fontSize: 10, color: "rgba(239,68,68,0.6)", marginBottom: 10 }}>Error: {setupErr.msg}</div>
        <button onClick={cargar} style={{ padding: "6px 14px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}>Reintentar</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 600 }}>
          Imágenes {images.length > 0 && <span style={{ fontFamily: C.mono, marginLeft: 4 }}>{images.length}</span>}
        </span>
        {esAdmin && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: "5px 12px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", borderRadius: 7, cursor: uploading ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
            <span>↑</span> {uploading ? "Subiendo…" : "Agregar"}
          </button>
        )}
        <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => subirArchivos(e.target.files)} />
      </div>

      {progress.length > 0 && (
        <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {progress.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: i < progress.length - 1 ? 4 : 0 }}>
              <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 99 }}>
                <div style={{ height: "100%", width: p.done ? "100%" : "55%", background: p.error ? C.red : C.green, borderRadius: 99, transition: "width .4s" }} />
              </div>
              <span style={{ fontSize: 10, color: p.error ? C.red : p.done ? C.green : C.t2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.error ? `✗ ${p.error}` : p.done ? "✓" : p.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 11, color: C.t2, padding: "10px 0", textAlign: "center" }}>Cargando…</div>
      ) : images.length === 0 ? (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => esAdmin && fileRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? C.primary : C.b0}`, borderRadius: 10, padding: "22px 16px", textAlign: "center", cursor: esAdmin ? "pointer" : "default", background: dragging ? "rgba(59,130,246,0.04)" : "transparent", transition: "all .2s" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 11, color: C.t1 }}>Sin imágenes</div>
          {esAdmin && <div style={{ fontSize: 10, color: C.t2, marginTop: 3 }}>Click o arrastrá para subir</div>}
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {dragging && <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(59,130,246,0.08)", border: "2px dashed rgba(59,130,246,0.4)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600 }}>Soltá para subir</span></div>}
          {images.map((img, i) => (
            <div key={img.id} onClick={() => setLightbox(i)} className="gal-card"
              style={{ position: "relative", borderRadius: 7, overflow: "hidden", cursor: "pointer", aspectRatio: "4/3", background: C.s0, border: `1px solid ${C.b0}` }}>
              <img src={img.url} alt={img.nombre} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div className="gal-grad" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 50%)", opacity: 0, transition: "opacity .18s", pointerEvents: "none" }} />
              {esAdmin && <button className="gal-del" onClick={e => eliminar(img, e)} style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "50%", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .18s" }}>×</button>}
            </div>
          ))}
        </div>
      )}
      <style>{`.gal-card:hover .gal-grad,.gal-card:hover .gal-del{opacity:1!important}.gal-card:hover{border-color:rgba(255,255,255,0.2)!important}`}</style>
      {lightbox !== null && <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} setIndex={setLightbox} />}
    </div>
  );
}

// ─── MuebleModal (ficha + galería) ─────────────────────────────────
function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ nombre: mueble.nombre ?? "", sector: mueble.sector ?? "", descripcion: mueble.descripcion ?? "", medidas: mueble.medidas ?? "", material: mueble.material ?? "" });
  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, marginTop: 12, textTransform: "uppercase", fontWeight: 600 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.88)", ...GLASS, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0d0d10", border: `1px solid ${C.b1}`, borderRadius: 14, padding: 24, width: "min(560px,94vw)", maxHeight: "90vh", overflowY: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
        <button style={{ position: "absolute", top: 14, right: 14, background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>×</button>
        {!edit ? (
          <>
            <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{form.sector}</div>
            <h2 style={{ margin: "4px 0 0", color: C.t0, fontSize: 18, fontWeight: 700 }}>{form.nombre}</h2>
            {[["Descripción", form.descripcion], ["Medidas", form.medidas], ["Material", form.material]].map(([k, v]) => v ? (<div key={k}><span style={LBL}>{k}</span><div style={{ color: C.t1, fontSize: 13 }}>{v}</div></div>) : null)}
            {esAdmin && <>
              <button style={{ marginTop: 14, width: "100%", padding: "9px", background: C.s1, color: C.t0, fontWeight: 600, border: `1px solid ${C.b0}`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }} onClick={() => setEdit(true)}>Editar ficha</button>
              <button style={{ marginTop: 6, width: "100%", padding: "9px", background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
            </>}
            <div style={{ borderTop: `1px solid ${C.b0}`, marginTop: 18 }}>
              <GaleriaMueble muebleId={mueble.id} esAdmin={esAdmin} />
            </div>
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 14px", color: C.t0, fontSize: 15, fontWeight: 600 }}>Editar ficha</h3>
            {[["Nombre","nombre","input"],["Sector","sector","input"],["Descripción","descripcion","textarea"],["Medidas","medidas","input"],["Material","material","input"]].map(([label,key,type]) => (
              <div key={key}>
                <label style={LBL}>{label}</label>
                {type === "textarea" ? <textarea style={{ ...INP, minHeight: 60, resize: "vertical" }} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} /> : <input style={INP} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} />}
              </div>
            ))}
            <button style={{ marginTop: 16, width: "100%", padding: "10px", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 600, border: "1px solid rgba(59,130,246,0.35)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => { if (!form.nombre.trim()) return; onSave(mueble.id, form); setEdit(false); }}>Guardar cambios</button>
            <button style={{ marginTop: 8, width: "100%", padding: "10px", background: "transparent", color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans }} onClick={() => setEdit(false)}>Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CatalogoLinea — vista principal cuando hay línea pero no unidad ─
function CatalogoLinea({ lineaId, lineaNombre, esAdmin, onOpenMueble }) {
  const [muebles,   setMuebles]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [q,         setQ]         = useState("");
  const [showAdd,   setShowAdd]   = useState(false);
  const [newM,      setNewM]      = useState({ nombre: "", sector: "" });
  const [editId,    setEditId]    = useState(null);  // inline edit
  const [editForm,  setEditForm]  = useState({});

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("prod_linea_muebles")
      .select("mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .eq("linea_id", lineaId)
      .order("prod_muebles(sector)")
      .order("prod_muebles(nombre)");
    setMuebles((data ?? []).map(r => r.prod_muebles).filter(Boolean));
    setLoading(false);
  }

  useEffect(() => { if (lineaId) { setQ(""); setShowAdd(false); setEditId(null); cargar(); } }, [lineaId]);

  async function agregar() {
    if (!newM.nombre.trim()) return;
    const { data: m, error } = await supabase.from("prod_muebles").insert({ nombre: newM.nombre.trim(), sector: newM.sector.trim() }).select().single();
    if (error) return alert(error.message);
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    setNewM({ nombre: "", sector: "" });
    setShowAdd(false);
    cargar();
  }

  async function guardarEdit(id) {
    await supabase.from("prod_muebles").update({ nombre: editForm.nombre, sector: editForm.sector, descripcion: editForm.descripcion, medidas: editForm.medidas, material: editForm.material }).eq("id", id);
    setEditId(null);
    cargar();
  }

  async function eliminar(id) {
    if (!window.confirm("¿Quitar este mueble de la línea? Se quitará de todas las unidades.")) return;
    await supabase.from("prod_linea_muebles").delete().eq("linea_id", lineaId).eq("mueble_id", id);
    setMuebles(p => p.filter(m => m.id !== id));
  }

  // agrupar por sector
  const filtrados = useMemo(() => {
    if (!q.trim()) return muebles;
    const qq = q.toLowerCase();
    return muebles.filter(m => m.nombre.toLowerCase().includes(qq) || (m.sector ?? "").toLowerCase().includes(qq));
  }, [muebles, q]);

  const porSector = useMemo(() => {
    const map = {};
    filtrados.forEach(m => { const s = m.sector || "Sin sector"; if (!map[s]) map[s] = []; map[s].push(m); });
    return map;
  }, [filtrados]);

  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 };

  return (
    <div style={{ padding: "28px 28px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>{lineaNombre}</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 4, fontFamily: C.mono }}>{muebles.length} muebles en el catálogo</div>
        </div>
        {esAdmin && (
          <button onClick={() => setShowAdd(v => !v)} style={{ padding: "8px 16px", background: showAdd ? C.s1 : "rgba(59,130,246,0.12)", border: `1px solid ${showAdd ? C.b1 : "rgba(59,130,246,0.3)"}`, color: showAdd ? C.t1 : "#60a5fa", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: C.sans }}>
            {showAdd ? "Cancelar" : "+ Nuevo mueble"}
          </button>
        )}
      </div>

      {/* Formulario nuevo mueble */}
      {showAdd && esAdmin && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 10 }}>Nuevo mueble</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={LBL}>Nombre</label>
              <input style={INP} placeholder="Ej: Mesa de comedor" value={newM.nombre} onChange={e => setNewM(f => ({...f, nombre: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} autoFocus />
            </div>
            <div>
              <label style={LBL}>Sector</label>
              <input style={INP} placeholder="Ej: Comedor" value={newM.sector} onChange={e => setNewM(f => ({...f, sector: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} />
            </div>
          </div>
          <button onClick={agregar} style={{ padding: "8px 20px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Agregar</button>
        </div>
      )}

      {/* Buscador */}
      {muebles.length > 4 && (
        <div style={{ marginBottom: 16 }}>
          <input style={{ ...INP, padding: "7px 12px" }} placeholder="Buscar mueble…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      )}

      {/* Lista por sector */}
      {loading ? (
        <div style={{ color: C.t2, fontSize: 12, padding: "40px 0", textAlign: "center" }}>Cargando…</div>
      ) : muebles.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 12, padding: "60px 0", textAlign: "center" }}>
          Sin muebles en esta línea.{esAdmin && " Usá '+ Nuevo mueble' para agregar."}
        </div>
      ) : Object.keys(porSector).length === 0 ? (
        <div style={{ color: C.t2, fontSize: 12, padding: "40px 0", textAlign: "center" }}>Sin resultados para "{q}"</div>
      ) : (
        Object.entries(porSector).map(([sector, rows]) => (
          <div key={sector} style={{ marginBottom: 28 }}>
            {/* Sector header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 10px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 10, letterSpacing: "0.15em", color: C.t1, textTransform: "uppercase", fontWeight: 600 }}>{sector}</span>
              </div>
              <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{rows.length}</span>
            </div>

            {/* Muebles */}
            {rows.map(m => (
              <div key={m.id}>
                {editId === m.id ? (
                  /* ── Edición inline ── */
                  <div style={{ background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, marginBottom: 8 }}>
                      <div><label style={LBL}>Nombre</label><input style={INP} value={editForm.nombre} onChange={e => setEditForm(f => ({...f, nombre: e.target.value}))} autoFocus /></div>
                      <div><label style={LBL}>Sector</label><input style={INP} value={editForm.sector} onChange={e => setEditForm(f => ({...f, sector: e.target.value}))} /></div>
                    </div>
                    <div style={{ marginBottom: 8 }}><label style={LBL}>Descripción</label><input style={INP} value={editForm.descripcion} onChange={e => setEditForm(f => ({...f, descripcion: e.target.value}))} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div><label style={LBL}>Medidas</label><input style={INP} value={editForm.medidas} onChange={e => setEditForm(f => ({...f, medidas: e.target.value}))} /></div>
                      <div><label style={LBL}>Material</label><input style={INP} value={editForm.material} onChange={e => setEditForm(f => ({...f, material: e.target.value}))} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => guardarEdit(m.id)} style={{ flex: 1, padding: "8px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Guardar</button>
                      <button onClick={() => setEditId(null)} style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${C.b0}`, color: C.t2, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  /* ── Fila normal ── */
                  <div
                    className="mueble-row"
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 14px", borderRadius: 10, marginBottom: 4,
                      cursor: "pointer", transition: "background .15s",
                      border: "1px solid transparent",
                    }}
                    onClick={() => onOpenMueble(m)}
                  >
                    <MiniThumb muebleId={m.id} size={50} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.t0, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nombre}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 3, alignItems: "center" }}>
                        {m.descripcion && <div style={{ fontSize: 11, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{m.descripcion}</div>}
                        {m.medidas && <div style={{ fontSize: 10, color: C.t2, fontFamily: C.mono, whiteSpace: "nowrap", flexShrink: 0 }}>{m.medidas}</div>}
                      </div>
                    </div>
                    {esAdmin && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditId(m.id); setEditForm({ nombre: m.nombre ?? "", sector: m.sector ?? "", descripcion: m.descripcion ?? "", medidas: m.medidas ?? "", material: m.material ?? "" }); }}
                          style={{ padding: "5px 12px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                        >Editar</button>
                        <button
                          onClick={() => eliminar(m.id)}
                          style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                        >×</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
      <style>{`.mueble-row:hover{background:rgba(255,255,255,0.04)!important;border-color:rgba(255,255,255,0.07)!important}`}</style>
    </div>
  );
}

// ─── ObsInline ─────────────────────────────────────────────────────
function ObsInline({ value, rowId, onSave }) {
  const [edit, setEdit] = useState(false);
  const [val,  setVal]  = useState(value ?? "");
  const ref = useRef(null);
  useEffect(() => { if (edit) ref.current?.focus(); }, [edit]);
  function commit() { setEdit(false); if (val !== value) onSave(rowId, val); }
  if (!edit && !val) return <button style={{ background: "none", border: "none", color: C.t2, fontSize: 11, cursor: "text", padding: 0, marginTop: 2, fontFamily: C.sans }} onClick={() => setEdit(true)}>+ nota</button>;
  if (!edit) return <div style={{ fontSize: 11, color: C.t2, marginTop: 3, fontStyle: "italic", cursor: "text" }} onClick={() => setEdit(true)}>{val}</div>;
  return <input ref={ref} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 11, padding: "2px 0", width: "100%", outline: "none", marginTop: 3, fontFamily: C.sans }} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEdit(false); } }} />;
}

// ─── Main ──────────────────────────────────────────────────────────
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
  const [newLinea,  setNewLinea]  = useState("");
  const [newUnidad, setNewUnidad] = useState("");
  const [modalMueble, setModalMueble] = useState(null);

  async function cargarLineas()     { const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa",true).order("nombre"); const rows = data ?? []; setLineas(rows); if (!lineaId && rows.length) setLineaId(rows[0].id); }
  async function cargarUnidades(lid){ const { data } = await supabase.from("prod_unidades").select("id,codigo,color").eq("linea_id",lid).eq("activa",true).order("codigo"); setUnidades(data ?? []); }
  async function cargarChecklist(uid){ setLoading(true); const { data, error } = await supabase.from("prod_unidad_checklist").select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)").eq("unidad_id",uid).order("prod_muebles(sector)").order("prod_muebles(nombre)"); if (error) setErr(error.message); setChecklist(data ?? []); setLoading(false); }

  useEffect(() => { cargarLineas(); }, []);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(null); setChecklist([]); } }, [lineaId]);
  useEffect(() => { if (unidadId) cargarChecklist(unidadId); }, [unidadId]);

  async function crearLinea()  { if (!newLinea.trim()) return; await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true }); setNewLinea(""); cargarLineas(); }
  async function eliminarLinea(lid) { if (!window.confirm("¿Eliminar esta línea?")) return; await supabase.from("prod_lineas").delete().eq("id",lid); setLineaId(null); cargarLineas(); }
  async function crearUnidad() { if (!newUnidad.trim() || !lineaId) return; const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id:lineaId, codigo:newUnidad.trim(), activa:true }).select().single(); if (error) return setErr(error.message); const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id",lineaId); if (plantilla?.length) await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id:u.id, mueble_id:p.mueble_id, estado:"No enviado" }))); setNewUnidad(""); cargarUnidades(lineaId); setUnidadId(u.id); }
  async function eliminarUnidad(uid){ if (!window.confirm("¿Eliminar esta unidad?")) return; await supabase.from("prod_unidades").delete().eq("id",uid); setUnidadId(null); setChecklist([]); cargarUnidades(lineaId); }
  async function eliminarItem(rowId){ if (!window.confirm("¿Quitar este ítem?")) return; await supabase.from("prod_unidad_checklist").delete().eq("id",rowId); setChecklist(p => p.filter(r => r.id !== rowId)); }
  async function setEstado(rowId, estado) { await supabase.from("prod_unidad_checklist").update({ estado }).eq("id",rowId); setChecklist(p => p.map(r => r.id === rowId ? {...r, estado} : r)); }
  async function setObs(rowId, obs)       { await supabase.from("prod_unidad_checklist").update({ obs }).eq("id",rowId); setChecklist(p => p.map(r => r.id === rowId ? {...r, obs} : r)); }
  async function editarMueble(mid, form)  { await supabase.from("prod_muebles").update(form).eq("id",mid); if (unidadId) cargarChecklist(unidadId); setModalMueble(null); }
  async function eliminarMuebleCatalogo(mid) { await supabase.from("prod_muebles").delete().eq("id",mid); if (unidadId) cargarChecklist(unidadId); setModalMueble(null); }

  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId),    [lineas, lineaId]);
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);
  const filtrado  = useMemo(() => { let rows = checklist; if (filtro !== "todos") rows = rows.filter(r => r.estado === filtro); const qq = q.toLowerCase(); if (qq) rows = rows.filter(r => (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) || (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq)); return rows; }, [checklist, filtro, q]);
  const porSector = useMemo(() => { const map = {}; filtrado.forEach(r => { const s = r.prod_muebles?.sector || "General"; if (!map[s]) map[s] = []; map[s].push(r); }); return map; }, [filtrado]);
  const pct       = useMemo(() => progreso(checklist), [checklist]);
  const pctColor  = pct === 100 ? C.green : pct >= 50 ? C.t1 : C.t2;
  const stats     = useMemo(() => ({ total: checklist.length, completo: checklist.filter(r => r.estado === "Completo").length, parcial: checklist.filter(r => r.estado === "Parcial").length, rehacer: checklist.filter(r => r.estado === "Rehacer").length }), [checklist]);

  const lineaNavBtn  = sel => ({ width: "100%", textAlign: "left", padding: "9px 14px", border: "none", borderBottom: `1px solid rgba(255,255,255,0.03)`, background: sel ? C.s1 : "transparent", color: sel ? C.t0 : C.t2, cursor: "pointer", fontSize: 12, fontWeight: sel ? 600 : 400, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: C.sans });
  const unidadNavBtn = sel => ({ ...lineaNavBtn(sel), paddingLeft: 22, fontSize: 11, borderLeft: sel ? `2px solid ${C.b1}` : "2px solid transparent" });
  const estadoSt     = est => { const m = ESTADO_META[est] ?? ESTADO_META["No enviado"]; return { background: m.bg, color: m.color, border: `1px solid ${m.color === C.t2 ? C.b0 : m.color+"44"}`, padding: "5px 9px", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer", outline: "none", fontFamily: C.sans }; };
  const filterTabSt  = act => ({ border: act ? `1px solid ${C.b1}` : "1px solid transparent", background: act ? C.s1 : "transparent", color: act ? C.t0 : C.t2, padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans, transition: "all .15s" });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        button:not([disabled]):hover { opacity: 0.8; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        select option { background: #0f0f12; color: #a1a1aa; }
        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%); }
        .checklist-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100vh", overflow: "hidden" }}>

          {/* ── LEFT NAV ── */}
          <div style={{ height: "100vh", overflowY: "auto", borderRight: `1px solid ${C.b0}`, background: "rgba(9,9,11,0.98)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Muebles</div>
              <div style={{ fontSize: 10, color: C.t2, marginTop: 3 }}>Líneas de producción</div>
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
          <div style={{ height: "100vh", overflowY: "auto" }}>
            {!lineaId ? (
              /* Sin línea seleccionada */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una línea</div>
              </div>

            ) : !unidadId ? (
              /* ── CATÁLOGO DE LA LÍNEA ── */
              <CatalogoLinea
                lineaId={lineaId}
                lineaNombre={lineaSel?.nombre ?? ""}
                esAdmin={esAdmin}
                onOpenMueble={m => setModalMueble(m)}
              />

            ) : (
              /* ── CHECKLIST DE LA UNIDAD ── */
              <div style={{ padding: "28px 28px 40px" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>{unidadSel?.codigo}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>{lineaSel?.nombre} · {checklist.length} ítems</div>
                  </div>
                </div>

                {err && <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 12, marginBottom: 12 }}>{err}</div>}

                {/* Progress */}
                <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "16px 20px", marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: C.green, fontWeight: 500 }}>{stats.completo} completo{stats.completo !== 1 ? "s" : ""}</span>
                      {stats.parcial > 0 && <span style={{ color: C.t1 }}>{stats.parcial} parcial</span>}
                      {stats.rehacer > 0 && <span style={{ color: C.red }}>{stats.rehacer} rehacer</span>}
                      <span style={{ color: C.t2 }}>{stats.total - stats.completo - stats.parcial - stats.rehacer} pendientes</span>
                    </div>
                    <span style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: pctColor, letterSpacing: "-0.02em" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 99, transition: "width .5s ease" }} />
                  </div>
                </div>

                {/* Filters */}
                <div style={{ display: "flex", gap: 5, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
                  {["todos", ...ESTADOS].map(e => <button key={e} style={filterTabSt(filtro === e)} onClick={() => setFiltro(e)}>{e === "todos" ? "Todos" : e}</button>)}
                  <input style={{ ...INP, flex: 1, minWidth: 120, padding: "5px 12px", fontSize: 12 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {/* List */}
                {loading ? (
                  <div style={{ color: C.t2, fontSize: 12, padding: "30px 0", textAlign: "center" }}>Cargando…</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ color: C.t2, fontSize: 12, padding: "40px 0", textAlign: "center" }}>{q || filtro !== "todos" ? "Sin ítems con este filtro." : "Sin ítems en el catálogo de la línea."}</div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => {
                    const completados = rows.filter(r => r.estado === "Completo").length;
                    return (
                      <div key={sector} style={{ marginBottom: 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 10px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                            <span style={{ fontSize: 10, letterSpacing: "0.15em", color: C.t1, textTransform: "uppercase", fontWeight: 600 }}>{sector}</span>
                          </div>
                          <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{completados}/{rows.length}</span>
                        </div>
                        {rows.map(r => {
                          const m = r.prod_muebles;
                          return (
                            <div
                              key={r.id}
                              className="checklist-row"
                              style={{
                                display: "grid",
                                gridTemplateColumns: "50px 1fr 130px 28px",
                                gap: 14, alignItems: "center",
                                padding: "10px 8px",
                                borderRadius: 9,
                                borderBottom: "1px solid rgba(255,255,255,0.03)",
                                transition: "background .15s",
                              }}
                            >
                              {/* Thumbnail */}
                              <MiniThumb
                                muebleId={m?.id}
                                size={46}
                                onClick={m ? () => setModalMueble(m) : undefined}
                              />
                              {/* Nombre + obs */}
                              <div>
                                <span
                                  style={{ color: r.estado === "Completo" ? C.t2 : C.t0, fontSize: 13, cursor: "pointer", textDecoration: r.estado === "Completo" ? "line-through" : "none", fontWeight: 400 }}
                                  onClick={() => m && setModalMueble(m)}
                                >{m?.nombre ?? "—"}</span>
                                <ObsInline value={r.obs} rowId={r.id} onSave={setObs} />
                              </div>
                              {/* Estado */}
                              <select style={estadoSt(r.estado)} value={r.estado} onChange={e => setEstado(r.id, e.target.value)}>
                                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>
                              {/* Eliminar */}
                              {esAdmin
                                ? <button style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 15, padding: "2px", opacity: 0.5 }} onClick={() => eliminarItem(r.id)}>×</button>
                                : <div />
                              }
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
