/**
 * ObrasScreen v6
 * CAMBIOS:
 * — Bug fix: TareaModal y EtapaModal ahora chequean el error de Supabase antes de llamar onSave
 * — Etapas: campo "genera orden de compra" editable por etapa con tipo, descripcion y monto
 * — Al marcar etapa como "completado" se dispara automáticamente una orden en tabla ordenes_compra
 * — Botón ⚙ en el filtro de líneas abre editor de plantilla de etapas para esa línea
 * — LineasEtapasModal: gestiona las etapas base (linea_procesos) de cada línea de producción
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const num        = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const today      = () => new Date().toISOString().slice(0, 10);
const fmtDate    = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
const fmtDateFull= d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const diasDesde  = f => !f ? 0 : Math.max(0, Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000));
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
};

const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

const COLOR_PRESETS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#64748b","#0ea5e9","#f43f5e"];

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
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

function Btn({ onClick, type = "button", children, variant = "ghost", disabled = false, sx = {}, style = {} }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 11 },
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    danger:  { border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    sm:      { border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, fontSize: 10 },
    confirm: { border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    green:   { border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.12)", color: "#34d399", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: C.sans, transition: "opacity .15s, background .15s", ...V[variant], ...style, ...sx }}>
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
    <div onClick={e => e.target === e.currentTarget && onClose?.()} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.85)", ...GLASS, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "rgba(15,15,18,0.95)", border: `1px solid ${C.b1}`, borderRadius: 14, padding: 26, width: "100%", maxWidth, boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)", animation: "slideUp .18s ease", fontFamily: C.sans }}>
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
        <div style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚠</div>
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600, marginBottom: 6 }}>Eliminar {tipo}</div>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: C.red, marginBottom: 8 }}>{nombre}</div>
        <div style={{ fontSize: 12, color: C.t1, marginBottom: 8, lineHeight: 1.6 }}>{advertencia}</div>
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

  const lineaSel   = lineas.find(l => l.id === form.linea_id);
  const procsLinea = form.linea_id ? lProcs.filter(p => p.linea_id === form.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigo.trim()) { setErr("El código es obligatorio."); return; }
    setSaving(true); setErr("");
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
              obra_id:              nueva.id,
              linea_proceso_id:     p.id,
              nombre:               p.nombre,
              orden:                p.orden ?? i + 1,
              color:                p.color ?? "#64748b",
              dias_estimados:       p.dias_estimados,
              estado:               "pendiente",
              // Heredar config de orden de compra desde la plantilla
              genera_orden_compra:          p.genera_orden_compra          ?? false,
              orden_compra_tipo:            p.orden_compra_tipo            ?? "aviso",
              orden_compra_descripcion:     p.orden_compra_descripcion     ?? null,
              orden_compra_monto_estimado:  p.orden_compra_monto_estimado  ?? null,
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
      {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <InputSt label="Código *">
            <input style={{ ...INP, fontFamily: C.mono }} required placeholder="37-105" autoFocus value={form.codigo} onChange={e => set("codigo", e.target.value)} />
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
          <InputSt label="Fecha inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
          <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
        </div>
        <InputSt label="Notas"><input style={INP} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
        {procsLinea.length > 0 && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.18)" }}>
            <div style={{ fontSize: 11, color: "#10b981", marginBottom: 6 }}>Se crean {procsLinea.length} etapas desde {lineaSel?.nombre}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {procsLinea.map(p => (
                <span key={p.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: C.s0, color: C.t1, border: `1px solid ${C.b0}` }}>
                  {p.nombre}{p.genera_orden_compra ? " 🛒" : ""}
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Creando…" : "Crear obra"}</Btn>
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
    nombre:                       etapa?.nombre                       ?? "",
    descripcion:                  etapa?.descripcion                  ?? "",
    color:                        etapa?.color                        ?? "#64748b",
    dias_estimados:               etapa?.dias_estimados               ?? "",
    fecha_inicio:                 etapa?.fecha_inicio                 ?? "",
    fecha_fin_estimada:           etapa?.fecha_fin_estimada           ?? "",
    genera_orden_compra:          etapa?.genera_orden_compra          ?? false,
    orden_compra_tipo:            etapa?.orden_compra_tipo            ?? "aviso",
    orden_compra_descripcion:     etapa?.orden_compra_descripcion     ?? "",
    orden_compra_monto_estimado:  etapa?.orden_compra_monto_estimado  ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre:                       form.nombre.trim(),
      descripcion:                  form.descripcion.trim() || null,
      color:                        form.color,
      dias_estimados:               form.dias_estimados !== "" ? num(form.dias_estimados) : null,
      fecha_inicio:                 form.fecha_inicio        || null,
      fecha_fin_estimada:           form.fecha_fin_estimada  || null,
      genera_orden_compra:          form.genera_orden_compra,
      orden_compra_tipo:            form.genera_orden_compra ? form.orden_compra_tipo : null,
      orden_compra_descripcion:     form.genera_orden_compra ? (form.orden_compra_descripcion.trim() || null) : null,
      orden_compra_monto_estimado:  form.genera_orden_compra && form.orden_compra_monto_estimado !== "" ? num(form.orden_compra_monto_estimado) : null,
    };
    const { error } = isEdit
      ? await supabase.from("obra_etapas").update(payload).eq("id", etapa.id)
      : await supabase.from("obra_etapas").insert({ ...payload, obra_id: obraId, orden: 999, estado: "pendiente" });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  return (
    <Overlay onClose={onClose} maxWidth={500}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar etapa" : "Nueva etapa"}</div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
      </div>
      {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
      <form onSubmit={handleSubmit}>
        <InputSt label="Nombre *">
          <input style={INP} required autoFocus placeholder="Ej: Estructura" value={form.nombre} onChange={e => set("nombre", e.target.value)} />
        </InputSt>
        <InputSt label="Descripción">
          <input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
        </InputSt>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <InputSt label="Días estimados">
            <input type="number" min="0" step="0.5" style={INP} value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} />
          </InputSt>
          <InputSt label="Color">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={form.color} onChange={e => set("color", e.target.value)} style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {COLOR_PRESETS.map(c => (
                  <div key={c} onClick={() => set("color", c)} style={{ width: 15, height: 15, borderRadius: 3, background: c, cursor: "pointer", border: form.color === c ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
          </InputSt>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
          <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
        </div>

        {/* ── ORDEN DE COMPRA ── */}
        <div style={{ padding: "12px 14px", background: form.genera_orden_compra ? "rgba(245,158,11,0.05)" : C.s0, border: `1px solid ${form.genera_orden_compra ? "rgba(245,158,11,0.25)" : C.b0}`, borderRadius: 10, marginBottom: 16, transition: "all .2s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: form.genera_orden_compra ? 14 : 0 }}>
            <div>
              <div style={{ fontSize: 12, color: form.genera_orden_compra ? C.amber : C.t1, fontWeight: 500 }}>🛒 Orden/aviso de compra</div>
              <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Se dispara automáticamente al completar esta etapa</div>
            </div>
            <button type="button" onClick={() => set("genera_orden_compra", !form.genera_orden_compra)} style={{
              width: 38, height: 21, borderRadius: 99, border: "none", flexShrink: 0, cursor: "pointer",
              background: form.genera_orden_compra ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.07)",
              position: "relative", transition: "background .2s",
            }}>
              <div style={{ position: "absolute", top: 4, left: form.genera_orden_compra ? 18 : 4, width: 13, height: 13, borderRadius: "50%", background: form.genera_orden_compra ? "#fbbf24" : "#383838", transition: "left .18s" }} />
            </button>
          </div>
          {form.genera_orden_compra && (
            <div>
              <InputSt label="Tipo">
                <div style={{ display: "flex", gap: 6 }}>
                  {[["aviso","Aviso de compra"],["compra","Orden de compra"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set("orden_compra_tipo", v)} style={{
                      flex: 1, padding: "7px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11,
                      border: form.orden_compra_tipo === v ? "1px solid rgba(245,158,11,0.4)" : `1px solid ${C.b0}`,
                      background: form.orden_compra_tipo === v ? "rgba(245,158,11,0.12)" : C.s0,
                      color: form.orden_compra_tipo === v ? C.amber : C.t1, fontFamily: C.sans,
                    }}>{l}</button>
                  ))}
                </div>
              </InputSt>
              <InputSt label="Descripción / Materiales">
                <textarea style={{ ...INP, resize: "vertical", minHeight: 56 }} placeholder="Ej: Placas FRP, resina, gelcoat…" value={form.orden_compra_descripcion} onChange={e => set("orden_compra_descripcion", e.target.value)} />
              </InputSt>
              <InputSt label="Monto estimado (opcional)">
                <input type="number" min="0" step="0.01" style={INP} placeholder="0.00" value={form.orden_compra_monto_estimado} onChange={e => set("orden_compra_monto_estimado", e.target.value)} />
              </InputSt>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar" : "Crear etapa"}</Btn>
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
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    const payload = {
      nombre:              form.nombre.trim(),
      descripcion:         form.descripcion.trim()  || null,
      estado:              form.estado,
      fecha_inicio:        form.fecha_inicio         || null,
      fecha_fin_estimada:  form.fecha_fin_estimada   || null,
      fecha_fin_real:      form.fecha_fin_real        || null,
      horas_estimadas:     form.horas_estimadas      !== "" ? num(form.horas_estimadas)       : null,
      horas_reales:        form.horas_reales         !== "" ? num(form.horas_reales)          : null,
      personas_necesarias: form.personas_necesarias  !== "" ? parseInt(form.personas_necesarias) : null,
      responsable:         form.responsable.trim()   || null,
      observaciones:       form.observaciones.trim() || null,
    };
    // ✅ FIX: chequear el error que devuelve Supabase en lugar de solo capturar excepciones
    const { error } = isEdit
      ? await supabase.from("obra_tareas").update(payload).eq("id", tarea.id)
      : await supabase.from("obra_tareas").insert({ ...payload, etapa_id: etapaId, obra_id: obraId, orden: 999 });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
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
      {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{err}</div>}
      <form onSubmit={handleSubmit}>
        <InputSt label="Nombre *">
          <input style={INP} required autoFocus placeholder="Ej: Excavación de pilares" value={form.nombre} onChange={e => set("nombre", e.target.value)} />
        </InputSt>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(C.tarea).map(([k, v]) => (
              <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 10, border: form.estado === k ? `1px solid ${v.text}44` : `1px solid ${C.b0}`, background: form.estado === k ? `${v.text}14` : C.s0, color: form.estado === k ? v.text : C.t1, fontFamily: C.sans, transition: "all .12s" }}>{v.label}</button>
            ))}
          </div>
        </div>
        <InputSt label="Descripción">
          <textarea style={{ ...INP, resize: "vertical", minHeight: 52 }} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
        </InputSt>
        <button type="button" onClick={() => setShowPlanning(x => !x)} style={{ width: "100%", padding: "7px 12px", borderRadius: 7, cursor: "pointer", border: `1px dashed ${C.b0}`, background: "transparent", color: C.t1, fontSize: 10, letterSpacing: 0.5, marginBottom: 12, fontFamily: C.sans, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {showPlanning ? "▲ Ocultar" : "▼ Ver"} planificación
          <span style={{ fontSize: 9, color: C.t2 }}>fechas · horas · responsable</span>
        </button>
        {showPlanning && (
          <>
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[["fecha_inicio","Inicio"],["fecha_fin_estimada","Fin est."],["fecha_fin_real","Fin real"]].map(([k, l]) => (
                  <InputSt key={k} label={l}><input type="date" style={INP} value={form[k]} onChange={e => set(k, e.target.value)} /></InputSt>
                ))}
              </div>
            </div>
            <div style={secBorder}>
              <div style={{ fontSize: 8, letterSpacing: 2.5, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Recursos</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                {[["horas_estimadas","Hs estimadas"],["horas_reales","Hs reales"],["personas_necesarias","Personas"]].map(([k, l]) => (
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
          <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar" : "Crear tarea"}</Btn>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        </div>
      </form>
    </Overlay>
  );
}

// ─── MODAL EDITOR DE PLANTILLA DE LÍNEA ─────────────────────────────────────
function LineasEtapasModal({ linea, lProcs, onClose, onSaved }) {
  const etapasLinea = lProcs.filter(p => p.linea_id === linea.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const [items, setItems]     = useState(etapasLinea);
  const [editIdx, setEditIdx] = useState(null);   // índice del item que se está editando inline
  const [adding, setAdding]   = useState(false);
  const [newForm, setNewForm] = useState({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "" });
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null);

  function flash(ok, text) { setToast({ ok, text }); setTimeout(() => setToast(null), 2500); }

  // Edición inline de un item
  const [editBuf, setEditBuf] = useState({});
  function startEdit(idx) {
    setEditIdx(idx);
    setEditBuf({ ...items[idx] });
  }
  function cancelEdit() { setEditIdx(null); setEditBuf({}); }
  const eb = (k, v) => setEditBuf(f => ({ ...f, [k]: v }));

  async function saveEdit(idx) {
    setSaving(true);
    const item = items[idx];
    const payload = {
      nombre:                       editBuf.nombre?.trim() || item.nombre,
      dias_estimados:               editBuf.dias_estimados !== "" ? num(editBuf.dias_estimados) : null,
      color:                        editBuf.color ?? item.color,
      genera_orden_compra:          editBuf.genera_orden_compra ?? false,
      orden_compra_tipo:            editBuf.genera_orden_compra ? (editBuf.orden_compra_tipo ?? "aviso") : null,
      orden_compra_descripcion:     editBuf.genera_orden_compra ? (editBuf.orden_compra_descripcion?.trim() || null) : null,
      orden_compra_monto_estimado:  editBuf.genera_orden_compra && editBuf.orden_compra_monto_estimado !== "" ? num(editBuf.orden_compra_monto_estimado) : null,
    };
    const { error } = await supabase.from("linea_procesos").update(payload).eq("id", item.id);
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...payload } : it));
    setEditIdx(null);
    flash(true, "Guardado.");
    setSaving(false);
    onSaved();
  }

  async function addEtapa() {
    if (!newForm.nombre.trim()) return;
    setSaving(true);
    const maxOrden = Math.max(0, ...items.map(p => p.orden ?? 0));
    const { data, error } = await supabase.from("linea_procesos").insert({
      linea_id:                     linea.id,
      nombre:                       newForm.nombre.trim(),
      dias_estimados:               newForm.dias_estimados !== "" ? num(newForm.dias_estimados) : null,
      color:                        newForm.color,
      orden:                        maxOrden + 1,
      activo:                       true,
      genera_orden_compra:          newForm.genera_orden_compra,
      orden_compra_tipo:            newForm.genera_orden_compra ? newForm.orden_compra_tipo : null,
      orden_compra_descripcion:     newForm.genera_orden_compra ? (newForm.orden_compra_descripcion.trim() || null) : null,
      orden_compra_monto_estimado:  newForm.genera_orden_compra && newForm.orden_compra_monto_estimado !== "" ? num(newForm.orden_compra_monto_estimado) : null,
    }).select().single();
    if (error) { flash(false, error.message); setSaving(false); return; }
    setItems(prev => [...prev, data]);
    setAdding(false);
    setNewForm({ nombre: "", dias_estimados: "", color: "#64748b", genera_orden_compra: false, orden_compra_tipo: "aviso", orden_compra_descripcion: "", orden_compra_monto_estimado: "" });
    flash(true, "Etapa agregada.");
    setSaving(false);
    onSaved();
  }

  async function deleteEtapa(item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}" de la plantilla?`)) return;
    const { error } = await supabase.from("linea_procesos").delete().eq("id", item.id);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.filter(it => it.id !== item.id));
    flash(true, "Eliminada.");
    onSaved();
  }

  async function moveItem(idx, dir) {
    const next = [...items];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setItems(next);
    // Persist orden
    await Promise.all(next.map((it, i) => supabase.from("linea_procesos").update({ orden: i + 1 }).eq("id", it.id)));
    onSaved();
  }

  function EtapaRow({ item, idx }) {
    const isEditing = editIdx === idx;
    return (
      <div style={{ border: `1px solid ${isEditing ? "rgba(59,130,246,0.3)" : C.b0}`, borderRadius: 9, marginBottom: 6, background: isEditing ? "rgba(59,130,246,0.04)" : C.s0, transition: "border-color .2s" }}>
        {/* Header siempre visible */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: item.color ?? "#64748b", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: C.t0, fontWeight: 500 }}>{item.nombre}</span>
          {item.dias_estimados && <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{item.dias_estimados}d</span>}
          {item.genera_orden_compra && <span style={{ fontSize: 9, color: C.amber, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 7px", borderRadius: 4 }}>🛒 {item.orden_compra_tipo ?? "aviso"}</span>}
          <div style={{ display: "flex", gap: 3 }}>
            <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ ...btnIcon, opacity: idx === 0 ? 0.2 : 1 }}>↑</button>
            <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} style={{ ...btnIcon, opacity: idx === items.length - 1 ? 0.2 : 1 }}>↓</button>
            <button type="button" onClick={() => isEditing ? cancelEdit() : startEdit(idx)} style={{ ...btnIcon, color: isEditing ? C.primary : C.t2 }}>{isEditing ? "✕" : "✎"}</button>
            <button type="button" onClick={() => deleteEtapa(item)} style={{ ...btnIcon, color: C.red }}>×</button>
          </div>
        </div>
        {/* Formulario inline al editar */}
        {isEditing && (
          <div style={{ padding: "0 12px 12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, marginBottom: 8 }}>
              <InputSt label="Nombre">
                <input style={INP} value={editBuf.nombre ?? item.nombre} onChange={e => eb("nombre", e.target.value)} />
              </InputSt>
              <InputSt label="Días">
                <input type="number" min="0" step="0.5" style={INP} value={editBuf.dias_estimados ?? item.dias_estimados ?? ""} onChange={e => eb("dias_estimados", e.target.value)} />
              </InputSt>
            </div>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="color" value={editBuf.color ?? item.color ?? "#64748b"} onChange={e => eb("color", e.target.value)} style={{ width: 30, height: 28, border: "none", background: "none", cursor: "pointer" }} />
                {COLOR_PRESETS.map(c => <div key={c} onClick={() => eb("color", c)} style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: "pointer", border: (editBuf.color ?? item.color) === c ? "2px solid #fff" : "2px solid transparent" }} />)}
              </div>
            </InputSt>
            <OrdenCompraSection
              genera={editBuf.genera_orden_compra ?? item.genera_orden_compra ?? false}
              tipo={editBuf.orden_compra_tipo ?? item.orden_compra_tipo ?? "aviso"}
              desc={editBuf.orden_compra_descripcion ?? item.orden_compra_descripcion ?? ""}
              monto={editBuf.orden_compra_monto_estimado ?? item.orden_compra_monto_estimado ?? ""}
              onChange={(k, v) => eb(k, v)}
            />
            <div style={{ display: "flex", gap: 7, marginTop: 4 }}>
              <Btn variant="primary" onClick={() => saveEdit(idx)} disabled={saving}>Guardar</Btn>
              <Btn variant="outline" onClick={cancelEdit}>Cancelar</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  const btnIcon = { border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "2px 7px", borderRadius: 5, fontFamily: C.sans };

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      {/* Toast local */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, padding: "10px 18px", borderRadius: 8, fontSize: 12, fontFamily: C.sans, background: toast.ok ? "#091510" : "#150909", border: `1px solid ${toast.ok ? "rgba(60,140,80,0.5)" : "rgba(180,60,60,0.5)"}`, color: toast.ok ? "#70c080" : "#c07070" }}>
          {toast.text}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Plantilla de etapas</div>
          <div style={{ fontSize: 11, color: C.t1, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: linea.color ?? C.t2 }} />
            {linea.nombre} — estas etapas se asignan a todas las obras nuevas de esta línea
          </div>
        </div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
      </div>

      <div style={{ maxHeight: "55vh", overflowY: "auto", marginBottom: 12 }}>
        {items.length === 0 && !adding && (
          <div style={{ textAlign: "center", padding: "28px 0", color: C.t2, fontSize: 12 }}>Sin etapas en esta plantilla</div>
        )}
        {items.map((item, idx) => <EtapaRow key={item.id} item={item} idx={idx} />)}

        {/* Formulario de nueva etapa */}
        {adding && (
          <div style={{ border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 9, padding: "12px", background: "rgba(59,130,246,0.04)", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.primary, marginBottom: 10, fontWeight: 500 }}>Nueva etapa en plantilla</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, marginBottom: 8 }}>
              <InputSt label="Nombre *">
                <input style={INP} autoFocus placeholder="Ej: Pintura" value={newForm.nombre} onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))} />
              </InputSt>
              <InputSt label="Días">
                <input type="number" min="0" step="0.5" style={INP} value={newForm.dias_estimados} onChange={e => setNewForm(f => ({ ...f, dias_estimados: e.target.value }))} />
              </InputSt>
            </div>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="color" value={newForm.color} onChange={e => setNewForm(f => ({ ...f, color: e.target.value }))} style={{ width: 30, height: 28, border: "none", background: "none", cursor: "pointer" }} />
                {COLOR_PRESETS.map(c => <div key={c} onClick={() => setNewForm(f => ({ ...f, color: c }))} style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: "pointer", border: newForm.color === c ? "2px solid #fff" : "2px solid transparent" }} />)}
              </div>
            </InputSt>
            <OrdenCompraSection
              genera={newForm.genera_orden_compra}
              tipo={newForm.orden_compra_tipo}
              desc={newForm.orden_compra_descripcion}
              monto={newForm.orden_compra_monto_estimado}
              onChange={(k, v) => setNewForm(f => ({ ...f, [k]: v }))}
            />
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
    </Overlay>
  );
}

