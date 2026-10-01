import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Focus, Minimize2 } from "lucide-react";
import { Anillo, Estado, NodoEtapa } from "./ui";
import { TEXTO_ETAPA, claseEtapa } from "./plan";
import { MS_DIA, fCorta, fMedia, nombreMes, semanaRel } from "./formato";

// Gantt de todas las obras. Cada fila es la barra del barco, plan contra real:
// gris lo que falta, cian tenue lo que ya debería estar hecho y degradé lo que
// se reportó; rayitas finas entre etapas y el rombo del desmolde. La fecha de fin
// acompaña a la barra y, si la barra sale de pantalla, queda pegada al borde.
//
// Al elegir una obra se atenúan las demás y se despliegan sus etapas. Enfocar
// (botón o doble clic) deja sólo esa obra y ajusta la escala a su recorrido.
//
// modo "cal": eje de calendario. modo "s0": todas alineadas en su desmolde.

const PX_DIA = [1.15, 2.6, 6.2];
const ZOOMS = [[2, "Mes", "Ver por semanas"], [1, "Trim.", "Ver por trimestre"], [0, "Año", "Ver el año"]];
const DIA = (d) => d.getTime() / MS_DIA;

function lineasEtapa(e) {
  return [
    `${e.offset != null ? semanaRel(e.offset) + " · " : ""}${fMedia(e.ini)} → ${fMedia(e.fin)}`,
    claseEtapa(e) === "vencida" ? "Atrasada: ya debería estar terminada" : TEXTO_ETAPA[claseEtapa(e)],
    e.total ? `${e.hechas} de ${e.total} tareas` : null,
    e.sug ? "Ubicación sugerida: sin semana en la plantilla" : null,
  ];
}

