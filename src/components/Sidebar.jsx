import React from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

export default function Sidebar({ profile, signOut }) {
  const location = useLocation();
  const path = location.pathname; // Para saber dónde estamos parados

  const role = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  // Permisos simples
  const verMaderas = role === "admin" || role === "oficina" || isAdmin;
  const verProduccion = isAdmin; // Solo admin ve producción global

  // Estilos encapsulados (¡Limpiamos tus pantallas de esto!)
  const S = {
    sidebar: { borderRight: "1px solid #2a2a2a", padding: 18, background: "#050505", position: "relative", height: "100%" },
    brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
    logoK: { width: 28, height: 28, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui, Arial", fontWeight: 900, letterSpacing: 3, color: "#fff" },
    groupTitle: { marginTop: 16, marginBottom: 6, fontSize: 12, opacity: 0.7, fontWeight: 900, letterSpacing: 1, color: "#fff" },
    foot: { position: "absolute", left: 18, right: 18, bottom: 18, opacity: 0.85, fontSize: 12, color: "#d0d0d0" },
    
    // Función para estilo de botón activo/inactivo
    navBtn: (isActive) => ({
      width: "100%", display: "block", textAlign: "left", padding: "10px 12px", borderRadius: 12,
      border: "1px solid #2a2a2a",
      background: isActive ? "#111" : "transparent",
      color: isActive ? "#fff" : "#bdbdbd",
      cursor: "pointer", marginTop: 8, fontWeight: 800, textDecoration: "none", fontSize: 14
    }),
  };

  return (
    <aside style={S.sidebar}>
      <div style={S.brand}>
        <img src={logoK} alt="K" style={S.logoK} />
        <div style={S.brandText}>KLASE A</div>
      </div>

      {/* SECCIÓN MADERAS */}
      <div style={S.groupTitle}>MADERAS</div>
      <Link to="/panol" style={S.navBtn(path === "/panol")}>Operación</Link>
      
      {verMaderas && (
        <>
          <Link to="/admin" style={S.navBtn(path === "/admin")}>Inventario</Link>
          <Link to="/movimientos" style={S.navBtn(path === "/movimientos")}>Movimientos</Link>
          <Link to="/pedidos" style={S.navBtn(path === "/pedidos")}>Pedidos</Link>
        </>
      )}

      {/* SECCIÓN PRODUCCIÓN */}
      {verProduccion && (
        <>
          <div style={S.groupTitle}>PRODUCCIÓN</div>
          <Link to="/marmoleria" style={S.navBtn(path === "/marmoleria")}>Marmolería</Link>
          <Link to="/muebles" style={S.navBtn(path === "/muebles")}>Muebles</Link>
        </>
      )}

      {/* PIE DE BARRA */}
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