import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  Building2,
  ClipboardList,
  Compass,
  CornerDownLeft,
  FileText,
  LifeBuoy,
  LoaderCircle,
  Send,
  Search,
  Ship,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import { askKlaseaAssistant, canUseKlaseaAssistant } from "./assistantApi";
import { groupRank, searchGlobal, searchSectionsOnly } from "./globalSearchApi";
import { seccionesVisibles } from "./navIndex";

export const OPEN_GLOBAL_SEARCH_EVENT = "klasea:open-global-search";

// Tonos del tema por nombre: [color, fondo suave, borde].
const TONOS = {
  azul: ["var(--blue)", "var(--blue-soft)", "var(--blue-border)"],
  cian: ["var(--cyan)", "var(--cyan-soft)", "var(--cyan-border)"],
  teal: ["var(--teal)", "var(--teal-soft)", "var(--teal-border)"],
  violeta: ["var(--violet)", "var(--violet-soft)", "var(--violet-border)"],
  verde: ["var(--green)", "var(--green-soft)", "var(--green-border)"],
};

// Remitos y proveedores iban en naranja, pegado al ámbar que el sistema no usa.
const GROUP_META = {
  secciones: { label: "Ir a", Icon: Compass, tono: "cian" },
  obras: { label: "Obras", Icon: Ship, tono: "azul" },
  materiales: { label: "Materiales", Icon: Boxes, tono: "teal" },
  remitos: { label: "Remitos", Icon: FileText, tono: "cian" },
  compras: { label: "Pedidos a compras", Icon: ShoppingCart, tono: "violeta" },
  solicitudes: { label: "Solicitudes de pañol", Icon: ClipboardList, tono: "verde" },
  proveedores: { label: "Proveedores", Icon: Building2, tono: "azul" },
  personas: { label: "Personas", Icon: UsersRound, tono: "cian" },
  logistica: { label: "Logística", Icon: Truck, tono: "azul" },
  postventa: { label: "Barcos entregados", Icon: LifeBuoy, tono: "teal" },
  procedimientos: { label: "Procedimientos", Icon: BookOpenText, tono: "violeta" },
  tickets: { label: "Tickets", Icon: LifeBuoy, tono: "verde" },
};

const varsDeTono = (tono) => {
  const [c, soft, borde] = TONOS[tono] || TONOS.teal;
  return { "--c": c, "--c-soft": soft, "--c-borde": borde };
};

const STATUS_LABELS = {
  activa: "Activa",
  pausada: "Pausada",
  terminada: "Terminada",
  nuevo: "Nuevo",
  en_revision: "En revisión",
  en_curso: "En curso",
  cotizando: "Cotizando",
  comprado: "Comprado",
  recibido: "Recibido",
  cancelado: "Cancelado",
  borrador: "Borrador",
  enviada: "Enviada",
  preparando: "Preparando",
  listo: "Listo",
  entregado: "Entregado",
  activo: "Activo",
  inactivo: "Inactivo",
  consumible: "Consumible",
  archivado: "Archivado",
  pendiente: "Pendiente",
  hecho: "Hecho",
  descartado: "Descartado",
  "ex empleado": "Ex empleado",
  "no ficha": "No ficha",
};

const ASSISTANT_SUGGESTIONS = [
  "¿Dónde veo los materiales que están en camino?",
  "¿Cómo ingreso un material que llegó al pañol?",
  "Buscá información sobre la obra K55-3",
];

// Lo que se abre cuando todavía no se escribió nada. Sale del mismo índice que
// la búsqueda, así que ya viene filtrado por rol: no hay que mantener dos
// listas que dicen quién ve qué.
const ACCESOS_RAPIDOS = ["obras", "catalogo-maestro", "stock-maestro", "compras", "panol-solicitudes", "panol-remitos"];

