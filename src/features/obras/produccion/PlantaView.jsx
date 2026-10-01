import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, GanttChart, LayoutList, Plus, Search, X } from "lucide-react";
import BotonAyuda from "@/features/ayuda/BotonAyuda";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import { EtapaModal, ObraModal, TareaModal, VacacionesObraModal } from "@/features/obras/ObrasModales";
import { hasMatrixDetailColumns } from "@/features/obras/obrasHelpers";
import GanttPlanta from "./GanttPlanta";
import ObraPanel from "./ObraPanel";
import { Anillo, Estado, NodoEtapa } from "./ui";
import { estadoDeObra, hoyLocal } from "./plan";
import { MS_DIA, fLarga, fMedia, fMes } from "./formato";

// Planta: la lista de obras y el Gantt en la misma pantalla. Al tocar una obra
// se despliegan sus etapas en el Gantt y se abre su panel al costado; "Enfocar"
// deja sólo esa obra. En el celular se ven tarjetas y la obra abre a pantalla
// completa (el Gantt sigue disponible con el botón de arriba).

// Las terminadas no van al Gantt: se ven en una lista aparte.
const ESTADOS = [["activa", "Activas"], ["pausada", "Pausadas"], ["terminada", "Terminadas"]];

const leer = (clave, def) => { try { return window.localStorage.getItem(clave) ?? def; } catch { return def; } };
const guardar = (clave, v) => { try { window.localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ } };

