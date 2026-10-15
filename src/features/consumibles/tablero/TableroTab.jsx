import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, RefreshCw } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { EmptyState } from "@/components/ui/motion";
import { SEDES, fmtCantidad, fmtPesos } from "@/features/consumibles/api";
import { unidadEnTexto } from "../conteo/conteoCalculos";
import { fetchDatosTablero } from "./tableroApi";
import { construirTablero, datosFila, diaArgentina, moverDia, ranking, resolverPeriodo } from "./tableroCore";

const PERIODOS = [["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["rango", "Rango"]];
const DIMENSIONES = [["obra", "Por obra"], ["sector", "Por sector"], ["persona", "Por persona"], ["rubro", "Por rubro"]];
const CORTO = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const fecha = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
const fechaCompleta = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
const acortar = (s) => s.length > 17 ? `${s.slice(0, 16)}…` : s;
const pct = (n) => `${fmtCantidad(n)} %`;

/** El tablero sólo lee el registro; los costos de hoy no revalorizan el pasado. */
export default function TableroTab({ sede }) {
  const [periodo, setPeriodo] = useState("7");
  const [rango, setRango] = useState(() => ({ desde: moverDia(diaArgentina(), -6), hasta: diaArgentina() }));
  const [sedeElegida, setSedeElegida] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [metricaElegida, setMetricaElegida] = useState(null);
  const [unidadElegida, setUnidadElegida] = useState("");
  const filtroSede = sedeElegida ?? sede;
  const fechas = resolverPeriodo(periodo, rango);
  const { desde, hasta } = fechas;
  const clave = `${filtroSede}|${desde}|${hasta}|${recarga}`;
  const [carga, setCarga] = useState({ clave: null, datos: null, error: null });

  useEffect(() => {
    if (!desde || !hasta) return undefined;
    const controller = new AbortController();
    fetchDatosTablero({ sede: filtroSede === "todas" ? null : filtroSede, desde, hasta, signal: controller.signal }).then(
      (datos) => { if (!controller.signal.aborted) setCarga({ clave, datos, error: null }); },
      (error) => { if (!controller.signal.aborted) setCarga({ clave, datos: null, error }); },
    );
    return () => controller.abort();
  }, [clave, filtroSede, desde, hasta]);

  const datos = carga.clave === clave ? carga.datos : null;
  const error = carga.clave === clave ? carga.error : null;
  const resumen = useMemo(() => datos && construirTablero({ ...datos, inicio: fechas.inicio, fin: fechas.fin }), [datos, fechas.inicio, fechas.fin]);
  const cargando = !fechas.error && !datos && !error;
  const unidades = resumen?.totales.porUnidad.map(([u]) => u) ?? [];
  const unidad = unidades.includes(unidadElegida) ? unidadElegida : unidades[0] ?? "unidad";
  // Al arrancar habrá retiros sin precio. Cantidades sigue dando un ranking
  // útil sin mostrar una fila de ceros como si el consumo fuera gratis.
  const metrica = metricaElegida ?? (resumen?.totales.conCosto ? "pesos" : "cantidad");

  return (
    <div className="cns-tab-root">
      <style>{CSS}</style>
      <div className="cns-tab-toolbar ui-card">
        <div className="cns-tab-periodos" role="group" aria-label="Período del tablero">
          {PERIODOS.map(([key, label]) => <button type="button" key={key} aria-pressed={periodo === key} onClick={() => setPeriodo(key)}>{label}</button>)}
        </div>
        <label className="cns-tab-campo"><span>Sede del tablero</span>
          <select className="ui-input" value={filtroSede} onChange={(e) => setSedeElegida(e.target.value)}>
            {SEDES.map((s) => <option key={s} value={s}>{s}</option>)}<option value="todas">Todas las sedes</option>
          </select>
        </label>
        <button type="button" className="ui-btn" disabled={cargando || !!fechas.error} onClick={() => setRecarga((n) => n + 1)}><RefreshCw size={15} /> Actualizar</button>
        {periodo === "rango" && <div className="cns-tab-rango">
          <label className="cns-tab-campo"><span>Desde</span><input type="date" className="ui-input" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} /></label>
          <label className="cns-tab-campo"><span>Hasta, inclusive</span><input type="date" className="ui-input" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} /></label>
        </div>}
      </div>
      {fechas.error ? <p className="cns-tab-aviso is-error" role="alert">{fechas.error}</p>
        : error ? <div className="cns-tab-aviso is-error" role="alert">No se pudo traer el tablero: {error.message || String(error)}. Usá Actualizar para reintentar.</div>
          : cargando ? <Cargando texto="Armando el tablero…" />
            : resumen && <>
              <p className="cns-tab-contexto">Del {fechaCompleta(desde).split(",")[0]} al {fechaCompleta(`${fechas.fin}T12:00:00-03:00`).split(",")[0]} · hora argentina. Consumo de retiros, valorizado sin IVA al costo registrado en cada fila.</p>
              <div className="cns-tab-kpis">
                <div className="ui-card cns-tab-kpi"><span>Consumo en pesos{resumen.totales.sinCosto > 0 && " · parcial"}</span>
                  <strong>{resumen.totales.conCosto ? fmtPesos(resumen.totales.pesos) : resumen.retiros ? "Sin costos" : fmtPesos(0)}</strong>
                  <small>{resumen.totales.sinCosto > 0 ? `${fmtCantidad(resumen.totales.sinCosto)} filas de retiro sin costo registrado.` : "Costo congelado al retirar."}</small>
                </div>
                <div className="ui-card cns-tab-kpi"><span>Cantidad entregada</span><Cantidades filas={resumen.totales.porUnidad} vacio="Sin retiros" /><small>Cada unidad de entrega se suma por separado.</small></div>
                <div className="ui-card cns-tab-kpi"><span>Visitas al pañol</span><strong>{fmtCantidad(resumen.viajes)}</strong><small>Un retiro por persona, día y sede; los artículos y obras repartidas cuentan como una sola visita.</small></div>
              </div>
              {resumen.sinLote > 0 && <p className="cns-tab-aviso">Hay {fmtCantidad(resumen.sinLote)} filas sin lote ni solicitud: se cuenta cada fila como una visita. El total puede quedar sobreestimado.</p>}
              {!resumen.retiros && <EmptyState icon={BarChart3} title="Todavía no hay retiros en este período" subtitle="Cuando registres las primeras entregas, acá vas a ver el consumo y las visitas al pañol. Probá otra sede o ampliá el período." />}
              {resumen.retiros > 0 && <>
                <section aria-label="Rankings de consumo">
                  <div className="cns-tab-seccion"><div><h2>Consumo</h2><p>Compará por obra, sector, persona y rubro.</p></div>
                    <div className="cns-tab-metricas"><div className="cns-tab-periodos" role="group" aria-label="Medida del ranking">
                      <button type="button" aria-pressed={metrica === "pesos"} onClick={() => setMetricaElegida("pesos")}>Pesos</button>
                      <button type="button" aria-pressed={metrica === "cantidad"} onClick={() => setMetricaElegida("cantidad")}>Cantidad</button>
                    </div>{metrica === "cantidad" && <select aria-label="Unidad del ranking" className="ui-input" value={unidad} onChange={(e) => setUnidadElegida(e.target.value)}>{unidades.map((u) => <option key={u} value={u}>{u}</option>)}</select>}</div>
                  </div>
                  {metrica === "pesos" && resumen.totales.sinCosto > 0 && <p className="cns-tab-contexto">Los importes con «+» tienen filas sin costo y muestran sólo el valor conocido.</p>}
                  <div className="cns-tab-grid">{DIMENSIONES.map(([key, titulo]) => <Ranking key={key} titulo={titulo} grupos={ranking(resumen.grupos[key], metrica, unidad)} metrica={metrica} unidad={unidad} />)}</div>
                </section>
                <section aria-label="Planificado y mostrador">
                  <div className="cns-tab-seccion"><div><h2>Planificado y mostrador</h2><p>Proporción de retiros distintos. Cada retiro se cuenta una vez por sector y carril.</p></div></div>
                  {resumen.otrosCarriles > 0 && <p className="cns-tab-contexto">Quedan fuera de esta comparación {fmtCantidad(resumen.otrosCarriles)} retiros de punto de sector o sin carril.</p>}
                  <div className="cns-tab-grid"><Panel titulo="Por sector"><Carriles filas={resumen.sectores} /></Panel><Panel titulo="Evolución por día"><Carriles filas={resumen.dias} diario /></Panel></div>
                </section>
                <Panel titulo="Frecuencia de retiro" detalle="Qué sale seguido y cada cuánto, contado sobre los días con retiros. Lo que sale todos los días conviene pedirlo en la solicitud del día anterior."><Frecuencia frecuencia={resumen.frecuencia} personas={resumen.personas} /></Panel>
                <Panel titulo="Externos por empresa" detalle="Herreros, vidrieros y otros que no son del astillero. Lo que se llevan va como costo de la obra; acá se suma por empresa por si corresponde descontarlo."><Externos filas={resumen.externos} /></Panel>
                <Panel titulo="Retiros a revisar" detalle="Se agrupa cada consumible de un retiro, aunque su cantidad esté repartida entre obras."><Incidencias fueraCupo={resumen.fueraCupo} sinUsado={resumen.sinUsado} /></Panel>
              </>}
              <Panel titulo="Mermas de conteo" detalle="Diferencias negativas de inventario después del primer conteo de cada producto y sede."><Mermas filas={resumen.mermas} resumen={resumen.resumenMermas} conteos={resumen.conteosPeriodo} /></Panel>
              <p className="cns-tab-contexto">Rubro y unidad de entrega corresponden a la ficha actual del consumible. Los movimientos anulados se excluyen del tablero.</p>
            </>}
    </div>
  );
}

