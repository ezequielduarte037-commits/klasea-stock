import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Copy, Download, ExternalLink, FileText, ImagePlus, Link as LinkIcon, PackagePlus, Pencil, Plus, RefreshCw, Save, Search, ShoppingCart, SkipForward, StickyNote, Trash2, Upload, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import {
  aplicarPrecioMaterial,
  archivarMateriales,
  borrarMaterial,
  borrarSubsector,
  crearCategoria,
  crearMaterial,
  actualizarNotasMaterial,
  agregarCodigoBarraMaterial,
  fetchCatalogo,
  fetchMaterialDuplicateDecisions,
  fetchMaterialAudit,
  fetchObrasAvance,
  guardarProveedor,
  guardarMaterial,
  eliminarCodigoBarraMaterial,
  importarCatalogo,
  isMissingTable,
  leerPresupuestoConIA,
  precioVigente,
  variantePrecioMax,
  restaurarMaterialAuditChange,
  marcarMaterialesNoDuplicados,
  normalizeMaterialLinks,
  setCantidadModelo,
  setSectoresMaterial,
  quitarCantidadModelo,
  uploadMaterialImage,
  fetchAddonsObra,
  fetchAddonsMaterial,
  crearAddon,
  actualizarAddon,
  reasignarAddon,
  cambiarEstadoObraSnapshot,
  fetchObraSnapshotAudit,
  fetchObraMaterialSnapshot,
  ensureObraMaterialSnapshot,
  reemplazarObraMaterialSnapshotSeguro,
  updateObraSnapshotRows,
  actualizarMaterialDatos,
} from "./api";
import AvanceTab from "./AvanceTab";
import ComprobantesTab from "./ComprobantesTab";
import BandejaTab from "./BandejaTab";
import { MaterialImageUploader, MaterialThumb, PriceBadge, PriceHistory } from "./MaterialExtras";
import { fmtMoney } from "./format";
import ProveedoresTab from "./ProveedoresTab";
import { csvCell, MODELOS, norm, parseMaterialesWorkbook, toBomMap } from "./materialesParser";
import {
  fetchMatrizCondicionantes,
  fetchObraMatrizCondicionantes,
  fetchOpciones,
  setMaterialAreas,
  setObraMatrizCondicionante,
  setProveedoresMaterial,
} from "./materialesConfig";
import { AreasEditor } from "./MaterialVariantes";
import MatrizCondicionantesTab from "./MatrizCondicionantes";
import VariantesMarcasTab from "./VariantesMarcasTab";
import LectorTab from "./LectorTab";
import ProveedorTipoBadge from "./ProveedorTipoBadge";
import { proveedorAlternativas, proveedorMeta, PROVEEDOR_TIPOS, proveedorTipoUi } from "./proveedorMeta";
import { barcodeKey, materialBarcodeList, materialBarcodeText } from "./materialBarcodes";
import { addRequestItem, createPurchaseRequest } from "@/features/compras/purchaseRequestsApi";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { BTN, BTN_GREEN, BTN_PRIMARY, Cargando, ErrorBox, INP, KpiCard, LBL, Td, Th } from "@/features/rrhh/ui";

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

// Matcheo difuso contra la lista matriz (mismo criterio que Comprobantes)
function scoreMaterial(material, query) {
  const q = norm(query);
  if (!q) return 0;
  const codeText = norm(`${material.codigo ?? ""} ${materialBarcodeText(material)}`);
  if (codeText && codeText.includes(q)) return 95;
  const d = norm(`${material.descripcion ?? ""} ${codeText}`);
  if (d === q) return 100;
  if (d.includes(q) || q.includes(d)) return 70;
  const words = q.split(" ").filter((w) => w.length > 2);
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
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\n;/]+/);
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

function prepareMaterialDraftForSave(material, proveedores = [], extraVariants = [], variantesPrecios = null) {
  void proveedores;
  const variantes = normalizeVariantList([...(extraVariants || []), ...materialVariants(material)]);
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
  { key: "costos", label: "Costo de obra" },
];
const TABS_MORE = [
  { key: "comprobantes", label: "Comprobantes" },
  { key: "importar", label: "Importar" },
  { key: "bandeja", label: "Bandeja" },
  { key: "revision", label: "Revisión guiada" },
  { key: "normalizacion", label: "Normalizar" },
  { key: "condicionantes", label: "Condicionantes" },
  { key: "variantes", label: "Variantes / marcas" },
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

function ProveedorSelect({ value, textValue, proveedores, onChange, onCreated }) {
  const [creating, setCreating] = useState(false);
  const activos = proveedores.filter((p) => p.activo !== false);

  async function vincularOCrear() {
    const nombre = String(textValue || "").trim();
    if (!nombre || creating) return;
    setCreating(true);
    try {
      const match = activos.find((p) => norm(p.nombre) === norm(nombre));
      const id = match?.id ?? await guardarProveedor({ nombre, activo: true });
      await onCreated?.();
      onChange(id, match?.nombre ?? nombre);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 5 }}>
      <select
        value={value || ""}
        onChange={(e) => {
          const nombre = proveedorNombre(proveedores, e.target.value, "");
          onChange(e.target.value || null, nombre);
        }}
        style={{ ...INP, width: "100%" }}
      >
        <option value="">Sin proveedor vinculado</option>
        {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {!value && textValue && (
        <button type="button" onClick={vincularOCrear} disabled={creating} style={{ ...BTN, padding: "5px 8px", fontSize: 11 }}>
          <LinkIcon size={12} /> {creating ? "Vinculando…" : `Vincular "${textValue}"`}
        </button>
      )}
    </div>
  );
}

function ProveedorTipoFilter({ value, onChange, style }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style} title="Tipo de proveedor">
      <option value="todos" style={OPT_ST}>Tipo proveedor: todos</option>
      {PROVEEDOR_TIPOS.map((tipo) => (
        <option key={tipo} value={tipo} style={OPT_ST}>{proveedorTipoUi(tipo)?.label || tipo}</option>
      ))}
    </select>
  );
}

function ProveedorAlternativasHint({ proveedor, proveedores, compact = false }) {
  const alternativas = useMemo(() => proveedorAlternativas(proveedor, proveedores), [proveedor, proveedores]);
  if (!alternativas.length) return null;
  const text = `Alternativas: ${alternativas.join(", ")}`;
  return (
    <span
      title={text}
      style={{
        color: C.t3,
        fontSize: compact ? 10 : 11,
        fontWeight: 750,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: compact ? 220 : 300,
      }}
    >
      {text}
    </span>
  );
}

function SetupPendienteMateriales({ onRetry }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 22, maxWidth: 620 }}>
        <div style={{ fontSize: 14, color: C.amber, fontWeight: 700, marginBottom: 8 }}>Faltan crear las tablas de Materiales</div>
        <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, marginBottom: 14 }}>
          No se pudieron leer las tablas <code style={{ fontFamily: C.mono, fontSize: 12 }}>panol_*</code>.
          Cuando estén disponibles en Supabase, tocá Reintentar.
        </div>
        <button type="button" onClick={onRetry} style={BTN_PRIMARY}>Reintentar</button>
      </div>
    </div>
  );
}

