// Revisiones técnicas — etapa de carga.
// Cada dueño de línea responde lotes chicos (unos 20 ítems) para depurar la
// matriz y las etapas. Lo que responde se aplica en el momento y se puede
// deshacer. Cuando la línea queda completa la libera, y Compras recibe el
// aviso de que ya puede usar esa lista para comprar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Check, ChevronRight, ClipboardCheck, Plus, RefreshCw, Search, ShieldCheck, Undo2, X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  LINEAS, TIPOS, buscarProductos, cargarItems, cargarTablero, deshacer, liberar, lunesDe, responder,
} from "./revisionesApi";

const fmtNum = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 }));
const fmtDia = (iso) => {
  if (!iso) return "";
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
};

// "unidad" es lo más común en el catálogo: se pluraliza para que se lea natural.
const unidadDe = (unidad, cantidad) => (!unidad || unidad === "unidad" ? (Number(cantidad) === 1 ? "unidad" : "unidades") : unidad);

function textoRespuesta(item) {
  const v = item.valor || {};
  switch (`${item.tipo}:${item.respuesta}`) {
    case "falta:agregar": return `Agregado a la matriz · ${fmtNum(v.cantidad)} por barco`;
    case "falta:no_agregar": return "No va en la matriz";
    case "producto:producto": return `Producto: ${v.descripcion || "elegido"}`;
    case "producto:por_obra": return "Se define en cada obra";
    case "producto:no_va":
    case "sin_uso:no_va": return "Se quitó de la matriz";
    case "sin_uso:va": return "Va como está";
    case "sin_uso:cantidad": return `Va con ${fmtNum(v.cantidad)} por barco`;
    case "etapa:ok": return "Está bien";
    case "etapa:ajustar": return [v.semanas != null && v.semanas !== "" ? `Semana ${fmtNum(v.semanas)} del desmolde` : "", v.dias ? `${fmtNum(v.dias)} días` : ""].filter(Boolean).join(" · ");
    case "etapa:corregir": return `Tareas a corregir: ${item.nota || ""}`;
    default: return item.respuesta || "";
  }
}

