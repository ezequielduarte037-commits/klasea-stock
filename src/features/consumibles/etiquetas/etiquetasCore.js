import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/**
 * Etiquetas de consumibles: la parte pura (sin React ni DOM).
 *
 * Qué dice cada etiqueta, cómo se dibujan las barras y el QR y cómo se reparten
 * en hojas. Está aparte para poder probarla con `node --test`
 * (etiquetasCore.test.mjs): esa prueba decodifica las barras y el QR que salen
 * de acá, así que si algo de este archivo se rompe, la etiqueta no se imprime
 * con un código que el lector no lee.
 *
 * Todo se mide en milímetros porque la etiqueta se imprime a tamaño real.
 */

// ── Formatos de impresión ───────────────────────────────────────────────────

export const FORMATOS = {
  // Hojas autoadhesivas A4 de 24 (3 × 8 de 70 × 37 mm, sin márgenes) en la
  // láser: es lo que se usa desde el martes 13/10 hasta que llegue la térmica.
  a4: {
    key: "a4",
    nombre: "Hoja A4 · 24",
    detalle: "70 × 37 mm, 3 × 8, láser",
    pagina: { ancho: 210, alto: 297 },
    etiqueta: { ancho: 70, alto: 37 },
    columnas: 3,
    filas: 8,
    porHoja: 24,
    // 8 × 37 = 296 mm: sobra medio milímetro arriba y abajo de la hoja.
    margenSuperior: 0.5,
    // La láser no imprime en los 4 mm del borde de la hoja: con este relleno
    // las etiquetas de los bordes no pierden el nombre ni las barras.
    relleno: { v: 4, h: 4.5 },
    qrMm: 12,
    // Los códigos largos también conservan altura suficiente y zona blanca.
    // El ancho incluye ambos márgenes: no se recorta ni se estira el SVG.
    barras: { altoMm: 8, moduloMaxMm: 0.42, anchoMaxMm: 53 },
  },
  // Etiqueta suelta para la térmica que llega el miércoles 14/10.
  termica: {
    key: "termica",
    nombre: "Térmica 60 × 40",
    detalle: "Una etiqueta por página",
    pagina: { ancho: 60, alto: 40 },
    etiqueta: { ancho: 60, alto: 40 },
    columnas: 1,
    filas: 1,
    porHoja: 1,
    margenSuperior: 0,
    relleno: { v: 2.5, h: 2.5 },
    qrMm: 14,
    // 0,375 mm = 3 puntos de una térmica de 203 ppp: barras parejas, sin
    // puntos repartidos a medias entre una barra y la siguiente.
    barras: { altoMm: 9, moduloMaxMm: 0.375, anchoMaxMm: 55, pasoMm: 0.125 },
  },
};

// Hoja de mostrador: A4 con 40 consumibles (2 columnas × 20) para la carpeta
// plastificada. Barras más altas porque se leen apoyando la carpeta.
export const HOJA_MOSTRADOR = {
  pagina: { ancho: 210, alto: 297 },
  margen: 8,
  columnas: 2,
  filas: 20,
  porHoja: 40,
  barras: { altoMm: 9.5, moduloMaxMm: 0.42, anchoMaxMm: 50 },
};

// ── Código de barras (Code128) ──────────────────────────────────────────────

// Zona blanca de Code128: 10 módulos a cada lado como mínimo. Sin ese blanco el
// lector no encuentra dónde empieza el código; va dentro del propio SVG para
// que no dependa de lo que haya alrededor en la etiqueta.
export const ZONA_BLANCA_MODULOS = 10;

// Por debajo de 0,25 mm por módulo los lectores láser viejos empiezan a fallar.
export const MODULO_MINIMO_MM = 0.25;

const redondear = (n, dec = 3) => Math.round(n * 10 ** dec) / 10 ** dec;

/** El patrón de módulos ("1" barra, "0" espacio) de un texto en Code128. */
export function patronCode128(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  // JsBarcode con un objeto común (sin nodeName) no dibuja: deja las
  // codificaciones en `encodings`. Así el patrón sale igual en el navegador y
  // en Node, y el SVG lo armamos nosotros con medidas en milímetros.
  const salida = {};
  try {
    JsBarcode(salida, t, { format: "CODE128" });
  } catch {
    return null;
  }
  const patron = (salida.encodings ?? []).map((e) => e.data).join("");
  return /^[01]+$/.test(patron) ? patron : null;
}

