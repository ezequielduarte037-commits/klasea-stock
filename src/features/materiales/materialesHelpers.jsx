/* eslint-disable react-refresh/only-export-components */
import { C } from "@/theme";
import {
  normalizeMaterialLinks,
  normalizeUnidadMedida,
  precioVigente,
  variantePrecioMax,
} from "./api";
import { fmtMoney } from "./format";
import { materialBarcodeText } from "./materialBarcodes";
import { MODELOS, norm, toBomMap } from "./materialesParser";

// Un material puede estar en varias áreas (campo m.areas); si todavía no hay
// M2M cargada, cae a su categoría principal.
function materialEnArea(m, catId) {
  return (m.areas ?? [m.categoria_id]).includes(catId);
}

// Jerarqu?a de sectores (padre ? subsectores)
const esRaiz = (c) => !c.parent_id;
const hijosDe = (categorias, parentId) => categorias.filter((c) => c.parent_id === parentId);

// Ids "en juego" al pararse en un sector: él mismo + sus subsectores (si es padre).
function idsScope(categorias, catId) {
  const hijos = hijosDe(categorias, catId).map((c) => c.id);
  return new Set([catId, ...hijos]);
}
function materialEnScope(m, scopeIds) {
  return (m.areas ?? [m.categoria_id]).some((a) => scopeIds.has(a));
}

// Subdivisiones náuticas sugeridas. Se matchean por nombre normalizado del sector
// padre (si el nombre contiene la clave). El usuario igual puede crear/borrar a mano.
const SUBDIVISIONES_SUGERIDAS = {
  mecanic: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  propuls: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  motor: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  electric: ["Baterías", "Cargadores/Inversores", "Tablero y disyuntores", "Iluminación", "Cableado", "Alternadores", "Solar"],
  electron: ["GPS/Plotter", "Radar", "Sonda", "Piloto automático", "VHF/Radio", "Instrumental"],
  naveg: ["GPS/Plotter", "Radar", "Sonda", "Piloto automático", "VHF/Radio", "Instrumental"],
  plomer: ["Agua dulce", "Aguas grises/negras", "Achique/Sentina", "Inodoros"],
  agua: ["Agua dulce", "Aguas grises/negras", "Achique/Sentina", "Inodoros"],
  hidraul: ["Dirección", "Flaps/Trim", "Pasarela/Plataforma"],
  cubierta: ["Malacate/Ancla", "Herrajes y cornamusas", "Cabos/Drizas", "Defensas"],
  fondeo: ["Malacate/Ancla", "Herrajes y cornamusas", "Cabos/Drizas", "Defensas"],
  casco: ["Obra viva", "Pintura/antifouling", "Pasacascos", "Ánodos"],
  estructura: ["Obra viva", "Pintura/antifouling", "Pasacascos", "Ánodos"],
  confort: ["A/C", "Calefacción", "Heladera", "Cocina"],
  clima: ["A/C", "Calefacción", "Heladera", "Cocina"],
  interior: ["Muebles", "Tapizados", "Pisos", "Grifería"],
  carpinter: ["Muebles", "Tapizados", "Pisos", "Grifería"],
  segurid: ["Balsa", "Chalecos", "Extintores", "Luces de navegación"],
};
function subdivisionesSugeridas(nombre) {
  const n = norm(nombre || "");
  for (const [clave, subs] of Object.entries(SUBDIVISIONES_SUGERIDAS)) {
    if (n.includes(clave)) return subs;
  }
  return [];
}

// BÃºsqueda libre para catÃ¡logo, obras y matrices. Los hashtags son etiquetas
// de texto: #agua y agua se comportan igual y se pueden combinar con palabras
// que estÃ©n en otro campo (ej. "bomba agua" = nombre + observaciÃ³n).
function searchText(...values) {
  const flatten = (value) => {
    if (Array.isArray(value)) return value.map(flatten).join(" ");
    if (value && typeof value === "object") return Object.values(value).map(flatten).join(" ");
    return String(value ?? "");
  };
  return norm(values.map(flatten).join(" "))
    .replace(/[#@]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTerms(value) {
  return searchText(value).split(" ").filter(Boolean);
}

function matchesFlexibleSearch(query, ...fields) {
  const terms = searchTerms(query);
  if (!terms.length) return true;

  const haystack = searchText(...fields);
  if (!haystack) return false;
  const words = haystack.split(" ");
  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    // Permite una bÃºsqueda por comienzo de palabra sin volverla demasiado laxa:
    // "presuriz" encuentra "presurizadora", pero "a" no matchea todo.
    if (term.length < 4) return false;
    const stem = term.slice(0, Math.max(4, term.length - 2));
    return words.some((word) => word.startsWith(stem));
  });
}

function materialSearchFields(material = {}) {
  // Algunas filas históricas/adicionales todavía no tienen material de catálogo.
  // El buscador debe poder seguir funcionando con esos datos incompletos.
  const source = material || {};
  return [
    source.descripcion,
    source.codigo,
    source.alias,
    source.notas,
    source.proveedor,
    source.variantes,
    source.variantes_precios,
    materialBarcodeText(source),
    (source.links || []).map((link) => `${link?.label || ""} ${link?.nota || ""}`),
  ];
}

