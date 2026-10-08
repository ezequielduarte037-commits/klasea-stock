import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Bell, Check, CheckCheck, CheckCircle2, ChevronRight,
  Info, LoaderCircle, PackageOpen, RefreshCw, Search, ShoppingCart, Truck, X,
} from "lucide-react";
import PushNotificationsControl from "@/components/PushNotificationsControl";
import useNotificaciones from "@/hooks/useNotificaciones";
import { hasAdminAccess } from "@/lib/permissions";
import { debeMostrarToast, operationalRole, requiereAccionDirecta } from "@/lib/notificacionesAudience";
import { filterNotifications, groupNotifications } from "@/lib/notificacionesPresentation";
import { C } from "@/theme";

const TYPE_UI = {
  recepcion: { label: "Pañol", color: C.blue, soft: C.blueL, border: C.blueB, icon: PackageOpen },
  produccion: { label: "Producción", color: C.cyan, soft: C.cyanL, border: C.cyanB, icon: AlertTriangle },
  compras: { label: "Compras", color: C.green, soft: C.greenL, border: C.greenB, icon: ShoppingCart },
  logistica: { label: "Logística", color: C.violet, soft: C.violetL, border: C.violetB, icon: Truck },
};
const GRAVITY_UI = {
  critical: { color: C.red, soft: C.redL, border: C.redB, label: "Urgente" },
  warning: { color: C.violet, soft: C.violetL, border: C.violetB, label: "Atención" },
  success: { color: C.green, soft: C.greenL, border: C.greenB, label: "Confirmación" },
  info: { color: C.blue, soft: C.blueL, border: C.blueB, label: "Novedad" },
};
const TOAST_MS = 9_000;
const MAX_TOASTS = 2;

function needsAttention(item) {
  return !item.leida && (requiereAccionDirecta(item) || item.requiereAccion === true);
}

