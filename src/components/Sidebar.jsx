import React from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

export default function Sidebar({ profile, signOut }) {
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;

  const role = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  // Permisos
  const esPanol     = role === "panol";
  const esGestion   = isAdmin || role === "admin" || role === "oficina";
  const esProduccion = isAdmin || role === "admin";

  // Estilos base
  const S = {
    sidebar: {
      borderRight: "1px solid #1e1e1e",
      padding: "18px 12px",
      background: "#050505",
      position: "relative",
      height: "100%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
    },
    brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 22 },
    logoK: { width: 26, height: 26, objectFit: "contain", opacity: 0.95 },
    brandText: {
      fontFamily: "Montserrat, system-ui, Arial",
      fontWeight: 900, letterSpacing: 3, color: "#fff", fontSize: 13,
    },
    section: { marginTop: 18 },
    groupTitle: {
      fontSize: 10, opacity: 0.4, fontWeight: 900,
      letterSpacing: 2, color: "#fff", textTransform: "uppercase",
      paddingLeft: 4, marginBottom: 4,
    },
    divider: { margin: "16px 0 0", borderTop: "1px solid #181818" },
    spacer: { flex: 1 },
    foot: {
      paddingTop: 12, borderTop: "1px solid #181818",
      fontSize: 12, color: "#d0d0d0",
    },
  };

  const navBtn = (isActive) => ({
    width: "100%", display: "block", textAlign: "left",
    padding: "9px 12px", borderRadius: 10,
    border: isActive ? "1px solid #333" : "1px solid transparent",
    background: isActive ? "#141414" : "transparent",
    color: isActive ? "#fff" : "#888",
    cursor: "pointer", marginTop: 3,
    fontWeight: isActive ? 700 : 400,
    textDecoration: "none", fontSize: 13,
  });

  const subBtn = (isActive) => ({
    ...navBtn(isActive),
    paddingLeft: 22,
    fontSize: 12,
    color: isActive ? "#d0d0d0" : "#555",
  });

  const signOutStyle = {
    marginTop: 10, width: "100%", padding: "8px 12px",
    borderRadius: 10, border: "1px solid #1e1e1e",
    background: "transparent", color: "#666",
    cursor: "pointer", fontWeight: 500, fontSize: 12, textAlign: "left",
  };

  return (
    <aside style={S.sidebar}>

      {/* BRAND */}
      <div style={S.brand}>
        <img src={logoK} alt="K" style={S.logoK} />
        <div style={S.brandText}>KLASE A</div>
      </div>

      {/* ── EGRESO / INGRESO ──────────────────────────
          Visible para pañol + admin (admin ve todo de todas formas)
          Es la pantalla operativa de carga rápida              */}
      {(esPanol || esGestion) && (
        <div style={S.section}>
          <div style={S.groupTitle}>Egreso / Ingreso</div>
          <Link to="/panol"     style={navBtn(path === "/panol")}>📦 Maderas</Link>
          <Link to="/laminacion" style={navBtn(path === "/laminacion" && !search)}>🧪 Laminación</Link>
        </div>
      )}

      {/* ── GESTIÓN LAMINACIÓN ────────────────────────
          Solo admin / oficina                                   */}
      {esGestion && (
        <>
          <div style={S.divider} />
          <div style={{ ...S.section, marginTop: 14 }}>
            <div style={S.groupTitle}>Gestión Laminación</div>
            <Link to="/laminacion"
              style={navBtn(path === "/laminacion" && !search)}>
              📊 Stock
            </Link>
            <Link to="/obras-laminacion"
              style={navBtn(path === "/obras-laminacion")}>
              🚢 Obras
            </Link>
            <Link to="/laminacion?tab=Ingresos"
              style={subBtn(path === "/laminacion" && search === "?tab=Ingresos")}>
              ↑ Ingresos
            </Link>
            <Link to="/laminacion?tab=Egresos"
              style={subBtn(path === "/laminacion" && search === "?tab=Egresos")}>
              ↓ Egresos
            </Link>
            <Link to="/laminacion?tab=Movimientos"
              style={subBtn(path === "/laminacion" && search === "?tab=Movimientos")}>
              ↔ Movimientos
            </Link>
            <Link to="/laminacion?tab=Pedidos"
              style={subBtn(path === "/laminacion" && search === "?tab=Pedidos")}>
              🛒 Pedidos
            </Link>
          </div>
        </>
      )}

      {/* ── GESTIÓN MADERAS ───────────────────────────
          Solo admin / oficina                                   */}
      {esGestion && (
        <>
          <div style={S.divider} />
          <div style={{ ...S.section, marginTop: 14 }}>
            <div style={S.groupTitle}>Gestión Maderas</div>
            <Link to="/admin"       style={navBtn(path === "/admin")}>📊 Inventario</Link>
            <Link to="/movimientos" style={navBtn(path === "/movimientos")}>↔ Movimientos</Link>
            <Link to="/pedidos"     style={navBtn(path === "/pedidos")}>🛒 Pedidos</Link>
          </div>
        </>
      )}

      {/* ── PRODUCCIÓN ────────────────────────────────
          Solo admin                                            */}
      {esProduccion && (
        <>
          <div style={S.divider} />
          <div style={{ ...S.section, marginTop: 14 }}>
            <div style={S.groupTitle}>Producción</div>
            <Link to="/marmoleria" style={navBtn(path === "/marmoleria")}>🪨 Marmolería</Link>
            <Link to="/muebles"    style={navBtn(path === "/muebles")}>🪑 Muebles</Link>
          </div>
        </>
      )}

      {/* ── PIE ───────────────────────────────────── */}
      <div style={S.spacer} />
      <div style={S.foot}>
        <div>
          <b style={{ color: "#d0d0d0" }}>{username}</b>
          <span style={{ marginLeft: 6, opacity: 0.45, fontSize: 11 }}>{role}</span>
        </div>
        <button type="button" onClick={signOut} style={signOutStyle}>
          Cerrar sesión
        </button>
      </div>

    </aside>
  );
}
