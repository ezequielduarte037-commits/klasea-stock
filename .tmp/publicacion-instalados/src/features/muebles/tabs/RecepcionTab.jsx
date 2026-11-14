import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Armchair,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleCheck,
  CircleDashed,
  CircleDot,
  ClipboardCheck,
  Copy,
  Download,
  ImagePlus,
  LayoutTemplate,
  ListChecks,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import { ChapaSwatch, chapaColor } from "@/features/muebles/chapa";
import { printFaltantes } from "@/features/muebles/printFaltantes";
import { loadNavyLogo } from "@/lib/pdfLogo";
import logoKlasea from "@/assets/logos/logo-klasea.png";
import { etapaMeta } from "../mueblesProduccion";
import { Aviso, Estado, Mini, Modal, Tag, Vacio } from "../ui";

const BUCKET = "muebles-galeria"; // bucket público en Supabase Storage

// Estados guardados en la base y cómo se muestran. En la recepción se habla de
// "recibido" y "pendiente" (igual que en el PDF); en la base siguen siendo
// "Completo" y "No enviado".
const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];
const ESTADO_UI = {
  "No enviado": { label: "Pendiente", plural: "Pendientes", tono: "neutro", icono: CircleDashed },
  Parcial: { label: "Parcial", plural: "Parciales", tono: "azul", icono: CircleDot },
  Completo: { label: "Recibido", plural: "Recibidos", tono: "verde", icono: CircleCheck },
  Rehacer: { label: "Rehacer", plural: "Rehacer", tono: "rojo", icono: RotateCcw },
};

// Casillero del PDF. Cada estado tiene su marca en vez de un tilde para todo:
// en papel "recibido", "vino incompleto" y "hay que rehacerlo" son tres cosas
// muy distintas y confundirlas cuesta un mueble.
function dibujarCasillero(doc, x, y, size, estado) {
  const relleno = {
    "Completo":   [16, 150, 105],
    "Parcial":    [37, 99, 235],
    "Rehacer":    [214, 60, 60],
  }[estado];

  doc.setLineWidth(0.8);
  if (relleno) {
    doc.setFillColor(...relleno);
    doc.setDrawColor(...relleno);
    doc.roundedRect(x, y, size, size, 1.5, 1.5, "FD");
  } else {
    doc.setDrawColor(120, 126, 138);
    doc.roundedRect(x, y, size, size, 1.5, 1.5, "S");
    return;
  }

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.2);
  if (estado === "Completo") {
    // Tilde.
    doc.line(x + size * 0.24, y + size * 0.52, x + size * 0.43, y + size * 0.71);
    doc.line(x + size * 0.43, y + size * 0.71, x + size * 0.77, y + size * 0.29);
  } else if (estado === "Parcial") {
    // Guion: llegó algo, no todo.
    doc.line(x + size * 0.24, y + size * 0.5, x + size * 0.76, y + size * 0.5);
  } else {
    // Cruz.
    doc.line(x + size * 0.28, y + size * 0.28, x + size * 0.72, y + size * 0.72);
    doc.line(x + size * 0.72, y + size * 0.28, x + size * 0.28, y + size * 0.72);
  }
}

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeBoatCode(value = "") {
  return normalizeText(value).replace(/^k(?=\d)/, "");
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
      hourCycle: "h23",
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

function porCodigo(a, b) {
  return String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true });
}

function contar(rows) {
  const r = { total: rows.length, completos: 0, parciales: 0, rehacer: 0 };
  for (const row of rows) {
    if (row.estado === "Completo") r.completos += 1;
    else if (row.estado === "Parcial") r.parciales += 1;
    else if (row.estado === "Rehacer") r.rehacer += 1;
  }
  return r;
}

function estadoObra(r) {
  if (!r || !r.total) return { key: "vacia", label: "Sin checklist", tono: "neutro" };
  if (r.completos === r.total) return { key: "completa", label: "Completa", tono: "verde" };
  if (r.completos + r.parciales + r.rehacer > 0) return { key: "curso", label: "En curso", tono: "azul" };
  return { key: "sin", label: "Sin recibir", tono: "neutro" };
}

const MUEBLE_VACIO = { nombre: "", sector: "", descripcion: "", medidas: "", material: "" };

// ─── Miniaturas ──────────────────────────────────────────────────────
const thumbCache = {};
function useThumbnail(muebleId, scopeType, scopeId) {
  const cacheKey = `${muebleId ?? "x"}::${buildImageScopeTag(scopeType, scopeId)}`;
  const [leida, setLeida] = useState(null);
  useEffect(() => {
    if (!muebleId || thumbCache[cacheKey] !== undefined) return;
    thumbCache[cacheKey] = null; // marca "pidiendo"
    supabase
      .from("prod_mueble_imagenes")
      .select("url,created_at")
      .eq("mueble_id", muebleId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const scoped = (data ?? []).filter(row => imageBelongsToScope(row.url, scopeType, scopeId));
        const u = scoped[0]?.url ?? null;
        thumbCache[cacheKey] = u;
        setLeida({ cacheKey, url: u });
      });
  }, [cacheKey, muebleId, scopeId, scopeType]);
  return leida?.cacheKey === cacheKey ? leida.url : (thumbCache[cacheKey] ?? null);
}

function MiniThumb({ muebleId, scopeType, scopeId, onClick, etiqueta }) {
  const url = useThumbnail(muebleId, scopeType, scopeId);
  const contenido = url ? <img src={url} alt="" loading="lazy" /> : <Armchair size={18} strokeWidth={1.6} />;
  if (!onClick) return <span className="mbl-thumb">{contenido}</span>;
  return <button type="button" className="mbl-thumb" onClick={onClick} aria-label={etiqueta}>{contenido}</button>;
}

// ─── Visor de imágenes ───────────────────────────────────────────────
function Lightbox({ images, index, onClose, setIndex }) {
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  setIndex(i => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex(i => (i + 1) % images.length);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [images.length, onClose, setIndex]);
  const img = images[index];
  if (!img) return null;
  const boton = { position: "absolute", background: "rgba(20,22,28,.8)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", borderRadius: "50%", display: "grid", placeItems: "center" };
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 3000, background: "rgba(0,0,0,0.94)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" aria-label="Cerrar" onClick={onClose} style={{ ...boton, top: 18, right: 18, width: 38, height: 38 }}><X size={18} /></button>
      <div style={{ position: "absolute", top: 26, left: "50%", transform: "translateX(-50%)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(255,255,255,.7)" }}>{index + 1} / {images.length}</div>
      {images.length > 1 && <button type="button" aria-label="Anterior" onClick={e => { e.stopPropagation(); setIndex(i => (i - 1 + images.length) % images.length); }} style={{ ...boton, left: 18, width: 44, height: 44, fontSize: 22 }}>‹</button>}
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={img.url} loading="lazy" alt={img.nombre} style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 10 }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>{img.nombre}</div>
      </div>
      {images.length > 1 && <button type="button" aria-label="Siguiente" onClick={e => { e.stopPropagation(); setIndex(i => (i + 1) % images.length); }} style={{ ...boton, right: 18, width: 44, height: 44, fontSize: 22 }}>›</button>}
    </div>
  );
}

