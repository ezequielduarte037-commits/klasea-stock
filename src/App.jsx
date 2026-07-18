import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import PedidosScreen         from "@/features/inventario/PedidosScreen";
import MarmoleriaScreen      from "@/features/marmoleria/MarmoleriaScreen";
import MueblesScreen         from "@/features/muebles/MueblesScreen";
import PanolScreen           from "@/features/inventario/PanolScreen";
import AdminDashboard        from "@/features/admin/AdminDashboard";
import MovimientosScreen     from "@/features/inventario/MovimientosScreen";
import LaminacionScreen      from "@/features/laminacion/LaminacionScreen";
import ObrasLaminacionScreen from "@/features/laminacion/ObrasLaminacionScreen";
import PlantillasLineaScreen from "@/features/laminacion/PlantillasLineaScreen";
import ObrasScreen           from "@/features/obras/ObrasScreen";
import ConfiguracionScreen   from "@/features/configuracion/ConfiguracionScreen";
import ProcedimientosScreen  from "@/features/procedimientos/ProcedimientosScreen";
import PostVentaScreen       from "@/features/postventa/PostVentaScreen";
import ClientePanelScreen    from "@/features/cliente/ClientePanelScreen";
import HomeScreen            from "@/features/home/HomeScreen";
import CalendarioScreen      from "@/features/calendario/CalendarioScreen";
import PedidosMaderaScreen   from "@/features/inventario/PedidosMaderaScreen";
import MaderasScreen         from "@/features/inventario/MaderasScreen";
import PurchaseRequestsScreen from "@/features/compras/PurchaseRequestsScreen";
import ScanEgresoScreen      from "@/features/inventario/ScanEgresoScreen";
import BalanzaDebugScreen    from "@/features/inventario/BalanzaDebugScreen";
import ScanPedidoScreen      from "@/features/inventario/ScanPedidoScreen";
import ColectorHomeScreen    from "@/features/inventario/ColectorHomeScreen";
import CalibrarPesosScreen   from "@/features/panol/CalibrarPesosScreen";
import EtiquetasScreen       from "@/features/inventario/EtiquetasScreen";
import RrhhScreen            from "@/features/rrhh/RrhhScreen";
import MaterialesScreen      from "@/features/materiales/MaterialesScreen";
import RecepcionPanolScreen  from "@/features/panol/RecepcionPanolScreen";
import StockPanolScreen      from "@/features/panol/StockPanolScreen";
import PortalProveedorScreen from "@/features/proveedores/PortalProveedorScreen";
import MemoriasScreen        from "@/features/memorias/MemoriasScreen";
import SemaforoScreen        from "@/features/semaforo/SemaforoScreen";
import CadeteRutaScreen      from "@/features/cadete/CadeteRutaScreen";

import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import ChangePasswordModal from "@/features/cuenta/ChangePasswordModal";
import NotificacionesBell from "@/components/NotificacionesBell";
import { C } from "@/theme";

import logoK from "@/assets/logos/logo-k.png";

// Internos:  usuario  → usuario@klasea.local
// Clientes:  usuario  → usuario@klasea.client
function toLocalEmail(u)  { return `${String(u||"").trim().toLowerCase()}@klasea.local`;  }
function toClientEmail(u) { return `${String(u||"").trim().toLowerCase()}@klasea.client`; }

// Rutas del colector: pantalla chica y uso con guantes. La campanita flotante se
// superpone con los controles y rompe el layout, así que ahí no va.
const RUTAS_COLECTOR = new Set(["/colector", "/scan", "/scan-pedido"]);

function CampanitaSalvoColector({ profile }) {
  const { pathname } = useLocation();
  if (RUTAS_COLECTOR.has(pathname)) return null;
  return <NotificacionesBell profile={profile} />;
}