/** Rectángulos de un patrón 0/1 como un solo path ("M x 0 h w v 1 h -w z"). */
function pathDeBarras(patron, desplazamiento) {
  let d = "";
  let x = 0;
  while (x < patron.length) {
    if (patron[x] !== "1") { x += 1; continue; }
    let w = 1;
    while (patron[x + w] === "1") w += 1;
    d += `M${x + desplazamiento} 0h${w}v1h-${w}z`;
    x += w;
  }
  return d;
}

const cacheBarras = new Map();

/**
 * Barras Code128 listas para dibujar: `d` va en un <path> dentro de un <svg>
 * con `viewBox` (un módulo = 1 unidad de ancho, alto = 1) estirado a
 * `anchoMm` × `altoMm` con preserveAspectRatio="none".
 *
 * El ancho del módulo es el máximo del formato salvo que el código no entre en
 * `anchoMaxMm`; `pasoMm` lo redondea hacia abajo a puntos enteros de la
 * impresora (térmica). `legible` avisa si quedó por debajo del mínimo.
 */
export function codigoDeBarras(texto, { altoMm = 8, moduloMaxMm = 0.4, anchoMaxMm = 60, pasoMm = null } = {}) {
  const clave = `${texto}|${altoMm}|${moduloMaxMm}|${anchoMaxMm}|${pasoMm}`;
  if (cacheBarras.has(clave)) return cacheBarras.get(clave);

  const patron = patronCode128(texto);
  if (!patron) return null;
  const modulos = patron.length + 2 * ZONA_BLANCA_MODULOS;
  let modulo = Math.min(moduloMaxMm, anchoMaxMm / modulos);
  if (pasoMm) modulo = Math.floor(modulo / pasoMm + 1e-9) * pasoMm;
  // No fabricamos una etiqueta que parezca válida si el código no cabe con
  // dos puntos térmicos por módulo. La pestaña bloquea esa impresión.
  if (modulo < MODULO_MINIMO_MM - 1e-9) return null;

  const resultado = {
    texto: String(texto).trim(),
    patron,
    modulos,
    moduloMm: redondear(modulo, 4),
    anchoMm: redondear(modulos * modulo, 4),
    altoMm,
    viewBox: `0 0 ${modulos} 1`,
    d: pathDeBarras(patron, ZONA_BLANCA_MODULOS),
    legible: modulo >= MODULO_MINIMO_MM - 1e-9,
  };
  cacheBarras.set(clave, resultado);
  return resultado;
}

// ── QR ──────────────────────────────────────────────────────────────────────

// Los cuatro módulos blancos van dentro del SVG: así ni el código ni el texto
// vecino invaden la zona necesaria para que el lector encuentre el QR.
export const MARGEN_QR_MODULOS = 4;

// Nivel Q (25 % recuperable): los códigos de Rebollar de hasta 10 caracteres entran en
// la versión 1 (21 × 21), así que se gana tolerancia a mugre y raspones del
// taller sin achicar los módulos.
export const NIVEL_QR = "Q";

const cacheQR = new Map();

/**
 * QR listo para dibujar: `d` va en un <path> dentro de un <svg> con
 * `viewBox` (un módulo = 1 unidad) de `ladoMm` × `ladoMm`. Cada fila de
 * módulos negros seguidos es un rectángulo.
 */
export function codigoQR(texto, { ladoMm = 12, margen = MARGEN_QR_MODULOS, nivel = NIVEL_QR } = {}) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const clave = `${t}|${ladoMm}|${margen}|${nivel}`;
  if (cacheQR.has(clave)) return cacheQR.get(clave);

  let qr;
  try {
    qr = QRCode.create(t, { errorCorrectionLevel: nivel });
  } catch {
    return null;
  }
  const n = qr.modules.size;
  const total = n + 2 * margen;
  let d = "";
  for (let fila = 0; fila < n; fila += 1) {
    let col = 0;
    while (col < n) {
      if (!qr.modules.get(fila, col)) { col += 1; continue; }
      let w = 1;
      while (col + w < n && qr.modules.get(fila, col + w)) w += 1;
      d += `M${col + margen} ${fila + margen}h${w}v1h-${w}z`;
      col += w;
    }
  }
  const resultado = {
    texto: t,
    version: qr.version,
    nivel,
    tamano: n,
    margen,
    modulos: total,
    ladoMm,
    moduloMm: redondear(ladoMm / total, 4),
    viewBox: `0 0 ${total} ${total}`,
    d,
  };
  cacheQR.set(clave, resultado);
  return resultado;
}