// ─── Galería de un mueble ────────────────────────────────────────────
function GaleriaMueble({ muebleId, scopeType = "catalogo", scopeId = null, esAdmin }) {
  const confirmar = useConfirm();
  const [images,    setImages]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [setupErr,  setSetupErr]  = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState([]);
  const [lightbox,  setLightbox]  = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const [intento,   setIntento]   = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from("prod_mueble_imagenes")
      .select("id,url,nombre,created_at")
      .eq("mueble_id", muebleId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setSetupErr({ tipo: "tabla", msg: error.message });
        } else {
          setImages((data ?? []).filter(img => imageBelongsToScope(img.url, scopeType, scopeId)));
        }
        setLoading(false);
      });
    return () => { activo = false; };
  }, [muebleId, scopeType, scopeId, intento]);

  function reintentar() {
    setSetupErr(null);
    setLoading(true);
    setIntento(n => n + 1);
  }

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
    const ok = await confirmar({ title: "¿Eliminar la imagen?", message: `Se borra “${img.nombre}” de la galería.`, confirmLabel: "Eliminar", tone: "danger" });
    if (!ok) return;
    const parts = img.url.split(`/${BUCKET}/`);
    if (parts[1]) await supabase.storage.from(BUCKET).remove([parts[1]]);
    await supabase.from("prod_mueble_imagenes").delete().eq("id", img.id);
    setImages(p => p.filter(x => x.id !== img.id));
  }

  function onDrop(e) { e.preventDefault(); setDragging(false); subirArchivos(e.dataTransfer.files); }

  const SQL_TABLA = `create table prod_mueble_imagenes (
  id uuid primary key default gen_random_uuid(),
  mueble_id uuid references prod_muebles(id) on delete cascade,
  url text not null,
  nombre text,
  created_at timestamptz default now()
);`;

  if (setupErr) return (
    <div style={{ display: "grid", gap: 10 }}>
      <Aviso>
        {setupErr.tipo === "bucket"
          ? <>Falta crear el depósito de imágenes <b className="mono">{BUCKET}</b> (público) en Supabase → Storage.</>
          : <>Falta crear la tabla de imágenes. En Supabase → SQL Editor ejecutá el SQL de abajo.</>}
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--dim)" }}>Error: {setupErr.msg}</div>
      </Aviso>
      {setupErr.tipo === "tabla" && (
        <pre className="mono" style={{ margin: 0, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 11.5, color: "var(--muted)", overflowX: "auto", lineHeight: 1.7 }}>{SQL_TABLA}</pre>
      )}
      <div><button type="button" className="ui-btn chico" onClick={reintentar}>Reintentar</button></div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span className="mbl-dato-et" style={{ margin: 0 }}>Imágenes {images.length > 0 && <span className="mono">· {images.length}</span>}</span>
        {esAdmin && (
          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImagePlus size={14} /> {uploading ? "Subiendo…" : "Agregar"}
          </button>
        )}
        <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => subirArchivos(e.target.files)} />
      </div>

      {progress.length > 0 && (
        <div style={{ display: "grid", gap: 6, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel)" }}>
          {progress.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
              <div className="mbl-mini"><i className={p.done && !p.error ? "lleno" : ""} style={{ width: p.done ? "100%" : "55%", background: p.error ? "var(--red)" : undefined }} /></div>
              <span style={{ fontSize: 11.5, color: p.error ? "var(--red)" : p.done ? "var(--green)" : "var(--dim)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.error ? p.error : p.done ? "Listo" : p.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Cargando compacto />
      ) : images.length === 0 ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => esAdmin && fileRef.current?.click()}
          style={{ border: `1.5px dashed ${dragging ? "var(--blue)" : "var(--border-2)"}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", cursor: esAdmin ? "pointer" : "default", background: dragging ? "var(--blue-soft)" : "transparent", transition: "background-color .2s, border-color .2s" }}
        >
          <ImagePlus size={20} style={{ color: "var(--subtle)" }} />
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Sin imágenes</div>
          {esAdmin && <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>Tocá o arrastrá fotos para subirlas</div>}
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="mbl-galeria"
          style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}
        >
          {dragging && <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 5, background: "var(--blue-soft)", border: "1.5px dashed var(--blue)", borderRadius: 10, display: "grid", placeItems: "center", pointerEvents: "none", color: "var(--blue)", fontSize: 12, fontWeight: 600 }}>Soltá para subir</div>}
          {images.map((img, i) => (
            <div key={img.id} onClick={() => setLightbox(i)} className="mbl-galeria-foto" style={{ position: "relative", borderRadius: 9, overflow: "hidden", cursor: "pointer", aspectRatio: "4/3", background: "var(--panel)", border: "1px solid var(--border)" }}>
              <img src={img.url} alt={img.nombre} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {esAdmin && (
                <button type="button" className="mbl-galeria-borrar" onClick={e => eliminar(img, e)} aria-label={`Eliminar ${img.nombre}`} style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: "50%", display: "grid", placeItems: "center" }}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {lightbox !== null && <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} setIndex={setLightbox} />}
    </div>
  );
}

// ─── Ficha de un mueble (datos + galería) ────────────────────────────
function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {
  const confirmar = useConfirm();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ nombre: mueble.nombre ?? "", sector: mueble.sector ?? "", descripcion: mueble.descripcion ?? "", medidas: mueble.medidas ?? "", material: mueble.material ?? "" });

  async function borrar() {
    const ok = await confirmar({ title: "¿Borrar este mueble del catálogo?", message: `“${form.nombre}” deja de existir en el catálogo y en los checklist que lo usan.`, confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
    onDelete(mueble.id);
    onClose();
  }

  return (
    <Modal
      onCerrar={onClose}
      icono={Armchair}
      tono="teal"
      titulo={edit ? "Editar ficha" : form.nombre}
      sub={edit ? form.nombre : form.sector || "Mueble del catálogo"}
      pie={esAdmin ? (edit ? (
        <>
          <button type="button" className="ui-btn" onClick={() => setEdit(false)}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={!form.nombre.trim()} onClick={() => { onSave(mueble.id, form); setEdit(false); }}>Guardar cambios</button>
        </>
      ) : (
        <>
          <button type="button" className="ui-btn ui-btn-peligro" onClick={borrar}><Trash2 size={14} /> Eliminar del catálogo</button>
          <button type="button" className="ui-btn" onClick={() => setEdit(true)}><Pencil size={14} /> Editar ficha</button>
        </>
      )) : null}
    >
      {!edit ? (
        <>
          {(form.descripcion || form.material || form.medidas) ? (
            <div className="mbl-form">
              {form.descripcion && <div className="ancho"><div className="mbl-dato-et">Descripción</div><div className="mbl-dato-v">{form.descripcion}</div></div>}
              {form.material && <div><div className="mbl-dato-et">Material</div><div className="mbl-dato-v">{form.material}</div></div>}
              {form.medidas && <div><div className="mbl-dato-et">Medidas</div><div className="mbl-dato-v mono">{form.medidas}</div></div>}
            </div>
          ) : null}
          <GaleriaMueble muebleId={mueble.id} scopeType={mueble.imageScopeType} scopeId={mueble.imageScopeId} esAdmin={esAdmin} />
        </>
      ) : (
        <div className="mbl-form">
          {[["Nombre", "nombre"], ["Sector", "sector"], ["Medidas", "medidas"], ["Material", "material"]].map(([label, key]) => (
            <label key={key} className="mbl-campo"><span>{label}</span>
              <input className="ui-input" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </label>
          ))}
          <label className="mbl-campo ancho"><span>Descripción</span>
            <textarea className="ui-input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </label>
        </div>
      )}
    </Modal>
  );
}

// ─── Plantilla de muebles de una línea ───────────────────────────────
function CatalogoLinea({ lineaId, lineaNombre, lineas, esAdmin, onOpenMueble, onEliminarLinea, onVolverMovil }) {
  const confirmar = useConfirm();
  const toast = useToast();
  const [muebles,       setMuebles]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [q,             setQ]             = useState("");
  const [showAdd,       setShowAdd]       = useState(false);
  const [newM,          setNewM]          = useState(MUEBLE_VACIO);
  const [editId,        setEditId]        = useState(null);
  const [editForm,      setEditForm]      = useState({});
  const [copiarMode,    setCopiarMode]    = useState(false);
  const [copiarLineaId, setCopiarLineaId] = useState("");
  const [recarga,       setRecarga]       = useState(0);

  useEffect(() => {
    let activo = true;
    supabase
      .from("prod_linea_muebles")
      .select("mueble_id, nro_pieza, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .eq("linea_id", lineaId)
      .order("nro_pieza")
      .then(({ data }) => {
        if (!activo) return;
        // El número viaja pegado al mueble para que el catálogo muestre el
        // mismo que el checklist y que el PDF.
        setMuebles((data ?? [])
          .filter(r => r.prod_muebles)
          .map(r => ({ ...r.prod_muebles, nro_pieza: r.nro_pieza })));
        setLoading(false);
      });
    return () => { activo = false; };
  }, [lineaId, recarga]);

  const recargar = () => setRecarga(n => n + 1);
  const otrasLineas = lineas.filter(l => l.id !== lineaId);

  async function copiarPlantilla() {
    if (!copiarLineaId) return;
    const { data } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", copiarLineaId);
    if (!data?.length) { toast.warning("Esa línea no tiene muebles en su plantilla."); return; }
    const idsExistentes = new Set(muebles.map(m => m.id));
    const nuevos = data.filter(r => !idsExistentes.has(r.mueble_id));
    if (!nuevos.length) { toast.info("Todos esos muebles ya están en esta línea."); return; }
    const { error } = await supabase.from("prod_linea_muebles").insert(nuevos.map(r => ({ linea_id: lineaId, mueble_id: r.mueble_id })));
    if (error) { toast.error(error.message); return; }
    toast.success(`${nuevos.length} ${nuevos.length === 1 ? "mueble copiado" : "muebles copiados"} a la plantilla.`);
    setCopiarMode(false); setCopiarLineaId("");
    recargar();
  }

  async function agregar() {
    if (!newM.nombre.trim()) return;
    const { data: m, error } = await supabase.from("prod_muebles").insert({
      nombre: newM.nombre.trim(), sector: newM.sector.trim(),
      descripcion: newM.descripcion.trim() || null,
      medidas: newM.medidas.trim() || null,
      material: newM.material.trim() || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    setNewM(MUEBLE_VACIO);
    setShowAdd(false);
    recargar();
  }

  async function guardarEdit(id) {
    const { error } = await supabase.from("prod_muebles").update({ nombre: editForm.nombre, sector: editForm.sector, descripcion: editForm.descripcion, medidas: editForm.medidas, material: editForm.material }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditId(null);
    recargar();
  }

  async function eliminar(m) {
    const ok = await confirmar({ title: "¿Quitar este mueble de la línea?", message: `“${m.nombre}” se quita de la plantilla ${lineaNombre}. Las obras que ya lo tienen en su checklist lo conservan.`, confirmLabel: "Quitar", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("prod_linea_muebles").delete().eq("linea_id", lineaId).eq("mueble_id", m.id);
    if (error) { toast.error(error.message); return; }
    setMuebles(p => p.filter(x => x.id !== m.id));
  }

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

  return (
    <div className="mbl-rec">
      <button type="button" className="mbl-volver-movil" onClick={onVolverMovil}><ChevronLeft size={18} /> Obras</button>

      <div className="mbl-cab">
        <div className="mbl-cab-sw" data-tono="teal" style={{ color: "var(--teal)", background: "var(--teal-soft)", borderColor: "var(--teal-border)" }}><LayoutTemplate size={24} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="mbl-cab-tags"><Tag tono="teal">Plantilla base</Tag></div>
          <h2 className="mbl-cab-tit">Muebles de la línea {lineaNombre}</h2>
          <div className="mbl-cab-sub">{loading ? "Leyendo…" : `${muebles.length} muebles`} · se copian a cada obra nueva de la línea.</div>
        </div>
        {esAdmin && (
          <div className="mbl-cab-acc">
            <button type="button" className="ui-btn chico" onClick={() => { setCopiarMode(v => !v); setShowAdd(false); }}>
              <Copy size={14} /> {copiarMode ? "Cancelar" : "Copiar de otra línea"}
            </button>
            <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => { setShowAdd(v => !v); setCopiarMode(false); }}>
              {showAdd ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Nuevo mueble</>}
            </button>
            <button type="button" className="mbl-btn-ic peligro" onClick={onEliminarLinea} aria-label={`Eliminar la línea ${lineaNombre}`} title="Eliminar línea"><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      {copiarMode && esAdmin && (
        <div className="mbl-agregar">
          <div>
            <div className="mbl-fila-tit">Importar la plantilla de otra línea</div>
            <div className="mbl-fila-txt">Los muebles que ya estén en {lineaNombre} no se duplican.</div>
          </div>
          <div className="mbl-alta">
            <select className="ui-input" value={copiarLineaId} onChange={e => setCopiarLineaId(e.target.value)} aria-label="Línea de origen">
              <option value="">Elegir línea</option>
              {otrasLineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <button type="button" className="ui-btn ui-btn-primario" onClick={copiarPlantilla} disabled={!copiarLineaId}>Importar</button>
          </div>
        </div>
      )}

      {showAdd && esAdmin && (
        <div className="mbl-agregar">
          <div className="mbl-fila-tit">Nuevo mueble en la plantilla</div>
          <div className="mbl-form">
            <label className="mbl-campo"><span>Nombre *</span><input className="ui-input" placeholder="Ej: Mesa de comedor" value={newM.nombre} onChange={e => setNewM(f => ({...f, nombre: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} autoFocus /></label>
            <label className="mbl-campo"><span>Sector</span><input className="ui-input" placeholder="Ej: Comedor" value={newM.sector} onChange={e => setNewM(f => ({...f, sector: e.target.value}))} onKeyDown={e => e.key === "Enter" && agregar()} /></label>
            <label className="mbl-campo ancho"><span>Descripción</span><input className="ui-input" placeholder="Descripción breve" value={newM.descripcion} onChange={e => setNewM(f => ({...f, descripcion: e.target.value}))} /></label>
            <label className="mbl-campo"><span>Medidas</span><input className="ui-input" placeholder="Ej: 120x80x75 cm" value={newM.medidas} onChange={e => setNewM(f => ({...f, medidas: e.target.value}))} /></label>
            <label className="mbl-campo"><span>Material</span><input className="ui-input" placeholder="Ej: MDF enchapado" value={newM.material} onChange={e => setNewM(f => ({...f, material: e.target.value}))} /></label>
          </div>
          <div><button type="button" className="ui-btn ui-btn-primario" onClick={agregar} disabled={!newM.nombre.trim()}><Plus size={15} /> Agregar a la plantilla</button></div>
        </div>
      )}

      {muebles.length > 4 && (
        <label className="mbl-buscar" style={{ flex: "none", maxWidth: 360 }}>
          <Search size={15} />
          <input className="ui-input" placeholder="Buscar mueble o sector…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar en la plantilla" />
        </label>
      )}

      {loading ? (
        <Cargando />
      ) : muebles.length === 0 ? (
        <Vacio icono={LayoutTemplate} titulo="La plantilla está vacía" texto={esAdmin ? "Agregá muebles o copialos de otra línea: después se copian a cada obra nueva." : "Todavía no se cargaron muebles para esta línea."} />
      ) : Object.keys(porSector).length === 0 ? (
        <Vacio icono={Search} titulo="Sin resultados" texto={`Ningún mueble coincide con “${q}”.`} />
      ) : (
        Object.entries(porSector).map(([sector, rows]) => (
          <div key={sector} className="mbl-sector">
            <div className="mbl-sector-cab"><span className="nom">{sector}</span><span className="n">{rows.length}</span></div>
            {rows.map(m => (
              editId === m.id ? (
                <div key={m.id} className="mbl-agregar" style={{ margin: "8px 0" }}>
                  <div className="mbl-form">
                    <label className="mbl-campo"><span>Nombre</span><input className="ui-input" value={editForm.nombre} onChange={e => setEditForm(f => ({...f, nombre: e.target.value}))} autoFocus /></label>
                    <label className="mbl-campo"><span>Sector</span><input className="ui-input" value={editForm.sector} onChange={e => setEditForm(f => ({...f, sector: e.target.value}))} /></label>
                    <label className="mbl-campo ancho"><span>Descripción</span><input className="ui-input" value={editForm.descripcion} onChange={e => setEditForm(f => ({...f, descripcion: e.target.value}))} /></label>
                    <label className="mbl-campo"><span>Medidas</span><input className="ui-input" value={editForm.medidas} onChange={e => setEditForm(f => ({...f, medidas: e.target.value}))} /></label>
                    <label className="mbl-campo"><span>Material</span><input className="ui-input" value={editForm.material} onChange={e => setEditForm(f => ({...f, material: e.target.value}))} /></label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="ui-btn ui-btn-primario" onClick={() => guardarEdit(m.id)}>Guardar</button>
                    <button type="button" className="ui-btn" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="mbl-pieza" style={{ gridTemplateColumns: esAdmin ? "30px 46px minmax(0,1fr) auto" : "30px 46px minmax(0,1fr)" }}>
                  <span className="mbl-pieza-nro">{m.nro_pieza ?? "—"}</span>
                  <MiniThumb muebleId={m.id} scopeType="linea" scopeId={lineaId} onClick={() => onOpenMueble({ ...m, imageScopeType: "linea", imageScopeId: lineaId })} etiqueta={`Ver ficha de ${m.nombre}`} />
                  <div style={{ minWidth: 0 }}>
                    <button type="button" className="mbl-pieza-nom" onClick={() => onOpenMueble({ ...m, imageScopeType: "linea", imageScopeId: lineaId })}>{m.nombre}</button>
                    {(m.descripcion || m.medidas) && (
                      <div className="mbl-pieza-meta">
                        {m.descripcion && <span>{m.descripcion}</span>}
                        {m.medidas && <span className="mono">{m.medidas}</span>}
                      </div>
                    )}
                  </div>
                  {esAdmin && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="mbl-btn-ic" aria-label={`Editar ${m.nombre}`} onClick={() => { setEditId(m.id); setEditForm({ nombre: m.nombre ?? "", sector: m.sector ?? "", descripcion: m.descripcion ?? "", medidas: m.medidas ?? "", material: m.material ?? "" }); }}><Pencil size={14} /></button>
                      <button type="button" className="mbl-btn-ic peligro" aria-label={`Quitar ${m.nombre} de la línea`} onClick={() => eliminar(m)}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Nota de una pieza, editable en el lugar ─────────────────────────
function NotaPieza({ value, onSave, disabled }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(value ?? "");
  function abrir() { setVal(value ?? ""); setEdit(true); }
  function commit() { setEdit(false); if (val !== (value ?? "")) onSave(val); }
  if (edit) {
    return (
      <input
        autoFocus
        className="mbl-nota-input"
        value={val}
        placeholder="Nota para esta pieza…"
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value ?? ""); setEdit(false); } }}
      />
    );
  }
  if (disabled) return value ? <span className="mbl-nota con" style={{ cursor: "default" }}>{value}</span> : null;
  return <button type="button" className={`mbl-nota${value ? " con" : ""}`} onClick={abrir}>{value || "+ nota"}</button>;
}

// ─── Recepción ───────────────────────────────────────────────────────
export default function RecepcionTab({ profile, esAdmin, destino, onIrSeguimiento }) {
  const confirmar = useConfirm();
  const toast = useToast();

  const [lineas,    setLineas]    = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [resumen,   setResumen]   = useState(new Map());
  const [llegando,  setLlegando]  = useState(new Set());
  const [cargandoRiel, setCargandoRiel] = useState(true);
  const [unidadId,  setUnidadId]  = useState(destino?.unidadId ?? null);
  const [plantillaId, setPlantillaId] = useState(null);
  const [detalleMovil, setDetalleMovil] = useState(Boolean(destino?.unidadId));
  const [qRiel,     setQRiel]     = useState("");
  const [filtroRiel, setFiltroRiel] = useState("todas");
  const [altaObraLinea, setAltaObraLinea] = useState(null);
  const [newUnidad, setNewUnidad] = useState("");
  const [newLinea,  setNewLinea]  = useState("");

  const [checklist, setChecklist] = useState({ unidadId: null, rows: [] });
  const [err,       setErr]       = useState("");
  const [chapaOt,   setChapaOt]   = useState(null);
  const [showManualChapa, setShowManualChapa] = useState(false);
  const [manualChapaDraft, setManualChapaDraft] = useState("");
  const [manualChapaSaving, setManualChapaSaving] = useState(false);
  const [q,         setQ]         = useState("");
  const [filtro,    setFiltro]    = useState("todos");
  const [modalMueble, setModalMueble] = useState(null);
  const [selMode,     setSelMode]     = useState(false);
  const [selIds,      setSelIds]      = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemQ,    setAddItemQ]    = useState("");
  const [catalogo,    setCatalogo]    = useState({ lineaId: null, muebles: [], nros: new Map() });
  const [catalogoVersion, setCatalogoVersion] = useState(0);
  const [newItemForm, setNewItemForm] = useState(MUEBLE_VACIO);
  const pedidoChecklist = useRef(null);
  const rielRef = useRef(null);

  const unidadSel = useMemo(() => unidades.find(u => u.id === unidadId), [unidades, unidadId]);
  const lineaId = unidadSel?.linea_id ?? (unidadId ? destino?.lineaId : null) ?? null;
  const lineaSel = useMemo(() => lineas.find(l => l.id === lineaId), [lineas, lineaId]);
  const plantillaSel = useMemo(() => lineas.find(l => l.id === plantillaId), [lineas, plantillaId]);
  const filas = useMemo(() => (checklist.unidadId === unidadId ? checklist.rows : []), [checklist, unidadId]);
  const manualChapa = String(unidadSel?.chapa_manual ?? "").trim();
  const enchapadoOt = chapaOt && chapaOt.unidadId === unidadId ? chapaOt.ot : null;
  const enchapadoLoading = Boolean(unidadSel && lineaSel) && chapaOt?.unidadId !== unidadId;

  // ── Carga del riel: líneas, obras, avance de cada checklist ──
  async function cargarRiel({ elegirInicial = false } = {}) {
    const [lineasRes, unidadesRes, resumenRes, lotesRes] = await Promise.all([
      supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre"),
      supabase.from("prod_unidades").select("id,codigo,color,linea_id,chapa_manual").eq("activa", true).order("codigo"),
      supabase.from("prod_unidad_checklist").select("unidad_id,estado"),
      supabase.from("prod_muebles_lotes").select("unidad_id,proveedor,etapa,estado_proceso,recepcion_estado").not("unidad_id", "is", null),
    ]);
    let unidadesData = unidadesRes.data;
    if (unidadesRes.error && String(unidadesRes.error.message || "").includes("chapa_manual")) {
      const retry = await supabase.from("prod_unidades").select("id,codigo,color,linea_id").eq("activa", true).order("codigo");
      unidadesData = retry.data;
    }
    const porUnidad = new Map();
    for (const row of resumenRes.data ?? []) {
      const list = porUnidad.get(row.unidad_id) || [];
      list.push(row);
      porUnidad.set(row.unidad_id, list);
    }
    const nuevoResumen = new Map([...porUnidad].map(([id, rows]) => [id, contar(rows)]));
    const nuevosLlegando = new Set((lotesRes.data ?? [])
      .filter(l => etapaMeta(l).etapa.key === "recibido" && l.recepcion_estado !== "completa")
      .map(l => l.unidad_id));
    const listaUnidades = (unidadesData ?? []).slice().sort(porCodigo);

    setLineas(lineasRes.data ?? []);
    setUnidades(listaUnidades);
    setResumen(nuevoResumen);
    setLlegando(nuevosLlegando);
    setCargandoRiel(false);

    if (elegirInicial) {
      // Sin obra pedida, se abre la que está recibiendo muebles ahora.
      const candidata = listaUnidades.find(u => nuevosLlegando.has(u.id))
        ?? listaUnidades.find(u => estadoObra(nuevoResumen.get(u.id)).key === "curso");
      setUnidadId(prev => prev ?? candidata?.id ?? null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => cargarRiel({ elegirInicial: !destino?.unidadId }), 0);
    return () => window.clearTimeout(timer);
    // Sólo al abrir la pestaña: la obra pedida llega en `destino`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Checklist de la obra elegida ──
  useEffect(() => {
    if (!unidadId) return undefined;
    const uid = unidadId;
    pedidoChecklist.current = uid;
    const timer = window.setTimeout(async () => {
      const selectBase = "id,estado,obs,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";
      let { data, error } = await supabase
        .from("prod_unidad_checklist")
        .select(selectBase)
        .eq("unidad_id", uid)
        .order("prod_muebles(sector)")
        .order("prod_muebles(nombre)");
      if (error && String(error.message || "").includes("recibido_")) {
        const retry = await supabase
          .from("prod_unidad_checklist")
          .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
          .eq("unidad_id", uid)
          .order("prod_muebles(sector)")
          .order("prod_muebles(nombre)");
        data = retry.data;
        error = retry.error;
      }
      // Si mientras tanto se eligió otra obra, esta respuesta ya no sirve.
      if (pedidoChecklist.current !== uid) return;
      if (error) setErr(error.message);
      setChecklist({ unidadId: uid, rows: data ?? [] });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [unidadId]);

  // ── Catálogo de la línea: números de pieza y muebles para agregar ──
  useEffect(() => {
    if (!lineaId) return undefined;
    let activo = true;
    supabase
      .from("prod_linea_muebles")
      .select("mueble_id, nro_pieza, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .eq("linea_id", lineaId)
      .order("prod_muebles(sector)")
      .order("prod_muebles(nombre)")
      .then(({ data }) => {
        if (!activo) return;
        // La numeración es de la línea, no de la obra: la misma pieza lleva el
        // mismo número en todos los barcos del modelo.
        setCatalogo({
          lineaId,
          muebles: (data ?? []).map(r => r.prod_muebles).filter(Boolean),
          nros: new Map((data ?? []).map(r => [r.mueble_id, r.nro_pieza])),
        });
      });
    return () => { activo = false; };
  }, [lineaId, catalogoVersion]);
  const catalogoLinea = catalogo.lineaId === lineaId ? catalogo.muebles : [];
  const nroPorMueble = catalogo.lineaId === lineaId ? catalogo.nros : new Map();

  // ── OT de enchapado de la obra (para mostrar la chapa) ──
  useEffect(() => {
    if (!lineaSel?.nombre || !unidadSel?.codigo) return undefined;
    let activo = true;
    const uid = unidadSel.id;
    const modelo = lineaSel.nombre.trim();
    const barco = unidadSel.codigo.trim();
    const barcoLookup = normalizeBoatCode(barco);
    supabase
      .from("enchapado_ots")
      .select("id,modelo,barco,tipo_chapa,estado,fecha")
      .ilike("modelo", `%${modelo}%`)
      .ilike("barco", `%${barcoLookup}%`)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!activo) return;
        const found = error ? null : (data ?? []).find(row =>
          normalizeText(row.modelo) === normalizeText(modelo) &&
          normalizeBoatCode(row.barco) === normalizeBoatCode(barco)
        ) ?? null;
        setChapaOt({ unidadId: uid, ot: found });
      });
    return () => { activo = false; };
  }, [lineaSel?.nombre, unidadSel?.id, unidadSel?.codigo]);

  // Al abrir una obra desde otra área, el riel la deja a la vista.
  useEffect(() => {
    if (cargandoRiel || !unidadId) return;
    const cuerpo = rielRef.current;
    const boton = cuerpo?.querySelector(".mbl-obra.on");
    if (!cuerpo || !boton) return;
    const arriba = boton.offsetTop - cuerpo.offsetTop;
    if (arriba < cuerpo.scrollTop || arriba > cuerpo.scrollTop + cuerpo.clientHeight - 60) {
      cuerpo.scrollTop = arriba - cuerpo.clientHeight / 3;
    }
    // Sólo cuando termina de cargar el riel: después lo mueve la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoRiel]);

  // ── Elegir qué se ve ──
  function elegirObra(id) {
    guardarResumenActual();
    setUnidadId(id);
    setPlantillaId(null);
    setDetalleMovil(true);
    setFiltro("todos");
    setQ("");
    setSelMode(false);
    setSelIds(new Set());
    setShowAddItem(false);
    setAddItemQ("");
    setShowManualChapa(false);
    setErr("");
  }

  function elegirPlantilla(id) {
    guardarResumenActual();
    setPlantillaId(id);
    setUnidadId(null);
    setDetalleMovil(true);
    setErr("");
  }

  // ── Estado de las piezas ──
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

  function actualizarFilas(transformar) {
    setChecklist(prev => (prev.unidadId !== unidadId ? prev : { ...prev, rows: transformar(prev.rows) }));
  }

  // El riel usa el checklist abierto en vivo; al salir de una obra se guarda su
  // avance para que el número del riel no quede viejo.
  function guardarResumenActual() {
    if (unidadId && checklist.unidadId === unidadId) {
      const actual = contar(checklist.rows);
      setResumen(r => new Map(r).set(unidadId, actual));
    }
  }

  async function setEstado(rowId, estado) {
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    if (error) { toast.error(`No se pudo cambiar el estado: ${error.message}`); return; }
    const trace = await tryUpdateTrace([rowId], estado);
    actualizarFilas(rows => rows.map(r => r.id === rowId ? { ...r, estado, ...trace } : r));
  }

  async function bulkSetEstado(estado) {
    if (!selIds.size) return;
    setBulkLoading(true);
    const ids = [...selIds];
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).in("id", ids);
    if (error) {
      toast.error(`No se pudo actualizar la selección: ${error.message}`);
      setBulkLoading(false);
      return;
    }
    const trace = await tryUpdateTrace(ids, estado);
    const marcadas = new Set(ids);
    actualizarFilas(rows => rows.map(r => marcadas.has(r.id) ? { ...r, estado, ...trace } : r));
    toast.success(`${ids.length} ${ids.length === 1 ? "pieza marcada" : "piezas marcadas"} como ${ESTADO_UI[estado].label.toLowerCase()}.`);
    setSelIds(new Set());
    setSelMode(false);
    setBulkLoading(false);
  }

  async function setObs(rowId, obs) {
    const { error } = await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
    if (error) { toast.error(`No se guardó la nota: ${error.message}`); return; }
    actualizarFilas(rows => rows.map(r => r.id === rowId ? { ...r, obs } : r));
  }

  async function eliminarItem(row) {
    const ok = await confirmar({ title: "¿Quitar esta pieza del checklist?", message: `“${row.prod_muebles?.nombre ?? "La pieza"}” deja de controlarse en ${unidadSel?.codigo ?? "esta obra"}. El mueble sigue en el catálogo.`, confirmLabel: "Quitar", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("prod_unidad_checklist").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    actualizarFilas(rows => rows.filter(r => r.id !== row.id));
  }

  async function agregarItemAlChecklist(mueble) {
    if (!unidadId) return;
    const ya = filas.find(r => r.mueble_id === mueble.id);
    if (ya) return;
    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .insert({ unidad_id: unidadId, mueble_id: mueble.id, estado: "No enviado" })
      .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")
      .single();
    if (error) { setErr(error.message); return; }
    // Sin ordenar acá: el orden lo da el número de pieza en `ordenado`.
    actualizarFilas(rows => [...rows, data]);
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
    // También queda en el catálogo de la línea.
    await supabase.from("prod_linea_muebles").insert({ linea_id: lineaId, mueble_id: m.id });
    await agregarItemAlChecklist(m);
    setNewItemForm(MUEBLE_VACIO);
    setShowAddItem(false);
    setCatalogoVersion(n => n + 1);
  }

  async function editarMueble(mid, form) {
    const { error } = await supabase.from("prod_muebles").update(form).eq("id", mid);
    if (error) { toast.error(error.message); return; }
    actualizarFilas(rows => rows.map(r => r.mueble_id === mid ? { ...r, prod_muebles: { ...r.prod_muebles, ...form } } : r));
    setModalMueble(null);
  }

  async function eliminarMuebleCatalogo(mid) {
    const { error } = await supabase.from("prod_muebles").delete().eq("id", mid);
    if (error) { toast.error(error.message); return; }
    actualizarFilas(rows => rows.filter(r => r.mueble_id !== mid));
    setModalMueble(null);
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

  // ── Líneas y obras ──
  async function crearLinea() {
    if (!newLinea.trim()) return;
    const { error } = await supabase.from("prod_lineas").insert({ nombre: newLinea.trim(), activa: true });
    if (error) { toast.error(error.message); return; }
    setNewLinea("");
    cargarRiel();
  }

  async function eliminarLinea(linea) {
    const ok = await confirmar({ title: `¿Eliminar la línea ${linea.nombre}?`, message: "Se borra la línea con su plantilla de muebles. Revisá antes que no tenga obras activas.", confirmLabel: "Eliminar línea", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("prod_lineas").delete().eq("id", linea.id);
    if (error) { toast.error(error.message); return; }
    setPlantillaId(null);
    setDetalleMovil(false);
    cargarRiel();
  }

  async function crearUnidad(lid) {
    if (!newUnidad.trim() || !lid) return;
    const { data: u, error } = await supabase.from("prod_unidades").insert({ linea_id: lid, codigo: newUnidad.trim(), activa: true }).select().single();
    if (error) { toast.error(error.message); return; }
    const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lid);
    if (plantilla?.length) await supabase.from("prod_unidad_checklist").insert(plantilla.map(p => ({ unidad_id: u.id, mueble_id: p.mueble_id, estado: "No enviado" })));
    setNewUnidad("");
    setAltaObraLinea(null);
    await cargarRiel();
    elegirObra(u.id);
  }

  async function eliminarUnidad() {
    if (!unidadSel) return;
    const ok = await confirmar({ title: `¿Eliminar la obra ${unidadSel.codigo}?`, message: "Se borra la obra de Muebles con su checklist de recepción.", confirmLabel: "Eliminar obra", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("prod_unidades").delete().eq("id", unidadSel.id);
    if (error) { toast.error(error.message); return; }
    setUnidadId(null);
    setDetalleMovil(false);
    setChecklist({ unidadId: null, rows: [] });
    cargarRiel();
  }

  // ── Derivados del checklist ──
  // El número de pieza es el que está guardado en la línea, no la posición en
  // la lista: es con lo que el taller identifica cada mueble, así que agregar
  // una pieza nueva no puede correr a las demás. Es el mismo número que sale
  // impreso.
  const nroPieza = (r) => nroPorMueble.get(r.mueble_id) ?? null;
  // Ordenar por número y no por (sector, nombre) mantiene los números en orden
  // dentro de cada sector cuando se agregan piezas nuevas.
  const ordenado = [...filas].sort(
    (a, b) => (nroPieza(a) ?? Number.MAX_SAFE_INTEGER) - (nroPieza(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const stats = contar(filas);
  const pendientes = stats.total - stats.completos - stats.parciales - stats.rehacer;
  const pct = stats.total ? Math.round((stats.completos / stats.total) * 100) : 0;
  const cuentaEstado = { "No enviado": pendientes, Parcial: stats.parciales, Completo: stats.completos, Rehacer: stats.rehacer };
  const filtrado = ordenado.filter(r => {
    if (filtro !== "todos" && r.estado !== filtro) return false;
    const qq = q.toLowerCase();
    return !qq || (r.prod_muebles?.nombre ?? "").toLowerCase().includes(qq) || (r.prod_muebles?.sector ?? "").toLowerCase().includes(qq);
  });
  const porSector = {};
  filtrado.forEach(r => { const s = r.prod_muebles?.sector || "General"; if (!porSector[s]) porSector[s] = []; porSector[s].push(r); });

  async function descargarChecklistPdf() {
    if (!unidadSel || !lineaSel) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 36;
    const navy = [15, 23, 42];
    const fecha = new Date().toLocaleDateString("es-AR");
    const chapaManualPdf = String(unidadSel.chapa_manual ?? "").trim();
    const chapaPdf = enchapadoOt
      ? { tipo: enchapadoOt.tipo_chapa || "Sin especificar", detalle: `OT ${enchapadoOt.estado || "Pendiente"}` }
      : chapaManualPdf
        ? { tipo: chapaManualPdf, detalle: "Dato manual - muebles sin OT" }
        : null;

    // El PDF sale con el estado real de cada pieza, en el mismo orden que en
    // pantalla: el taller marca a mano sólo lo que cambie.
    const estados = ordenado.map(r => r.estado || "No enviado");
    const recibidos = estados.filter(e => e === "Completo").length;
    const filasPdf = ordenado.map((row) => [
      nroPieza(row) ?? "",
      row.prod_muebles?.sector ?? "General",
      row.prod_muebles?.nombre ?? "-",
      "",
      row.recibido_at ? new Date(row.recibido_at).toLocaleDateString("es-AR") : "",
      row.obs ?? "",
    ]);

    // Encabezado sin fondo: una barra sólida se come el cartucho y en una
    // impresora de taller sale gris sucio.
    try {
      const logoObj = await loadNavyLogo();
      if (logoObj) {
        const w = 28;
        doc.addImage(logoObj.dataUrl, "PNG", pageWidth - left - w, 26, w, logoObj.aspect * w);
      }
    } catch { /* sin logo igual sale */ }

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Recepcion de muebles", left, 42);
    doc.setFontSize(13);
    doc.text(`${lineaSel.nombre} - ${unidadSel.codigo}`, left, 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 118, 132);
    doc.text(`Impreso ${fecha}  ·  ${filas.length} piezas  ·  ${recibidos} ya recibidas`, left, 79);

    doc.setDrawColor(...navy);
    doc.setLineWidth(1.1);
    doc.line(left, 90, pageWidth - left, 90);

    let y = 118;
    if (chapaPdf) {
      const tone = chapaColor(chapaPdf.tipo);
      const [r, g, b] = hexToRgb(tone.base);
      doc.setFillColor(r, g, b);
      doc.roundedRect(left, y - 10, 18, 12, 2, 2, "F");
      doc.setDrawColor(145, 145, 150);
      doc.roundedRect(left, y - 10, 18, 12, 2, 2, "S");
      doc.setTextColor(63, 63, 70);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Chapa / referencia:", left + 26, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${chapaPdf.tipo} - ${chapaPdf.detalle}`, left + 113, y);
      y += 22;
    }

    doc.setDrawColor(180, 186, 196);
    doc.setLineWidth(0.6);
    doc.line(pageWidth - left - 200, y, pageWidth - left, y);
    doc.setTextColor(120, 126, 138);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Recibio / firma", pageWidth - left - 200, y + 11);

    // Referencia de los casilleros: sin esto, una cruz y un tilde se confunden.
    doc.setFillColor(248, 249, 251);
    doc.setDrawColor(225, 228, 235);
    doc.roundedRect(left, y + 20, pageWidth - left * 2, 30, 4, 4, "FD");
    const refs = [
      { estado: "Completo", label: "Recibido" },
      { estado: "Parcial", label: "Parcial" },
      { estado: "Rehacer", label: "Rehacer" },
      { estado: "No enviado", label: "Pendiente" },
    ];
    let rx = left + 14;
    refs.forEach(({ estado, label }) => {
      dibujarCasillero(doc, rx, y + 31, 9, estado);
      doc.setTextColor(90, 96, 108);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(label, rx + 14, y + 39);
      rx += 88;
    });
    doc.setTextColor(120, 126, 138);
    doc.setFontSize(7.5);
    doc.text("Marcar a mano solo lo que cambie y despues pasarlo al sistema.", rx + 6, y + 39);

    autoTable(doc, {
      startY: y + 64,
      margin: { left, right: left, bottom: 34 },
      head: [["#", "Sector", "Mueble", "Estado", "Fecha", "Observaciones"]],
      body: filasPdf,
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        lineColor: [214, 219, 226],
        lineWidth: 0.45,
        textColor: [24, 24, 27],
        minCellHeight: 26,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        lineColor: navy,
        lineWidth: 0.6,
      },
      columnStyles: {
        0: { cellWidth: 26, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 78 },
        2: { cellWidth: 204 },
        3: { cellWidth: 44, halign: "center" },
        4: { cellWidth: 58 },
        5: { cellWidth: "auto" },
      },
      // Lo recibido se ve distinto de un vistazo.
      didParseCell: data => {
        if (data.section !== "body") return;
        const estado = estados[data.row.index];
        if (estado === "Completo") {
          data.cell.styles.fillColor = [240, 250, 244];
          data.cell.styles.textColor = [110, 118, 128];
        } else if (estado === "Rehacer") {
          data.cell.styles.fillColor = [254, 243, 243];
        } else if (estado === "Parcial") {
          data.cell.styles.fillColor = [239, 246, 255];
        }
      },
      didDrawCell: data => {
        if (data.section !== "body" || data.column.index !== 3) return;
        const size = 10;
        const x = data.cell.x + data.cell.width / 2 - size / 2;
        const cy = data.cell.y + data.cell.height / 2 - size / 2;
        dibujarCasillero(doc, x, cy, size, estados[data.row.index]);
      },
      didDrawPage: data => {
        doc.setFontSize(8);
        doc.setTextColor(140, 146, 158);
        doc.setFont("helvetica", "normal");
        doc.text(`Pagina ${data.pageNumber}`, data.settings.margin.left, pageHeight - 18);
        doc.text(
          `Klase A  ·  ${lineaSel.nombre} ${unidadSel.codigo}`,
          pageWidth - left,
          pageHeight - 18,
          { align: "right" },
        );
      },
    });

    doc.save(`checklist_${lineaSel.nombre}_${unidadSel.codigo}.pdf`);
  }

  function imprimirFaltantes() {
    if (!unidadSel || !lineaSel) return;
    const faltantes = filas
      .filter(r => r.estado !== "Completo")
      .map(r => ({
        sector: r.prod_muebles?.sector ?? "General",
        nombre: r.prod_muebles?.nombre ?? "-",
        medidas: r.prod_muebles?.medidas ?? "",
        estado: r.estado,
        obs: r.obs ?? "",
      }));
    const chapa = enchapadoOt
      ? `${enchapadoOt.tipo_chapa || "Sin especificar"} (OT ${enchapadoOt.estado || "Pendiente"})`
      : manualChapa || "";
    printFaltantes({
      linea: lineaSel.nombre,
      unidad: unidadSel.codigo,
      chapa,
      faltantes,
      total: filas.length,
    }, logoKlasea);
  }

  // ── Riel: obras por línea ──
  const resumenDe = (id) => (id === unidadId && checklist.unidadId === unidadId ? contar(filas) : resumen.get(id));
  const qr = qRiel.trim().toLowerCase();
  const visibles = unidades.filter(u => {
    if (qr && !String(u.codigo).toLowerCase().includes(qr)) return false;
    if (filtroRiel === "todas") return true;
    return estadoObra(resumenDe(u.id)).key === filtroRiel;
  });
  const cuentaRiel = (key) => unidades.filter(u => estadoObra(resumenDe(u.id)).key === key).length;
  const nFaltantes = filas.filter(r => r.estado !== "Completo").length;

  const vistaObra = Boolean(unidadId);
  // Hasta que llega el checklist de la obra elegida no se muestran números:
  // un "0 %" de un instante parece un dato.
  const cargandoObra = vistaObra && checklist.unidadId !== unidadId;
  const vistaPlantilla = !vistaObra && Boolean(plantillaSel);
  const estadoSel = estadoObra(vistaObra ? contar(filas) : null);

  return (
    <div className={`mbl-dos rec${detalleMovil && (vistaObra || vistaPlantilla) ? " con-detalle" : ""}`}>
      {/* ── Riel de obras ── */}
      <aside className="mbl-riel" aria-label="Obras">
        <div className="mbl-riel-cab">
          <label className="mbl-buscar" style={{ flex: "none", minWidth: 0 }}>
            <Search size={15} />
            <input className="ui-input" value={qRiel} onChange={e => setQRiel(e.target.value)} placeholder="Buscar obra…" aria-label="Buscar obra" />
          </label>
          <div className="mbl-scroll-x">
            {[["todas", "Todas", unidades.length], ["curso", "En curso", cuentaRiel("curso")], ["sin", "Sin recibir", cuentaRiel("sin")], ["completa", "Completas", cuentaRiel("completa")]].map(([key, label, n]) => (
              <button key={key} type="button" className={`mbl-chip${filtroRiel === key ? " on" : ""}`} style={{ minHeight: 28, padding: "0 9px", fontSize: 12 }} onClick={() => setFiltroRiel(key)}>
                {label} <span className="n">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mbl-riel-cuerpo" ref={rielRef}>
          {cargandoRiel ? (
            <Cargando compacto texto="Leyendo obras…" />
          ) : lineas.length === 0 ? (
            <p className="mbl-bloque-txt" style={{ padding: 10 }}>Todavía no hay líneas cargadas.</p>
          ) : lineas.map(linea => {
            const obras = visibles.filter(u => u.linea_id === linea.id);
            const todas = unidades.filter(u => u.linea_id === linea.id).length;
            if (!obras.length && (qr || filtroRiel !== "todas")) return null;
            return (
              <div key={linea.id}>
                <div className="mbl-linea-cab">
                  <span className="nom">{linea.nombre}</span>
                  <span className="n">{todas}</span>
                  {esAdmin && (
                    <span className="der">
                      <button type="button" className="mbl-link tenue" onClick={() => { setAltaObraLinea(altaObraLinea === linea.id ? null : linea.id); setNewUnidad(""); }}>
                        {altaObraLinea === linea.id ? "Cancelar" : "+ Obra"}
                      </button>
                    </span>
                  )}
                </div>
                <button type="button" className={`mbl-obra plantilla${vistaPlantilla && plantillaId === linea.id ? " on" : ""}`} onClick={() => elegirPlantilla(linea.id)}>
                  <span className="mbl-obra-cod"><LayoutTemplate size={14} /> Plantilla de muebles</span>
                  <ArrowRight size={13} style={{ color: "var(--subtle)" }} />
                </button>
                {obras.map(u => {
                  const r = resumenDe(u.id);
                  const est = estadoObra(r);
                  const pctObra = r?.total ? Math.round((r.completos / r.total) * 100) : 0;
                  return (
                    <button key={u.id} type="button" className={`mbl-obra${unidadId === u.id ? " on" : ""}`} onClick={() => elegirObra(u.id)} aria-current={unidadId === u.id ? "true" : undefined}>
                      <span className="mbl-obra-cod">
                        {u.codigo}
                        {llegando.has(u.id) && <Estado tono="cian" title="Los muebles de esta obra están en etapa de recepción">Llegando</Estado>}
                      </span>
                      <span className="mbl-obra-cuenta" title={est.label}>{r?.total ? `${r.completos}/${r.total}` : "—"}</span>
                      <Mini pct={pctObra} />
                    </button>
                  );
                })}
                {esAdmin && altaObraLinea === linea.id && (
                  <div className="mbl-alta" style={{ padding: "6px 4px 10px" }}>
                    <input autoFocus className="ui-input" placeholder={`Ej: ${linea.nombre}-12`} value={newUnidad} onChange={e => setNewUnidad(e.target.value)} onKeyDown={e => e.key === "Enter" && crearUnidad(linea.id)} aria-label={`Nueva obra de ${linea.nombre}`} />
                    <button type="button" className="ui-btn ui-btn-primario chico" disabled={!newUnidad.trim()} onClick={() => crearUnidad(linea.id)}>Crear</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {esAdmin && (
          <div className="mbl-riel-pie">
            <div className="mbl-alta">
              <input className="ui-input" placeholder="Nueva línea (ej: K60)" value={newLinea} onChange={e => setNewLinea(e.target.value)} onKeyDown={e => e.key === "Enter" && crearLinea()} aria-label="Nueva línea" />
              <button type="button" className="ui-btn chico" disabled={!newLinea.trim()} onClick={crearLinea}><Plus size={14} /> Línea</button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Detalle ── */}
      <div className="mbl-detalle">
        {vistaPlantilla ? (
          <CatalogoLinea
            key={plantillaSel.id}
            lineaId={plantillaSel.id}
            lineaNombre={plantillaSel.nombre}
            lineas={lineas}
            esAdmin={esAdmin}
            onOpenMueble={m => setModalMueble(m)}
            onEliminarLinea={() => eliminarLinea(plantillaSel)}
            onVolverMovil={() => setDetalleMovil(false)}
          />
        ) : !vistaObra ? (
          <Vacio
            icono={ClipboardCheck}
            titulo="Elegí una obra"
            texto="El checklist se usa cuando los muebles empiezan a llegar: marcá cada pieza como recibida, parcial o para rehacer."
          />
        ) : (
          <div className="mbl-rec" key={unidadId}>
            <button type="button" className="mbl-volver-movil" onClick={() => setDetalleMovil(false)}><ChevronLeft size={18} /> Obras</button>

            <div className="mbl-cab">
              <div className="mbl-cab-sw">
                {enchapadoOt?.tipo_chapa || manualChapa
                  ? <ChapaSwatch tipo={enchapadoOt?.tipo_chapa || manualChapa} size="lg" />
                  : <ClipboardCheck size={24} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mbl-cab-tags">
                  <Tag tono="neutro">Línea {lineaSel?.nombre ?? "—"}</Tag>
                  {cargandoObra ? null : llegando.has(unidadId) && estadoSel.key !== "completa"
                    ? <Estado tono="cian" title="Los muebles de esta obra están en etapa de recepción">Llegando</Estado>
                    : <Estado tono={estadoSel.tono}>{estadoSel.label}</Estado>}
                </div>
                <h2 className="mbl-cab-tit mono">{unidadSel?.codigo ?? "…"}</h2>
                <div className="mbl-cab-sub">{cargandoObra ? "Recepción de muebles" : `Recepción de muebles · ${stats.total} ${stats.total === 1 ? "pieza" : "piezas"}`}</div>
              </div>
              <div className="mbl-cab-acc" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button type="button" className="ui-btn chico" onClick={imprimirFaltantes} disabled={!filas.length} title="Imprimir, guardar PDF o mandar por WhatsApp lo que falta">
                  <Printer size={14} /> Faltantes{nFaltantes ? ` · ${nFaltantes}` : ""}
                </button>
                <button type="button" className="ui-btn chico" onClick={() => { descargarChecklistPdf().catch(e => setErr(e?.message || "No se pudo generar el PDF.")); }} disabled={!filas.length}>
                  <Download size={14} /> Checklist PDF
                </button>
                {esAdmin && (
                  <button type="button" className="mbl-btn-ic peligro" onClick={eliminarUnidad} aria-label="Eliminar obra" title="Eliminar obra"><Trash2 size={15} /></button>
                )}
              </div>
            </div>

            {/* Chapa de los muebles: de la OT de enchapado o cargada a mano. */}
            <div className="mbl-fila">
              <span className="mbl-fila-ic" style={{ overflow: "hidden", padding: 0 }}>
                {enchapadoOt?.tipo_chapa || manualChapa ? <ChapaSwatch tipo={enchapadoOt?.tipo_chapa || manualChapa} size="md" /> : <Armchair size={16} />}
              </span>
              <div style={{ minWidth: 0 }}>
                {enchapadoLoading ? (
                  <Cargando compacto texto="Buscando la OT de enchapado…" />
                ) : enchapadoOt ? (
                  <>
                    <div className="mbl-fila-tit">{enchapadoOt.tipo_chapa || "Chapa sin especificar"}</div>
                    <div className="mbl-fila-txt">Chapa de la OT de enchapado.</div>
                  </>
                ) : showManualChapa ? (
                  <div className="mbl-alta" style={{ flexWrap: "wrap" }}>
                    <input autoFocus className="ui-input" style={{ flex: "1 1 220px" }} value={manualChapaDraft} onChange={e => setManualChapaDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarChapaManual()} placeholder="Ej: Roble Plata Rayado / muebles ya fabricados" aria-label="Chapa de los muebles" />
                    <button type="button" className="ui-btn ui-btn-primario chico" disabled={manualChapaSaving} onClick={guardarChapaManual}>{manualChapaSaving ? "Guardando…" : "Guardar"}</button>
                    <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setShowManualChapa(false)}>Cancelar</button>
                  </div>
                ) : manualChapa ? (
                  <>
                    <div className="mbl-fila-tit">{manualChapa}</div>
                    <div className="mbl-fila-txt">Dato cargado a mano: estos muebles no tienen OT de enchapado.</div>
                  </>
                ) : (
                  <>
                    <div className="mbl-fila-tit">Sin OT de enchapado</div>
                    <div className="mbl-fila-txt">Si los muebles ya vinieron hechos, cargá la chapa a mano para que salga en el PDF.</div>
                  </>
                )}
              </div>
              <div className="mbl-fila-der">
                {enchapadoOt ? (
                  <>
                    <Estado tono={enchapadoOt.estado === "Devuelta" ? "verde" : enchapadoOt.estado === "Rehacer" ? "rojo" : enchapadoOt.estado === "Enviada" ? "azul" : "neutro"}>OT {enchapadoOt.estado || "Pendiente"}</Estado>
                    {onIrSeguimiento && <button type="button" className="mbl-link" onClick={onIrSeguimiento}>Ver seguimiento</button>}
                  </>
                ) : !showManualChapa && !enchapadoLoading && esAdmin && (
                  <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => { setManualChapaDraft(manualChapa); setShowManualChapa(true); }}>
                    <Pencil size={13} /> {manualChapa ? "Editar" : "Cargar a mano"}
                  </button>
                )}
              </div>
            </div>

            {err && <Aviso onCerrar={() => setErr("")}>{err}</Aviso>}

            {cargandoObra ? <Cargando texto="Leyendo el checklist…" /> : <>
            {/* Avance: cada número aparece una vez y además filtra. */}
            <div className="mbl-resumen">
              <div>
                <div className="mbl-pct">{pct}<small>%</small></div>
                <div className="mbl-pct-et">recibido</div>
              </div>
              <div className="mbl-av" role="img" aria-label={`${stats.completos} recibidas, ${stats.parciales} parciales, ${stats.rehacer} para rehacer y ${pendientes} pendientes`}>
                {stats.total > 0 && ["Completo", "Parcial", "Rehacer"].map(e => cuentaEstado[e] > 0 && (
                  <i key={e} data-tono={ESTADO_UI[e].tono} style={{ width: `${(cuentaEstado[e] / stats.total) * 100}%` }} />
                ))}
              </div>
              <div className="mbl-scroll-x">
                <button type="button" className={`mbl-chip${filtro === "todos" ? " on" : ""}`} onClick={() => setFiltro("todos")}>Todas <span className="n">{stats.total}</span></button>
                {["No enviado", "Parcial", "Rehacer", "Completo"].map(e => (
                  <button key={e} type="button" className={`mbl-chip${filtro === e ? " on" : ""}`} data-tono={ESTADO_UI[e].tono} onClick={() => setFiltro(filtro === e ? "todos" : e)} disabled={!cuentaEstado[e] && filtro !== e} style={!cuentaEstado[e] && filtro !== e ? { opacity: 0.45 } : undefined}>
                    <span className="pto" /> {ESTADO_UI[e].plural} <span className="n">{cuentaEstado[e]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label className="mbl-buscar" style={{ flex: "1 1 220px" }}>
                <Search size={15} />
                <input className="ui-input" placeholder="Buscar pieza o sector…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar pieza" />
              </label>
              <button type="button" className={`ui-btn chico${selMode ? " ui-btn-suave" : ""}`} onClick={() => { setSelMode(v => !v); setSelIds(new Set()); setShowAddItem(false); }} disabled={!filas.length}>
                <ListChecks size={14} /> {selMode ? "Terminar selección" : "Marcar varias"}
              </button>
              {esAdmin && (
                <button type="button" className={`ui-btn chico${showAddItem ? " ui-btn-suave" : ""}`} onClick={() => { setShowAddItem(v => !v); setAddItemQ(""); setSelMode(false); }}>
                  {showAddItem ? <><X size={14} /> Cerrar</> : <><Plus size={14} /> Agregar pieza</>}
                </button>
              )}
            </div>

            {selMode && (
              <div className="mbl-flotante">
                <span className="cuenta">{selIds.size ? `${selIds.size} elegidas` : "Tocá las piezas"}</span>
                <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setSelIds(new Set(filtrado.map(r => r.id)))}>Todas</button>
                <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setSelIds(new Set())}>Ninguna</button>
                <div className="mbl-sp" />
                <span style={{ fontSize: 12, color: "var(--dim)" }}>Marcar como</span>
                {ESTADOS.map(e => {
                  const Icono = ESTADO_UI[e].icono;
                  return (
                    <button key={e} type="button" className="ui-btn chico" data-tono={ESTADO_UI[e].tono} style={{ color: "var(--t)", borderColor: "var(--t-borde)", background: "var(--t-soft)" }} disabled={bulkLoading || selIds.size === 0} onClick={() => bulkSetEstado(e)}>
                      <Icono size={14} /> {ESTADO_UI[e].label}
                    </button>
                  );
                })}
              </div>
            )}

            {showAddItem && esAdmin && (() => {
              const yaEnChecklist = new Set(filas.map(r => r.mueble_id));
              const disponibles = catalogoLinea.filter(m => !yaEnChecklist.has(m.id));
              const aqq = addItemQ.toLowerCase();
              const candidatos = aqq ? disponibles.filter(m => m.nombre.toLowerCase().includes(aqq) || (m.sector ?? "").toLowerCase().includes(aqq)) : disponibles;
              return (
                <div className="mbl-agregar">
                  {disponibles.length > 0 && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div>
                        <div className="mbl-fila-tit">Del catálogo de {lineaSel?.nombre}</div>
                        <div className="mbl-fila-txt">{disponibles.length} {disponibles.length === 1 ? "mueble que no está" : "muebles que no están"} en esta obra.</div>
                      </div>
                      <label className="mbl-buscar" style={{ flex: "none" }}>
                        <Search size={15} />
                        <input className="ui-input" placeholder="Buscar en el catálogo…" value={addItemQ} onChange={e => setAddItemQ(e.target.value)} aria-label="Buscar en el catálogo" />
                      </label>
                      <div className="mbl-cat-lista">
                        {candidatos.length === 0 && <div className="mbl-bloque-txt" style={{ padding: "6px 4px" }}>Sin coincidencias.</div>}
                        {candidatos.map(m => (
                          <button key={m.id} type="button" className="mbl-cat-item" onClick={() => agregarItemAlChecklist(m)}>
                            <span className="sec">{m.sector || "—"}</span>
                            <span>{m.nombre}</span>
                            <span className="med">{m.medidas || ""}</span>
                            <span className="mas">+ Agregar</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 10, paddingTop: disponibles.length ? 10 : 0, borderTop: disponibles.length ? "1px solid var(--border)" : 0 }}>
                    <div className="mbl-fila-tit">Mueble nuevo (queda también en la plantilla de la línea)</div>
                    <div className="mbl-form">
                      <label className="mbl-campo"><span>Nombre *</span><input className="ui-input" placeholder="Ej: Camarote doble" value={newItemForm.nombre} onChange={e => setNewItemForm(f => ({...f, nombre: e.target.value}))} /></label>
                      <label className="mbl-campo"><span>Sector</span><input className="ui-input" placeholder="Ej: Dormitorio" value={newItemForm.sector} onChange={e => setNewItemForm(f => ({...f, sector: e.target.value}))} /></label>
                      <label className="mbl-campo ancho"><span>Descripción</span><input className="ui-input" placeholder="Descripción breve" value={newItemForm.descripcion} onChange={e => setNewItemForm(f => ({...f, descripcion: e.target.value}))} /></label>
                      <label className="mbl-campo"><span>Medidas</span><input className="ui-input" placeholder="Ej: 120x80 cm" value={newItemForm.medidas} onChange={e => setNewItemForm(f => ({...f, medidas: e.target.value}))} /></label>
                      <label className="mbl-campo"><span>Material</span><input className="ui-input" placeholder="Ej: MDF" value={newItemForm.material} onChange={e => setNewItemForm(f => ({...f, material: e.target.value}))} /></label>
                    </div>
                    <div><button type="button" className="ui-btn ui-btn-primario" onClick={crearYAgregarItem} disabled={!newItemForm.nombre.trim()}><Plus size={15} /> Crear y agregar a la obra</button></div>
                  </div>
                </div>
              );
            })()}

            {Object.keys(porSector).length === 0 ? (
              <Vacio
                icono={q || filtro !== "todos" ? Search : ClipboardCheck}
                titulo={q || filtro !== "todos" ? "Ninguna pieza con este filtro" : "El checklist está vacío"}
                texto={q || filtro !== "todos" ? "Probá con otro estado o búsqueda." : "La obra no tiene piezas cargadas. Agregalas desde el catálogo de la línea."}
              />
            ) : (
              Object.entries(porSector).map(([sector, rows]) => {
                const completados = rows.filter(r => r.estado === "Completo").length;
                const todasSel = rows.every(r => selIds.has(r.id));
                return (
                  <div key={sector} className="mbl-sector">
                    <div className="mbl-sector-cab">
                      {selMode && (
                        <button
                          type="button"
                          className={`mbl-check-sel${todasSel ? " on" : ""}`}
                          aria-label={`Elegir todo ${sector}`}
                          onClick={() => setSelIds(prev => {
                            const next = new Set(prev);
                            rows.forEach(r => (todasSel ? next.delete(r.id) : next.add(r.id)));
                            return next;
                          })}
                        >
                          {todasSel && <Check size={12} strokeWidth={3} />}
                        </button>
                      )}
                      <span className="nom">{sector}</span>
                      <span className="n">{completados}/{rows.length}</span>
                      <Mini pct={(completados / rows.length) * 100} />
                    </div>
                    {rows.map(r => (
                      <FilaPieza
                        key={r.id}
                        row={r}
                        nro={nroPieza(r)}
                        selMode={selMode}
                        marcada={selIds.has(r.id)}
                        esAdmin={esAdmin}
                        onToggleSel={() => setSelIds(prev => { const next = new Set(prev); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next; })}
                        onEstado={(estado) => setEstado(r.id, estado)}
                        onNota={(obs) => setObs(r.id, obs)}
                        onAbrir={() => r.prod_muebles && setModalMueble({ ...r.prod_muebles, imageScopeType: "checklist", imageScopeId: r.id })}
                        onQuitar={() => eliminarItem(r)}
                      />
                    ))}
                  </div>
                );
              })
            )}
            </>}
          </div>
        )}
      </div>

      {modalMueble && (
        <MuebleModal
          key={modalMueble.id}
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

function FilaPieza({ row, nro, selMode, marcada, esAdmin, onToggleSel, onEstado, onNota, onAbrir, onQuitar }) {
  const m = row.prod_muebles;
  const hecha = row.estado === "Completo";
  const est = ESTADO_UI[row.estado] ?? ESTADO_UI["No enviado"];
  return (
    <div
      className={`mbl-pieza${selMode ? " sel" : ""}${hecha ? " hecha" : ""}${marcada ? " marcada" : ""}`}
      onClick={selMode ? onToggleSel : undefined}
      role={selMode ? "checkbox" : undefined}
      aria-checked={selMode ? marcada : undefined}
    >
      {selMode && <span className={`mbl-check-sel${marcada ? " on" : ""}`} aria-hidden="true">{marcada && <Check size={12} strokeWidth={3} />}</span>}
      <span className="mbl-pieza-nro">{nro ?? "—"}</span>
      <MiniThumb muebleId={m?.id} scopeType="checklist" scopeId={row.id} onClick={!selMode && m ? onAbrir : undefined} etiqueta={m ? `Ver ficha de ${m.nombre}` : undefined} />
      <div style={{ minWidth: 0 }}>
        {selMode
          ? <span className="mbl-pieza-nom" style={{ display: "block" }}>{m?.nombre ?? "—"}</span>
          : <button type="button" className="mbl-pieza-nom" onClick={onAbrir}>{m?.nombre ?? "—"}</button>}
        <div className="mbl-pieza-meta">
          {m?.medidas && <span className="mono">{m.medidas}</span>}
          {hecha && (row.recibido_at || row.recibido_por) && (
            <span className="ok">
              Recibido{row.recibido_at ? ` ${formatTraceDate(row.recibido_at)}` : ""}{row.recibido_por ? ` · ${row.recibido_por}` : ""}
            </span>
          )}
          {selMode ? (row.obs && <span style={{ fontStyle: "italic" }}>{row.obs}</span>) : <NotaPieza value={row.obs} onSave={onNota} />}
        </div>
      </div>
      {selMode ? (
        <Estado tono={est.tono}>{est.label}</Estado>
      ) : (
        <>
          <div className="mbl-est4" role="radiogroup" aria-label={`Estado de ${m?.nombre ?? "la pieza"}`}>
            {ESTADOS.map(e => {
              const ui = ESTADO_UI[e];
              const Icono = ui.icono;
              const on = row.estado === e;
              return (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={on ? "on" : ""}
                  data-tono={ui.tono}
                  disabled={on}
                  onClick={() => onEstado(e)}
                  title={ui.label}
                >
                  <Icono size={14} strokeWidth={2.2} /> <span className="txt">{ui.label}</span>
                </button>
              );
            })}
          </div>
          {esAdmin
            ? <button type="button" className="mbl-btn-ic peligro mbl-pieza-quitar" style={{ width: 30, height: 30 }} onClick={onQuitar} aria-label={`Quitar ${m?.nombre ?? "la pieza"} del checklist`}><Trash2 size={13} /></button>
            : <span className="mbl-pieza-quitar" />}
        </>
      )}
    </div>
  );
}