function RequireAuth({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
function RequireRole({ profile, allow, children }) {
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.is_admin || allow.includes(profile.role)) return children;
  if (profile.role === "compras") return <Navigate to="/compras" replace />;
  if (profile.role === "cadete")  return <Navigate to="/cadete" replace />;
  if (profile.role === "rrhh")    return <Navigate to="/rrhh" replace />;
  if (profile.role === "cliente") return <Navigate to="/mi-panel" replace />;
  return <Navigate to="/" replace />;
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

      let data = null;
      for (const email of intentos) {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (!res.error && res.data?.session) { data = res.data; break; }
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
      background:C.bg,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Outfit', system-ui, sans-serif",
      color:C.text, overflow:"hidden", padding:20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;900&display=swap');

        @keyframes rise {
          from { opacity:0; transform:translateY(20px) scale(0.98); }
          to   { opacity:1; transform:translateY(0)   scale(1);     }
        }

        .ln-field {
          width:100%; box-sizing:border-box;
          background:var(--panel);
          border:1px solid var(--border);
          border-radius:10px;
          padding:11px 14px;
          color:var(--text);
          font-size:14px;
          font-family:'Outfit',system-ui;
          outline:none;
          transition:border-color .18s, background .18s;
        }
        .ln-field::placeholder { color:var(--dim); }
        .ln-field:focus {
          border-color:var(--focus);
          background:var(--panel-2);
        }

        .ln-btn {
          width:100%; padding:14px;
          background:linear-gradient(135deg, var(--inverse-bg), var(--inverse-bg)); color:var(--inverse-text);
          border:none; border-radius:12px;
          font-size:14px; font-weight:800;
          letter-spacing:0.12em; text-transform:uppercase;
          cursor:pointer;
          font-family:'Outfit',system-ui;
          transition:all .2s cubic-bezier(.22,1,.36,1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .ln-btn:hover:not(:disabled) { opacity:0.95; transform:translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
        .ln-btn:active               { transform:translateY(0); }
        .ln-btn:disabled             { opacity:.45; cursor:not-allowed; }

        .login-logo {
          width: 48px; height: 48px;
          object-fit: contain; display: block;
          margin: 0 auto 16px;
        }
        html[data-theme="light"] .login-logo {
          filter: invert(1);
        }
      `}</style>

      {/* Glow de fondo */}
      <div style={{
        position:"absolute", top:"-15%", left:"50%", transform:"translateX(-50%)",
        width:"600px", height:"400px", borderRadius:"50%",
        background:"radial-gradient(ellipse, var(--login-glow) 0%, transparent 70%)",
        pointerEvents:"none",
      }} />

      {/* Líneas de cuadrícula muy sutiles */}
      <div style={{
        position:"absolute", inset:0, pointerEvents:"none",
        backgroundImage:[
          "linear-gradient(var(--grid-line) 1px, transparent 1px)",
          "linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
        ].join(","),
        backgroundSize:"80px 80px",
      }} />

      {/* Card */}
      <div style={{
        width:"min(400px,100%)",
        borderRadius:24,
        background:C.bg1,
        border:`1px solid ${C.b1}`,
        backdropFilter:"blur(24px)",
        boxShadow:"0 30px 80px var(--shadow-strong), inset 0 1px 0 rgba(255,255,255,0.05)",
        padding:"48px 40px 42px",
        animation:"rise .4s cubic-bezier(.22,1,.36,1) both",
        position:"relative", zIndex:1,
      }}>

        {/* Logo + nombre */}
        <div style={{ textAlign:"center", marginBottom:42 }}>
          <img src={logoK} alt="Klase A" className="login-logo" />
          <div style={{
            fontWeight:900, fontSize:16,
            letterSpacing:"0.13em", color:C.text,
          }}>
            KLASE A
          </div>
          <div style={{
            marginTop:6, fontSize:10,
            letterSpacing:"0.12em", color:C.dim,
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
              fontSize:10, letterSpacing:"0.12em",
              color:C.dim, textTransform:"uppercase", fontWeight:700,
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
              fontSize:10, letterSpacing:"0.12em",
              color:C.dim, textTransform:"uppercase", fontWeight:700,
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
              background:"var(--red-soft)",
              border:"1px solid var(--red-border)",
              color:C.red, fontSize:13, textAlign:"center",
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
          borderTop:`1px solid ${C.border}`,
          textAlign:"center",
          fontSize:11, color:C.dim,
          letterSpacing:"0.02em",
        }}>
          ¿Olvidaste tu contraseña? Contactá al administrador.
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position:"absolute", bottom:16,
        fontSize:11, color:C.dim,
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
    let { data: pData, error: pErr } = await supabase
      .from("profiles")
      .select("id,username,role,is_admin,sede,must_change_password")
      .eq("id", s.user.id)
      .single();
    if (pErr && String(pErr.message || "").includes("must_change_password")) {
      const retry = await supabase
        .from("profiles")
        .select("id,username,role,is_admin,sede")
        .eq("id", s.user.id)
        .single();
      pData = retry.data;
    }

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
        background:C.bg, color:C.dim,
        minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:11, letterSpacing:"0.13em", textTransform:"uppercase",
        fontFamily:"'Outfit',system-ui",
      }}>
        Cargando…
      </div>
    );
  }
  const A = { profile, signOut };
  // El colector de pañol (PDA) tiene pantalla chica → ahí mandamos directo al
  // escáner para que un refresh no los saque del flujo. En PC (pantalla grande)
  // pañol entra a su panel normal con el sidebar, como siempre.
  const esColector = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  const homeElement = !session || !profile
    ? <Navigate to="/login" replace />
    : profile.role === "cliente"
      ? <Navigate to="/mi-panel" replace />
      : profile.role === "rrhh"
        ? <Navigate to="/rrhh" replace />
        : profile.role === "cadete"
          ? <Navigate to="/cadete" replace />
          : (profile.role === "panol" && esColector)
            // El colector arranca en una pantalla de elección, no directo al egreso
            // de maderas: desde el aparato también se piden reposiciones a compras.
            ? <Navigate to="/colector" replace />
            : <HomeScreen profile={profile} signOut={signOut} />;

  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
      <Routes>
        <Route path="/login" element={<LoginScreen onLoggedIn={loadProfile} />} />
        <Route path="/proveedor/:token" element={<PortalProveedorScreen />} />
        <Route path="/"      element={homeElement} />

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
        <Route path="/panol"      element={<Navigate to="/madera?tab=Stock" replace />} />
        <Route path="/laminacion" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol","laminacion"]}><LaminacionScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/muebles"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","muebles"]}><MueblesScreen    {...A} /></RequireRole></RequireAuth>} />
        <Route path="/pedidos"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><PedidosScreen    {...A} /></RequireRole></RequireAuth>} />
        <Route path="/compras"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol","compras"]}><PurchaseRequestsScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/cadete"     element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras","cadete"]}><CadeteRutaScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/recepcion-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><RecepcionPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/stock-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><StockPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/materiales" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras"]}><MaterialesScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/procedimientos" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","laminacion","muebles","mecanica","electricidad"]}><ProcedimientosScreen {...A} /></RequireRole></RequireAuth>} />

        {/* Admin / Oficina */}
        <Route path="/admin"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><AdminDashboard       {...A} /></RequireRole></RequireAuth>} />
        <Route path="/obras"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><ObrasScreen           {...A} /></RequireRole></RequireAuth>} />
        <Route path="/semaforo"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","compras"]}><SemaforoScreen         {...A} /></RequireRole></RequireAuth>} />
        <Route path="/memorias"   element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><MemoriasScreen        {...A} /></RequireRole></RequireAuth>} />
        <Route path="/marmoleria" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><MarmoleriaScreen      {...A} /></RequireRole></RequireAuth>} />
        <Route path="/calendario" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><CalendarioScreen      {...A} /></RequireRole></RequireAuth>} />
        <Route path="/postventa"  element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><PostVentaScreen       {...A} /></RequireRole></RequireAuth>} />
        <Route path="/movimientos"element={<Navigate to="/madera?tab=Movimientos" replace />} />
        <Route path="/obras-laminacion" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><ObrasLaminacionScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/laminacion/plantillas" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","tecnica"]}><PlantillasLineaScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/configuracion"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin"]}><ConfiguracionScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/madera" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><MaderasScreen {...A} /></RequireRole></RequireAuth>} />

        {/* Escáner de pañol (PDA) + impresión de etiquetas QR */}
        <Route path="/scan"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><ScanEgresoScreen {...A} /></RequireRole></RequireAuth>} />
        {/* Arranque del colector: elegir entre egresar maderas o pedir a compras */}
        <Route path="/colector" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><ColectorHomeScreen {...A} /></RequireRole></RequireAuth>} />
        {/* Aviso a compras desde el colector: se escanea lo que hay que reponer */}
        <Route path="/scan-pedido" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><ScanPedidoScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/etiquetas" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><EtiquetasScreen   {...A} /></RequireRole></RequireAuth>} />

        {/* Diagnóstico del puerto serie de la balanza (para descubrir su protocolo) */}
        <Route path="/balanza"   element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><BalanzaDebugScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/balanza/calibrar" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><CalibrarPesosScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/rrhh"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","rrhh","tecnica","oficina"]}><RrhhScreen {...A} /></RequireRole></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChangePasswordModal
        open={!!session && !!profile && profile.role !== "cliente" && profile.must_change_password === true}
        forced
        profile={profile}
        onSignOut={signOut}
        onChanged={() => setProfile((p) => p ? { ...p, must_change_password: false } : p)}
      />
      {session && profile && profile.role !== "cliente" && <CampanitaSalvoColector profile={profile} />}
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
