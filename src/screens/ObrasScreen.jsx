/**
 * ObrasScreen v5 (Dark & Technical Theme)
 * — Jerarquía: Obra → Etapas (obra_etapas) → Tareas (obra_tareas)
 * — Tablas nuevas opcionales: si no existen, el componente funciona igual
 * con la capa legacy (obra_timeline + linea_procesos).
 * — Soft delete con cascada vía función SQL; fallback a tabla simple si no existe.
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
const diasEntre  = (a, b) => (!a || !b) ? null : Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const pct        = (done, total) => total > 0 ? Math.round((done / total) * 100) : 0;

async function safeQuery(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

// ─── PALETA ────────────────────────────────────────────────────────────────────
const C = {
  bg:    "#09090b",          // zinc-950 (casi negro)
  s0:    "rgba(255,255,255,0.03)",
  s1:    "rgba(255,255,255,0.06)",
  s2:    "rgba(255,255,255,0.09)",
  b0:    "rgba(255,255,255,0.08)",
  b1:    "rgba(255,255,255,0.15)",
  b2:    "rgba(255,255,255,0.25)",
  t0:    "#f4f4f5",          // zinc-50 (blanco tiza)
  t1:    "#a1a1aa",          // zinc-400 (gris medio)
  t2:    "#71717a",          // zinc-500 (gris oscuro mutado)
  mono:  "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:  "'Outfit', system-ui, sans-serif",
  // Acentos
  primary:"#3b82f6",         // azul técnico
  amber:  "#f59e0b",         // ámbar de alerta
  green:  "#10b981",         // esmeralda
  red:    "#ef4444",         // rojo suave
  
  // Obra estados
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  label: "Activa"    },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  label: "Pausada"   },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: "Terminada" },
    cancelada: { dot: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   label: "Cancelada" },
  },
  // Etapa estados
  etapa: {
    pendiente:  { dot: "#52525b", bar: "rgba(255,255,255,0.05)", text: "#a1a1aa", label: "Pendiente"  },
    en_curso:   { dot: "#3b82f6", bar: "rgba(59,130,246,0.15)",  text: "#3b82f6", label: "En curso"   },
    completado: { dot: "#10b981", bar: "rgba(16,185,129,0.15)",  text: "#10b981", label: "Completado" },
    bloqueado:  { dot: "#ef4444", bar: "rgba(239,68,68,0.15)",   text: "#ef4444", label: "Bloqueado"  },
  },
  // Tarea estados
  tarea: {
    pendiente:   { dot: "#52525b", text: "#a1a1aa", label: "Pendiente"    },
    en_progreso: { dot: "#3b82f6", text: "#3b82f6", label: "En progreso"  },
    finalizada:  { dot: "#10b981", text: "#10b981", label: "Finalizada"   },
    bloqueada:   { dot: "#ef4444", text: "#ef4444", label: "Bloqueada"    },
    cancelada:   { dot: "#71717a", text: "#71717a", label: "Cancelada"    },
  },
};

const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────

const Dot = ({ color, size = 7, glow = false }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0,
    boxShadow: glow ? `0 0 7px ${color}90` : "none",
  }} />
);

const Chip = ({ label, dot, bg, border }) => (
  <span style={{
    fontSize: 8, letterSpacing: 2, textTransform: "uppercase",
    padding: "3px 8px", borderRadius: 99,
    background: bg, color: dot, border: `1px solid ${border}`,
    fontWeight: 600, whiteSpace: "nowrap",
  }}>
    {label}
  </span>
);

const ProgressBar = ({ value, color, height = 3 }) => (
  <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
    <div style={{
      height: "100%", width: `${Math.min(100, Math.max(0, value))}%`,
      background: `linear-gradient(90deg, ${color}70, ${color})`,
      borderRadius: 99, transition: "width .5s ease",
    }} />
  </div>
);

// NOTA: Se arregló el paso de la prop `sx` para que los botones tomen el estilo correctamente
function Btn({ onClick, type = "button", children, variant = "ghost", disabled = false, sx = {}, style = {} }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 11 },
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    danger:  { border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    sm:      { border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, fontSize: 10 },
    confirm: { border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      fontFamily: C.sans,
      transition: "opacity .15s, background .15s",
      ...V[variant], 
      ...style, 
      ...sx,
    }}>
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

function Overlay({ onClose, children, maxWidth = 540 }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.85)", ...GLASS,
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "40px 16px", overflowY: "auto",
      }}
    >
      <div style={{
        background: "rgba(15,15,18,0.95)", border: `1px solid ${C.b1}`,
        borderRadius: 14, padding: 26, width: "100%", maxWidth,
        boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
        animation: "slideUp .18s ease", fontFamily: C.sans,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── MODAL DE CONFIRMACIÓN ────────────────────────────────────────────────────
function ConfirmModal({ nombre, tipo, advertencia, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel} maxWidth={400}>
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>⚠</div>
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600, marginBottom: 6 }}>
          Eliminar {tipo}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: C.red, marginBottom: 8 }}>
          {nombre}
        </div>
        <div style={{ fontSize: 12, color: C.t1, marginBottom: 8, lineHeight: 1.6 }}>
          {advertencia}
        </div>
        <div style={{ fontSize: 10, color: C.t2, marginBottom: 22, padding: "7px 12px", background: C.s0, borderRadius: 7, border: `1px solid ${C.b0}` }}>
          Soft delete · un admin puede restaurarlo
        </div>
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

  const lineaSel = lineas.find(l => l.id === form.linea_id);
  const procsLinea = form.linea_id ? lProcs.filter(p => p.linea_id === form.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigo.trim()) { setErr("El código es obligatorio."); return; }
    setSaving(true);
    setErr("");
    try {
      const { data: nueva, error: errObra } = await supabase.from("produccion_obras").insert({
        codigo:             form.codigo.trim().toUpperCase(),
        descripcion:        form.descripcion.trim() || null,
        tipo:               "barco",
        estado:             "activa",
        linea_id:           form.linea_id || null,
        linea_nombre:       lineaSel?.nombre ?? null,
        fecha_inicio:       form.fecha_inicio || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null,
        notas:              form.notas.trim() || null,
      }).select().single();

      if (errObra) { setErr(errObra.message); setSaving(false); return; }

      await supabase.from("laminacion_obras").upsert(
        { nombre: form.codigo.trim().toUpperCase(), estado: "activa", fecha_inicio: form.fecha_inicio || null },
        { onConflict: "nombre", ignoreDuplicates: true }
      ).then(() => {});

      if (form.linea_id && procsLinea.length && nueva?.id) {
        try {
          await supabase.from("obra_etapas").insert(
            procsLinea.map((p, i) => ({
              obra_id:          nueva.id,
              linea_proceso_id: p.id,
              nombre:           p.nombre,
              orden:            p.orden ?? i + 1,
              color:            p.color ?? "#64748b",
              dias_estimados:   p.dias_estimados,
              estado:           "pendiente",
            }))
          );
          await supabase.from("obra_timeline").insert(
            procsLinea.map(p => ({ obra_id: nueva.id, linea_proceso_id: p.id, estado: "pendiente" }))
          );
        } catch { }
      }

      onSave(nueva);
    } catch (ex) {
      setErr(ex?.message ?? "Error inesperado.");
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Nueva obra</div>
          <div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}>Asigná una línea para pre-cargar las etapas</div>
        </div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18, lineHeight: 1 }}>×</Btn>
      </div>

      {err && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <InputSt label="Código *">
            <input style={{ ...INP, fontFamily: C.mono }} required placeholder="37-105" autoFocus
              value={form.codigo} onChange={e => set("codigo", e.target.value)} />
          </InputSt>
          <InputSt label="Línea de producción">
            <select style={INP} value={form.linea_id} onChange={e => set("linea_id", e.target.value)}>
              <option value="">Sin asignar</option>
              {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </InputSt>
        </div>
        <InputSt label="Descripción">
          <input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
        </InputSt>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <InputSt label="Fecha inicio">
            <input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} />
          </InputSt>
          <InputSt label="Fin estimado">
            <input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} />
          </InputSt>
        </div>
        <InputSt label="Notas">
          <input style={INP} value={form.notas} onChange={e => set("notas", e.target.value)} />
        </InputSt>

        {procsLinea.length > 0 && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.18)" }}>
            <div style={{ fontSize: 11, color: "#10b981", marginBottom: 6 }}>
              Se crean {procsLinea.length} etapas desde {lineaSel?.nombre}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {procsLinea.map(p => (
                <span key={p.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: C.s0, color: C.t1, border: `1px solid ${C.b0}` }}>
                  {p.nombre}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="submit" variant="primary" disabled={saving}>
            {saving ? "Creando…" : "Crear obra"}
          </Btn>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        </div>
      </form>
    </Overlay>
  );
}

// ─── MODAL ETAPA ──────────────────────────────────────────────────────────────
function EtapaModal({ etapa, obraId, onSave, onClose }) {
  const isEdit = !!etapa?.id;
  const [form, setForm] = useState({
    nombre:             etapa?.nombre             ?? "",
    descripcion:        etapa?.descripcion        ?? "",
    color:              etapa?.color              ?? "#64748b",
    dias_estimados:     etapa?.dias_estimados     ?? "",
    fecha_inicio:       etapa?.fecha_inicio       ?? "",
    fecha_fin_estimada: etapa?.fecha_fin_estimada ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const PRESETS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b", "#0ea5e9", "#f43f5e"];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre:             form.nombre.trim(),
      descripcion:        form.descripcion.trim() || null,
      color:              form.color,
      dias_estimados:     form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      fecha_inicio:       form.fecha_inicio        || null,
      fecha_fin_estimada: form.fecha_fin_estimada  || null,
    };
    try {
      if (isEdit) {
        await supabase.from("obra_etapas").update(payload).eq("id", etapa.id);
      } else {
        await supabase.from("obra_etapas").insert({ ...payload, obra_id: obraId, orden: 999, estado: "pendiente" });
      }
      onSave();
    } catch { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={460}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar etapa" : "Nueva etapa"}</div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
      </div>
      <form onSubmit={handleSubmit}>
        <InputSt label="Nombre *">
          <input style={INP} required autoFocus placeholder="Ej: Estructura"
            value={form.nombre} onChange={e => set("nombre", e.target.value)} />
        </InputSt>
        <InputSt label="Descripción">
          <input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
        </InputSt>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <InputSt label="Días estimados">
            <input type="number" min="0" step="0.5" style={INP}
              value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} />
          </InputSt>
          <InputSt label="Color">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={form.color} onChange={e => set("color", e.target.value)}
                style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {PRESETS.map(c => (
                  <div key={c} onClick={() => set("color", c)} style={{
                    width: 15, height: 15, borderRadius: 3, background: c, cursor: "pointer",
                    border: form.color === c ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent",
                  }} />
                ))}
              </div>
            </div>
          </InputSt>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
          <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="submit" variant="primary" disabled={saving}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear etapa"}
          </Btn>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        </div>
      </form>
    </Overlay>
  );
}

// ─── MODAL TAREA ──────────────────────────────────────────────────────────────
function TareaModal({ tarea, etapaId, obraId, onSave, onClose }) {
  const isEdit = !!tarea?.id;
  const [form, setForm] = useState({
    nombre:              tarea?.nombre              ?? "",
    descripcion:         tarea?.descripcion         ?? "",
    estado:              tarea?.estado              ?? "pendiente",
    fecha_inicio:        tarea?.fecha_inicio        ?? "",
    fecha_fin_estimada:  tarea?.fecha_fin_estimada  ?? "",
    fecha_fin_real:      tarea?.fecha_fin_real      ?? "",
    horas_estimadas:     tarea?.horas_estimadas     ?? "",
    horas_reales:        tarea?.horas_reales        ?? "",
    personas_necesarias: tarea?.personas_necesarias ?? "",
    responsable:         tarea?.responsable         ?? "",
    observaciones:       tarea?.observaciones       ?? "",
  });
  const [showPlanning, setShowPlanning] = useState(isEdit && !!(tarea?.fecha_inicio || tarea?.horas_estimadas || tarea?.responsable));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre:              form.nombre.trim(),
      descripcion:         form.descripcion.trim()  || null,
      estado:              form.estado,
      fecha_inicio:        form.fecha_inicio         || null,
      fecha_fin_estimada:  form.fecha_fin_estimada   || null,
      fecha_fin_real:      form.fecha_fin_real        || null,
      horas_estimadas:     form.horas_estimadas      !== "" ? num(form.horas_estimadas)      : null,
      horas_reales:        form.horas_reales         !== "" ? num(form.horas_reales)         : null,
      personas_necesarias: form.personas_necesarias  !== "" ? parseInt(form.personas_necesarias) : null,
      responsable:         form.responsable.trim()   || null,
      observaciones:       form.observaciones.trim() || null,
    };
    try {
      if (isEdit) {
        await supabase.from("obra_tareas").update(payload).eq("id", tarea.id);
      } else {
        await supabase.from("obra_tareas").insert({ ...payload, etapa_id: etapaId, obra_id: obraId, orden: 999 });
      }
      onSave();
    } catch { setSaving(false); }
  }

  const secBorder = { padding: "12px 14px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 12 };

  return (
    <Overlay onClose={onClose} maxWidth={540}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar tarea" : "Nueva tarea"}</div>
          <div style={{ fontSize: 11, color: C.t1, marginTop: 3 }}>Solo el nombre es obligatorio</div>
        </div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
      </div>
      <form onSubmit={handleSubmit}>
        <InputSt label="Nombre *">
          <input style={INP} required autoFocus placeholder="Ej: Excavación de pilares"
            value={form.nombre} onChange={e => set("nombre", e.target.value)} />
        </InputSt>

        {/* Estado selector visual */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(C.tarea).map(([k, v]) => (
              <button key={k} type="button" onClick={() => set("estado", k)} style={{
                padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 10,
                border: form.estado === k ? `1px solid ${v.text}44` : `1px solid ${C.b0}`,
                background: form.estado === k ? `${v.text}14` : C.s0,
                color: form.estado === k ? v.text : C.t1,
                fontFamily: C.sans, transition: "all .12s",
              }}>{v.label}</button>
            ))}
          </div>
        </div>

        <InputSt label="Descripción">
          <textarea style={{ ...INP, resize: "vertical", minHeight: 52 }}
            value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
        </InputSt>

        {/* Toggle planning */}
        <button type="button" onClick={() => setShowPlanning(x => !x)} style={{
          width: "100%", padding: "7px 12px", borderRadius: 7, cursor: "pointer",
          border: `1px dashed ${C.b0}`, background: "transparent", color: C.t1,
          fontSize: 10, letterSpacing: 0.5, marginBottom: 12, fontFamily: C.sans,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {showPlanning ? "▲ Ocultar" : "▼ Ver"} planificación
          <span style={{ fontSize: 9, color: C.t2 }}>fechas · horas · responsable</span>
        </button>

        {showPlanning && (
          <>
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[["fecha_inicio", "Inicio"], ["fecha_fin_estimada", "Fin est."], ["fecha_fin_real", "Fin real"]].map(([k, l]) => (
                  <InputSt key={k} label={l}><input type="date" style={INP} value={form[k]} onChange={e => set(k, e.target.value)} /></InputSt>
                ))}
              </div>
            </div>
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Recursos</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                {[["horas_estimadas", "Hs estimadas"], ["horas_reales", "Hs reales"], ["personas_necesarias", "Personas"]].map(([k, l]) => (
                  <InputSt key={k} label={l}><input type="number" min="0" step={k.includes("personas") ? "1" : "0.5"} style={INP} value={form[k]} onChange={e => set(k, e.target.value)} /></InputSt>
                ))}
              </div>
              <InputSt label="Responsable"><input style={INP} placeholder="Nombre" value={form.responsable} onChange={e => set("responsable", e.target.value)} /></InputSt>
            </div>
            <InputSt label="Observaciones">
              <textarea style={{ ...INP, resize: "vertical", minHeight: 60 }} value={form.observaciones} onChange={e => set("observaciones", e.target.value)} />
            </InputSt>
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn type="submit" variant="primary" disabled={saving}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear tarea"}
          </Btn>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        </div>
      </form>
    </Overlay>
  );
}

// ─── PANEL DETALLE ────────────────────────────────────────────────────────────
function DetailPanel({ item, type, onClose, onEdit, onDelete }) {
  if (!item) return null;

  const isObra  = type === "obra";
  const isEtapa = type === "etapa";
  const isTarea = type === "tarea";

  const getChip = () => {
    if (isObra)  { const m = C.obra[item.estado]  ?? C.obra.activa;  return <Chip label={m.label}  dot={m.dot}  bg={m.bg}  border={m.border} />; }
    if (isEtapa) { const m = C.etapa[item.estado] ?? C.etapa.pendiente; return <Chip label={m.label} dot={m.dot} bg={`${m.dot}14`} border={`${m.dot}28`} />; }
    if (isTarea) { const m = C.tarea[item.estado] ?? C.tarea.pendiente; return <Chip label={m.label} dot={m.text} bg={`${m.text}14`} border={`${m.text}28`} />; }
  };

  const Info = ({ label, value, mono }) => value ? (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.b0}` }}>
      <span style={{ fontSize: 10, color: C.t1 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.t1, fontFamily: mono ? C.mono : C.sans }}>{value}</span>
    </div>
  ) : null;

  const Sec = ({ title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 8, letterSpacing: 3, color: C.t2, marginBottom: 7, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{
      width: 300, flexShrink: 0,
      borderLeft: `1px solid ${C.b0}`,
      background: "rgba(10,10,12,0.95)", ...GLASS,
      overflow: "auto", padding: "18px 16px",
      display: "flex", flexDirection: "column",
      animation: "slideLeft .18s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: C.t2, textTransform: "uppercase", marginBottom: 5 }}>
            {isObra ? "Obra" : isEtapa ? "Etapa" : "Tarea"}
          </div>
          {isEtapa && item.color && (
            <div style={{ width: 20, height: 3, background: item.color, borderRadius: 99, marginBottom: 6 }} />
          )}
          <div style={{ fontFamily: isObra ? C.mono : C.sans, fontSize: isObra ? 17 : 14, color: C.t0, fontWeight: 600, wordBreak: "break-word", marginBottom: 8 }}>
            {item.nombre ?? item.codigo}
          </div>
          {getChip()}
        </div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 16, marginLeft: 6, flexShrink: 0 }}>×</Btn>
      </div>

      {item.descripcion && (
        <div style={{ fontSize: 11, color: C.t1, marginBottom: 14, lineHeight: 1.6, fontStyle: "italic" }}>{item.descripcion}</div>
      )}

      {/* Info sections */}
      {(item.fecha_inicio || item.fecha_fin_estimada || item.fecha_fin_real) && (
        <Sec title="Fechas">
          <Info label="Inicio"        value={fmtDateFull(item.fecha_inicio)} mono />
          <Info label="Fin estimado"  value={fmtDateFull(item.fecha_fin_estimada)} mono />
          <Info label="Fin real"      value={fmtDateFull(item.fecha_fin_real)} mono />
          {item.fecha_inicio && !item.fecha_fin_real && (
            <Info label="Transcurrido" value={`${diasDesde(item.fecha_inicio)} días`} mono />
          )}
        </Sec>
      )}

      {isTarea && (item.horas_estimadas || item.horas_reales || item.personas_necesarias || item.responsable) && (
        <Sec title="Recursos">
          <Info label="Hs estimadas" value={item.horas_estimadas ? `${item.horas_estimadas} hs` : null} mono />
          <Info label="Hs reales"    value={item.horas_reales    ? `${item.horas_reales} hs`    : null} mono />
          <Info label="Personas"     value={item.personas_necesarias ? `${item.personas_necesarias}` : null} />
          <Info label="Responsable"  value={item.responsable} />
        </Sec>
      )}

      {isEtapa && item.dias_estimados && (
        <Sec title="Planificación">
          <Info label="Días estimados" value={`${item.dias_estimados}d`} mono />
        </Sec>
      )}

      {isObra && item.notas && (
        <Sec title="Notas">
          <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6 }}>{item.notas}</div>
        </Sec>
      )}

      {isTarea && item.observaciones && (
        <Sec title="Observaciones">
          <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6, padding: "9px 11px", background: C.s0, borderRadius: 7, border: `1px solid ${C.b0}` }}>
            {item.observaciones}
          </div>
        </Sec>
      )}

      {/* Acciones */}
      <div style={{ marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${C.b0}`, display: "flex", gap: 7 }}>
        {!isObra && <Btn variant="outline" onClick={() => onEdit(item, type)} sx={{ flex: 1 }}>Editar</Btn>}
        <Btn variant="danger" onClick={() => onDelete(item, type)} sx={{ flex: 1 }}>Eliminar</Btn>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function ObrasScreen({ profile, signOut }) {
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || ["admin", "oficina"].includes(profile?.role);

  // ── Data ─────────────────────────────────────────────────────
  const [obras,    setObras]    = useState([]);
  const [etapas,   setEtapas]   = useState([]);
  const [tareas,   setTareas]   = useState([]);
  const [lineas,   setLineas]   = useState([]);
  const [lProcs,   setLProcs]   = useState([]);
  const [timeline, setTimeline] = useState([]);  // legacy
  const [loading,  setLoading]  = useState(true);

  // ── UI ───────────────────────────────────────────────────────
  const [filtroEstado,   setFiltroEstado]   = useState("activa");
  const [filtroLinea,    setFiltroLinea]    = useState("todas");
  const [expandedObras,  setExpandedObras]  = useState(new Set());
  const [expandedEtapas, setExpandedEtapas] = useState(new Set());

  // ── Modales ──────────────────────────────────────────────────
  const [showObraModal, setShowObraModal] = useState(false);
  const [etapaModal,    setEtapaModal]    = useState(null);  // { etapa?, obraId }
  const [tareaModal,    setTareaModal]    = useState(null);  // { tarea?, etapaId, obraId }
  const [confirmModal,  setConfirmModal]  = useState(null);
  const [detail,        setDetail]        = useState(null);  // { item, type }

  // ── CARGA DEFENSIVA ───────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      // Traemos las obras sin buscar la columna deleted_at
      safeQuery(supabase.from("produccion_obras").select("*").order("created_at", { ascending: false })),
      safeQuery(supabase.from("obra_etapas").select("*").order("obra_id").order("orden")),
      safeQuery(supabase.from("obra_tareas").select("*").order("etapa_id").order("orden")),
      supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden"),
      supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden"),
      safeQuery(supabase.from("obra_timeline")
        .select("*, linea_procesos(id,nombre,orden,dias_estimados,color), procesos(id,nombre,orden,dias_esperados,color)")
        .order("created_at")),
    ]);
    
    // safeQuery ya nos devuelve el array limpio de data
    setObras(r1);
    setEtapas(r2);
    setTareas(r3);
    setLineas(r4.data ?? []);
    setLProcs(r5.data ?? []);
    setTimeline(r6);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-v5")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_etapas"      }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_tareas"      }, cargar)
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
      return {
        id: `virtual-${obraId}-${p.id}`, obra_id: obraId, isVirtual: true,
        linea_proceso_id: p.id,
        nombre: p.nombre, orden: p.orden, color: p.color,
        dias_estimados: p.dias_estimados,
        estado: tl?.estado === "completado" ? "completado" : tl?.estado === "en_curso" ? "en_curso" : "pendiente",
        fecha_inicio: tl?.fecha_inicio, fecha_fin_real: tl?.fecha_fin,
      };
    });
  }, [etapas, timeline, obras, lProcs]);

  const tareasDeEtapa = useCallback((etapaId) =>
    tareas.filter(t => t.etapa_id === etapaId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
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
    if (allTareas.length) {
      return pct(allTareas.filter(t => t.estado === "finalizada").length, allTareas.length);
    }
    return pct(es.filter(e => e.estado === "completado").length, es.length);
  }, [etapasDeObra, tareasDeEtapa]);

  // ── ACCIONES ─────────────────────────────────────────────────
  const toggleObra  = id => setExpandedObras(s  => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleEtapa = id => setExpandedEtapas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function cambiarEstadoObra(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = today();
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    cargar();
  }

  async function cambiarEstadoEtapa(etapaId, estado) {
    if (String(etapaId).startsWith("virtual")) return;
    await supabase.from("obra_etapas").update({ estado }).eq("id", etapaId);
    cargar();
  }

  async function cambiarEstadoTarea(tareaId, estado) {
    const upd = { estado };
    if (estado === "finalizada") upd.fecha_fin_real = today();
    await supabase.from("obra_tareas").update(upd).eq("id", tareaId);
    cargar();
  }

  // NOTA: Se restauró la lógica exacta de captura de errores para no ocultar info clave.
 function pedirBorrado(item, tipo) {
    const ads = {
      obra:  "Esta acción es irreversible. Se borrarán también sus etapas y tareas si la base de datos tiene cascada.",
      etapa: "Esta acción es irreversible. Se borrarán las tareas de esta etapa.",
      tarea: "Esta acción es irreversible y la tarea se eliminará por completo.",
    };
    setConfirmModal({
      nombre: item.nombre ?? item.codigo,
      tipo,
      advertencia: ads[tipo],
      async onConfirm() {
        try {
          if (tipo === "obra") {
            const { error } = await supabase.from("produccion_obras").delete().eq("id", item.id);
            if (error) alert("Error al borrar la obra: " + error.message);
          } else if (tipo === "etapa") {
            const { error } = await supabase.from("obra_etapas").delete().eq("id", item.id);
            if (error) alert("Error al borrar la etapa: " + error.message);
          } else if (tipo === "tarea") {
            const { error } = await supabase.from("obra_tareas").delete().eq("id", item.id);
            if (error) alert("Error al borrar la tarea: " + error.message);
          }
        } catch (err) {
          console.error("Error inesperado:", err);
        }
        
        if (detail?.item?.id === item.id) setDetail(null);
        setConfirmModal(null);
        cargar(); // Recarga los datos para actualizar la UI
      },
    });
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
  //  ÁRBOL — panel izquierdo
  // ═══════════════════════════════════════════════════════════════
  function TreePanel() {
    return (
      <div style={{
        width: 290, flexShrink: 0,
        borderRight: `1px solid ${C.b0}`,
        background: "rgba(12,12,14,0.85)",
        overflow: "auto", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: C.t2, textTransform: "uppercase" }}>Proyectos</span>
          {esGestion && (
            <Btn variant="primary" sx={{ padding: "4px 11px", fontSize: 10 }} onClick={() => setShowObraModal(true)}>+ Obra</Btn>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: C.t2, fontSize: 11 }}>Cargando…</div>}

          {!loading && obrasFilt.map(obra => {
            const obraEtapas = etapasDeObra(obra.id);
            const expanded   = expandedObras.has(obra.id);
            const obrapct    = pctObra(obra.id);
            const oC         = C.obra[obra.estado] ?? C.obra.activa;
            const isDetail   = detail?.item?.id === obra.id && detail?.type === "obra";

            return (
              <div key={obra.id}>
                {/* OBRA */}
                <div onClick={() => { toggleObra(obra.id); setDetail({ item: obra, type: "obra" }); }} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "7px 14px 7px 10px", cursor: "pointer",
                  background: isDetail ? C.s1 : "transparent",
                  borderLeft: isDetail ? `2px solid ${oC.dot}` : "2px solid transparent",
                  transition: "background .13s",
                }}>
                  <span style={{ fontSize: 8, color: C.t2, width: 10, flexShrink: 0, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▶</span>
                  <Dot color={oC.dot} size={6} glow />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: isDetail ? C.t0 : C.t1, letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.codigo}</div>
                    <ProgressBar value={obrapct} color={oC.dot} height={2} />
                  </div>
                  <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{obrapct}%</span>
                </div>

                {/* ETAPAS */}
                {expanded && (
                  <div>
                    {obraEtapas.map(etapa => {
                      const etapaT = tareasDeEtapa(etapa.id);
                      const etExp  = expandedEtapas.has(etapa.id);
                      const epct   = pctEtapa(etapa.id);
                      const eD     = detail?.item?.id === etapa.id && detail?.type === "etapa";

                      return (
                        <div key={etapa.id}>
                          <div onClick={() => { toggleEtapa(etapa.id); setDetail({ item: etapa, type: "etapa" }); }} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "5px 14px 5px 26px", cursor: "pointer",
                            background: eD ? C.s0 : "transparent", transition: "background .13s",
                          }}>
                            <span style={{ fontSize: 7, color: C.t2, width: 8, flexShrink: 0, display: "inline-block", transform: etExp ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▶</span>
                            <div style={{ width: 3, height: 18, borderRadius: 2, background: etapa.color ?? C.t1, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: eD ? C.t0 : C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa.nombre}</div>
                              {etapaT.length > 0 && <ProgressBar value={epct} color={C.etapa[etapa.estado]?.dot ?? C.t1} height={1.5} />}
                            </div>
                            <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{etapaT.length || ""}</span>
                          </div>

                          {etExp && (
                            <div>
                              {etapaT.map(tarea => {
                                const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
                                const tD = detail?.item?.id === tarea.id && detail?.type === "tarea";
                                return (
                                  <div key={tarea.id} onClick={() => setDetail({ item: tarea, type: "tarea" })} style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "4px 14px 4px 44px",
                                    cursor: "pointer", background: tD ? C.s0 : "transparent", transition: "background .12s",
                                  }}>
                                    <Dot color={tc.text} size={5} glow={tarea.estado === "en_progreso"} />
                                    <span style={{ fontSize: 10, color: tD ? C.t0 : C.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tarea.nombre}</span>
                                  </div>
                                );
                              })}
                              {!etapa.isVirtual && esGestion && (
                                <div onClick={() => setTareaModal({ etapaId: etapa.id, obraId: etapa.obra_id })} style={{ padding: "3px 14px 3px 44px", cursor: "pointer" }}>
                                  <span style={{ fontSize: 9, color: C.t2 }}>+ tarea</span>
                                </div>
                              )}
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
                  </div>
                )}
              </div>
            );
          })}

          {!loading && !obrasFilt.length && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: C.t2, fontSize: 11 }}>Sin obras</div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  GANTT CENTRAL
  // ═══════════════════════════════════════════════════════════════
  function GanttMain() {
    if (loading) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 11, letterSpacing: 3, fontFamily: C.mono }}>
        Cargando…
      </div>
    );
    if (!obrasFilt.length) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, color: C.t2, marginBottom: 10, letterSpacing: 8 }}>◦</div>
          <div style={{ color: C.t2, fontSize: 11, letterSpacing: 2 }}>Sin obras con este filtro</div>
          {esGestion && (
            <div style={{ marginTop: 16 }}>
              <Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn>
            </div>
          )}
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
              <div onClick={() => { toggleObra(obra.id); setDetail({ item: obra, type: "obra" }); }} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9,
                background: C.s0, border: `1px solid ${C.b0}`, cursor: "pointer",
                transition: "border-color .13s, background .13s",
                borderLeft: `3px solid ${oC.dot}`,
              }}>
                <span style={{ fontSize: 10, color: C.t2, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>▶</span>
                <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t0, fontWeight: 600, letterSpacing: 1, flex: "0 0 108px" }}>{obra.codigo}</span>
                {obra.linea_nombre && (
                  <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flex: "0 0 60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.linea_nombre}</span>
                )}
                <div style={{ flex: 1 }}>
                  <ProgressBar value={obrapct} color={oC.dot} height={4} />
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.t1, flex: "0 0 32px", textAlign: "right" }}>{obrapct}%</span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 40px", textAlign: "right" }}>{diasR}d</span>
                {esGestion && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn variant="sm" onClick={e => { e.stopPropagation(); cambiarEstadoObra(obra.id, obra.estado === "activa" ? "pausada" : "activa"); }}>
                      {obra.estado === "activa" ? "Pausar" : "Activar"}
                    </Btn>
                    {obra.estado !== "terminada" && (
                      <Btn variant="sm" sx={{ color: C.etapa.completado.text, borderColor: "rgba(16,185,129,0.3)" }}
                        onClick={e => { e.stopPropagation(); cambiarEstadoObra(obra.id, "terminada"); }}>
                        Terminar
                      </Btn>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(obra, "obra"); }} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>×</button>
                  </div>
                )}
              </div>

              {/* ── ETAPAS EXPANDIDAS ── */}
              {expanded && (
                <div style={{ paddingLeft: 20, paddingTop: 6 }}>
                  {/* Mini gantt timeline */}
                  {obraEtapas.length > 0 && (
                    <>
                      {/* Label row */}
                      <div style={{ display: "flex", paddingLeft: 128, marginBottom: 2 }}>
                        {obraEtapas.map(e => (
                          <div key={e.id} style={{ flex: num(e.dias_estimados) / totalDias, fontSize: 7, color: C.t2, letterSpacing: 1, textTransform: "uppercase", overflow: "hidden", textOverflow: "clip", whiteSpace: "nowrap", textAlign: "center", paddingRight: 2 }}>
                            {e.nombre}
                          </div>
                        ))}
                        <div style={{ flex: "0 0 44px" }} />
                      </div>
                      {/* Timeline bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4 }}>
                        <div style={{ width: 116, flexShrink: 0, fontSize: 9, color: C.t2 }}>Timeline</div>
                        <div style={{ flex: 1, height: 16, display: "flex", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.b0}`, background: "rgba(0,0,0,0.4)" }}>
                          {obraEtapas.map((e, idx) => {
                            const ec = C.etapa[e.estado] ?? C.etapa.pendiente;
                            return (
                              <div key={e.id} title={`${e.nombre} · ${e.estado}`}
                                onClick={() => !e.isVirtual && setDetail({ item: e, type: "etapa" })}
                                style={{
                                  flex: num(e.dias_estimados) / totalDias, height: "100%",
                                  background: e.estado === "completado"
                                    ? `linear-gradient(90deg, ${ec.bar}, rgba(16,185,129,0.28))`
                                    : e.estado === "en_curso"
                                      ? `linear-gradient(90deg, ${ec.bar}, rgba(59,130,246,0.28))`
                                      : ec.bar,
                                  borderRight: idx < obraEtapas.length - 1 ? "1px solid rgba(0,0,0,0.5)" : "none",
                                  cursor: !e.isVirtual ? "pointer" : "default",
                                  ...(e.estado === "en_curso" ? { animation: "gPulse 2.5s ease infinite" } : {}),
                                }}
                              />
                            );
                          })}
                        </div>
                        <div style={{ flex: "0 0 36px", textAlign: "right" }}>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2 }}>{diasR}d</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Filas de etapas */}
                  {obraEtapas.map(etapa => {
                    const etapaT = tareasDeEtapa(etapa.id);
                    const etExp  = expandedEtapas.has(etapa.id);
                    const ec     = C.etapa[etapa.estado] ?? C.etapa.pendiente;
                    const epct   = pctEtapa(etapa.id);

                    return (
                      <div key={etapa.id} style={{ marginBottom: 3 }}>
                        <div onClick={() => { toggleEtapa(etapa.id); !etapa.isVirtual && setDetail({ item: etapa, type: "etapa" }); }} style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 7,
                          background: etExp ? C.s0 : "transparent", cursor: "pointer", transition: "background .12s",
                        }}>
                          <span style={{ fontSize: 7, color: C.t2, width: 8, flexShrink: 0, transform: etExp ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
                          <div style={{ width: 3, height: 22, borderRadius: 2, background: etapa.color ?? "#64748b", flexShrink: 0 }} />
                          <div style={{ width: 100, flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa.nombre}</div>
                            {etapaT.length > 0 && <div style={{ fontSize: 9, color: C.t2 }}>{etapaT.filter(t => t.estado === "finalizada").length}/{etapaT.length}</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <ProgressBar value={epct} color={ec.dot} height={3} />
                          </div>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: ec.text, flex: "0 0 30px", textAlign: "right" }}>{epct}%</span>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 32px", textAlign: "right" }}>{etapa.dias_estimados ?? 0}d</span>
                          {esGestion && !etapa.isVirtual && (
                            <div style={{ display: "flex", gap: 2 }}>
                              {[["pendiente","—"],["en_curso","▶"],["completado","✓"]].map(([est, ico]) => (
                                <button key={est} type="button" onClick={e => { e.stopPropagation(); cambiarEstadoEtapa(etapa.id, est); }}
                                  style={{ width: 18, height: 18, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 9,
                                    background: etapa.estado === est ? `${(C.etapa[est] ?? C.etapa.pendiente).dot}28` : "rgba(255,255,255,0.03)",
                                    color: etapa.estado === est ? (C.etapa[est] ?? C.etapa.pendiente).dot : C.t2 }}>
                                  {ico}
                                </button>
                              ))}
                              <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(etapa, "etapa"); }}
                                style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "1px 4px" }}>×</button>
                            </div>
                          )}
                        </div>

                        {/* TAREAS */}
                        {etExp && (
                          <div style={{ paddingLeft: 20 }}>
                            {etapaT.map(tarea => {
                              const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
                              return (
                                <div key={tarea.id} onClick={() => setDetail({ item: tarea, type: "tarea" })} style={{
                                  display: "flex", alignItems: "center", gap: 7, padding: "4px 8px", borderRadius: 5,
                                  cursor: "pointer", transition: "background .12s",
                                }}>
                                  <Dot color={tc.text} size={5} glow={tarea.estado === "en_progreso"} />
                                  <span style={{ flex: "0 0 108px", fontSize: 10, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tarea.nombre}</span>
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                                    {tarea.horas_estimadas && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{tarea.horas_estimadas}h</span>}
                                    {tarea.responsable && <span style={{ fontSize: 9, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{tarea.responsable}</span>}
                                    {(tarea.fecha_inicio || tarea.fecha_fin_estimada) && (
                                      <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>
                                        {fmtDate(tarea.fecha_inicio)} → {fmtDate(tarea.fecha_fin_estimada)}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 9, color: tc.text }}>{tc.label}</span>
                                  {esGestion && (
                                    <div style={{ display: "flex", gap: 3 }}>
                                      {tarea.estado === "pendiente" && (
                                        <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px" }} onClick={e => { e.stopPropagation(); cambiarEstadoTarea(tarea.id, "en_progreso"); }}>Iniciar</Btn>
                                      )}
                                      {tarea.estado === "en_progreso" && (
                                        <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px", color: C.etapa.completado.text, borderColor: "rgba(16,185,129,0.3)" }} onClick={e => { e.stopPropagation(); cambiarEstadoTarea(tarea.id, "finalizada"); }}>Finalizar</Btn>
                                      )}
                                      <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px" }} onClick={e => { e.stopPropagation(); setTareaModal({ tarea, etapaId: tarea.etapa_id, obraId: tarea.obra_id }); }}>✎</Btn>
                                      <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(tarea, "tarea"); }} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>×</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {esGestion && (
                              <div onClick={() => setTareaModal({ etapaId: etapa.id, obraId: etapa.obra_id })} style={{ padding: "3px 8px 3px 16px", cursor: "pointer" }}>
                                <span style={{ fontSize: 9, color: C.t2 }}>+ nueva tarea</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {esGestion && (
                    <div onClick={() => setEtapaModal({ obraId: obra.id })} style={{ paddingLeft: 12, paddingTop: 2, paddingBottom: 4, cursor: "pointer" }}>
                      <span style={{ fontSize: 9, color: C.t2 }}>+ nueva etapa</span>
                    </div>
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
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
          {/* TOPBAR */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 7, flex: 1 }}>
              {[
                { label: "Activas",    n: stats.activas,    c: C.obra.activa.dot    },
                { label: "Pausadas",   n: stats.pausadas,   c: C.obra.pausada.dot   },
                { label: "Terminadas", n: stats.terminadas, c: C.obra.terminada.dot },
              ].map(({ label, n, c }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `2px solid ${c}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 8, color: C.t1, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
            {esGestion && (
              <Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn>
            )}
          </div>

          {/* FILTERBAR */}
          <div style={{
            height: 36, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0, overflowX: "auto",
          }}>
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Estado</span>
            {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFiltroEstado(v)} style={{
                border: filtroEstado === v ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)",
                background: filtroEstado === v ? C.s1 : "transparent",
                color: filtroEstado === v ? C.t0 : C.t1,
                padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", fontFamily: C.sans,
              }}>{l}</button>
            ))}
            <div style={{ width: 1, height: 12, background: C.b0, margin: "0 3px", flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Línea</span>
            <button key="todas" type="button" onClick={() => setFiltroLinea("todas")} style={{ border: filtroLinea === "todas" ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", background: filtroLinea === "todas" ? C.s1 : "transparent", color: filtroLinea === "todas" ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>Todas</button>
            {lineas.map(l => (
              <button key={l.id} type="button" onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)} style={{ border: filtroLinea === l.id ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", borderLeft: filtroLinea === l.id ? `2px solid ${l.color}` : undefined, background: filtroLinea === l.id ? C.s1 : "transparent", color: filtroLinea === l.id ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", fontFamily: C.sans }}>
                {l.nombre}
              </button>
            ))}
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <TreePanel />
            <GanttMain />
            {detail && (
              <DetailPanel
                item={detail.item}
                type={detail.type}
                onClose={() => setDetail(null)}
                onEdit={(item, type) => {
                  if (type === "etapa") setEtapaModal({ etapa: item, obraId: item.obra_id });
                  if (type === "tarea") setTareaModal({ tarea: item, etapaId: item.etapa_id, obraId: item.obra_id });
                }}
                onDelete={pedirBorrado}
              />
            )}
          </div>
        </div>
      </div>

      {/* MODALES */}
      {showObraModal && (
        <ObraModal
          lineas={lineas} lProcs={lProcs}
          onSave={nueva => { setShowObraModal(false); cargar(); if (nueva?.id) setExpandedObras(s => new Set(s).add(nueva.id)); }}
          onClose={() => setShowObraModal(false)}
        />
      )}
      {etapaModal && (
        <EtapaModal etapa={etapaModal.etapa} obraId={etapaModal.obraId}
          onSave={() => { setEtapaModal(null); cargar(); }}
          onClose={() => setEtapaModal(null)} />
      )}
      {tareaModal && (
        <TareaModal tarea={tareaModal.tarea} etapaId={tareaModal.etapaId} obraId={tareaModal.obraId}
          onSave={() => { setTareaModal(null); cargar(); }}
          onClose={() => setTareaModal(null)} />
      )}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />
      )}
    </div>
  );
}