// Subcomponente reutilizable para la sección de orden de compra
function OrdenCompraSection({ genera, tipo, desc, monto, onChange }) {
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
          <InputSt label="Descripción">
            <textarea style={{ ...INP, resize: "vertical", minHeight: 48 }} placeholder="Materiales, proveedor…" value={desc} onChange={e => onChange("orden_compra_descripcion", e.target.value)} />
          </InputSt>
          <InputSt label="Monto estimado">
            <input type="number" min="0" step="0.01" style={INP} value={monto} onChange={e => onChange("orden_compra_monto_estimado", e.target.value)} />
          </InputSt>
        </>
      )}
    </div>
  );
}

// ─── PANEL DETALLE ────────────────────────────────────────────────────────────
function DetailPanel({ item, type, onClose, onEdit, onDelete }) {
  if (!item) return null;
  const isObra  = type === "obra";
  const isEtapa = type === "etapa";
  const isTarea = type === "tarea";

  const getChip = () => {
    if (isObra)  { const m = C.obra[item.estado]  ?? C.obra.activa;   return <Chip label={m.label}  dot={m.dot}  bg={m.bg}  border={m.border} />; }
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
    <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.b0}`, background: "rgba(10,10,12,0.95)", ...GLASS, overflow: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", animation: "slideLeft .18s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: C.t2, textTransform: "uppercase", marginBottom: 5 }}>{isObra ? "Obra" : isEtapa ? "Etapa" : "Tarea"}</div>
          {isEtapa && item.color && <div style={{ width: 20, height: 3, background: item.color, borderRadius: 99, marginBottom: 6 }} />}
          <div style={{ fontFamily: isObra ? C.mono : C.sans, fontSize: isObra ? 17 : 14, color: C.t0, fontWeight: 600, wordBreak: "break-word", marginBottom: 8 }}>
            {item.nombre ?? item.codigo}
          </div>
          {getChip()}
        </div>
        <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 16, marginLeft: 6, flexShrink: 0 }}>×</Btn>
      </div>

      {item.descripcion && <div style={{ fontSize: 11, color: C.t1, marginBottom: 14, lineHeight: 1.6, fontStyle: "italic" }}>{item.descripcion}</div>}

      {(item.fecha_inicio || item.fecha_fin_estimada || item.fecha_fin_real) && (
        <Sec title="Fechas">
          <Info label="Inicio"        value={fmtDateFull(item.fecha_inicio)} mono />
          <Info label="Fin estimado"  value={fmtDateFull(item.fecha_fin_estimada)} mono />
          <Info label="Fin real"      value={fmtDateFull(item.fecha_fin_real)} mono />
        </Sec>
      )}

      {isTarea && (item.horas_estimadas || item.horas_reales || item.personas_necesarias || item.responsable) && (
        <Sec title="Recursos">
          <Info label="Hs estimadas" value={item.horas_estimadas    ? `${item.horas_estimadas} hs` : null} mono />
          <Info label="Hs reales"    value={item.horas_reales       ? `${item.horas_reales} hs`    : null} mono />
          <Info label="Personas"     value={item.personas_necesarias ? `${item.personas_necesarias}` : null} />
          <Info label="Responsable"  value={item.responsable} />
        </Sec>
      )}

      {isEtapa && item.dias_estimados && (
        <Sec title="Planificación">
          <Info label="Días estimados" value={`${item.dias_estimados}d`} mono />
        </Sec>
      )}

      {/* Orden de compra info en el panel detalle */}
      {isEtapa && item.genera_orden_compra && (
        <Sec title="Orden de compra">
          <div style={{ padding: "8px 10px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 7 }}>
            <div style={{ fontSize: 10, color: C.amber, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>🛒 {item.orden_compra_tipo ?? "aviso"}</div>
            {item.orden_compra_descripcion && <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}>{item.orden_compra_descripcion}</div>}
            {item.orden_compra_monto_estimado && <div style={{ fontSize: 11, color: C.t2, marginTop: 4, fontFamily: C.mono }}>${Number(item.orden_compra_monto_estimado).toLocaleString("es-AR")}</div>}
          </div>
        </Sec>
      )}

      {isObra && item.notas && <Sec title="Notas"><div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6 }}>{item.notas}</div></Sec>}
      {isTarea && item.observaciones && <Sec title="Observaciones"><div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6, padding: "9px 11px", background: C.s0, borderRadius: 7, border: `1px solid ${C.b0}` }}>{item.observaciones}</div></Sec>}

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

  const [obras,    setObras]    = useState([]);
  const [etapas,   setEtapas]   = useState([]);
  const [tareas,   setTareas]   = useState([]);
  const [lineas,   setLineas]   = useState([]);
  const [lProcs,   setLProcs]   = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [filtroEstado,   setFiltroEstado]   = useState("activa");
  const [filtroLinea,    setFiltroLinea]    = useState("todas");
  const [expandedObras,  setExpandedObras]  = useState(new Set());
  const [expandedEtapas, setExpandedEtapas] = useState(new Set());

  const [showObraModal,   setShowObraModal]   = useState(false);
  const [etapaModal,      setEtapaModal]      = useState(null);
  const [tareaModal,      setTareaModal]      = useState(null);
  const [confirmModal,    setConfirmModal]    = useState(null);
  const [detail,          setDetail]          = useState(null);
  const [lineasModal,     setLineasModal]     = useState(null); // { linea }

  // ── CARGA ─────────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      safeQuery(supabase.from("produccion_obras").select("*").order("created_at", { ascending: false })),
      safeQuery(supabase.from("obra_etapas").select("*").order("obra_id").order("orden")),
      safeQuery(supabase.from("obra_tareas").select("*").order("etapa_id").order("orden")),
      supabase.from("lineas_produccion").select("*").eq("activa", true).order("orden"),
      supabase.from("linea_procesos").select("*").eq("activo", true).order("linea_id").order("orden"),
      safeQuery(supabase.from("obra_timeline")
        .select("*, linea_procesos(id,nombre,orden,dias_estimados,color), procesos(id,nombre,orden,dias_esperados,color)")
        .order("created_at")),
    ]);
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
    const ch = supabase.channel("rt-obras-v6")
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
        linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden, color: p.color,
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
    if (allTareas.length) return pct(allTareas.filter(t => t.estado === "finalizada").length, allTareas.length);
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
    const upd = { estado };
    if (estado === "completado") upd.fecha_fin_real = today();
    await supabase.from("obra_etapas").update(upd).eq("id", etapaId);

    // ── Disparar orden/aviso de compra al completar ───────────
    if (estado === "completado") {
      const etapa = etapas.find(e => e.id === etapaId);
      if (etapa?.genera_orden_compra) {
        // Intento silencioso — la tabla ordenes_compra debe existir en el schema
        supabase.from("ordenes_compra").insert({
          obra_id:               etapa.obra_id,
          etapa_id:              etapa.id,
          etapa_nombre:          etapa.nombre,
          tipo:                  etapa.orden_compra_tipo            ?? "aviso",
          descripcion:           etapa.orden_compra_descripcion     ?? null,
          monto_estimado:        etapa.orden_compra_monto_estimado  ?? null,
          estado:                "pendiente",
          fecha_creacion:        today(),
        }).then(({ error }) => {
          if (error) console.warn("ordenes_compra insert:", error.message);
        });
      }
    }
    cargar();
  }

  async function cambiarEstadoTarea(tareaId, estado) {
    const upd = { estado };
    if (estado === "finalizada") upd.fecha_fin_real = today();
    await supabase.from("obra_tareas").update(upd).eq("id", tareaId);
    cargar();
  }

  function pedirBorrado(item, tipo) {
    const ads = {
      obra:  "Esta acción es irreversible. Se borrarán sus etapas, tareas y el historial en Laminación.",
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
            await supabase.from("laminacion_obras").delete().eq("nombre", item.codigo);
            await supabase.from("laminacion_movimientos").delete().eq("obra", item.codigo);
          } else if (tipo === "etapa") {
            const { error } = await supabase.from("obra_etapas").delete().eq("id", item.id);
            if (error) alert("Error al borrar la etapa: " + error.message);
          } else if (tipo === "tarea") {
            const { error } = await supabase.from("obra_tareas").delete().eq("id", item.id);
            if (error) alert("Error al borrar la tarea: " + error.message);
          }
        } catch (err) { console.error("Error inesperado:", err); }
        if (detail?.item?.id === item.id) setDetail(null);
        setConfirmModal(null);
        cargar();
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
  //  ÁRBOL
  // ═══════════════════════════════════════════════════════════════
  function TreePanel() {
    return (
      <div style={{ width: 290, flexShrink: 0, borderRight: `1px solid ${C.b0}`, background: "rgba(12,12,14,0.85)", overflow: "auto", display: "flex", flexDirection: "column" }}>
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
            const isDetail   = detail?.item?.id === obra.id && detail?.type === "obra";
            return (
              <div key={obra.id}>
                <div onClick={() => { toggleObra(obra.id); setDetail({ item: obra, type: "obra" }); }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px 7px 10px", cursor: "pointer", background: isDetail ? C.s1 : "transparent", borderLeft: isDetail ? `2px solid ${oC.dot}` : "2px solid transparent", transition: "background .13s" }}>
                  <span style={{ fontSize: 8, color: C.t2, width: 10, flexShrink: 0, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▶</span>
                  <Dot color={oC.dot} size={6} glow />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: isDetail ? C.t0 : C.t1, letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.codigo}</div>
                    <ProgressBar value={obrapct} color={oC.dot} height={2} />
                  </div>
                  <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{obrapct}%</span>
                </div>
                {expanded && (
                  <div>
                    {obraEtapas.map(etapa => {
                      const etapaT = tareasDeEtapa(etapa.id);
                      const etExp  = expandedEtapas.has(etapa.id);
                      const epct   = pctEtapa(etapa.id);
                      const eD     = detail?.item?.id === etapa.id && detail?.type === "etapa";
                      return (
                        <div key={etapa.id}>
                          <div onClick={() => { toggleEtapa(etapa.id); setDetail({ item: etapa, type: "etapa" }); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px 5px 26px", cursor: "pointer", background: eD ? C.s0 : "transparent", transition: "background .13s" }}>
                            <span style={{ fontSize: 7, color: C.t2, width: 8, flexShrink: 0, display: "inline-block", transform: etExp ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▶</span>
                            <div style={{ width: 3, height: 18, borderRadius: 2, background: etapa.color ?? C.t1, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: eD ? C.t0 : C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa.nombre}{etapa.genera_orden_compra ? " 🛒" : ""}</div>
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
                                  <div key={tarea.id} onClick={() => setDetail({ item: tarea, type: "tarea" })} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 14px 4px 44px", cursor: "pointer", background: tD ? C.s0 : "transparent", transition: "background .12s" }}>
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
              <div onClick={() => { toggleObra(obra.id); setDetail({ item: obra, type: "obra" }); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: C.s0, border: `1px solid ${C.b0}`, cursor: "pointer", transition: "border-color .13s, background .13s", borderLeft: `3px solid ${oC.dot}` }}>
                <span style={{ fontSize: 10, color: C.t2, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>▶</span>
                <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t0, fontWeight: 600, letterSpacing: 1, flex: "0 0 108px" }}>{obra.codigo}</span>
                {obra.linea_nombre && <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flex: "0 0 60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra.linea_nombre}</span>}
                <div style={{ flex: 1 }}><ProgressBar value={obrapct} color={oC.dot} height={4} /></div>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.t1, flex: "0 0 32px", textAlign: "right" }}>{obrapct}%</span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 40px", textAlign: "right" }}>{diasR}d</span>
                {esGestion && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn variant="sm" onClick={e => { e.stopPropagation(); cambiarEstadoObra(obra.id, obra.estado === "activa" ? "pausada" : "activa"); }}>
                      {obra.estado === "activa" ? "Pausar" : "Activar"}
                    </Btn>
                    {obra.estado !== "terminada" && (
                      <Btn variant="sm" sx={{ color: C.etapa.completado.text, borderColor: "rgba(16,185,129,0.3)" }} onClick={e => { e.stopPropagation(); cambiarEstadoObra(obra.id, "terminada"); }}>Terminar</Btn>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(obra, "obra"); }} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>×</button>
                  </div>
                )}
              </div>

              {/* ── ETAPAS EXPANDIDAS ── */}
              {expanded && (
                <div style={{ paddingLeft: 20, paddingTop: 6 }}>
                  {obraEtapas.length > 0 && (
                    <>
                      <div style={{ display: "flex", paddingLeft: 128, marginBottom: 2 }}>
                        {obraEtapas.map(e => (
                          <div key={e.id} style={{ flex: num(e.dias_estimados) / totalDias, fontSize: 7, color: C.t2, letterSpacing: 1, textTransform: "uppercase", overflow: "hidden", textOverflow: "clip", whiteSpace: "nowrap", textAlign: "center", paddingRight: 2 }}>
                            {e.nombre}
                          </div>
                        ))}
                        <div style={{ flex: "0 0 44px" }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4 }}>
                        <div style={{ width: 116, flexShrink: 0, fontSize: 9, color: C.t2 }}>Timeline</div>
                        <div style={{ flex: 1, height: 16, display: "flex", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.b0}`, background: "rgba(0,0,0,0.4)" }}>
                          {obraEtapas.map((e, idx) => {
                            const ec = C.etapa[e.estado] ?? C.etapa.pendiente;
                            return (
                              <div key={e.id} title={`${e.nombre} · ${e.estado}`}
                                onClick={() => !e.isVirtual && setDetail({ item: e, type: "etapa" })}
                                style={{ flex: num(e.dias_estimados) / totalDias, height: "100%", background: e.estado === "completado" ? `linear-gradient(90deg, ${ec.bar}, rgba(16,185,129,0.28))` : e.estado === "en_curso" ? `linear-gradient(90deg, ${ec.bar}, rgba(59,130,246,0.28))` : ec.bar, borderRight: idx < obraEtapas.length - 1 ? "1px solid rgba(0,0,0,0.5)" : "none", cursor: !e.isVirtual ? "pointer" : "default", ...(e.estado === "en_curso" ? { animation: "gPulse 2.5s ease infinite" } : {}) }} />
                            );
                          })}
                        </div>
                        <div style={{ flex: "0 0 36px", textAlign: "right" }}><span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2 }}>{diasR}d</span></div>
                      </div>
                    </>
                  )}

                  {obraEtapas.map(etapa => {
                    const etapaT = tareasDeEtapa(etapa.id);
                    const etExp  = expandedEtapas.has(etapa.id);
                    const ec     = C.etapa[etapa.estado] ?? C.etapa.pendiente;
                    const epct   = pctEtapa(etapa.id);
                    return (
                      <div key={etapa.id} style={{ marginBottom: 3 }}>
                        <div onClick={() => { toggleEtapa(etapa.id); !etapa.isVirtual && setDetail({ item: etapa, type: "etapa" }); }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 7, background: etExp ? C.s0 : "transparent", cursor: "pointer", transition: "background .12s" }}>
                          <span style={{ fontSize: 7, color: C.t2, width: 8, flexShrink: 0, transform: etExp ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
                          <div style={{ width: 3, height: 22, borderRadius: 2, background: etapa.color ?? "#64748b", flexShrink: 0 }} />
                          <div style={{ width: 100, flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {etapa.nombre}{etapa.genera_orden_compra ? " 🛒" : ""}
                            </div>
                            {etapaT.length > 0 && <div style={{ fontSize: 9, color: C.t2 }}>{etapaT.filter(t => t.estado === "finalizada").length}/{etapaT.length}</div>}
                          </div>
                          <div style={{ flex: 1 }}><ProgressBar value={epct} color={ec.dot} height={3} /></div>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: ec.text, flex: "0 0 30px", textAlign: "right" }}>{epct}%</span>
                          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.t2, flex: "0 0 32px", textAlign: "right" }}>{etapa.dias_estimados ?? 0}d</span>
                          {esGestion && !etapa.isVirtual && (
                            <div style={{ display: "flex", gap: 2 }}>
                              {[["pendiente","—"],["en_curso","▶"],["completado","✓"]].map(([est, ico]) => (
                                <button key={est} type="button" onClick={e => { e.stopPropagation(); cambiarEstadoEtapa(etapa.id, est); }}
                                  style={{ width: 18, height: 18, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 9, background: etapa.estado === est ? `${(C.etapa[est] ?? C.etapa.pendiente).dot}28` : "rgba(255,255,255,0.03)", color: etapa.estado === est ? (C.etapa[est] ?? C.etapa.pendiente).dot : C.t2 }}>
                                  {ico}
                                </button>
                              ))}
                              <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(etapa, "etapa"); }} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "1px 4px" }}>×</button>
                            </div>
                          )}
                        </div>

                        {etExp && (
                          <div style={{ paddingLeft: 20 }}>
                            {etapaT.map(tarea => {
                              const tc = C.tarea[tarea.estado] ?? C.tarea.pendiente;
                              return (
                                <div key={tarea.id} onClick={() => setDetail({ item: tarea, type: "tarea" })} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 8px", borderRadius: 5, cursor: "pointer", transition: "background .12s" }}>
                                  <Dot color={tc.text} size={5} glow={tarea.estado === "en_progreso"} />
                                  <span style={{ flex: "0 0 108px", fontSize: 10, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tarea.nombre}</span>
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                                    {tarea.horas_estimadas && <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{tarea.horas_estimadas}h</span>}
                                    {tarea.responsable && <span style={{ fontSize: 9, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{tarea.responsable}</span>}
                                    {(tarea.fecha_inicio || tarea.fecha_fin_estimada) && (
                                      <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono }}>{fmtDate(tarea.fecha_inicio)} → {fmtDate(tarea.fecha_fin_estimada)}</span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 9, color: tc.text }}>{tc.label}</span>
                                  {esGestion && (
                                    <div style={{ display: "flex", gap: 3 }}>
                                      {tarea.estado === "pendiente" && <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px" }} onClick={e => { e.stopPropagation(); cambiarEstadoTarea(tarea.id, "en_progreso"); }}>Iniciar</Btn>}
                                      {tarea.estado === "en_progreso" && <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px", color: C.etapa.completado.text, borderColor: "rgba(16,185,129,0.3)" }} onClick={e => { e.stopPropagation(); cambiarEstadoTarea(tarea.id, "finalizada"); }}>Finalizar</Btn>}
                                      <Btn variant="sm" sx={{ fontSize: 9, padding: "1px 6px" }} onClick={e => { e.stopPropagation(); setTareaModal({ tarea, etapaId: tarea.etapa_id, obraId: tarea.obra_id }); }}>✎</Btn>
                                      <button type="button" onClick={e => { e.stopPropagation(); pedirBorrado(tarea, "tarea"); }} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>×</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {!etapa.isVirtual && esGestion && (
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
            {esGestion && <Btn variant="primary" onClick={() => setShowObraModal(true)}>+ Nueva obra</Btn>}
          </div>

          {/* FILTERBAR */}
          <div style={{ height: 36, background: "rgba(12,12,14,0.85)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, overflowX: "auto" }}>
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Estado</span>
            {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFiltroEstado(v)} style={{ border: filtroEstado === v ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", background: filtroEstado === v ? C.s1 : "transparent", color: filtroEstado === v ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", fontFamily: C.sans }}>
                {l}
              </button>
            ))}
            <div style={{ width: 1, height: 12, background: C.b0, margin: "0 3px", flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Línea</span>
            <button type="button" onClick={() => setFiltroLinea("todas")} style={{ border: filtroLinea === "todas" ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", background: filtroLinea === "todas" ? C.s1 : "transparent", color: filtroLinea === "todas" ? C.t0 : C.t1, padding: "3px 11px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans }}>
              Todas
            </button>
            {lineas.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 1 }}>
                <button type="button" onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)} style={{ border: filtroLinea === l.id ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", borderLeft: filtroLinea === l.id ? `2px solid ${l.color}` : undefined, background: filtroLinea === l.id ? C.s1 : "transparent", color: filtroLinea === l.id ? C.t0 : C.t1, padding: "3px 11px", borderRadius: "5px 0 0 5px", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", fontFamily: C.sans }}>
                  {l.nombre}
                </button>
                {/* ⚙ Botón para editar plantilla de etapas de la línea */}
                {esGestion && (
                  <button type="button" onClick={() => setLineasModal({ linea: l })} title={`Editar etapas plantilla de ${l.nombre}`} style={{ border: filtroLinea === l.id ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)", borderLeft: "none", background: filtroLinea === l.id ? C.s1 : "transparent", color: C.t2, padding: "3px 6px", borderRadius: "0 5px 5px 0", cursor: "pointer", fontSize: 9, fontFamily: C.sans }}>
                    ⚙
                  </button>
                )}
              </div>
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
        <ObraModal lineas={lineas} lProcs={lProcs}
          onSave={nueva => { setShowObraModal(false); cargar(); if (nueva?.id) setExpandedObras(s => new Set(s).add(nueva.id)); }}
          onClose={() => setShowObraModal(false)} />
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
      {lineasModal && (
        <LineasEtapasModal
          linea={lineasModal.linea}
          lProcs={lProcs}
          onClose={() => setLineasModal(null)}
          onSaved={cargar}
        />
      )}
    </div>
  );
}
