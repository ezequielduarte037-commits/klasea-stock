import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import { ToastProvider } from "@/components/ui/Toast";
import AppVersionGuard from "@/components/AppVersionGuard";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import ChangePasswordModal from "@/features/cuenta/ChangePasswordModal";
import NotificacionesBell from "@/components/NotificacionesBell";
import { C } from "@/theme";
import ComprasBicho from "@/features/compras/ComprasBicho";
import TourProvider from "@/features/ayuda/TourProvider";
import AdminActivityTracker from "@/features/configuracion/AdminActivityTracker";
import { endTrackedAdminSession } from "@/features/configuracion/adminActivityApi";
import GlobalSearch from "@/features/search/GlobalSearch";
import PresentationPrivacyShield from "@/components/PresentationPrivacyShield";

import logoK from "@/assets/logos/logo-k.png";

// Un deploy le cambia el hash a cada chunk. Una pestaña que quedó abierta desde
// antes tiene el index viejo en memoria, pide un archivo que ya no existe, y el
// import falla dejando la pantalla en negro —que es exactamente lo que pasó en
// el deploy del 18/08—. Recargar una sola vez trae el index nuevo y se resuelve
// solo, sin que nadie tenga que saber qué es un chunk.
const RECARGA_HECHA = "klasea.chunk-recargado";
const PARAM_RECARGA = "_v";

// reload() a secas puede volver a servir el index.html cacheado —el mismo que
// acaba de pedir un chunk que ya no existe— y entonces falla igual. Con un
// parametro nuevo el navegador esta obligado a ir a buscarlo. Pasó el 25/08:
// la recarga automatica no alcanzo y la pantalla quedo negra igual.
function recargarSalteandoCache() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM_RECARGA, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

// El parametro cumplio su funcion al pedir el index; no tiene por que quedar
// colgado en la barra ni en un link que alguien copie.
function limpiarParametroDeRecarga() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM_RECARGA)) return;
    url.searchParams.delete(PARAM_RECARGA);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch { /* no pasa nada si no se puede */ }
}

// Cuando el import falla por segunda vez, el error sube y React desmonta todo:
// pantalla negra, sin un solo cartel. Esto la reemplaza por algo que se entiende
// y por un boton que arregla el caso real.
class PantallaCaida extends React.Component {
  constructor(props) {
    super(props);
    this.state = { cayo: false };
  }

  static getDerivedStateFromError() {
    return { cayo: true };
  }

  componentDidCatch(error) {
    console.error("[App] la pantalla no se pudo cargar:", error);
  }