export default function RevisionesScreen({ profile }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const loteId = params.get("lote");
  const [tablero, setTablero] = useState(null);
  const [error, setError] = useState("");
  const [vista, setVista] = useState("semana");
  const [recarga, setRecarga] = useState(0);
  const yo = profile?.id;
  const lunes = lunesDe();

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

  const lineas = useMemo(() => {
    if (!tablero) return [];
    return LINEAS.map((modelo) => {
      const lotes = tablero.revisiones.filter((r) => r.modelo === modelo);
      const total = lotes.reduce((s, r) => s + r.total, 0);
      const hechos = lotes.reduce((s, r) => s + r.respondidos, 0);
      const porTipo = Object.keys(TIPOS).map((tipo) => {
        const deTipo = lotes.filter((r) => r.tipo === tipo);
        return { tipo, total: deTipo.reduce((s, r) => s + r.total, 0), hechos: deTipo.reduce((s, r) => s + r.respondidos, 0) };
      }).filter((t) => t.total > 0);
      return {
        modelo, lotes, total, hechos, porTipo,
        duenos: tablero.duenos.filter((d) => d.modelo === modelo).map((d) => d.perfil?.username || "—"),
        liberacion: tablero.liberaciones.find((l) => l.modelo === modelo) || null,
        mia: misLineas.has(modelo),
      };
    }).filter((l) => l.total > 0);
  }, [tablero, misLineas]);

  const lotesVisibles = useMemo(() => {
    const todos = (tablero?.revisiones || []).filter((r) => !esDueno || misLineas.has(r.modelo));
    return {
      semana: todos.filter((r) => r.estado !== "hecha" && r.semana <= lunes),
      proximas: todos.filter((r) => r.estado !== "hecha" && r.semana > lunes),
      hechas: todos.filter((r) => r.estado === "hecha"),
    };
  }, [tablero, esDueno, misLineas, lunes]);

  const loteAbierto = tablero?.revisiones.find((r) => r.id === loteId) || null;

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

  return (
    <div className="rv">
      <style href="klasea-revisiones" precedence="default">{CSS}</style>
      {loteAbierto ? (
        <LoteVista key={loteAbierto.id} lote={loteAbierto} editable={misLineas.has(loteAbierto.modelo)} yo={profile}
          onVolver={cerrar} onCambio={refrescar}
          siguiente={lotesVisibles.semana.concat(lotesVisibles.proximas).find((r) => r.id !== loteAbierto.id && misLineas.has(r.modelo))}
          onSiguiente={(id) => { abrir(id); refrescar(); }} />
      ) : (
        <>
          <PageHeader icon={ClipboardCheck} eyebrow="Técnica · Etapa de carga" title="Revisiones técnicas"
            subtitle="Depurar las matrices y las etapas de cada línea para que después se pueda comprar con ellas."
            actions={<button type="button" className="ui-btn ui-btn-icono" onClick={refrescar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={15} /></button>} />
          <div className="rv-cuerpo">
            <div className="rv-aviso">
              <strong>Etapa de carga.</strong>{" "}
              {esDueno
                ? "Estamos corrigiendo y completando las matrices y las etapas de producción. Lo que respondas se aplica en el momento y se puede deshacer. Cuando tu línea quede completa, la liberás y Compras empieza a usarla para comprar. Más adelante, con esta información, el sistema va a armar los pedidos solo."
                : "Los dueños de cada línea están corrigiendo y completando las matrices y las etapas de producción. Deciden ellos: cuando una lista queda liberada, a Compras le llega el aviso de que ya se puede usar para comprar."}
            </div>

            {error && <div className="rv-error" role="alert">{error} <button type="button" className="ui-btn" onClick={refrescar}>Reintentar</button></div>}
            {!tablero && !error && <Cargando texto="Buscando las revisiones…" />}

            {tablero && (
              <>
                <section className="rv-lineas" aria-label="Avance por línea">
                  {lineas.map((l) => <LineaCard key={l.modelo} linea={l} onLiberar={() => liberarLinea(l)} />)}
                  {!lineas.length && <p className="rv-vacio">Todavía no hay revisiones cargadas.</p>}
                </section>

                <section className="rv-lotes" aria-label="Lotes">
                  <div className="rv-lotes-top">
                    <h2>{esDueno ? "Tus lotes" : "Lotes"}</h2>
                    <div className="ui-tabs" role="tablist">
                      {[["semana", "Esta semana"], ["proximas", "Próximas"], ["hechas", "Hechas"]].map(([k, t]) => (
                        <button key={k} type="button" role="tab" className="ui-tab" aria-selected={vista === k} onClick={() => setVista(k)}>
                          {t} <span className="rv-num">{lotesVisibles[k].length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rv-lista">
                    {lotesVisibles[vista].map((r) => <LoteFila key={r.id} lote={r} lunes={lunes} onAbrir={() => abrir(r.id)} />)}
                    {!lotesVisibles[vista].length && (
                      <p className="rv-vacio">{vista === "semana" ? (esDueno ? "No tenés lotes pendientes esta semana. Podés adelantar alguno de Próximas." : "No hay lotes pendientes esta semana.") : vista === "proximas" ? "No hay lotes para las próximas semanas." : "Todavía no hay lotes terminados."}</p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LineaCard({ linea, onLiberar }) {
  const pct = linea.total ? Math.round((linea.hechos / linea.total) * 100) : 0;
  const completa = linea.total > 0 && linea.hechos >= linea.total;
  return (
    <article className={`rv-linea ui-card${linea.mia ? " is-mia" : ""}`}>
      <header>
        <span className="rv-linea-k">K{linea.modelo}</span>
        <span className="rv-linea-duenos">{linea.duenos.join(" · ")}</span>
        {linea.liberacion
          ? <span className="ui-chip rv-chip-ok"><ShieldCheck size={13} aria-hidden="true" />Liberada</span>
          : <span className="ui-chip">{completa ? "Lista para liberar" : "En revisión"}</span>}
      </header>
      <div className="rv-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance K${linea.modelo}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="rv-linea-num"><b>{pct}%</b> · {linea.hechos} de {linea.total} respondidos</div>
      <ul className="rv-tipos">
        {linea.porTipo.map((t) => (
          <li key={t.tipo}><span>{TIPOS[t.tipo].corto}</span><b>{t.hechos}/{t.total}</b></li>
        ))}
      </ul>
      {linea.liberacion ? (
        <p className="rv-linea-lib">Liberada por {linea.liberacion.perfil?.username || "—"} el {fmtDia(linea.liberacion.liberada_at)}. Compras ya puede usarla.</p>
      ) : linea.mia && completa ? (
        <button type="button" className="ui-btn ui-btn-primario rv-liberar" onClick={onLiberar}><ShieldCheck size={15} />Liberar para Compras</button>
      ) : null}
    </article>
  );
}

function LoteFila({ lote, lunes, onAbrir }) {
  const atrasado = lote.estado !== "hecha" && lote.semana < lunes;
  const pct = lote.total ? Math.round((lote.respondidos / lote.total) * 100) : 0;
  return (
    <button type="button" className="rv-lote" onClick={onAbrir}>
      <span className="rv-lote-k">K{lote.modelo}</span>
      <span className="rv-lote-t">
        <b>{lote.titulo}</b>
        <small>{lote.respondidos}/{lote.total} · {lote.estado === "hecha" ? `terminado el ${fmtDia(lote.completada_at)}` : `semana del ${fmtDia(lote.semana)}`}</small>
      </span>
      {atrasado && <span className="ui-chip rv-chip-atraso">Atrasado</span>}
      {lote.estado === "hecha" ? <Check size={18} className="rv-ok" aria-label="Terminado" /> : <span className="rv-lote-pct">{pct}%</span>}
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

function LoteVista({ lote, editable, yo, onVolver, onCambio, siguiente, onSiguiente }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    // Cada lote monta su propia vista (key = id): no hace falta vaciar la lista acá.
    let vivo = true;
    cargarItems(lote.id).then((d) => { if (vivo) setItems(d); }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [lote.id]);

  const respondidos = items ? items.filter((i) => i.respuesta).length : lote.respondidos;
  const total = items ? items.length : lote.total;
  const terminado = items && total > 0 && respondidos >= total;

  function actualizar(nuevo) {
    setItems((prev) => prev.map((i) => (i.id === nuevo.id ? { ...i, ...nuevo, perfil: nuevo.respuesta ? { username: yo?.username } : null } : i)));
    onCambio();
  }

  return (
    <div className="rv-lotev">
      <header className="rv-lotev-top">
        <button type="button" className="ui-btn ui-btn-icono" onClick={onVolver} aria-label="Volver a las revisiones"><ArrowLeft size={17} /></button>
        <div className="rv-lotev-tit">
          <small>K{lote.modelo} · {lote.estado === "hecha" ? "terminado" : `semana del ${fmtDia(lote.semana)}`}</small>
          <h1>{lote.titulo}</h1>
        </div>
        <span className="rv-lotev-num">{respondidos}/{total}</span>
      </header>
      <div className="rv-barra rv-barra-fina"><i style={{ width: `${total ? (respondidos / total) * 100 : 0}%` }} /></div>
      <div className="rv-lotev-cuerpo">
        {!editable && <p className="rv-solo-lectura">Sólo lectura: lo responden los dueños de la K{lote.modelo}.</p>}
        <p className="rv-ayuda">{AYUDA[lote.tipo]}</p>
        {error && <div className="rv-error" role="alert">{error}</div>}
        {!items && !error && <Cargando texto="Abriendo el lote…" />}
        {items?.map((item) => <ItemCard key={item.id} item={item} editable={editable} onCambio={actualizar} />)}
        {terminado && (
          <div className="rv-fin">
            <Check size={22} aria-hidden="true" />
            <div><b>Lote terminado.</b> Gracias: cada respuesta deja la matriz más cerca de poder usarse para comprar.</div>
            {siguiente
              ? <button type="button" className="ui-btn ui-btn-primario" onClick={() => onSiguiente(siguiente.id)}>Siguiente lote<ChevronRight size={15} /></button>
              : <button type="button" className="ui-btn" onClick={onVolver}>Volver</button>}
          </div>
        )}
      </div>
    </div>
  );
}

const AYUDA = {
  falta: "Estos materiales se usaron en dos o más obras de la línea y no están en la matriz. Si van en todos los barcos, agregalos con la cantidad por barco.",
  producto: "Estos requisitos de la matriz no tienen un producto definido. Elegí el que se compra, o marcá que se define en cada obra.",
  sin_uso: "Están en la matriz pero no figuran usados en ninguna obra de la línea. Confirmá si van, corregí la cantidad o sacalos.",
  etapa: "Revisá cada etapa de la plantilla: en qué semana arranca respecto del desmolde, cuántos días dura y si sus tareas están bien.",
};

function ItemCard({ item, editable, onCambio }) {
  const toast = useToast();
  const c = item.contexto || {};
  const [modo, setModo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cantidad, setCantidad] = useState(() => String(c.cantidad_sugerida ?? c.cantidad ?? ""));
  const [semanas, setSemanas] = useState(() => (c.semanas == null ? "" : String(c.semanas)));
  const [dias, setDias] = useState(() => (c.dias == null ? "" : String(c.dias)));
  const [nota, setNota] = useState("");
  const [elegido, setElegido] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);

  useEffect(() => {
    if (modo !== "buscar") return undefined;
    const t = setTimeout(() => {
      buscarProductos(busqueda, item.material_id).then(setResultados).catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, modo, item.material_id]);

  async function enviar(respuesta, valor = null, notaTexto = null) {
    setBusy(true);
    try {
      const nuevo = await responder(item.id, respuesta, valor, notaTexto);
      onCambio(nuevo);
      setModo(null);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function volverAtras() {
    setBusy(true);
    try { onCambio(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const titulo = item.tipo === "etapa" ? c.nombre : c.descripcion;
  const meta = item.tipo === "etapa"
    ? [c.semanas == null ? "Sin ubicar respecto del desmolde" : `Semana ${fmtNum(c.semanas)} del desmolde`, c.dias ? `${fmtNum(c.dias)} días` : "Sin duración", `${c.tareas_total || 0} tareas`]
    : [c.rubro, c.cantidad != null ? `${fmtNum(c.cantidad)} ${unidadDe(c.unidad, c.cantidad)} por barco` : null, c.proveedor, c.codigo ? `Cód. ${c.codigo}` : null];

  return (
    <article className={`rv-item${item.respuesta ? " is-hecho" : ""}`}>
      <div className="rv-item-tit">{titulo || "Sin descripción"}</div>
      {c.requisito && <div className="rv-item-req">Requisito: {c.requisito}</div>}
      <div className="rv-item-meta">{meta.filter(Boolean).join(" · ")}</div>
      {item.tipo === "falta" && c.obras?.length > 0 && <div className="rv-item-meta">Usado en {c.obras.join(", ")}{c.cantidad_sugerida ? ` · unos ${fmtNum(c.cantidad_sugerida)} por obra` : ""}</div>}
      {item.tipo === "etapa" && c.tareas?.length > 0 && (
        <details className="rv-tareas"><summary>Ver tareas ({c.tareas_total})</summary><ol>{c.tareas.map((t, i) => <li key={i}>{t}</li>)}</ol>{c.tareas_total > c.tareas.length && <small>… y {c.tareas_total - c.tareas.length} más en Obras › Configuración.</small>}</details>
      )}

      {item.respuesta ? (
        <div className="rv-respuesta">
          <Check size={15} aria-hidden="true" />
          <span>{textoRespuesta(item)}{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
          {editable && <button type="button" className="ui-btn ui-btn-fantasma rv-deshacer" disabled={busy} onClick={volverAtras}><Undo2 size={14} />Deshacer</button>}
        </div>
      ) : editable ? (
        <div className="rv-acciones">
          {modo === null && item.tipo === "falta" && <>
            <button type="button" className="ui-btn ui-btn-suave" disabled={busy} onClick={() => setModo("cantidad")}><Plus size={15} />Agregar a la matriz</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => enviar("no_agregar")}>No va</button>
          </>}
          {modo === null && item.tipo === "sin_uso" && <>
            <button type="button" className="ui-btn ui-btn-suave" disabled={busy} onClick={() => enviar("va")}><Check size={15} />Va como está</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => setModo("cantidad")}>Otra cantidad</button>
            <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => enviar("no_va")}>No va</button>
          </>}
          {modo === null && item.tipo === "producto" && <>
            {(c.opciones || []).slice(0, 6).map((o) => (
              <button key={o.id} type="button" className={`rv-opcion${elegido?.id === o.id ? " is-elegido" : ""}`} disabled={busy} onClick={() => setElegido(o)}>
                <span>{o.descripcion}</span>
                <small>{[o.proveedor, o.obras ? `usado en ${o.obras} ${o.obras === 1 ? "obra" : "obras"}` : null].filter(Boolean).join(" · ")}</small>
              </button>
            ))}
            {elegido && <button type="button" className="ui-btn ui-btn-primario" disabled={busy} onClick={() => enviar("producto", { producto_id: elegido.id, descripcion: elegido.descripcion })}><Check size={15} />Usar este producto</button>}
            <div className="rv-fila-botones">
              <button type="button" className="ui-btn" disabled={busy} onClick={() => setModo("buscar")}><Search size={15} />Buscar otro</button>
              <button type="button" className="ui-btn" disabled={busy} onClick={() => enviar("por_obra")}>Se define en cada obra</button>
              <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => enviar("no_va")}>No va</button>
            </div>
          </>}
          {modo === null && item.tipo === "etapa" && <>
            <button type="button" className="ui-btn ui-btn-suave" disabled={busy} onClick={() => enviar("ok")}><Check size={15} />Está bien</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => setModo("ajustar")}>Ajustar semana o días</button>
            {(c.tareas_total || 0) > 0 && <button type="button" className="ui-btn" disabled={busy} onClick={() => setModo("corregir")}>Tareas a corregir</button>}
          </>}

          {modo === "cantidad" && (
            <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar(item.tipo === "falta" ? "agregar" : "cantidad", { cantidad: Number(cantidad.replace(",", ".")) }); }}>
              <label>Cantidad por barco<input className="ui-input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></label>
              <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !(Number(cantidad.replace(",", ".")) > 0)}>Guardar</button>
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo(null)} aria-label="Cancelar"><X size={16} /></button>
            </form>
          )}
          {modo === "ajustar" && (
            <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("ajustar", { semanas: semanas === "" ? null : Number(semanas.replace(",", ".")), dias: dias === "" ? null : Number(dias.replace(",", ".")) }); }}>
              <label>Semana respecto del desmolde<input className="ui-input" inputMode="numeric" placeholder="-3 = tres antes" value={semanas} onChange={(e) => setSemanas(e.target.value)} autoFocus /></label>
              <label>Días que dura<input className="ui-input" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
              <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || (semanas === "" && dias === "")}>Guardar</button>
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo(null)} aria-label="Cancelar"><X size={16} /></button>
            </form>
          )}
          {modo === "corregir" && (
            <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("corregir", null, nota); }}>
              <label>¿Qué hay que corregir?<input className="ui-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: falta la tarea de sellado" autoFocus /></label>
              <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !nota.trim()}>Guardar</button>
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo(null)} aria-label="Cancelar"><X size={16} /></button>
            </form>
          )}
          {modo === "buscar" && (
            <div className="rv-buscar">
              <div className="rv-form">
                <label>Buscar en el catálogo<input className="ui-input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Descripción o código" autoFocus /></label>
                <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo(null)} aria-label="Cancelar"><X size={16} /></button>
              </div>
              {resultados.map((p) => (
                <button key={p.id} type="button" className="rv-opcion" disabled={busy} onClick={() => enviar("producto", { producto_id: p.id, descripcion: p.descripcion })}>
                  <span>{p.descripcion}</span><small>{[p.codigo ? `Cód. ${p.codigo}` : null, p.proveedor].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
              {busqueda.trim().length >= 2 && !resultados.length && <small className="rv-ayuda">Sin resultados.</small>}
            </div>
          )}
        </div>
      ) : (
        <div className="rv-item-meta rv-pendiente">Pendiente</div>
      )}
    </article>
  );
}

const CSS = `
  .rv { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow-y: auto; overflow-x: hidden; color: var(--text); }
  .rv-cuerpo { max-width: 1180px; margin: 0 auto; padding: 16px 24px 48px; display: grid; gap: 18px; }
  .rv-aviso { padding: 13px 16px; border-radius: 14px; border: 1px solid var(--blue-border); background: var(--blue-soft); color: var(--muted); font-size: 13.5px; line-height: 1.55; }
  .rv-aviso strong { color: var(--text); font-weight: 650; }
  .rv-error { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--red-border); background: var(--red-soft); color: var(--red); font-size: 13px; }
  .rv-vacio { color: var(--dim); font-size: 13px; padding: 14px 4px; margin: 0; }
  .rv-lineas { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .rv-linea { padding: 15px 16px; display: grid; gap: 9px; }
  .rv-linea.is-mia { border-color: var(--blue-border); }
  .rv-linea header { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .rv-linea-k { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; }
  .rv-linea-duenos { color: var(--dim); font-size: 12.5px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-chip-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
  .rv-chip-atraso { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
  .rv-barra { height: 7px; border-radius: 99px; background: var(--panel-2); overflow: hidden; }
  .rv-barra i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), var(--cyan)); transition: width .5s cubic-bezier(.22,1,.36,1); }
  .rv-barra-fina { height: 3px; border-radius: 0; }
  .rv-linea-num { font-size: 12.5px; color: var(--dim); }
  .rv-linea-num b { color: var(--text); font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .rv-tipos { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
  .rv-tipos li { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--dim); }
  .rv-tipos b { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .rv-linea-lib { margin: 0; font-size: 12.5px; color: var(--green); line-height: 1.45; }
  .rv-liberar { justify-self: start; }
  .rv-lotes-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
  .rv-lotes-top h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .rv-num { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); margin-left: 3px; }
  .rv-lista { display: grid; gap: 6px; }
  .rv-lote { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 58px; padding: 9px 12px 9px 14px; text-align: left;
    border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); color: var(--text); font: inherit; cursor: pointer;
    transition: border-color .15s, background-color .15s; }
  .rv-lote:hover { border-color: var(--border-2); background: var(--panel); }
  .rv-lote-k { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; color: var(--blue); flex-shrink: 0; }
  .rv-lote-t { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .rv-lote-t b { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-lote-t small { color: var(--dim); font-size: 12px; }
  .rv-lote-pct { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }
  .rv-ok { color: var(--green); }
  .rv-lotev { min-height: 100%; display: flex; flex-direction: column; }
  .rv-lotev-top { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 12px 18px;
    background: var(--panel-solid); border-bottom: 1px solid var(--border); }
  .rv-lotev-tit { flex: 1; min-width: 0; }
  .rv-lotev-tit small { color: var(--dim); font-size: 12px; }
  .rv-lotev-tit h1 { margin: 2px 0 0; font-size: 16px; font-weight: 650; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-lotev-num { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; color: var(--muted); }
  .rv-lotev-cuerpo { width: 100%; max-width: 820px; margin: 0 auto; padding: 14px 18px 60px; display: grid; gap: 10px; }
  .rv-ayuda { color: var(--dim); font-size: 13px; line-height: 1.5; margin: 0; }
  .rv-solo-lectura { margin: 0; font-size: 12.5px; color: var(--violet); }
  .rv-item { padding: 13px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); display: grid; gap: 5px; }
  .rv-item.is-hecho { background: var(--panel); }
  .rv-item-tit { font-size: 14.5px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
  .rv-item-req { font-size: 12.5px; color: var(--muted); }
  .rv-item-meta { font-size: 12.5px; color: var(--dim); line-height: 1.45; overflow-wrap: anywhere; }
  .rv-pendiente { color: var(--cyan); }
  .rv-tareas { font-size: 12.5px; color: var(--muted); }
  .rv-tareas summary { cursor: pointer; color: var(--blue); padding: 4px 0; min-height: 30px; }
  .rv-tareas ol { margin: 4px 0 0; padding-left: 20px; display: grid; gap: 2px; }
  .rv-acciones { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 5px; }
  .rv-acciones .ui-btn { min-height: 42px; }
  .rv-fila-botones { display: flex; flex-wrap: wrap; gap: 7px; width: 100%; }
  .rv-opcion { width: 100%; display: grid; gap: 2px; text-align: left; padding: 9px 12px; min-height: 44px; border-radius: 10px;
    border: 1px solid var(--border-2); background: var(--panel); color: var(--text); font: inherit; cursor: pointer; }
  .rv-opcion span { font-size: 13.5px; font-weight: 500; }
  .rv-opcion small { font-size: 12px; color: var(--dim); }
  .rv-opcion:hover:not(:disabled) { border-color: var(--blue-border); }
  .rv-opcion.is-elegido { border-color: var(--blue); background: var(--blue-soft); }
  .rv-form { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; width: 100%; }
  .rv-form label { display: grid; gap: 4px; font-size: 12px; color: var(--dim); flex: 1; min-width: 150px; }
  .rv-buscar { display: grid; gap: 7px; width: 100%; }
  .rv-respuesta { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--green); font-size: 13px; }
  .rv-respuesta span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .rv-respuesta small { color: var(--dim); }
  .rv-deshacer { min-height: 36px; padding: 0 9px; font-size: 12.5px; }
  .rv-fin { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 15px 16px; border-radius: 14px;
    border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); font-size: 13.5px; }
  .rv-fin div { flex: 1; min-width: 200px; color: var(--muted); line-height: 1.5; }
  .rv-fin b { color: var(--green); font-weight: 650; }
  @media (max-width: 640px) {
    .rv-cuerpo { padding: 12px 14px 40px; }
    .rv-lotev-top { padding: 10px 12px; }
    .rv-lotev-cuerpo { padding: 12px 12px 48px; }
    .rv-acciones .ui-btn { flex: 1 1 auto; }
  }
`;
