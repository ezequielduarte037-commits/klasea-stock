import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Check, Eye, LayoutGrid, ListChecks, Printer, RefreshCw, ScanBarcode, Search, Tags, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { EmptyState } from "@/components/ui/motion";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fetchCatalogo, indexarCodigos, normalizarCodigo } from "@/features/consumibles/api";
import {
  FORMATOS,
  HOJA_MOSTRADOR,
  codigoDeBarras,
  contenidoEtiqueta,
  elegirHojaMostrador,
  estanteriaDe,
  etiquetaDePrueba,
  filtrarItems,
  ordenarParaImprimir,
  paginar,
  proximaPosicion,
  productoParaPrueba,
} from "./etiquetasCore";
import { Escala, Etiqueta, EstilosEtiquetas, PaginaEtiquetas, PaginaMostrador } from "./EtiquetasVista";

/**
 * Etiquetas de consumibles.
 *
 * El código va en la caja o en el borde del estante, no en cada producto:
 * nombre, código de Rebollar, unidad de entrega, ubicación,
 * barras Code128 y QR, todo generado acá (sin servicios externos). Se usa el
 * domingo 11 y el lunes 12/10 para etiquetar el pañol antes del arranque.
 *
 * Tres trabajos: etiquetas de estante (hoja A4 de 24 o térmica 60 × 40), la
 * hoja de mostrador (40 consumibles con barras grandes para una carpeta) y una
 * etiqueta de prueba con un probador del lector.
 *
 * Impresión: al imprimir se monta una capa en <body> con su propio @page y un
 * @media print que oculta el resto de la app. Existe solo mientras dura la
 * impresión, así que no afecta a ninguna otra pantalla.
 */

const CLAVE_IMPRESAS = "klasea.consumibles.etiquetas.impresas";
const CLAVE_FORMATO = "klasea.consumibles.etiquetas.formato";

// Tope de la vista previa: con 10 hojas ya se ve cómo sale; al imprimir salen todas.
const MAX_HOJAS_PREVIA = 12;
const MAX_TERMICAS_PREVIA = 48;

function leerImpresas() {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE_IMPRESAS) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function guardarImpresas(v) {
  try {
    window.localStorage.setItem(CLAVE_IMPRESAS, JSON.stringify(v));
    return true;
  } catch { return false; /* Se conserva en memoria, pero hay que avisar que no dura. */ }
}

function leerFormato() {
  try {
    const v = window.localStorage.getItem(CLAVE_FORMATO);
    return FORMATOS[v] ? v : "a4";
  } catch {
    return "a4";
  }
}

const fechaCorta = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
};

const plural = (n, uno, varios) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

const AYUDA_IMPRESION = {
  a4: "En el diálogo de impresión: papel A4, márgenes «Ninguno», escala 100 % y sin encabezado ni pie de página.",
  termica: "En el diálogo de impresión: la térmica con papel de 60 × 40 mm, márgenes «Ninguno» y escala 100 %.",
  mostrador: "En el diálogo de impresión: papel A4, márgenes «Ninguno» y escala 100 %.",
};