function Panel({ titulo, detalle, children }) {
  return <section className="ui-card cns-tab-panel"><header><h3>{titulo}</h3>{detalle && <p>{detalle}</p>}</header>{children}</section>;
}

function Cantidades({ filas, vacio = "—" }) {
  return filas.length ? <ul className="cns-tab-cantidades">{filas.map(([unidad, cantidad]) => <li key={unidad}><b>{fmtCantidad(cantidad)}</b> {unidad}</li>)}</ul> : <strong>{vacio}</strong>;
}

function ValorRanking({ x, y, width, height, value, metrica, sinCosto }) {
  const texto = metrica === "pesos" && value === 0 && sinCosto ? "Sin costo" : `${metrica === "pesos" ? "$ " : ""}${CORTO.format(value)}${metrica === "pesos" && sinCosto ? "+" : ""}`;
  return <text x={x + width + 7} y={y + height / 2} dominantBaseline="central" fill="var(--text)" fontFamily="'JetBrains Mono', monospace" fontSize={11}>{texto}</text>;
}

function DetalleRanking({ active, payload, metrica, unidad }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return <div className="cns-tab-tooltip"><b>{fila.nombre}</b><span>{metrica === "pesos" ? fila.valor === 0 && fila.sinCosto ? "Sin costo registrado" : fmtPesos(fila.valor) : `${fmtCantidad(fila.valor)} ${unidad}`}</span>{metrica === "pesos" && fila.sinCosto > 0 && <small>Importe parcial: falta costo en parte del retiro.</small>}</div>;
}

