/**
 * Lista de precios de proveedor → renglones listos para `consumibles_lista_items`.
 *
 * Lógica pura, sin React ni Supabase ni xlsx: la usan igual la pestaña Precios
 * (cuando alguien sube el Excel desde el navegador) y el script
 * `scripts/consumibles/lista-rebollar.mjs` (que generó la carga inicial). Si
 * cambia una regla, cambia en los dos lados a la vez.
 *
 * Recibe las filas como las da `XLSX.utils.sheet_to_json(hoja, { header: 1,
 * raw: true })`: un arreglo de arreglos.
 *
 * Formato de Rebollar (CMR Insumos Industriales), visto en la lista del
 * 08/10/2026: título arriba, encabezado "Código | Descripción | Unidad / Medida |
 * Precio unitario | Moneda | Condición" y al final tres notas al pie escritas en
 * la columna Código (sin precio ni moneda). "Unidad / Medida" en realidad trae
 * la medida ("6 X 1 1/4"); la unidad de compra viene escondida en la
 * descripción ("x 4Lts", "x100unid", "X Kg").
 */

// ── Texto ───────────────────────────────────────────────────────────────────

export function limpiarTexto(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function sinTildes(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function aNumero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[$\s]/g, "");
  // "1.234,56" (es-AR) o "1234.56": si hay coma, la coma es el decimal.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function redondear(n, decimales = 4) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = 10 ** decimales;
  return Math.round(Number(n) * f) / f;
}

// ── Moneda y condición ──────────────────────────────────────────────────────

/** '$' → 'ARS'; 'USD', 'U$S', 'US$' → 'USD'. Otra cosa → null (se avisa). */
export function normalizarMoneda(v) {
  const s = sinTildes(limpiarTexto(v)).toUpperCase().replace(/\s/g, "");
  if (!s) return null;
  if (s === "$" || s === "ARS" || s === "PESOS" || s === "AR$") return "ARS";
  if (s === "USD" || s === "U$S" || s === "US$" || s === "U$D" || s === "DOLAR" || s === "DOLARES") return "USD";
  return null;
}

/**
 * '+IVA' = factura con IVA aparte; 'Final' = precio final con remito. En los
 * dos casos el costo sin IVA es el precio: en "+IVA" porque el IVA va aparte y
 * en "Final" porque con remito no hay IVA que descontar (decisión del brief).
 */
export function normalizarCondicion(v) {
  const s = sinTildes(limpiarTexto(v)).toUpperCase().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes("IVA")) return "+IVA";
  if (s.startsWith("FINAL")) return "Final";
  return null;
}

// ── Unidad de compra escondida en la descripción ────────────────────────────

const UNIDADES = [
  // [expresión de la unidad, unidad_compra, factor a la unidad base]
  [/^(?:lts?|litros?|l)$/, "litro", 1],
  [/^(?:ml)$/, "litro", 0.001],
  [/^(?:cc|cm3)$/, "litro", 0.001],
  [/^(?:kgs?|kilos?)$/, "kg", 1],
  [/^(?:grs?|g)$/, "kg", 0.001],
  [/^(?:mts?|metros?|m)$/, "metro", 1],
  [/^(?:unid|uni|unidades|u)$/, "unidad", 1],
  [/^(?:rollos?)$/, "rollo", 1],
  [/^(?:par|pares)$/, "par", 1],
];

function unidadDe(texto) {
  const t = sinTildes(String(texto || "")).toLowerCase().replace(/\.$/, "");
  for (const [re, unidad, factor] of UNIDADES) if (re.test(t)) return { unidad, factor };
  return null;
}

function cantidadDe(texto) {
  const t = String(texto || "").trim();
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return aNumero(t);
}

// Herramientas cuyo "x 3Mts" es el largo de la herramienta, no lo que trae.
const ES_HERRAMIENTA_CON_MEDIDA = /\b(cinta metrica|metro madera|metro plegable)\b/;

/**
 * Lo que trae una unidad de compra, leído de la descripción.
 *
 *   "AGUARRAS x 4Lts"          → litro 4      (envase)
 *   "GUANTES DE NITRILO X 100unid" → unidad 100
 *   "Estopa Blanca Lustre- x Kg"   → kg 1, granel (se vende por kilo)
 *   "Pasta Fina Zeocar X 1kg"      → kg 1      (envase de un kilo)
 *   "Autopolish x 900cm3"          → litro 0,9
 *   "Fana 96 - Lata x 14 Kg."      → kg 14
 *   "Lija en rollo 0,12x45mts"     → metro 45
 *   sin nada                        → unidad 1
 *
 * `granel` distingue "x Kg" (precio por kilo, sin número) de "x 1kg" (un
 * envase de un kilo): en la base las dos quedan kg 1, pero para pasar el costo
 * a la unidad de entrega no es lo mismo un tarro que un kilo suelto.
 *
 * Con "x" se acepta cualquier unidad; sin "x" solo litros, mililitros, kilos y
 * metros ("POXIPOL 700ml", "Diluyente FANA 18Lts"), porque los gramos sueltos
 * suelen ser gramaje de tela ("MAMELUCO 60gr") y los mm/cm son medidas.
 */
