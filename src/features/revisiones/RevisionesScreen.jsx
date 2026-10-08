// Revisiones técnicas — etapa de carga, con misión diaria.
// Cada dueño ve sólo su línea: el primer día contesta cuántas semanas dura la
// producción (contando desde el desmolde) y después, cada día hábil, un
// condicionante si se le ocurre, una semana del plan y 30 productos de la
// matriz. Lo que responde se aplica en el momento y se puede deshacer. Cuando
// la línea queda completa la libera y Compras recibe el aviso.
// Compras y los admins ven el avance de todas las líneas, sin responder.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import FondoOleaje from "@/components/ui/FondoOleaje";
import { DrawnCheck, EmptyState } from "@/components/ui/motion";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fechaLarga, primerNombre, saludoSegunHora } from "@/lib/saludo";
import { FLUJOS, LINEAS, cargarItems, cargarTablero, hoyISO, liberar } from "./revisionesApi";
import { Anillo, RielSemanas } from "./revisionesUI";
import { diaSemana, fmtDia } from "./revisionesFormato";
import { CSS } from "./revisionesEstilos";
import LoteInicio from "./LoteInicio";
import LoteProductos from "./LoteProductos";
import LoteCondicionante from "./LoteCondicionante";
import LoteSemana from "./LoteSemana";

const ORDEN = { inicio: 0, condicionante: 1, semana: 2, productos: 3 };
const porOrden = (a, b) => a.dia.localeCompare(b.dia) || a.modelo.localeCompare(b.modelo) || ORDEN[a.tipo] - ORDEN[b.tipo];

// Semana (contada desde el desmolde) a partir del título del lote.
function semanaDeTitulo(titulo) {
  const t = String(titulo || "");
  let m = /^(\d+) semanas? antes del desmolde/.exec(t);
  if (m) return -Number(m[1]);
  if (t === "Semana del desmolde") return 0;
  m = /^Semana (\d+) después del desmolde/.exec(t);
  if (m) return Number(m[1]);
  return null;
}
function corto(lote) {
  if (lote.tipo === "inicio") return "Semanas de producción";
  if (lote.tipo === "condicionante") return "Condicionante";
  if (lote.tipo === "productos") return `${lote.total} productos`;
  const w = semanaDeTitulo(lote.titulo);
  return lote.titulo === "Semana de la botadura" ? "Plan · botadura" : w === 0 ? "Plan · desmolde" : w != null ? `Plan · ${w > 0 ? "+" : "−"}${Math.abs(w)}` : "Plan";
}
function fechaDiaLarga(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : fmtDia(iso);
}