function Ranking({ titulo, grupos, metrica, unidad }) {
  const [tabla, setTabla] = useState(false);
  const visibles = grupos.slice(0, 8);
  return <Panel titulo={titulo} detalle={metrica === "pesos" ? "Pesos sin IVA" : `Cantidad en ${unidad}`}>
    {!grupos.length ? <p className="cns-tab-vacio">No hay consumo para esta unidad.</p> : <>
      {tabla ? <ul className="cns-tab-ranking-lista">{grupos.map((g) => <li key={g.id}><span>{g.nombre}</span><b>{metrica === "pesos" ? g.valor === 0 && g.sinCosto ? "Sin costo" : `${fmtPesos(g.valor)}${g.sinCosto ? "+" : ""}` : fmtCantidad(g.valor)}</b></li>)}</ul>
        : <div className="cns-tab-grafico" style={{ height: Math.max(100, visibles.length * 40 + 10) }}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={visibles} layout="vertical" margin={{ top: 6, right: 90, bottom: 6, left: 4 }} accessibilityLayer>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="nombre" width={105} tickFormatter={acortar} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip content={<DetalleRanking metrica={metrica} unidad={unidad} />} cursor={{ fill: "var(--panel-2)" }} />
            <Bar dataKey="valor" fill="var(--blue)" barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}><LabelList dataKey="valor" content={(props) => <ValorRanking {...props} metrica={metrica} sinCosto={visibles[props.index]?.sinCosto} />} /></Bar>
          </BarChart>
        </ResponsiveContainer></div>}
      <button type="button" className="ui-btn ui-btn-fantasma cns-tab-ver" onClick={() => setTabla((v) => !v)}>{tabla ? "Ver gráfico" : grupos.length > 8 ? "Ver el ranking completo" : "Ver nombres y valores completos"}</button>
    </>}
  </Panel>;
}