export function interpretarContenido(descripcion) {
  const original = sinTildes(limpiarTexto(descripcion)).toLowerCase();
  const porDefecto = { unidad: "unidad", contenido: 1, granel: false };
  if (!original) return porDefecto;
  if (ES_HERRAMIENTA_CON_MEDIDA.test(original)) return porDefecto;

  // "UREICAxKG", "THREEBONDx100ml", "x100unid": separar la x pegada.
  const texto = original
    .replace(/x(?=\s*\d)/g, " x ")
    .replace(/(\d)\s*x/g, "$1 x ")
    .replace(/([a-z])x(?=(kg|kilo|lts?\b|litro|mts?\b|metro|par\b))/g, "$1 x ")
    .replace(/\s+/g, " ");

  // 1) "x 4Lts", "x 1/2 KG", "x 100unid", "x 30 rollos", "x Kg", "x PAR".
  //    La unidad tiene que empezar con letra: "x 1100" (film) no es "110 + 0".
  const conX = /(?:^|\s)x\s*(\d+(?:[.,]\d+)?|\d+\/\d+)?\s*([a-z][a-z0-9]*)\.?(?=\s|$|[-,.;)])/g;
  let m;
  while ((m = conX.exec(texto))) {
    const [, cant, uni] = m;
    const u = unidadDe(uni);
    if (!u) continue;
    if (cant == null || cant === "") {
      // "x Kg", "x Litro", "x Lts", "x PAR": precio por unidad de medida.
      return { unidad: u.unidad, contenido: 1, granel: u.unidad !== "par" && u.unidad !== "unidad" };
    }
    const n = cantidadDe(cant);
    if (n && n > 0) return { unidad: u.unidad, contenido: redondear(n * u.factor, 6), granel: false };
  }

  // "x 100" a secas al final: caja de 100 (guantes de látex). Otros números
  // sueltos ("Film x 1100", "Sellador x 310") son medidas, no cantidades.
  if (/(?:^|\s)x\s*100\s*$/.test(texto)) return { unidad: "unidad", contenido: 100, granel: false };

  // 2) Sin "x": "18Lts", "700ml", "4 Kgs.", "10Mt".
  const sinX = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(lts?|litros?|ml|kgs?|kilos?|mts?|metros?)\.?(?=\s|$|[-,.;)])/g;
  while ((m = sinX.exec(texto))) {
    const u = unidadDe(m[2]);
    const n = cantidadDe(m[1]);
    if (u && n && n > 0) return { unidad: u.unidad, contenido: redondear(n * u.factor, 6), granel: false };
  }

  return porDefecto;
}

// ── Unidades de entrega ↔ compra ────────────────────────────────────────────

// Lo que se cuenta por pieza: un rollo de cinta, un par de guantes, un pack.
const CONTABLES = new Set(["unidad", "rollo", "par", "pack", "juego", "caja", "kit", "lata", "balde", "bidon"]);
const MEDIDAS = new Set(["litro", "kg", "metro"]);

export function normalizarUnidad(u) {
  const s = sinTildes(limpiarTexto(u)).toLowerCase();
  if (!s) return "unidad";
  if (/^(u|un|und|unid|unidad|unidades|pza|pieza|piezas)$/.test(s)) return "unidad";
  if (/^(l|lt|lts|litro|litros)$/.test(s)) return "litro";
  if (/^(kg|kgs|kilo|kilos)$/.test(s)) return "kg";
  if (/^(m|mt|mts|metro|metros)$/.test(s)) return "metro";
  if (/^(par|pares)$/.test(s)) return "par";
  if (/^(rollo|rollos)$/.test(s)) return "rollo";
  return s;
}

/**
 * Unidades de entrega que trae una unidad de compra (caja x100 → 100).
 * Devuelve null cuando no se puede saber sin mirar el producto: mejor un
 * hueco que Compras completa que un costo inventado.
 *
 *   - Misma unidad: el contenido (litro ← "x 4Lts" = 4; unidad ← "x100unid" = 100).
 *   - Se entrega por pieza y se compra un envase ("x 4Kg", "x 900cm3",
 *     "x 50mts" de un rollo): 1, el envase entero es la pieza.
 *   - Se entrega por pieza y se compra a granel ("x Kg" de estopa): null.
 *   - Se entrega por par y se compra por unidad ("x 100" guantes): null.
 */