export default function EtiquetasTab({ sede, irA }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const ubicacionesId = useId();

  // ── Datos ────────────────────────────────────────────────────────────────
  const [recarga, setRecarga] = useState(0);
  const clave = `${sede}|${recarga}`;
  const [carga, setCarga] = useState({ clave: null, catalogo: null, error: null });
  useEffect(() => {
    let vivo = true;
    fetchCatalogo({ sede }).then(
      (catalogo) => { if (vivo) setCarga({ clave, catalogo, error: null }); },
      (error) => { if (vivo) setCarga((c) => ({ clave, catalogo: c.catalogo, error })); },
    );
    return () => { vivo = false; };
  }, [sede, clave]);
  const cargando = carga.clave !== clave;
  const catalogo = useMemo(() => carga.catalogo ?? [], [carga.catalogo]);

  // ── Estado de la pantalla ────────────────────────────────────────────────
  const [modo, setModo] = useState("estante");
  const [formatoKey, setFormatoKey] = useState(leerFormato);
  const formato = FORMATOS[formatoKey];
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState("");
  const [estanteria, setEstanteria] = useState("");
  const [soloSinImprimir, setSoloSinImprimir] = useState(false);
  const [soloContados, setSoloContados] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [saltear, setSaltear] = useState(0);
  const [impresas, setImpresas] = useState(leerImpresas);
  const [vistaMovil, setVistaMovil] = useState("lista");
  const [aviso, setAviso] = useState(null);

  const cambiarFormato = (key) => {
    setFormatoKey(key);
    try { window.localStorage.setItem(CLAVE_FORMATO, key); } catch { /* sin almacenamiento */ }
  };

  // ── Lo que se imprime ────────────────────────────────────────────────────
  const ordenados = useMemo(() => ordenarParaImprimir(catalogo), [catalogo]);
  const filtrados = useMemo(
    () => filtrarItems(ordenados, { q, rubro, estanteria, soloSinImprimir, soloContados, impresas }),
    [ordenados, q, rubro, estanteria, soloSinImprimir, soloContados, impresas],
  );
  const rubros = useMemo(
    () => [...new Set(catalogo.map((i) => i.rubro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [catalogo],
  );
  const estanterias = useMemo(
    () => [...new Set(catalogo.flatMap((i) => [estanteriaDe(i.ubicacion), String(i.ubicacion || "").trim().toUpperCase().split("-")[0]]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [catalogo],
  );
  const conCodigo = useMemo(() => catalogo.filter((i) => i.codigoEtiqueta), [catalogo]);
  const sinCodigo = catalogo.length - conCodigo.length;

  // Si hay elegidas, salen esas (aunque el filtro haya cambiado); si no, todas
  // las que se ven y tienen código.
  const elegidas = useMemo(() => {
    const base = seleccion.size ? ordenados.filter((i) => seleccion.has(i.id)) : filtrados;
    return base.map(contenidoEtiqueta).filter(Boolean);
  }, [seleccion, ordenados, filtrados]);
  const hojas = useMemo(
    () => paginar(elegidas, { porHoja: formato.porHoja, saltear }),
    [elegidas, formato.porHoja, saltear],
  );

  const mostrador = useMemo(() => elegirHojaMostrador(catalogo), [catalogo]);
  const tituloMostrador = `Consumibles · mostrador ${sede}`;

  const prueba = useMemo(() => etiquetaDePrueba(productoParaPrueba(catalogo)), [catalogo]);

  const trabajoActual = useMemo(() => {
    const etiquetas = modo === "estante" ? elegidas : modo === "mostrador" ? mostrador.items : [prueba];
    const barras = modo === "mostrador" ? HOJA_MOSTRADOR.barras : formato.barras;
    if (etiquetas.some((e) => !codigoDeBarras(e.codigo, barras))) return null;
    if (modo === "estante") {
      if (!hojas.length) return null;
      return { tipo: "estante", pagina: formato.pagina, formatoKey, hojas, codigos: elegidas.map((e) => e.codigo), saltear };
    }
    if (modo === "mostrador") {
      if (!mostrador.items.length) return null;
      return { tipo: "mostrador", pagina: HOJA_MOSTRADOR.pagina, items: mostrador.items, titulo: tituloMostrador };
    }
    return {
      tipo: "prueba",
      pagina: formato.pagina,
      formatoKey,
      hojas: paginar([prueba], { porHoja: formato.porHoja, saltear }),
      codigos: [],
    };
  }, [modo, hojas, formato, formatoKey, elegidas, saltear, mostrador.items, tituloMostrador, prueba]);

  // ── Impresión ────────────────────────────────────────────────────────────
  const [trabajo, setTrabajo] = useState(null);
  const trabajoRef = useRef(null);
  const trabajoActualRef = useRef(null);
  useEffect(() => { trabajoRef.current = trabajo; }, [trabajo]);
  useEffect(() => { trabajoActualRef.current = trabajoActual; }, [trabajoActual]);

  // Con la capa montada, se espera a las fuentes (JetBrains Mono en negrita
  // puede no estar bajada todavía) y se abre el diálogo.
  useEffect(() => {
    if (!trabajo || trabajo.manual) return undefined;
    let vivo = true;
    const listo = document.fonts?.ready ?? Promise.resolve();
    listo.then(() => {
      if (!vivo) return;
      window.requestAnimationFrame(() => { if (vivo) window.print(); });
    });
    return () => { vivo = false; };
  }, [trabajo]);

  useEffect(() => {
    // Ctrl+P desde esta pestaña imprime lo que se está viendo, no la pantalla.
    const antes = () => {
      if (trabajoRef.current || !trabajoActualRef.current) return;
      const t = { ...trabajoActualRef.current, manual: true };
      trabajoRef.current = t;
      flushSync(() => setTrabajo(t));
    };
    const despues = () => {
      const t = trabajoRef.current;
      if (!t) return;
      trabajoRef.current = null;
      setTrabajo(null);
      // El navegador no dice si se imprimió o se canceló: se pregunta.
      if (t.tipo === "estante" && t.codigos.length) {
        setAviso({ etapa: "preguntar", codigos: t.codigos, formatoKey: t.formatoKey, saltear: t.saltear });
      }
    };
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", despues);
    return () => {
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", despues);
    };
  }, []);

  // Siempre un objeto nuevo: si un navegador no avisa que terminó (afterprint),
  // volver a tocar Imprimir abre el diálogo otra vez en lugar de quedar trabado.
  const imprimir = () => {
    if (!trabajoActual) return;
    setAviso(null);
    setTrabajo({ ...trabajoActual });
  };

  const marcarImpresas = () => {
    if (!aviso) return;
    const ahora = new Date().toISOString();
    const next = { ...leerImpresas(), ...impresas };
    for (const c of aviso.codigos) next[c] = ahora;
    const guardadas = guardarImpresas(next);
    setImpresas(next);
    const f = FORMATOS[aviso.formatoKey];
    const proxima = f.porHoja > 1 ? proximaPosicion(aviso.codigos.length, { porHoja: f.porHoja, saltear: aviso.saltear }) : 1;
    setSeleccion(new Set());
    setAviso({ etapa: "listo", cantidad: aviso.codigos.length, proxima, guardadas });
  };

  const olvidarImpresas = async () => {
    const ok = await confirmar({
      title: "Olvidar las impresas",
      message: `Se borra la marca de ${plural(Object.keys(impresas).length, "etiqueta impresa", "etiquetas impresas")} en este equipo. Las etiquetas pegadas no cambian.`,
      confirmLabel: "Olvidar",
    });
    if (!ok) return;
    guardarImpresas({});
    setImpresas({});
    toast.info("Listo: ninguna figura como impresa en este equipo.");
  };

  // ── Selección ────────────────────────────────────────────────────────────
  const alternar = (id) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const visiblesConCodigo = filtrados.filter((i) => i.codigoEtiqueta);
  const elegirVisibles = () => setSeleccion(new Set(visiblesConCodigo.map((i) => i.id)));

  // ── Textos ───────────────────────────────────────────────────────────────
  const cantidadHojas = trabajoActual?.hojas?.length ?? (trabajoActual ? 1 : 0);
  let textoImprimir = "Imprimir";
  if (modo === "estante") {
    textoImprimir = elegidas.length
      ? `Imprimir ${plural(elegidas.length, "etiqueta", "etiquetas")}${formato.porHoja > 1 ? ` · ${plural(cantidadHojas, "hoja", "hojas")}` : ""}`
      : "Nada para imprimir";
  } else if (modo === "mostrador") {
    textoImprimir = mostrador.items.length ? "Imprimir la hoja" : "Nada para imprimir";
  } else {
    textoImprimir = "Imprimir la prueba";
  }

  const conImpresas = Object.keys(impresas).length;

  if (cargando && !carga.catalogo) {
    return <Cargando llenar texto="Trayendo los consumibles…" />;
  }

  return (
    <div className="cns-etq-root">
      <EstilosEtiquetas />
      <style>{CSS}</style>

      <div className="cns-etq-barra">
        <div className="cns-etq-seg" role="group" aria-label="Qué imprimir">
          <button type="button" aria-pressed={modo === "estante"} onClick={() => setModo("estante")}>
            <Tags size={15} /> Estantes
          </button>
          <button type="button" aria-pressed={modo === "mostrador"} onClick={() => setModo("mostrador")}>
            <LayoutGrid size={15} /> Hoja de mostrador
          </button>
          <button type="button" aria-pressed={modo === "prueba"} onClick={() => setModo("prueba")}>
            <ScanBarcode size={15} /> Prueba
          </button>
        </div>
        {modo !== "mostrador" && (
          <div className="cns-etq-seg" role="group" aria-label="Formato de etiqueta">
            {Object.values(FORMATOS).map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={formatoKey === f.key}
                title={f.detalle}
                onClick={() => cambiarFormato(f.key)}
              >
                {f.nombre}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="ui-btn ui-btn-primario cns-etq-imprimir"
          onClick={imprimir}
          disabled={!trabajoActual}
        >
          <Printer size={16} /> {textoImprimir}
        </button>
      </div>

      {carga.error && (
        <div className="cns-etq-aviso is-error" role="alert">
          <span>No se pudieron traer los consumibles: {carga.error.message || String(carga.error)}</span>
          <button type="button" className="ui-btn" onClick={() => setRecarga((n) => n + 1)}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      )}

      {aviso?.etapa === "preguntar" && (
        <div className="cns-etq-aviso" role="status">
          <span>¿Salieron bien las {plural(aviso.codigos.length, "etiqueta", "etiquetas")}?</span>
          <div className="cns-etq-aviso-botones">
            <button type="button" className="ui-btn ui-btn-primario" onClick={marcarImpresas}>
              <Check size={15} /> Sí, marcarlas impresas
            </button>
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setAviso(null)}>
              No salieron
            </button>
          </div>
        </div>
      )}
      {aviso?.etapa === "listo" && (
        <div className="cns-etq-aviso is-ok" role="status">
          <span>
            {plural(aviso.cantidad, "etiqueta marcada", "etiquetas marcadas")} como impresas en este equipo.
            {!aviso.guardadas && " El navegador no permitió guardar la marca: dura sólo mientras esta pestaña siga abierta."}
            {aviso.proxima > 1 && ` La última hoja quedó libre desde la posición ${aviso.proxima}.`}
          </span>
          <div className="cns-etq-aviso-botones">
            {aviso.proxima > 1 && (
              <button
                type="button"
                className="ui-btn"
                onClick={() => { setSaltear(aviso.proxima - 1); setAviso(null); }}
              >
                Seguir en esa hoja
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" aria-label="Cerrar" onClick={() => setAviso(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {modo === "estante" && (
        <>
          {catalogo.length > 0 && sinCodigo > 0 && (
            <div className="cns-etq-nota">
              {conCodigo.length === 0
                ? `Ningún consumible tiene código todavía. El código se asigna al cargar la ficha del consumible; apenas estén, aparecen acá para imprimir.`
                : `${plural(sinCodigo, "consumible sin código todavía", "consumibles sin código todavía")}: no se pueden imprimir hasta que tengan su ficha.`}
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => irA?.("catalogo")}>
                Ir a Catálogo
              </button>
            </div>
          )}

          <div className="cns-etq-seg cns-etq-movil-seg" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vistaMovil === "lista"} onClick={() => setVistaMovil("lista")}>
              <ListChecks size={15} /> Elegir
            </button>
            <button type="button" aria-pressed={vistaMovil === "previa"} onClick={() => setVistaMovil("previa")}>
              <Eye size={15} /> Vista previa
            </button>
          </div>

          <div className="cns-etq-cuerpo">
            <section className="cns-etq-panel" data-oculta-movil={vistaMovil !== "lista"} aria-label="Elegir qué imprimir">
              <div className="cns-etq-filtros">
                <label className="cns-etq-buscar">
                  <Search size={16} aria-hidden="true" />
                  <input
                    className="ui-input"
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por nombre, código o ubicación"
                    aria-label="Buscar consumible"
                  />
                </label>
                <div className="cns-etq-filtros-fila">
                  <select className="ui-input" value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
                    <option value="">Todos los rubros</option>
                    {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input className="ui-input" list={ubicacionesId} value={estanteria === "__sin__" ? "" : estanteria} onChange={(e) => setEstanteria(e.target.value.toUpperCase())} placeholder={estanteria === "__sin__" ? "Sin ubicación" : "Estantería o prefijo, ej. C2-"} aria-label="Filtrar por prefijo de ubicación" />
                  <datalist id={ubicacionesId}>{estanterias.map((e) => <option key={e} value={e} />)}</datalist>
                </div>
                <div className="cns-etq-filtros-fila">
                  <button
                    type="button"
                    className={`cns-etq-chip${soloSinImprimir ? " is-activo" : ""}`}
                    aria-pressed={soloSinImprimir}
                    onClick={() => setSoloSinImprimir((v) => !v)}
                  >
                    Sin imprimir todavía
                  </button>
                  <button type="button" className={`cns-etq-chip${soloContados ? " is-activo" : ""}`} aria-pressed={soloContados} onClick={() => setSoloContados((v) => !v)}>Contados en el pañol</button>
                  <button type="button" className={`cns-etq-chip${estanteria === "__sin__" ? " is-activo" : ""}`} aria-pressed={estanteria === "__sin__"} onClick={() => setEstanteria((v) => v === "__sin__" ? "" : "__sin__")}>Sin ubicación</button>
                  {conImpresas > 0 && (
                    <button type="button" className="cns-etq-link" onClick={olvidarImpresas}>
                      {plural(conImpresas, "impresa", "impresas")} en este equipo · olvidar
                    </button>
                  )}
                  {cargando && <span className="cns-etq-dim">Actualizando…</span>}
                  {!cargando && (
                    <button type="button" className="cns-etq-link" onClick={() => setRecarga((n) => n + 1)}>
                      <RefreshCw size={13} /> Actualizar
                    </button>
                  )}
                </div>
              </div>

              <div className="cns-etq-resumen">
                <span>
                  {seleccion.size
                    ? `Salen solo las ${plural(seleccion.size, "tildada", "tildadas")}`
                    : visiblesConCodigo.length
                      ? `Salen todas las de la lista con código (${visiblesConCodigo.length.toLocaleString("es-AR")})`
                      : "Tildá las que quieras o filtrá la lista"}
                </span>
                {seleccion.size > 0 ? (
                  <button type="button" className="cns-etq-link" onClick={() => setSeleccion(new Set())}>Destildar todas</button>
                ) : visiblesConCodigo.length > 0 && (
                  <button type="button" className="cns-etq-link" onClick={elegirVisibles}>Tildar todas</button>
                )}
              </div>

              {filtrados.length === 0 ? (
                <div className="cns-etq-vacio">
                  {catalogo.length === 0 ? "No hay consumibles cargados." : "Nada coincide con el filtro."}
                </div>
              ) : (
                <ul className="cns-etq-lista">
                  {filtrados.map((it) => {
                    const codigo = it.codigoEtiqueta ? String(it.codigoEtiqueta).toUpperCase() : null;
                    const impresa = codigo ? impresas[codigo] : null;
                    const elegida = seleccion.has(it.id);
                    return (
                      <li key={it.id}>
                        <label className={`cns-etq-fila${elegida ? " is-elegida" : ""}${codigo ? "" : " is-sin-codigo"}`}>
                          <input
                            type="checkbox"
                            checked={elegida}
                            disabled={!codigo}
                            onChange={() => alternar(it.id)}
                            aria-label={`Elegir ${it.alias || it.descripcion}`}
                          />
                          <span className="cns-etq-fila-nombre">{it.alias || it.descripcion}</span>
                          <span className="cns-etq-fila-codigo">
                            {codigo ?? <span className="cns-etq-pill is-sin">sin código todavía</span>}
                          </span>
                          <span className="cns-etq-fila-meta">
                            {[it.rubro, it.ubicacion, `por ${it.unidad}`].filter(Boolean).join(" · ")}
                          </span>
                          <span className="cns-etq-fila-estado">
                            {impresa && <span className="cns-etq-pill is-impresa">impresa {fechaCorta(impresa)}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="cns-etq-panel" data-oculta-movil={vistaMovil !== "previa"} aria-label="Vista previa">
              <div className="cns-etq-previa-cabeza">
                <div>
                  <h3>Vista previa</h3>
                  <p>{AYUDA_IMPRESION[formatoKey]}</p>
                </div>
                {formato.porHoja > 1 && (
                  <label className="cns-etq-posicion">
                    <span>Primera libre de la hoja</span>
                    <select className="ui-input" value={saltear} onChange={(e) => setSaltear(Number(e.target.value))}>
                      {Array.from({ length: formato.porHoja }, (_, i) => (
                        <option key={i} value={i}>{i === 0 ? "1 (hoja nueva)" : i + 1}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {hojas.length === 0 ? (
                <div className="cns-etq-vacio">
                  {conCodigo.length === 0
                    ? "Cuando los consumibles tengan código, la hoja se arma acá tal como sale de la impresora."
                    : "Elegí al menos un consumible con código."}
                </div>
              ) : (
                <PreviaEtiquetas hojas={hojas} formato={formato} />
              )}
            </section>
          </div>
        </>
      )}

      {modo === "mostrador" && (
        <section className="cns-etq-panel cns-etq-unico">
          <div className="cns-etq-previa-cabeza">
            <div>
              <h3>Hoja de mostrador</h3>
              <p>
                {mostrador.criterio === "favoritos"
                  ? `Los ${plural(Math.min(mostrador.total, HOJA_MOSTRADOR.porHoja), "consumible marcado", "consumibles marcados")} como «más pedidos», en su orden.`
                  : "Todavía no hay «más pedidos» marcados: van los primeros 40 por nombre. Se marcan en Catálogo."}
                {" "}Nombre y barras grandes para una carpeta plastificada en el mostrador. {AYUDA_IMPRESION.mostrador}
              </p>
            </div>
          </div>
          {mostrador.items.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Todavía no hay consumibles con código"
              subtitle="La hoja se arma con los productos que tienen código. Apenas estén cargados, aparece acá."
              action={<button type="button" className="ui-btn" onClick={() => irA?.("catalogo")}>Ir a Catálogo</button>}
            />
          ) : (
            <div className="cns-etq-hojas">
              <div className="cns-etq-hoja-envoltura">
                <Escala anchoMm={HOJA_MOSTRADOR.pagina.ancho} altoMm={HOJA_MOSTRADOR.pagina.alto}>
                  <PaginaMostrador items={mostrador.items} titulo={tituloMostrador} pantalla />
                </Escala>
              </div>
            </div>
          )}
        </section>
      )}

      {modo === "prueba" && (
        <PruebaLector prueba={prueba} formato={formato} saltear={saltear} catalogo={catalogo} />
      )}

      {trabajo && <CapaImpresion trabajo={trabajo} />}
    </div>
  );
}

function PreviaEtiquetas({ hojas, formato }) {
  const termica = formato.porHoja === 1;
  const tope = termica ? MAX_TERMICAS_PREVIA : MAX_HOJAS_PREVIA;
  const visibles = hojas.slice(0, tope);
  const resto = hojas.length - visibles.length;
  return (
    <div className={`cns-etq-hojas${termica ? " is-termica" : ""}`}>
      {visibles.map((hoja) => (
        <div key={hoja.numero} className="cns-etq-hoja-envoltura">
          {!termica && <div className="cns-etq-hoja-num">Hoja {hoja.numero} de {hojas.length}</div>}
          <Escala anchoMm={formato.pagina.ancho} altoMm={formato.pagina.alto} max={termica ? 1.25 : 1}>
            <PaginaEtiquetas hoja={hoja} formato={formato} pantalla />
          </Escala>
        </div>
      ))}
      {resto > 0 && (
        <div className="cns-etq-dim cns-etq-resto">
          y {plural(resto, termica ? "etiqueta más" : "hoja más", termica ? "etiquetas más" : "hojas más")}: al imprimir salen todas.
        </div>
      )}
    </div>
  );
}

/**
 * Etiqueta de prueba + probador: el lunes se imprime una y se pasa el lector
 * del pañol por las barras y por el QR. El probador muestra lo que escribió.
 */
function PruebaLector({ prueba, formato, saltear, catalogo }) {
  const [lectura, setLectura] = useState("");
  const [lecturas, setLecturas] = useState([]);
  const indice = useMemo(() => indexarCodigos(catalogo), [catalogo]);

  const registrar = (e) => {
    e.preventDefault();
    const texto = lectura;
    if (!texto.trim()) return;
    const codigo = normalizarCodigo(texto);
    const item = indice.get(codigo) ?? null;
    let resultado;
    if (codigo === prueba.codigo) resultado = { tono: "ok", texto: "Coincide con la etiqueta de prueba." };
    else if (item) resultado = { tono: "ok", texto: `Lee bien: es ${item.alias || item.descripcion}.` };
    else if (codigo.length === prueba.codigo.length) {
      resultado = { tono: "mal", texto: "Leyó algo del mismo largo pero distinto: revisá la distribución de teclado del lector (debería escribir el código de Rebollar con letras, números y, si corresponde, un guion)." };
    } else resultado = { tono: "mal", texto: "No coincide con ningún código." };
    setLecturas((prev) => [{ id: prev.length + 1, leido: texto, ...resultado }, ...prev].slice(0, 6));
    setLectura("");
  };

  const posicion = formato.porHoja > 1 ? saltear + 1 : null;

  return (
    <div className="cns-etq-prueba">
      <section className="cns-etq-panel">
        <div className="cns-etq-previa-cabeza">
          <div>
            <h3>1 · Imprimí una etiqueta</h3>
            <p>
              Sale una sola, con el código <b className="cns-etq-mono">{prueba.codigo}</b>
              {prueba.id === "prueba" ? " (código real de Rebollar usado para probar la impresión)" : ` de ${prueba.nombre}`}.
              {posicion && ` En la hoja A4 va en la posición ${posicion}: el resto de la hoja sirve después.`}
            </p>
          </div>
        </div>
        <div className="cns-etq-hojas cns-etq-prueba-etiqueta">
          <div className="cns-etq-prueba-tamano">
            <Escala anchoMm={formato.etiqueta.ancho} altoMm={formato.etiqueta.alto} max={2}>
              <div className="cns-etq-pagina is-pantalla" style={{ width: `${formato.etiqueta.ancho}mm`, height: `${formato.etiqueta.alto}mm` }}>
                <Etiqueta etiqueta={prueba} formato={formato} />
              </div>
            </Escala>
          </div>
        </div>
      </section>

      <section className="cns-etq-panel">
        <div className="cns-etq-previa-cabeza">
          <div>
            <h3>2 · Pasá el lector</h3>
            <p>Tocá el campo y escaneá primero las barras y después el QR. El lector escribe el código y un Enter.</p>
          </div>
        </div>
        <form className="cns-etq-probador" onSubmit={registrar}>
          <input
            className="ui-input cns-etq-mono"
            value={lectura}
            onChange={(e) => setLectura(e.target.value)}
            placeholder="Escaneá acá"
            aria-label="Lo que escribe el lector"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="ui-btn">Probar</button>
        </form>
        {lecturas.length > 0 && (
          <ul className="cns-etq-lecturas">
            {lecturas.map((l) => (
              <li key={l.id} className={`is-${l.tono}`}>
                <span className="cns-etq-mono">{l.leido}</span>
                <span>{l.texto}</span>
              </li>
            ))}
          </ul>
        )}
        <ul className="cns-etq-consejos">
          <li>Si las barras no escriben nada, probá un poco más lejos y con la luz derecha sobre la etiqueta.</li>
          <li>Si con el QR no pasa nada, el lector es solo de barras: alcanza con las barras hasta que llegue el lector 2D el miércoles.</li>
          <li>Si cambia las letras, los números o el guion del código de Rebollar, revisá el teclado configurado en el lector.</li>
        </ul>
      </section>
    </div>
  );
}

/**
 * La capa que se imprime. Vive en <body> (fuera del menú y del encabezado de
 * la app) y solo mientras dura la impresión: su @media print oculta todo lo
 * demás y su @page fija el papel. Al desmontarse, no queda nada.
 */
function CapaImpresion({ trabajo }) {
  const { ancho, alto } = trabajo.pagina;
  const formato = trabajo.formatoKey ? FORMATOS[trabajo.formatoKey] : null;
  useLayoutEffect(() => {
    // La marca desaparece al terminar o salir de la pestaña. Los selectores
    // que ocultan la app quedan condicionados a esta impresión específica.
    document.documentElement.classList.add("cns-etq-imprimiendo");
    return () => document.documentElement.classList.remove("cns-etq-imprimiendo");
  }, []);
  return createPortal(
    <div id="consumibles-labels-print" className="cns-etq-capa" aria-hidden="true">
      <EstilosEtiquetas />
      <style>{`
        @page { size: ${ancho}mm ${alto}mm; margin: 0; }
        @media screen { .cns-etq-capa { display: none !important; } }
        @media print {
          html.cns-etq-imprimiendo, html.cns-etq-imprimiendo body {
            background: #fff !important; margin: 0 !important; padding: 0 !important;
            min-height: 0 !important; height: auto !important; overflow: visible !important;
          }
          html.cns-etq-imprimiendo body > *:not(.cns-etq-capa) { display: none !important; }
          .cns-etq-capa { display: block !important; }
          .cns-etq-capa .cns-etq-pagina { break-after: page; page-break-after: always; box-shadow: none !important; }
          .cns-etq-capa .cns-etq-pagina:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      {trabajo.tipo === "mostrador"
        ? <PaginaMostrador items={trabajo.items} titulo={trabajo.titulo} />
        : trabajo.hojas.map((hoja) => <PaginaEtiquetas key={hoja.numero} hoja={hoja} formato={formato} />)}
    </div>,
    document.body,
  );
}

const CSS = `
  .cns-etq-root {
    max-width: 1480px; margin: 0 auto; padding: 16px 20px 32px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .cns-etq-root .cns-etq-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .cns-etq-root .cns-etq-seg {
    display: inline-flex; gap: 2px; padding: 3px; max-width: 100%;
    border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
    overflow-x: auto; scrollbar-width: none;
  }
  .cns-etq-root .cns-etq-seg::-webkit-scrollbar { display: none; }
  .cns-etq-root .cns-etq-seg button {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0;
    min-height: 34px; padding: 0 12px; border: 0; border-radius: 9px;
    background: transparent; color: var(--muted);
    font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap;
    transition: background-color .15s, color .15s;
  }
  .cns-etq-root .cns-etq-seg button:hover { color: var(--text); }
  .cns-etq-root .cns-etq-seg button[aria-pressed="true"] {
    background: var(--blue-soft); color: var(--blue); font-weight: 600;
    box-shadow: inset 0 0 0 1px var(--blue-border);
  }
  .cns-etq-root .cns-etq-imprimir { margin-left: auto; }

  .cns-etq-root .cns-etq-aviso {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 12px 10px 16px; border-radius: 12px;
    border: 1px solid var(--blue-border); background: var(--blue-soft); color: var(--text);
    font-size: 14px;
  }
  .cns-etq-root .cns-etq-aviso.is-ok { border-color: var(--green-border); background: var(--green-soft); }
  .cns-etq-root .cns-etq-aviso.is-error { border-color: var(--red-border); background: var(--red-soft); }
  .cns-etq-root .cns-etq-aviso-botones { display: flex; flex-wrap: wrap; gap: 8px; }

  .cns-etq-root .cns-etq-nota {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px;
    padding: 10px 12px 10px 16px; border-radius: 12px;
    border: 1px solid var(--violet-border); background: var(--violet-soft);
    color: var(--text); font-size: 13.5px; line-height: 1.45;
  }

  .cns-etq-root .cns-etq-cuerpo {
    display: grid; grid-template-columns: minmax(340px, 440px) minmax(0, 1fr); gap: 16px; align-items: start;
  }
  .cns-etq-root .cns-etq-panel {
    min-width: 0; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--panel-solid); box-shadow: var(--elev-1);
  }
  @media (min-width: 1100px) {
    .cns-etq-root .cns-etq-cuerpo > .cns-etq-panel {
      max-height: max(520px, calc(100dvh - 250px)); overflow: auto;
    }
    .cns-etq-root .cns-etq-movil-seg { display: none; }
  }
  @media (max-width: 1099px) {
    .cns-etq-root .cns-etq-cuerpo { grid-template-columns: minmax(0, 1fr); }
    .cns-etq-root .cns-etq-panel[data-oculta-movil="true"] { display: none; }
    .cns-etq-root .cns-etq-movil-seg { align-self: flex-start; }
  }

  .cns-etq-root .cns-etq-filtros {
    position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; gap: 8px;
    padding: 12px; background: var(--panel-solid); border-bottom: 1px solid var(--border);
    border-radius: var(--r-md) var(--r-md) 0 0;
  }
  .cns-etq-root .cns-etq-buscar { position: relative; display: block; }
  .cns-etq-root .cns-etq-buscar svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .cns-etq-root .cns-etq-buscar .ui-input { padding-left: 36px; }
  .cns-etq-root .cns-etq-filtros-fila { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .cns-etq-root .cns-etq-filtros-fila select { flex: 1 1 160px; width: auto; }
  .cns-etq-root .cns-etq-filtros-fila > input { flex: 1 1 160px; width: auto; min-width: 0; }
  .cns-etq-root .cns-etq-chip {
    min-height: 40px; padding: 0 12px; border-radius: 999px;
    border: 1px solid var(--border-2); background: var(--panel); color: var(--muted);
    font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .cns-etq-root .cns-etq-chip.is-activo { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); font-weight: 600; }
  .cns-etq-root .cns-etq-link {
    display: inline-flex; align-items: center; gap: 5px; min-height: 40px; padding: 0 4px;
    border: 0; background: none; color: var(--blue); font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .cns-etq-root .cns-etq-dim { color: var(--dim); font-size: 12.5px; }

  .cns-etq-root .cns-etq-resumen {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 10px;
    padding: 8px 14px; border-bottom: 1px solid var(--border);
    color: var(--muted); font-size: 12.5px;
  }
  .cns-etq-root .cns-etq-lista { list-style: none; margin: 0; padding: 0; }
  .cns-etq-root .cns-etq-fila {
    display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; column-gap: 10px; row-gap: 2px;
    align-items: center; min-height: 54px; padding: 8px 14px;
    border-bottom: 1px solid var(--border); cursor: pointer;
    transition: background-color .12s;
  }
  .cns-etq-root .cns-etq-fila:hover { background: var(--panel); }
  .cns-etq-root .cns-etq-fila.is-elegida { background: var(--blue-soft); }
  .cns-etq-root .cns-etq-fila.is-sin-codigo { cursor: default; }
  .cns-etq-root .cns-etq-fila.is-sin-codigo:hover { background: transparent; }
  .cns-etq-root .cns-etq-fila input { grid-row: 1 / 3; width: 18px; height: 18px; margin: 0; }
  .cns-etq-root .cns-etq-fila-nombre {
    font-size: 14px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cns-etq-root .cns-etq-fila.is-sin-codigo .cns-etq-fila-nombre { color: var(--muted); }
  .cns-etq-root .cns-etq-fila-codigo {
    justify-self: end; font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px; font-weight: 600; color: var(--text);
  }
  .cns-etq-root .cns-etq-fila-meta {
    grid-column: 2; font-size: 12px; color: var(--dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cns-etq-root .cns-etq-fila-estado { grid-column: 3; justify-self: end; }
  .cns-etq-root .cns-etq-pill {
    display: inline-flex; align-items: center; min-height: 20px; padding: 0 8px; border-radius: 999px;
    border: 1px solid var(--border); font-family: 'Outfit', system-ui, sans-serif;
    font-size: 11.5px; font-weight: 500; white-space: nowrap;
  }
  .cns-etq-root .cns-etq-pill.is-sin { color: var(--violet); background: var(--violet-soft); border-color: var(--violet-border); }
  .cns-etq-root .cns-etq-pill.is-impresa { color: var(--green); background: var(--green-soft); border-color: var(--green-border); }
  .cns-etq-root .cns-etq-vacio { padding: 36px 20px; text-align: center; color: var(--dim); font-size: 13.5px; line-height: 1.5; }

  .cns-etq-root .cns-etq-previa-cabeza {
    display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 16px;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .cns-etq-root .cns-etq-previa-cabeza h3 { margin: 0 0 3px; font-size: 15px; font-weight: 650; color: var(--text); }
  .cns-etq-root .cns-etq-previa-cabeza p { margin: 0; max-width: 640px; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
  .cns-etq-root .cns-etq-posicion { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dim); }
  .cns-etq-root .cns-etq-posicion select { width: 170px; }

  .cns-etq-root .cns-etq-hojas {
    display: flex; flex-direction: column; align-items: center; gap: 18px;
    padding: 18px 16px 22px; background: var(--panel-2);
    border-radius: 0 0 var(--r-md) var(--r-md);
  }
  .cns-etq-root .cns-etq-hojas.is-termica { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .cns-etq-root .cns-etq-hoja-envoltura { width: 100%; max-width: 820px; }
  .cns-etq-root .cns-etq-hojas.is-termica .cns-etq-hoja-envoltura { width: min(100%, 284px); }
  .cns-etq-root .cns-etq-hoja-num { margin: 0 0 6px; font-size: 12px; color: var(--dim); }
  .cns-etq-root .cns-etq-resto { width: 100%; text-align: center; }

  .cns-etq-root .cns-etq-unico { max-width: 900px; width: 100%; margin: 0 auto; }

  .cns-etq-root .cns-etq-prueba { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .cns-etq-root .cns-etq-prueba-tamano { width: min(100%, 530px); }
  .cns-etq-root .cns-etq-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .cns-etq-root .cns-etq-probador { display: flex; gap: 8px; padding: 14px 16px 6px; }
  .cns-etq-root .cns-etq-probador .ui-input { flex: 1; font-size: 16px; letter-spacing: .04em; }
  .cns-etq-root .cns-etq-lecturas { list-style: none; margin: 8px 16px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .cns-etq-root .cns-etq-lecturas li {
    display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-radius: 10px;
    border: 1px solid var(--border); font-size: 13px; color: var(--text);
  }
  .cns-etq-root .cns-etq-lecturas li .cns-etq-mono { font-weight: 600; overflow-wrap: anywhere; }
  .cns-etq-root .cns-etq-lecturas li.is-ok { border-color: var(--green-border); background: var(--green-soft); }
  .cns-etq-root .cns-etq-lecturas li.is-mal { border-color: var(--red-border); background: var(--red-soft); }
  .cns-etq-root .cns-etq-consejos { margin: 14px 16px 16px; padding-left: 18px; color: var(--muted); font-size: 12.5px; line-height: 1.55; }

  @media (max-width: 899px) {
    .cns-etq-root .cns-etq-prueba { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 640px) {
    .cns-etq-root { padding: 12px 16px 24px; gap: 12px; }
    .cns-etq-root .cns-etq-seg { width: 100%; }
    .cns-etq-root .cns-etq-seg button { flex: 1 0 auto; min-height: 40px; }
    .cns-etq-root .cns-etq-imprimir { width: 100%; margin-left: 0; }
    .cns-etq-root .cns-etq-posicion select { width: 100%; }
    .cns-etq-root .cns-etq-posicion { width: 100%; }
    .cns-etq-root .cns-etq-hojas { padding: 12px 10px 16px; }
  }
`;