function DetalleCarril({ active, payload, diario }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return <div className="cns-tab-tooltip"><b>{diario ? fecha(fila.nombre) : fila.nombre}</b><span>Planificado: {fmtCantidad(fila.planificado)} · {pct(fila.planificadoPct)}</span><span>Mostrador: {fmtCantidad(fila.mostrador)} · {pct(fila.mostradorPct)}</span></div>;
}

function Carriles({ filas, diario = false }) {
  const [tabla, setTabla] = useState(false);
  if (!filas.some((f) => f.total > 0)) return <p className="cns-tab-vacio">Todavía no hay retiros planificados ni de mostrador en este período.</p>;
  const visibles = diario ? filas : filas.slice(0, 10);
  return <>
    <div className="cns-tab-leyenda"><span><i style={{ background: "var(--blue)" }} />Planificado</span><span><i style={{ background: "var(--cyan)" }} />Mostrador</span></div>
    {tabla ? <div className="cns-tab-tabla-wrap"><table className="cns-tab-tabla"><thead><tr><th>{diario ? "Día" : "Sector"}</th><th>Planificado</th><th>Mostrador</th></tr></thead><tbody>{filas.map((f) => <tr key={f.id}><td>{diario ? fecha(f.nombre) : f.nombre}</td><td>{f.total ? pct(f.planificadoPct) : "Sin retiros"}</td><td>{f.total ? pct(f.mostradorPct) : "—"}</td></tr>)}</tbody></table></div>
      : <div className="cns-tab-grafico" style={{ height: diario ? 240 : Math.max(130, visibles.length * 38 + 24) }}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={visibles} layout={diario ? "horizontal" : "vertical"} margin={{ top: 10, right: 14, bottom: 6, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" horizontal={diario} vertical={!diario} />
          {diario ? <><XAxis dataKey="nombre" tickFormatter={fecha} interval="preserveStartEnd" minTickGap={24} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} ticks={[0, 50, 100]} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} /></>
            : <><XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} ticks={[0, 50, 100]} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="nombre" width={105} tickFormatter={acortar} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} /></>}
          <Tooltip content={<DetalleCarril diario={diario} />} cursor={{ fill: "var(--panel-2)" }} />
          <Bar dataKey="planificadoPct" name="Planificado" stackId="carriles" fill="var(--blue)" maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="mostradorPct" name="Mostrador" stackId="carriles" fill="var(--cyan)" maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer></div>}
    {diario && <p className="cns-tab-contexto cns-tab-interno">Los días sin retiros quedan en blanco.</p>}
    <button type="button" className="ui-btn ui-btn-fantasma cns-tab-ver" onClick={() => setTabla((v) => !v)}>{tabla ? "Ver gráfico" : "Ver proporciones completas"}</button>
  </>;
}