// Matcheo difuso contra la lista matriz (mismo criterio que Comprobantes)
function scoreMaterial(material, query) {
  const q = searchText(query);
  if (!q) return 0;
  const codeText = norm(`${material.codigo ?? ""} ${materialBarcodeText(material)}`);
  if (codeText && codeText.includes(q)) return 95;
  const d = searchText(...materialSearchFields(material));
  if (d === q) return 100;
  if (d.includes(q) || q.includes(d)) return 70;
  const words = searchTerms(q).filter((w) => w.length > 2);
  return words.reduce((acc, word) => acc + (d.includes(word) ? 6 : 0), 0);
}
function topMateriales(materiales, query) {
  return [...materiales]
    .map((m) => ({ material: m, score: scoreMaterial(m, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.material.descripcion || "").localeCompare(b.material.descripcion || "", "es"))
    .slice(0, 12)
    .map((r) => r.material);
}
function bestMatchId(materiales, desc) {
  const tops = topMateriales(materiales.filter((m) => m.activo !== false), desc);
  return tops.length && scoreMaterial(tops[0], desc) >= 70 ? tops[0].id : "";
}
function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function qtyText(value, unidad = "") {
  const n = toNum(value);
  const qty = n == null ? value : Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return `${qty || "—"}${unidad ? ` ${unidad}` : ""}`;
}

function stockLibreKeyForRow(row) {
  const materialId = row?.materialId || row?.material_id || row?.material?.id || "";
  if (materialId) return `material:${materialId}`;
  const textKey = norm(`${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`);
  return textKey ? `text:${textKey}` : "";
}

function materialQty(material, linea) {
  return toNum(toBomMap(material)[linea]) || 0;
}

function priceInfo(material) {
  const p = precioVigente(material);
  let amount = p?.precio_unitario != null && p.precio_unitario !== "" ? Number(p.precio_unitario) : null;
  let moneda = p?.moneda === "USD" ? "USD" : "ARS";
  // Si el material tiene precios por variante, el costo se estima con la MÁS CARA
  // (peor caso) hasta que se defina qué variante va.
  const maxVar = variantePrecioMax(material);
  const priced = Object.keys(material?.variantes_precios || {}).length;
  let esMax = false;
  if (maxVar) {
    amount = maxVar.amount;
    moneda = maxVar.moneda;
    esMax = priced > 1;
  }
  const ok = Number.isFinite(amount) && amount > 0;
  return {
    amount: ok ? amount : null,
    moneda,
    text: ok ? `${fmtMoney(amount, moneda)}${esMax ? " máx" : ""}` : "Sin precio",
    proveedor: p?.proveedor || material.proveedor || "",
    esMaxVariante: esMax,
  };
}

function mentionsLineaEje(value) {
  const n = norm(value || "");
  return n.includes("linea eje") || n.includes("linea de eje") || n.includes("eje") || n.includes("helice");
}

function materialBucket(material, opciones = []) {
  const condicion = opciones.find((op) => (op.valores ?? []).some((v) => v.id === material.condicion_valor_id));
  const valor = condicion?.valores?.find((v) => v.id === material.condicion_valor_id)?.valor || "";
  if (mentionsLineaEje(`${condicion?.nombre || ""} ${valor} ${material.descripcion || ""}`)) {
    return { key: "linea_eje", label: "Línea eje", color: C.violet };
  }
  if (material.condicion_valor_id) return { key: "condicionante", label: valor || "Condicionante", color: C.amber };
  return { key: "base", label: "Base", color: C.green };
}

function reviewReasonForText(value) {
  const text = String(value || "");
  if (!text.trim()) return "";
  if (/\?|\u00bf/.test(text)) return "Tiene signo de pregunta";
  if (/[\uFFFD\u00C3\u00C2\u00E2]/.test(text)) return "Caracteres raros";
  const n = norm(text);
  if (/\b(xxx|tbd|s\/d|sin definir|por definir|a definir|revisar)\b/.test(n)) return "Dato a definir";
  return "";
}

function reviewInfoForMaterial(material) {
  const fields = [material?.descripcion, material?.codigo, material?.proveedor, material?.unidad_medida, material?.notas];
  for (const field of fields) {
    const reason = reviewReasonForText(field);
    if (reason) return { flag: true, reason };
  }
  return { flag: false, reason: "" };
}

function ReviewBadge({ reason }) {
  return (
    <span
      title={reason || "Revisar"}
      style={{
        fontSize: 10,
        fontWeight: 900,
        color: C.amber,
        background: C.amberL,
        border: `1px solid ${C.amberB}`,
        borderRadius: 999,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      Revisar
    </span>
  );
}

const DUPLICATE_STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "uno", "y", "o", "con", "sin",
  "para", "por", "p", "x", "tipo", "modelo", "marca", "color", "unidad", "unidades",
  "kg", "kilo", "kilos", "lts", "lt", "litro", "litros", "mtrs", "mts", "metro", "metros",
  "mm", "cm", "m2", "m3", "u", "unid", "unids", "unidad", "medida", "base", "serie",
  "aprox", "aproximado", "std", "standard", "estandar", "sistema", "sist",
]);

const DUPLICATE_SYNONYMS = new Map([
  ["aluminio", "alum"], ["alumin", "alum"], ["alum", "alum"],
  ["inoxidable", "inox"], ["inox", "inox"],
  ["electrico", "elec"], ["electrica", "elec"], ["electricidad", "elec"],
  ["leds", "led"], ["televisor", "tv"], ["televisores", "tv"],
  ["metros", "m"], ["metro", "m"], ["mts", "m"], ["mtrs", "m"],
  ["unidades", "unidad"], ["unids", "unidad"], ["unid", "unidad"],
  ["blanca", "blanco"], ["blancos", "blanco"], ["negras", "negro"], ["negros", "negro"],
  ["calida", "calido"], ["calidos", "calido"], ["fria", "frio"], ["frias", "frio"],
]);

const DUPLICATE_CODE_IGNORE = new Set(["K37", "K52", "K55", "ARS", "USD"]);

const KNOWN_MATERIAL_BRANDS = [
  "LG", "Samsung", "Aquasignal", "Aqua Signal", "Jabsco", "Whale", "Rule", "Vetus",
  "Quick", "Lewmar", "Osculati", "Garmin", "Raymarine", "Simrad", "B&G", "Victron",
  "Mastervolt", "Dometic", "Isotherm", "Webasto", "VDO", "Wema", "Fusion", "Blue Sea",
  "Marinco", "Attwood", "Plastimo", "Ronstan", "Harken", "Sika", "Sikaflex", "3M",
  "Wurth", "Würth", "Julon", "Volvo", "Yanmar", "Mercury", "Suzuki", "Yamaha", "Honda",
  "Samsung/LG", "LG/Samsung",
];

function normalizeVariantList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n;]+/);
  const seen = new Set();
  return raw
    .flatMap((item) => String(item || "").split(/\s*\/\s*/))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = norm(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const STANDARD_UNITS = ["unidad", "metro", "cm", "mm", "kg", "g", "litro", "pies", "caja", "rollo", "par", "juego", "placa", "hoja", "barra", "bolsa", "lata", "tubo", "m2", "m3"];

function buildUnidadOptions(materiales = []) {
  const canonical = new Set(STANDARD_UNITS);
  const extras = new Set();
  for (const material of materiales ?? []) {
    const unit = normalizeUnidadMedida(material?.unidad_medida, "");
    if (!unit) continue;
    if (!canonical.has(unit)) extras.add(unit);
  }
  return [...STANDARD_UNITS, ...[...extras].sort((a, b) => a.localeCompare(b, "es"))];
}

function providerBrandCandidates(proveedores = []) {
  return (proveedores || [])
    .map((p) => p?.nombre || p)
    .filter(Boolean)
    .map(String)
    .filter((name) => {
      const n = norm(name);
      return n.length >= 3 && !/(sa|srl|sh|proveedor|ferreteria|electricidad|sanitarios|herrajes|varios|sin proveedor)/i.test(n);
    });
}

function brandCandidates(proveedores = []) {
  return normalizeVariantList([...KNOWN_MATERIAL_BRANDS, ...providerBrandCandidates(proveedores)]);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBrandsFromTitle(value, proveedores = []) {
  const text = String(value || "");
  if (!text.trim()) return [];
  const found = [];
  for (const brand of brandCandidates(proveedores)) {
    const parts = normalizeVariantList(brand);
    for (const part of parts) {
      if (!part) continue;
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(part)}(?=$|[^\\p{L}\\p{N}])`, "iu");
      if (pattern.test(text)) found.push(part);
    }
  }
  return normalizeVariantList(found);
}

function cleanTitleBrands(value, variants = [], proveedores = []) {
  let text = String(value || "");
  const all = normalizeVariantList([...variants, ...extractBrandsFromTitle(text, proveedores)]);
  for (const brand of all.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(brand)}(?=$|[^\\p{L}\\p{N}])`, "giu");
    text = text.replace(pattern, (match, prefix) => prefix && /[\p{L}\p{N}]/u.test(prefix) ? match : (prefix || " "));
  }
  return text
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function materialVariants(material) {
  return normalizeVariantList(material?.variantes);
}

function materialVariantImageUrl(material, variant = "") {
  const selected = String(variant || "").trim();
  if (!selected) return "";
  const prices = material?.variantes_precios;
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) return "";
  const match = Object.entries(prices).find(([name]) => norm(name) === norm(selected));
  return String(match?.[1]?.imagen_url || match?.[1]?.imagenUrl || "").trim();
}

function prepareMaterialDraftForSave(material, proveedores = [], extraVariants = null, variantesPrecios = null) {
  void proveedores;
  // Cuando el editor entrega una lista, esa lista es la fuente definitiva. Mezclarla
  // con las variantes originales revivia las que el usuario acababa de quitar.
  const variantes = normalizeVariantList(extraVariants == null ? materialVariants(material) : extraVariants);
  const descripcion = String(material?.descripcion || "").trim();
  return {
    ...material,
    descripcion,
    alias: String(material?.alias || "").trim() || null,
    links: normalizeMaterialLinks(material?.links),
    variantes,
    // undefined → el guardado omite el campo (no pisa lo que hay en la base).
    variantes_precios: variantesPrecios ?? material?.variantes_precios,
  };
}

function duplicateComparableText(value) {
  return String(value || "")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/\bc\s*\//gi, " con ")
    .replace(/\bs\s*\//gi, " sin ")
    .replace(/\b(\d+)\s*(mts?|mtrs?|metros?)\b/gi, "$1 m")
    .replace(/\b(\d+)\s*(unid|unids|unidad|unidades|u)\b/gi, "$1 unidad")
    .replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:u|un|unid|unidad|unidades|mts?|metros?|m2|m²|kg|lts?|litros?)\s*\)/gi, " ");
}

