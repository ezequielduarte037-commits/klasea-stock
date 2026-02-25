import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import PedidosScreen         from "./screens/PedidosScreen";
import MarmoleriaScreen      from "./screens/MarmoleriaScreen";
import MueblesScreen         from "./screens/MueblesScreen";
import PanolScreen           from "./screens/PanolScreen";
import AdminDashboard        from "./screens/AdminDashboard";
import MovimientosScreen     from "./screens/MovimientosScreen";
import LaminacionScreen      from "./screens/LaminacionScreen";
import ObrasLaminacionScreen from "./screens/ObrasLaminacionScreen";
import ObrasScreen           from "./screens/ObrasScreen";
import ConfiguracionScreen   from "./screens/ConfiguracionScreen";
import ProcedimientosScreen  from "./screens/ProcedimientosScreen";
import PostVentaScreen       from "./screens/PostVentaScreen"; // <-- IMPORT NUEVO

import logoK from "./assets/logo-k.png";

function toInternalEmail(username) {
  const u = String(username || "").trim().toLowerCase();
  return `${u}@klasea.local`;
}

function RequireAuth({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ profile, allow, children }) {
  if (!profile) return <Navigate to="/login" replace />;
  if (!allow.includes(profile.role)) return <Navigate to="/panol" replace />;
  return children;
}