function ImportarTab({ batches, onImported }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function onFile(file) {
    if (!file) return;
    setParseErr(null);
    setResult(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseMaterialesWorkbook(buf));
    } catch (e) {
      setParseErr(e);
    }
  }

  async function confirmar() {
    if (!parsed || importing) return;
    setImporting(true);
    setParseErr(null);
    try {
      const stats = await importarCatalogo(parsed, fileName);
      setResult(stats);
      setParsed(null);
      onImported?.();
    } catch (e) {
      setParseErr(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#60a5fa" : C.b0}`,
          borderRadius: 14,
          padding: "34px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(59,130,246,0.05)" : C.s0,
          transition: "all .2s",
          marginBottom: 18,
        }}
      >
        <Upload size={30} style={{ marginBottom: 8, color: dragging ? "#60a5fa" : C.t2 }} />
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600 }}>Arrastrá el Excel de materiales acá</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
          Cada hoja se toma como sector. Sólo se importan modelos 37, 52 y 55.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>

      {parseErr && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#f87171" }}>
          {String(parseErr.message ?? parseErr)}
        </div>
      )}

      {result && (
        <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 6 }}>Importación completada</div>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.8 }}>
            {result.creados} materiales nuevos, {result.actualizados} actualizados y {result.cantidades_upsert} cantidades BOM cargadas/actualizadas.
          </div>
        </div>
      )}

      {parsed && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 12 }}>
            Vista previa — {fileName}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <KpiCard label="Sectores" value={parsed.sectores.length} />
            <KpiCard label="Materiales" value={parsed.totalMateriales} />
            <KpiCard label="Cantidades BOM" value={parsed.totalCantidades} sub="37 / 52 / 55" />
            <KpiCard label="Hojas salteadas" value={parsed.skipped.length} sub={parsed.skipped.join(" · ") || "ninguna"} />
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 10, marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <Th>Sector</Th>
                  <Th right>Materiales</Th>
                  <Th right>Cantidades</Th>
                  <Th>Hoja</Th>
                </tr>
              </thead>
              <tbody>
                {parsed.sectores.map((s) => {
                  const cant = s.materiales.reduce((sum, m) => sum + Object.keys(m.cantidades).length, 0);
                  return (
                    <tr key={s.sector.nombre}>
                      <Td>{s.sector.nombre}</Td>
                      <Td right mono>{s.materiales.length}</Td>
                      <Td right mono>{cant}</Td>
                      <Td color={C.t2}>{s.sector.sheetName}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={confirmar} disabled={importing} style={{ ...BTN_GREEN, opacity: importing ? 0.6 : 1, padding: "9px 22px", fontSize: 13 }}>
              {importing ? "Importando…" : "Confirmar e importar"}
            </button>
            <button type="button" onClick={() => setParsed(null)} disabled={importing} style={BTN}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 10 }}>
            Reimportar el mismo archivo no duplica: se actualiza por descripción dentro del sector.
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, margin: "20px 0 8px" }}>
        Importaciones anteriores
      </div>
      {!batches?.length ? (
        <div style={{ fontSize: 13, color: C.t2, padding: "14px 0" }}>Todavía no se importó ningún catálogo.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {batches.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: "9px 14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.t0, fontWeight: 600, flex: 1, minWidth: 160 }}>{b.filename}</span>
              <span style={{ fontSize: 12, color: C.t2 }}>{b.stats?.materiales ?? 0} materiales · {b.stats?.cantidades ?? 0} cantidades</span>
              <span style={{ fontSize: 11, color: C.t2 }}>
                {new Date(b.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectorChip({ cat, progressByCat, selectedId, onSelect, sub = false }) {
  const p = progressByCat.get(cat.id) ?? { total: 0, revisados: 0 };
  const on = selectedId === cat.id;
  const accent = sub ? "rgba(139,92,246,0.16)" : "rgba(59,130,246,0.14)";
  const accentBd = sub ? "rgba(139,92,246,0.4)" : "rgba(59,130,246,0.35)";
  const accentTx = sub ? "#a78bfa" : "#60a5fa";
  return (
    <button
      type="button"
      onClick={() => onSelect(cat.id)}
      style={{
        ...BTN,
        background: on ? accent : C.s0,
        border: `1px solid ${on ? accentBd : C.b0}`,
        color: on ? accentTx : C.t1,
        padding: sub ? "6px 10px" : "8px 12px",
        fontSize: sub ? 12 : 13,
      }}
    >
      {cat.nombre}
      <span style={{ marginLeft: 7, color: on ? accentTx : C.t2, fontFamily: C.mono }}>
        {p.revisados}/{p.total}
      </span>
    </button>
  );
}

function SectorSelector({ categorias, progressByCat, selectedId, onSelect, onAddSub, onSuggestSub, onDeleteSub }) {
  const raices = categorias.filter(esRaiz);
  const selected = categorias.find((c) => c.id === selectedId);
  const parentActivo = selected ? (selected.parent_id ? categorias.find((c) => c.id === selected.parent_id) : selected) : raices[0];
  const subs = parentActivo ? hijosDe(categorias, parentActivo.id) : [];
  const sugeridas = parentActivo ? subdivisionesSugeridas(parentActivo.nombre) : [];

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Sectores raíz */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {raices.map((cat) => (
          <SectorChip key={cat.id} cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>

      {/* Subsectores del sector activo + gestión */}
      {parentActivo && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 9, paddingLeft: 12, borderLeft: `2px solid ${C.b0}` }}>
          <button
            type="button"
            onClick={() => onSelect(parentActivo.id)}
            style={{ ...BTN, padding: "5px 10px", fontSize: 12, background: selectedId === parentActivo.id ? C.s2 : "transparent", border: `1px solid ${C.b0}`, color: selectedId === parentActivo.id ? C.t0 : C.t2 }}
            title="Ver todo el sector (incluye subsectores)"
          >
            Todos
          </button>
          {subs.map((cat) => (
            <span key={cat.id} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <SectorChip cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} sub />
              {selectedId === cat.id && (
                <button type="button" onClick={() => onDeleteSub(cat)} title="Borrar subsector (sus materiales vuelven al sector)" style={{ ...BTN, padding: "2px 6px", marginLeft: 4, fontSize: 11, color: C.red, border: `1px solid ${C.b0}`, background: "transparent" }}>
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          ))}
          <button type="button" onClick={() => onAddSub(parentActivo)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: C.t2, border: `1px dashed ${C.b1}`, background: "transparent" }}>
            + subsector
          </button>
          {subs.length === 0 && sugeridas.length > 0 && (
            <button type="button" onClick={() => onSuggestSub(parentActivo, sugeridas)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: "#a78bfa", border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.1)" }} title={`Crear: ${sugeridas.join(" · ")}`}>
              ✨ Sugerir {sugeridas.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Selector para asignar el material a un subsector (o dejarlo en el sector general).
// Solo aparece si el sector tiene subsectores; si no, muestra el nombre a secas.
function SubsectorSelect({ categorias, value, onChange }) {
  const cat = categorias.find((c) => c.id === value);
  const raizId = cat?.parent_id ?? value;
  const raiz = categorias.find((c) => c.id === raizId);
  const hijos = raiz ? hijosDe(categorias, raizId) : [];
  if (!raiz || hijos.length === 0) {
    return <span style={{ fontSize: 12, color: C.t2 }}>{categoriaNombre(categorias, value)}</span>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INP, padding: "4px 8px", fontSize: 12, width: "auto", color: C.t1 }}
      title="Asignar a subsector"
    >
      <option value={raiz.id}>{raiz.nombre} · (general)</option>
      {hijos.map((h) => <option key={h.id} value={h.id}>{raiz.nombre} › {h.nombre}</option>)}
    </select>
  );
}

function VariantsEditor({ value = [], onChange, precios = {}, onPreciosChange, description = "", proveedores = [], onCleanTitle }) {
  const [draft, setDraft] = useState("");
  const variants = normalizeVariantList(value);
  const detected = extractBrandsFromTitle(description, proveedores).filter((name) => !variants.some((v) => norm(v) === norm(name)));
  const withPrices = !!onPreciosChange;

  const setPrecio = (nombre, patch) => {
    const cur = precios?.[nombre] || { precio: "", moneda: "ARS" };
    onPreciosChange?.({ ...(precios || {}), [nombre]: { ...cur, ...patch } });
  };
  const add = (raw = draft) => {
    const next = normalizeVariantList([...variants, ...normalizeVariantList(raw)]);
    onChange?.(next);
    setDraft("");
  };
  const remove = (name) => {
    onChange?.(variants.filter((v) => norm(v) !== norm(name)));
    if (onPreciosChange && precios?.[name]) { const cp = { ...precios }; delete cp[name]; onPreciosChange(cp); }
  };
  const extract = () => {
    const next = normalizeVariantList([...variants, ...detected]);
    onChange?.(next);
    onCleanTitle?.(cleanTitleBrands(description, next, proveedores));
  };

  const chip = { display: "inline-flex", alignItems: "center", gap: 5, color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "3px 7px", fontSize: 11, fontWeight: 850 };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {withPrices ? (
        <div style={{ display: "grid", gap: 5 }}>
          {variants.map((variant) => {
            const p = precios?.[variant] || {};
            return (
              <div key={variant} style={{ display: "grid", gridTemplateColumns: "minmax(72px,0.9fr) minmax(90px,1fr) 104px 64px auto", gap: 6, alignItems: "center" }}>
                <span style={{ ...chip, justifySelf: "start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{variant}</span>
                <input value={p.codigo ?? ""} onChange={(e) => setPrecio(variant, { codigo: e.target.value })} placeholder="Código" style={{ ...INP, padding: "6px 9px", fontFamily: C.mono }} />
                <input value={p.precio ?? ""} onChange={(e) => setPrecio(variant, { precio: e.target.value })} inputMode="decimal" placeholder="Precio" style={{ ...INP, padding: "6px 9px" }} />
                <select value={p.moneda || "ARS"} onChange={(e) => setPrecio(variant, { moneda: e.target.value })} style={{ ...INP, padding: "6px 6px" }}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <button type="button" onClick={() => remove(variant)} title="Quitar variante" style={{ ...BTN, color: C.red, padding: "6px 8px" }}>×</button>
              </div>
            );
          })}
          {!variants.length && <span style={{ color: C.t2, fontSize: 11 }}>Sin variantes.</span>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {variants.map((variant) => (
            <span key={variant} style={chip}>
              {variant}
              <button type="button" onClick={() => remove(variant)} style={{ border: "none", background: "transparent", color: C.violet, cursor: "pointer", padding: 0, lineHeight: 1 }}>x</button>
            </span>
          ))}
          {!variants.length && <span style={{ color: C.t2, fontSize: 11 }}>Sin variantes.</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Ej: LG, Samsung / 23L, 48L" style={{ ...INP, flex: "1 1 180px", minWidth: 150 }} />
        <button type="button" onClick={() => add()} disabled={!draft.trim()} style={{ ...BTN, padding: "6px 10px", color: C.violet }}>
          + Variante
        </button>
        {detected.length > 0 && (
          <button type="button" onClick={extract} style={{ ...BTN, padding: "6px 10px", color: C.blue, border: `1px solid ${C.blueB}`, background: C.blueL }}>
            Pasar marcas a variantes
          </button>
        )}
      </div>
    </div>
  );
}

function MaterialLinksEditor({ value = [], onChange, compact = false }) {
  const links = normalizeMaterialLinks(value);
  const [draft, setDraft] = useState({ label: "", url: "", nota: "" });
  const canAdd = draft.url.trim();

  function commitDraft() {
    if (!canAdd) return;
    onChange?.(normalizeMaterialLinks([...links, draft]));
    setDraft({ label: "", url: "", nota: "" });
  }

  function updateLink(index, patch) {
    onChange?.(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function removeLink(index) {
    onChange?.(links.filter((_, i) => i !== index));
  }

  return (
    <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, background: C.bg, padding: compact ? 8 : 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: C.t0 }}>Links utiles</span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>ficha tecnica, proveedor, compra, manual</span>
      </div>
      {links.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {links.map((link, index) => (
            <div key={`${link.url}-${index}`} style={{ display: "grid", gridTemplateColumns: compact ? "minmax(120px, 1fr) minmax(180px, 1.4fr) 34px" : "minmax(120px, .7fr) minmax(220px, 1.3fr) minmax(160px, .9fr) 34px", gap: 6, alignItems: "center" }}>
              <input value={link.label || ""} onChange={(e) => updateLink(index, { label: e.target.value })} placeholder="Etiqueta" style={INP} />
              <input value={link.url || ""} onChange={(e) => updateLink(index, { url: e.target.value })} placeholder="https://..." style={{ ...INP, fontFamily: C.mono }} />
              {!compact && <input value={link.nota || ""} onChange={(e) => updateLink(index, { nota: e.target.value })} placeholder="Nota breve" style={INP} />}
              <button type="button" onClick={() => removeLink(index)} style={{ ...BTN, color: C.red, padding: "7px 8px" }} title="Quitar link">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: compact ? "minmax(120px, .7fr) minmax(180px, 1.3fr) auto" : "minmax(120px, .7fr) minmax(220px, 1.4fr) minmax(160px, .9fr) auto", gap: 6, alignItems: "center" }}>
        <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Ficha / ML / proveedor" style={INP} />
        <input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDraft(); } }} placeholder="Pegar link" style={{ ...INP, fontFamily: C.mono }} />
        {!compact && <input value={draft.nota} onChange={(e) => setDraft((d) => ({ ...d, nota: e.target.value }))} placeholder="Nota opcional" style={INP} />}
        <button type="button" onClick={commitDraft} disabled={!canAdd} style={{ ...BTN, padding: "7px 10px", color: C.blue, opacity: canAdd ? 1 : 0.5 }}>
          <Plus size={13} /> Link
        </button>
      </div>
    </div>
  );
}

function MaterialLinksSummary({ links = [] }) {
  const clean = normalizeMaterialLinks(links);
  if (!clean.length) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.blue, fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>
      <ExternalLink size={12} /> {clean.length} link{clean.length === 1 ? "" : "s"}
    </span>
  );
}

function PendingImagePicker({ file, onChange, imageUrl, onImageUrlChange }) {
  const inputRef = useRef(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, background: C.bg, padding: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <div style={{ width: 64, height: 64, borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s0, overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {preview || imageUrl ? (
            <img src={preview || imageUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <ImagePlus size={20} color={C.t2} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.t0 }}>Imagen del item</div>
          <input value={imageUrl || ""} onChange={(e) => onImageUrlChange?.(e.target.value)} placeholder="URL de imagen o ficha visual" style={{ ...INP, width: "100%" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => inputRef.current?.click()} style={{ ...BTN, padding: "6px 10px", color: C.blue }}>
              <ImagePlus size={13} /> Elegir archivo
            </button>
            {file && (
              <button type="button" onClick={() => onChange?.(null)} style={{ ...BTN, padding: "6px 10px", color: C.red }}>
                Quitar archivo
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { onChange?.(e.target.files?.[0] || null); e.target.value = ""; }}
      />
    </div>
  );
}

function DraftBarcodeEditor({ value = [], onChange, variantes = [] }) {
  const [draft, setDraft] = useState({ codigo: "", etiqueta: "", variante: "" });
  const rows = (value || []).filter((row) => row?.codigo?.trim());

  function addCode() {
    const codigo = draft.codigo.trim();
    if (!codigo) return;
    const key = barcodeKey(codigo);
    if (rows.some((row) => barcodeKey(row.codigo) === key)) {
      setDraft({ codigo: "", etiqueta: "", variante: "" });
      return;
    }
    onChange?.([...rows, { codigo, etiqueta: draft.etiqueta.trim(), variante: draft.variante || null }]);
    setDraft({ codigo: "", etiqueta: "", variante: "" });
  }

  return (
    <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, background: C.bg, padding: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Barcode size={14} color={C.blue} />
        <span style={{ fontSize: 11, fontWeight: 900, color: C.t0 }}>Codigos de barra adicionales</span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>para marcas, cajas o codigos alternativos</span>
      </div>
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {rows.map((row, index) => (
            <span key={`${row.codigo}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 850, fontFamily: C.mono }}>
              {row.codigo}
              {row.variante && <span style={{ fontFamily: C.sans, color: C.t1, fontWeight: 800 }}>{row.variante}</span>}
              {row.etiqueta && <span style={{ fontFamily: C.sans, color: C.t2 }}>{row.etiqueta}</span>}
              <button type="button" onClick={() => onChange?.(rows.filter((_, i) => i !== index))} style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", padding: 0 }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: variantes.length ? "minmax(150px,1fr) minmax(120px,.7fr) minmax(120px,.7fr) auto" : "minmax(150px,1fr) minmax(120px,.7fr) auto", gap: 6 }}>
        <input value={draft.codigo} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }} placeholder="Escanear o escribir codigo" style={{ ...INP, fontFamily: C.mono }} />
        {variantes.length > 0 && (
          <select value={draft.variante} onChange={(e) => setDraft((d) => ({ ...d, variante: e.target.value }))} style={INP}>
            <option value="">Variante</option>
            {variantes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <input value={draft.etiqueta} onChange={(e) => setDraft((d) => ({ ...d, etiqueta: e.target.value }))} placeholder="Etiqueta" style={INP} />
        <button type="button" onClick={addCode} disabled={!draft.codigo.trim()} style={{ ...BTN, padding: "7px 10px", color: C.blue, opacity: draft.codigo.trim() ? 1 : 0.5 }}>
          <Plus size={13} /> Codigo
        </button>
      </div>
    </div>
  );
}

function MaterialQueueCard({ material, categorias, ums, proveedores, onSave, onSkip, onDelete, onChanged }) {
  const [draft, setDraft] = useState(() => ({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) }));
  const [cantidades, setCantidades] = useState(() => toBomMap(material));
  const [variantes, setVariantes] = useState(() => materialVariants(material));
  const [variantesPrecios, setVariantesPrecios] = useState(() => material?.variantes_precios || {});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!draft.descripcion?.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(prepareMaterialDraftForSave(draft, proveedores, variantes, variantesPrecios), cantidades);
    } catch (error) {
      setErr(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <MaterialThumb material={material} size={72} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 5 }}>
            Material sin revisar
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t0, lineHeight: 1.25 }}>{material.descripcion}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <SubsectorSelect categorias={categorias} value={draft.categoria_id} onChange={(id) => setDraft((d) => ({ ...d, categoria_id: id }))} />
            <span style={{ fontSize: 11, color: C.t2 }}>origen {material.origen || "manual"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            <PriceBadge material={material} />
            <PriceHistory material={material} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 7, justifyItems: "end" }}>
          <MaterialImageUploader material={material} onUploaded={onChanged} />
          <button type="button" onClick={onSkip} style={BTN} title="Saltar">
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{String(err.message ?? err)}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1fr)", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LBL}>Descripción</label>
          <input value={draft.descripcion || ""} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Proveedor</label>
          <ProveedorSelect
            value={draft.proveedor_id || ""}
            textValue={draft.proveedor || ""}
            proveedores={proveedores}
            onCreated={onChanged}
            onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
          />
          <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Texto proveedor" style={{ ...INP, width: "100%", marginTop: 6 }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LBL}>Variantes del item (marcas/modelos aceptables)</label>
        <VariantsEditor
          value={variantes}
          onChange={setVariantes}
          precios={variantesPrecios}
          onPreciosChange={setVariantesPrecios}
          description={draft.descripcion}
          proveedores={proveedores}
          onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LBL}>UM</label>
          <input list="materiales-ums" value={draft.unidad_medida || ""} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Precio</label>
          <input type="number" step="any" value={draft.precio_unitario ?? ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Moneda</label>
          <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value || null }))} style={{ ...INP, width: "100%" }}>
            {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "Sin moneda"}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Código</label>
          <input value={draft.codigo || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(80px, 1fr))", gap: 12, marginBottom: 16 }}>
        {MODELOS.map((modelo) => (
          <div key={modelo}>
            <label style={LBL}>Cantidad K{modelo}</label>
            <input type="number" step="any" value={cantidades[modelo] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 14, marginBottom: 16, paddingTop: 14, borderTop: `1px solid ${C.b0}` }}>
        <AreasEditor material={material} categorias={categorias} />
      </div>

      <datalist id="materiales-ums">
        {ums.map((u) => <option key={u} value={u} />)}
      </datalist>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving || !draft.descripcion?.trim()} style={{ ...BTN_GREEN, opacity: saving ? 0.6 : 1 }}>
          <Save size={14} /> {saving ? "Guardando…" : "Guardar y siguiente"}
        </button>
        <button type="button" onClick={onSkip} style={BTN}>
          <SkipForward size={14} /> Saltar
        </button>
        <button type="button" onClick={onDelete} style={{ ...BTN, color: C.red, borderColor: "rgba(239,68,68,0.25)" }}>
          <Trash2 size={14} /> Borrar
        </button>
      </div>
    </form>
  );
}

function AltaManual({ categorias, selectedId, ums, proveedores, onCreated }) {
  const [open, setOpen] = useState(false);
  const emptyDraft = useCallback(() => ({
    descripcion: "",
    alias: "",
    proveedor_id: "",
    proveedor: "",
    unidad_medida: "",
    precio_unitario: "",
    moneda: "",
    codigo: "",
    codigo_barra: "",
    categoria_id: selectedId,
    imagen_url: "",
    links: [],
    notas: "",
    revisado: true,
  }), [selectedId]);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [cantidades, setCantidades] = useState({ 37: "", 52: "", 55: "" });
  const [variantes, setVariantes] = useState([]);
  const [variantesPrecios, setVariantesPrecios] = useState({});
  const [codigosExtra, setCodigosExtra] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setDraft((d) => ({ ...d, categoria_id: d.categoria_id || selectedId }));
  }, [selectedId]);

  async function submit(e) {
    e.preventDefault();
    if (!draft.descripcion.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const materialId = await crearMaterial(prepareMaterialDraftForSave(draft, proveedores, variantes, variantesPrecios), cantidades);
      if (imageFile) await uploadMaterialImage(materialId, imageFile);
      for (const row of codigosExtra) {
        if (row.codigo?.trim()) await agregarCodigoBarraMaterial(materialId, row.codigo, { etiqueta: row.etiqueta, variante: row.variante || null });
      }
      setDraft(emptyDraft());
      setCantidades({ 37: "", 52: "", 55: "" });
      setVariantes([]);
      setVariantesPrecios({});
      setCodigosExtra([]);
      setImageFile(null);
      setOpen(false);
      onCreated?.();
    } catch (error) {
      setErr(error);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...BTN_PRIMARY, marginBottom: 12 }}>
        <PackagePlus size={14} /> Alta manual
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 950, color: C.t0 }}>Alta manual de material</div>
          <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>Crea el item completo: proveedor, precio, matriz, codigos, links e imagen.</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ ...BTN, padding: "6px 10px" }}>Cerrar</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(3, minmax(110px, 1fr))", gap: 8, marginBottom: 8 }}>
        <input autoFocus placeholder="Descripción" value={draft.descripcion} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={INP} />
        <ProveedorSelect
          value={draft.proveedor_id || ""}
          textValue={draft.proveedor || ""}
          proveedores={proveedores}
          onCreated={onCreated}
          onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
        />
        <input list="materiales-ums" placeholder="UM" value={draft.unidad_medida} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={INP} />
        <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={INP}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, .9fr) minmax(180px, .9fr) minmax(220px, 1.2fr)", gap: 8 }}>
        <input placeholder="Alias / nombre corto" value={draft.alias || ""} onChange={(e) => setDraft((d) => ({ ...d, alias: e.target.value }))} style={INP} />
        <input placeholder="Codigo de barra principal" value={draft.codigo_barra || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo_barra: e.target.value }))} style={{ ...INP, fontFamily: C.mono }} />
        <input placeholder="Proveedor texto libre" value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} style={INP} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <VariantsEditor
          value={variantes}
          onChange={setVariantes}
          precios={variantesPrecios}
          onPreciosChange={setVariantesPrecios}
          description={draft.descripcion}
          proveedores={proveedores}
          onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 10 }}>
        <input placeholder="Precio" type="number" step="any" value={draft.precio_unitario} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={INP} />
        <select value={draft.moneda} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value }))} style={INP}>
          {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "Sin moneda"}</option>)}
        </select>
        <input placeholder="Código" value={draft.codigo} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={INP} />
        {MODELOS.map((modelo) => (
          <input key={modelo} placeholder={`K${modelo}`} type="number" step="any" value={cantidades[modelo]} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, fontFamily: C.mono }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, .95fr) minmax(320px, 1.05fr)", gap: 12 }}>
        <PendingImagePicker
          file={imageFile}
          onChange={setImageFile}
          imageUrl={draft.imagen_url}
          onImageUrlChange={(imagen_url) => setDraft((d) => ({ ...d, imagen_url }))}
        />
        <DraftBarcodeEditor value={codigosExtra} onChange={setCodigosExtra} variantes={variantes} />
      </div>
      <MaterialLinksEditor value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} />
      <textarea value={draft.notas || ""} onChange={(e) => setDraft((d) => ({ ...d, notas: e.target.value }))} rows={2} placeholder="Observaciones reales del item (solo aclaraciones utiles)" style={{ ...INP, width: "100%", resize: "vertical" }} />
      <datalist id="materiales-ums">
        {ums.map((u) => <option key={u} value={u} />)}
      </datalist>
      {err && <div style={{ fontSize: 12, color: C.red }}>{err.message || "No se pudo crear el material."}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="submit" disabled={saving || !draft.descripcion.trim()} style={BTN_GREEN}>{saving ? "Guardando..." : "Crear material completo"}</button>
        <button type="button" onClick={() => setOpen(false)} style={BTN}>Cancelar</button>
      </div>
    </form>
  );
}

function MaterialRow({ material, categorias, ums, proveedores, onChanged, modelos = MODELOS, compact = false }) {
  const [draft, setDraft] = useState(() => ({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) }));
  const [cantidades, setCantidades] = useState(() => toBomMap(material));
  const [variantes, setVariantes] = useState(() => materialVariants(material));
  const [variantesPrecios, setVariantesPrecios] = useState(() => material?.variantes_precios || {});
  const [saving, setSaving] = useState(false);
  const review = reviewInfoForMaterial(material);

  useEffect(() => {
    setDraft({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) });
    setCantidades(toBomMap(material));
    setVariantes(materialVariants(material));
    setVariantesPrecios(material?.variantes_precios || {});
  }, [material]);

  async function save() {
    if (!draft.descripcion?.trim() || saving) return;
    setSaving(true);
    try {
      await guardarMaterial(prepareMaterialDraftForSave(draft, proveedores, variantes, variantesPrecios), cantidades, { revisado: draft.revisado });
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Borrar "${material.descripcion}"?`)) return;
    await borrarMaterial(material.id);
    onChanged?.();
  }

  return (
    <tr style={review.flag ? { background: C.amberL } : undefined}>
      {!compact && (
        <Td style={{ minWidth: 78 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MaterialThumb material={material} size={38} />
            <MaterialImageUploader material={material} onUploaded={onChanged} compact />
          </div>
        </Td>
      )}
      <Td style={{ minWidth: compact ? 230 : 260 }}>
        {review.flag && <div style={{ marginBottom: 5 }}><ReviewBadge reason={review.reason} /></div>}
        <input value={draft.descripcion || ""} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={{ ...INP, width: "100%" }} />
        <div style={{ marginTop: 6 }}>
          <VariantsEditor
            value={variantes}
            onChange={setVariantes}
            precios={variantesPrecios}
            onPreciosChange={setVariantesPrecios}
            description={draft.descripcion}
            proveedores={proveedores}
            onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))}
          />
        </div>
      </Td>
      <Td style={{ minWidth: 150 }}>
        <ProveedorSelect
          value={draft.proveedor_id || ""}
          textValue={draft.proveedor || ""}
          proveedores={proveedores}
          onCreated={onChanged}
          onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
        />
        <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Texto" style={{ ...INP, width: "100%", marginTop: 5 }} />
      </Td>
      {!compact && (
        <Td style={{ minWidth: 190 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <PriceBadge material={material} />
            <PriceHistory material={material} />
          </div>
        </Td>
      )}
      <Td style={{ minWidth: compact ? 72 : 90 }}>
        <input list="materiales-ums" value={draft.unidad_medida || ""} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={{ ...INP, width: "100%" }} />
        <datalist id="materiales-ums">
          {ums.map((u) => <option key={u} value={u} />)}
        </datalist>
      </Td>
      <Td style={{ minWidth: 90 }}>
        <input type="number" step="any" value={draft.precio_unitario ?? ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
      </Td>
      <Td style={{ minWidth: 86 }}>
        <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value || null }))} style={{ ...INP, width: "100%" }}>
          {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "—"}</option>)}
        </select>
      </Td>
      <Td style={{ minWidth: 110 }}>
        <input value={draft.codigo || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={{ ...INP, width: "100%" }} />
      </Td>
      {modelos.map((modelo) => (
        <Td key={modelo} style={{ minWidth: 76 }}>
          <input type="number" step="any" value={cantidades[modelo] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
        </Td>
      ))}
      <Td style={{ minWidth: 150 }}>
        <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={{ ...INP, width: "100%" }}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Td>
      {!compact && (
        <Td style={{ minWidth: 94 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: draft.revisado ? C.green : C.t2 }}>
            <input type="checkbox" checked={!!draft.revisado} onChange={(e) => setDraft((d) => ({ ...d, revisado: e.target.checked }))} />
            Revisado
          </label>
        </Td>
      )}
      <Td style={{ minWidth: compact ? 90 : 118 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GREEN, padding: "6px 8px" }} title="Guardar">
            <Save size={13} />
          </button>
          <button type="button" onClick={remove} style={{ ...BTN, color: C.red, padding: "6px 8px" }} title="Borrar">
            <Trash2 size={13} />
          </button>
        </div>
      </Td>
    </tr>
  );
}

// Fila simple para la "Lista matriz": muestra Item + Proveedor y, al tocar el lápiz,
// despliega el editor completo. Mucho más angosto que la tabla.
const AUDIT_FIELD_LABELS = {
  descripcion: "Descripcion",
  proveedor: "Proveedor",
  proveedor_id: "Proveedor vinculado",
  categoria_id: "Rubro",
  codigo: "Codigo",
  codigo_barra: "Codigo de barra",
  unidad_medida: "Unidad",
  precio_unitario: "Precio",
  moneda: "Moneda",
  variantes: "Variantes",
  notas: "Notas",
  imagen_url: "Imagen",
  revisado: "Revisado",
  activo: "Activo",
};

function auditDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function auditValueLabel(value) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(" / ") : "-";
  if (typeof value === "boolean") return value ? "si" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function MaterialAuditTrail({ materialId, onRestored }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [restoring, setRestoring] = useState("");

  async function loadHistory(force = false) {
    if (!materialId || (!force && loaded)) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchMaterialAudit(materialId);
      setRows(data);
      setLoaded(true);
    } catch (e) {
      setError(e?.message || "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadHistory();
  }

  async function restoreChange(row) {
    const fieldLabel = AUDIT_FIELD_LABELS[row.campo] || row.campo;
    const previous = auditValueLabel(row.valor_anterior);
    if (!window.confirm(`Restaurar ${fieldLabel} al valor anterior?\n\n${previous}`)) return;
    setRestoring(row.id);
    setError("");
    try {
      await restaurarMaterialAuditChange(row);
      await loadHistory(true);
      await onRestored?.();
    } catch (e) {
      setError(e?.message || "No se pudo restaurar el cambio.");
    } finally {
      setRestoring("");
    }
  }

  return (
    <div style={{ border: `1px solid ${open ? C.b1 : C.b0}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
      <button
        type="button"
        onClick={toggleOpen}
        style={{ ...BTN, width: "100%", justifyContent: "space-between", border: 0, borderRadius: 0, padding: "8px 10px", color: open ? C.blue : C.t1, background: "transparent" }}
        title="Ver cambios guardados de este material"
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <FileText size={13} /> Historial de cambios
        </span>
        <span style={{ fontSize: 11, color: C.t3 }}>{open ? "Ocultar" : "Ver"}</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${C.b0}`, padding: 10, display: "grid", gap: 7 }}>
          {loading && <div style={{ fontSize: 12, color: C.t2 }}>Cargando historial...</div>}
          {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div style={{ fontSize: 12, color: C.t2 }}>Sin cambios registrados todavia.</div>
          )}
          {!loading && !error && rows.map((row) => (
            <div key={row.id} style={{ display: "grid", gap: 4, border: `1px solid ${C.b0}`, borderRadius: 9, padding: 8, background: C.s0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: C.t0 }}>{AUDIT_FIELD_LABELS[row.campo] || row.campo}</span>
                <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.mono }}>{auditDateLabel(row.created_at)}</span>
                {row.origen && <span style={{ fontSize: 10, color: C.t3, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "1px 6px" }}>{row.origen}</span>}
                <button
                  type="button"
                  onClick={() => restoreChange(row)}
                  disabled={!!restoring || loading || !row.material_id}
                  style={{ ...BTN, marginLeft: "auto", padding: "3px 7px", fontSize: 10.5, color: C.blue, opacity: restoring && restoring !== row.id ? 0.45 : 1 }}
                  title="Volver este campo al valor anterior"
                >
                  {restoring === row.id ? "Restaurando..." : "Restaurar anterior"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 7 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, color: C.t3, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Antes</div>
                  <div title={auditValueLabel(row.valor_anterior)} style={{ fontSize: 11.5, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auditValueLabel(row.valor_anterior)}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, color: C.green, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Despues</div>
                  <div title={auditValueLabel(row.valor_nuevo)} style={{ fontSize: 11.5, color: C.t0, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auditValueLabel(row.valor_nuevo)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialBarcodeEditor({ material, onChanged }) {
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newVariante, setNewVariante] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const barcodes = materialBarcodeList(material);

  async function addCode() {
    const codigo = newCode.trim();
    if (!codigo || saving) return;
    setSaving(true);
    setErr("");
    try {
      await agregarCodigoBarraMaterial(material.id, codigo, { etiqueta: newLabel, variante: newVariante || null });
      setNewCode("");
      setNewLabel("");
      setNewVariante("");
      await onChanged?.();
    } catch (e) {
      setErr(e?.message || "No se pudo guardar el codigo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCode(row) {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      await eliminarCodigoBarraMaterial({ id: row.id, materialId: material.id, codigo: row.codigo });
      await onChanged?.();
    } catch (e) {
      setErr(e?.message || "No se pudo quitar el codigo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, background: C.bg, padding: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: C.t0 }}>Codigos de barra</span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>uno o varios por marca/proveedor</span>
      </div>
      {barcodes.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {barcodes.map((row) => (
            <span
              key={`${row.id || "legacy"}-${row.codigo}`}
              title={row.etiqueta || (row.legacy ? "Principal legacy" : "Codigo alternativo")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.blue, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 850, fontFamily: C.mono }}
            >
              {row.codigo}
              {row.variante && <span style={{ fontFamily: C.sans, color: C.bg, background: C.blue, padding: "1px 4px", borderRadius: 4 }}>{row.variante}</span>}
              {row.etiqueta && <span style={{ fontFamily: C.sans, color: C.t2, fontWeight: 700 }}>{row.etiqueta}</span>}
              <button type="button" onClick={() => removeCode(row)} disabled={saving} title="Quitar codigo" style={{ border: "none", background: "transparent", color: C.blue, cursor: saving ? "default" : "pointer", padding: 0, display: "grid", placeItems: "center" }}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: C.t2, fontSize: 11.5 }}>Sin codigos cargados.</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: material.variantes?.length > 0 ? "minmax(130px, 1fr) minmax(100px, 0.7fr) minmax(100px, 0.7fr) auto" : "minmax(160px, 1fr) minmax(120px, 0.7fr) auto", gap: 6 }}>
        <input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
          placeholder="Escanear o escribir codigo"
          style={{ ...INP, fontFamily: C.mono }}
        />
        {material.variantes?.length > 0 && (
          <select
            value={newVariante}
            onChange={(e) => setNewVariante(e.target.value)}
            style={INP}
          >
            <option value="">Variante (opc)</option>
            {material.variantes.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Etiqueta opcional"
          style={INP}
        />
        <button type="button" onClick={addCode} disabled={saving || !newCode.trim()} style={{ ...BTN_GREEN, padding: "7px 12px", whiteSpace: "nowrap", opacity: saving || !newCode.trim() ? 0.55 : 1 }}>
          + Codigo
        </button>
      </div>
      {err && <div style={{ color: C.red, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}

// Botón chico para ver/editar la observación de un material sin abrir el editor
// completo — pensado para uso rápido durante un conteo o una revisión al vuelo.
function NotasQuickButton({ material, onChanged }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(material.notas || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(material.notas || ""); }, [material.notas]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await actualizarNotasMaterial(material.id, value);
      onChanged?.();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={material.notas ? `Observación: ${material.notas}` : "Agregar observación"}
        style={{ ...BTN, padding: "5px 9px", color: material.notas ? C.amber : C.t2 }}
      >
        <StickyNote size={13} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40,
            width: 260, background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 10,
            padding: 10, boxShadow: "0 12px 28px rgba(0,0,0,0.35)", display: "grid", gap: 8,
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: 0.6, color: C.t2, textTransform: "uppercase", fontWeight: 700 }}>Observaciones</span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Notas sobre este material…"
            style={{ ...INP, width: "100%", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setOpen(false)} style={{ ...BTN, padding: "5px 10px" }}>Cerrar</button>
            <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GREEN, padding: "5px 10px" }}>{saving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function addonEstaMovible(addon = {}) {
  return !["en_panol", "recibido", "egresado"].includes(String(addon.estado || "").toLowerCase());
}

function MaterialAddonAssociations({ material, obras = [], onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const isAddonMaterial = material?.origen === "addon_obra";
  const obrasOrdenadas = useMemo(
    () => (obras ?? []).slice().sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true })),
    [obras],
  );
  const obraById = useMemo(() => new Map(obrasOrdenadas.map((obra) => [obra.id, obra])), [obrasOrdenadas]);

  const load = useCallback(async () => {
    if (!isAddonMaterial || !material?.id) return;
    setLoading(true);
    setErr("");
    try {
      setRows(await fetchAddonsMaterial(material.id));
    } catch (error) {
      setErr(error?.message || "No se pudieron cargar las obras asociadas.");
    } finally {
      setLoading(false);
    }
  }, [isAddonMaterial, material?.id]);

  useEffect(() => { load(); }, [load]);

  async function move(addon, nextObraId) {
    if (!addon?.id || !nextObraId || nextObraId === addon.obra_id || busy) return;
    setBusy(addon.id);
    setErr("");
    try {
      await reasignarAddon(addon.id, nextObraId, {
        materialId: material.id,
        fromObraId: addon.obra_id,
        descripcion: addon.descripcion || material.descripcion || "",
      });
      await load();
      await onChanged?.();
    } catch (error) {
      setErr(error?.message || "No se pudo reasignar el adicional.");
    } finally {
      setBusy("");
    }
  }

  if (!isAddonMaterial) return null;

  return (
    <div style={{ border: `1px solid ${C.violet}33`, background: "rgba(139,92,246,0.08)", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: C.t0 }}>Asociaciones de obra</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Este material nació como adicional/opcional. Podés moverlo a otra obra si todavía no entró a pañol.</div>
        </div>
        <button type="button" onClick={load} disabled={loading} style={{ ...BTN, padding: "6px 9px" }}>
          <RefreshCw size={13} /> {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>
      {err && <div style={{ fontSize: 11.5, color: C.red }}>{err}</div>}
      {loading ? (
        <div style={{ fontSize: 12, color: C.t2 }}>Cargando asociaciones...</div>
      ) : rows.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((addon) => {
            const meta = addonTipoMeta(addon.tipo);
            const current = obraById.get(addon.obra_id);
            const movible = addonEstaMovible(addon);
            return (
              <div key={addon.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, .8fr)", gap: 8, alignItems: "center", border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: `${meta.color}16`, border: `1px solid ${meta.color}44`, borderRadius: 999, padding: "2px 7px" }}>{meta.label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 850, color: C.t0 }}>{current?.codigo || "Sin obra"}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t2 }}>{qtyText(addon.cantidad || 1, addon.unidad || material.unidad_medida || "unidad")}</span>
                  </div>
                  {addon.observaciones && <div style={{ fontSize: 11, color: C.t2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addon.observaciones}</div>}
                </div>
                <select
                  value={addon.obra_id || ""}
                  disabled={!movible || busy === addon.id}
                  onChange={(e) => move(addon, e.target.value)}
                  style={{ ...INP, height: 34, opacity: movible ? 1 : 0.62 }}
                  title={movible ? "Reasignar a otra obra" : "Ya tiene movimiento de pañol; mover desde stock para conservar kardex"}
                >
                  <option value="" style={OPT_ST}>Sin obra</option>
                  {obrasOrdenadas.map((obra) => <option key={obra.id} value={obra.id} style={OPT_ST}>{obra.codigo || "Sin codigo"}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.t2, border: `1px dashed ${C.b0}`, borderRadius: 10, padding: 10, textAlign: "center" }}>
          No hay obras asociadas a este adicional.
        </div>
      )}
    </div>
  );
}

function MaterialFila({ material, categorias, ums, proveedores, obras = [], onChanged, linea = "", initialOpen = false }) {
  const [editing, setEditing] = useState(initialOpen);
  const [draft, setDraft] = useState(() => ({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) }));
  const [cantidades, setCantidades] = useState(() => toBomMap(material));
  const [sectores, setSectores] = useState(() => (material.areas?.length ? material.areas : [material.categoria_id].filter(Boolean)));
  const [provExtra, setProvExtra] = useState(() => (material.proveedores_lista || []).map((p) => ({ ...p })));
  const [variantes, setVariantes] = useState(() => materialVariants(material));
  const [variantesPrecios, setVariantesPrecios] = useState(() => material?.variantes_precios || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) });
    setCantidades(toBomMap(material));
    setSectores(material.areas?.length ? material.areas : [material.categoria_id].filter(Boolean));
    setProvExtra((material.proveedores_lista || []).map((p) => ({ ...p })));
    setVariantes(materialVariants(material));
    setVariantesPrecios(material?.variantes_precios || {});
  }, [material]);

  const mainProviderMeta = useMemo(() => proveedorMeta(material.proveedor, proveedores), [material.proveedor, proveedores]);

  async function save() {
    if (!draft.descripcion?.trim() || saving) return;
    setSaving(true);
    try {
      const primary = sectores[0] ?? draft.categoria_id ?? null;
      const prepared = prepareMaterialDraftForSave({ ...draft, categoria_id: primary }, proveedores, variantes, variantesPrecios);
      await guardarMaterial(prepared, cantidades, { revisado: draft.revisado });
      await setSectoresMaterial(material.id, sectores);
      await setProveedoresMaterial(material.id, provExtra);
      onChanged?.(); setEditing(false);
    } finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm(`¿Borrar "${material.descripcion}"?`)) return;
    await borrarMaterial(material.id); onChanged?.();
  }

  const sector = categorias.find((c) => c.id === material.categoria_id)?.nombre;
  const bom = toBomMap(material);
  const lineasConQty = MODELOS.filter((m) => toNum(bom[m]) > 0);
  const review = reviewInfoForMaterial(material);
  const savedVariants = materialVariants(material);
  const lbl = { fontSize: 10, letterSpacing: 0.6, color: C.t2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 };

  return (
    <div style={{ border: `1px solid ${editing ? C.b1 : review.flag ? C.amberB : C.b0}`, borderRadius: 10, marginBottom: 6, background: editing ? "var(--panel)" : review.flag ? C.amberL : C.s0, overflow: "hidden" }}>
      <div onClick={() => setEditing((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.t0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion || "(sin descripción)"}</div>
          <div style={{ display: "flex", gap: 7, marginTop: 2, fontSize: 11, color: C.t2, alignItems: "center", flexWrap: "wrap" }}>
            {review.flag && <ReviewBadge reason={review.reason} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{material.proveedor || "Sin proveedor"}</span>
            <ProveedorTipoBadge meta={mainProviderMeta} compact />
            <ProveedorAlternativasHint proveedor={material.proveedor} proveedores={proveedores} compact />
            {material.proveedores_lista?.length > 0 && (
              <span title={`Otros proveedores: ${material.proveedores_lista.map((p) => (proveedores.find((x) => x.id === p.proveedor_id)?.nombre || "?") + (p.precio != null && p.precio !== "" ? ` $${p.precio}${p.moneda ? " " + p.moneda : ""}` : "")).join(" · ")}`}
                style={{ fontSize: 9.5, fontWeight: 700, color: C.t3, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>
                +{material.proveedores_lista.length} prov
              </span>
            )}
            {sector && <span style={{ color: C.t3 }}>· {sector}</span>}
            {material.areas?.length > 1 && (
              <span title={`Multi-sector: ${material.areas.map((a) => categorias.find((c) => c.id === a)?.nombre).filter(Boolean).join(", ")}`}
                style={{ fontSize: 9.5, fontWeight: 800, color: C.violet || "#a78bfa", background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.32)", borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>
                ⊞ {material.areas.length} sectores
              </span>
            )}
            {material.codigo && <span style={{ fontFamily: C.mono, color: C.t3 }}>· {material.codigo}</span>}
            {savedVariants.length > 0 && (
              <span title={`Variantes: ${savedVariants.join(" / ")}`} style={{ fontSize: 9.5, fontWeight: 800, color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>
                variantes {savedVariants.join(" / ")}
              </span>
            )}
            <MaterialLinksSummary links={material.links} />
          </div>
        </div>
        {lineasConQty.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
            {lineasConQty.map((m) => {
              const on = linea === m;
              return (
                <span key={m} title={`Lleva ${toNum(bom[m])} en la línea K${m}`}
                  style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: on ? "#fff" : C.blue,
                    background: on ? C.blue : "rgba(59,130,246,0.1)", border: `1px solid ${on ? C.blue : "rgba(59,130,246,0.25)"}`,
                    borderRadius: 6, padding: "2px 7px" }}>
                  K{m} {toNum(bom[m])}
                </span>
              );
            })}
          </div>
        )}
        {material.revisado && <span title="Revisado" style={{ color: C.green, fontSize: 13, flexShrink: 0 }}>✓</span>}
        <NotasQuickButton material={material} onChanged={onChanged} />
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }} title={editing ? "Cerrar" : "Editar"}
          style={{ ...BTN, padding: "5px 9px", color: editing ? C.blue : C.t2, flexShrink: 0 }}>
          <Pencil size={13} />
        </button>
      </div>

      {editing && (
        <div style={{ padding: "0 12px 12px", display: "grid", gap: 9 }}>
          <div>
            <span style={lbl}>Descripción</span>
            <input value={draft.descripcion || ""} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={{ ...INP, width: "100%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, .7fr) minmax(260px, 1fr)", gap: 8, alignItems: "end" }}>
            <div>
              <span style={lbl}>Alias / nombre corto</span>
              <input value={draft.alias || ""} onChange={(e) => setDraft((d) => ({ ...d, alias: e.target.value }))} placeholder="Opcional" style={{ ...INP, width: "100%" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <MaterialThumb material={{ ...material, imagen_url: draft.imagen_url }} size={46} />
              <input value={draft.imagen_url || ""} onChange={(e) => setDraft((d) => ({ ...d, imagen_url: e.target.value }))} placeholder="URL de imagen" style={{ ...INP, flex: "1 1 220px" }} />
              <MaterialImageUploader material={material} onUploaded={onChanged} compact />
            </div>
          </div>
          <div>
            <span style={lbl}>Variantes del item (marcas/modelos aceptables)</span>
            <VariantsEditor
              value={variantes}
              onChange={setVariantes}
              precios={variantesPrecios}
              onPreciosChange={setVariantesPrecios}
              description={draft.descripcion}
              proveedores={proveedores}
              onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))}
            />
          </div>
          <div>
            <span style={lbl}>Proveedor principal</span>
            <ProveedorSelect value={draft.proveedor_id || ""} textValue={draft.proveedor || ""} proveedores={proveedores} onCreated={onChanged} onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))} />
            <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="O escribir libre…" style={{ ...INP, width: "100%", marginTop: 5 }} />
          </div>
          <div>
            <span style={lbl}>Otros proveedores · cada uno con su precio</span>
            <div style={{ display: "grid", gap: 6 }}>
              {provExtra.map((p, i) => (
                <div key={p.proveedor_id || i} style={{ display: "grid", gridTemplateColumns: "1fr 92px 78px 34px", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proveedores.find((pr) => pr.id === p.proveedor_id)?.nombre || "—"}</span>
                  <input type="number" step="any" placeholder="Precio" value={p.precio ?? ""} onChange={(e) => setProvExtra((prev) => prev.map((x, j) => (j === i ? { ...x, precio: e.target.value } : x)))} style={{ ...INP, fontFamily: C.mono }} />
                  <select value={p.moneda || ""} onChange={(e) => setProvExtra((prev) => prev.map((x, j) => (j === i ? { ...x, moneda: e.target.value || null } : x)))} style={{ ...INP }}>{MONEDAS.map((m) => <option key={m || "n"} value={m}>{m || "—"}</option>)}</select>
                  <button type="button" onClick={() => setProvExtra((prev) => prev.filter((_, j) => j !== i))} style={{ ...BTN, color: C.red, padding: "5px 7px" }} title="Quitar"><Trash2 size={12} /></button>
                </div>
              ))}
              <select value="" onChange={(e) => { const id = e.target.value; if (!id) return; if (provExtra.some((x) => x.proveedor_id === id) || draft.proveedor_id === id) return; setProvExtra((prev) => [...prev, { proveedor_id: id, precio: "", moneda: draft.moneda || "" }]); }} style={{ ...INP, width: "100%" }}>
                <option value="">+ Agregar proveedor alternativo…</option>
                {proveedores.filter((pr) => pr.activo !== false).map((pr) => <option key={pr.id} value={pr.id} style={OPT_ST}>{pr.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 88px 1fr", gap: 8 }}>
            <div><span style={lbl}>UM</span><input list="materiales-ums" value={draft.unidad_medida || ""} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={{ ...INP, width: "100%" }} /><datalist id="materiales-ums">{ums.map((u) => <option key={u} value={u} />)}</datalist></div>
            <div><span style={lbl}>Precio</span><input type="number" step="any" value={draft.precio_unitario ?? ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} /></div>
            <div><span style={lbl}>Moneda</span><select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value || null }))} style={{ ...INP, width: "100%" }}>{MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "—"}</option>)}</select></div>
            <div><span style={lbl}>Código</span><input value={draft.codigo || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={{ ...INP, width: "100%" }} /></div>
          </div>
          <MaterialBarcodeEditor material={material} onChanged={onChanged} />
          <MaterialLinksEditor value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} />
          <div>
            <span style={lbl}>Cantidad por línea</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {MODELOS.map((modelo) => (
                <div key={modelo} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, color: linea === modelo ? C.blue : C.t2, fontWeight: 700, fontFamily: C.mono }}>K{modelo}</span>
                  <input type="number" step="any" value={cantidades[modelo] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, width: 82, fontFamily: C.mono }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <span style={lbl}>Sectores · el ★ es el principal (tocá para sumar/quitar)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {categorias.map((c) => {
                const idx = sectores.indexOf(c.id);
                const on = idx >= 0;
                return (
                  <button type="button" key={c.id} onClick={() => setSectores((prev) => on ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                    style={{ fontSize: 10.5, fontWeight: 700, cursor: "pointer", borderRadius: 999, padding: "3px 9px", border: `1px solid ${on ? (C.violet || "#a78bfa") : C.b0}`, background: on ? "rgba(167,139,250,0.14)" : "transparent", color: on ? (C.violet || "#a78bfa") : C.t2 }}>
                    {idx === 0 ? "★ " : on ? "✓ " : ""}{c.nombre}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span style={lbl}>Observaciones</span>
            <textarea value={draft.notas || ""} onChange={(e) => setDraft((d) => ({ ...d, notas: e.target.value }))} rows={2} placeholder="Notas sobre este material…" style={{ ...INP, width: "100%", resize: "vertical" }} />
          </div>
          <MaterialAddonAssociations material={material} obras={obras} onChanged={onChanged} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: draft.revisado ? C.green : C.t2 }}>
            <input type="checkbox" checked={!!draft.revisado} onChange={(e) => setDraft((d) => ({ ...d, revisado: e.target.checked }))} /> Revisado
          </label>
          <MaterialAuditTrail materialId={material.id} onRestored={onChanged} />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GREEN, padding: "7px 16px", display: "inline-flex", alignItems: "center", gap: 5 }}><Save size={13} /> Guardar</button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...BTN, padding: "7px 14px" }}>Cancelar</button>
            <button type="button" onClick={remove} style={{ ...BTN, color: C.red, padding: "7px 10px", marginLeft: "auto" }} title="Borrar"><Trash2 size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function PrepararCompra({ items, linea, categorias = [], obra = null, addons = [] }) {
  const [open, setOpen] = useState(false);
  const [groupBy, setGroupBy] = useState("proveedor");
  const [copied, setCopied] = useState(false);
  const [creando, setCreando] = useState(null);
  const [hechos, setHechos] = useState([]);
  const [genErr, setGenErr] = useState(null);
  const [pedidoTipo, setPedidoTipo] = useState(null);

  const orderRows = useMemo(() => {
    const matRows = (items ?? []).map((m) => {
      const precio = priceInfo(m);
      return {
        descripcion: m.descripcion,
        codigo: m.codigo,
        cantidad: materialQty(m, linea) || 1,
        unidad: m.unidad_medida || "unidad",
        proveedor: precio.proveedor || m.proveedor || "Sin proveedor",
        rubro: categoriaNombre(categorias, m.categoria_id),
        tipo: materialBucket(m).label,
        obs: m.notas || "",
        precio,
      };
    });
    const addRows = (addons ?? []).map((a) => ({
      descripcion: a.descripcion,
      codigo: "",
      cantidad: a.cantidad || 1,
      unidad: "unidad",
      proveedor: a.proveedor || "Sin proveedor",
      rubro: a.tipo === "opcional" ? "Opcionales" : "Adicionales",
      tipo: "Addon",
      obs: a.observaciones || "",
      precio: { amount: 0, moneda: null, proveedor: a.proveedor || "" },
    }));
    return [...matRows, ...addRows];
  }, [items, linea, categorias, addons]);

  async function pedirGrupo(g) {
    if (!pedidoTipo) {
      setGenErr("Elegí el tipo de pedido.");
      return;
    }
    setCreando(g.label); setGenErr(null);
    try {
      const req = await createPurchaseRequest({ form: {
        title: `Pedido ${obra?.codigo || `K${linea}`} · ${g.label}`,
        description: `${g.items.length} ítems${obra ? ` del barco ${obra.codigo}` : ` de la línea K${linea}`} (${groupBy}: ${g.label}).`,
        priority: "media", source: "materiales", project_id: obra?.id || null, es_adicional: pedidoTipo === "adicional", tipo_pedido: pedidoTipo,
      } });
      for (const row of g.items) {
        await addRequestItem(req.id, { description: row.descripcion, quantity: toNum(row.cantidad) || 1, unit: row.unidad || null });
      }
      setHechos((h) => [...h, g.label]);
    } catch (e) {
      setGenErr(e?.message || "No se pudo crear el pedido.");
    } finally {
      setCreando(null);
    }
  }

  const grupos = useMemo(() => {
    const map = {};
    orderRows.forEach((row) => {
      const key = (groupBy === "rubro" ? row.rubro : groupBy === "tipo" ? row.tipo : row.proveedor).trim() || "Sin clasificar";
      if (!map[key]) map[key] = { label: key, items: [], usd: 0, ars: 0 };
      map[key].items.push(row);
      if (row.precio.amount) {
        if (row.precio.moneda === "USD") map[key].usd += row.precio.amount * (toNum(row.cantidad) || 1);
        else map[key].ars += row.precio.amount * (toNum(row.cantidad) || 1);
      }
    });
    return Object.values(map).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, "es"));
  }, [orderRows, groupBy]);

  async function copiarTodo() {
    const text = buildOrdenTexto({ obra: { codigo: `K${linea}` }, lineaNombre: `K${linea}`, rows: orderRows, groupBy });
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (!items?.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...BTN, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
        <ShoppingCart size={14} /> Preparar orden de compra {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 11.5, color: C.t2, flex: "1 1 240px" }}>
              {obra ? `Pedido estándar de ${obra.codigo} (base matriz + addons).` : "Para compras, agrupado por proveedor, rubro o tipo."} Generá el pedido directo o copialo en texto.
            </div>
            <div style={{ display: "inline-flex", gap: 6, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 4, background: C.s0 }}>
              {[
                { value: "stock", label: "Stock pañol", color: C.green },
                { value: "estandar", label: "Estándar", color: C.blue },
                { value: "adicional", label: "Adicional", color: C.violet },
              ].map(({ value, label, color }) => (
                <button key={label} type="button" onClick={() => setPedidoTipo(value)} style={{ ...BTN, padding: "6px 10px", color: pedidoTipo === value ? color : C.t2, background: pedidoTipo === value ? `${color}18` : "transparent", borderColor: pedidoTipo === value ? color : "transparent", fontWeight: 900 }}>
                  {label}
                </button>
              ))}
            </div>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...INP, width: 150 }}>
              <option value="proveedor" style={OPT_ST}>Proveedor</option>
              <option value="rubro" style={OPT_ST}>Rubro</option>
              <option value="tipo" style={OPT_ST}>Tipo</option>
            </select>
            <button type="button" onClick={copiarTodo} style={{ ...BTN_GREEN, padding: "8px 13px" }}>
              <Copy size={13} /> {copied ? "Copiado" : "Copiar orden"}
            </button>
          </div>
          {genErr && <div style={{ fontSize: 12, color: C.red }}>{genErr}</div>}
          {grupos.map((g) => (
            <div key={g.label} style={{ border: `1px solid ${C.b0}`, borderRadius: 10, background: C.s0, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</div>
                <div style={{ fontSize: 11.5, color: C.t2 }}>
                  {g.items.length} items{g.usd ? ` · ${fmtMoney(g.usd, "USD")}` : ""}{g.ars ? ` · ${fmtMoney(g.ars, "ARS")}` : ""}
                </div>
              </div>
              {hechos.includes(g.label)
                ? <span style={{ fontSize: 12, color: C.green, fontWeight: 800, flexShrink: 0 }}>✓ Pedido creado</span>
                : <button type="button" onClick={() => pedirGrupo(g)} disabled={creando === g.label} style={{ ...BTN_GREEN, padding: "6px 12px", flexShrink: 0 }}>{creando === g.label ? "Creando…" : "Pedir a compras"}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgregarItemLinea({ linea, title, materiales = [], categorias = [], proveedores = [], ums = [], onChanged }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("existente");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState({
    descripcion: "",
    alias: "",
    codigo: "",
    codigo_barra: "",
    categoria_id: "",
    proveedor_id: "",
    proveedor: "",
    unidad_medida: "unidad",
    precio_unitario: "",
    moneda: "",
    imagen_url: "",
    links: [],
    notas: "",
  });
  const [variantesNuevo, setVariantesNuevo] = useState([]);
  const [variantesPreciosNuevo, setVariantesPreciosNuevo] = useState({});
  const [codigosExtraNuevo, setCodigosExtraNuevo] = useState([]);
  const [imageFileNuevo, setImageFileNuevo] = useState(null);
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    if (!draft.categoria_id && categorias[0]?.id) setDraft((d) => ({ ...d, categoria_id: categorias[0].id }));
  }, [categorias, draft.categoria_id]);

  const existentesFuera = useMemo(
    () => (materiales ?? []).filter(materialActivo).filter((m) => materialQty(m, linea) <= 0),
    [materiales, linea],
  );

  const candidatos = useMemo(() => {
    const query = q.trim();
    if (query.length >= 2) return topMateriales(existentesFuera, query).slice(0, 8);
    return existentesFuera
      .slice()
      .sort((a, b) => (a.descripcion || "").localeCompare(b.descripcion || "", "es"))
      .slice(0, 8);
  }, [existentesFuera, q]);

  const selected = existentesFuera.find((m) => m.id === selectedId);
  const qty = toNum(cantidad);
  const canSaveExisting = selected && qty != null && qty > 0;
  const canCreateCatalogOnly = draft.descripcion.trim() && draft.categoria_id;
  const canSaveNew = canCreateCatalogOnly && qty != null && qty > 0;

  function resetSoft() {
    setQ("");
    setSelectedId("");
    setCantidad("1");
    setDraft((d) => ({
      ...d,
      descripcion: "",
      alias: "",
      codigo: "",
      codigo_barra: "",
      proveedor_id: "",
      proveedor: "",
      precio_unitario: "",
      moneda: "",
      imagen_url: "",
      links: [],
      notas: "",
      unidad_medida: d.unidad_medida || "unidad",
    }));
    setVariantesNuevo([]);
    setVariantesPreciosNuevo({});
    setCodigosExtraNuevo([]);
    setImageFileNuevo(null);
    setOkMsg("");
  }

  async function addExisting() {
    if (!canSaveExisting || saving) return;
    setSaving(true); setErr(null);
    try {
      await setCantidadModelo(selected.id, linea, cantidad);
      resetSoft();
      await onChanged?.();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  async function createAndAdd() {
    if (!canSaveNew || saving) return;
    setSaving(true); setErr(null);
    try {
      const id = await crearMaterial(prepareMaterialDraftForSave({ ...draft, revisado: false }, proveedores, variantesNuevo, variantesPreciosNuevo), {});
      if (imageFileNuevo) await uploadMaterialImage(id, imageFileNuevo);
      for (const row of codigosExtraNuevo) {
        if (row.codigo?.trim()) await agregarCodigoBarraMaterial(id, row.codigo, { etiqueta: row.etiqueta, variante: row.variante || null });
      }
      await setCantidadModelo(id, linea, cantidad);
      resetSoft();
      setMode("existente");
      await onChanged?.();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  async function createCatalogOnly() {
    if (!canCreateCatalogOnly || saving) return;
    setSaving(true); setErr(null); setOkMsg("");
    try {
      const id = await crearMaterial(prepareMaterialDraftForSave({ ...draft, revisado: false }, proveedores, variantesNuevo, variantesPreciosNuevo), {});
      if (imageFileNuevo) await uploadMaterialImage(id, imageFileNuevo);
      for (const row of codigosExtraNuevo) {
        if (row.codigo?.trim()) await agregarCodigoBarraMaterial(id, row.codigo, { etiqueta: row.etiqueta, variante: row.variante || null });
      }
      resetSoft();
      setMode("existente");
      setOkMsg("Item creado en catalogo sin cantidad de matriz. Ahora lo podes usar en condicionantes.");
      await onChanged?.();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...BTN_GREEN, padding: "9px 14px", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <PackagePlus size={14} /> Agregar ítem a {title || `K${linea}`}
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${C.greenB || C.b1}`, borderRadius: 14, background: C.greenL || C.s0, padding: 13, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 950, color: C.t0 }}>Agregar ítem a {title || `K${linea}`}</div>
          <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>Sumá un material existente o creá uno nuevo ya vinculado a esta matriz.</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ ...BTN, padding: "6px 10px" }}>Cerrar</button>
      </div>

      <div style={{ display: "inline-flex", gap: 3, background: C.bg, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 3, marginBottom: 10 }}>
        {[
          ["existente", "Existente"],
          ["nuevo", "Nuevo"],
        ].map(([key, label]) => {
          const on = mode === key;
          return (
            <button key={key} type="button" onClick={() => { setMode(key); setErr(null); }} style={{ border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 850, color: on ? "#fff" : C.t2, background: on ? C.blue : "transparent" }}>
              {label}
            </button>
          );
        })}
      </div>

      {mode === "existente" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 92px auto", gap: 8, alignItems: "center" }}>
            <input value={q} onChange={(e) => { setQ(e.target.value); setSelectedId(""); }} placeholder="Buscar material fuera de esta línea..." style={{ ...INP, height: 38 }} />
            <input type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cant." style={{ ...INP, height: 38, fontFamily: C.mono }} />
            <button type="button" onClick={addExisting} disabled={!canSaveExisting || saving} style={{ ...BTN_GREEN, height: 38, padding: "0 13px" }}>
              {saving ? "Agregando..." : "Agregar"}
            </button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {candidatos.map((m) => {
              const on = selectedId === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{ textAlign: "left", border: `1px solid ${on ? C.blueB : C.b0}`, background: on ? C.blueL : C.bg, color: C.t0, borderRadius: 10, padding: "9px 11px", cursor: "pointer", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</span>
                    <span style={{ display: "block", fontSize: 11, color: C.t2, marginTop: 2 }}>{categoriaNombre(categorias, m.categoria_id)}{m.proveedor ? ` · ${m.proveedor}` : ""}</span>
                  </span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t2, whiteSpace: "nowrap" }}>{m.unidad_medida || "unidad"}</span>
                </button>
              );
            })}
            {!candidatos.length && (
              <div style={{ padding: 14, color: C.t2, fontSize: 12, border: `1px dashed ${C.b0}`, borderRadius: 10, textAlign: "center" }}>
                No encontré materiales para agregar. Podés crearlo desde la pestaña Nuevo.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.4fr) minmax(130px, .6fr) 92px", gap: 8 }}>
            <input value={draft.descripcion} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} placeholder="Descripción del material" style={{ ...INP, height: 38, fontWeight: 750 }} />
            <input value={draft.unidad_medida} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} list="linea-add-ums" placeholder="Unidad" style={{ ...INP, height: 38 }} />
            <input type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cant." style={{ ...INP, height: 38, fontFamily: C.mono }} />
          </div>
          <datalist id="linea-add-ums">
            {ums.map((u) => <option key={u} value={u} />)}
          </datalist>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(170px, .8fr) minmax(210px, 1fr) minmax(130px, .6fr) minmax(130px, .6fr)", gap: 8, alignItems: "center" }}>
            <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={{ ...INP, height: 38 }}>
              <option value="" style={OPT_ST}>Elegir rubro</option>
              {categorias.map((c) => <option key={c.id} value={c.id} style={OPT_ST}>{categoriaNombre(categorias, c.id)}</option>)}
            </select>
            <ProveedorSelect
              value={draft.proveedor_id}
              textValue={draft.proveedor}
              proveedores={proveedores}
              onCreated={onChanged}
              onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
            />
            <input value={draft.codigo} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} placeholder="Código interno" style={{ ...INP, height: 38 }} />
            <input value={draft.codigo_barra} onChange={(e) => setDraft((d) => ({ ...d, codigo_barra: e.target.value }))} placeholder="Código de barra" style={{ ...INP, height: 38, fontFamily: C.mono }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, .8fr) minmax(160px, .65fr) 110px 94px", gap: 8, alignItems: "center" }}>
            <input value={draft.alias || ""} onChange={(e) => setDraft((d) => ({ ...d, alias: e.target.value }))} placeholder="Alias / nombre corto" style={{ ...INP, height: 38 }} />
            <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Proveedor texto libre" style={{ ...INP, height: 38 }} />
            <input type="number" step="any" value={draft.precio_unitario || ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} placeholder="Precio" style={{ ...INP, height: 38, fontFamily: C.mono }} />
            <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value }))} style={{ ...INP, height: 38 }}>
              {MONEDAS.map((m) => <option key={m || "null"} value={m} style={OPT_ST}>{m || "Moneda"}</option>)}
            </select>
          </div>
          <VariantsEditor
            value={variantesNuevo}
            onChange={setVariantesNuevo}
            precios={variantesPreciosNuevo}
            onPreciosChange={setVariantesPreciosNuevo}
            description={draft.descripcion}
            proveedores={proveedores}
            onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))}
          />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, .95fr) minmax(320px, 1.05fr)", gap: 10 }}>
            <PendingImagePicker
              file={imageFileNuevo}
              onChange={setImageFileNuevo}
              imageUrl={draft.imagen_url}
              onImageUrlChange={(imagen_url) => setDraft((d) => ({ ...d, imagen_url }))}
            />
            <DraftBarcodeEditor value={codigosExtraNuevo} onChange={setCodigosExtraNuevo} variantes={variantesNuevo} />
          </div>
          <MaterialLinksEditor value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} compact />
          <textarea value={draft.notas || ""} onChange={(e) => setDraft((d) => ({ ...d, notas: e.target.value }))} rows={2} placeholder="Observaciones reales del item" style={{ ...INP, width: "100%", resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={createCatalogOnly} disabled={!canCreateCatalogOnly || saving} style={{ ...BTN, height: 38, padding: "0 14px", color: C.blue, opacity: !canCreateCatalogOnly || saving ? 0.6 : 1 }} title="Crea el material sin sumarlo a ninguna matriz">
              {saving ? "Creando..." : "Crear solo en catalogo"}
            </button>
            <button type="button" onClick={createAndAdd} disabled={!canSaveNew || saving} style={{ ...BTN_GREEN, height: 38, padding: "0 14px", opacity: !canSaveNew || saving ? 0.6 : 1 }}>
              {saving ? "Creando..." : `Crear y agregar a K${linea}`}
            </button>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 9, fontSize: 12, color: C.red }}>{err.message || "No se pudo guardar el ítem."}</div>}
      {okMsg && <div style={{ marginTop: 9, fontSize: 12, color: C.green }}>{okMsg}</div>}
    </div>
  );
}

function addonTipoMeta(tipo) {
  const opcional = tipo === "opcional";
  const color = opcional ? C.blue : C.violet;
  return {
    key: opcional ? "opcional" : "adicional",
    label: opcional ? "Opcional" : "Adicional",
    color,
    bg: opcional ? C.blueL : `${color}16`,
    border: opcional ? C.blueB : `${color}44`,
  };
}

function addonPayloadFromMaterial(material, { cantidad, tipo = "adicional", observaciones = "", imagenUrl = "" } = {}) {
  return {
    material_id: material?.id || null,
    descripcion: String(material?.descripcion || "").trim(),
    cantidad: toNum(cantidad) || 1,
    proveedor: material?.proveedor || null,
    tipo,
    observaciones: String(observaciones || "").trim() || null,
    codigo: material?.codigo || null,
    unidad: material?.unidad_medida || null,
    categoria_id: material?.categoria_id || null,
    proveedor_id: material?.proveedor_id || null,
    precio_unitario: material?.precio_unitario ?? material?.ultimo_precio?.precio_unitario ?? null,
    moneda: material?.moneda || material?.ultimo_precio?.moneda || null,
    imagen_url: imagenUrl || material?.imagen_url || null,
    links: normalizeMaterialLinks(material?.links),
    codigo_barra: material?.codigo_barra || null,
    variantes: normalizeVariantList(material?.variantes),
  };
}

function addonCatalogOriginNote(tipo, obraCodigo) {
  const code = String(obraCodigo || "").trim();
  if (!code) return "";
  return `Fue ${tipo === "opcional" ? "opcional" : "adicional"} de ${code}.`;
}

function appendNoteOnce(value, note) {
  const base = String(value || "").trim();
  const clean = String(note || "").trim();
  if (!clean) return base;
  if (norm(base).includes(norm(clean))) return base;
  return [base, clean].filter(Boolean).join("\n");
}

function addonPriceInfo(addon, material) {
  if (material?.id) return priceInfo(material);
  const amount = addon?.precio_unitario != null && addon.precio_unitario !== "" ? Number(addon.precio_unitario) : null;
  const moneda = addon?.moneda === "USD" ? "USD" : "ARS";
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    moneda,
    text: Number.isFinite(amount) && amount > 0 ? fmtMoney(amount, moneda) : "Sin precio",
    proveedor: addon?.proveedor || "",
  };
}

function addonRowToView(addon, materialById, categorias = []) {
  const material = materialById.get(addon.material_id) || null;
  const tipoMeta = addonTipoMeta(addon.tipo);
  const precio = addonPriceInfo(addon, material);
  const descripcion = material?.descripcion || addon.descripcion || "Item adicional";
  const codigo = material?.codigo || addon.codigo || "";
  const unidad = addon.unidad || material?.unidad_medida || "unidad";
  const rubro = material ? categoriaNombre(categorias, material.categoria_id) : categoriaNombre(categorias, addon.categoria_id) || (addon.tipo === "opcional" ? "Opcionales" : "Adicionales");
  const reason = reviewReasonForText(`${descripcion} ${codigo} ${addon.observaciones || ""}`);
  return {
    id: `addon:${addon.id}`,
    addonId: addon.id,
    materialId: addon.material_id || null,
    material,
    source: "addon",
    descripcion,
    codigo,
    cantidad: addon.cantidad || 1,
    unidad,
    proveedor: precio.proveedor || material?.proveedor || addon.proveedor || "Sin proveedor",
    rubro,
    precio,
    bucket: { key: "addon", label: tipoMeta.label, color: tipoMeta.color },
    obs: addon.observaciones || material?.notas || "",
    imagen_url: material?.imagen_url || addon.imagen_url || "",
    links: normalizeMaterialLinks(material?.links?.length ? material.links : addon.links),
    variante: addon.variante || "",
    revisado: material?.revisado ?? true,
    review: { flag: !!reason || !!material?.review?.flag, reason: reason || material?.review?.reason || "" },
    estadoObra: addon.estado || "pendiente",
  };
}

function emptyAddonDraft(categorias = []) {
  return {
    descripcion: "",
    alias: "",
    codigo: "",
    codigo_barra: "",
    categoria_id: categorias[0]?.id || "",
    proveedor_id: "",
    proveedor: "",
    unidad_medida: "unidad",
    precio_unitario: "",
    moneda: "",
    imagen_url: "",
    links: [],
    notas: "",
  };
}

function addonDraftFromRow(addon, categorias = []) {
  return {
    ...emptyAddonDraft(categorias),
    descripcion: addon?.descripcion || "",
    alias: addon?.alias || "",
    codigo: addon?.codigo || "",
    codigo_barra: addon?.codigo_barra || "",
    categoria_id: addon?.categoria_id || categorias[0]?.id || "",
    proveedor_id: addon?.proveedor_id || "",
    proveedor: addon?.proveedor || "",
    unidad_medida: addon?.unidad || addon?.unidad_medida || "unidad",
    precio_unitario: addon?.precio_unitario ?? "",
    moneda: addon?.moneda || "",
    imagen_url: addon?.imagen_url || "",
    links: normalizeMaterialLinks(addon?.links),
    notas: addon?.notas || "",
  };
}

function ObraAddonModal({ open, obra, obras = [], addon = null, materiales = [], categorias = [], proveedores = [], ums = [], onClose, onSaved, onChanged }) {
  const [mode, setMode] = useState("existente");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [tipo, setTipo] = useState("adicional");
  const [targetObraId, setTargetObraId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [draft, setDraft] = useState(() => emptyAddonDraft(categorias));
  const [variantesNuevo, setVariantesNuevo] = useState([]);
  const [codigosExtraNuevo, setCodigosExtraNuevo] = useState([]);
  const [imageFileNuevo, setImageFileNuevo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const editing = !!addon?.id;

  useEffect(() => {
    if (!open) return;
    setMode(addon?.id ? "nuevo" : addon?.material_id ? "existente" : "nuevo");
    setQ(addon?.descripcion || "");
    setSelectedId(addon?.material_id || "");
    setCantidad(String(addon?.cantidad ?? "1"));
    setTipo(addon?.tipo || "adicional");
    setTargetObraId(addon?.obra_id || obra?.id || "");
    setObservaciones(addon?.observaciones || "");
    setDraft(addon ? addonDraftFromRow(addon, categorias) : emptyAddonDraft(categorias));
    setVariantesNuevo(normalizeVariantList(addon?.variantes));
    setCodigosExtraNuevo([]);
    setImageFileNuevo(null);
    setErr(null);
  }, [open, addon, categorias, obra?.id]);

  const obrasDestino = useMemo(() => {
    const map = new Map();
    [...(obras ?? []), obra].filter(Boolean).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    return [...map.values()].sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }));
  }, [obras, obra]);

  const targetObraFinalId = targetObraId || obra?.id || "";
  const targetObra = obrasDestino.find((item) => item.id === targetObraFinalId) || obra;
  const estadoAddon = String(addon?.estado || "").toLowerCase();
  const moveLocked = editing && ["en_panol", "recibido", "egresado"].includes(estadoAddon);
  const snapshotLocked = !!addon?.__snapshotLocked;
  const originNote = addonCatalogOriginNote(tipo, targetObra?.codigo || obra?.codigo);

  function addonSnapshotPatch(payload = {}) {
    return {
      material_id: payload.material_id || null,
      descripcion: payload.descripcion || null,
      codigo: payload.codigo || null,
      cantidad: payload.cantidad || 1,
      unidad: payload.unidad || "unidad",
      proveedor: payload.proveedor || null,
      rubro: categoriaNombre(categorias, payload.categoria_id) || null,
      tipo: "addon",
      tipo_label: addonTipoMeta(payload.tipo || tipo).label,
      precio_unitario: payload.precio_unitario ?? null,
      moneda: payload.moneda || null,
      notas: payload.observaciones || null,
      source: "addon",
    };
  }

  async function syncAddonSnapshot(payload = {}) {
    if (!editing || !addon?.__snapshotId || snapshotLocked) return;
    await updateObraSnapshotRows([addon.__snapshotId], addonSnapshotPatch(payload));
  }

  async function moveAddonIfNeeded() {
    if (!editing || !targetObraFinalId || targetObraFinalId === (addon?.obra_id || obra?.id)) return;
    if (moveLocked || snapshotLocked) throw new Error("Este adicional ya tiene movimiento de pañol. Para moverlo hay que hacerlo desde stock/pañol y conservar el kardex.");
    await reasignarAddon(addon.id, targetObraFinalId, {
      materialId: addon.material_id || null,
      fromObraId: addon.obra_id || obra?.id || null,
      descripcion: addon.descripcion || "",
    });
    if (addon?.__snapshotId) {
      await updateObraSnapshotRows([addon.__snapshotId], { obra_id: targetObraFinalId });
    }
  }

  async function ensureMaterialOriginNote(material) {
    if (!material?.id || !originNote) return material;
    const nextNotas = appendNoteOnce(material.notas, originNote);
    if (nextNotas !== String(material.notas || "").trim()) {
      try {
        await actualizarNotasMaterial(material.id, nextNotas);
      } catch {
        return material;
      }
    }
    return { ...material, notas: nextNotas };
  }

  const candidatos = useMemo(() => {
    const base = (materiales ?? []).filter(materialActivo);
    const query = q.trim();
    if (query.length >= 2) return topMateriales(base, query).slice(0, 10);
    return base
      .slice()
      .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true }))
      .slice(0, 10);
  }, [materiales, q]);

  const selected = candidatos.find((m) => m.id === selectedId) || materiales.find((m) => m.id === selectedId);
  const qty = toNum(cantidad);
  const canSaveExisting = !!selected && qty != null && qty > 0;
  const canSaveNew = draft.descripcion.trim() && qty != null && qty > 0;

  async function saveExisting() {
    if (!canSaveExisting || saving) return;
    setSaving(true); setErr(null);
    try {
      const materialConNota = await ensureMaterialOriginNote(selected);
      const payload = addonPayloadFromMaterial(materialConNota, { cantidad, tipo, observaciones });
      if (editing) {
        await actualizarAddon(addon.id, payload);
        await syncAddonSnapshot(payload);
        await moveAddonIfNeeded();
      } else {
        await crearAddon(targetObraFinalId || obra.id, payload);
      }
      await onSaved?.();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  async function saveNew() {
    if (!canSaveNew || saving) return;
    setSaving(true); setErr(null);
    try {
      const prepared = prepareMaterialDraftForSave({
        ...draft,
        notas: appendNoteOnce(draft.notas, originNote),
        revisado: false,
        origen: "addon_obra",
      }, proveedores, variantesNuevo);
      let materialId = addon?.material_id || null;
      let imageUrl = draft.imagen_url || "";
      if (materialId) {
        await actualizarMaterialDatos({ ...prepared, id: materialId, imagen_url: imageUrl });
      } else {
        materialId = await crearMaterial(prepared, {});
      }
      if (imageFileNuevo) {
        const uploaded = await uploadMaterialImage(materialId, imageFileNuevo);
        imageUrl = uploaded?.url || imageUrl;
      }
      for (const row of codigosExtraNuevo) {
        if (row.codigo?.trim()) await agregarCodigoBarraMaterial(materialId, row.codigo, { etiqueta: row.etiqueta, variante: row.variante || null });
      }
      const payload = addonPayloadFromMaterial({ ...prepared, id: materialId, imagen_url: imageUrl }, { cantidad, tipo, observaciones, imagenUrl: imageUrl });
      if (editing) {
        await actualizarAddon(addon.id, payload);
        await syncAddonSnapshot(payload);
        await moveAddonIfNeeded();
      } else {
        await crearAddon(targetObraFinalId || obra.id, payload);
      }
      await onSaved?.();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(2,6,23,.72)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "min(1040px, calc(100vw - 28px))", maxHeight: "92vh", overflowY: "auto", border: `1px solid ${C.b1}`, borderRadius: 16, background: C.panelSolid, boxShadow: "0 30px 90px rgba(0,0,0,.45)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.panelSolid, borderBottom: `1px solid ${C.b0}`, padding: 16, display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 950, color: C.t0 }}>{editing ? "Editar adicional" : "Agregar item propio"} a {obra?.codigo}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>No modifica la matriz base: queda en el catalogo completo y se asocia a esta obra.</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...BTN, padding: "7px 9px" }} title="Cerrar"><X size={15} /></button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", border: `1px solid ${C.b0}`, background: C.panelSolid2, borderRadius: 12, padding: 10 }}>
            <div style={{ display: "inline-flex", gap: 3, background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 3 }}>
              {[
                ["nuevo", editing ? "Editar datos" : "Crear en catalogo"],
                ["existente", editing ? "Vincular catalogo" : "Catalogo"],
              ].map(([key, label]) => {
                const on = mode === key;
                return (
                  <button key={key} type="button" onClick={() => { setMode(key); setErr(null); }} style={{ border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 850, color: on ? "#fff" : C.t2, background: on ? C.blue : "transparent" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...INP, width: 150, height: 36 }}>
              <option value="adicional" style={OPT_ST}>Adicional</option>
              <option value="opcional" style={OPT_ST}>Opcional</option>
            </select>
            <input type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cant." style={{ ...INP, width: 92, height: 36, fontFamily: C.mono }} />
            <label style={{ display: "grid", gap: 3, flex: "1 1 210px", minWidth: 190 }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, color: C.t2, textTransform: "uppercase", letterSpacing: 0.7 }}>Obra destino</span>
              <select
                value={targetObraFinalId}
                onChange={(e) => setTargetObraId(e.target.value)}
                disabled={moveLocked || snapshotLocked}
                style={{ ...INP, height: 36, opacity: moveLocked || snapshotLocked ? 0.65 : 1 }}
                title={moveLocked || snapshotLocked ? "Este adicional ya tiene movimiento de pañol o compras vinculadas" : "Mover/asociar este adicional a otra obra"}
              >
                {obrasDestino.map((item) => (
                  <option key={item.id} value={item.id} style={OPT_ST}>{item.codigo || "Sin codigo"}</option>
                ))}
              </select>
              {moveLocked || snapshotLocked ? (
                <span style={{ fontSize: 10.5, color: C.amber }}>Ya tiene movimiento de pañol; mover desde stock para conservar kardex.</span>
              ) : null}
            </label>
          </div>

          {mode === "existente" ? (
            <div style={{ display: "grid", gap: 10, border: `1px solid ${C.b0}`, background: C.panelSolid2, borderRadius: 12, padding: 12 }}>
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSelectedId(""); }} placeholder="Buscar material del catalogo..." style={{ ...INP, height: 38 }} />
              <div style={{ display: "grid", gap: 7, maxHeight: 310, overflowY: "auto", paddingRight: 3 }}>
                {candidatos.map((material) => {
                  const on = selectedId === material.id;
                  const precio = priceInfo(material);
                  return (
                    <button key={material.id} type="button" onClick={() => setSelectedId(material.id)} style={{ textAlign: "left", border: `1px solid ${on ? C.blueB : C.b0}`, background: on ? C.blueL : C.bg, color: C.t0, borderRadius: 10, padding: 10, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                      <MaterialThumb material={material} size={42} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion}</span>
                        <span style={{ display: "block", fontSize: 11, color: C.t2, marginTop: 2 }}>{categoriaNombre(categorias, material.categoria_id)} · {material.proveedor || "Sin proveedor"} · {material.codigo || "sin codigo"}</span>
                      </span>
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: precio.amount ? C.t0 : C.amber, whiteSpace: "nowrap" }}>{precio.text}</span>
                    </button>
                  );
                })}
                {!candidatos.length && (
                  <div style={{ padding: 14, color: C.t2, fontSize: 12, border: `1px dashed ${C.b0}`, borderRadius: 10, textAlign: "center" }}>
                    No encontre materiales. Cambia a Crear nuevo para cargarlo completo.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, border: `1px solid ${C.b0}`, background: C.panelSolid2, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.4fr) minmax(130px, .6fr)", gap: 8 }}>
                <input value={draft.descripcion} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} placeholder="Descripcion del material" style={{ ...INP, height: 38, fontWeight: 750 }} />
                <input value={draft.unidad_medida} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} list="obra-addon-ums" placeholder="Unidad" style={{ ...INP, height: 38 }} />
              </div>
              <datalist id="obra-addon-ums">{ums.map((u) => <option key={u} value={u} />)}</datalist>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, alignItems: "center" }}>
                <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={{ ...INP, height: 38 }}>
                  <option value="" style={OPT_ST}>Elegir rubro</option>
                  {categorias.map((c) => <option key={c.id} value={c.id} style={OPT_ST}>{categoriaNombre(categorias, c.id)}</option>)}
                </select>
                <ProveedorSelect value={draft.proveedor_id} textValue={draft.proveedor} proveedores={proveedores} onCreated={onChanged} onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))} />
                <input value={draft.codigo} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} placeholder="Codigo interno" style={{ ...INP, height: 38 }} />
                <input value={draft.codigo_barra} onChange={(e) => setDraft((d) => ({ ...d, codigo_barra: e.target.value }))} placeholder="Codigo de barra" style={{ ...INP, height: 38, fontFamily: C.mono }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "center" }}>
                <input value={draft.alias || ""} onChange={(e) => setDraft((d) => ({ ...d, alias: e.target.value }))} placeholder="Alias / nombre corto" style={{ ...INP, height: 38 }} />
                <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Proveedor texto libre" style={{ ...INP, height: 38 }} />
                <input type="number" step="any" value={draft.precio_unitario || ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} placeholder="Precio" style={{ ...INP, height: 38, fontFamily: C.mono }} />
                <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value }))} style={{ ...INP, height: 38 }}>
                  {MONEDAS.map((m) => <option key={m || "null"} value={m} style={OPT_ST}>{m || "Moneda"}</option>)}
                </select>
              </div>
              <VariantsEditor value={variantesNuevo} onChange={setVariantesNuevo} description={draft.descripcion} proveedores={proveedores} onCleanTitle={(descripcion) => setDraft((d) => ({ ...d, descripcion }))} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                <PendingImagePicker file={imageFileNuevo} onChange={setImageFileNuevo} imageUrl={draft.imagen_url} onImageUrlChange={(imagen_url) => setDraft((d) => ({ ...d, imagen_url }))} />
                <DraftBarcodeEditor value={codigosExtraNuevo} onChange={setCodigosExtraNuevo} variantes={variantesNuevo} />
              </div>
              <MaterialLinksEditor value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} compact />
              <textarea value={draft.notas || ""} onChange={(e) => setDraft((d) => ({ ...d, notas: e.target.value }))} rows={2} placeholder="Observaciones reales del item" style={{ ...INP, width: "100%", resize: "vertical" }} />
            </div>
          )}

          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Nota de esta obra (por que aplica, pedido del cliente, color, aclaracion)" style={{ ...INP, width: "100%", resize: "vertical" }} />
          {err && <div style={{ fontSize: 12, color: C.red }}>{err.message || "No se pudo guardar el adicional."}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
            <button type="button" onClick={onClose} style={{ ...BTN, padding: "8px 13px" }}>Cancelar</button>
            {mode === "existente" ? (
              <button type="button" onClick={saveExisting} disabled={!canSaveExisting || saving} style={{ ...BTN_GREEN, padding: "8px 14px", opacity: !canSaveExisting || saving ? 0.6 : 1 }}>{saving ? "Guardando..." : editing ? "Guardar cambios" : "Agregar a la obra"}</button>
            ) : (
              <button type="button" onClick={saveNew} disabled={!canSaveNew || saving} style={{ ...BTN_GREEN, padding: "8px 14px", opacity: !canSaveNew || saving ? 0.6 : 1 }}>{saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear y agregar"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListaMateriales({ categorias, materiales, selectedId, ums, proveedores, obras = [], onChanged, defaultSoloPendientes = true, compact = false, lineaFija = "" }) {
  const [soloPendientes, setSoloPendientes] = useState(defaultSoloPendientes);
  const [q, setQ] = useState("");
  const [lineaState, setLineaState] = useState(""); // "" = todas las líneas
  const [prov, setProv] = useState(""); // "" = todos. Guarda el id de panol_proveedores.
  const [proveedorTipo, setProveedorTipo] = useState("todos");
  const [rubro, setRubro] = useState("");
  const linea = lineaFija || lineaState;
  // La lista sale de la tabla de Proveedores (no se infiere de los materiales).
  const provs = useMemo(
    () => (proveedores ?? []).filter((p) => p.activo !== false).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")),
    [proveedores],
  );
  const rubrosFiltro = useMemo(
    () => (categorias ?? []).slice().sort((a, b) => categoriaNombre(categorias, a.id).localeCompare(categoriaNombre(categorias, b.id), "es")),
    [categorias],
  );

  const visibles = useMemo(() => {
    // Buscador: ignora acentos y exige TODAS las palabras (AND), en descripción/proveedor/código.
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const scope = selectedId ? idsScope(categorias, selectedId) : null;
    const rubroScope = rubro ? idsScope(categorias, rubro) : null;
    // Proveedor: matchea por id; si el material sólo tiene el texto, cae al nombre.
    const provNombre = prov ? norm((proveedores ?? []).find((p) => p.id === prov)?.nombre || "") : "";
    return materiales
      .filter(materialActivo)
      .filter((m) => !scope || materialEnScope(m, scope))
      .filter((m) => !rubroScope || materialEnScope(m, rubroScope))
      .filter((m) => !linea || toNum(toBomMap(m)[linea]) > 0) // solo los que van en esa línea
      .filter((m) => !prov || m.proveedor_id === prov || (provNombre && norm(m.proveedor) === provNombre))
      .filter((m) => proveedorTipo === "todos" || proveedorMeta(m.proveedor, proveedores)?.tipo === proveedorTipo)
      .filter((m) => !soloPendientes || !priceInfo(m).amount)
      .filter((m) => {
        if (!terms.length) return true;
        const hay = norm(`${m.descripcion ?? ""} ${m.proveedor ?? ""} ${m.codigo ?? ""} ${materialBarcodeText(m)}`);
        return terms.every((t) => hay.includes(t));
      });
  }, [materiales, categorias, q, selectedId, soloPendientes, linea, prov, proveedores, rubro, proveedorTipo]);

  // Si se filtra por una línea, mostramos solo esa columna de cantidad (más prolijo y angosto).
  const modelos = linea ? [linea] : MODELOS;

  // Scroll horizontal con la rueda normal (sin Shift): mientras haya para correr en esa
  // dirección lo consume; al llegar al borde, suelta para que la página scrollee vertical.
  const scrollRef = useRef(null);
  const onWheel = (e) => {
    const el = scrollRef.current;
    if (!el || e.deltaY === 0 || e.shiftKey) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const atStart = el.scrollLeft <= 0;
    const atEnd = el.scrollLeft >= max - 1;
    if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: "11px 13px", background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ position: "relative", minWidth: 220, flex: "1 1 280px" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descripción, proveedor o código…" style={{ ...INP, width: "100%", height: 40, paddingLeft: 36, borderRadius: 10 }} />
          {q && <button type="button" onClick={() => setQ("")} title="Limpiar" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 3 }}>✕</button>}
        </div>
        {!lineaFija && <div style={{ display: "inline-flex", gap: 2, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 3 }}>
          {[["", "Todas"], ...MODELOS.map((m) => [m, `K${m}`])].map(([val, label]) => {
            const on = linea === val;
            return (
              <button type="button" key={val || "all"} onClick={() => setLineaState(val)} title={val ? `Solo materiales de la línea K${val}` : "Todas las líneas"}
                style={{ border: "none", borderRadius: 7, padding: "7px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: C.sans,
                  background: on ? C.blue : "transparent", color: on ? "#fff" : C.t2, boxShadow: on ? "0 1px 4px rgba(59,130,246,0.4)" : "none", transition: "all .12s" }}>
                {label}
              </button>
            );
          })}
        </div>}
        <select value={prov} onChange={(e) => setProv(e.target.value)} style={{ ...INP, width: 180, maxWidth: "40vw", height: 40, borderRadius: 10 }} title="Filtrar por proveedor">
          <option value="" style={OPT_ST}>Todos los proveedores</option>
          {provs.map((p) => <option key={p.id} value={p.id} style={OPT_ST}>{p.nombre}</option>)}
        </select>
        <ProveedorTipoFilter value={proveedorTipo} onChange={setProveedorTipo} style={{ ...INP, width: 190, maxWidth: "44vw", height: 40, borderRadius: 10 }} />
        <select value={rubro} onChange={(e) => setRubro(e.target.value)} style={{ ...INP, width: 180, maxWidth: "40vw", height: 40, borderRadius: 10 }} title="Filtrar por rubro">
          <option value="" style={OPT_ST}>Todos los rubros</option>
          {rubrosFiltro.map((c) => <option key={c.id} value={c.id} style={OPT_ST}>{categoriaNombre(categorias, c.id)}</option>)}
        </select>
        <button type="button" onClick={() => setSoloPendientes((v) => !v)} title="Mostrar solo items sin precio"
          style={{ ...BTN, height: 40, padding: "0 13px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${soloPendientes ? "rgba(245,158,11,0.45)" : C.b0}`, background: soloPendientes ? "rgba(245,158,11,0.12)" : C.s0, color: soloPendientes ? C.amber : C.t1, fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ width: 15, height: 15, borderRadius: 5, border: `1px solid ${soloPendientes ? C.amber : C.b1}`, background: soloPendientes ? C.amber : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: 11, lineHeight: 1 }}>{soloPendientes ? "✓" : ""}</span>
          Sólo sin precio
        </button>
        <span style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "6px 12px", whiteSpace: "nowrap" }}>
          {visibles.length} ítems{linea ? ` · K${linea}` : ""}
        </span>
      </div>

      {lineaFija && <PrepararCompra items={visibles} linea={lineaFija} categorias={categorias} />}

      {compact ? (
        <div>
          {visibles.map((material) => (
            <MaterialFila key={material.id} material={material} categorias={categorias} ums={ums} proveedores={proveedores} obras={obras} onChanged={onChanged} linea={linea} />
          ))}
          {!visibles.length && (
            <div style={{ padding: 18, fontSize: 13, color: C.t2, textAlign: "center", border: `1px solid ${C.b0}`, borderRadius: 12 }}>No hay materiales con esos filtros.</div>
          )}
        </div>
      ) : (
      <div ref={scrollRef} onWheel={onWheel} style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: (compact ? 820 : 1252) + modelos.length * 76, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {!compact && <Th>Imagen</Th>}
              <Th>Descripción</Th>
              <Th>Proveedor</Th>
              {!compact && <Th>?ltimo precio</Th>}
              <Th>UM</Th>
              <Th>Precio</Th>
              <Th>Moneda</Th>
              <Th>Código</Th>
              {modelos.map((m) => <Th key={m}>K{m}</Th>)}
              <Th>Sector</Th>
              {!compact && <Th>Estado</Th>}
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((material) => (
              <MaterialRow key={material.id} material={material} categorias={categorias} ums={ums} proveedores={proveedores} onChanged={onChanged} modelos={modelos} compact={compact} />
            ))}
            {!visibles.length && (
              <tr>
                <td colSpan={(compact ? 8 : 11) + modelos.length} style={{ padding: 18, fontSize: 13, color: C.t2, textAlign: "center" }}>
                  No hay materiales con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// Cargar presupuesto (texto pegado o archivo PDF/foto) con IA, matchear cada ítem
// contra la lista matriz y: si coincide → actualizar su precio; si no → crear en el
// sector/subsector actual. Todo dentro de la Revisión guiada.
// Selector de sector/subsector (para asignar el destino de un ítem).
// Los <optgroup> nativos NO respetan el color en Chrome/Windows → títulos ilegibles en
// tema oscuro. Por eso evitamos optgroup y usamos opciones planas (sí respetan el style),
// con el sector padre en negrita y los subsectores con el path completo.
const OPT_ST = { background: C.panelSolid, color: C.t0 };
const OPT_HEAD = { background: C.panelSolid, color: C.t0, fontWeight: 800 };

function SectorPicker({ categorias, value, onChange, invalid }) {
  const raices = categorias.filter(esRaiz);
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INP, flex: 1, fontSize: 12, border: `1px solid ${invalid ? C.red : C.b0}` }}
    >
      <option value="" style={OPT_ST}>— Elegir sector —</option>
      {raices.flatMap((r) => [
        <option key={r.id} value={r.id} style={OPT_HEAD}>{r.nombre}</option>,
        ...hijosDe(categorias, r.id).map((s) => (
          <option key={s.id} value={s.id} style={OPT_ST}>{"   "}{r.nombre} › {s.nombre}</option>
        )),
      ])}
    </select>
  );
}

// Buscador por ítem para vincular con un material del catálogo aunque se llame distinto y
// la IA no lo haya detectado. Busca en TODO el catálogo (no solo en las sugerencias de la IA).
function VincularItem({ activos, categorias, item, onChange, soloPrecios = false }) {
  const [q, setQ] = useState("");
  const sel = activos.find((m) => m.id === item.material_id);
  const query = q.trim();
  const resultados = useMemo(() => {
    if (sel) return [];
    return topMateriales(activos, query.length >= 2 ? query : item.descripcion).slice(0, 6);
  }, [activos, item, query, sel]);

  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.t2, minWidth: 78 }}>Vincular</span>
        {sel ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ flex: 1, fontSize: 12, color: C.green, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {sel.descripcion} <span style={{ color: C.t2, fontWeight: 400 }}>· {categoriaNombre(categorias, sel.categoria_id)}</span>
            </div>
            <button type="button" onClick={() => { onChange(""); setQ(""); }} style={{ ...BTN, padding: "5px 10px", whiteSpace: "nowrap" }}>Cambiar</button>
          </div>
        ) : (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ðŸ” Buscar un material del catálogo para vincular (si la IA no lo encontró)…" style={{ ...INP, flex: 1, fontSize: 12 }} />
        )}
        <span style={{ fontSize: 11, color: sel ? C.green : C.amber, fontWeight: 700, whiteSpace: "nowrap", minWidth: 104, textAlign: "right" }}>
          {sel ? "actualiza precio" : soloPrecios ? "vincular" : "crea uno nuevo"}
        </span>
      </div>
      {!sel && resultados.length > 0 && (
        <div style={{ display: "grid", gap: 3, marginTop: 5, marginLeft: 86 }}>
          {resultados.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m.id); setQ(""); }}
              style={{ textAlign: "left", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 10px", color: C.t1, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 10 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</span>
              <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{categoriaNombre(categorias, m.categoria_id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PRESUP_DRAFT_KEY = "klasea:presupuesto-draft";
const PRECIOS_DRAFT_KEY = "klasea:precios-draft";

function CargarPresupuestoModal({ categorias, materiales, onChanged, onClose, soloPrecios = false }) {
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [items, setItems] = useState(null);
  const [proveedor, setProveedor] = useState("");
  const [linea, setLinea] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [restaurado, setRestaurado] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const draftKey = soloPrecios ? PRECIOS_DRAFT_KEY : PRESUP_DRAFT_KEY;
  const activos = useMemo(() => materiales.filter(materialActivo), [materiales]);
  const nombresSectores = useMemo(() => categorias.map((c) => c.nombre), [categorias]);

  // Borrador persistente: si cerrás, clickeás afuera o recargás, no se pierde lo cargado.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (d && (d.texto || (Array.isArray(d.items) && d.items.length))) {
        if (d.texto) setTexto(d.texto);
        if (d.proveedor) setProveedor(d.proveedor);
        if (d.linea) setLinea(d.linea);
        if (Array.isArray(d.items) && d.items.length) { setItems(d.items); setRestaurado(true); }
      }
    } catch { /* ignore */ }
  }, [draftKey]);
  useEffect(() => {
    if (resultado) return; // ya se aplicó; no re-guardar
    try { localStorage.setItem(draftKey, JSON.stringify({ texto, proveedor, linea, items })); } catch { /* ignore */ }
  }, [texto, proveedor, linea, items, resultado, draftKey]);
  const limpiarBorrador = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  function descartar() {
    if (!window.confirm("¿Descartar el presupuesto en curso y empezar de cero?")) return;
    limpiarBorrador();
    setTexto(""); setFile(null); setItems(null); setProveedor(""); setLinea(""); setErr(null); setRestaurado(false);
  }

  async function leer() {
    if (!texto.trim() && !file) { setErr(new Error("Pegá el texto del presupuesto o subí un archivo.")); return; }
    setLeyendo(true); setErr(null); setResultado(null);
    try {
      const data = await leerPresupuestoConIA({ text: texto, file, sectores: nombresSectores });
      setProveedor(data.proveedor || "");
      const parsed = (data.items || []).map((it) => {
        const material_id = bestMatchId(activos, it.descripcion || "");
        const mat = activos.find((m) => m.id === material_id);
        // El destino: si matchea un material, hereda su sector; si no, el que sugirió la IA.
        const _catId = mat ? mat.categoria_id : catIdPorNombre(categorias, it.sector);
        // Backstop de precio, SOLO HACIA ARRIBA: el error de formato (coma decimal) hace que el
        // precio se lea más chico de lo real (33 en vez de 33.000), nunca más grande. Si el
        // importe/cantidad da claramente MÁS que el precio leído, lo subimos; nunca bajamos un
        // precio ya leído (eso "dividía" precios correctos cuando la IA leía mal el importe).
        const cant = toNum(it.cantidad);
        const total = toNum(it.total);
        let precio = it.precio_unitario ?? "";
        const leido = toNum(precio);
        if (cant && cant > 1 && total != null && total > 0) {
          const calc = total / cant;
          if (leido == null || calc > leido * 1.5) {
            precio = String(Math.round(calc * 100) / 100);
          }
        }
        return {
          descripcion: it.descripcion || "",
          cantidad: it.cantidad ?? "",
          precio_unitario: precio,
          moneda: it.moneda || "ARS",
          material_id,
          _catId,
        };
      });
      setItems(parsed);
      if (!parsed.length) setErr(new Error("La IA no encontró ítems. Probá con más detalle o un archivo."));
    } catch (e) { setErr(e); } finally { setLeyendo(false); }
  }

  const setItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const quitar = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Inválido: es "crear nuevo" (sin match) y no tiene sector asignado.
  const faltaSector = (it) => !it.material_id && it.descripcion.trim() && !it._catId;
  const faltaVinculo = (it) => soloPrecios && it.descripcion.trim() && !it.material_id;
  const precioValido = (it) => toNum(it.precio_unitario) != null;

  async function aplicar() {
    if (soloPrecios) {
      const aplicables = items.filter((it) => it.material_id && precioValido(it));
      if (!aplicables.length) {
        setErr(new Error("No hay precios listos para aplicar. Vinculá al menos un ítem del comprobante con un material existente y cargale precio."));
        return;
      }
      setAplicando(true); setErr(null);
      let actualizados = 0;
      try {
        for (const it of aplicables) {
          await aplicarPrecioMaterial(it.material_id, { precio: it.precio_unitario, moneda: it.moneda, proveedor });
          actualizados += 1;
        }
        setResultado({ actualizados, omitidos: items.length - actualizados, soloPrecios: true });
        limpiarBorrador();
        await onChanged?.();
      } catch (e) { setErr(e); } finally { setAplicando(false); }
      return;
    }
    if (items.some(faltaSector)) { setErr(new Error("Asigná sector a los ítems marcados en rojo antes de aplicar.")); return; }
    setAplicando(true); setErr(null);
    let actualizados = 0, creados = 0, movidos = 0, bom = 0;
    try {
      for (const it of items) {
        if (!it.descripcion.trim()) continue;
        let materialId = it.material_id;
        if (materialId) {
          const mat = activos.find((m) => m.id === materialId);
          const corregir = it._catId && mat && mat.categoria_id !== it._catId ? it._catId : null;
          await aplicarPrecioMaterial(materialId, { precio: it.precio_unitario, moneda: it.moneda, proveedor, categoria_id: corregir });
          actualizados += 1;
          if (corregir) movidos += 1;
        } else if (it._catId) {
          materialId = await crearMaterial({
            categoria_id: it._catId,
            descripcion: it.descripcion.trim(),
            precio_unitario: toNum(it.precio_unitario),
            moneda: it.moneda,
            proveedor: proveedor || "",
            revisado: false,
          });
          creados += 1;
        } else continue;
        if (linea && materialId && toNum(it.cantidad) != null) {
          await setCantidadModelo(materialId, linea, it.cantidad);
          bom += 1;
        }
      }
      setResultado({ actualizados, creados, movidos, bom });
      limpiarBorrador();
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setAplicando(false); }
  }

  // Crea una subdivisión (subsector) bajo el sector raíz del ítem, sin salir del modal.
  async function crearSubsectorPara(idx) {
    const cat = categorias.find((c) => c.id === items[idx]._catId);
    const raizId = cat ? (cat.parent_id || cat.id) : null;
    if (!raizId) { setErr(new Error("Elegí primero un sector para crearle una subdivisión.")); return; }
    const raiz = categorias.find((c) => c.id === raizId);
    const nombre = window.prompt(`Nueva subdivisión de "${raiz?.nombre || "sector"}":`);
    if (!nombre || !nombre.trim()) return;
    try {
      setErr(null);
      const nueva = await crearCategoria(nombre, { parentId: raizId, orden: hijosDe(categorias, raizId).length });
      setItem(idx, { _catId: nueva.id });
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  const coinciden = items?.filter((it) => it.material_id).length ?? 0;
  const nuevos = items?.filter((it) => !it.material_id && it.descripcion.trim()).length ?? 0;
  const sinSector = items?.filter(faltaSector).length ?? 0;
  const sinVinculo = items?.filter(faltaVinculo).length ?? 0;
  const listosPrecio = items?.filter((it) => it.material_id && precioValido(it)).length ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(0,0,0,0.66)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3vh 12px", overflowY: "auto" }}>
      <div style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 16, padding: 22, width: "min(1180px, 97vw)", maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.t0 }}>{soloPrecios ? "Cargar precios" : "Cargar presupuesto"}</div>
            {restaurado && !resultado && <span style={{ fontSize: 10.5, color: "#a78bfa", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>● borrador restaurado</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(items || texto) && !resultado && <button type="button" onClick={descartar} style={{ ...BTN, padding: "4px 10px", color: C.red }}>Descartar</button>}
            <button type="button" onClick={onClose} style={{ ...BTN, padding: "4px 9px" }} title="Cerrar — el borrador se guarda y lo recuperás al volver">✕</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>
          {soloPrecios
            ? "Leé un PDF, foto o texto con IA, vinculá cada renglón con un material existente y aplicá solo precios. Lo no vinculado queda omitido: no crea materiales nuevos."
            : "Lo que coincide con la matriz actualiza su precio; lo nuevo lo clasifica la IA por sector (lo confirmás vos). Se guarda un borrador automático: si cerrás sin querer, lo recuperás al volver a abrir."}
        </div>

        {err && <div style={{ marginBottom: 12 }}><ErrorBox error={err} onRetry={() => setErr(null)} /></div>}

        {resultado ? (
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 15, color: C.green, fontWeight: 700 }}>{soloPrecios ? "Precios cargados" : "Presupuesto cargado"} ✓</div>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 6 }}>
              {resultado.actualizados} precios actualizados
              {soloPrecios && resultado.omitidos ? ` · ${resultado.omitidos} omitidos sin vínculo/precio` : ""}
              {!soloPrecios && resultado.creados ? ` · ${resultado.creados} creados` : ""}
              {!soloPrecios && resultado.movidos ? ` · ${resultado.movidos} reasignados de sector` : ""}
              {!soloPrecios && resultado.bom ? ` · ${resultado.bom} cantidades cargadas a la línea` : ""}.
            </div>
            <button type="button" onClick={onClose} style={{ ...BTN_PRIMARY, marginTop: 14 }}>Listo</button>
          </div>
        ) : items === null ? (
          <>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Pegá acá el texto del presupuesto…\nEj:\nBow thruster Side-Power 12V   1u   US$ 1.250\nCable 2.5mm rollo   x3   $45.000\nFiltro Racor combustible   2u   US$ 38"}
              style={{ ...INP, width: "100%", minHeight: 160, resize: "vertical", fontFamily: C.mono, fontSize: 12.5, lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", color: C.t2, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: C.b0 }} /> o subí un archivo <div style={{ flex: 1, height: 1, background: C.b0 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={BTN}><Upload size={14} /> {file ? "Cambiar archivo" : "PDF o foto"}</button>
              {file && <span style={{ fontSize: 12, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div style={{ flex: 1 }} />
              <button type="button" onClick={leer} disabled={leyendo} style={{ ...BTN_PRIMARY, opacity: leyendo ? 0.6 : 1 }}>
                {leyendo ? "Leyendo con IA…" : "Leer con IA"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.t2 }}>Proveedor:</span>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor" style={{ ...INP, width: 190 }} />
              {!soloPrecios && (
                <>
                  <span style={{ fontSize: 12, color: C.t2, marginLeft: 6 }}>Línea de producción:</span>
                  <select value={linea} onChange={(e) => setLinea(e.target.value)} style={{ ...INP, width: 140 }}>
                    <option value="">— Sin línea —</option>
                    {MODELOS.map((m) => <option key={m} value={m}>K{m}</option>)}
                  </select>
                </>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>
                {soloPrecios ? `${listosPrecio} listos · ${sinVinculo} sin vincular` : `${coinciden} coinciden · ${nuevos} nuevos${sinSector ? ` · ${sinSector} sin sector` : ""}`}
              </span>
            </div>
            <div style={{ fontSize: 11, color: linea ? "#a78bfa" : C.t2, marginBottom: 10 }}>
              {soloPrecios
                ? "Revisá los matches sugeridos por la IA. Si el material no es el correcto, tocá Cambiar y vinculalo manualmente antes de aplicar."
                : linea ? `Las cantidades se cargan al BOM de la línea K${linea} (alimenta el Costo de obra de esa línea).` : "Sin línea: solo se crean/actualizan materiales y precios; las cantidades no se guardan."}
            </div>

            <div style={{ display: "grid", gap: 8, maxHeight: "58vh", overflowY: "auto", paddingRight: 4 }}>
              {items.map((it, idx) => {
                const malSector = faltaSector(it);
                const malVinculo = faltaVinculo(it);
                return (
                  <div key={idx} style={{ border: `1px solid ${malSector || malVinculo ? "rgba(239,68,68,0.5)" : it.material_id ? "rgba(16,185,129,0.3)" : C.b0}`, borderRadius: 10, padding: 10, background: C.s0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input value={it.descripcion} onChange={(e) => setItem(idx, { descripcion: e.target.value })} style={{ ...INP, flex: 1, fontWeight: 600 }} />
                      <input value={it.cantidad} onChange={(e) => setItem(idx, { cantidad: e.target.value })} placeholder="Cant" type="number" step="any" title="Cantidad para el BOM de la línea" style={{ ...INP, width: 62, fontFamily: C.mono }} />
                      <input value={it.precio_unitario} onChange={(e) => setItem(idx, { precio_unitario: e.target.value })} placeholder="Precio" type="number" step="any" style={{ ...INP, width: 100, fontFamily: C.mono }} />
                      <select value={it.moneda} onChange={(e) => setItem(idx, { moneda: e.target.value })} style={{ ...INP, width: 72 }}>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                      <button type="button" onClick={() => quitar(idx)} title="Quitar" style={{ ...BTN, padding: "6px 8px", color: C.red }}>✕</button>
                    </div>
                    <VincularItem
                      activos={activos}
                      categorias={categorias}
                      item={it}
                      onChange={(mid) => {
                        const mat = activos.find((m) => m.id === mid);
                        setItem(idx, mat ? { material_id: mid, _catId: mat.categoria_id } : { material_id: "" });
                      }}
                      soloPrecios={soloPrecios}
                    />
                    {!soloPrecios && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 7 }}>
                        <span style={{ fontSize: 11, color: C.t2, minWidth: 78 }}>Sector</span>
                        <SectorPicker categorias={categorias} value={it._catId} onChange={(v) => setItem(idx, { _catId: v })} invalid={malSector} />
                        <button type="button" onClick={() => crearSubsectorPara(idx)} title="Crear una subdivisión en este sector" style={{ ...BTN, padding: "6px 9px", whiteSpace: "nowrap" }}>ï¼‹ sub</button>
                      </div>
                    )}
                    {!soloPrecios && it.material_id && (() => {
                      const mat = activos.find((m) => m.id === it.material_id);
                      return mat && it._catId && mat.categoria_id !== it._catId ? (
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 4, paddingLeft: 84 }}>? se mueve de ?{categoriaNombre(categorias, mat.categoria_id)}? a ?{categoriaNombre(categorias, it._catId)}?</div>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => { setItems(null); setResultado(null); }} style={BTN}>← Volver</button>
              {sinSector > 0 && <span style={{ fontSize: 11, color: C.red }}>{sinSector} ítem(s) sin sector</span>}
              {soloPrecios && sinVinculo > 0 && <span style={{ fontSize: 11, color: C.amber }}>{sinVinculo} ítem(s) se omiten si no los vinculás</span>}
              <div style={{ flex: 1 }} />
              <button type="button" onClick={aplicar} disabled={aplicando || !items.length || (soloPrecios && !listosPrecio)} style={{ ...BTN_PRIMARY, opacity: aplicando || !items.length || (soloPrecios && !listosPrecio) ? 0.6 : 1 }}>
                {aplicando ? "Aplicando…" : soloPrecios ? `Aplicar precios (${listosPrecio})` : `Aplicar (${coinciden + nuevos})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Buscador global: busca en TODO el catálogo y suma el material al sector/subsector
// actual (multi-área, sin sacarlo de donde estaba) o crea uno nuevo ahí.
function BuscadorAgregar({ categorias, materiales, selectedId, onChanged }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const query = q.trim().toLowerCase();
  const scope = useMemo(() => idsScope(categorias, selectedId), [categorias, selectedId]);
  const destino = categoriaNombre(categorias, selectedId);

  const resultados = useMemo(() => {
    if (query.length < 2) return [];
    return materiales
      .filter(materialActivo)
      .filter((m) => `${m.descripcion ?? ""} ${m.proveedor ?? ""} ${m.codigo ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? "", "es"))
      .slice(0, 40);
  }, [materiales, query]);

  async function agregar(m) {
    setBusy(m.id); setErr(null);
    try {
      const extras = (m.areas ?? [m.categoria_id]).filter((a) => a !== m.categoria_id && a !== selectedId);
      await setMaterialAreas(m.id, [...new Set([...extras, selectedId])]);
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  }

  async function crearNuevo() {
    const desc = q.trim();
    if (!desc) return;
    setBusy("nuevo"); setErr(null);
    try {
      await crearMaterial({ descripcion: desc, categoria_id: selectedId, revisado: false });
      setQ("");
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  }

  return (
    <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.t2, fontWeight: 700, marginBottom: 9 }}>
        Buscar en el catálogo y agregar a <span style={{ color: "#60a5fa" }}>{destino}</span>
      </div>
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: C.t2 }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material por descripción, proveedor o código…" style={{ ...INP, width: "100%", paddingLeft: 34 }} />
      </div>
      {err && <div style={{ marginTop: 8 }}><ErrorBox error={err} onRetry={() => setErr(null)} /></div>}

      {query.length >= 2 && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {resultados.map((m) => {
            const yaEsta = materialEnScope(m, scope);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: C.panelSolid, border: `1px solid ${C.b0}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.t0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.descripcion}</div>
                  <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
                    {categoriaNombre(categorias, m.categoria_id)}{m.proveedor ? ` · ${m.proveedor}` : ""}
                  </div>
                </div>
                <PriceBadge material={m} />
                {yaEsta ? (
                  <span style={{ fontSize: 11, color: C.green, fontWeight: 700, padding: "5px 10px", whiteSpace: "nowrap" }}>✓ ya está acá</span>
                ) : (
                  <button type="button" disabled={busy === m.id} onClick={() => agregar(m)} style={{ ...BTN_PRIMARY, padding: "6px 12px", fontSize: 12, opacity: busy === m.id ? 0.6 : 1, whiteSpace: "nowrap" }}>
                    {busy === m.id ? "Agregando…" : "Agregar acá"}
                  </button>
                )}
              </div>
            );
          })}

          <button type="button" disabled={busy === "nuevo"} onClick={crearNuevo} style={{ ...BTN, marginTop: 4, justifyContent: "center", border: `1px dashed ${C.b1}`, color: "#60a5fa", padding: "9px" }}>
            <PackagePlus size={14} /> {busy === "nuevo" ? "Creando…" : <>Crear nuevo <strong style={{ marginLeft: 4 }}>“{q.trim()}”</strong> en {destino}</>}
          </button>

          {resultados.length === 0 && (
            <div style={{ fontSize: 12, color: C.t2, textAlign: "center", padding: "6px 0" }}>
              No hay materiales que coincidan. Pod?s crearlo nuevo ?
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionTab({ categorias, materiales, proveedores, onChanged }) {
  const [selectedId, setSelectedId] = useState(categorias[0]?.id ?? "");
  const [modo, setModo] = useState("cola");
  const [queueIndex, setQueueIndex] = useState(0);
  const [showBuscar, setShowBuscar] = useState(false);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const [err, setErr] = useState(null);
  const effectiveSelectedId = selectedId && categorias.some((c) => c.id === selectedId)
    ? selectedId
    : categorias[0]?.id ?? "";

  const progressByCat = useMemo(() => {
    // Cada sector cuenta sus materiales por "scope" (él + subsectores), únicos.
    // Así el padre hace roll-up de los hijos sin doble conteo.
    const activos = materiales.filter(materialActivo);
    const map = new Map();
    for (const c of categorias) {
      const scope = idsScope(categorias, c.id);
      let total = 0, revisados = 0;
      for (const m of activos) {
        if (materialEnScope(m, scope)) { total += 1; if (m.revisado) revisados += 1; }
      }
      map.set(c.id, { total, revisados });
    }
    return map;
  }, [categorias, materiales]);

  const ums = useMemo(() => {
    return [...new Set(materiales.map((m) => m.unidad_medida).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es"));
  }, [materiales]);

  const selectedMaterials = useMemo(() => {
    const scope = idsScope(categorias, effectiveSelectedId);
    return materiales.filter(materialActivo).filter((m) => materialEnScope(m, scope));
  }, [materiales, categorias, effectiveSelectedId]);

  const queue = useMemo(() => selectedMaterials.filter((m) => !m.revisado), [selectedMaterials]);
  const current = queue.length ? queue[queueIndex % queue.length] : null;
  const progress = progressByCat.get(effectiveSelectedId) ?? { total: 0, revisados: 0 };

  async function saveQueue(draft, cantidades) {
    await guardarMaterial(draft, cantidades, { revisado: true });
    await onChanged?.();
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm(`¿Borrar "${current.descripcion}"?`)) return;
    try {
      setErr(null);
      await borrarMaterial(current.id);
      await onChanged?.();
    } catch (e) {
      setErr(e);
    }
  }

  async function addSubsector(parent) {
    const nombre = window.prompt(`Nuevo subsector de "${parent.nombre}":`);
    if (!nombre?.trim()) return;
    try {
      setErr(null);
      const c = await crearCategoria(nombre, { parentId: parent.id, orden: hijosDe(categorias, parent.id).length });
      await onChanged?.();
      setSelectedId(c.id);
      setQueueIndex(0);
    } catch (e) { setErr(e); }
  }

  async function suggestSubsectores(parent, sugeridas) {
    if (!sugeridas?.length) return;
    if (!window.confirm(`Crear ${sugeridas.length} subsectores en "${parent.nombre}":\n\n${sugeridas.join(" · ")}`)) return;
    try {
      setErr(null);
      let orden = hijosDe(categorias, parent.id).length;
      for (const nombre of sugeridas) await crearCategoria(nombre, { parentId: parent.id, orden: orden++ });
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  async function deleteSubsector(cat) {
    if (!window.confirm(`¿Borrar el subsector "${cat.nombre}"? Sus materiales vuelven al sector padre.`)) return;
    try {
      setErr(null);
      await borrarSubsector(cat.id, cat.parent_id);
      if (effectiveSelectedId === cat.id) { setSelectedId(cat.parent_id); setQueueIndex(0); }
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  return (
    <div>
      <SectorSelector
        categorias={categorias}
        progressByCat={progressByCat}
        selectedId={effectiveSelectedId}
        onSelect={(id) => { setSelectedId(id); setQueueIndex(0); }}
        onAddSub={addSubsector}
        onSuggestSub={suggestSubsectores}
        onDeleteSub={deleteSubsector}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: C.t0, fontWeight: 700 }}>
            {categoriaNombre(categorias, effectiveSelectedId)}: {progress.revisados} / {progress.total} revisados
          </div>
          <div style={{ height: 7, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 99, marginTop: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress.total ? Math.round((progress.revisados / progress.total) * 100) : 0}%`, background: C.green }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: 3 }}>
          {[
            ["cola", "Cola"],
            ["lista", "Lista"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setModo(key)} style={{
              ...BTN,
              border: "none",
              background: modo === key ? C.s2 : "transparent",
              color: modo === key ? C.t0 : C.t2,
              padding: "6px 12px",
            }}>
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowBuscar((v) => !v)}
          style={{ ...BTN, background: showBuscar ? "rgba(59,130,246,0.14)" : C.s0, border: `1px solid ${showBuscar ? "rgba(59,130,246,0.35)" : C.b0}`, color: showBuscar ? "#60a5fa" : C.t1 }}
          title="Buscar en el catálogo y agregar al sector"
        >
          <Search size={14} /> {showBuscar ? "Cerrar buscador" : "Buscar y agregar"}
        </button>
        <button
          type="button"
          onClick={() => setShowPresupuesto(true)}
          style={{ ...BTN, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
          title="Cargar un presupuesto (texto o PDF/foto) con IA y matchearlo contra la matriz"
        >
          <Upload size={14} /> Cargar presupuesto
        </button>
        <button type="button" onClick={onChanged} style={BTN} title="Reintentar carga">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}

      {showBuscar && (
        <BuscadorAgregar
          categorias={categorias}
          materiales={materiales}
          selectedId={effectiveSelectedId}
          onChanged={onChanged}
        />
      )}

      {showPresupuesto && (
        <CargarPresupuestoModal
          categorias={categorias}
          materiales={materiales}
          onChanged={onChanged}
          onClose={() => setShowPresupuesto(false)}
        />
      )}

      {modo === "cola" ? (
        current ? (
          <MaterialQueueCard
            key={current.id}
            material={current}
            categorias={categorias}
            ums={ums}
            proveedores={proveedores}
            onSave={saveQueue}
            onSkip={() => setQueueIndex((i) => (i + 1) % Math.max(queue.length, 1))}
            onDelete={deleteCurrent}
            onChanged={onChanged}
          />
        ) : (
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 20, marginBottom: 18 }}>
            <div style={{ fontSize: 15, color: C.green, fontWeight: 700 }}>Sector revisado</div>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 6 }}>No quedan materiales pendientes en este sector.</div>
          </div>
        )
      ) : (
        <>
          <AltaManual categorias={categorias} selectedId={effectiveSelectedId} ums={ums} proveedores={proveedores} onCreated={onChanged} />
          <ListaMateriales categorias={categorias} materiales={materiales} selectedId={effectiveSelectedId} ums={ums} proveedores={proveedores} onChanged={onChanged} />
        </>
      )}
    </div>
  );
}

function exportCatalogoCsv(categorias, materiales) {
  const catById = new Map(categorias.map((c) => [c.id, c.nombre]));
  const headers = ["Descripción", "Sector", "Proveedor", "UM", "Precio", "Moneda", "Código", "Cant 37", "Cant 52", "Cant 55", "Revisado"];
  const rows = materiales.filter(materialActivo).map((m) => {
    const bom = toBomMap(m);
    const price = precioVigente(m);
    return [
      m.descripcion,
      catById.get(m.categoria_id) ?? "",
      m.proveedor,
      m.unidad_medida,
      price?.precio_unitario ?? m.precio_unitario,
      price?.moneda ?? m.moneda,
      m.codigo,
      bom[37],
      bom[52],
      bom[55],
      m.revisado ? "sí" : "no",
    ];
  });
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `catalogo-materiales-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ResumenTab({ categorias, materiales }) {
  const activos = useMemo(() => materiales.filter(materialActivo), [materiales]);
  const total = activos.length;
  const revisados = activos.filter((m) => m.revisado).length;
  const sinPrecio = activos.filter((m) => !precioVigente(m)?.precio_unitario).length;
  const sinUm = activos.filter((m) => !m.unidad_medida).length;
  const sinCodigo = activos.filter((m) => !m.codigo).length;
  const pct = total ? Math.round((revisados / total) * 100) : 0;

  const rows = categorias.map((cat) => {
    const list = activos.filter((m) => materialEnArea(m, cat.id));
    const rev = list.filter((m) => m.revisado).length;
    const precios = list.map((m) => precioVigente(m)?.precio_unitario).filter((v) => v != null).map(Number).filter(Number.isFinite);
    return {
      ...cat,
      total: list.length,
      revisados: rev,
      pct: list.length ? Math.round((rev / list.length) * 100) : 0,
      sinPrecio: list.filter((m) => !precioVigente(m)?.precio_unitario).length,
      sinUm: list.filter((m) => !m.unidad_medida).length,
      sinCodigo: list.filter((m) => !m.codigo).length,
      promedio: precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : null,
    };
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Materiales" value={total} />
        <KpiCard label="Revisados" value={`${pct}%`} sub={`${revisados} de ${total}`} color={pct === 100 ? C.green : "#60a5fa"} />
        <KpiCard label="Sin precio" value={sinPrecio} color={sinPrecio ? C.amber : C.green} />
        <KpiCard label="Sin UM" value={sinUm} color={sinUm ? C.amber : C.green} />
        <KpiCard label="Sin código" value={sinCodigo} color={sinCodigo ? C.t2 : C.green} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" onClick={() => exportCatalogoCsv(categorias, activos)} style={BTN_PRIMARY}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Sector</Th>
              <Th right>Total</Th>
              <Th right>Revisados</Th>
              <Th>Progreso</Th>
              <Th right>Sin precio</Th>
              <Th right>Precio prom.</Th>
              <Th right>Sin UM</Th>
              <Th right>Sin código</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{row.nombre}</Td>
                <Td right mono>{row.total}</Td>
                <Td right mono>{row.revisados}</Td>
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 170 }}>
                    <div style={{ flex: 1, height: 7, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${row.pct}%`, background: row.pct === 100 ? C.green : "#60a5fa" }} />
                    </div>
                    <span style={{ fontFamily: C.mono, color: C.t2, fontSize: 12 }}>{row.pct}%</span>
                  </div>
                </Td>
                <Td right mono color={row.sinPrecio ? C.amber : C.t2}>{row.sinPrecio}</Td>
                <Td right mono color={row.promedio ? C.t1 : C.t2}>{row.promedio ? fmtMoney(row.promedio, "") : "—"}</Td>
                <Td right mono color={row.sinUm ? C.amber : C.t2}>{row.sinUm}</Td>
                <Td right mono color={row.sinCodigo ? C.t2 : C.green}>{row.sinCodigo}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Costo de un material para un modelo: cantidad (BOM del modelo) × precio vigente.
function costoMaterialModelo(m, modelo, opciones = []) {
  const cant = Number(toBomMap(m)[modelo]);
  const tieneCant = Number.isFinite(cant) && cant > 0;
  const price = precioVigente(m);
  const pu = price?.precio_unitario != null && price.precio_unitario !== "" ? Number(price.precio_unitario) : null;
  const tienePrecio = pu != null && Number.isFinite(pu) && pu > 0;
  const bucket = materialBucket(m, opciones);
  return {
    tieneCant,
    moneda: price?.moneda === "USD" ? "USD" : "ARS",
    costo: tieneCant && tienePrecio ? cant * pu : 0,
    faltaPrecio: tieneCant && !tienePrecio,
    bucket,
  };
}

function CostoObraTab({ categorias, materiales, opciones = [] }) {
  const [modelo, setModelo] = useState(MODELOS[0]);
  const activos = useMemo(() => (materiales ?? []).filter(materialActivo), [materiales]);

  const aggScope = useCallback((scope) => {
    const acc = { usd: 0, ars: 0, ejeUsd: 0, ejeArs: 0, items: 0, sinPrecio: 0 };
    for (const m of activos) {
      if (!materialEnScope(m, scope)) continue;
      const c = costoMaterialModelo(m, modelo, opciones);
      if (!c.tieneCant) continue;
      acc.items += 1;
      if (c.faltaPrecio) { acc.sinPrecio += 1; continue; }
      if (c.bucket.key === "linea_eje") {
        if (c.moneda === "USD") acc.ejeUsd += c.costo; else acc.ejeArs += c.costo;
      } else if (c.moneda === "USD") acc.usd += c.costo; else acc.ars += c.costo;
    }
    return acc;
  }, [activos, modelo, opciones]);

  // Total global: cada material cuenta una sola vez (no infla por multi-área).
  const total = useMemo(() => {
    const acc = { usd: 0, ars: 0, ejeUsd: 0, ejeArs: 0, items: 0, sinPrecio: 0 };
    for (const m of activos) {
      const c = costoMaterialModelo(m, modelo, opciones);
      if (!c.tieneCant) continue;
      acc.items += 1;
      if (c.faltaPrecio) { acc.sinPrecio += 1; continue; }
      if (c.bucket.key === "linea_eje") {
        if (c.moneda === "USD") acc.ejeUsd += c.costo; else acc.ejeArs += c.costo;
      } else if (c.moneda === "USD") acc.usd += c.costo; else acc.ars += c.costo;
    }
    return acc;
  }, [activos, modelo, opciones]);

  const filas = useMemo(() => categorias.filter(esRaiz).map((r) => ({
    cat: r,
    agg: aggScope(idsScope(categorias, r.id)),
    subs: hijosDe(categorias, r.id).map((s) => ({ cat: s, agg: aggScope(new Set([s.id])) })),
  })), [categorias, aggScope]);

  const money = (v, mon) => (v ? fmtMoney(v, mon) : "—");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.t2 }}>Modelo de barco:</span>
        <div style={{ display: "flex", gap: 4, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: 3 }}>
          {MODELOS.map((mod) => (
            <button key={mod} type="button" onClick={() => setModelo(mod)} style={{ ...BTN, border: "none", background: modelo === mod ? C.s2 : "transparent", color: modelo === mod ? C.t0 : C.t2, padding: "6px 16px", fontWeight: modelo === mod ? 700 : 500 }}>
              K{mod}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label={`Base estimada USD · K${modelo}`} value={fmtMoney(total.usd, "USD")} sub="Sin línea de eje" color={C.green} />
        <KpiCard label="Línea de eje USD" value={fmtMoney(total.ejeUsd, "USD")} sub="Sólo si aplica a la obra" color={C.violet} />
        <KpiCard label={`Base estimada ARS · K${modelo}`} value={fmtMoney(total.ars, "ARS")} color={C.t0} />
        <KpiCard label="Ítems con cantidad" value={total.items} color={C.t1} />
        <KpiCard label="Sin precio (faltan cotizar)" value={total.sinPrecio} color={total.sinPrecio ? C.amber : C.green} />
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Sector</Th>
              <Th right>Ítems</Th>
              <Th right>Sin precio</Th>
              <Th right>Base USD</Th>
              <Th right>Línea eje USD</Th>
              <Th right>Base ARS</Th>
            </tr>
          </thead>
          <tbody>
            {filas.flatMap((f) => [
              <tr key={f.cat.id}>
                <Td>{f.cat.nombre}</Td>
                <Td right mono>{f.agg.items || "—"}</Td>
                <Td right mono color={f.agg.sinPrecio ? C.amber : C.t2}>{f.agg.sinPrecio || "—"}</Td>
                <Td right mono>{money(f.agg.usd, "USD")}</Td>
                <Td right mono color={f.agg.ejeUsd ? C.violet : C.t2}>{money(f.agg.ejeUsd, "USD")}</Td>
                <Td right mono>{money(f.agg.ars, "ARS")}</Td>
              </tr>,
              ...f.subs.map((s) => (
                <tr key={s.cat.id} style={{ background: C.s0 }}>
                  <Td><span style={{ paddingLeft: 18, color: C.t2 }}>? {s.cat.nombre}</span></Td>
                  <Td right mono color={C.t2}>{s.agg.items || "—"}</Td>
                  <Td right mono color={s.agg.sinPrecio ? C.amber : C.t2}>{s.agg.sinPrecio || "—"}</Td>
                  <Td right mono color={C.t2}>{money(s.agg.usd, "USD")}</Td>
                  <Td right mono color={s.agg.ejeUsd ? C.violet : C.t2}>{money(s.agg.ejeUsd, "USD")}</Td>
                  <Td right mono color={C.t2}>{money(s.agg.ars, "ARS")}</Td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.b1}` }}>
              <Td><strong>Total obra K{modelo}</strong></Td>
              <Td right mono><strong>{total.items}</strong></Td>
              <Td right mono color={total.sinPrecio ? C.amber : C.t2}><strong>{total.sinPrecio || "—"}</strong></Td>
              <Td right mono><strong>{fmtMoney(total.usd, "USD")}</strong></Td>
              <Td right mono color={total.ejeUsd ? C.violet : C.t2}><strong>{fmtMoney(total.ejeUsd, "USD")}</strong></Td>
              <Td right mono><strong>{fmtMoney(total.ars, "ARS")}</strong></Td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize: 11, color: C.t2, marginTop: 10, lineHeight: 1.6 }}>
        USD y ARS van por separado (no se convierten). Un material en varios sectores suma en cada uno, así que la suma por sector puede superar el total (el total cuenta cada material una vez). “Sin precio” = ítems con cantidad en K{modelo} pero sin precio vigente; cargá la cotización del proveedor en <strong>Comprobantes</strong> y el costo se completa solo.
      </div>
    </div>
  );
}

function ObraMatrizView({ obra, obras = [], linea, lineaNombre, categorias, materiales, proveedores = [], opciones = [], ums = [], onChanged, onBack }) {
  const [q, setQ] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [rubroFilter, setRubroFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [groupBy, setGroupBy] = useState("proveedor");
  const [selected, setSelected] = useState(() => new Set());
  const [copied, setCopied] = useState(false);
  const [addons, setAddons] = useState([]);
  const [addonQ, setAddonQ] = useState("");
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState(null);
  const [reassignAddon, setReassignAddon] = useState(null);
  const [reassignObraId, setReassignObraId] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [obraPanel, setObraPanel] = useState("");
  const [snapshot, setSnapshot] = useState([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [flowMsg, setFlowMsg] = useState(null);
  const [panolPrefill, setPanolPrefill] = useState(null);
  const [pedidoObraTipo, setPedidoObraTipo] = useState(null);
  const [condicionantesMatriz, setCondicionantesMatriz] = useState([]);
  const [condicionantesObra, setCondicionantesObra] = useState(() => new Map());
  const [condicionanteBusy, setCondicionanteBusy] = useState("");
  const [estadoBusy, setEstadoBusy] = useState("");
  const [varianteBusy, setVarianteBusy] = useState("");

  const cargarAddons = useCallback(async () => {
    try {
      setAddons(await fetchAddonsObra(obra?.id));
    } catch {
      setAddons([]);
    }
  }, [obra?.id]);
  useEffect(() => { cargarAddons(); }, [cargarAddons]);

  const cargarSnapshot = useCallback(async () => {
    try {
      setSnapshot(await fetchObraMaterialSnapshot(obra?.id));
    } catch {
      setSnapshot([]);
    }
  }, [obra?.id]);
  useEffect(() => { cargarSnapshot(); }, [cargarSnapshot]);

  const cargarCondicionantesObra = useCallback(async () => {
    if (!obra?.id) return;
    try {
      const [defs, overrides] = await Promise.all([
        fetchMatrizCondicionantes(),
        fetchObraMatrizCondicionantes(obra.id),
      ]);
      setCondicionantesMatriz(defs.condicionantes ?? []);
      setCondicionantesObra(overrides.map ?? new Map());
    } catch {
      setCondicionantesMatriz([]);
      setCondicionantesObra(new Map());
    }
  }, [obra?.id]);
  useEffect(() => { cargarCondicionantesObra(); }, [cargarCondicionantesObra]);

  useEffect(() => {
    setSelected(new Set());
    setSnapshot([]);
    setFlowMsg(null);
    setEstadoFilter("todos");
    setCondicionantesObra(new Map());
    setObraPanel("");
    setAddonQ("");
    setAddonModalOpen(false);
    setEditingAddon(null);
    setReassignAddon(null);
    setReassignObraId("");
    setReassignBusy(false);
    setEstadoBusy("");
    setVarianteBusy("");
  }, [obra?.id, linea]);

  const obrasDestinoReassign = useMemo(() => {
    const map = new Map();
    [...(obras ?? []), obra].filter(Boolean).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    return [...map.values()].sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }));
  }, [obras, obra]);

  const materialById = useMemo(() => new Map((materiales ?? []).map((material) => [material.id, material])), [materiales]);

  const condicionantesModelo = useMemo(() => (condicionantesMatriz ?? [])
    .filter((condicionante) => condicionante.activo !== false)
    .filter((condicionante) => String(condicionante.modelo) === String(linea))
    .map((condicionante) => ({
      ...condicionante,
      activoEnObra: condicionanteActivoEnObra(condicionante, condicionantesObra),
      definidoEnObra: condicionantesObra.has(condicionante.id),
    }))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, "es")),
  [condicionantesMatriz, condicionantesObra, linea]);

  const condicionantesActivos = useMemo(() => condicionantesModelo.filter((condicionante) => condicionante.activoEnObra), [condicionantesModelo]);

  const addonStats = useMemo(() => ({
    total: addons.length,
    adicionales: addons.filter((addon) => addon.tipo !== "opcional").length,
    opcionales: addons.filter((addon) => addon.tipo === "opcional").length,
  }), [addons]);

  const baseRows = useMemo(() => (materiales ?? [])
    .filter(materialActivo)
    .filter((m) => materialQty(m, linea) > 0)
    .map((m) => {
      const precio = priceInfo(m);
      const bucket = materialBucket(m, opciones);
      return {
        id: m.id,
        materialId: m.id,
        material: m,
        source: "matriz",
        descripcion: m.descripcion,
        codigo: m.codigo,
        cantidad: materialQty(m, linea),
        unidad: m.unidad_medida || "unidad",
        proveedor: precio.proveedor || m.proveedor || "Sin proveedor",
        rubro: categoriaNombre(categorias, m.categoria_id),
        precio,
        bucket,
        obs: m.notas || "",
        imagen_url: m.imagen_url || "",
        links: normalizeMaterialLinks(m.links),
        revisado: !!m.revisado,
        review: reviewInfoForMaterial(m),
      };
    })
    .sort((a, b) => {
      const order = { base: 0, condicionante: 1, linea_eje: 2, variante: 3 };
      return (order[a.bucket.key] ?? 9) - (order[b.bucket.key] ?? 9)
        || a.rubro.localeCompare(b.rubro, "es")
        || a.descripcion.localeCompare(b.descripcion, "es");
    }), [materiales, linea, categorias, opciones]);

  const liveRows = useMemo(() => {
    const byKey = new Map(baseRows.map((row) => [row.materialId || row.id, { ...row, baseCantidad: row.cantidad, condicionantes: [] }]));

    for (const condicionante of condicionantesActivos) {
      for (const item of condicionante.items ?? []) {
        if (item.activo === false) continue;
        const delta = condicionanteDelta(item);
        const material = item.material_id ? materialById.get(item.material_id) || item.material || null : null;
        const key = item.material_id || `condicionante-${condicionante.id}-${item.id}`;
        const detalle = {
          id: item.id,
          condicionante: condicionante.nombre,
          delta,
          label: condicionanteItemLabel(item),
        };

        if (byKey.has(key)) {
          const current = byKey.get(key);
          const nextQty = Math.max(0, (toNum(current.cantidad) || 0) + delta);
          byKey.set(key, {
            ...current,
            cantidad: nextQty,
            obs: [current.obs, `${condicionante.nombre}: ${detalle.label}`].filter(Boolean).join(" - "),
            condicionantes: [...(current.condicionantes ?? []), detalle],
          });
          continue;
        }

        if (delta <= 0) continue;
        const precio = material ? priceInfo(material) : { amount: null, moneda: "ARS", text: "Sin precio", proveedor: "" };
        byKey.set(key, {
          id: key,
          materialId: item.material_id || null,
          material,
          source: "condicionante",
          descripcion: item.descripcion || material?.descripcion || condicionante.nombre,
          codigo: material?.codigo || "",
          cantidad: delta,
          baseCantidad: 0,
          unidad: item.unidad || material?.unidad_medida || "unidad",
          proveedor: precio.proveedor || material?.proveedor || "Sin proveedor",
          rubro: material ? categoriaNombre(categorias, material.categoria_id) : "Condicionante",
          precio,
          bucket: { key: "condicionante", label: "Condicionante", color: C.amber },
          obs: [condicionante.nombre, item.notas].filter(Boolean).join(" - "),
          imagen_url: material?.imagen_url || "",
          links: normalizeMaterialLinks(material?.links),
          revisado: !!material?.revisado,
          review: material ? reviewInfoForMaterial(material) : { flag: false, reason: "" },
          condicionantes: [detalle],
        });
      }
    }

    return [...byKey.values()]
      .filter((row) => (toNum(row.cantidad) || 0) > 0)
      .sort((a, b) => {
        const order = { base: 0, condicionante: 1, linea_eje: 2, variante: 3 };
        return (order[a.bucket.key] ?? 9) - (order[b.bucket.key] ?? 9)
          || a.rubro.localeCompare(b.rubro, "es")
          || a.descripcion.localeCompare(b.descripcion, "es");
      });
  }, [baseRows, categorias, condicionantesActivos, materialById]);

  const addonRows = useMemo(() => (addons ?? [])
    .map((addon) => addonRowToView(addon, materialById, categorias))
    .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true })),
  [addons, materialById, categorias]);

  const addonByMergeKey = useMemo(() => {
    const map = new Map();
    addonRows.forEach((row) => {
      const addon = addons.find((item) => item.id === row.addonId);
      const key = snapshotMergeKey(row);
      if (addon && key) map.set(key, addon);
    });
    return map;
  }, [addonRows, addons]);

  const obraRows = useMemo(() => [...liveRows, ...addonRows], [liveRows, addonRows]);
  const snapshotRows = useMemo(() => snapshot.map(snapshotRowToView), [snapshot]);
  const rows = useMemo(() => mergeMatrixAndSnapshotRows(obraRows, snapshotRows), [obraRows, snapshotRows]);
  const snapshotActivo = snapshot.length > 0;
  const snapshotParcial = useMemo(() => {
    if (!snapshotRows.length || !liveRows.length) return false;
    const snapshotKeys = new Set(snapshotRows.map((row, index) => snapshotMergeKey(row, index)).filter(Boolean));
    const liveKeys = liveRows.map((row, index) => snapshotMergeKey(row, index)).filter(Boolean);
    return liveKeys.some((key) => !snapshotKeys.has(key));
  }, [snapshotRows, liveRows]);
  const snapshotNecesitaSync = useMemo(() => {
    if (!snapshotRows.length || !obraRows.length) return !snapshotRows.length && !!obraRows.length;
    const snapshotKeys = new Set(snapshotRows.map((row, index) => snapshotMergeKey(row, index)).filter(Boolean));
    const liveKeys = obraRows.map((row, index) => snapshotMergeKey(row, index)).filter(Boolean);
    return liveKeys.some((key) => !snapshotKeys.has(key));
  }, [snapshotRows, obraRows]);
  const snapshotStatus = snapshotActivo
    ? snapshotParcial
      ? { label: "Lista parcial", color: C.amber, border: C.amberB, bg: C.amberL }
      : { label: "Lista fijada", color: C.green, border: C.greenB, bg: C.greenL }
    : { label: "Matriz viva", color: C.t2, border: C.b0, bg: C.s0 };

  const facets = useMemo(() => {
    const proveedoresSet = new Set();
    const rubrosSet = new Set();
    rows.forEach((row) => {
      if (row.proveedor) proveedoresSet.add(row.proveedor);
      if (row.rubro) rubrosSet.add(row.rubro);
    });
    return {
      proveedores: [...proveedoresSet].sort((a, b) => a.localeCompare(b, "es")),
      rubros: [...rubrosSet].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return rows
      .filter((row) => !proveedorFilter || row.proveedor === proveedorFilter)
      .filter((row) => !rubroFilter || row.rubro === rubroFilter)
      .filter((row) => tipoFilter === "todos" || (tipoFilter === "sin_precio" ? !row.precio.amount : tipoFilter === "revisar" ? row.review?.flag : row.bucket.key === tipoFilter))
      .filter((row) => {
        if (estadoFilter === "todos") return true;
        const estado = estadoObraForRow(row);
        return estado === estadoFilter;
      })
      .filter((row) => {
        if (!terms.length) return true;
        const hay = norm(`${row.descripcion} ${row.codigo} ${row.proveedor} ${row.rubro} ${row.variante || ""} ${row.obs} ${recepcionMetaForRow(row).label} ${row.recepcion_estado || ""} ${row.recepcion_nota || ""}`);
        return terms.every((t) => hay.includes(t));
      });
  }, [rows, q, proveedorFilter, rubroFilter, tipoFilter, estadoFilter]);

  const groupedRows = useMemo(() => {
    const map = new Map();
    visibleRows.forEach((row) => {
      const key = groupBy === "rubro" ? row.rubro : groupBy === "tipo" ? row.bucket.label : row.proveedor;
      const label = key || "Sin clasificar";
      if (!map.has(label)) map.set(label, { label, rows: [], usd: 0, ars: 0, sinPrecio: 0, revisar: 0, esAddon: false });
      const group = map.get(label);
      group.rows.push(row);
      // Marcar si el grupo contiene adicionales
      if (row.source === "addon" || row.bucket?.key === "addon") group.esAddon = true;
      if (row.review?.flag) group.revisar += 1;
      const qty = toNum(row.cantidad) || 1;
      if (row.precio.amount) {
        if (row.precio.moneda === "USD") group.usd += row.precio.amount * qty;
        else group.ars += row.precio.amount * qty;
      } else {
        group.sinPrecio += 1;
      }
    });
    // Ordenar: grupos normales primero (por cantidad de ítems), adicionales al final
    return [...map.values()].sort((a, b) => {
      if (a.esAddon && !b.esAddon) return 1;
      if (!a.esAddon && b.esAddon) return -1;
      return b.rows.length - a.rows.length || a.label.localeCompare(b.label, "es");
    });
  }, [visibleRows, groupBy]);

  const kpis = useMemo(() => rows.reduce((acc, row) => {
    const qty = toNum(row.cantidad) || 1;
    acc.items += 1;
    if (row.bucket.key === "linea_eje") acc.lineaEje += 1;
    if (row.bucket.key === "variante") acc.variantes += 1;
    if (row.bucket.key === "condicionante" || row.condicionantes?.length) acc.condicionantes += 1;
    const estado = estadoObraForRow(row);
    if (estado === "pendiente") acc.pendientes += 1;
    if (estado === "comprado") acc.comprados += 1;
    if (estado === "en_panol") acc.enPanol += 1;
    if (estado === "egresado") acc.egresados += 1;
    if (row.review?.flag) acc.revisar += 1;
    if (!row.precio.amount) acc.sinPrecio += 1;
    else if (row.precio.moneda === "USD") {
      if (row.bucket.key === "linea_eje") acc.ejeUsd += row.precio.amount * qty;
      else acc.usd += row.precio.amount * qty;
    } else {
      acc.ars += row.precio.amount * qty;
    }
    return acc;
  }, { items: 0, sinPrecio: 0, revisar: 0, lineaEje: 0, variantes: 0, condicionantes: 0, pendientes: 0, comprados: 0, enPanol: 0, egresados: 0, usd: 0, ars: 0, ejeUsd: 0 }), [rows]);
  const orderRows = useMemo(() => {
    const base = selected.size ? visibleRows.filter((r) => selected.has(r.id)) : visibleRows;
    return base.map((r) => ({
      id: r.id,
      snapshotId: r.snapshotId,
      materialId: r.materialId,
      source: r.source,
      bucketKey: r.bucket.key,
      descripcion: r.descripcion,
      codigo: r.codigo,
      cantidad: r.cantidad,
      unidad: r.unidad,
      proveedor: r.proveedor,
      rubro: r.rubro,
      tipo: r.bucket.label,
      variante: r.variante || "",
      precio: r.precio,
      obs: [r.bucket.key !== "base" ? r.bucket.label : "", r.variante ? `Variante: ${r.variante}` : "", r.obs].filter(Boolean).join(" · "),
    }));
  }, [visibleRows, selected]);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copiarOrden() {
    const text = buildOrdenTexto({ obra, lineaNombre, rows: orderRows, groupBy });
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function ensureSnapshotForFlow() {
    if (snapshot.length && !snapshotNecesitaSync) return snapshot;
    setSnapshotBusy(true);
    try {
      const saved = await ensureObraMaterialSnapshot(obra.id, obraRows);
      if (saved.length) {
        setSnapshot(saved);
        setSelected(new Set());
      }
      return saved;
    } finally {
      setSnapshotBusy(false);
    }
  }

  function snapshotIdForOrderRow(row, saved = snapshot) {
    if (row.snapshotId) return row.snapshotId;
    if (row.source === "addon" || row.bucketKey === "addon") {
      const rowKey = snapshotMergeKey({ ...row, source: "addon", bucket: { key: "addon" } });
      return saved.find((s) => snapshotMergeKey(snapshotRowToView(s)) === rowKey)?.id || null;
    }
    if (!row.materialId) return null;
    return saved.find((s) => s.material_id === row.materialId)?.id || null;
  }

  async function pedirAComprasObra() {
    if (!orderRows.length) return;
    if (!pedidoObraTipo) {
      setFlowMsg({ type: "err", text: "Elegí el tipo de pedido." });
      return;
    }
    setActionBusy("compras");
    setFlowMsg(null);
    try {
      const saved = await ensureSnapshotForFlow();
      const req = await createPurchaseRequest({
        form: {
          title: `Pedido ${obra.codigo} - ${selected.size ? `${selected.size} items` : "lista filtrada"}`,
          description: buildOrdenTexto({ obra, lineaNombre, rows: orderRows, groupBy }),
          priority: "media",
          source: "materiales_obra",
          project_id: obra.id,
          destino: `Obra ${obra.codigo}`,
          es_adicional: pedidoObraTipo === "adicional",
          tipo_pedido: pedidoObraTipo,
        },
      });

      const touched = [];
      for (const row of orderRows) {
        const created = await addRequestItem(req.id, {
          description: row.descripcion,
          quantity: toNum(row.cantidad) || 1,
          unit: row.unidad || "unidad",
          destination: `Obra ${obra.codigo}`,
        });
        const snapId = snapshotIdForOrderRow(row, saved);
        if (snapId) {
          touched.push(snapId);
          await updateObraSnapshotRows([snapId], {
            estado: "pedido",
            purchase_request_id: req.id,
            purchase_request_item_id: created?.id || null,
          });
        }
      }
      if (touched.length) cargarSnapshot();
      setFlowMsg({ type: "ok", text: `Pedido creado para compras con ${orderRows.length} items.` });
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo crear el pedido a compras." });
    } finally {
      setActionBusy("");
    }
  }

  async function abrirAvisoPanol() {
    if (!orderRows.length) return;
    setActionBusy("panol");
    setFlowMsg(null);
    try {
      const saved = await ensureSnapshotForFlow();
      setPanolPrefill({
        titulo: `Recepcion ${obra.codigo} - ${selected.size ? `${selected.size} items` : "lista filtrada"}`,
        sede: obra.sede || "Pampa",
        obraId: obra.id,
        prioridad: "media",
        observaciones: `Recepcion por obra desde lista matriz ${lineaNombre}.`,
        origen: "obra_matriz",
        items: orderRows.map((row) => ({
          descripcion: row.descripcion,
          codigo: row.codigo || "",
          cantidad: row.cantidad,
          unidad: row.unidad || "unidad",
          material_id: row.materialId || "",
          proveedor: row.proveedor || "",
          variante: row.variante || "",
          precio_unitario: row.precio?.amount ?? "",
          moneda: row.precio?.moneda || "ARS",
          obra_snapshot_item_id: snapshotIdForOrderRow(row, saved),
        })),
      });
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo preparar el aviso a pañol." });
    } finally {
      setActionBusy("");
    }
  }

  async function toggleCondicionanteObra(condicionante) {
    if (!obra?.id || condicionanteBusy) return;
    const next = !condicionante.activoEnObra;
    setCondicionanteBusy(condicionante.id);
    setFlowMsg(null);
    try {
      await setObraMatrizCondicionante(obra.id, condicionante.id, next);
      await cargarCondicionantesObra();
      if (snapshotActivo) {
        setFlowMsg({ type: "ok", text: "Configuracion guardada. Esta obra ya tiene lista fijada; regenerala para recalcular cantidades." });
      }
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo guardar el condicionante de la obra." });
    } finally {
      setCondicionanteBusy("");
    }
  }

  async function regenerarSnapshotObra() {
    if (!obra?.id || snapshotBusy) return;
    if (!window.confirm("Regenerar la lista fija desde la matriz viva? Solo se permite si aun no tiene pedidos o recepciones vinculadas.")) return;
    setSnapshotBusy(true);
    setFlowMsg(null);
    try {
      const saved = await reemplazarObraMaterialSnapshotSeguro(obra.id, obraRows);
      setSnapshot(saved);
      setSelected(new Set());
      setFlowMsg({ type: "ok", text: "Lista fija regenerada con la configuracion actual de la obra." });
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo regenerar la lista fija." });
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function regularizarEstadoRow(row, estado, nota = "") {
    if (!row || !estado || estadoBusy) return;
    setEstadoBusy(row.id);
    setFlowMsg(null);
    try {
      const saved = await ensureSnapshotForFlow();
      const snapId = snapshotIdForOrderRow({ ...row, bucketKey: row.bucket?.key }, saved);
      if (!snapId) throw new Error("No se pudo identificar el item de obra para guardar el estado.");
      await cambiarEstadoObraSnapshot(snapId, estado, nota);
      await cargarSnapshot();
      setFlowMsg({ type: "ok", text: `Estado actualizado: ${row.descripcion} -> ${SNAPSHOT_ESTADO_META[estado]?.label || estado}.` });
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo cambiar el estado del item." });
    } finally {
      setEstadoBusy("");
    }
  }

  async function cambiarVarianteRow(row, variante = "") {
    if (!row || varianteBusy) return;
    setVarianteBusy(row.id);
    setFlowMsg(null);
    try {
      const saved = await ensureSnapshotForFlow();
      const snapId = snapshotIdForOrderRow({ ...row, bucketKey: row.bucket?.key }, saved);
      if (!snapId) throw new Error("No se pudo identificar el item de obra para guardar la variante.");
      await updateObraSnapshotRows([snapId], { variante: String(variante || "").trim() || null });
      await cargarSnapshot();
      setFlowMsg({ type: "ok", text: variante ? `Variante guardada para ${row.descripcion}: ${variante}.` : `Variante limpiada para ${row.descripcion}.` });
    } catch (e) {
      const msg = String(e?.message || "");
      setFlowMsg({ type: "err", text: msg.toLowerCase().includes("variante") ? "Falta correr el SQL de variante por obra para poder guardar esta marca." : msg || "No se pudo guardar la variante del item." });
    } finally {
      setVarianteBusy("");
    }
  }

  function snapshotLockedForAddon(row) {
    const recepcionEstado = String(row?.recepcion_estado || "").toLowerCase();
    if (["recibido", "parcial", "sin_info", "falta_stock", "rechazado"].includes(recepcionEstado)) return true;
    const estado = String(row?.snapshot_estado || row?.estadoObra || "").toLowerCase();
    if (estado === "egresado") return true;
    if (!recepcionEstado && ["en_panol", "recibido"].includes(estado)) return true;
    return false;
  }

  function addonForVisibleRow(row) {
    if (!row || row.bucket?.key !== "addon") return null;
    const direct = row.addonId ? addons.find((item) => item.id === row.addonId) : null;
    const byKey = addonByMergeKey.get(snapshotMergeKey(row));
    const addon = direct || byKey;
    return addon ? { ...addon, __snapshotId: row.snapshotId || null, __snapshotLocked: snapshotLockedForAddon(row) } : null;
  }

  function openReassignAddon(addon) {
    if (!addon) return;
    setReassignAddon(addon);
    setReassignObraId(addon.obra_id || obra?.id || "");
  }

  async function submitReassignAddon() {
    if (!reassignAddon?.id || !reassignObraId || reassignBusy) return;
    if (reassignAddon.__snapshotLocked) {
      setFlowMsg({ type: "err", text: "Este adicional ya tiene movimiento de panol. Movelo desde stock para conservar el kardex." });
      return;
    }
    setReassignBusy(true);
    setFlowMsg(null);
    try {
      await reasignarAddon(reassignAddon.id, reassignObraId, {
        materialId: reassignAddon.material_id || null,
        fromObraId: reassignAddon.obra_id || obra?.id || null,
        descripcion: reassignAddon.descripcion || "",
      });
      const destino = obrasDestinoReassign.find((item) => item.id === reassignObraId);
      setFlowMsg({ type: "ok", text: `Adicional reasignado a ${destino?.codigo || "otra obra"}.` });
      setReassignAddon(null);
      setReassignObraId("");
      await Promise.all([cargarAddons(), cargarSnapshot()]);
      await onChanged?.();
    } catch (e) {
      setFlowMsg({ type: "err", text: e?.message || "No se pudo reasignar el adicional." });
    } finally {
      setReassignBusy(false);
    }
  }

  const chipStyle = (on, color = C.blue) => ({
    ...BTN,
    padding: "7px 11px",
    background: on ? C.s1 : C.s0,
    border: `1px solid ${on ? C.b1 : C.b0}`,
    color: on ? color : C.t2,
    fontWeight: 800,
  });

  return (
    <div>
      <div style={{ border: `1px solid ${C.b0}`, borderRadius: 18, background: "var(--panel)", padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <button type="button" onClick={onBack} style={{ ...BTN, padding: "8px 12px" }}>← {lineaNombre}</button>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 24, fontWeight: 950, color: C.t0 }}>{obra.codigo}</div>
            <div style={{ fontSize: 12.5, color: C.t2, marginTop: 3 }}>
              Lista completa aplicada a esta obra · {lineaNombre}
            </div>
          </div>
          <button type="button" onClick={copiarOrden} disabled={!orderRows.length} style={{ ...BTN_GREEN, padding: "9px 14px" }}>
            <Copy size={14} /> {copied ? "Copiado" : "Copiar OC"}
          </button>
          <span style={{ fontSize: 11, fontWeight: 900, color: snapshotStatus.color, border: `1px solid ${snapshotStatus.border}`, background: snapshotStatus.bg, borderRadius: 999, padding: "5px 10px" }}>
            {snapshotStatus.label}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: `1px solid ${C.b0}`, paddingTop: 10 }}>
          <CompactStat label="Items" value={kpis.items} color={C.blue} active={estadoFilter === "todos"} onClick={() => setEstadoFilter("todos")} />
          <CompactStat label="Pendiente" value={kpis.pendientes} color={C.t2} active={estadoFilter === "pendiente"} onClick={() => setEstadoFilter("pendiente")} />
          <CompactStat label="Comprado" value={kpis.comprados} color={C.amber} active={estadoFilter === "comprado"} onClick={() => setEstadoFilter("comprado")} />
          <CompactStat label="En pañol" value={kpis.enPanol} color={C.violet} active={estadoFilter === "en_panol"} onClick={() => setEstadoFilter("en_panol")} />
          <CompactStat label="Egresado" value={kpis.egresados} color={C.green} active={estadoFilter === "egresado"} onClick={() => setEstadoFilter("egresado")} />
        </div>
      </div>

      <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 8, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setObraPanel((panel) => (panel === "config" ? "" : "config"))} style={{ ...BTN, padding: "7px 11px", color: obraPanel === "config" ? C.amber : C.t1, background: obraPanel === "config" ? C.amberL : C.s0, borderColor: obraPanel === "config" ? C.amberB : C.b0, fontWeight: 900 }}>
          Configuracion <span style={{ color: C.amber, fontFamily: C.mono }}>{condicionantesActivos.length}/{condicionantesModelo.length}</span>
        </button>
        <button type="button" onClick={() => setObraPanel((panel) => (panel === "adicionales" ? "" : "adicionales"))} style={{ ...BTN, padding: "7px 11px", color: obraPanel === "adicionales" ? C.green : C.t1, background: obraPanel === "adicionales" ? C.greenL : C.s0, borderColor: obraPanel === "adicionales" ? C.greenB : C.b0, fontWeight: 900 }}>
          Adicionales <span style={{ color: C.green, fontFamily: C.mono }}>{addonStats.total}</span>
        </button>
        <div style={{ flex: "1 1 180px", color: C.t2, fontSize: 11.5 }}>
          La lista queda abajo. Estos paneles se abren solo para ajustar la obra.
        </div>
        {obraPanel && (
          <button type="button" onClick={() => setObraPanel("")} style={{ ...BTN, padding: "6px 9px", fontSize: 11, color: C.t2 }}>
            Cerrar
          </button>
        )}
      </div>

      {obraPanel === "config" && condicionantesModelo.length > 0 && (
        <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 10, marginBottom: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 950, color: C.t0 }}>Configuracion de esta obra</div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 2, lineHeight: 1.35 }}>
                Se toca una vez: base + condicionantes activos.
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, color: C.amber, border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 999, padding: "4px 9px" }}>
              {condicionantesActivos.length}/{condicionantesModelo.length} activos
            </span>
          </div>
          {snapshotActivo && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: C.amber, border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 10, padding: "7px 9px" }}>
              <span>Esta obra ya tiene lista fijada. Los cambios quedan guardados, pero para que impacten en cantidades hay que regenerar la lista antes de pedir/avisar.</span>
              <button type="button" onClick={regenerarSnapshotObra} disabled={snapshotBusy} style={{ ...BTN, padding: "5px 9px", fontSize: 11, color: C.amber, borderColor: C.amberB, background: C.bg }}>
                {snapshotBusy ? "Regenerando..." : "Regenerar lista"}
              </button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6, maxHeight: 210, overflowY: "auto" }}>
            {condicionantesModelo.map((condicionante) => {
              const active = condicionante.activoEnObra;
              const items = (condicionante.items ?? []).filter((item) => item.activo !== false);
              return (
                <div key={condicionante.id} style={{ border: `1px solid ${active ? C.greenB : C.b0}`, background: active ? C.greenL : C.s0, borderRadius: 10, padding: "7px 8px", display: "grid", gap: 5 }} title={condicionante.descripcion || condicionante.nombre}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condicionante.nombre}</div>
                      <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>
                        {condicionante.definidoEnObra ? "Definido en esta obra" : condicionante.activo_por_defecto ? "Activo por defecto" : "Apagado por defecto"}
                      </div>
                    </div>
                    <button type="button" disabled={condicionanteBusy === condicionante.id} onClick={() => toggleCondicionanteObra(condicionante)} style={{ ...BTN, padding: "4px 8px", color: active ? C.green : C.t2, borderColor: active ? C.greenB : C.b0, background: active ? C.bg : C.s0, fontSize: 10.5, fontWeight: 900 }}>
                      {active ? "Lleva" : "No lleva"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {items.length ? items.slice(0, 4).map((item) => (
                      <span key={item.id} style={{ fontSize: 10.5, color: condicionanteDelta(item) < 0 ? C.red : C.t1, border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 999, padding: "2px 7px" }}>
                        {condicionanteItemLabel(item)}
                      </span>
                    )) : <span style={{ fontSize: 10.5, color: C.t3 }}>Sin items asociados</span>}
                    {items.length > 4 && <span style={{ fontSize: 10.5, color: C.t3 }}>+{items.length - 4} mas</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {obraPanel === "adicionales" && (
        <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 13, marginBottom: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 950, color: C.t0 }}>Items propios de {obra.codigo}</div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
                {addonStats.total} total · {addonStats.adicionales} adicionales del cliente · {addonStats.opcionales} opcionales de configuracion.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={addonQ} onChange={(e) => setAddonQ(e.target.value)} placeholder="Buscar adicional..." style={{ ...INP, width: 240, height: 34 }} />
              <button type="button" onClick={() => { setEditingAddon(null); setAddonModalOpen(true); }} style={{ ...BTN_GREEN, padding: "8px 12px" }}>
                <PackagePlus size={14} /> Agregar item
              </button>
            </div>
          </div>
        </div>
      )}

      <ObraAddonModal
        open={addonModalOpen}
        obra={obra}
        obras={obras}
        addon={editingAddon}
        materiales={materiales}
        categorias={categorias}
        proveedores={proveedores}
        ums={ums}
        onClose={() => { setAddonModalOpen(false); setEditingAddon(null); }}
        onSaved={async () => {
          setAddonModalOpen(false);
          setEditingAddon(null);
          await cargarAddons();
          await onChanged?.();
        }}
        onChanged={onChanged}
      />

      {reassignAddon ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 5100, background: "rgba(2,6,23,.62)", display: "grid", placeItems: "center", padding: 18 }}>
          <div style={{ width: "min(460px, calc(100vw - 28px))", border: `1px solid ${C.b1}`, borderRadius: 14, background: C.panelSolid, boxShadow: "0 24px 80px rgba(0,0,0,.35)", padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 950, color: C.t0 }}>Reasignar adicional</div>
                <div style={{ fontSize: 12, color: C.t2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {reassignAddon.descripcion || "Item adicional"}
                </div>
              </div>
              <button type="button" onClick={() => setReassignAddon(null)} style={{ ...BTN, padding: "6px 8px" }} title="Cerrar">
                <X size={14} />
              </button>
            </div>

            {reassignAddon.__snapshotLocked ? (
              <div style={{ fontSize: 12, color: C.amber, border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 10, padding: "8px 9px", lineHeight: 1.35 }}>
                Este adicional ya tuvo movimiento de panol. Para moverlo hay que hacerlo desde stock y conservar el kardex.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.35 }}>
                Lo mueve de {obra.codigo} a otra obra. Si solo tenia pedido/aviso pendiente tambien se actualiza ese vinculo.
              </div>
            )}

            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: C.t2, textTransform: "uppercase", letterSpacing: 0.7 }}>Obra destino</span>
              <select
                value={reassignObraId}
                disabled={reassignAddon.__snapshotLocked || reassignBusy}
                onChange={(e) => setReassignObraId(e.target.value)}
                style={{ ...INP, height: 38 }}
              >
                {obrasDestinoReassign.map((item) => (
                  <option key={item.id} value={item.id} style={OPT_ST}>
                    {item.codigo || "Sin codigo"}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setReassignAddon(null)} disabled={reassignBusy} style={{ ...BTN, padding: "8px 12px" }}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={reassignAddon.__snapshotLocked || reassignBusy || !reassignObraId || reassignObraId === (reassignAddon.obra_id || obra?.id)}
                onClick={submitReassignAddon}
                style={{
                  ...BTN_GREEN,
                  padding: "8px 13px",
                  opacity: (reassignAddon.__snapshotLocked || reassignBusy || !reassignObraId || reassignObraId === (reassignAddon.obra_id || obra?.id)) ? 0.55 : 1,
                }}
              >
                {reassignBusy ? "Guardando..." : "Reasignar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 13, marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 280px" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item, proveedor, rubro, código..." style={{ ...INP, width: "100%", paddingLeft: 36, height: 38 }} />
          </div>
          <select value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)} style={{ ...INP, width: 190, height: 38 }} title="Filtrar proveedor">
            <option value="" style={OPT_ST}>Todos los proveedores</option>
            {facets.proveedores.map((p) => <option key={p} value={p} style={OPT_ST}>{p}</option>)}
          </select>
          <select value={rubroFilter} onChange={(e) => setRubroFilter(e.target.value)} style={{ ...INP, width: 170, height: 38 }} title="Filtrar rubro">
            <option value="" style={OPT_ST}>Todos los rubros</option>
            {facets.rubros.map((r) => <option key={r} value={r} style={OPT_ST}>{r}</option>)}
          </select>
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} style={{ ...INP, width: 190, height: 38 }} title="Filtrar estado del item">
            {recepcionFilterOptions(kpis).map(([key, label]) => (
              <option key={key} value={key} style={OPT_ST}>{label}</option>
            ))}
          </select>
          {[
            ["todos", "Todo", C.blue],
            ["base", "Base", C.green],
            ["addon", "Adicionales", C.violet],
            ["condicionante", "Condicionantes", C.amber],
            ["linea_eje", "Línea eje", C.violet],
            ["variante", "Variantes", C.amber],
            ["sin_precio", "Sin precio", C.red],
            ["revisar", "A revisar", C.amber],
          ].map(([key, label, color]) => (
            <button key={key} type="button" onClick={() => setTipoFilter(key)} style={chipStyle(tipoFilter === key, color)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
          <PackagePlus size={16} style={{ color: C.green }} />
          <div style={{ fontSize: 12, fontWeight: 900, color: C.t0, marginRight: 2 }}>Estado</div>
          {recepcionFilterOptions(kpis).map(([key, label, color]) => (
            <button key={key} type="button" onClick={() => setEstadoFilter(key)} style={chipStyle(estadoFilter === key, color)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
          <FileText size={16} style={{ color: C.blue }} />
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.t0 }}>Orden de compra</div>
            <div style={{ fontSize: 11.5, color: C.t2 }}>{selected.size ? `${selected.size} seleccionados` : `${visibleRows.length} visibles`} · se copia el texto para compras.</div>
          </div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...INP, width: 150 }}>
            <option value="proveedor" style={OPT_ST}>Proveedor</option>
            <option value="rubro" style={OPT_ST}>Rubro</option>
            <option value="tipo" style={OPT_ST}>Tipo</option>
          </select>
          <div style={{ display: "inline-flex", gap: 6, border: `1px solid ${C.b0}`, borderRadius: 10, padding: 4, background: C.s0 }}>
            {[
              { value: "stock", label: "Stock pañol", color: C.green },
              { value: "estandar", label: "Estándar", color: C.blue },
              { value: "adicional", label: "Adicional", color: C.violet },
            ].map(({ value, label, color }) => (
              <button key={label} type="button" onClick={() => setPedidoObraTipo(value)} style={{ ...BTN, padding: "6px 10px", color: pedidoObraTipo === value ? color : C.t2, background: pedidoObraTipo === value ? `${color}18` : "transparent", borderColor: pedidoObraTipo === value ? color : "transparent", fontWeight: 900 }}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={copiarOrden} disabled={!orderRows.length} style={{ ...BTN_GREEN, padding: "9px 14px" }}>
            <Copy size={14} /> {copied ? "Copiado" : "Copiar OC"}
          </button>
          <button type="button" onClick={pedirAComprasObra} disabled={!orderRows.length || !!actionBusy || snapshotBusy} style={{ ...BTN_PRIMARY, padding: "9px 14px" }}>
            <ShoppingCart size={14} /> {actionBusy === "compras" || snapshotBusy ? "Creando..." : "Pedir a compras"}
          </button>
          <button type="button" onClick={abrirAvisoPanol} disabled={!orderRows.length || !!actionBusy || snapshotBusy} style={{ ...BTN_GREEN, padding: "9px 14px" }}>
            <PackagePlus size={14} /> {actionBusy === "panol" || snapshotBusy ? "Preparando..." : "Avisar recepcion a pañol"}
          </button>
        </div>
        {flowMsg && (
          <div style={{ fontSize: 12.5, fontWeight: 750, color: flowMsg.type === "err" ? C.red : C.green, border: `1px solid ${flowMsg.type === "err" ? "rgba(239,68,68,0.30)" : C.greenB}`, background: flowMsg.type === "err" ? "rgba(239,68,68,0.10)" : C.greenL, borderRadius: 10, padding: "8px 10px" }}>
            {flowMsg.text}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {groupedRows.map((group) => (
          <section key={group.label} style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${C.b0}`, background: C.s0, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 950, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
                <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>
                  {group.rows.length} items{group.sinPrecio ? ` · ${group.sinPrecio} sin precio` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {group.revisar ? <span style={{ fontSize: 11, fontWeight: 900, color: C.amber, border: `1px solid ${C.amberB}`, borderRadius: 999, padding: "4px 9px", background: C.amberL }}>{group.revisar} a revisar</span> : null}
                {group.usd ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 9px", background: C.bg }}>{fmtMoney(group.usd, "USD")}</span> : null}
                {group.ars ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 9px", background: C.bg }}>{fmtMoney(group.ars, "ARS")}</span> : null}
              </div>
            </div>
            <div style={{ display: "grid", gap: 7, padding: 10 }}>
              {group.rows.map((row) => {
                const qty = toNum(row.cantidad) || 1;
                const total = row.precio.amount ? row.precio.amount * qty : null;
                const variantOptions = materialVariants(row.material || materialById.get(row.materialId));
                const editableAddon = addonForVisibleRow(row);
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "26px minmax(220px, 1.25fr) minmax(110px, .45fr) minmax(140px, .55fr) minmax(110px, .45fr) minmax(180px, .7fr)",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 11px",
                      border: `1px solid ${selected.has(row.id) ? C.blueB : row.review?.flag ? C.amberB : C.b0}`,
                      borderRadius: 11,
                      background: selected.has(row.id) ? C.blueL : row.review?.flag ? C.amberL : C.bg,
                    }}
                  >
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 900, color: C.t0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{row.descripcion}</span>
                        <span style={{ fontSize: 10, fontWeight: 900, color: row.bucket.color, background: `${row.bucket.color}16`, border: `1px solid ${row.bucket.color}44`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
                          {row.bucket.label}
                        </span>
                        <ObraVarianteControl
                          row={row}
                          options={variantOptions}
                          busy={varianteBusy === row.id || snapshotBusy}
                          onChange={cambiarVarianteRow}
                        />
                        {row.review?.flag && <ReviewBadge reason={row.review.reason} />}
                        <RecepcionChip row={row} />
                        {editableAddon ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAddon(editableAddon);
                                setAddonModalOpen(true);
                              }}
                              style={{ ...BTN, padding: "3px 7px", color: C.blue, fontSize: 10.5 }}
                              title="Editar adicional"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                            <button
                              type="button"
                              disabled={editableAddon.__snapshotLocked}
                              onClick={() => openReassignAddon(editableAddon)}
                              style={{ ...BTN, padding: "3px 7px", color: editableAddon.__snapshotLocked ? C.t3 : C.violet, fontSize: 10.5, opacity: editableAddon.__snapshotLocked ? 0.55 : 1 }}
                              title={editableAddon.__snapshotLocked ? "Ya tiene movimiento de panol" : "Reasignar adicional a otra obra"}
                            >
                              <RefreshCw size={12} /> Reasignar
                            </button>
                          </>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.35 }}>
                        {row.codigo || "sin código"}{row.obs ? ` · ${row.obs}` : ""}
                      </div>
                      {row.condicionantes?.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                          {row.baseCantidad != null && row.baseCantidad !== row.cantidad && (
                            <span style={{ fontSize: 10.5, color: C.t2, border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 999, padding: "2px 7px" }}>
                              Base {qtyText(row.baseCantidad, row.unidad)}
                            </span>
                          )}
                          {row.condicionantes.map((detalle) => (
                            <span key={`${detalle.id}-${detalle.condicionante}`} style={{ fontSize: 10.5, color: detalle.delta < 0 ? C.red : C.amber, border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 999, padding: "2px 7px" }}>
                              {detalle.condicionante}: {detalle.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <RecepcionDetalle row={row} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Cantidad</div>
                      <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 850, color: C.t0 }}>{qtyText(row.cantidad, row.unidad)}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Proveedor</div>
                      <div style={{ fontSize: 12.5, fontWeight: 850, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.proveedor}</div>
                      <div style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.rubro}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Precio</div>
                      <div style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 850, color: row.precio.amount ? C.t0 : C.amber }}>{row.precio.text}</div>
                      {total ? <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.t2 }}>total {fmtMoney(total, row.precio.moneda)}</div> : null}
                    </div>
                    <ObraEstadoControl
                      row={row}
                      busy={estadoBusy === row.id || snapshotBusy}
                      onChange={regularizarEstadoRow}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!groupedRows.length && (
          <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 13, border: `1px dashed ${C.b0}`, borderRadius: 14 }}>
            No hay items con esos filtros.
          </div>
        )}
      </div>
      <EnviarAPanolModal
        open={!!panolPrefill}
        prefill={panolPrefill}
        showPrices={false}
        onClose={(saved) => {
          setPanolPrefill(null);
          if (saved) {
            setFlowMsg({ type: "ok", text: "Aviso enviado a pañol para recepcion por obra." });
            cargarSnapshot();
          }
        }}
      />
    </div>
  );
}

function LineaMatrizView({ linea, obras = [], categorias, materiales, proveedores = [], opciones = [], ums, onChanged, onBack, onSelectObra }) {
  const [q, setQ] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [proveedorTipoFilter, setProveedorTipoFilter] = useState("todos");
  const [rubroFilter, setRubroFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [groupBy, setGroupBy] = useState("proveedor");
  const [selected, setSelected] = useState(() => new Set());
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const code = String(linea?.codigo || "").replace(/^K/i, "");
  const title = linea?.nombre || `K${code}`;

  useEffect(() => {
    setSelected(new Set());
    setEditingId("");
    setRemovingId("");
  }, [code]);

  const rows = useMemo(() => (materiales ?? [])
    .filter(materialActivo)
    .filter((m) => materialQty(m, code) > 0)
    .map((m) => {
      const precio = priceInfo(m);
      const bucket = materialBucket(m, opciones);
      const proveedor = precio.proveedor || m.proveedor || "Sin proveedor";
      return {
        id: m.id,
        material: m,
        descripcion: m.descripcion,
        codigo: m.codigo,
        cantidad: materialQty(m, code),
        unidad: m.unidad_medida || "unidad",
        proveedor,
        proveedorMeta: proveedorMeta(proveedor, proveedores),
        rubro: categoriaNombre(categorias, m.categoria_id),
        precio,
        bucket,
        obs: m.notas || "",
        revisado: !!m.revisado,
        review: reviewInfoForMaterial(m),
      };
    })
    .sort((a, b) => {
      const order = { base: 0, linea_eje: 1, variante: 2 };
      return (order[a.bucket.key] ?? 9) - (order[b.bucket.key] ?? 9)
        || a.rubro.localeCompare(b.rubro, "es")
        || a.descripcion.localeCompare(b.descripcion, "es");
    }), [materiales, code, categorias, opciones, proveedores]);

  const facets = useMemo(() => {
    const proveedoresSet = new Set();
    const rubrosSet = new Set();
    rows.forEach((row) => {
      if (row.proveedor) proveedoresSet.add(row.proveedor);
      if (row.rubro) rubrosSet.add(row.rubro);
    });
    return {
      proveedores: [...proveedoresSet].sort((a, b) => a.localeCompare(b, "es")),
      rubros: [...rubrosSet].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return rows
      .filter((row) => !proveedorFilter || row.proveedor === proveedorFilter)
      .filter((row) => proveedorTipoFilter === "todos" || row.proveedorMeta?.tipo === proveedorTipoFilter)
      .filter((row) => !rubroFilter || row.rubro === rubroFilter)
      .filter((row) => tipoFilter === "todos" || (tipoFilter === "sin_precio" ? !row.precio.amount : tipoFilter === "revisar" ? row.review?.flag : row.bucket.key === tipoFilter))
      .filter((row) => {
        if (!terms.length) return true;
        const hay = norm(`${row.descripcion} ${row.codigo} ${row.proveedor} ${row.rubro} ${row.obs}`);
        return terms.every((t) => hay.includes(t));
      });
  }, [rows, q, proveedorFilter, proveedorTipoFilter, rubroFilter, tipoFilter]);

  const groupedRows = useMemo(() => {
    const map = new Map();
    visibleRows.forEach((row) => {
      const key = groupBy === "rubro" ? row.rubro : groupBy === "tipo" ? row.bucket.label : row.proveedor;
      const label = key || "Sin clasificar";
      if (!map.has(label)) map.set(label, { label, rows: [], usd: 0, ars: 0, sinPrecio: 0, revisar: 0 });
      const group = map.get(label);
      group.rows.push(row);
      if (row.review?.flag) group.revisar += 1;
      const qty = toNum(row.cantidad) || 1;
      if (row.precio.amount) {
        if (row.precio.moneda === "USD") group.usd += row.precio.amount * qty;
        else group.ars += row.precio.amount * qty;
      } else {
        group.sinPrecio += 1;
      }
    });
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label, "es"));
  }, [visibleRows, groupBy]);

  const kpis = useMemo(() => rows.reduce((acc, row) => {
    const qty = toNum(row.cantidad) || 1;
    acc.items += 1;
    if (row.proveedor) acc.proveedores.add(row.proveedor);
    if (row.rubro) acc.rubros.add(row.rubro);
    if (row.review?.flag) acc.revisar += 1;
    if (!row.precio.amount) acc.sinPrecio += 1;
    else if (row.precio.moneda === "USD") {
      if (row.bucket.key === "linea_eje") acc.ejeUsd += row.precio.amount * qty;
      else acc.usd += row.precio.amount * qty;
    } else {
      acc.ars += row.precio.amount * qty;
    }
    return acc;
  }, { items: 0, proveedores: new Set(), rubros: new Set(), sinPrecio: 0, revisar: 0, usd: 0, ars: 0, ejeUsd: 0 }), [rows]);

  const orderRows = useMemo(() => {
    const base = selected.size ? visibleRows.filter((r) => selected.has(r.id)) : visibleRows;
    return base.map((r) => ({
      descripcion: r.descripcion,
      codigo: r.codigo,
      cantidad: r.cantidad,
      unidad: r.unidad,
      proveedor: r.proveedor,
      rubro: r.rubro,
      tipo: r.bucket.label,
      obs: [r.bucket.key !== "base" ? r.bucket.label : "", r.obs].filter(Boolean).join(" · "),
    }));
  }, [visibleRows, selected]);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copiarOrden() {
    const text = buildOrdenTexto({ obra: { codigo: title }, lineaNombre: title, rows: orderRows, groupBy });
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function removeFromLine(row) {
    if (!window.confirm(`¿Sacar "${row.descripcion}" de ${title}? No se borra del catálogo.`)) return;
    setRemovingId(row.id);
    try {
      await quitarCantidadModelo(row.id, code);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      if (editingId === row.id) setEditingId("");
      await onChanged?.();
    } finally {
      setRemovingId("");
    }
  }

  const chipStyle = (on, color = C.blue) => ({
    ...BTN,
    padding: "7px 11px",
    background: on ? C.s1 : C.s0,
    border: `1px solid ${on ? C.b1 : C.b0}`,
    color: on ? color : C.t2,
    fontWeight: 800,
  });

  return (
    <div>
      <div style={{ border: `1px solid ${C.b0}`, borderRadius: 18, background: "var(--panel)", padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <button type="button" onClick={onBack} style={{ ...BTN, padding: "8px 12px" }}>← Líneas</button>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 24, fontWeight: 950, color: C.t0 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: C.t2, marginTop: 3 }}>Base matriz editable · filtros por proveedor, rubro, tipo e items sin precio.</div>
          </div>
          <button type="button" onClick={copiarOrden} disabled={!orderRows.length} style={{ ...BTN_GREEN, padding: "9px 14px" }}>
            <Copy size={14} /> {copied ? "Copiado" : "Copiar OC"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          <KpiCard label="Items" value={kpis.items} color={C.blue} />
          <KpiCard label="Proveedores" value={kpis.proveedores.size} color={C.teal || C.green} />
          <KpiCard label="Rubros" value={kpis.rubros.size} color={C.violet} />
          <KpiCard label="Sin precio" value={kpis.sinPrecio} color={kpis.sinPrecio ? C.amber : C.green} />
          <KpiCard label="A revisar" value={kpis.revisar} color={kpis.revisar ? C.amber : C.green} />
          <KpiCard label="Base USD" value={fmtMoney(kpis.usd, "USD")} color={C.green} />
        </div>
      </div>

      {obras.length > 0 && (
        <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: C.s0, padding: 13, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 9 }}>Obras activas de esta línea</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {obras.map((obra) => {
              const meta = obraRecepcionResumenMeta(obra.materiales_recepcion);
              return (
                <button
                  type="button"
                  key={obra.id}
                  onClick={() => onSelectObra?.(obra)}
                  style={{ ...BTN, border: `1px solid ${meta.border}`, borderRadius: 999, background: meta.bg, color: C.t1, fontFamily: C.mono, fontSize: 12, fontWeight: 850, padding: "5px 10px", gap: 7 }}
                >
                  <span style={{ color: C.t0 }}>{obra.codigo}</span>
                  <span style={{ color: meta.color, fontSize: 10.5, fontWeight: 900 }}>{obraRecepcionResumenLabel(obra.materiales_recepcion)}</span>
                  <span style={{ color: C.blue }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AgregarItemLinea
        linea={code}
        title={title}
        materiales={materiales}
        categorias={categorias}
        proveedores={proveedores}
        ums={ums}
        onChanged={onChanged}
      />

      <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 13, marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 280px" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item, proveedor, rubro, código..." style={{ ...INP, width: "100%", paddingLeft: 36, height: 38 }} />
          </div>
          <select value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)} style={{ ...INP, width: 190, height: 38 }} title="Filtrar proveedor">
            <option value="" style={OPT_ST}>Todos los proveedores</option>
            {facets.proveedores.map((p) => <option key={p} value={p} style={OPT_ST}>{p}</option>)}
          </select>
          <ProveedorTipoFilter value={proveedorTipoFilter} onChange={setProveedorTipoFilter} style={{ ...INP, width: 190, height: 38 }} />
          <select value={rubroFilter} onChange={(e) => setRubroFilter(e.target.value)} style={{ ...INP, width: 170, height: 38 }} title="Filtrar rubro">
            <option value="" style={OPT_ST}>Todos los rubros</option>
            {facets.rubros.map((r) => <option key={r} value={r} style={OPT_ST}>{r}</option>)}
          </select>
          {[
            ["todos", "Todo", C.blue],
            ["base", "Base", C.green],
            ["linea_eje", "Línea eje", C.violet],
            ["variante", "Variantes", C.amber],
            ["sin_precio", "Sin precio", C.red],
            ["revisar", "A revisar", C.amber],
          ].map(([key, label, color]) => (
            <button key={key} type="button" onClick={() => setTipoFilter(key)} style={chipStyle(tipoFilter === key, color)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
          <FileText size={16} style={{ color: C.blue }} />
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.t0 }}>Orden de compra</div>
            <div style={{ fontSize: 11.5, color: C.t2 }}>{selected.size ? `${selected.size} seleccionados` : `${visibleRows.length} visibles`} · se copia el texto para compras.</div>
          </div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...INP, width: 150 }}>
            <option value="proveedor" style={OPT_ST}>Proveedor</option>
            <option value="rubro" style={OPT_ST}>Rubro</option>
            <option value="tipo" style={OPT_ST}>Tipo</option>
          </select>
          <button type="button" onClick={copiarOrden} disabled={!orderRows.length} style={{ ...BTN_GREEN, padding: "9px 14px" }}>
            <Copy size={14} /> {copied ? "Copiado" : "Copiar OC"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {groupedRows.map((group) => (
          <section key={group.label} style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${C.b0}`, background: C.s0, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 950, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
                <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>
                  {group.rows.length} items{group.sinPrecio ? ` · ${group.sinPrecio} sin precio` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {group.revisar ? <span style={{ fontSize: 11, fontWeight: 900, color: C.amber, border: `1px solid ${C.amberB}`, borderRadius: 999, padding: "4px 9px", background: C.amberL }}>{group.revisar} a revisar</span> : null}
                {group.usd ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 9px", background: C.bg }}>{fmtMoney(group.usd, "USD")}</span> : null}
                {group.ars ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 9px", background: C.bg }}>{fmtMoney(group.ars, "ARS")}</span> : null}
              </div>
            </div>
            <div style={{ display: "grid", gap: 7, padding: 10 }}>
              {group.rows.map((row) => {
                const qty = toNum(row.cantidad) || 1;
                const total = row.precio.amount ? row.precio.amount * qty : null;
                const editing = editingId === row.id;
                return (
                  <div key={row.id} style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "26px minmax(220px, 1.3fr) minmax(130px, .55fr) minmax(150px, .65fr) minmax(120px, .5fr) 76px",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 11px",
                        border: `1px solid ${selected.has(row.id) ? C.blueB : row.review?.flag ? C.amberB : C.b0}`,
                        borderRadius: 11,
                        background: selected.has(row.id) ? C.blueL : row.review?.flag ? C.amberL : C.bg,
                      }}
                    >
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 900, color: C.t0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{row.descripcion}</span>
                          <span style={{ fontSize: 10, fontWeight: 900, color: row.bucket.color, background: `${row.bucket.color}16`, border: `1px solid ${row.bucket.color}44`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
                            {row.bucket.label}
                          </span>
                          {row.review?.flag && <ReviewBadge reason={row.review.reason} />}
                        </div>
                        <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.35 }}>
                          {row.codigo || "sin código"}{row.obs ? ` · ${row.obs}` : ""}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Cantidad</div>
                        <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 850, color: C.t0 }}>{qtyText(row.cantidad, row.unidad)}</div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Proveedor</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 850, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.proveedor}</span>
                          <ProveedorTipoBadge meta={row.proveedorMeta} compact />
                        </div>
                        <ProveedorAlternativasHint proveedor={row.proveedor} proveedores={proveedores} compact />
                        <div style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.rubro}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Precio</div>
                        <div style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 850, color: row.precio.amount ? C.t0 : C.amber }}>{row.precio.text}</div>
                        {total ? <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.t2 }}>total {fmtMoney(total, row.precio.moneda)}</div> : null}
                      </div>
                      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setEditingId((id) => (id === row.id ? "" : row.id))} style={{ ...BTN, padding: "6px 8px", color: editing ? C.blue : C.t2 }} title="Editar item">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => removeFromLine(row)} disabled={removingId === row.id} style={{ ...BTN, padding: "6px 8px", color: C.red, borderColor: "rgba(239,68,68,0.28)" }} title={`Sacar de ${title}`}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {editing && (
                      <MaterialFila
                        key={`${row.id}-editor`}
                        material={row.material}
                        categorias={categorias}
                        ums={ums}
                        proveedores={proveedores}
                        onChanged={onChanged}
                        linea={code}
                        initialOpen
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!groupedRows.length && (
          <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 13, border: `1px dashed ${C.b0}`, borderRadius: 14 }}>
            No hay items con esos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

const SNAPSHOT_ESTADO_META = {
  pendiente: { label: "Pendiente", color: C.t2, bg: C.s0, border: C.b0 },
  comprado: { label: "Comprado", color: C.amber, bg: C.amberL, border: C.amberB },
  en_panol: { label: "En pañol", color: C.violet, bg: C.s1, border: C.b1 },
  egresado: { label: "Egresado", color: C.green, bg: C.greenL, border: C.greenB },
};

function estadoFromRecepcion(estado) {
  if (["pendiente", "recibido", "parcial", "sin_info", "falta_stock", "rechazado"].includes(estado)) return "en_panol";
  return null;
}

function estadoObraForRow(row) {
  const estado = row?.estadoObra || estadoFromRecepcion(row?.recepcion_estado) || "pendiente";
  if (estado === "egresado") return "egresado";
  if (estado === "pedido" || estado === "comprado") return "comprado";
  if (["en_panol", "recibido", "parcial", "problema", "sin_info", "falta_stock", "rechazado"].includes(estado)) return "en_panol";
  return "pendiente";
}

function recepcionMetaForRow(row) {
  const estado = estadoObraForRow(row);
  return SNAPSHOT_ESTADO_META[estado] || SNAPSHOT_ESTADO_META.pendiente;
}

function recepcionFilterOptions(kpis) {
  return [
    ["todos", `Todo (${kpis.items || 0})`, C.blue],
    ["pendiente", `Pendiente (${kpis.pendientes || 0})`, C.t2],
    ["comprado", `Comprado (${kpis.comprados || 0})`, C.amber],
    ["en_panol", `En pañol (${kpis.enPanol || 0})`, C.violet],
    ["egresado", `Egresado (${kpis.egresados || 0})`, C.green],
  ];
}

function condicionanteActivoEnObra(condicionante, overrides) {
  const override = overrides?.get?.(condicionante.id);
  return override ? !!override.activo : !!condicionante.activo_por_defecto;
}

function condicionanteDelta(item) {
  const qty = Math.abs(toNum(item?.cantidad) ?? 1);
  return item?.tipo_item === "quita" ? -qty : qty;
}

function condicionanteItemLabel(item) {
  const delta = condicionanteDelta(item);
  const prefix = delta < 0 ? "-" : "+";
  return `${prefix}${qtyText(Math.abs(delta), item?.unidad)} ${item?.descripcion || "item"}`;
}

function RecepcionChip({ row }) {
  const meta = recepcionMetaForRow(row);
  return (
    <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function CompactStat({ label, value, color, active = false, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${active ? color : C.b0}`, background: active ? softStateBg(color) : C.s0, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 850, color: active ? C.t0 : C.t2, cursor: "pointer", fontFamily: C.sans }}>
      <span>{label}</span>
      <span style={{ color, fontFamily: C.mono }}>{value}</span>
    </button>
  );
}

function softStateBg(color) {
  if (color === C.blue) return C.blueL;
  if (color === C.amber) return C.amberL;
  if (color === C.green) return C.greenL;
  if (color === C.violet) return "var(--violet-soft)";
  return C.s1;
}

function RecepcionDetalle({ row }) {
  const estado = estadoObraForRow(row);
  const received = String(row?.recepcion_cantidad_recibida ?? "").trim();
  const nota = String(row?.recepcion_nota ?? "").trim();
  const egresoNota = String(row?.egreso_nota ?? "").trim();
  const envio = row?.recepcion_envio;
  if (estado === "pendiente" && !received && !nota && !egresoNota && !envio) return null;

  const parts = [];
  if (received) parts.push(`Llegaron ${received}${row?.unidad ? ` ${row.unidad}` : ""}`);
  if (envio?.titulo) parts.push(envio.titulo);
  if (nota) parts.push(`Nota: ${nota}`);
  if (egresoNota) parts.push(`Egreso: ${egresoNota}`);
  if (!parts.length && row?.recepcion_estado) parts.push(`Pañol: ${recepcionMetaForRow(row).label}`);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 10.5, color: C.t2, lineHeight: 1.35 }}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 999, padding: "2px 7px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {part}
        </span>
      ))}
    </div>
  );
}

const OBRA_ESTADO_OPTIONS = [
  ["pendiente", "Pendiente"],
  ["comprado", "Comprado"],
  ["en_panol", "En panol"],
  ["egresado", "Egresado"],
];

function ObraEstadoControl({ row, busy = false, onChange }) {
  const current = estadoObraForRow(row);
  const [estadoDraft, setEstadoDraft] = useState("");
  const [nota, setNota] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const estado = estadoDraft || current;
  const changed = estado !== current || !!nota.trim();
  const disabled = busy || !changed;

  async function save() {
    await onChange?.(row, estado, nota);
    setEstadoDraft("");
    setNota("");
  }

  return (
    <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Estado obra</div>
      <select value={estado} onChange={(e) => setEstadoDraft(e.target.value)} disabled={busy} style={{ ...INP, height: 32, padding: "5px 8px", fontSize: 11.5, fontWeight: 800 }}>
        {OBRA_ESTADO_OPTIONS.map(([value, label]) => <option key={value} value={value} style={OPT_ST}>{label}</option>)}
      </select>
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota opcional"
        disabled={busy}
        style={{ ...INP, height: 30, padding: "5px 8px", fontSize: 11.5 }}
      />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <button type="button" disabled={disabled} onClick={save} style={{ ...BTN_GREEN, padding: "5px 8px", fontSize: 11, opacity: disabled ? 0.55 : 1 }}>
          {busy ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={() => setHistoryOpen((open) => !open)} disabled={!row.snapshotId} style={{ ...BTN, padding: "5px 8px", fontSize: 11, color: row.snapshotId ? C.blue : C.t3 }} title={row.snapshotId ? "Ver historial" : "Se crea historial al guardar estado"}>
          Historial
        </button>
      </div>
      {historyOpen && row.snapshotId && <ObraSnapshotHistory snapshotId={row.snapshotId} />}
    </div>
  );
}

function ObraSnapshotHistory({ snapshotId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchObraSnapshotAudit(snapshotId);
        if (alive) setRows(data);
      } catch (e) {
        if (alive) setError(e?.message || "No se pudo cargar el historial.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [snapshotId]);

  if (loading) return <div style={{ fontSize: 11, color: C.t2 }}>Cargando historial...</div>;
  if (error) return <div style={{ fontSize: 11, color: C.red }}>{error}</div>;
  if (!rows.length) return <div style={{ fontSize: 11, color: C.t2 }}>Sin cambios registrados.</div>;

  return (
    <div style={{ display: "grid", gap: 5, border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 8, padding: 7, maxHeight: 170, overflowY: "auto" }}>
      {rows.map((item) => {
        const actor = item.actor?.username || item.actor?.role || "Usuario";
        return (
          <div key={item.id} style={{ display: "grid", gap: 2, borderBottom: `1px solid ${C.b0}`, paddingBottom: 5 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, color: C.t0 }}>{item.campo}</span>
              <span style={{ fontSize: 10, color: C.t3, fontFamily: C.mono }}>{auditDateLabel(item.created_at)}</span>
              <span style={{ fontSize: 10, color: C.t2 }}>{actor}</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.t2 }}>
              {auditValueLabel(item.valor_anterior)} {"->"} <strong style={{ color: C.t0 }}>{auditValueLabel(item.valor_nuevo)}</strong>
            </div>
            {item.nota && <div style={{ fontSize: 10.5, color: C.t2 }}>Nota: {item.nota}</div>}
          </div>
        );
      })}
    </div>
  );
}

function obraRecepcionResumenLabel(resumen) {
  if (!resumen?.total) return "sin lista";
  if (resumen.egresado) return `${resumen.egresado}/${resumen.total} egr.`;
  if (resumen.en_panol) return `${resumen.en_panol}/${resumen.total} pañol`;
  if (resumen.comprado) return `${resumen.comprado}/${resumen.total} comp.`;
  return `${resumen.pendiente || 0}/${resumen.total} pend.`;
}

function obraRecepcionResumenMeta(resumen) {
  if (!resumen?.total) return { color: C.t2, bg: C.bg, border: C.b0 };
  if ((resumen.egresado || 0) === resumen.total) return SNAPSHOT_ESTADO_META.egresado;
  if (resumen.en_panol) return SNAPSHOT_ESTADO_META.en_panol;
  if (resumen.comprado || resumen.pedido) return SNAPSHOT_ESTADO_META.comprado;
  return SNAPSHOT_ESTADO_META.pendiente;
}

function snapshotBucket(row) {
  const key = row?.tipo || "base";
  if (key === "linea_eje") return { key, label: row?.tipo_label || "Linea eje", color: C.violet };
  if (key === "variante") return { key, label: row?.tipo_label || "Variante", color: C.amber };
  if (key === "condicionante") return { key, label: row?.tipo_label || "Condicionante", color: C.amber };
  if (key === "addon") return { key, label: row?.tipo_label || "Addon", color: C.blue };
  return { key: "base", label: row?.tipo_label || "Base", color: C.green };
}

function snapshotRowToView(row) {
  const amount = row?.precio_unitario != null && row.precio_unitario !== "" ? Number(row.precio_unitario) : null;
  const moneda = row?.moneda === "USD" ? "USD" : "ARS";
  const reason = reviewReasonForText(`${row?.descripcion || ""} ${row?.codigo || ""} ${row?.notas || ""}`);
  return {
    id: row.id,
    snapshotId: row.id,
    materialId: row.material_id,
    source: row.source || "snapshot",
    descripcion: row.descripcion,
    codigo: row.codigo,
    cantidad: row.cantidad || 1,
    unidad: row.unidad || "unidad",
    proveedor: row.proveedor || "Sin proveedor",
    rubro: row.rubro || "Sin rubro",
    precio: {
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      moneda,
      text: Number.isFinite(amount) && amount > 0 ? fmtMoney(amount, moneda) : "Sin precio",
      proveedor: row.proveedor || "",
    },
    bucket: snapshotBucket(row),
    obs: row.notas || "",
    variante: row.variante || "",
    revisado: true,
    review: { flag: !!reason, reason },
    snapshot_estado: row.estado || null,
    estadoObra: estadoFromRecepcion(row.recepcion_estado) || row.estado || "pendiente",
    purchase_request_id: row.purchase_request_id || null,
    panol_envio_id: row.panol_envio_id || null,
    panol_envio_item_id: row.panol_envio_item_id || null,
    recepcion_estado: row.recepcion_estado || null,
    recepcion_cantidad_recibida: row.recepcion_cantidad_recibida ?? null,
    recepcion_nota: row.recepcion_nota ?? null,
    recepcion_updated_at: row.recepcion_updated_at ?? null,
    recepcion_envio: row.recepcion_envio ?? null,
    recepcion_items: row.recepcion_items ?? [],
    egreso_at: row.egreso_at ?? null,
    egreso_nota: row.egreso_nota ?? null,
    egreso_por: row.egreso_por ?? null,
  };
}

function snapshotMergeKey(row, index = 0) {
  const materialId = row?.materialId || row?.material_id;
  if (row?.source === "addon" || row?.bucket?.key === "addon") {
    const addonText = norm(`${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`);
    if (addonText) return `addon:${addonText}`;
  }
  if (materialId) return `material:${materialId}`;
  const textKey = norm(`${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`);
  if (textKey) return `text:${textKey}`;
  return row?.snapshotId || row?.id ? `id:${row.snapshotId || row.id}` : `row:${index}`;
}

function mergeNotes(a, b) {
  const parts = [a, b].map((part) => String(part || "").trim()).filter(Boolean);
  return [...new Set(parts)].join(" - ");
}

function preferSnapshotText(snapshotValue, liveValue, emptyLabel) {
  const clean = String(snapshotValue || "").trim();
  if (clean && clean !== emptyLabel) return clean;
  return liveValue || snapshotValue || emptyLabel;
}

function mergeSnapshotIntoLive(live, snapshot) {
  return {
    ...live,
    ...snapshot,
    id: live.id,
    snapshotId: snapshot.snapshotId,
    materialId: live.materialId || snapshot.materialId,
    source: live.source || snapshot.source,
    descripcion: snapshot.descripcion || live.descripcion,
    codigo: snapshot.codigo || live.codigo,
    cantidad: toNum(snapshot.cantidad) || toNum(live.cantidad) || 0,
    unidad: snapshot.unidad || live.unidad,
    proveedor: preferSnapshotText(snapshot.proveedor, live.proveedor, "Sin proveedor"),
    rubro: preferSnapshotText(snapshot.rubro, live.rubro, "Sin rubro"),
    precio: snapshot.precio?.amount ? snapshot.precio : live.precio,
    bucket: live.bucket || snapshot.bucket,
    obs: mergeNotes(live.obs, snapshot.obs),
    variante: snapshot.variante || live.variante || "",
    revisado: live.revisado ?? snapshot.revisado,
    review: live.review?.flag ? live.review : snapshot.review,
    baseCantidad: live.baseCantidad,
    condicionantes: live.condicionantes ?? [],
    snapshot_estado: snapshot.snapshot_estado || live.snapshot_estado || null,
    estadoObra: snapshot.estadoObra || live.estadoObra,
    purchase_request_id: snapshot.purchase_request_id || live.purchase_request_id || null,
    panol_envio_id: snapshot.panol_envio_id || live.panol_envio_id || null,
    panol_envio_item_id: snapshot.panol_envio_item_id || live.panol_envio_item_id || null,
    recepcion_estado: snapshot.recepcion_estado,
    recepcion_cantidad_recibida: snapshot.recepcion_cantidad_recibida,
    recepcion_nota: snapshot.recepcion_nota,
    recepcion_updated_at: snapshot.recepcion_updated_at,
    recepcion_envio: snapshot.recepcion_envio,
    recepcion_items: snapshot.recepcion_items,
    egreso_at: snapshot.egreso_at,
    egreso_nota: snapshot.egreso_nota,
    egreso_por: snapshot.egreso_por,
  };
}

function compareMatrizRows(a, b) {
  const order = { base: 0, condicionante: 1, linea_eje: 2, variante: 3, addon: 4 };
  return (order[a.bucket?.key] ?? 9) - (order[b.bucket?.key] ?? 9)
    || String(a.rubro || "").localeCompare(String(b.rubro || ""), "es")
    || String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true });
}

function mergeMatrixAndSnapshotRows(liveRows = [], snapshotRows = []) {
  if (!snapshotRows.length) return liveRows;
  const merged = new Map();

  liveRows.forEach((row, index) => {
    merged.set(snapshotMergeKey(row, index), row);
  });

  snapshotRows.forEach((row, index) => {
    const key = snapshotMergeKey(row, index);
    const live = merged.get(key);
    merged.set(key, live ? mergeSnapshotIntoLive(live, row) : row);
  });

  return [...merged.values()].sort(compareMatrizRows);
}

function ObraVarianteControl({ row, options = [], busy = false, onChange }) {
  const cleanOptions = normalizeVariantList(options);
  if (!cleanOptions.length) {
    return row.variante ? (
      <span style={{ fontSize: 10, fontWeight: 900, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
        {row.variante}
      </span>
    ) : null;
  }
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${row.variante ? C.blueB : C.b0}`, background: row.variante ? C.blueL : C.s0, borderRadius: 999, padding: "2px 7px", minHeight: 22 }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, color: row.variante ? C.blue : C.t2, textTransform: "uppercase" }}>Variante</span>
      <select
        value={row.variante || ""}
        disabled={busy}
        onChange={(e) => onChange?.(row, e.target.value)}
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          color: row.variante ? C.blue : C.t1,
          fontSize: 11,
          fontWeight: 900,
          fontFamily: C.sans,
          cursor: busy ? "default" : "pointer",
          maxWidth: 150,
        }}
        title="Variante/marca que lleva esta obra"
      >
        <option value="" style={OPT_ST}>Sin definir</option>
        {cleanOptions.map((variant) => <option key={variant} value={variant} style={OPT_ST}>{variant}</option>)}
      </select>
    </label>
  );
}

function LineasTab({ lineas, obras, categorias, materiales, proveedores, opciones = [], onChanged }) {
  const [sel, setSel] = useState("");
  const [selObra, setSelObra] = useState(null);
  const [q, setQ] = useState("");

  const ums = useMemo(
    () => [...new Set((materiales ?? []).map((m) => m.unidad_medida).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es")),
    [materiales],
  );
  const listaLineas = useMemo(() => {
    const base = lineas?.length ? lineas : MODELOS.map((c) => ({ codigo: c, nombre: `K${c}` }));
    return base.map((l) => ({ ...l, codigo: String(l.codigo || "").replace(/^K/i, "") }));
  }, [lineas]);

  const cards = useMemo(() => listaLineas.map((linea) => {
    const mats = (materiales ?? []).filter(materialActivo).filter((m) => materialQty(m, linea.codigo) > 0);
    const proveedoresSet = new Set();
    const rubrosSet = new Set();
    let usd = 0;
    let ars = 0;
    let sinPrecio = 0;
    mats.forEach((m) => {
      const precio = priceInfo(m);
      const qty = materialQty(m, linea.codigo) || 1;
      if (precio.proveedor || m.proveedor) proveedoresSet.add(precio.proveedor || m.proveedor);
      rubrosSet.add(categoriaNombre(categorias, m.categoria_id));
      if (!precio.amount) sinPrecio += 1;
      else if (precio.moneda === "USD") usd += precio.amount * qty;
      else ars += precio.amount * qty;
    });
    const conPrecio = mats.length - sinPrecio;
    return {
      ...linea,
      items: mats.length,
      proveedores: proveedoresSet.size,
      rubros: rubrosSet.size,
      sinPrecio,
      usd,
      ars,
      progreso: mats.length ? Math.round((conPrecio / mats.length) * 100) : 0,
      obras: (obras ?? []).filter((o) => String(o.modelo) === String(linea.codigo)),
    };
  }), [listaLineas, materiales, categorias, obras]);

  const visibles = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return cards;
    return cards.filter((linea) => terms.every((t) => norm(`${linea.codigo} ${linea.nombre}`).includes(t)));
  }, [cards, q]);

  const totals = useMemo(() => ({
    lineas: cards.length,
    obras: cards.reduce((sum, l) => sum + l.obras.length, 0),
    items: cards.reduce((sum, l) => sum + l.items, 0),
    sinPrecio: cards.reduce((sum, l) => sum + l.sinPrecio, 0),
  }), [cards]);

  if (selObra) {
    const lineaNombre = cards.find((l) => l.codigo === sel)?.nombre || (sel ? `K${sel}` : "Líneas");
    return (
      <ObraMatrizView
        obra={selObra}
        obras={obras}
        linea={sel}
        lineaNombre={lineaNombre}
        categorias={categorias}
        materiales={materiales}
        proveedores={proveedores}
        opciones={opciones}
        ums={ums}
        onChanged={onChanged}
        onBack={() => setSelObra(null)}
      />
    );
  }

  if (sel) {
    const linea = cards.find((l) => l.codigo === sel) || { codigo: sel, nombre: `K${sel}`, obras: [], items: 0, proveedores: 0, rubros: 0, sinPrecio: 0, usd: 0 };
    return (
      <LineaMatrizView
        linea={linea}
        obras={linea.obras}
        categorias={categorias}
        materiales={materiales}
        proveedores={proveedores}
        opciones={opciones}
        ums={ums}
        onChanged={onChanged}
        onBack={() => setSel("")}
        onSelectObra={setSelObra}
      />
    );
  }

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
          border-radius: 24px;
        }
        .linea-card {
          background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        }
        .linea-card:hover {
          transform: translateY(-5px) scale(1.02);
          box-shadow: 0 15px 35px rgba(0,0,0,0.1);
          border-color: rgba(96, 165, 250, 0.4);
        }
        .kpi-modern {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: transform 0.2s;
        }
        .kpi-modern:hover { transform: translateY(-2px); }
      `}</style>

      <div className="glass-panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.t0, letterSpacing: "-0.5px" }}>Matriz por línea de producción</div>
            <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>Selecciona una línea para administrar su base y preparar compras.</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="kpi-modern" style={{ padding: "6px 12px", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.t2 }}>LÍNEAS</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.blue }}>{totals.lineas}</span>
              </div>
              <div className="kpi-modern" style={{ padding: "6px 12px", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.t2 }}>OBRAS</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.green }}>{totals.obras}</span>
              </div>
              <div className="kpi-modern" style={{ padding: "6px 12px", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.t2 }}>ITEMS</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.violet }}>{totals.items}</span>
              </div>
              <div className="kpi-modern" style={{ padding: "6px 12px", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.t2 }}>SIN PRECIO</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: totals.sinPrecio ? C.amber : C.green }}>{totals.sinPrecio}</span>
              </div>
            </div>

            <div style={{ position: "relative", width: 220 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar línea..." style={{ ...INP, width: "100%", height: 36, paddingLeft: 30, borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.1)`, transition: "all 0.2s" }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
        {visibles.map((linea) => (
          <button type="button" key={linea.codigo} onClick={() => setSel(linea.codigo)}
            className="linea-card"
            style={{ textAlign: "left", cursor: "pointer", padding: 24, display: "flex", flexDirection: "column", gap: 16, minHeight: 190 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.blue}, #3b82f6)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18, boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
                  {linea.nombre?.replace("K", "") || linea.codigo}
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 950, color: C.t0 }}>{linea.nombre || `K${linea.codigo}`}</span>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, transition: "0.2s" }} className="arrow-btn">
                <span style={{ fontSize: 20, transform: "translateY(-1px)" }}>›</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.02)`, overflow: "hidden" }}>
                <div style={{ width: `${linea.progreso}%`, height: "100%", background: linea.progreso > 80 ? `linear-gradient(90deg, ${C.greenL}, ${C.green})` : `linear-gradient(90deg, #60a5fa, ${C.blue})`, borderRadius: 99, transition: "width 0.5s ease-out" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.t2, fontWeight: 600, flexWrap: "wrap" }}>
                <span>{linea.items} items</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ color: linea.progreso > 80 ? C.green : C.blue }}>{linea.progreso}% costeado</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "12px", border: "1px solid rgba(255,255,255,0.03)" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: C.t2, fontWeight: 800, letterSpacing: 0.5 }}>OBRAS</div><div style={{ fontFamily: C.mono, fontSize: 16, color: C.t0, fontWeight: 900 }}>{linea.obras.length}</div></div>
              <div style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.05)" }}><div style={{ fontSize: 10, color: C.t2, fontWeight: 800, letterSpacing: 0.5 }}>PROV.</div><div style={{ fontFamily: C.mono, fontSize: 16, color: C.t0, fontWeight: 900 }}>{linea.proveedores}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: C.t2, fontWeight: 800, letterSpacing: 0.5 }}>RUBROS</div><div style={{ fontFamily: C.mono, fontSize: 16, color: C.t0, fontWeight: 900 }}>{linea.rubros}</div></div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 4 }}>
              {linea.usd ? <span style={{ fontFamily: C.mono, fontSize: 12, color: C.green, border: `1px solid rgba(34,197,94,0.3)`, background: "rgba(34,197,94,0.1)", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>{fmtMoney(linea.usd, "USD")}</span> : null}
              {linea.sinPrecio ? <span style={{ fontSize: 12, color: C.amber, border: `1px solid rgba(245,158,11,0.3)`, background: "rgba(245,158,11,0.1)", borderRadius: 8, padding: "4px 10px", fontWeight: 800 }}>{linea.sinPrecio} sin precio</span> : null}
            </div>
          </button>
        ))}
        {!visibles.length && (
          <div style={{ padding: 40, textAlign: "center", color: C.t2, fontSize: 15, background: "rgba(255,255,255,0.02)", border: `1px dashed rgba(255,255,255,0.1)`, borderRadius: 20, gridColumn: "1 / -1" }}>
            No encontramos líneas que coincidan con tu búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}

const NORMALIZATION_KIND_META = {
  proveedor: { label: "Proveedor", color: C.blue, bg: C.blueL, border: C.blueB },
  codigo: { label: "Código", color: C.green, bg: C.greenL, border: C.greenB },
  unidad: { label: "Unidad", color: C.teal || C.green, bg: "rgba(20,184,166,0.1)", border: "rgba(20,184,166,0.32)" },
  rubro: { label: "Rubro", color: C.amber, bg: C.amberL, border: C.amberB },
  fraccion: { label: "Fracción", color: C.red, bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.28)" },
};

const NORMALIZATION_FILTERS = [
  ["todos", "Todo"],
  ["proveedor", "Proveedor"],
  ["codigo", "Código"],
  ["unidad", "Unidad"],
  ["rubro", "Rubro"],
  ["fraccion", "Fracciones"],
];

function hasUsableProvider(material) {
  const proveedor = norm(material?.proveedor || "");
  return !!(material?.proveedor_id || (proveedor && proveedor !== "sin proveedor"));
}

function normalizationTokens(value = "") {
  return norm(value)
    .split(/\s+/)
    .map(canonicalDuplicateToken)
    .filter((token) => token.length >= 3 && !DUPLICATE_STOPWORDS.has(token));
}

function setOverlapScore(a, b) {
  if (!a.size || !b.size) return { shared: 0, score: 0 };
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = new Set([...a, ...b]).size || 1;
  return { shared, score: shared / union };
}

function providerByName(proveedores = [], name = "") {
  const key = norm(name);
  if (!key) return null;
  return proveedores.find((p) => norm(p.nombre) === key)
    || proveedores.find((p) => {
      const current = norm(p.nombre);
      return current && (current.includes(key) || key.includes(current));
    })
    || null;
}

function providerLabelFromMaterial(material, proveedores = []) {
  if (material?.proveedor_id) {
    const p = proveedores.find((proveedor) => proveedor.id === material.proveedor_id);
    if (p?.nombre) return { id: p.id, nombre: p.nombre };
  }
  const nombre = String(material?.proveedor || "").trim();
  if (!nombre) return null;
  const p = providerByName(proveedores, nombre);
  return { id: p?.id || "", nombre: p?.nombre || nombre };
}

function providerSuggestionForMaterial(material, materiales = [], proveedores = []) {
  if (hasUsableProvider(material)) return null;

  const directMeta = proveedorMeta(material.descripcion, proveedores);
  if (directMeta?.nombre) {
    const direct = providerByName(proveedores, directMeta.nombre);
    return {
      proveedor_id: direct?.id || directMeta.id || "",
      proveedor: direct?.nombre || directMeta.nombre,
      confidence: "alta",
      reason: "El proveedor aparece escrito en el título.",
    };
  }

  const tokens = new Set(normalizationTokens(material.descripcion));
  if (tokens.size < 2) return null;
  const materialAreas = new Set((material.areas?.length ? material.areas : [material.categoria_id]).filter(Boolean));
  const byProvider = new Map();
  const materialFirstToken = normalizationTokens(material.descripcion)[0];

  for (const other of materiales || []) {
    if (!materialActivo(other) || other.id === material.id || !hasUsableProvider(other)) continue;
    const label = providerLabelFromMaterial(other, proveedores);
    if (!label?.nombre) continue;
    const otherTokensList = normalizationTokens(other.descripcion);
    const otherTokens = new Set(otherTokensList);
    const overlap = setOverlapScore(tokens, otherTokens);
    if (!overlap.shared) continue;
    const otherAreas = new Set((other.areas?.length ? other.areas : [other.categoria_id]).filter(Boolean));
    const sameArea = materialAreas.size && intersects(materialAreas, otherAreas);
    const firstTokenBonus = materialFirstToken && materialFirstToken === otherTokensList[0] ? 6 : 0;
    const score = (overlap.shared * 12) + (overlap.score * 44) + (sameArea ? 20 : 0) + firstTokenBonus;
    if (score < 28) continue;
    const key = label.id || norm(label.nombre);
    const current = byProvider.get(key) || { ...label, score: 0, best: 0, count: 0 };
    current.score += score;
    current.best = Math.max(current.best, score);
    current.count += 1;
    byProvider.set(key, current);
  }

  const [best] = [...byProvider.values()].sort((a, b) => (b.score + b.best) - (a.score + a.best));
  if (!best || best.best < 34) return null;
  return {
    proveedor_id: best.id || "",
    proveedor: best.nombre,
    confidence: best.best >= 58 || best.count >= 3 ? "alta" : "media",
    reason: `${best.count} material${best.count === 1 ? "" : "es"} parecido${best.count === 1 ? "" : "s"} ya usan este proveedor.`,
  };
}

function categorySuggestionForMaterial(material, materiales = [], categorias = []) {
  if (material?.categoria_id) return null;
  const tokens = new Set(normalizationTokens(material.descripcion));
  if (tokens.size < 2) return null;
  const byCat = new Map();
  for (const other of materiales || []) {
    if (!materialActivo(other) || other.id === material.id || !other.categoria_id) continue;
    const otherTokens = new Set(normalizationTokens(other.descripcion));
    const overlap = setOverlapScore(tokens, otherTokens);
    if (!overlap.shared) continue;
    const score = (overlap.shared * 14) + (overlap.score * 48);
    if (score < 34) continue;
    const current = byCat.get(other.categoria_id) || { id: other.categoria_id, score: 0, best: 0, count: 0 };
    current.score += score;
    current.best = Math.max(current.best, score);
    current.count += 1;
    byCat.set(other.categoria_id, current);
  }
  const [best] = [...byCat.values()].sort((a, b) => (b.score + b.best) - (a.score + a.best));
  if (!best) return null;
  return {
    categoria_id: best.id,
    confidence: best.best >= 58 || best.count >= 3 ? "alta" : "media",
    reason: `${best.count} material${best.count === 1 ? "" : "es"} parecido${best.count === 1 ? "" : "s"} están en este rubro.`,
    label: categoriaNombre(categorias, best.id),
  };
}

function unitSuggestionForMaterial(material) {
  const current = norm(material?.unidad_medida || "");
  const text = norm(material?.descripcion || "");
  if (!text || (current && current !== "unidad")) return null;
  const rules = [
    [/\b\d+(?:[.,]\d+)?\s*(mts?|mtrs?|metros?)\b/, "metro"],
    [/\b\d+(?:[.,]\d+)?\s*(kg|kilos?)\b/, "kg"],
    [/\b\d+(?:[.,]\d+)?\s*(lts?|litros?)\b/, "litro"],
    [/\b\d+(?:[.,]\d+)?\s*(pies|pie)\b/, "pies"],
    [/\b\d+(?:[.,]\d+)?\s*(m2|m²)\b/, "m2"],
    [/\b(caja|cajas)\b/, "caja"],
    [/\b(rollo|rollos)\b/, "rollo"],
    [/\b(par|pares)\b/, "par"],
    [/\b(juego|juegos)\b/, "juego"],
  ];
  const found = rules.find(([pattern]) => pattern.test(text));
  if (!found || current === found[1]) return null;
  return { unidad_medida: found[1], confidence: "media", reason: "La unidad aparece en la descripción." };
}

function codeSuggestionForMaterial(material) {
  if (material?.codigo) return null;
  const [code] = [...codeCandidatesFromText(`${material?.descripcion || ""} ${material?.notas || ""}`)];
  if (!code) return null;
  return { codigo: code, confidence: "media", reason: "Parece un código dentro del texto." };
}

function repairFractionText(value = "") {
  let text = String(value || "");
  for (let i = 0; i < 4; i += 1) {
    text = text.replace(/(^|[^0-9])([1357])\s+([248])(")/g, "$1$2/$3$4");
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

function fractionSuggestionForMaterial(material) {
  const descripcion = String(material?.descripcion || "");
  const repaired = repairFractionText(descripcion);
  if (!descripcion || repaired === descripcion) return null;
  return {
    descripcion: repaired,
    confidence: "alta",
    reason: "Parece una fracción que perdió la barra.",
  };
}

function buildNormalizationGroups(materiales = [], categorias = [], proveedores = []) {
  return (materiales || [])
    .filter(materialActivo)
    .map((material) => {
      const actions = [];
      const provider = providerSuggestionForMaterial(material, materiales, proveedores);
      if (provider) {
        actions.push({
          id: `${material.id}:proveedor`,
          kind: "proveedor",
          confidence: provider.confidence,
          title: "Asignar proveedor sugerido",
          detail: provider.reason,
          before: material.proveedor || "Sin proveedor",
          after: provider.proveedor,
          patch: { proveedor_id: provider.proveedor_id || null, proveedor: provider.proveedor },
        });
      }

      const fraction = fractionSuggestionForMaterial(material);
      if (fraction) {
        actions.push({
          id: `${material.id}:fraccion`,
          kind: "fraccion",
          confidence: fraction.confidence,
          title: "Reparar fracción",
          detail: fraction.reason,
          before: material.descripcion || "",
          after: fraction.descripcion,
          patch: { descripcion: fraction.descripcion },
        });
      }

      const code = codeSuggestionForMaterial(material);
      if (code) {
        actions.push({
          id: `${material.id}:codigo`,
          kind: "codigo",
          confidence: code.confidence,
          title: "Completar código",
          detail: code.reason,
          before: "Sin código",
          after: code.codigo,
          patch: { codigo: code.codigo },
        });
      }

      const unit = unitSuggestionForMaterial(material);
      if (unit) {
        actions.push({
          id: `${material.id}:unidad`,
          kind: "unidad",
          confidence: unit.confidence,
          title: "Ajustar unidad",
          detail: unit.reason,
          before: material.unidad_medida || "Sin unidad",
          after: unit.unidad_medida,
          patch: { unidad_medida: unit.unidad_medida },
        });
      }

      const category = categorySuggestionForMaterial(material, materiales, categorias);
      if (category) {
        actions.push({
          id: `${material.id}:rubro`,
          kind: "rubro",
          confidence: category.confidence,
          title: "Asignar rubro sugerido",
          detail: category.reason,
          before: "Sin rubro",
          after: category.label,
          patch: { categoria_id: category.categoria_id },
          areas: [category.categoria_id, ...(material.areas || []).filter((id) => id && id !== material.categoria_id && id !== category.categoria_id)],
        });
      }

      return {
        id: material.id,
        material,
        actions,
        score: actions.reduce((sum, action) => sum + (action.confidence === "alta" ? 3 : 2), 0),
      };
    })
    .filter((group) => group.actions.length)
    .sort((a, b) => b.score - a.score || String(a.material.descripcion || "").localeCompare(String(b.material.descripcion || ""), "es"));
}

function duplicatePairKey(a, b) {
  const ids = [a, b].filter(Boolean).map(String).sort();
  return ids.length === 2 && ids[0] !== ids[1] ? `${ids[0]}:${ids[1]}` : "";
}

function duplicateGroupPairKeys(group) {
  const ids = (group?.materials || []).map((material) => material.id).filter(Boolean).sort();
  const keys = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const key = duplicatePairKey(ids[i], ids[j]);
      if (key) keys.push(key);
    }
  }
  return keys;
}

function duplicateGroupDismissed(group, dismissedPairs) {
  const keys = duplicateGroupPairKeys(group);
  return keys.length > 0 && keys.every((key) => dismissedPairs.has(key));
}

function ConfidenceBadge({ value }) {
  const meta = value === "alta"
    ? { label: "Alta", color: C.green, bg: C.greenL, border: C.greenB }
    : { label: "Media", color: C.amber, bg: C.amberL, border: C.amberB };
  return (
    <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function NormalizacionTab({ categorias, materiales, proveedores, onChanged }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("todos");
  const [confidence, setConfidence] = useState("todos");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);

  const groups = useMemo(() => buildNormalizationGroups(materiales, categorias, proveedores), [materiales, categorias, proveedores]);
  const actionById = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => group.actions.forEach((action) => map.set(action.id, { ...action, material: group.material })));
    return map;
  }, [groups]);

  const visibleGroups = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return groups
      .map((group) => {
        const actions = group.actions.filter((action) =>
          (kind === "todos" || action.kind === kind)
          && (confidence === "todos" || action.confidence === confidence)
        );
        return { ...group, visibleActions: actions };
      })
      .filter((group) => {
        if (!group.visibleActions.length) return false;
        if (!terms.length) return true;
        const hay = norm([
          group.material.descripcion,
          group.material.codigo,
          group.material.proveedor,
          categoriaNombre(categorias, group.material.categoria_id),
          group.visibleActions.map((action) => `${action.title} ${action.before} ${action.after} ${action.detail}`).join(" "),
        ].join(" "));
        return terms.every((term) => hay.includes(term));
      });
  }, [groups, q, kind, confidence, categorias]);

  const visibleActions = useMemo(() => visibleGroups.flatMap((group) => group.visibleActions.map((action) => ({ ...action, material: group.material }))), [visibleGroups]);
  const selectedActions = useMemo(() => [...selected].map((id) => actionById.get(id)).filter(Boolean), [selected, actionById]);
  const kpis = useMemo(() => {
    const all = groups.flatMap((group) => group.actions);
    return {
      materiales: groups.length,
      acciones: all.length,
      alta: all.filter((action) => action.confidence === "alta").length,
      proveedor: all.filter((action) => action.kind === "proveedor").length,
    };
  }, [groups]);

  function toggleAction(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectVisible(mode = "all") {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleActions
        .filter((action) => mode !== "alta" || action.confidence === "alta")
        .forEach((action) => next.add(action.id));
      return next;
    });
  }

  async function applyActions(actions, label = "sugerencias") {
    const clean = actions.filter(Boolean);
    if (!clean.length || busy) return;
    const byMaterial = new Map();
    clean.forEach((action) => {
      if (!byMaterial.has(action.material.id)) byMaterial.set(action.material.id, { material: action.material, actions: [] });
      byMaterial.get(action.material.id).actions.push(action);
    });
    if (!window.confirm(`¿Aplicar ${clean.length} ${label} en ${byMaterial.size} material${byMaterial.size === 1 ? "" : "es"}?\n\nNo se archiva ni se borra nada.`)) return;
    setBusy("apply");
    setErr(null);
    try {
      for (const entry of byMaterial.values()) {
        let draft = { ...entry.material };
        let areas = null;
        for (const action of entry.actions) {
          draft = { ...draft, ...action.patch };
          if (action.areas) areas = action.areas;
        }
        await guardarMaterial(draft, toBomMap(entry.material), { revisado: entry.material.revisado });
        if (areas) await setSectoresMaterial(entry.material.id, areas);
      }
      setSelected(new Set());
      await onChanged?.();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy("");
    }
  }

  const chip = (on, color = C.blue) => ({
    ...BTN,
    padding: "7px 11px",
    background: on ? C.s1 : C.s0,
    border: `1px solid ${on ? C.b1 : C.b0}`,
    color: on ? color : C.t2,
    fontWeight: 850,
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 18, padding: 16, display: "grid", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 950, color: C.t0 }}>Asistente de normalización</div>
            <div style={{ fontSize: 12.5, color: C.t2, marginTop: 3 }}>Sugerencias confirmables para limpiar nombres, proveedores, códigos, unidades y rubros.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(110px, 1fr))", gap: 8, minWidth: 330 }}>
            <KpiCard label="Materiales" value={kpis.materiales} color={C.blue} />
            <KpiCard label="Sugerencias" value={kpis.acciones} color={C.violet} />
            <KpiCard label="Alta confianza" value={kpis.alta} color={C.green} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 280px" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material, proveedor sugerido, código o rubro..." style={{ ...INP, width: "100%", height: 40, paddingLeft: 36 }} />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...INP, width: 180, height: 40 }}>
            {NORMALIZATION_FILTERS.map(([key, label]) => (
              <option key={key} value={key} style={OPT_ST}>{label}</option>
            ))}
          </select>
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={{ ...INP, width: 160, height: 40 }}>
            <option value="todos" style={OPT_ST}>Confianza: todas</option>
            <option value="alta" style={OPT_ST}>Alta</option>
            <option value="media" style={OPT_ST}>Media</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => selectVisible("alta")} disabled={!visibleActions.some((action) => action.confidence === "alta")} style={chip(false, C.green)}>
            Seleccionar alta confianza
          </button>
          <button type="button" onClick={() => selectVisible("all")} disabled={!visibleActions.length} style={chip(false, C.blue)}>
            Seleccionar visibles
          </button>
          <button type="button" onClick={() => setSelected(new Set())} disabled={!selected.size} style={chip(false, C.t2)}>
            Limpiar selección
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: C.t2 }}>
            {visibleGroups.length} materiales visibles · {selectedActions.length} seleccionadas
          </span>
          <button type="button" onClick={() => applyActions(selectedActions, "sugerencias seleccionadas")} disabled={!selectedActions.length || !!busy} style={{ ...BTN_GREEN, padding: "8px 13px", opacity: !selectedActions.length || busy ? 0.6 : 1 }}>
            <Save size={14} /> {busy ? "Aplicando..." : "Aplicar selección"}
          </button>
        </div>
        {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard label="Sin proveedor sugerido" value={kpis.proveedor} color={C.blue} />
        <KpiCard label="Visibles" value={visibleActions.length} color={C.amber} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {visibleGroups.map((group) => {
          const material = group.material;
          return (
            <section key={group.id} style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "12px 14px", borderBottom: `1px solid ${C.b0}`, background: C.s0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 950, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion || "(sin descripción)"}</span>
                    <PriceBadge material={material} />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: C.t2, fontSize: 11.5, marginTop: 4 }}>
                    <span>{categoriaNombre(categorias, material.categoria_id)}</span>
                    <span>{material.proveedor || "Sin proveedor"}</span>
                    {material.codigo && <span style={{ fontFamily: C.mono }}>{material.codigo}</span>}
                    {materialVariants(material).length > 0 && <span style={{ color: C.violet }}>Variantes: {materialVariants(material).join(" / ")}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => applyActions(group.visibleActions.map((action) => ({ ...action, material })), "sugerencias de este material")} disabled={!!busy} style={{ ...BTN, padding: "7px 10px", color: C.green, borderColor: C.greenB, background: C.greenL, opacity: busy ? 0.6 : 1 }}>
                  Aplicar este
                </button>
              </div>
              <div style={{ display: "grid", gap: 7, padding: 10 }}>
                {group.visibleActions.map((action) => {
                  const meta = NORMALIZATION_KIND_META[action.kind] || NORMALIZATION_KIND_META.proveedor;
                  const checked = selected.has(action.id);
                  return (
                    <label key={action.id} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 8, alignItems: "start", border: `1px solid ${checked ? meta.border : C.b0}`, background: checked ? meta.bg : C.bg, borderRadius: 11, padding: 10, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleAction(action.id)} style={{ marginTop: 3 }} />
                      <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: meta.color, fontSize: 10.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.6 }}>{meta.label}</span>
                          <ConfidenceBadge value={action.confidence} />
                          {action.kind === "proveedor" && <ProveedorTipoBadge meta={proveedorMeta(action.patch.proveedor, proveedores)} compact />}
                          <span style={{ fontSize: 12.5, fontWeight: 900, color: C.t0 }}>{action.title}</span>
                        </div>
                        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                          <div style={{ color: C.t2, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            Antes: <span style={{ color: C.t1 }}>{action.before}</span>
                          </div>
                          <div style={{ color: C.t2, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            Después: <span style={{ color: C.t0, fontWeight: 850 }}>{action.after}</span>
                          </div>
                        </div>
                        <div style={{ color: C.t3, fontSize: 11 }}>{action.detail}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {!visibleGroups.length && (
        <div style={{ padding: 32, textAlign: "center", color: C.t2, border: `1px dashed ${C.b0}`, borderRadius: 14, fontSize: 13 }}>
          No hay sugerencias con esos filtros.
        </div>
      )}
    </div>
  );
}

// Lista matriz: el catálogo completo, navegable por sector/subsector, editable (descripción,
// precio, cantidades por línea K37/K52/K55, sector). Reusa la tabla MaterialRow.
function DuplicadosCatalogo({ groups, cleanupCandidates = [], categorias, ums, proveedores, onChanged }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [keeperByGroup, setKeeperByGroup] = useState({});
  const [dismissed, setDismissed] = useState(() => new Set());
  const [dismissedPairs, setDismissedPairs] = useState(() => new Set());
  const [decisionErr, setDecisionErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMaterialDuplicateDecisions()
      .then((keys) => {
        if (alive) setDismissedPairs(new Set(keys));
      })
      .catch((error) => {
        if (alive) setDecisionErr(error);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibles = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return groups.filter((group) => {
      if (dismissed.has(group.id)) return false;
      if (duplicateGroupDismissed(group, dismissedPairs)) return false;
      if (filtro === "alta" && group.score < 92) return false;
      if (filtro === "media" && group.score < 82) return false;
      if (filtro === "revisar" && group.score >= 82) return false;
      if (filtro === "codigo" && !/codigo|descripcion/i.test(group.reason || "")) return false;
      if (!terms.length) return true;
      const hay = norm(group.materials.map((m) => `${m.descripcion || ""} ${m.codigo || ""} ${m.proveedor || ""} ${categoriaNombre(categorias, m.categoria_id)}`).join(" "));
      return terms.every((term) => hay.includes(term));
    });
  }, [groups, q, filtro, categorias, dismissed, dismissedPairs]);
  const totalItems = useMemo(() => groups.reduce((sum, group) => sum + group.materials.length, 0), [groups]);
  const highConfidence = useMemo(() => groups.filter((group) => group.score >= 92).length, [groups]);
  const mediumConfidence = useMemo(() => groups.filter((group) => group.score >= 82).length, [groups]);

  function keeperForGroup(group) {
    return keeperByGroup[group.id] || group.keeperId || group.materials[0]?.id;
  }

  function selectedIdsForGroup(group) {
    const keeperId = keeperForGroup(group);
    const stored = selectedByGroup[group.id];
    if (stored) return [...stored].filter((id) => id !== keeperId);
    return group.materials.filter((material) => material.id !== keeperId).map((material) => material.id);
  }

  function setKeeper(group, materialId) {
    const previousKeeper = keeperForGroup(group);
    setKeeperByGroup((prev) => ({ ...prev, [group.id]: materialId }));
    setSelectedByGroup((prev) => {
      const next = new Set(prev[group.id] || group.materials.filter((material) => material.id !== materialId).map((material) => material.id));
      next.delete(materialId);
      if (previousKeeper && previousKeeper !== materialId) next.add(previousKeeper);
      return { ...prev, [group.id]: next };
    });
  }

  async function archiveIds(ids, label = "materiales") {
    const clean = [...new Set(ids.filter(Boolean))];
    if (!clean.length) return;
    if (!window.confirm(`¿Archivar ${clean.length} ${label}? Quedan ocultos del catálogo activo, pero no se borran de la base.`)) return;
    setBusy(`archive-${clean.join(":")}`);
    try {
      await archivarMateriales(clean);
      await onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function dismissGroup(group) {
    const ids = group.materials.map((material) => material.id).filter(Boolean);
    if (ids.length < 2 || busy) return;
    setBusy(`dismiss-${group.id}`);
    setDecisionErr(null);
    try {
      await marcarMaterialesNoDuplicados(ids, {
        groupKey: group.id,
        reason: `${group.reason || "posible duplicado"} (${group.score || 0})`,
      });
      const keys = duplicateGroupPairKeys(group);
      setDismissedPairs((prev) => {
        const next = new Set(prev);
        keys.forEach((key) => next.add(key));
        return next;
      });
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(group.id);
        return next;
      });
    } catch (error) {
      setDecisionErr(error);
    } finally {
      setBusy("");
    }
  }

  async function mergeGroup(group) {
    const keeperId = keeperForGroup(group);
    const duplicateIds = selectedIdsForGroup(group);
    if (!duplicateIds.length) return;
    const payload = mergedDuplicatePayload(group, { keeperId, duplicateIds, proveedores });
    if (!payload.duplicates.length) return;
    const names = payload.duplicates.map((material) => `- ${material.descripcion}`).join("\n");
    if (!window.confirm(`¿Fusionar este grupo?\n\nConservar:\n${payload.keeper.descripcion}\n\nArchivar después de fusionar:\n${names}`)) return;
    setBusy(`merge-${group.id}`);
    try {
      await guardarMaterial(payload.material, payload.cantidades, { revisado: true });
      await setMaterialAreas(payload.keeper.id, payload.areas);
      await setProveedoresMaterial(payload.keeper.id, payload.proveedoresExtra);
      await archivarMateriales(payload.duplicates.map((material) => material.id));
      await onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function copyForAI() {
    await copyTextToClipboard(buildAiReviewText(visibles, cleanupCandidates, categorias));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 16, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 950, color: C.t0 }}>Posibles duplicados</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>
              No se borra ni fusiona nada solo. Primero revisás el grupo, después fusionás o archivás con confirmación.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.amberB}`, background: C.bg, borderRadius: 999, padding: "5px 10px" }}>{groups.length} grupos</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.amberB}`, background: C.bg, borderRadius: 999, padding: "5px 10px" }}>{totalItems} items</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.t0, border: `1px solid ${C.amberB}`, background: C.bg, borderRadius: 999, padding: "5px 10px" }}>{cleanupCandidates.length} raros</span>
            <button type="button" onClick={copyForAI} style={{ ...BTN, padding: "5px 10px", color: C.violet, border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.1)" }} title="Copia los grupos visibles para revisarlos con IA">
              <Copy size={13} /> {copied ? "Copiado" : "Copiar para IA"}
            </button>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar dentro de duplicados..." style={{ ...INP, width: "100%", maxWidth: 520, height: 38, paddingLeft: 36, background: C.bg }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["todos", `Todos (${groups.length})`],
            ["alta", `Alta confianza (${highConfidence})`],
            ["media", `Media+ (${mediumConfidence})`],
            ["revisar", `Dudosos (${groups.length - mediumConfidence})`],
            ["codigo", "Codigo / descripcion"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFiltro(key)} style={{ ...BTN, padding: "6px 10px", background: filtro === key ? C.bg : "transparent", border: `1px solid ${filtro === key ? C.amberB : C.b0}`, color: filtro === key ? C.amber : C.t1 }}>
              {label}
            </button>
          ))}
        </div>
        {decisionErr && <ErrorBox error={decisionErr} onRetry={() => setDecisionErr(null)} />}
      </div>

      {cleanupCandidates.length > 0 && (
        <section style={{ border: `1px solid ${C.redB || "rgba(239,68,68,0.35)"}`, background: "rgba(239,68,68,0.06)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.t0, fontSize: 13.5, fontWeight: 950 }}>Cosas raras para revisar</div>
              <div style={{ color: C.t2, fontSize: 11.5, marginTop: 2 }}>Items con texto roto, generico o demasiado pobre. Archivar requiere confirmacion.</div>
            </div>
            <button
              type="button"
              onClick={() => archiveIds(cleanupCandidates.map((row) => row.material.id), "items raros")}
              disabled={!!busy}
              style={{ ...BTN, color: C.red, border: "1px solid rgba(239,68,68,0.28)", background: "rgba(239,68,68,0.08)", opacity: busy ? 0.6 : 1 }}
            >
              <Trash2 size={13} /> Archivar todos
            </button>
          </div>
          <div style={{ display: "grid", maxHeight: 280, overflowY: "auto" }}>
            {cleanupCandidates.map(({ material, reason }) => (
              <div key={material.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.b0}`, background: C.bg }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion || "(sin descripcion)"}</div>
                  <div style={{ color: C.t2, fontSize: 11, marginTop: 2, display: "flex", gap: 7, flexWrap: "wrap" }}>
                    <span>{reason}</span>
                    <span>{categoriaNombre(categorias, material.categoria_id)}</span>
                    {material.codigo && <span style={{ fontFamily: C.mono }}>{material.codigo}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => archiveIds([material.id], "item")} disabled={!!busy} style={{ ...BTN, color: C.red, padding: "6px 9px", opacity: busy ? 0.6 : 1 }} title="Archivar item">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {visibles.map((group, idx) => {
        const keeperId = keeperForGroup(group);
        const duplicateIds = group.materials.filter((m) => m.id !== keeperId).map((m) => m.id);
        const groupBusy = busy === `merge-${group.id}`;
        return (
        <section key={group.id} style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.b0}`, background: C.s0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 950, color: C.t0 }}>Grupo {idx + 1} · {group.materials.length} parecidos</div>
              <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>Elegí cuál conservar. El resto se fusiona (junta los datos) o se archiva.</div>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => mergeGroup(group)} disabled={!!busy} style={{ ...BTN_GREEN, padding: "6px 10px", opacity: groupBusy ? 0.65 : 1 }} title="Junta cantidades, sectores, precio, proveedores y variantes en el conservado y archiva el resto">
                <Save size={13} /> {groupBusy ? "Procesando..." : "Fusionar en el conservado"}
              </button>
              <button type="button" onClick={() => archiveIds(duplicateIds, "duplicados")} disabled={!!busy} style={{ ...BTN, padding: "6px 10px", color: C.red, border: "1px solid rgba(239,68,68,0.28)", background: "rgba(239,68,68,0.06)" }}>
                <Trash2 size={13} /> Archivar los otros
              </button>
              <button type="button" onClick={() => dismissGroup(group)} disabled={!!busy} style={{ ...BTN, padding: "6px 10px", color: C.t2, opacity: busy === `dismiss-${group.id}` ? 0.65 : 1 }} title="Guardar en la base que este grupo no es duplicado">
                {busy === `dismiss-${group.id}` ? "Guardando..." : "No son duplicados"}
              </button>
            </div>
          </div>
          <div style={{ padding: 10, display: "grid", gap: 8 }}>
            {group.materials.map((material) => {
              const keep = material.id === keeperId;
              return (
                <div key={material.id} style={{ border: keep ? `1px solid ${C.greenB}` : `1px solid ${C.b0}`, borderRadius: 12, background: keep ? C.greenL : C.bg, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: keep ? C.green : C.t1, fontWeight: 850, cursor: busy ? "default" : "pointer" }}>
                      <input type="radio" name={`keeper-${group.id}`} checked={keep} disabled={!!busy} onChange={() => setKeeper(group, material.id)} />
                      {keep ? "Se conserva ✓" : "Conservar este"}
                    </label>
                    {!keep && <span style={{ fontSize: 10.5, color: C.t2 }}>se fusiona / archiva</span>}
                    <span style={{ fontSize: 11.5, color: C.t2 }}>{categoriaNombre(categorias, material.categoria_id)}</span>
                    {material.codigo && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t2 }}>Cod. {material.codigo}</span>}
                    {materialVariants(material).length > 0 && <span style={{ fontSize: 11, color: C.violet, border: "1px solid rgba(139,92,246,0.28)", background: "rgba(139,92,246,0.09)", borderRadius: 999, padding: "2px 7px" }}>Variantes: {materialVariants(material).join(" / ")}</span>}
                    <PriceBadge material={material} />
                  </div>
                  <MaterialFila material={material} categorias={categorias} ums={ums} proveedores={proveedores} onChanged={onChanged} />
                </div>
              );
            })}
          </div>
        </section>
        );
      })}

      {!visibles.length && (
        <div style={{ padding: 30, textAlign: "center", color: C.t2, border: `1px dashed ${C.b0}`, borderRadius: 14, fontSize: 13 }}>
          No hay posibles duplicados con esa busqueda.
        </div>
      )}
    </div>
  );
}

function MatrizTab({ categorias, materiales, proveedores, obras = [], onChanged }) {
  const [sel, setSel] = useState(""); // "" = todos los sectores
  const [modo, setModo] = useState("lista");
  const [showPrecios, setShowPrecios] = useState(false);
  const [catForm, setCatForm] = useState({ root: "", sub: "" });
  const [catBusy, setCatBusy] = useState("");
  const [catError, setCatError] = useState("");
  
  const materialesCatalogo = useMemo(() => materiales ?? [], [materiales]);
  
  const ums = useMemo(
    () => [...new Set((materialesCatalogo ?? []).map((m) => m.unidad_medida).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es")),
    [materialesCatalogo],
  );
  const raices = useMemo(() => categorias.filter(esRaiz), [categorias]);
  const selCat = categorias.find((c) => c.id === sel);
  const parentActivo = selCat ? (selCat.parent_id ? categorias.find((c) => c.id === selCat.parent_id) : selCat) : null;
  const subs = parentActivo ? hijosDe(categorias, parentActivo.id) : [];
  const parentParaSub = parentActivo || raices[0] || null;

  const countDe = useCallback((id) => {
    const scope = id ? idsScope(categorias, id) : null;
    return (materialesCatalogo ?? []).filter(materialActivo).filter((m) => !scope || materialEnScope(m, scope)).length;
  }, [materialesCatalogo, categorias]);
  const duplicateGroups = useMemo(() => findDuplicateGroups(materialesCatalogo ?? [], categorias, sel), [materialesCatalogo, categorias, sel]);
  const cleanupCandidates = useMemo(() => findCleanupCandidates(materialesCatalogo ?? [], categorias, sel), [materialesCatalogo, categorias, sel]);

  const Chip = ({ id, label, active }) => (
    <button
      type="button"
      onClick={() => setSel(id)}
      style={{ ...BTN, padding: "7px 12px", background: active ? "rgba(59,130,246,0.14)" : C.s0, border: `1px solid ${active ? "rgba(59,130,246,0.35)" : C.b0}`, color: active ? "#60a5fa" : C.t1 }}
    >
      {label} <span style={{ color: active ? "#93c5fd" : C.t2, fontFamily: C.mono, marginLeft: 5 }}>{countDe(id)}</span>
    </button>
  );

  async function crearCategoriaRaiz() {
    const nombre = catForm.root.trim();
    if (!nombre) return;
    setCatBusy("root");
    setCatError("");
    try {
      const created = await crearCategoria(nombre, { parentId: null });
      setCatForm((f) => ({ ...f, root: "" }));
      setSel(created.id);
      await onChanged?.();
    } catch (e) {
      setCatError(e?.message || "No se pudo crear la categoria.");
    } finally {
      setCatBusy("");
    }
  }

  async function crearSubcategoriaActiva() {
    const nombre = catForm.sub.trim();
    if (!nombre || !parentParaSub) return;
    setCatBusy("sub");
    setCatError("");
    try {
      const created = await crearCategoria(nombre, { parentId: parentParaSub.id });
      setCatForm((f) => ({ ...f, sub: "" }));
      setSel(created.id);
      await onChanged?.();
    } catch (e) {
      setCatError(e?.message || "No se pudo crear la subcategoria.");
    } finally {
      setCatBusy("");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Chip id="" label="Todos" active={!sel} />
        {raices.map((r) => <Chip key={r.id} id={r.id} label={r.nombre} active={sel === r.id || selCat?.parent_id === r.id} />)}
      </div>
      {parentActivo && subs.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9, paddingLeft: 12, borderLeft: `2px solid ${C.b0}` }}>
          <Chip id={parentActivo.id} label={`${parentActivo.nombre} · todo`} active={sel === parentActivo.id} />
          {subs.map((s) => <Chip key={s.id} id={s.id} label={s.nombre} active={sel === s.id} />)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 14 }}>
        <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: C.t2, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>Nueva categoria</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={catForm.root} onChange={(e) => setCatForm((f) => ({ ...f, root: e.target.value }))} placeholder="Ej: Seguridad" style={{ ...INP, flex: 1, height: 38 }} />
            <button type="button" onClick={crearCategoriaRaiz} disabled={!catForm.root.trim() || catBusy === "root"} style={{ ...BTN_GREEN, padding: "8px 12px", whiteSpace: "nowrap" }}>
              + Categoria
            </button>
          </div>
        </div>
        <div style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: "var(--panel)", padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: C.t2, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>
            Nueva subcategoria {parentParaSub ? `en ${parentParaSub.nombre}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={catForm.sub} onChange={(e) => setCatForm((f) => ({ ...f, sub: e.target.value }))} placeholder="Ej: Bombas de achique" style={{ ...INP, flex: 1, height: 38 }} />
            <button type="button" onClick={crearSubcategoriaActiva} disabled={!catForm.sub.trim() || !parentParaSub || catBusy === "sub"} style={{ ...BTN, padding: "8px 12px", whiteSpace: "nowrap", color: C.blue, borderColor: C.blueB, background: C.blueL }}>
              + Subcategoria
            </button>
          </div>
        </div>
      </div>
      {catError && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{catError}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14, padding: "10px 12px", border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 14 }}>
        <button type="button" onClick={() => setModo("lista")} style={{ ...BTN, padding: "7px 12px", background: modo === "lista" ? C.blueL : C.s0, border: `1px solid ${modo === "lista" ? C.blueB : C.b0}`, color: modo === "lista" ? C.blue : C.t1 }}>
          Lista completa
        </button>
        <button type="button" onClick={() => setModo("duplicados")} style={{ ...BTN, padding: "7px 12px", background: modo === "duplicados" ? C.amberL : C.s0, border: `1px solid ${modo === "duplicados" ? C.amberB : C.b0}`, color: modo === "duplicados" ? C.amber : C.t1 }}>
          Posibles duplicados <span style={{ fontFamily: C.mono, marginLeft: 5 }}>{duplicateGroups.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowPrecios(true)}
          style={{ ...BTN, padding: "7px 12px", marginLeft: "auto", background: C.greenL, border: `1px solid ${C.greenB}`, color: C.green }}
          title="Leer factura, remito, presupuesto, foto o PDF con IA y aplicar precios a materiales existentes"
        >
          <Upload size={14} /> Cargar precios
        </button>
        <span style={{ fontSize: 11.5, color: C.t2 }}>
          {sel ? "Analisis limitado al sector seleccionado." : "Analisis sobre todo el catalogo activo."}
        </span>
      </div>
      {showPrecios && (
        <CargarPresupuestoModal
          categorias={categorias}
          materiales={materiales}
          onChanged={onChanged}
          onClose={() => setShowPrecios(false)}
          soloPrecios
        />
      )}
      <div style={{ marginTop: 16 }}>
        {modo === "duplicados" ? (
          <DuplicadosCatalogo groups={duplicateGroups} cleanupCandidates={cleanupCandidates} categorias={categorias} ums={ums} proveedores={proveedores} onChanged={onChanged} />
        ) : (
          <ListaMateriales
            categorias={categorias}
            materiales={materialesCatalogo}
            selectedId={sel}
            ums={ums}
            proveedores={proveedores}
            obras={obras}
            onChanged={onChanged}
            defaultSoloPendientes={false}
            compact
          />
        )}
      </div>
    </div>
  );
}

export default function MaterialesScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("lineas");
  const [moreOpen, setMoreOpen] = useState(false);
  const [categorias, setCategorias] = useState(null);
  const [materiales, setMateriales] = useState(null);
  const [batches, setBatches] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [comprobantes, setComprobantes] = useState([]);
  const [obrasAvance, setObrasAvance] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [setupPendiente, setSetupPendiente] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCatalogo();
      setCategorias(data.categorias);
      setMateriales(data.materiales);
      setBatches(data.batches);
      setProveedores(data.proveedores ?? []);
      setComprobantes(data.comprobantes ?? []);
      setObrasAvance(await fetchObrasAvance());
      const ops = await fetchOpciones();      // tolerante: [] si falta el SQL
      setOpciones(ops.opciones ?? []);
      setSetupPendiente(false);
    } catch (e) {
      if (isMissingTable(e)) setSetupPendiente(true);
      else setError(e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchOpciones().then((r) => { if (active) setOpciones(r.opciones ?? []); }).catch(() => {});
    fetchObrasAvance().then((rows) => { if (active) setObrasAvance(rows); }).catch(() => {});
    fetchCatalogo()
      .then((data) => {
        if (!active) return;
        setCategorias(data.categorias);
        setMateriales(data.materiales);
        setBatches(data.batches);
        setProveedores(data.proveedores ?? []);
        setComprobantes(data.comprobantes ?? []);
        setSetupPendiente(false);
      })
      .catch((e) => {
        if (!active) return;
        if (isMissingTable(e)) setSetupPendiente(true);
        else setError(e);
      });
    return () => { active = false; };
  }, []);

  const listo = categorias != null && materiales != null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t0, fontFamily: C.sans, display: "flex", overflow: "hidden" }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--panel-2); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; }
        select option { background: var(--panel-solid); color: var(--muted); }
        button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      `}</style>

      <Sidebar profile={profile} signOut={signOut} />

      <div style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ padding: isMobile ? "16px 14px 50px 14px" : "26px 30px 60px" }}>
          <div style={{ marginBottom: 28, paddingLeft: isMobile ? 40 : 0 }}>
            <h1 style={{ fontSize: 32, fontWeight: 900, background: "linear-gradient(135deg, var(--t0) 0%, var(--t2) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0, letterSpacing: "-0.5px" }}>Listas de compras</h1>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Líneas de producción</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ fontWeight: 600 }}>Base matriz</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ fontWeight: 600 }}>Órdenes de compra</span>
            </div>
          </div>

          {setupPendiente ? (
            <SetupPendienteMateriales onRetry={cargar} />
          ) : error ? (
            <ErrorBox error={error} onRetry={cargar} />
          ) : !listo ? (
            <Cargando />
          ) : (
            <>
              {(() => {
                const tabStyle = (on) => ({ padding: "9px 16px", cursor: "pointer", fontSize: 13, fontFamily: C.sans, fontWeight: on ? 700 : 500, color: on ? C.t0 : C.t2, background: "transparent", border: "none", borderBottom: `2px solid ${on ? "#60a5fa" : "transparent"}`, marginBottom: -1, transition: "all .15s" });
                const moreActive = TABS_MORE.find((t) => t.key === tab);
                return (
                  <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${C.b0}` }}>
                    {TABS_MAIN.map((t) => (
                      <button key={t.key} type="button" onClick={() => { setTab(t.key); setMoreOpen(false); }} style={tabStyle(tab === t.key)}>{t.label}</button>
                    ))}
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={() => setMoreOpen((o) => !o)} style={{ ...tabStyle(!!moreActive), padding: "9px 14px" }}>
                        {moreActive ? moreActive.label : "Más"} ▾
                      </button>
                      {moreOpen && (
                        <>
                          <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 41, background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 10, padding: 5, minWidth: 180, boxShadow: "0 8px 28px rgba(0,0,0,0.4)" }}>
                            {TABS_MORE.map((t) => (
                              <button key={t.key} type="button" onClick={() => { setTab(t.key); setMoreOpen(false); }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, fontFamily: C.sans, borderRadius: 7, cursor: "pointer", border: "none", background: tab === t.key ? C.s1 : "transparent", color: tab === t.key ? C.t0 : C.t1 }}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {tab === "lineas" && <LineasTab lineas={[]} obras={obrasAvance} categorias={categorias} materiales={materiales} proveedores={proveedores} opciones={opciones} onChanged={cargar} />}
              {tab === "matriz" && <MatrizTab categorias={categorias} materiales={materiales} proveedores={proveedores} obras={obrasAvance} onChanged={cargar} />}
              {tab === "importar" && <ImportarTab batches={batches} onImported={cargar} />}
              {tab === "bandeja" && <BandejaTab categorias={categorias} materiales={materiales} onChanged={cargar} />}
              {tab === "comprobantes" && <ComprobantesTab categorias={categorias} materiales={materiales} proveedores={proveedores} comprobantes={comprobantes} onChanged={cargar} />}
              {tab === "revision" && <RevisionTab categorias={categorias} materiales={materiales} proveedores={proveedores} onChanged={cargar} />}
              {tab === "normalizacion" && <NormalizacionTab categorias={categorias} materiales={materiales} proveedores={proveedores} onChanged={cargar} />}
              {tab === "condicionantes" && <MatrizCondicionantesTab materiales={materiales} categorias={categorias} onChanged={cargar} />}
              {tab === "variantes" && <VariantesMarcasTab materiales={materiales} />}
              {tab === "proveedores" && <ProveedoresTab proveedores={proveedores} onChanged={cargar} />}
              {tab === "avance" && <AvanceTab categorias={categorias} materiales={materiales} batches={batches} obras={obrasAvance} />}
              {tab === "costos" && <CostoObraTab categorias={categorias} materiales={materiales} opciones={opciones} />}
              {tab === "resumen" && <ResumenTab categorias={categorias} materiales={materiales} />}
              {tab === "lector" && <LectorTab materiales={materiales} categorias={categorias} onMaterialUpdate={(id, updates) => setMateriales(prev => prev?.map(m => m.id === id ? { ...m, ...updates } : m))} onCatalogChanged={cargar} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
