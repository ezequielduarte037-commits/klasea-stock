import { normalize } from "./searchText";

/**
 * Decidir qué le están preguntando al asistente.
 *
 * Vive separado de `assistantTools` -que es el que toca la base- para que esta
 * parte se pueda leer y probar sola: es puro texto entrando y una decisión
 * saliendo, sin red y sin sesión. La decisión de qué consulta correr es lo que
 * más fácil se rompe, así que tiene que ser lo más fácil de verificar.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Períodos
//
// El modelo es pésimo haciendo cuentas de fechas y no hace falta que las haga:
// "esta semana" lo resuelve el navegador, que sabe qué día es hoy.
// ─────────────────────────────────────────────────────────────────────────────

function inicioDelDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lunesDe(fecha) {
  const d = inicioDelDia(fecha);
  // getDay() devuelve 0 para domingo. Acá la semana arranca el lunes.
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return d;
}

function finAbierto(ahora) {
  return new Date(ahora.getTime() + 1000);
}

/**
 * El orden importa: "la semana pasada" tiene que probarse antes que "semana",
 * si no cae siempre en la de esta semana.
 */
export const PERIODOS = [
  {
    clave: "semana_pasada", etiqueta: "la semana pasada",
    frases: ["semana pasada", "semana anterior"],
    rango: (hoy) => { const fin = lunesDe(hoy); const ini = new Date(fin); ini.setDate(ini.getDate() - 7); return [ini, fin]; },
  },
  {
    clave: "mes_pasado", etiqueta: "el mes pasado",
    frases: ["mes pasado", "mes anterior"],
    rango: (hoy) => [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 1)],
  },
  {
    clave: "anteayer", etiqueta: "anteayer",
    frases: ["anteayer", "antes de ayer"],
    rango: (hoy) => { const ini = inicioDelDia(hoy); ini.setDate(ini.getDate() - 2); const fin = new Date(ini); fin.setDate(fin.getDate() + 1); return [ini, fin]; },
  },
  {
    clave: "ayer", etiqueta: "ayer",
    frases: ["ayer"],
    rango: (hoy) => { const ini = inicioDelDia(hoy); ini.setDate(ini.getDate() - 1); return [ini, inicioDelDia(hoy)]; },
  },
  {
    clave: "hoy", etiqueta: "hoy",
    frases: ["hoy", "en el dia de hoy"],
    rango: (hoy) => [inicioDelDia(hoy), finAbierto(hoy)],
  },
  {
    clave: "semana", etiqueta: "esta semana",
    frases: ["esta semana", "de la semana", "en la semana", "la semana", "semanal", "ultimos 7 dias", "ultima semana"],
    rango: (hoy) => [lunesDe(hoy), finAbierto(hoy)],
  },
  {
    clave: "mes", etiqueta: "este mes",
    frases: ["este mes", "del mes", "en el mes", "mensual", "ultimos 30 dias", "ultimo mes"],
    rango: (hoy) => [new Date(hoy.getFullYear(), hoy.getMonth(), 1), finAbierto(hoy)],
  },
  {
    clave: "anio", etiqueta: "este año",
    frases: ["este ano", "del ano", "en el ano", "anual"],
    rango: (hoy) => [new Date(hoy.getFullYear(), 0, 1), finAbierto(hoy)],
  },
];

