import React from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

export default function Sidebar({ profile, signOut }) {
  const location = useLocation();
  const path     = location.pathname;
  const search   = location.search;

  const role     = profile?.role ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  const esPanol   = role === "panol";
  const esGestion = isAdmin || role === "admin" || role === "oficina";
  const esAdmin   = isAdmin || role === "admin";

  // Paleta de alta visibilidad sobre negro
  const colors = {
    bg: "#000000",
    border: "rgba(255,255,255,0.1)",
    groupTitle: "#FFFFFF", // Blanco puro para que se lea perfecto
    textMain: "#A0A0A0",   // Gris claro para items
    textActive: "#FFFFFF", // Blanco para el seleccionado
    textSub: "#707070",    // Gris para sub-items
    accent: "#FFFFFF"
  };

  const item = (href, label, exact = true) => {
    const on = exact ? path === href : path.startsWith(href);
    return (
      <Link to={href} style={{
        display: "block",
        padding: "10px 24px",
        color: on ? colors.textActive : colors.textMain,
        fontSize: 11,
        letterSpacing: "1.5px",
        fontWeight: on ? 600 : 400,
        textTransform: "uppercase",
        textDecoration: "none",
        transition: "all 0.2s",
        background: on ? "rgba(255,255,255,0.08)" : "transparent",
        borderLeft: `2px solid ${on ? colors.accent : "transparent"}`,
      }}>
        {label}
      </Link>
    );
  };

  const subItem = (href, label, qs = "") => {
    const on = path === href && (qs ? search === qs : !search);
    return (
      <Link to={`${href}${qs}`} style={{
        display: "block",
        padding: "6px 0 6px 40px",
        color: on ? colors.textActive : colors.textSub,
        fontSize: 10,
        letterSpacing: "1px",
        textTransform: "uppercase",
        textDecoration: "none",
        transition: "color 0.2s",
        fontWeight: on ? 600 : 400,
      }}>
        {on ? "• " : ""}{label}
      </Link>
    );
  };

  const group = (label) => (
    <div style={{
      fontSize: 10, 
      letterSpacing: "2px", 
      color: colors.groupTitle,
      textTransform: "uppercase", 
      fontWeight: 800,
      padding: "24px 24px 8px 24px",
      opacity: 0.9
    }}>
      {label}
    </div>
  );

  return (
    <aside style={{
      background: colors.bg,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${colors.border}`,
    }}>

      {/* BRAND */}
      <div style={{ padding: "28px 24px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <img src={logoK} alt="K" style={{ width: 20, height: 20, objectFit: "contain" }} />
          <span style={{ fontWeight: 800, letterSpacing: "4px", color: "#fff", fontSize: 12 }}>
            KLASE A
          </span>
        </div>
        <div style={{ fontSize: 9, letterSpacing: "1.5px", color: "#444", textTransform: "uppercase", fontWeight: 700 }}>
          Sistema de producción
        </div>
      </div>

      {/* NAV */}
      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 20 }}>

        {(esPanol || esGestion) && (
          <>
            {group("Movimientos")}
            {item("/panol",      "Maderas")}
            {item("/laminacion", "Laminación")}
          </>
        )}

        {esGestion && (
          <>
            {group("Producción")}
            {item("/obras",      "Obras")}
            {item("/marmoleria", "Marmolería")}
            {item("/muebles",    "Muebles")}
          </>
        )}

        <>
          {group("Instrucciones")}
          {item("/procedimientos", "Procedimientos")}
        </>

        {esGestion && (
          <>
            {group("Gestión Laminación")}
            {item("/obras-laminacion", "Por obra")}
            {subItem("/laminacion", "Ingresos",    "?tab=Ingresos")}
            {subItem("/laminacion", "Egresos",     "?tab=Egresos")}
            {subItem("/laminacion", "Movimientos", "?tab=Movimientos")}
            {subItem("/laminacion", "Pedidos",     "?tab=Pedidos")}
          </>
        )}

        {esGestion && (
          <>
            {group("Gestión Maderas")}
            {item("/admin",       "Inventario")}
            {item("/movimientos", "Movimientos")}
            {item("/pedidos",     "Pedidos")}
          </>
        )}

        {esAdmin && (
          <>
            {group("Sistema")}
            {item("/configuracion", "Configuración")}
          </>
        )}
      </nav>

      {/* PIE */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "20px 24px" }}>
        <div style={{ fontSize: 11, color: "#fff", letterSpacing: "1px", marginBottom: 2, fontWeight: 600 }}>
          {username}
        </div>
        <div style={{ fontSize: 9, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
          {role}
        </div>
        <button
          type="button"
          onClick={signOut}
          style={{
            background: "none", border: "none",
            color: "#888", fontSize: 9,
            letterSpacing: "2px", textTransform: "uppercase",
            cursor: "pointer", padding: 0,
            textDecoration: "underline"
          }}
        >
          Cerrar sesión
        </button>
      </div>

    </aside>
  );
}