function canonicalDuplicateToken(token) {
  let t = String(token || "").trim();
  if (!t) return "";
  if (/^\d+(?:[.,]\d+)?m$/.test(t)) return t.replace(",", ".");
  if (/^\d+(?:[.,]\d+)?kg$/.test(t)) return t.replace(",", ".");
  if (DUPLICATE_SYNONYMS.has(t)) return DUPLICATE_SYNONYMS.get(t);
  if (t.length > 5 && t.endsWith("es")) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("s")) t = t.slice(0, -1);
  return DUPLICATE_SYNONYMS.get(t) || t;
}

function codeCandidatesFromText(value) {
  const raw = String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[._]/g, " ");
  const out = new Set();
  const patterns = [
    /\b[A-Z]{1,7}[-/]?\d{2,}[A-Z0-9/-]*\b/g,
    /\b\d{2,}[A-Z]{1,7}[A-Z0-9/-]*\b/g,
    /\b[A-Z]{2,}\d[A-Z0-9/-]*\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const code = match[0].replace(/[^A-Z0-9]+/g, "");
      const looksLikeMeasure = /^\d+(K|V|W|KW|MM|CM|M|KG|G|L|LT|LTS|M2|M3|LED|AH|A|HP|BTU)$/.test(code);
      const looksLikeBoatModel = /^K\d{2,3}$/.test(code);
      if (code.length >= 3 && !DUPLICATE_CODE_IGNORE.has(code) && !/^\d+$/.test(code) && !looksLikeMeasure && !looksLikeBoatModel) out.add(code);
    }
  }
  return out;
}

