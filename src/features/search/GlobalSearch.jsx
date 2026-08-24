import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  CornerDownLeft,
  LoaderCircle,
  Send,
  Search,
  Ship,
  ShoppingCart,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { C } from "@/theme";
import { askKlaseaAssistant, canUseKlaseaAssistant } from "./assistantApi";
import { globalSearchScopes, searchGlobal } from "./globalSearchApi";

export const OPEN_GLOBAL_SEARCH_EVENT = "klasea:open-global-search";

const GROUP_META = {
  obras: { label: "Obras", Icon: Ship, color: C.blue, bg: C.blueL, border: C.blueB },
  materiales: { label: "Materiales", Icon: Boxes, color: C.teal, bg: C.tealL, border: C.tealB },
  compras: { label: "Pedidos a compras", Icon: ShoppingCart, color: C.violet, bg: C.violetL, border: C.violetB },
  solicitudes: { label: "Solicitudes de pañol", Icon: ClipboardList, color: C.green, bg: C.greenL, border: C.greenB },
  personas: { label: "Personas", Icon: UsersRound, color: C.amber, bg: C.amberL, border: C.amberB },
};

const STATUS_LABELS = {
  activa: "Activa",
  pausada: "Pausada",
  terminada: "Terminada",
  nuevo: "Nuevo",
  en_revision: "En revisión",
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
  "ex empleado": "Ex empleado",
  "no ficha": "No ficha",
};

const ASSISTANT_SUGGESTIONS = [
  "¿Dónde veo los materiales que están en camino?",
  "¿Cómo ingreso un material que llegó al pañol?",
  "Buscá información sobre la obra K55-3",
];

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
  const allowed = new Set(globalSearchScopes(profile));
  const rows = [
    { key: "obras", title: "Abrir Obras", subtitle: "Producción, etapas y tareas", path: "/obras" },
    { key: "materiales", title: "Abrir Catálogo maestro", subtitle: "Productos, códigos y ubicaciones", path: "/catalogo-maestro" },
    { key: "compras", title: "Abrir Gestión de compras", subtitle: "Pedidos y estados de compra", path: "/compras" },
    { key: "solicitudes", title: "Abrir Solicitudes de pañol", subtitle: "Preparación, retiro e historial", path: "/solicitudes-panol" },
    { key: "personas", title: "Abrir Recursos humanos", subtitle: "Empleados y presentismo", path: "/rrhh?tab=empleados" },
  ].filter((item) => allowed.has(item.key));
  return rows.length ? [{ key: "accesos", items: rows.map((item) => ({ ...item, id: `quick-${item.key}`, type: item.key })) }] : [];
}

function ResultIcon({ groupKey }) {
  const meta = GROUP_META[groupKey] || GROUP_META.materiales;
  const Icon = meta.Icon;
  return (
    <span style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
      <Icon size={16} strokeWidth={1.8} />
    </span>
  );
}

