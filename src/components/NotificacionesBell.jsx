import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, PackageOpen, ShoppingCart, Truck } from "lucide-react";
import useNotificaciones from "@/hooks/useNotificaciones";
import { hasAdminAccess } from "@/lib/permissions";
import { C } from "@/theme";

const TYPE_UI = {
  recepcion: { label: "Recepcion", color: C.blue, icon: PackageOpen },
  produccion: { label: "Produccion", color: C.amber, icon: AlertTriangle },
  compras: { label: "Compras", color: C.green, icon: ShoppingCart },
  logistica: { label: "Logística", color: C.blue, icon: Truck },
};

const GRAVITY_COLOR = {
  critical: C.red,
  warning: C.amber,
  success: C.green,
  info: C.blue,
};

function fmtFecha(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function counterByType(lista) {
  const out = { todos: lista.length, recepcion: 0, produccion: 0, compras: 0, logistica: 0 };
  for (const item of lista) out[item.tipo] = (out[item.tipo] || 0) + 1;
  return out;
}

/**
 * La campanita vive DENTRO del menú lateral, no flotando sobre la pantalla.
 *
 * Antes era un botón fijo abajo a la derecha, y ahí tapaba lo que hubiera
 * debajo. En Tornería caía justo encima del lápiz de editar del último renglón
 * y no se podía tocar. Ya se había parcheado escondiéndola en Tornería en
 * celular, lo que dejaba el mismo problema intacto en la computadora y encima
 * dejaba sin avisos a quien entra desde el teléfono.
 *
 * Un botón que flota sobre el contenido siempre va a tapar algo: el contenido
 * cambia y el botón no se entera. Por eso ahora se monta donde ya hay lugar
 * reservado para los controles de la sesión, al lado de salir y cambiar la
 * contraseña.
 *
 * El panel sale por portal porque el <aside> del menú tiene overflow: hidden y
 * lo recortaría. Se ubica midiendo el botón, y se abre para arriba o para abajo
 * según de qué lado de la pantalla esté, sin salirse nunca del borde.
 */
export default function NotificacionesBell({ profile, size = 28, iconSize = 15, estiloBoton = null }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("todos");
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const isAdmin = hasAdminAccess(profile);
  const { lista, unreadCount, loading, markLeido, markTodoLeido, resolverAlerta } = useNotificaciones(profile);
  const visible = useMemo(
    () => (filter === "todos" ? lista : lista.filter((item) => item.tipo === filter)).slice(0, 30),
    [filter, lista],
  );

  // El panel se ubica midiendo el botón. Se abre hacia arriba si el botón está
  // en la mitad de abajo de la pantalla -que es donde queda en el menú- y hacia
  // abajo si está arriba, como en el celular al lado del botón de menú.
  const ubicar = useCallback(() => {
    const boton = ref.current;
    if (!boton) return;
    const r = boton.getBoundingClientRect();
    const margen = 12;
    const ancho = Math.min(390, window.innerWidth - margen * 2);
    const left = Math.max(margen, Math.min(r.left, window.innerWidth - ancho - margen));
    const arriba = r.top > window.innerHeight / 2;
    const libre = arriba ? r.top - margen * 2 : window.innerHeight - r.bottom - margen * 2;
    setPos({
      ancho,
      left,
      ...(arriba ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
      maxHeight: Math.max(220, Math.min(620, libre)),
    });
  }, []);

  useEffect(() => {
    // Cerrar al tocar afuera tiene que mirar los DOS: el botón y el panel, que
    // ahora son ramas distintas del DOM. Con un solo ref, hacer clic adentro del
    // panel lo cerraba.
    function handleClick(event) {
      const fueraDelBoton = ref.current && !ref.current.contains(event.target);
      const fueraDelPanel = !panelRef.current || !panelRef.current.contains(event.target);
      if (fueraDelBoton && fueraDelPanel) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    ubicar();
    const onEsc = (event) => { if (event.key === "Escape") setOpen(false); };
    // En captura: si no, un scroll dentro de una lista no lo avisa y el panel
    // queda colgado lejos del botón.
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, ubicar]);

  const role = profile?.is_admin ? "admin" : profile?.role;
  if (!profile || role === "cliente") return null;

  const counts = counterByType(lista);

  function openNotification(item) {
    markLeido(item.id);
    setOpen(false);
    if (item.ruta) navigate(item.ruta);
  }

  const S = {
    wrapper: {
      position: "relative",
      display: "inline-flex",
      flexShrink: 0,
    },
    // Mismo cuerpo que los otros botones del pie del menú -salir, contraseña,
    // WhatsApp- para que se lea como uno más y no como algo pegado encima.
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
      // Para que en el celular se vea igual que el botón de menú que tiene al lado.
      ...(estiloBoton || {}),
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
      fontWeight: 950,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 4px",
      border: `2px solid ${C.bg}`,
      fontFamily: C.mono,
      pointerEvents: "none",
    },
    panel: {
      position: "fixed",
      zIndex: 9000,
      left: pos?.left ?? 0,
      ...(pos && "bottom" in pos ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }),
      width: pos?.ancho ?? 390,
      maxHeight: pos?.maxHeight ?? 620,
      overflow: "hidden",
      background: C.panelSolid,
      backdropFilter: "var(--glass-filter)",
      WebkitBackdropFilter: "var(--glass-filter)",
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      boxShadow: "0 20px 60px var(--shadow-strong)",
      color: C.text,
      display: "flex",
      flexDirection: "column",
    },
    header: {
      padding: "14px 15px 12px",
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    title: {
      color: C.text,
      fontFamily: C.sans,
      fontWeight: 950,
      fontSize: 14,
      letterSpacing: 0.2,
    },
    tabs: {
      padding: "9px 10px",
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      gap: 6,
      overflowX: "auto",
    },
    tab: (active, color) => ({
      border: `1px solid ${active ? `${color}55` : C.border}`,
      background: active ? `${color}14` : "transparent",
      color: active ? color : C.dim,
      borderRadius: 999,
      padding: "6px 9px",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 900,
      fontFamily: C.sans,
      whiteSpace: "nowrap",
    }),
    item: (unread, color) => ({
      width: "100%",
      border: "none",
      borderBottom: `1px solid ${C.border}`,
      background: unread ? `${color}0f` : "transparent",
      color: C.text,
      cursor: "pointer",
      display: "grid",
      gridTemplateColumns: "32px minmax(0, 1fr)",
      gap: 10,
      textAlign: "left",
      padding: "11px 14px",
      fontFamily: C.sans,
    }),
    iconBox: (color) => ({
      width: 30,
      height: 30,
      borderRadius: 9,
      display: "grid",
      placeItems: "center",
      color,
      background: `${color}15`,
      border: `1px solid ${color}35`,
    }),
    markBtn: {
      border: `1px solid ${C.border}`,
      background: C.panel,
      color: C.dim,
      borderRadius: 8,
      padding: "7px 9px",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 850,
      fontFamily: C.sans,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    },
  };

  return (
    <div style={S.wrapper} ref={ref}>
      <button
        type="button"
        style={S.bell}
        onClick={() => setOpen((value) => !value)}
        title="Notificaciones"
        aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && <span style={S.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} style={S.panel}>
          <div style={S.header}>
            <div>
              <div style={S.title}>Notificaciones</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                {loading ? "Actualizando..." : unreadCount ? `${unreadCount} sin leer` : "Estas al dia"}
              </div>
            </div>
            <button type="button" onClick={markTodoLeido} disabled={!lista.length} style={{ ...S.markBtn, opacity: lista.length ? 1 : 0.45, cursor: lista.length ? "pointer" : "default" }}>
              <CheckCheck size={14} />
              Leido
            </button>
          </div>

          <div style={S.tabs}>
            <button type="button" onClick={() => setFilter("todos")} style={S.tab(filter === "todos", C.blue)}>
              Todas ({counts.todos})
            </button>
            {Object.entries(TYPE_UI).map(([key, cfg]) => (
              counts[key] > 0 && (
                <button key={key} type="button" onClick={() => setFilter(key)} style={S.tab(filter === key, cfg.color)}>
                  {cfg.label} ({counts[key]})
                </button>
              )
            ))}
          </div>

          <div style={{ overflowY: "auto" }}>
            {visible.length ? visible.map((item) => {
              const cfg = TYPE_UI[item.tipo] || TYPE_UI.produccion;
              const Icon = cfg.icon;
              const color = GRAVITY_COLOR[item.gravedad] || cfg.color;
              return (
                <button key={item.id} type="button" onClick={() => openNotification(item)} style={S.item(!item.leida, color)}>
                  <span style={S.iconBox(color)}>
                    <Icon size={16} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>{item.titulo}</span>
                      {!item.leida && <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />}
                    </span>
                    <span style={{ display: "block", color: C.dim, fontSize: 12, lineHeight: 1.35, marginTop: 4 }}>
                      {item.detalle}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
                      <span style={{ color: C.dim, fontSize: 10.5, fontFamily: C.mono }}>{fmtFecha(item.fecha)}</span>
                      {isAdmin && item.tipo === "produccion" && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={async (event) => {
                            event.stopPropagation();
                            markLeido(item.id);
                            await resolverAlerta?.(item.meta?.alerta?.id, profile?.username ?? "usuario");
                          }}
                          onKeyDown={async (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            markLeido(item.id);
                            await resolverAlerta?.(item.meta?.alerta?.id, profile?.username ?? "usuario");
                          }}
                          style={{ color: C.green, border: `1px solid ${C.greenB}`, borderRadius: 7, padding: "3px 7px", fontSize: 10.5, fontWeight: 900 }}
                        >
                          Resolver
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <div style={{ padding: "34px 20px", textAlign: "center", color: C.dim }}>
                <CheckCircle2 size={28} style={{ color: C.green, marginBottom: 10 }} />
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Estas al dia</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No hay notificaciones para este filtro.</div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
