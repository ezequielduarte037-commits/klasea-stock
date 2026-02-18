import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import PedidosScreen from "./screens/PedidosScreen";
import MarmoleriaScreen from "./screens/MarmoleriaScreen";
import MueblesScreen from "./screens/MueblesScreen";
import PanolScreen from "./screens/PanolScreen";
import AdminDashboard from "./screens/AdminDashboard";
import MovimientosScreen from "./screens/MovimientosScreen";
import LaminacionScreen from "./screens/LaminacionScreen";
import ObrasLaminacionScreen from "./screens/ObrasLaminacionScreen";

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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const email = toInternalEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
    page: { position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "Roboto, system-ui, Arial", color: "#fff", padding: 24 },
    overlay: { position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.60), rgba(0,0,0,0.85))" },
    card: { width: "min(420px, 92vw)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.60)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.60)", padding: "34px 34px 28px", zIndex: 1 },
    brandRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 },
    logoK: { width: 44, height: 44, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui, Arial", fontWeight: 900, letterSpacing: 3, fontSize: 18, opacity: 0.95 },
    title: { marginTop: 8, marginBottom: 22, textAlign: "center", fontFamily: "Montserrat, system-ui, Arial", fontSize: 14, letterSpacing: 6, opacity: 0.65, textTransform: "uppercase" },
    label: { fontSize: 11, letterSpacing: 2.2, opacity: 0.7, textTransform: "uppercase", marginLeft: 6, marginBottom: 8 },
    inputWrap: { position: "relative" },
    icon: { position: "absolute", left: 14, top: 12, opacity: 0.55, fontSize: 14 },
    input: { width: "100%", borderRadius: 12, padding: "11px 12px 11px 38px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", outline: "none" },
    btn: { width: "100%", marginTop: 18, borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.10)", background: "#fff", color: "#000", fontWeight: 900, letterSpacing: 2, cursor: "pointer" },
    error: { marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.15)", color: "#ffd7d4", fontSize: 13, textAlign: "center" },
    help: { marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)", textAlign: "center", fontSize: 12, opacity: 0.6 },
    footer: { position: "absolute", bottom: 16, width: "100%", textAlign: "center", fontSize: 12, opacity: 0.45, zIndex: 1 },
  };

  return (
    <div style={S.page}>
      <div style={S.overlay} />
      <div style={S.card}>
        <div style={S.brandRow}>
          <img src={logoK} alt="K" style={S.logoK} />
          <div style={S.brandText}>KLASE A</div>
        </div>
        <div style={S.title}>ACCESO</div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <div style={S.label}>Usuario</div>
            <div style={S.inputWrap}>
              <span style={S.icon}>✉</span>
              <input style={S.input} placeholder="ADMIN / PANOL1 / OFICINA1" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
          </div>
          <div>
            <div style={S.label}>Contraseña</div>
            <div style={S.inputWrap}>
              <span style={S.icon}>🔑</span>
              <input style={S.input} type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <button style={S.btn} type="submit" disabled={busy}>{busy ? "INGRESANDO..." : "INGRESAR"}</button>
          {err ? <div style={S.error}>{err}</div> : null}
        </form>
        <div style={S.help}>¿Olvidó su contraseña? Contacte a soporte.</div>
      </div>
      <div style={S.footer}>© 2026 Astillero Klase A. Todos los derechos reservados.</div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  async function loadProfile(s) {
    setLoadingProfile(true);
    setProfile(null);
    if (!s?.user?.id) { setLoadingProfile(false); return; }
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,role,is_admin")
      .eq("id", s.user.id)
      .single();
    if (!error) setProfile(data);
    setLoadingProfile(false);
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

  function HomeRedirect() {
    if (!session) return <Navigate to="/login" replace />;
    if (loadingProfile) return <div style={{ background: "#000", color: "#fff", minHeight: "100vh", padding: 20 }}>Cargando…</div>;
    if (!profile) return <Navigate to="/login" replace />;
    if (profile.role === "panol") return <Navigate to="/panol" replace />;
    return <Navigate to="/admin" replace />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen onLoggedIn={loadProfile} />} />
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/panol" element={
          <RequireAuth session={session}>
            <PanolScreen profile={profile} signOut={signOut} />
          </RequireAuth>
        } />

        {/* NUEVO: Laminación — accesible para todos los roles autenticados */}
        <Route path="/laminacion" element={
          <RequireAuth session={session}>
            <LaminacionScreen profile={profile} signOut={signOut} />
          </RequireAuth>
        } />

        <Route path="/obras-laminacion" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin", "oficina"]}>
              <ObrasLaminacionScreen profile={profile} signOut={signOut} />
            </RequireRole>
          </RequireAuth>
        } />

        <Route path="/marmoleria" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin", "oficina"]}>
              <MarmoleriaScreen profile={profile} signOut={signOut} />
            </RequireRole>
          </RequireAuth>
        } />

        <Route path="/pedidos" element={
          <RequireAuth session={session}>
            <PedidosScreen profile={profile} signOut={signOut} />
          </RequireAuth>
        } />

        <Route path="/admin" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin", "oficina"]}>
              <AdminDashboard profile={profile} signOut={signOut} />
            </RequireRole>
          </RequireAuth>
        } />

        <Route path="/muebles" element={
          <RequireAuth session={session}>
            <MueblesScreen profile={profile} signOut={signOut} />
          </RequireAuth>
        } />

        <Route path="/movimientos" element={
          <RequireAuth session={session}>
            <RequireRole profile={profile} allow={["admin", "oficina"]}>
              <MovimientosScreen profile={profile} signOut={signOut} />
            </RequireRole>
          </RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