/** SVG completo (texto) de unas barras o un QR. Lo usa la prueba; React dibuja el mismo `d`. */
export function svgDe(grafico, { anchoMm, altoMm } = {}) {
  if (!grafico) return "";
  const w = anchoMm ?? grafico.anchoMm ?? grafico.ladoMm;
  const h = altoMm ?? grafico.altoMm ?? grafico.ladoMm;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${grafico.viewBox}" width="${w}mm" height="${h}mm" preserveAspectRatio="none" shape-rendering="crispEdges">`
    + `<rect x="0" y="0" width="100%" height="100%" fill="#fff"/><path d="${grafico.d}" fill="#000"/></svg>`;
}

// ── Contenido de la etiqueta ────────────────────────────────────────────────

const limpio = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Lo que va impreso, sacado de un ítem de `fetchCatalogo`. Devuelve null si el
 * consumible todavía no tiene `codigoEtiqueta`: el código lo pone la base al
 * crear la config, y una etiqueta con un código inventado quedaría pegada en el
 * estante apuntando a nada.
 */
export function contenidoEtiqueta(item) {
  const codigo = limpio(item?.codigoEtiqueta).toUpperCase();
  if (!codigo) return null;
  const descripcion = limpio(item.descripcion);
  const proveedorCodigo = limpio(item.config?.proveedor_codigo).toUpperCase();
  return {
    id: item.id,
    codigo,
    // Los alias conservan nombres anteriores y pueden reunir varios productos
    // fusionados; en el estante se imprime la descripción vigente de Rebollar.
    nombre: descripcion || limpio(item.alias) || codigo,
    proveedorCodigo: proveedorCodigo && proveedorCodigo !== codigo ? proveedorCodigo : null,
    proveedorNombre: limpio(item.config?.proveedor_nombre) || null,
    unidad: limpio(item.unidad) || "unidad",
    ubicacion: limpio(item.ubicacion).toUpperCase() || null,
    rubro: item.rubro ?? null,
  };
}

/**
 * Tamaño del nombre en puntos según el largo: corto, grande y en una línea;
 * largo, más chico y en dos. Los 222 consumibles de hoy miden hasta 41
 * caracteres (el 90 % menos de 23).
 */
export function tamanoNombre(nombre, formatoKey = "a4") {
  const n = limpio(nombre).length;
  const escala = formatoKey === "termica"
    ? [[14, 14], [22, 12], [32, 10.5], [Infinity, 9.5]]
    : [[14, 13], [22, 11.5], [32, 10], [Infinity, 9]];
  return escala.find(([max]) => n <= max)[1];
}

/** Estantería de una ubicación "C2-03" → "C" (las letras del principio). */
export function estanteriaDe(ubicacion) {
  const m = /^[A-Z]+/.exec(limpio(ubicacion).toUpperCase());
  return m ? m[0] : null;
}

export const normalizarTexto = (s) =>
  limpio(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const comparar = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true, sensitivity: "base" });

/**
 * Orden de impresión: por ubicación (así se pegan estante por estante), después
 * rubro y nombre. Lo que no tiene ubicación va al final.
 */
export function ordenarParaImprimir(items = []) {
  return [...items].sort((a, b) => {
    const ua = limpio(a.ubicacion);
    const ub = limpio(b.ubicacion);
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    return comparar(ua, ub)
      || comparar(a.rubro, b.rubro)
      || comparar(limpio(a.alias) || a.descripcion, limpio(b.alias) || b.descripcion);
  });
}

/**
 * Filtro de la lista. `estanteria`: "" (todas), "__sin__" (sin ubicación) o las
 * letras de la estantería. `impresas`: { [codigo]: fecha } de este equipo.
 */
export function filtrarItems(items = [], { q = "", rubro = "", estanteria = "", soloSinImprimir = false, soloContados = false, impresas = {} } = {}) {
  const busca = normalizarTexto(q);
  return items.filter((it) => {
    if (rubro && it.rubro !== rubro) return false;
    if (estanteria === "__sin__" && limpio(it.ubicacion)) return false;
    if (estanteria && estanteria !== "__sin__" && !limpio(it.ubicacion).toUpperCase().startsWith(limpio(estanteria).toUpperCase())) return false;
    if (soloSinImprimir && it.codigoEtiqueta && impresas[String(it.codigoEtiqueta).toUpperCase()]) return false;
    // Los 649 productos de la lista no están todos en el pañol: después del
    // inventario se imprime solo lo que se contó en esta sede.
    if (soloContados && !it.ultimoConteoAt) return false;
    if (!busca) return true;
    const texto = normalizarTexto([it.descripcion, it.alias, it.codigoEtiqueta, it.config?.proveedor_codigo, it.rubro].join(" "));
    // La ubicación se busca por prefijo: "c2" trae C2-01, C2-02… y no D1-C2.
    return texto.includes(busca) || normalizarTexto(it.ubicacion).startsWith(busca);
  });
}

