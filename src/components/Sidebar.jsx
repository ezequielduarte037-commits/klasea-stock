import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

const Icon = ({ name, size = 14, color = "currentColor" }) => {
  const icons = {
    wood:     <><rect x="2" y="6" width="20" height="2.5" rx="1.25"/><rect x="2" y="11" width="20" height="2.5" rx="1.25"/><rect x="2" y="16" width="13" height="2.5" rx="1.25"/></>,
    layers:   <><polygon points="12 2 22 8.5 12 15 2 8.5"/><polyline points="2 12 12 18.5 22 12"/></>,
    ship:     <><path d="M3 17l1.5-9h15L21 17"/><path d="M12 3v5"/><path d="M8 8h8"/><path d="M2 20c2 2 4 2 5 0s3-2 5 0 3 2 5 0"/></>,
    diamond:  <><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></>,
    sofa:     <><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/></>,
    book:     <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    layers2:  <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    arrowud:  <><line x1="12" y1="3" x2="12" y2="21"/><polyline points="18 15 12 21 6 15"/><polyline points="18 9 12 3 6 9"/></>,
    cart:     <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    anchor:   <><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    chevron:  <><polyline points="9 18 15 12 9 6"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

const NAV = [
  {
    id: "movimientos", label: "Movimientos", color: "#a78bfa",
    roles: ["panol", "admin", "oficina", "__admin__"],
    items: [
      { href: "/panol",      label: "Maderas",    icon: "wood"   },
      { href: "/laminacion", label: "Laminación", icon: "layers" },
    ]
  },
  {
    id: "produccion", label: "Producción", color: "#60a5fa",
    roles: ["admin", "oficina", "__admin__"],
    items: [
      { href: "/obras",      label: "Obras",      icon: "ship"    },
      { href: "/marmoleria", label: "Marmolería", icon: "diamond" },
      { href: "/muebles",    label: "Muebles",    icon: "sofa"    },
    ]
  },
  {
    id: "instrucciones", label: "Instrucciones", color: "#94a3b8",
    roles: ["*"],
    items: [
      { href: "/procedimientos", label: "Procedimientos", icon: "book" },
    ]
  },
  {
    id: "gestion_lam", label: "Laminación", color: "#34d399",
    roles: ["admin", "oficina", "__admin__"],
    items: [
      { href: "/obras-laminacion", label: "Por obra",    icon: "layers2", exact: false },
      { href: "/laminacion", label: "Ingresos",    icon: null, qs: "?tab=Ingresos"    },
      { href: "/laminacion", label: "Egresos",     icon: null, qs: "?tab=Egresos"     },
      { href: "/laminacion", label: "Movimientos", icon: null, qs: "?tab=Movimientos" },
      { href: "/laminacion", label: "Pedidos",     icon: null, qs: "?tab=Pedidos"     },
    ]
  },
  {
    id: "gestion_mad", label: "Maderas", color: "#fbbf24",
    roles: ["admin", "oficina", "__admin__"],
    items: [
      { href: "/admin",       label: "Inventario",  icon: "grid"    },
      { href: "/movimientos", label: "Movimientos", icon: "arrowud" },
      { href: "/pedidos",     label: "Pedidos",     icon: "cart"    },
    ]
  },
  {
    id: "sistema", label: "Sistema", color: "#f87171",
    roles: ["admin", "__admin__"],
    items: [
      { href: "/configuracion", label: "Configuración", icon: "settings" },
    ]
  },
  {
    id: "postventa", label: "Post Venta", color: "#22d3ee",
    roles: ["admin", "oficina", "__admin__"],
    items: [
      { href: "/postventa", label: "Barcos Entregados", icon: "anchor" },
    ]
  },
];

export default function Sidebar({ profile, signOut }) {
  const location  = useLocation();
  const path      = location.pathname;
  const search    = location.search;
  const [hovered, setHovered] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const role     = profile?.role    ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const username = profile?.username ?? "—";
  const initials = username.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  function hasAccess(roles) {
    if (roles.includes("*")) return true;
    if (roles.includes("__admin__") && isAdmin) return true;
    if (roles.includes(role)) return true;
    return false;
  }

  function isActive(item) {
    if (item.qs)              return path === item.href && search === item.qs;
    if (item.exact === false) return path.startsWith(item.href);
    return path === item.href;
  }

  function toggleSection(id) {
    setCollapsed(p => ({ ...p, [id]: !p[id] }));
  }

  const visibleSections = NAV.filter(s => hasAccess(s.roles));

  // Color de la sección activa para el glow del brand
  const activeSection = visibleSections.find(s => s.items.some(i => isActive(i)));
  const accentColor   = activeSection?.color ?? "#a78bfa";

  return (
    <aside style={{
      width: "100%", height: "100%",
      background: "#060608",
      display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(255,255,255,0.05)",
      fontFamily: "'Outfit', system-ui, sans-serif",
      userSelect: "none",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        .sb-item { transition: background 0.14s; }
        .sb-item:hover { background: rgba(255,255,255,0.04) !important; }
        .sb-item:hover .sb-lbl  { color: rgba(255,255,255,0.82) !important; }
        .sb-item:hover .sb-ico  { border-color: rgba(255,255,255,0.1) !important; }
        .sb-sub:hover  { color: rgba(255,255,255,0.65) !important; }
        .sb-section-hd:hover { opacity: 0.7; }
        .sb-logout:hover { color: rgba(248,113,113,0.65) !important; border-color: rgba(248,113,113,0.18) !important; }
      `}</style>

      {/* Glow ambiental que cambia con la sección activa */}
      <div style={{
        position: "absolute",
        top: -60, left: -40,
        width: 200, height: 200,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accentColor}12 0%, transparent 70%)`,
        pointerEvents: "none",
        transition: "background 0.8s ease",
        zIndex: 0,
      }} />

      {/* ── BRAND ── */}
      <div style={{
        padding: "20px 18px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            background: `linear-gradient(145deg, ${accentColor}22 0%, rgba(255,255,255,0.04) 100%)`,
            border: `1px solid ${accentColor}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px ${accentColor}18`,
            transition: "all 0.8s ease",
          }}>
            <img src={logoK} alt="K" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.9 }} />
          </div>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "0.06em", lineHeight: 1,
            }}>
              Klase A
            </div>
            <div style={{
              fontSize: 9, color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.16em", marginTop: 4,
              textTransform: "uppercase", fontWeight: 500,
            }}>
              Sistema de producción
            </div>
          </div>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "6px 0 12px", position: "relative", zIndex: 1 }}>
        {visibleSections.map((section, si) => {
          const hasActive  = section.items.some(i => isActive(i));
          const isOpen     = !collapsed[section.id]; // abierto por defecto

          return (
            <div key={section.id} style={{ marginBottom: 1 }}>

              {/* Section header — clickable para colapsar */}
              <div
                className="sb-section-hd"
                onClick={() => toggleSection(section.id)}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "10px 16px 4px",
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                {/* Línea de color */}
                <div style={{
                  width: 12, height: 1.5,
                  background: hasActive ? section.color : "rgba(255,255,255,0.12)",
                  borderRadius: 99,
                  marginRight: 8,
                  flexShrink: 0,
                  boxShadow: hasActive ? `0 0 6px ${section.color}` : "none",
                  transition: "background 0.3s, box-shadow 0.3s",
                }} />

                <span style={{
                  flex: 1,
                  fontSize: 9, fontWeight: 600,
                  color: hasActive
                    ? `${section.color}ee`
                    : "rgba(255,255,255,0.35)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  transition: "color 0.3s",
                }}>
                  {section.label}
                </span>

                {/* Chevron */}
                <div style={{
                  opacity: 0.3,
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  display: "flex",
                }}>
                  <Icon name="chevron" size={10} color="rgba(255,255,255,0.5)" />
                </div>
              </div>

              {/* Items */}
              {isOpen && section.items.map((item, ii) => {
                const active   = isActive(item);
                const isSub    = !item.icon;
                const hoverKey = `${section.id}-${ii}`;

                if (isSub) {
                  return (
                    <Link
                      key={ii}
                      to={`${item.href}${item.qs ?? ""}`}
                      className="sb-sub"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 18px 5px 50px",
                        textDecoration: "none",
                        color: active
                          ? "rgba(255,255,255,0.88)"
                          : "rgba(255,255,255,0.42)",
                        fontSize: 11,
                        fontWeight: active ? 500 : 400,
                        letterSpacing: "0.02em",
                        transition: "color 0.12s",
                        position: "relative",
                      }}
                    >
                      <div style={{
                        position: "absolute", left: 34,
                        width: active ? 4 : 3,
                        height: active ? 4 : 3,
                        borderRadius: "50%",
                        background: active ? section.color : "rgba(255,255,255,0.12)",
                        boxShadow: active ? `0 0 5px ${section.color}` : "none",
                        transition: "all 0.2s",
                      }} />
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <Link
                    key={ii}
                    to={`${item.href}${item.qs ?? ""}`}
                    className="sb-item"
                    onMouseEnter={() => setHovered(hoverKey)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      margin: "1px 10px",
                      padding: "7px 10px",
                      borderRadius: 10,
                      textDecoration: "none",
                      position: "relative",
                      background: active
                        ? `linear-gradient(135deg, ${section.color}14 0%, ${section.color}06 100%)`
                        : "transparent",
                      border: active
                        ? `1px solid ${section.color}20`
                        : "1px solid transparent",
                    }}
                  >
                    {/* Barra izquierda */}
                    <div style={{
                      position: "absolute",
                      left: -10, top: "18%", bottom: "18%",
                      width: active ? 2.5 : 0,
                      borderRadius: "0 3px 3px 0",
                      background: section.color,
                      boxShadow: `0 0 10px ${section.color}`,
                      transition: "width 0.2s",
                    }} />

                    {/* Ícono */}
                    <div
                      className="sb-ico"
                      style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: active
                          ? `${section.color}18`
                          : "rgba(255,255,255,0.03)",
                        border: active
                          ? `1px solid ${section.color}28`
                          : "1px solid rgba(255,255,255,0.07)",
                        transition: "all 0.15s",
                        boxShadow: active
                          ? `0 2px 10px ${section.color}20`
                          : "none",
                      }}
                    >
                      <Icon
                        name={item.icon}
                        size={13}
                        color={active ? section.color : "rgba(255,255,255,0.28)"}
                      />
                    </div>

                    {/* Label */}
                    <span
                      className="sb-lbl"
                      style={{
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: active
                          ? "rgba(255,255,255,0.95)"
                          : "rgba(255,255,255,0.58)",
                        letterSpacing: "0.01em",
                        transition: "color 0.12s",
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </span>

                    {/* Dot cuando activo */}
                    {active && (
                      <div style={{
                        width: 4, height: 4, borderRadius: "50%",
                        background: section.color,
                        boxShadow: `0 0 7px ${section.color}`,
                        flexShrink: 0,
                      }} />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── FOOTER ── */}
      <div style={{
        position: "relative", zIndex: 1,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "12px 12px",
        flexShrink: 0,
        background: "rgba(0,0,0,0.3)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* Avatar con inicial */}
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: `linear-gradient(145deg, ${accentColor}25 0%, ${accentColor}08 100%)`,
            border: `1px solid ${accentColor}25`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
            color: accentColor,
            letterSpacing: "0.04em",
            boxShadow: `0 0 12px ${accentColor}15`,
            transition: "all 0.8s ease",
          }}>
            {initials || "?"}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.82)",
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", marginBottom: 3,
            }}>
              {username}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 4, height: 4, borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 9, color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.14em", fontWeight: 500,
              }}>
                {role}
              </span>
            </div>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={signOut}
            title="Cerrar sesión"
            className="sb-logout"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 7,
              width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              color: "rgba(255,255,255,0.22)",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            <Icon name="logout" size={12} color="currentColor" />
          </button>
        </div>
      </div>
    </aside>
  );
}