const RITMO = { diario: "Casi todos los días", seguido: "Seguido", "a veces": "A veces" };

function Frecuencia({ frecuencia, personas }) {
  const [vista, setVista] = useState("productos");
  const [todas, setTodas] = useState(false);
  const { diasActivos, productos } = frecuencia;
  const lista = vista === "productos" ? productos : personas;
  return <>
    <div className="cns-tab-periodos cns-tab-interno" role="group" aria-label="Frecuencia por">
      <button type="button" aria-pressed={vista === "productos"} onClick={() => { setVista("productos"); setTodas(false); }}>Por producto</button>
      <button type="button" aria-pressed={vista === "personas"} onClick={() => { setVista("personas"); setTodas(false); }}>Visitas por persona</button>
    </div>
    {vista === "productos" && <p className="cns-tab-contexto cns-tab-interno">{diasActivos < 3 ? `Con ${fmtCantidad(diasActivos)} ${diasActivos === 1 ? "día" : "días"} de retiros todavía no hay ritmo: ampliá el período.` : `${fmtCantidad(diasActivos)} días con retiros en el período.`}</p>}
    <div className="cns-tab-viajes">
      {vista === "productos"
        ? (todas ? productos : productos.slice(0, 10)).map((p) => <div key={p.id} className="cns-tab-frec">
          <div><span>{p.nombre}</span><small>Salió {fmtCantidad(p.dias)} de {fmtCantidad(diasActivos)} {diasActivos === 1 ? "día" : "días"} · {fmtCantidad(p.veces)} {p.veces === 1 ? "vez" : "veces"} · {fmtCantidad(Math.round(p.porVez * 10) / 10)} {unidadEnTexto(p.unidad, Math.round(p.porVez * 10) / 10)} por vez · {fmtCantidad(p.personas)} {p.personas === 1 ? "persona" : "personas"}</small></div>
          {p.ritmo && <em data-ritmo={p.ritmo}>{RITMO[p.ritmo]}</em>}
        </div>)
        : (todas ? personas : personas.slice(0, 10)).map((p) => <details key={p.id} className="cns-tab-persona"><summary><span>{p.nombre}</span><b>{fmtCantidad(p.total)} {p.total === 1 ? "visita" : "visitas"} en {fmtCantidad(Object.keys(p.dias).length)} {Object.keys(p.dias).length === 1 ? "día" : "días"}</b></summary><ul>{Object.entries(p.dias).sort(([a], [b]) => b.localeCompare(a)).map(([dia, n]) => <li key={dia}><span>{fecha(dia)}</span><b>{fmtCantidad(n)} {n === 1 ? "visita" : "visitas"}</b></li>)}</ul></details>)}
      {lista.length > 10 && <button type="button" className="ui-btn ui-btn-fantasma cns-tab-ver" onClick={() => setTodas((v) => !v)}>{todas ? "Ver los primeros 10" : `Ver ${vista === "productos" ? "todos los productos" : "todas las personas"} (${fmtCantidad(lista.length)})`}</button>}
    </div>
  </>;
}

function Externos({ filas }) {
  if (!filas.length) return <p className="cns-tab-vacio">En este período no retiró ningún externo.</p>;
  return <ul className="cns-tab-eventos">{filas.map((g) => <li key={g.id}><div><b>{g.nombre}</b><small>{fmtCantidad(g.viajes)} {g.viajes === 1 ? "retiro" : "retiros"} · {fmtCantidad(g.personas)} {g.personas === 1 ? "persona" : "personas"} · {g.obras.join(", ")}</small><small>{g.porUnidad.map(([u, c]) => `${fmtCantidad(c)} ${u}`).join(" · ")}</small></div><strong>{g.pesos || !g.sinCosto ? `${fmtPesos(g.pesos)}${g.sinCosto ? "+" : ""}` : "Sin costo"}<small>sin IVA</small></strong></li>)}</ul>;
}