export default function GanttPlanta({
  grupos, modo, zoom, hoy, izq, seleccion, expandida, etapaSel, focoObra,
  onSeleccionar, onEtapa, onTip, onZoom, onFoco,
}) {
  const scrollRef = useRef(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hoyD = DIA(hoy);
  const enFoco = !!(focoObra?.plan?.etapas.length && (modo === "cal" || focoObra.plan.s0));

  const escala = useMemo(() => {
    const filas = grupos.flatMap((g) => g.filas).filter((f) => f.plan.etapas.length);
    const ajustar = (min, max) => (ancho > izq + 200 ? Math.max(0.6, (ancho - izq - 24) / (max - min)) : PX_DIA[1]);
    if (modo === "s0") {
      const rel = (f, d) => DIA(d) - DIA(f.plan.s0);
      let min, max;
      if (enFoco) {
        min = rel(focoObra, focoObra.plan.inicio) - 12;
        max = rel(focoObra, focoObra.plan.fin) + 40;
      } else {
        const conS0 = filas.filter((f) => f.plan.s0);
        min = Math.max(Math.min(-120, ...conS0.map((f) => rel(f, f.plan.inicio))), -320) - 14;
        max = Math.min(Math.max(240, ...conS0.map((f) => rel(f, f.plan.fin))), 760) + 60;
      }
      const ppd = enFoco ? ajustar(min, max) : PX_DIA[zoom] ?? PX_DIA[1];
      const paso = ppd >= 5 ? 7 : ppd >= 2 ? 28 : 56;
      const marcas = [];
      for (let v = Math.ceil(min / paso) * paso; v < max; v += paso) marcas.push({ v, s0: v === 0, texto: v === 0 ? "S0 · desmolde" : semanaRel(v / 7) });
      return { min, max, ppd, marcas, semanas: [], x: (d, f) => (DIA(d) - DIA(f.plan.s0) - min) * ppd };
    }
    let min, max;
    if (enFoco) {
      min = DIA(focoObra.plan.inicio) - 12;
      max = DIA(focoObra.plan.fin) + 40;
    } else {
      min = Math.max(Math.min(hoyD - 150, ...filas.map((f) => DIA(f.plan.inicio))), hoyD - 560);
      max = Math.min(Math.max(hoyD + 210, ...filas.map((f) => DIA(f.plan.fin))), hoyD + 840) + 60;
      const desde = new Date(min * MS_DIA);
      min = DIA(new Date(desde.getFullYear(), desde.getMonth(), 1));
    }
    const ppd = enFoco ? ajustar(min, max) : PX_DIA[zoom] ?? PX_DIA[1];
    const desde = new Date(min * MS_DIA);
    const marcas = [];
    for (let d = new Date(desde.getFullYear(), desde.getMonth(), 1); DIA(d) < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      marcas.push({ v: DIA(d), anio: d.getMonth() === 0, mes: d.getMonth(), y: d.getFullYear() });
    }
    if (marcas.length) marcas[0].anio = true;
    const semanas = [];
    if (ppd >= 3.4) {
      const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
      for (; DIA(d) < max; d.setDate(d.getDate() + 7)) semanas.push({ v: DIA(d), texto: String(d.getDate()).padStart(2, "0") });
    }
    return { min, max, ppd, marcas, semanas, x: (d) => (DIA(d) - min) * ppd };
  }, [grupos, modo, zoom, hoyD, enFoco, focoObra, ancho, izq]);

  const W = Math.max(400, Math.round((escala.max - escala.min) * escala.ppd));
  const xEje = (v) => Math.round((v - escala.min) * escala.ppd);

  // Al entrar, al cambiar de modo o de zoom y al enfocar: se centra hoy (o el
  // desmolde, alineadas); enfocada, la obra entra entera desde el principio.
  const objetivo = enFoco ? 0 : modo === "s0" ? xEje(0) : escala.x(hoy);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const destino = enFoco ? 0 : Math.max(0, objetivo - (el.clientWidth - izq) * 0.34);
    el.scrollTo({ left: destino, behavior: el.dataset.listo ? "smooth" : "auto" });
    el.dataset.listo = "1";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, zoom, enFoco, focoObra?.obra?.id]);

  // Al elegir una obra se trae su recorrido a la vista (entero si entra; si no,
  // desde la etapa de hoy) y la fila baja o sube para que se vean sus etapas.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !seleccion || enFoco) return;
    const f = grupos.flatMap((g) => g.filas).find((x) => x.obra.id === seleccion);
    const destino = {};
    if (f?.plan?.etapas.length && (modo === "cal" || f.plan.s0)) {
      const X = (d) => (modo === "s0" ? escala.x(d, f) : escala.x(d));
      const visible = el.clientWidth - izq;
      const a = X(f.plan.inicio), b = X(f.plan.fin);
      if (a < el.scrollLeft + 20 || b > el.scrollLeft + visible - 90) {
        destino.left = Math.max(0, b - a < visible - 140 ? a - 40 : X(f.plan.actual?.ini || hoy) - visible * 0.3);
      }
    }
    const fila = el.querySelector(`[data-obra="${seleccion}"]`);
    if (fila) {
      const r = fila.getBoundingClientRect(), c = el.getBoundingClientRect();
      const arriba = r.top - c.top + el.scrollTop - 54;
      const alto = 62 + (f?.plan?.etapas.length || 0) * 36;
      if (r.top - c.top < 54 || r.top - c.top + Math.min(alto, c.height * 0.7) > c.height) destino.top = Math.max(0, arriba);
    }
    if (Object.keys(destino).length) el.scrollTo({ ...destino, behavior: "smooth" });
    // Sólo cuando cambia la obra elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion]);

  const irA = (x) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, x - (el.clientWidth - izq) * 0.5), behavior: "smooth" });
  };

  const tip = (e, titulo, lineas) => {
    if (e.pointerType === "touch") return;
    onTip({ x: e.clientX, y: e.clientY, titulo, lineas });
  };
  const sinTip = () => onTip(null);

  const hayCal = modo === "cal";
  const xHoy = hayCal ? escala.x(hoy) : null;
  const hoyVisible = xHoy != null && xHoy >= 0 && xHoy <= W;
  let indice = 0;

  return (
    <div className="prd-gantt" ref={scrollRef} data-tour="obras-planta-gantt" style={{ "--izq": `${izq}px` }}>
      <div className="prd-g-in" style={{ width: izq + W }}>
        <div className="prd-g-cab">
          <div className="prd-g-izq" style={{ width: izq }}>
            {enFoco ? (
              <>
                <span className="prd-g-cab-txt">Escala ajustada a {focoObra.obra.codigo}</span>
                <button type="button" className="prd-zoom-salir" onClick={() => onFoco(focoObra.obra.id)}>Ver todas</button>
              </>
            ) : (
              <>
                <span className="prd-g-cab-txt">{modo === "s0" ? "Obra · desde su desmolde" : "Obra · etapa de hoy"}</span>
                <span className="prd-zoom" role="group" aria-label="Escala del Gantt">
                  {ZOOMS.map(([z, t, largo]) => <button key={z} type="button" className={zoom === z ? "on" : ""} onClick={() => onZoom(z)} title={largo}>{t}</button>)}
                </span>
              </>
            )}
          </div>
          <div className={`prd-g-eje${escala.semanas.length ? " dos" : ""}`} style={{ width: W }}>
            {escala.marcas.map((m, k) => {
              // Enfocada, el primer mes suele empezar antes del borde: su nombre
              // queda igual al principio del eje.
              const x = xEje(m.v);
              const siguiente = escala.marcas[k + 1] ? xEje(escala.marcas[k + 1].v) : Infinity;
              if (x < 0 && siguiente < 70) return null;
              return (
              <div key={m.v} className={`prd-g-mes${m.anio ? " anio" : ""}${m.s0 ? " s0" : ""}${x < 0 ? " corte" : ""}`} style={{ left: Math.max(0, x) }}>
                <span>
                  {m.texto ?? (zoom === 0 && !enFoco && !m.anio ? nombreMes(m.mes).slice(0, 1).toUpperCase() : nombreMes(m.mes))}
                  {m.anio && m.texto == null && <b>{m.y}</b>}
                </span>
              </div>
              );
            })}
            {escala.semanas.map((s) => <span key={s.v} className="prd-g-sem" style={{ left: xEje(s.v) }}>{s.texto}</span>)}
            {hoyVisible && <span className="prd-g-hoy-cab" style={{ left: xHoy }}>Hoy {fCorta(hoy)}</span>}
          </div>
        </div>

        <div className={`prd-g-cuerpo${seleccion && !enFoco ? " hay-sel" : ""}${enFoco ? " foco" : ""}`}>
          <div className="prd-g-grilla" style={{ left: izq, width: W }} aria-hidden="true">
            {escala.marcas.map((m) => <i key={m.v} className={m.s0 ? "s0" : m.anio ? "anio" : ""} style={{ left: xEje(m.v) }} />)}
            {escala.ppd >= 5 && escala.semanas.map((s) => <i key={`s${s.v}`} className="sem" style={{ left: xEje(s.v) }} />)}
            {hoyVisible && <b className="prd-g-hoy" style={{ left: xHoy }} />}
          </div>

          {grupos.map((g) => (
            <div key={g.clave}>
              {!enFoco && (
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
                const ubicable = plan.etapas.length > 0 && (hayCal || plan.s0);
                const X = (d) => (modo === "s0" ? escala.x(d, f) : escala.x(d));
                const sub = plan.sinPlantilla ? "La línea no tiene etapas"
                  : plan.sinFechas ? "Falta la fecha de desmolde"
                    : modo === "s0" && !plan.s0 ? "Sin desmolde: no se puede alinear"
                      : plan.actual ? plan.actual.nombre
                        : plan.fin <= hoy ? "Plan cumplido"
                          : `Arranca el ${fMedia(plan.inicio)}`;
                return (
                  <div key={obra.id}>
                    <div
                      className={`prd-g-fila${sel ? " sel" : ""}`}
                      data-obra={obra.id}
                      style={{ "--i": i }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={abierta}
                      onClick={() => onSeleccionar(obra.id)}
                      onDoubleClick={() => onFoco(obra.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeleccionar(obra.id); }
                        if (e.key.toLowerCase() === "f" && sel) { e.preventDefault(); onFoco(obra.id); }
                      }}
                    >
                      <div className="prd-g-izq" style={{ width: izq }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="prd-g-l1">
                            <span className="prd-g-cod">{obra.codigo}</span>
                            <span title={estado.detalle}><Estado tono={estado.tono}>{estado.texto}</Estado></span>
                          </div>
                          <div className="prd-g-l2" title={sub}>
                            {sub}{plan.enCursoPlan.length > 1 && <em>+{plan.enCursoPlan.length - 1}</em>}
                          </div>
                        </div>
                        <span className="prd-g-der">
                          {sel && !enFoco && (
                            <button
                              type="button"
                              className={`prd-g-enfocar${enFoco ? " on" : ""}`}
                              onClick={(e) => { e.stopPropagation(); onFoco(obra.id); }}
                              title={enFoco ? "Ver todas las obras" : "Enfocar esta obra (o doble clic en la fila)"}
                            >
                              {enFoco ? <Minimize2 size={14} /> : <Focus size={14} />}
                              <span>{enFoco ? "Todas" : "Enfocar"}</span>
                            </button>
                          )}
                          {plan.reportada && <Anillo valor={plan.avance} tam={36} />}
                        </span>
                      </div>
                      <div className="prd-g-pista" style={{ width: W }}>
                        {ubicable && (
                          <PistaObra
                            f={f} X={X} i={i} hoy={hoy} tip={tip} sinTip={sinTip} irA={irA}
                          />
                        )}
                      </div>
                    </div>

                    {abierta && ubicable && plan.etapas.map((e, j) => {
                      const clase = claseEtapa(e);
                      const izqBarra = X(e.ini);
                      const ancho = Math.max(8, X(e.fin) - izqBarra);
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
                            <NodoEtapa clase={clase} tam={16} />
                            <span className="nom" title={e.nombre}>{e.nombre}</span>
                            <span className="cnt">{e.total ? `${e.hechas}/${e.total}` : ""}</span>
                          </div>
                          <div className="prd-g-pista" style={{ width: W }}>
                            <div
                              className={`prd-barra-et ${clase}${e.sug ? " sug" : ""}`}
                              style={{ left: izqBarra, width: ancho }}
                              onPointerEnter={(ev) => tip(ev, e.nombre, lineasEtapa(e))}
                              onPointerMove={(ev) => tip(ev, e.nombre, null)}
                              onPointerLeave={sinTip}
                            >
                              {e.estado !== "completado" && e.progreso > 0 && <span className="prog" style={{ width: `${Math.round(e.progreso * 100)}%` }} />}
                              {ancho > 70 && <span className="txt">{e.nombre}</span>}
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

// Barra de una obra en su fila: plan contra real.
//   gris          lo que falta según el plan
//   cian tenue    lo que ya debería estar hecho (del inicio a hoy)
//   degradé       lo que se reportó hecho; la diferencia con el cian es el atraso
// Las rayitas finas separan las etapas; el rombo es el desmolde. Al pasar el
// mouse se ve la etapa que cae en ese punto.
function PistaObra({ f, X, i, hoy, tip, sinTip, irA }) {
  const { obra, plan } = f;
  const a = X(plan.inicio), b = X(plan.fin);
  const largo = Math.max(8, b - a);
  const tHoy = Math.min(Math.max(X(hoy), a), a + largo) - a;
  const hecho = plan.hechoHasta ? Math.max(4, X(plan.hechoHasta) - a) : 0;
  // Separadores en el inicio de cada etapa (sin amontonarlos).
  const cortes = useMemo(() => {
    const xs = [...new Set(plan.etapas.map((e) => Math.round(X(e.ini) - a)))].filter((x) => x > 3 && x < largo - 3).sort((p, q) => p - q);
    const quedan = [];
    xs.forEach((x) => { if (!quedan.length || x - quedan[quedan.length - 1] >= 7) quedan.push(x); });
    return quedan;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.etapas, a, largo]);

  const aFecha = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (ev.clientX - r.left) / Math.max(1, r.width)));
    return new Date(plan.inicio.getTime() + (plan.fin.getTime() - plan.inicio.getTime()) * k);
  };
  const mostrar = (ev) => {
    if (ev.pointerType === "touch") return;
    const d = aFecha(ev);
    const ahi = plan.etapas.filter((e) => e.ini <= d && d < e.fin).sort((p, q) => (p.estado === "completado") - (q.estado === "completado") || q.ini - p.ini);
    const e = ahi[0];
    if (!e) { tip(ev, obra.codigo, [`${fMedia(plan.inicio)} → ${fMedia(plan.fin)}`]); return; }
    tip(ev, e.nombre, [
      ...lineasEtapa(e),
      ahi.length > 1 ? `También: ${ahi.slice(1, 3).map((x) => x.nombre).join(", ")}${ahi.length > 3 ? "…" : ""}` : null,
    ]);
  };

  return (
    <>
      <div
        className={`prd-barra-o${plan.tieneSugeridas ? " sug" : ""}`}
        style={{ left: a, width: largo, "--i": i }}
        onPointerMove={mostrar}
        onPointerLeave={sinTip}
      >
        {tHoy > 0 && <span className="esperado" style={{ width: tHoy }} />}
        {hecho > 0 && <span className="hecho" style={{ width: Math.min(hecho, largo) }} />}
        {cortes.map((x) => <i key={x} style={{ left: x }} />)}
      </div>
      {plan.s0 && <span className="prd-hito" style={{ left: X(plan.s0), "--i": i }} title={`Desmolde ${fMedia(plan.s0)} (${plan.s0Fuente})`} />}
      {/* La fecha de fin sigue a la barra; si la barra quedó atrás, se pega al
          borde izquierdo. Si la barra está más adelante, la de inicio aparece
          pegada al borde derecho (y en las obras que todavía no arrancan, siempre). */}
      <span className="prd-fin-caja" style={{ left: a + largo + 10 }}>
        <span className="prd-pegado izq">
          <button type="button" className="prd-fin" onClick={(e) => { e.stopPropagation(); irA(b); }} title="Ir al final del plan">
            {fMedia(plan.fin)}
          </button>
        </span>
      </span>
      <span className="prd-ini-caja" style={{ width: Math.max(0, a - 10) }}>
        <span className={`prd-pegado der${plan.inicio > hoy ? " siempre" : ""}`}>
          <button type="button" className="prd-fin" onClick={(e) => { e.stopPropagation(); irA(a); }} title="Ir al inicio del plan">
            {plan.inicio > hoy ? "arranca " : ""}{fMedia(plan.inicio)}
          </button>
        </span>
      </span>
    </>
  );
}
