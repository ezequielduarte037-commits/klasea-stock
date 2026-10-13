/**
 * Reglas del catálogo de consumibles que comparten la pestaña Catálogo y los
 * scripts de carga (`scripts/consumibles/`). Lógica pura.
 */

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Forma de entrega sugerida (después se corrige a mano en Catálogo):
 *   tornillería, bulones, tuercas, arandelas, tirafondos, parker, clavos → peso
 *   discos, mechas, hojas de caladora o sierra, bandas, flaps → canje 1 por 1
 *   solventes a granel (acetona, alcohol, diluyente, aguarrás, thinner,
 *   kerosene) → fraccionado
 *   el resto, herramientas incluidas → por cantidad
 */
export function formaEntregaSugerida(descripcion, rubro = null) {
  const d = sinTildes(descripcion);
  if (rubro === "Fijaciones" || /\b(tornillo|bulon|tuerca|tca|arandela|tirafondo|parker|allen|clavo|autofrenante|parafuso|fix)\b/.test(d)) return "peso";
  // Un rollo de lija se corta, no se canjea.
  if (/^rollo\b/.test(d)) return "unidad";
  if (/\b(disco|discos|mecha|broca|banda|flap|sierra|starret)\b/.test(d) || /\bhoja (caladora|calar|serrucho)\b/.test(d) || /\blija orbital\b/.test(d)) return "canje";
  // "Lata Diluyente Fana" sale en lata cerrada: no es granel.
  if (/\b(acetona|alcohol|diluyente|aguarras|thinner|kerosene)\b/.test(d) && !/^lata\b/.test(d)) return "fraccionado";
  return "unidad";
}

export const UNIDADES_ENTREGA = ["unidad", "par", "rollo", "pack", "litro", "kg", "metro"];

/** Nombre del producto: el de Rebollar más la medida (si no, los 31 "Parker cab fijadora AISI304" serían iguales). */
export function nombreProducto(renglon) {
  const d = String(renglon?.descripcion || "").replace(/\s+/g, " ").trim();
  const m = String(renglon?.medida || "").replace(/\s+/g, " ").trim();
  return m ? `${d} ${m}` : d;
}

// Subrubros de "Consumibles" por palabras de la descripción de Rebollar. El
// orden importa: "cinta métrica" es herramienta antes que cinta y "mango
// p/rodillo" es pintura. Lo que no encaja va al rubro genérico.
const RUBROS = [
  ["EPP", /\b(guantes?|barbijo|mameluco|anteojo|mascara|prefiltro|retenedor|filtro 3m|proteccion auditiva|faja)\b/],
  ["Mechas", /\b(mecha|broca|puntas?|ph[123]|ph2x65)\b|centro\/soporte copa/],
  ["Hojas caladora y serrucho", /\b(hoja calar|sierra|starret)\b/],
  ["Fijaciones", /\b(tornillo|bulon|tuerca|tca|arandela|tirafondo|parker|allen|varilla roscada|fix|clavo|tarugo|abraz|precintos?|alambre)\b/],
  ["Lijas y abrasivos", /\b(lija|disco|discos|flap|pirobanda|pano|respaldo|base orbital|base con abrojo|interface)\b/],
  ["Pintura y aplicación", /\b(pincel|rodillo|rodi|filtro pintura|aerosol)\b/],
  ["Herramientas menores", /\b(cinta metrica|metro madera|alicate|cutter|espatula|tijera|lapiz|tiza|balde|pistola|chapitas?|gomitas|taco|acoples?|espiga)\b/],
  ["Cintas y film", /\b(cinta|film|teflon|pluribol)\b/],
  ["Limpieza y descarte", /\b(bolsa|carton|cepillo|estopa|trapo|papel higienico|blem)\b/],
  ["Químicos y adhesivos", /\b(aguarras|alcohol|diluyente|thinner|kerosene|acetona|cola|fana|poxipol|sellador|sellad|silicona|teroson|kekol|super h5|primer|peroxido|catalizador|resina|cera|autopolish|masilla|pasta|ciano|trabarosca|wd|grasa|plastilina)\b/],
];

/** Nombre del subrubro sugerido, o null (va al rubro genérico "Consumibles"). */
export function rubroSugerido(texto) {
  const d = sinTildes(texto);
  for (const [nombre, re] of RUBROS) if (re.test(d)) return nombre;
  return null;
}

/**
 * Unidad en la que se entrega un producto de la lista:
 *   a granel ("x Kg", "x Litro", "x Metro") → esa unidad
 *   solventes en bidón o lata ("x 20Lts") → litro (se fraccionan)
 *   guantes → par; cintas, film y rollos → rollo; el resto → unidad
 * `contenido` es lo que devuelve interpretarContenido(descripcion).
 */
export function unidadEntregaSugerida(descripcion, contenido) {
  const d = sinTildes(descripcion);
  const { unidad, granel } = contenido ?? {};
  if (granel) return unidad;
  if (formaEntregaSugerida(descripcion) === "fraccionado" && unidad === "litro") return "litro";
  if (unidad === "par" || /\bguantes?\b/.test(d)) return "par";
  if (/\b(cinta|film|teflon|pluribol|rollos?)\b/.test(d) && !/\bcinta metrica\b/.test(d)) return "rollo";
  return "unidad";
}

/**
 * Por qué conviene revisar la unidad de entrega de un consumible, o null. El
 * precio de Rebollar es por lo que se compra (el blíster, el rollo, la caja);
 * si en el pañol se entrega una parte y la unidad quedó "una", cada retiro se
 * valoriza como el envase entero (pasó con la lija en rollo de 45 m el 13/10).
 *
 * item: { descripcion, unidad, formaEntrega, config: { factor_compra } }
 */
export function motivoRevisarUnidad(item) {
  const d = sinTildes(item?.descripcion);
  const unidad = sinTildes(item?.unidad || "unidad");
  const factor = Number(item?.config?.factor_compra) || 1;
  if (/\bblister\b/.test(d) && factor <= 1) {
    return "Viene en blíster: si se entregan las hojas sueltas, la unidad es «hoja» y el factor, cuántas trae.";
  }
  // Lo que se corta del rollo (lija, pluribol, cartón, nylon) sale por metro.
  if (/\b(lija|pluribol|carton|nylon)\b/.test(d) && /\brollo\b|\d+\s*mts?\b/.test(d) && unidad !== "metro") {
    return "Se corta del rollo: si se entrega por metro, la unidad es «metro» y el factor, los metros del rollo.";
  }
  // "x 100unid", "x 10 u": una caja que se reparte suelta.
  const pack = /(?<![\d,.]\s*)\bx\s*(\d+)\s*(u|un|unid|unidades|pzas?|piezas)\b/.exec(d);
  if (pack && Number(pack[1]) > 1 && factor <= 1) {
    return `Viene por ${pack[1]}: si se entrega suelto, el factor es ${pack[1]}.`;
  }
  return null;
}

export function descRenglon(r) {
  return r.medida ? `${r.descripcion} · ${r.medida}` : r.descripcion;
}

/** Filtro de texto simple: todas las palabras tienen que aparecer. */
export function filtrarPorTexto(filas, texto, campos, max = 8) {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const out = [];
  for (const f of filas) {
    const t = sinTildes(campos(f));
    if (palabras.every((p) => t.includes(p))) out.push(f);
    if (out.length >= max) break;
  }
  return out;
}
