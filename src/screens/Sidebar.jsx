import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

// ── ÍCONOS ULTRAMINIMALISTAS ──────────────────────────────────
const ICONS = {
  "/panol":            "⬡",
  "/laminacion":       "◈",
  "/obras":            "⬤",
  "/marmoleria":       "◆",
  "/muebles":          "▪",
  "/procedimientos":   "≡",
  "/obras-laminacion": "⬡",
  "/admin":            "▤",
  "/movimientos":      "⇅",
  "/pedidos":          "⊕",
  "/configuracion":    "⚙",
  "/postventa":        "⊙",
};

// ── COLORES POR SECCIÓN ───────────────────────────────────────
const SECTION_COLORS = {
  movimientos:        "#a78bfa",   // violeta suave
  produccion:         "#60a5fa",   // azul
  instrucciones:      "#94a3b8",   // gris
  gestion_laminacion: "#34d399",   // verde
  gestion_maderas:    "#fbbf24",   // ámbar
  sistema:            "#f87171",   // rojo suave
  postventa:          "#67e8f9",   // cyan
};

export default function Sidebar({ profile, signOut }) {
  const location = useLocation();
  const path     = location.pathname;
  const search   = location.search;
  const [hoveredPath, setHoveredPath] = useState(null);

  const role     = profile?.role ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  const esPanol   = role === "panol";
  const esGestion = isAdmin || role === "admin" || role === "oficina";
  const esAdmin   = isAdmin || role === "admin";

  // Avatar con iniciales
  const initials = username
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // ── NAV ITEM ────────────────────────────────────────────────
  const item = (href, label, sectionColor, exact = true) => {
    const on      = exact ? path === href : path.startsWith(href);
    const icon    = ICONS[href] ?? "·";
    const hovered = hoveredPath === href;
    const color   = sectionColor ?? "#a0a0a0";

    return (
      <Link
        to={href}
        onMouseEnter={() => setHoveredPath(href)}
        onMouseLeave={() => setHoveredPath(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px 8px 20px",
          margin: "1px 8px",
          borderRadius: 8,
          color: on ? "#ffffff" : hovered ? "#d4d4d8" : "#6b7280",
          fontSize: 11,
          letterSpacing: "1.2px",
          fontWeight: on ? 600 : 400,
          textTransform: "uppercase",
          textDecoration: "none",
          transition: "all 0.15s",
          background: on
            ? `rgba(255,255,255,0.07)`
            : hovered
            ? "rgba(255,255,255,0.03)"
            : "transparent",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow izquierdo cuando activo */}
        {on && (
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: 2,
            borderRadius: "0 2px 2px 0",
            background: color,
            boxShadow: `0 0 10px ${color}80`,
          }} />
        )}

        {/* Ícono coloreado */}
        <span style={{
          fontSize: 10,
          color: on ? color : hovered ? `${color}99` : "rgba(255,255,255,0.2)",
          width: 14,
          textAlign: "center",
          flexShrink: 0,
          transition: "color 0.15s",
        }}>
          {icon}
        </span>

        {label}

        {/* Dot si activo */}
        {on && (
          <div style={{
            marginLeft: "auto",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }} />
        )}
      </Link>
    );
  };

  // ── SUB ITEM ─────────────────────────────────────────────────
  const subItem = (href, label, qs = "", sectionColor) => {
    const on      = path === href && (qs ? search === qs : !search);
    const hovered = hoveredPath === `${href}${qs}`;
    const color   = sectionColor ?? "#6b7280";
    return (
      <Link
        to={`${href}${qs}`}
        onMouseEnter={() => setHoveredPath(`${href}${qs}`)}
        onMouseLeave={() => setHoveredPath(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px 6px 44px",
          margin: "1px 8px",
          borderRadius: 7,
          color: on ? "#d4d4d8" : hovered ? "#9ca3af" : "#4b5563",
          fontSize: 10,
          letterSpacing: "1px",
          textTransform: "uppercase",
          textDecoration: "none",
          fontWeight: on ? 600 : 400,
          transition: "color 0.15s, background 0.15s",
          background: on ? "rgba(255,255,255,0.04)" : hovered ? "rgba(255,255,255,0.02)" : "transparent",
        }}
      >
        <div style={{
          width: 3,
          height: 3,
          borderRadius: "50%",
          background: on ? color : "rgba(255,255,255,0.15)",
          flexShrink: 0,
        }} />
        {label}
      </Link>
    );
  };

  // ── GROUP HEADER ─────────────────────────────────────────────
  const group = (label, color) => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "18px 20px 6px",
    }}>
      <div style={{
        width: 3,
        height: 3,
        borderRadius: "50%",
        background: color ?? "rgba(255,255,255,0.25)",
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9,
        letterSpacing: "2.5px",
        color: color ? `${color}bb` : "rgba(255,255,255,0.25)",
        textTransform: "uppercase",
        fontWeight: 700,
      }}>
        {label}
      </span>
    </div>
  );

  // ── DIVIDER ──────────────────────────────────────────────────
  const divider = () => (
    <div style={{
      height: 1,
      margin: "6px 20px",
      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
    }} />
  );

  return (
    <aside style={{
      background: "#000000",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      position: "relative",
    }}>

      {/* Glow sutil detrás del logo */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 100,
        background: "radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── BRAND ── */}
      <div style={{
        padding: "22px 20px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <img src={logoK} alt="K" style={{ width: 14, height: 14, objectFit: "contain" }} />
          </div>
          <div>
            <div style={{
              fontWeight: 800,
              letterSpacing: "3px",
              color: "#fff",
              fontSize: 11,
              lineHeight: 1,
            }}>
              KLASE A
            </div>
            <div style={{
              fontSize: 8,
              letterSpacing: "1.5px",
              color: "rgba(255,255,255,0.25)",
              textTransform: "uppercase",
              marginTop: 3,
              fontWeight: 500,
            }}>
              Sistema de producción
            </div>
          </div>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8, paddingTop: 4 }}>

        {(esPanol || esGestion) && (
          <>
            {group("Movimientos", SECTION_COLORS.movimientos)}
            {item("/panol",      "Maderas",    SECTION_COLORS.movimientos)}
            {item("/laminacion", "Laminación", SECTION_COLORS.movimientos)}
          </>
        )}

        {esGestion && (
          <>
            {divider()}
            {group("Producción", SECTION_COLORS.produccion)}
            {item("/obras",      "Obras",      SECTION_COLORS.produccion)}
            {item("/marmoleria", "Marmolería", SECTION_COLORS.produccion)}
            {item("/muebles",    "Muebles",    SECTION_COLORS.produccion)}
          </>
        )}

        <>
          {divider()}
          {group("Instrucciones", SECTION_COLORS.instrucciones)}
          {item("/procedimientos", "Procedimientos", SECTION_COLORS.instrucciones)}
        </>

        {esGestion && (
          <>
            {divider()}
            {group("Gestión Laminación", SECTION_COLORS.gestion_laminacion)}
            {item("/obras-laminacion", "Por obra",   SECTION_COLORS.gestion_laminacion, false)}
            {subItem("/laminacion", "Ingresos",    "?tab=Ingresos",    SECTION_COLORS.gestion_laminacion)}
            {subItem("/laminacion", "Egresos",     "?tab=Egresos",     SECTION_COLORS.gestion_laminacion)}
            {subItem("/laminacion", "Movimientos", "?tab=Movimientos", SECTION_COLORS.gestion_laminacion)}
            {subItem("/laminacion", "Pedidos",     "?tab=Pedidos",     SECTION_COLORS.gestion_laminacion)}
          </>
        )}

        {esGestion && (
          <>
            {divider()}
            {group("Gestión Maderas", SECTION_COLORS.gestion_maderas)}
            {item("/admin",       "Inventario",  SECTION_COLORS.gestion_maderas)}
            {item("/movimientos", "Movimientos", SECTION_COLORS.gestion_maderas)}
            {item("/pedidos",     "Pedidos",     SECTION_COLORS.gestion_maderas)}
          </>
        )}

        {esAdmin && (
          <>
            {divider()}
            {group("Sistema", SECTION_COLORS.sistema)}
            {item("/configuracion", "Configuración", SECTION_COLORS.sistema)}
          </>
        )}

        {esGestion && (
          <>
            {divider()}
            {group("Post Venta", SECTION_COLORS.postventa)}
            {item("/postventa", "Barcos Entregados", SECTION_COLORS.postventa)}
          </>
        )}
      </nav>

      {/* ── PIE ── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        {/* Avatar */}
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(255,255,255,0.6)",
          letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          {initials || "?"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            color: "#e4e4e7",
            letterSpacing: "0.5px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 2,
          }}>
            {username}
          </div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}>
            <div style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 6px #22c55e",
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 8,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}>
              {role}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          title="Cerrar sesión"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            color: "rgba(255,255,255,0.25)",
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 12,
            transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "#f87171";
            e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.25)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
          }}
        >
          ↪
        </button>
      </div>

    </aside>
  );
}