export function factorCompra({ unidadEntrega, unidadCompra, contenido, granel = false }) {
  const ue = normalizarUnidad(unidadEntrega);
  const uc = normalizarUnidad(unidadCompra);
  const c = Number(contenido) > 0 ? Number(contenido) : 1;
  if (ue === uc) return c;
  if (CONTABLES.has(ue) && uc === "unidad" && c === 1) return 1;
  if (CONTABLES.has(ue) && MEDIDAS.has(uc) && !granel) return 1;
  return null;
}

/** Costo por unidad de entrega, o null si falta el factor. */
export function costoUnitario(costoArs, factor) {
  const c = Number(costoArs);
  const f = Number(factor);
  if (!(c >= 0) || !(f > 0) || costoArs == null || factor == null) return null;
  return redondear(c / f, 4);
}

// ── Lectura de la hoja ──────────────────────────────────────────────────────

const ENCABEZADOS = {
  codigo: /^c[oó]d(igo)?\.?$/i,
  descripcion: /^descripci[oó]n|^detalle|^producto/i,
  medida: /medida|^unidad/i,
  precio: /precio/i,
  moneda: /moneda/i,
  condicion: /condici[oó]n|iva/i,
};

/** Fila y columnas del encabezado. Busca en las primeras 30 filas. */
export function encontrarEncabezado(filas = []) {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const fila = filas[i] || [];
    const cols = {};
    fila.forEach((celda, j) => {
      const t = limpiarTexto(celda);
      if (!t) return;
      for (const [clave, re] of Object.entries(ENCABEZADOS)) {
        if (cols[clave] == null && re.test(t)) {
          cols[clave] = j;
          break;
        }
      }
    });
    if (cols.codigo != null && cols.descripcion != null && cols.precio != null) {
      return { fila: i, columnas: cols };
    }
  }
  return null;
}