  render() {
    if (!this.state.cayo) return this.props.children;
    return (
      <div style={{
        position: "fixed", inset: 0, display: "grid", placeItems: "center",
        background: "#0b1120", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24,
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>No se pudo cargar la pantalla</div>
          <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.55, color: "#94a3b8" }}>
            Suele pasar cuando se publicó una versión nueva con la pestaña abierta.
            Recargá y debería entrar bien.
          </p>
          <button
            type="button"
            onClick={() => {
              // Se limpia la marca para que la recarga automatica vuelva a tener
              // su intento; si no, el que apreta el boton cae de nuevo acá.
              try { sessionStorage.removeItem(RECARGA_HECHA); } catch { /* modo privado */ }
              recargarSalteandoCache();
            }}
            style={{
              border: "none", background: "#2563eb", color: "#fff", borderRadius: 9,
              padding: "10px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer",
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

function pantalla(importar) {
  return lazy(() => importar()
    .then((modulo) => {
      // Cargó bien: se limpia la marca para que un problema futuro también
      // tenga derecho a su recarga.
      try { sessionStorage.removeItem(RECARGA_HECHA); } catch { /* modo privado */ }
      limpiarParametroDeRecarga();
      return modulo;
    })
    .catch((error) => {
      let yaRecargamos = false;
      try { yaRecargamos = sessionStorage.getItem(RECARGA_HECHA) === "1"; } catch { /* modo privado */ }
      // Si ya recargamos y sigue fallando, no es una versión vieja: es un error
      // de verdad y hay que dejarlo explotar en vez de recargar para siempre.
      if (yaRecargamos) throw error;
      try { sessionStorage.setItem(RECARGA_HECHA, "1"); } catch { /* modo privado */ }
      recargarSalteandoCache();
      // No se resuelve nunca a propósito: la página se está yendo.
      return new Promise(() => {});
    }));
}

// Cada pantalla vive en su propio chunk. Antes App importaba todos los módulos
// al arrancar y el navegador descargaba/parseaba varios MB aunque el usuario
// sólo fuera al inicio o al pañol. Con lazy cada ruta paga únicamente su módulo.
const PedidosScreen = pantalla(() => import("@/features/inventario/PedidosScreen"));
const MarmoleriaScreen = pantalla(() => import("@/features/marmoleria/MarmoleriaScreen"));
const MueblesScreen = pantalla(() => import("@/features/muebles/MueblesScreen"));
const TorneriaScreen = pantalla(() => import("@/features/torneria/TorneriaScreen"));
const AdminDashboard = pantalla(() => import("@/features/admin/AdminDashboard"));
const LaminacionScreen = pantalla(() => import("@/features/laminacion/LaminacionScreen"));
const ObrasLaminacionScreen = pantalla(() => import("@/features/laminacion/ObrasLaminacionScreen"));
const PlantillasLineaScreen = pantalla(() => import("@/features/laminacion/PlantillasLineaScreen"));
const ObrasScreen = pantalla(() => import("@/features/obras/ObrasScreen"));
const ConfiguracionScreen = pantalla(() => import("@/features/configuracion/ConfiguracionScreen"));
const ProcedimientosScreen = pantalla(() => import("@/features/procedimientos/ProcedimientosScreen"));
const PostVentaScreen = pantalla(() => import("@/features/postventa/PostVentaScreen"));
const ClientePanelScreen = pantalla(() => import("@/features/cliente/ClientePanelScreen"));
const HomeScreen = pantalla(() => import("@/features/home/HomeScreen"));
const PanolOperativoHome = pantalla(() => import("@/features/panol/PanolOperativoHome"));
const CalendarioScreen = pantalla(() => import("@/features/calendario/LogisticaCalendarioScreen"));
const CalendarioProduccionScreen = pantalla(() => import("@/features/calendario/CalendarioScreen"));
const MaderasScreen = pantalla(() => import("@/features/inventario/MaderasScreen"));
const PurchaseRequestsScreen = pantalla(() => import("@/features/compras/PurchaseRequestsScreen"));
const ScanEgresoScreen = pantalla(() => import("@/features/inventario/ScanEgresoScreen"));
const BalanzaDebugScreen = pantalla(() => import("@/features/inventario/BalanzaDebugScreen"));
const ScanPedidoScreen = pantalla(() => import("@/features/inventario/ScanPedidoScreen"));
const ColectorHomeScreen = pantalla(() => import("@/features/inventario/ColectorHomeScreen"));
const CalibrarPesosScreen = pantalla(() => import("@/features/panol/CalibrarPesosScreen"));
const EtiquetasScreen = pantalla(() => import("@/features/inventario/EtiquetasScreen"));
const RrhhScreen = pantalla(() => import("@/features/rrhh/RrhhScreen"));
const PreciosScreen = pantalla(() => import("@/features/precios/PreciosScreen"));
const ComprasEtapasScreen = pantalla(() => import("@/features/produccion/ComprasEtapasScreen"));
const RecepcionPanolScreen = pantalla(() => import("@/features/panol/RecepcionPanolScreen"));
const SolicitudesPanolScreen = pantalla(() => import("@/features/panol/SolicitudesPanolScreen"));
const StockPanolScreen = pantalla(() => import("@/features/panol/StockPanolScreen"));
const CatalogoMaestroScreen = pantalla(() => import("@/features/catalogo/CatalogoMaestroScreen"));
const EgresosPanolScreen = pantalla(() => import("@/features/panol/EgresosPanolScreen"));
const PortalProveedorScreen = pantalla(() => import("@/features/proveedores/PortalProveedorScreen"));
const MaterialesScreen = pantalla(() => import("@/features/materiales/MaterialesScreen"));
const MemoriasScreen = pantalla(() => import("@/features/memorias/MemoriasScreen"));
const SemaforoScreen = pantalla(() => import("@/features/semaforo/SemaforoScreen"));
const CadeteRutaScreen = pantalla(() => import("@/features/cadete/CadeteRutaScreen"));
const TarjetasNfcScreen = pantalla(() => import("@/features/panol/TarjetasNfcScreen"));
const PantallaEgresoScreen = pantalla(() => import("@/features/panol/PantallaEgresoScreen"));

// Internos:  usuario  → usuario@klasea.local
// Clientes:  usuario  → usuario@klasea.client
function toLocalEmail(u)  { return `${String(u||"").trim().toLowerCase()}@klasea.local`;  }
function toClientEmail(u) { return `${String(u||"").trim().toLowerCase()}@klasea.client`; }

const STARTUP_TIMEOUT_MS = 12_000;

function withStartupTimeout(request, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label}: tiempo de espera agotado`)), STARTUP_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(request), timeout])
    .finally(() => window.clearTimeout(timer));
}

function startupErrorMessage(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("tiempo de espera") || message.includes("failed to fetch") || message.includes("network")) {
    return "Supabase está tardando demasiado en responder. Tu sesión sigue guardada; reintentá en unos segundos.";
  }
  return "No pudimos validar tu sesión y perfil. Reintentá para volver a conectarte.";
}

// Rutas del colector: pantalla chica y uso con guantes. La campanita flotante se
// superpone con los controles y rompe el layout, así que ahí no va.
const RUTAS_COLECTOR = new Set(["/colector", "/scan", "/scan-pedido", "/pantalla-egreso"]);
const RUTAS_DEMO = new Set([
  "/", "/obras", "/materiales", "/compras", "/compras-etapa",
  "/stock-panol", "/catalogo-maestro", "/solicitudes-panol", "/recepcion-panol", "/egresos-panol",
  "/laminacion", "/obras-laminacion", "/muebles", "/torneria", "/marmoleria",
  "/calendario", "/calendario-produccion", "/memorias", "/procedimientos",
  "/postventa", "/madera", "/movimientos", "/pedidos",
]);

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
  const { pathname } = useLocation();
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.is_demo) return RUTAS_DEMO.has(pathname) ? children : <Navigate to="/" replace />;
  if (profile.is_admin || allow.includes(profile.role)) return children;
  if (profile.role === "compras") return <Navigate to="/compras" replace />;
  if (profile.role === "cadete")  return <Navigate to="/cadete" replace />;
  if (profile.role === "rrhh")    return <Navigate to="/rrhh" replace />;
  if (profile.role === "cliente") return <Navigate to="/mi-panel" replace />;
  return <Navigate to="/" replace />;
}

function RouteLoader({ label = "Cargando módulo..." }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.t1, fontFamily: C.sans }}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: 999, border: `3px solid ${C.b1}`, borderTopColor: C.blue, animation: "spin .8s linear infinite" }} />
        <div style={{ fontSize: 13, fontWeight: 850 }}>{label}</div>
      </div>
    </div>
  );
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
  const [startupError,   setStartupError]   = useState("");
  const profileLoadIdRef = useRef(0);

  async function loadProfile(s) {
    const loadId = ++profileLoadIdRef.current;
    setStartupError("");

    if (!s?.user?.id) {
      setProfile(null);
      setIsInitializing(false);
      return;
    }

    try {
      // Buscar en profiles (personal interno). El timeout evita que una caída
      // de Postgres deje toda la aplicación congelada en "Cargando…".
      let { data: pData, error: pErr } = await withStartupTimeout(
        supabase
          .from("profiles")
          .select("id,username,role,is_admin,is_demo,sede,must_change_password")
          .eq("id", s.user.id)
          .maybeSingle(),
        "Carga del perfil",
      );
      if (pErr && ["must_change_password", "is_demo"].some((field) => String(pErr.message || "").includes(field))) {
        const retry = await withStartupTimeout(supabase
          .from("profiles")
          .select("id,username,role,is_admin,sede")
          .eq("id", s.user.id)
          .maybeSingle(), "Carga del perfil");
        pData = retry.data;
        pErr = retry.error;
      }
      if (pErr) throw pErr;

      if (pData) {
        const normalizedProfile = pData.is_demo
          ? { ...pData, access_role: pData.role, role: "demo", is_admin: false, must_change_password: false }
          : pData;
        if (loadId === profileLoadIdRef.current) setProfile(normalizedProfile);
        return;
      }

      // Buscar en clientes (propietarios de barcos)
      const { data: cData, error: cErr } = await withStartupTimeout(supabase
        .from("clientes")
        .select("id,username,nombre_completo,modelo_barco")
        .eq("id", s.user.id)
        .maybeSingle(), "Carga del perfil de cliente");
      if (cErr) throw cErr;

      if (loadId !== profileLoadIdRef.current) return;
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
    } catch (error) {
      if (loadId !== profileLoadIdRef.current) return;
      console.error("No se pudo inicializar el perfil", error);
      setProfile(null);
      setStartupError(startupErrorMessage(error));
    } finally {
      if (loadId === profileLoadIdRef.current) setIsInitializing(false);
    }
  }

  useEffect(() => {
    let active = true;
    let initialEventReceived = false;
    const pendingTimers = new Set();

    const scheduleSession = (s) => {
      if (!active) return;
      setSession(s ?? null);
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        if (active) void loadProfile(s);
      }, 0);
      pendingTimers.add(timer);
    };

    // La callback de Supabase debe terminar inmediatamente. Consultar tablas
    // dentro de onAuthStateChange puede retener el lock de autenticación y
    // dejar getSession (y toda la app) esperando indefinidamente.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION") initialEventReceived = true;
      scheduleSession(s);
    });

    // Respaldo para navegadores donde INITIAL_SESSION no llegue. No duplica la
    // carga normal y también tiene un límite de espera explícito.
    const fallbackTimer = window.setTimeout(() => {
      if (!active || initialEventReceived) return;
      withStartupTimeout(supabase.auth.getSession(), "Validación de sesión")
        .then(({ data, error }) => {
          if (error) throw error;
          scheduleSession(data.session ?? null);
        })
        .catch((error) => {
          if (!active) return;
          console.error("No se pudo inicializar la sesión", error);
          setStartupError(startupErrorMessage(error));
          setIsInitializing(false);
        });
    }, 1_500);

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signOut() {
    await endTrackedAdminSession(profile, window.location.pathname);
    await supabase.auth.signOut();
  }

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
  if (startupError) {
    return (
      <div style={{
        background:C.bg, color:C.text,
        minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Outfit',system-ui", padding:24,
      }}>
        <div style={{ width:"min(440px, 100%)", padding:24, borderRadius:16, background:C.panelSolid, border:`1px solid ${C.border}`, boxShadow:`0 22px 70px ${C.shadow}` }}>
          <div style={{ color:C.red, fontSize:12, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Conexión demorada</div>
          <div style={{ color:C.text, fontSize:18, fontWeight:850, marginBottom:8 }}>No pudimos terminar de cargar Klase A</div>
          <div style={{ color:C.muted, fontSize:13, lineHeight:1.55, marginBottom:18 }}>{startupError}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ width:"100%", border:0, borderRadius:10, padding:"11px 14px", background:C.blue, color:"var(--inverse-text)", fontWeight:900, cursor:"pointer" }}
          >
            Reintentar
          </button>
        </div>
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
            : profile.role === "panol"
              ? <PanolOperativoHome profile={profile} signOut={signOut} />
              : <HomeScreen profile={profile} signOut={signOut} />;

  return (
    <BrowserRouter>
      <TourProvider>
        <ToastProvider>
          <ConfirmProvider>
            {/* Avisa cuando hubo un deploy nuevo mientras la pestaña estaba
                abierta. Existía desde antes pero nunca se había montado, así que
                nadie veía el aviso. */}
            <AppVersionGuard />
            <PresentationPrivacyShield active={!!profile?.is_demo} />
            {session && profile && !profile.is_demo && <AdminActivityTracker profile={profile} />}
            {session && profile && profile.role !== "cliente" && !profile.is_demo && <GlobalSearch profile={profile} />}
      <PantallaCaida>
      <Suspense fallback={<RouteLoader />}>
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
        <Route path="/muebles"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","muebles","compras"]}><MueblesScreen    {...A} /></RequireRole></RequireAuth>} />
        <Route path="/torneria"   element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","mecanica","compras"]}><TorneriaScreen   {...A} /></RequireRole></RequireAuth>} />
        <Route path="/pedidos"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><PedidosScreen    {...A} /></RequireRole></RequireAuth>} />
        <Route path="/compras"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol","compras"]}><PurchaseRequestsScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/inicio-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["panol"]}><PanolOperativoHome {...A} /></RequireRole></RequireAuth>} />
        <Route path="/inicio-panol/tarjetas" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><TarjetasNfcScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/cadete"     element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras","cadete"]}><CadeteRutaScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/recepcion-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><RecepcionPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/egresos-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><EgresosPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/stock-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><StockPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/catalogo-maestro" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","tecnica","compras","panol"]}><CatalogoMaestroScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/pantalla-egreso" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol"]}><PantallaEgresoScreen /></RequireRole></RequireAuth>} />
        {/* Digitalización del papel de solicitud: pañol lo carga, lo arma y lo firma con NFC. */}
        <Route path="/solicitudes-panol" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","panol","compras"]}><SolicitudesPanolScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/materiales" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras"]}><Suspense fallback={<RouteLoader label="Cargando materiales..." />}><MaterialesScreen {...A} /></Suspense></RequireRole></RequireAuth>} />
        <Route path="/precios"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras","administracion"]}><PreciosScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/procedimientos" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","laminacion","muebles","mecanica","electricidad"]}><ProcedimientosScreen {...A} /></RequireRole></RequireAuth>} />

        {/* Admin / Oficina */}
        <Route path="/admin"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><AdminDashboard       {...A} /></RequireRole></RequireAuth>} />
        <Route path="/obras"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><ObrasScreen           {...A} /></RequireRole></RequireAuth>} />
        <Route path="/compras-etapa" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica","compras"]}><ComprasEtapasScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/semaforo"    element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","compras"]}><SemaforoScreen         {...A} /></RequireRole></RequireAuth>} />
        <Route path="/memorias"   element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><MemoriasScreen        {...A} /></RequireRole></RequireAuth>} />
        <Route path="/marmoleria" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","oficina","tecnica"]}><MarmoleriaScreen      {...A} /></RequireRole></RequireAuth>} />
        <Route path="/calendario" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","tecnica","administracion","compras"]}><CalendarioScreen {...A} /></RequireRole></RequireAuth>} />
        <Route path="/calendario-produccion" element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","tecnica"]}><CalendarioProduccionScreen {...A} /></RequireRole></RequireAuth>} />
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
        <Route path="/rrhh"      element={<RequireAuth session={session}><RequireRole profile={profile} allow={["admin","rrhh","tecnica","oficina","administracion"]}><RrhhScreen {...A} /></RequireRole></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </PantallaCaida>
      <ChangePasswordModal
        open={!!session && !!profile && profile.role !== "cliente" && !profile.is_demo && profile.must_change_password === true}
        forced
        profile={profile}
        onSignOut={signOut}
        onChanged={() => setProfile((p) => p ? { ...p, must_change_password: false } : p)}
      />
      {session && profile && profile.role !== "cliente" && !profile.is_demo && <CampanitaSalvoColector profile={profile} />}
      {session && profile?.role === "compras" && <ComprasBicho profile={profile} />}
          </ConfirmProvider>
        </ToastProvider>
      </TourProvider>
    </BrowserRouter>
  );
}
