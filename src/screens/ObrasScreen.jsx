/**
 * ObrasScreen v8
 * CAMBIOS:
 * — TareaCard: tarjetas ricas con prioridad, responsable, fechas, horas, archivos adjuntos
 * — TareaDetalleModal: vista completa de una tarea con todos los campos + lista de archivos
 * — TareaModal: tiene sección de "Archivos" con upload de planos, PDFs, imágenes
 * — EtapaTareasSection: reemplaza las filas simples por un grid de cards dentro del desplegable
 * — Supabase Storage: bucket "obra-archivos" para planos y documentos de tareas
 * — Vista de archivos en DetailPanel de tarea también actualizada
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const num        = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const today      = () => new Date().toISOString().slice(0, 10);
const fmtDate    = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
const fmtDateFull= d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const diasDesde  = f => !f ? 0 : Math.max(0, Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000));
const diasHasta  = f => !f ? null : Math.floor((new Date(f + "T00:00:00") - Date.now()) / 86400000);
const pct        = (done, total) => total > 0 ? Math.round((done / total) * 100) : 0;

const STORAGE_BUCKET = "obra-archivos"; // Crear en Supabase Storage

async function safeQuery(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

function extIcon(nombre) {
  const ext = (nombre ?? "").split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "📄";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼";
  if (["dwg","dxf"].includes(ext)) return "📐";
  if (["xlsx","xls","csv"].includes(ext)) return "📊";
  if (["docx","doc","txt"].includes(ext)) return "📝";
  if (["zip","rar","7z"].includes(ext)) return "📦";
  return "📎";
}

function fmtBytes(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

// ─── PALETA ────────────────────────────────────────────────────────────────────
const C = {
  bg:    "#09090b",
  s0:    "rgba(255,255,255,0.03)",
  s1:    "rgba(255,255,255,0.06)",
  s2:    "rgba(255,255,255,0.09)",
  b0:    "rgba(255,255,255,0.08)",
  b1:    "rgba(255,255,255,0.15)",
  b2:    "rgba(255,255,255,0.25)",
  t0:    "#f4f4f5",
  t1:    "#a1a1aa",
  t2:    "#71717a",
  mono:  "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:  "'Outfit', system-ui, sans-serif",
  primary:"#3b82f6",
  amber:  "#f59e0b",
  green:  "#10b981",
  red:    "#ef4444",
  purple: "#8b5cf6",
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  label: "Activa"    },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  label: "Pausada"   },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: "Terminada" },
    cancelada: { dot: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   label: "Cancelada" },
  },
  etapa: {
    pendiente:  { dot: "#52525b", bar: "rgba(255,255,255,0.05)", text: "#a1a1aa", label: "Pendiente"  },
    en_curso:   { dot: "#3b82f6", bar: "rgba(59,130,246,0.15)",  text: "#3b82f6", label: "En curso"   },
    completado: { dot: "#10b981", bar: "rgba(16,185,129,0.15)",  text: "#10b981", label: "Completado" },
    bloqueado:  { dot: "#ef4444", bar: "rgba(239,68,68,0.15)",   text: "#ef4444", label: "Bloqueado"  },
  },
  tarea: {
    pendiente:   { dot: "#52525b", text: "#a1a1aa", label: "Pendiente"    },
    en_progreso: { dot: "#3b82f6", text: "#3b82f6", label: "En progreso"  },
    finalizada:  { dot: "#10b981", text: "#10b981", label: "Finalizada"   },
    bloqueada:   { dot: "#ef4444", text: "#ef4444", label: "Bloqueada"    },
    cancelada:   { dot: "#71717a", text: "#71717a", label: "Cancelada"    },
  },
  prioridad: {
    baja:    { color: "#52525b", label: "Baja"    },
    media:   { color: "#3b82f6", label: "Media"   },
    alta:    { color: "#f59e0b", label: "Alta"    },
    critica: { color: "#ef4444", label: "Crítica" },
  },
  oc: {
    pendiente:  { dot: "#52525b", bg: "rgba(82,82,91,0.12)",   border: "rgba(82,82,91,0.25)",   label: "Pendiente"  },
    solicitada: { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)", label: "Solicitada" },
    aprobada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)", label: "Aprobada"   },
    en_camino:  { dot: "#8b5cf6", bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.25)", label: "En camino"  },
    recibida:   { dot: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)", label: "Recibida"   },
    cancelada:  { dot: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",  label: "Cancelada"  },
  },
};

const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};
const COLOR_PRESETS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#64748b","#0ea5e9","#f43f5e"];

function ocUrgencia(oc) {
  if (!oc.fecha_limite_pedido) return null;
  const d = diasHasta(oc.fecha_limite_pedido);
  if (d === null) return null;
  if (d < 0)   return { nivel: "vencida",  color: C.red,   label: `Vencida hace ${Math.abs(d)}d`, dias: d };
  if (d === 0) return { nivel: "hoy",      color: C.red,   label: "Vence hoy",                    dias: d };
  if (d <= 3)  return { nivel: "urgente",  color: C.red,   label: `Vence en ${d}d`,               dias: d };
  if (d <= 7)  return { nivel: "proxima",  color: C.amber, label: `Vence en ${d}d`,               dias: d };
  return         { nivel: "ok",       color: C.green, label: `Vence en ${d}d`,               dias: d };
}

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────
const Dot = ({ color, size = 7, glow = false }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: glow ? `0 0 7px ${color}90` : "none" }} />
);

const Chip = ({ label, dot, bg, border }) => (
  <span style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", padding: "3px 8px", borderRadius: 99, background: bg, color: dot, border: `1px solid ${border}`, fontWeight: 600, whiteSpace: "nowrap" }}>
    {label}
  </span>
);

const ProgressBar = ({ value, color, height = 3 }) => (
  <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${color}70, ${color})`, borderRadius: 99, transition: "width .5s ease" }} />
  </div>
);

function Btn({ onClick, type = "button", children, variant = "ghost", disabled = false, sx = {}, style = {}, ...rest }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 11 },
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    danger:  { border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    sm:      { border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, fontSize: 10 },
    confirm: { border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    green:   { border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.12)", color: "#34d399", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    amber:   { border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.10)", color: "#fbbf24", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} {...rest} style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: C.sans, transition: "opacity .15s", ...V[variant], ...style, ...sx }}>
      {children}
    </button>
  );
}

function InputSt({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>{label}</label>}
      {children}
    </div>
  );
}

const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 12px", borderRadius: 8, fontSize: 12,
  outline: "none", width: "100%",
};

function Overlay({ onClose, children, maxWidth = 540, fullHeight = false }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose?.()} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.85)", ...GLASS, display: "flex", justifyContent: "center", alignItems: fullHeight ? "stretch" : "flex-start", padding: fullHeight ? 0 : "40px 16px", overflowY: fullHeight ? "hidden" : "auto" }}>
      <div style={{ background: "rgba(15,15,18,0.97)", border: `1px solid ${C.b1}`, borderRadius: fullHeight ? 0 : 14, padding: 0, width: "100%", maxWidth: fullHeight ? "100%" : maxWidth, boxShadow: "0 32px 80px rgba(0,0,0,0.8)", animation: "slideUp .18s ease", fontFamily: C.sans, display: "flex", flexDirection: "column", ...(fullHeight ? { height: "100vh" } : { maxHeight: "92vh", overflow: "hidden" }) }}>
        {children}
      </div>
    </div>
  );
}

// ─── CONFIRMACIÓN ────────────────────────────────────────────────────────────
function ConfirmModal({ nombre, tipo, advertencia, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel} maxWidth={400}>
      <div style={{ padding: 26, textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚠</div>
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600, marginBottom: 6 }}>Eliminar {tipo}</div>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: C.red, marginBottom: 8 }}>{nombre}</div>
        <div style={{ fontSize: 12, color: C.t1, marginBottom: 22, lineHeight: 1.6 }}>{advertencia}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Btn variant="confirm" onClick={onConfirm}>Sí, eliminar</Btn>
          <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ─── MODAL OBRA ───────────────────────────────────────────────────────────────
function ObraModal({ lineas, lProcs, onSave, onClose }) {
  const [form, setForm] = useState({ codigo: "", descripcion: "", linea_id: "", fecha_inicio: today(), fecha_fin_estimada: "", notas: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const lineaSel   = lineas.find(l => l.id === form.linea_id);
  const procsLinea = form.linea_id ? lProcs.filter(p => p.linea_id === form.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigo.trim()) { setErr("El código es obligatorio."); return; }
    setSaving(true); setErr("");
    try {
      const { data: nueva, error: errObra } = await supabase.from("produccion_obras").insert({
        codigo: form.codigo.trim().toUpperCase(), descripcion: form.descripcion.trim() || null,
        tipo: "barco", estado: "activa", linea_id: form.linea_id || null,
        linea_nombre: lineaSel?.nombre ?? null, fecha_inicio: form.fecha_inicio || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null, notas: form.notas.trim() || null,
      }).select().single();
      if (errObra) { setErr(errObra.message); setSaving(false); return; }
      await supabase.from("laminacion_obras").upsert({ nombre: form.codigo.trim().toUpperCase(), estado: "activa", fecha_inicio: form.fecha_inicio || null }, { onConflict: "nombre", ignoreDuplicates: true }).then(() => {});
      if (form.linea_id && procsLinea.length && nueva?.id) {
        try {
          await supabase.from("obra_etapas").insert(procsLinea.map((p, i) => ({
            obra_id: nueva.id, linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden ?? i + 1,
            color: p.color ?? "#64748b", dias_estimados: p.dias_estimados, estado: "pendiente",
            genera_orden_compra: p.genera_orden_compra ?? false, orden_compra_tipo: p.orden_compra_tipo ?? "aviso",
            orden_compra_descripcion: p.orden_compra_descripcion ?? null,
            orden_compra_monto_estimado: p.orden_compra_monto_estimado ?? null,
            orden_compra_dias_previo: p.orden_compra_dias_previo ?? 7,
          })));
          await supabase.from("obra_timeline").insert(procsLinea.map(p => ({ obra_id: nueva.id, linea_proceso_id: p.id, estado: "pendiente" })));
        } catch { }
      }
      onSave(nueva);
    } catch (ex) { setErr(ex?.message ?? "Error inesperado."); setSaving(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <div style={{ padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div><div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Nueva obra</div><div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}>Asigná una línea para pre-cargar las etapas</div></div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Código *"><input style={{ ...INP, fontFamily: C.mono }} required placeholder="37-105" autoFocus value={form.codigo} onChange={e => set("codigo", e.target.value)} /></InputSt>
            <InputSt label="Línea de producción"><select style={INP} value={form.linea_id} onChange={e => set("linea_id", e.target.value)}><option value="">Sin asignar</option>{lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></InputSt>
          </div>
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Fecha inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          </div>
          <InputSt label="Notas"><input style={INP} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
          {procsLinea.length > 0 && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.18)" }}>
              <div style={{ fontSize: 11, color: "#10b981", marginBottom: 6 }}>Se crean {procsLinea.length} etapas desde {lineaSel?.nombre}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{procsLinea.map(p => <span key={p.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: C.s0, color: C.t1, border: `1px solid ${C.b0}` }}>{p.nombre}{p.genera_orden_compra ? " 🛒" : ""}</span>)}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Creando…" : "Crear obra"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── MODAL ETAPA ──────────────────────────────────────────────────────────────
function EtapaModal({ etapa, obraId, onSave, onClose }) {
  const isEdit = !!etapa?.id;
  const [form, setForm] = useState({
    nombre: etapa?.nombre ?? "", descripcion: etapa?.descripcion ?? "", color: etapa?.color ?? "#64748b",
    dias_estimados: etapa?.dias_estimados ?? "", fecha_inicio: etapa?.fecha_inicio ?? "",
    fecha_fin_estimada: etapa?.fecha_fin_estimada ?? "",
    genera_orden_compra: etapa?.genera_orden_compra ?? false,
    orden_compra_tipo: etapa?.orden_compra_tipo ?? "aviso", orden_compra_descripcion: etapa?.orden_compra_descripcion ?? "",
    orden_compra_monto_estimado: etapa?.orden_compra_monto_estimado ?? "", orden_compra_dias_previo: etapa?.orden_compra_dias_previo ?? 7,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, color: form.color,
      dias_estimados: form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      fecha_inicio: form.fecha_inicio || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
      genera_orden_compra: form.genera_orden_compra,
      orden_compra_tipo: form.genera_orden_compra ? form.orden_compra_tipo : null,
      orden_compra_descripcion: form.genera_orden_compra ? (form.orden_compra_descripcion.trim() || null) : null,
      orden_compra_monto_estimado: form.genera_orden_compra && form.orden_compra_monto_estimado !== "" ? num(form.orden_compra_monto_estimado) : null,
      orden_compra_dias_previo: form.genera_orden_compra ? num(form.orden_compra_dias_previo) : null,
    };
    const { error } = isEdit
      ? await supabase.from("obra_etapas").update(payload).eq("id", etapa.id)
      : await supabase.from("obra_etapas").insert({ ...payload, obra_id: obraId, orden: 999, estado: "pendiente" });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  return (
    <Overlay onClose={onClose} maxWidth={500}>
      <div style={{ padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar etapa" : "Nueva etapa"}</div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <InputSt label="Nombre *"><input style={INP} required autoFocus value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Días estimados"><input type="number" min="0" step="0.5" style={INP} value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} /></InputSt>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={form.color} onChange={e => set("color", e.target.value)} style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{COLOR_PRESETS.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 15, height: 15, borderRadius: 3, background: c, cursor: "pointer", border: form.color === c ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent" }} />)}</div>
              </div>
            </InputSt>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          </div>
          <OrdenCompraSection genera={form.genera_orden_compra} tipo={form.orden_compra_tipo} desc={form.orden_compra_descripcion} monto={form.orden_compra_monto_estimado} diasPrevio={form.orden_compra_dias_previo} onChange={set} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar" : "Crear etapa"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── MODAL TAREA (completo con archivos) ──────────────────────────────────────
function TareaModal({ tarea, etapaId, obraId, onSave, onClose }) {
  const isEdit = !!tarea?.id;
  const [tab, setTab] = useState("general"); // general | archivos
  const [form, setForm] = useState({
    nombre:              tarea?.nombre              ?? "",
    descripcion:         tarea?.descripcion         ?? "",
    estado:              tarea?.estado              ?? "pendiente",
    prioridad:           tarea?.prioridad           ?? "media",
    fecha_inicio:        tarea?.fecha_inicio        ?? "",
    fecha_fin_estimada:  tarea?.fecha_fin_estimada  ?? "",
    fecha_fin_real:      tarea?.fecha_fin_real      ?? "",
    dias_estimados:      tarea?.dias_estimados      ?? "",
    horas_estimadas:     tarea?.horas_estimadas     ?? "",
    horas_reales:        tarea?.horas_reales        ?? "",
    personas_necesarias: tarea?.personas_necesarias ?? "",
    responsable:         tarea?.responsable         ?? "",
    observaciones:       tarea?.observaciones       ?? "",
  });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");
  const [archivos, setArchivos] = useState([]);
  const [loadingArch, setLoadingArch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Cargar archivos si estamos editando
  useEffect(() => {
    if (isEdit && tarea?.id) cargarArchivos();
  }, []);

  async function cargarArchivos() {
    setLoadingArch(true);
    const data = await safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tarea.id).order("created_at"));
    setArchivos(data);
    setLoadingArch(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null,
      estado: form.estado, prioridad: form.prioridad,
      fecha_inicio: form.fecha_inicio || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
      fecha_fin_real: form.fecha_fin_real || null,
      dias_estimados: form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      horas_estimadas: form.horas_estimadas !== "" ? num(form.horas_estimadas) : null,
      horas_reales: form.horas_reales !== "" ? num(form.horas_reales) : null,
      personas_necesarias: form.personas_necesarias !== "" ? parseInt(form.personas_necesarias) : null,
      responsable: form.responsable.trim() || null,
      observaciones: form.observaciones.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("obra_tareas").update(payload).eq("id", tarea.id)
      : await supabase.from("obra_tareas").insert({ ...payload, etapa_id: etapaId, obra_id: obraId, orden: 999 });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  async function subirArchivo(file) {
    if (!isEdit || !tarea?.id) {
      setUploadErr("Guarda la tarea primero antes de subir archivos.");
      return;
    }
    setUploading(true); setUploadErr("");
    const ext  = file.name.split(".").pop();
    const path = `${obraId}/${etapaId}/${tarea.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (upErr) { setUploadErr(upErr.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    await supabase.from("obra_tarea_archivos").insert({
      tarea_id: tarea.id, etapa_id: etapaId, obra_id: obraId,
      nombre_archivo: file.name, storage_path: path, url_publica: publicUrl,
      tipo_mime: file.type, tamano_bytes: file.size,
    });
    setUploading(false);
    cargarArchivos();
  }

  async function eliminarArchivo(arch) {
    if (!window.confirm(`¿Eliminar "${arch.nombre_archivo}"?`)) return;
    await supabase.storage.from(STORAGE_BUCKET).remove([arch.storage_path]);
    await supabase.from("obra_tarea_archivos").delete().eq("id", arch.id);
    cargarArchivos();
  }

  const secBorder = { padding: "12px 14px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 12 };

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      {/* Header fijo */}
      <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar tarea" : "Nueva tarea"}</div>
            <div style={{ fontSize: 11, color: C.t1, marginTop: 2 }}>Solo el nombre es obligatorio</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
          {[["general","📋 General"],["archivos",`📎 Archivos${archivos.length ? ` (${archivos.length})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: "7px 18px", border: "none", borderBottom: tab === k ? `2px solid ${C.primary}` : "2px solid transparent", background: "transparent", color: tab === k ? C.t0 : C.t1, fontSize: 12, cursor: "pointer", fontFamily: C.sans, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Body scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5", marginTop: 0 }}>{err}</div>}

        {tab === "general" && (
          <form id="tarea-form" onSubmit={handleSubmit}>
            <InputSt label="Nombre *"><input style={INP} required autoFocus placeholder="Ej: Laminado de fondo" value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>

            {/* Estado + Prioridad */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {Object.entries(C.tarea).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 9, border: form.estado === k ? `1px solid ${v.text}55` : `1px solid ${C.b0}`, background: form.estado === k ? `${v.text}14` : C.s0, color: form.estado === k ? v.text : C.t1, fontFamily: C.sans }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Prioridad</label>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {Object.entries(C.prioridad).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("prioridad", k)} style={{ padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 9, border: form.prioridad === k ? `1px solid ${v.color}55` : `1px solid ${C.b0}`, background: form.prioridad === k ? `${v.color}18` : C.s0, color: form.prioridad === k ? v.color : C.t1, fontFamily: C.sans }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <InputSt label="Descripción / Detalle de la tarea">
              <textarea style={{ ...INP, resize: "vertical", minHeight: 68 }} placeholder="Describí qué hay que hacer, materiales necesarios, especificaciones técnicas…" value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
            </InputSt>

            {/* RESPONSABLE + PERSONAS */}
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Equipo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InputSt label="Responsable">
                  <input style={INP} placeholder="Nombre del responsable" value={form.responsable} onChange={e => set("responsable", e.target.value)} />
                </InputSt>
                <InputSt label="Personas necesarias">
                  <input type="number" min="0" step="1" style={INP} placeholder="1" value={form.personas_necesarias} onChange={e => set("personas_necesarias", e.target.value)} />
                </InputSt>
              </div>
            </div>

            {/* FECHAS */}
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
                <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
                <InputSt label="Fin real"><input type="date" style={INP} value={form.fecha_fin_real} onChange={e => set("fecha_fin_real", e.target.value)} /></InputSt>
              </div>
            </div>

            {/* TIEMPO */}
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Tiempo estimado</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Días estimados">
                  <input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} />
                </InputSt>
                <InputSt label="Horas estimadas">
                  <input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.horas_estimadas} onChange={e => set("horas_estimadas", e.target.value)} />
                </InputSt>
                <InputSt label="Horas reales">
                  <input type="number" min="0" step="0.5" style={INP} placeholder="0" value={form.horas_reales} onChange={e => set("horas_reales", e.target.value)} />
                </InputSt>
              </div>
            </div>

            <InputSt label="Observaciones / Notas adicionales">
              <textarea style={{ ...INP, resize: "vertical", minHeight: 60 }} placeholder="Notas, advertencias, instrucciones especiales…" value={form.observaciones} onChange={e => set("observaciones", e.target.value)} />
            </InputSt>
          </form>
        )}

        {tab === "archivos" && (
          <div>
            {!isEdit && (
              <div style={{ padding: "16px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, marginBottom: 16, fontSize: 11, color: C.amber }}>
                ℹ Guarda la tarea primero para poder subir archivos.
              </div>
            )}

            {/* Drop zone / Upload */}
            {isEdit && (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.primary; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = C.b1; }}
                onDrop={e => {
                  e.preventDefault(); e.currentTarget.style.borderColor = C.b1;
                  const files = [...(e.dataTransfer?.files ?? [])];
                  files.forEach(f => subirArchivo(f));
                }}
                style={{ border: `2px dashed ${C.b1}`, borderRadius: 10, padding: "28px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16, transition: "border-color .2s", background: C.s0 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{uploading ? "⏳" : "📎"}</div>
                <div style={{ fontSize: 12, color: C.t0, fontWeight: 500, marginBottom: 4 }}>{uploading ? "Subiendo…" : "Arrastrá archivos aquí o hacé click"}</div>
                <div style={{ fontSize: 10, color: C.t2 }}>Planos (DWG, DXF), PDFs, imágenes, documentos</div>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { [...(e.target.files ?? [])].forEach(f => subirArchivo(f)); e.target.value = ""; }} />
              </div>
            )}
            {uploadErr && <div style={{ padding: "7px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 11, color: "#fca5a5" }}>{uploadErr}</div>}

            {/* Lista de archivos */}
            {loadingArch && <div style={{ textAlign: "center", padding: "24px 0", color: C.t2, fontSize: 11 }}>Cargando archivos…</div>}
            {!loadingArch && archivos.length === 0 && isEdit && (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.t2, fontSize: 11 }}>Sin archivos adjuntos todavía</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {archivos.map(arch => (
                <div key={arch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.s0, border: `1px solid ${C.b0}` }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                    <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>{fmtBytes(arch.tamano_bytes)} · {fmtDate(arch.created_at?.slice(0, 10))}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a href={arch.url_publica} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, textDecoration: "none", cursor: "pointer", fontFamily: C.sans }}>Ver</a>
                    <a href={arch.url_publica} download={arch.nombre_archivo} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid rgba(59,130,246,0.3)`, background: "rgba(59,130,246,0.08)", color: "#60a5fa", textDecoration: "none", cursor: "pointer", fontFamily: C.sans }}>⬇</a>
                    <button type="button" onClick={() => eliminarArchivo(arch)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", color: C.t2, cursor: "pointer" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer fijo */}
      <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.b0}`, display: "flex", gap: 8, flexShrink: 0 }}>
        {tab === "general" && <Btn type="submit" form="tarea-form" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}</Btn>}
        <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        {isEdit && tab === "general" && <Btn variant="outline" sx={{ marginLeft: "auto" }} onClick={() => setTab("archivos")}>📎 Ver archivos ({archivos.length})</Btn>}
      </div>
    </Overlay>
  );
}

// ─── TAREA CARD (tarjeta dentro del desplegable de etapa) ──────────────────────
function TareaCard({ tarea, esGestion, archivosCount, onCambiarEstado, onEditar, onDetalle, onEliminar }) {
  const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
  const pc = C.prioridad[tarea.prioridad ?? "media"];
  const diasVence = diasHasta(tarea.fecha_fin_estimada);
  const atrasada  = diasVence !== null && diasVence < 0 && !["finalizada","cancelada"].includes(tarea.estado);
  const urgente   = diasVence !== null && diasVence <= 2 && !["finalizada","cancelada"].includes(tarea.estado);

  return (
    <div
      style={{
        border: `1px solid ${atrasada ? "rgba(239,68,68,0.3)" : urgente ? "rgba(245,158,11,0.25)" : C.b0}`,
        borderLeft: `3px solid ${pc.color}`,
        borderRadius: 8, background: C.s0, marginBottom: 6,
        transition: "border-color .15s, background .15s",
        cursor: "pointer",
      }}
      onClick={() => onDetalle(tarea)}
    >
      {/* Row principal */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px 8px" }}>
        {/* Estado dot */}
        <div style={{ paddingTop: 3 }}>
          <Dot color={tc.text} size={7} glow={tarea.estado === "en_progreso"} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.t0, fontWeight: 500, wordBreak: "break-word" }}>{tarea.nombre}</span>
            {atrasada && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(239,68,68,0.12)", color: C.red, border: "1px solid rgba(239,68,68,0.25)", flexShrink: 0 }}>ATRASADA</span>}
            {urgente && !atrasada && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: C.amber, border: "1px solid rgba(245,158,11,0.25)", flexShrink: 0 }}>HOY/MAÑANA</span>}
          </div>

          {tarea.descripcion && (
            <div style={{ fontSize: 10, color: C.t2, marginBottom: 6, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {tarea.descripcion}
            </div>
          )}

          {/* Métricas en chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Estado */}
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: `${tc.text}14`, color: tc.text, border: `1px solid ${tc.text}28` }}>{tc.label}</span>

            {/* Prioridad */}
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: `${pc.color}12`, color: pc.color, border: `1px solid ${pc.color}28` }}>{pc.label}</span>

            {/* Responsable */}
            {tarea.responsable && (
              <span style={{ fontSize: 9, color: C.t1, display: "flex", alignItems: "center", gap: 3 }}>
                👤 {tarea.responsable}
                {tarea.personas_necesarias > 1 && ` +${tarea.personas_necesarias - 1}`}
              </span>
            )}

            {/* Tiempo */}
            {(tarea.dias_estimados || tarea.horas_estimadas) && (
              <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>
                {tarea.dias_estimados ? `${tarea.dias_estimados}d` : ""}
                {tarea.dias_estimados && tarea.horas_estimadas ? " / " : ""}
                {tarea.horas_estimadas ? `${tarea.horas_estimadas}h` : ""}
              </span>
            )}

            {/* Fechas */}
            {(tarea.fecha_inicio || tarea.fecha_fin_estimada) && (
              <span style={{ fontSize: 9, color: atrasada ? C.red : urgente ? C.amber : C.t2, fontFamily: C.mono }}>
                📅 {fmtDate(tarea.fecha_inicio)} → {fmtDate(tarea.fecha_fin_estimada)}
              </span>
            )}

            {/* Archivos */}
            {archivosCount > 0 && (
              <span style={{ fontSize: 9, color: C.primary }}>📎 {archivosCount}</span>
            )}
          </div>
        </div>

        {/* Acciones (click individual para no abrir detalle) */}
        {esGestion && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {/* Cambiar estado quick */}
            <div style={{ display: "flex", gap: 3 }}>
              {tarea.estado === "pendiente" && (
                <button type="button" onClick={() => onCambiarEstado(tarea.id, "en_progreso")}
                  style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid rgba(59,130,246,0.3)`, background: "rgba(59,130,246,0.08)", color: "#60a5fa", cursor: "pointer", fontFamily: C.sans, whiteSpace: "nowrap" }}>
                  ▶ Iniciar
                </button>
              )}
              {tarea.estado === "en_progreso" && (
                <button type="button" onClick={() => onCambiarEstado(tarea.id, "finalizada")}
                  style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid rgba(16,185,129,0.3)`, background: "rgba(16,185,129,0.08)", color: C.green, cursor: "pointer", fontFamily: C.sans, whiteSpace: "nowrap" }}>
                  ✓ Finalizar
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <button type="button" onClick={() => onEditar(tarea)}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, cursor: "pointer" }}>✎</button>
              <button type="button" onClick={() => onEliminar(tarea)}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", color: C.t2, cursor: "pointer" }}>×</button>
            </div>
          </div>
        )}
      </div>

      {/* Barra de progreso de horas si hay reales */}
      {tarea.horas_estimadas && tarea.horas_reales && (
        <div style={{ padding: "0 12px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 8, color: C.t2 }}>Horas</span>
            <span style={{ fontSize: 8, color: C.t2, fontFamily: C.mono }}>{tarea.horas_reales}/{tarea.horas_estimadas}h</span>
          </div>
          <ProgressBar value={pct(num(tarea.horas_reales), num(tarea.horas_estimadas))} color={tc.text} height={2} />
        </div>
      )}
    </div>
  );
}