function intersects(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function diceCoefficient(a, b) {
  const left = String(a || "").replace(/\s+/g, "");
  const right = String(b || "").replace(/\s+/g, "");
  if (left === right) return left ? 1 : 0;
  if (left.length < 3 || right.length < 3) return 0;
  const grams = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = grams.get(gram) || 0;
    if (count > 0) {
      shared += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * shared) / ((left.length - 1) + (right.length - 1));
}

function canonicalMeasure(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”″]/g, '"')
    .replace(/pulg(?:adas?)?/g, '"')
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .replace(/(\d+)\s+(\d+\/\d+)/g, "$1+$2")
    .replace(/\s*(x)\s*/g, "x")
    .replace(/\s*"\s*/g, "in")
    .replace(/\s+/g, "")
    .replace(/mts?|metros?/g, "m")
    .replace(/lts?|litros?/g, "l")
    .replace(/pulg/g, "in");
}

// eslint-disable-next-line no-unused-vars -- reservado para heuristicas de duplicados mas permisivas.
function measurementSignature(value) {
  const text = norm(duplicateComparableText(value))
    .replace(/[“”″]/g, '"')
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4");
  const measures = new Set();
  const patterns = [
    /\b\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m|mts?|metros?|")?\b/g,
    /\b(?:\d+\s+)?\d+\/\d+\s*(?:"|pulg(?:adas?)?)?/g,
    /\b\d+(?:[.,]\d+)?\s*(?:"|pulg(?:adas?)?|mm|cm|mts?|metros?|m2|m²|m3|kg|g|lts?|litros?|v|w|kw|amp|a|ah|n|lb|hp|btu|gph)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = canonicalMeasure(match[0]);
      if (value) measures.add(value);
    }
  }
  return measures;
}

function hasConflictingMeasures(a, b) {
  return a.measurements.size > 0 && b.measurements.size > 0 && !sameSet(a.measurements, b.measurements);
}

function strictMeasurementSignature(value) {
  const text = duplicateComparableText(value)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”″]/g, '"')
    .replace(/[¼½¾]/g, (m) => ({ "¼": " 1/4", "½": " 1/2", "¾": " 3/4" }[m] || m));
  const measures = new Set();
  const patterns = [
    /\b\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m|mts?|metros?|")?\b/g,
    /\b(?:\d+\s+)?\d+\/\d+\s*(?:"|pulg(?:adas?)?)?/g,
    /\b\d+(?:[.,]\d+)?\s*"/g,
    /\b\d+(?:[.,]\d+)?\s*(?:"|pulg(?:adas?)?|mm|cm|mts?|metros?|m2|m²|m3|kg|g|lts?|litros?|v|w|kw|amp|a|ah|n|lb|hp|btu|gph)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = canonicalMeasure(match[0]);
      if (value) measures.add(value);
    }
  }
  return measures;
}

