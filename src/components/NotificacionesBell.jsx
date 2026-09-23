import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CheckCheck,
  CheckCircle2,
  Info,
  PackageOpen,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import useNotificaciones from "@/hooks/useNotificaciones";
import { hasAdminAccess } from "@/lib/permissions";
import {
  PRIORIDAD_LABEL,
  debeMostrarToast,
  operationalRole,
  requiereAccionDirecta,
} from "@/lib/notificacionesAudience";
import { C } from "@/theme";

const TYPE_UI = {
  recepcion: { label: "Recepción", color: C.blue, soft: C.blueL, border: C.blueB, icon: PackageOpen },
  produccion: { label: "Producción", color: C.cyan, soft: C.cyanL, border: C.cyanB, icon: AlertTriangle },
  compras: { label: "Compras", color: C.green, soft: C.greenL, border: C.greenB, icon: ShoppingCart },
  logistica: { label: "Logística", color: C.blue, soft: C.blueL, border: C.blueB, icon: Truck },
};

const GRAVITY_UI = {
  critical: { color: C.red, soft: C.redL, border: C.redB, label: PRIORIDAD_LABEL.critical },
  warning: { color: C.violet, soft: C.violetL, border: C.violetB, label: PRIORIDAD_LABEL.warning },
  success: { color: C.green, soft: C.greenL, border: C.greenB, label: PRIORIDAD_LABEL.success },
  info: { color: C.blue, soft: C.blueL, border: C.blueB, label: PRIORIDAD_LABEL.info },
};

const TOAST_MS = 9000;
const MAX_TOASTS = 2;