function Incidencias({ fueraCupo, sinUsado }) {
  const [tipo, setTipo] = useState("cupo");
  const [todas, setTodas] = useState(false);
  const filas = tipo === "cupo" ? fueraCupo : sinUsado;
  return <>
    <div className="cns-tab-periodos cns-tab-interno" role="group" aria-label="Incidencias">
      <button type="button" aria-pressed={tipo === "cupo"} onClick={() => { setTipo("cupo"); setTodas(false); }}>Fuera de cupo <b>{fmtCantidad(fueraCupo.length)}</b></button>
      <button type="button" aria-pressed={tipo === "canje"} onClick={() => { setTipo("canje"); setTodas(false); }}>Canjes sin usado <b>{fmtCantidad(sinUsado.length)}</b></button>
    </div>
    {!filas.length ? <p className="cns-tab-vacio">{tipo === "cupo" ? "No hay retiros fuera de cupo en este período." : "No hay canjes sin usado en este período."}</p>
      : <ul className="cns-tab-eventos">{(todas ? filas : filas.slice(0, 10)).map((f) => <li key={f.id}><div><b>{f.persona}</b><span>{f.material}</span><small>{fechaCompleta(f.fecha)} · {f.sede} · {[...f.obras].join(", ")}</small>{tipo === "cupo" && <small>Autorizó: {[...f.autorizaciones].join(", ")}</small>}</div><strong>{fmtCantidad(f.cantidad)}<small>{f.unidad}</small></strong></li>)}</ul>}
    {filas.length > 10 && <button type="button" className="ui-btn ui-btn-fantasma cns-tab-ver" onClick={() => setTodas((v) => !v)}>{todas ? "Ver las últimas incidencias" : "Ver todas las incidencias"}</button>}
  </>;
}

function Mermas({ filas, resumen, conteos }) {
  const [todas, setTodas] = useState(false);
  if (!filas.length) return <p className="cns-tab-vacio">{conteos ? "Los conteos del período no registraron diferencias negativas después del inventario inicial." : "Todavía no hay conteos en este período. Las diferencias aparecen después del primer conteo."}</p>;
  return <>
    <div className="cns-tab-mermas-resumen"><div><span>Valor de las diferencias{resumen.sinCosto > 0 && " · parcial"}</span><strong>{resumen.conCosto ? fmtPesos(resumen.pesos) : "Sin costos"}</strong>{resumen.sinCosto > 0 && <small>{fmtCantidad(resumen.sinCosto)} diferencias sin costo registrado.</small>}</div><Cantidades filas={resumen.porUnidad} /></div>
    <ul className="cns-tab-eventos">{(todas ? filas : filas.slice(0, 10)).map((m) => { const f = datosFila(m); return <li key={m.id}><div><b>{f.material}</b><small>{fechaCompleta(m.created_at)} · {m.sede}</small><small>Contado: {fmtCantidad(m.contado)} · teórico: {fmtCantidad(m.teorico)} {f.unidad}</small></div><strong>−{fmtCantidad(f.cantidad)}<small>{f.unidad}</small></strong></li>; })}</ul>
    {filas.length > 10 && <button type="button" className="ui-btn ui-btn-fantasma cns-tab-ver" onClick={() => setTodas((v) => !v)}>{todas ? "Ver las últimas diferencias" : "Ver todas las diferencias"}</button>}
  </>;
}

