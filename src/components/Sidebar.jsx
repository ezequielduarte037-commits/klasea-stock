import React, { useCallback, useEffect, useState } from "react";
import { Eye, Gauge, KeyRound, LogOut, Maximize, Menu, Moon, PanelLeftClose, PanelLeftOpen, Phone, Search, Sun, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import logoK from "@/assets/logos/logo-k.png";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import { C } from "@/theme";
import { useTheme } from "@/theme/useTheme";
import ChangePasswordModal from "@/features/cuenta/ChangePasswordModal";
import VincularWhatsAppModal from "@/features/cuenta/VincularWhatsAppModal";
import { supabase } from "@/supabaseClient";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
function Icon({ id, color = "currentColor", size = 14 }) {
  const p = { stroke: color, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
   // Dos tablones con su veta. Antes era un rectángulo partido al medio, que
   // podía ser cualquier cosa.
   "/madera": <>
      <rect x="1.5" y="4" width="13" height="3.4" rx="1.2" {...p}/>
      <rect x="1.5" y="8.6" width="13" height="3.4" rx="1.2" {...p}/>
      <path d="M4.5 5.7h4M4.5 10.3h6" {...p}/>
    </>,
    "/panol": <>
      <path d="M3 7V5a5 5 0 0 1 10 0v2" {...p}/>
      <rect x="1" y="7" width="14" height="9" rx="2" {...p}/>
      <path d="M8 11v2" {...p}/>
    </>,
    "/scan": <>
      <rect x="1.5" y="1.5" width="4" height="4" rx="1" {...p}/>
      <rect x="10.5" y="1.5" width="4" height="4" rx="1" {...p}/>
      <rect x="1.5" y="10.5" width="4" height="4" rx="1" {...p}/>
      <path d="M10.5 10.5h2v2M14.5 10.5v4M10.5 14.5h2" {...p}/>
    </>,
    "/laminacion": <>
      <path d="M1 6l7-4 7 4-7 4z" {...p}/>
      <path d="M1 11l7 4 7-4" {...p}/>
    </>,
    "/laminacion-chubut": <>
      <path d="M1 6l7-4 7 4-7 4z" {...p}/>
      <path d="M1 11l7 4 7-4" {...p}/>
      <circle cx="13.5" cy="13.5" r="2" {...p}/>
    </>,
    // Yate de motor de perfil: casco + superestructura con parabrisas inclinado
    // + antena. Antes era una silueta de persona (cabeza + hombros), que no
    // decía nada de una obra en producción.
    "/obras": <>
      <path d="M1.5 9c1.1 2.7 3.3 4.1 6.5 4.1s5.4-1.4 6.5-4.1z" {...p}/>
      <path d="M4 9V5.6h4L10.8 9" {...p}/>
      <path d="M6.2 5.6V3.2" {...p}/>
    </>,
    "/semaforo": <>
      <rect x="4" y="1" width="8" height="14" rx="2" {...p}/>
      <circle cx="8" cy="4.5" r="1.5" fill={color} stroke="none"/>
      <circle cx="8" cy="8" r="1.5" fill={color} stroke="none"/>
      <circle cx="8" cy="11.5" r="1.5" fill={color} stroke="none"/>
    </>,
    "/memorias": <>
      <rect x="2" y="2" width="12" height="12" rx="2" {...p}/>
      <path d="M5 5h6M5 8h6M5 11h4" {...p}/>
      <path d="M4 2v12" {...p}/>
    </>,
    "/marmoleria": <>
      <path d="M8 1l7 7-7 7-7-7z" {...p}/>
      <path d="M8 5.5l2.5 2.5-2.5 2.5-2.5-2.5z" {...p}/>
    </>,
    "/muebles": <>
      <rect x="1" y="6" width="14" height="6" rx="1.5" {...p}/>
      <path d="M1 12v2M15 12v2M4 6V4M12 6V4" {...p}/>
    </>,
    // Llave fija en diagonal: representa el taller de Tornería. Antes era una
    // rueda dentada genérica que se confundía con "configuración".
    "/torneria": <>
      <path d="M9.8 4.2a0.7 0.7 0 0 0 0 0.9l1.1 1.1a0.7 0.7 0 0 0 0.9 0l2.5-2.5a4 4 0 0 1-5.3 5.3l-4.6 4.6a1.4 1.4 0 0 1-2-2l4.6-4.6a4 4 0 0 1 5.3-5.3l-2.5 2.5z" {...p}/>
    </>,
    "/procedimientos": <>
      <rect x="3" y="1" width="10" height="14" rx="1.5" {...p}/>
      <path d="M6 5h4M6 8h4M6 11h2.5" {...p}/>
    </>,
    // Corte transversal de casco dentro del molde (dos "U" concéntricas).
    // Antes era una casa con puerta, que en un astillero no venía a cuento.
    "/obras-laminacion": <>
      <path d="M2 2.5v5.5a6 6 0 0 0 12 0V2.5" {...p}/>
      <path d="M4.5 2.5v5.5a3.5 3.5 0 0 0 7 0V2.5" {...p}/>
    </>,
    // Plantilla con líneas de corte punteadas. Antes era idéntico a Memorias
    // (mismo recuadro con renglones), así que no se distinguían en la lista.
    "/laminacion/plantillas": <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.8" {...p}/>
      <path d="M1.5 6.8h13" {...p} strokeDasharray="2 1.6"/>
      <path d="M6 2.5v11" {...p} strokeDasharray="2 1.6"/>
    </>,
    "/admin": <>
      <rect x="1" y="1" width="6" height="6" rx="1" {...p}/>
      <rect x="9" y="1" width="6" height="6" rx="1" {...p}/>
      <rect x="1" y="9" width="6" height="6" rx="1" {...p}/>
      <rect x="9" y="9" width="6" height="6" rx="1" {...p}/>
    </>,
    "/movimientos": <>
      <path d="M8 2v12" {...p}/>
      <path d="M5 5l3-3 3 3" {...p}/>
      <path d="M5 11l3 3 3-3" {...p}/>
    </>,
    "/pedidos": <>
      <rect x="3" y="1" width="10" height="14" rx="1.5" {...p}/>
      <path d="M6 6.5l1.5 1.5 3-3" {...p}/>
      <path d="M6 10.5h4" {...p}/>
    </>,
    "/compras": <>
      <path d="M2 3h2l1.4 7h6.8l1.4-4.5H5" {...p}/>
      <circle cx="6.2" cy="13" r="1" {...p}/>
      <circle cx="11.8" cy="13" r="1" {...p}/>
      <path d="M7 7h4" {...p}/>
    </>,
    "/materiales": <>
      <rect x="2" y="2" width="12" height="4" rx="1" {...p}/>
      <rect x="2" y="7" width="12" height="7" rx="1" {...p}/>
      <path d="M5 10h6M5 12h4" {...p}/>
    </>,
    "/consumibles-caja": <>
      <rect x="2" y="4" width="12" height="8" rx="1.5" {...p}/>
      <path d="M4.5 6v4M6.5 6v4M9 6v4M11.5 6v4" {...p}/>
    </>,
    "/catalogo-maestro": <>
      <rect x="1.5" y="2" width="13" height="12" rx="2" {...p}/>
      <path d="M4.5 5h7M4.5 8h7M4.5 11h4" {...p}/>
      <circle cx="12.5" cy="11.5" r="2" fill="var(--bg, transparent)" {...p}/>
      <path d="M14 13l1 1" {...p}/>
    </>,
    "/stock-panol": <>
      <path d="M2 5l6-3 6 3-6 3z" {...p}/>
      <path d="M2 5v6l6 3 6-3V5" {...p}/>
      <path d="M8 8v6" {...p}/>
      <path d="M4.5 6.2l6-3" {...p}/>
    </>,
    "/inicio-panol": <>
      <path d="M2 7.5L8 2l6 5.5V14H2z" {...p}/>
      <path d="M5.5 14v-4h5v4M5 7h6" {...p}/>
    </>,
    "/recepcion-panol": <>
      <path d="M2 5l6-3 6 3-6 3zM2 5v7l6 3 6-3V5M8 8v7" {...p}/>
      <path d="M11 9h4M13 7l2 2-2 2" {...p}/>
    </>,
    "/scan-pedido": <>
      <path d="M2 3h2l1.2 7h7L14 5H5" {...p}/>
      <circle cx="6.5" cy="13" r="1" {...p}/>
      <circle cx="11.5" cy="13" r="1" {...p}/>
    </>,
    // Las pestañas de pañol comparten ruta base y sin un icono propio por
    // pestaña se veian todas con el mismo cajon. Cada accion tiene el suyo.
    "/recepcion-panol?tab=recepcion": <>
      <path d="M2 9h3l1 2h4l1-2h3" {...p}/>
      <path d="M2 9v3.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V9" {...p}/>
      <path d="M8 1.5v5M5.8 4.3L8 6.5l2.2-2.2" {...p}/>
    </>,
    "/recepcion-panol?tab=ingresar": <>
      <rect x="2" y="7.5" width="12" height="6.5" rx="1.5" {...p}/>
      <path d="M8 1v4.5M5.8 3.3L8 5.5l2.2-2.2" {...p}/>
    </>,
    "/recepcion-panol?tab=scanner": <>
      <rect x="2" y="3" width="12" height="9.5" rx="1.5" {...p}/>
      <path d="M4.5 6h7M4.5 8.5h5M5 14h6" {...p}/>
      <path d="M1 2v3M1 2h3M15 2h-3M15 2v3" {...p}/>
    </>,
    "/egresos-panol": <>
      <rect x="2" y="7.5" width="12" height="6.5" rx="1.5" {...p}/>
      <path d="M8 5.5V1M5.8 3.2L8 1l2.2 2.2" {...p}/>
    </>,
    "/recepcion-panol?tab=consumibles": <>
      <path d="M3.5 3.5c0-1.1 2-2 4.5-2s4.5.9 4.5 2" {...p}/>
      <path d="M3.5 3.5v9c0 1.1 2 2 4.5 2s4.5-.9 4.5-2v-9" {...p}/>
      <path d="M3.5 8c0 1.1 2 2 4.5 2s4.5-.9 4.5-2" {...p}/>
    </>,
    "/stock-panol?tab=maestro": <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...p}/>
      <path d="M1.5 6h13M6 6v7.5" {...p}/>
    </>,
    "/stock-panol?tab=mapa": <>
      <path d="M1.5 4L6 2l4 2 4.5-2v10L10 14l-4-2-4.5 2z" {...p}/>
      <path d="M6 2v10M10 4v10" {...p}/>
    </>,
    "/stock-panol?tab=movimientos": <>
      <path d="M2.5 5.5h9M9.5 3l2.5 2.5-2.5 2.5" {...p}/>
      <path d="M13.5 10.5h-9M6.5 8L4 10.5 6.5 13" {...p}/>
    </>,
    "/configuracion": <>
      <circle cx="8" cy="8" r="2" {...p}/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" {...p}/>
    </>,
    "/calendario": <>
      <rect x="1" y="3" width="14" height="12" rx="2" {...p}/>
      <path d="M5 1v3M11 1v3M1 7h14" {...p}/>
      <path d="M4 10h2M7 10h2M10 10h2M4 13h2M7 13h2" {...p}/>
    </>,
    // Casco con tilde: "barco entregado". Antes era un tilde genérico en un
    // cuadrado, igual a cualquier otro "hecho" del sistema.
    "/postventa": <>
      <path d="M2 10c1 2.4 2.9 3.6 6 3.6s5-1.2 6-3.6z" {...p}/>
      <path d="M5 6.6l1.7 1.7L11 3" {...p}/>
    </>,
    "/rrhh": <>
      <circle cx="5.5" cy="5" r="2.5" {...p}/>
      <path d="M1 14c0-2.5 2-4 4.5-4S10 11.5 10 14" {...p}/>
      <path d="M11 5.5a2.5 2.5 0 1 0 0-0.01" {...p}/>
      <path d="M11.5 10c2 .3 3.5 1.8 3.5 4" {...p}/>
    </>,
    // Billete con signo peso. Es la pantalla de carga de precios: nada de
    // etiquetas con agujerito, que a 14px quedan hechas un borrón.
    "/precios": <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" {...p}/>
      <path d="M9.6 6.6c-.4-.5-1-.7-1.6-.7-1 0-1.7.5-1.7 1.2 0 1.7 3.4.8 3.4 2.4 0 .8-.8 1.3-1.8 1.3-.7 0-1.3-.2-1.7-.7" {...p}/>
      <path d="M8 5.1v6" {...p}/>
    </>,
    // Hoja con la esquina doblada y dos renglones: el papel de solicitud que
    // llega al mostrador. La esquina es lo que la separa de /procedimientos y
    // /memorias, que son recuadros llenos.
    "/solicitudes-panol": <>
      <path d="M3 2.2h6.2L13 5.6v8.2a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 13.8z" {...p}/>
      <path d="M9.2 2.2v3.4H13" {...p}/>
      <path d="M5.5 9h5M5.5 11.6h3" {...p}/>
    </>,
    // Escalera ascendente: las tandas de compra de una obra, una tras otra.
    // Se probaron tres cajas apiladas (leía como torta) y un carrito con flecha
    // (a 14px quedaba hecho un borrón); la escalera es la única que se entiende
    // en los dos tamaños y no se parece a ningún vecino del menú.
    "/compras-etapa": <>
      <path d="M1.5 13.6h4.3V9.4h4.3V5.2h4.4V2.4" {...p}/>
    </>,
    // Calculadora: visor arriba y teclas abajo. Los puntos son lo que la separa
    // de /materiales y /procedimientos, que a 14px son el mismo recuadro con
    // renglones.
    // Salvavidas: el aro, el centro y los cuatro tirantes. Es el único icono
    // redondo del menú, así que se encuentra sin leer.
    "/tickets": <>
      <circle cx="8" cy="8" r="6.2" {...p}/>
      <circle cx="8" cy="8" r="2.4" {...p}/>
      <path d="M3.6 3.6l2.7 2.7M12.4 3.6l-2.7 2.7M3.6 12.4l2.7-2.7M12.4 12.4l-2.7-2.7" {...p}/>
    </>,
    "/costo-barco": <>
      <rect x="3" y="1.5" width="10" height="13" rx="1.8" {...p}/>
      <path d="M5.4 4.6h5.2" {...p}/>
      <path d="M5.6 8h.01M8 8h.01M10.4 8h.01" {...p}/>
      <path d="M5.6 11.4h.01M8 11.4h.01M10.4 11.4h.01" {...p}/>
    </>,
  };
  // Busca primero el icono exacto (ruta + ?tab=...) y si no hay, el de la ruta base.
  const dibujo = paths[id] ?? paths[String(id).split("?")[0]] ?? null;

  // Sin icono propio caía un círculo pelado, indistinguible de un icono real:
  // así fue como /precios y /compras-etapa quedaron con "circulitos" sin que
  // nadie lo notara. En dev avisa por consola para que se vea al agregar la ruta.
  if (!dibujo && import.meta.env.DEV) {
    console.warn(`[Sidebar] La ruta "${id}" no tiene icono en el mapa \`paths\`; se dibuja el círculo genérico.`);
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flexShrink: 0 }}>
      {dibujo ?? <circle cx="8" cy="8" r="4" stroke={color} fill="none" strokeWidth={1.5}/>}
    </svg>
  );
}