function duplicateTokens(value) {
  return norm(duplicateComparableText(value))
    .replace(/(\d+)\s+(v|w|mm|cm|kg|lt|lts|m2|m3)\b/g, "$1$2")
    .replace(/(\d+)\s+m\b/g, "$1m")
    .replace(/(\d+)\s+unidad\b/g, "$1unidad")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(canonicalDuplicateToken)
    .filter((token) => token.length > 1 && !DUPLICATE_STOPWORDS.has(token));
}

function duplicateMeta(material) {
  const tokens = duplicateTokens(material?.descripcion);
  const code = norm(material?.codigo || "").replace(/[^a-z0-9]+/g, "");
  const codeCandidates = new Set([
    ...codeCandidatesFromText(material?.codigo),
    ...codeCandidatesFromText(material?.descripcion),
  ]);
  const measurements = strictMeasurementSignature(material?.descripcion);
  return {
    material,
    code,
    codeCandidates,
    text: tokens.join(" "),
    tokenSet: new Set(tokens),
    measurements,
    categories: new Set([material?.categoria_id, ...(material?.areas || [])].filter(Boolean)),
    numbers: new Set(tokens.filter((token) => /\d/.test(token) && !/^\d+(u|unid|unidad|unidades)$/.test(token))),
  };
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function duplicateScore(a, b) {
  const codeMatch = (a.code && b.code && a.code === b.code) || intersects(a.codeCandidates, b.codeCandidates);
  if (codeMatch) return { score: 99, reason: "Mismo codigo detectado" };
  if (hasConflictingMeasures(a, b)) return { score: 0, reason: "Cambia medida" };
  if (a.code && b.code && a.code === b.code) return { score: 98, reason: "Mismo codigo" };
  if (!a.text || !b.text) return { score: 0, reason: "" };
  if (a.text === b.text) return { score: 97, reason: "Misma descripcion normalizada" };

  const shared = [...a.tokenSet].filter((token) => b.tokenSet.has(token)).length;
  const charScore = diceCoefficient(a.text, b.text);
  if (shared < 2 && charScore < 0.82) return { score: 0, reason: "" };

  const min = Math.min(a.tokenSet.size, b.tokenSet.size) || 1;
  const union = new Set([...a.tokenSet, ...b.tokenSet]).size || 1;
  const jaccard = shared / union;
  const containment = shared / min;
  const numbersMatter = a.numbers.size > 0 && b.numbers.size > 0;
  const numberMatch = !numbersMatter || sameSet(a.numbers, b.numbers);
  if (numbersMatter && !numberMatch) return { score: Math.round(jaccard * 58), reason: "Parecido, pero cambia medida/codigo" };

  const includes = a.text.includes(b.text) || b.text.includes(a.text);
  let score = jaccard * 54 + containment * 24 + charScore * 18;
  if (includes) score += 10;
  if (numberMatch && numbersMatter) score += 7;
  if (a.measurements.size > 0 && sameSet(a.measurements, b.measurements)) score += 7;
  if (intersects(a.categories, b.categories)) score += 4;
  else score -= 3;
  if ((a.measurements.size > 0) !== (b.measurements.size > 0)) score -= 12;
  const rounded = Math.max(0, Math.min(99, Math.round(score)));
  return {
    score: rounded,
    reason: rounded >= 92 ? "Descripcion casi igual" : rounded >= 82 ? "Misma familia / medidas" : "Parecido para revisar",
  };
}

function cleanupReasonForMaterial(material) {
  const desc = String(material?.descripcion || "").trim();
  if (!desc) return "Sin descripcion";
  const n = norm(desc);
  if (reviewReasonForText(desc)) return reviewReasonForText(desc);
  if (/^(sin descripcion|descripcion|material|item|varios|vario|prueba|test|null|undefined|nan|xxx|tbd|a definir|por definir|revisar)$/i.test(n)) return "Descripcion generica";
  if (n.length <= 2) return "Descripcion demasiado corta";
  if (/^[0-9\s.,;:_-]+$/.test(desc)) return "Solo numeros";
  if (/^[^\p{L}\p{N}]+$/u.test(desc)) return "Solo simbolos";
  if (!material?.codigo && !material?.proveedor && !material?.unidad_medida && !precioVigente(material)?.precio_unitario && (material?.modelos || []).length === 0 && n.split(" ").length <= 2) {
    return "Muy poco dato para catalogo";
  }
  return "";
}

function findCleanupCandidates(materiales = [], categorias = [], selectedId = "") {
  const scope = selectedId ? idsScope(categorias, selectedId) : null;
  return materiales
    .filter(materialActivo)
    .filter((m) => !scope || materialEnScope(m, scope))
    .map((material) => ({ material, reason: cleanupReasonForMaterial(material) }))
    .filter((row) => row.reason)
    .sort((a, b) => a.reason.localeCompare(b.reason, "es") || String(a.material.descripcion || "").localeCompare(String(b.material.descripcion || ""), "es"));
}

function materialCompletenessScore(material) {
  const precio = priceInfo(material);
  return (material.revisado ? 25 : 0)
    + (precio.amount ? 24 : 0)
    + ((material.modelos?.length || 0) * 6)
    + (material.codigo ? 8 : 0)
    + (material.proveedor || material.proveedor_id ? 6 : 0)
    + (material.imagen_url ? 5 : 0)
    + (material.notas ? 3 : 0);
}

function findDuplicateGroups(materiales = [], categorias = [], selectedId = "") {
  const scope = selectedId ? idsScope(categorias, selectedId) : null;
  const list = materiales
    .filter(materialActivo)
    .filter((m) => !scope || materialEnScope(m, scope));
  const metas = list.map(duplicateMeta);
  const parent = metas.map((_, idx) => idx);
  const bestPairs = new Map();

  const find = (idx) => {
    while (parent[idx] !== idx) {
      parent[idx] = parent[parent[idx]];
      idx = parent[idx];
    }
    return idx;
  };
  const unite = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  // Las MEDIDAS son identidad: dos ítems solo pueden ser duplicados si tienen
  // los mismos números (ej. "Codo 1/2" ≠ "Codo 1/4", "Tornillo 6mm" ≠ "8mm").
  const numsOf = (m) => (String(m?.descripcion || "").match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join(",");
  for (let i = 0; i < metas.length; i += 1) {
    for (let j = i + 1; j < metas.length; j += 1) {
      if (numsOf(metas[i].material) !== numsOf(metas[j].material)) continue;
      const result = duplicateScore(metas[i], metas[j]);
      if (result.score >= 80) {
        unite(i, j);
        bestPairs.set(`${i}:${j}`, result);
      }
    }
  }

  const grouped = new Map();
  metas.forEach((meta, idx) => {
    const key = find(idx);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...meta, idx });
  });

  return [...grouped.values()]
    .filter((items) => items.length > 1)
    .map((items) => {
      let best = { score: 0, reason: "Muy parecido" };
      for (let a = 0; a < items.length; a += 1) {
        for (let b = a + 1; b < items.length; b += 1) {
          const direct = bestPairs.get(`${items[a].idx}:${items[b].idx}`) || duplicateScore(items[a], items[b]);
          if (direct.score > best.score) best = direct;
        }
      }
      const materials = items.map((item) => item.material)
        .sort((a, b) => materialCompletenessScore(b) - materialCompletenessScore(a));
      return {
        id: materials.map((m) => m.id).join(":"),
        score: best.score,
        reason: best.reason,
        keeperId: materials[0]?.id,
        materials,
      };
    })
    .sort((a, b) => b.score - a.score || b.materials.length - a.materials.length);
}

