import { C } from "@/theme";
/**
 * Ventanas de Obras que se usan desde Planta y Configuración: nueva obra,
 * etapa de obra, tarea (con archivos), vacaciones de la obra y nueva línea.
 * Vienen de la ObrasScreen anterior; la lógica de guardado no cambió.
 */
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { nonWorkingDaysCount, relativeWeekLabel } from "@/features/obras/fechasEngine";
import {
  COLOR_PRESETS, GLASS, INP, PRIORIDADES, STORAGE_BUCKET, fmtDate, fmtDateFull,
  hasMatrixDetailColumns, matrixDetailPatch, num, propagarPredecesorasObra, safeQuery, today,
} from "@/features/obras/obrasHelpers";

// ─── UTILS ────────────────────────────────────────────────────────────────────



function extIcon(nombre) {
  const ext = (nombre ?? "").split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "📄";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼";
  if (["dwg","dxf"].includes(ext)) return "DWG";
  if (["xlsx","xls","csv"].includes(ext)) return "📊";
  if (["docx","doc","txt"].includes(ext)) return "📝";
  if (["zip","rar","7z"].includes(ext)) return "ZIP";
  return "FILE";
}

function fmtBytes(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}



function Btn({ onClick, type = "button", children, variant = "ghost", disabled = false, sx = {}, style = {}, ...rest }) {
  const V = {
    ghost:   { border: "1px solid transparent", background: "transparent", color: C.t1, padding: "4px 10px", borderRadius: 6, fontSize: 12 },
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 13 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600 },
    danger:  { border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", padding: "6px 14px", borderRadius: 8, fontSize: 13 },
    sm:      { border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, fontSize: 11 },
    confirm: { border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600 },
    green:   { border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.12)", color: "#34d399", padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600 },
    cian:    { border: "1px solid var(--cyan-border)", background: "var(--cyan-soft)", color: "var(--cyan)", padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600 },
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
      {label && <label style={{ fontSize: 10, letterSpacing: 1.3, color: C.t1, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>{label}</label>}
      {children}
    </div>
  );
}


function PrioridadPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {PRIORIDADES.map(([v, lbl]) => {
        const on = (value || "media") === v;
        return <button type="button" key={v} onClick={() => onChange(v)} style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, padding: "4px 11px", border: `1px solid ${on ? C.blue : C.b0}`, background: on ? "rgba(59,130,246,0.12)" : "transparent", color: on ? C.blue : C.t2 }}>{lbl}</button>;
      })}
    </div>
  );
}


// En la computadora es una tarjeta centrada; en el celular (≤ 640 px) sube como
// hoja desde abajo y ocupa el ancho, con el contenido al alcance del pulgar.
function Overlay({ onClose, children, maxWidth = 540, fullHeight = false }) {
  return (
    <div className={`om-fondo${fullHeight ? " om-completa" : ""}`} onClick={e => e.target === e.currentTarget && onClose?.()} style={{ ...GLASS }}>
      <style href="klasea-obras-modales" precedence="default">{OVERLAY_CSS}</style>
      <div className="om-hoja" role="dialog" aria-modal="true" style={{ maxWidth: fullHeight ? "100%" : maxWidth }}>
        {children}
      </div>
    </div>
  );
}

const OVERLAY_CSS = `
  .om-fondo {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9000;
    display: flex; justify-content: center; align-items: flex-start;
    padding: 48px 16px; overflow-y: auto;
    background: var(--overlay-strong);
    animation: om-fondo .2s ease both;
  }
  .om-hoja {
    width: 100%; display: flex; flex-direction: column; max-height: calc(100dvh - 96px); overflow: hidden;
    background: var(--panel-solid); border: 1px solid var(--border-2); border-radius: 18px;
    box-shadow: var(--elev-2); font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
    animation: om-sube .38s cubic-bezier(.22,1,.36,1) both;
  }
  .om-completa { padding: 0; align-items: stretch; overflow: hidden; }
  .om-completa .om-hoja { max-height: none; height: 100%; border-radius: 0; }
  @keyframes om-fondo { from { opacity: 0; } }
  @keyframes om-sube { from { opacity: 0; transform: translateY(16px) scale(.985); } }
  @keyframes om-sube-celu { from { opacity: 0; transform: translateY(40px); } }
  @media (max-width: 640px) {
    .om-fondo { padding: 0; align-items: flex-end; }
    .om-hoja {
      max-height: calc(100dvh - 24px); border-radius: 20px 20px 0 0; border-bottom: 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      animation-name: om-sube-celu;
    }
  }
`;