// ─── SECTION ACCENT COLORS ────────────────────────────────────────────────────
// Colores de seccion. Sin ambar: Compras, Semaforo y Maderas lo usaban y es un
// color que en este sistema no se usa en ningun lado mas.
const SC = {
  movimientos:        "#818cf8",   // indigo
  produccion:         "#60a5fa",   // blue
  instrucciones:      "#94a3b8",   // slate
  gestion_laminacion: "#34d399",   // emerald
  gestion_maderas:    "#2dd4bf",   // teal
  sistema:            "#f87171",   // red
  postventa:          "#67e8f9",   // cyan
  tickets:            "#a78bfa",   // violet
  compras:            "#a78bfa",   // violet
  panol_catalogo:     "#38bdf8",   // sky
  rrhh:               "#2dd4bf",   // teal
  semaforo:           "#a78bfa",   // violet
};

/** Ancho del panel segun este abierto o reducido a la columna de iconos. */
const ANCHO_ABIERTO = 280;
const ANCHO_COMPACTO = 64;
const CLAVE_COMPACTO = "klasea.sidebar.compacto";
const EVENTO_COMPACTO = "klasea:sidebar-compacto";

/**
 * El estado de plegado vive en localStorage y no en el componente.
 *
 * No es una preferencia de estilo: 35 pantallas montan su propio <Sidebar>, asi
 * que cada navegacion crea una instancia nueva. Con useState solo, el panel se
 * volveria a desplegar cada vez que cambias de pantalla.
 */
