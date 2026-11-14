import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus, Trash2, Wand2, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { productionStageOffsetKey } from "@/features/obras/fechasEngine";
import { matrixDetailPatch, num } from "@/features/obras/obrasHelpers";
import { plural, semanaRel } from "./formato";

// Recorrido de una línea: cada etapa es una barra sobre las semanas respecto
// del desmolde (S0). Se arrastra para moverla de a media semana y se estira
// del borde derecho para cambiar los días. Todas las obras de la línea toman
// el cambio. En el celular se edita con los botones del cajón.

const redondearMedia = (v) => Math.round(v * 2) / 2;

async function guardarSemana(procesoId, semanas) {
  if (semanas == null || semanas === "") {
    const { error } = await supabase.from("fechas_offsets").delete().eq("evento_key", productionStageOffsetKey(procesoId)).eq("modelo", "*");
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("fechas_offsets").upsert({
    evento_key: productionStageOffsetKey(procesoId), modelo: "*", semanas: Number(semanas),
    referencia: "desmolde", updated_at: new Date().toISOString(),
  }, { onConflict: "evento_key,modelo" });
  if (error) throw error;
}

async function guardarOrden(lineaId, lista) {
  const { error } = await supabase.rpc("produccion_reordenar_etapas", { p_linea_id: lineaId, p_proceso_ids: lista.map((p) => p.id) });
  if (!error) return;
  const falta = ["PGRST202", "42883"].includes(error.code) || /could not find the function|does not exist/i.test(error.message || "");
  if (!falta) throw error;
  // Sin la función: primero a un rango libre para no chocar con UNIQUE(linea_id, orden).
  const base = Math.max(0, ...lista.map((p) => num(p.orden))) + lista.length + 1000;
  for (const [paso, orden] of [[base, 1], [0, 1]]) {
    const r = await Promise.all(lista.map((p, i) => supabase.from("linea_procesos").update({ orden: paso + i + orden }).eq("id", p.id).eq("linea_id", lineaId)));
    const mal = r.find((x) => x.error);
    if (mal?.error) throw mal.error;
  }
}

// Semana sugerida para una etapa sin ubicar: a continuación de la anterior
// ubicada; si no hay ninguna, terminando en el desmolde.
function semanaSugerida(items, i) {
  const previa = items.slice(0, i).reverse().find((p) => p.semana != null);
  if (previa) return redondearMedia(previa.semana + Math.max(1, num(previa.dias_estimados)) / 7);
  return -redondearMedia(Math.max(1, num(items[i].dias_estimados)) / 7);
}

export default function ConfigRecorrido({ linea, procesos, offsets, esGestion, isMobile, detalleHabilitado, onCambio }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [items, setItems] = useState([]);
  const [cajon, setCajon] = useState(null);
  const [arrastre, setArrastre] = useState(null);
  const [filaArrastrada, setFilaArrastrada] = useState(null);
  const [filaDestino, setFilaDestino] = useState(null);
  const moviendo = useRef(null);

  useEffect(() => {
    if (moviendo.current) return;
    setItems(procesos.map((p) => ({ ...p, semana: offsets.has(p.id) ? offsets.get(p.id) : null })));
  }, [procesos, offsets]);

  const ubicadas = items.filter((p) => p.semana != null);
  const minS = Math.min(-6, ...ubicadas.map((p) => Math.floor(p.semana))) - 2;
  const maxS = Math.max(24, ...ubicadas.map((p) => Math.ceil(p.semana + num(p.dias_estimados) / 7))) + 6;
  const izq = isMobile ? 176 : 340;
  const ppw = isMobile ? 22 : 30;
  const W = (maxS - minS) * ppw;
  const XS = (s) => Math.round((s - minS) * ppw);
  const marcas = [];
  for (let s = Math.ceil(minS / 2) * 2; s <= maxS; s += 2) marcas.push(s);
  const sinUbicar = items.filter((p) => p.semana == null).length;

  async function ubicar(indices) {
    const copia = items.map((p) => ({ ...p }));
    for (const i of indices) copia[i].semana = semanaSugerida(copia, i);
    setItems(copia);
    try {
      await Promise.all(indices.map((i) => guardarSemana(copia[i].id, copia[i].semana)));
      toast.success(`${plural(indices.length, "etapa ubicada", "etapas ubicadas")}: todas las obras de ${linea.nombre} toman el plan`);
      onCambio();
    } catch (e) {
      toast.error(`No se pudo guardar: ${e.message}`);
      onCambio();
    }
  }

  // ── Arrastre de barras (mover o estirar) ──
  function empezar(e, i, estirar) {
    if (!esGestion) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = items[i];
    moviendo.current = { i, estirar, x0: e.clientX, semana0: p.semana, dias0: num(p.dias_estimados) || 1, cambio: false };
    setArrastre(i);
  }
  function mover(e) {
    const m = moviendo.current;
    if (!m) return;
    const dx = e.clientX - m.x0;
    if (Math.abs(dx) > 2) m.cambio = true;
    m.valor = m.estirar ? Math.max(1, Math.round(m.dias0 + (dx / ppw) * 7)) : redondearMedia(m.semana0 + dx / ppw);
    setItems((prev) => prev.map((p, j) => {
      if (j !== m.i) return p;
      return m.estirar ? { ...p, dias_estimados: m.valor } : { ...p, semana: m.valor };
    }));
  }
  async function soltar() {
    const m = moviendo.current;
    moviendo.current = null;
    setArrastre(null);
    if (!m?.cambio || m.valor == null) return;
    const id = items[m.i]?.id;
    try {
      if (m.estirar) {
        const { error } = await supabase.from("linea_procesos").update({ dias_estimados: m.valor }).eq("id", id);
        if (error) throw error;
      } else if (m.valor !== m.semana0) {
        await guardarSemana(id, m.valor);
      }
      onCambio();
    } catch (e) {
      toast.error(`No se pudo guardar: ${e.message}`);
      onCambio();
    }
  }

  async function reordenar(desde, hasta) {
    setFilaArrastrada(null); setFilaDestino(null);
    if (desde == null || hasta == null || desde === hasta) return;
    const lista = items.slice();
    const [p] = lista.splice(desde, 1);
    lista.splice(hasta, 0, p);
    const normal = lista.map((x, i) => ({ ...x, orden: i + 1 }));
    setItems(normal);
    try {
      await guardarOrden(linea.id, normal);
      onCambio();
    } catch (e) {
      toast.error(`No se pudo guardar el orden: ${e.message}`);
      onCambio();
    }
  }

  async function eliminar(p) {
    const ok = await confirmar({
      title: `Eliminar ${p.nombre}`,
      message: "Sale de la plantilla con sus tareas y productos. Las obras que ya tienen sus etapas creadas no cambian.",
      confirmLabel: "Eliminar etapa", tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("linea_procesos").delete().eq("id", p.id);
    if (error) { toast.error(`No se pudo eliminar: ${error.message}`); return; }
    await guardarSemana(p.id, null).catch(() => {});
    setCajon(null);
    toast.success(`${p.nombre} eliminada`);
    onCambio();
  }

  return (
    <div className="prd-conf">
      <div className="prd-conf-barra">
        <span><b>S0 es el desmolde.</b> {isMobile ? "Tocá una etapa para ubicarla y cambiar sus días." : "Arrastrá una barra para moverla de a media semana; tirá del borde derecho para cambiar los días."}</span>
        <span className="prd-sp" />
        {esGestion && sinUbicar > 0 && (
          <button type="button" className="ui-btn ui-btn-suave" onClick={() => ubicar(items.map((p, i) => (p.semana == null ? i : -1)).filter((i) => i >= 0))}>
            <Wand2 size={15} />Ubicar {sinUbicar === 1 ? "la que falta" : `las ${sinUbicar} que faltan`} en cadena
          </button>
        )}
        {esGestion && <button type="button" className="ui-btn" onClick={() => setCajon({ nuevo: true })}><Plus size={15} />Etapa</button>}
      </div>

      <div className="prd-rec" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} data-tour="obras-config-recorrido">
        <div className="prd-rec-in" style={{ width: izq + W }}>
          <div className="prd-rec-cab">
            <div className="prd-rec-izq" style={{ width: izq }}>Etapa · semana · días</div>
            <div className="prd-rec-eje" style={{ width: W }}>
              {marcas.map((s) => <i key={s} className={s === 0 ? "z" : ""} style={{ left: XS(s) }}><span>{s === 0 ? "S0" : semanaRel(s)}</span></i>)}
            </div>
          </div>
          {items.map((p, i) => (
            <div
              key={p.id}
              className={`prd-rec-fila${filaArrastrada === i ? " arrastrando" : ""}${filaDestino === i && filaArrastrada !== i ? " destino" : ""}${cajon?.id === p.id ? " sel" : ""}`}
              style={{ "--i": Math.min(i, 24) }}
              onDragOver={(e) => { if (filaArrastrada != null) { e.preventDefault(); setFilaDestino(i); } }}
              onDrop={(e) => { e.preventDefault(); reordenar(filaArrastrada, i); }}
            >
              <div className="prd-rec-izq" style={{ width: izq }}>
                {esGestion && !isMobile ? (
                  <span
                    className="prd-asa"
                    draggable
                    role="button"
                    tabIndex={-1}
                    title="Arrastrá para cambiar el orden"
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setFilaArrastrada(i); }}
                    onDragEnd={() => { setFilaArrastrada(null); setFilaDestino(null); }}
                  >
                    <GripVertical size={15} />
                  </span>
                ) : <span style={{ width: 4 }} />}
                <span className="prd-rec-num">{i + 1}</span>
                <button type="button" className="prd-rec-nom" onClick={() => setCajon(p)} title={p.nombre}>{p.nombre}</button>
                <span className={`prd-rec-s${p.semana == null ? " no" : ""}`}>{p.semana == null ? "—" : semanaRel(p.semana)}</span>
              </div>
              <div className="prd-rec-pista" style={{ width: W }}>
                {marcas.map((s) => <i key={s} className={s === 0 ? "z" : ""} style={{ left: XS(s) }} />)}
                {p.semana != null ? (
                  <div
                    className={`prd-rec-bar${arrastre === i ? " moviendo" : ""}`}
                    style={{ left: XS(p.semana), width: Math.max(18, (Math.max(1, num(p.dias_estimados)) / 7) * ppw) }}
                    onPointerDown={(e) => empezar(e, i, false)}
                    title={`${p.nombre} · ${semanaRel(p.semana)} · ${num(p.dias_estimados) || "sin"} días`}
                  >
                    {num(p.dias_estimados) ? `${num(p.dias_estimados)} d` : "sin días"}
                    {esGestion && <span className="asa-der" onPointerDown={(e) => empezar(e, i, true)} />}
                  </div>
                ) : (
                  <div className="prd-rec-libre" style={{ left: XS(0) + 10 }}>
                    Sin ubicar
                    {esGestion && <button type="button" className="ui-btn" onClick={() => ubicar([i])}>Ubicar a continuación</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!items.length && <div className="prd-vacio"><strong>Esta línea no tiene etapas</strong><span>Agregá la primera con “Etapa”.</span></div>}
        </div>
      </div>

      {cajon && (
        <CajonEtapa
          key={cajon.id || "nueva"}
          linea={linea}
          proceso={cajon.nuevo ? null : items.find((p) => p.id === cajon.id) || cajon}
          indice={cajon.nuevo ? items.length : items.findIndex((p) => p.id === cajon.id)}
          total={items.length}
          semanaInicial={cajon.nuevo ? (ubicadas.length ? redondearMedia(Math.max(...ubicadas.map((p) => p.semana + num(p.dias_estimados) / 7))) : 0) : undefined}
          ordenMax={Math.max(0, ...items.map((p) => num(p.orden)))}
          esGestion={esGestion}
          detalleHabilitado={detalleHabilitado}
          onMover={(d) => { const i = items.findIndex((p) => p.id === cajon.id); reordenar(i, i + d); }}
          onEliminar={eliminar}
          onCerrar={() => setCajon(null)}
          onGuardado={(creado) => { onCambio(); if (creado) setCajon(creado); else setCajon(null); }}
        />
      )}
    </div>
  );
}

function CajonEtapa({ linea, proceso, indice, total, semanaInicial, ordenMax, esGestion, detalleHabilitado, onMover, onEliminar, onCerrar, onGuardado }) {
  const toast = useToast();
  const nuevo = !proceso;
  const [form, setForm] = useState(() => ({
    nombre: proceso?.nombre || "",
    dias: proceso?.dias_estimados ?? "",
    semana: nuevo ? semanaInicial ?? 0 : proceso.semana,
    descripcion: proceso?.descripcion || "",
    responsable: proceso?.responsable || "",
    personas_necesarias: proceso?.personas_necesarias ?? "",
    involucrados: proceso?.involucrados || "",
    observaciones: proceso?.observaciones || "",
  }));
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const paso = (d) => set("semana", redondearMedia((form.semana ?? 0) + d));

  async function guardar(e) {
    e.preventDefault();
    const dias = Number(form.dias);
    if (!form.nombre.trim()) return;
    if (!Number.isFinite(dias) || dias <= 0) { toast.error("Indicá cuántos días dura la etapa."); return; }
    setGuardando(true);
    try {
      const payload = { nombre: form.nombre.trim(), dias_estimados: dias, ...(detalleHabilitado ? { descripcion: form.descripcion.trim() || null, ...matrixDetailPatch(form) } : {}) };
      let id = proceso?.id;
      if (nuevo) {
        const { data, error } = await supabase.from("linea_procesos").insert({ ...payload, linea_id: linea.id, color: "#64748b", orden: ordenMax + 1, activo: true }).select().single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabase.from("linea_procesos").update(payload).eq("id", id);
        if (error) throw error;
      }
      await guardarSemana(id, form.semana);
      toast.success(nuevo ? `${payload.nombre} agregada a ${linea.nombre}` : "Etapa guardada");
      onGuardado(null);
    } catch (err) {
      toast.error(`No se pudo guardar: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="prd-cajon" onSubmit={guardar} aria-label={nuevo ? "Nueva etapa" : `Etapa ${proceso.nombre}`}>
      <div className="prd-cajon-cab">
        <h3>{nuevo ? `Nueva etapa en ${linea.nombre}` : `Etapa ${indice + 1} de ${total}`}</h3>
        {!nuevo && esGestion && (
          <>
            <button type="button" className="prd-btn-ic" disabled={indice <= 0} onClick={() => onMover(-1)} aria-label="Subir"><ArrowUp size={15} /></button>
            <button type="button" className="prd-btn-ic" disabled={indice >= total - 1} onClick={() => onMover(1)} aria-label="Bajar"><ArrowDown size={15} /></button>
          </>
        )}
        <button type="button" className="prd-btn-ic" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div className="prd-cajon-cuerpo prd-form" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
        <label>Nombre<input className="ui-input" id="etapa-nombre" required autoFocus={nuevo} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} disabled={!esGestion} /></label>
        <label>Duración (días)
          <input className="ui-input mono" id="etapa-dias" type="number" min="0.5" step="0.5" value={form.dias} onChange={(e) => set("dias", e.target.value)} disabled={!esGestion} />
        </label>
        <label>Semana respecto del desmolde
          <div className="prd-paso-num">
            <button type="button" className="prd-btn-ic" onClick={() => paso(-0.5)} disabled={!esGestion || form.semana == null} aria-label="Media semana antes"><Minus size={15} /></button>
            <input className="ui-input" readOnly value={form.semana == null ? "Sin ubicar" : semanaRel(form.semana)} aria-live="polite" />
            <button type="button" className="prd-btn-ic" onClick={() => paso(0.5)} disabled={!esGestion || form.semana == null} aria-label="Media semana después"><Plus size={15} /></button>
            {form.semana == null
              ? esGestion && <button type="button" className="lnk" onClick={() => set("semana", 0)}>Ubicar en S0</button>
              : esGestion && <button type="button" className="lnk" onClick={() => set("semana", null)}>Quitar</button>}
          </div>
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 12, color: "var(--dim)" }}>
            {form.semana == null ? "Sin semana, en cada obra va a continuación de la etapa anterior." : form.semana === 0 ? "Arranca la semana del desmolde." : `Arranca ${Math.abs(form.semana)} semana${Math.abs(form.semana) === 1 ? "" : "s"} ${form.semana < 0 ? "antes" : "después"} del desmolde.`}
          </span>
        </label>
        {detalleHabilitado && (
          <>
            <label>Descripción<textarea className="ui-input" id="etapa-desc" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} disabled={!esGestion} /></label>
            <div className="prd-form-g" style={{ gridTemplateColumns: "minmax(0,1fr) 100px" }}>
              <label>Responsable<input className="ui-input" id="etapa-resp" value={form.responsable} onChange={(e) => set("responsable", e.target.value)} disabled={!esGestion} /></label>
              <label>Personas<input className="ui-input" id="etapa-pers" type="number" min="0" value={form.personas_necesarias} onChange={(e) => set("personas_necesarias", e.target.value)} disabled={!esGestion} /></label>
            </div>
            <label>Involucrados<input className="ui-input" id="etapa-inv" value={form.involucrados} onChange={(e) => set("involucrados", e.target.value)} placeholder="Oficios, equipos o personas" disabled={!esGestion} /></label>
            <label>Observaciones<textarea className="ui-input" id="etapa-obs" value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} disabled={!esGestion} /></label>
          </>
        )}
      </div>
      {esGestion && (
        <div className="prd-cajon-pie">
          <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : nuevo ? "Agregar etapa" : "Guardar"}</button>
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCerrar}>Cancelar</button>
          <span className="prd-sp" />
          {!nuevo && <button type="button" className="ui-btn ui-btn-peligro" onClick={() => onEliminar(proceso)} aria-label="Eliminar etapa"><Trash2 size={15} /></button>}
        </div>
      )}
    </form>
  );
}
