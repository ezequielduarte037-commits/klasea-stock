import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Gauge, KeyRound, LogOut, Maximize, Moon, Phone, Pin, PinOff, Search, Sun, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import LogoK from "@/components/ui/LogoK";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import { C } from "@/theme";
import { useTheme } from "@/theme/useTheme";
import NotificacionesBell from "@/components/NotificacionesBell";
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
    "/stock-panol?tab=sobrantes": <>
      <path d="M3 3h10v10H3z" {...p}/>
      <path d="M6 3v10M3 7h10" {...p}/>
      <path d="M11 11.5l1.2 1.2 2.3-2.4" {...p}/>
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
  @keyframes sb-in    { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes sb-fondo { from{opacity:0} }
  @media (max-width: 900px) {
    body { overscroll-behavior: none; }
  }

  .sb-aside { font-family: 'Outfit', system-ui, sans-serif; }
  /* Lo que sólo se ve con el panel abierto: se desvanece y además sale del
     orden de tabulación mientras está cerrado. */
  .sb-texto { opacity: 0; transition: opacity .12s ease; white-space: nowrap; }
  .sb-solo-abierto { opacity: 0; visibility: hidden; transition: opacity .12s ease, visibility 0s linear .12s; }
  .sb-aside[data-abierto="true"] .sb-texto { opacity: 1; transition: opacity .2s ease .06s; }
  .sb-aside[data-abierto="true"] .sb-solo-abierto { opacity: 1; visibility: visible; transition: opacity .2s ease .06s, visibility 0s; }
  .sb-solo-cerrado { transition: opacity .12s ease; }
  .sb-aside[data-abierto="true"] .sb-solo-cerrado { opacity: 0; }

  .sb-marca { height: 66px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 16px; border-bottom: 1px solid var(--border); }
  .sb-logo { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 11px; background: var(--panel-2); color: var(--text); }
  .sb-marca-textos { flex: 1; min-width: 0; }

  .sb-buscar {
    width: 100%; height: 40px; display: flex; align-items: center; gap: 11px;
    padding: 0 10px 0 13px; overflow: hidden;
    border: 1px solid var(--border); border-radius: 11px;
    background: var(--panel); color: var(--dim);
    font: inherit; text-align: left;
    transition: color .16s, background-color .16s, border-color .16s;
  }
  .sb-buscar:hover { color: var(--text); border-color: var(--border-2); background: var(--panel-2); }
  .sb-buscar kbd { border: 1px solid var(--border); background: var(--panel-2); color: var(--dim); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; font-family: 'JetBrains Mono', monospace; }

  .sb-nav { scrollbar-width: thin; scrollbar-color: var(--border-2) transparent; overflow-x: hidden; }
  .sb-nav::-webkit-scrollbar { width: 6px; }
  .sb-nav::-webkit-scrollbar-track { background: transparent; }
  .sb-nav::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
  /* Riel cerrado: sin barra de scroll. En Windows la barra ocupa ~11 px y
     achicaba cada ítem de 10–58 a 10–47 px: el fondo del ítem activo quedaba
     corrido a la izquierda del ícono y el contador de pendientes, cortado. Se
     sigue scrolleando con la rueda, y al abrir el panel la barra vuelve. */
  .sb-aside[data-abierto="false"] .sb-nav { scrollbar-width: none; }
  .sb-aside[data-abierto="false"] .sb-nav::-webkit-scrollbar { display: none; }

  .sb-grupo { height: 30px; margin-top: 8px; display: flex; align-items: center; gap: 11px; padding-left: 31px; overflow: hidden; }
  .sb-grupo-punto { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; opacity: .9; }
  .sb-grupo-texto { font-size: 11px; letter-spacing: .09em; color: var(--dim); text-transform: uppercase; font-weight: 600; }

  .sb-item {
    position: relative; overflow: hidden;
    height: 40px; margin: 2px 10px; padding: 0 10px 0 15px;
    display: flex; align-items: center; gap: 12px;
    border-radius: 11px;
    color: var(--muted); font-size: 13.5px; font-weight: 500;
    text-decoration: none !important;
    transition: color .16s, background-color .16s;
  }
  .sb-item:hover { background: var(--panel); color: var(--text); }
  .sb-item.sb-activo { background: var(--panel-2); color: var(--text); font-weight: 600; }
  .sb-item:active { transform: scale(.985); }
  .sb-icon { width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--dim); transition: color .16s; }
  .sb-item:hover .sb-icon, .sb-item.sb-activo .sb-icon { color: var(--sb-col); }
  .sb-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* La barra del ítem activo lleva el degradé de la marca. */
  .sb-marca-activa { position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: linear-gradient(180deg, var(--cyan), var(--blue)); }
  .sb-contador, .sb-contador-mini {
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--cyan-border); border-radius: 999px;
    background: var(--cyan-soft); color: var(--cyan);
    font-family: 'JetBrains Mono', monospace; font-weight: 700; line-height: 1; box-sizing: border-box;
  }
  .sb-contador { min-width: 22px; height: 20px; padding: 0 6px; font-size: 10.5px; flex-shrink: 0; }
  /* left 26 y no 30: con dos dígitos el contador mide 21 px y desde 30 se pasaba
     del borde del ítem (58 px en el riel), que lo cortaba. Queda anclado a la
     izquierda para que no viaje mientras el panel se abre o se cierra. */
  .sb-contador-mini { position: absolute; left: 26px; top: 3px; min-width: 16px; height: 16px; padding: 0 4px; font-size: 9px; }

  .sb-pie { flex-shrink: 0; display: grid; gap: 8px; padding: 10px 0 12px; border-top: 1px solid var(--border); overflow: hidden; }
  .sb-pie-fila { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px 0 14px; }
  .sb-avatar {
    position: relative; width: 40px; height: 40px; flex-shrink: 0;
    display: grid; place-items: center;
    border: 1px solid var(--blue-border); border-radius: 12px;
    background: var(--blue-soft); color: var(--text);
    font-size: 13px; font-weight: 700;
  }
  .sb-avatar::after { content: ""; position: absolute; right: -2px; bottom: -2px; width: 11px; height: 11px; border-radius: 50%; background: var(--green); border: 2px solid var(--sb-fondo); box-sizing: border-box; }
  .sb-boton {
    width: 34px; height: 34px; flex-shrink: 0;
    display: grid; place-items: center; padding: 0;
    border: 1px solid var(--border); border-radius: 10px;
    background: transparent; color: var(--dim);
    transition: color .18s, background-color .18s, border-color .18s;
  }
  .sb-boton:hover { color: var(--text); border-color: var(--border-2); background: var(--panel-2); }
  .sb-boton.is-activo { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
  .sb-salir:hover { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
  /* Fila de herramientas: con el panel abierto hay 244 px útiles. Antes sumaba
     264 (campanita de 40, tres botones bordeados de 34 y el tema) y el selector
     de tema quedaba cortado contra el borde. La campanita va con padding 16 para
     seguir centrada en la columna del riel (16 + 36/2 = 34). */
  .sb-pie-fila.es-herramientas { gap: 4px; padding-left: 16px; }
  .sb-herramientas { display: flex; align-items: center; gap: 2px; }
  .sb-herramientas .sb-boton { width: 32px; height: 32px; border-color: transparent; }
  .sb-herramientas .sb-boton:hover { border-color: transparent; }
  .sb-tema { display: flex; gap: 2px; margin-left: auto; padding: 2px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); flex-shrink: 0; }
  .sb-tema button { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--dim); transition: color .16s, background-color .16s; }
  .sb-tema button:hover { color: var(--text); background: var(--panel-2); }
  .sb-tema button[aria-checked="true"] { color: var(--text); background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--border-2); }

  /* Celular: cajón siempre abierto y blancos más grandes para el dedo. */
  .sb-aside[data-movil="true"] .sb-item { height: 46px; font-size: 14.5px; }
  .sb-aside[data-movil="true"] .sb-boton,
  .sb-aside[data-movil="true"] .sb-herramientas .sb-boton { width: 40px; height: 40px; }
  .sb-aside[data-movil="true"] .sb-tema button { width: 34px; height: 34px; }
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
  const item = (href, label, c, exact = true, delay = 0, info = "", badge = null) => {
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
          "--sb-col": c ?? C.muted,
          animation: `sb-in .28s cubic-bezier(.22,1,.36,1) ${Math.min(delay, 260)}ms both`,
        }}
      >
        {on && <span className="sb-marca-activa" />}
        <span className="sb-icon"><Icon id={href} color="currentColor" size={18} /></span>
        <span className="sb-label sb-texto">{label}</span>
        {hayBadge && <span className="sb-contador sb-texto">{badge > 99 ? "99+" : badge}</span>}
        {hayBadge && <span className="sb-contador-mini sb-solo-cerrado" aria-hidden="true">{badge > 99 ? "99" : badge}</span>}
      </Link>
    );
  };

  // ── GRUPO ─────────────────────────────────────────────────────────────────
  // Alto fijo en los dos estados para que la lista no salte al abrir. El color
  // de sección queda en el punto, que en el riel es lo único que se ve.
  const group = (label, c, delay = 0) => (
    <div key={`g${label}`} className="sb-grupo" style={{ animation: `sb-in .28s cubic-bezier(.22,1,.36,1) ${Math.min(delay, 260)}ms both` }}>
      <span className="sb-grupo-punto" style={{ background: c || C.dim }} />
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
          <LogoK size={24} titulo="Klase A" />
        </div>
        <div className="sb-marca-textos sb-texto">
          <div style={{ fontWeight: 750, letterSpacing: ".16em", fontSize: 13, lineHeight: 1.1, color: C.text }}>KLASE A</div>
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3, fontWeight: 500 }}>Astillero · producción</div>
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={cerrarMenu}
            aria-label="Cerrar el menú"
            className="sb-boton"
            style={{ width: 40, height: 40, borderColor: "transparent" }}
          >
            <X size={19} />
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
            {fijado ? <PinOff size={15} /> : <Pin size={15} />}
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
          <Search size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="sb-texto" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500 }}>Buscar</span>
          {!isMobile && <kbd className="sb-texto">Ctrl K</kbd>}
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
              estiloBoton={{ borderRadius: 11, background: "transparent" }}
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
                {React.createElement(Icono, { size: 15 })}
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
                {React.createElement(ThemeIcon, { size: 13 })}
              </button>
            ))}
          </div>
        </div>

        <div className="sb-pie-fila">
          <div className="sb-avatar" title={`${username} · ${role}`}>{initials || "?"}</div>
          <div className="sb-texto" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
              {username}
            </div>
            <div style={{ fontSize: 12, color: C.dim, fontWeight: 500, textTransform: "capitalize", marginTop: 1 }}>{role}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="sb-boton sb-salir sb-solo-abierto"
          >
            <LogOut size={15} />
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
              style={{ width: 40, height: 40 }}
            >
              <Gauge size={16} />
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