// Las filas van agrupadas por día ("Hoy", "Ayer", "6 de octubre"): alcanza la hora.
function fmtFecha(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

function actionLabel(item) {
  if (!item?.ruta) return "Marcar como leída";
  if (item.tipo === "compras") return "Abrir pedido";
  if (item.tipo === "logistica") return "Ver movimiento";
  if (item.tipo === "recepcion") return "Ver recepción";
  if (item.tipo === "produccion") return "Ver alerta";
  return "Abrir";
}

/** La campana abre un panel accesible; en el celular ocupa la pantalla útil. */
export default function NotificacionesBell({ profile, size = 28, iconSize = 15, estiloBoton = null }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("todos");
  const [state, setState] = useState("todos");
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [bellPulse, setBellPulse] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [resolvingKey, setResolvingKey] = useState(null);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);
  const toastSeenRef = useRef(new Set());
  const originalTitleRef = useRef(null);
  const panelId = useId();
  const navigate = useNavigate();
  const isAdmin = hasAdminAccess(profile);
  const {
    lista, unreadCount, loading, ready, errorLogistica, errorCarga, errorLecturas,
    recargar, freshEvents, consumeFreshEvents, markLeido, markTodoLeido, resolverAlerta,
  } = useNotificaciones(profile);
  const urgentCount = lista.filter((item) => !item.leida && item.gravedad === "critical").length;
  const attentionCount = lista.filter(needsAttention).length;
  const loadError = errorCarga || (errorLogistica ? "No pudimos actualizar los avisos de Logística." : "");
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const filtered = useMemo(() => filterNotifications(lista, { search, type, state }, needsAttention), [lista, search, state, type]);
  const groups = useMemo(() => groupNotifications(filtered, needsAttention), [filtered]);
  const types = useMemo(() => Object.keys(TYPE_UI).filter((key) => lista.some((item) => item.tipo === key)), [lista]);

  const closePanel = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => {
      const target = openerRef.current?.isConnected ? openerRef.current : bellRef.current;
      target?.focus({ preventScroll: true });
    });
  }, []);

  const ubicar = useCallback(() => {
    if (!bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(500, window.innerWidth - margin * 2);
    const above = rect.top > window.innerHeight / 2;
    const space = above ? rect.top - margin * 2 : window.innerHeight - rect.bottom - margin * 2;
    setPos({
      width, left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      ...(above ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      maxHeight: Math.max(300, Math.min(780, space)),
      viewportHeight: Math.round(window.visualViewport?.height || window.innerHeight),
      viewportTop: Math.round(window.visualViewport?.offsetTop || 0),
    });
  }, []);

  useEffect(() => {
    originalTitleRef.current = document.title || "Klase A";
    return () => { document.title = originalTitleRef.current || "Klase A"; };
  }, []);

  useEffect(() => {
    const base = originalTitleRef.current || "Klase A";
    document.title = urgentCount ? `(${unreadCount}) ${urgentCount} urgente${urgentCount === 1 ? "" : "s"} · ${base}`
      : unreadCount ? `(${unreadCount}) Notificaciones · ${base}` : base;
  }, [unreadCount, urgentCount]);

  useEffect(() => {
    setOpen(false);
    setToasts([]);
    setSearch("");
    setType("todos");
    setState("todos");
    setActionError("");
    toastSeenRef.current = new Set();
  }, [profile?.id]);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement?.closest("button") || bellRef.current;
    ubicar();
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = [...panelRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]')]
        .filter((node) => node.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", ubicar);
    window.visualViewport?.addEventListener("resize", ubicar);
    window.visualViewport?.addEventListener("scroll", ubicar);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", ubicar);
      window.visualViewport?.removeEventListener("resize", ubicar);
      window.visualViewport?.removeEventListener("scroll", ubicar);
    };
  }, [closePanel, open, ubicar]);

  // La primera carga no muestra avisos históricos. Cada cambio fresco aparece una vez.
  useEffect(() => {
    if (!ready || !freshEvents?.length) return;
    const candidates = freshEvents.filter((item) => debeMostrarToast(item) && !toastSeenRef.current.has(`${item.clave}@${item.fecha || ""}`));
    consumeFreshEvents();
    if (!candidates.length) return;
    for (const item of candidates) toastSeenRef.current.add(`${item.clave}@${item.fecha || ""}`);
    if (open) return;
    setBellPulse(true);
    setToasts((prev) => {
      const keep = candidates.length > 1 ? [] : prev.filter((toast) => toast.kind !== "summary").slice(-1);
      const room = MAX_TOASTS - keep.length;
      const take = candidates.slice(0, candidates.length > room ? Math.max(0, room - 1) : room);
      const rest = candidates.length - take.length;
      return [
        ...keep,
        ...take.map((item) => ({ kind: "item", id: item.id, raw: item, expires: Date.now() + (item.gravedad === "critical" ? 12_000 : TOAST_MS) })),
        ...(rest ? [{ kind: "summary", id: `summary-${Date.now()}`, count: rest, expires: Date.now() + TOAST_MS }] : []),
      ].slice(0, MAX_TOASTS);
    });
  }, [consumeFreshEvents, freshEvents, open, ready]);

  useEffect(() => {
    if (!bellPulse) return undefined;
    const timer = window.setTimeout(() => setBellPulse(false), 800);
    return () => window.clearTimeout(timer);
  }, [bellPulse]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = window.setInterval(() => setToasts((prev) => prev.filter((toast) => toast.expires > Date.now())), 500);
    return () => window.clearInterval(timer);
  }, [toasts.length]);

  if (!profile || operationalRole(profile) === "cliente") return null;

  function dismissToast(id) { setToasts((prev) => prev.filter((toast) => toast.id !== id)); }

  function openNotification(item) {
    markLeido(item);
    dismissToast(item.id);
    if (item.ruta) {
      closePanel(false);
      navigate(item.ruta);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setActionError("");
    try { await recargar?.(); }
    catch { setActionError("No pudimos actualizar los avisos. Reintentá en un momento."); }
    finally { setRefreshing(false); }
  }

  async function resolve(item) {
    if (!resolverAlerta || !item.meta?.alerta?.id) return;
    setResolvingKey(item.clave);
    setActionError("");
    try {
      await resolverAlerta(item.meta.alerta.id, profile?.username ?? "usuario");
      markLeido(item);
    } catch { setActionError("No se pudo resolver la alerta. Sigue pendiente; reintentá en un momento."); }
    finally { setResolvingKey(null); }
  }

  const busy = loading || refreshing;
  const hasFilter = search.trim() || type !== "todos" || state !== "todos";
  const controls = {
    border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 10,
    minHeight: 44, cursor: "pointer", fontFamily: C.sans, fontWeight: 700, fontSize: 12,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <style>{`
        @keyframes notifBellNudge { 25% { transform: rotate(-12deg); } 55% { transform: rotate(10deg); } }
        @keyframes notifEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes notifSpin { to { transform: rotate(360deg); } }
        .notif-spin { animation: notifSpin 1s linear infinite; }
        .notif-panel button:focus-visible, .notif-panel input:focus-visible, .notif-panel select:focus-visible,
        .notif-panel summary:focus-visible, .notif-bell:focus-visible, .notif-toast button:focus-visible {
          outline: 2px solid var(--blue); outline-offset: -2px;
        }
        .notif-control:hover:not(:disabled), .notif-filter:hover, .notif-row:hover { background: var(--panel-2) !important; }
        .notif-row-open:hover .notif-open-label { text-decoration: underline; text-underline-offset: 3px; }
        .notif-list { scrollbar-width: thin; overscroll-behavior: contain; }
        .notif-panel-footer:empty { display: none; }
        @media (max-width: 600px) {
          .notif-panel { left: 8px !important; right: 8px; top: calc(var(--notif-viewport-top, 0px) + env(safe-area-inset-top) + 8px) !important;
            bottom: auto !important; height: calc(var(--notif-viewport-height, 100dvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px);
            width: auto !important; max-height: none !important;
            border-radius: 20px !important; }
          .notif-panel-footer { max-height: min(40dvh, calc(var(--notif-viewport-height, 100dvh) * .4), 300px) !important; flex-shrink: 1 !important; min-height: 0; }
          .notif-list { min-height: min(120px, calc(var(--notif-viewport-height, 100dvh) * .2)) !important; }
          .notif-filters { flex-wrap: wrap; }
          .notif-type-select { flex: 1; min-width: 110px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .notif-panel, .notif-toast, .notif-bell { animation: none !important; transition: none !important; }
        }
      `}</style>
      <button
        ref={bellRef} type="button" className="notif-bell"
        onClick={() => open ? closePanel() : setOpen(true)}
        title="Notificaciones" aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer${urgentCount ? `, ${urgentCount} urgentes` : ""}` : "Notificaciones"}
        aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined}
        style={{
          width: size, height: size, position: "relative", borderRadius: 8, padding: 0,
          border: `1px solid ${urgentCount ? C.redB : unreadCount ? C.blueB : C.border}`,
          color: urgentCount ? C.red : unreadCount ? C.blue : C.dim,
          background: urgentCount ? C.redL : open ? C.panel2 : C.panel,
          display: "grid", placeItems: "center", cursor: "pointer", boxSizing: "border-box",
          ...(estiloBoton || {}), ...(bellPulse && !reducedMotion ? { animation: "notifBellNudge .7s ease-out" } : {}),
        }}
      >
        <Bell size={iconSize} aria-hidden="true" />
        {unreadCount > 0 && <span aria-hidden="true" style={{
          position: "absolute", right: -6, top: -6, minWidth: 16, height: 16, padding: "0 4px",
          display: "grid", placeItems: "center", borderRadius: 99, background: urgentCount ? C.red : C.blue,
          color: "#fff", border: `2px solid ${C.bg}`, fontSize: 9, fontWeight: 750, fontFamily: C.mono, pointerEvents: "none",
        }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && createPortal(<>
        <div aria-hidden="true" onClick={() => closePanel()} style={{
          position: "fixed", inset: 0, zIndex: 8999, background: "color-mix(in srgb, var(--bg) 65%, transparent)",
        }} />
        <div ref={panelRef} id={panelId} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}
          className="notif-panel" style={{
            position: "fixed", zIndex: 9000, left: pos?.left ?? 12, ...(pos && "bottom" in pos ? { bottom: pos.bottom } : { top: pos?.top ?? 12 }),
            width: pos?.width ?? "min(500px, calc(100vw - 24px))", maxHeight: pos?.maxHeight ?? "calc(100dvh - 24px)",
            "--notif-viewport-height": pos?.viewportHeight ? `${pos.viewportHeight}px` : "100dvh",
            "--notif-viewport-top": `${pos?.viewportTop || 0}px`,
            background: C.panelSolid, color: C.text, border: `1px solid ${C.border}`, borderRadius: 18,
            boxShadow: "0 20px 64px var(--shadow-strong)", display: "flex", flexDirection: "column", overflow: "hidden",
            fontFamily: C.sans, animation: reducedMotion ? "none" : "notifEnter .18s ease-out",
          }}>
          <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ width: 36, height: 36, background: C.blueL, color: C.blue, border: `1px solid ${C.blueB}`, borderRadius: 11, display: "grid", placeItems: "center" }}><Bell size={18} aria-hidden="true" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={`${panelId}-title`} style={{ fontSize: 17, fontWeight: 750, lineHeight: 1.2, margin: 0 }}>Notificaciones</h2>
              <div style={{ fontSize: 12, color: urgentCount ? C.red : C.dim, marginTop: 4 }}>
                {busy ? "Actualizando avisos…" : urgentCount ? `${urgentCount} urgente${urgentCount === 1 ? "" : "s"} · ${unreadCount} sin leer`
                  : unreadCount ? `${unreadCount} sin leer${attentionCount ? ` · ${attentionCount} necesitan atención` : ""}`
                    : loadError || errorLecturas ? "Actualización pendiente" : "Estás al día"}
              </div>
            </div>
            <button type="button" className="notif-control" title="Actualizar avisos" aria-label="Actualizar avisos" disabled={busy} onClick={refresh}
              style={{ ...controls, width: 44, opacity: busy ? 0.5 : 1 }}><RefreshCw size={16} className={busy ? "notif-spin" : undefined} aria-hidden="true" /></button>
            <button ref={closeRef} type="button" className="notif-control" title="Cerrar notificaciones" aria-label="Cerrar notificaciones" onClick={() => closePanel()}
              style={{ ...controls, width: 44 }}><X size={18} aria-hidden="true" /></button>
          </div>

          <div style={{ padding: "0 16px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 11px" }}>
              <Search size={16} color={C.dim} aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar notificaciones" placeholder="Buscar aviso, obra o movimiento…"
                style={{ border: 0, background: "transparent", color: C.text, padding: "11px 0", width: "100%", minWidth: 0, minHeight: 44, fontSize: 16, fontFamily: C.sans }} />
            </div>
            <div className="notif-filters" style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 9 }}>
              <FilterTab active={state === "todos"} onClick={() => setState("todos")}>Todas</FilterTab>
              <FilterTab active={state === "sin-leer"} onClick={() => setState("sin-leer")}>Sin leer{unreadCount ? ` · ${unreadCount}` : ""}</FilterTab>
              <FilterTab active={state === "atencion"} onClick={() => setState("atencion")}>Atención{attentionCount ? ` · ${attentionCount}` : ""}</FilterTab>
              <select className="notif-type-select" aria-label="Filtrar notificaciones por módulo" value={type} onChange={(event) => setType(event.target.value)}
                style={{ ...controls, marginLeft: "auto", padding: "0 9px", maxWidth: "100%", minWidth: 0, flexShrink: 1, color: type === "todos" ? C.dim : C.text }}>
                <option value="todos">Módulos</option>
                {types.map((key) => <option key={key} value={key}>{TYPE_UI[key].label}</option>)}
                {type !== "todos" && !types.includes(type) && <option value={type}>{TYPE_UI[type]?.label || type}</option>}
              </select>
            </div>
          </div>

          {(loadError || errorLecturas || actionError) && <div role="status" style={{ padding: "10px 16px", flexShrink: 0, borderBottom: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 12, lineHeight: 1.45 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
              <div style={{ flex: 1 }}>{actionError || loadError || "No pudimos sincronizar las notificaciones leídas entre tus dispositivos."}
                {loadError && <span style={{ display: "block", marginTop: 2 }}>Los avisos cargados se conservan. Reintentá para comprobar las novedades.</span>}
              </div>
              <button type="button" className="notif-control" onClick={refresh} disabled={busy} style={{ ...controls, padding: "0 9px", color: C.red, background: "transparent", borderColor: C.redB }}>Reintentar</button>
            </div>
          </div>}

          <div className="notif-list" aria-busy={busy} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <PushNotificationsControl profile={profile} modo="invitacion" />
            {busy && !lista.length ?<div role="status" style={{ padding: "40px 20px", textAlign: "center", color: C.dim, fontSize: 13 }}>
              <LoaderCircle className="notif-spin" size={24} style={{ marginBottom: 10 }} aria-hidden="true" /><div>Cargando tus avisos…</div>
            </div> : !filtered.length ? <div style={{ padding: "36px 22px", textAlign: "center", color: C.dim }}>
              {hasFilter ? <Search size={28} style={{ color: C.blue, marginBottom: 12 }} aria-hidden="true" />
                : loadError ? <AlertTriangle size={28} style={{ color: C.red, marginBottom: 12 }} aria-hidden="true" />
                  : <CheckCircle2 size={28} style={{ color: C.green, marginBottom: 12 }} aria-hidden="true" />}
              <div style={{ fontSize: 15, color: C.text, fontWeight: 750 }}>{hasFilter ? "No hay avisos con estos filtros" : loadError ? "No pudimos comprobar las novedades" : "Estás al día"}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>{hasFilter ? "Probá con otra búsqueda o mostrálos todos." : loadError ? "Reintentá cuando tengas conexión." : "Acá vas a encontrar las novedades y tareas relacionadas con tu trabajo."}</div>
              {hasFilter && <button type="button" className="notif-control" onClick={() => { setSearch(""); setType("todos"); setState("todos"); }} style={{ ...controls, marginTop: 14, padding: "0 12px", color: C.blue }}>Limpiar filtros</button>}
            </div> : groups.map((group) => <section key={group.key} aria-label={group.label}>
              <div style={{ padding: "12px 16px 9px", background: C.panelSolid2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6 }}>
                {group.key === "atencion" && <AlertTriangle size={13} color={C.violet} aria-hidden="true" />}
                <h3 style={{ fontSize: 11, fontWeight: 750, letterSpacing: ".04em", color: group.key === "atencion" ? C.violet : C.dim, textTransform: "uppercase", margin: 0 }}>{group.label}</h3>
                <span style={{ color: C.dim, fontSize: 11 }}>{group.items.length}</span>
              </div>
              {group.dates.map((bucket) => <div key={bucket.key}>
                <div style={{ padding: "9px 16px 5px", fontSize: 11, fontWeight: 650, color: C.dim }}>{bucket.label}</div>
                {bucket.items.map((item) => <NotifRow key={item.id} item={item} isAdmin={isAdmin}
                  onOpen={() => openNotification(item)} onRead={() => markLeido(item)} onResolve={() => resolve(item)} resolving={resolvingKey === item.clave} />)}
              </div>)}
            </section>)}
          </div>

          {/* Pie de una sola línea: estado de los avisos al celular (se despliega
              al tocarlo) y marcar todo leído. El contador ya está en el encabezado. */}
          <div className="notif-panel-footer" style={{ flexShrink: 0, maxHeight: "min(40dvh, 300px)", overflowY: "auto", padding: "4px 8px", borderTop: `1px solid ${C.border}`, background: C.panelSolid2,
            display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6 }}>
            <PushNotificationsControl profile={profile} />
            {hasFilter && !!lista.length && <span style={{ fontSize: 11, color: C.dim, marginLeft: "auto" }}>{filtered.length} en esta vista</span>}
            {!!unreadCount && <button type="button" className="notif-control" onClick={markTodoLeido} title="Marcar todas las notificaciones como leídas, incluso las filtradas"
              style={{ ...controls, marginLeft: hasFilter ? 0 : "auto", padding: "0 10px", fontSize: 12, fontWeight: 600, color: C.blue, border: "1px solid transparent", background: "transparent" }}><CheckCheck size={15} aria-hidden="true" />Marcar todas leídas</button>}
          </div>
        </div>
      </>, document.body)}

      {!open && toasts.length > 0 && createPortal(<div aria-live="polite" aria-label="Avisos nuevos" style={{
        position: "fixed", top: size >= 40 ? "calc(68px + env(safe-area-inset-top))" : "max(16px, env(safe-area-inset-top))",
        right: "max(12px, env(safe-area-inset-right))", zIndex: 9500, display: "flex", flexDirection: "column", gap: 8,
        width: "min(390px, calc(100vw - 24px))", pointerEvents: "none", fontFamily: C.sans,
      }}>{toasts.map((toast) => {
        const item = toast.raw;
        const gravity = GRAVITY_UI[item?.gravedad] || GRAVITY_UI.info;
        const Icon = toast.kind === "summary" ? Info : TYPE_UI[item?.tipo]?.icon || Bell;
        return <div key={toast.id} className="notif-toast" style={{
          pointerEvents: "auto", display: "grid", gridTemplateColumns: "32px minmax(0, 1fr) 40px", gap: 9, padding: "12px 10px",
          borderRadius: 14, background: C.panelSolid, border: `1px solid ${gravity.border}`, borderLeft: `3px solid ${gravity.color}`,
          boxShadow: "0 12px 32px var(--shadow-strong)", animation: reducedMotion ? "none" : "notifEnter .2s ease-out",
        }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color: gravity.color, background: gravity.soft }}><Icon size={16} aria-hidden="true" /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 750, color: gravity.color, marginBottom: 3 }}>{item?.gravedad === "critical" ? "Aviso urgente" : "Nueva notificación"}</div>
            <div style={{ fontSize: 13, fontWeight: 750, color: C.text, overflowWrap: "anywhere" }}>{item?.titulo || `${toast.count} notificación${toast.count === 1 ? "" : "es"} nueva${toast.count === 1 ? "" : "s"}`}</div>
            <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>{item?.detalle || "Abrí la campana para verlas."}</div>
            <button type="button" className="notif-control" onClick={() => {
              if (item) openNotification(item); else { setOpen(true); dismissToast(toast.id); }
            }} style={{ ...controls, color: C.blue, background: C.blueL, borderColor: C.blueB, padding: "0 10px", marginTop: 8 }}>{item ? actionLabel(item) : "Ver avisos"}<ChevronRight size={13} aria-hidden="true" /></button>
          </div>
          <button type="button" className="notif-control" aria-label="Cerrar aviso" onClick={() => dismissToast(toast.id)} style={{ ...controls, width: 40, border: 0, background: "transparent" }}><X size={16} aria-hidden="true" /></button>
        </div>;
      })}</div>, document.body)}
    </div>
  );
}

function FilterTab({ active, onClick, children }) {
  return <button type="button" className="notif-filter" aria-pressed={active} onClick={onClick} style={{
    border: `1px solid ${active ? C.blueB : "transparent"}`, background: active ? C.blueL : "transparent",
    color: active ? C.blue : C.dim, borderRadius: 8, minHeight: 44, padding: "0 9px", cursor: "pointer",
    fontSize: 11.5, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap", flexShrink: 0,
  }}>{children}</button>;
}

function NotifRow({ item, isAdmin, onOpen, onRead, onResolve, resolving }) {
  const cfg = TYPE_UI[item.tipo] || { label: "Aviso", color: C.blue, soft: C.blueL, border: C.blueB, icon: Bell };
  const Icon = cfg.icon;
  const gravity = GRAVITY_UI[item.gravedad] || GRAVITY_UI.info;
  const unread = !item.leida;
  const canResolve = isAdmin && item.tipo === "produccion" && !!item.meta?.alerta?.id;
  return <article className="notif-row" style={{
    borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${unread ? gravity.color : "transparent"}`,
    background: unread && item.gravedad === "critical" ? C.redL : "transparent", transition: "background .15s ease",
  }}>
    <button type="button" onClick={onOpen} className="notif-row-open" style={{
      display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 10, padding: "12px 13px 4px",
      width: "100%", background: "transparent", border: 0, color: C.text, cursor: "pointer", textAlign: "left", fontFamily: C.sans,
    }} aria-label={`${actionLabel(item)}: ${item.titulo}`}>
      <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 10, color: cfg.color, background: cfg.soft, border: `1px solid ${cfg.border}` }}><Icon size={16} aria-hidden="true" /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: cfg.color, fontSize: 10.5, fontWeight: 750 }}>{cfg.label}</span>
          {item.gravedad === "critical" && <span style={{ background: gravity.soft, color: gravity.color, border: `1px solid ${gravity.border}`, borderRadius: 5, padding: "1px 5px", fontSize: 10, fontWeight: 750 }}>Urgente</span>}
          {unread && <span style={{ width: 5, height: 5, borderRadius: 99, background: gravity.color }} title="Sin leer" />}
          <time dateTime={item.fecha || undefined} style={{ marginLeft: "auto", fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{fmtFecha(item.fecha)}</time>
        </span>
        <span style={{ display: "block", color: C.text, fontSize: 13.5, fontWeight: unread ? 750 : 600, lineHeight: 1.35, marginTop: 5, overflowWrap: "anywhere" }}>{item.titulo}</span>
        <span style={{ display: "block", color: C.muted, fontSize: 12.5, lineHeight: 1.45, marginTop: 4, overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{item.detalle}</span>
      </span>
    </button>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "0 12px 7px 57px" }}>
      <button type="button" className="notif-control notif-row-open" onClick={onOpen} style={{
        border: 0, background: "transparent", color: C.blue, display: "inline-flex", alignItems: "center", gap: 2,
        fontSize: 11.5, fontWeight: 750, fontFamily: C.sans, minHeight: 44, padding: "0 2px", cursor: "pointer",
      }}><span className="notif-open-label">{actionLabel(item)}</span><ChevronRight size={14} aria-hidden="true" /></button>
      {canResolve && <button type="button" className="notif-control" onClick={onResolve} disabled={resolving} style={{
        border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 8, minHeight: 44,
        padding: "0 8px", cursor: resolving ? "wait" : "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 700,
      }}>{resolving ? "Resolviendo…" : "Resolver alerta"}</button>}
      {unread && item.ruta && <button type="button" className="notif-control" onClick={onRead} title="Marcar como leída sin abrir" aria-label={`Marcar como leída: ${item.titulo}`} style={{
        marginLeft: "auto", border: 0, background: "transparent", color: C.dim, display: "grid", placeItems: "center",
        borderRadius: 8, width: 44, minHeight: 44, cursor: "pointer",
      }}><Check size={16} aria-hidden="true" /></button>}
      {!unread && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: C.dim }}><CheckCheck size={12} aria-hidden="true" />Leída</span>}
    </div>
  </article>;
}
