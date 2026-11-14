/**
 * El dólar oficial, para poder mirar en un solo número lo que está en pesos y
 * lo que está en dólares.
 *
 * Se usa el VENDEDOR y no el comprador ni un promedio: es el tipo de cambio al
 * que se compra la divisa, y además es el que piden los proveedores. La lista
 * de Rebollar lo dice con todas las letras — "los precios en U$S se valorizan
 * con el TC Vendedor del BNA del día de entrega" — así que costear con otro
 * daría un número que no coincide con ninguna factura.
 *
 * NO se guarda en la base a propósito. Una cotización guardada envejece sola y
 * al mes siguiente alguien costea con el dólar de hace treinta días sin
 * enterarse. Se pide cada vez, se cachea unas horas en el navegador para no
 * pegarle a la API en cada pantalla, y siempre viaja con su fecha para que se
 * vea de cuándo es.
 */

const URL_OFICIAL = "https://dolarapi.com/v1/dolares/oficial";
const CLAVE_CACHE = "klasea.dolar.oficial";
// Seis horas: el oficial se mueve una vez por día, pero si alguien deja la
// pantalla abierta toda la jornada conviene que agarre el valor de la tarde.
const FRESCO_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

function leerCache() {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CACHE);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo);
    if (!(Number(guardado?.venta) > 0)) return null;
    return guardado;
  } catch {
    return null;
  }
}

function guardarCache(valor) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify(valor));
  } catch {
    // Sin storage funciona igual, sólo que vuelve a pedirlo cada vez.
  }
}

/**
 * El último valor conocido sin tocar la red. Sirve para pintar la pantalla al
 * instante y que el pedido a la API sólo lo actualice si trae algo más nuevo.
 */
export function dolarGuardado() {
  const cache = leerCache();
  if (!cache) return null;
  return { ...cache, origen: "guardado" };
}

/**
 * El dólar oficial vendedor.
 *
 * Nunca lanza: si no hay internet -y en las PC del pañol pasa- devuelve lo
 * último que se sabía, marcado como viejo, o null si nunca se supo nada. Una
 * pantalla de costos no se puede caer porque una API de afuera no contesta.
 */
export async function fetchDolarOficial({ force = false } = {}) {
  const cache = leerCache();
  const fresco = cache && Date.now() - Number(cache.leidoEn || 0) < FRESCO_MS;
  if (!force && fresco) return { ...cache, origen: "guardado" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(URL_OFICIAL, { signal: controller.signal, cache: "no-store" });
    if (!respuesta.ok) throw new Error(`dolarapi respondió ${respuesta.status}`);
    const datos = await respuesta.json();
    const venta = Number(datos?.venta);
    if (!(venta > 0)) throw new Error("La respuesta no trae un valor de venta.");
    const valor = {
      venta,
      compra: Number(datos?.compra) || null,
      fecha: datos?.fechaActualizacion || null,
      leidoEn: Date.now(),
    };
    guardarCache(valor);
    return { ...valor, origen: "api" };
  } catch (error) {
    if (cache) return { ...cache, origen: "viejo", error: error?.message || "sin conexión" };
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "hoy 15:55", "ayer 18:20" o la fecha corta si es de más atrás. */
export function cuandoSeActualizo(iso) {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy - dia) / 86_400_000);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