export default function RevisionesScreen({ profile }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const loteId = params.get("lote");
  const [tablero, setTablero] = useState(null);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [todosLosDias, setTodosLosDias] = useState(false);
  const yo = profile?.id;
  const hoy = hoyISO();
  const supervisa = !!profile?.is_admin || ["admin", "compras"].includes(profile?.role);

  useEffect(() => {
    let vivo = true;
    cargarTablero()
      .then((t) => { if (vivo) { setTablero(t); setError(""); } })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [recarga]);
  const refrescar = useCallback(() => setRecarga((n) => n + 1), []);

  const misLineas = useMemo(() => new Set((tablero?.duenos || []).filter((d) => d.user_id === yo).map((d) => d.modelo)), [tablero, yo]);
  const esDueno = misLineas.size > 0;
  const lotes = useMemo(() => [...(tablero?.revisiones || [])].sort(porOrden), [tablero]);
  const mios = useMemo(() => lotes.filter((r) => misLineas.has(r.modelo)), [lotes, misLineas]);

  const mision = useMemo(() => {
    if (!esDueno) return null;
    const pendientes = mios.filter((r) => r.estado !== "hecha");
    // Hoy, o el próximo día con revisiones (fin de semana o antes de arrancar).
    const dia = mios.some((r) => r.dia === hoy) ? hoy : (pendientes.find((r) => r.dia > hoy)?.dia || null);
    const delDia = mios.filter((r) => r.dia === dia);
    const proximoDia = pendientes.find((r) => r.dia > (dia || hoy))?.dia || null;
    return {
      dia, esHoy: dia === hoy, delDia,
      atrasados: pendientes.filter((r) => r.dia < hoy),
      completo: delDia.length > 0 && delDia.every((r) => r.estado === "hecha"),
      proximos: proximoDia ? mios.filter((r) => r.dia === proximoDia) : [],
      proximoDia,
    };
  }, [esDueno, mios, hoy]);

  const lineas = useMemo(() => LINEAS.filter((m) => (esDueno ? misLineas.has(m) : supervisa)).map((modelo) => {
    const deLinea = lotes.filter((r) => r.modelo === modelo);
    const flujo = (tipo) => {
      const l = deLinea.filter((r) => r.tipo === tipo);
      return { total: l.reduce((s, r) => s + r.total, 0), hechos: l.reduce((s, r) => s + r.respondidos, 0), lotes: l.length };
    };
    const semanas = new Map();
    let ultima = 0;
    let primera = 0;
    for (const r of deLinea.filter((x) => x.tipo === "semana")) {
      const w = semanaDeTitulo(r.titulo);
      if (w == null) continue;
      ultima = Math.max(ultima, w);
      primera = Math.min(primera, w);
      semanas.set(w, r.estado === "hecha" ? "ok" : "pendiente");
    }
    const botadura = deLinea.find((x) => x.tipo === "semana" && x.titulo === "Semana de la botadura");
    if (botadura) { ultima += 1; semanas.set(ultima, botadura.estado === "hecha" ? "ok" : "pendiente"); }
    const total = deLinea.reduce((s, r) => s + r.total, 0);
    const hechos = deLinea.reduce((s, r) => s + r.respondidos, 0);
    return {
      modelo, total, hechos, semanas, primera, ultima,
      inicio: flujo("inicio"), condicionante: flujo("condicionante"), semana: flujo("semana"), productos: flujo("productos"),
      duenos: (tablero?.duenos || []).filter((d) => d.modelo === modelo).map((d) => d.perfil?.username || "—"),
      liberacion: (tablero?.liberaciones || []).find((l) => l.modelo === modelo) || null,
      mia: misLineas.has(modelo),
      ultimoDia: deLinea.reduce((m, r) => (r.dia > m ? r.dia : m), ""),
    };
  }).filter((l) => l.total > 0), [lotes, tablero, misLineas, esDueno, supervisa]);

  const dias = useMemo(() => {
    const visibles = esDueno ? mios : supervisa ? lotes : [];
    const porDia = new Map();
    for (const r of visibles) {
      if (!porDia.has(r.dia)) porDia.set(r.dia, []);
      porDia.get(r.dia).push(r);
    }
    return [...porDia.entries()].map(([dia, l]) => ({ dia, lotes: l }));
  }, [lotes, mios, esDueno, supervisa]);
  const diasVisibles = todosLosDias ? dias : dias.filter((d) => d.dia > (mision?.dia || hoy) || (d.dia < hoy && d.lotes.some((r) => r.estado !== "hecha"))).slice(0, 5);

  const loteAbierto = lotes.find((r) => r.id === loteId) || null;
  function abrir(id) { setParams((p) => { const n = new URLSearchParams(p); n.set("lote", id); return n; }); }
  function cerrar() { setParams((p) => { const n = new URLSearchParams(p); n.delete("lote"); return n; }); refrescar(); }

  async function liberarLinea(linea) {
    const ok = await confirm({
      title: `Liberar la matriz K${linea.modelo}`,
      message: "Compras va a recibir el aviso de que esta lista ya se puede usar para comprar. Podés seguir corrigiéndola después.",
      confirmLabel: "Liberar para Compras",
    });
    if (!ok) return;
    try {
      await liberar(linea.modelo);
      toast.success(`Matriz K${linea.modelo} liberada. Compras ya recibió el aviso.`);
      refrescar();
    } catch (e) { toast.error(e.message); }
  }

  if (loteAbierto && (misLineas.has(loteAbierto.modelo) || supervisa)) {
    const siguiente = mios.find((r) => r.estado !== "hecha" && r.id !== loteAbierto.id) || null;
    return (
      <div className="rv">
        <style href="klasea-revisiones" precedence="default">{CSS}</style>
        <LoteVista key={loteAbierto.id} lote={loteAbierto} editable={misLineas.has(loteAbierto.modelo)} yo={profile}
          onVolver={cerrar} onCambio={refrescar} siguiente={siguiente} onSiguiente={(id) => { abrir(id); refrescar(); }} />
      </div>
    );
  }

  return (
    <div className="rv">
      <style href="klasea-revisiones" precedence="default">{CSS}</style>
      <PageHeader icon={ClipboardCheck} eyebrow="Técnica · Etapa de carga" title="Revisiones técnicas"
        subtitle={esDueno ? "Un poco cada día para dejar lista la matriz y el plan de tu línea." : "El avance de cada línea, que revisan sus jefes técnicos."}
        actions={<button type="button" className="ui-btn ui-btn-icono" onClick={refrescar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={15} /></button>} />
      <div className="rv-cuerpo">
        {error && <div className="rv-error" role="alert">{error} <button type="button" className="ui-btn" onClick={refrescar}>Reintentar</button></div>}
        {!tablero && !error && <Cargando texto="Buscando las revisiones…" />}

        {tablero && !esDueno && !supervisa && (
          <EmptyState icon={ClipboardCheck} title="No tenés revisiones asignadas"
            subtitle="Las revisiones de matriz y plan las hacen los jefes técnicos de cada línea." />
        )}

        {tablero && mision && (
          <section className="rv-hoy" aria-label="Tu revisión de hoy">
            <FondoOleaje className="rv-hoy-agua" horizonte={0.82} filas={14} alfa={0.35} pausaInactivo={20000} />
            <div className="rv-hoy-dentro">
              <div className="rv-hoy-top">
                <div>
                  <span className="rv-hoy-eyebrow">{mision.esHoy ? fechaLarga() : mision.dia ? `Arranca el ${fechaDiaLarga(mision.dia)}` : "Sin pendientes"}</span>
                  <h2>{saludoSegunHora()}, {primerNombre(profile?.username) || "hola"}</h2>
                  <p>{mision.esHoy
                    ? (mision.completo ? "Ya hiciste todo lo de hoy." : `Hoy te tocan ${mision.delDia.length} ${mision.delDia.length === 1 ? "paso" : "pasos"} para la K${[...misLineas].join(" y K")}. Hacelos en orden; te lleva unos minutos.`)
                    : mision.dia ? "Si querés, ya podés adelantarlo." : "No tenés revisiones pendientes."}</p>
                </div>
              </div>
              {mision.delDia.length > 0 && (
                <ol className="rv-pasos">
                  {mision.delDia.map((r, k) => <PasoHoy key={r.id} numero={k + 1} lote={r} onAbrir={() => abrir(r.id)} />)}
                </ol>
              )}
              {mision.completo && (
                <div className="rv-hoy-listo">
                  <DrawnCheck size={22} color="var(--green)" />
                  <div><b>¡Listo por hoy!</b> {mision.proximoDia ? `Lo próximo es el ${fechaDiaLarga(mision.proximoDia)}.` : "No queda nada pendiente."}</div>
                  {mision.proximos[0] && <button type="button" className="ui-btn" onClick={() => abrir(mision.proximos[0].id)}>Adelantar<ChevronRight size={15} /></button>}
                </div>
              )}
              {mision.atrasados.length > 0 && (
                <div className="rv-atrasos">
                  Te quedaron {mision.atrasados.length} {mision.atrasados.length === 1 ? "paso" : "pasos"} de días anteriores.{" "}
                  <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 30, padding: "0 8px", color: "var(--violet)" }} onClick={() => abrir(mision.atrasados[0].id)}>Ponerme al día</button>
                </div>
              )}
            </div>
          </section>
        )}

        {tablero && esDueno && (
          <details className="rv-aviso">
            <summary>¿Para qué es esto?</summary>
            Estamos cargando y corrigiendo la información de producción: la matriz de materiales, los condicionantes y el plan semana por semana, siempre contando desde el desmolde. Lo que respondas se aplica en el momento y se puede deshacer. Cuando tu línea quede completa, la liberás y Compras empieza a usarla para comprar. Elegir el producto exacto de cada requisito queda para el final, barco por barco. Más adelante, con esta información, el sistema va a armar los pedidos solo.
          </details>
        )}

        {tablero && lineas.length > 0 && (
          <section aria-label="Avance">
            <h2 className="rv-sec-tit">{esDueno ? "Tu avance" : "Avance por línea"}</h2>
            <div className={`rv-lineas${esDueno ? " is-propia" : ""}`}>
              {lineas.map((l) => <LineaCard key={l.modelo} linea={l} propia={esDueno} onLiberar={() => liberarLinea(l)} />)}
            </div>
          </section>
        )}

        {tablero && dias.length > 0 && (esDueno || supervisa) && (
          <section aria-label="Próximos días">
            <h2 className="rv-sec-tit">{esDueno ? "Próximos días" : "Calendario"}<small>{dias.length} días hábiles en total</small></h2>
            <div className="rv-dias">
              {diasVisibles.map(({ dia, lotes: l }) => (
                <div key={dia} className={`rv-dia${dia === hoy ? " is-hoy" : ""}`}>
                  <div className="rv-dia-fecha"><b>{fmtDia(dia)}</b><small>{dia === hoy ? "hoy" : diaSemana(dia)}</small></div>
                  <div className="rv-dia-lotes">
                    {l.map((r, k) => (
                      <span key={r.id} style={{ display: "contents" }}>
                        {!esDueno && (k === 0 || l[k - 1].modelo !== r.modelo) && <span className="rv-pill is-k">K{r.modelo}</span>}
                        <button type="button" className={`rv-pill${r.estado === "hecha" ? " is-hecha" : ""}`} onClick={() => abrir(r.id)} title={r.titulo}>
                          {r.estado === "hecha" && <Check size={13} aria-hidden="true" />}
                          <span>{corto(r)}</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!diasVisibles.length && <p className="rv-vacio">No hay más días programados.</p>}
            </div>
            {dias.length > diasVisibles.length && <button type="button" className="ui-btn ui-btn-fantasma" style={{ marginTop: 8 }} onClick={() => setTodosLosDias(true)}>Ver los {dias.length} días</button>}
          </section>
        )}
      </div>
    </div>
  );
}

function textoPaso(lote) {
  const falta = lote.total - lote.respondidos;
  switch (lote.tipo) {
    case "inicio": return { etiqueta: "Para empezar", titulo: "¿Cuántas semanas dura la producción?", detalle: "Una sola vez, contando desde el desmolde" };
    case "condicionante": return { etiqueta: "Condicionante del día", titulo: "¿Hay alguno para definir hoy?", detalle: "Si no se te ocurre ninguno, lo salteás" };
    case "semana": return { etiqueta: "Plan de producción", titulo: lote.titulo, detalle: "Qué etapas y qué materiales van esa semana" };
    default: return {
      etiqueta: "Productos de la matriz", titulo: `Revisá ${lote.total} productos`,
      detalle: `${lote.titulo.split("·")[1]?.trim() || "Matriz"}${lote.respondidos ? ` · te faltan ${falta}` : ""}`,
    };
  }
}

function PasoHoy({ numero, lote, onAbrir }) {
  const hecho = lote.estado === "hecha";
  const t = textoPaso(lote);
  return (
    <li>
      <button type="button" className={`rv-paso-hoy${hecho ? " is-hecho" : ""}`} onClick={onAbrir}>
        <span className="rv-paso-num" aria-hidden="true">{hecho ? <Check size={16} /> : numero}</span>
        <span className="rv-paso-hoy-txt">
          <small>{t.etiqueta}</small>
          <b>{t.titulo}</b>
          <span>{hecho ? "Listo" : t.detalle}</span>
          {lote.tipo === "productos" && !hecho && <i className="rv-mini"><i style={{ width: `${(lote.respondidos / lote.total) * 100}%` }} /></i>}
        </span>
        <ChevronRight size={18} aria-hidden="true" className="rv-paso-ir" />
      </button>
    </li>
  );
}

function Fila({ etiqueta, valor, total, texto }) {
  return (
    <div className="rv-avance-fila">
      <div><span>{etiqueta}</span><b>{texto}</b></div>
      <div className="rv-mini"><i style={{ width: `${total ? (valor / total) * 100 : 0}%` }} /></div>
    </div>
  );
}

function LineaCard({ linea, propia, onLiberar }) {
  const pct = linea.total ? Math.round((linea.hechos / linea.total) * 100) : 0;
  const completa = linea.total > 0 && linea.hechos >= linea.total;
  const inicioHecho = linea.inicio.lotes > 0 && linea.inicio.hechos >= linea.inicio.total;
  return (
    <article className={`rv-linea${propia ? " is-mia" : ""}`}>
      <div className="rv-linea-top">
        <Anillo valor={linea.hechos} total={linea.total} size={62} completo={completa}>{pct}%</Anillo>
        <div className="rv-linea-quien">
          <span className="rv-linea-k">K{linea.modelo}</span>
          <small>{linea.duenos.join(" y ")}{linea.ultimoDia ? ` · hasta el ${fmtDia(linea.ultimoDia)}` : ""}</small>
        </div>
        {linea.liberacion
          ? <span className="ui-chip rv-chip-ok"><ShieldCheck size={13} aria-hidden="true" />Liberada</span>
          : <span className="ui-chip">{completa ? "Lista para liberar" : "En revisión"}</span>}
      </div>
      <div className="rv-avance">
        {linea.inicio.lotes > 0 && <Fila etiqueta="Semanas de producción" valor={linea.inicio.hechos} total={linea.inicio.total} texto={inicioHecho ? "Definidas" : "Falta contestar"} />}
        <Fila etiqueta="Condicionantes" valor={linea.condicionante.hechos} total={linea.condicionante.total} texto={`${linea.condicionante.hechos} de ${linea.condicionante.total} días`} />
        <Fila etiqueta="Plan de producción" valor={linea.semana.hechos} total={linea.semana.total}
          texto={linea.semana.total ? `${linea.semana.hechos} de ${linea.semana.total} semanas` : "Se arma con las semanas"} />
        <Fila etiqueta="Productos de la matriz" valor={linea.productos.hechos} total={linea.productos.total} texto={`${linea.productos.hechos} de ${linea.productos.total}`} />
      </div>
      {linea.ultima > 0 && <RielSemanas desde={linea.primera} hasta={linea.ultima} estados={linea.semanas} compacto />}
      {linea.liberacion ? (
        <p className="rv-linea-lib">Liberada por {linea.liberacion.perfil?.username || "—"} el {fmtDia(linea.liberacion.liberada_at)}. Compras ya puede usarla.</p>
      ) : propia && completa ? (
        <button type="button" className="ui-btn ui-btn-primario rv-liberar" onClick={onLiberar}><ShieldCheck size={15} />Liberar para Compras</button>
      ) : null}
    </article>
  );
}

function LoteVista({ lote, editable, yo, onVolver, onCambio, siguiente, onSiguiente }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    cargarItems(lote.id).then((d) => { if (vivo) setItems(d); }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [lote.id]);

  const respondidos = items ? items.filter((i) => i.respuesta).length : lote.respondidos;
  const total = items ? items.length : lote.total;
  const terminado = !!items && total > 0 && respondidos >= total;
  const t = textoPaso(lote);

  function actualizar(nuevo) {
    setItems((prev) => prev.map((i) => (i.id === nuevo.id ? { ...i, ...nuevo, perfil: nuevo.respuesta ? { username: yo?.username } : null } : i)));
    onCambio();
  }

  return (
    <div className="rv-vista">
      <header className="rv-vista-top">
        <button type="button" className="ui-btn ui-btn-icono" onClick={onVolver} aria-label="Volver a las revisiones"><ArrowLeft size={17} /></button>
        <div className="rv-vista-tit">
          <small>K{lote.modelo} · {FLUJOS[lote.tipo]?.nombre}{lote.dia ? ` · ${diaSemana(lote.dia)} ${fmtDia(lote.dia)}` : ""}</small>
          <h1>{t.titulo}</h1>
        </div>
        {total > 1 && <span className="rv-vista-num">{respondidos}/{total}</span>}
      </header>
      {total > 1 && <div className="rv-barra"><i style={{ width: `${total ? (respondidos / total) * 100 : 0}%` }} /></div>}
      <div className="rv-vista-cuerpo">
        {!editable && <p className="rv-solo-lectura">Sólo lectura: lo responden los jefes técnicos de la K{lote.modelo}.</p>}
        {lote.tipo === "productos" && editable && <p className="rv-ayuda">Mirá cada producto y decí si está bien en la matriz. Si está mal, corregí la cantidad, sacalo o contá qué pasa. En la compu también podés usar las teclas B (bien) y M (mal).</p>}
        {error && <div className="rv-error" role="alert">{error}</div>}
        {!items && !error && <Cargando texto="Abriendo…" />}
        {items?.[0] && lote.tipo === "inicio" && <LoteInicio item={items[0]} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {items && lote.tipo === "productos" && <LoteProductos items={items} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {items?.[0] && lote.tipo === "condicionante" && <LoteCondicionante item={items[0]} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {items?.[0] && lote.tipo === "semana" && <LoteSemana item={items[0]} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {terminado && editable && (
          <div className="rv-fin">
            <DrawnCheck size={22} color="var(--green)" />
            <div><b>¡Hecho!</b> {siguiente ? "Seguí con el próximo paso." : "No te queda nada pendiente."}</div>
            {siguiente
              ? <button type="button" className="ui-btn ui-btn-primario" onClick={() => onSiguiente(siguiente.id)}>Siguiente: {textoPaso(siguiente).titulo}<ChevronRight size={15} /></button>
              : <button type="button" className="ui-btn" onClick={onVolver}>Volver</button>}
          </div>
        )}
      </div>
    </div>
  );
}