function VacacionesObraModal({ obra, periods = [], onClose, onSaved }) {
  const [form, setForm] = useState({ tipo: "vacaciones", fecha_desde: "", fecha_hasta: "", descripcion: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const totalDays = nonWorkingDaysCount(periods);
  const daysInPeriod = (period) => {
    const start = new Date(`${period.fecha_desde}T00:00:00`);
    const end = new Date(`${period.fecha_hasta}T00:00:00`);
    return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  };

  async function agregar(e) {
    e.preventDefault();
    if (!form.fecha_desde || !form.fecha_hasta) return;
    if (form.fecha_hasta < form.fecha_desde) {
      setErr("La fecha hasta no puede ser anterior a la fecha desde.");
      return;
    }
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("produccion_obra_periodos_no_laborables").insert({
      obra_id: obra.id,
      tipo: form.tipo,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta,
      descripcion: form.descripcion.trim() || null,
    });
    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }
    setForm({ tipo: "vacaciones", fecha_desde: "", fecha_hasta: "", descripcion: "" });
    setSaving(false);
    await onSaved();
  }

  async function eliminar(period) {
    if (!window.confirm(`¿Quitar el período ${fmtDateFull(period.fecha_desde)} → ${fmtDateFull(period.fecha_hasta)}?`)) return;
    const { error } = await supabase.from("produccion_obra_periodos_no_laborables").delete().eq("id", period.id);
    if (error) {
      setErr(error.message);
      return;
    }
    await onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={620}>
      <div style={{ padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.t2, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 650 }}>Calendario de la obra</div>
            <div style={{ fontSize: 17, color: C.t0, fontWeight: 700, marginTop: 3 }}>{obra.codigo} · vacaciones y pausas</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.45, marginTop: 4 }}>
              Estos días se excluyen del cronograma productivo. El desmolde no cambia; se desplazan los inicios y finales afectados.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 18, padding: "11px 0", borderBottom: `1px solid ${C.b0}` }}>
          <div><b style={{ color: C.t0, fontFamily: C.mono, fontSize: 15 }}>{periods.length}</b><span style={{ display: "block", color: C.t2, fontSize: 9.5, marginTop: 2 }}>PERÍODOS</span></div>
          <div><b style={{ color: C.t0, fontFamily: C.mono, fontSize: 15 }}>{totalDays}d</b><span style={{ display: "block", color: C.t2, fontSize: 9.5, marginTop: 2 }}>DÍAS EXCLUIDOS</span></div>
        </div>

        <div style={{ marginTop: 12 }}>
          {periods.map((period) => (
            <div key={period.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.b0}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.t0, fontSize: 12.5, fontWeight: 650, textTransform: "capitalize" }}>{period.tipo}</span>
                  <span style={{ color: C.t2, fontFamily: C.mono, fontSize: 11 }}>{fmtDateFull(period.fecha_desde)} → {fmtDateFull(period.fecha_hasta)}</span>
                  <span style={{ color: C.t1, fontFamily: C.mono, fontSize: 10.5 }}>{daysInPeriod(period)}d</span>
                </div>
                {period.descripcion && <div style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>{period.descripcion}</div>}
              </div>
              <button type="button" onClick={() => eliminar(period)} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 10.5, fontFamily: C.sans }}>Quitar</button>
            </div>
          ))}
          {!periods.length && <div style={{ padding: "18px 0", color: C.t2, fontSize: 11.5 }}>No hay vacaciones ni pausas cargadas para esta obra.</div>}
        </div>

        <form onSubmit={agregar} style={{ marginTop: 14, padding: 13, borderRadius: 10, border: `1px solid ${C.b1}`, background: C.s0 }}>
          <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 650, marginBottom: 10 }}>Agregar período no laborable</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 9 }}>
            <InputSt label="Tipo">
              <select style={INP} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="vacaciones">Vacaciones</option>
                <option value="pausa">Pausa</option>
                <option value="feriado">Feriado</option>
              </select>
            </InputSt>
            <InputSt label="Desde *"><input required type="date" style={INP} value={form.fecha_desde} onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} /></InputSt>
            <InputSt label="Hasta *"><input required type="date" min={form.fecha_desde || undefined} style={INP} value={form.fecha_hasta} onChange={e => setForm(f => ({ ...f, fecha_hasta: e.target.value }))} /></InputSt>
          </div>
          <InputSt label="Motivo o nota"><input style={INP} placeholder="Ej.: vacaciones de verano del astillero" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></InputSt>
          {err && <div style={{ color: C.red, fontSize: 11, marginBottom: 9 }}>{err}</div>}
          <div style={{ display: "flex", gap: 7 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Agregar período"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ─── MODAL OBRA ───────────────────────────────────────────────────────────────
function ObraModal({ lineas, lProcs, stageOffsets = new Map(), onSave, onClose }) {
  const [form, setForm] = useState({
    codigo: "",
    descripcion: "",
    linea_id: "",
    fecha_inicio: today(),
    desmolde_estimado: "",
    fecha_fin_estimada: "",
    notas: "",
  });
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
        desmolde_estimado: form.desmolde_estimado || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null, notas: form.notas.trim() || null,
        puesto_mapa: null, bahia_pampa: null, // siempre sin asignar al crear
      }).select().single();
      if (errObra) { setErr(errObra.message); setSaving(false); return; }
      await supabase.from("laminacion_obras").upsert({ nombre: form.codigo.trim().toUpperCase(), estado: "activa", fecha_inicio: form.fecha_inicio || null }, { onConflict: "nombre", ignoreDuplicates: true }).then(() => {});
      if (form.linea_id && procsLinea.length && nueva?.id) {
        try {
          await supabase.from("obra_etapas").insert(procsLinea.map((p, i) => ({
            obra_id: nueva.id, linea_proceso_id: p.id, nombre: p.nombre, orden: p.orden ?? i + 1,
            color: p.color ?? "#64748b", dias_estimados: p.dias_estimados, estado: "pendiente",
            ...(hasMatrixDetailColumns(p) ? { descripcion: p.descripcion ?? null, ...matrixDetailPatch(p) } : {}),
          })));
          await supabase.from("obra_timeline").insert(procsLinea.map(p => ({ obra_id: nueva.id, linea_proceso_id: p.id, estado: "pendiente" })));
          // Copiar tareas desde linea_proceso_tareas — igual que K43
          const etapasIns = await supabase.from("obra_etapas").select("id, linea_proceso_id").eq("obra_id", nueva.id);
          if (!etapasIns.error && etapasIns.data?.length) {
            const procIds = etapasIns.data.map(e => e.linea_proceso_id).filter(Boolean);
            if (procIds.length) {
              const { data: tPlantilla } = await supabase
                .from("linea_proceso_tareas").select("*").in("linea_proceso_id", procIds).order("orden");
              if (tPlantilla?.length) {
                const tareasAInsertar = [];
                for (const etapa of etapasIns.data) {
                  for (const tp of tPlantilla.filter(t => t.linea_proceso_id === etapa.linea_proceso_id)) {
                    tareasAInsertar.push({ obra_id: nueva.id, etapa_id: etapa.id, linea_proceso_tarea_id: tp.id, nombre: tp.nombre, orden: tp.orden ?? 999, estado: "pendiente", prioridad: tp.prioridad ?? "media", descripcion: tp.descripcion ?? null, responsable: tp.responsable ?? null, dias_estimados: tp.dias_estimados ?? null, horas_estimadas: tp.horas_estimadas ?? null, personas_necesarias: tp.personas_necesarias ?? null, observaciones: tp.observaciones ?? null });
                  }
                }
                if (tareasAInsertar.length) {
                  const { error: errTareas } = await supabase.from("obra_tareas").insert(tareasAInsertar);
                  if (errTareas) throw new Error("Error al insertar tareas: " + errTareas.message);
                  await propagarPredecesorasObra(nueva.id, tPlantilla);
                }
              } else {
                console.warn("La plantilla de línea no tiene tareas en linea_proceso_tareas. Usá ⚙ > Importar para cargarlas.");
              }
            }
          }
        } catch (exEtapas) {
          console.error("Error importando etapas/tareas:", exEtapas);
          setErr("La obra se creó, pero hubo un error al importar las etapas/tareas: " + (exEtapas?.message ?? String(exEtapas)));
          setSaving(false);
          onSave(nueva); // igual guardamos la obra
          return;
        }
      }
      onSave(nueva);
    } catch (ex) { setErr(ex?.message ?? "Error inesperado."); setSaving(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <div style={{ padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Nueva obra</div>
            <div style={{ fontSize: 12, color: C.t1, marginTop: 3 }}>El desmolde será la semana cero del plan de producción.</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 13, color: "#fca5a5" }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Código *"><input style={{ ...INP, fontFamily: C.mono }} required placeholder="37-105" autoFocus value={form.codigo} onChange={e => set("codigo", e.target.value)} /></InputSt>
            <InputSt label="Línea de producción"><select style={INP} value={form.linea_id} onChange={e => set("linea_id", e.target.value)}><option value="">Sin asignar</option>{lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></InputSt>
          </div>
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Inicio de obra"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Desmolde estimado (S0) *">
              <input type="date" style={INP} required value={form.desmolde_estimado} onChange={e => set("desmolde_estimado", e.target.value)} />
            </InputSt>
          </div>
          <InputSt label="Fin global manual (opcional)"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          <InputSt label="Notas"><input style={INP} value={form.notas} onChange={e => set("notas", e.target.value)} /></InputSt>
          {procsLinea.length > 0 && (
            <div style={{ marginBottom: 16, padding: "11px 14px", background: C.s0, borderRadius: 8, border: `1px solid ${C.b0}` }}>
              <div style={{ fontSize: 12, color: C.t1, marginBottom: 3, fontWeight: 650 }}>Se crean {procsLinea.length} etapas desde {lineaSel?.nombre}</div>
              <div style={{ fontSize: 10.5, color: C.t2, marginBottom: 8 }}>
                {lineaSel?.semanas_produccion_estimadas
                  ? `Plazo general de la línea: ${lineaSel.semanas_produccion_estimadas} semanas.`
                  : "La línea todavía no tiene un plazo general configurado."}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {procsLinea.map(p => {
                  const offset = stageOffsets.get(p.id);
                  const configured = Number.isFinite(Number(offset));
                  return (
                    <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, padding: "3px 7px", borderRadius: 5, background: "var(--panel)", color: C.t1, border: `1px solid ${configured ? C.b1 : C.b0}` }}>
                      {p.nombre}
                      <b style={{ color: configured ? C.t1 : C.cyan, fontFamily: C.mono }}>{configured ? relativeWeekLabel(offset) : "sin ubicar"}</b>
                    </span>
                  );
                })}
              </div>
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
function EtapaModal({ etapa, obraId, detailEnabled = false, onSave, onClose }) {
  const isEdit = !!etapa?.id;
  const canEditMatrixDetails = detailEnabled || hasMatrixDetailColumns(etapa);
  const [form, setForm] = useState({
    nombre: etapa?.nombre ?? "", descripcion: etapa?.descripcion ?? "", color: etapa?.color ?? "#64748b",
    dias_estimados: etapa?.dias_estimados ?? "", fecha_inicio: etapa?.fecha_inicio ?? "",
    fecha_fin_estimada: etapa?.fecha_fin_estimada ?? "",
    responsable: etapa?.responsable ?? "", personas_necesarias: etapa?.personas_necesarias ?? "",
    involucrados: etapa?.involucrados ?? "", observaciones: etapa?.observaciones ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    const durationDays = Number(form.dias_estimados);
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      setErr("Indicá la duración total prevista para esta etapa.");
      return;
    }
    setSaving(true); setErr("");
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, color: form.color,
      dias_estimados: durationDays,
      fecha_inicio: form.fecha_inicio || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
    };
    if (canEditMatrixDetails) Object.assign(payload, matrixDetailPatch(form));
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
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 13, color: "#fca5a5" }}>{err}</div>}
        {isEdit && (
          <div style={{
            padding: "10px 12px", marginBottom: 14, borderRadius: 8,
            background: etapa.cronograma?.configured ? C.s0 : C.cyanL,
            border: `1px solid ${etapa.cronograma?.configured ? C.b1 : C.cyanB}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: etapa.cronograma?.configured ? C.t0 : C.cyan, fontFamily: C.mono, fontSize: 12, fontWeight: 700 }}>
                {etapa.cronograma?.relativeLabel || "Sin semana relativa"}
              </span>
              {etapa.cronograma?.plannedStartISO && (
                <span style={{ color: etapa.cronograma.overdue ? C.red : C.t1, fontFamily: C.mono, fontSize: 11 }}>
                  {fmtDateFull(etapa.cronograma.plannedStartISO)}
                  {etapa.cronograma.plannedEndISO && etapa.cronograma.plannedEndISO !== etapa.cronograma.plannedStartISO
                    ? ` → ${fmtDateFull(etapa.cronograma.plannedEndISO)}`
                    : ""}
                </span>
              )}
            </div>
            <div style={{ color: C.t2, fontSize: 10.5, marginTop: 5, lineHeight: 1.4 }}>
              La regla se configura en la plantilla de la línea. Las fechas manuales de abajo funcionan sólo como excepción para esta obra.
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <InputSt label="Nombre *"><input style={INP} required autoFocus value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>
          {canEditMatrixDetails && (
            <div style={{ padding: "12px 14px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, marginBottom: 10, textTransform: "uppercase", fontWeight: 600 }}>Equipo / involucrados</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 10, marginBottom: 10 }}>
                <InputSt label="Responsable"><input style={INP} value={form.responsable} onChange={e => set("responsable", e.target.value)} placeholder="Ej: Maxi / Dionisio" /></InputSt>
                <InputSt label="Personas"><input type="number" min="0" step="1" style={INP} value={form.personas_necesarias} onChange={e => set("personas_necesarias", e.target.value)} placeholder="2" /></InputSt>
              </div>
              <InputSt label="Involucrados"><input style={INP} value={form.involucrados} onChange={e => set("involucrados", e.target.value)} placeholder="Carpintero, pintor, electricista..." /></InputSt>
              <InputSt label="Observaciones de matriz"><textarea style={{ ...INP, resize: "vertical", minHeight: 54 }} value={form.observaciones} onChange={e => set("observaciones", e.target.value)} placeholder="Notas generales de esta etapa/tarea base..." /></InputSt>
            </div>
          )}
          <InputSt label="Descripción"><input style={INP} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <InputSt label="Duración total de etapa (días) *"><input required type="number" min="0.5" step="0.5" style={INP} value={form.dias_estimados} onChange={e => set("dias_estimados", e.target.value)} /></InputSt>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={form.color} onChange={e => set("color", e.target.value)} style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{COLOR_PRESETS.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 15, height: 15, borderRadius: 3, background: c, cursor: "pointer", border: form.color === c ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent" }} />)}</div>
              </div>
            </InputSt>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <InputSt label="Inicio manual (excepción)"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
            <InputSt label="Fin manual (excepción)"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
          </div>
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
  const [archivosPlantilla, setArchivosPlantilla] = useState([]);
  const [loadingArch, setLoadingArch] = useState(isEdit);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const tareaId = tarea?.id;

  async function cargarArchivos() {
    if (!tareaId) return;
    setLoadingArch(true);
    const [data, inherited] = await Promise.all([
      safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tareaId).order("created_at")),
      tarea?.linea_proceso_tarea_id
        ? safeQuery(supabase.from("linea_proceso_tarea_archivos").select("*").eq("linea_proceso_tarea_id", tarea.linea_proceso_tarea_id).order("created_at"))
        : Promise.resolve([]),
    ]);
    setArchivos(data);
    setArchivosPlantilla(inherited);
    setLoadingArch(false);
  }

  // Cargar archivos si estamos editando
  useEffect(() => {
    if (!isEdit || !tareaId) return undefined;
    let active = true;
    Promise.all([
      safeQuery(supabase.from("obra_tarea_archivos").select("*").eq("tarea_id", tareaId).order("created_at")),
      tarea?.linea_proceso_tarea_id
        ? safeQuery(supabase.from("linea_proceso_tarea_archivos").select("*").eq("linea_proceso_tarea_id", tarea.linea_proceso_tarea_id).order("created_at"))
        : Promise.resolve([]),
    ])
      .then(([data, inherited]) => {
        if (!active) return;
        setArchivos(data);
        setArchivosPlantilla(inherited);
        setLoadingArch(false);
      });
    return () => { active = false; };
  }, [isEdit, tareaId, tarea?.linea_proceso_tarea_id]);

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
  const totalArchivos = archivos.length + archivosPlantilla.length;

  return (
    <Overlay onClose={onClose} maxWidth={600}>
      {/* Header fijo */}
      <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>{isEdit ? "Editar tarea" : "Nueva tarea"}</div>
            <div style={{ fontSize: 12, color: C.t1, marginTop: 2 }}>Solo el nombre es obligatorio</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
          {[["general","General"],["archivos",`Archivos${totalArchivos ? ` (${totalArchivos})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: "7px 18px", border: "none", borderBottom: tab === k ? `2px solid ${C.primary}` : "2px solid transparent", background: "transparent", color: tab === k ? C.t0 : C.t1, fontSize: 13, cursor: "pointer", fontFamily: C.sans, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Body scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 13, color: "#fca5a5", marginTop: 0 }}>{err}</div>}

        {tab === "general" && (
          <form id="tarea-form" onSubmit={handleSubmit}>
            <InputSt label="Nombre *"><input style={INP} required autoFocus placeholder="Ej: Laminado de fondo" value={form.nombre} onChange={e => set("nombre", e.target.value)} /></InputSt>

            {/* Estado + Prioridad */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 1.3, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {Object.entries(C.tarea).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("estado", k)} style={{ padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 10, border: form.estado === k ? `1px solid ${v.text}55` : `1px solid ${C.b0}`, background: form.estado === k ? `${v.text}14` : C.s0, color: form.estado === k ? v.text : C.t1, fontFamily: C.sans }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 1.3, color: C.t1, display: "block", marginBottom: 7, textTransform: "uppercase", fontWeight: 600 }}>Prioridad</label>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {Object.entries(C.prioridad).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set("prioridad", k)} style={{ padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 10, border: form.prioridad === k ? `1px solid ${v.color}55` : `1px solid ${C.b0}`, background: form.prioridad === k ? `${v.color}18` : C.s0, color: form.prioridad === k ? v.color : C.t1, fontFamily: C.sans }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <InputSt label="Descripción / Detalle de la tarea">
              <textarea style={{ ...INP, resize: "vertical", minHeight: 68 }} placeholder="Describí qué hay que hacer, materiales necesarios, especificaciones técnicas…" value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
            </InputSt>

            {/* RESPONSABLE + PERSONAS */}
            <div style={secBorder}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Equipo</div>
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
              <div style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, marginBottom: 10, textTransform: "uppercase" }}>Fechas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Inicio"><input type="date" style={INP} value={form.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></InputSt>
                <InputSt label="Fin estimado"><input type="date" style={INP} value={form.fecha_fin_estimada} onChange={e => set("fecha_fin_estimada", e.target.value)} /></InputSt>
                <InputSt label="Fin real"><input type="date" style={INP} value={form.fecha_fin_real} onChange={e => set("fecha_fin_real", e.target.value)} /></InputSt>
              </div>
            </div>

            {/* TIEMPO */}
            <div style={secBorder}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, marginBottom: 4, textTransform: "uppercase" }}>Estimación propia de la tarea</div>
              <div style={{ fontSize: 10, color: C.t2, marginBottom: 10 }}>Sirve para organizar recursos. No extiende automáticamente la duración de la etapa.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <InputSt label="Días de tarea">
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
              <div style={{ padding: "16px", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8, marginBottom: 16, fontSize: 12, color: C.cyan }}>
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
                <div style={{ fontSize: 28, marginBottom: 8 }}>"↑"</div>
                <div style={{ fontSize: 13, color: C.t0, fontWeight: 500, marginBottom: 4 }}>{uploading ? "Subiendo…" : "Arrastrá archivos aquí o hacé click"}</div>
                <div style={{ fontSize: 11, color: C.t2 }}>Planos (DWG, DXF), PDFs, imágenes, documentos</div>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { [...(e.target.files ?? [])].forEach(f => subirArchivo(f)); e.target.value = ""; }} />
              </div>
            )}
            {uploadErr && <div style={{ padding: "7px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#fca5a5" }}>{uploadErr}</div>}

            {/* Lista de archivos */}
            {loadingArch && <div style={{ textAlign: "center", padding: "24px 0", color: C.t2, fontSize: 12 }}>Cargando archivos…</div>}
            {!loadingArch && totalArchivos === 0 && isEdit && (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.t2, fontSize: 12 }}>Sin archivos adjuntos todavía</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {archivosPlantilla.length > 0 && (
                <div style={{ padding: "8px 10px", borderRadius: 8, background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, fontSize: 10.5, fontWeight: 650 }}>
                  Planos base heredados de la línea de producción
                </div>
              )}
              {archivosPlantilla.map(arch => (
                <div key={`plantilla-${arch.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.s0, border: `1px solid ${C.blueB}` }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{fmtBytes(arch.tamano_bytes)} · archivo base de la tarea</div>
                  </div>
                  <a href={arch.url_publica} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, textDecoration: "none", cursor: "pointer", fontFamily: C.sans }}>Ver</a>
                </div>
              ))}
              {archivos.map(arch => (
                <div key={arch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.s0, border: `1px solid ${C.b0}` }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{extIcon(arch.nombre_archivo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arch.nombre_archivo}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{fmtBytes(arch.tamano_bytes)} · {fmtDate(arch.created_at?.slice(0, 10))}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a href={arch.url_publica} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, textDecoration: "none", cursor: "pointer", fontFamily: C.sans }}>Ver</a>
                    <a href={arch.url_publica} download={arch.nombre_archivo} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: `1px solid rgba(59,130,246,0.3)`, background: "rgba(59,130,246,0.08)", color: "#60a5fa", textDecoration: "none", cursor: "pointer", fontFamily: C.sans }}>⬇</a>
                    <button type="button" onClick={() => eliminarArchivo(arch)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", color: C.t2, cursor: "pointer" }}>×</button>
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
        {isEdit && tab === "general" && <Btn variant="outline" sx={{ marginLeft: "auto" }} onClick={() => setTab("archivos")}>Archivos ({totalArchivos})</Btn>}
      </div>
    </Overlay>
  );
}

function NuevaLineaModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: "", color: "#3b82f6", orden: "", semanas_produccion_estimadas: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true); setErr("");
    // Calcular el máximo orden existente
    const { data: existing } = await supabase.from("lineas_produccion").select("orden").order("orden", { ascending: false }).limit(1);
    const maxOrden = existing?.[0]?.orden ?? 0;
    const { error } = await supabase.from("lineas_produccion").insert({
      nombre: form.nombre.trim(),
      color: form.color,
      orden: form.orden !== "" ? Number(form.orden) : maxOrden + 1,
      semanas_produccion_estimadas: form.semanas_produccion_estimadas !== "" ? Number(form.semanas_produccion_estimadas) : null,
      activa: true,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <div style={{ padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, color: C.t0, fontWeight: 600 }}>Nueva línea de producción</div>
            <div style={{ fontSize: 12, color: C.t1, marginTop: 3 }}>Luego podés configurar sus etapas con ⚙</div>
          </div>
          <Btn variant="ghost" onClick={onClose} sx={{ fontSize: 18 }}>×</Btn>
        </div>
        {err && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 13, color: "#fca5a5" }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <InputSt label="Nombre *">
            <input style={INP} required autoFocus placeholder="Ej: Línea Barcos FRP" value={form.nombre} onChange={e => set("nombre", e.target.value)} />
          </InputSt>
          <InputSt label="Semanas estimadas de producción">
            <input type="number" min="0.5" step="0.5" style={INP} placeholder="Ej.: 24" value={form.semanas_produccion_estimadas} onChange={e => set("semanas_produccion_estimadas", e.target.value)} />
            <div style={{ color: C.t2, fontSize: 10, marginTop: 5 }}>Plazo general de referencia para una obra de esta línea.</div>
          </InputSt>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 12 }}>
            <InputSt label="Color">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={form.color} onChange={e => set("color", e.target.value)} style={{ width: 32, height: 30, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {COLOR_PRESETS.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 15, height: 15, borderRadius: 3, background: c, cursor: "pointer", border: form.color === c ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent" }} />)}
                </div>
              </div>
            </InputSt>
            <InputSt label="Orden">
              <input type="number" min="1" style={INP} placeholder="Auto" value={form.orden} onChange={e => set("orden", e.target.value)} />
            </InputSt>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Creando…" : "Crear línea"}</Btn>
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

export { Btn, EtapaModal, InputSt, NuevaLineaModal, ObraModal, Overlay, PrioridadPicker, TareaModal, VacacionesObraModal };
