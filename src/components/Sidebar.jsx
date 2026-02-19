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

  const S = {
    sidebar: {
      borderRight: "1px solid rgba(255,255,255,0.06)",
      padding: "20px 14px 18px",
      background: "rgba(4,4,4,0.98)",
      backdropFilter: "blur(30px)",
      WebkitBackdropFilter: "blur(30px)",
      height: "100%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
    },
    brand: {
      display: "flex", alignItems: "center", gap: 10,
      marginBottom: 28, paddingBottom: 18,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    logoK:      { width: 24, height: 24, objectFit: "contain", opacity: 0.9 },
    brandText:  { fontFamily: "Montserrat, system-ui", fontWeight: 900, letterSpacing: 4, color: "#fff", fontSize: 12 },
    section:    { marginTop: 20 },
    groupTitle: { fontSize: 9, opacity: 0.3, fontWeight: 700, letterSpacing: 2.5, color: "#fff", textTransform: "uppercase", paddingLeft: 10, marginBottom: 6 },
    divider:    { margin: "18px 0 0", borderTop: "1px solid rgba(255,255,255,0.05)" },
    spacer:     { flex: 1 },
    foot:       { paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "#d0d0d0" },
  };

  const navLink = (active) => ({
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    textAlign: "left", padding: "8px 10px", borderRadius: 9,
    border:  active ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    color:   active ? "#fff" : "rgba(255,255,255,0.45)",
    cursor: "pointer", marginTop: 2, fontWeight: active ? 600 : 400,
    textDecoration: "none", fontSize: 13, transition: "all 0.15s",
  });

  const subLink = (active) => ({
    ...navLink(active),
    paddingLeft: 26, fontSize: 12,
    color: active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.28)",
  });

  const signOutStyle = {
    marginTop: 10, width: "100%", padding: "8px 10px", borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.05)", background: "transparent",
    color: "rgba(255,255,255,0.35)", cursor: "pointer", fontWeight: 500,
    fontSize: 12, textAlign: "left", transition: "all 0.15s",
  };

  return (
    <aside style={S.sidebar}>

      {/* BRAND */}
      <div style={S.brand}>
        <img src={logoK} alt="K" style={S.logoK} />
        <div style={S.brandText}>KLASE A</div>
      </div>

      {/* ── MOVIMIENTOS ─────────────────────────── */}
      {(esPanol || esGestion) && (
        <div>
          <div style={S.groupTitle}>Movimientos</div>
          <Link to="/panol"      style={navLink(path === "/panol")}>📦 Maderas</Link>
          <Link to="/laminacion" style={navLink(path === "/laminacion" && !search)}>🧪 Laminación</Link>
        </div>
      )}

      {/* ── PRODUCCIÓN ─────────────────────────── */}
      {esGestion && (
        <>
          <div style={S.divider} />
          <div style={S.section}>
            <div style={S.groupTitle}>Producción</div>
            <Link to="/obras"      style={navLink(path === "/obras")}>🚢 Obras</Link>
            <Link to="/marmoleria" style={navLink(path === "/marmoleria")}>🪨 Marmolería</Link>
            <Link to="/muebles"    style={navLink(path === "/muebles")}>🪑 Muebles</Link>
          </div>
        </>
      )}

      {/* ── INSTRUCCIONES ─────────────────────── */}
      <>
        <div style={S.divider} />
        <div style={S.section}>
          <div style={S.groupTitle}>Instrucciones</div>
          <Link to="/procedimientos" style={navLink(path === "/procedimientos")}>📋 Procedimientos</Link>
        </div>
      </>

      {/* ── GESTIÓN LAMINACIÓN ─────────────────── */}
      {esGestion && (
        <>
          <div style={S.divider} />
          <div style={S.section}>
            <div style={S.groupTitle}>Gestión Laminación</div>
            <Link to="/laminacion"               style={navLink(path === "/laminacion" && !search)}>📊 Stock</Link>
            <Link to="/obras-laminacion"         style={navLink(path === "/obras-laminacion")}>🔬 Por obra</Link>
            <Link to="/laminacion?tab=Ingresos"  style={subLink(path === "/laminacion" && search === "?tab=Ingresos")}>↑ Ingresos</Link>
            <Link to="/laminacion?tab=Egresos"   style={subLink(path === "/laminacion" && search === "?tab=Egresos")}>↓ Egresos</Link>
            <Link to="/laminacion?tab=Movimientos" style={subLink(path === "/laminacion" && search === "?tab=Movimientos")}>↕ Movimientos</Link>
            <Link to="/laminacion?tab=Pedidos"   style={subLink(path === "/laminacion" && search === "?tab=Pedidos")}>🛒 Pedidos</Link>
          </div>
        </>
      )}

      {/* ── GESTIÓN MADERAS ────────────────────── */}
      {esGestion && (
        <>
          <div style={S.divider} />
          <div style={S.section}>
            <div style={S.groupTitle}>Gestión Maderas</div>
            <Link to="/admin"       style={navLink(path === "/admin")}>📊 Inventario</Link>
            <Link to="/movimientos" style={navLink(path === "/movimientos")}>↕ Movimientos</Link>
            <Link to="/pedidos"     style={navLink(path === "/pedidos")}>🛒 Pedidos</Link>
          </div>
        </>
      )}

      {/* ── SISTEMA ────────────────────────────── */}
      {esAdmin && (
        <>
          <div style={S.divider} />
          <div style={S.section}>
            <div style={S.groupTitle}>Sistema</div>
            <Link to="/configuracion" style={navLink(path === "/configuracion")}>⚙️ Configuración</Link>
          </div>
        </>
      )}

      {/* ── PIE ────────────────────────────────── */}
      <div style={S.spacer} />
      <div style={S.foot}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {(username[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 12 }}>{username}</div>
            <div style={{ fontSize: 10, opacity: 0.35, letterSpacing: 0.5 }}>{role}</div>
          </div>
        </div>
        <button type="button" onClick={signOut} style={signOutStyle}>Cerrar sesión</button>
      </div>

    </aside>
  );
}
