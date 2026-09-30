import { useLayoutEffect, useMemo, useRef } from "react";
import { Anillo, Estado } from "./ui";
import { MS_DIA, fCorta, fMedia, fMes, nombreMes, semanaRel } from "./formato";

// Gantt de todas las obras. Cada obra es una fila con su recorrido completo:
// la barra de fondo va del inicio al fin del plan, el degradé es el avance
// reportado, el recuadro azul la etapa en la que debería estar hoy y el rombo
// violeta el desmolde. La obra elegida se despliega con una fila por etapa.
//
// modo "cal": eje de calendario. modo "s0": todas alineadas en su desmolde.

const PX_DIA = [1.15, 2.6, 6.2];
const ZOOMS = [[2, "Mes", "Ver por semanas"], [1, "Trim.", "Ver por trimestre"], [0, "Año", "Ver el año"]];
const DIA = (d) => d.getTime() / MS_DIA;

function claseEtapa(e) {
  if (e.estado === "completado" || e.estado === "en_curso" || e.estado === "bloqueado") return e.estado;
  return e.vencida ? "vencida" : "pendiente";
}

export default function GanttPlanta({
  grupos, modo, zoom, hoy, izq, seleccion, expandida, etapaSel, focoObra,
  onSeleccionar, onEtapa, onTip, onZoom,
}) {
  const scrollRef = useRef(null);
  const ppd = PX_DIA[zoom] ?? PX_DIA[1];
  const hoyD = DIA(hoy);

  const escala = useMemo(() => {
    const filas = grupos.flatMap((g) => g.filas).filter((f) => f.plan.etapas.length);
    if (modo === "s0") {
      const conS0 = filas.filter((f) => f.plan.s0);
      const rel = (f, d) => DIA(d) - DIA(f.plan.s0);
      let min = Math.min(-120, ...conS0.map((f) => rel(f, f.plan.inicio)));
      let max = Math.max(240, ...conS0.map((f) => rel(f, f.plan.fin)));
      min = Math.max(min, -320) - 14;
      max = Math.min(max, 760) + 50;
      const paso = zoom === 0 ? 56 : zoom === 2 ? 14 : 28;
      const marcas = [];
      for (let v = Math.ceil(min / paso) * paso; v < max; v += paso) marcas.push({ v, s0: v === 0, texto: v === 0 ? "S0 · desmolde" : semanaRel(v / 7) });
      return { min, max, marcas, semanas: [], x: (d, f) => (DIA(d) - DIA(f.plan.s0) - min) * ppd };
    }
    let min = Math.min(hoyD - 150, ...filas.map((f) => DIA(f.plan.inicio)));
    let max = Math.max(hoyD + 210, ...filas.map((f) => DIA(f.plan.fin)));
    min = Math.max(min, hoyD - 560);
    max = Math.min(max, hoyD + 840) + 50;
    const desde = new Date(min * MS_DIA);
    const inicioMes = new Date(desde.getFullYear(), desde.getMonth(), 1);
    min = DIA(inicioMes);
    const marcas = [];
    for (let d = new Date(inicioMes); DIA(d) < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const anio = d.getMonth() === 0 || marcas.length === 0;
      marcas.push({ v: DIA(d), anio, mes: d.getMonth(), y: d.getFullYear() });
    }
    const semanas = [];
    if (zoom === 2) {
      const d = new Date(inicioMes);
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
      for (; DIA(d) < max; d.setDate(d.getDate() + 7)) semanas.push({ v: DIA(d), texto: String(d.getDate()).padStart(2, "0") });
    }
    return { min, max, marcas, semanas, x: (d) => (DIA(d) - min) * ppd };
  }, [grupos, modo, zoom, ppd, hoyD]);

  const W = Math.max(400, Math.round((escala.max - escala.min) * ppd));
  const xEje = (v) => Math.round((v - escala.min) * ppd);

  // Al entrar, al cambiar de modo o de zoom y al enfocar una obra, se centra
  // lo que importa: hoy (o el desmolde, alineado) o el recorrido de la obra.
  const objetivo = useMemo(() => {
    if (focoObra?.plan?.inicio) return modo === "s0" && focoObra.plan.s0 ? escala.x(focoObra.plan.inicio, focoObra) : escala.x(focoObra.plan.inicio);
    return modo === "s0" ? xEje(0) : escala.x(hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, zoom, focoObra?.obra?.id, escala.min]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const destino = Math.max(0, objetivo - (focoObra ? 60 : el.clientWidth * 0.34 - izq));
    el.scrollTo({ left: destino, behavior: el.dataset.listo ? "smooth" : "auto" });
    el.dataset.listo = "1";
  }, [objetivo, focoObra, izq]);

  // Al elegir una obra se trae su recorrido a la vista: entero si entra en
  // pantalla; si no, desde la etapa en la que debería estar hoy.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !seleccion) return;
    const f = grupos.flatMap((g) => g.filas).find((x) => x.obra.id === seleccion);
    if (!f?.plan?.etapas.length || (modo === "s0" && !f.plan.s0)) return;
    const X = (d) => (modo === "s0" ? escala.x(d, f) : escala.x(d));
    const visible = el.clientWidth - izq;
    const a = X(f.plan.inicio), b = X(f.plan.fin);
    const desde = el.scrollLeft, hasta = el.scrollLeft + visible;
    if (a >= desde + 20 && b <= hasta - 60) return;
    const destino = b - a < visible - 100 ? a - 40 : X(f.plan.actual?.ini || hoy) - visible * 0.3;
    el.scrollTo({ left: Math.max(0, destino), behavior: "smooth" });
    // Sólo cuando cambia la obra elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion]);

  const tip = (e, titulo, lineas) => {
    if (e.pointerType === "touch") return;
    onTip({ x: e.clientX, y: e.clientY, titulo, lineas });
  };
  const sinTip = () => onTip(null);

  let indice = 0;
  return (
    <div className="prd-gantt" ref={scrollRef} data-tour="obras-planta-gantt">
      <div className="prd-g-in" style={{ width: izq + W }}>
        <div className="prd-g-cab">
          <div className="prd-g-izq" style={{ width: izq }}>
            <span className="prd-g-cab-txt">{modo === "s0" ? "Obra · desde su desmolde" : "Obra · etapa de hoy"}</span>
            <span className="prd-zoom" role="group" aria-label="Escala del Gantt">
              {ZOOMS.map(([z, t, largo]) => <button key={z} type="button" className={zoom === z ? "on" : ""} onClick={() => onZoom(z)} title={largo}>{t}</button>)}
            </span>
          </div>
          <div className="prd-g-eje" style={{ width: W }}>
            {modo === "s0"
              ? escala.marcas.map((m) => (
                <div key={m.v} className={`prd-g-mes${m.s0 ? " s0" : ""}`} style={{ left: xEje(m.v) }}><span>{m.texto}</span></div>
              ))
              : escala.marcas.map((m) => (
                <div key={m.v} className={`prd-g-mes${m.anio ? " anio" : ""}`} style={{ left: xEje(m.v) }}>
                  <span>{zoom === 0 && !m.anio ? nombreMes(m.mes).slice(0, 1).toUpperCase() : nombreMes(m.mes)}{m.anio && <b>{m.y}</b>}</span>
                </div>
              ))}
            {escala.semanas.map((s) => <span key={s.v} className="prd-g-sem" style={{ left: xEje(s.v) }}>{s.texto}</span>)}
          </div>
        </div>

        <div className="prd-g-cuerpo">
          <div className="prd-g-grilla" style={{ left: izq, width: W }} aria-hidden="true">
            {escala.marcas.map((m) => <i key={m.v} className={m.s0 ? "s0" : ""} style={{ left: xEje(m.v) }} />)}
          </div>
          {modo === "cal" && (
            <div className="prd-g-hoy" style={{ left: izq + escala.x(hoy) }} aria-hidden="true">
              <span>Hoy {fCorta(hoy)}</span>
            </div>
          )}

          {grupos.map((g) => (
            <div key={g.clave}>
              {!focoObra && (
                <div className="prd-g-grupo" style={{ "--c": g.color || "var(--muted)" }}>
                  <div className="prd-g-izq" style={{ width: izq }}>
                    <span className="pto" />
                    <span className="nombre">{g.nombre}</span>
                    <span className="n mono">{g.filas.length}</span>
                  </div>
                  <div className="prd-g-pista" style={{ width: W }} />
                </div>
              )}
              {g.filas.map((f) => {
                const i = Math.min(indice++, 24);
                const { obra, plan, estado } = f;
                const sel = seleccion === obra.id;
                const abierta = expandida === obra.id;
                const ubicable = plan.etapas.length && (modo === "cal" || plan.s0);
                const X = (d) => (modo === "s0" ? escala.x(d, f) : escala.x(d));
                const sub = plan.sinPlantilla ? "La línea no tiene etapas cargadas"
                  : plan.sinFechas ? "Falta la fecha de desmolde"
                    : modo === "s0" && !plan.s0 ? "Sin desmolde: no se puede alinear"
                      : plan.actual ? plan.actual.nombre
                        : plan.fin <= hoy ? "Plan cumplido: debería estar terminada"
                          : `Arranca el ${fMedia(plan.inicio)}`;
                return (
                  <div key={obra.id}>
                    <div
                      className={`prd-g-fila${sel ? " sel" : ""}`}
                      style={{ "--i": i }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={abierta}
                      onClick={() => onSeleccionar(obra.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeleccionar(obra.id); } }}
                    >
                      <div className="prd-g-izq" style={{ width: izq }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="prd-g-l1">
                            <span className="prd-g-cod">{obra.codigo}</span>
                            <Estado tono={estado.tono}>{estado.texto}</Estado>
                          </div>
                          <div className="prd-g-l2" title={sub}>
                            {sub}{plan.enCursoPlan.length > 1 && <em>+{plan.enCursoPlan.length - 1}</em>}
                          </div>
                        </div>
                        <Anillo valor={plan.avance} tam={36} />
                      </div>
                      <div className="prd-g-pista" style={{ width: W }}>
                        {ubicable ? (
                          <>
                            <div
                              className={`prd-sobre${plan.tieneSugeridas ? " sug" : ""}`}
                              style={{ left: X(plan.inicio), width: Math.max(6, X(plan.fin) - X(plan.inicio)) }}
                              onPointerEnter={(e) => tip(e, obra.codigo, [
                                `${fMedia(plan.inicio)} → ${fMedia(plan.fin)}`,
                                plan.avance == null ? "Sin reportes de avance" : `${plan.avance}% de avance · ${plan.terminadas} de ${plan.etapas.length} etapas terminadas`,
                                plan.tieneSugeridas ? "Incluye etapas sin semana en la plantilla" : null,
                              ])}
                              onPointerMove={(e) => tip(e, obra.codigo, null)}
                              onPointerLeave={sinTip}
                            />
                            {plan.hechoHasta && <div className="prd-hecho" style={{ left: X(plan.inicio), width: Math.max(4, X(plan.hechoHasta) - X(plan.inicio)) }} />}
                            {plan.actual && (() => {
                              const ancho = Math.max(10, X(plan.actual.fin) - X(plan.actual.ini));
                              return (
                                <div
                                  className="prd-ahora"
                                  style={{ left: X(plan.actual.ini), width: ancho }}
                                  onPointerEnter={(e) => tip(e, plan.actual.nombre, [`${fMedia(plan.actual.ini)} → ${fMedia(plan.actual.fin)}`, "Etapa en la que debería estar hoy"])}
                                  onPointerMove={(e) => tip(e, plan.actual.nombre, null)}
                                  onPointerLeave={sinTip}
                                >
                                  {ancho > 80 ? plan.actual.nombre : ""}
                                </div>
                              );
                            })()}
                            {plan.s0 && <div className="prd-s0" style={{ left: X(plan.s0) }} title={`Desmolde ${fMedia(plan.s0)} (${plan.s0Fuente})`} />}
                            <div className="prd-fin" style={{ left: X(plan.fin) + 10 }}>fin {fMes(plan.fin)}</div>
                            {modo === "s0" && <div className="prd-hoy-pto" style={{ left: X(hoy) }} title="Hoy" />}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {abierta && ubicable && plan.etapas.map((e, j) => {
                      const clase = claseEtapa(e);
                      const izqBarra = X(e.ini);
                      const ancho = Math.max(6, X(e.fin) - izqBarra);
                      return (
                        <div
                          key={e.id}
                          className={`prd-g-sub${etapaSel === j ? " sel" : ""}`}
                          style={{ "--j": Math.min(j, 30) }}
                          role="button"
                          tabIndex={0}
                          onClick={() => onEtapa(obra.id, j)}
                          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEtapa(obra.id, j); } }}
                        >
                          <div className="prd-g-izq" style={{ width: izq }}>
                            <span className={`prd-nodo ${clase}`} />
                            <span className="nom" title={e.nombre}>{e.nombre}</span>
                            <span className="cnt">{e.total ? `${e.hechas}/${e.total}` : ""}</span>
                          </div>
                          <div className="prd-g-pista" style={{ width: W }}>
                            <div
                              className={`prd-barra-et ${clase}${e.sug && clase === "pendiente" ? " sug" : ""}`}
                              style={{ left: izqBarra, width: ancho }}
                              onPointerEnter={(ev) => tip(ev, e.nombre, [
                                `${e.offset != null ? semanaRel(e.offset) + " · " : ""}${fMedia(e.ini)} → ${fMedia(e.fin)}`,
                                e.estado === "completado" ? "Terminada" : e.estado === "en_curso" ? "En curso" : e.vencida ? "Ya debería estar terminada" : "Pendiente",
                                e.total ? `${e.hechas} de ${e.total} tareas` : null,
                                e.sug ? "Ubicación sugerida: sin semana en la plantilla" : null,
                              ])}
                              onPointerMove={(ev) => tip(ev, e.nombre, null)}
                              onPointerLeave={sinTip}
                            >
                              {e.estado !== "completado" && e.progreso > 0 && <span className="prog" style={{ width: `${Math.round(e.progreso * 100)}%` }} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
