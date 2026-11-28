import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Gauge, KeyRound, LogOut, Maximize, Moon, Phone, Pin, PinOff, Search, Sun, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import LogoK from "@/components/ui/LogoK";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import { ICONO_GENERICO, trazosDeRuta } from "@/lib/iconosKlasea";
import { C } from "@/theme";
import { useTheme } from "@/theme/useTheme";
import NotificacionesBell from "@/components/NotificacionesBell";
import ChangePasswordModal from "@/features/cuenta/ChangePasswordModal";
import VincularWhatsAppModal from "@/features/cuenta/VincularWhatsAppModal";
import { supabase } from "@/supabaseClient";

// ─── ÍCONOS ───────────────────────────────────────────────────────────────────
// Los dibujos viven en lib/iconosKlasea.js (grilla de 24, trazo de 1,5). Antes
// estaban acá en una grilla de 16 estirada a 18 px, cada uno con su lógica.
function Icon({ id, size = 20 }) {
  const trazos = trazosDeRuta(id);
  // Sin ícono propio cae un círculo pelado: en dev avisa para que se note al
  // agregar una ruta nueva al menú.
  if (!trazos && import.meta.env.DEV) {
    console.warn(`[Sidebar] La ruta "${id}" no tiene ícono en lib/iconosKlasea.js; se dibuja el genérico.`);
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
    >
      {(trazos ?? ICONO_GENERICO).map((trazo, i) => (typeof trazo === "string"
        ? <path key={i} d={trazo} />
        : <path key={i} d={trazo.d} fill="currentColor" stroke="none" />))}
    </svg>
  );
}

/** Riel de íconos y panel abierto (px). */
const ANCHO_ABIERTO = 272;
const ANCHO_COMPACTO = 68;
const CLAVE_FIJADO = "klasea.sidebar.fijado";
const EVENTO_COMPACTO = "klasea:sidebar-compacto";
// Intención: que un roce del mouse camino a otra cosa no abra el menú, y que
// salir un instante por el borde no lo cierre.
const ABRIR_TRAS_MS = 140;
const CERRAR_TRAS_MS = 260;