/** "Precios vigentes al 08/10/2026" → "2026-10-08". */
export function vigenciaDelTitulo(filas = [], hasta = 10) {
  for (let i = 0; i < Math.min(filas.length, hasta); i++) {
    for (const celda of filas[i] || []) {
      const m = limpiarTexto(celda).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Renglón crudo + dólar → renglón para la base.
 * costo_ars: ARS = precio; USD = precio × dólar (si no hay dólar, null).
 */
export function normalizarRenglon(crudo, { dolar = null } = {}) {
  const descripcion = limpiarTexto(crudo.descripcion);
  const moneda = normalizarMoneda(crudo.moneda);
  const precio = aNumero(crudo.precio);
  const d = Number(dolar) > 0 ? Number(dolar) : null;
  const cont = interpretarContenido(descripcion);
  let costo = null;
  if (precio != null && moneda === "ARS") costo = precio;
  else if (precio != null && moneda === "USD" && d) costo = precio * d;
  return {
    codigo: limpiarTexto(crudo.codigo),
    descripcion,
    medida: limpiarTexto(crudo.medida) || null,
    precio: redondear(precio, 6),
    moneda,
    condicion: normalizarCondicion(crudo.condicion),
    costo_ars: redondear(costo, 4),
    unidad_compra: cont.unidad,
    contenido: cont.contenido,
    granel: cont.granel,
  };
}

/**
 * La hoja entera → { renglones, notas, avisos, vigenteDesde, titulo }.
 *
 * Una fila con código pero sin precio ni moneda es una nota al pie (Rebollar
 * pone tres al final, en la columna Código). Un código repetido se queda con la
 * primera aparición y avisa: la base no admite dos renglones con el mismo
 * código en una lista.
 */
export function normalizarLista(filas = [], { dolar = null } = {}) {
  const enc = encontrarEncabezado(filas);
  if (!enc) {
    return { renglones: [], notas: [], avisos: ["No encontré el encabezado (Código, Descripción, Precio)."], vigenteDesde: null, titulo: null };
  }
  const { columnas: c } = enc;
  const renglones = [];
  const notas = [];
  const avisos = [];
  const vistos = new Map();
  const celda = (fila, clave) => (c[clave] == null ? null : fila[c[clave]]);

  for (let i = enc.fila + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const codigo = limpiarTexto(celda(fila, "codigo"));
    const descripcion = limpiarTexto(celda(fila, "descripcion"));
    const precioCrudo = celda(fila, "precio");
    const monedaCruda = celda(fila, "moneda");
    if (!codigo && !descripcion) continue;
    if (aNumero(precioCrudo) == null && !limpiarTexto(monedaCruda)) {
      notas.push(codigo || descripcion);
      continue;
    }
    if (!codigo) {
      avisos.push(`Fila ${i + 1}: "${descripcion}" no tiene código; no se carga.`);
      continue;
    }
    if (vistos.has(codigo)) {
      avisos.push(`Fila ${i + 1}: el código ${codigo} ya estaba en la fila ${vistos.get(codigo)}; queda el primero.`);
      continue;
    }
    vistos.set(codigo, i + 1);
    const r = normalizarRenglon({
      codigo,
      descripcion,
      medida: celda(fila, "medida"),
      precio: precioCrudo,
      moneda: monedaCruda,
      condicion: celda(fila, "condicion"),
    }, { dolar });
    if (r.moneda == null) avisos.push(`Fila ${i + 1} (${codigo}): moneda "${limpiarTexto(monedaCruda)}" desconocida.`);
    if (r.condicion == null && limpiarTexto(celda(fila, "condicion"))) {
      avisos.push(`Fila ${i + 1} (${codigo}): condición "${limpiarTexto(celda(fila, "condicion"))}" desconocida.`);
    }
    if (r.precio == null) avisos.push(`Fila ${i + 1} (${codigo}): sin precio.`);
    renglones.push({ ...r, fila: i + 1 });
  }

  const titulo = limpiarTexto((filas[0] || []).find((x) => limpiarTexto(x)));
  if (renglones.some((r) => r.moneda === "USD") && !(Number(dolar) > 0)) {
    avisos.push("Hay precios en dólares y falta el dólar: esos renglones quedan sin costo en pesos.");
  }
  return { renglones, notas, avisos, vigenteDesde: vigenciaDelTitulo(filas), titulo: titulo || null };
}

/** De todas las hojas del libro, la que tiene el encabezado de la lista. */
export function elegirHoja(nombres = [], filasDe) {
  const preferida = nombres.find((n) => /lista/i.test(n) && encontrarEncabezado(filasDe(n)));
  if (preferida) return preferida;
  return nombres.find((n) => encontrarEncabezado(filasDe(n))) ?? null;
}

// ── Comparación entre listas ────────────────────────────────────────────────

/**
 * Lista anterior vs nueva, por código. Compara `costo_ars` (pesos sin IVA por
 * unidad de compra) porque es lo único comparable entre una lista en pesos y
 * otra en dólares; si falta, compara el precio cuando la moneda es la misma.
 *
 * estado: 'subio' | 'bajo' | 'igual' | 'nuevo' | 'discontinuado'.
 * pct: cambio porcentual (null en nuevos y discontinuados).
 */
export function compararListas(anterior = [], nueva = []) {
  const porCodigoAnt = new Map(anterior.map((r) => [r.codigo, r]));
  const porCodigoNue = new Map(nueva.map((r) => [r.codigo, r]));
  const filas = [];
  for (const n of nueva) {
    const a = porCodigoAnt.get(n.codigo);
    if (!a) {
      filas.push({ codigo: n.codigo, descripcion: n.descripcion, medida: n.medida, estado: "nuevo", antes: null, ahora: valorComparable(n), pct: null, anterior: null, nuevo: n });
      continue;
    }
    const va = valorComparable(a, n);
    const vn = valorComparable(n, a);
    let estado = "igual";
    let pct = null;
    if (va != null && vn != null) {
      pct = va > 0 ? redondear(((vn - va) / va) * 100, 2) : null;
      // Medio por mil de tolerancia: el redondeo del proveedor no es un aumento.
      if (va > 0 && Math.abs(vn - va) / va > 0.0005) estado = vn > va ? "subio" : "bajo";
      else pct = 0;
    }
    filas.push({ codigo: n.codigo, descripcion: n.descripcion, medida: n.medida, estado, antes: va, ahora: vn, pct, anterior: a, nuevo: n });
  }
  for (const a of anterior) {
    if (porCodigoNue.has(a.codigo)) continue;
    filas.push({ codigo: a.codigo, descripcion: a.descripcion, medida: a.medida, estado: "discontinuado", antes: valorComparable(a), ahora: null, pct: null, anterior: a, nuevo: null });
  }
  return filas;
}

function valorComparable(r, otro = null) {
  if (r?.costo_ars != null && (otro == null || otro.costo_ars != null)) return Number(r.costo_ars);
  if (r?.precio != null && (otro == null || otro.moneda === r.moneda)) return Number(r.precio);
  return r?.costo_ars != null ? Number(r.costo_ars) : null;
}