const CSS = `
  .cns-tab-root { max-width: 1400px; margin: 0 auto; padding: 20px 24px 36px; display: flex; flex-direction: column; gap: 18px; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); min-width: 0; }
  .cns-tab-root .cns-tab-toolbar { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; padding: 14px; }
  .cns-tab-root .cns-tab-periodos { display: inline-flex; max-width: 100%; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap; border: 1px solid var(--border); border-radius: 10px; padding: 3px; background: var(--panel); }
  .cns-tab-root .cns-tab-periodos button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex-shrink: 0; border: 0; border-radius: 7px; min-height: 38px; padding: 0 12px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; white-space: nowrap; }
  .cns-tab-root .cns-tab-periodos button[aria-pressed="true"] { background: var(--blue-soft); color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue-border); font-weight: 600; }
  .cns-tab-root .cns-tab-periodos b { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .cns-tab-root .cns-tab-campo { display: flex; flex-direction: column; gap: 5px; flex: 1 1 160px; min-width: 0; font-size: 12px; color: var(--muted); }
  .cns-tab-root .cns-tab-campo .ui-input { min-width: 0; width: 100%; }
  .cns-tab-root .cns-tab-rango { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .cns-tab-root .cns-tab-aviso { margin: 0; padding: 12px 14px; background: var(--violet-soft); border: 1px solid var(--violet-border); border-radius: 12px; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-aviso.is-error { background: var(--red-soft); border-color: var(--red-border); }
  .cns-tab-root .cns-tab-contexto { margin: 0; color: var(--dim); font-size: 12px; line-height: 1.5; }
  .cns-tab-root .cns-tab-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .cns-tab-root .cns-tab-kpi { padding: 18px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .cns-tab-root .cns-tab-kpi > span { color: var(--muted); font-size: 13px; }
  .cns-tab-root .cns-tab-kpi > strong { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(20px, 2vw, 27px); overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-kpi > small { color: var(--dim); font-size: 12px; line-height: 1.5; }
  .cns-tab-root .cns-tab-cantidades { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 13px; }
  .cns-tab-root .cns-tab-cantidades b { font-family: 'JetBrains Mono', monospace; color: var(--text); font-size: 18px; font-weight: 600; }
  .cns-tab-root .cns-tab-seccion { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
  .cns-tab-root .cns-tab-seccion h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; }
  .cns-tab-root .cns-tab-seccion p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .cns-tab-root .cns-tab-metricas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; max-width: 100%; }
  .cns-tab-root .cns-tab-metricas select { width: auto; max-width: 180px; }
  .cns-tab-root .cns-tab-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .cns-tab-root .cns-tab-panel { min-width: 0; overflow: hidden; background: var(--panel-solid); box-shadow: var(--elev-1); }
  .cns-tab-root .cns-tab-panel > header { padding: 16px; border-bottom: 1px solid var(--border); }
  .cns-tab-root .cns-tab-panel h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .cns-tab-root .cns-tab-panel header p { margin: 5px 0 0; font-size: 12px; color: var(--dim); line-height: 1.5; }
  .cns-tab-root .cns-tab-grafico { width: 100%; min-width: 0; margin: 8px 0; }
  .cns-tab-root .cns-tab-tooltip { padding: 10px 12px; background: var(--panel-solid); border: 1px solid var(--border-2); border-radius: 10px; box-shadow: var(--elev-2); max-width: 260px; display: flex; flex-direction: column; gap: 5px; color: var(--text); font-size: 12px; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-tooltip b { font-weight: 600; }
  .cns-tab-root .cns-tab-tooltip span { font-family: 'JetBrains Mono', monospace; }
  .cns-tab-root .cns-tab-tooltip small { color: var(--muted); }
  .cns-tab-root .cns-tab-ver { margin: 6px 8px 10px; font-size: 12px; min-height: 38px; }
  .cns-tab-root .cns-tab-ranking-lista { list-style: none; padding: 0 16px; margin: 8px 0; }
  .cns-tab-root .cns-tab-ranking-lista li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .cns-tab-root .cns-tab-ranking-lista span { overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-ranking-lista b { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .cns-tab-root .cns-tab-leyenda { display: flex; gap: 16px; padding: 12px 16px 0; font-size: 12px; color: var(--muted); }
  .cns-tab-root .cns-tab-leyenda span { display: inline-flex; align-items: center; gap: 6px; }
  .cns-tab-root .cns-tab-leyenda i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; }
  .cns-tab-root .cns-tab-interno { margin: 12px 14px; max-width: calc(100% - 28px); }
  .cns-tab-root .cns-tab-tabla-wrap { padding: 8px 12px; }
  .cns-tab-root .cns-tab-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
  .cns-tab-root .cns-tab-tabla th, .cns-tab-root .cns-tab-tabla td { padding: 10px 5px; border-bottom: 1px solid var(--border); text-align: right; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-tabla th { color: var(--muted); font-weight: 500; }
  .cns-tab-root .cns-tab-tabla th:first-child, .cns-tab-root .cns-tab-tabla td:first-child { text-align: left; }
  .cns-tab-root .cns-tab-tabla td:not(:first-child) { font-family: 'JetBrains Mono', monospace; }
  .cns-tab-root .cns-tab-vacio { padding: 30px 18px; text-align: center; color: var(--dim); font-size: 13px; line-height: 1.5; margin: 0; }
  .cns-tab-root .cns-tab-persona { border-bottom: 1px solid var(--border); padding: 0 16px; }
  .cns-tab-root .cns-tab-persona summary { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; font-size: 14px; cursor: pointer; }
  .cns-tab-root .cns-tab-persona summary span { min-width: 0; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-persona summary span::before { content: '›'; color: var(--blue); margin-right: 8px; }
  .cns-tab-root .cns-tab-persona[open] summary span::before { content: '⌄'; }
  .cns-tab-root .cns-tab-persona b { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500; white-space: nowrap; }
  .cns-tab-root .cns-tab-persona ul { list-style: none; padding: 0 0 10px 18px; margin: 0; }
  .cns-tab-root .cns-tab-persona li { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; padding: 6px 0; }
  .cns-tab-root .cns-tab-frec { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .cns-tab-root .cns-tab-frec > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .cns-tab-root .cns-tab-frec span { font-size: 14px; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-frec small { font-size: 12px; color: var(--dim); line-height: 1.4; }
  .cns-tab-root .cns-tab-frec em { font-style: normal; font-size: 11.5px; font-weight: 600; white-space: nowrap; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-2); color: var(--muted); background: var(--panel); }
  .cns-tab-root .cns-tab-frec em[data-ritmo="diario"] { color: var(--blue); background: var(--blue-soft); border-color: var(--blue-border); }
  .cns-tab-root .cns-tab-frec em[data-ritmo="seguido"] { color: var(--cyan); background: var(--cyan-soft); border-color: var(--cyan-border); }
  .cns-tab-root .cns-tab-eventos { list-style: none; padding: 0; margin: 0; }
  .cns-tab-root .cns-tab-eventos li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; padding: 14px 16px; border-top: 1px solid var(--border); }
  .cns-tab-root .cns-tab-eventos li > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
  .cns-tab-root .cns-tab-eventos b { font-weight: 600; }
  .cns-tab-root .cns-tab-eventos small { color: var(--dim); font-size: 12px; line-height: 1.4; }
  .cns-tab-root .cns-tab-eventos strong { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; text-align: right; }
  .cns-tab-root .cns-tab-eventos strong small { display: block; font-family: 'Outfit', sans-serif; font-weight: 400; }
  .cns-tab-root .cns-tab-mermas-resumen { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px; }
  .cns-tab-root .cns-tab-mermas-resumen > div { display: flex; flex-direction: column; gap: 6px; }
  .cns-tab-root .cns-tab-mermas-resumen span, .cns-tab-root .cns-tab-mermas-resumen small { font-size: 12px; color: var(--muted); }
  .cns-tab-root .cns-tab-mermas-resumen strong { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 600; }
  @media (max-width: 899px) { .cns-tab-root .cns-tab-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 640px) {
    .cns-tab-root { padding: 14px 16px 28px; gap: 14px; }
    .cns-tab-root .cns-tab-toolbar { gap: 10px; padding: 12px; }
    .cns-tab-root .cns-tab-toolbar > .cns-tab-periodos { width: 100%; }
    .cns-tab-root .cns-tab-toolbar > .cns-tab-periodos button { flex: 1; }
    .cns-tab-root .cns-tab-kpis { grid-template-columns: minmax(0, 1fr); }
    .cns-tab-root .cns-tab-kpi { padding: 16px; gap: 8px; }
    .cns-tab-root .cns-tab-seccion { align-items: flex-start; }
    .cns-tab-root .cns-tab-ranking-lista li { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  }
`;