/** El período que nombra la pregunta, o null si no nombra ninguno. */
export function detectarPeriodo(pregunta, ahora = new Date()) {
  const texto = ` ${normalize(pregunta)} `;
  for (const periodo of PERIODOS) {
    const frase = periodo.frases.find((f) => texto.includes(` ${f} `));
    if (!frase) continue;
    const [desde, hasta] = periodo.rango(ahora);
    return { clave: periodo.clave, etiqueta: periodo.etiqueta, frase, desde, hasta };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Las palabras que son forma y no contenido
// ─────────────────────────────────────────────────────────────────────────────

/** Pedir un número. */
export const CONTAR = ["cuanto", "cuantos", "cuanta", "cuantas", "cantidad", "total", "totales", "numero", "contar", "cuenta", "resumen"];

/** Pedir una lista, o preguntar si existe algo. */
export const LISTAR = [
  "cual", "cuales", "lista", "listado", "listame", "mostrame", "muestrame",
  "ver", "decime", "hubo", "hay", "entraron", "entro", "llegaron", "llego",
  "cargaron", "cargo", "cargados", "salieron", "salio", "quedan", "queda",
];

/**
 * Lo que se saca antes de quedarse con el filtro.
 *
 * Incluye las palabras de tiempo: si "semana" quedara adentro, "cuántos remitos
 * esta semana" terminaría buscando remitos que digan "semana" en el proveedor.
 */
const RELLENO = new Set([
  ...CONTAR, ...LISTAR,
  "que", "quien", "quienes", "donde", "cuando", "como", "porque", "por",
  "de", "del", "la", "el", "los", "las", "y", "con", "para", "un", "una",
  "en", "al", "es", "se", "su", "sus", "lo", "o", "u", "a", "me", "mi", "nos",
  "esta", "este", "esto", "estos", "estas", "ese", "esa", "eso", "esos", "esas",
  "tiene", "tienen", "tenemos", "tengo", "fueron", "fue", "son", "estan",
  "hacer", "hicieron", "hizo", "hicimos", "sido", "haber", "habia",
  "dia", "dias", "semana", "semanas", "mes", "meses", "ano", "anos",
  "hoy", "ayer", "anteayer", "pasada", "pasado", "pasadas", "pasados",
  "anterior", "ultimo", "ultima", "ultimos", "ultimas", "actual",
  "sistema", "klase", "favor", "porfa",
]);

function palabras(pregunta) {
  return normalize(pregunta).split(" ").filter(Boolean);
}

/** Cuántas de `lista` aparecen entre los tokens. */
function cuantasDe(tokens, lista) {
  return tokens.filter((token) => lista.includes(token)).length;
}

/**
 * Lo que queda de la pregunta después de sacarle la forma.
 *
 * De "cuántos remitos de Trimer entraron esta semana" queda "trimer", que es lo
 * único que sirve como filtro. Antes esto no se hacía y la oración entera iba
 * al buscador: "esta" pescaba "estación" y el asistente terminaba hablando de
 * unos cables.
 */
export function terminosUtiles(pregunta, sujeto = []) {
  const fuera = new Set([...RELLENO, ...sujeto]);
  return palabras(pregunta).filter((token) => token.length > 2 && !fuera.has(token));
}

/**
 * El estado que se nombra, y las palabras con que se lo nombró.
 *
 * Las palabras se devuelven para poder sacarlas del filtro de texto: si
 * "cotizando" quedara ahí, "cuántos pedidos hay cotizando" además de filtrar
 * por estado buscaría pedidos cuyo TÍTULO diga "cotizando", y daría cero
 * siempre. Lo mismo con "activas" en obras.
 */
function estadoPedido(herramienta, tokens) {
  if (!herramienta.estados) return { estado: null, usadas: [] };
  for (const [valor, palabrasEstado] of Object.entries(herramienta.estados)) {
    const usadas = tokens.filter((token) => palabrasEstado.includes(token));
    if (usadas.length) return { estado: valor, usadas };
  }
  return { estado: null, usadas: [] };
}

/**
 * "Dónde" y "cómo" no piden un número: piden que le expliquen algo.
 *
 * "Dónde ingreso un material que llegó al pañol" tiene la palabra "ingreso",
 * que es de movimientos, y "llegó", que suena a listar — y sin embargo lo que
 * se está pidiendo es que le digan a qué pantalla ir. Eso lo contesta el
 * modelo, que tiene el mapa del sistema.
 */
function pideOrientacion(tokens) {
  return tokens.includes("donde") || tokens.includes("como");
}

/**
 * Qué consulta del catálogo corresponde, si es que alguna.
 *
 * Dos condiciones y las dos son obligatorias: que se nombre el SUJETO (remitos,
 * pedidos, obras, stock…) y que se esté pidiendo una cantidad o una lista.
 * "Cuántos" solo no alcanza para nada — ahí estaba el error que hacía que una
 * pregunta sobre remitos se contestara con el stock de unos cables.
 *
 * Devolver null no es una falla: significa que la pregunta es abierta y va al
 * modelo, que es lo que sabe hacer con las preguntas abiertas.
 */
export function elegirEntre(catalogo, pregunta, profile, ahora = new Date()) {
  const tokens = palabras(pregunta);
  if (!tokens.length) return null;
  if (pideOrientacion(tokens)) return null;
  if (!cuantasDe(tokens, CONTAR) && !cuantasDe(tokens, LISTAR)) return null;

  const esAdmin = !!profile?.is_admin;
  const rol = profile?.role || "";
  const candidatas = catalogo
    .filter((h) => esAdmin || h.roles.includes(rol))
    .map((h) => ({ herramienta: h, coincidencias: cuantasDe(tokens, h.sujeto) }))
    .filter(({ coincidencias }) => coincidencias > 0)
    .sort((a, b) => b.coincidencias - a.coincidencias);
  if (!candidatas.length) return null;

  const herramienta = candidatas[0].herramienta;
  const { estado, usadas } = estadoPedido(herramienta, tokens);
  return {
    herramienta,
    parametros: {
      pregunta,
      periodo: detectarPeriodo(pregunta, ahora),
      estado,
      terminos: terminosUtiles(pregunta, [...herramienta.sujeto, ...usadas]).slice(0, 4),
    },
  };
}
