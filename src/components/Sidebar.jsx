import React from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

export default function Sidebar({ profile, signOut }) {
  const location = useLocation();
  const path = location.pathname;

  const role = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  const verMaderas = role === "admin" || role === "oficina" || isAdmin;
  const verProduccion = isAdmin || role === "admin";
  const verLaminacion = isAdmin || role === "admin" || role === "oficina" || role === "panol";

  const S = {
    sidebar: { borderRight: "1px solid #2a2a2a", padding: 18, background: "#050505", position: "relative", height: "100%" },
    brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
    logoK: { width: 28, height: 28, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui, Arial", fontWeight: 900, letterSpacing: 3, color: "#fff" },
    groupTitle: { marginTop: 16, marginBottom: 6, fontSize: 11, opacity: 0.55, fontWeight: 900, letterSpacing: 1.5, color: "#fff", textTransform: "uppercase" },
    foot: { position: "absolute", left: 18, right: 18, bottom: 18, opacity: 0.85, fontSize: 12, color: "#d0d0d0" },
    navBtn: (isActive) => ({
      width: "100%", display: "block", textAlign: "left", padding: "10px 12px", borderRadius: 12,
      border: "1px solid #2a2a2a",
      background: isActive ? "#111" : "transparent",
      color: isActive ? "#fff" : "#bdbdbd",
      cursor: "pointer", marginTop: 8, fontWeight: 800, textDecoration: "none", fontSize: 14,
    }),
  };

  return (
    <aside style={S.sidebar}>
      <div style={S.brand}>
        <img src={logoK} alt="K" style={S.logoK} />
        <div style={S.brandText}>KLASE A</div>
      </div>

      {/* OPERACIÓN */}
      <div style={S.groupTitle}>Operación</div>
      <Link to="/panol" style={S.navBtn(path === "/panol")}>Maderas</Link>
      {verLaminacion && (
        <Link to="/laminacion" style={S.navBtn(path === "/laminacion")}>Laminación</Link>
      )}

      {/* GESTIÓN MADERAS */}
      {verMaderas && (
        <>
          <div style={S.groupTitle}>Gestión Maderas</div>
          <Link to="/admin" style={S.navBtn(path === "/admin")}>Inventario</Link>
          <Link to="/movimientos" style={S.navBtn(path === "/movimientos")}>Movimientos</Link>
          <Link to="/pedidos" style={S.navBtn(path === "/pedidos")}>Pedidos</Link>
        </>
      )}

      {/* PRODUCCIÓN */}
      {verProduccion && (
        <>
          <div style={S.groupTitle}>Producción</div>
          <Link to="/marmoleria" style={S.navBtn(path === "/marmoleria")}>Marmolería</Link>
          <Link to="/muebles" style={S.navBtn(path === "/muebles")}>Muebles</Link>
        </>
      )}

      <div style={S.foot}>
        <div>Usuario: <b>{username}</b></div>
        <div>Rol: <b>{role}</b></div>
        <div style={{ marginTop: 10 }}>
          <button type="button" style={S.navBtn(false)} onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
