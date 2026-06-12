import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import EnchapadoView from "@/features/muebles/EnchapadoView";
import { ChapaSwatch, chapaColor } from "@/features/muebles/chapa";
import { C } from "@/theme";

// ─── Design tokens ─────────────────────────────────────────────────
const GLASS = { backdropFilter: "blur(32px) saturate(130%)", WebkitBackdropFilter: "blur(32px) saturate(130%)" };
const INP   = { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0, padding: "7px 10px", borderRadius: 7, fontSize: 13, outline: "none", width: "100%", fontFamily: C.sans };

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

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeBoatCode(value = "") {
  return normalizeText(value).replace(/^k(?=\d)/, "");
}

function nextEstado(estado) {
  const i = ESTADOS.indexOf(estado);
  return ESTADOS[(i + 1) % ESTADOS.length] ?? ESTADOS[0];
}

function formatTraceDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return [139, 115, 95];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function buildImageScopeTag(scopeType, scopeId) {
  if (!scopeType || !scopeId) return "legacy";
  return `${scopeType}_${scopeId}`;
}

function imageBelongsToScope(url = "", scopeType, scopeId) {
  const tag = buildImageScopeTag(scopeType, scopeId);
  if (tag === "legacy") return !url.includes("/catalogo_") && !url.includes("/linea_") && !url.includes("/checklist_");
  return url.includes(`/${tag}/`);
}

// ─── Thumbnail cache & hook ─────────────────────────────────────────
const thumbCache = {};
function useThumbnail(muebleId, scopeType, scopeId) {
  const cacheKey = `${muebleId ?? "x"}::${buildImageScopeTag(scopeType, scopeId)}`;
  const [url, setUrl] = useState(thumbCache[cacheKey] ?? null);
  useEffect(() => {
    if (!muebleId || thumbCache[cacheKey] !== undefined) return;
    thumbCache[cacheKey] = null; // mark loading
    supabase
      .from("prod_mueble_imagenes")
      .select("url,created_at")
      .eq("mueble_id", muebleId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const scoped = (data ?? []).filter(row => imageBelongsToScope(row.url, scopeType, scopeId));
        const u = scoped[0]?.url ?? null;
        thumbCache[cacheKey] = u;
        setUrl(u);
      });
  }, [cacheKey, muebleId, scopeId, scopeType]);
  return url;
}