function leerCompacto() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLAVE_COMPACTO) === "true";
  } catch {
    return false;
  }
}

// ─── ANIMATIONS CSS ───────────────────────────────────────────────────────────
//
// Quedaron solo las de ENTRADA y las de hover. Las que corrian en bucle -el item
// activo latiendo y parpadeando, la barra con neon pulsante, el punto que
// escalaba, la linea de escaneo cada 10 s- se sacaron: ninguna otra pantalla del
// sistema se mueve sola, y algo parpadeando al costado ocho horas cansa.
const CSS = `
  @keyframes sb-in    { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:translateX(0)} }
  @keyframes sb-down  { from{opacity:0;transform:translateY(-8px)}  to{opacity:1;transform:translateY(0)} }
  @keyframes sb-up    { from{opacity:0;transform:translateY(8px)}   to{opacity:1;transform:translateY(0)} }
  @media (max-width: 768px) { .resp-hamburger { display: flex !important; } }
  @media (max-width: 900px) {
    body { overscroll-behavior: none; }
  }

  .sb-item { position: relative; overflow: hidden; transition: color .16s, background .16s; text-decoration: none !important; }
  .sb-icon { transition: transform .18s ease; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .sb-item:hover .sb-icon { transform: scale(1.08); }
  .sb-shine { position:absolute; inset:0; border-radius:8px; opacity:0; pointer-events:none; transition:opacity .16s; }
  .sb-item:hover .sb-shine { opacity:1; }
  /* En 64 px una barra de scroll del ancho normal se come un cuarto del riel. */
  .sb-nav { scrollbar-width: thin; scrollbar-color: var(--border-2) transparent; }
  .sb-nav::-webkit-scrollbar { width: 6px; }
  .sb-nav::-webkit-scrollbar-track { background: transparent; }
  .sb-nav::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
  .sb-out { transition: color .18s, background .18s, border-color .18s; }
  .sb-out:hover { color: var(--blue) !important; border-color: var(--blue-border) !important; background: var(--blue-soft) !important; }
  .sb-logout { transition: color .18s, background .18s, border-color .18s; }
  .sb-logout:hover { color: #f87171 !important; border-color: rgba(248,113,113,.3) !important; background: rgba(248,113,113,.06) !important; }
  .sb-theme { transition: color .16s, background .16s, box-shadow .16s; }
  .sb-theme:hover { color: var(--text) !important; background: var(--panel-2) !important; }
`;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Sidebar({ profile, signOut }) {
  const loc    = useLocation();
  const path   = loc.pathname;
  const search = loc.search;
  
  const [hov, setHov] = useState(null);
  const { isMobile } = useResponsive();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const toggleMenu = () => setMenuOpen(o => !o);
  const menuVisible = isMobile && menuOpen;

  // Plegado: solo en escritorio. En celular ya existe el cajon con hamburguesa,
  // que es la version movil de lo mismo.
  const [compactoGuardado, setCompactoGuardado] = useState(leerCompacto);
  const compacto = !isMobile && compactoGuardado;
  // Con la columna de iconos, el nombre del item aparece al lado del cursor. Va
  // FUERA del <aside> a proposito: el aside tiene overflow hidden y una
  // animacion de entrada con transform, asi que un hijo posicionado quedaria
  // recortado contra los 64 px.
  const [globo, setGlobo] = useState(null);

  // Nada de esto puede vivir adentro del updater de setState. React llama a esa
  // función cuando le conviene y más de una vez -en desarrollo lo hace a
  // propósito-, y ahí adentro estaban la escritura en localStorage y un
  // dispatchEvent que este mismo componente escucha: el listener volvía a
  // pisar el estado en plena actualización y el menú terminaba sin plegarse,
  // con "false" guardado. Se calcula afuera y se avisa después.
  const alternarCompacto = useCallback(() => {
    const siguiente = !compactoGuardado;
    setCompactoGuardado(siguiente);
    setGlobo(null);
    try {
      window.localStorage.setItem(CLAVE_COMPACTO, String(siguiente));
    } catch {
      // Sin storage el plegado igual funciona mientras dure la sesion.
    }
    window.dispatchEvent(new CustomEvent(EVENTO_COMPACTO, { detail: siguiente }));
  }, [compactoGuardado]);

  // Otra instancia del sidebar -o el mismo atajo desde otra pantalla- avisa por
  // evento para que las dos queden iguales sin releer storage.
  useEffect(() => {
    const alCambiar = (evento) => {
      setCompactoGuardado(Boolean(evento.detail));
      setGlobo(null);
    };
    window.addEventListener(EVENTO_COMPACTO, alCambiar);
    return () => window.removeEventListener(EVENTO_COMPACTO, alCambiar);
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
      alternarCompacto();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [isMobile, alternarCompacto]);

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
  const itemsLaminacion = (color, base) => <>
    {veGalpon("Pampa") && item("/laminacion", sedePropia ? "Laminación" : "Laminación · Pampa", color, true, base, "Stock, ingresos, egresos y pedidos del galpón de Pampa.")}
    {veGalpon("Chubut") && item("/laminacion-chubut", sedePropia ? "Laminación" : "Laminación · Chubut", color, true, base + 5, "Stock, ingresos, egresos y pedidos del galpón de Chubut.")}
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

  // ── NAV ITEM ACTUALIZADO ──────────────────────────────────────────────────────
  const item = (href, label, c, exact = true, delay = 0, info = "", badge = null) => {
    const [hrefPath, hrefQuery = ""] = href.split("?");
    const expectedParams = new URLSearchParams(hrefQuery);
    const currentParams = new URLSearchParams(search);
    const matchesQuery = !hrefQuery || [...expectedParams.entries()].every(([key, value]) => currentParams.get(key) === value);
    const on  = exact ? path === hrefPath && matchesQuery : path.startsWith(hrefPath);
    const isH = hov === href;
    const col = c ?? C.muted;
    const hayBadge = badge != null && badge > 0;

    // La ayuda sale AL COSTADO del ítem, en los dos modos. Antes, con el menú
    // abierto, iba en un cartel abajo de todo: si el ítem que señalabas estaba
    // cerca del final -Configuración, Procedimientos, Tickets-, el cartel se le
    // montaba encima y tapaba justo lo que estabas mirando. Al costado no tapa
    // nada del menú y no le mueve el alto a nadie.
    const alEntrar = (evento) => {
      setHov(href);
      if (!info && !compacto) return;
      const caja = evento.currentTarget.getBoundingClientRect();
      setGlobo({ label, info, top: caja.top + caja.height / 2 });
    };
    const alSalir = () => { setHov(null); setGlobo(null); };

    // Columna de iconos: 46x42 para que siga siendo un blanco comodo con el dedo
    // en las PC del pañol, y el contador se monta sobre el icono.
    if (compacto) {
      return (
        <Link
          key={href} to={href}
          className="sb-item"
          title={label}
          aria-label={label}
          onMouseEnter={alEntrar}
          onMouseLeave={alSalir}
          style={{
            width: 46, height: 42, margin: "1px auto", borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: on ? col : isH ? C.text : C.dim,
            background: on ? C.panel2 : isH ? C.panel : "transparent",
            animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
          }}
        >
          {on && <div style={{ position: "absolute", left: -9, top: "20%", bottom: "20%", width: 2, borderRadius: "0 2px 2px 0", background: col }}/>}
          <span className="sb-icon"><Icon id={href} color="currentColor" size={18} /></span>
          {hayBadge && (
            <span style={{
              position: "absolute", top: 3, right: 1,
              minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: C.cyanL, border: `1px solid ${C.cyanB}`, color: C.cyan,
              fontSize: 9, fontFamily: C.mono, fontWeight: 900, lineHeight: 1,
              boxSizing: "border-box",
            }}>
              {badge > 99 ? "99" : badge}
            </span>
          )}
        </Link>
      );
    }

    return (
      <Link
        key={href} to={href}
        className="sb-item"
        onClick={() => { if (isMobile) setMenuOpen(false); }}
        onMouseEnter={alEntrar}
        onMouseLeave={alSalir}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 14px 9px 18px", margin: "2px 8px", borderRadius: 8,
          color: on ? C.text : isH ? C.text : C.muted,
          fontSize: 13, letterSpacing: "0.1px", fontWeight: on ? 700 : 600,
          background: on ? C.panel2 : isH ? C.panel : "transparent",
          animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
        }}
      >
        <div className="sb-shine" style={{ background: `linear-gradient(90deg,${col}18,transparent 55%)` }} />
        {on && <div style={{ position: "absolute", left: 0, top: "18%", bottom: "18%", width: 2, borderRadius: "0 2px 2px 0", background: col }}/>}
        <span className="sb-icon" style={{ color: on ? col : isH ? col : C.dim }}>
          <Icon id={href} color="currentColor" size={15} />
        </span>
        <span className="sb-label" style={{ flex: 1 }}>{label}</span>
        {hayBadge && (
          <span style={{
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: C.cyanL,
            border: `1px solid ${C.cyanB}`,
            color: C.cyan,
            fontSize: 10,
            fontFamily: C.mono,
            fontWeight: 900,
            lineHeight: 1,
          }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  // ── SUB ITEM ACTUALIZADO ──────────────────────────────────────────────────────
  const _subItem = (href, label, qs = "", c, delay = 0, info = "") => {
    const key = `${href}${qs}`;
    const on  = path === href && (qs ? search === qs : !search);
    const isH = hov === key;
    const col = c ?? C.dim;
    return (
      <Link
        key={key} to={key}
        className={`sb-item${on ? " active" : ""}`}
        onClick={() => { if (isMobile) setMenuOpen(false); }}
        onMouseEnter={(evento) => {
          setHov(key);
          if (isMobile || !info) return;
          const caja = evento.currentTarget.getBoundingClientRect();
          setGlobo({ label, info, top: caja.top + caja.height / 2 });
        }}
        onMouseLeave={() => { setHov(null); setGlobo(null); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 16px 5px 42px", margin: "1px 8px", borderRadius: 7,
          color: on ? C.text : isH ? C.muted : C.dim,
          fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", fontWeight: on ? 700 : 600,
          background: on ? C.panel2 : isH ? C.panel : "transparent",
          animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
        }}
      >
        {on && <div className="sb-bar" style={{ position: "absolute", left: 0, top: "12%", bottom: "12%", width: 2, borderRadius: "0 2px 2px 0", background: col, "--c": col }}/>}
        <div style={{ width: 3, height: 3, borderRadius: "50%", flexShrink: 0, background: on ? col : C.border2, boxShadow: on ? `0 0 5px ${col}` : "none", transition: "background .16s" }}/>
        <span className="sb-label">{label}</span>
      </Link>
    );
  };

  // ── GROUP & DIVIDER ─────────────────────────────────────────────────────
  // Plegado no entra el titulo del grupo: lo reemplaza una linea, que es lo
  // unico que hace falta para que los bloques no se lean como una lista sola.
  const group = (label, c, delay = 0) => (compacto ? (
    <div key={`g${label}`} style={{ width: 26, height: 1, margin: "9px auto", background: C.border }}/>
  ) : (
    <div key={`g${label}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px 6px", animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both` }}>
      {/* El color de seccion queda en el punto. El texto va con el token de
          siempre: los colores de seccion son hex fijos pensados para el tema
          oscuro y en claro el titulo quedaba casi invisible. */}
      <div style={{ width: 3, height: 3, borderRadius: "50%", flexShrink: 0, background: c || C.dim }}/>
      <span style={{ fontSize: 10, letterSpacing: "1.3px", color: C.dim, textTransform: "uppercase", fontWeight: 800 }}>{label}</span>
    </div>
  ));

  // Plegado el separador ya lo pone el grupo: dos rayas seguidas serian ruido.
  const divider = (k) => (compacto ? null : (
    <div key={`d${k}`} style={{ height: 1, margin: "4px 20px", background: `linear-gradient(90deg,transparent,${C.border},transparent)` }}/>
  ));

  const sidebarMobileStyle = {
    position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 1000,
    width: "min(86vw, 310px)", background: C.bg,
    display: "flex", flexDirection: "column",
    borderRight: `1px solid ${C.border}`,
    transform: menuVisible ? "translateX(0)" : "translateX(-100%)",
    transition: "transform .3s cubic-bezier(.22,1,.36,1)",
    overflow: "hidden",
    paddingTop: "env(safe-area-inset-top, 0px)",
  };

  const sidebarDesktopStyle = {
    width: compacto ? ANCHO_COMPACTO : ANCHO_ABIERTO,
    flexShrink: 0, background: C.bg, height: "100%",
    display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`,
    position: "relative", overflow: "hidden",
    transition: "width .2s cubic-bezier(.22,1,.36,1)",
    animation: "sb-in .38s cubic-bezier(.22,1,.36,1) both",
    boxSizing: "border-box",
  };

  const botonPlegar = (
    <button
      type="button"
      onClick={alternarCompacto}
      title={`${compacto ? "Expandir" : "Contraer"} el menú (Ctrl + B)`}
      aria-label={compacto ? "Expandir el menú" : "Contraer el menú"}
      className="sb-out"
      style={{
        width: compacto ? 34 : 26, height: compacto ? 30 : 26, borderRadius: 7, flexShrink: 0,
        background: C.panel, border: `1px solid ${C.border}`, color: C.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0, boxSizing: "border-box",
      }}
    >
      {compacto ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
    </button>
  );

  return (
    <>
      <style>{CSS}</style>

      {isMobile && (
        <>
          {menuVisible && (
            <div onClick={toggleMenu} style={{
              position: "fixed", inset: 0, zIndex: 999,
              background: "var(--overlay)", backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }} />
          )}
          <button onClick={toggleMenu} className="resp-hamburger" style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 10px)",
            left: "calc(env(safe-area-inset-left, 0px) + 10px)",
            zIndex: 1001,
            width: 42, height: 42, borderRadius: 10,
            background: C.panelSolid, border: `1px solid ${C.border}`,
            color: C.text, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            boxShadow: "0 10px 30px var(--shadow)",
          }}>
            {menuVisible ? <X size={18} /> : <Menu size={18} />}
          </button>
        </>
      )}

      <aside style={isMobile ? sidebarMobileStyle : sidebarDesktopStyle}>
        {/* Sin la linea de escaneo ni el resplandor de arriba: eran los dos
            unicos efectos de este tipo en toda la aplicacion. */}

        {/* BRAND ─────────────────────────────────────────────────────────── */}
        <div style={{
          padding: isMobile ? "14px 14px 12px" : compacto ? "18px 0" : "18px 14px 16px 18px",
          borderBottom: `1px solid ${C.border}`, position: "relative", flexShrink: 0,
          animation: "sb-down .42s cubic-bezier(.22,1,.36,1) .06s both",
        }}>
          {isMobile && (
            <button onClick={toggleMenu} style={{
              position: "absolute", top: 10, right: 10, zIndex: 5,
              background: "transparent", border: "none", color: C.dim,
              cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1,
            }}>
              ✕
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: compacto ? "center" : "flex-start", gap: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: C.panel2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={logoK} alt="K" className="klasea-logo-mono" style={{ width: 15, height: 15, objectFit: "contain" }}/>
            </div>
            {!compacto && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, letterSpacing: "1.3px", fontSize: 12, lineHeight: 1, color: C.text }}>
                    KLASE A
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: "1.1px", color: C.dim, textTransform: "uppercase", marginTop: 3, fontWeight: 700 }}>
                    Sistema de producción
                  </div>
                </div>
                {!isMobile && botonPlegar}
              </>
            )}
          </div>
        </div>

        {/* El buscador nunca se esconde: plegado queda como lupa, y Ctrl+K sigue
            funcionando igual desde cualquier parte. */}
        <div style={{ padding: compacto ? "10px 0 6px" : "10px 8px 4px", position: "relative", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("klasea:open-global-search"));
              if (isMobile) setMenuOpen(false);
            }}
            title="Buscar en todo Klase A (Ctrl + K)"
            aria-label="Buscar en todo Klase A"
            className="sb-out"
            style={{
              width: compacto ? 40 : "100%", minHeight: 36, display: "flex", alignItems: "center",
              justifyContent: compacto ? "center" : "flex-start", gap: 9,
              padding: compacto ? 0 : "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.panel, color: C.dim, cursor: "pointer", fontFamily: C.sans,
              textAlign: "left", boxSizing: "border-box",
            }}
          >
            <Search size={compacto ? 15 : 14} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {!compacto && (
              <>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: ".2px" }}>Buscar en Klase A</span>
                {!isMobile && <kbd style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.dim, borderRadius: 5, padding: "2px 5px", fontSize: 8.5, fontFamily: C.mono, whiteSpace: "nowrap" }}>Ctrl K</kbd>}
              </>
            )}
          </button>
        </div>

        {/* NAV ───────────────────────────────────────────────────────────── */}
        <nav className="sb-nav" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 8, paddingTop: 4 }}>
          {esPanol && <>
            {group("Operación diaria", SC.panol_catalogo, 55)}
            {item("/inicio-panol", "Panel de pañol", SC.panol_catalogo, true, 65, "Resumen de pendientes, equipos y próximas recepciones.")}
            {item("/recepcion-panol?tab=recepcion", "Recepcionar", SC.panol_catalogo, true, 75, "Pedidos y avisos enviados por Compras para recibir en tu sede.")}
            {item("/recepcion-panol?tab=scanner", "Escanear remitos", SC.panol_catalogo, true, 80, "Digitalizar remitos por USB, revisar la lectura de IA e ingresar sin volver a tipear.")}
            {item("/recepcion-panol?tab=ingresar", "Ingresar materiales", SC.panol_catalogo, true, 85, "Ingresos directos, remitos, borradores y ubicación en estantería.")}
            {item("/egresos-panol", "Egresar materiales", SC.panol_catalogo, true, 95, "Preparar y registrar entregas de materiales a personas u obras.")}
            {item("/solicitudes-panol", "Solicitudes", SC.panol_catalogo, true, 100, "El papel de pedido cargado en el sistema: armar los ítems, imprimir la hoja completa y firmar el retiro con NFC.")}
            {item("/recepcion-panol?tab=consumibles", "Consumibles", SC.panol_catalogo, true, 105, "Ingresos, egresos por cantidad o peso y movimientos de consumibles.")}
            {/* Se llamaba "Egreso de consumibles" y quedaba pegado a
                "Consumibles": dos renglones casi iguales, uno arriba del otro.
                "Caja" es como le dicen en el pañol y ademas describe mejor lo
                que hace, porque por aca tambien entra mercaderia. */}
            {item("/consumibles-caja", "Caja de consumibles", SC.panol_catalogo, true, 106, "La caja del pañol: tarjeta o nombre, se escanean los productos y sale del stock. También entra mercadería por acá.")}

            {divider("panol-consulta")}
            {group("Consultar", SC.movimientos, 120)}
            {item("/stock-panol?tab=maestro", "Stock maestro", SC.movimientos, true, 130, "Existencias reales, ubicaciones y detalle por producto.")}
            {item("/catalogo-maestro", "Catálogo maestro", SC.movimientos, true, 135, "Buscar fichas de producto y consultar su vínculo con el stock, sin editar cantidades.")}
            {item("/stock-panol?tab=mapa", "Mapa del pañol", SC.movimientos, true, 140, "Plano de estanterías y productos ubicados.")}
            {item("/stock-panol?tab=movimientos", "Movimientos", SC.movimientos, true, 150, "Kardex general de ingresos, asignaciones y egresos.")}
            {item("/compras", "Pedidos a compras", SC.compras, true, 160, "Pedidos propios y actualizaciones enviadas por Compras.")}

            {divider("panol-apoyo")}
            {group("Áreas de apoyo", C.dim, 175)}
            {item("/madera", "Maderas", C.dim, true, 185, "Stock y pedidos específicos de maderas.")}
            {itemsLaminacion(C.dim, 195)}
            {item("/scan-pedido", "Pedir reposición", C.dim, true, 205, "Crear rápidamente un pedido interno a Compras.")}
          </>}

          {esGestion && <>
            {group("Inventario", SC.movimientos, 60)}
            {item("/madera", "Maderas", SC.movimientos, true, 70, "Stock, ingresos, egresos, movimientos y pedidos de maderas.")}
            {itemsLaminacion(SC.movimientos, 80)}
            {item("/scan", "Escáner", SC.movimientos, true, 90, "Egreso de madera por escáner.")}
          </>}

          {esGestion && <>
            {divider("prod")}
            {group("Producción", SC.produccion, 120)}
            {item("/obras",       "Obras",       SC.produccion, true, 140, "Gestión de tareas y seguimiento de avance de cascos en producción.")}
            {item("/compras-etapa", "Compras por etapa", SC.produccion, true, 145, "Las tandas de compra de cada obra con sus materiales, y los pedidos que salen de ahí.")}
            {item("/memorias",    "Memorias",    SC.produccion, true, 150, "Memorias descriptivas de barcos activos en formato planilla para reunión.")}
            {item("/marmoleria",  "Marmolería",  SC.produccion, true, 160, "Stock de materiales y cortes (ej. Dekton) para cubiertas y baños.")}
            {item("/muebles",     "Muebles",     SC.produccion, true, 180, "Producción, despiece y ensamblaje de mobiliario.")}
            {item("/torneria",    "Tornería",    SC.produccion, true, 190, "Materiales de Mecánica: salidas a Tornería o Plegadora y regresos parciales.")}
            {item("/calendario", "Logística", SC.produccion, true, 200, "Solicitudes, coordinación, agenda y costos de transportes del astillero.")}
          </>}

          {esMecanica && !esGestion && <>
            {group("Mecánica", SC.produccion, 120)}
            {item("/torneria", "Tornería", SC.produccion, true, 140, "Seguimiento desde el celular de materiales enviados a Tornería y Plegadora.")}
          </>}

          {puedePedirCompras && !esPanol && <>
            {divider("compras")}
            {group(comprasGroup, SC.compras, 205)}
            {item("/compras", comprasLabel, SC.compras, true, 215, "Solicitudes internas a compras con seguimiento y usuarios en copia.", esCompras || realAdmin ? comprasBadge : null)}
            {esCompras && item("/solicitudes-panol", "Solicitudes de pañol", SC.panol_catalogo, true, 216, "Pedidos de pañol completos, editables y vinculados a los faltantes de compras.")}
            {/* El rol compras ve acá los pedidos generados por etapa de producción (gestión ya lo ve en Producción). */}
            {esCompras && item("/compras-etapa", "Compras por etapa", SC.compras, true, 217, "Las tandas de compra de cada obra con sus materiales, y los pedidos que salen de ahí.")}
            {esCompras && item("/muebles", "Muebles y herrajes", SC.produccion, true, 218, "Seguimiento de Oberti y Morph, OT de enchapado y kits de herrajes.")}
            {esCompras && item("/calendario", "Logística", SC.produccion, true, 219, "Aprobar solicitudes, coordinar proveedores y registrar costos de transportes.")}
            {(esCompras || realAdmin) && item("/semaforo", "Semáforo", SC.semaforo, true, 220, "Semáforo de producción: estado visual de avance por obra.")}
          </>}

          {esCompras && item("/torneria", "Tornería y mecanizados", SC.produccion, true, 219, "Seguimiento de materiales de Mecánica solicitados por Tornería.")}

          {esGestion && <>
            {divider("panol-rec")}
            {group("Pañol", SC.panol_catalogo, 216)}
            {item("/recepcion-panol", "Recepción y egresos", SC.panol_catalogo, true, 217, "Pedidos a pañol: recepción, faltantes, egresos y seguimiento por sede.")}
            {item("/solicitudes-panol", "Solicitudes", SC.panol_catalogo, true, 218, "Los papeles de pedido a pañol digitalizados, con estado por ítem y comprobante de retiro.")}
            {item("/stock-panol", "Stock", SC.panol_catalogo, true, 219, "Stock real del pañol por obra, proveedor, rubro y categoría.")}
          </>}

          {puedeVerCatalogo && !esPanol && <>
            {divider("panol-cat")}
            {group("Catálogo", SC.panol_catalogo, 218)}
            {item("/catalogo-maestro", "Catálogo maestro", SC.panol_catalogo, true, 224, "Identidad única de productos, alias, códigos y vínculo de solo lectura con Pañol.")}
            {puedeVerMateriales && item("/materiales", "Listas de compras", SC.panol_catalogo, true, 228, "Matrices y listas de materiales por sector, línea y obra.")}
          </>}

          {puedeVerPrecios && <>
            {divider("precios")}
            {group("Precios", SC.panol_catalogo, 230)}
            {item("/costo-barco", "Costo del barco", SC.panol_catalogo, true, 231, "Cuánto sale el material de cada modelo, con qué cobertura de precios y qué falta cotizar.")}
            {item("/precios", "Carga de precios", SC.panol_catalogo, true, 232, "Remitos y facturas leídos con IA, lista de precios editable e historial de cambios.")}
          </>}

          {esAdministracion && puedeVerLogistica && <>
            {divider("logistica-admin")}
            {group("Logística", SC.produccion, 235)}
            {item("/calendario", "Solicitar movimientos", SC.produccion, true, 237, "Solicitudes de fletes, camiones, hidrogrúas y grúas.")}
          </>}

          {esGestion && <>
            {divider("lam-prod")}
            {group("Producción · Laminación", SC.gestion_laminacion, 200)}
            {item("/obras-laminacion", "Por obra", SC.gestion_laminacion, false, 220, "Detalle de materiales de laminación imputados por casco.")}
            {puedeEditarPlantillas && item("/laminacion/plantillas", "Plantillas", SC.gestion_laminacion, true, 225, "Recetas base por línea de producción de laminación.")}
          </>}

          {esGestion && <>
            {divider("pv")}
            {group("Post Venta", SC.postventa, 370)}
            {item("/postventa", "Barcos Entregados", SC.postventa, true, 390, "Seguimiento de garantías y servicios realizados a clientes.")}
          </>}

          {esRrhh && <>
            {divider("rrhh")}
            {group("RRHH", SC.rrhh, 395)}
            {item("/rrhh", "Presentismo", SC.rrhh, true, 400, "Asistencia, horas extras e informes del fichero Hikvision.")}
          </>}

          {esAdmin && <>
            {divider("sys")}
            {group("Sistema", SC.sistema, 410)}
            {item("/configuracion", "Configuración", SC.sistema, true, 430, "Ajustes globales del sistema, altas y permisos de usuarios.")}
          </>}

          {(esGestion || ["laminacion","muebles","mecanica","electricidad"].includes(role)) && <>
            {divider("ins")}
            {group("Instrucciones", SC.instrucciones, 450)}
            {item("/procedimientos", "Procedimientos", SC.instrucciones, true, 470, "Manuales, normativas y protocolos de trabajo del astillero.")}
          </>}

          {/* Sin condición de rol: pedirle algo al sistema lo tiene que poder
              hacer cualquiera que entre. Va al final porque no es parte del
              trabajo diario, pero está siempre a la vista. */}
          {divider("tk")}
          {group("Ayuda", SC.tickets, 490)}
          {item("/tickets", "Tickets", SC.tickets, true, 500, "Pedir una mejora, avisar un problema y seguir en qué anda.")}
        </nav>

        {/* PIE PLEGADO ────────────────────────────────────────────────────
            Solo lo que se busca a ciegas: expandir, quien soy y salir. El tema,
            la contraseña y el resto viven en el pie completo, a un Ctrl+B. */}
        {compacto && (
          <div style={{
            borderTop: `1px solid ${C.border}`, padding: "10px 0 12px", flexShrink: 0,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            {botonPlegar}
            <div
              title={`${username} · ${role}`}
              style={{
                width: 30, height: 30, borderRadius: 9, background: C.panel2,
                border: `1px solid ${C.border}`, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.text,
                letterSpacing: .4, position: "relative", boxSizing: "border-box",
              }}
            >
              {initials || "?"}
              <span style={{ position: "absolute", right: -1, bottom: -1, width: 8, height: 8, borderRadius: "50%", background: C.green, border: `2px solid ${C.bg}`, boxSizing: "border-box" }}/>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="sb-logout"
              style={{
                background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7,
                color: C.dim, width: 30, height: 28, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", padding: 0, boxSizing: "border-box",
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        )}

        {/* FOOTER ────────────────────────────────────────────────────────── */}
        {!compacto && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: "10px 12px 12px",
          display: "grid",
          gap: 8,
          flexShrink: 0,
          animation: "sb-up .38s cubic-bezier(.22,1,.36,1) .12s both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              flexShrink: 0,
              background: C.panel2,
              border: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              color: C.text,
              letterSpacing: .4,
            }}>
              {initials || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.text, letterSpacing: ".2px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
                {username}
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <div className="sb-online" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}/>
                <span style={{ fontSize: 10, color: C.dim, letterSpacing: "1px", textTransform: "uppercase", fontWeight: 800 }}>{role}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                  }
                }}
                title="Pantalla completa"
                className="sb-out"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  color: C.dim,
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                <Maximize size={13} />
              </button>
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                title="Cambiar contraseña"
                className="sb-out"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  color: C.dim,
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                <KeyRound size={13} />
              </button>
              {role !== "cliente" && (
                <button
                  type="button"
                  onClick={() => setWaOpen(true)}
                  title="Vincular WhatsApp"
                  className="sb-out"
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                    color: C.dim,
                    width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <Phone size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                title="Cerrar sesión"
                className="sb-logout"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  color: C.dim,
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 3, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, background: C.panel, flexShrink: 0 }}>
            {[
              { value: "dark", title: "Oscuro", Icon: Moon },
              { value: "light", title: "Claro", Icon: Sun },
              { value: "hc", title: "Alto contraste", Icon: Eye },
            ].map(({ value, title, Icon: ThemeIcon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  title={title}
                  aria-label={title}
                  onClick={() => setTheme(value)}
                  className="sb-theme"
                  style={{
                    height: 25,
                    border: "none",
                    borderRadius: 6,
                    background: active ? C.panel2 : "transparent",
                    color: active ? C.text : C.dim,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                    boxShadow: active ? `inset 0 0 0 1px ${C.border2}` : "none",
                  }}
                >
                  {React.createElement(ThemeIcon, { size: 13 })}
                </button>
              );
            })}
          </div>

          {role === "panol" && (
            <button
              type="button"
              onClick={() => setModoLiviano((current) => !current)}
              title="Reduce efectos visuales para equipos o conexiones lentas"
              style={{
                width: "100%", marginTop: 6, minHeight: 28, borderRadius: 7,
                border: `1px solid ${modoLiviano ? C.greenB : C.border}`,
                background: modoLiviano ? C.greenL : C.panel,
                color: modoLiviano ? C.green : C.dim,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 10, fontWeight: 800, letterSpacing: ".35px", cursor: "pointer",
              }}
            >
              <Gauge size={13} /> Modo liviano {modoLiviano ? "activo" : "desactivado"}
            </button>
          )}
        </div>
        )}
      </aside>

      {/* El nombre del item cuando el menu esta plegado. Fuera del <aside> para
          que no lo recorte el overflow de los 64 px. */}
      {!isMobile && globo && (
        <div style={{
          position: "fixed",
          left: (compacto ? ANCHO_COMPACTO : ANCHO_ABIERTO) + 10,
          top: globo.top, transform: "translateY(-50%)",
          zIndex: 1200, pointerEvents: "none",
          background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 8,
          padding: "7px 11px", boxShadow: "0 10px 30px var(--shadow)", maxWidth: 260,
        }}>
          {/* Con el menú abierto el nombre ya se lee en el ítem: repetirlo acá
              sería decir dos veces lo mismo a diez centímetros. */}
          {compacto ? (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{globo.label}</div>
          ) : null}
          {globo.info ? (
            <div style={{ fontSize: 11, fontWeight: 600, color: compacto ? C.dim : C.muted, marginTop: compacto ? 2 : 0, lineHeight: 1.45 }}>
              {globo.info}
            </div>
          ) : null}
        </div>
      )}
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
