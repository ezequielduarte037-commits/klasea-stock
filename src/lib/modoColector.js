// Cuándo la app arranca en el modo colector y cuándo en el panel completo.
//
// El modo colector es el shell liviano del PDA de pañol: dos botones enormes,
// sin menú lateral ni buscador, pensado para un Android viejo y para usar con
// guantes. Está bien en el aparato. En una computadora es una trampa: no tiene
// menú, así que quien cae ahí sólo puede egresar maderas o pedir a compras.
//
// Eso le pasó a lautaro.sanchez el 2026-09-16 en la PC del pañol. Había dos
// formas de caer: la regla automática ("pantalla de 768 px o menos + cuenta de
// pañol"), que en una PC se cumple con zoom alto, escalado de Windows o la
// ventana angosta; y una dirección guardada o un acceso directo a /colector.
// Desde adentro no había salida, y el texto de abajo mandaba a usar "los
// botones de arriba", que en este modo no existen.
//
// Ahora: la regla automática exige un dispositivo táctil, así que una PC con
// mouse nunca entra sola. Y si llega igual, el menú del colector ofrece pasar
// al panel completo; la elección queda guardada en ese equipo.

export const RUTAS_COLECTOR = new Set(["/colector", "/scan", "/scan-pedido", "/pantalla-egreso"]);

const MARCA_COLECTOR = "klasea.modo-colector";
const MARCA_PANEL_COMPLETO = "klasea.panel-completo";

function leer(clave) {
  try { return window.localStorage.getItem(clave); } catch { return null; }
}

// El PDA de pañol usa un Android/Chrome viejo. No alcanza con mirar el rol:
// durante pruebas y reemplazos también se entra con cuentas de técnica o admin.
// Si ese aparato intenta abrir el home completo, descarga un chunk grande y
// queda eternamente en el fallback de Suspense.
export function esAndroidLegacyAngosto() {
  if (typeof window === "undefined") return false;
  try {
    const ua = String(window.navigator?.userAgent || "");
    const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+)/i);
    const version = Number(chrome?.[1] || 0);
    return /Android/i.test(ua)
      && window.matchMedia("(max-width: 768px)").matches
      && version > 0
      && version <= 90;
  } catch {
    return false;
  }
}

// Puntero principal "grueso" = dedo. Una PC con mouse da "fine" aunque tenga la
// ventana angosta o el zoom alto, que es justo el caso que hay que distinguir.
export function esDispositivoTactil() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Alguien eligió, en este equipo, usar el panel completo en vez del colector. */
export function prefierePanelCompleto() {
  if (typeof window === "undefined") return false;
  return leer(MARCA_PANEL_COMPLETO) === "1" && !esAndroidLegacyAngosto();
}

export function tieneMarcaDeColector() {
  if (typeof window === "undefined") return false;
  return leer(MARCA_COLECTOR) === "1" && !prefierePanelCompleto();
}

export function marcarComoColector() {
  if (prefierePanelCompleto()) return;
  try { window.localStorage.setItem(MARCA_COLECTOR, "1"); } catch { /* storage bloqueado */ }
}

/**
 * Sale del modo colector en este equipo y abre el panel completo.
 *
 * Recarga la página en vez de navegar adentro de la app: App decide el modo al
 * montarse, y con una navegación interna seguiría creyendo que está en el
 * colector y volvería a mandar ahí.
 */
export function usarPanelCompleto() {
  try {
    window.localStorage.setItem(MARCA_PANEL_COMPLETO, "1");
    window.localStorage.removeItem(MARCA_COLECTOR);
  } catch { /* storage bloqueado: igual se sale, sólo que no queda recordado */ }
  window.location.replace("/");
}

export function esRutaDeColector() {
  if (typeof window === "undefined") return false;
  const ruta = window.location.pathname;
  // El menú del colector no vuelve a abrirse por una dirección guardada o un
  // acceso directo en un equipo que ya eligió el panel completo. Las pantallas
  // de trabajo (/scan, /scan-pedido, /pantalla-egreso) siguen abriendo si
  // alguien entra a propósito.
  if (ruta === "/colector" && prefierePanelCompleto()) return false;
  return RUTAS_COLECTOR.has(ruta);
}

/**
 * Si la app arranca en modo colector. `rol` es el del perfil, o vacío mientras
 * todavía no cargó.
 */
export function arrancaEnModoColector(rol) {
  if (typeof window === "undefined") return false;
  if (esRutaDeColector() || esAndroidLegacyAngosto()) return true;
  if (prefierePanelCompleto() || !esDispositivoTactil()) return false;
  const angosta = window.matchMedia("(max-width: 768px)").matches;
  return angosta && (tieneMarcaDeColector() || rol === "panol");
}
