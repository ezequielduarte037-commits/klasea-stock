// Revisiones técnicas — etapa de carga, con misión diaria.
// Cada día hábil, el dueño de la línea tiene 30 productos de la matriz para
// marcar "está bien / está mal", un condicionante para definir y una semana
// del plan de producción para revisar. Lo que responde se aplica en el
// momento y se puede deshacer. Cuando la línea queda completa la libera y
// Compras recibe el aviso de que ya puede usar esa lista para comprar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import FondoOleaje from "@/components/ui/FondoOleaje";
import { DrawnCheck } from "@/components/ui/motion";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fechaLarga, primerNombre, saludoSegunHora } from "@/lib/saludo";
import { FLUJOS, LINEAS, cargarItems, cargarTablero, hoyISO, liberar } from "./revisionesApi";
import { Anillo, RielSemanas } from "./revisionesUI";
import { diaSemana, fmtDia } from "./revisionesFormato";
import { CSS } from "./revisionesEstilos";
import LoteProductos from "./LoteProductos";
import LoteCondicionante from "./LoteCondicionante";
import LoteSemana from "./LoteSemana";

const ORDEN_FLUJO = { productos: 1, condicionante: 2, semana: 3 };
const semanaDeTitulo = (titulo) => {
  const m = /Semana (-?\d+)/.exec(titulo || "");
  return m ? Number(m[1]) : null;
};
const sinPrefijo = (titulo) => String(titulo || "").replace(/^(Definir|Revisar): /, "");

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
  const lotes = useMemo(() => tablero?.revisiones || [], [tablero]);

  const mision = useMemo(() => {
    if (!esDueno) return null;
    const mios = lotes.filter((r) => misLineas.has(r.modelo));
    const pendientes = mios.filter((r) => r.estado !== "hecha");
    // Hoy, o el próximo día con revisiones (fin de semana o antes de arrancar).
    const dia = mios.some((r) => r.dia === hoy) ? hoy : (pendientes.find((r) => r.dia > hoy)?.dia || null);
    const delDia = mios.filter((r) => r.dia === dia).sort((a, b) => a.modelo.localeCompare(b.modelo) || ORDEN_FLUJO[a.tipo] - ORDEN_FLUJO[b.tipo]);
    const proximoDia = pendientes.find((r) => r.dia > (dia || hoy))?.dia || null;
    return {
      dia, esHoy: dia === hoy, delDia,
      atrasados: pendientes.filter((r) => r.dia < hoy),
      completo: delDia.length > 0 && delDia.every((r) => r.estado === "hecha"),
      proximos: proximoDia ? mios.filter((r) => r.dia === proximoDia) : [],
      proximoDia,
    };
  }, [esDueno, lotes, misLineas, hoy]);

  const lineas = useMemo(() => LINEAS.map((modelo) => {
    const deLinea = lotes.filter((r) => r.modelo === modelo);
    const flujos = Object.keys(FLUJOS).map((tipo) => {
      const l = deLinea.filter((r) => r.tipo === tipo);
      return { tipo, total: l.reduce((s, r) => s + r.total, 0), hechos: l.reduce((s, r) => s + r.respondidos, 0) };
    });
    const semanas = new Map();
    let ultima = 0;
    for (const r of deLinea.filter((x) => x.tipo === "semana")) {
      const w = semanaDeTitulo(r.titulo);
      if (w == null) continue;
      ultima = Math.max(ultima, w);
      semanas.set(w, r.estado === "hecha" ? "ok" : "pendiente");
    }
    const total = flujos.reduce((s, f) => s + f.total, 0);
    const hechos = flujos.reduce((s, f) => s + f.hechos, 0);
    return {
      modelo, flujos, semanas, ultima, total, hechos,
      duenos: (tablero?.duenos || []).filter((d) => d.modelo === modelo).map((d) => d.perfil?.username || "—"),
      liberacion: (tablero?.liberaciones || []).find((l) => l.modelo === modelo) || null,
      mia: misLineas.has(modelo),
      ultimoDia: deLinea.reduce((m, r) => (r.dia > m ? r.dia : m), ""),
    };
  }).filter((l) => l.total > 0), [lotes, tablero, misLineas]);

  const dias = useMemo(() => {
    const visibles = lotes.filter((r) => !esDueno || misLineas.has(r.modelo));
    const porDia = new Map();
    for (const r of visibles) {
      if (!porDia.has(r.dia)) porDia.set(r.dia, []);
      porDia.get(r.dia).push(r);
    }
    return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, l]) => ({ dia, lotes: l.sort((a, b) => a.modelo.localeCompare(b.modelo) || ORDEN_FLUJO[a.tipo] - ORDEN_FLUJO[b.tipo]) }));
  }, [lotes, esDueno, misLineas]);
  const diasVisibles = todosLosDias ? dias : dias.filter((d) => d.dia >= hoy || d.lotes.some((r) => r.estado !== "hecha")).slice(0, 6);

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

  if (loteAbierto) {
    const pendientesMios = lotes.filter((r) => misLineas.has(r.modelo) && r.estado !== "hecha" && r.id !== loteAbierto.id)
      .sort((a, b) => a.dia.localeCompare(b.dia) || ORDEN_FLUJO[a.tipo] - ORDEN_FLUJO[b.tipo]);
    return (
      <div className="rv">
        <style href="klasea-revisiones" precedence="default">{CSS}</style>
        <LoteVista key={loteAbierto.id} lote={loteAbierto} editable={misLineas.has(loteAbierto.modelo)} yo={profile}
          onVolver={cerrar} onCambio={refrescar} siguiente={pendientesMios[0] || null} onSiguiente={(id) => { abrir(id); refrescar(); }} />
      </div>
    );
  }

  return (
    <div className="rv">
      <style href="klasea-revisiones" precedence="default">{CSS}</style>
      <PageHeader icon={ClipboardCheck} eyebrow="Técnica · Etapa de carga" title="Revisiones técnicas"
        subtitle="Matriz, condicionantes y plan de producción de cada línea, un poco cada día."
        actions={<button type="button" className="ui-btn ui-btn-icono" onClick={refrescar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={15} /></button>} />
      <div className="rv-cuerpo">
        {error && <div className="rv-error" role="alert">{error} <button type="button" className="ui-btn" onClick={refrescar}>Reintentar</button></div>}
        {!tablero && !error && <Cargando texto="Buscando las revisiones…" />}

        {tablero && mision && (
          <section className="rv-hoy" aria-label="Tu revisión de hoy">
            <FondoOleaje className="rv-hoy-agua" horizonte={0.78} filas={14} alfa={0.4} pausaInactivo={20000} />
            <div className="rv-hoy-dentro">
              <div className="rv-hoy-top">
                <div>
                  <h2>{saludoSegunHora()}, {primerNombre(profile?.username) || "hola"}</h2>
                  <p>{mision.esHoy ? `${fechaLarga()} · tu revisión de hoy`
                    : mision.dia ? `Lo próximo es el ${fechaDiaLarga(mision.dia)}. Si querés, ya podés adelantarlo.`
                      : "No tenés revisiones pendientes."}</p>
                </div>
                <span className="rv-hoy-linea">{[...misLineas].map((m) => `K${m}`).join(" · ")}</span>
              </div>
              {mision.delDia.length > 0 && (
                <div className="rv-misiones">
                  {mision.delDia.map((r) => <Mision key={r.id} lote={r} onAbrir={() => abrir(r.id)} />)}
                </div>
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
                  Tenés {mision.atrasados.length} {mision.atrasados.length === 1 ? "revisión" : "revisiones"} de días anteriores.{" "}
                  <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 30, padding: "0 8px", color: "var(--violet)" }} onClick={() => abrir(mision.atrasados[0].id)}>Empezar por la más vieja</button>
                </div>
              )}
            </div>
          </section>
        )}

        {tablero && (
          <div className="rv-aviso">
            <strong>Etapa de carga.</strong>{" "}
            {esDueno
              ? "Estamos corrigiendo y completando la matriz, los condicionantes y el plan de producción. Lo que respondas se aplica en el momento y se puede deshacer. Cuando tu línea quede completa, la liberás y Compras empieza a usarla para comprar. Elegir el producto exacto de cada requisito queda para el final, barco por barco. Más adelante, con esta información, el sistema va a armar los pedidos solo."
              : "Los dueños de cada línea están corrigiendo la matriz, los condicionantes y el plan de producción, un poco cada día. Deciden ellos: cuando una lista queda liberada, a Compras le llega el aviso de que ya se puede usar para comprar."}
          </div>
        )}

        {tablero && (
          <section aria-label="Avance por línea">
            <h2 className="rv-sec-tit">Avance por línea</h2>
            <div className="rv-lineas">
              {lineas.map((l) => <LineaCard key={l.modelo} linea={l} onLiberar={() => liberarLinea(l)} />)}
              {!lineas.length && <p className="rv-vacio">Todavía no hay revisiones cargadas.</p>}
            </div>
          </section>
        )}

        {tablero && dias.length > 0 && (
          <section aria-label="Calendario de revisiones">
            <h2 className="rv-sec-tit">{esDueno ? "Tus días" : "Calendario"}<small>{dias.length} días hábiles en total</small></h2>
            <div className="rv-dias">
              {diasVisibles.map(({ dia, lotes: l }) => (
                <div key={dia} className={`rv-dia${dia === hoy ? " is-hoy" : ""}`}>
                  <div className="rv-dia-fecha"><b>{fmtDia(dia)}</b><small>{dia === hoy ? "hoy" : diaSemana(dia)}</small></div>
                  <div className="rv-dia-lotes">
                    {l.map((r, k) => (
                      <span key={r.id} style={{ display: "contents" }}>
                        {!esDueno && (k === 0 || l[k - 1].modelo !== r.modelo) && <span className="rv-pill is-k">K{r.modelo}</span>}
                        <button type="button" className={`rv-pill${r.estado === "hecha" ? " is-hecha" : ""}`} onClick={() => abrir(r.id)} title={r.titulo}>
                          <span>{r.tipo === "productos" ? `${r.total} productos` : sinPrefijo(r.titulo)}</span>
                          <small>{r.respondidos}/{r.total}</small>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {dias.length > diasVisibles.length && <button type="button" className="ui-btn ui-btn-fantasma" style={{ marginTop: 8 }} onClick={() => setTodosLosDias(true)}>Ver los {dias.length} días</button>}
          </section>
        )}
      </div>
    </div>
  );
}

function Mision({ lote, onAbrir }) {
  const hecha = lote.estado === "hecha";
  const falta = lote.total - lote.respondidos;
  const titulo = lote.tipo === "productos" ? `${lote.total} productos de la matriz` : sinPrefijo(lote.titulo);
  const rubros = lote.tipo === "productos" && lote.titulo.includes("·") ? lote.titulo.split("·")[1].trim() : "";
  return (
    <button type="button" className={`rv-mision${hecha ? " is-hecha" : ""}`} onClick={onAbrir}>
      <Anillo valor={lote.respondidos} total={lote.total} completo={hecha}>
        {hecha ? "✓" : lote.total > 1 ? `${lote.respondidos}/${lote.total}` : "1"}
      </Anillo>
      <span className="rv-mision-txt">
        <small>{lote.tipo === "condicionante" && lote.titulo.startsWith("Revisar") ? "Condicionante a revisar" : FLUJOS[lote.tipo]?.nombre}</small>
        <b>{titulo}</b>
        <span>{hecha ? "Listo" : lote.total > 1 ? `Te faltan ${falta}` : "Pendiente"}{rubros ? ` · ${rubros}` : ""}</span>
      </span>
    </button>
  );
}

function LineaCard({ linea, onLiberar }) {
  const pct = linea.total ? Math.round((linea.hechos / linea.total) * 100) : 0;
  const completa = linea.total > 0 && linea.hechos >= linea.total;
  return (
    <article className={`rv-linea${linea.mia ? " is-mia" : ""}`}>
      <div className="rv-linea-top">
        <Anillo valor={linea.hechos} total={linea.total} size={58} completo={completa}>{pct}%</Anillo>
        <div className="rv-linea-quien">
          <span className="rv-linea-k">K{linea.modelo}</span>
          <small>{linea.duenos.join(" · ")}{linea.ultimoDia ? ` · hasta el ${fmtDia(linea.ultimoDia)}` : ""}</small>
        </div>
        {linea.liberacion
          ? <span className="ui-chip rv-chip-ok"><ShieldCheck size={13} aria-hidden="true" />Liberada</span>
          : <span className="ui-chip">{completa ? "Lista para liberar" : "En revisión"}</span>}
      </div>
      <div className="rv-flujos">
        {linea.flujos.map((f) => (
          <div key={f.tipo} className="rv-flujo">
            <small>{FLUJOS[f.tipo].corto}</small>
            <b>{f.hechos}/{f.total}</b>
            <div className="rv-mini"><i style={{ width: `${f.total ? (f.hechos / f.total) * 100 : 0}%` }} /></div>
          </div>
        ))}
      </div>
      {linea.ultima > 0 && <RielSemanas desde={-3} hasta={linea.ultima} estados={linea.semanas} compacto />}
      {linea.liberacion ? (
        <p className="rv-linea-lib">Liberada por {linea.liberacion.perfil?.username || "—"} el {fmtDia(linea.liberacion.liberada_at)}. Compras ya puede usarla.</p>
      ) : linea.mia && completa ? (
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

  function actualizar(nuevo) {
    setItems((prev) => prev.map((i) => (i.id === nuevo.id ? { ...i, ...nuevo, perfil: nuevo.respuesta ? { username: yo?.username } : null } : i)));
    onCambio();
  }

  return (
    <div className="rv-vista">
      <header className="rv-vista-top">
        <button type="button" className="ui-btn ui-btn-icono" onClick={onVolver} aria-label="Volver a las revisiones"><ArrowLeft size={17} /></button>
        <div className="rv-vista-tit">
          <small>K{lote.modelo}{lote.dia ? ` · ${diaSemana(lote.dia)} ${fmtDia(lote.dia)}` : ""} · {FLUJOS[lote.tipo]?.nombre}</small>
          <h1>{lote.tipo === "productos" ? `${lote.total} productos · ${lote.titulo.split("·")[1]?.trim() || "matriz"}` : lote.titulo}</h1>
        </div>
        <span className="rv-vista-num">{respondidos}/{total}</span>
      </header>
      <div className="rv-barra"><i style={{ width: `${total ? (respondidos / total) * 100 : 0}%` }} /></div>
      <div className="rv-vista-cuerpo">
        {!editable && <p className="rv-solo-lectura">Sólo lectura: lo responden los dueños de la K{lote.modelo}.</p>}
        {lote.tipo === "productos" && editable && <p className="rv-ayuda">Mirá cada producto de la matriz y decí si está bien. Si está mal, corregí la cantidad, sacalo o contá qué pasa. En la compu también podés usar las teclas B y M.</p>}
        {error && <div className="rv-error" role="alert">{error}</div>}
        {!items && !error && <Cargando texto="Abriendo la revisión…" />}
        {items && lote.tipo === "productos" && <LoteProductos items={items} editable={editable} onItem={actualizar} />}
        {items?.[0] && lote.tipo === "condicionante" && <LoteCondicionante item={items[0]} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {items?.[0] && lote.tipo === "semana" && <LoteSemana item={items[0]} modelo={lote.modelo} editable={editable} onItem={actualizar} />}
        {terminado && (
          <div className="rv-fin">
            <DrawnCheck size={22} color="var(--green)" />
            <div><b>¡Hecho!</b> Cada respuesta deja la matriz y el plan más cerca de poder usarse para comprar.</div>
            {siguiente
              ? <button type="button" className="ui-btn ui-btn-primario" onClick={() => onSiguiente(siguiente.id)}>Siguiente: {siguiente.tipo === "productos" ? "productos" : sinPrefijo(siguiente.titulo)}<ChevronRight size={15} /></button>
              : <button type="button" className="ui-btn" onClick={onVolver}>Volver</button>}
          </div>
        )}
      </div>
    </div>
  );
}
