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
import PostVentaScreen       from "./screens/PostVentaScreen";
import ClientePanelScreen    from "./screens/ClientePanelScreen";
import HomeScreen            from "./screens/HomeScreen";

import logoK from "./assets/logo-k.png";

// Internos:  usuario  → usuario@klasea.local
// Clientes:  usuario  → usuario@klasea.client
function toLocalEmail(u)  { return `${String(u||"").trim().toLowerCase()}@klasea.local`;  }
function toClientEmail(u) { return `${String(u||"").trim().toLowerCase()}@klasea.client`; }

function RequireAuth({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
function RequireRole({ profile, allow, children }) {
  if (!profile) return <Navigate to="/login" replace />;
  if (!allow.includes(profile.role)) return <Navigate to="/panol" replace />;
  return children;
}

// ─── LOGIN ─────────────────────────────────────────────────────────────────
// Campo único: usuario (sin @, sin distinción visible)
// El sistema prueba @klasea.local primero, luego @klasea.client
// y redirige automáticamente según el rol que devuelva el perfil.
// ──────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLoggedIn }) {
  const nav = useNavigate();
  const [usuario,  setUsuario]  = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState("");
  const [busy,     setBusy]     = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    const u = usuario.trim();
    if (!u || !password) { setErr("Completá los dos campos."); setBusy(false); return; }

    try {
      // Si ya tiene @ → es email directo (clientes con email real o nuevos con @klasea.client)
      // Si no tiene @ → probar como personal interno, luego como cliente por username
      const esEmail = u.includes("@");
      const intentos = esEmail
        ? [u.toLowerCase()]
        : [toLocalEmail(u.toLowerCase()), toClientEmail(u.toLowerCase())];

      let data = null, lastError = null;
      for (const email of intentos) {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (!res.error && res.data?.session) { data = res.data; break; }
        lastError = res.error;
      }

      if (!data?.session) {
        setErr("Usuario o contraseña incorrectos.");
        return;
      }

      await onLoggedIn?.(data.session);
      nav("/", { replace: true });
    } catch {
      setErr("Error inesperado. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"#06060a",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Outfit', system-ui, sans-serif",
      color:"#fff", overflow:"hidden", padding:20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;900&display=swap');

        @keyframes rise {
          from { opacity:0; transform:translateY(20px) scale(0.98); }
          to   { opacity:1; transform:translateY(0)   scale(1);     }
        }

        .ln-field {
          width:100%; box-sizing:border-box;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:10px;
          padding:11px 14px;
          color:#f0f0f0;
          font-size:14px;
          font-family:'Outfit',system-ui;
          outline:none;
          transition:border-color .18s, background .18s;
        }
        .ln-field::placeholder { color:rgba(255,255,255,0.18); }
        .ln-field:focus {
          border-color:rgba(255,255,255,0.28);
          background:rgba(255,255,255,0.06);
        }

        .ln-btn {
          width:100%; padding:13px;
          background:#fff; color:#06060a;
          border:none; border-radius:10px;
          font-size:13px; font-weight:800;
          letter-spacing:0.18em; text-transform:uppercase;
          cursor:pointer;
          font-family:'Outfit',system-ui;
          transition:opacity .15s, transform .12s;
        }
        .ln-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
        .ln-btn:active               { transform:translateY(0); }
        .ln-btn:disabled             { opacity:.45; cursor:not-allowed; }
      `}</style>

      {/* Glow de fondo */}
      <div style={{
        position:"absolute", top:"-15%", left:"50%", transform:"translateX(-50%)",
        width:"600px", height:"400px", borderRadius:"50%",
        background:"radial-gradient(ellipse, rgba(59,100,246,0.07) 0%, transparent 70%)",
        pointerEvents:"none",
      }} />

      {/* Líneas de cuadrícula muy sutiles */}
      <div style={{
        position:"absolute", inset:0, pointerEvents:"none",
        backgroundImage:[
          "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
        ].join(","),
        backgroundSize:"80px 80px",
      }} />

      {/* Card */}
      <div style={{
        width:"min(380px,100%)",
        borderRadius:18,
        background:"rgba(14,14,22,0.95)",
        border:"1px solid rgba(255,255,255,0.07)",
        backdropFilter:"blur(60px)",
        boxShadow:"0 40px 120px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.05)",
        padding:"42px 36px 34px",
        animation:"rise .35s cubic-bezier(.22,1,.36,1) both",
        position:"relative", zIndex:1,
      }}>

        {/* Logo + nombre */}
        <div style={{ textAlign:"center", marginBottom:38 }}>
          <img src={logoK} alt="Klase A"
            style={{ width:44, height:44, objectFit:"contain", display:"block", margin:"0 auto 14px" }} />
          <div style={{
            fontWeight:900, fontSize:16,
            letterSpacing:"0.38em", color:"#fff",
          }}>
            KLASE A
          </div>
          <div style={{
            marginTop:6, fontSize:9.5,
            letterSpacing:"0.22em", color:"rgba(255,255,255,0.22)",
            textTransform:"uppercase",
          }}>
            Astillero · Acceso al sistema
          </div>
        </div>

        <form onSubmit={handleLogin}>

          {/* Usuario */}
          <div style={{ marginBottom:13 }}>
            <label style={{
              display:"block", marginBottom:7,
              fontSize:9, letterSpacing:"0.22em",
              color:"rgba(255,255,255,0.32)", textTransform:"uppercase", fontWeight:600,
            }}>
              Usuario
            </label>
            <input
              className="ln-field"
              autoFocus
              autoComplete="username"
              spellCheck={false}
              value={usuario}
              onChange={e => { setUsuario(e.target.value); setErr(""); }}
              placeholder="usuario  ó  email@gmail.com"
            />
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom:26 }}>
            <label style={{
              display:"block", marginBottom:7,
              fontSize:9, letterSpacing:"0.22em",
              color:"rgba(255,255,255,0.32)", textTransform:"uppercase", fontWeight:600,
            }}>
              Contraseña
            </label>
            <input
              className="ln-field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setErr(""); }}
              placeholder="••••••••"
            />
          </div>

          {/* Error */}
          {err && (
            <div style={{
              marginBottom:16, padding:"10px 14px",
              borderRadius:9,
              background:"rgba(239,68,68,0.08)",
              border:"1px solid rgba(239,68,68,0.25)",
              color:"#fca5a5", fontSize:12.5, textAlign:"center",
              letterSpacing:"0.01em",
            }}>
              {err}
            </div>
          )}

          <button className="ln-btn" type="submit" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar"}
          </button>

        </form>

        <div style={{
          marginTop:22, paddingTop:18,
          borderTop:"1px solid rgba(255,255,255,0.05)",
          textAlign:"center",
          fontSize:10.5, color:"rgba(255,255,255,0.2)",
          letterSpacing:"0.02em",
        }}>
          ¿Olvidaste tu contraseña? Contactá al administrador.
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position:"absolute", bottom:16,
        fontSize:10, color:"rgba(255,255,255,0.14)",
        letterSpacing:"0.08em",
      }}>
        © 2026 Astillero Klase A
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────
export default function App() {
  const [session,        setSession]        = useState(null);
  const [profile,        setProfile]        = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  async function loadProfile(s) {
    if (!s?.user?.id) { setProfile(null); setIsInitializing(false); return; }

    // Buscar en profiles (personal interno)
    const { data: pData } = await supabase
      .from("profiles")
      .select("id,username,role,is_admin")
      .eq("id", s.user.id)
      .single();

    if (pData) {
      setProfile(pData);
      setIsInitializing(false);
      return;
    }

    // Buscar en clientes (propietarios de barcos)
    const { data: cData } = await supabase
      .from("clientes")
      .select("id,username,nombre_completo,modelo_barco")
      .eq("id", s.user.id)
      .single();

    if (cData) {
      setProfile({
        id:       cData.id,
        username: cData.username ?? cData.nombre_completo,
        role:     "cliente",
        is_admin: false,
      });
    } else {
      setProfile(null);
    }
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

  if (isInitializing) {
    return (
      <div style={{
        background:"#06060a", color:"rgba(255,255,255,0.3)",
        minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:10, letterSpacing:"0.3em", textTransform:"uppercase",
        fontFamily:"'Outfit',system-ui",
      }}>
        Cargando…
      </div>
    );
  }

  // Muestra la pantalla de inicio para todos los roles internos.
  // Clientes siguen yendo a su panel separado.
  function HomeRedirect() {
    if (!session || !profile) return <Navigate to="/login" replace />;
    if (profile.role === "cliente") return <Navigate to="/mi-panel" replace />;
    return <HomeScreen profile={profile} signOut={signOut} />;
  }

  const A = { profile, signOut };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen onLoggedIn={loadProfile} />} />
        <Route path="/"      element={<HomeRedirect />} />

        {/* Panel de cliente */}
        <Route path="/mi-panel" element={
          <RequireAuth session={session}>
            {profile?.role === "cliente"
              ? <ClientePanelScreen session={session} onSignOut={signOut} />
              : <Navigate to="/" replace />
            }
          </RequireAuth>
        } />

        {/* Personal */}
        <Route path="/panol"      element={<RequireAuth session={session}><PanolScreen      {...A} /></RequireAuth>} />
        <Route path="/laminacion" element={<RequireAuth session={session}><LaminacionScreen {...A} /></RequireAuth>} />
        <Route path="/muebles"    element={<RequireAuth session={session}><MueblesScreen    {...A} /></RequireAuth>} />
        <Route path="/pedidos"    element={<RequireAuth session={session}><PedidosScreen    {...A} /></RequireAuth>} />
        <Route path="/procedimientos" element={<RequireAuth session={session}><ProcedimientosScreen {...A} /></RequireAuth>} />

        {/* Admin / Oficina */}
        <Route path="/admin"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><AdminDashboard       {...A} /></RequireRole></RequireAuth>} />
        <Route path="/obras"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><ObrasScreen           {...A} /></RequireRole></RequireAuth>} />
        <Route path="/marmoleria" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><MarmoleriaScreen      {...A} /></RequireRole></RequireAuth>} />
        <Route path="/postventa"  element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><PostVentaScreen       {...A} /></RequireRole></RequireAuth>} />
        <Route path="/movimientos"element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><MovimientosScreen     {...A} /></RequireRole></RequireAuth>} />
        <Route path="/obras-laminacion" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina"]}><ObrasLaminacionScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/configuracion"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin"]}><ConfiguracionScreen {...A} /></RequireRole></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
