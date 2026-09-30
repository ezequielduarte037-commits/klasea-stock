import { useEffect, useState } from "react";
import { MoreHorizontal, Package, Paperclip, Pencil, Plus } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { hasMatrixDetailContent } from "@/features/obras/obrasHelpers";
import { Check } from "./ui";
import { fMedia, iniciales, plural } from "./formato";

// Detalle de una etapa dentro del panel de la obra: su estado con un toque,
// la lista de tareas para tildar y los productos que la plantilla le asigna.

const ESTADOS = [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["completado", "Terminada"]];
const VISIBLES = 8;

export default function EtapaDetalle({
  obra, item, tareas, archCounts, esGestion, acciones, onEditarTarea, onEditarEtapa, onConfigurar,
}) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [todas, setTodas] = useState(false);
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const etapa = item.etapa;
  const lista = tareas.filter((t) => t.estado !== "cancelada");
  const visibles = todas ? lista : lista.slice(0, VISIBLES);
  const pct = item.total ? Math.round((item.hechas / item.total) * 100) : 0;
  const porId = new Map(tareas.map((t) => [t.id, t]));

  async function cambiarEstado(estado) {
    if (estado === item.estado) return;
    try {
      await acciones.cambiarEstadoEtapa(obra, etapa, estado);
      toast.success(estado === "completado" ? `${item.nombre}: terminada` : estado === "en_curso" ? `${item.nombre}: en curso` : `${item.nombre}: pendiente`);
    } catch (e) {
      toast.error(`No se pudo guardar el estado: ${e.message}`);
    }
  }

  async function tildar(tarea) {
    const hecha = tarea.estado === "finalizada";
    if (!hecha) {
      const faltan = (Array.isArray(tarea.predecesoras) ? tarea.predecesoras : [])
        .map((id) => porId.get(id)).filter((t) => t && !["finalizada", "cancelada"].includes(t.estado));
      if (faltan.length) {
        const ok = await confirmar({
          title: "Tiene tareas previas sin terminar",
          message: `${tarea.nombre} depende de: ${faltan.map((t) => t.nombre).join(", ")}. ¿La marcás terminada igual?`,
          confirmLabel: "Marcar terminada",
        });
        if (!ok) return;
      }
    }
    try {
      const r = await acciones.cambiarEstadoTarea(tarea, hecha ? "pendiente" : "finalizada");
      if (r?.etapaEnCurso) toast.info(`${item.nombre} pasó a En curso`);
    } catch (e) {
      toast.error(`No se pudo guardar la tarea: ${e.message}`);
    }
  }

  async function agregar(e) {
    e.preventDefault();
    if (!nueva.trim() || guardando) return;
    setGuardando(true);
    try {
      await acciones.crearTarea(obra, etapa, nueva);
      setNueva("");
      setTodas(true);
    } catch (err) {
      toast.error(`No se pudo agregar la tarea: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="prd-etapa">
      <div className="prd-est3" data-tour="obras-etapa-estado" role="group" aria-label={`Estado de ${item.nombre}`}>
        {ESTADOS.map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            className={`${clave}${item.estado === clave ? " on" : ""}`}
            aria-pressed={item.estado === clave}
            disabled={!esGestion}
            onClick={() => cambiarEstado(clave)}
          >
            {texto}
          </button>
        ))}
      </div>

      {item.vencida && (
        <div className="prd-nota">
          Según el plan tendría que haber terminado el <b>{fMedia(item.fin)}</b>. Si ya está, marcala <b>Terminada</b>; si todavía se trabaja, pasala a <b>En curso</b>.
        </div>
      )}
      {item.total > 0 && item.hechas === item.total && item.estado !== "completado" && esGestion && (
        <div className="prd-nota ok">
          <span>Todas las tareas están listas.</span>
          <button type="button" className="ui-btn ui-btn-suave" style={{ minHeight: 32 }} onClick={() => cambiarEstado("completado")}>Terminar etapa</button>
        </div>
      )}

      {hasMatrixDetailContent(etapa) && (
        <div className="prd-detalle-op">
          {(etapa.responsable || etapa.personas_necesarias || etapa.involucrados) && (
            <div>
              {etapa.responsable && <><b>Responsable:</b> {etapa.responsable}</>}
              {etapa.personas_necesarias ? <> · {plural(Number(etapa.personas_necesarias), "persona", "personas")}</> : null}
              {etapa.involucrados && <> · {etapa.involucrados}</>}
            </div>
          )}
          {etapa.descripcion && <div style={{ whiteSpace: "pre-wrap" }}>{etapa.descripcion}</div>}
          {etapa.observaciones && <div style={{ whiteSpace: "pre-wrap" }}>{etapa.observaciones}</div>}
        </div>
      )}

      <div>
        <div className="prd-sub-cab" style={{ marginBottom: 6 }}>
          <b>Tareas</b>
          <span className="mono">{item.hechas}/{item.total}</span>
          <span className={`prd-mini${pct >= 100 ? " lleno" : ""}`}><i key={pct} style={{ width: `${pct}%` }} /></span>
        </div>
        {lista.length ? (
          <div className="prd-tareas">
            {visibles.map((t) => {
              const hecha = t.estado === "finalizada";
              const deps = (Array.isArray(t.predecesoras) ? t.predecesoras : []).map((id) => porId.get(id)).filter((d) => d && !["finalizada", "cancelada"].includes(d.estado));
              return (
                <div key={t.id} className={`prd-tarea${hecha ? " hecha" : ""}`}>
                  <Check estado={t.estado} disabled={!esGestion} onClick={() => tildar(t)} etiqueta={`${hecha ? "Desmarcar" : "Marcar terminada"}: ${t.nombre}`} />
                  <span className="prd-tarea-nom">
                    {t.nombre}
                    {!hecha && deps.length > 0 && <small>Espera: {deps.map((d) => d.nombre).join(", ")}</small>}
                  </span>
                  {archCounts[t.id] > 0 && <span className="prd-clip" title="Archivos y planos"><Paperclip size={12} />{archCounts[t.id]}</span>}
                  {t.responsable && <span className="prd-av" title={t.responsable}>{iniciales(t.responsable)}</span>}
                  {esGestion && (
                    <button type="button" className="prd-mas" onClick={() => onEditarTarea(t)} aria-label={`Editar ${t.nombre}`} title="Editar, fechas y archivos">
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                </div>
              );
            })}
            {lista.length > VISIBLES && (
              <button type="button" className="lnk" style={{ justifySelf: "start", marginTop: 6 }} onClick={() => setTodas((v) => !v)}>
                {todas ? "Mostrar menos" : `Ver las ${lista.length} tareas`}
              </button>
            )}
          </div>
        ) : (
          <div className="prd-nota">Esta etapa no tiene tareas. Se puede llevar sólo con el estado.</div>
        )}
        {esGestion && (
          <form className="prd-alta" onSubmit={agregar} style={{ marginTop: 8 }}>
            <input className="ui-input" id={`nueva-tarea-${item.id}`} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Agregar tarea a esta etapa" autoComplete="off" />
            <button type="submit" className="ui-btn" disabled={!nueva.trim() || guardando} aria-label="Agregar tarea"><Plus size={16} /></button>
          </form>
        )}
      </div>

      <ProductosEtapa procesoId={etapa.linea_proceso_id} onConfigurar={onConfigurar} esGestion={esGestion} />

      {esGestion && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="lnk" onClick={() => onEditarEtapa(item)}><Pencil size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Fechas propias y detalle de la etapa</button>
        </div>
      )}
      {item.offset == null && item.sug && (
        <div className="prd-nota">Sin semana en la plantilla: se ubica a continuación de la etapa anterior hasta que se cargue en Configuración.</div>
      )}
    </div>
  );
}

// Productos que la plantilla de la línea asigna a esta etapa. Se piden recién
// al abrir la etapa.
function ProductosEtapa({ procesoId, onConfigurar, esGestion }) {
  const [estado, setEstado] = useState({ cargando: true, filas: [] });
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    if (!procesoId) return undefined;
    let vivo = true;
    (async () => {
      const { data: asig } = await supabase
        .from("linea_proceso_materiales")
        .select("id,material_id,cantidad,unidad")
        .eq("linea_proceso_id", procesoId)
        .order("orden");
      const ids = [...new Set((asig || []).map((a) => a.material_id))];
      const { data: mats } = ids.length
        ? await supabase.from("panol_materiales").select("id,descripcion,codigo,unidad_medida").in("id", ids)
        : { data: [] };
      const porId = new Map((mats || []).map((m) => [m.id, m]));
      if (vivo) setEstado({ cargando: false, filas: (asig || []).map((a) => ({ ...a, material: porId.get(a.material_id) })) });
    })();
    return () => { vivo = false; };
  }, [procesoId]);

  if (!procesoId) return null;
  const filas = todos ? estado.filas : estado.filas.slice(0, 6);
  return (
    <div>
      <div className="prd-sub-cab" style={{ marginBottom: 6 }}>
        <b><Package size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Productos</b>
        {!estado.cargando && <span className="mono">{estado.filas.length}</span>}
        {esGestion && <button type="button" className="lnk" onClick={onConfigurar}>Configurar</button>}
      </div>
      {estado.cargando ? (
        <div className="prd-nota">Buscando los productos de la etapa…</div>
      ) : estado.filas.length ? (
        <>
          <div className="prd-prods">
            {filas.map((f) => (
              <div key={f.id} className="prd-prod">
                <span title={f.material?.descripcion}>{f.material?.descripcion || "Producto sin nombre"}</span>
                <span className="mono">{Number(f.cantidad || 1).toLocaleString("es-AR", { maximumFractionDigits: 2 })} {f.unidad || f.material?.unidad_medida || "u"}</span>
              </div>
            ))}
          </div>
          {estado.filas.length > 6 && (
            <button type="button" className="lnk" style={{ marginTop: 6 }} onClick={() => setTodos((v) => !v)}>{todos ? "Mostrar menos" : `Ver los ${estado.filas.length} productos`}</button>
          )}
        </>
      ) : (
        <div className="prd-nota">La plantilla todavía no le asigna productos a esta etapa.</div>
      )}
    </div>
  );
}
