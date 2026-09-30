import { useState } from "react";
import { GripVertical, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import TareaArchivosPanel from "@/features/obras/TareaArchivosPanel";
import { PRIORIDADES, num } from "@/features/obras/obrasHelpers";
import { plural, semanaRel } from "./formato";

// Tareas de la plantilla: se copian a cada obra nueva de la línea (y a las
// que las traen desde su panel). Orden, dependencias y planos base.

const VACIA = { nombre: "", descripcion: "", responsable: "", horas_estimadas: "", dias_estimados: "", personas_necesarias: "", observaciones: "", prioridad: "media", predecesoras: [] };

function payloadDe(f) {
  return {
    nombre: f.nombre.trim(),
    descripcion: f.descripcion?.trim() || null,
    responsable: f.responsable?.trim() || null,
    dias_estimados: f.dias_estimados !== "" && f.dias_estimados != null ? num(f.dias_estimados) : null,
    horas_estimadas: f.horas_estimadas !== "" && f.horas_estimadas != null ? num(f.horas_estimadas) : null,
    personas_necesarias: f.personas_necesarias !== "" && f.personas_necesarias != null ? parseInt(f.personas_necesarias, 10) : null,
    observaciones: f.observaciones?.trim() || null,
    prioridad: f.prioridad || "media",
    predecesoras: Array.isArray(f.predecesoras) ? f.predecesoras : [],
  };
}

export default function ConfigTareas({ linea, procesos, offsets, tareas, setTareas, procesoSel, setProcesoSel, esGestion, onCambio }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [archivos, setArchivos] = useState(null);
  const [arrastrada, setArrastrada] = useState(null);
  const [destino, setDestino] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const proceso = procesos.find((p) => p.id === procesoSel) || procesos[0];
  const deEtapa = (id) => tareas.filter((t) => t.linea_proceso_id === id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const lista = proceso ? deEtapa(proceso.id) : [];
  const nombrePor = new Map(tareas.map((t) => [t.id, t.nombre]));
  const todasLinea = tareas.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const abrir = (t) => { setArchivos(null); setEditando(t ? t.id : "nueva"); setForm(t ? { ...VACIA, ...t, predecesoras: t.predecesoras || [] } : VACIA); };

  async function guardar(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !proceso) return;
    setGuardando(true);
    try {
      const payload = payloadDe(form);
      if (editando === "nueva") {
        const orden = lista.length ? Math.max(...lista.map((t) => t.orden ?? 0)) + 1 : 1;
        const { data, error } = await supabase.from("linea_proceso_tareas").insert({ ...payload, linea_proceso_id: proceso.id, orden }).select().single();
        if (error) throw error;
        setTareas((prev) => [...prev, data]);
        setForm(VACIA);
        toast.success("Tarea agregada a la plantilla");
      } else {
        const { error } = await supabase.from("linea_proceso_tareas").update(payload).eq("id", editando);
        if (error) throw error;
        setTareas((prev) => prev.map((t) => (t.id === editando ? { ...t, ...payload } : t)));
        setEditando(null);
        toast.success("Tarea guardada");
      }
      onCambio?.();
    } catch (err) {
      toast.error(`No se pudo guardar: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(t) {
    const ok = await confirmar({ title: "Quitar de la plantilla", message: `${t.nombre}. Las obras que ya la tienen no cambian.`, confirmLabel: "Quitar", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("linea_proceso_tareas").delete().eq("id", t.id);
    if (error) { toast.error(`No se pudo quitar: ${error.message}`); return; }
    setTareas((prev) => prev.filter((x) => x.id !== t.id));
    onCambio?.();
  }

  async function reordenar(desdeId, hastaId) {
    setArrastrada(null); setDestino(null);
    if (!desdeId || !hastaId || desdeId === hastaId) return;
    const nueva = lista.slice();
    const a = nueva.findIndex((t) => t.id === desdeId);
    const b = nueva.findIndex((t) => t.id === hastaId);
    if (a < 0 || b < 0) return;
    const [m] = nueva.splice(a, 1);
    nueva.splice(b, 0, m);
    const previo = tareas;
    const orden = new Map(nueva.map((t, i) => [t.id, i + 1]));
    setTareas((prev) => prev.map((t) => (orden.has(t.id) ? { ...t, orden: orden.get(t.id) } : t)));
    const r = await Promise.all(nueva.map((t, i) => supabase.from("linea_proceso_tareas").update({ orden: i + 1 }).eq("id", t.id)));
    const mal = r.find((x) => x.error);
    if (mal?.error) { setTareas(previo); toast.error(`No se pudo guardar el orden: ${mal.error.message}`); }
  }

  const formulario = (
    <form className="prd-form" onSubmit={guardar} style={{ marginTop: 10 }}>
      <div className="prd-form-g">
        <label>Nombre<input className="ui-input" id="tpl-tarea-nombre" autoFocus required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej.: Laminado de fondo" /></label>
        <label>Días<input className="ui-input mono" id="tpl-tarea-dias" type="number" min="0" step="0.5" value={form.dias_estimados ?? ""} onChange={(e) => setForm((f) => ({ ...f, dias_estimados: e.target.value }))} /></label>
        <label>Horas<input className="ui-input mono" id="tpl-tarea-horas" type="number" min="0" step="0.5" value={form.horas_estimadas ?? ""} onChange={(e) => setForm((f) => ({ ...f, horas_estimadas: e.target.value }))} /></label>
        <label>Personas<input className="ui-input mono" id="tpl-tarea-pers" type="number" min="1" value={form.personas_necesarias ?? ""} onChange={(e) => setForm((f) => ({ ...f, personas_necesarias: e.target.value }))} /></label>
      </div>
      <label>Detalle<textarea className="ui-input" id="tpl-tarea-desc" value={form.descripcion ?? ""} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Qué hay que hacer, especificaciones" /></label>
      <div className="prd-form-g" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <label>Responsable<input className="ui-input" id="tpl-tarea-resp" value={form.responsable ?? ""} onChange={(e) => setForm((f) => ({ ...f, responsable: e.target.value }))} /></label>
        <label>Prioridad
          <select className="ui-input" id="tpl-tarea-prio" value={form.prioridad || "media"} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}>
            {PRIORIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      {editando !== "nueva" && todasLinea.length > 1 && (
        <label>Depende de
          <div className="prd-deps">
            {todasLinea.filter((t) => t.id !== editando).map((t) => {
              const on = (form.predecesoras || []).includes(t.id);
              return (
                <button key={t.id} type="button" className={on ? "on" : ""} onClick={() => setForm((f) => ({ ...f, predecesoras: on ? f.predecesoras.filter((x) => x !== t.id) : [...(f.predecesoras || []), t.id] }))}>
                  {t.nombre}
                </button>
              );
            })}
          </div>
        </label>
      )}
      <div className="prd-form-acc">
        <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando || !form.nombre.trim()}>{editando === "nueva" ? "Agregar tarea" : "Guardar"}</button>
        <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <div className="prd-conf">
      <div className="prd-dos">
        <aside aria-label="Etapas">
          {procesos.map((p, i) => (
            <button key={p.id} type="button" className={`prd-et-item${proceso?.id === p.id ? " on" : ""}`} onClick={() => { setProcesoSel(p.id); setEditando(null); setArchivos(null); }}>
              <span className="prd-rec-num">{i + 1}</span>
              <span style={{ minWidth: 0 }}>
                <span className="nom" style={{ display: "block" }}>{p.nombre}</span>
                <small>{offsets.has(p.id) ? semanaRel(offsets.get(p.id)) : "sin semana"} · {num(p.dias_estimados) || "?"} d</small>
              </span>
              <span className="cnt">{deEtapa(p.id).length}</span>
            </button>
          ))}
        </aside>
        <section>
          {proceso ? (
            <>
              <div className="prd-sec-cab" style={{ marginBottom: 4 }}>
                <h3 style={{ fontSize: 17 }}>{proceso.nombre}</h3>
                <span>{plural(lista.length, "tarea", "tareas")}</span>
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--dim)" }}>Se copian a cada obra nueva de {linea.nombre}. Las estimaciones ayudan a repartir gente; no alargan la etapa.</p>
              {lista.length > 0 && (
                <div className="prd-lista">
                  {lista.map((t, i) => (
                    <div key={t.id}>
                      <div
                        className={`prd-fila-t${destino === t.id && arrastrada !== t.id ? " destino" : ""}`}
                        style={{ opacity: arrastrada === t.id ? 0.45 : 1 }}
                        onDragOver={(e) => { if (arrastrada) { e.preventDefault(); setDestino(t.id); } }}
                        onDrop={(e) => { e.preventDefault(); reordenar(arrastrada, t.id); }}
                      >
                        {esGestion ? (
                          <span className="prd-asa" draggable role="button" tabIndex={-1} title="Arrastrá para ordenar"
                            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setArrastrada(t.id); }}
                            onDragEnd={() => { setArrastrada(null); setDestino(null); }}>
                            <GripVertical size={15} />
                          </span>
                        ) : <span style={{ width: 6 }} />}
                        <span className="mono" style={{ fontSize: 11, color: "var(--subtle)", minWidth: 20 }}>{i + 1}.</span>
                        <span className="nom">
                          {t.nombre}
                          {(t.horas_estimadas || t.personas_necesarias || t.predecesoras?.length) ? (
                            <small>
                              {t.horas_estimadas ? <span className="mono">{t.horas_estimadas} h</span> : null}
                              {t.personas_necesarias ? <span>{plural(t.personas_necesarias, "persona", "personas")}</span> : null}
                              {(t.predecesoras || []).map((id) => <span key={id} className="prd-dep">después de {nombrePor.get(id) || "otra tarea"}</span>)}
                            </small>
                          ) : null}
                        </span>
                        <button type="button" className={`prd-mas${archivos === t.id ? " on" : ""}`} onClick={() => setArchivos((v) => (v === t.id ? null : t.id))} title="Planos y archivos base" aria-label={`Archivos de ${t.nombre}`}><Paperclip size={15} /></button>
                        {esGestion && <button type="button" className="prd-mas" onClick={() => abrir(t)} aria-label={`Editar ${t.nombre}`}><Pencil size={14} /></button>}
                        {esGestion && <button type="button" className="prd-mas" onClick={() => eliminar(t)} aria-label={`Quitar ${t.nombre}`} style={{ color: "var(--red)" }}><Trash2 size={14} /></button>}
                      </div>
                      {editando === t.id && <div style={{ padding: "0 10px 10px" }}>{formulario}</div>}
                      {archivos === t.id && <div style={{ padding: "0 10px 10px" }}><TareaArchivosPanel tarea={t} onChanged={onCambio} /></div>}
                    </div>
                  ))}
                </div>
              )}
              {!lista.length && editando !== "nueva" && <div className="prd-nota">Esta etapa todavía no tiene tareas en la plantilla.</div>}
              {esGestion && (editando === "nueva" ? formulario : (
                <button type="button" className="ui-btn" style={{ marginTop: 12 }} onClick={() => abrir(null)}><Plus size={15} />Agregar tarea</button>
              ))}
            </>
          ) : (
            <div className="prd-vacio"><strong>Esta línea no tiene etapas</strong><span>Primero armá el recorrido.</span></div>
          )}
        </section>
      </div>
    </div>
  );
}