function fmtFecha(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function counterByType(lista) {
  const sinLeer = lista.filter((item) => !item.leida);
  const out = { todos: sinLeer.length, recepcion: 0, produccion: 0, compras: 0, logistica: 0 };
  for (const item of sinLeer) out[item.tipo] = (out[item.tipo] || 0) + 1;
  return out;
}

function sectionOf(item) {
  if (item.leida) return "anteriores";
  if (item.gravedad === "critical" || requiereAccionDirecta(item) || item.requiereAccion) return "accion";
  return "novedades";
}

function actionLabel(item) {
  if (!item) return "Ver avisos";
  if (item.tipo === "compras") return "Abrir pedido";
  if (item.tipo === "logistica") return "Ver movimiento";
  if (item.tipo === "recepcion") return "Ver recepción";
  if (item.tipo === "produccion") return "Ver alerta";
  return "Abrir";
}

/**
 * Campanita dentro del sidebar. El panel sale por portal (el aside tiene overflow).
 */
export default function NotificacionesBell({ profile, size = 28, iconSize = 15, estiloBoton = null }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("todos");
  const [pos, setPos] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [bellPulse, setBellPulse] = useState(false);
  const [badgePulse, setBadgePulse] = useState(false);
  const [panelEnter, setPanelEnter] = useState(false);
  const ref = useRef(null);
  const attentionRef = useRef(null);
  const attentionAnchorRef = useRef(false);
  const panelRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const toastSeenRef = useRef(new Set());
  const originalTitleRef = useRef(null);
  const navigate = useNavigate();
  const isAdmin = hasAdminAccess(profile);
  const {
    lista,
    unreadCount,
    loading,
    ready,
    freshEvents,
    consumeFreshEvents,
    markLeido,
    markTodoLeido,
    resolverAlerta,
  } = useNotificaciones(profile);
  const urgentesSinLeer = lista.filter((item) => !item.leida && item.gravedad === "critical").length;
  const hayUrgentes = urgentesSinLeer > 0;

  useEffect(() => {
    originalTitleRef.current = document.title || "Klase A";
    return () => { document.title = originalTitleRef.current || "Klase A"; };
  }, []);

  useEffect(() => {
    const base = originalTitleRef.current || "Klase A";
    document.title = hayUrgentes
      ? `🔴 ${urgentesSinLeer} urgente${urgentesSinLeer === 1 ? "" : "s"} sin leer · ${base}`
      : unreadCount > 0
        ? `(${unreadCount}) Notificaciones sin leer · ${base}`
        : base;
  }, [hayUrgentes, unreadCount, urgentesSinLeer]);

  const filtered = useMemo(
    () => (filter === "todos" ? lista : lista.filter((item) => item.tipo === filter)),
    [filter, lista],
  );

  const sections = useMemo(() => {
    const accion = [];
    const novedades = [];
    const anteriores = [];
    for (const item of filtered) {
      const sec = sectionOf(item);
      if (sec === "accion") accion.push(item);
      else if (sec === "novedades") novedades.push(item);
      else anteriores.push(item);
    }
    return { accion, novedades, anteriores };
  }, [filtered]);

  const visibleGroups = useMemo(() => {
    const groups = [];
    if (sections.accion.length) groups.push({ key: "accion", label: "Necesitan atención", items: sections.accion });
    if (sections.novedades.length) groups.push({ key: "novedades", label: "Novedades para vos", items: sections.novedades });
    if (sections.anteriores.length) groups.push({ key: "anteriores", label: "Ya leídas", items: sections.anteriores });
    return groups;
  }, [sections]);

  const ubicar = useCallback(() => {
    const boton = (attentionAnchorRef.current && attentionRef.current) || ref.current;
    if (!boton) return;
    const r = boton.getBoundingClientRect();
    const margen = 12;
    const ancho = Math.min(480, window.innerWidth - margen * 2);
    const left = Math.max(margen, Math.min(r.left, window.innerWidth - ancho - margen));
    const arriba = r.top > window.innerHeight / 2;
    const libre = arriba ? r.top - margen * 2 : window.innerHeight - r.bottom - margen * 2;
    setPos({
      ancho,
      left,
      ...(arriba ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
      maxHeight: Math.max(160, Math.min(720, libre)),
    });
  }, []);

  useEffect(() => {
    function handleClick(event) {
      const fueraDelBoton = ref.current && !ref.current.contains(event.target);
      const fueraDelAviso = !attentionRef.current || !attentionRef.current.contains(event.target);
      const fueraDelPanel = !panelRef.current || !panelRef.current.contains(event.target);
      if (fueraDelBoton && fueraDelAviso && fueraDelPanel) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setToasts([]);
    toastSeenRef.current = new Set();
    prevUnreadRef.current = 0;
  }, [profile?.id]);

  useEffect(() => {
    if (!open) {
      setPanelEnter(false);
      return undefined;
    }
    ubicar();
    const t = window.setTimeout(() => setPanelEnter(true), 10);
    const onEsc = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, ubicar]);

  // Badge pulse sólo cuando sube el contador.
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && unreadCount > 0) {
      setBadgePulse(true);
      const t = window.setTimeout(() => setBadgePulse(false), 700);
      prevUnreadRef.current = unreadCount;
      return () => window.clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
    return undefined;
  }, [unreadCount]);

  // Toasts: sólo eventos frescos post-bootstrap.
  useEffect(() => {
    if (!ready || !freshEvents?.length) return;

    const candidates = freshEvents.filter((n) => {
      if (!debeMostrarToast(n)) return false;
      const stamp = `${n.clave}@${n.fecha || ""}`;
      if (toastSeenRef.current.has(stamp)) return false;
      return true;
    });
    consumeFreshEvents();
    if (!candidates.length) return;

    if (candidates.some((n) => n.gravedad === "critical" || n.gravedad === "warning")) {
      setBellPulse(true);
      window.setTimeout(() => setBellPulse(false), 800);
    }

    setToasts((prev) => {
      // Un lote nuevo siempre deja lugar para al menos un aviso concreto.
      const keep = candidates.length > 1 ? [] : prev.filter((t) => t.kind !== "summary").slice(-1);
      const room = Math.max(0, MAX_TOASTS - keep.length);
      const needsSummary = candidates.length > room;
      const itemRoom = needsSummary ? Math.max(0, room - 1) : room;
      const take = candidates.slice(0, itemRoom);
      const rest = candidates.length - take.length;
      for (const item of candidates) {
        toastSeenRef.current.add(`${item.clave}@${item.fecha || ""}`);
      }

      const next = [
        ...keep,
        ...take.map((item) => ({
          kind: "item",
          id: item.id,
          clave: item.clave,
          titulo: item.titulo,
          detalle: item.detalle,
          gravedad: item.gravedad,
          tipo: item.tipo,
          ruta: item.ruta,
          expires: Date.now() + (item.gravedad === "critical" ? 12_000 : TOAST_MS),
          raw: item,
        })),
      ];

      if (rest > 0) {
        next.push({
          kind: "summary",
          id: `summary-${Date.now()}`,
          titulo: `${rest} notificación${rest === 1 ? "" : "es"} nueva${rest === 1 ? "" : "s"}`,
          detalle: "Abrí la campana para verlas",
          gravedad: "info",
          expires: Date.now() + TOAST_MS,
        });
      }
      return next.slice(0, MAX_TOASTS);
    });
  }, [consumeFreshEvents, freshEvents, ready]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const tick = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => (t.expires || 0) > now));
    }, 500);
    return () => window.clearInterval(tick);
  }, [toasts.length]);

  const role = operationalRole(profile);
  if (!profile || role === "cliente") return null;

  const counts = counterByType(lista);
  const hayDelTipo = lista.reduce((acc, item) => ({ ...acc, [item.tipo]: true }), {});

  function openNotification(item) {
    markLeido(item);
    setOpen(false);
    dismissToast(item.clave);
    if (item.ruta) navigate(item.ruta);
  }

  function dismissToast(claveOrId) {
    setToasts((prev) => prev.filter((t) => t.clave !== claveOrId && t.id !== claveOrId));
  }

  function openToast(toast) {
    if (toast.kind === "summary") {
      setOpen(true);
      dismissToast(toast.id);
      return;
    }
    if (toast.raw) openNotification(toast.raw);
    else dismissToast(toast.id);
  }

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const S = {
    wrapper: { position: "relative", display: "inline-flex", flexShrink: 0 },
    bell: {
      position: "relative",
      width: size,
      height: size,
      borderRadius: 7,
      boxSizing: "border-box",
      background: open ? C.panel2 : C.panel,
      border: `1px solid ${unreadCount > 0 ? C.blueB : C.border}`,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      color: unreadCount > 0 ? C.blue : C.dim,
      transition: "color .2s, border-color .2s, background .2s",
      padding: 0,
      ...(estiloBoton || {}),
      ...(hayUrgentes ? {
        background: C.redL,
        border: `1px solid ${C.redB}`,
        color: C.red,
        boxShadow: `0 0 0 3px ${C.redL}`,
      } : {}),
      ...(bellPulse && !reducedMotion ? { animation: "notifBellNudge .7s ease-out" } : {}),
    },
    badge: {
      position: "absolute",
      top: -6,
      right: -6,
      minWidth: 16,
      height: 16,
      borderRadius: 99,
      background: C.red,
      color: "#fff",
      fontSize: 9,
      fontWeight: 750,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 4px",
      border: `2px solid ${C.bg}`,
      fontFamily: C.mono,
      pointerEvents: "none",
      ...(badgePulse && !reducedMotion ? { animation: "notifBadgePop .65s ease-out" } : {}),
    },
    panel: {
      position: "fixed",
      zIndex: 9000,
      left: pos?.left ?? 0,
      ...(pos && "bottom" in pos ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }),
      width: pos?.ancho ?? 480,
      maxHeight: pos?.maxHeight ?? 720,
      overflow: "hidden",
      background: C.panelSolid,
      backdropFilter: "var(--glass-filter)",
      WebkitBackdropFilter: "var(--glass-filter)",
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      boxShadow: "0 18px 48px var(--shadow-strong)",
      color: C.text,
      display: "flex",
      flexDirection: "column",
      opacity: panelEnter ? 1 : 0,
      transform: panelEnter ? "translateY(0)" : "translateY(6px)",
      transition: reducedMotion ? "none" : "opacity .18s ease, transform .18s ease",
    },
  };

  return (
    <div style={S.wrapper} ref={ref}>
      <style>{`
        @keyframes notifBellNudge {
          0% { transform: rotate(0); }
          25% { transform: rotate(-12deg); }
          55% { transform: rotate(10deg); }
          100% { transform: rotate(0); }
        }
        @keyframes notifUrgentRing {
          0%, 70%, 100% { transform: rotate(0) scale(1); }
          76% { transform: rotate(-9deg) scale(1.1); }
          83% { transform: rotate(8deg) scale(1.1); }
          90% { transform: rotate(-5deg) scale(1.06); }
          96% { transform: rotate(0) scale(1); }
        }
        .notif-bell-urgent { animation: notifUrgentRing 3.6s ease-in-out infinite; }
        @keyframes notifBadgePop {
          0% { transform: scale(.6); opacity: .4; }
          40% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes notifToastIn {
          from { opacity: 0; transform: translateY(-12px) scale(.98); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .notif-toast, .notif-bell-anim, .notif-bell-urgent { animation: none !important; }
        }
        .notif-filter:hover { background: var(--panel-2) !important; }
        .notif-row:hover { background: var(--panel-2) !important; }
        .notif-filter:focus-visible, .notif-row-open:focus-visible, .notif-resolve:focus-visible, .notif-toast-action:focus-visible, .notif-toast-close:focus-visible {
          outline: 2px solid var(--blue);
          outline-offset: -2px;
        }
      `}</style>

      <button
        type="button"
        className={hayUrgentes ? "notif-bell-urgent" : bellPulse ? "notif-bell-anim" : undefined}
        style={S.bell}
        onClick={() => {
          attentionAnchorRef.current = false;
          setOpen((value) => !value);
        }}
        title={hayUrgentes ? `${urgentesSinLeer} notificación${urgentesSinLeer === 1 ? "" : "es"} urgente${urgentesSinLeer === 1 ? "" : "s"} sin leer` : "Notificaciones"}
        aria-label={hayUrgentes ? `Notificaciones, ${urgentesSinLeer} urgente${urgentesSinLeer === 1 ? "" : "s"} y ${unreadCount} sin leer` : unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && <span style={S.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {unreadCount > 0 && createPortal(
        <button
          ref={attentionRef}
          type="button"
          onClick={() => {
            attentionAnchorRef.current = true;
            ubicar();
            setOpen(true);
          }}
          aria-label={hayUrgentes
            ? `Abrir notificaciones: ${urgentesSinLeer} urgente${urgentesSinLeer === 1 ? "" : "s"} sin leer`
            : `Abrir notificaciones: ${unreadCount} sin leer`}
          style={{
            position: "fixed",
            top: size >= 40 ? "calc(66px + env(safe-area-inset-top))" : "max(14px, env(safe-area-inset-top))",
            right: "max(14px, env(safe-area-inset-right))",
            zIndex: 8999,
            maxWidth: "calc(100vw - 28px)",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 12px",
            borderRadius: 12,
            border: `1px solid ${hayUrgentes ? C.redB : C.blueB}`,
            background: C.panelSolid,
            color: hayUrgentes ? C.red : C.blue,
            boxShadow: "0 10px 28px var(--shadow-strong)",
            cursor: "pointer",
            fontFamily: C.sans,
            fontSize: 12,
            fontWeight: 750,
            textAlign: "left",
          }}
        >
          <Bell size={17} aria-hidden="true" />
          <span>{hayUrgentes
            ? `${urgentesSinLeer} urgente${urgentesSinLeer === 1 ? "" : "s"} sin leer`
            : `${unreadCount} notificación${unreadCount === 1 ? "" : "es"} sin leer`}</span>
          <span style={{ color: C.text, whiteSpace: "nowrap", fontWeight: 700 }}>Abrir campana ›</span>
        </button>,
        document.body,
      )}

      {open && pos && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Panel de notificaciones" style={S.panel}>
          <div style={{
            padding: "16px 18px 14px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}>
            <div>
              <div style={{ color: C.text, fontFamily: C.sans, fontWeight: 750, fontSize: 16, letterSpacing: 0.1 }}>
                Notificaciones
              </div>
              <div style={{ color: hayUrgentes ? C.red : C.dim, fontSize: 12, marginTop: 3 }}>
                {loading ? "Actualizando…" : hayUrgentes ? `${urgentesSinLeer} urgente${urgentesSinLeer === 1 ? "" : "s"} sin leer · ${unreadCount} en total` : unreadCount ? `Tenés ${unreadCount} notificación${unreadCount === 1 ? "" : "es"} sin leer` : "Estás al día"}
              </div>
            </div>
            <button
              type="button"
              onClick={markTodoLeido}
              disabled={!unreadCount}
              title="Marcar todas las notificaciones como leídas"
              aria-label="Marcar todas las notificaciones como leídas"
              style={{
                border: `1px solid ${C.border}`,
                background: C.panel,
                color: C.dim,
                borderRadius: 8,
                padding: "8px 11px",
                minHeight: 36,
                cursor: unreadCount ? "pointer" : "default",
                opacity: unreadCount ? 1 : 0.45,
                fontSize: 11.5,
                fontWeight: 700,
                fontFamily: C.sans,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckCheck size={14} />
              Marcar todas
            </button>
          </div>

          <div style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            gap: 6,
            overflowX: "auto",
            flexShrink: 0,
          }}>
            <FilterTab active={filter === "todos"} color={C.blue} soft={C.blueL} border={C.blueB} onClick={() => setFilter("todos")}>
              Todas
            </FilterTab>
            {Object.entries(TYPE_UI).map(([key, cfg]) => (
              hayDelTipo[key] && (
                <FilterTab key={key} active={filter === key} color={cfg.color} soft={cfg.soft} border={cfg.border} onClick={() => setFilter(key)}>
                  {cfg.label}{counts[key] ? ` (${counts[key]})` : ""}
                </FilterTab>
              )
            ))}
          </div>

          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {loading && !lista.length ? (
              <div style={{ padding: "28px 20px", textAlign: "center", color: C.dim, fontSize: 12.5 }}>
                Cargando avisos…
              </div>
            ) : visibleGroups.every((g) => !g.items.length) ? (
              <div style={{ padding: "36px 20px", textAlign: "center", color: C.dim }}>
                <CheckCircle2 size={28} style={{ color: C.green, marginBottom: 10 }} />
                <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Estás al día</div>
                <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                  Sólo aparecen novedades relacionadas con tu trabajo.
                </div>
              </div>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.key}>
                  {group.label && (
                    <div style={{
                      padding: "11px 18px 7px",
                      color: C.dim,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      position: "sticky",
                      top: 0,
                      background: C.panelSolid,
                      zIndex: 1,
                    }}>
                      {group.label} · {group.items.length}
                    </div>
                  )}
                  {group.items.map((item) => (
                    <NotifRow
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onOpen={() => openNotification(item)}
                      onResolve={async () => {
                        markLeido(item);
                        await resolverAlerta?.(item.meta?.alerta?.id, profile?.username ?? "usuario");
                      }}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}

      {toasts.length > 0 && createPortal(
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: unreadCount > 0
              ? size >= 40 ? "calc(120px + env(safe-area-inset-top))" : "68px"
              : size >= 40 ? "calc(68px + env(safe-area-inset-top))" : "max(16px, env(safe-area-inset-top))",
            right: "max(12px, env(safe-area-inset-right))",
            zIndex: 9500,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "min(390px, calc(100vw - 24px))",
            pointerEvents: "none",
          }}
        >
          {toasts.map((toast) => {
            const g = GRAVITY_UI[toast.gravedad] || GRAVITY_UI.info;
            const cfg = TYPE_UI[toast.tipo] || TYPE_UI.produccion;
            const Icon = toast.kind === "summary" ? Info : (cfg.icon || Bell);
            return (
              <div
                key={toast.id}
                className="notif-toast"
                style={{
                  pointerEvents: "auto",
                  display: "grid",
                  gridTemplateColumns: "32px minmax(0, 1fr) auto",
                  gap: 10,
                  alignItems: "start",
                  padding: "13px 12px",
                  borderRadius: 12,
                  background: C.panelSolid,
                  border: `1px solid ${g.border}`,
                  borderLeft: `3px solid ${g.color}`,
                  boxShadow: "0 12px 32px var(--shadow-strong)",
                  animation: reducedMotion ? "none" : "notifToastIn .26s cubic-bezier(.22,1,.36,1)",
                }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
                  color: g.color, background: g.soft, border: `1px solid ${g.border}`,
                }}>
                  <Icon size={15} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: g.color, fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 3 }}>
                    {toast.kind === "summary" ? "Notificaciones nuevas" : "Nueva notificación"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 750, fontSize: 13, color: C.text }}>{toast.titulo}</span>
                    {(toast.gravedad === "critical" || toast.gravedad === "warning") && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: g.color,
                        border: `1px solid ${g.border}`, borderRadius: 999, padding: "1px 6px",
                      }}>
                        {g.label}
                      </span>
                    )}
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.35, marginTop: 3 }}>
                    {toast.detalle}
                  </div>
                  <button
                    type="button"
                    className="notif-toast-action"
                    onClick={() => openToast(toast)}
                    style={{
                      marginTop: 8, minHeight: 32, padding: "0 10px",
                      border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue,
                      borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: "pointer", fontFamily: C.sans,
                    }}
                  >
                    {toast.kind === "summary" ? "Ver avisos" : actionLabel(toast.raw)}
                  </button>
                </div>
                <button
                  type="button"
                  className="notif-toast-close"
                  aria-label="Cerrar aviso"
                  onClick={() => dismissToast(toast.clave || toast.id)}
                  style={{
                    width: 32, height: 32, border: "none", background: "transparent",
                    color: C.dim, cursor: "pointer", borderRadius: 8, display: "grid", placeItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function FilterTab({ active, color, soft, border, onClick, children }) {
  return (
    <button
      type="button"
      className="notif-filter"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? border : C.border}`,
        background: active ? soft : "transparent",
        color: active ? color : C.dim,
        borderRadius: 999,
        padding: "7px 10px",
        minHeight: 34,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function NotifRow({ item, isAdmin, onOpen, onResolve }) {
  const cfg = TYPE_UI[item.tipo] || TYPE_UI.produccion;
  const Icon = cfg.icon;
  const g = GRAVITY_UI[item.gravedad] || GRAVITY_UI.info;
  const unread = !item.leida;
  const canResolve = isAdmin && item.tipo === "produccion" && unread;

  return (
    <div className="notif-row" style={{ borderBottom: `1px solid ${C.border}`, borderLeft: unread ? `3px solid ${g.color}` : "3px solid transparent", background: unread ? g.soft : "transparent" }}>
      <button type="button" onClick={onOpen} className="notif-row-open" style={{ width: "100%", border: 0, background: "transparent", color: C.text, cursor: "pointer", display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", gap: 11, textAlign: "left", padding: "13px 16px 12px", fontFamily: C.sans }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", color: g.color, background: g.soft, border: `1px solid ${g.border}` }}><Icon size={17} /></span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: cfg.color, background: cfg.soft, border: `1px solid ${cfg.border}`, borderRadius: 5, padding: "2px 6px", fontSize: 10, fontWeight: 750 }}>{cfg.label}</span>
            {["critical", "warning"].includes(item.gravedad) && <span style={{ color: g.color, fontSize: 10, fontWeight: 750 }}>{g.label}</span>}
            {unread && <span style={{ color: g.color, fontSize: 10, fontWeight: 750 }}>Sin leer</span>}
            <span style={{ marginLeft: "auto", color: C.dim, fontSize: 10.5, fontFamily: C.mono, whiteSpace: "nowrap" }}>{fmtFecha(item.fecha)}</span>
          </span>
          <span style={{ display: "block", color: C.text, fontSize: 14, fontWeight: unread ? 750 : 650, lineHeight: 1.3, marginTop: 7 }}>{item.titulo}</span>
          <span style={{ display: "block", color: C.dim, fontSize: 12.5, lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>{item.detalle}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.blue, fontSize: 11.5, fontWeight: 750, marginTop: 9 }}>
            {actionLabel(item)} <ChevronRight size={14} />
          </span>
        </span>
      </button>
      {canResolve && <div style={{ padding: "0 16px 12px 63px" }}><button type="button" onClick={onResolve} className="notif-resolve" style={{ minHeight: 32, padding: "6px 10px", border: `1px solid ${C.greenB}`, borderRadius: 8, background: C.greenL, color: C.green, cursor: "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 700 }}>Resolver alerta</button></div>}
    </div>
  );
}