export default function GlobalSearch({ profile }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const rowRefs = useRef(new Map());
  const requestIdRef = useRef(0);
  const assistantRequestIdRef = useRef(0);
  const cacheRef = useRef(new Map());
  const [open, setOpen] = useState(false);
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
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
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchGlobal(term, profile);
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
    () => shownGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupKey: group.key === "accesos" ? item.key : group.key }))),
    [shownGroups]
  );

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
    close();
    navigate(item.path);
  }

  function onInputKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
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

  if (!open) return null;

  let globalIndex = -1;
  const hasQuery = !assistantMode && query.trim().length >= 2;
  const noResults = hasQuery && !loading && !flatResults.length;

  return (
    <div
      className="global-search-overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "min(12vh, 104px) 14px 24px", background: "var(--overlay)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}
    >
      <style>{`
        @keyframes global-search-in { from { opacity: 0; transform: translateY(-10px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes global-search-spin { to { transform: rotate(360deg); } }
        .global-search-row:hover { background: var(--panel-2) !important; }
        @media (max-width: 640px) {
          .global-search-shell { width: 100% !important; max-height: calc(100vh - 28px) !important; }
          .global-search-overlay { padding: 14px 8px !important; }
          .global-search-shortcut { display: none !important; }
          .global-search-footer { display: none !important; }
        }
      `}</style>
      <div
        className="global-search-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
        style={{ width: "min(720px, calc(100vw - 28px))", maxHeight: "min(76vh, 680px)", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: `1px solid ${C.b1}`, background: C.panelSolid, color: C.text, boxShadow: "0 30px 100px rgba(0,0,0,.48)", fontFamily: C.sans, animation: "global-search-in .18s cubic-bezier(.22,1,.36,1) both" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 0" }}>
          <button
            type="button"
            onClick={() => changeMode("search")}
            style={{ minHeight: 32, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 9, border: `1px solid ${!assistantMode ? C.blueB : "transparent"}`, background: !assistantMode ? C.blueL : "transparent", color: !assistantMode ? C.blue : C.muted, fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, cursor: "pointer" }}
          >
            <Search size={14} /> Buscar
          </button>
          {assistantEnabled && (
            <button
              type="button"
              onClick={() => changeMode("assistant")}
              style={{ minHeight: 32, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 9, border: `1px solid ${assistantMode ? C.violetB : "transparent"}`, background: assistantMode ? C.violetL : "transparent", color: assistantMode ? C.violet : C.muted, fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, cursor: "pointer" }}
            >
              <Sparkles size={14} /> Preguntar a la IA <span style={{ fontSize: 8.5, opacity: .78 }}>BETA</span>
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 62, padding: "0 14px 0 18px", borderBottom: `1px solid ${C.border}` }}>
          {loading || assistantLoading ? <LoaderCircle size={20} color={assistantMode ? C.violet : C.blue} style={{ flexShrink: 0, animation: "global-search-spin .75s linear infinite" }} /> : assistantMode ? <Sparkles size={20} color={C.violet} style={{ flexShrink: 0 }} /> : <Search size={20} color={C.blue} style={{ flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={assistantMode ? "Preguntale algo sobre Klase A…" : "Buscar obra, material, pedido, solicitud o persona…"}
            autoComplete="off"
            spellCheck="false"
            style={{ flex: 1, minWidth: 0, height: 60, border: 0, outline: 0, background: "transparent", color: C.text, fontFamily: C.sans, fontSize: 16, fontWeight: 600 }}
          />
          {query && <button type="button" onClick={() => setQuery("")} title="Limpiar búsqueda" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: 0, borderRadius: 8, background: "transparent", color: C.dim, cursor: "pointer" }}><X size={16} /></button>}
          {assistantMode && (
            <button type="button" onClick={() => submitAssistant()} disabled={query.trim().length < 3 || assistantLoading} title="Preguntar" style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${C.violetB}`, borderRadius: 9, background: C.violetL, color: C.violet, cursor: query.trim().length >= 3 && !assistantLoading ? "pointer" : "not-allowed", opacity: query.trim().length >= 3 && !assistantLoading ? 1 : .45 }}><Send size={15} /></button>
          )}
          <kbd className="global-search-shortcut" style={{ border: `1px solid ${C.b1}`, borderRadius: 7, background: C.panel2, color: C.dim, padding: "4px 7px", fontFamily: C.mono, fontSize: 10 }}>ESC</kbd>
        </div>

        <div style={{ overflowY: "auto", overscrollBehavior: "contain", padding: "10px 8px 12px", minHeight: 150 }}>
          {assistantMode && !assistantMessages.length && (
            <div style={{ padding: "18px 14px 22px" }}>
              <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, marginBottom: 12 }}><Sparkles size={19} /></div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 900 }}>Asistente Klase A</div>
              <div style={{ maxWidth: 530, color: C.dim, fontSize: 12, lineHeight: 1.55, marginTop: 5 }}>Te orienta dentro del sistema y resume registros coincidentes. Es de sólo lectura: no compra, no ingresa ni modifica datos.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 16 }}>
                {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => submitAssistant(suggestion)} style={{ minHeight: 34, padding: "7px 10px", borderRadius: 9, border: `1px solid ${C.b1}`, background: C.panel2, color: C.muted, fontFamily: C.sans, fontSize: 11, textAlign: "left", cursor: "pointer" }}>{suggestion}</button>
                ))}
              </div>
            </div>
          )}
          {assistantMode && assistantMessages.length > 0 && (
            <div style={{ display: "grid", gap: 10, padding: "4px 8px 8px" }}>
              {assistantMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} style={{ justifySelf: message.role === "user" ? "end" : "stretch", maxWidth: message.role === "user" ? "86%" : "100%", padding: message.role === "user" ? "9px 11px" : "12px", borderRadius: 11, border: `1px solid ${message.role === "user" ? C.blueB : C.violetB}`, background: message.role === "user" ? C.blueL : C.violetL, color: C.text }}>
                  {message.role === "assistant" && <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.violet, fontSize: 9.5, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 7 }}><Sparkles size={12} /> Asistente</div>}
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.58 }}>{assistantDisplayText(message.content)}</div>
                  {!!message.links?.length && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {message.links.map((link) => <button key={`${link.path}-${link.label}`} type="button" onClick={() => goTo(link)} style={{ minHeight: 29, padding: "0 9px", borderRadius: 8, border: `1px solid ${C.violetB}`, background: C.panelSolid, color: C.violet, fontFamily: C.sans, fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>{link.label} <ArrowRight size={10} style={{ marginLeft: 4, verticalAlign: -1 }} /></button>)}
                    </div>
                  )}
                </div>
              ))}
              {assistantLoading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim, fontSize: 11.5, padding: "5px 8px" }}><LoaderCircle size={14} style={{ animation: "global-search-spin .75s linear infinite" }} /> Buscando contexto y preparando respuesta…</div>}
            </div>
          )}
          {assistantMode && assistantError && (
            <div style={{ margin: "8px", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 11.5 }}>{assistantError}</div>
          )}
          {!assistantMode && <>
          {!hasQuery && (
            <div style={{ padding: "3px 10px 9px", color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
              Accesos rápidos
            </div>
          )}
          {query.trim().length === 1 && (
            <div style={{ minHeight: 130, display: "grid", placeItems: "center", color: C.dim, fontSize: 12.5 }}>Escribí al menos 2 caracteres.</div>
          )}
          {noResults && (
            <div style={{ minHeight: 180, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
              <div>
                <Search size={28} color={C.dim} style={{ marginBottom: 10 }} />
                <div style={{ color: C.text, fontSize: 14, fontWeight: 850 }}>No encontramos “{query.trim()}”</div>
                <div style={{ color: C.dim, fontSize: 12, marginTop: 5 }}>Probá con menos palabras, un código, DNI o número de solicitud.</div>
              </div>
            </div>
          )}
          {shownGroups.map((group) => {
            const groupMeta = group.key === "accesos" ? null : GROUP_META[group.key];
            return (
              <section key={group.key} style={{ marginBottom: 8 }}>
                {groupMeta && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px 5px", color: groupMeta.color, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
                    <groupMeta.Icon size={12} strokeWidth={2} /> {groupMeta.label}
                    <span style={{ color: C.dim, fontFamily: C.mono }}>{group.items.length}</span>
                  </div>
                )}
                <div style={{ display: "grid", gap: 3 }}>
                  {group.items.map((item) => {
                    globalIndex += 1;
                    const index = globalIndex;
                    const active = index === activeIndex;
                    const key = group.key === "accesos" ? item.key : group.key;
                    return (
                      <button
                        key={`${key}-${item.id}`}
                        ref={(node) => { if (node) rowRefs.current.set(index, node); else rowRefs.current.delete(index); }}
                        type="button"
                        className="global-search-row"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goTo(item)}
                        style={{ width: "100%", minHeight: 54, display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", border: `1px solid ${active ? C.blueB : "transparent"}`, borderRadius: 10, background: active ? C.blueL : "transparent", color: C.text, cursor: "pointer", textAlign: "left", fontFamily: C.sans, transition: "background .12s ease, border-color .12s ease" }}
                      >
                        <ResultIcon groupKey={key} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 850 }}>{item.title}</span>
                            {item.status && <span style={{ flexShrink: 0, borderRadius: 999, padding: "2px 6px", background: C.panel2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 9.5, fontWeight: 850 }}>{STATUS_LABELS[item.status] || item.status}</span>}
                          </span>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.dim, fontSize: 11.5, marginTop: 3 }}>{item.subtitle}</span>
                        </span>
                        {item.meta && <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.dim, fontSize: 10.5 }}>{item.meta}</span>}
                        <ArrowRight size={14} color={active ? C.blue : C.dim} style={{ flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!!errors.length && !loading && (
            <div title={errors.map((error) => `${error.key}: ${error.message}`).join("\n")} style={{ margin: "8px 10px 2px", padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, fontSize: 10.5 }}>
              Algunas secciones no respondieron. Podés seguir usando los resultados visibles.
            </div>
          )}
          </>}
        </div>

        <div className="global-search-footer" style={{ minHeight: 38, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 13px", borderTop: `1px solid ${C.border}`, background: C.panel2, color: C.dim, fontSize: 10.5 }}>
          <span>{assistantMode ? "IA gratuita · puede tener límites o demoras." : "Buscá también por código, DNI, proveedor o número."}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>{!assistantMode && <span>↑ ↓ recorrer</span>}<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CornerDownLeft size={11} /> {assistantMode ? "preguntar" : "abrir"}</span></span>
        </div>
      </div>
    </div>
  );
}