function mergeBomMaps(materials = []) {
  const out = {};
  for (const modelo of MODELOS) {
    const values = materials
      .map((material) => toNum(toBomMap(material)[modelo]))
      .filter((value) => value != null && value > 0);
    out[modelo] = values.length ? Math.max(...values) : "";
  }
  return out;
}

function firstFilled(...values) {
  return values.find((value) => value != null && String(value).trim() !== "") ?? "";
}

function uniqueLines(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = norm(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeProviderExtras(keeper, duplicates = []) {
  const seen = new Set([keeper?.proveedor_id].filter(Boolean));
  const out = [];
  const push = (providerId, precio = "", moneda = "") => {
    if (!providerId || seen.has(providerId)) return;
    seen.add(providerId);
    out.push({ proveedor_id: providerId, precio: precio ?? "", moneda: moneda || "" });
  };
  for (const item of keeper?.proveedores_lista || []) push(item.proveedor_id, item.precio, item.moneda);
  for (const material of duplicates) {
    const precio = priceInfo(material);
    push(material.proveedor_id, precio.amount ?? "", precio.moneda || material.moneda || "");
    for (const item of material.proveedores_lista || []) push(item.proveedor_id, item.precio, item.moneda);
  }
  return out;
}

function mergedDuplicatePayload(group, { keeperId = null, duplicateIds = null, proveedores = [] } = {}) {
  const keeper = group.materials.find((material) => material.id === (keeperId || group.keeperId)) || group.materials[0];
  const duplicateSet = duplicateIds ? new Set(duplicateIds) : null;
  const duplicates = group.materials.filter((material) => material.id !== keeper.id && (!duplicateSet || duplicateSet.has(material.id)));
  const all = [keeper, ...duplicates];
  const keeperPrice = priceInfo(keeper);
  const priceSource = keeperPrice.amount ? keeper : all.find((material) => priceInfo(material).amount) || keeper;
  const price = priceInfo(priceSource);
  const variantes = normalizeVariantList([
    ...all.flatMap((material) => materialVariants(material)),
    ...all.flatMap((material) => extractBrandsFromTitle(material.descripcion, proveedores)),
  ]);
  const notas = uniqueLines([
    keeper.notas,
    ...duplicates.map((material) => `Fusionado desde: ${material.descripcion}${material.codigo ? ` (${material.codigo})` : ""}`),
    ...duplicates.map((material) => material.notas),
  ]).join("\n");
  const areas = [...new Set(all.flatMap((material) => material.areas?.length ? material.areas : [material.categoria_id]).filter(Boolean))];

  return {
    keeper,
    duplicates,
    material: {
      ...keeper,
      codigo: firstFilled(keeper.codigo, ...duplicates.map((m) => m.codigo)) || null,
      proveedor_id: firstFilled(keeper.proveedor_id, ...duplicates.map((m) => m.proveedor_id)) || null,
      proveedor: firstFilled(keeper.proveedor, ...duplicates.map((m) => m.proveedor)) || null,
      unidad_medida: firstFilled(keeper.unidad_medida, ...duplicates.map((m) => m.unidad_medida)) || null,
      precio_unitario: price.amount ?? keeper.precio_unitario ?? null,
      moneda: price.moneda || keeper.moneda || null,
      imagen_url: firstFilled(keeper.imagen_url, ...duplicates.map((m) => m.imagen_url)) || null,
      descripcion: cleanTitleBrands(keeper.descripcion, variantes, proveedores) || keeper.descripcion,
      variantes,
      notas: notas || null,
      revisado: true,
      categoria_id: keeper.categoria_id || areas[0] || null,
      activo: true,
    },
    cantidades: mergeBomMaps(all),
    areas,
    proveedoresExtra: mergeProviderExtras(keeper, duplicates),
  };
}

function materialReviewLine(material, categorias) {
  const precio = priceInfo(material);
  const bom = toBomMap(material);
  const cantidades = MODELOS
    .map((modelo) => toNum(bom[modelo]) ? `K${modelo}:${toNum(bom[modelo])}` : "")
    .filter(Boolean)
    .join(", ");
  return [
    `id=${material.id}`,
    `desc="${material.descripcion || ""}"`,
    material.codigo ? `codigo="${material.codigo}"` : "",
    `sector="${categoriaNombre(categorias, material.categoria_id)}"`,
    material.proveedor ? `prov="${material.proveedor}"` : "",
    material.unidad_medida ? `um="${material.unidad_medida}"` : "",
    materialVariants(material).length ? `variantes="${materialVariants(material).join(" / ")}"` : "",
    precio.amount ? `precio=${precio.text}` : "",
    cantidades ? `cant=${cantidades}` : "",
  ].filter(Boolean).join(" | ");
}

function buildAiReviewText(groups = [], cleanup = [], categorias = []) {
  const lines = [
    "Revisar catálogo de materiales. Decime qué grupos son duplicados reales, cuál conservar, qué datos conviene fusionar y qué items parecen basura para archivar.",
    "",
    "POSIBLES DUPLICADOS",
  ];
  groups.slice(0, 80).forEach((group, index) => {
    lines.push("");
    lines.push(`#${index + 1} - ${group.score}% - ${group.reason}`);
    group.materials.forEach((material) => lines.push(`- ${materialReviewLine(material, categorias)}`));
  });
  if (cleanup.length) {
    lines.push("");
    lines.push("COSAS RARAS / POSIBLE BASURA");
    cleanup.slice(0, 80).forEach((row, index) => {
      lines.push(`${index + 1}. ${row.reason} - ${materialReviewLine(row.material, categorias)}`);
    });
  }
  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

function buildOrdenTexto({ obra, lineaNombre, rows, groupBy = "proveedor" }) {
  const grupos = new Map();
  rows.forEach((row) => {
    const key = groupBy === "rubro" ? row.rubro : groupBy === "tipo" ? row.tipo : row.proveedor;
    const label = key || "Sin clasificar";
    if (!grupos.has(label)) grupos.set(label, []);
    grupos.get(label).push(row);
  });
  const title = obra?.codigo ? `Orden de compra - ${obra.codigo}` : `Orden de compra - ${lineaNombre || "lista matriz"}`;
  const lines = [title, ""];
  for (const [label, items] of grupos) {
    lines.push(label.toUpperCase());
    items.forEach((item) => {
      const codigo = item.codigo ? ` (${item.codigo})` : "";
      const obs = item.obs ? ` - ${item.obs}` : "";
      lines.push(`- ${qtyText(item.cantidad, item.unidad)} - ${item.descripcion}${codigo}${obs}`);
    });
    lines.push("");
  }
  return lines.join("\n").trim();
}

// Recorta una descripción a las primeras palabras. Cortar por caracteres partía
// medidas al medio ("Cable normalizado 1x 1,5 mm2…") y se comía justo el dato que
// distingue un ítem de otro; por palabras queda "Cable normalizado", que se lee.
function resumenDescripcion(texto = "", maxPalabras = 2, maxChars = 46) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const palabras = limpio.split(" ");
  const corto = palabras.length <= maxPalabras ? limpio : palabras.slice(0, maxPalabras).join(" ");
  return corto.length > maxChars ? `${corto.slice(0, maxChars).trim()}…` : corto;
}

// Título sugerido para un pedido a compras. "Pedido 55-1 - 2 items" no dice nada
// de lo que se pidió: quien lo recibe tiene que abrirlo para saber de qué se trata.
// Nombrar los primeros productos hace que la lista se pueda leer de un vistazo.
// El código de obra va adelante porque es por donde se busca.
function buildPedidoTitulo({ obra, rows = [], maxItems = 2 }) {
  const prefijo = obra?.codigo ? `${obra.codigo} · ` : "";
  // Con un solo ítem entra la descripción entera; con varios hay que compactar
  // para que el título siga siendo legible en una lista.
  const unico = rows.length === 1;
  const descripciones = rows
    .map((row) => resumenDescripcion(row?.descripcion, unico ? 99 : 2))
    .filter(Boolean);
  if (!descripciones.length) {
    const n = rows.length;
    return `${prefijo}${n} ${n === 1 ? "ítem" : "ítems"}`.trim();
  }
  const visibles = descripciones.slice(0, maxItems);
  const resto = descripciones.length - visibles.length;
  return `${prefijo}${visibles.join(", ")}${resto > 0 ? ` +${resto}` : ""}`;
}

// Mapea el nombre de sector que sugiere la IA a una categoría real (por nombre).
function catIdPorNombre(categorias, nombre) {
  if (!nombre) return "";
  const n = norm(nombre);
  const exacto = categorias.find((c) => norm(c.nombre) === n);
  if (exacto) return exacto.id;
  const incl = categorias.find((c) => { const cn = norm(c.nombre); return cn && (cn.includes(n) || n.includes(cn)); });
  return incl?.id || "";
}

// Principales: lo que se usa a diario. El resto va en un menú "Más ▾".
const TABS_MAIN = [
  { key: "lineas", label: "Líneas" },
  { key: "matriz", label: "Catálogo completo" },
  { key: "planillas", label: "Planillas" },
  { key: "costos", label: "Costo de obra" },
];
const TABS_MORE = [
  { key: "comprobantes", label: "Comprobantes" },
  { key: "importar", label: "Importar" },
  { key: "bandeja", label: "Bandeja" },
  { key: "revision", label: "Revisión guiada" },
  { key: "normalizacion", label: "Normalizar" },
  { key: "condicionantes", label: "Condicionantes" },
  { key: "variantes", label: "Requisitos / productos" },
  { key: "proveedores", label: "Proveedores" },
  { key: "avance", label: "Avance" },
  { key: "resumen", label: "Resumen" },
  { key: "lector", label: "Lector" },
];

const MONEDAS = ["", "USD", "ARS"];

function materialActivo(material) {
  return material.activo !== false;
}

function categoriaNombre(categorias, id) {
  return categorias.find((c) => c.id === id)?.nombre ?? "Sin sector";
}

function inputNumberValue(value) {
  return value == null ? "" : String(value);
}

function proveedorNombre(proveedores, id, fallback = "") {
  return proveedores.find((p) => p.id === id)?.nombre ?? fallback ?? "";
}

export {
  TABS_MAIN,
  TABS_MORE,
  MONEDAS,
  materialEnArea,
  esRaiz,
  hijosDe,
  idsScope,
  materialEnScope,
  subdivisionesSugeridas,
  searchText,
  searchTerms,
  matchesFlexibleSearch,
  materialSearchFields,
  scoreMaterial,
  topMateriales,
  bestMatchId,
  toNum,
  qtyText,
  stockLibreKeyForRow,
  materialQty,
  priceInfo,
  mentionsLineaEje,
  materialBucket,
  reviewReasonForText,
  reviewInfoForMaterial,
  ReviewBadge,
  normalizeVariantList,
  buildUnidadOptions,
  providerBrandCandidates,
  brandCandidates,
  escapeRegex,
  extractBrandsFromTitle,
  cleanTitleBrands,
  materialVariants,
  materialVariantImageUrl,
  prepareMaterialDraftForSave,
  findCleanupCandidates,
  findDuplicateGroups,
  mergedDuplicatePayload,
  buildAiReviewText,
  copyTextToClipboard,
  buildOrdenTexto,
  buildPedidoTitulo,
  catIdPorNombre,
  canonicalDuplicateToken,
  codeCandidatesFromText,
  DUPLICATE_STOPWORDS,
  intersects,
  materialActivo,
  categoriaNombre,
  inputNumberValue,
  proveedorNombre,
};