// ─── MiniThumb ─────────────────────────────────────────────────────
function MiniThumb({ muebleId, scopeType, scopeId, size = 52, onClick }) {
  const url = useThumbnail(muebleId, scopeType, scopeId);
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
      <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", fontFamily: C.mono, fontSize: 12, color: C.t2, letterSpacing: 1.3 }}>{index + 1} / {images.length}</div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); setIndex(i => (i - 1 + images.length) % images.length); }} style={{ position: "absolute", left: 18, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.b0}`, color: C.t0, width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={img.url} alt={img.nombre} style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 10 }} />
        <div style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>{img.nombre}</div>
      </div>
      {images.length > 1 && <button onClick={e => { e.stopPropagation(); setIndex(i => (i + 1) % images.length); }} style={{ position: "absolute", right: 18, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.b0}`, color: C.t0, width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
    </div>
  );
}

// ─── GaleriaMueble ─────────────────────────────────────────────────
function GaleriaMueble({ muebleId, scopeType = "catalogo", scopeId = null, esAdmin }) {
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
    setImages((data ?? []).filter(img => imageBelongsToScope(img.url, scopeType, scopeId)));
    setLoading(false);
  }
  useEffect(() => { cargar(); }, [muebleId, scopeType, scopeId]);

  async function subirArchivos(files) {
    const arr = Array.from(files ?? []).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    setProgress(arr.map(f => ({ name: f.name, done: false, error: null })));
    const nuevas = [];
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const scopeTag = buildImageScopeTag(scopeType, scopeId);
      const path = `${scopeTag}/${muebleId}/${Date.now()}_${safe}`;
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
        <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
          {setupErr.tipo === "bucket" ? "⚠ Falta crear el bucket de Storage" : "⚠ Falta crear la tabla en la base de datos"}
        </div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 10, lineHeight: 1.6 }}>
          {setupErr.tipo === "bucket" ? (
            <>Andá a <strong style={{ color: C.t1 }}>Supabase → Storage → New bucket</strong>, nombre: <code style={{ background: C.s1, padding: "1px 5px", borderRadius: 4, color: C.t0, fontFamily: C.mono }}>{BUCKET}</code>, marcalo como <strong style={{ color: C.t1 }}>Public</strong>.</>
          ) : (
            <>Andá a <strong style={{ color: C.t1 }}>Supabase → SQL Editor</strong> y ejecutá este SQL:</>
          )}
        </div>
        {setupErr.tipo === "tabla" && (
          <pre style={{ background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 8, padding: 12, fontSize: 12, color: C.t1, overflowX: "auto", margin: "0 0 10px", fontFamily: C.mono, lineHeight: 1.7 }}>{SQL_TABLA}</pre>
        )}
        <div style={{ fontSize: 11, color: "rgba(239,68,68,0.6)", marginBottom: 10 }}>Error: {setupErr.msg}</div>
        <button onClick={cargar} style={{ padding: "6px 14px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Reintentar</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700 }}>
          Imágenes {images.length > 0 && <span style={{ fontFamily: C.mono, marginLeft: 4 }}>{images.length}</span>}
        </span>
        {esAdmin && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: "5px 12px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", borderRadius: 7, cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
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
              <span style={{ fontSize: 11, color: p.error ? C.red : p.done ? C.green : C.t2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.error ? `✗ ${p.error}` : p.done ? "✓" : p.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: C.t2, padding: "10px 0", textAlign: "center" }}>Cargando…</div>
      ) : images.length === 0 ? (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => esAdmin && fileRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? C.primary : C.b0}`, borderRadius: 10, padding: "22px 16px", textAlign: "center", cursor: esAdmin ? "pointer" : "default", background: dragging ? "rgba(59,130,246,0.04)" : "transparent", transition: "all .2s" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 12, color: C.t1 }}>Sin imágenes</div>
          {esAdmin && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>Click o arrastrá para subir</div>}
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {dragging && <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(59,130,246,0.08)", border: "2px dashed rgba(59,130,246,0.4)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700 }}>Soltá para subir</span></div>}
          {images.map((img, i) => (
            <div key={img.id} onClick={() => setLightbox(i)} className="gal-card"
              style={{ position: "relative", borderRadius: 7, overflow: "hidden", cursor: "pointer", aspectRatio: "4/3", background: C.s0, border: `1px solid ${C.b0}` }}>
              <img src={img.url} alt={img.nombre} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div className="gal-grad" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 50%)", opacity: 0, transition: "opacity .18s", pointerEvents: "none" }} />
              {esAdmin && <button className="gal-del" onClick={e => eliminar(img, e)} style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "50%", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .18s" }}>×</button>}
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
  const LBL = { fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 5, marginTop: 12, textTransform: "uppercase", fontWeight: 700 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--overlay-strong)", ...GLASS, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 24, width: "min(560px,94vw)", maxHeight: "90vh", overflowY: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
        <button style={{ position: "absolute", top: 14, right: 14, background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>×</button>
        {!edit ? (
          <>
            <div style={{ fontSize: 10, color: C.t2, letterSpacing: 1.3, textTransform: "uppercase" }}>{form.sector}</div>
            <h2 style={{ margin: "4px 0 0", color: C.t0, fontSize: 18, fontWeight: 700 }}>{form.nombre}</h2>
            {[["Descripción", form.descripcion], ["Medidas", form.medidas], ["Material", form.material]].map(([k, v]) => v ? (<div key={k}><span style={LBL}>{k}</span><div style={{ color: C.t1, fontSize: 14 }}>{v}</div></div>) : null)}
            {esAdmin && <>
              <button style={{ marginTop: 14, width: "100%", padding: "9px", background: C.s1, color: C.t0, fontWeight: 600, border: `1px solid ${C.b0}`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => setEdit(true)}>Editar ficha</button>
              <button style={{ marginTop: 6, width: "100%", padding: "9px", background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
            </>}
            <div style={{ borderTop: `1px solid ${C.b0}`, marginTop: 18 }}>
              <GaleriaMueble
                muebleId={mueble.id}
                scopeType={mueble.imageScopeType}
                scopeId={mueble.imageScopeId}
                esAdmin={esAdmin}
              />
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
  const { isMobile } = useResponsive();
  const [muebles,   setMuebles]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [q,         setQ]         = useState("");
  const [showAdd,       setShowAdd]       = useState(false);
  const [newM,          setNewM]          = useState({ nombre: "", sector: "", descripcion: "", medidas: "", material: "" });
  const [editId,        setEditId]        = useState(null);  // inline edit
  const [editForm,      setEditForm]      = useState({});
  const [copiarMode,    setCopiarMode]    = useState(false);
  const [todasLineas,   setTodasLineas]   = useState([]);
  const [copiarLineaId, setCopiarLineaId] = useState("");

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

  useEffect(() => {
    if (lineaId) {
      setQ(""); setShowAdd(false); setEditId(null); setCopiarMode(false); setCopiarLineaId(""); cargar();
    }
  }, [lineaId]);

  async function cargarTodasLineas() {
    const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre");
    setTodasLineas((data ?? []).filter(l => l.id !== lineaId));
  }

  async function copiarPlantilla() {
    if (!copiarLineaId) return;
    const { data } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", copiarLineaId);
    if (!data?.length) { alert("Esa línea no tiene muebles en su plantilla."); return; }
    const idsExistentes = new Set(muebles.map(m => m.id));
    const nuevos = data.filter(r => !idsExistentes.has(r.mueble_id));
    if (!nuevos.length) { alert("Todos esos muebles ya están en esta línea."); return; }
    const { error } = await supabase.from("prod_linea_muebles").insert(nuevos.map(r => ({ linea_id: lineaId, mueble_id: r.mueble_id })));
    if (error) { alert(error.message); return; }
    setCopiarMode(false); setCopiarLineaId("");
    cargar();
  }

  async function agregar() {
    if (!newM.nombre.trim()) return;
    const { data: m, error } = await supabase.from("prod_muebles").insert({
      nombre: newM.nombre.trim(), sector: newM.sector.trim(),
      descripcion: newM.descripcion.trim() || null,
      medidas: newM.medidas.trim() || null,
      material: newM.material.trim() || null,
    }).select().single();
    if (error) return alert(error.message);
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    setNewM({ nombre: "", sector: "", descripcion: "", medidas: "", material: "" });
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

  const LBL = { fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 };

  return (
    <div style={{ padding: isMobile ? "16px 16px 40px" : "28px 28px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>{lineaNombre}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: C.t2, fontFamily: C.mono }}>{muebles.length} muebles en la plantilla</div>
            <div style={{ fontSize: 10, color: C.primary, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>Plantilla base</div>
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>Los muebles de esta lista se copian automáticamente a cada nueva unidad.</div>
        </div>
        {esAdmin && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { if (!copiarMode) cargarTodasLineas(); setCopiarMode(v => !v); setShowAdd(false); }}
              style={{ padding: "8px 14px", background: copiarMode ? C.s1 : "rgba(255,255,255,0.04)", border: `1px solid ${copiarMode ? C.b1 : C.b0}`, color: copiarMode ? C.t1 : C.t2, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: C.sans }}
            >{copiarMode ? "Cancelar" : "Copiar de línea"}</button>
            <button onClick={() => { setShowAdd(v => !v); setCopiarMode(false); }} style={{ padding: "8px 16px", background: showAdd ? C.s1 : "rgba(59,130,246,0.12)", border: `1px solid ${showAdd ? C.b1 : "rgba(59,130,246,0.3)"}`, color: showAdd ? C.t1 : "#60a5fa", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: C.sans }}>
              {showAdd ? "Cancelar" : "+ Nuevo mueble"}
            </button>
          </div>
        )}
      </div>

      {/* Copiar plantilla de otra línea */}
      {copiarMode && esAdmin && (
        <div style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", marginBottom: 10, fontWeight: 700 }}>Importar plantilla de otra línea</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>Seleccioná una línea para copiar sus muebles a esta plantilla. Los que ya existan no se duplicarán.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...INP, flex: 1 }} value={copiarLineaId} onChange={e => setCopiarLineaId(e.target.value)}>
              <option value="">— Elegir línea —</option>
              {todasLineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <button onClick={copiarPlantilla} disabled={!copiarLineaId} style={{ padding: "7px 18px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: copiarLineaId ? "pointer" : "not-allowed", fontFamily: C.sans, fontSize: 13, opacity: copiarLineaId ? 1 : 0.5 }}>Importar</button>
          </div>
        </div>
      )}

      {/* Formulario nuevo mueble */}
      {showAdd && esAdmin && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, marginBottom: 10 }}>Nuevo mueble</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 140px", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={LBL}>Nombre *</label>
              <input style={INP} placeholder="Ej: Mesa de comedor" value={newM.nombre} onChange={e => setNewM(f => ({...f, nombre: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} autoFocus />
            </div>
            <div>
              <label style={LBL}>Sector</label>
              <input style={INP} placeholder="Ej: Comedor" value={newM.sector} onChange={e => setNewM(f => ({...f, sector: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={LBL}>Descripción</label>
            <input style={INP} placeholder="Descripción breve" value={newM.descripcion} onChange={e => setNewM(f => ({...f, descripcion: e.target.value}))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={LBL}>Medidas</label>
              <input style={INP} placeholder="Ej: 120x80x75 cm" value={newM.medidas} onChange={e => setNewM(f => ({...f, medidas: e.target.value}))} />
            </div>
            <div>
              <label style={LBL}>Material</label>
              <input style={INP} placeholder="Ej: MDF enchapado" value={newM.material} onChange={e => setNewM(f => ({...f, material: e.target.value}))} />
            </div>
          </div>
          <button onClick={agregar} style={{ padding: "8px 20px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Agregar</button>
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
        <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Cargando…</div>
      ) : muebles.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13, padding: "60px 0", textAlign: "center" }}>
          Sin muebles en esta línea.{esAdmin && " Usá '+ Nuevo mueble' para agregar."}
        </div>
      ) : Object.keys(porSector).length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin resultados para "{q}"</div>
      ) : (
        Object.entries(porSector).map(([sector, rows]) => (
          <div key={sector} style={{ marginBottom: 28 }}>
            {/* Sector header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 10px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 11, letterSpacing: "0.15em", color: C.t1, textTransform: "uppercase", fontWeight: 700 }}>{sector}</span>
              </div>
              <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{rows.length}</span>
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
                      <button onClick={() => guardarEdit(m.id)} style={{ flex: 1, padding: "8px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Guardar</button>
                      <button onClick={() => setEditId(null)} style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${C.b0}`, color: C.t2, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Cancelar</button>
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
                    onClick={() => onOpenMueble({ ...m, imageScopeType: "linea", imageScopeId: lineaId })}
                  >
                    <MiniThumb muebleId={m.id} scopeType="linea" scopeId={lineaId} size={50} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.t0, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nombre}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 3, alignItems: "center" }}>
                        {m.descripcion && <div style={{ fontSize: 12, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{m.descripcion}</div>}
                        {m.medidas && <div style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, whiteSpace: "nowrap", flexShrink: 0 }}>{m.medidas}</div>}
                      </div>
                    </div>
                    {esAdmin && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditId(m.id); setEditForm({ nombre: m.nombre ?? "", sector: m.sector ?? "", descripcion: m.descripcion ?? "", medidas: m.medidas ?? "", material: m.material ?? "" }); }}
                          style={{ padding: "5px 12px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}
                        >Editar</button>
                        <button
                          onClick={() => eliminar(m.id)}
                          style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}
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
  if (!edit && !val) return <button style={{ background: "none", border: "none", color: C.t2, fontSize: 12, cursor: "text", padding: 0, marginTop: 2, fontFamily: C.sans }} onClick={() => setEdit(true)}>+ nota</button>;
  if (!edit) return <div style={{ fontSize: 12, color: C.t2, marginTop: 3, fontStyle: "italic", cursor: "text" }} onClick={() => setEdit(true)}>{val}</div>;
  return <input ref={ref} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${C.b0}`, color: C.t1, fontSize: 12, padding: "2px 0", width: "100%", outline: "none", marginTop: 3, fontFamily: C.sans }} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEdit(false); } }} />;
}

// ─── Main ──────────────────────────────────────────────────────────
export default function MueblesScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const isAdmin = hasAdminAccess(profile);
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina" || role === "tecnica";

  const [mainView,  setMainView]  = useState("muebles"); // "muebles" | "enchapadora"
  const [lineas,    setLineas]    = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [enchapadoOt, setEnchapadoOt] = useState(null);
  const [enchapadoLoading, setEnchapadoLoading] = useState(false);
  const [showManualChapa, setShowManualChapa] = useState(false);
  const [manualChapaDraft, setManualChapaDraft] = useState("");
  const [manualChapaSaving, setManualChapaSaving] = useState(false);
  const [lineaId,   setLineaId]   = useState(null);
  const [unidadId,  setUnidadId]  = useState(null);
  // Mobile master-detail: true = menú (líneas/unidades); false = detalle.
  const [mobileShowNav, setMobileShowNav] = useState(true);
  const [q,         setQ]         = useState("");
  const [filtro,    setFiltro]    = useState("todos");
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [newLinea,  setNewLinea]  = useState("");
  const [newUnidad, setNewUnidad] = useState("");
  const [modalMueble, setModalMueble] = useState(null);
  const [selMode,     setSelMode]     = useState(false);
  const [selIds,      setSelIds]      = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemQ,    setAddItemQ]    = useState("");
  const [catalogoLinea, setCatalogoLinea] = useState([]);
  const [newItemForm,   setNewItemForm]   = useState({ nombre: "", sector: "", descripcion: "", medidas: "", material: "" });

  function toggleSel(id) {
    setSelIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selAll(rows) {
    setSelIds(new Set(rows.map(r => r.id)));
  }

  function selNone() { setSelIds(new Set()); }

  function traceForEstado(estado) {
    if (estado !== "Completo") return { recibido_por: null, recibido_at: null };
    return {
      recibido_por: profile?.username || profile?.nombre_completo || "usuario",
      recibido_at: new Date().toISOString(),
    };
  }

  async function tryUpdateTrace(ids, estado) {
    const trace = traceForEstado(estado);
    try {
      await supabase.from("prod_unidad_checklist").update(trace).in("id", ids);
    } catch {
      // Las columnas de trazabilidad pueden no estar aplicadas todavia.
    }
    return trace;
  }

  async function bulkSetEstado(estado) {
    if (!selIds.size) return;
    setBulkLoading(true);
    const ids = [...selIds];
    await supabase.from("prod_unidad_checklist").update({ estado }).in("id", ids);
    const trace = await tryUpdateTrace(ids, estado);
    setChecklist(p => p.map(r => selIds.has(r.id) ? { ...r, estado, ...trace } : r));
    setSelIds(new Set());
    setSelMode(false);
    setBulkLoading(false);
  }

  async function cargarLineas()     { const { data } = await supabase.from("prod_lineas").select("id,nombre").eq("activa",true).order("nombre"); const rows = data ?? []; setLineas(rows); if (!lineaId && rows.length) setLineaId(rows[0].id); }
  async function cargarUnidades(lid){
    let { data, error } = await supabase
      .from("prod_unidades")
      .select("id,codigo,color,chapa_manual")
      .eq("linea_id",lid)
      .eq("activa",true)
      .order("codigo");
    if (error && String(error.message || "").includes("chapa_manual")) {
      const retry = await supabase
        .from("prod_unidades")
        .select("id,codigo,color")
        .eq("linea_id",lid)
        .eq("activa",true)
        .order("codigo");
      data = retry.data;
    }
    setUnidades(data ?? []);
  }
  async function cargarChecklist(uid){
    setLoading(true);
    const selectBase = "id,estado,obs,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";
    let { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select(selectBase)
      .eq("unidad_id",uid)
      .order("prod_muebles(sector)")
      .order("prod_muebles(nombre)");
    if (error && String(error.message || "").includes("recibido_")) {
      const retry = await supabase
        .from("prod_unidad_checklist")
        .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
        .eq("unidad_id",uid)
        .order("prod_muebles(sector)")
        .order("prod_muebles(nombre)");
      data = retry.data;
      error = retry.error;
    }
    if (error) setErr(error.message);
    setChecklist(data ?? []);
    setLoading(false);
  }

  async function cargarEnchapadoOt(linea, unidad) {
    if (!linea?.nombre || !unidad?.codigo) { setEnchapadoOt(null); return; }
    setEnchapadoLoading(true);
    const modelo = linea.nombre.trim();
    const barco = unidad.codigo.trim();
    const barcoLookup = normalizeBoatCode(barco);
    const { data, error } = await supabase
      .from("enchapado_ots")
      .select("id,modelo,barco,tipo_chapa,estado,fecha")
      .ilike("modelo", `%${modelo}%`)
      .ilike("barco", `%${barcoLookup}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      setEnchapadoOt(null);
      setEnchapadoLoading(false);
      return;
    }
    const found = (data ?? []).find(row =>
      normalizeText(row.modelo) === normalizeText(modelo) &&
      normalizeBoatCode(row.barco) === normalizeBoatCode(barco)
    ) ?? null;
    setEnchapadoOt(found);
    setEnchapadoLoading(false);
  }

  async function guardarChapaManual() {
    if (!unidadSel) return;
    setManualChapaSaving(true);
    const value = manualChapaDraft.trim();
    const { data, error } = await supabase
      .from("prod_unidades")
      .update({ chapa_manual: value || null })
      .eq("id", unidadSel.id)
      .select("id,codigo,color,chapa_manual")
      .single();
    if (error) {
      setErr(`No se pudo guardar el dato manual. Aplicá el SQL de chapa_manual y probá de nuevo. ${error.message}`);
      setManualChapaSaving(false);
      return;
    }
    setUnidades(prev => prev.map(u => u.id === unidadSel.id ? { ...u, chapa_manual: data?.chapa_manual ?? null } : u));
    setShowManualChapa(false);
    setManualChapaSaving(false);
  }

  async function cargarCatalogoLinea(lid) {
    const { data } = await supabase
      .from("prod_linea_muebles")
      .select("mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .eq("linea_id", lid)
      .order("prod_muebles(sector)")
      .order("prod_muebles(nombre)");
    setCatalogoLinea((data ?? []).map(r => r.prod_muebles).filter(Boolean));
  }

  async function agregarItemAlChecklist(mueble) {
    if (!unidadId) return;
    const ya = checklist.find(r => r.mueble_id === mueble.id);
    if (ya) return;
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .insert({ unidad_id: unidadId, mueble_id: mueble.id, estado: "No enviado" })
      .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .single();
    if (error) { setErr(error.message); return; }
    setChecklist(p => [...p, data].sort((a, b) => {
      const sa = a.prod_muebles?.sector ?? ""; const sb = b.prod_muebles?.sector ?? "";
      return sa !== sb ? sa.localeCompare(sb) : (a.prod_muebles?.nombre ?? "").localeCompare(b.prod_muebles?.nombre ?? "");
    }));
  }

  async function crearYAgregarItem() {
    if (!newItemForm.nombre.trim() || !unidadId) return;
    const { data: m, error: mErr } = await supabase.from("prod_muebles").insert({
      nombre: newItemForm.nombre.trim(), sector: newItemForm.sector.trim(),
      descripcion: newItemForm.descripcion.trim() || null,
      medidas: newItemForm.medidas.trim() || null,
      material: newItemForm.material.trim() || null,
    }).select().single();
    if (mErr) { setErr(mErr.message); return; }
    // Also add to line catalog
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    await agregarItemAlChecklist(m);
    setNewItemForm({ nombre: "", sector: "", descripcion: "", medidas: "", material: "" });
    setShowAddItem(false);
    cargarCatalogoLinea(lineaId);
  }

  async function ensureLineaByModel(modeloRaw) {
    const modelo = String(modeloRaw ?? "").trim();
    if (!modelo) throw new Error("Falta el modelo para crear la linea.");

    const existente = lineas.find(l => normalizeText(l.nombre) === normalizeText(modelo));
    if (existente) return existente;

    const { data: found, error } = await supabase
      .from("prod_lineas")
      .select("id,nombre,activa")
      .ilike("nombre", modelo)
      .limit(1);

    if (error) throw error;

    const lineaDb = found?.[0];
    if (lineaDb) {
      if (lineaDb.activa === false) {
        await supabase.from("prod_lineas").update({ activa: true }).eq("id", lineaDb.id);
      }
      const normalized = { id: lineaDb.id, nombre: lineaDb.nombre };
      setLineas(prev => prev.some(l => l.id === normalized.id) ? prev : [...prev, normalized].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      return normalized;
    }

    const { data: created, error: createError } = await supabase
      .from("prod_lineas")
      .insert({ nombre: modelo, activa: true })
      .select("id,nombre")
      .single();

    if (createError) throw createError;
    setLineas(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return created;
  }

  async function ensureUnidadDesdeEnchapado({ modelo, barco }) {
    const codigo = String(barco ?? "").trim();
    if (!codigo) throw new Error("Falta el codigo de obra/barco.");

    const linea = await ensureLineaByModel(modelo);
    const { data: existingUnits, error: queryError } = await supabase
      .from("prod_unidades")
      .select("id,codigo,color,activa")
      .eq("linea_id", linea.id)
      .ilike("codigo", codigo)
      .limit(1);

    if (queryError) throw queryError;

    let unidad = existingUnits?.[0] ?? null;
    let created = false;

    if (!unidad) {
      const { data: nuevaUnidad, error: createUnitError } = await supabase
        .from("prod_unidades")
        .insert({ linea_id: linea.id, codigo, activa: true })
        .select("id,codigo,color")
        .single();

      if (createUnitError) throw createUnitError;
      unidad = nuevaUnidad;
      created = true;

      const { data: plantilla, error: plantillaError } = await supabase
        .from("prod_linea_muebles")
        .select("mueble_id")
        .eq("linea_id", linea.id);

      if (plantillaError) throw plantillaError;
      if (plantilla?.length) {
        await supabase.from("prod_unidad_checklist").insert(
          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado: "No enviado" }))
        );
      }
    } else if (unidad.activa === false) {
      await supabase.from("prod_unidades").update({ activa: true }).eq("id", unidad.id);
    }

    if (lineaId === linea.id) await cargarUnidades(linea.id);
    return { linea, unidad, created };
  }

  function descargarChecklistPdf() {
    if (!unidadSel || !lineaSel) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const fecha = new Date().toLocaleDateString("es-AR");
    const chapaManualPdf = String(unidadSel.chapa_manual ?? "").trim();
    const chapaPdf = enchapadoOt
      ? { tipo: enchapadoOt.tipo_chapa || "Sin especificar", detalle: `OT ${enchapadoOt.estado || "Pendiente"}` }
      : chapaManualPdf
        ? { tipo: chapaManualPdf, detalle: "Dato manual - muebles sin OT" }
        : null;
    const filas = checklist.map((row, idx) => [
      idx + 1,
      row.prod_muebles?.sector ?? "General",
      row.prod_muebles?.nombre ?? "-",
      row.estado ?? "No enviado",
      "",
      "",
      "",
      "",
      row.obs ?? "",
    ]);

    doc.setDrawColor(210, 214, 222);
    doc.setLineWidth(0.8);
    doc.roundedRect(36, 30, pageWidth - 72, 82, 6, 6, "S");

    doc.setTextColor(24, 24, 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Checklist de recepcion`, 52, 57);
    doc.setFontSize(15);
    doc.text(`${lineaSel.nombre} - ${unidadSel.codigo}`, 52, 80);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(82, 82, 91);
    doc.text(`Impreso: ${fecha}`, 52, 98);
    doc.text(`Items: ${checklist.length}`, 138, 98);

    doc.setDrawColor(180, 186, 196);
    doc.line(325, 55, pageWidth - 52, 55);
    doc.line(325, 85, pageWidth - 52, 85);
    doc.setTextColor(63, 63, 70);
    doc.setFont("helvetica", "bold");
    doc.text("Recibio", 325, 48);
    doc.text("Firma", 325, 78);

    if (chapaPdf) {
      const tone = chapaColor(chapaPdf.tipo);
      const [r, g, b] = hexToRgb(tone.base);
      doc.setFillColor(r, g, b);
      doc.roundedRect(52, 126, 18, 12, 2, 2, "F");
      doc.setDrawColor(145, 145, 150);
      doc.roundedRect(52, 126, 18, 12, 2, 2, "S");
      doc.setTextColor(63, 63, 70);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Chapa / referencia:", 78, 136);
      doc.setFont("helvetica", "normal");
      doc.text(`${chapaPdf.tipo} - ${chapaPdf.detalle}`, 165, 136);
    }

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(225, 228, 235);
    doc.roundedRect(36, chapaPdf ? 150 : 126, pageWidth - 72, 28, 4, 4, "FD");
    doc.setTextColor(82, 82, 91);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Uso en taller: marcar a mano OK / Parcial / Rehacer, anotar fecha y observaciones. Luego pasar los cambios al sistema.", 52, chapaPdf ? 168 : 144);

    autoTable(doc, {
      startY: chapaPdf ? 194 : 170,
      margin: { left: 36, right: 36, bottom: 34 },
      head: [["#", "Sector", "Mueble", "Estado actual", "OK", "Parcial", "Rehacer", "Fecha", "Obs / faltantes"]],
      body: filas,
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        lineColor: [205, 210, 218],
        lineWidth: 0.45,
        textColor: [24, 24, 27],
        minCellHeight: 30,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [241, 243, 247],
        textColor: [24, 24, 27],
        fontStyle: "bold",
        lineColor: [190, 196, 206],
        lineWidth: 0.6,
      },
      alternateRowStyles: { fillColor: [253, 253, 253] },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" },
        1: { cellWidth: 62 },
        2: { cellWidth: 150 },
        3: { cellWidth: 58, halign: "center", fontSize: 7.8, textColor: [82, 82, 91] },
        4: { cellWidth: 34, halign: "center" },
        5: { cellWidth: 42, halign: "center" },
        6: { cellWidth: 48, halign: "center" },
        7: { cellWidth: 50 },
        8: { cellWidth: "auto" },
      },
      didDrawCell: data => {
        if (data.section !== "body" || ![4, 5, 6].includes(data.column.index)) return;
        const size = 8;
        const x = data.cell.x + data.cell.width / 2 - size / 2;
        const y = data.cell.y + data.cell.height / 2 - size / 2;
        doc.setDrawColor(90, 90, 98);
        doc.setLineWidth(0.7);
        doc.rect(x, y, size, size);
      },
      didDrawPage: data => {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 128);
        doc.text(`Pagina ${data.pageNumber}`, data.settings.margin.left, pageHeight - 18);
        doc.text("Klase A - Muebles", pageWidth - 118, pageHeight - 18);
      },
    });

    doc.save(`checklist_${lineaSel.nombre}_${unidadSel.codigo}.pdf`);
  }

  useEffect(() => { cargarLineas(); }, []);
  useEffect(() => { if (lineaId) { cargarUnidades(lineaId); setUnidadId(null); setChecklist([]); setEnchapadoOt(null); } }, [lineaId]);
  useEffect(() => { if (unidadId) { cargarChecklist(unidadId); setShowAddItem(false); setAddItemQ(""); } }, [unidadId]);
  useEffect(() => { if (lineaId) cargarCatalogoLinea(lineaId); }, [lineaId]);

  async function crearLinea()  { if (!newLinea.trim()) return; await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true }); setNewLinea(""); cargarLineas(); }
  async function eliminarLinea(lid) { if (!window.confirm("¿Eliminar esta línea?")) return; await supabase.from("prod_lineas").delete().eq("id",lid); setLineaId(null); cargarLineas(); }
  async function crearUnidad() { if (!newUnidad.trim() || !lineaId) return; const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id:lineaId, codigo:newUnidad.trim(), activa:true }).select().single(); if (error) return setErr(error.message); const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id",lineaId); if (plantilla?.length) await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id:u.id, mueble_id:p.mueble_id, estado:"No enviado" }))); setNewUnidad(""); cargarUnidades(lineaId); setUnidadId(u.id); }
  async function eliminarUnidad(uid){ if (!window.confirm("¿Eliminar esta unidad?")) return; await supabase.from("prod_unidades").delete().eq("id",uid); setUnidadId(null); setChecklist([]); cargarUnidades(lineaId); }
  async function eliminarItem(rowId){ if (!window.confirm("¿Quitar este ítem?")) return; await supabase.from("prod_unidad_checklist").delete().eq("id",rowId); setChecklist(p => p.filter(r => r.id !== rowId)); }
  async function setEstado(rowId, estado) {
    await supabase.from("prod_unidad_checklist").update({ estado }).eq("id",rowId);
    const trace = await tryUpdateTrace([rowId], estado);
    setChecklist(p => p.map(r => r.id === rowId ? {...r, estado, ...trace} : r));
  }
  async function setObs(rowId, obs)       { await supabase.from("prod_unidad_checklist").update({ obs }).eq("id",rowId); setChecklist(p => p.map(r => r.id === rowId ? {...r, obs} : r)); }
  async function editarMueble(mid, form)  { await supabase.from("prod_muebles").update(form).eq("id",mid); if (unidadId) cargarChecklist(unidadId); setModalMueble(null); }
  async function eliminarMuebleCatalogo(mid) { await supabase.from("prod_muebles").delete().eq("id",mid); if (unidadId) cargarChecklist(unidadId); setModalMueble(null); }

  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId),    [lineas, lineaId]);
  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);
  const manualChapa = String(unidadSel?.chapa_manual ?? "").trim();
  useEffect(() => {
    if (lineaSel && unidadSel) cargarEnchapadoOt(lineaSel, unidadSel);
    else setEnchapadoOt(null);
  }, [lineaSel?.id, lineaSel?.nombre, unidadSel?.id, unidadSel?.codigo]);
  useEffect(() => {
    setManualChapaDraft(manualChapa);
    setShowManualChapa(false);
  }, [unidadSel?.id, manualChapa]);
  const filtrado  = useMemo(() => { let rows = checklist; if (filtro !== "todos") rows = rows.filter(r => r.estado === filtro); const qq = q.toLowerCase(); if (qq) rows = rows.filter(r => (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) || (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq)); return rows; }, [checklist, filtro, q]);
  const porSector = useMemo(() => { const map = {}; filtrado.forEach(r => { const s = r.prod_muebles?.sector || "General"; if (!map[s]) map[s] = []; map[s].push(r); }); return map; }, [filtrado]);
  const pct       = useMemo(() => progreso(checklist), [checklist]);
  const pctColor  = pct === 100 ? C.green : pct >= 50 ? C.t1 : C.t2;
  const stats     = useMemo(() => ({ total: checklist.length, completo: checklist.filter(r => r.estado === "Completo").length, parcial: checklist.filter(r => r.estado === "Parcial").length, rehacer: checklist.filter(r => r.estado === "Rehacer").length }), [checklist]);

  const lineaNavBtn  = sel => ({ width: "100%", textAlign: "left", padding: "9px 14px", border: "none", borderBottom: `1px solid rgba(255,255,255,0.03)`, background: sel ? C.s1 : "transparent", color: sel ? C.t0 : C.t2, cursor: "pointer", fontSize: 13, fontWeight: sel ? 600 : 400, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: C.sans });
  const unidadNavBtn = sel => ({ ...lineaNavBtn(sel), paddingLeft: 22, fontSize: 12, borderLeft: sel ? `2px solid ${C.b1}` : "2px solid transparent" });
  const estadoSt     = est => { const m = ESTADO_META[est] ?? ESTADO_META["No enviado"]; return { background: m.bg || C.s0, color: m.color, border: `1px solid ${m.color === C.t2 ? C.b0 : m.color+"44"}`, padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", outline: "none", fontFamily: C.sans }; };
  const estadoDot    = est => ESTADO_META[est]?.color ?? C.t2;
  const filterTabSt  = act => ({ border: act ? `1px solid ${C.b1}` : "1px solid transparent", background: act ? C.s1 : "transparent", color: act ? C.t0 : C.t2, padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans, transition: "all .15s" });

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.t0, fontFamily: C.sans, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        button:not([disabled]):hover { opacity: 0.8; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        select option { background: #0f0f12; color: var(--muted); }
        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%); }
        .checklist-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "contents" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr", gridTemplateRows: "1fr", minHeight: 0, height: "100%", overflow: "hidden" }}>

          {/* ── LEFT NAV ── (en mobile = menú master-detail a pantalla completa) */}
          <div style={{ height: isMobile ? "100%" : "100vh", overflowY: "auto", borderRight: isMobile ? "none" : `1px solid ${C.b0}`, background: "rgba(9,9,11,0.98)", display: isMobile && !mobileShowNav ? "none" : "flex", flexDirection: "column" }}>
            <div style={{ padding: isMobile ? "14px 12px 10px 52px" : "14px 12px 10px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
              {/* Switcher Muebles / Enchapadora */}
              <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3, border: `1px solid ${C.b0}` }}>
                {[["muebles","Muebles"],["enchapadora","Enchapado"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setMainView(key); setMobileShowNav(key !== "enchapadora"); }}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontWeight: mainView === key ? 600 : 400,
                      fontFamily: C.sans, transition: "all .15s",
                      background: mainView === key ? "rgba(255,255,255,0.07)" : "transparent",
                      border: `1px solid ${mainView === key ? C.b0 : "transparent"}`,
                      color: mainView === key ? C.t0 : C.t2,
                    }}
                  >{label}</button>
                ))}
              </div>
              {mainView === "muebles" && (
                <div style={{ fontSize: 11, color: C.t2 }}>Líneas de producción</div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {mainView === "enchapadora" ? (
                <div style={{ padding: "20px 16px", color: C.t2, fontSize: 12, textAlign: "center", lineHeight: 1.7 }}>
                  Gestioná las listas<br />para enchapar en el<br />panel de la derecha.
                </div>
              ) : (
                <>
                  {lineas.map(l => {
                const sel = lineaId === l.id;
                return (
                  <div key={l.id}>
                    <button style={lineaNavBtn(sel)} onClick={() => { setLineaId(l.id); setUnidadId(null); setMobileShowNav(false); }}>
                      <span>{l.nombre}</span>
                      {esAdmin && sel && <span style={{ fontSize: 11, color: C.red, cursor: "pointer", padding: "2px 5px" }} onClick={e => { e.stopPropagation(); eliminarLinea(l.id); }}>×</span>}
                    </button>
                    {sel && unidades.map(u => (
                      <button key={u.id} style={unidadNavBtn(unidadId === u.id)} onClick={() => { setUnidadId(u.id); setMobileShowNav(false); }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {u.color && <span style={{ width: 5, height: 5, borderRadius: "50%", background: u.color, flexShrink: 0 }} />}
                          {u.codigo}
                        </span>
                        {esAdmin && unidadId === u.id && <span style={{ fontSize: 11, color: C.red, padding: "2px 5px" }} onClick={e => { e.stopPropagation(); eliminarUnidad(u.id); }}>×</span>}
                      </button>
                    ))}
                    {sel && esAdmin && (
                      <div style={{ padding: "5px 14px 8px 22px", display: "flex", gap: 5 }}>
                        <input style={{ ...INP, flex: 1, padding: "5px 8px", fontSize: 12 }} placeholder="Nueva unidad…" value={newUnidad} onChange={e => setNewUnidad(e.target.value)} onKeyDown={e => e.key === "Enter" && crearUnidad()} />
                        <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans }} onClick={crearUnidad}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
                </>
              )}
            </div>
            {esAdmin && mainView === "muebles" && (
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.b0}`, flexShrink: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, marginBottom: 6 }}>Nueva línea</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <input style={{ ...INP, flex: 1, padding: "5px 8px", fontSize: 12 }} placeholder="Ej: K52" value={newLinea} onChange={e => setNewLinea(e.target.value)} onKeyDown={e => e.key === "Enter" && crearLinea()} />
                  <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans }} onClick={crearLinea}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* ── DETAIL ── */}
          <div style={{ height: isMobile ? "100%" : "100vh", overflowY: "auto", display: isMobile && mobileShowNav ? "none" : "block" }}>
            {isMobile && (
              <button onClick={() => setMobileShowNav(true)} style={{
                position: "sticky", top: 0, zIndex: 5, width: "100%",
                display: "flex", alignItems: "center", gap: 8,
                padding: "11px 16px 11px 52px", border: "none",
                borderBottom: `1px solid ${C.b0}`, background: "rgba(9,9,11,0.98)",
                color: C.t1, fontSize: 13, fontWeight: 700, fontFamily: C.sans, cursor: "pointer",
              }}>
                ‹ Volver al menú
              </button>
            )}
            {mainView === "enchapadora" ? (
              <EnchapadoView esAdmin={esAdmin} onEnsureMueblesUnidad={ensureUnidadDesdeEnchapado} />
            ) : !lineaId ? (
              /* Sin línea seleccionada */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div style={{ fontSize: 12, color: C.t2, letterSpacing: 1.3, textTransform: "uppercase" }}>Seleccioná una línea</div>
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>{unidadSel?.codigo}</div>
                    <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{lineaSel?.nombre} · {checklist.length} ítems</div>
                    <div style={{ marginTop: 10 }}>
                      {enchapadoLoading ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: C.s0, border: `1px solid ${C.b0}`, color: C.t2, fontSize: 12 }}>
                          Buscando OT de enchapado...
                        </div>
                      ) : enchapadoOt ? (() => {
                        const tone = chapaColor(enchapadoOt.tipo_chapa);
                        const estadoMeta = {
                          Pendiente: { color: C.t2, bg: C.s1 },
                          Enviada: { color: C.amber, bg: "rgba(245,158,11,0.10)" },
                          Devuelta: { color: C.green, bg: "rgba(16,185,129,0.10)" },
                          Rehacer: { color: C.red, bg: "rgba(239,68,68,0.10)" },
                        }[enchapadoOt.estado] ?? { color: C.t2, bg: C.s1 };
                        return (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: C.s0, border: `1px solid ${tone.base}55` }}>
                            <ChapaSwatch tipo={enchapadoOt.tipo_chapa} size="md" />
                            <div>
                              <div style={{ fontSize: 10, letterSpacing: 1.2, color: C.t2, textTransform: "uppercase", fontWeight: 800 }}>Chapa de enchapado</div>
                              <div style={{ fontSize: 13, color: C.t0, fontWeight: 800, marginTop: 1 }}>{enchapadoOt.tipo_chapa || "Sin especificar"}</div>
                            </div>
                            <span style={{ fontSize: 11, color: estadoMeta.color, background: estadoMeta.bg, border: `1px solid ${estadoMeta.color}44`, padding: "4px 8px", borderRadius: 7, fontWeight: 800 }}>
                              OT {enchapadoOt.estado || "Pendiente"}
                            </span>
                            <button onClick={() => setMainView("enchapadora")} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "4px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
                              Ver Enchapado
                            </button>
                          </div>
                        );
                      })() : (manualChapa && !showManualChapa) ? (() => {
                        const tone = chapaColor(manualChapa);
                        return (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: C.s0, border: `1px solid ${tone.base}55` }}>
                            <ChapaSwatch tipo={manualChapa} size="md" />
                            <div>
                              <div style={{ fontSize: 10, letterSpacing: 1.2, color: C.t2, textTransform: "uppercase", fontWeight: 800 }}>Dato manual de muebles</div>
                              <div style={{ fontSize: 13, color: C.t0, fontWeight: 800, marginTop: 1 }}>{manualChapa}</div>
                            </div>
                            <span style={{ fontSize: 11, color: C.amber, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)", padding: "4px 8px", borderRadius: 7, fontWeight: 800 }}>
                              Sin OT
                            </span>
                            {esAdmin && (
                              <button onClick={() => setShowManualChapa(true)} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "4px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
                                Editar
                              </button>
                            )}
                          </div>
                        );
                      })() : showManualChapa ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: C.s0, border: `1px solid ${C.b0}` }}>
                          <input
                            value={manualChapaDraft}
                            onChange={e => setManualChapaDraft(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && guardarChapaManual()}
                            placeholder="Ej: Roble Plata Rayado / muebles ya fabricados"
                            style={{ ...INP, width: 280, maxWidth: "min(70vw, 320px)", padding: "6px 9px", fontSize: 12 }}
                          />
                          <button disabled={manualChapaSaving} onClick={guardarChapaManual} style={{ background: C.green, border: `1px solid ${C.green}`, color: "#04130c", padding: "6px 10px", borderRadius: 7, cursor: manualChapaSaving ? "wait" : "pointer", fontSize: 11, fontWeight: 800, fontFamily: C.sans }}>
                            {manualChapaSaving ? "Guardando..." : "Guardar"}
                          </button>
                          <button onClick={() => { setShowManualChapa(false); setManualChapaDraft(manualChapa); }} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "7px 10px", borderRadius: 9, background: C.s0, border: `1px solid ${C.b0}`, color: C.t2, fontSize: 12 }}>
                          Sin OT de enchapado
                          {esAdmin && (
                            <button onClick={() => setShowManualChapa(true)} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "4px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
                              Cargar manual
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      onClick={descargarChecklistPdf}
                      style={{
                        padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                        fontFamily: C.sans, fontWeight: 600, transition: "all .15s",
                        background: "rgba(16,185,129,0.12)",
                        border: "1px solid rgba(16,185,129,0.3)",
                        color: C.green,
                      }}
                    >
                      Descargar checklist PDF
                    </button>
                    {esAdmin && (
                      <button
                        onClick={() => { setShowAddItem(v => !v); setAddItemQ(""); setSelMode(false); }}
                        style={{
                          padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                          fontFamily: C.sans, fontWeight: 600, transition: "all .15s",
                          background: showAddItem ? C.s1 : "rgba(59,130,246,0.12)",
                          border: `1px solid ${showAddItem ? C.b1 : "rgba(59,130,246,0.3)"}`,
                          color: showAddItem ? C.t1 : "#60a5fa",
                        }}>
                        {showAddItem ? "Cancelar" : "+ Agregar ítem"}
                      </button>
                    )}
                    <button
                      onClick={() => { setSelMode(v => !v); setSelIds(new Set()); setShowAddItem(false); }}
                      style={{
                        padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                        fontFamily: C.sans, fontWeight: 600, transition: "all .15s",
                        background: selMode ? "rgba(59,130,246,0.15)" : C.s0,
                        border: `1px solid ${selMode ? "rgba(59,130,246,0.4)" : C.b0}`,
                        color: selMode ? "#60a5fa" : C.t1,
                      }}>
                      {selMode ? "Cancelar seleccion" : "Seleccionar"}
                    </button>
                  </div>
                </div>

                {/* Bulk action bar */}
                {selMode && (
                  <div style={{
                    position: "sticky", top: 0, zIndex: 50,
                    background: "rgba(14,18,28,0.97)",
                    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid rgba(59,130,246,0.25)`,
                    borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                  }}>
                    <span style={{ fontFamily: C.mono, fontSize: 13, color: selIds.size > 0 ? "#60a5fa" : C.t2, fontWeight: 700, minWidth: 80 }}>
                      {selIds.size > 0 ? `${selIds.size} selec.` : "Sin selec."}
                    </span>
                    <button onClick={() => selAll(checklist)} style={{ padding: "4px 10px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Todos</button>
                    <button onClick={selNone} style={{ padding: "4px 10px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Ninguno</button>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.t2, letterSpacing: 1, textTransform: "uppercase" }}>Marcar como:</span>
                    {ESTADOS.map(e => {
                      const m = ESTADO_META[e];
                      return (
                        <button key={e} disabled={bulkLoading || selIds.size === 0} onClick={() => bulkSetEstado(e)} style={{
                          padding: "5px 12px", borderRadius: 7, cursor: selIds.size === 0 ? "not-allowed" : "pointer",
                          fontSize: 12, fontWeight: 700, fontFamily: C.sans, transition: "all .12s",
                          background: m.bg || C.s0, color: m.color,
                          border: `1px solid ${m.color}44`,
                          opacity: selIds.size === 0 ? 0.4 : 1,
                        }}>{bulkLoading ? "…" : e}</button>
                      );
                    })}
                  </div>
                )}

                {err && <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}

                {/* ── Panel Agregar ítem ── */}
                {showAddItem && esAdmin && (() => {
                  const yaEnChecklist = new Set(checklist.map(r => r.mueble_id));
                  const disponibles = catalogoLinea.filter(m => !yaEnChecklist.has(m.id));
                  const aqq = addItemQ.toLowerCase();
                  const filtrados = aqq ? disponibles.filter(m => m.nombre.toLowerCase().includes(aqq) || (m.sector ?? "").toLowerCase().includes(aqq)) : disponibles;
                  const LBL2 = { fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 };
                  return (
                    <div style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
                      <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", marginBottom: 12, fontWeight: 700 }}>Agregar ítem al barco</div>
                      {/* Buscar del catálogo */}
                      {disponibles.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>
                            Muebles del catálogo de la línea no incluidos en este barco ({disponibles.length}):
                          </div>
                          <input
                            style={{ ...INP, marginBottom: 8 }}
                            placeholder="Buscar en el catálogo…"
                            value={addItemQ}
                            onChange={e => setAddItemQ(e.target.value)}
                          />
                          <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                            {filtrados.length === 0 && <div style={{ fontSize: 12, color: C.t2, padding: "8px 0" }}>Sin coincidencias.</div>}
                            {filtrados.map(m => (
                              <div
                                key={m.id}
                                className="add-item-row"
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, cursor: "pointer", border: "1px solid transparent" }}
                                onClick={() => { agregarItemAlChecklist(m); }}
                              >
                                <span style={{ fontSize: 11, color: C.t2, minWidth: 70, textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.sector || "—"}</span>
                                <span style={{ fontSize: 14, color: C.t0, flex: 1 }}>{m.nombre}</span>
                                {m.medidas && <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{m.medidas}</span>}
                                <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>+ Agregar</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: `1px solid ${C.b0}`, marginBottom: 14 }} />
                        </>
                      )}
                      {/* Crear nuevo mueble ad-hoc */}
                      <div style={{ fontSize: 11, color: C.t2, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>Crear nuevo mueble</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 8, marginBottom: 8 }}>
                        <div><label style={LBL2}>Nombre *</label><input style={INP} placeholder="Ej: Camarote doble" value={newItemForm.nombre} onChange={e => setNewItemForm(f => ({...f, nombre: e.target.value}))} autoFocus /></div>
                        <div><label style={LBL2}>Sector</label><input style={INP} placeholder="Ej: Dormitorio" value={newItemForm.sector} onChange={e => setNewItemForm(f => ({...f, sector: e.target.value}))} /></div>
                      </div>
                      <div style={{ marginBottom: 8 }}><label style={LBL2}>Descripción</label><input style={INP} placeholder="Descripción breve" value={newItemForm.descripcion} onChange={e => setNewItemForm(f => ({...f, descripcion: e.target.value}))} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div><label style={LBL2}>Medidas</label><input style={INP} placeholder="Ej: 120x80 cm" value={newItemForm.medidas} onChange={e => setNewItemForm(f => ({...f, medidas: e.target.value}))} /></div>
                        <div><label style={LBL2}>Material</label><input style={INP} placeholder="Ej: MDF" value={newItemForm.material} onChange={e => setNewItemForm(f => ({...f, material: e.target.value}))} /></div>
                      </div>
                      <button onClick={crearYAgregarItem} disabled={!newItemForm.nombre.trim()} style={{ padding: "8px 18px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 8, cursor: newItemForm.nombre.trim() ? "pointer" : "not-allowed", fontFamily: C.sans, fontSize: 13, opacity: newItemForm.nombre.trim() ? 1 : 0.5 }}>
                        Crear y agregar al barco
                      </button>
                    </div>
                  );
                })()}
                <style>{`.add-item-row:hover{background:rgba(59,130,246,0.06)!important;border-color:rgba(59,130,246,0.15)!important}`}</style>

                {/* Progress */}
                <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "16px 20px", marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 16, fontSize: 13, alignItems: "center" }}>
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
                  <input style={{ ...INP, flex: 1, minWidth: 120, padding: "5px 12px", fontSize: 13 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {/* List */}
                {loading ? (
                  <div style={{ color: C.t2, fontSize: 13, padding: "30px 0", textAlign: "center" }}>Cargando…</div>
                ) : Object.keys(porSector).length === 0 ? (
                  <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>{q || filtro !== "todos" ? "Sin ítems con este filtro." : "Sin ítems en el catálogo de la línea."}</div>
                ) : (
                  Object.entries(porSector).map(([sector, rows]) => {
                    const completados = rows.filter(r => r.estado === "Completo").length;
                    return (
                      <div key={sector} style={{ marginBottom: 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 10px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 4 }}>
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 8, cursor: selMode ? "pointer" : "default" }}
                            onClick={() => {
                              if (!selMode) return;
                              const ids = rows.map(r => r.id);
                              const allSel = ids.every(id => selIds.has(id));
                              setSelIds(prev => {
                                const next = new Set(prev);
                                ids.forEach(id => allSel ? next.delete(id) : next.add(id));
                                return next;
                              });
                            }}
                          >
                            {selMode && (
                              <div style={{
                                width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                                border: `2px solid ${rows.every(r => selIds.has(r.id)) ? "#3b82f6" : "rgba(255,255,255,0.15)"}`,
                                background: rows.every(r => selIds.has(r.id)) ? "#3b82f6" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {rows.every(r => selIds.has(r.id)) && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                              </div>
                            )}
                            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                            <span style={{ fontSize: 11, letterSpacing: "0.15em", color: C.t1, textTransform: "uppercase", fontWeight: 700 }}>{sector}</span>
                          </div>
                          <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{completados}/{rows.length}</span>
                        </div>
                        {rows.map(r => {
                          const m = r.prod_muebles;
                          const isSel = selIds.has(r.id);
                          return (
                            <div
                              key={r.id}
                              className="checklist-row"
                              onClick={() => selMode && toggleSel(r.id)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: selMode ? "28px 50px 1fr minmax(150px, 190px) 28px" : "50px 1fr minmax(150px, 190px) 28px",
                                gap: 14, alignItems: "center",
                                padding: "10px 8px",
                                borderRadius: 9,
                                borderBottom: "1px solid rgba(255,255,255,0.03)",
                                transition: "background .15s",
                                cursor: selMode ? "pointer" : "default",
                                background: isSel ? "rgba(59,130,246,0.07)" : "transparent",
                                outline: isSel ? "1px solid rgba(59,130,246,0.2)" : "1px solid transparent",
                              }}
                            >
                              {/* Checkbox (solo en modo selección) */}
                              {selMode && (
                                <div style={{
                                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                  border: `2px solid ${isSel ? "#3b82f6" : "rgba(255,255,255,0.15)"}`,
                                  background: isSel ? "#3b82f6" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  transition: "all .12s",
                                }}>
                                  {isSel && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                                </div>
                              )}
                              {/* Thumbnail */}
                              <MiniThumb
                                muebleId={m?.id}
                                scopeType="checklist"
                                scopeId={r.id}
                                size={46}
                                onClick={!selMode && m ? () => setModalMueble({ ...m, imageScopeType: "checklist", imageScopeId: r.id }) : undefined}
                              />
                              {/* Nombre + obs */}
                              <div>
                                <span
                                  style={{ color: r.estado === "Completo" ? C.t2 : C.t0, fontSize: 14, cursor: selMode ? "default" : "pointer", textDecoration: r.estado === "Completo" ? "line-through" : "none", fontWeight: 400 }}
                                  onClick={() => !selMode && m && setModalMueble({ ...m, imageScopeType: "checklist", imageScopeId: r.id })}
                                >{m?.nombre ?? "—"}</span>
                                {!selMode && <ObsInline value={r.obs} rowId={r.id} onSave={setObs} />}
                              </div>
                              {/* Estado */}
                              <div onClick={e => e.stopPropagation()} style={{ display: "grid", gap: 5 }}>
                                <button
                                  type="button"
                                  disabled={selMode}
                                  onClick={() => setEstado(r.id, nextEstado(r.estado))}
                                  title="Tocar para avanzar estado"
                                  style={{
                                    ...estadoSt(r.estado),
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    opacity: selMode ? 0.55 : 1,
                                  }}
                                >
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: estadoDot(r.estado), boxShadow: `0 0 10px ${estadoDot(r.estado)}66` }} />
                                    {r.estado}
                                  </span>
                                  <span style={{ color: C.t2, fontSize: 11 }}>↻</span>
                                </button>
                                {!isMobile && !selMode && (
                                  <select
                                    style={{ ...estadoSt(r.estado), padding: "4px 7px", fontSize: 11, borderRadius: 7, width: "100%" }}
                                    value={r.estado}
                                    onChange={e => setEstado(r.id, e.target.value)}
                                  >
                                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                  </select>
                                )}
                                {r.estado === "Completo" && (r.recibido_por || r.recibido_at) && (
                                  <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.35, display: "grid", gap: 1 }}>
                                    {r.recibido_at && (
                                      <span>Fecha recepción: <span style={{ color: C.t1, fontWeight: 800 }}>{formatTraceDate(r.recibido_at)}</span></span>
                                    )}
                                    <span>Recibido por: <span style={{ color: C.t1, fontWeight: 800 }}>{r.recibido_por || "usuario"}</span></span>
                                  </div>
                                )}
                              </div>
                              {/* Eliminar */}
                              {esAdmin && !selMode
                                ? <button style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 15, padding: "2px", opacity: 0.5 }} onClick={e => { e.stopPropagation(); eliminarItem(r.id); }}>×</button>
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