function assistantDisplayText(value) {
  const raw = String(value || "");
  const reasoningLeak = /here(?:'|’)s (?:a )?thinking process|thinking process|chain[- ]of[- ]thought|analy[sz]e (?:the )?user(?: input| request)?|system prompt|i need to (?:respond|answer|determine|follow)|response strategy|proceso de pensamiento|analizar (?:la )?(?:entrada|consulta|solicitud) del usuario/i;
  if (reasoningLeak.test(raw)) {
    return "No pude generar una respuesta segura. Reformulá la consulta o usá Buscar para abrir el módulo correspondiente.";
  }
  return raw
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}

function quickGroups(profile) {
  const visibles = seccionesVisibles(profile);
  const porId = new Map(visibles.map((seccion) => [seccion.id, seccion]));
  const elegidas = ACCESOS_RAPIDOS.map((id) => porId.get(id)).filter(Boolean);
  // Si el rol no llega a ninguna de las de siempre, se le muestran las primeras
  // que sí puede abrir. Un panel de accesos vacío no le sirve a nadie.
  const items = (elegidas.length ? elegidas : visibles.slice(0, 6)).map((seccion) => ({
    id: seccion.id,
    type: "seccion",
    title: seccion.label,
    subtitle: seccion.hint,
    meta: seccion.modulo,
    path: seccion.path,
    Icon: seccion.Icon,
  }));
  return items.length ? [{ key: "secciones", items }] : [];
}

/** Un grupo que acaba de responder entra en su lugar, no al final. */
function mergeGroup(groups, group) {
  const rest = groups.filter((current) => current.key !== group.key);
  return [...rest, group].sort((a, b) => groupRank(a.key) - groupRank(b.key));
}

function ResultIcon({ groupKey, Icon: OwnIcon }) {
  const meta = GROUP_META[groupKey] || GROUP_META.materiales;
  const Icon = OwnIcon || meta.Icon;
  return (
    <span className="gs-icono" style={varsDeTono(meta.tono)} aria-hidden="true">
      <Icon size={17} strokeWidth={1.8} />
    </span>
  );
}

// abrirAlMontar: lo pidieron (Ctrl+K o la lupa) mientras se descargaba; ver
// BuscadorDiferido.
export default function GlobalSearch({ profile, abrirAlMontar = false }) {
  const navigate = useNavigate();
  const idBase = useId();
  const inputRef = useRef(null);
  const rowRefs = useRef(new Map());
  const requestIdRef = useRef(0);
  const assistantRequestIdRef = useRef(0);
  const cacheRef = useRef(new Map());
  const focoPrevioRef = useRef(null);
  const [open, setOpen] = useState(abrirAlMontar);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState("search");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([]);
  const assistantEnabled = useMemo(() => canUseKlaseaAssistant(profile), [profile]);
  const assistantMode = assistantEnabled && mode === "assistant";
  const idLista = `${idBase}-resultados`;
  const idOpcion = (index) => `${idBase}-opcion-${index}`;

  useEffect(() => {
    if (assistantEnabled) return;
    assistantRequestIdRef.current += 1;
    setMode("search");
    setAssistantLoading(false);
    setAssistantError("");
    setAssistantMessages([]);
  }, [assistantEnabled]);

  useEffect(() => {
    const toggleFromKeyboard = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setOpen((current) => !current);
    };
    const openFromUi = () => setOpen(true);
    window.addEventListener("keydown", toggleFromKeyboard, true);
    window.addEventListener(OPEN_GLOBAL_SEARCH_EVENT, openFromUi);
    return () => {
      window.removeEventListener("keydown", toggleFromKeyboard, true);
      window.removeEventListener(OPEN_GLOBAL_SEARCH_EVENT, openFromUi);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    // Al cerrar, el foco vuelve a donde estaba (el botón que lo abrió, o el
    // campo donde se estaba escribiendo antes del Ctrl+K).
    focoPrevioRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      const previo = focoPrevioRef.current;
      if (previo && previo !== document.body && document.contains(previo) && typeof previo.focus === "function") {
        previo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || assistantMode) return undefined;
    const term = query.trim();
    if (term.length < 2) {
      requestIdRef.current += 1;
      setGroups([]);
      setErrors([]);
      setLoading(false);
      return undefined;
    }
    const cacheKey = `${profile?.role || ""}:${profile?.is_admin ? "1" : "0"}:${term.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setGroups(cached.groups);
      setErrors(cached.errors);
      setLoading(false);
      return undefined;
    }

    const currentRequest = ++requestIdRef.current;
    setLoading(true);
    setErrors([]);
    // Las secciones no piden nada a la red: se muestran en la misma tecla, sin
    // esperar el rebote ni la tabla más lenta. Es lo que hace que el buscador
    // se sienta inmediato aunque atrás haya once consultas en vuelo.
    setGroups(searchSectionsOnly(term, profile));

    const timer = window.setTimeout(async () => {
      try {
        const result = await searchGlobal(term, profile, {
          onGroup: (group) => {
            if (requestIdRef.current !== currentRequest) return;
            setGroups((current) => mergeGroup(current, group));
          },
        });
        if (requestIdRef.current !== currentRequest) return;
        cacheRef.current.set(cacheKey, result);
        setGroups(result.groups);
        setErrors(result.errors);
      } catch (error) {
        if (requestIdRef.current !== currentRequest) return;
        setGroups([]);
        setErrors([{ key: "general", message: String(error?.message || error || "No se pudo buscar") }]);
      } finally {
        if (requestIdRef.current === currentRequest) setLoading(false);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [assistantMode, open, profile, query]);

  const shownGroups = useMemo(() => {
    if (query.trim().length >= 2) return groups;
    return quickGroups(profile);
  }, [groups, profile, query]);

  const flatResults = useMemo(
    () => shownGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupKey: group.key }))),
    [shownGroups]
  );

  const totalResultados = flatResults.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [shownGroups]);

  useEffect(() => {
    rowRefs.current.get(activeIndex)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function close() {
    setOpen(false);
    setQuery("");
    setGroups([]);
    setErrors([]);
    setActiveIndex(0);
    setAssistantError("");
  }

  function changeMode(nextMode) {
    if (nextMode === "assistant" && !assistantEnabled) return;
    setMode(nextMode);
    setQuery("");
    setGroups([]);
    setErrors([]);
    setAssistantError("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submitAssistant(question = query) {
    if (!assistantEnabled) {
      setMode("search");
      setAssistantError("");
      return;
    }
    const term = String(question || "").trim();
    if (term.length < 3 || assistantLoading) return;
    setQuery("");
    setAssistantError("");
    setAssistantLoading(true);
    const assistantRequestId = ++assistantRequestIdRef.current;
    const priorMessages = assistantMessages;
    setAssistantMessages((current) => [...current, { role: "user", content: term }]);
    try {
      const searchResult = await searchGlobal(term, profile);
      const response = await askKlaseaAssistant({
        question: term,
        groups: searchResult.groups,
        messages: priorMessages,
        profile,
      });
      if (assistantRequestIdRef.current !== assistantRequestId) return;
      setAssistantMessages((current) => [...current, {
        role: "assistant",
        content: response.answer,
        links: response.links || [],
      }]);
    } catch (error) {
      if (assistantRequestIdRef.current !== assistantRequestId) return;
      setAssistantError(String(error?.message || error || "No se pudo consultar al asistente."));
    } finally {
      if (assistantRequestIdRef.current === assistantRequestId) {
        setAssistantLoading(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }

  function goTo(item) {
    if (!item?.path) return;
    // No devolver el foco a la pantalla que se deja: se va a otra ruta.
    focoPrevioRef.current = null;
    close();
    navigate(item.path);
  }

  function onInputKeyDown(event) {
    if (assistantMode) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitAssistant();
      }
      return;
    }
    if (!flatResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      goTo(flatResults[activeIndex]);
    }
  }

  // Escape cierra desde cualquier parte del panel (antes sólo desde el campo) y
  // Tab no se escapa a la pantalla de atrás mientras el buscador está abierto.
  function onPanelKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const enfocables = [...event.currentTarget.querySelectorAll('input, button:not([disabled]):not([tabindex="-1"])')];
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  }

  if (!open) return null;

  let globalIndex = -1;
  const hasQuery = !assistantMode && query.trim().length >= 2;
  const noResults = hasQuery && !loading && !flatResults.length;
  const buscando = loading || assistantLoading;
  const IconoCampo = buscando ? LoaderCircle : assistantMode ? Sparkles : Search;

  return (
    <div
      className="gs-fondo"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <style href="klasea-buscador-global" precedence="default">{CSS}</style>
      <div
        className={`gs-panel${assistantMode ? " is-ia" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
        onKeyDown={onPanelKeyDown}
      >
        <div className="gs-cabeza">
          <button type="button" className="gs-modo" aria-pressed={!assistantMode} onClick={() => changeMode("search")}>
            <Search size={15} /> Buscar
          </button>
          {assistantEnabled && (
            <button type="button" className="gs-modo is-ia" aria-pressed={assistantMode} onClick={() => changeMode("assistant")}>
              <Sparkles size={15} /> Preguntar a la IA <span className="gs-beta">Beta</span>
            </button>
          )}
          {hasQuery && !!totalResultados && (
            <span className="gs-cuenta" aria-live="polite">
              {totalResultados} {totalResultados === 1 ? "resultado" : "resultados"}
            </span>
          )}
        </div>

        <div className="gs-campo">
          <IconoCampo size={21} className={`gs-campo-icono${buscando ? " gs-girando" : ""}`} aria-hidden="true" />
          <input
            ref={inputRef}
            className="gs-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={assistantMode ? "Preguntale algo sobre Klase A…" : "Buscar una pantalla, obra, producto, remito, pedido o persona…"}
            autoComplete="off"
            spellCheck="false"
            enterKeyHint={assistantMode ? "send" : "go"}
            role={assistantMode ? undefined : "combobox"}
            aria-label={assistantMode ? "Pregunta para el asistente" : "Buscar"}
            aria-expanded={assistantMode ? undefined : flatResults.length > 0}
            aria-controls={assistantMode ? undefined : idLista}
            aria-autocomplete={assistantMode ? undefined : "list"}
            aria-activedescendant={!assistantMode && flatResults.length ? idOpcion(activeIndex) : undefined}
          />
          {query && (
            <button type="button" className="gs-limpiar" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Limpiar búsqueda" title="Limpiar búsqueda">
              <X size={17} />
            </button>
          )}
          {assistantMode && (
            <button
              type="button"
              className="gs-enviar"
              onClick={() => submitAssistant()}
              disabled={query.trim().length < 3 || assistantLoading}
              aria-label="Preguntar"
              title="Preguntar"
            >
              <Send size={16} />
            </button>
          )}
          {/* En la computadora dice Esc; en el celular, donde no hay tecla, es
              el botón para salir (antes la única forma era tocar el borde). */}
          <button type="button" className="gs-cerrar" onClick={close} aria-label="Cerrar buscador">
            <span className="gs-escritorio">Esc</span>
            <span className="gs-celular">Cerrar</span>
          </button>
        </div>

        <div className="gs-cuerpo">
          {assistantMode && !assistantMessages.length && (
            <div className="gs-ia-intro">
              <div className="gs-ia-logo"><Sparkles size={20} /></div>
              <h3>Asistente Klase A</h3>
              <p>Te orienta dentro del sistema y resume registros coincidentes. Es de sólo lectura: no compra, no ingresa ni modifica datos.</p>
              <div className="gs-sugerencias">
                {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" className="gs-sugerencia" onClick={() => submitAssistant(suggestion)}>{suggestion}</button>
                ))}
              </div>
            </div>
          )}
          {assistantMode && assistantMessages.length > 0 && (
            <div className="gs-chat" aria-live="polite">
              {assistantMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`gs-msj ${message.role === "user" ? "es-usuario" : "es-ia"}`}>
                  {message.role === "assistant" && <div className="gs-msj-autor"><Sparkles size={13} /> Asistente</div>}
                  {assistantDisplayText(message.content)}
                  {!!message.links?.length && (
                    <div className="gs-enlaces">
                      {message.links.map((link) => (
                        <button key={`${link.path}-${link.label}`} type="button" className="gs-enlace" onClick={() => goTo(link)}>
                          {link.label} <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {assistantLoading && (
                <div className="gs-pensando"><LoaderCircle size={15} className="gs-girando" /> Buscando contexto y preparando respuesta…</div>
              )}
            </div>
          )}
          {assistantMode && assistantError && <div className="gs-aviso">{assistantError}</div>}

          {!assistantMode && (
            <>
              {query.trim().length === 1 && (
                <div className="gs-vacio"><span>Escribí al menos 2 caracteres.</span></div>
              )}
              {noResults && (
                <div className="gs-vacio">
                  <Search size={28} />
                  <strong>No encontramos “{query.trim()}”</strong>
                  <span>Probá con menos palabras, el nombre de la pantalla, un código, DNI o número de solicitud.</span>
                </div>
              )}
              <div id={idLista} role="listbox" aria-label={hasQuery ? "Resultados" : "Accesos rápidos"}>
                {shownGroups.map((group) => {
                  const groupMeta = GROUP_META[group.key];
                  const esSeccion = group.key === "secciones";
                  return (
                    <section
                      key={group.key}
                      className="gs-grupo"
                      role="group"
                      aria-label={hasQuery ? groupMeta?.label || group.key : "Accesos rápidos"}
                    >
                      {!hasQuery && <div className="gs-rotulo" aria-hidden="true">Accesos rápidos</div>}
                      {groupMeta && hasQuery && (
                        <div className="gs-rotulo" style={varsDeTono(groupMeta.tono)} aria-hidden="true">
                          <groupMeta.Icon size={13} strokeWidth={2} /> {groupMeta.label}
                          <span className="gs-rotulo-cuenta">{group.items.length}</span>
                        </div>
                      )}
                      <div className="gs-lista" role="presentation">
                        {group.items.map((item) => {
                          globalIndex += 1;
                          const index = globalIndex;
                          const active = index === activeIndex;
                          return (
                            <button
                              key={`${group.key}-${item.id}`}
                              ref={(node) => { if (node) rowRefs.current.set(index, node); else rowRefs.current.delete(index); }}
                              id={idOpcion(index)}
                              type="button"
                              role="option"
                              aria-selected={active}
                              tabIndex={-1}
                              className={`gs-fila${active ? " is-activa" : ""}`}
                              onMouseEnter={() => setActiveIndex(index)}
                              onClick={() => goTo(item)}
                            >
                              <ResultIcon groupKey={group.key} Icon={item.Icon} />
                              <span className="gs-textos">
                                <span className="gs-titulo-linea">
                                  <span className="gs-titulo">{item.title}</span>
                                  {/* En una sección el módulo es lo que la ubica ("Pañol › Archivo de
                                      remitos"), así que va al lado del nombre y no perdido a la derecha. */}
                                  {esSeccion && item.meta && <span className="gs-chip is-modulo">{item.meta}</span>}
                                  {item.status && <span className="gs-chip">{STATUS_LABELS[item.status] || item.status}</span>}
                                </span>
                                {item.subtitle && <span className="gs-sub">{item.subtitle}</span>}
                              </span>
                              <span className="gs-meta">{!esSeccion ? item.meta : null}</span>
                              <ArrowRight size={15} className="gs-flecha" aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              {!!errors.length && !loading && (
                <div className="gs-aviso" title={errors.map((error) => `${error.key}: ${error.message}`).join("\n")}>
                  Algunas secciones no respondieron. Podés seguir usando los resultados visibles.
                </div>
              )}
            </>
          )}
        </div>

        <div className="gs-pie">
          <span>{assistantMode ? "IA gratuita · puede tener límites o demoras." : "Buscá una pantalla por su nombre, o por código, DNI, proveedor o número."}</span>
          <span className="gs-teclas">
            {!assistantMode && <span><kbd>↑</kbd><kbd>↓</kbd>recorrer</span>}
            <span><kbd><CornerDownLeft size={11} /></kbd>{assistantMode ? "preguntar" : "abrir"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .gs-fondo {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 10050;
    display: flex; justify-content: center; align-items: flex-start;
    padding: min(12vh, 104px) 16px 24px;
    background: var(--overlay);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    animation: gs-fondo-in .16s ease both;
  }
  .gs-panel {
    position: relative;
    width: min(720px, 100%); max-height: min(76vh, 680px);
    display: flex; flex-direction: column; overflow: hidden;
    border: 1px solid var(--border-2); border-radius: 18px;
    background: var(--panel-solid); color: var(--text);
    box-shadow: var(--elev-2);
    font-family: 'Outfit', system-ui, sans-serif;
    animation: gs-panel-in .2s cubic-bezier(.22,1,.36,1) both;
  }
  /* La línea de la marca arriba; violeta cuando se le pregunta a la IA. */
  .gs-panel::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--brand-grad); opacity: .85; pointer-events: none;
  }
  .gs-panel.is-ia::before { background: linear-gradient(90deg, var(--violet), var(--blue)); }

  .gs-cabeza { display: flex; align-items: center; gap: 6px; padding: 12px 12px 0; }
  .gs-modo {
    min-height: 34px; display: inline-flex; align-items: center; gap: 7px; padding: 0 12px;
    border: 1px solid transparent; border-radius: 10px; background: transparent;
    color: var(--dim); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap;
    transition: color .15s, background-color .15s, border-color .15s;
  }
  .gs-modo:hover { color: var(--text); background: var(--panel); }
  .gs-modo[aria-pressed="true"] { color: var(--blue); background: var(--blue-soft); border-color: var(--blue-border); font-weight: 600; }
  .gs-modo.is-ia[aria-pressed="true"] { color: var(--violet); background: var(--violet-soft); border-color: var(--violet-border); }
  .gs-beta { padding: 0 6px; border: 1px solid currentColor; border-radius: 999px; font-size: 10px; font-weight: 600; line-height: 16px; opacity: .75; }
  .gs-cuenta { margin-left: auto; padding-right: 4px; color: var(--dim); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; white-space: nowrap; }

  .gs-campo { display: flex; align-items: center; gap: 10px; min-height: 66px; padding: 0 12px 0 18px; border-bottom: 1px solid var(--border); }
  .gs-campo-icono { flex-shrink: 0; color: var(--blue); }
  .gs-panel.is-ia .gs-campo-icono { color: var(--violet); }
  .gs-girando { animation: gs-giro .75s linear infinite; }
  .gs-input {
    flex: 1; min-width: 0; height: 64px; padding: 0;
    border: 0; outline: 0; background: transparent;
    color: var(--text); font: inherit; font-size: 17px; font-weight: 500;
  }
  .gs-input:focus-visible { outline: none; }
  .gs-limpiar, .gs-enviar { flex-shrink: 0; display: grid; place-items: center; padding: 0; font: inherit; }
  .gs-limpiar { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: var(--dim); }
  .gs-limpiar:hover { background: var(--panel-2); color: var(--text); }
  .gs-enviar { width: 38px; height: 38px; border: 1px solid var(--violet-border); border-radius: 11px; background: var(--violet-soft); color: var(--violet); }
  .gs-enviar:disabled { opacity: .45; cursor: not-allowed; }
  .gs-cerrar {
    flex-shrink: 0; min-height: 28px; padding: 0 8px;
    border: 1px solid var(--border-2); border-radius: 8px; background: var(--panel-2);
    color: var(--dim); font-family: 'JetBrains Mono', monospace; font-size: 11px;
    transition: color .15s, border-color .15s;
  }
  .gs-cerrar:hover { color: var(--text); border-color: var(--border-3); }
  .gs-celular { display: none; }

  .gs-cuerpo { flex: 1; min-height: 150px; overflow-y: auto; overscroll-behavior: contain; padding: 10px 8px 12px; }
  .gs-grupo + .gs-grupo { margin-top: 6px; }
  .gs-rotulo {
    display: flex; align-items: center; gap: 7px; padding: 8px 10px 6px;
    color: var(--dim); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  }
  .gs-rotulo svg { color: var(--c); }
  .gs-rotulo-cuenta { color: var(--subtle); font-family: 'JetBrains Mono', monospace; letter-spacing: 0; }
  .gs-lista { display: grid; gap: 2px; }
  .gs-fila {
    width: 100%; min-height: 58px;
    display: grid; grid-template-columns: 36px minmax(0, 1fr) auto 16px; align-items: center; gap: 12px;
    padding: 8px 10px; border: 0; border-radius: 12px; background: transparent;
    color: var(--text); font: inherit; text-align: left;
    transition: background-color .12s;
  }
  .gs-fila.is-activa { background: var(--blue-soft); box-shadow: inset 0 0 0 1px var(--blue-border); }
  .gs-icono {
    width: 36px; height: 36px; display: grid; place-items: center;
    border: 1px solid var(--c-borde); border-radius: 11px; background: var(--c-soft); color: var(--c);
  }
  .gs-textos { display: grid; gap: 3px; min-width: 0; }
  .gs-titulo-linea { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gs-titulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
  .gs-chip {
    flex-shrink: 0; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px;
    background: var(--panel-2); color: var(--muted); font-size: 11px; font-weight: 600; line-height: 19px;
  }
  .gs-chip.is-modulo { border-color: var(--cyan-border); background: var(--cyan-soft); color: var(--cyan); }
  .gs-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); font-size: 12.5px; }
  .gs-meta { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); font-size: 12px; }
  .gs-flecha { color: var(--subtle); transition: transform .15s, color .15s; }
  .gs-fila.is-activa .gs-flecha { color: var(--blue); transform: translateX(2px); }

  .gs-vacio { min-height: 150px; display: grid; place-items: center; align-content: center; gap: 6px; padding: 24px; text-align: center; }
  .gs-vacio svg { margin-bottom: 4px; color: var(--subtle); }
  .gs-vacio strong { font-size: 15px; font-weight: 600; }
  .gs-vacio span { max-width: 420px; color: var(--dim); font-size: 13px; line-height: 1.5; }
  .gs-aviso { margin: 8px 10px 2px; padding: 8px 11px; border: 1px solid var(--red-border); border-radius: 10px; background: var(--red-soft); color: var(--red); font-size: 12.5px; }

  .gs-ia-intro { padding: 18px 14px 22px; }
  .gs-ia-logo { width: 44px; height: 44px; display: grid; place-items: center; margin-bottom: 12px; border: 1px solid var(--violet-border); border-radius: 13px; background: var(--violet-soft); color: var(--violet); }
  .gs-ia-intro h3 { margin: 0; font-size: 16px; font-weight: 650; }
  .gs-ia-intro p { max-width: 540px; margin: 6px 0 0; color: var(--dim); font-size: 13px; line-height: 1.55; }
  .gs-sugerencias { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .gs-sugerencia {
    min-height: 36px; padding: 7px 12px; border: 1px solid var(--border-2); border-radius: 12px;
    background: var(--panel); color: var(--muted); font: inherit; font-size: 13px; text-align: left;
    transition: border-color .15s, color .15s;
  }
  .gs-sugerencia:hover { border-color: var(--violet-border); color: var(--text); }
  .gs-chat { display: grid; gap: 10px; padding: 4px 8px 8px; }
  .gs-msj { padding: 12px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; }
  .gs-msj.es-usuario { justify-self: end; max-width: 86%; padding: 9px 12px; border: 1px solid var(--blue-border); border-bottom-right-radius: 6px; background: var(--blue-soft); }
  .gs-msj.es-ia { border: 1px solid var(--violet-border); border-bottom-left-radius: 6px; background: var(--violet-soft); }
  .gs-msj-autor { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; color: var(--violet); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; white-space: normal; }
  .gs-enlaces { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; white-space: normal; }
  .gs-enlace {
    min-height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 10px;
    border: 1px solid var(--violet-border); border-radius: 9px; background: var(--panel-solid);
    color: var(--violet); font: inherit; font-size: 12px; font-weight: 600;
  }
  .gs-pensando { display: flex; align-items: center; gap: 8px; padding: 5px 8px; color: var(--dim); font-size: 12.5px; }

  .gs-pie {
    min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 8px 14px; border-top: 1px solid var(--border); background: var(--panel);
    color: var(--dim); font-size: 12px;
  }
  .gs-teclas { display: inline-flex; align-items: center; gap: 12px; white-space: nowrap; }
  .gs-teclas kbd {
    display: inline-grid; place-items: center; min-width: 20px; height: 20px; margin-right: 3px; padding: 0 5px;
    border: 1px solid var(--border-2); border-radius: 6px; background: var(--panel-2);
    color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  }

  @keyframes gs-fondo-in { from { opacity: 0; } }
  @keyframes gs-panel-in { from { opacity: 0; transform: translateY(-8px) scale(.985); } }
  @keyframes gs-panel-in-celular { from { opacity: 0; transform: translateY(14px); } }
  @keyframes gs-giro { to { transform: rotate(360deg); } }

  /* Celular: pantalla completa, con el campo arriba y un "Cerrar" a la vista. */
  @media (max-width: 640px) {
    .gs-fondo { padding: 0; align-items: stretch; }
    .gs-panel {
      width: 100%; height: 100%; max-height: none;
      border: 0; border-radius: 0;
      padding-top: env(safe-area-inset-top);
      animation-name: gs-panel-in-celular;
    }
    .gs-cabeza { padding: 10px 10px 0; }
    .gs-campo { min-height: 60px; gap: 8px; padding: 0 6px 0 14px; }
    .gs-input { height: 58px; font-size: 16px; }
    .gs-cerrar {
      min-height: 40px; padding: 0 10px; border: 0; background: transparent;
      color: var(--blue); font-family: 'Outfit', system-ui, sans-serif; font-size: 15px; font-weight: 600;
    }
    .gs-escritorio { display: none; }
    .gs-celular { display: inline; }
    .gs-fila { min-height: 62px; grid-template-columns: 36px minmax(0, 1fr) 16px; }
    .gs-meta { display: none; }
    .gs-pie { display: none; }
    .gs-cuerpo { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
  }
`;
