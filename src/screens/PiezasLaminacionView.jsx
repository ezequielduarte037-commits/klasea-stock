/**
 * PiezasLaminacionView v2
 * - Todas las obras en sidebar izquierdo, plantilla independiente por obra
 * - Imágenes por pieza (Supabase Storage bucket "piezas-laminacion")
 * - Modal con estados, observaciones y galería de fotos
 *
 * SQL necesario:
 * ─────────────────────────────────────────────────────────────────
 * create table piezas_laminacion_seguimiento (
 *   id uuid primary key default gen_random_uuid(),
 *   obra_id uuid references produccion_obras(id) on delete cascade,
 *   pieza_num int not null,
 *   estado text not null default 'pendiente',
 *   observaciones text,
 *   updated_at timestamptz default now(),
 *   updated_by uuid references auth.users(id),
 *   unique(obra_id, pieza_num)
 * );
 *
 * create table piezas_laminacion_imagenes (
 *   id uuid primary key default gen_random_uuid(),
 *   obra_id uuid references produccion_obras(id) on delete cascade,
 *   pieza_num int not null,
 *   storage_path text not null,
 *   nombre text,
 *   created_at timestamptz default now(),
 *   created_by uuid references auth.users(id)
 * );
 *
 * -- Storage bucket: "piezas-laminacion" (public read or authenticated)
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:     "#09090b",
  s0:     "rgba(255,255,255,0.03)",
  s1:     "rgba(255,255,255,0.06)",
  s2:     "rgba(255,255,255,0.09)",
  b0:     "rgba(255,255,255,0.08)",
  b1:     "rgba(255,255,255,0.15)",
  b2:     "rgba(255,255,255,0.25)",
  t0:     "#f4f4f5",
  t1:     "#a1a1aa",
  t2:     "#71717a",
  mono:   "'JetBrains Mono','IBM Plex Mono',monospace",
  sans:   "'Outfit',system-ui,sans-serif",
  green:  "#10b981",
  amber:  "#f59e0b",
  red:    "#ef4444",
  blue:   "#3b82f6",
  purple: "#8b5cf6",
};

const GLASS = {
  backdropFilter: "blur(24px) saturate(130%)",
  WebkitBackdropFilter: "blur(24px) saturate(130%)",
};

const STORAGE_BUCKET = "piezas-laminacion";

// ─── ESTADOS ─────────────────────────────────────────────────────────────────
const EST = {
  pendiente:  { label: "Pendiente",  color: C.t2,    bg: "rgba(113,113,122,.10)", border: "rgba(113,113,122,.22)" },
  en_proceso: { label: "En proceso", color: C.blue,  bg: "rgba(59,130,246,.10)",  border: "rgba(59,130,246,.25)"  },
  terminada:  { label: "Terminada",  color: C.green, bg: "rgba(16,185,129,.10)",  border: "rgba(16,185,129,.25)"  },
  entregada:  { label: "Entregada",  color: C.purple,bg: "rgba(139,92,246,.10)",  border: "rgba(139,92,246,.25)"  },
  problema:   { label: "Problema",   color: C.red,   bg: "rgba(239,68,68,.10)",   border: "rgba(239,68,68,.25)"   },
};

// ─── CATÁLOGO K43 ─────────────────────────────────────────────────────────────
const CATALOGO_K43 = [
  { num:  1, desc: "Casco",                                        cant: 1, matriz: "" },
  { num:  2, desc: "Cubierta",                                     cant: 1, matriz: "" },
  { num:  3, desc: "Cabina",                                       cant: 1, matriz: "" },
  { num:  5, desc: "Planchada lado inferior",                      cant: 1, matriz: "" },
  { num:  6, desc: "Planchada Nueva",                              cant: 2, matriz: "" },
  { num:  7, desc: "Laterales de planchada nueva",                 cant: 1, matriz: "" },
  { num:  8, desc: "Piso de cockpit",                              cant: 1, matriz: "" },
  { num:  9, desc: "Tapa de sala de maquinas",                     cant: 1, matriz: "Nueva #20" },
  { num: 10, desc: "Tacho de mueble lateral de cockpit estribor",  cant: 1, matriz: "Nueva #20" },
  { num: 11, desc: "Tacho de mueble lateral de cockpit babor",     cant: 1, matriz: "Nueva #20" },
  { num: 12, desc: "Puerta del tacho lateral de cockpit Estribor", cant: 1, matriz: "" },
  { num: 13, desc: "Puerta del tacho lateral de cockpit Babor",    cant: 1, matriz: "" },
  { num: 14, desc: "Pasacabos de popa Estribor",                   cant: 1, matriz: "Nueva #20" },
  { num: 15, desc: "Pasacabos de popa Babor",                      cant: 1, matriz: "Nueva #20" },
  { num: 16, desc: "Tomas de aire",                                cant: 2, matriz: "" },
  { num: 17, desc: "Sillon de cockpit",                            cant: 1, matriz: "Nueva #20" },
  { num: 18, desc: "Tapa de parrilla",                             cant: 1, matriz: "" },
  { num: 19, desc: "Base de sillon de cockpit",                    cant: 1, matriz: "Nueva #20" },
  { num: 20, desc: "Tapa de tacho de planchada",                   cant: 1, matriz: "" },
  { num: 21, desc: "Tapa de tacho de proa estribor",               cant: 1, matriz: "Nueva #20" },
  { num: 22, desc: "Tapa de tacho de proa Babor",                  cant: 1, matriz: "Nueva #20" },
  { num: 23, desc: "Tacho de proa",                                cant: 1, matriz: "" },
  { num: 24, desc: "Tapa de malacate",                             cant: 1, matriz: "" },
  { num: 25, desc: "Cuchara de extractores",                       cant: 2, matriz: "" },
  { num: 26, desc: "Consola de fly",                               cant: 1, matriz: "Nueva #20" },
  { num: 27, desc: "Consola salon",                                cant: 1, matriz: "" },
  { num: 28, desc: "Tapa escalera fly",                            cant: 1, matriz: "Nueva #20" },
  { num: 29, desc: "Base de butaca Fly",                           cant: 1, matriz: "Nueva #20" },
  { num: 30, desc: "Arco Radar",                                   cant: 1, matriz: "Nueva #20" },
  { num: 31, desc: "Tapa de arco Radar Central",                   cant: 1, matriz: "Nueva #20" },
  { num: 32, desc: "Tapa de arco Radar Estribor",                  cant: 1, matriz: "Nueva #20" },
  { num: 33, desc: "Tapa de arco Radar Babor",                     cant: 1, matriz: "Nueva #20" },
  { num: 34, desc: "Camarote de proa",                             cant: 1, matriz: "" },
  { num: 35, desc: "Techo de camarote de proa",                    cant: 1, matriz: "" },
  { num: 36, desc: "Baño de babor",                                cant: 1, matriz: "" },
  { num: 37, desc: "Techo de baño de babor",                       cant: 1, matriz: "" },
  { num: 38, desc: "Banda de baño de babor",                       cant: 1, matriz: "" },
  { num: 39, desc: "Baño de estribor",                             cant: 1, matriz: "" },
  { num: 40, desc: "Techo de baño de estribor",                    cant: 1, matriz: "" },
  { num: 41, desc: "Banda baño estribor",                          cant: 1, matriz: "" },
  { num: 42, desc: "Marco ventana baño estribor",                  cant: 1, matriz: "" },
  { num: 43, desc: "Camarote de estribor",                         cant: 1, matriz: "" },
  { num: 44, desc: "Techo camarote de estribor",                   cant: 1, matriz: "" },
  { num: 45, desc: "Camarote de popa",                             cant: 1, matriz: "" },
  { num: 46, desc: "Techo camarote de popa",                       cant: 2, matriz: "" },
  { num: 47, desc: "Banda de salon proa estribor",                 cant: 1, matriz: "Nueva #20" },
  { num: 48, desc: "Banda de salon popa estribor",                 cant: 1, matriz: "Nueva #20" },
  { num: 49, desc: "Banda de salon popa Babor",                    cant: 1, matriz: "Nueva #20" },
  { num: 50, desc: "Banda de salon proa Babor",                    cant: 1, matriz: "Nueva #20" },
  { num: 51, desc: "Interior escalera Fly",                        cant: 1, matriz: "Nueva #20" },
  { num: 52, desc: "Moldura pasillo",                              cant: 1, matriz: "Nueva #20" },
  { num: 53, desc: "Contratecho cabina proa",                      cant: 1, matriz: "" },
  { num: 54, desc: "Contratecho cockpit",                          cant: 1, matriz: "Nueva #20" },
  { num: 55, desc: "Cajon de baterías",                            cant: 1, matriz: "" },
  { num: 56, desc: "Tapa Cajon de baterías",                       cant: 1, matriz: "" },
  { num: 57, desc: "Tapa de escalera de planchada",                cant: 1, matriz: "Nueva #20" },
  { num: 58, desc: "Caja de selectoras",                           cant: 1, matriz: "" },
  { num: 59, desc: "Mesa de fly",                                  cant: 1, matriz: "" },
  { num: 60, desc: "Cenefa",                                       cant: 2, matriz: "" },
];
const TOTAL = CATALOGO_K43.length;

const OBRA_COLOR = { activa: "#3b82f6", pausada: "#f59e0b", terminada: "#10b981", cancelada: "#ef4444" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function Dot({ color, size = 6, pulse = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0,
      animation: pulse ? "plv-pulse 2s ease infinite" : "none",
      boxShadow: pulse ? `0 0 5px ${color}70` : "none",
    }} />
  );
}

function Chip({ estado, sm = false }) {
  const e = EST[estado] ?? EST.pendiente;
  return (
    <span style={{
      fontSize: sm ? 8 : 9, letterSpacing: 1.5, textTransform: "uppercase",
      padding: sm ? "2px 6px" : "3px 9px", borderRadius: 99, fontWeight: 700,
      background: e.bg, color: e.color, border: `1px solid ${e.border}`,
      whiteSpace: "nowrap", fontFamily: C.sans,
    }}>
      {e.label}
    </span>
  );
}

function ProgressRing({ pct, size = 44, stroke = 3.5, color = C.green }) {
  const r    = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        style={{ transition: "stroke-dasharray .7s cubic-bezier(.22,1,.36,1)" }} />
    </svg>
  );
}

function KpiCard({ label, value, total, color, delay = 0 }) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return (
    <div style={{
      background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 11,
      padding: "11px 13px", display: "flex", alignItems: "center", gap: 10,
      borderLeft: `2px solid ${color}`,
      animation: `plv-kpi .35s ${delay}s ease both`,
    }}>
      <ProgressRing pct={pct} color={color} size={38} stroke={3} />
      <div>
        <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 3 }}>{label}</div>
        <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 9, color: C.t2, marginTop: 2 }}>{pct}%</div>
      </div>
    </div>
  );
}

// ─── LIGHTBOX ────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }) {
  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.94)", ...GLASS,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out",
    }}>
      <img src={url} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 8, objectFit: "contain", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

// ─── MODAL DE PIEZA ──────────────────────────────────────────────────────────
function PiezaModal({ pieza, obraId, segRow, imagenes: imgInit = [], onSave, onClose }) {
  const [estado,    setEstado]   = useState(segRow?.estado ?? "pendiente");
  const [obs,       setObs]      = useState(segRow?.observaciones ?? "");
  const [saving,    setSaving]   = useState(false);
  const [imagenes,  setImagenes] = useState(imgInit);
  const [uploading, setUploading]= useState(false);
  const [lightbox,  setLightbox] = useState(null);
  const fileRef = useRef();

  async function guardar() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    await supabase.from("piezas_laminacion_seguimiento").upsert({
      obra_id: obraId, pieza_num: pieza.num,
      estado, observaciones: obs.trim() || null,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }, { onConflict: "obra_id,pieza_num" });
    setSaving(false);
    onSave();
  }

  async function subirImagen(file) {
    if (!file) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const ext  = file.name.split(".").pop();
    const path = `${obraId}/${pieza.num}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (!upErr) {
      await supabase.from("piezas_laminacion_imagenes").insert({
        obra_id: obraId, pieza_num: pieza.num,
        storage_path: path, nombre: file.name, created_by: user?.id ?? null,
      });
      const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
      setImagenes(prev => [...prev, { storage_path: path, nombre: file.name, url: signed?.signedUrl ?? null }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function eliminarImagen(img) {
    await supabase.storage.from(STORAGE_BUCKET).remove([img.storage_path]);
    await supabase.from("piezas_laminacion_imagenes").delete().eq("storage_path", img.storage_path);
    setImagenes(prev => prev.filter(i => i.storage_path !== img.storage_path));
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.88)", ...GLASS,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      <div style={{ background: "rgba(13,13,17,0.98)", border: `1px solid ${C.b1}`, borderRadius: 14,
        width: "100%", maxWidth: 520, fontFamily: C.sans, boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        animation: "plv-slideup .18s ease", marginBottom: 40 }}>

        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 5 }}>
              Pieza #{String(pieza.num).padStart(2,"0")}
              {pieza.cant > 1 && <span style={{ marginLeft: 6 }}>· ×{pieza.cant}</span>}
              {pieza.matriz && <span style={{ marginLeft: 8, color: C.amber }}>✦ {pieza.matriz}</span>}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.t0, lineHeight: 1.3 }}>{pieza.desc}</div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px", marginLeft: 10 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Estado */}
          <div>
            <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(EST).map(([key, e]) => (
                <button key={key} onClick={() => setEstado(key)} style={{
                  padding: "6px 13px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: estado === key ? `1px solid ${e.border}` : `1px solid ${C.b0}`,
                  background: estado === key ? e.bg : "transparent",
                  color: estado === key ? e.color : C.t2,
                  transition: "all .15s", fontFamily: C.sans,
                }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>Observaciones</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Fecha, responsable, problema encontrado, detalles…"
              style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "10px 12px", borderRadius: 8, fontSize: 12, outline: "none", width: "100%", resize: "vertical", fontFamily: C.sans, lineHeight: 1.6, boxSizing: "border-box" }} />
          </div>

          {/* Imágenes */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, textTransform: "uppercase", fontWeight: 600 }}>
                Imágenes ({imagenes.length})
              </label>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ border: `1px solid ${C.b0}`, background: C.s0, color: uploading ? C.t2 : C.t0, padding: "4px 12px", borderRadius: 6, cursor: uploading ? "not-allowed" : "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                {uploading ? "↑ Subiendo…" : "+ Agregar foto"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => subirImagen(e.target.files[0])} />
            </div>

            {imagenes.length === 0 && !uploading ? (
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `1px dashed ${C.b0}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", color: C.t2, fontSize: 12, cursor: "pointer", transition: "border-color .15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.b1}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.b0}>
                📷 &nbsp;Hacé click para agregar una imagen
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 8 }}>
                {imagenes.map((img, i) => (
                  <div key={img.storage_path ?? i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: C.s1, border: `1px solid ${C.b0}` }}>
                    {img.url
                      ? <img src={img.url} alt={img.nombre} onClick={() => setLightbox(img.url)}
                          style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in", display: "block" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.t2 }}>sin preview</div>
                    }
                    <button onClick={() => eliminarImagen(img)}
                      style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.75)", border: "none", color: "#fff", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ×
                    </button>
                    {img.nombre && (
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.65)", padding: "3px 5px", fontSize: 9, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {img.nombre}
                      </div>
                    )}
                  </div>
                ))}
                {/* Slot de upload */}
                <div onClick={() => fileRef.current?.click()}
                  style={{ aspectRatio: "1", border: `1px dashed ${C.b0}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: C.t2, fontSize: 20, transition: "border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.b1}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.b0}>
                  <span>+</span>
                  <span style={{ fontSize: 9, letterSpacing: 1 }}>FOTO</span>
                </div>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
            <button onClick={onClose}
              style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 20px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: C.sans, opacity: saving ? 0.5 : 1 }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function PiezasLaminacionView({ obras = [], esGestion = false }) {
  const [obraSelId,   setObraSelId]   = useState(null);
  const [seguimiento, setSeguimiento] = useState([]);
  const [imagenesMap, setImagenesMap] = useState({});  // pieza_num → [{storage_path, nombre, url}]
  const [loading,     setLoading]     = useState(false);
  const [piezaModal,  setPiezaModal]  = useState(null);
  const [q,           setQ]           = useState("");
  const [filtroEst,   setFiltroEst]   = useState("todos");
  const [filtroMat,   setFiltroMat]   = useState("todos");
  const [saving,      setSaving]      = useState(false);
  const [flash,       setFlash]       = useState(null);
  const [qObra,       setQObra]       = useState("");

  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId) ?? null, [obras, obraSelId]);

  // Detectar si la obra es K43 (por linea_nombre o codigo)
  const isK43 = useMemo(() => {
    if (!obraSel) return false;
    const linea = (obraSel.linea_nombre ?? "").toLowerCase();
    const cod   = (obraSel.codigo ?? "").toLowerCase();
    return linea.includes("43") || cod.includes("43");
  }, [obraSel]);

  // Primera obra por defecto
  useEffect(() => {
    if (!obraSelId && obras.length > 0) setObraSelId(obras[0].id);
  }, [obras]);

  // ── Cargar seguimiento + imágenes ─────────────────────────────
  const cargar = useCallback(async () => {
    if (!obraSelId) return;
    setLoading(true);
    const [{ data: seg }, { data: imgs }] = await Promise.all([
      supabase.from("piezas_laminacion_seguimiento").select("*").eq("obra_id", obraSelId),
      supabase.from("piezas_laminacion_imagenes").select("*").eq("obra_id", obraSelId),
    ]);
    setSeguimiento(seg ?? []);

    const rawImgs = imgs ?? [];
    if (rawImgs.length > 0) {
      const withUrls = await Promise.all(
        rawImgs.map(img =>
          supabase.storage.from(STORAGE_BUCKET)
            .createSignedUrl(img.storage_path, 3600)
            .then(({ data }) => ({ ...img, url: data?.signedUrl ?? null }))
        )
      );
      const map = {};
      for (const img of withUrls) {
        if (!map[img.pieza_num]) map[img.pieza_num] = [];
        map[img.pieza_num].push(img);
      }
      setImagenesMap(map);
    } else {
      setImagenesMap({});
    }
    setLoading(false);
  }, [obraSelId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Real-time
  useEffect(() => {
    if (!obraSelId) return;
    const ch = supabase.channel(`plv-${obraSelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "piezas_laminacion_seguimiento", filter: `obra_id=eq.${obraSelId}` }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "piezas_laminacion_imagenes",    filter: `obra_id=eq.${obraSelId}` }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [obraSelId, cargar]);

  // Maps y stats
  const segMap = useMemo(() => {
    const m = {};
    for (const r of seguimiento) m[r.pieza_num] = r;
    return m;
  }, [seguimiento]);

  const stats = useMemo(() => {
    const byEst = {};
    for (const k of Object.keys(EST)) byEst[k] = 0;
    for (const p of CATALOGO_K43) byEst[segMap[p.num]?.estado ?? "pendiente"]++;
    const terminadas = byEst.terminada + byEst.entregada;
    return { byEst, terminadas, pct: Math.round(terminadas / TOTAL * 100) };
  }, [segMap]);

  const obrasFiltradas = useMemo(() => {
    const qq = qObra.trim().toLowerCase();
    if (!qq) return obras;
    return obras.filter(o =>
      (o.codigo ?? o.nombre ?? "").toLowerCase().includes(qq) ||
      (o.linea_nombre ?? "").toLowerCase().includes(qq)
    );
  }, [obras, qObra]);

  const piezasFiltradas = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return CATALOGO_K43.filter(p => {
      const est = segMap[p.num]?.estado ?? "pendiente";
      if (filtroEst !== "todos" && est !== filtroEst) return false;
      if (filtroMat === "nueva"     && !p.matriz) return false;
      if (filtroMat === "estandar"  &&  p.matriz) return false;
      if (qq && !p.desc.toLowerCase().includes(qq) && !String(p.num).includes(qq)) return false;
      return true;
    });
  }, [q, filtroEst, filtroMat, segMap]);

  // Bulk
  async function marcarTodas(nuevoEstado) {
    if (!obraSelId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    await supabase.from("piezas_laminacion_seguimiento").upsert(
      piezasFiltradas.map(p => ({ obra_id: obraSelId, pieza_num: p.num, estado: nuevoEstado, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })),
      { onConflict: "obra_id,pieza_num" }
    );
    setSaving(false);
    showFlash(`✓ ${piezasFiltradas.length} piezas → ${EST[nuevoEstado].label}`);
    cargar();
  }

  function showFlash(msg) { setFlash(msg); setTimeout(() => setFlash(null), 2800); }

  const avanceColor = stats.pct >= 80 ? C.green : stats.pct >= 40 ? C.amber : C.blue;

  return (
    <>
      <style>{`
        @keyframes plv-kpi     { from { opacity:0; transform:scale(.94) } to { opacity:1; transform:scale(1) } }
        @keyframes plv-fadeup  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        @keyframes plv-slideup { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes plv-pulse   { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        .plv-row { animation: plv-fadeup .25s ease both; }
        .plv-row:nth-child(1)  { animation-delay:.02s }
        .plv-row:nth-child(2)  { animation-delay:.04s }
        .plv-row:nth-child(3)  { animation-delay:.06s }
        .plv-row:nth-child(4)  { animation-delay:.08s }
        .plv-row:nth-child(5)  { animation-delay:.10s }
        .plv-row:nth-child(6)  { animation-delay:.12s }
        .plv-row:nth-child(7)  { animation-delay:.14s }
        .plv-row:nth-child(8)  { animation-delay:.16s }
        .plv-row:nth-child(9)  { animation-delay:.18s }
        .plv-row:nth-child(10) { animation-delay:.20s }
        .plv-row:nth-child(n+11) { animation-delay:.22s }
        .plv-row:hover td { background: rgba(255,255,255,0.018) !important; }
        .plv-row td { transition: background .12s; }
        .plv-obra-btn { transition: all .15s; }
        .plv-obra-btn:hover { background: rgba(255,255,255,0.04) !important; }
        .plv-thumb { transition: transform .18s, box-shadow .18s; cursor: zoom-in; }
        .plv-thumb:hover { transform: scale(1.07); box-shadow: 0 4px 16px rgba(0,0,0,.5); }
      `}</style>

      {/* Toast */}
      {flash && (
        <div style={{
          position: "fixed", bottom: 22, right: 22, zIndex: 9999,
          padding: "10px 18px", borderRadius: 8, fontFamily: C.sans, fontSize: 12, fontWeight: 600,
          background: "rgba(6,18,12,0.97)", border: "1px solid rgba(16,185,129,.35)", color: C.green,
          animation: "plv-slideup .22s ease", boxShadow: "0 8px 32px rgba(0,0,0,.6)",
        }}>
          {flash}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: C.sans, minHeight: 0 }}>

        {/* ── HEADER ─────────────────────────────────────── */}
        <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: obraSel ? 14 : 0 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 4 }}>
                Laminación · Seguimiento de piezas
              </div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.t0, lineHeight: 1.2, fontFamily: C.mono, letterSpacing: 1 }}>
                {obraSel ? (obraSel.codigo ?? obraSel.nombre ?? "—") : "Piezas de Laminación"}
              </h2>
              {obraSel?.linea_nombre && (
                <div style={{ fontSize: 11, color: C.t2, marginTop: 3, letterSpacing: 1 }}>{obraSel.linea_nombre}</div>
              )}
            </div>
            {obraSel && isK43 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <ProgressRing pct={stats.pct} size={50} stroke={4} color={avanceColor} />
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: avanceColor, lineHeight: 1 }}>{stats.pct}%</div>
                  <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>{stats.terminadas}/{TOTAL} listas</div>
                </div>
              </div>
            )}
          </div>

          {obraSel && isK43 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 7 }}>
              <KpiCard label="Terminadas" value={stats.byEst.terminada}  total={TOTAL} color={C.green}  delay={0}    />
              <KpiCard label="En proceso" value={stats.byEst.en_proceso} total={TOTAL} color={C.blue}   delay={0.06} />
              <KpiCard label="Entregadas" value={stats.byEst.entregada}  total={TOTAL} color={C.purple} delay={0.12} />
              <KpiCard label="Problemas"  value={stats.byEst.problema}   total={TOTAL} color={C.red}    delay={0.18} />
              <KpiCard label="Pendientes" value={stats.byEst.pendiente}  total={TOTAL} color={C.t2}     delay={0.24} />
            </div>
          )}
        </div>

        {/* ── BODY ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "230px 1fr", minHeight: 0 }}>

          {/* ── SIDEBAR OBRAS ── */}
          <div style={{ borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
              <input value={qObra} onChange={e => setQObra(e.target.value)} placeholder="Buscar obra…"
                style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "6px 10px", borderRadius: 7, fontSize: 11, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: C.sans }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
              {obrasFiltradas.length === 0 && (
                <div style={{ padding: "28px 12px", textAlign: "center", color: C.t2, fontSize: 11 }}>Sin obras</div>
              )}
              {obrasFiltradas.map(o => {
                const sel   = o.id === obraSelId;
                const color = OBRA_COLOR[o.estado] ?? C.t2;
                return (
                  <button key={o.id} onClick={() => { setObraSelId(o.id); setQ(""); setFiltroEst("todos"); }}
                    className="plv-obra-btn"
                    style={{
                      width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 8,
                      marginBottom: 3, cursor: "pointer", fontFamily: C.sans,
                      background: sel ? C.s1 : "transparent",
                      border: sel ? `1px solid ${C.b1}` : "1px solid transparent",
                      borderLeft: `2.5px solid ${sel ? color : "transparent"}`,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Dot color={color} size={5} />
                      <span style={{ fontWeight: sel ? 700 : 500, fontSize: 12, color: sel ? C.t0 : C.t1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                        fontFamily: C.mono, letterSpacing: 0.5 }}>
                        {o.codigo ?? o.nombre ?? "—"}
                      </span>
                    </div>
                    {o.linea_nombre && (
                      <div style={{ fontSize: 9, color: C.t2, paddingLeft: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.linea_nombre}</div>
                    )}
                    {sel && (
                      <div style={{ marginTop: 6, paddingLeft: 11, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {(() => {
                          const isK = (o.linea_nombre ?? "").toLowerCase().includes("43") || (o.codigo ?? "").toLowerCase().includes("43");
                          return isK
                            ? <>
                                <span style={{ fontSize: 8, color: C.amber, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 5px", borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>K43</span>
                                <span style={{ fontSize: 9, color: C.green }}>{stats.byEst.terminada} term.</span>
                                {stats.byEst.en_proceso > 0 && <span style={{ fontSize: 9, color: C.blue }}>{stats.byEst.en_proceso} en proc.</span>}
                                {stats.byEst.problema > 0   && <span style={{ fontSize: 9, color: C.red }}>⚠ {stats.byEst.problema}</span>}
                              </>
                            : <span style={{ fontSize: 9, color: C.t2 }}>Sin plantilla</span>;
                        })()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── TABLA PIEZAS ── */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {!obraSel ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una obra</div>
              </div>
            ) : !isK43 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
                <div style={{ fontSize: 36 }}>🧩</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.t1 }}>Sin plantilla de piezas</div>
                <div style={{ fontSize: 12, color: C.t2, textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                  Esta obra no está asociada a la línea K43.<br/>
                  El catálogo de 59 piezas solo aplica a obras cuyo código o línea contiene &quot;43&quot;.
                </div>
                <div style={{ fontSize: 10, color: C.t2, fontFamily: C.mono, padding: "6px 14px", borderRadius: 6, background: C.s0, border: `1px solid ${C.b0}` }}>
                  Línea: {obraSel.linea_nombre ?? "sin asignar"} · Código: {obraSel.codigo ?? "—"}
                </div>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div style={{ padding: "9px 14px", borderBottom: `1px solid ${C.b0}`, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pieza…"
                    style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "5px 10px", borderRadius: 6, fontSize: 11, outline: "none", width: 160, fontFamily: C.sans }} />

                  <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
                    style={{ background: "#0f0f12", border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 8px", borderRadius: 6, fontSize: 11, outline: "none", fontFamily: C.sans, cursor: "pointer" }}>
                    <option value="todos">Todos los estados</option>
                    {Object.entries(EST).map(([k, e]) => (
                      <option key={k} value={k}>{e.label} ({stats.byEst[k] ?? 0})</option>
                    ))}
                  </select>

                  <select value={filtroMat} onChange={e => setFiltroMat(e.target.value)}
                    style={{ background: "#0f0f12", border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 8px", borderRadius: 6, fontSize: 11, outline: "none", fontFamily: C.sans, cursor: "pointer" }}>
                    <option value="todos">Todas las matrices</option>
                    <option value="nueva">✦ Nueva #{CATALOGO_K43.filter(p=>p.matriz).length}</option>
                    <option value="estandar">Estándar #{CATALOGO_K43.filter(p=>!p.matriz).length}</option>
                  </select>

                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: C.t2 }}>{piezasFiltradas.length}/{TOTAL}</span>

                  {esGestion && piezasFiltradas.length > 0 && (
                    <>
                      <button onClick={() => marcarTodas("en_proceso")} disabled={saving}
                        style={{ border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: C.sans }}>
                        → En proceso
                      </button>
                      <button onClick={() => marcarTodas("terminada")} disabled={saving}
                        style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: "#34d399", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: C.sans }}>
                        ✓ Terminadas
                      </button>
                    </>
                  )}
                </div>

                {/* Tabla */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {loading ? (
                    <div style={{ padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Cargando…</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                        <tr style={{ background: "#0c0c0f" }}>
                          {["#", "Pieza", "Cant.", "Matriz", "Estado", "Imágenes", "Observaciones", ""].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, fontWeight: 600, whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {piezasFiltradas.map(pieza => {
                          const seg    = segMap[pieza.num];
                          const estado = seg?.estado ?? "pendiente";
                          const imgs   = imagenesMap[pieza.num] ?? [];
                          const isProb = estado === "problema";
                          return (
                            <tr key={pieza.num} className="plv-row"
                              style={{ background: isProb ? "rgba(239,68,68,0.03)" : "transparent" }}>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.t2 }}>{String(pieza.num).padStart(2,"0")}</span>
                              </td>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle", maxWidth: 220 }}>
                                <button onClick={() => setPiezaModal(pieza)}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: C.sans }}
                                  onMouseEnter={e => e.currentTarget.querySelector("span").style.color = C.t0}
                                  onMouseLeave={e => e.currentTarget.querySelector("span").style.color = C.t1}>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: C.t1, display: "block", transition: "color .15s" }}>
                                    {pieza.desc}
                                  </span>
                                </button>
                              </td>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                <span style={{ fontFamily: C.mono, fontSize: 12, color: pieza.cant > 1 ? C.amber : C.t2 }}>×{pieza.cant}</span>
                              </td>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                {pieza.matriz
                                  ? <span style={{ fontSize: 8, letterSpacing: 1, padding: "2px 7px", borderRadius: 99, background: "rgba(245,158,11,0.09)", color: C.amber, border: "1px solid rgba(245,158,11,0.2)", fontWeight: 700, whiteSpace: "nowrap" }}>✦ {pieza.matriz}</span>
                                  : <span style={{ opacity: 0.15, fontSize: 10 }}>—</span>}
                              </td>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <Dot color={EST[estado]?.color ?? C.t2} size={5} pulse={estado === "en_proceso"} />
                                  <Chip estado={estado} sm />
                                </div>
                              </td>

                              <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  {imgs.slice(0, 3).map((img, i) =>
                                    img.url
                                      ? <img key={i} src={img.url} alt="" className="plv-thumb"
                                          onClick={() => setPiezaModal(pieza)}
                                          style={{ width: 30, height: 30, borderRadius: 5, objectFit: "cover", border: `1px solid ${C.b0}` }} />
                                      : null
                                  )}
                                  {imgs.length > 3 && (
                                    <span style={{ fontSize: 9, color: C.t2, background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 5, padding: "2px 5px", fontFamily: C.mono }}>+{imgs.length - 3}</span>
                                  )}
                                  <button onClick={() => setPiezaModal(pieza)}
                                    style={{ background: "transparent", border: `1px dashed ${C.b0}`, color: C.t2, width: 28, height: 28, borderRadius: 5, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color .15s", flexShrink: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = C.b1}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = C.b0}
                                    title="Agregar foto">
                                    {imgs.length === 0 ? "📷" : "+"}
                                  </button>
                                </div>
                              </td>

                              <td style={{ padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle", maxWidth: 200 }}>
                                {seg?.observaciones
                                  ? <span style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 190 }}>{seg.observaciones}</span>
                                  : <span style={{ opacity: 0.18, fontSize: 11 }}>—</span>}
                              </td>

                              <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" }}>
                                <button onClick={() => setPiezaModal(pieza)}
                                  style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "3px 9px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans, transition: "all .15s" }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.b1; e.currentTarget.style.color = C.t0; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.b0; e.currentTarget.style.color = C.t2; }}>
                                  Editar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {!loading && piezasFiltradas.length === 0 && (
                    <div style={{ padding: "40px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, color: C.t2 }}>Sin resultados</div>
                      {(q || filtroEst !== "todos" || filtroMat !== "todos") && (
                        <button onClick={() => { setQ(""); setFiltroEst("todos"); setFiltroMat("todos"); }}
                          style={{ marginTop: 10, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}>
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Barra progreso pie */}
                <div style={{ padding: "7px 14px", borderTop: `1px solid ${C.b0}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${stats.pct}%`, background: `linear-gradient(90deg,${avanceColor}60,${avanceColor})`, borderRadius: 99, transition: "width .6s ease" }} />
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: avanceColor, whiteSpace: "nowrap" }}>
                    {stats.pct}% · {stats.terminadas}/{TOTAL}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal pieza */}
      {piezaModal && (
        <PiezaModal
          pieza={piezaModal}
          obraId={obraSelId}
          segRow={segMap[piezaModal.num]}
          imagenes={imagenesMap[piezaModal.num] ?? []}
          onSave={() => { setPiezaModal(null); showFlash("✓ Guardado"); cargar(); }}
          onClose={() => setPiezaModal(null)}
        />
      )}
    </>
  );
}