export default function PlantaView({
  datos, profile, esGestion, isMobile, filtroInicial, obraInicial, onConfigurar,
}) {
  const toast = useToast();
  const { obras, lineas, lineaById, planes, tareasPorEtapa, archCounts, periodosPorObra, acciones, loading } = datos;
  const hoy = useMemo(() => hoyLocal(), []);

  const [estadoFiltro, setEstadoFiltro] = useState(ESTADOS.some(([k]) => k === filtroInicial?.estado) ? filtroInicial.estado : "activa");
  const [lineaFiltro, setLineaFiltro] = useState(() => leer("obras_linea_foco", "todas"));
  const [busqueda, setBusqueda] = useState("");
  const [modo, setModo] = useState(() => leer("obras_planta_modo", "cal"));
  const [zoom, setZoom] = useState(() => Number(leer("obras_planta_zoom", "1")));
  const [vistaMovil, setVistaMovil] = useState("tarjetas");
  const [seleccion, setSeleccion] = useState(null);
  const [etapaSel, setEtapaSel] = useState(null);
  const [foco, setFoco] = useState(false);
  const [tip, setTip] = useState(null);

  const [nuevaObra, setNuevaObra] = useState(false);
  const [tareaModal, setTareaModal] = useState(null);
  const [etapaModal, setEtapaModal] = useState(null);
  const [vacaciones, setVacaciones] = useState(null);

  // Cambiar de filtro cierra la obra elegida: si no, quedaría "elegida" sin verse.
  const soltarSeleccion = () => { setSeleccion(null); setEtapaSel(null); setFoco(false); };
  const cambiarLinea = (id) => { setLineaFiltro(id); guardar("obras_linea_foco", id); soltarSeleccion(); };
  const cambiarEstado = (k) => { setEstadoFiltro(k); soltarSeleccion(); };
  const cambiarModo = (m) => { setModo(m); guardar("obras_planta_modo", m); };
  const cambiarZoom = (z) => { setZoom(z); guardar("obras_planta_zoom", String(z)); };

  // Desde el buscador global: la obra pedida, aunque esté pausada o terminada.
  useEffect(() => {
    if (!obraInicial || loading) return;
    const obra = obras.find((o) => o.id === obraInicial);
    if (!obra) return;
    setEstadoFiltro(ESTADOS.some(([k]) => k === obra.estado) ? obra.estado : "activa");
    setLineaFiltro("todas");
    setSeleccion(obra.id);
    setEtapaSel(planes.get(obra.id)?.actual?.idx ?? null);
    // Sólo al llegar con el enlace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraInicial, loading]);

  // Si la línea guardada ya no existe, se vuelve a "todas".
  useEffect(() => {
    if (lineas.length && lineaFiltro !== "todas" && !lineaById.has(lineaFiltro)) setLineaFiltro("todas");
  }, [lineas, lineaFiltro, lineaById]);

  const conteo = useMemo(() => {
    const base = lineaFiltro === "todas" ? obras : obras.filter((o) => o.linea_id === lineaFiltro);
    const c = { activa: 0, pausada: 0, terminada: 0 };
    base.forEach((o) => { if (c[o.estado] != null) c[o.estado] += 1; });
    return c;
  }, [obras, lineaFiltro]);

  const porLinea = useMemo(() => {
    const c = {};
    obras.filter((o) => o.estado === estadoFiltro).forEach((o) => { c[o.linea_id || "_"] = (c[o.linea_id || "_"] || 0) + 1; });
    return c;
  }, [obras, estadoFiltro]);

  const filasTodas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return obras
      .filter((o) => o.estado === estadoFiltro)
      .filter((o) => lineaFiltro === "todas" || o.linea_id === lineaFiltro)
      .filter((o) => !q || `${o.codigo} ${o.descripcion || ""} ${o.linea_nombre || ""}`.toLowerCase().includes(q))
      .map((obra) => {
        const plan = planes.get(obra.id);
        return { obra, plan, estado: estadoDeObra(obra, plan), linea: lineaById.get(obra.linea_id) || null };
      })
      .filter((f) => f.plan);
  }, [obras, estadoFiltro, lineaFiltro, busqueda, planes, lineaById]);

  const grupos = useMemo(() => {
    const orden = [...lineas.map((l) => l.id), "_"];
    const mapa = new Map();
    filasTodas.forEach((f) => {
      const clave = f.obra.linea_id && lineaById.has(f.obra.linea_id) ? f.obra.linea_id : "_";
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(f);
    });
    const fecha = (f) => (f.plan.s0 || f.plan.inicio || new Date(8.64e15)).getTime();
    return orden.filter((k) => mapa.has(k)).map((k) => ({
      clave: k,
      nombre: k === "_" ? "Sin línea" : lineaById.get(k)?.nombre,
      color: k === "_" ? null : lineaById.get(k)?.color,
      filas: mapa.get(k).sort((a, b) => fecha(a) - fecha(b)),
    }));
  }, [filasTodas, lineas, lineaById]);

  const orden = useMemo(() => grupos.flatMap((g) => g.filas), [grupos]);
  // Sólo cuenta la obra elegida si está a la vista con los filtros actuales.
  const filaSel = orden.find((f) => f.obra.id === seleccion) || null;
  const seleccionVisible = filaSel ? seleccion : null;
  const gruposVista = foco && filaSel ? [{ clave: "foco", nombre: filaSel.linea?.nombre, filas: [filaSel] }] : grupos;

  // La obra elegida puede quedar fuera de los filtros: se cierra el panel.
  useEffect(() => {
    if (seleccion && !loading && !obras.some((o) => o.id === seleccion)) { setSeleccion(null); setFoco(false); }
  }, [seleccion, obras, loading]);

  const seleccionar = useCallback((id) => {
    setTip(null);
    if (id === seleccion) return;
    setSeleccion(id);
    const plan = planes.get(id);
    setEtapaSel(plan?.actual?.idx ?? plan?.primeraAbierta?.idx ?? null);
  }, [seleccion, planes]);

  // Enfocar: deja sólo esa obra y ajusta la escala a su recorrido.
  const alternarFoco = useCallback((id) => {
    setTip(null);
    if (id !== seleccion) {
      setSeleccion(id);
      const plan = planes.get(id);
      setEtapaSel(plan?.actual?.idx ?? plan?.primeraAbierta?.idx ?? null);
      setFoco(true);
      return;
    }
    setFoco((v) => !v);
  }, [seleccion, planes]);

  const idx = orden.findIndex((f) => f.obra.id === seleccion);
  const irA = (d) => { const f = orden[idx + d]; if (f) { setSeleccion(f.obra.id); const p = f.plan; setEtapaSel(p?.actual?.idx ?? p?.primeraAbierta?.idx ?? null); } };

  // Escape cierra el panel (o sale del foco).
  useEffect(() => {
    if (!seleccion) return undefined;
    const tecla = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".om-fondo, [role=dialog][aria-modal=true]")) return;
      if (foco) setFoco(false); else { setSeleccion(null); setEtapaSel(null); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [seleccion, foco]);

  async function abrirEditarEtapa(item) {
    try {
      let etapa = item.etapa;
      if (etapa.isVirtual) {
        const creadas = await acciones.materializarEtapas(filaSel.obra);
        etapa = creadas.find((e) => e.linea_proceso_id === etapa.linea_proceso_id) || etapa;
      }
      setEtapaModal({ etapa: { ...etapa, cronograma: item.etapa.cronograma }, obraId: filaSel.obra.id });
    } catch (e) {
      toast.error(e.message);
    }
  }

  const detalleHabilitado = datos.etapas.some(hasMatrixDetailColumns) || datos.lProcs.some(hasMatrixDetailColumns);
  const izq = isMobile ? 150 : 300;
  const enTerminadas = estadoFiltro === "terminada";
  const conGantt = !enTerminadas && (!isMobile || vistaMovil === "gantt");
  const activas = conteo.activa;

  const onTip = useCallback((t) => {
    setTip((prev) => (t && t.lineas == null && prev ? { ...prev, x: t.x, y: t.y } : t));
  }, []);

  return (
    <>
      <div className="prd-barra">
        <div className="prd-barra-fila">
          <div className="prd-titulos">
            <div className="prd-eyebrow">Producción</div>
            <h1 className="prd-h1">Planta de <span className="acento">obras</span></h1>
            <div className="prd-sub"><b>{activas}</b> {activas === 1 ? "obra activa" : "obras activas"} · hoy {fLarga(hoy)}</div>
          </div>
          <div className="prd-acciones">
            <label className="prd-buscar" aria-label="Buscar obra">
              <Search size={15} />
              <input className="ui-input" id="planta-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar obra" autoComplete="off" />
            </label>
            {isMobile && !enTerminadas && (
              <div className="prd-seg" role="group" aria-label="Vista">
                <button type="button" className={vistaMovil === "tarjetas" ? "on" : ""} onClick={() => setVistaMovil("tarjetas")} aria-label="Tarjetas"><LayoutList size={15} /></button>
                <button type="button" className={vistaMovil === "gantt" ? "on" : ""} onClick={() => setVistaMovil("gantt")} aria-label="Gantt"><GanttChart size={15} /></button>
              </div>
            )}
            {esGestion && (
              <button type="button" className={`ui-btn ui-btn-primario${isMobile ? " ui-btn-icono" : ""}`} onClick={() => setNuevaObra(true)} aria-label="Nueva obra">
                <Plus size={16} />{!isMobile && "Nueva obra"}
              </button>
            )}
            <BotonAyuda
              tourId="obras-planificacion"
              profile={profile}
              onBeforeStart={() => {
                const primera = orden.find((f) => f.plan.etapas.length) || orden[0];
                if (primera) { setSeleccion(primera.obra.id); setEtapaSel(primera.plan.actual?.idx ?? 0); }
              }}
            />
          </div>
        </div>
        <div className="prd-filtros" data-tour="obras-planta-filtros">
          <div className="prd-seg" role="group" aria-label="Estado de las obras">
            {ESTADOS.map(([k, t]) => (
              <button key={k} type="button" className={estadoFiltro === k ? "on" : ""} onClick={() => cambiarEstado(k)}>{t}<span className="n">{conteo[k]}</span></button>
            ))}
          </div>
          <div className="prd-scroll-x" role="group" aria-label="Línea">
            <button type="button" className={`prd-chip${lineaFiltro === "todas" ? " on" : ""}`} onClick={() => cambiarLinea("todas")}>Todas</button>
            {lineas.filter((l) => porLinea[l.id] || lineaFiltro === l.id).map((l) => (
              <button key={l.id} type="button" className={`prd-chip${lineaFiltro === l.id ? " on" : ""}`} style={{ "--c": l.color || "var(--muted)" }} onClick={() => cambiarLinea(l.id)}>
                <span className="pto" />{l.nombre}<span className="n">{porLinea[l.id] || 0}</span>
              </button>
            ))}
          </div>
          <span className="prd-sp" />
          {conGantt && (
            <>
              <div className="prd-seg" role="group" aria-label="Eje de tiempo">
                <button type="button" className={modo === "cal" ? "on" : ""} onClick={() => cambiarModo("cal")}><CalendarDays size={14} />Calendario</button>
                <button type="button" className={modo === "s0" ? "on" : ""} onClick={() => cambiarModo("s0")}>Por desmolde</button>
              </div>
            </>
          )}
          {foco && filaSel && (
            <button type="button" className="prd-chip on" onClick={() => setFoco(false)}>Sólo {filaSel.obra.codigo}<X size={14} /></button>
          )}
        </div>
      </div>

      <div className="prd-cuerpo">
        {loading ? (
          <div style={{ flex: 1, position: "relative" }}><Cargando llenar texto="Cargando obras…" /></div>
        ) : !filasTodas.length ? (
          <div className="prd-vacio" style={{ flex: 1 }}>
            <strong>{obras.length ? "Ninguna obra coincide con los filtros" : "Todavía no hay obras"}</strong>
            <span>{obras.length ? "Probá con otro estado, otra línea o borrá la búsqueda." : "Creá la primera obra: con el desmolde y la línea, el plan se arma solo."}</span>
            {obras.length > 0 && <button type="button" className="ui-btn" onClick={() => { cambiarEstado("activa"); cambiarLinea("todas"); setBusqueda(""); }}>Ver las activas</button>}
          </div>
        ) : estadoFiltro === "terminada" ? (
          <ListaTerminadas filas={orden} seleccion={seleccionVisible} onAbrir={seleccionar} />
        ) : conGantt ? (
          <GanttPlanta
            grupos={gruposVista}
            modo={modo}
            zoom={zoom}
            hoy={hoy}
            izq={izq}
            seleccion={seleccionVisible}
            expandida={seleccionVisible}
            etapaSel={etapaSel}
            focoObra={foco ? filaSel : null}
            onSeleccionar={seleccionar}
            onEtapa={(id, j) => { if (id !== seleccion) setSeleccion(id); setEtapaSel(j); }}
            onTip={onTip}
            onZoom={cambiarZoom}
            onFoco={alternarFoco}
          />
        ) : (
          <TarjetasObras grupos={grupos} hoy={hoy} onAbrir={seleccionar} />
        )}

        {filaSel && (
          <ObraPanel
            key={filaSel.obra.id}
            obra={filaSel.obra}
            plan={filaSel.plan}
            linea={filaSel.linea}
            tareasPorEtapa={tareasPorEtapa}
            archCounts={archCounts}
            esGestion={esGestion}
            acciones={acciones}
            isMobile={isMobile}
            repetidas={datos.repetidasDeObra(filaSel.obra.id).length}
            etapaSel={etapaSel}
            onEtapa={setEtapaSel}
            onCerrar={() => { setSeleccion(null); setEtapaSel(null); setFoco(false); }}
            onPrev={idx > 0 ? () => irA(-1) : null}
            onNext={idx >= 0 && idx < orden.length - 1 ? () => irA(1) : null}
            foco={foco}
            onFoco={() => setFoco((v) => !v)}
            onEditarTarea={(t) => setTareaModal({ tarea: t, etapaId: t.etapa_id, obraId: t.obra_id })}
            onEditarEtapa={abrirEditarEtapa}
            onVacaciones={() => setVacaciones(filaSel.obra)}
            onConfigurar={(tab, procesoId) => onConfigurar({ lineaId: filaSel.obra.linea_id, tab, procesoId })}
          />
        )}
      </div>

      {!isMobile && !enTerminadas && (
        <div className="prd-leyenda" aria-hidden="true">
          <span><i className="prd-lg-barra hecho" />Reportado</span>
          <span><i className="prd-lg-barra esperado" />Debería estar hecho</span>
          <span><i className="prd-lg-barra" />Falta</span>
          <span><i className="prd-lg-s0" />Desmolde</span>
          <span style={{ gap: 5 }}><NodoEtapa clase="completado" tam={14} /><NodoEtapa clase="en_curso" tam={14} /><NodoEtapa clase="vencida" tam={14} />Etapa terminada, en curso, atrasada</span>
          {modo === "cal" ? <span><i className="prd-lg-hoy" />Hoy</span> : <span>Alineadas en el desmolde · la raya punteada es hoy</span>}
          <span className="prd-sp" />
          <span style={{ color: "var(--subtle)" }}>Doble clic en una obra para enfocarla</span>
        </div>
      )}

      {tip && (
        <div className="prd-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.min(tip.y + 16, window.innerHeight - 110) }}>
          <b>{tip.titulo}</b>
          {(tip.lineas || []).filter(Boolean).map((l, i) => <div key={i} className={i === 0 ? "mono" : ""}>{l}</div>)}
        </div>
      )}

      {nuevaObra && (
        <ObraModal
          lineas={lineas}
          lProcs={datos.lProcs}
          stageOffsets={datos.stageOffsets}
          onClose={() => setNuevaObra(false)}
          onSave={async (nueva) => {
            setNuevaObra(false);
            await datos.cargar();
            if (nueva?.id) { setEstadoFiltro("activa"); setSeleccion(nueva.id); }
            toast.success(`Obra ${nueva?.codigo || ""} creada`);
          }}
        />
      )}
      {tareaModal && (
        <TareaModal
          tarea={tareaModal.tarea}
          etapaId={tareaModal.etapaId}
          obraId={tareaModal.obraId}
          onClose={() => setTareaModal(null)}
          onSave={() => { setTareaModal(null); datos.cargar(); }}
        />
      )}
      {etapaModal && (
        <EtapaModal
          etapa={etapaModal.etapa}
          obraId={etapaModal.obraId}
          detailEnabled={detalleHabilitado}
          onClose={() => setEtapaModal(null)}
          onSave={() => { setEtapaModal(null); datos.cargar(); }}
        />
      )}
      {vacaciones && (
        <VacacionesObraModal
          obra={vacaciones}
          periods={periodosPorObra.get(vacaciones.id) || []}
          onClose={() => setVacaciones(null)}
          onSaved={datos.cargar}
        />
      )}
    </>
  );
}