function leerFijado() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLAVE_FIJADO) === "true";
  } catch {
    return false;
  }
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
//
// En la computadora el menú es un riel de 68 px que se abre al pasar el mouse
// (o al tabular hasta él) y se superpone al contenido sin moverlo. Quien lo
// quiere siempre abierto lo fija con el chinche o Ctrl+B.
//
// Nada cambia de lugar al abrir: los íconos, la campanita y el avatar están
// siempre en la misma columna centrada del riel; el panel crece y los textos
// aparecen con un fundido. Antes el riel y el panel eran dos armados distintos:
// todo saltaba de lugar y, peor, la campanita se desmontaba y se volvía a montar
// en cada pasada del mouse (canales de realtime y consultas de nuevo cada vez).
const CSS = `
  @keyframes sb-in    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
  @keyframes sb-fondo { from{opacity:0} }
  @media (max-width: 900px) {
    body { overscroll-behavior: none; }
  }

  /* Aire Azimut, como Listas de compras: monocromo, rótulos finos y espaciados,
     radio 3 y un solo acento, la línea con el degradé de la marca en la
     pantalla abierta. Antes cada sección tenía su color y cada ícono su
     pastilla con halo: once colores compitiendo con el contenido. El color
     queda para lo que pide atención (los contadores). */
  .sb-aside { font-family: 'Outfit', system-ui, sans-serif; }
  /* Lo que sólo se ve con el panel abierto: se desvanece y además sale del
     orden de tabulación mientras está cerrado. */
  .sb-texto { opacity: 0; transition: opacity .12s ease; white-space: nowrap; }
  .sb-solo-abierto { opacity: 0; visibility: hidden; transition: opacity .12s ease, visibility 0s linear .12s; }
  .sb-aside[data-abierto="true"] .sb-texto { opacity: 1; transition: opacity .2s ease .06s; }
  .sb-aside[data-abierto="true"] .sb-solo-abierto { opacity: 1; visibility: visible; transition: opacity .2s ease .06s, visibility 0s; }
  .sb-solo-cerrado { transition: opacity .12s ease; }
  .sb-aside[data-abierto="true"] .sb-solo-cerrado { opacity: 0; }

  /* Todo lo que queda a la vista en el riel se centra en x = 34 (la mitad de
     68): logo, lupa, íconos, campanita y avatar. */
  .sb-marca { height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 0 12px 0 19px; border-bottom: 1px solid var(--border); }
  .sb-logo { width: 30px; height: 30px; flex-shrink: 0; display: grid; place-items: center; color: var(--text); }
  .sb-marca-textos { flex: 1; min-width: 0; }
  .sb-marca-nombre { font-size: 13px; font-weight: 400; letter-spacing: .32em; line-height: 1.1; color: var(--text); }
  .sb-marca-bajada { margin-top: 5px; font-size: 9.5px; font-weight: 500; letter-spacing: .26em; line-height: 1; text-transform: uppercase; color: var(--subtle); }

  /* Buscador: sólo la línea de abajo, como az-buscar. */
  .sb-buscar {
    width: 100%; height: 40px; display: flex; align-items: center; gap: 14px;
    padding: 0 2px 0 14px; overflow: hidden;
    border: 0; border-bottom: 1px solid var(--border); border-radius: 0;
    background: transparent; color: var(--dim);
    font: inherit; text-align: left;
    transition: color .16s, border-color .16s;
  }
  .sb-buscar:hover { color: var(--text); border-bottom-color: var(--border-2); }
  .sb-buscar kbd { border: 1px solid var(--border); background: transparent; color: var(--subtle); border-radius: 3px; padding: 2px 6px; font-size: 10px; font-family: 'JetBrains Mono', monospace; letter-spacing: .04em; }

  .sb-nav { scrollbar-width: thin; scrollbar-color: var(--border-2) transparent; overflow-x: hidden; }
  .sb-nav::-webkit-scrollbar { width: 6px; }
  .sb-nav::-webkit-scrollbar-track { background: transparent; }
  .sb-nav::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
  /* Riel cerrado: sin barra de scroll. En Windows la barra ocupa ~11 px y
     corría el ítem activo y cortaba el contador. Se sigue scrolleando con la
     rueda, y al abrir el panel la barra vuelve. */
  .sb-aside[data-abierto="false"] .sb-nav { scrollbar-width: none; }
  .sb-aside[data-abierto="false"] .sb-nav::-webkit-scrollbar { display: none; }

  /* Rótulo de grupo: como az-rotulo. En el riel, un pelo corto en su lugar. */
  .sb-grupo { position: relative; height: 28px; margin-top: 14px; display: flex; align-items: center; padding-left: 24px; overflow: hidden; }
  .sb-grupo-raya { position: absolute; left: 27px; top: 50%; width: 14px; height: 1px; background: var(--border-2); }
  .sb-grupo-texto { font-size: 10px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: var(--subtle); }

  .sb-item {
    position: relative; overflow: hidden;
    height: 38px; margin: 1px 10px; padding: 0 10px 0 14px;
    display: flex; align-items: center; gap: 14px;
    border-radius: 3px;
    color: var(--muted); font-size: 13.5px; font-weight: 400; letter-spacing: .01em;
    text-decoration: none !important;
    transition: color .16s, background-color .16s;
  }
  .sb-item:hover { background: color-mix(in srgb, var(--text) 5%, transparent); color: var(--text); }
  .sb-item.sb-activo { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); font-weight: 500; }
  .sb-item:active { transform: scale(.99); }
  .sb-icon { width: 20px; height: 20px; flex-shrink: 0; display: grid; place-items: center; color: var(--dim); transition: color .16s; }
  .sb-item:hover .sb-icon, .sb-item.sb-activo .sb-icon { color: var(--text); }
  .sb-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .sb-marca-activa { position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; border-radius: 0 2px 2px 0; background: linear-gradient(180deg, var(--blue), var(--cyan)); }
  .sb-contador, .sb-contador-mini {
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 999px; background: var(--cyan-soft); color: var(--cyan);
    font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; box-sizing: border-box;
  }
  .sb-contador { min-width: 24px; height: 20px; padding: 0 7px; font-size: 11px; flex-shrink: 0; border: 1px solid var(--cyan-border); }
  /* Anclado a la izquierda para que no viaje mientras el panel se abre. Con
     dos dígitos mide ~20 px y desde 27 entra en los 48 del ítem en el riel. */
  .sb-contador-mini { position: absolute; left: 27px; top: 3px; min-width: 16px; height: 16px; padding: 0 4px; font-size: 9.5px; box-shadow: 0 0 0 2px var(--sb-fondo); }

  .sb-pie { flex-shrink: 0; display: grid; gap: 6px; padding: 10px 0 12px; border-top: 1px solid var(--border); overflow: hidden; }
  .sb-pie-fila { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 12px 0 16px; }
  .sb-avatar {
    position: relative; width: 36px; height: 36px; flex-shrink: 0;
    display: grid; place-items: center;
    border: 1px solid var(--border-2); border-radius: 50%;
    background: transparent; color: var(--text);
    font-size: 12px; font-weight: 500; letter-spacing: .06em;
  }
  .sb-avatar::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--green); border: 2px solid var(--sb-fondo); box-sizing: border-box; }
  .sb-usuario { font-size: 13.5px; font-weight: 500; color: var(--text); overflow: hidden; text-overflow: ellipsis; }
  .sb-rol { margin-top: 3px; font-size: 9.5px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: var(--subtle); }
  .sb-boton {
    width: 32px; height: 32px; flex-shrink: 0;
    display: grid; place-items: center; padding: 0;
    border: 1px solid transparent; border-radius: 3px;
    background: transparent; color: var(--dim);
    transition: color .18s, background-color .18s, border-color .18s;
  }
  .sb-boton:hover { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); }
  .sb-boton.is-activo { color: var(--text); border-color: var(--border-2); background: color-mix(in srgb, var(--text) 8%, transparent); }
  .sb-salir:hover { color: var(--red); background: var(--red-soft); }
  /* Fila de herramientas: con el panel abierto hay 244 px útiles; la
     campanita queda centrada en la columna del riel (16 + 36/2 = 34). */
  .sb-pie-fila.es-herramientas { gap: 4px; }
  .sb-herramientas { display: flex; align-items: center; gap: 2px; }
  .sb-tema { display: flex; margin-left: auto; border: 1px solid var(--border); border-radius: 3px; flex-shrink: 0; overflow: hidden; }
  .sb-tema button { width: 28px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--subtle); transition: color .16s, background-color .16s; }
  .sb-tema button + button { border-left: 1px solid var(--border); }
  .sb-tema button:hover { color: var(--text); }
  .sb-tema button[aria-checked="true"] { color: var(--bg); background: var(--text); }

  /* Celular: cajón siempre abierto y blancos más grandes para el dedo. */
  .sb-aside[data-movil="true"] .sb-item { height: 46px; font-size: 14.5px; }
  .sb-aside[data-movil="true"] .sb-boton { width: 40px; height: 40px; }
  .sb-aside[data-movil="true"] .sb-tema button { width: 38px; height: 34px; }
`;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
// Lo monta AppShell una sola vez. En el celular es un cajón que abre la barra
// superior del contenedor: abiertoMovil / onCerrarMovil vienen de ahí.
export default function Sidebar({ profile, signOut, abiertoMovil = false, onCerrarMovil }) {
  const loc    = useLocation();
  const path   = loc.pathname;
  const search = loc.search;

  const { isMobile } = useResponsive();
  const { theme, setTheme } = useTheme();
  const [waOpen, setWaOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const cerrarMenu = () => onCerrarMovil?.();
  const menuVisible = isMobile && abiertoMovil;

  // Fijado: la preferencia de tenerlo siempre abierto, guardada por equipo.
  // plegadoPorPantalla: Tornería ("Enfocar circuito") o Postventa lo piden en
  // riel un rato sin tocar esa preferencia (ver lib/menuLateral.js).
  const [fijadoGuardado, setFijadoGuardado] = useState(leerFijado);
  const [plegadoPorPantalla, setPlegadoPorPantalla] = useState(false);
  const fijado = !isMobile && fijadoGuardado && !plegadoPorPantalla;
  const [abiertoPorHover, setAbiertoPorHover] = useState(false);
  const temporizador = useRef(0);
  const abierto = isMobile || fijado || abiertoPorHover;
  // Sólo se superpone al contenido cuando se abrió por hover sin estar fijado.
  const superpuesto = !isMobile && !fijado && abiertoPorHover;

  const ranuraRef = useRef(null);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const alternarFijado = useCallback(() => {
    const siguiente = !fijadoGuardado;
    setFijadoGuardado(siguiente);
    setPlegadoPorPantalla(false);
    setAbiertoPorHover(false);
    if (ranuraRef.current) ranuraRef.current.style.zIndex = "";
    try {
      window.localStorage.setItem(CLAVE_FIJADO, String(siguiente));
    } catch {
      // Sin storage igual funciona mientras dure la sesión.
    }
  }, [fijadoGuardado]);

  // Una pantalla pide el riel (true) o lo devuelve como estaba (null/false).
  useEffect(() => {
    const alPedir = (evento) => setPlegadoPorPantalla(evento.detail === true);
    window.addEventListener(EVENTO_COMPACTO, alPedir);
    return () => window.removeEventListener(EVENTO_COMPACTO, alPedir);
  }, []);

  useEffect(() => {
    if (isMobile) return undefined;
    const alTeclear = (evento) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== "b") return;
      // No robarle Ctrl+B a un campo de texto: puede ser negrita en un editor.
      const foco = document.activeElement;
      const etiqueta = String(foco?.tagName || "").toLowerCase();
      if (etiqueta === "input" || etiqueta === "textarea" || foco?.isContentEditable) return;
      evento.preventDefault();
      alternarFijado();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [isMobile, alternarFijado]);

  useEffect(() => {
    if (!isMobile) return undefined;
    document.body.style.overflow = menuVisible ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMobile, menuVisible]);

  const role     = profile?.role ?? "invitado";
  const sedePropia = /chubut/i.test(String(profile?.sede ?? "")) ? "Chubut"
    : /pampa/i.test(String(profile?.sede ?? "")) ? "Pampa"
    : "";
  const veGalpon = (galpon) => profile?.is_admin || !sedePropia || sedePropia === galpon;
  const itemsLaminacion = (base) => <>
    {veGalpon("Pampa") && item("/laminacion", sedePropia ? "Laminación" : "Laminación · Pampa", true, base, "Stock, ingresos, egresos y pedidos del galpón de Pampa.")}
    {veGalpon("Chubut") && item("/laminacion-chubut", sedePropia ? "Laminación" : "Laminación · Chubut", true, base + 5, "Stock, ingresos, egresos y pedidos del galpón de Chubut.")}
  </>;
  const esDemo   = profile?.is_demo === true;
  const broadAccess = hasAdminAccess(profile);
  const realAdmin = !!profile?.is_admin || role === "admin";
  const username = profile?.username ?? "—";
  const esPanol   = role === "panol";
  const esTecnica = role === "tecnica" || role === "oficina" || esDemo;
  const esGestion = broadAccess || esTecnica;
  const esAdmin   = realAdmin;
  const esAdministracion = role === "administracion";
  const esRrhh    = esAdmin || role === "rrhh" || esTecnica || esAdministracion;
  const esCompras = role === "compras";
  const esMecanica = role === "mecanica";
  const puedeVerLogistica = realAdmin || ["tecnica", "administracion", "compras"].includes(role);
  const puedeEditarPlantillas = !esDemo && (broadAccess || role === "tecnica");
  const puedePedirCompras = esGestion || esPanol || esCompras;
  const puedeVerMateriales = esGestion || esCompras;
  const puedeVerCatalogo = esGestion || esCompras || esPanol;
  // Administración entra sólo a Precios (no al catálogo completo de Materiales).
  const puedeVerPrecios = esGestion || esCompras || esAdministracion;
  const comprasLabel = esCompras || realAdmin ? "Gestión de Compras" : "Pedidos";
  const comprasGroup = esCompras || realAdmin ? "Compras" : "Solicitudes";
  const initials  = username.split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const [comprasBadge, setComprasBadge] = useState(null);
  const [modoLiviano, setModoLiviano] = useState(() => {
    try {
      return window.localStorage.getItem("klasea.panol.modo-liviano") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const active = role === "panol" && modoLiviano;
    root.dataset.lowPerformance = active ? "true" : "false";
    try {
      window.localStorage.setItem("klasea.panol.modo-liviano", String(modoLiviano));
    } catch {
      // El modo sigue funcionando durante esta sesion aunque el navegador bloquee storage.
    }
    return () => {
      delete root.dataset.lowPerformance;
    };
  }, [modoLiviano, role]);

  useEffect(() => {
    if (!(esCompras || realAdmin)) {
      return undefined;
    }
    let alive = true;
    async function loadComprasBadge() {
      try {
        const [requestsRes, avisosRes, faltantesRes, etapaRes] = await Promise.allSettled([
          supabase
            .from("purchase_requests")
            .select("id", { count: "exact", head: true })
            .not("status", "in", `("recibido","cancelado")`)
            .or("status.in.(nuevo,en_revision),priority.eq.urgente"),
          supabase
            .from("compras_avisos")
            .select("id", { count: "exact", head: true })
            .in("estado", ["nuevo", "visto", "en_proceso"]),
          supabase
            .from("panol_faltantes_compras")
            .select("id", { count: "exact", head: true })
            .in("estado", ["nuevo", "en_revision", "pedido", "comprado"]),
          // Los pedidos por etapa no avisaban a nadie: quedaban en su pestaña y
          // si nadie entraba, no existían. Ahora suman al badge como el resto.
          supabase
            .from("pedidos_produccion")
            .select("id", { count: "exact", head: true })
            .in("estado", ["pendiente", "en_compra"]),
        ]);
        const requestCount = requestsRes.status === "fulfilled" && !requestsRes.value.error ? requestsRes.value.count || 0 : 0;
        const avisoCount = avisosRes.status === "fulfilled" && !avisosRes.value.error ? avisosRes.value.count || 0 : 0;
        const faltanteCount = faltantesRes.status === "fulfilled" && !faltantesRes.value.error ? faltantesRes.value.count || 0 : 0;
        const etapaCount = etapaRes.status === "fulfilled" && !etapaRes.value.error ? etapaRes.value.count || 0 : 0;
        if (alive) setComprasBadge(requestCount + avisoCount + faltanteCount + etapaCount);
      } catch {
        if (alive) setComprasBadge(null);
      }
    }
    loadComprasBadge();
    const handleVisible = () => {
      if (document.visibilityState === "visible") void loadComprasBadge();
    };
    document.addEventListener("visibilitychange", handleVisible);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadComprasBadge();
    }, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [esCompras, realAdmin]);

  // ── APERTURA POR HOVER ────────────────────────────────────────────────────
  // Mientras está abierto por hover el riel sube de capa para superponerse al
  // contenido; al cerrarse vuelve a su capa normal recién cuando terminó de
  // achicarse (si no, el contenido lo taparía a mitad de camino). La capa se
  // toca directo en el DOM: es un detalle visual que no merece un render.
  const abrirPorHover = useCallback((espera) => {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      if (ranuraRef.current) ranuraRef.current.style.zIndex = "50";
      setAbiertoPorHover(true);
    }, espera);
  }, []);
  const cerrarPorHover = useCallback((espera) => {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      setAbiertoPorHover(false);
      temporizador.current = window.setTimeout(() => {
        if (ranuraRef.current) ranuraRef.current.style.zIndex = "";
      }, 240);
    }, espera);
  }, []);

  useEffect(() => {
    if (isMobile || !abiertoPorHover) return undefined;
    const alTeclear = (evento) => { if (evento.key === "Escape") cerrarPorHover(0); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [isMobile, abiertoPorHover, cerrarPorHover]);

  // ── ÍTEM ──────────────────────────────────────────────────────────────────
  // La misma estructura en el riel y abierto: el ícono queda en la columna
  // centrada de 68 px y el nombre aparece al abrir. En el riel el nombre va
  // en el aria-label y en el title; abierto, el title muestra la ayuda.
  const item = (href, label, exact = true, delay = 0, info = "", badge = null) => {
    const [hrefPath, hrefQuery = ""] = href.split("?");
    const expectedParams = new URLSearchParams(hrefQuery);
    const currentParams = new URLSearchParams(search);
    const matchesQuery = !hrefQuery || [...expectedParams.entries()].every(([key, value]) => currentParams.get(key) === value);
    const on  = exact ? path === hrefPath && matchesQuery : path.startsWith(hrefPath);
    const hayBadge = badge != null && badge > 0;

    return (
      <Link
        key={href} to={href}
        className={on ? "sb-item sb-activo" : "sb-item"}
        title={abierto ? info || undefined : label}
        aria-label={abierto ? undefined : label}
        aria-current={on ? "page" : undefined}
        onClick={() => { if (isMobile) cerrarMenu(); }}
        style={{
          animation: `sb-in .28s cubic-bezier(.22,1,.36,1) ${Math.min(delay, 260)}ms both`,
        }}
      >
        {on && <span className="sb-marca-activa" />}
        <span className="sb-icon"><Icon id={href} size={20} /></span>
        <span className="sb-label sb-texto">{label}</span>
        {hayBadge && <span className="sb-contador sb-texto">{badge > 99 ? "99+" : badge}</span>}
        {hayBadge && <span className="sb-contador-mini sb-solo-cerrado" aria-hidden="true">{badge > 99 ? "99" : badge}</span>}
      </Link>
    );
  };

  // ── GRUPO ─────────────────────────────────────────────────────────────────
  // Alto fijo en los dos estados para que la lista no salte al abrir.
  const group = (label, delay = 0) => (
    <div key={`g${label}`} className="sb-grupo" style={{ animation: `sb-in .28s cubic-bezier(.22,1,.36,1) ${Math.min(delay, 260)}ms both` }}>
      <span className="sb-grupo-raya sb-solo-cerrado" aria-hidden="true" />
      <span className="sb-grupo-texto sb-texto">{label}</span>
    </div>
  );

  // Los títulos de grupo ya separan los bloques: la raya extra entre grupos
  // era ruido. Queda la función para no tocar cada llamada del menú.
  const divider = () => null;

  const estiloMovil = {
    position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 1000,
    width: "min(86vw, 320px)", background: C.panelSolid,
    display: "flex", flexDirection: "column",
    borderRight: `1px solid ${C.border}`,
    boxShadow: menuVisible ? "var(--elev-2)" : "none",
    transform: menuVisible ? "translateX(0)" : "translateX(-102%)",
    overflow: "hidden",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    // Cerrado queda oculto de verdad (sin esto el Tab entraba a los links de un
    // cajón que no se ve), pero recién al terminar de salir.
    visibility: menuVisible ? "visible" : "hidden",
    transition: menuVisible
      ? "transform .32s cubic-bezier(.22,1,.36,1), box-shadow .32s, visibility 0s"
      : "transform .32s cubic-bezier(.22,1,.36,1), box-shadow .32s, visibility 0s linear .32s",
    "--sb-fondo": "var(--panel-solid)",
  };

  const estiloEscritorio = {
    position: "absolute", top: 0, left: 0, bottom: 0,
    width: abierto ? ANCHO_ABIERTO : ANCHO_COMPACTO,
    display: "flex", flexDirection: "column",
    background: superpuesto ? C.panelSolid : "transparent",
    borderRight: `1px solid ${C.border}`,
    boxShadow: superpuesto ? "var(--elev-2)" : "none",
    overflow: "hidden", boxSizing: "border-box",
    transition: "width .22s cubic-bezier(.22,1,.36,1), background-color .18s ease, box-shadow .22s ease",
    animation: "sb-in .38s cubic-bezier(.22,1,.36,1) both",
    "--sb-fondo": superpuesto ? "var(--panel-solid)" : "var(--bg)",
  };

  // En la computadora el riel ocupa su lugar en la fila; fijado, el panel entero.
  const estiloRanura = {
    position: "relative", height: "100%", flexShrink: 0,
    width: fijado ? ANCHO_ABIERTO : ANCHO_COMPACTO,
    transition: "width .22s cubic-bezier(.22,1,.36,1)",
  };

  const menu = (
    <aside
      className="sb-aside"
      data-abierto={abierto ? "true" : "false"}
      data-movil={isMobile ? "true" : "false"}
      style={isMobile ? estiloMovil : estiloEscritorio}
      aria-label="Menú principal"
      onMouseEnter={() => { if (!isMobile && !fijado) abrirPorHover(ABRIR_TRAS_MS); }}
      onMouseLeave={() => { if (!isMobile && !fijado) cerrarPorHover(CERRAR_TRAS_MS); }}
      // Sólo con teclado: un clic en un ícono del riel navega sin abrir el panel.
      onFocusCapture={(evento) => {
        if (!isMobile && !fijado && evento.target.matches?.(":focus-visible")) abrirPorHover(0);
      }}
      onBlurCapture={(evento) => {
        if (!isMobile && !fijado && !evento.currentTarget.contains(evento.relatedTarget)) cerrarPorHover(0);
      }}
    >
      {/* MARCA ───────────────────────────────────────────────────────────── */}
      <div className="sb-marca" style={{ animation: "sb-in .42s cubic-bezier(.22,1,.36,1) .06s both" }}>
        <div className="sb-logo">
          <LogoK size={30} titulo="Klase A" />
        </div>
        <div className="sb-marca-textos sb-texto">
          <div className="sb-marca-nombre">KLASE A</div>
          <div className="sb-marca-bajada">Astillero</div>
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={cerrarMenu}
            aria-label="Cerrar el menú"
            className="sb-boton"
            style={{ width: 40, height: 40, borderColor: "transparent" }}
          >
            <X size={19} strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="button"
            onClick={alternarFijado}
            className={`sb-boton sb-solo-abierto${fijado ? " is-activo" : ""}`}
            title={fijado ? "Soltar el menú (Ctrl + B)" : "Fijar el menú abierto (Ctrl + B)"}
            aria-label={fijado ? "Soltar el menú" : "Fijar el menú abierto"}
            aria-pressed={fijado}
          >
            {fijado ? <PinOff size={15} strokeWidth={1.5} /> : <Pin size={15} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      {/* El buscador nunca se esconde: en el riel queda la lupa, y Ctrl+K sigue
          funcionando igual desde cualquier parte. */}
      <div style={{ padding: "12px 12px 6px", flexShrink: 0 }}>
        <button
          type="button"
          className="sb-buscar"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("klasea:open-global-search"));
            if (isMobile) cerrarMenu();
          }}
          title="Buscar en todo Klase A (Ctrl + K)"
          aria-label="Buscar en todo Klase A"
          style={{ height: isMobile ? 44 : 40 }}
        >
          <Search size={16} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span className="sb-texto" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 400 }}>Buscar</span>
          {!isMobile && <kbd className="sb-texto">Ctrl K</kbd>}
        </button>
      </div>

      {/* NAV ───────────────────────────────────────────────────────────── */}
      <nav className="sb-nav" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 8, paddingTop: 4 }}>
        {esPanol && <>
          {group("Operación diaria", 55)}
          {item("/inicio-panol", "Panel de pañol", true, 65, "Resumen de pendientes, equipos y próximas recepciones.")}
          {item("/ingresos-panol", "Ingresar materiales", true, 75, "El mostrador de entrada: lo de los pedidos en camino y lo que llega sin pedido, con el lector.")}
          {item("/egresos-panol", "Egresar materiales", true, 80, "Preparar y registrar entregas de materiales a personas u obras.")}
          {item("/recepcion-panol?tab=recepcion", "Pedidos", true, 85, "Todos los pedidos a pañol, su historial y novedades, y el ingreso completo.")}
          {item("/remitos-panol", "Remitos", true, 95, "Escanear y guardar los papeles por barco, proveedor o carpeta, y buscarlos. No mueve stock.")}
          {item("/consumibles?tab=solicitudes", "Solicitudes", true, 100, "El papel de pedido cargado en el sistema: armar los ítems, imprimir la hoja completa y firmar el retiro con NFC.")}
          {/* Consumibles reúne lo que antes eran dos renglones (Consumibles y Caja de
              consumibles): mostrador, conteo, ingresos y stock en un solo lugar. */}
          {item("/consumibles", "Consumibles", true, 105, "El mostrador del pañol: nada sale sin registro. También conteo, ingresos y stock.")}

          {divider("panol-consulta")}
          {group("Consultar", 120)}
          {item("/materiales", "Listas de los barcos", true, 125, "Lo que lleva cada barco y en qué está: pendiente, en compras, en pañol o entregado. Sólo consulta, sin precios.")}
          {item("/stock-panol?tab=maestro", "Stock maestro", true, 130, "Existencias reales, ubicaciones y detalle por producto.")}
          {item("/catalogo-maestro", "Catálogo maestro", true, 135, "Buscar fichas de producto y consultar su vínculo con el stock, sin editar cantidades.")}
          {item("/stock-panol?tab=mapa", "Mapa del pañol", true, 140, "Plano de estanterías y productos ubicados.")}
          {item("/stock-panol?tab=movimientos", "Movimientos", true, 150, "Kardex general de ingresos, asignaciones y egresos.")}
          {item("/motores-y-grupos", "Motores y grupos", true, 155, "Motores y grupos electrógenos por barco, en el galpón y entregados, con su número de serie.")}
          {item("/compras", "Pedidos a compras", true, 160, "Pedidos propios y actualizaciones enviadas por Compras.")}

          {divider("panol-apoyo")}
          {group("Áreas de apoyo", 175)}
          {item("/madera", "Maderas", true, 185, "Stock y pedidos específicos de maderas.")}
          {itemsLaminacion(195)}
          {item("/scan-pedido", "Pedir reposición", true, 205, "Crear rápidamente un pedido interno a Compras.")}
        </>}

        {esGestion && <>
          {group("Inventario", 60)}
          {item("/madera", "Maderas", true, 70, "Stock, ingresos, egresos, movimientos y pedidos de maderas.")}
          {itemsLaminacion(80)}
          {item("/scan", "Escáner", true, 90, "Egreso de madera por escáner.")}
        </>}

        {esGestion && <>
          {divider("prod")}
          {group("Producción", 120)}
          {item("/obras", "Obras", true, 140, "Gestión de tareas y seguimiento de avance de cascos en producción.")}
          {item("/compras-etapa", "Compras por etapa", true, 145, "Las tandas de compra de cada obra con sus materiales, y los pedidos que salen de ahí.")}
          {item("/memorias", "Memorias", true, 150, "Memorias descriptivas de barcos activos en formato planilla para reunión.")}
          {item("/revisiones", "Revisiones técnicas", true, 155, "Etapa de carga: los dueños de cada línea depuran la matriz y las etapas, y la liberan para Compras.")}
          {item("/marmoleria", "Marmolería", true, 160, "Stock de materiales y cortes (ej. Dekton) para cubiertas y baños.")}
          {item("/muebles", "Muebles", true, 180, "Producción, despiece y ensamblaje de mobiliario.")}
          {item("/torneria", "Tornería", true, 190, "Materiales de Mecánica: salidas a Tornería o Plegadora y regresos parciales.")}
          {item("/calendario", "Logística", true, 200, "Solicitudes, coordinación, agenda y costos de transportes del astillero.")}
        </>}

        {esMecanica && !esGestion && <>
          {group("Mecánica", 120)}
          {item("/torneria", "Tornería", true, 140, "Seguimiento desde el celular de materiales enviados a Tornería y Plegadora.")}
        </>}

        {puedePedirCompras && !esPanol && <>
          {divider("compras")}
          {group(comprasGroup, 205)}
          {item("/compras", comprasLabel, true, 215, "Solicitudes internas a compras con seguimiento y usuarios en copia.", esCompras || realAdmin ? comprasBadge : null)}
          {/* Atajos de Compras: una cuenta Compras con admin ya los tiene en Producción y Pañol. */}
          {esCompras && !esGestion && item("/consumibles?tab=solicitudes", "Solicitudes de pañol", true, 216, "Pedidos de pañol completos, editables y vinculados a los faltantes de compras.")}
          {/* El rol compras ve acá los pedidos generados por etapa de producción (gestión ya lo ve en Producción). */}
          {esCompras && !esGestion && item("/compras-etapa", "Compras por etapa", true, 217, "Las tandas de compra de cada obra con sus materiales, y los pedidos que salen de ahí.")}
          {esCompras && !esGestion && item("/muebles", "Muebles y herrajes", true, 218, "Seguimiento de Oberti y Morph, OT de enchapado y kits de herrajes.")}
          {esCompras && !esGestion && item("/calendario", "Logística", true, 219, "Aprobar solicitudes, coordinar proveedores y registrar costos de transportes.")}
          {(esCompras || realAdmin) && item("/semaforo", "Semáforo", true, 220, "Semáforo de producción: estado visual de avance por obra.")}
        </>}

        {esCompras && !esGestion && item("/torneria", "Tornería y mecanizados", true, 219, "Seguimiento de materiales de Mecánica solicitados por Tornería.")}

        {esGestion && <>
          {divider("panol-rec")}
          {group("Pañol", 216)}
          {item("/recepcion-panol", "Recepción y egresos", true, 217, "Pedidos a pañol: recepción, faltantes, egresos y seguimiento por sede.")}
          {item("/consumibles?tab=solicitudes", "Solicitudes", true, 218, "Los papeles de pedido a pañol digitalizados, con estado por ítem y comprobante de retiro.")}
          {item("/consumibles", "Consumibles", true, 218, "Stock, reposición, precios de Rebollar y consumo por obra y por persona.")}
          {item("/pedido-panol", "Solicitud a pañol", true, 219, "Los consumibles que tu cuadrilla necesita: cargada hasta las 15, se retira al día siguiente a las 7.")}
          {item("/stock-panol", "Stock", true, 219, "Stock real del pañol por obra, proveedor, rubro y categoría.")}
          {item("/motores-y-grupos", "Motores y grupos", true, 220, "Motores y grupos electrógenos por barco: disponibles, pendientes de recepción y números de serie.")}
        </>}

        {puedeVerCatalogo && !esPanol && <>
          {divider("panol-cat")}
          {group("Catálogo", 218)}
          {item("/catalogo-maestro", "Catálogo maestro", true, 224, "Identidad única de productos, alias, códigos y vínculo de solo lectura con Pañol.")}
          {puedeVerMateriales && item("/materiales", "Listas de compras", true, 228, "Matrices y listas de materiales por sector, línea y obra.")}
        </>}

        {puedeVerPrecios && <>
          {divider("precios")}
          {group("Precios", 230)}
          {item("/costo-barco", "Costo del barco", true, 231, "Cuánto sale el material de cada modelo, con qué cobertura de precios y qué falta cotizar.")}
          {item("/precios", "Carga de precios", true, 232, "Remitos y facturas leídos con IA, lista de precios editable e historial de cambios.")}
        </>}

        {esAdministracion && puedeVerLogistica && <>
          {divider("logistica-admin")}
          {group("Logística", 235)}
          {item("/calendario", "Solicitar movimientos", true, 237, "Solicitudes de fletes, camiones, hidrogrúas y grúas.")}
        </>}

        {esGestion && <>
          {divider("lam-prod")}
          {group("Producción · Laminación", 200)}
          {item("/obras-laminacion", "Por obra", false, 220, "Detalle de materiales de laminación imputados por casco.")}
          {puedeEditarPlantillas && item("/laminacion/plantillas", "Plantillas", true, 225, "Recetas base por línea de producción de laminación.")}
        </>}

        {esGestion && <>
          {divider("pv")}
          {group("Post Venta", 370)}
          {item("/postventa", "Barcos Entregados", true, 390, "Seguimiento de garantías y servicios realizados a clientes.")}
        </>}

        {esRrhh && <>
          {divider("rrhh")}
          {group("RRHH", 395)}
          {item("/rrhh", "Presentismo", true, 400, "Asistencia, horas extras e informes del fichero Hikvision.")}
        </>}

        {esAdmin && <>
          {divider("sys")}
          {group("Sistema", 410)}
          {item("/configuracion", "Configuración", true, 430, "Ajustes globales del sistema, altas y permisos de usuarios.")}
        </>}

        {(esGestion || ["laminacion","muebles","mecanica","electricidad"].includes(role)) && <>
          {divider("ins")}
          {group("Instrucciones", 450)}
          {item("/procedimientos", "Procedimientos", true, 470, "Manuales, normativas y protocolos de trabajo del astillero.")}
        </>}

        {/* El carril planificado de consumibles: cada encargado arma desde el
            celular lo que su cuadrilla retira mañana. Pañol y clientes no lo usan. */}
        {!esGestion && !esPanol && role !== "cliente" && <>
          {divider("pedido-panol")}
          {group("Pañol", 440)}
          {item("/pedido-panol", "Solicitud a pañol", true, 445, "Los consumibles que tu cuadrilla necesita: cargada hasta las 15, se retira al día siguiente a las 7.")}
        </>}

        {/* Sin condición de rol: pedirle algo al sistema lo tiene que poder
            hacer cualquiera que entre. Va al final porque no es parte del
            trabajo diario, pero está siempre a la vista. */}
        {divider("tk")}
          {group("Ayuda", 490)}
          {item("/tickets", "Tickets", true, 500, "Pedir una mejora, avisar un problema y seguir en qué anda.")}
      </nav>

      {/* PIE ─────────────────────────────────────────────────────────────────
          La campanita y el avatar están siempre en la columna del riel; las
          herramientas, el tema y salir aparecen al abrir. Una sola campanita
          montada: antes el riel y el panel tenían cada uno la suya y pasar el
          mouse las desmontaba y volvía a montar. */}
      <div className="sb-pie">
        <div className="sb-pie-fila es-herramientas">
          {/* En el celular la campanita está en la barra superior. */}
          {!isMobile && (
            <NotificacionesBell
              profile={profile}
              size={36}
              iconSize={17}
              estiloBoton={{ borderRadius: 3, background: "transparent" }}
            />
          )}
          <div className="sb-herramientas sb-solo-abierto">
            {[
              !isMobile && {
                key: "pantalla",
                title: "Pantalla completa",
                Icono: Maximize,
                onClick: () => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else if (document.exitFullscreen) {
                    document.exitFullscreen();
                  }
                },
              },
              { key: "clave", title: "Cambiar contraseña", Icono: KeyRound, onClick: () => setPasswordOpen(true) },
              role !== "cliente" && { key: "whatsapp", title: "Vincular WhatsApp", Icono: Phone, onClick: () => setWaOpen(true) },
            ].filter(Boolean).map(({ key, title, Icono, onClick }) => (
              <button key={key} type="button" onClick={onClick} title={title} aria-label={title} className="sb-boton">
                {React.createElement(Icono, { size: 16, strokeWidth: 1.5 })}
              </button>
            ))}
          </div>
          <div className="sb-tema sb-solo-abierto" role="radiogroup" aria-label="Tema">
            {[
              { value: "dark", title: "Oscuro", Icon: Moon },
              { value: "light", title: "Claro", Icon: Sun },
              { value: "hc", title: "Alto contraste", Icon: Eye },
            ].map(({ value, title, Icon: ThemeIcon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                title={title}
                aria-label={title}
                onClick={() => setTheme(value)}
              >
                {React.createElement(ThemeIcon, { size: 14, strokeWidth: 1.5 })}
              </button>
            ))}
          </div>
        </div>

        <div className="sb-pie-fila">
          <div className="sb-avatar" title={`${username} · ${role}`}>{initials || "?"}</div>
          <div className="sb-texto" style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-usuario">{username}</div>
            <div className="sb-rol">{role}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="sb-boton sb-salir sb-solo-abierto"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </div>

        {role === "panol" && (
          <div className="sb-pie-fila">
            <button
              type="button"
              onClick={() => setModoLiviano((current) => !current)}
              title="Reduce efectos visuales para equipos o conexiones lentas"
              aria-label="Modo liviano"
              aria-pressed={modoLiviano}
              className={modoLiviano ? "sb-boton is-activo" : "sb-boton"}
              style={{ width: 36, height: 36 }}
            >
              <Gauge size={16} strokeWidth={1.5} />
            </button>
            <span className="sb-texto" style={{ fontSize: 12.5, fontWeight: 600, color: modoLiviano ? C.green : C.dim }}>
              Modo liviano {modoLiviano ? "activo" : "desactivado"}
            </span>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <style>{CSS}</style>

      {/* Fondo del cajón en el celular. El botón que lo abre y la campanita
          viven en la barra superior de AppShell: antes flotaban encima del
          título de cada pantalla. */}
      {isMobile && menuVisible && (
        <div onClick={cerrarMenu} aria-hidden="true" style={{
          position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 999,
          background: "var(--overlay)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          animation: "sb-fondo .2s ease-out",
        }} />
      )}

      {isMobile ? menu : <div ref={ranuraRef} style={estiloRanura}>{menu}</div>}

      <VincularWhatsAppModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        profile={profile}
      />
      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        profile={profile}
      />
    </>
  );
}