function LoginScreen({ onLoggedIn }) {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const email = toInternalEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
console.log("DATA:", data);
console.log("ERROR:", error);
      if (error) { setErr("Credenciales incorrectas."); return; }
      await onLoggedIn?.(data?.session);
      nav("/", { replace: true });
    } catch {
      setErr("Error inesperado.");
    } finally {
      setBusy(false);
    }
  }
  


  const S = {
    page: {
      position: "fixed", inset: 0, background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif",
      color: "#fff", padding: 24,
    },
    grid: {
      position: "absolute", inset: 0, zIndex: 0,
      backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
      backgroundSize: "60px 60px",
    },
    card: {
      width: "min(420px, 92vw)",
      borderRadius: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(10,10,10,0.85)",
      backdropFilter: "blur(40px)",
      WebkitBackdropFilter: "blur(40px)",
      boxShadow: "0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
      padding: "38px 36px 30px",
      zIndex: 1,
    },
    brandRow:  { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 },
    logoK:     { width: 40, height: 40, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui", fontWeight: 900, letterSpacing: 4, fontSize: 17, opacity: 0.95 },
    title:     { marginTop: 6, marginBottom: 28, textAlign: "center", fontFamily: "Montserrat, system-ui", fontSize: 10, letterSpacing: 6, opacity: 0.4, textTransform: "uppercase" },
    label:     { fontSize: 10, letterSpacing: 2, opacity: 0.5, textTransform: "uppercase", marginBottom: 7, display: "block", fontWeight: 600 },
    inputWrap: { position: "relative" },
    icon:      { position: "absolute", left: 14, top: 12, opacity: 0.4, fontSize: 13 },
    input:     {
      width: "100%", borderRadius: 12, padding: "11px 12px 11px 38px",
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.04)", color: "#fff", outline: "none",
      fontSize: 14, transition: "border-color 0.2s",
    },
    btn: {
      width: "100%", marginTop: 20, borderRadius: 12, padding: "12px 14px",
      border: "1px solid rgba(255,255,255,0.15)",
      background: "#fff", color: "#000", fontWeight: 800, letterSpacing: 2,
      cursor: "pointer", fontSize: 13,
    },
    error: {
      marginTop: 12, padding: "10px 14px", borderRadius: 12,
      border: "1px solid rgba(255,69,58,0.3)",
      background: "rgba(255,69,58,0.08)", color: "#ff8580", fontSize: 13, textAlign: "center",
    },
    help:   { marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center", fontSize: 11, opacity: 0.4 },
    footer: { position: "absolute", bottom: 16, width: "100%", textAlign: "center", fontSize: 11, opacity: 0.3, zIndex: 1 },
  };

  return (
    <div style={S.page}>
      <div style={S.grid} />
      <div style={S.card}>
        <div style={S.brandRow}>
          <img src={logoK} alt="K" style={S.logoK} />
          <div style={S.brandText}>KLASE A</div>
        </div>
        <div style={S.title}>Sistema de gestión</div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Usuario</label>
            <div style={S.inputWrap}>
              <span style={S.icon}>✉</span>
              <input style={S.input} placeholder="ADMIN / PANOL1 / OFICINA1" value={username}
                onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
          </div>
          <div>
            <label style={S.label}>Contraseña</label>
            <div style={S.inputWrap}>
              <span style={S.icon}>🔒</span>
              <input style={S.input} type="password" placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <button style={S.btn} type="submit" disabled={busy}>
            {busy ? "INGRESANDO…" : "INGRESAR"}
          </button>
          {err ? <div style={S.error}>{err}</div> : null}
        </form>
        <div style={S.help}>¿Olvidó su contraseña? Contacte al administrador.</div>
      </div>
      <div style={S.footer}>© 2026 Astillero Klase A</div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // 🔥 EL ARREGLO: Un estado general que frena toda la app hasta que Supabase conteste
  const [isInitializing, setIsInitializing] = useState(true);

  async function loadProfile(s) {
    // Si no hay sesión válida, cortamos la carga y dejamos que lo mande al login
    if (!s?.user?.id) { 
      setProfile(null);
      setIsInitializing(false); 
      return; 
    }
    
    // Si hay sesión, buscamos el perfil
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,role,is_admin")
      .eq("id", s.user.id)
      .single();
      
    if (!error) setProfile(data);
    
    // Terminamos de cargar, ahora sí mostramos la app
    setIsInitializing(false); 
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      loadProfile(data.session);
    });
    
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      loadProfile(s);
    });
    
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() { await supabase.auth.signOut(); }

  // 🔥 PANTALLA DE CARGA GLOBAL: Evita que el Router te expulse prematuramente
  if (isInitializing) {
    return (
      <div style={{ background: "#000", color: "#555", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", fontFamily: "system-ui" }}>
        Sincronizando sesión...
      </div>
    );
  }

  function HomeRedirect() {
    if (!session) return <Navigate to="/login" replace />;
    if (!profile) return <Navigate to="/login" replace />;
    if (profile.role === "panol") return <Navigate to="/panol" replace />;
    return <Navigate to="/admin" replace />;
  }

  const A = { profile, signOut };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen onLoggedIn={loadProfile} />} />
        <Route path="/" element={<HomeRedirect />} />

        {/* ── MOVIMIENTOS ─────────────────────── */}
        <Route path="/panol" element={
          <RequireAuth session={session}><PanolScreen {...A} /></RequireAuth>
        } />
        <Route path="/laminacion" element={
          <RequireAuth session={session}><LaminacionScreen {...A} /></RequireAuth>
        } />

        {/* ── PRODUCCIÓN ──────────────────────── */}
        <Route path="/obras" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <ObrasScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/marmoleria" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <MarmoleriaScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/muebles" element={
          <RequireAuth session={session}><MueblesScreen {...A} /></RequireAuth>
        } />
        
        {/* ── POST VENTA ──────────────────────── */}
        <Route path="/postventa" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <PostVentaScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />

        {/* ── INSTRUCCIONES ───────────────────── */}
        <Route path="/procedimientos" element={
          <RequireAuth session={session}><ProcedimientosScreen {...A} /></RequireAuth>
        } />

        {/* ── GESTIÓN LAMINACIÓN ──────────────── */}
        <Route path="/obras-laminacion" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <ObrasLaminacionScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />

        {/* ── GESTIÓN MADERAS ─────────────────── */}
        <Route path="/admin" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <AdminDashboard {...A} />
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/movimientos" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin","oficina"]}>
              <MovimientosScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/pedidos" element={
          <RequireAuth session={session}><PedidosScreen {...A} /></RequireAuth>
        } />

        {/* ── SISTEMA ─────────────────────────── */}
        <Route path="/configuracion" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin"]}>
              <ConfiguracionScreen {...A} />
            </RequireRole>
          </RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}