// ─── MODAL DETALLE TAREA (pantalla completa) ──────────────────────────────────
function TareaDetalleModal({ tarea, onClose, onEditar, esGestion }) {
  const [archivos, setArchivos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
  const pc = C.prioridad[tarea.prioridad ?? "media"];

  useEffect(() => { cargarArchivos(); }, []);

  async function cargarArchivos() {
    setLoading(true);
    const data = await safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tarea.id).order("created_at"));
    setArchivos(data);
    setLoading(false);
  }

  const Row = ({ icon, label, value, mono }) => value ? (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.b0}` }}>
      <span style={{ width: 20, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 11, color: C.t2, width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.t0, fontFamily: mono ? C.mono : C.sans, flex: 1 }}>{value}</span>
    </div>
  ) : null;

  return (
    <Overlay onClose={onClose} maxWidth={700}>
      {/* Header */}
      <div style={{ padding: "20px 26px 16px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 4, height: 48, borderRadius: 2, background: pc.color, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, color: C.t0, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>{tarea.nombre}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, padding: "3px 9px", borderRadius: 99, background: `${tc.text}14`, color: tc.text, border: `1px solid ${tc.text}28`, letterSpacing: 1, textTransform: "uppercase" }}>{tc.label}</span>
              <span style={{ fontSize: 9, padding: "3px 9px", borderRadius: 99, background: `${pc.color}12`, color: pc.color, border: `1px solid ${pc.color}28`, letterSpacing: 1, textTransform: "uppercase" }}>Prioridad {pc.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
            {esGestion && <Btn variant="outline" onClick={() => { onClose(); onEditar(tarea); }}>✎ Editar</Btn>}
            <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
          </div>
        </div>
      </div>

      {/* Contenido scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 26px" }}>

        {tarea.descripcion && (
          <div style={{ marginBottom: 20, padding: "14px 16px", background: "rgba(59,130,246,0.04)", border: `1px solid rgba(59,130,246,0.15)`, borderRadius: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 6, textTransform: "uppercase" }}>Descripción</div>
            <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{tarea.descripcion}</div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Equipo */}
          <div style={{ padding: "14px 16px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Equipo</div>
            <Row icon="👤" label="Responsable" value={tarea.responsable} />
            <Row icon="👥" label="Personas" value={tarea.personas_necesarias ? `${tarea.personas_necesarias} persona${tarea.personas_necesarias > 1 ? "s" : ""}` : null} />
          </div>

          {/* Tiempo */}
          <div style={{ padding: "14px 16px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Tiempo</div>
            <Row icon="📅" label="Días estimados"  value={tarea.dias_estimados ? `${tarea.dias_estimados}d` : null} mono />
            <Row icon="⏱" label="Horas estimadas" value={tarea.horas_estimadas ? `${tarea.horas_estimadas} hs` : null} mono />
            <Row icon="⏰" label="Horas reales"    value={tarea.horas_reales    ? `${tarea.horas_reales} hs`    : null} mono />
            {tarea.horas_estimadas && tarea.horas_reales && (
              <div style={{ marginTop: 8 }}>
                <ProgressBar value={pct(num(tarea.horas_reales), num(tarea.horas_estimadas))} color={tc.text} height={4} />
                <div style={{ fontSize: 9, color: C.t2, marginTop: 3, textAlign: "right" }}>
                  {pct(num(tarea.horas_reales), num(tarea.horas_estimadas))}% completado
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fechas */}
        {(tarea.fecha_inicio || tarea.fecha_fin_estimada || tarea.fecha_fin_real) && (
          <div style={{ padding: "14px 16px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[["Inicio", tarea.fecha_inicio], ["Fin estimado", tarea.fecha_fin_estimada], ["Fin real", tarea.fecha_fin_real]].map(([label, val]) => val && (
                <div key={label}>
                  <div style={{ fontSize: 9, color: C.t2, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 13, color: C.t0 }}>{fmtDateFull(val)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tarea.observaciones && (
          <div style={{ padding: "14px 16px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 8, textTransform: "uppercase" }}>Observaciones</div>
            <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{tarea.observaciones}</div>
          </div>
        )}

        {/* ARCHIVOS */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>
            Archivos adjuntos {archivos.length > 0 && `(${archivos.length})`}
          </div>
          {loading && <div style={{ color: C.t2, fontSize: 11 }}>Cargando…</div>}
          {!loading && archivos.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: C.t2, fontSize: 11, border: `1px dashed ${C.b0}`, borderRadius: 8 }}>
              Sin archivos · Editá la tarea para subir planos y documentos
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {archivos.map(arch => (
              <a key={arch.id} href={arch.url_publica} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.s0, border: `1px solid ${C.b0}`, textDecoration: "none", transition: "border-color .15s" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                  <div style={{ fontSize: 9, color: C.t2 }}>{fmtBytes(arch.tamano_bytes)}</div>
                </div>
                <span style={{ fontSize: 10, color: C.t2, flexShrink: 0 }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── SECCIÓN DE TAREAS DENTRO DE ETAPA ───────────────────────────────────────
function EtapaTareasSection({ etapa, tareas, archivosCount, esGestion, onCambiarEstado, onEditar, onDetalle, onEliminar, onNueva }) {
  const finalizadas = tareas.filter(t => t.estado === "finalizada").length;
  const epct = pct(finalizadas, tareas.length);
  const ec   = C.etapa[etapa.estado] ?? C.etapa.pendiente;

  return (
    <div style={{ marginTop: 4, paddingLeft: 14, paddingBottom: 4 }}>
      {/* Resumen mini */}
      {tareas.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "4px 0" }}>
          <ProgressBar value={epct} color={ec.dot} height={3} />
          <span style={{ fontSize: 9, color: ec.text, fontFamily: C.mono, flexShrink: 0 }}>{finalizadas}/{tareas.length} · {epct}%</span>
        </div>
      )}

      {/* Cards */}
      {tareas.map(tarea => (
        <TareaCard
          key={tarea.id}
          tarea={tarea}
          esGestion={esGestion}
          archivosCount={archivosCount[tarea.id] ?? 0}
          onCambiarEstado={onCambiarEstado}
          onEditar={onEditar}
          onDetalle={onDetalle}
          onEliminar={onEliminar}
        />
      ))}

      {/* Botón nueva tarea */}
      {esGestion && (
        <button type="button" onClick={onNueva}
          style={{ width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 7, cursor: "pointer", border: `1px dashed ${C.b1}`, background: "transparent", color: C.t2, fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "border-color .15s, color .15s" }}>
          + Nueva tarea en {etapa.nombre}
        </button>
      )}
      {tareas.length === 0 && !esGestion && (
        <div style={{ padding: "12px 0", color: C.t2, fontSize: 10, textAlign: "center" }}>Sin tareas en esta etapa</div>
      )}
    </div>
  );
}

// ─── SECCIÓN OC ──────────────────────────────────────────────────────────────
function OrdenCompraSection({ genera, tipo, desc, monto, diasPrevio = 7, onChange }) {
  return (
    <div style={{ padding: "10px 12px", background: genera ? "rgba(245,158,11,0.05)" : C.s0, border: `1px solid ${genera ? "rgba(245,158,11,0.2)" : C.b0}`, borderRadius: 8, marginTop: 8, transition: "all .2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: genera ? 10 : 0 }}>
        <span style={{ fontSize: 11, color: genera ? C.amber : C.t2 }}>🛒 Orden de compra al completar</span>
        <button type="button" onClick={() => onChange("genera_orden_compra", !genera)} style={{ width: 34, height: 18, borderRadius: 99, border: "none", flexShrink: 0, cursor: "pointer", background: genera ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.07)", position: "relative", transition: "background .2s" }}>
          <div style={{ position: "absolute", top: 3, left: genera ? 15 : 3, width: 12, height: 12, borderRadius: "50%", background: genera ? "#fbbf24" : "#383838", transition: "left .18s" }} />
        </button>
      </div>
      {genera && (
        <>
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {[["aviso","Aviso"],["compra","Orden"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => onChange("orden_compra_tipo", v)} style={{ flex: 1, padding: "5px", borderRadius: 6, cursor: "pointer", fontSize: 10, border: tipo === v ? "1px solid rgba(245,158,11,0.4)" : `1px solid ${C.b0}`, background: tipo === v ? "rgba(245,158,11,0.12)" : C.s0, color: tipo === v ? C.amber : C.t1, fontFamily: C.sans }}>{l}</button>
            ))}
          </div>
          <InputSt label="Descripción / Materiales">
            <textarea style={{ ...INP, resize: "vertical", minHeight: 48 }} placeholder="Materiales, proveedor sugerido…" value={desc} onChange={e => onChange("orden_compra_descripcion", e.target.value)} />
          </InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <InputSt label="Monto estimado ($)">
              <input type="number" min="0" step="0.01" style={INP} value={monto} onChange={e => onChange("orden_compra_monto_estimado", e.target.value)} />
            </InputSt>
            <InputSt label="Días de anticipación">
              <input type="number" min="0" step="1" style={INP} placeholder="7" value={diasPrevio} onChange={e => onChange("orden_compra_dias_previo", e.target.value)} />
            </InputSt>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MODAL OC ────────────────────────────────────────────────────────────────
function OrdenCompraModal({ oc, obras, onSave, onClose }) {
  const [form, setForm] = useState({
    estado: oc.estado ?? "pendiente", tipo: oc.tipo ?? "aviso",
    descripcion: oc.descripcion ?? "", monto_estimado: oc.monto_estimado ?? "",
    monto_real: oc.monto_real ?? "", proveedor: oc.proveedor ?? "",
    numero_oc: oc.numero_oc ?? "", fecha_pedido: oc.fecha_pedido ?? "",
    fecha_estimada_entrega: oc.fecha_estimada_entrega ?? "",
    fecha_limite_pedido: oc.fecha_limite_pedido ?? "", notas: oc.notas ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const obra = obras.find(o => o.id === oc.obra_id);
  const urg  = ocUrgencia({ ...oc, fecha_limite_pedido: form.fecha_limite_pedido || oc.fecha_limite_pedido });

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setErr("");
    const payload = {
      estado: form.estado, tipo: form.tipo, descripcion: form.descripcion.trim() || null,
      monto_estimado: form.monto_estimado !== "" ? num(form.monto_estimado) : null,
      monto_real: form.monto_real !== "" ? num(form.monto_real) : null,
      proveedor: form.proveedor.trim() || null, numero_oc: form.numero_oc.trim() || null,
      fecha_pedido: form.fecha_pedido || null, fecha_estimada_entrega: form.fecha_estimada_entrega || null,
      fecha_limite_pedido: form.fecha_limite_pedido || null, notas: form.notas.trim() || null,
    };
    const { error } = await supabase.from("ordenes_compra").update(payload).eq("id", oc.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  return (
    <Overlay onClose={onClose} maxWidth={580}>
      <div style={{ padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Orden de compra</div>
            <div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}><span style={{ fontFamily: C.mono }}>{obra?.codigo ?? "—"}</span>{oc.etapa_nombre && <span style={{ color: C.t2 }}> · {oc.etapa_nombre}</span>}</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {urg && <div style={{ padding: "8px 12px", marginBottom: 14, borderRadius: 7, background: `${urg.color}12`, border: `1px solid ${urg.color}35`, fontSize: 11, color: urg.color }}> ⚠ {urg.label}</div>}
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <InputSt label="Estado">
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {Object.entries(C.oc).map(([k, v]) => (
                <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 10, border: form.estado === k ? `1px solid ${v.dot}55` : `1px solid ${C.b0}`, background: form.estado === k ? v.bg : C.s0, color: form.estado === k ? v.dot : C.t1, fontFamily: C.sans }}>{v.label}</button>
              ))}
            </div>
          </InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputSt label="Proveedor"><input style={INP} placeholder="Nombre del proveedor" value={form.proveedor} onChange={e => set("proveedor", e.target.value)} /></InputSt>
            <InputSt label="N° OC / Referencia"><input style={{ ...INP, fontFamily: C.mono }} placeholder="OC-2025-001" value={form.numero_oc} onChange={e => set("numero_oc", e.target.value)} /></InputSt>
          </div>
          <InputSt label="Descripción / Materiales"><textarea style={{ ...INP, resize: "vertical", minHeight: 56 }} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputSt label="Monto estimado ($)"><input type="number" min="0" step="0.01" style={INP} value={form.monto_estimado} onChange={e => set("monto_estimado", e.target.value)} /></InputSt>
            <InputSt label="Monto real ($)"><input type="number" min="0" step="0.01" style={INP} value={form.monto_real} onChange={e => set("monto_real", e.target.value)} /></InputSt>
          </div>
          <div style={{ padding: "12px 14px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <InputSt label="Límite para pedir"><input type="date" style={INP} value={form.fecha_limite_pedido} onChange={e => set("fecha_limite_pedido", e.target.value)} /></InputSt>
              <InputSt label="Pedido el"><input type="date" style={INP} value={form.fecha_pedido} onChange={e => set("fecha_pedido", e.target.value)} /></InputSt>
              <InputSt label="Entrega estimada"><input type="date" style={INP} value={form.fecha_estimada_entrega} onChange={e => set("fecha_estimada_entrega", e.target.value)} /></InputSt>
            </div>
          </div>
          <InputSt label="Notas internas"><textarea style={{ ...INP, resize: "vertical", minHeight: 52 }} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── PLANTILLA LÍNEA ─────────────────────────────────────────────────────────
function LineasEtapasModal({ linea, lProcs, onClose, onSaved }) {
  const etapasLinea = lProcs.filter(p => p.linea_id === linea.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const [items, setItems] = useState(etapasLinea);
  const [editIdx, setEditIdx] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "", orden_compra_dias_previo: 7 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [editBuf, setEditBuf] = useState({});

  function flash(ok, text) { setToast({ ok, text }); setTimeout(() => setToast(null), 2500); }
  function startEdit(idx) { setEditIdx(idx); setEditBuf({ ...items[idx] }); }
  function cancelEdit() { setEditIdx(null); setEditBuf({}); }
  const eb = (k, v) => setEditBuf(f => ({ ...f, [k]: v }));

  async function saveEdit(idx) {
    setSaving(true);
    const item = items[idx];
    const payload = {
      nombre: editBuf.nombre?.trim() || item.nombre, dias_estimados: editBuf.dias_estimados !== "" ? num(editBuf.dias_estimados) : null,
      color: editBuf.color ?? item.color, genera_orden_compra: editBuf.genera_orden_compra ?? false,
      orden_compra_tipo: editBuf.genera_orden_compra ? (editBuf.orden_compra_tipo ?? "aviso") : null,
      orden_compra_descripcion: editBuf.genera_orden_compra ? (editBuf.orden_compra_descripcion?.trim() || null) : null,
      orden_compra_monto_estimado: editBuf.genera_orden_compra && editBuf.orden_compra_monto_estimado !== "" ? num(editBuf.orden_compra_monto_estimado) : null,
      orden_compra_dias_previo: editBuf.genera_orden_compra ? num(editBuf.orden_compra_dias_previo ?? 7) : null,
    };
    const { error } = await supabase.from("linea_procesos").update(payload).eq("id", item.id);
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...payload } : it));
    setEditIdx(null); flash(true, "Guardado."); setSaving(false); onSaved();
  }

  async function addEtapa() {
    if (!newForm.nombre.trim()) return; setSaving(true);
    const maxOrden = Math.max(0, ...items.map(p => p.orden ?? 0));
    const { data, error } = await supabase.from("linea_procesos").insert({
      linea_id: linea.id, nombre: newForm.nombre.trim(), dias_estimados: newForm.dias_estimados !== "" ? num(newForm.dias_estimados) : null,
      color: newForm.color, orden: maxOrden + 1, activo: true,
      genera_orden_compra: newForm.genera_orden_compra,
      orden_compra_tipo: newForm.genera_orden_compra ? newForm.orden_compra_tipo : null,
      orden_compra_descripcion: newForm.genera_orden_compra ? (newForm.orden_compra_descripcion.trim() || null) : null,
      orden_compra_monto_estimado: newForm.genera_orden_compra && newForm.orden_compra_monto_estimado !== "" ? num(newForm.orden_compra_monto_estimado) : null,
      orden_compra_dias_previo: newForm.genera_orden_compra ? num(newForm.orden_compra_dias_previo) : null,
    }).select().single();
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => [...prev, data]); setAdding(false);
    setNewForm({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "", orden_compra_dias_previo: 7 });
    flash(true, "Etapa agregada."); setSaving(false); onSaved();
  }

  async function deleteEtapa(item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}" de la plantilla?`)) return;
    const { error } = await supabase.from("linea_procesos").delete().eq("id", item.id);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.filter(it => it.id !== item.id)); flash(true, "Eliminada."); onSaved();
  }

  async function moveItem(idx, dir) {
    const next = [...items]; const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]; setItems(next);
    await Promise.all(next.map((it, i) => supabase.from("linea_procesos").update({ orden: i + 1 }).eq("id", it.id)));
    onSaved();
  }

  const btnIcon = { border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "2px 7px", borderRadius: 5, fontFamily: C.sans };

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, padding: "10px 18px", borderRadius: 8, fontSize: 12, fontFamily: C.sans, background: toast.ok ? "#091510" : "#150909", border: `1px solid ${toast.ok ? "rgba(60,140,80,0.5)" : "rgba(180,60,60,0.5)"}`, color: toast.ok ? "#70c080" : "#c07070" }}>{toast.text}</div>}
      <div style={{ padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Plantilla de etapas</div>
            <div style={{ fontSize: 11, color: C.t1, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: linea.color ?? C.t2 }} />{linea.nombre}</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        <div style={{ maxHeight: "55vh", overflowY: "auto", marginBottom: 12 }}>
          {items.length === 0 && !adding && <div style={{ textAlign: "center", padding: "28px 0", color: C.t2, fontSize: 12 }}>Sin etapas en esta plantilla</div>}
          {items.map((item, idx) => {
            const isEditing = editIdx === idx;
            return (
              <div key={item.id} style={{ border: `1px solid ${isEditing ? "rgba(59,130,246,0.3)" : C.b0}`, borderRadius: 9, marginBottom: 6, background: isEditing ? "rgba(59,130,246,0.04)" : C.s0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
                  <div style={{ width: 3, height: 22, borderRadius: 2, background: item.color ?? "#64748b", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: C.t0, fontWeight: 500 }}>{item.nombre}</span>
                  {item.dias_estimados && <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{item.dias_estimados}d</span>}
                  {item.genera_orden_compra && <span style={{ fontSize: 9, color: C.amber, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 7px", borderRadius: 4 }}>🛒</span>}
                  <div style={{ display: "flex", gap: 3 }}>
                    <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ ...btnIcon, opacity: idx === 0 ? 0.2 : 1 }}>↑</button>
                    <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} style={{ ...btnIcon, opacity: idx === items.length - 1 ? 0.2 : 1 }}>↓</button>
                    <button type="button" onClick={() => isEditing ? cancelEdit() : startEdit(idx)} style={{ ...btnIcon, color: isEditing ? C.primary : C.t2 }}>{isEditing ? "✕" : "✎"}</button>
                    <button type="button" onClick={() => deleteEtapa(item)} style={{ ...btnIcon, color: C.red }}>×</button>
                  </div>
                </div>
                {isEditing && (
                  <div style={{ padding: "0 12px 12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, marginBottom: 8 }}>
                      <InputSt label="Nombre"><input style={INP} value={editBuf.nombre ?? item.nombre} onChange={e => eb("nombre", e.target.value)} /></InputSt>
                      <InputSt label="Días"><input type="number" min="0" step="0.5" style={INP} value={editBuf.dias_estimados ?? item.dias_estimados ?? ""} onChange={e => eb("dias_estimados", e.target.value)} /></InputSt>
                    </div>
                    <InputSt label="Color">
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <input type="color" value={editBuf.color ?? item.color ?? "#64748b"} onChange={e => eb("color", e.target.value)} style={{ width: 30, height: 28, border: "none", background: "none", cursor: "pointer" }} />
                        {COLOR_PRESETS.map(c => <div key={c} onClick={() => eb("color", c)} style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: "pointer", border: (editBuf.color ?? item.color) === c ? "2px solid #fff" : "2px solid transparent" }} />)}
                      </div>
                    </InputSt>
                    <OrdenCompraSection genera={editBuf.genera_orden_compra ?? item.genera_orden_compra ?? false} tipo={editBuf.orden_compra_tipo ?? item.orden_compra_tipo ?? "aviso"} desc={editBuf.orden_compra_descripcion ?? item.orden_compra_descripcion ?? ""} monto={editBuf.orden_compra_monto_estimado ?? item.orden_compra_monto_estimado ?? ""} diasPrevio={editBuf.orden_compra_dias_previo ?? item.orden_compra_dias_previo ?? 7} onChange={eb} />
                    <div style={{ display: "flex", gap: 7, marginTop: 4 }}>
                      <Btn variant="primary" onClick={() => saveEdit(idx)} disabled={saving}>Guardar</Btn>
                      <Btn variant="outline" onClick={cancelEdit}>Cancelar</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {adding && (
            <div style={{ border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 9, padding: "12px", background: "rgba(59,130,246,0.04)", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: C.primary, marginBottom: 10, fontWeight: 500 }}>Nueva etapa en plantilla</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, marginBottom: 8 }}>
                <InputSt label="Nombre *"><input style={INP} autoFocus placeholder="Ej: Pintura" value={newForm.nombre} onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))} /></InputSt>
                <InputSt label="Días"><input type="number" min="0" step="0.5" style={INP} value={newForm.dias_estimados} onChange={e => setNewForm(f => ({ ...f, dias_estimados: e.target.value }))} /></InputSt>
              </div>
              <InputSt label="Color"><div style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="color" value={newForm.color} onChange={e => setNewForm(f => ({ ...f, color: e.target.value }))} style={{ width: 30, height: 28, border: "none", background: "none", cursor: "pointer" }} />{COLOR_PRESETS.map(c => <div key={c} onClick={() => setNewForm(f => ({ ...f, color: c }))} style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: "pointer", border: newForm.color === c ? "2px solid #fff" : "2px solid transparent" }} />)}</div></InputSt>
              <OrdenCompraSection genera={newForm.genera_orden_compra} tipo={newForm.orden_compra_tipo} desc={newForm.orden_compra_descripcion} monto={newForm.orden_compra_monto_estimado} diasPrevio={newForm.orden_compra_dias_previo} onChange={(k, v) => setNewForm(f => ({ ...f, [k]: v }))} />
              <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                <Btn variant="primary" onClick={addEtapa} disabled={saving || !newForm.nombre.trim()}>Agregar</Btn>
                <Btn variant="outline" onClick={() => setAdding(false)}>Cancelar</Btn>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.b0}` }}>
          {!adding && <Btn variant="primary" onClick={() => setAdding(true)}>+ Nueva etapa en plantilla</Btn>}
          <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ─── VISTA ÓRDENES DE COMPRA ─────────────────────────────────────────────────
function OrdenesCompraView({ ordenes, obras, esGestion, onEditOC, onRefresh }) {
  const [filtroOCEstado, setFiltroOCEstado] = useState("activas");
  const [filtroOCObra,   setFiltroOCObra]   = useState("todas");
  const [busqueda,       setBusqueda]       = useState("");

  const alertasUrgentes = useMemo(() => ordenes.filter(oc => {
    if (!["pendiente","solicitada"].includes(oc.estado)) return false;
    const u = ocUrgencia(oc); return u && ["vencida","hoy","urgente","proxima"].includes(u.nivel);
  }), [ordenes]);

  const ocsFilt = useMemo(() => ordenes.filter(oc => {
    if (filtroOCEstado === "activas" && ["recibida","cancelada"].includes(oc.estado)) return false;
    if (filtroOCEstado === "cerradas" && !["recibida","cancelada"].includes(oc.estado)) return false;
    if (filtroOCObra !== "todas" && oc.obra_id !== filtroOCObra) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase(); const obra = obras.find(o => o.id === oc.obra_id);
      if (!((obra?.codigo ?? "").toLowerCase().includes(q) || (oc.descripcion ?? "").toLowerCase().includes(q) || (oc.proveedor ?? "").toLowerCase().includes(q) || (oc.numero_oc ?? "").toLowerCase().includes(q) || (oc.etapa_nombre ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [ordenes, filtroOCEstado, filtroOCObra, busqueda, obras]);

  const porObra = useMemo(() => {
    const map = {};
    ocsFilt.forEach(oc => { if (!map[oc.obra_id]) map[oc.obra_id] = { obra: obras.find(o => o.id === oc.obra_id), ocs: [] }; map[oc.obra_id].ocs.push(oc); });
    return Object.values(map).sort((a, b) => { const uA = a.ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); }); const uB = b.ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); }); return uB - uA; });
  }, [ocsFilt, obras]);

  const OC_FLOW = ["pendiente","solicitada","aprobada","en_camino","recibida"];
  async function cambiarEstadoOC(ocId, estado) { const upd = { estado }; if (estado === "recibida") upd.fecha_recepcion = today(); await supabase.from("ordenes_compra").update(upd).eq("id", ocId); onRefresh(); }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {alertasUrgentes.length > 0 && (
        <div style={{ padding: "10px 20px", background: "rgba(239,68,68,0.06)", borderBottom: `1px solid rgba(239,68,68,0.18)`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <div>
            <div style={{ fontSize: 11, color: "#fca5a5", fontWeight: 600 }}>{alertasUrgentes.length} orden{alertasUrgentes.length > 1 ? "es" : ""} urgente{alertasUrgentes.length > 1 ? "s" : ""}</div>
            <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>
              {alertasUrgentes.slice(0, 4).map(oc => { const obra = obras.find(o => o.id === oc.obra_id); const u = ocUrgencia(oc); return <span key={oc.id} style={{ marginRight: 10, color: u?.color }}>{obra?.codigo} · {oc.etapa_nombre} ({u?.label})</span>; })}
              {alertasUrgentes.length > 4 && <span>+{alertasUrgentes.length - 4} más</span>}
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: "8px 20px", background: "rgba(12,12,14,0.85)", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <input style={{ ...INP, width: 200, padding: "5px 10px", fontSize: 11 }} placeholder="🔍 Buscar obra, proveedor…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div style={{ display: "flex", gap: 3 }}>
          {[["activas","Activas"],["cerradas","Cerradas"],["todas","Todas"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltroOCEstado(v)} style={{ border: filtroOCEstado === v ? `1px solid ${C.b1}` : `1px solid ${C.b0}`, background: filtroOCEstado === v ? C.s1 : "transparent", color: filtroOCEstado === v ? C.t0 : C.t1, padding: "4px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>{l}</button>
          ))}
        </div>
        <select style={{ ...INP, width: 160, padding: "5px 10px", fontSize: 11 }} value={filtroOCObra} onChange={e => setFiltroOCObra(e.target.value)}>
          <option value="todas">Todas las obras</option>
          {obras.filter(o => ordenes.some(oc => oc.obra_id === o.id)).map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 10, color: C.t2 }}>{ocsFilt.length} órdenes</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {porObra.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.t2 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 12, letterSpacing: 2 }}>Sin órdenes de compra</div>
            <div style={{ fontSize: 10, marginTop: 6 }}>Las órdenes se generan al completar etapas con 🛒</div>
          </div>
        )}
        {porObra.map(({ obra, ocs }) => {
          const tieneUrgente = ocs.some(o => { const u = ocUrgencia(o); return u && ["vencida","hoy","urgente"].includes(u.nivel); });
          const tieneProxima = ocs.some(o => { const u = ocUrgencia(o); return u && u.nivel === "proxima"; });
          return (
            <div key={obra?.id ?? "sin-obra"} style={{ marginBottom: 20, border: `1px solid ${tieneUrgente ? C.red : tieneProxima ? C.amber : C.b0}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", background: tieneUrgente ? "rgba(239,68,68,0.05)" : tieneProxima ? "rgba(245,158,11,0.04)" : C.s0, display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.b0}` }}>
                <Dot color={obra ? (C.obra[obra.estado]?.dot ?? C.t2) : C.t2} size={7} glow />
                <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t0, fontWeight: 600 }}>{obra?.codigo ?? "Sin obra"}</span>
                {obra?.linea_nombre && <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{obra.linea_nombre}</span>}
                <span style={{ marginLeft: "auto", fontSize: 10, color: C.t2 }}>{ocs.length} OC</span>
                {tieneUrgente && <span style={{ fontSize: 9, color: C.red, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", padding: "2px 8px", borderRadius: 4 }}>URGENTE</span>}
                {!tieneUrgente && tieneProxima && <span style={{ fontSize: 9, color: C.amber, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "2px 8px", borderRadius: 4 }}>PRÓXIMA</span>}
              </div>
              {ocs.map(oc => {
                const urg = ocUrgencia(oc); const ocC = C.oc[oc.estado] ?? C.oc.pendiente;
                return (
                  <div key={oc.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flexShrink: 0, width: 90 }}>
                      <div style={{ fontSize: 9, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>{oc.tipo ?? "aviso"}</div>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: ocC.bg, color: ocC.dot, border: `1px solid ${ocC.border}` }}>{ocC.label}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.t0, fontWeight: 500, marginBottom: 2 }}>{oc.etapa_nombre ?? "—"}{oc.numero_oc && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.primary, marginLeft: 8, background: "rgba(59,130,246,0.1)", padding: "1px 6px", borderRadius: 4 }}>{oc.numero_oc}</span>}</div>
                      {oc.descripcion && <div style={{ fontSize: 10, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oc.descripcion}</div>}
                      {oc.proveedor && <div style={{ fontSize: 10, color: C.t1, marginTop: 2 }}>📦 {oc.proveedor}</div>}
                      <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
                        {oc.fecha_limite_pedido && <span style={{ fontSize: 9, color: urg?.color ?? C.t2 }}>{urg ? `⏱ ${urg.label}` : `Límite: ${fmtDate(oc.fecha_limite_pedido)}`}</span>}
                        {oc.fecha_pedido && <span style={{ fontSize: 9, color: C.t2 }}>Pedido: {fmtDate(oc.fecha_pedido)}</span>}
                        {oc.fecha_estimada_entrega && <span style={{ fontSize: 9, color: C.t2 }}>Entrega: {fmtDate(oc.fecha_estimada_entrega)}</span>}
                      </div>
                    </div>
                    {(oc.monto_estimado || oc.monto_real) && (
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {oc.monto_real && <div style={{ fontSize: 12, color: C.green, fontFamily: C.mono }}>${Number(oc.monto_real).toLocaleString("es-AR")}</div>}
                        {!oc.monto_real && oc.monto_estimado && <div style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>~${Number(oc.monto_estimado).toLocaleString("es-AR")}</div>}
                        <div style={{ fontSize: 8, color: C.t2, marginTop: 1 }}>{oc.monto_real ? "real" : "estimado"}</div>
                      </div>
                    )}
                    {esGestion && (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <Btn variant="outline" sx={{ padding: "3px 10px", fontSize: 10 }} onClick={() => onEditOC(oc)}>✎ Editar</Btn>
                        {!["recibida","cancelada"].includes(oc.estado) && (
                          <div style={{ display: "flex", gap: 3 }}>
                            {OC_FLOW.indexOf(oc.estado) < OC_FLOW.length - 1 && (
                              <button type="button" onClick={() => cambiarEstadoOC(oc.id, OC_FLOW[OC_FLOW.indexOf(oc.estado) + 1])} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: C.green, cursor: "pointer", fontFamily: C.sans }}>→ {C.oc[OC_FLOW[OC_FLOW.indexOf(oc.estado) + 1]]?.label}</button>
                            )}
                            <button type="button" onClick={() => cambiarEstadoOC(oc.id, "cancelada")} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontFamily: C.sans }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function ObrasScreen({ profile, signOut }) {
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || ["admin", "oficina"].includes(profile?.role);

  const [obras,    setObras]    = useState([]);
  const [etapas,   setEtapas]   = useState([]);
  const [tareas,   setTareas]   = useState([]);
  const [lineas,   setLineas]   = useState([]);
  const [lProcs,   setLProcs]   = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [ordenes,  setOrdenes]  = useState([]);
  const [archCounts, setArchCounts] = useState({}); // { tarea_id: count }
  const [loading,  setLoading]  = useState(true);

  const [filtroEstado,   setFiltroEstado]   = useState("activa");
  const [filtroLinea,    setFiltroLinea]    = useState("todas");
  const [expandedObras,  setExpandedObras]  = useState(new Set());
  const [expandedEtapas, setExpandedEtapas] = useState(new Set());

  const [mainView,      setMainView]      = useState("obras");
  const [showObraModal, setShowObraModal] = useState(false);
  const [etapaModal,    setEtapaModal]    = useState(null);
  const [tareaModal,    setTareaModal]    = useState(null);
  const [tareaDetalle,  setTareaDetalle]  = useState(null);
  const [confirmModal,  setConfirmModal]  = useState(null);
  const [lineasModal,   setLineasModal]   = useState(null);
  const [ocModal,       setOcModal]       = useState(null);

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      safeQuery(supabase.from("produccion_obras").select("*").order("created_at", { ascending: false })),
      safeQuery(supabase.from("obra_etapas").select("*").order("obra_id").order("orden")),
      safeQuery(supabase.from("obra_tareas").select("*").order("etapa_id").order("orden")),
      supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden"),
      supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden"),
      safeQuery(supabase.from("obra_timeline").select("*, linea_procesos(id,nombre,orden,dias_estimados,color), procesos(id,nombre,orden,dias_esperados,color)").order("created_at")),
      safeQuery(supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false })),
    ]);
    setObras(r1); setEtapas(r2); setTareas(r3);
    setLineas(r4.data ?? []); setLProcs(r5.data ?? []);
    setTimeline(r6); setOrdenes(r7);

    // Conteo de archivos por tarea
    const counts = await safeQuery(supabase.from("obra_tarea_archivos").select("tarea_id").not("tarea_id", "is", null));
    const map = {};
    counts.forEach(row => { map[row.tarea_id] = (map[row.tarea_id] ?? 0) + 1; });
    setArchCounts(map);

    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-v8")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_etapas"      }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tareas"      }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra"   }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tarea_archivos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── HELPERS ───────────────────────────────────────────────────
  const etapasDeObra = useCallback((obraId) => {
    const fromNew = etapas.filter(e => e.obra_id === obraId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    if (fromNew.length) return fromNew;
    const obra = obras.find(o => o.id === obraId);
    if (!obra?.linea_id) return [];
    const procs = lProcs.filter(p => p.linea_id === obra.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return procs.map(p => {
      const tl = timeline.find(t => t.obra_id === obraId && t.linea_proceso_id === p.id);
      return { id: `virtual-${obraId}-${p.id}`, obra_id: obraId, isVirtual: true, linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden, color: p.color, dias_estimados: p.dias_estimados, estado: tl?.estado === "completado" ? "completado" : tl?.estado === "en_curso" ? "en_curso" : "pendiente", fecha_inicio: tl?.fecha_inicio, fecha_fin_real: tl?.fecha_fin };
    });
  }, [etapas, timeline, obras, lProcs]);

  const tareasDeEtapa = useCallback((etapaId) =>
    tareas.filter(t => t.etapa_id === etapaId).sort((a, b) => { const pOrd = { critica: 0, alta: 1, media: 2, baja: 3 }; if (a.prioridad !== b.prioridad) return (pOrd[a.prioridad] ?? 2) - (pOrd[b.prioridad] ?? 2); return (a.orden ?? 0) - (b.orden ?? 0); }),
    [tareas]);

  const pctEtapa = useCallback((etapaId) => {
    if (String(etapaId).startsWith("virtual")) return 0;
    const ts = tareasDeEtapa(etapaId);
    if (!ts.length) return 0;
    return pct(ts.filter(t => t.estado === "finalizada").length, ts.length);
  }, [tareasDeEtapa]);

  const pctObra = useCallback((obraId) => {
    const es = etapasDeObra(obraId);
    if (!es.length) return 0;
    const allTareas = es.flatMap(e => !e.isVirtual ? tareasDeEtapa(e.id) : []);
    if (allTareas.length) return pct(allTareas.filter(t => t.estado === "finalizada").length, allTareas.length);
    return pct(es.filter(e => e.estado === "completado").length, es.length);
  }, [etapasDeObra, tareasDeEtapa]);

  const alertCountOC = useMemo(() => ordenes.filter(oc => {
    if (!["pendiente","solicitada"].includes(oc.estado)) return false;
    const u = ocUrgencia(oc); return u && ["vencida","hoy","urgente","proxima"].includes(u.nivel);
  }).length, [ordenes]);

  // ── ACCIONES ─────────────────────────────────────────────────
  const toggleObra  = id => setExpandedObras(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleEtapa = id => setExpandedEtapas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Si la etapa es virtual (viene de plantilla), la persiste en obra_etapas antes de abrir el modal
  async function abrirNuevaTarea(etapa) {
    let etapaId = etapa.id;
    let obraId  = etapa.obra_id;
    if (etapa.isVirtual) {
      const { data, error } = await supabase.from("obra_etapas").insert({
        obra_id:          etapa.obra_id,
        linea_proceso_id: etapa.linea_proceso_id,
        nombre:           etapa.nombre,
        orden:            etapa.orden ?? 999,
        color:            etapa.color ?? "#64748b",
        dias_estimados:   etapa.dias_estimados,
        estado:           etapa.estado ?? "pendiente",
      }).select().single();
      if (error) { alert("No se pudo crear la etapa: " + error.message); return; }
      etapaId = data.id;
      await cargar();
    }
    setTareaModal({ etapaId, obraId });
  }

  async function cambiarEstadoObra(obraId, estado) {
    const upd = { estado }; if (estado === "terminada") upd.fecha_fin_real = today();
    await supabase.from("produccion_obras").update(upd).eq("id", obraId); cargar();
  }

  async function cambiarEstadoEtapa(etapaId, estado) {
    if (String(etapaId).startsWith("virtual")) return;
    const upd = { estado }; if (estado === "completado") upd.fecha_fin_real = today();
    await supabase.from("obra_etapas").update(upd).eq("id", etapaId);
    if (estado === "completado") {
      const etapa = etapas.find(e => e.id === etapaId);
      if (etapa?.genera_orden_compra) {
        const obra = obras.find(o => o.id === etapa.obra_id);
        supabase.from("ordenes_compra").insert({ obra_id: etapa.obra_id, etapa_id: etapa.id, etapa_nombre: etapa.nombre, tipo: etapa.orden_compra_tipo ?? "aviso", descripcion: etapa.orden_compra_descripcion ?? null, monto_estimado: etapa.orden_compra_monto_estimado ?? null, dias_previo_aviso: etapa.orden_compra_dias_previo ?? 7, obra_codigo: obra?.codigo ?? null, linea_nombre: obra?.linea_nombre ?? null, estado: "pendiente", fecha_creacion: today() }).then(({ error }) => { if (error) console.warn("ordenes_compra:", error.message); });
      }
    }
    cargar();
  }

  async function cambiarEstadoTarea(tareaId, estado) {
    const upd = { estado }; if (estado === "finalizada") upd.fecha_fin_real = today();
    await supabase.from("obra_tareas").update(upd).eq("id", tareaId); cargar();
  }

  function pedirBorrado(item, tipo) {
    const ads = { obra: "Se borrarán sus etapas, tareas y archivos.", etapa: "Se borrarán las tareas y archivos de esta etapa.", tarea: "Se eliminará la tarea y todos sus archivos adjuntos." };
    setConfirmModal({ nombre: item.nombre ?? item.codigo, tipo, advertencia: ads[tipo], async onConfirm() {
      try {
        if (tipo === "obra") { await supabase.from("produccion_obras").delete().eq("id", item.id); await supabase.from("laminacion_obras").delete().eq("nombre", item.codigo); }
        else if (tipo === "etapa") { await supabase.from("obra_etapas").delete().eq("id", item.id); }
        else if (tipo === "tarea") {
          // Borrar archivos del storage
          const archivos = await safeQuery(supabase.from("obra_tarea_archivos").select("storage_path").eq("tarea_id", item.id));
          if (archivos.length) await supabase.storage.from(STORAGE_BUCKET).remove(archivos.map(a => a.storage_path));
          await supabase.from("obra_tareas").delete().eq("id", item.id);
        }
      } catch (err) { console.error(err); }
      setConfirmModal(null); cargar();
    }});
  }

  // ── DERIVADOS ─────────────────────────────────────────────────
  const obrasFilt = useMemo(() => obras.filter(o => {
    if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
    if (filtroLinea  !== "todas" && o.linea_id !== filtroLinea) return false;
    return true;
  }), [obras, filtroEstado, filtroLinea]);

  const stats = useMemo(() => ({
    activas:    obras.filter(o => o.estado === "activa").length,
    pausadas:   obras.filter(o => o.estado === "pausada").length,
    terminadas: obras.filter(o => o.estado === "terminada").length,
  }), [obras]);

  // ═══════════════════════════════════════════════════════════════
  //  ÁRBOL LATERAL
  // ═══════════════════════════════════════════════════════════════
  function TreePanel() {
    return (
      <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.b0}`, background: "rgba(12,12,14,0.85)", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: C.t2, textTransform: "uppercase" }}>Proyectos</span>
          {esGestion && <Btn variant="primary" sx={{ padding: "4px 11px", fontSize: 10 }} onClick={() => setShowObraModal(true)}>+ Obra</Btn>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: C.t2, fontSize: 11 }}>Cargando…</div>}
          {!loading && obrasFilt.map(obra => {
            const obraEtapas = etapasDeObra(obra.id);
            const expanded   = expandedObras.has(obra.id);
            const obrapct    = pctObra(obra.id);
            const oC         = C.obra[obra.estado] ?? C.obra.activa;
            return (
              <div key={obra.id}>
                <div onClick={() => toggleObra(obra.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px 7px 10px", cursor: "pointer", borderLeft: expandedObras.has(obra.id) ? `2px solid ${oC.dot}` : "2px solid transparent", transition: "background .13s" }}>
                  <span style={{ fontSize: 8, color: C.t2, width: 10, flexShrink: 0, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▶</span>
                  <Dot color={oC.dot} size={6} glow />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t1, letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.codigo}</div>
                    <ProgressBar value={obrapct} color={oC.dot} height={2} />
                  </div>
                  <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{obrapct}%</span>
                </div>
                {expanded && (
                  <>
                    {obraEtapas.map(etapa => {
                      const etapaT = tareasDeEtapa(etapa.id);
                      const etExp  = expandedEtapas.has(etapa.id);
                      return (
                        <div key={etapa.id}>
                          <div onClick={() => toggleEtapa(etapa.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 26px", cursor: "pointer" }}>
                            <span style={{ fontSize: 7, color: C.t2, width: 8, flexShrink: 0, transform: etExp ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
                            <div style={{ width: 3, height: 16, borderRadius: 2, background: etapa.color ?? C.t1, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 10, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa.nombre}</span>
                            <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{etapaT.length || ""}</span>
                          </div>
                          {etExp && etapaT.map(tarea => {
                            const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
                            const pc = C.prioridad[tarea.prioridad ?? "media"];
                            return (
                              <div key={tarea.id} onClick={() => setTareaDetalle(tarea)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 14px 3px 44px", cursor: "pointer" }}>
                                <div style={{ width: 2, height: 10, borderRadius: 1, background: pc.color, flexShrink: 0 }} />
                                <Dot color={tc.text} size={4} glow={tarea.estado === "en_progreso"} />
                                <span style={{ fontSize: 10, color: C.t2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tarea.nombre}</span>
                              </div>
                            );
                          })}
                          {etExp && esGestion && (
                            <div onClick={() => abrirNuevaTarea(etapa)} style={{ padding: "3px 14px 3px 44px", cursor: "pointer" }}>
                              <span style={{ fontSize: 9, color: C.t2 }}>+ tarea</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {esGestion && (
                      <div onClick={() => setEtapaModal({ obraId: obra.id })} style={{ padding: "4px 14px 4px 26px", cursor: "pointer" }}>
                        <span style={{ fontSize: 9, color: C.t2 }}>+ etapa</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {!loading && !obrasFilt.length && <div style={{ textAlign: "center", padding: "32px 16px", color: C.t2, fontSize: 11 }}>Sin obras</div>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  GANTT CENTRAL
  // ═══════════════════════════════════════════════════════════════
  function GanttMain() {
    if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 11, letterSpacing: 3, fontFamily: C.mono }}>Cargando…</div>;
    if (!obrasFilt.length) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, color: C.t2, marginBottom: 10, letterSpacing: 8 }}>◦</div>
          <div style={{ color: C.t2, fontSize: 11, letterSpacing: 2 }}>Sin obras con este filtro</div>
          {esGestion && <div style={{ marginTop: 16 }}><Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn></div>}
        </div>
      </div>
    );

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {obrasFilt.map(obra => {
          const obraEtapas = etapasDeObra(obra.id);
          const totalDias  = obraEtapas.reduce((s, e) => s + num(e.dias_estimados), 0) || 1;
          const diasR      = diasDesde(obra.fecha_inicio);
          const obrapct    = pctObra(obra.id);
          const oC         = C.obra[obra.estado] ?? C.obra.activa;
          const expanded   = expandedObras.has(obra.id);

          return (
            <div key={obra.id} style={{ marginBottom: 20 }}>
              {/* ── OBRA ROW ── */}
              <div onClick={() => toggleObra(obra.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: C.s0, border: `1px solid ${C.b0}`, cursor: "pointer", borderLeft: `3px solid ${oC.dot}`, transition: "background .12s" }}>
                <span style={{ fontSize: 10, color: C.t2, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>▶</span>
                <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t0, fontWeight: 600, letterSpacing: 1, flex: "0 0 108px" }}>{obra.codigo}</span>
                {obra.linea_nombre && <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flex: "0 0 60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.linea_nombre}</span>}
                <div style={{ flex: 1 }}><ProgressBar value={obrapct} color={oC.dot} height={4} /></div>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.t1, flex: "0 0 32px", textAlign: "right" }}>{obrapct}%</span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 40px", textAlign: "right" }}>{diasR}d</span>
                {esGestion && (
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <Btn variant="sm" onClick={() => cambiarEstadoObra(obra.id, obra.estado === "activa" ? "pausada" : "activa")}>{obra.estado === "activa" ? "Pausar" : "Activar"}</Btn>
                    {obra.estado !== "terminada" && <Btn variant="sm" sx={{ color: C.green, borderColor: "rgba(16,185,129,0.3)" }} onClick={() => cambiarEstadoObra(obra.id, "terminada")}>Terminar</Btn>}
                    <button type="button" onClick={() => pedirBorrado(obra, "obra")} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>×</button>
                  </div>
                )}
              </div>

              {expanded && (
                <div style={{ paddingLeft: 16, paddingTop: 6 }}>
                  {/* TIMELINE BAR */}
                  {obraEtapas.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", paddingLeft: 110, marginBottom: 2 }}>
                        {obraEtapas.map(e => (
                          <div key={e.id} style={{ flex: num(e.dias_estimados) / totalDias, fontSize: 7, color: C.t2, letterSpacing: 1, textTransform: "uppercase", overflow: "hidden", textOverflow: "clip", whiteSpace: "nowrap", textAlign: "center" }}>{e.nombre}</div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 102, flexShrink: 0, fontSize: 9, color: C.t2 }}>Timeline</div>
                        <div style={{ flex: 1, height: 14, display: "flex", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.b0}`, background: "rgba(0,0,0,0.4)" }}>
                          {obraEtapas.map((e, idx) => {
                            const ec = C.etapa[e.estado] ?? C.etapa.pendiente;
                            return <div key={e.id} title={`${e.nombre} · ${e.estado}`} style={{ flex: num(e.dias_estimados) / totalDias, height: "100%", background: e.estado === "completado" ? `linear-gradient(90deg,${ec.bar},rgba(16,185,129,0.28))` : e.estado === "en_curso" ? `linear-gradient(90deg,${ec.bar},rgba(59,130,246,0.28))` : ec.bar, borderRight: idx < obraEtapas.length - 1 ? "1px solid rgba(0,0,0,0.5)" : "none", ...(e.estado === "en_curso" ? { animation: "gPulse 2.5s ease infinite" } : {}) }} />;
                          })}
                        </div>
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2 }}>{diasR}d</span>
                      </div>
                    </div>
                  )}

                  {/* ── ETAPAS ── */}
                  {obraEtapas.map(etapa => {
                    const etapaT = tareasDeEtapa(etapa.id);
                    const etExp  = expandedEtapas.has(etapa.id);
                    const ec     = C.etapa[etapa.estado] ?? C.etapa.pendiente;
                    const epct   = pctEtapa(etapa.id);

                    return (
                      <div key={etapa.id} style={{ marginBottom: 6, border: `1px solid ${etExp ? C.b1 : C.b0}`, borderRadius: 9, background: etExp ? "rgba(255,255,255,0.025)" : C.s0, transition: "border-color .15s, background .15s", overflow: "hidden" }}>

                        {/* ── CABECERA DE ETAPA (clic = desplegar/plegar) ── */}
                        <div
                          onClick={() => toggleEtapa(etapa.id)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", borderLeft: `3px solid ${etapa.color ?? "#64748b"}` }}
                        >
                          <span style={{ fontSize: 7, color: C.t2, width: 9, flexShrink: 0, transform: etExp ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>

                          <div style={{ width: 110, flexShrink: 0 }}>
                            <div style={{ fontSize: 12, color: C.t0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {etapa.nombre}{etapa.genera_orden_compra ? " 🛒" : ""}
                            </div>
                            <div style={{ fontSize: 9, color: C.t2, marginTop: 1 }}>
                              {etapaT.length > 0 ? `${etapaT.filter(t => t.estado === "finalizada").length}/${etapaT.length} tareas` : "Sin tareas"}
                            </div>
                          </div>

                          <div style={{ flex: 1 }}><ProgressBar value={epct} color={ec.dot} height={4} /></div>

                          <span style={{ fontFamily: C.mono, fontSize: 10, color: ec.text, flex: "0 0 32px", textAlign: "right" }}>{epct}%</span>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 28px", textAlign: "right" }}>{etapa.dias_estimados ?? 0}d</span>

                          {/* Estado quick buttons */}
                          {esGestion && !etapa.isVirtual && (
                            <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {[["pendiente","—"],["en_curso","▶"],["completado","✓"]].map(([est, ico]) => (
                                <button key={est} type="button" onClick={() => cambiarEstadoEtapa(etapa.id, est)}
                                  style={{ width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 9, background: etapa.estado === est ? `${(C.etapa[est]).dot}28` : "rgba(255,255,255,0.03)", color: etapa.estado === est ? (C.etapa[est]).dot : C.t2 }}>
                                  {ico}
                                </button>
                              ))}
                              <button type="button" onClick={() => setEtapaModal({ etapa, obraId: etapa.obra_id })} style={{ width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 9, background: "transparent", color: C.t2 }}>✎</button>
                              <button type="button" onClick={() => pedirBorrado(etapa, "etapa")} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 12, padding: "0 2px" }}>×</button>
                            </div>
                          )}
                        </div>

                        {/* ── TAREAS EXPANDIDAS ── */}
                        {etExp && (
                          <div style={{ padding: "8px 12px 4px", borderTop: `1px solid ${C.b0}` }}>
                            <EtapaTareasSection
                              etapa={etapa}
                              tareas={etapaT}
                              archivosCount={archCounts}
                              esGestion={esGestion}
                              onCambiarEstado={cambiarEstadoTarea}
                              onEditar={t => setTareaModal({ tarea: t, etapaId: t.etapa_id, obraId: t.obra_id })}
                              onDetalle={t => setTareaDetalle(t)}
                              onEliminar={t => pedirBorrado(t, "tarea")}
                              onNueva={() => abrirNuevaTarea(etapa)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* + nueva etapa */}
                  {esGestion && (
                    <button type="button" onClick={() => setEtapaModal({ obraId: obra.id })} style={{ width: "100%", marginTop: 4, padding: "7px 12px", borderRadius: 7, cursor: "pointer", border: `1px dashed ${C.b0}`, background: "transparent", color: C.t2, fontSize: 10, fontFamily: C.sans }}>
                      + nueva etapa
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        @keyframes slideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes gPulse    { 0%,100%{opacity:1} 50%{opacity:.6} }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%); }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
          {/* TOPBAR */}
          <div style={{ height: 50, background: "rgba(12,12,14,0.92)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 7, flex: 1 }}>
              {[{label:"Activas",n:stats.activas,c:C.obra.activa.dot},{label:"Pausadas",n:stats.pausadas,c:C.obra.pausada.dot},{label:"Terminadas",n:stats.terminadas,c:C.obra.terminada.dot}].map(({label,n,c}) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `2px solid ${c}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 8, color: C.t1, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <button type="button" onClick={() => setMainView("obras")} style={{ padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans, border: mainView === "obras" ? `1px solid ${C.b1}` : `1px solid ${C.b0}`, background: mainView === "obras" ? C.s1 : "transparent", color: mainView === "obras" ? C.t0 : C.t1 }}>📐 Obras</button>
              <button type="button" onClick={() => setMainView("ordenes")} style={{ padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans, border: mainView === "ordenes" ? `1px solid rgba(245,158,11,0.4)` : `1px solid ${C.b0}`, background: mainView === "ordenes" ? "rgba(245,158,11,0.08)" : "transparent", color: mainView === "ordenes" ? C.amber : C.t1, position: "relative" }}>
                🛒 Compras
                {alertCountOC > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: C.red, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{alertCountOC}</span>}
              </button>
            </div>
            {mainView === "obras" && esGestion && <Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn>}
          </div>

          {mainView === "obras" && (
            <>
              {/* FILTERBAR */}
              <div style={{ height: 36, background: "rgba(12,12,14,0.85)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, overflowX: "auto" }}>
                <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Estado</span>
                {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setFiltroEstado(v)} style={{ border: filtroEstado === v ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.04)`, background: filtroEstado === v ? C.s1 : "transparent", color: filtroEstado === v ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>{l}</button>
                ))}
                <div style={{ width: 1, height: 12, background: C.b0, margin: "0 3px" }} />
                <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Línea</span>
                <button type="button" onClick={() => setFiltroLinea("todas")} style={{ border: filtroLinea === "todas" ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.04)`, background: filtroLinea === "todas" ? C.s1 : "transparent", color: filtroLinea === "todas" ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>Todas</button>
                {lineas.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <button type="button" onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)} style={{ border: filtroLinea === l.id ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.04)`, borderLeft: filtroLinea === l.id ? `2px solid ${l.color}` : undefined, background: filtroLinea === l.id ? C.s1 : "transparent", color: filtroLinea === l.id ? C.t0 : C.t1, padding: "3px 11px", borderRadius: "5px 0 0 5px", cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>{l.nombre}</button>
                    {esGestion && <button type="button" onClick={() => setLineasModal({ linea: l })} style={{ border: filtroLinea === l.id ? `1px solid ${C.b1}` : `1px solid rgba(255,255,255,0.04)`, borderLeft: "none", background: filtroLinea === l.id ? C.s1 : "transparent", color: C.t2, padding: "3px 6px", borderRadius: "0 5px 5px 0", cursor: "pointer", fontSize: 9, fontFamily: C.sans }}>⚙</button>}
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                <TreePanel />
                <GanttMain />
              </div>
            </>
          )}

          {mainView === "ordenes" && (
            <OrdenesCompraView ordenes={ordenes} obras={obras} esGestion={esGestion} onEditOC={oc => setOcModal(oc)} onRefresh={cargar} />
          )}
        </div>
      </div>

      {/* MODALES */}
      {showObraModal && <ObraModal lineas={lineas} lProcs={lProcs} onSave={nueva => { setShowObraModal(false); cargar(); if (nueva?.id) setExpandedObras(s => new Set(s).add(nueva.id)); }} onClose={() => setShowObraModal(false)} />}
      {etapaModal    && <EtapaModal etapa={etapaModal.etapa} obraId={etapaModal.obraId} onSave={() => { setEtapaModal(null); cargar(); }} onClose={() => setEtapaModal(null)} />}
      {tareaModal    && <TareaModal tarea={tareaModal.tarea} etapaId={tareaModal.etapaId} obraId={tareaModal.obraId} onSave={() => { setTareaModal(null); cargar(); }} onClose={() => setTareaModal(null)} />}
      {tareaDetalle  && <TareaDetalleModal tarea={tareaDetalle} esGestion={esGestion} onClose={() => setTareaDetalle(null)} onEditar={t => { setTareaDetalle(null); setTareaModal({ tarea: t, etapaId: t.etapa_id, obraId: t.obra_id }); }} />}
      {confirmModal  && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}
      {lineasModal   && <LineasEtapasModal linea={lineasModal.linea} lProcs={lProcs} onClose={() => setLineasModal(null)} onSaved={cargar} />}
      {ocModal       && <OrdenCompraModal oc={ocModal} obras={obras} onSave={() => { setOcModal(null); cargar(); }} onClose={() => setOcModal(null)} />}
    </div>
  );
}