// Celular: una tarjeta por obra con su línea de tiempo en miniatura.
function TarjetasObras({ grupos, hoy, onAbrir }) {
  let i = 0;
  return (
    <div className="prd-tarjetas">
      {grupos.map((g) => (
        <div key={g.clave} style={{ display: "grid", gap: 10 }}>
          <div className="prd-t-grupo" style={{ "--c": g.color || "var(--muted)" }}><span className="pto" />{g.nombre}<span className="n">{g.filas.length}</span></div>
          {g.filas.map(({ obra, plan, estado }) => {
            const n = Math.min(i++, 20);
            const tiene = plan.etapas.length > 0;
            const a = tiene ? plan.inicio.getTime() : 0;
            const b = tiene ? plan.fin.getTime() : 1;
            const p = (d) => `${Math.max(0, Math.min(100, ((d.getTime() - a) / Math.max(MS_DIA, b - a)) * 100))}%`;
            return (
              <button key={obra.id} type="button" className="prd-tarjeta" style={{ "--i": n }} onClick={() => onAbrir(obra.id)}>
                <div className="prd-t-cab">
                  <div style={{ minWidth: 0 }}>
                    <div className="prd-g-l1"><span className="prd-g-cod" style={{ fontSize: 16 }}>{obra.codigo}</span><Estado tono={estado.tono}>{estado.texto}</Estado></div>
                    <div className="prd-g-l2">{plan.actual ? plan.actual.nombre : plan.sinPlantilla ? "La línea no tiene etapas" : plan.sinFechas ? "Falta el desmolde" : plan.fin <= hoy ? "Plan cumplido" : `Arranca ${fMedia(plan.inicio)}`}</div>
                  </div>
                  <Anillo valor={plan.avance} tam={42} />
                </div>
                {tiene && (
                  <>
                    <MiniLinea plan={plan} hoy={hoy} p={p} i={n} />
                    <div className="prd-t-fechas"><span>{fMes(plan.inicio)}</span><span>{plan.s0 ? `S0 ${fMedia(plan.s0)}` : ""}</span><span>fin {fMes(plan.fin)}</span></div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Obras terminadas: tarjetas con cuándo terminaron. Se abren en el mismo panel
// (para mirarlas o reactivarlas) pero no ocupan lugar en el Gantt.
function ListaTerminadas({ filas, seleccion, onAbrir }) {
  const ordenadas = filas.slice().sort((a, b) => String(b.obra.fecha_fin_real || "").localeCompare(String(a.obra.fecha_fin_real || "")));
  return (
    <div className="prd-term">
      {ordenadas.map(({ obra, plan, linea }, i) => {
        const fin = obra.fecha_fin_real ? new Date(`${obra.fecha_fin_real.slice(0, 10)}T00:00:00`) : null;
        const ini = obra.fecha_inicio ? new Date(`${obra.fecha_inicio.slice(0, 10)}T00:00:00`) : null;
        const dias = fin && ini ? Math.round((fin - ini) / MS_DIA) : null;
        return (
          <button key={obra.id} type="button" className={`prd-term-card${seleccion === obra.id ? " sel" : ""}`} style={{ "--i": Math.min(i, 20) }} onClick={() => onAbrir(obra.id)}>
            <span className="fila">
              <span className="prd-g-cod" style={{ fontSize: 16 }}>{obra.codigo}</span>
              {linea && <span className="ui-chip" style={{ minHeight: 20 }}>{linea.nombre}</span>}
              <span className="prd-sp" />
              {plan.reportada && <Anillo valor={plan.avance} tam={34} />}
            </span>
            <span className="meta">
              <span>Terminada <b>{fin ? fMedia(fin) : "sin fecha"}</b></span>
              {dias != null && dias >= 0 && <span><b>{dias}</b> días en obra</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Línea de tiempo de la tarjeta del celular: la misma barra del Gantt (plan
// contra real), en porcentajes del ancho de la tarjeta.
function MiniLinea({ plan, hoy, p, i }) {
  const aPct = (d) => parseFloat(p(d));
  const cortes = [...new Set(plan.etapas.map((e) => Math.round(aPct(e.ini) * 10) / 10))].filter((x) => x > 1 && x < 99).sort((a, b) => a - b)
    .filter((x, k, xs) => k === 0 || x - xs[k - 1] >= 3);
  return (
    <div className="prd-t-linea">
      <div className={`prd-barra-o${plan.tieneSugeridas ? " sug" : ""}`} style={{ "--i": i }}>
        {hoy > plan.inicio && <span className="esperado" style={{ width: p(hoy) }} />}
        {plan.hechoHasta && <span className="hecho" style={{ width: p(plan.hechoHasta) }} />}
        {cortes.map((x) => <i key={x} style={{ left: `${x}%` }} />)}
      </div>
      {plan.s0 && <span className="prd-hito" style={{ left: p(plan.s0), "--i": i }} />}
    </div>
  );
}
