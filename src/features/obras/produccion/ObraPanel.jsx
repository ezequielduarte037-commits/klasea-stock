import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Copy, Focus, Pencil,
  Settings2, Sparkles, X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { hoyLocal, diasEntre } from "./plan";
import { Anillo, Estado, Menu } from "./ui";
import { fMedia, plural, semanaRel } from "./formato";
import EtapaDetalle from "./EtapaDetalle";

// Panel de una obra: al costado del Gantt en la computadora, a pantalla
// completa en el celular. Arriba lo esencial (avance, etapa de hoy, desmolde,
// fin), después lo que pide una decisión y la ruta de etapas para reportar.

const TONO_OBRA = { activa: "azul", pausada: "violeta", terminada: "verde", cancelada: "rojo" };
const TEXTO_OBRA = { activa: "Activa", pausada: "Pausada", terminada: "Terminada", cancelada: "Cancelada" };

export default function ObraPanel({
  obra, plan, linea, tareasPorEtapa, archCounts, esGestion, acciones, isMobile, repetidas = 0,
  etapaSel, onEtapa, onCerrar, onPrev, onNext, foco, onFoco,
  onEditarTarea, onEditarEtapa, onVacaciones, onConfigurar,
}) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [menu, setMenu] = useState(false);
  const [editDesmolde, setEditDesmolde] = useState(null);
  const [editCodigo, setEditCodigo] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const cuerpoRef = useRef(null);
  const hoy = hoyLocal();

  // Al elegir otra etapa (desde el Gantt o la lista) se la trae a la vista.
  // Al abrir el panel no: primero se ve el resumen de la obra.
  const etapaPrevia = useRef(etapaSel);
  useEffect(() => {
    if (etapaPrevia.current === etapaSel) return;
    etapaPrevia.current = etapaSel;
    if (etapaSel == null) return;
    const el = cuerpoRef.current?.querySelector(`[data-etapa="${etapaSel}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [etapaSel]);

  const diasObra = obra.fecha_inicio ? diasEntre(new Date(`${obra.fecha_inicio.slice(0, 10)}T00:00:00`), hoy) : null;

  async function correr(fn, ok) {
    setTrabajando(true);
    try {
      const r = await fn();
      if (ok) toast.success(typeof ok === "function" ? ok(r) : ok);
    } catch (e) {
      toast.error(e.message || "No se pudo guardar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function terminarObra() {
    setMenu(false);
    const ok = await confirmar({
      title: `Terminar ${obra.codigo}`,
      message: "La obra pasa a Terminadas y se abre el cierre de materiales del pañol.",
      confirmLabel: "Terminar obra",
    });
    if (ok) correr(() => acciones.cambiarEstadoObra(obra.id, "terminada"), `${obra.codigo} terminada`);
  }

  async function eliminarObra() {
    setMenu(false);
    const ok = await confirmar({
      title: `Eliminar ${obra.codigo}`,
      message: "Se borran sus etapas, tareas y archivos. No se puede deshacer.",
      confirmLabel: "Eliminar obra",
      tone: "danger",
    });
    if (ok) {
      await correr(() => acciones.eliminarObra(obra), `${obra.codigo} eliminada`);
      onCerrar();
    }
  }

  async function confirmarVencidas() {
    const n = plan.paraConfirmar.length;
    const ok = await confirmar({
      title: `Marcar ${plural(n, "etapa", "etapas")} como terminada${n === 1 ? "" : "s"}`,
      message: plan.paraConfirmar.map((e) => e.nombre).join(", "),
      confirmLabel: "Marcar terminadas",
    });
    if (ok) correr(() => acciones.confirmarEtapas(obra, plan.paraConfirmar.map((e) => e.etapa)), (c) => `${plural(c, "etapa terminada", "etapas terminadas")}`);
  }

  const etapaHoy = plan.actual;
  return (
    <aside className="prd-panel" aria-label={`Obra ${obra.codigo}`} data-tour="obras-panel">
      <div className="prd-panel-cab">
        <div className="prd-panel-top">
          {isMobile && (
            <button type="button" className="prd-btn-ic" onClick={onCerrar} aria-label="Volver a la planta"><ChevronLeft size={18} /></button>
          )}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => esGestion && setMenu((v) => !v)}
              style={{ border: 0, background: "transparent", padding: 0, cursor: esGestion ? "pointer" : "default" }}
              aria-haspopup={esGestion ? "menu" : undefined}
              aria-expanded={menu}
            >
              <Estado tono={TONO_OBRA[obra.estado] || "neutro"}>
                {TEXTO_OBRA[obra.estado] || obra.estado}{esGestion && <ChevronDown size={12} style={{ marginLeft: -1 }} />}
              </Estado>
            </button>
            <Menu abierto={menu} onCerrar={() => setMenu(false)} alinear="izquierda">
              <div className="prd-menu-titulo">Obra {obra.codigo}</div>
              {obra.estado !== "activa" && <button type="button" onClick={() => { setMenu(false); correr(() => acciones.cambiarEstadoObra(obra.id, "activa"), `${obra.codigo} activa`); }}>Reactivar</button>}
              {obra.estado === "activa" && <button type="button" onClick={() => { setMenu(false); correr(() => acciones.cambiarEstadoObra(obra.id, "pausada"), `${obra.codigo} en pausa`); }}>Pausar</button>}
              {obra.estado !== "terminada" && <button type="button" onClick={terminarObra}>Terminar obra</button>}
              <button type="button" onClick={() => { setMenu(false); setEditCodigo(obra.codigo); }}>Cambiar código</button>
              <button type="button" onClick={() => { setMenu(false); onVacaciones(); }}>Vacaciones y pausas</button>
              <hr />
              <button type="button" className="peligro" onClick={eliminarObra}>Eliminar obra</button>
            </Menu>
          </div>
          {linea && <span className="ui-chip" style={{ minHeight: 22 }}>{linea.nombre}</span>}
          <span className="prd-sp" />
          {!isMobile && (
            <button type="button" className={`prd-btn-ic${foco ? " on" : ""}`} onClick={onFoco} title={foco ? "Ver todas las obras" : "Enfocar esta obra"} aria-pressed={foco}>
              <Focus size={16} />
            </button>
          )}
          <button type="button" className="prd-btn-ic" onClick={onPrev} disabled={!onPrev} aria-label="Obra anterior"><ChevronLeft size={16} /></button>
          <button type="button" className="prd-btn-ic" onClick={onNext} disabled={!onNext} aria-label="Obra siguiente"><ChevronRight size={16} /></button>
          {!isMobile && <button type="button" className="prd-btn-ic" onClick={onCerrar} aria-label="Cerrar panel"><X size={16} /></button>}
        </div>
        <div className="prd-panel-cod">
          {editCodigo != null ? (
            <form
              className="prd-fecha-edit"
              onSubmit={(e) => {
                e.preventDefault();
                const nuevo = editCodigo.trim().toUpperCase();
                setEditCodigo(null);
                if (nuevo && nuevo !== obra.codigo) correr(() => acciones.actualizarObra(obra.id, { codigo: nuevo }), `Código cambiado a ${nuevo}`);
              }}
            >
              <input className="ui-input mono" autoFocus value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditCodigo(null)} style={{ width: 140, fontSize: 18 }} />
              <button type="submit" className="ui-btn ui-btn-suave" style={{ minHeight: 32 }}>Guardar</button>
            </form>
          ) : (
            <h2>{obra.codigo}</h2>
          )}
          {obra.descripcion && <span>{obra.descripcion}</span>}
        </div>
      </div>

      <div className="prd-panel-cuerpo" ref={cuerpoRef}>
        <div className="prd-heroe">
          <Anillo valor={plan.avance} tam={68} grosor={5} fuente={15} />
          <div className="prd-datos">
            <div className="prd-dato">
              <small>Etapa de hoy</small>
              <b title={etapaHoy?.nombre}>
                <span>{etapaHoy ? etapaHoy.nombre : plan.etapas.length ? (plan.fin <= hoy ? "Plan cumplido" : `Arranca ${fMedia(plan.inicio)}`) : "—"}</span>
              </b>
            </div>
            <div className="prd-dato">
              <small>Desmolde</small>
              {editDesmolde != null ? (
                <form className="prd-fecha-edit" onSubmit={(e) => { e.preventDefault(); const v = editDesmolde; setEditDesmolde(null); correr(() => acciones.guardarDesmolde(obra, v), "Desmolde actualizado: el plan se recalculó"); }}>
                  <input type="date" className="ui-input" autoFocus value={editDesmolde} onChange={(e) => setEditDesmolde(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditDesmolde(null)} />
                  <button type="submit" className="ui-btn ui-btn-suave" style={{ minHeight: 32, padding: "0 10px" }}>OK</button>
                </form>
              ) : (
                <b>
                  {plan.s0 ? <span className="mono">{fMedia(plan.s0)}</span> : <span style={{ color: "var(--cyan)" }}>Sin cargar</span>}
                  {plan.s0 && <span className="suave">{plan.s0Fuente}</span>}
                  {esGestion && <button type="button" className="prd-editar" onClick={() => setEditDesmolde(obra.desmolde_estimado?.slice(0, 10) || "")} aria-label="Cambiar desmolde estimado" title={obra.desmolde_real ? "Hay desmolde real: el estimado queda como referencia" : "Cambiar desmolde estimado"}><Pencil size={12} /></button>}
                </b>
              )}
            </div>
            <div className="prd-dato">
              <small>Fin según plan</small>
              <b>{plan.fin ? <span className="mono">{fMedia(plan.fin)}</span> : "—"}</b>
            </div>
            <div className="prd-dato">
              <small>En obra</small>
              <b><span className="mono">{diasObra != null && diasObra >= 0 ? plural(diasObra, "día", "días") : "—"}</span></b>
            </div>
          </div>
        </div>

        {plan.sinPlantilla && (
          <div className="prd-aviso" data-tono="neutro">
            <Settings2 size={16} />
            <p>La línea {linea?.nombre || ""} todavía no tiene etapas. Se cargan una vez en Configuración y todas sus obras toman el plan.</p>
            {esGestion && <div className="acc"><button type="button" className="ui-btn ui-btn-suave" onClick={() => onConfigurar("recorrido")}>Ir a Configuración</button></div>}
          </div>
        )}
        {plan.sinFechas && (
          <div className="prd-aviso" data-tono="cian">
            <CalendarRange size={16} />
            <p>Falta la fecha de desmolde. Con ella se calcula todo el plan de la obra.</p>
            {esGestion && <div className="acc"><button type="button" className="ui-btn ui-btn-suave" onClick={() => setEditDesmolde("")}>Cargar desmolde</button></div>}
          </div>
        )}
        {plan.paraConfirmar.length > 0 && (
          <div className="prd-aviso" data-tono="cian">
            <AlertTriangle size={16} />
            <p>
              Según el plan, <b>{plural(plan.paraConfirmar.length, "etapa", "etapas")}</b> ya {plan.paraConfirmar.length === 1 ? "debería estar terminada" : "deberían estar terminadas"}.{" "}
              <span>{plan.paraConfirmar.slice(0, 3).map((e) => e.nombre).join(", ")}{plan.paraConfirmar.length > 3 ? "…" : ""}</span>
            </p>
            {esGestion && (
              <div className="acc">
                <button type="button" className="ui-btn ui-btn-suave" disabled={trabajando} onClick={confirmarVencidas}>{plan.paraConfirmar.length === 1 ? "Marcarla terminada" : "Marcarlas terminadas"}</button>
                <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => onEtapa(plan.paraConfirmar[0].idx)}>Revisar una por una</button>
              </div>
            )}
          </div>
        )}
        {esGestion && plan.etapas.length > 0 && plan.totalTareas === 0 && (
          <div className="prd-aviso" data-tono="azul">
            <ClipboardList size={16} />
            <p>Esta obra todavía no tiene tareas. Se pueden traer las de la plantilla de {linea?.nombre || "la línea"}.</p>
            <div className="acc">
              <button type="button" className="ui-btn ui-btn-suave" disabled={trabajando} onClick={() => correr(() => acciones.importarTareas(obra), (n) => `${plural(n, "tarea traída", "tareas traídas")} de la plantilla`)}>Traer tareas de la plantilla</button>
            </div>
          </div>
        )}
        {esGestion && repetidas > 0 && (
          <div className="prd-aviso" data-tono="cian">
            <Copy size={16} />
            <p>Hay <b>{plural(repetidas, "tarea repetida", "tareas repetidas")}</b>: la plantilla se trajo más de una vez. <span>Queda la copia con avance.</span></p>
            <div className="acc">
              <button type="button" className="ui-btn ui-btn-suave" disabled={trabajando} onClick={async () => {
                const ok = await confirmar({ title: `Quitar ${plural(repetidas, "tarea repetida", "tareas repetidas")}`, message: "Se borran las copias sin avance. Las que tienen archivos propios quedan.", confirmLabel: "Quitar repetidas" });
                if (ok) correr(() => acciones.quitarRepetidas(obra.id), (n) => `${plural(n, "tarea repetida quitada", "tareas repetidas quitadas")}`);
              }}>Quitar repetidas</button>
            </div>
          </div>
        )}
        {plan.tieneSugeridas && !plan.sinPlantilla && (
          <div className="prd-aviso" data-tono="neutro">
            <Sparkles size={16} />
            <p>{plural(plan.etapas.filter((e) => e.sug).length, "etapa no tiene", "etapas no tienen")} semana en la plantilla: van a continuación de la anterior. <span>Las rayadas son sugeridas.</span></p>
            {esGestion && <div className="acc"><button type="button" className="ui-btn ui-btn-fantasma" onClick={() => onConfigurar("recorrido")}>Ubicarlas en Configuración</button></div>}
          </div>
        )}

        {plan.etapas.length > 0 && (
          <section className="prd-sec">
            <div className="prd-sec-cab">
              <h3>Ruta de producción</h3>
              <span>{plan.terminadas} de {plan.etapas.length} terminadas</span>
            </div>
            <div className="prd-ruta">
              {plan.etapas.map((e) => {
                const abierta = etapaSel === e.idx;
                const clase = ["completado", "en_curso", "bloqueado"].includes(e.estado) ? e.estado : e.vencida ? "vencida" : "pendiente";
                const pct = e.total ? Math.round((e.hechas / e.total) * 100) : e.estado === "completado" ? 100 : 0;
                return (
                  <div key={e.id} className={`prd-ruta-item ${clase}${abierta ? " abierta" : ""}`} data-etapa={e.idx}>
                    <button type="button" className="prd-ruta-btn" onClick={() => onEtapa(abierta ? null : e.idx)} aria-expanded={abierta}>
                      <span className={`prd-nodo ${clase}`} />
                      <span style={{ minWidth: 0 }}>
                        <span className="prd-ruta-nom">{e.nombre}</span>
                        <span className="prd-ruta-meta">
                          <span className="mono">{fMedia(e.ini)} → {fMedia(e.fin)}</span>
                          {e.offset != null && <span className="mono">{semanaRel(e.offset)}</span>}
                          {e.sug && <span className="prd-sug-tag">sugerida</span>}
                          {e.enPlanHoy && e.estado !== "completado" && <span className="prd-hoy-tag">hoy</span>}
                        </span>
                      </span>
                      <span className="prd-ruta-der">
                        <span className="mono" style={{ fontSize: 11, color: "var(--subtle)" }}>{e.total ? `${e.hechas}/${e.total}` : e.estado === "completado" ? "✓" : ""}</span>
                        <span className={`prd-mini${pct >= 100 ? " lleno" : ""}`}><i key={pct} style={{ width: `${pct}%` }} /></span>
                      </span>
                    </button>
                    {abierta && (
                      <EtapaDetalle
                        obra={obra}
                        item={e}
                        tareas={e.etapa.isVirtual ? [] : tareasPorEtapa.get(e.id) || []}
                        archCounts={archCounts}
                        esGestion={esGestion}
                        acciones={acciones}
                        onEditarTarea={onEditarTarea}
                        onEditarEtapa={onEditarEtapa}
                        onConfigurar={() => onConfigurar("productos", e.etapa.linea_proceso_id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <div style={{ height: 12 }} />
      </div>

      {esGestion && (
        <div className="prd-panel-pie">
          <button type="button" className="ui-btn" data-tour="obras-vacaciones" onClick={onVacaciones}><CalendarRange size={15} />Vacaciones</button>
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => onConfigurar("recorrido")}><Settings2 size={15} />Plantilla {linea?.nombre || ""}</button>
        </div>
      )}
    </aside>
  );
}