// ── Paginado ────────────────────────────────────────────────────────────────

/**
 * Reparte etiquetas en hojas de `porHoja` posiciones. `saltear` deja libres
 * las primeras posiciones de la primera hoja para aprovechar una hoja
 * autoadhesiva ya empezada (las usadas no se vuelven a imprimir).
 *
 * Cada celda es { tipo: "etiqueta", etiqueta } | { tipo: "usada" } | { tipo: "libre" }.
 */
export function paginar(etiquetas = [], { porHoja = 24, saltear = 0 } = {}) {
  const lista = etiquetas.filter(Boolean);
  if (!lista.length) return [];
  const tope = Math.max(1, Math.floor(porHoja));
  const s = tope > 1 ? Math.max(0, Math.min(tope - 1, Math.floor(Number(saltear) || 0))) : 0;
  const celdas = [
    ...Array.from({ length: s }, () => ({ tipo: "usada" })),
    ...lista.map((etiqueta) => ({ tipo: "etiqueta", etiqueta })),
  ];
  const hojas = [];
  for (let i = 0; i < celdas.length; i += tope) {
    const trozo = celdas.slice(i, i + tope);
    while (trozo.length < tope) trozo.push({ tipo: "libre" });
    hojas.push({ numero: hojas.length + 1, celdas: trozo });
  }
  return hojas;
}

/** Posición (1 a porHoja) donde arranca lo que quedó libre después de imprimir. */
export function proximaPosicion(cantidad, { porHoja = 24, saltear = 0 } = {}) {
  if (porHoja <= 1) return 1;
  return ((Math.floor(Number(saltear) || 0) + cantidad) % porHoja) + 1;
}

// ── Hoja de mostrador ───────────────────────────────────────────────────────

/**
 * Los consumibles de la hoja de mostrador: los que tienen `favorito_orden`
 * (la botonera de "más pedidos"), en ese orden; si todavía no marcaron
 * ninguno, los primeros 40 por nombre. Solo los que tienen código: sin código
 * no hay barras que leer.
 */
export function elegirHojaMostrador(catalogo = [], max = HOJA_MOSTRADOR.porHoja) {
  const conCodigo = catalogo.filter((it) => limpio(it.codigoEtiqueta));
  const orden = (it) => {
    const v = it.config?.favorito_orden;
    return v === null || v === undefined || v === "" ? null : Number(v);
  };
  const favoritos = conCodigo
    .filter((it) => Number.isFinite(orden(it)))
    .sort((a, b) => orden(a) - orden(b) || comparar(a.descripcion, b.descripcion));
  if (favoritos.length) {
    return { criterio: "favoritos", total: favoritos.length, items: favoritos.slice(0, max).map(contenidoEtiqueta) };
  }
  const primeros = [...conCodigo].sort((a, b) => comparar(limpio(a.alias) || a.descripcion, limpio(b.alias) || b.descripcion));
  return { criterio: "primeros", total: primeros.length, items: primeros.slice(0, max).map(contenidoEtiqueta) };
}

// ── Etiqueta de prueba ──────────────────────────────────────────────────────

// Código real de Rebollar de 10 caracteres: prueba el ancho exigente aun si
// todavía no se pudo cargar el catálogo. No crea un producto ni un movimiento.
export const CODIGO_PRUEBA = "PARFIJ0016";

/** La prueba usa el código de Rebollar más largo disponible, sin depender del filtro. */
export function productoParaPrueba(catalogo = []) {
  return catalogo.filter((it) => limpio(it.codigoEtiqueta) && !/^KA\d+$/i.test(it.codigoEtiqueta))
    .sort((a, b) => limpio(b.codigoEtiqueta).length - limpio(a.codigoEtiqueta).length
      || comparar(a.codigoEtiqueta, b.codigoEtiqueta))[0] ?? null;
}

export function etiquetaDePrueba(item) {
  const real = item ? contenidoEtiqueta(item) : null;
  if (real) return { ...real, prueba: true };
  return {
    id: "prueba",
    codigo: CODIGO_PRUEBA,
    nombre: "Etiqueta de prueba",
    proveedorCodigo: null,
    proveedorNombre: null,
    unidad: "prueba",
    ubicacion: null,
    rubro: null,
    prueba: true,
  };
}
