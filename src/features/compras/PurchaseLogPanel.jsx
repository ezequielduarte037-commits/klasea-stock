import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  ImagePlus,
  Layers3,
  MessageSquare,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import {
  createPurchaseLogConItems,
  deletePurchaseLog,
  fetchAdditionalBoards,
  fetchAdditionalItems,
  fetchProjects,
  fetchPurchaseLog,
  updatePurchaseLogItem,
  uploadPurchaseLogInvoice,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import {
  comentarEnvio,
  deleteEnvio,
  fetchEnviosRegistro,
  ENVIO_ESTADO_META,
  ITEM_ESTADO_META,
  resumenItems,
  updateEnvioItemPrice,
} from "@/features/panol/panolApi";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Skeleton, SkeletonStyles } from "@/components/ui/Skeleton";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { parsePanolLine } from "@/features/panol/panolParsing";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";

const EMPTY = [];

// Color de "requiere atención" (falta precio, item a revisar). Cyan, no ámbar.
const WARN = C.cyan;
const WARN_SOFT = C.cyanL;
const WARN_BORDER = C.cyanB;

function fmtMoney(value, currency = "ARS") {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return currency === "USD" ? "USD 0" : "$0";
  const text = n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return currency === "USD" ? `USD ${text}` : `$${text}`;
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function numericQty(value) {
  if (value === null || value === undefined || value === "") return 1;
  const n = Number(String(value).replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0] || "");
  return Number.isFinite(n) ? n : 1;
}

function purchaseQtyNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0] || "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

function itemTotal(item) {
  const price = Number(item.precio_unitario);
  if (!Number.isFinite(price)) return null;
  return {
    currency: item.moneda || "ARS",
    value: price * numericQty(item.cantidad),
  };
}

function purchaseLogItemTotal(item) {
  const price = Number(item.precio_unitario);
  const qty = purchaseQtyNumber(item.cantidad);
  if (!Number.isFinite(price) || price <= 0 || qty === null) return null;
  return {
    currency: item.moneda === "USD" ? "USD" : "ARS",
    value: price * qty,
  };
}

// El header de purchase_log guarda un `amount` que sólo contempla ARS y queda en
// null si al cargar todavía no había precios. Para mostrar, preferimos siempre el
// total derivado de los items (ARS + USD) y caemos al header sólo si no hay items.
function purchaseLogEntryTotals(entry) {
  const items = entry?.items || EMPTY;
  if (items.length) {
    return items.reduce((acc, item) => {
      const total = purchaseLogItemTotal(item);
      if (!total) {
        acc.sinPrecio += 1;
        return acc;
      }
      acc[total.currency] += total.value;
      return acc;
    }, { ARS: 0, USD: 0, sinPrecio: 0 });
  }
  const amount = Number(entry?.amount);
  return { ARS: Number.isFinite(amount) ? amount : 0, USD: 0, sinPrecio: 0 };
}

function isMissingVariantColumn(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || (msg.includes("column") && msg.includes("variante"));
}

async function fetchSnapshotLinksForPurchaseLog(entry) {
  const requestItemIds = [...new Set((entry?.items || EMPTY).map((item) => item.purchase_request_item_id).filter(Boolean))];
  const materialIds = [...new Set((entry?.items || EMPTY).map((item) => item.material_id).filter(Boolean))];

  async function loadRows(select) {
    const rows = [];
    if (requestItemIds.length) {
      const { data, error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select(select)
        .in("purchase_request_item_id", requestItemIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      rows.push(...(data || []));
    }
    if (entry?.project_id && materialIds.length) {
      const { data, error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select(select)
        .eq("obra_id", entry.project_id)
        .in("material_id", materialIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  }

  let rows = [];
  try {
    rows = await loadRows("id,obra_id,purchase_request_item_id,material_id,requisito_material_id,variante");
  } catch (error) {
    if (!isMissingVariantColumn(error)) throw error;
    rows = await loadRows("id,obra_id,purchase_request_item_id,material_id");
  }

  const byRequestItem = new Map();
  const byMaterial = new Map();
  for (const row of rows) {
    if (row.purchase_request_item_id && !byRequestItem.has(row.purchase_request_item_id)) {
      byRequestItem.set(row.purchase_request_item_id, row);
    }
    if (row.material_id && !byMaterial.has(row.material_id)) {
      byMaterial.set(row.material_id, row);
    }
  }
  return { byRequestItem, byMaterial };
}

function needsPurchaseItemReview(item) {
  return purchaseQtyNumber(item.cantidad) === null || normalizePriceInput(item.precio_unitario) === null;
}

function envioTotals(envio) {
  return (envio.items || []).reduce((acc, item) => {
    const total = itemTotal(item);
    if (!total) {
      acc.sinPrecio += 1;
      return acc;
    }
    acc[total.currency] = (acc[total.currency] || 0) + total.value;
    return acc;
  }, { ARS: 0, USD: 0, sinPrecio: 0 });
}

function totalsLabel(totals) {
  const parts = [];
  if (totals.ARS) parts.push(fmtMoney(totals.ARS, "ARS"));
  if (totals.USD) parts.push(fmtMoney(totals.USD, "USD"));
  return parts.join(" · ") || "Sin precios";
}

// El gasto de una obra llega por tres caminos distintos (ítems de pedidos a Pañol,
// ítems de cargas de compra y adicionales). Para el que mira la obra es una sola
// cosa: plata gastada. Esto los aplana a una forma común para poder listarlos en
// una tabla única, filtrable por origen, en vez de tres bloques apilados.
function obraCostLines(row) {
  const lines = [];

  for (const item of row.items || EMPTY) {
    const unit = item.precio_unitario == null || item.precio_unitario === "" ? null : Number(item.precio_unitario);
    lines.push({
      key: `panol:${item.id}`,
      origen: "panol",
      origenLabel: "Pañol",
      origenColor: item.tipo === "adicional" ? C.violet : C.blue,
      adicional: item.tipo === "adicional",
      titulo: item.descripcion,
      subtitulo: [item.pedido, item.codigo, item.nota].filter(Boolean).join(" · "),
      cantidad: item.cantidad,
      unidad: item.unidad,
      unit: Number.isFinite(unit) ? unit : null,
      editable: { id: item.id, source: "panol", moneda: item.moneda },
      total: item.total,
      revisar: false,
      cuentaCobertura: true,
    });
  }

  for (const item of row.manuales || EMPTY) {
    const unit = item.unitPrice == null || item.unitPrice === "" ? null : Number(item.unitPrice);
    lines.push({
      key: `carga:${item.id}`,
      origen: "carga",
      origenLabel: "Carga",
      origenColor: C.teal,
      adicional: false,
      titulo: item.description,
      subtitulo: [item.header, item.codigo, item.provider || "Sin proveedor", item.fecha ? fmtDate(item.fecha) : ""].filter(Boolean).join(" · "),
      cantidad: item.cantidad,
      unidad: item.unidad,
      unit: Number.isFinite(unit) ? unit : null,
      // Sólo los ítems de carga (source "log") son editables; el fallback de
      // cabecera sin ítems no tiene una fila propia que actualizar.
      editable: item.source === "log" ? { id: item.id, source: "log", moneda: item.currency } : null,
      total: item.amount ? { value: item.amount, currency: item.currency } : null,
      revisar: Boolean(item.revisar),
      cuentaCobertura: true,
    });
  }

  for (const item of row.adicionales || EMPTY) {
    lines.push({
      key: `adic:${item.id}`,
      origen: "adicional",
      origenLabel: "Adicional",
      origenColor: C.violet,
      adicional: true,
      titulo: item.detail,
      subtitulo: [item.provider || "Sin proveedor", item.requestTitle, item.linkedToPanol ? "ya contado en Pañol" : ""].filter(Boolean).join(" · "),
      cantidad: item.cantidad,
      unidad: "",
      unit: null,
      editable: null,
      total: item.amount ? { value: item.amount, currency: item.currency } : null,
      revisar: false,
      // Los adicionales ya vinculados a Pañol no suman plata; no tiene sentido
      // exigirles precio ni contarlos como "falta cargar".
      cuentaCobertura: false,
    });
  }

  return lines;
}

// Cobertura de precios consistente entre la tarjeta de la obra y su detalle:
// cuenta las líneas que sí deben tener precio (pañol + cargas de compra).
function priceCoverage(row) {
  const contables = obraCostLines(row).filter((line) => line.cuentaCobertura);
  const priced = contables.filter((line) => line.total).length;
  return { total: contables.length, priced, sinPrecio: Math.max(0, contables.length - priced) };
}

function chip(color, label) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      color,
      background: `${color}14`,
      border: `1px solid ${color}38`,
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 850,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

// Celda de la tira de KPIs: densa, sin caja de icono, separada por hairlines del
// grid contenedor (gap 1px sobre fondo `border`).
function KpiCell({ icon: IconComponent, label, value, detail, color, loading }) {
  return (
    <div style={{ background: C.panelSolid, padding: "10px 12px", display: "grid", gap: 3, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase" }}>
        {IconComponent && <IconComponent size={12} style={{ color, flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      {loading ? (
        <Skeleton width={90} height={19} radius={6} />
      ) : (
        <div style={{ color, fontFamily: C.mono, fontSize: 19, fontWeight: 900, lineHeight: 1.05, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      )}
      {detail && <div style={{ color: C.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>}
    </div>
  );
}

// Hover/focus no se pueden expresar con estilos inline, así que van en una hoja
// local acotada al prefijo `plp-`.
function PanelStyles() {
  return (
    <style>{`
      .plp-card { transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease, background .15s ease; }
      .plp-card:hover { border-color: var(--border-2); transform: translateY(-1px); box-shadow: 0 6px 18px var(--shadow); }
      .plp-btn { transition: border-color .15s ease, filter .15s ease, transform .12s ease; }
      .plp-btn:hover:not(:disabled) { border-color: var(--border-2); filter: brightness(1.08); }
      .plp-btn:active:not(:disabled) { transform: translateY(1px); }
      .plp-row { transition: background .12s ease; }
      .plp-row:hover { background: var(--panel-2); }
      .plp-field { transition: border-color .15s ease, box-shadow .15s ease; }
      .plp-field:focus, .plp-field:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
      .plp-btn:focus-visible, .plp-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    `}</style>
  );
}

function Progress({ resumen }) {
  const pct = resumen?.pctRecibido || 0;
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ height: 7, borderRadius: 99, background: C.panel2, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: C.green }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 11 }}>
        <span><strong style={{ color: C.green }}>{resumen.recibidos}/{resumen.total}</strong> recibidos</span>
        {resumen.problemas > 0 && <span style={{ color: C.red, fontWeight: 850 }}>{resumen.problemas} novedades</span>}
      </div>
    </div>
  );
}

function envioSearch(envio) {
  return [
    envio.titulo,
    envio.sede,
    envio.destino,
    envio.obra?.codigo,
    envio.estado,
    ...(envio.items || []).map((i) => `${i.descripcion} ${i.codigo || ""}`),
  ].filter(Boolean).join(" ").toLowerCase();
}

function normalizeSearch(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePriceInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let clean = raw.replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    clean = comma > dot ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = clean.length - comma - 1;
    clean = decimals > 0 && decimals <= 2 ? clean.replace(",", ".") : clean.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    clean = clean.replace(/\./g, "");
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function makePurchaseLogItem(patch = {}) {
  return {
    localId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    descripcion: "",
    codigo: "",
    cantidad: "",
    unidad: "unidad",
    precio_unitario: "",
    moneda: "ARS",
    revisar: true,
    ...patch,
  };
}

function normalizePurchaseLogItems(items = EMPTY) {
  return (items || EMPTY)
    .filter((item) => String(item.descripcion || "").trim())
    .map((item) => {
      const precio = normalizePriceInput(item.precio_unitario);
      const cantidad = String(item.cantidad || "").trim();
      return {
        descripcion: String(item.descripcion || "").trim(),
        codigo: String(item.codigo || "").trim() || null,
        cantidad,
        unidad: String(item.unidad || "unidad").trim() || "unidad",
        precio_unitario: precio,
        moneda: item.moneda === "USD" ? "USD" : "ARS",
        revisar: needsPurchaseItemReview({ ...item, precio_unitario: precio }),
      };
    });
}

function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function mimeTypeForFile(file) {
  const type = String(file?.type || "").trim();
  const name = String(file?.name || "").toLowerCase();
  if (type) return type;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function readFunctionErrorMessage(error) {
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      return payload?.error || payload?.message || error?.message || "";
    } catch (jsonError) {
      void jsonError;
    }
    try {
      const text = await context.clone().text();
      return text || error?.message || "";
    } catch {
      return error?.message || "";
    }
  }
  return error?.message || "";
}

function detectMoney(line = "") {
  const text = String(line || "");
  const matches = [...text.matchAll(/(?:(USD|U\$S|ARS|\$)\s*)?(\d[\d.,]*)(?:\s*(USD|U\$S|ARS))?/gi)]
    .filter((m) => m[1] || m[3] || /[$]/.test(m[0]));
  const m = matches.at(-1);
  if (!m) return { text, price: null, moneda: /usd|u\$s/i.test(text) ? "USD" : "ARS" };
  const moneda = /usd|u\$s/i.test(m[1] || m[3] || text) ? "USD" : "ARS";
  const price = normalizePriceInput(m[2]);
  return {
    text: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim(),
    price,
    moneda,
  };
}

function scoreCandidate(parsed, candidate) {
  const code = normalizeSearch(parsed.codigo);
  const desc = normalizeSearch(parsed.descripcion);
  const cCode = normalizeSearch(candidate.codigo);
  const cDesc = normalizeSearch(candidate.descripcion);
  let score = 0;
  if (code && cCode && code === cCode) score += 90;
  if (code && cDesc.includes(code)) score += 30;
  if (desc && cDesc === desc) score += 70;
  if (desc && (cDesc.includes(desc) || desc.includes(cDesc))) score += 38;
  const words = desc.split(" ").filter((w) => w.length > 2);
  for (const word of words) if (cDesc.includes(word)) score += 5;
  return score;
}

function bestCandidate(parsed, candidates) {
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreCandidate(parsed, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= 35 ? best : null;
}

function parseBudgetText(text, candidates) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const money = detectMoney(line);
      const parsed = parsePanolLine(money.text) || { descripcion: money.text, codigo: "", cantidad: "", unidad: "unidad" };
      const match = bestCandidate(parsed, candidates);
      return {
        raw: line,
        descripcion: parsed.descripcion,
        codigo: parsed.codigo || "",
        cantidad: parsed.cantidad || "",
        unidad: parsed.unidad || "unidad",
        precio_unitario: money.price ?? "",
        moneda: money.moneda,
        itemId: match?.id || "",
        confidence: match ? "alta" : "manual",
      };
    });
}

function makeCostRow(key, label = key) {
  return {
    key,
    label,
    pedidoIds: new Set(),
    pedidos: 0,
    items: [],
    adicionales: [],
    manuales: [],
    ARS: 0,
    USD: 0,
    baseARS: 0,
    baseUSD: 0,
    adicionalARS: 0,
    adicionalUSD: 0,
    sinPrecio: 0,
    baseItems: 0,
    adicionalItems: 0,
  };
}

// Resuelve la obra de un envío. Si no tiene obra linkeada, intenta detectar el
// código de obra (ej "52-26", "55-4", "K64-19") dentro del título o el destino,
// para que no caiga en "Sin obra/destino" cuando la obra sí existe.
function resolveEnvioObra(envio, obraCodeList) {
  if (envio.obra?.codigo) {
    return { key: normalizeSearch(envio.obra.codigo) || "sin-obra", label: envio.obra.codigo };
  }
  const hay = ` ${normalizeSearch(`${envio.titulo || ""} ${envio.destino || ""}`)} `;
  for (const o of obraCodeList) {
    if (o.norm && hay.includes(` ${o.norm} `)) return { key: o.key, label: o.codigo };
  }
  const fallback = envio.destino || "Sin obra/destino";
  return { key: normalizeSearch(fallback) || "sin-obra", label: fallback };
}

// Misma idea que resolveEnvioObra pero para la carga manual: busca el código de
// obra dentro de lo que el usuario escribió (título, notas, líneas pegadas) para
// preseleccionar la obra sin que tenga que ir al select.
function guessObraId(text, obras = EMPTY) {
  const hay = ` ${normalizeSearch(text)} `;
  if (hay.trim().length < 2) return "";
  const sorted = [...obras]
    .map((o) => ({ id: o.id, norm: normalizeSearch(o.codigo || "") }))
    .filter((o) => o.norm.length >= 2)
    .sort((a, b) => b.norm.length - a.norm.length);
  for (const obra of sorted) {
    if (hay.includes(` ${obra.norm} `)) return obra.id;
  }
  return "";
}

function looksAdditional(envio, item, additionalByItem, additionalByRequest) {
  if (item?.purchase_request_item_id && additionalByItem.has(item.purchase_request_item_id)) return true;
  if (envio?.purchase_request_id && additionalByRequest.has(envio.purchase_request_id)) return true;
  const text = normalizeSearch(`${envio?.origen || ""} ${envio?.titulo || ""} ${envio?.observaciones || ""} ${item?.descripcion || ""} ${item?.nota || ""}`);
  return /\b(adicional|adicionales|extra|extras)\b/.test(text);
}

function buildCostosPorObra(envios, additionalBoards, additionalItems, entries = EMPTY, obrasById = new Map()) {
  const rows = new Map();
  const boardsById = new Map((additionalBoards || []).map((b) => [b.id, b]));
  // Códigos de obra normalizados para detectar la obra dentro del título/destino
  // de envíos que no la tienen linkeada. Códigos largos primero (mejor match).
  const obraCodeList = [...obrasById.values()]
    .map((o) => ({ codigo: o.codigo, norm: normalizeSearch(o.codigo || ""), key: normalizeSearch(o.codigo || "") }))
    .filter((o) => o.norm)
    .sort((a, b) => b.norm.length - a.norm.length);
  const additionalByItem = new Map();
  const additionalByRequest = new Map();
  const panolRequestItems = new Set();
  const panolRequests = new Set();

  for (const envio of envios || EMPTY) {
    if (envio.purchase_request_id) panolRequests.add(envio.purchase_request_id);
    for (const item of envio.items || EMPTY) {
      if (item.purchase_request_item_id) panolRequestItems.add(item.purchase_request_item_id);
    }
  }

  for (const item of additionalItems || EMPTY) {
    if (item.purchase_request_item_id) additionalByItem.set(item.purchase_request_item_id, item);
    if (item.purchase_request_id) additionalByRequest.set(item.purchase_request_id, item);
  }

  for (const envio of envios || EMPTY) {
    // Envío generado desde una compra cargada (purchase_log): su costo ya lo
    // aporta la compra en el bloque de abajo. Lo salteamos para no duplicar.
    if (envio.purchase_log_id) continue;
    const { key, label } = resolveEnvioObra(envio, obraCodeList);
    const row = rows.get(key) || makeCostRow(key, label);
    row.pedidoIds.add(envio.id);
    for (const item of envio.items || EMPTY) {
      const total = itemTotal(item);
      const isAdditional = looksAdditional(envio, item, additionalByItem, additionalByRequest);
      const currency = total?.currency || item.moneda || "ARS";
      const value = total?.value || 0;
      if (total) {
        row[currency] = (row[currency] || 0) + value;
        row[isAdditional ? `adicional${currency}` : `base${currency}`] += value;
      } else {
        row.sinPrecio += 1;
      }
      row[isAdditional ? "adicionalItems" : "baseItems"] += 1;
      row.items.push({
        id: item.id,
        source: "panol",
        tipo: isAdditional ? "adicional" : "normal",
        descripcion: item.descripcion,
        codigo: item.codigo || "",
        cantidad: item.cantidad || "",
        unidad: item.unidad || "",
        estado: item.estado,
        nota: item.nota || "",
        precio_unitario: item.precio_unitario,
        moneda: item.moneda || "ARS",
        total,
        pedido: envio.titulo,
        pedidoId: envio.id,
        fecha: envio.created_at,
      });
    }
    rows.set(key, row);
  }

  for (const item of additionalItems || EMPTY) {
    const board = boardsById.get(item.board_id);
    const label = board?.project?.codigo || board?.name || "Adicionales sin obra";
    const key = normalizeSearch(label) || "adicionales-sin-obra";
    const row = rows.get(key) || makeCostRow(key, label);
    const linkedToPanol = (item.purchase_request_item_id && panolRequestItems.has(item.purchase_request_item_id))
      || (item.purchase_request_id && panolRequests.has(item.purchase_request_id));
    const amount = Number(item.amount);
    const moneda = item.currency === "USD" ? "USD" : "ARS";
    const hasAmount = Number.isFinite(amount) && amount > 0;
    row.adicionales.push({
      id: item.id,
      detail: item.detail,
      cantidad: item.cantidad || "",
      provider: item.provider || "",
      amount: hasAmount ? amount : null,
      currency: moneda,
      linkedToPanol,
      requestTitle: item.request?.title || "",
      entryDate: item.entry_date || item.created_at,
    });
    if (!linkedToPanol && hasAmount) {
      row[moneda] = (row[moneda] || 0) + amount;
      row[`adicional${moneda}`] += amount;
    }
    rows.set(key, row);
  }

  // Compras manuales del registro con obra asignada → suman al gasto de esa obra (ARS).
  for (const entry of entries || EMPTY) {
    if (!entry.project_id) continue;
    const obra = obrasById.get(entry.project_id);
    const label = obra?.codigo || "Obra";
    const key = normalizeSearch(label) || entry.project_id;
    const row = rows.get(key) || makeCostRow(key, label);

    if (entry.items?.length) {
      for (const item of entry.items) {
        const total = purchaseLogItemTotal(item);
        const currency = total?.currency || item.moneda || "ARS";
        const revisar = Boolean(item.revisar) || !total;
        if (total) {
          row[currency] = (row[currency] || 0) + total.value;
          row[`base${currency}`] += total.value;
        } else {
          row.sinPrecio += 1;
        }
        row.manuales.push({
          id: item.id,
          source: "log",
          logId: entry.id,
          description: item.descripcion,
          codigo: item.codigo || "",
          cantidad: item.cantidad || "",
          unidad: item.unidad || "",
          material_id: item.material_id || "",
          purchase_request_item_id: item.purchase_request_item_id || null,
          variante: item.variante || "",
          provider: entry.provider || "",
          amount: total?.value || null,
          currency,
          unitPrice: item.precio_unitario,
          revisar,
          fecha: entry.purchased_at,
          header: entry.description,
        });
      }
    } else {
      const amount = Number(entry.amount);
      const hasAmount = Number.isFinite(amount) && amount > 0;
      row.manuales.push({
        id: entry.id,
        source: "log-header",
        logId: entry.id,
        description: entry.description,
        provider: entry.provider || "",
        amount: hasAmount ? amount : null,
        currency: "ARS",
        fecha: entry.purchased_at,
      });
      if (hasAmount) {
        row.ARS = (row.ARS || 0) + amount;
        row.baseARS += amount;
      }
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, pedidos: row.pedidoIds.size }))
    .sort((a, b) => (b.ARS + b.USD * 1000 + b.sinPrecio) - (a.ARS + a.USD * 1000 + a.sinPrecio));
}

export default function PurchaseLogPanel({ profile }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState("panol");
  const [panolModal, setPanolModal] = useState(null);
  const [entries, setEntries] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [obras, setObras] = useState([]);
  const [additionalBoards, setAdditionalBoards] = useState([]);
  const [additionalItems, setAdditionalItems] = useState([]);
  const [selectedEnvioId, setSelectedEnvioId] = useState(null);
  const [selectedObraKey, setSelectedObraKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [budgetModal, setBudgetModal] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("activos");
  const [form, setForm] = useState({
    description: "",
    provider: "",
    notes: "",
    project_id: "",
    purchased_at: new Date().toISOString().slice(0, 10),
    items: [makePurchaseLogItem()],
  });

  const obrasById = useMemo(() => new Map((obras || []).map((o) => [o.id, o])), [obras]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logRows, envioRows, boardRows, additionalRows, obraRows] = await Promise.all([
        fetchPurchaseLog(),
        fetchEnviosRegistro({ limit: 120 }),
        fetchAdditionalBoards(),
        fetchAdditionalItems(),
        fetchProjects().catch(() => []),
      ]);
      setEntries(logRows);
      setEnvios(envioRows);
      setAdditionalBoards(boardRows);
      setAdditionalItems(additionalRows);
      setObras(obraRows || []);
    } catch (err) {
      toast.error(err.message || "No se pudo cargar el registro de compras.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedEnvioId && envios.length) setSelectedEnvioId(envios[0].id);
  }, [envios, selectedEnvioId]);

  const costosPorObra = useMemo(
    () => buildCostosPorObra(envios, additionalBoards, additionalItems, entries, obrasById),
    [envios, additionalBoards, additionalItems, entries, obrasById],
  );

  useEffect(() => {
    if (!selectedObraKey && costosPorObra.length) setSelectedObraKey(costosPorObra[0].key);
    if (selectedObraKey && costosPorObra.length && !costosPorObra.some((row) => row.key === selectedObraKey)) {
      setSelectedObraKey(costosPorObra[0].key);
    }
  }, [costosPorObra, selectedObraKey]);

  function resetForm() {
    setForm({ description: "", provider: "", notes: "", project_id: "", purchased_at: new Date().toISOString().slice(0, 10), items: [makePurchaseLogItem()] });
    setInvoiceFile(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = normalizePurchaseLogItems(form.items);
    if (!form.description.trim() && items.length === 0) {
      toast.warning("Carga una descripcion o al menos un item.");
      return;
    }
    const amountARS = items.reduce((sum, item) => {
      const total = purchaseLogItemTotal(item);
      return total?.currency === "ARS" ? sum + total.value : sum;
    }, 0);
    setSaving(true);
    try {
      let invoice_url;
      let invoice_path;
      if (invoiceFile) {
        const r = await uploadPurchaseLogInvoice(invoiceFile, profile.id);
        invoice_url = r.url;
        invoice_path = r.path;
      }
      await createPurchaseLogConItems({
        header: {
          description: form.description.trim() || items[0]?.descripcion || "Carga de compra",
          amount: amountARS > 0 ? amountARS : null,
          provider: form.provider.trim() || null,
          notes: form.notes.trim() || null,
          project_id: form.project_id || null,
          purchased_at: form.purchased_at || new Date().toISOString().slice(0, 10),
          invoice_url: invoice_url || null,
          invoice_path: invoice_path || null,
        },
        items,
      });
      toast.success("Carga de compra registrada");
      resetForm();
      load();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar la compra.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLog(id) {
    const ok = await confirm({
      title: "Borrar carga de compra",
      message: "Esto borra la compra cargada y sus items. Usalo para pruebas o correcciones mal cargadas.",
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePurchaseLog(id);
      toast.success("Carga de compra borrada");
      load();
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar el registro.");
    }
  }

  async function handleSendLogToPanol(entry) {
    if (!entry?.items?.length) return;
    try {
      const links = await fetchSnapshotLinksForPurchaseLog(entry);
      setPanolModal({
        prefill: {
          titulo: entry.description || "Compra",
          origen: "compra",
          purchaseLogId: entry.id,
          obraId: entry.project_id || "",
          items: (entry.items || EMPTY).map((it) => {
            const snapshot = (it.purchase_request_item_id && links.byRequestItem.get(it.purchase_request_item_id))
              || (it.material_id && links.byMaterial.get(it.material_id))
              || null;
            return {
              descripcion: it.descripcion,
              codigo: it.codigo || "",
              cantidad: it.cantidad,
              unidad: it.unidad || "unidad",
              precio_unitario: it.precio_unitario ?? "",
              moneda: it.moneda || "ARS",
              obra_id: snapshot?.obra_id || entry.project_id || "",
              material_id: it.material_id || snapshot?.material_id || "",
              requisito_material_id: snapshot?.requisito_material_id || it.requisito_material_id || it.material_id || snapshot?.material_id || "",
              purchase_request_item_id: it.purchase_request_item_id || snapshot?.purchase_request_item_id || null,
              obra_snapshot_item_id: snapshot?.id || null,
            };
          }),
        },
      });
    } catch (err) {
      toast.error(err.message || "No se pudo preparar el aviso a pañol.");
    }
  }

  async function handleDeleteEnvio(envio) {
    const ok = await confirm({
      title: "Borrar pedido a pañol",
      message: `Se borra definitivamente "${envio.titulo}", sus items y su historial. No queda cancelado ni archivado.`,
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteEnvio(envio.id);
      toast.success("Pedido a pañol borrado");
      setSelectedEnvioId((cur) => (cur === envio.id ? null : cur));
      await load();
    } catch (err) {
      toast.error(err.message || "No se pudo borrar el pedido a pañol.");
    }
  }

  async function handleCommentEnvio(envio, text) {
    if (!envio?.id) return;
    try {
      await comentarEnvio(envio.id, text);
      toast.success("Mensaje agregado al seguimiento.");
      await load();
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el mensaje.");
    }
  }

  // Los precios del modal pueden ir a dos tablas distintas: items de envío a
  // pañol o items de una carga de compra. El `source` del candidato decide cuál.
  async function applyPriceRows(toApply) {
    if (!toApply.length) {
      toast.warning("No hay precios listos para aplicar.");
      return;
    }
    setSavingPrices(true);
    try {
      for (const row of toApply) {
        if (row.source === "log") {
          await updatePurchaseLogItem(row.id, {
            precio_unitario: row.precio,
            moneda: row.moneda,
            revisar: false,
          });
        } else {
          await updateEnvioItemPrice(row.id, {
            precio_unitario: row.precio,
            moneda: row.moneda,
          });
        }
      }
      toast.success(`${toApply.length} precio${toApply.length === 1 ? "" : "s"} cargado${toApply.length === 1 ? "" : "s"}.`);
      setBudgetModal(null);
      await load();
    } catch (err) {
      toast.error(err.message || "No se pudieron aplicar los precios.");
    } finally {
      setSavingPrices(false);
    }
  }

  async function handleApplyBudgetRows(rows) {
    const sourceById = new Map(budgetCandidates.map((c) => [c.id, c.source]));
    await applyPriceRows(rows
      .map((row) => ({
        id: row.itemId,
        source: sourceById.get(row.itemId) || "panol",
        moneda: row.moneda,
        precio: normalizePriceInput(row.precio_unitario),
      }))
      .filter((row) => row.id && row.precio !== null));
  }

  async function handleApplyManualPriceRows(rows) {
    await applyPriceRows(rows
      .map((row) => ({
        id: row.id,
        source: row.source || "panol",
        moneda: row.moneda,
        precio: normalizePriceInput(row.precio_unitario),
      }))
      .filter((row) => row.id && row.precio !== null));
  }

  async function handleSetItemPrice(itemId, pricePatch) {
    const precio = normalizePriceInput(pricePatch?.precio_unitario);
    if (precio === null) {
      toast.warning("Cargá un precio válido.");
      return;
    }

    setSavingPrices(true);
    try {
      await updateEnvioItemPrice(itemId, {
        precio_unitario: precio,
        moneda: pricePatch.moneda,
      });
      toast.success("Precio actualizado.");
      await load();
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar el precio.");
    } finally {
      setSavingPrices(false);
    }
  }

  // Corrige el precio de un item de una carga de compra (los que quedan marcados
  // "Revisar") sin tener que borrar y volver a cargar la compra entera.
  async function handleSetManualItemPrice(itemId, pricePatch) {
    const precio = normalizePriceInput(pricePatch?.precio_unitario);
    if (precio === null) {
      toast.warning("Cargá un precio válido.");
      return;
    }
    setSavingPrices(true);
    try {
      await updatePurchaseLogItem(itemId, {
        precio_unitario: precio,
        moneda: pricePatch.moneda,
        revisar: false,
      });
      toast.success("Precio actualizado.");
      await load();
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar el precio.");
    } finally {
      setSavingPrices(false);
    }
  }

  const { monthlyTotal, monthlyCount, manualTotal, sinPrecioCargas } = useMemo(() => {
    const now = new Date();
    let mTotal = 0;
    let mCount = 0;
    let total = 0;
    let sinPrecio = 0;
    for (const entry of entries) {
      const totals = purchaseLogEntryTotals(entry);
      total += totals.ARS;
      sinPrecio += totals.sinPrecio;
      const d = new Date(entry.purchased_at);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        mTotal += totals.ARS;
        mCount += 1;
      }
    }
    return { monthlyTotal: mTotal, monthlyCount: mCount, manualTotal: total, sinPrecioCargas: sinPrecio };
  }, [entries]);

  const filteredEnvios = useMemo(() => {
    let rows = envios;
    if (estado === "activos") rows = rows.filter((e) => !["cerrado", "cancelado"].includes(e.estado));
    else if (estado !== "todos") rows = rows.filter((e) => e.estado === estado);
    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((e) => envioSearch(e).includes(term));
    return rows;
  }, [envios, estado, q]);

  const selectedEnvio = useMemo(
    () => envios.find((e) => e.id === selectedEnvioId) || filteredEnvios[0] || null,
    [envios, filteredEnvios, selectedEnvioId],
  );

  const panolKpis = useMemo(() => {
    let itemsPendientes = 0;
    let novedades = 0;
    let enviados = 0;
    let recibidos = 0;
    for (const envio of envios) {
      const r = resumenItems(envio.items || EMPTY);
      itemsPendientes += r.pendientes;
      novedades += r.problemas;
      if (!["cerrado", "cancelado"].includes(envio.estado)) enviados += 1;
      if (envio.estado === "recibido") recibidos += 1;
    }
    return { enviados, recibidos, itemsPendientes, novedades };
  }, [envios]);

  // Candidatos para el modal de precios: items de pañol + items de cargas de
  // compra (que son justamente los que quedan marcados "Revisar"). La obra sale
  // de la fila que los contiene, sin volver a recorrer todas las filas por item.
  const budgetCandidates = useMemo(() => {
    const rows = budgetModal?.obraKey
      ? costosPorObra.filter((row) => row.key === budgetModal.obraKey)
      : costosPorObra;
    const out = [];
    for (const row of rows) {
      for (const item of row.items || EMPTY) {
        out.push({
          id: item.id,
          source: "panol",
          descripcion: item.descripcion,
          codigo: item.codigo,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          moneda: item.moneda || "ARS",
          pedido: item.pedido,
          obra: row.label,
        });
      }
      for (const item of row.manuales || EMPTY) {
        if (item.source !== "log") continue;
        out.push({
          id: item.id,
          source: "log",
          descripcion: item.description,
          codigo: item.codigo,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.unitPrice,
          moneda: item.currency || "ARS",
          pedido: item.header || "Carga de compra",
          obra: row.label,
        });
      }
    }
    return out;
  }, [budgetModal, costosPorObra]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PanelStyles />
      <SkeletonStyles />

      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        border: `1px solid ${C.border}`,
        background: C.topbarSoft,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 13,
        padding: "9px 11px",
      }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: "grid",
          placeItems: "center",
          background: C.blueL,
          border: `1px solid ${C.blueB}`,
          color: C.blue,
          flexShrink: 0,
        }}>
          <ClipboardList size={16} />
        </div>
        <div style={{ minWidth: 160, marginRight: "auto" }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 900, lineHeight: 1.15 }}>Registro de compras</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Cargas, pedidos a Pañol y gasto por obra.</div>
        </div>
        <ViewTabs value={view} onChange={setView} />
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button type="button" className="plp-btn" onClick={() => setShowForm((v) => !v)} style={secondaryButton()}>
            {showForm ? <X size={14} /> : <ReceiptText size={14} />}
            {showForm ? "Cerrar carga" : "Cargar compra"}
          </button>
          <button type="button" className="plp-btn" onClick={() => setBudgetModal({ obraKey: view === "costos" ? selectedObraKey : "" })} style={secondaryButton()}>
            <Sparkles size={14} /> Cargar precios
          </button>
          <button type="button" className="plp-btn" onClick={() => setPanolModal({ prefill: null })} style={primaryButton(C.blue)}>
            <Plus size={14} /> Envío a Pañol
          </button>
        </div>
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
        gap: 1,
        background: C.border,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}>
        <KpiCell icon={DollarSign} label="Este mes" value={fmtMoney(monthlyTotal)} detail={`${monthlyCount} carga${monthlyCount === 1 ? "" : "s"}`} color={C.green} loading={loading} />
        <KpiCell icon={FileText} label="Registrado" value={fmtMoney(manualTotal)} detail={sinPrecioCargas > 0 ? `${sinPrecioCargas} items sin precio` : `${entries.length} registros`} color={sinPrecioCargas > 0 ? WARN : C.blue} loading={loading} />
        <KpiCell icon={Warehouse} label="A Pañol activos" value={panolKpis.enviados} detail={`${panolKpis.itemsPendientes} items pendientes`} color={C.violet} loading={loading} />
        <KpiCell icon={AlertTriangle} label="Novedades Pañol" value={panolKpis.novedades} detail="faltantes, sin info o rechazados" color={panolKpis.novedades > 0 ? C.red : C.dim} loading={loading} />
      </div>

      {showForm && (
        <PurchaseLoadForm
          form={form}
          setForm={setForm}
          obras={obras}
          invoiceFile={invoiceFile}
          setInvoiceFile={setInvoiceFile}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={resetForm}
        />
      )}

      {view === "panol" ? (
        <PedidosPanolView
          loading={loading}
          envios={envios}
          filteredEnvios={filteredEnvios}
          selectedEnvio={selectedEnvio}
          q={q}
          setQ={setQ}
          estado={estado}
          setEstado={setEstado}
          setSelectedEnvioId={setSelectedEnvioId}
          onDelete={handleDeleteEnvio}
          onComment={handleCommentEnvio}
        />
      ) : (
        <GastoObraView
          loading={loading}
          rows={costosPorObra}
          selectedKey={selectedObraKey}
          setSelectedKey={setSelectedObraKey}
          entries={entries}
          onDeleteLog={handleDeleteLog}
          onSendLogToPanol={handleSendLogToPanol}
          onOpenBudget={(obraKey) => setBudgetModal({ obraKey })}
          onSetItemPrice={handleSetItemPrice}
          onSetManualPrice={handleSetManualItemPrice}
        />
      )}

      {panolModal && (
        <EnviarAPanolModal
          open
          profile={profile}
          prefill={panolModal.prefill || null}
          onClose={(saved) => { setPanolModal(null); if (saved) load(); }}
        />
      )}

      {budgetModal && (
        <BudgetImportModal
          candidates={budgetCandidates}
          scopeLabel={costosPorObra.find((row) => row.key === budgetModal.obraKey)?.label || "todos los pedidos"}
          saving={savingPrices}
          onClose={() => setBudgetModal(null)}
          onApply={handleApplyBudgetRows}
          onApplyManual={handleApplyManualPriceRows}
        />
      )}
    </div>
  );
}

function ViewTabs({ value, onChange }) {
  const tabs = [
    { value: "panol", label: "Pedidos a Pañol", icon: Send },
    { value: "costos", label: "Gasto por obra", icon: Layers3 },
  ];
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 3, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10 }}>
      {tabs.map((tab) => {
        const TabIcon = tab.icon;
        const v = tab.value;
        const label = tab.label;
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            className="plp-btn"
            aria-pressed={active}
            onClick={() => onChange(v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${active ? C.blueB : "transparent"}`,
              background: active ? C.blueL : "transparent",
              color: active ? C.blue : C.dim,
              borderRadius: 8,
              padding: "7px 10px",
              cursor: "pointer",
              fontFamily: C.sans,
              fontSize: 12,
              fontWeight: 850,
              whiteSpace: "nowrap",
            }}
          >
            <TabIcon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PedidosPanolView({
  loading,
  envios,
  filteredEnvios,
  selectedEnvio,
  q,
  setQ,
  estado,
  setEstado,
  setSelectedEnvioId,
  onDelete,
  onComment,
}) {
  return (
    <section style={panelStyle()}>
      <div style={sectionHeaderStyle()}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitleStyle()}>Pedidos a Pañol</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            Lo que Compras mandó, con recepción y mensajes de Pañol en el mismo lugar.
          </div>
        </div>
        <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, whiteSpace: "nowrap" }}>{filteredEnvios.length}/{envios.length}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="plp-field" style={{ ...inp({ display: "flex", alignItems: "center", gap: 8, padding: "0 11px" }), flex: "1 1 260px", minWidth: 0 }}>
          <Search size={14} style={{ color: C.dim, flexShrink: 0 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar obra, item, destino..."
            style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: C.text, fontFamily: C.sans, fontSize: 13, outline: "none", padding: "10px 0" }}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} title="Limpiar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="plp-field" style={{ ...inp(), flex: "0 0 160px", background: C.panelSolid, cursor: "pointer" }}>
          <option value="activos">Activos</option>
          <option value="enviado">Enviado</option>
          <option value="parcial">Parcial</option>
          <option value="recibido">Recibido</option>
          <option value="cancelado">Cancelado</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : filteredEnvios.length === 0 ? (
        <EmptyState text={envios.length ? "No hay pedidos a Pañol para ese filtro." : "Todavía no hay pedidos a Pañol."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 0.8fr) minmax(420px, 1.2fr)", gap: 10, minHeight: 520 }}>
          <div style={{ display: "grid", gap: 8, alignContent: "start", maxHeight: 650, overflowY: "auto", paddingRight: 3 }}>
            {filteredEnvios.map((envio) => (
              <EnvioRow
                key={envio.id}
                envio={envio}
                active={selectedEnvio?.id === envio.id}
                onClick={() => setSelectedEnvioId(envio.id)}
              />
            ))}
          </div>
          <EnvioDetail key={selectedEnvio?.id || "empty"} envio={selectedEnvio} onDelete={onDelete} onComment={onComment} />
        </div>
      )}
    </section>
  );
}

function GastoObraView({ loading, rows, selectedKey, setSelectedKey, entries, onDeleteLog, onSendLogToPanol, onOpenBudget, onSetItemPrice, onSetManualPrice }) {
  const selected = rows.find((row) => row.key === selectedKey) || rows[0] || null;

  // La lista de cargas se acota sola a la obra abierta: los logId ya vienen en
  // row.manuales, así que no hace falta un filtro aparte ni volver a consultar.
  const { visibleEntries, scoped } = useMemo(() => {
    if (!selected) return { visibleEntries: entries, scoped: false };
    const logIds = new Set((selected.manuales || EMPTY).map((m) => m.logId).filter(Boolean));
    if (!logIds.size) return { visibleEntries: EMPTY, scoped: true };
    return { visibleEntries: entries.filter((e) => logIds.has(e.id)), scoped: true };
  }, [entries, selected]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.45fr) minmax(520px, 1fr)", gap: 12, alignItems: "start" }}>
      <section style={panelStyle()}>
        <div style={sectionHeaderStyle()}>
          <div style={{ minWidth: 0 }}>
            <div style={sectionTitleStyle()}>Gasto por obra</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Entrá a cada barco, mirá los items y separá adicionales.</div>
          </div>
          {!loading && rows.length > 0 && (
            <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, whiteSpace: "nowrap" }}>{rows.length}</span>
          )}
        </div>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState text="Todavía no hay pedidos ni precios para agrupar." compact />
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 680, overflowY: "auto", paddingRight: 3 }}>
            {rows.map((row) => {
              const active = selected?.key === row.key;
              const cov = priceCoverage(row);
              return (
                <button
                  key={row.key}
                  type="button"
                  className="plp-card"
                  aria-pressed={active}
                  onClick={() => setSelectedKey(row.key)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${active ? C.blueB : C.border}`,
                    borderLeft: `3px solid ${active ? C.blue : "transparent"}`,
                    background: active ? C.blueL : C.panel,
                    color: C.text,
                    borderRadius: 11,
                    padding: 11,
                    display: "grid",
                    gap: 7,
                    cursor: "pointer",
                    fontFamily: C.sans,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</strong>
                    <ChevronRight size={14} color={active ? C.blue : C.dim} />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", color: C.dim, fontSize: 11, flexWrap: "wrap" }}>
                    <span>{row.pedidos} pedidos</span>
                    <span>{row.items.length} items</span>
                    {row.adicionalItems > 0 && <span style={{ color: C.violet }}>{row.adicionalItems} adicionales</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ color: row.ARS || row.USD ? C.green : C.dim, fontFamily: C.mono, fontSize: 14, fontWeight: 900 }}>{totalsLabel(row)}</span>
                    {cov.sinPrecio > 0 && <span style={{ color: WARN, fontSize: 11, fontWeight: 800 }}>{cov.sinPrecio} sin precio</span>}
                  </div>
                  <CoverageBar priced={cov.priced} total={cov.total} />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section style={panelStyle()}>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : !selected ? (
          <EmptyState text="Seleccioná una obra para ver el detalle." />
        ) : (
          <ObraCostDetail row={selected} onOpenBudget={onOpenBudget} onSetItemPrice={onSetItemPrice} onSetManualPrice={onSetManualPrice} />
        )}
      </section>

      <div style={{ gridColumn: "1 / -1" }}>
        <ManualLogList
          entries={visibleEntries}
          loading={loading}
          scopeLabel={scoped ? selected?.label : ""}
          onDelete={onDeleteLog}
          onSendToPanol={onSendLogToPanol}
        />
      </div>
    </div>
  );
}

// Barra fina de cobertura de precios: verde lo que ya tiene precio, cyan lo que falta.
function CoverageBar({ priced, total }) {
  if (!total) return null;
  const pct = Math.round((priced / total) * 100);
  return (
    <div style={{ height: 4, borderRadius: 99, background: WARN_SOFT, overflow: "hidden" }} title={`${priced}/${total} con precio`}>
      <div style={{ width: `${pct}%`, height: "100%", background: C.green, transition: "width .25s ease" }} />
    </div>
  );
}

const OBRA_COLS = "minmax(200px,1.5fr) 92px 84px 152px 108px";

function ObraCostDetail({ row, onOpenBudget, onSetItemPrice, onSetManualPrice }) {
  const [filtro, setFiltro] = useState("todos");
  const cov = priceCoverage(row);
  const hasAdicionales = (row.adicionales?.length || 0) > 0 || (row.adicionalItems || 0) > 0;

  const lines = useMemo(() => obraCostLines(row), [row]);
  const counts = useMemo(() => ({
    todos: lines.length,
    panol: lines.filter((l) => l.origen === "panol").length,
    carga: lines.filter((l) => l.origen === "carga").length,
    adicional: lines.filter((l) => l.origen === "adicional").length,
    sinPrecio: lines.filter((l) => l.cuentaCobertura && !l.total).length,
  }), [lines]);

  const visibles = useMemo(() => {
    if (filtro === "todos") return lines;
    if (filtro === "sinPrecio") return lines.filter((l) => l.cuentaCobertura && !l.total);
    return lines.filter((l) => l.origen === filtro);
  }, [lines, filtro]);

  // Al quedarse sin resultados (p. ej. se completaron todos los precios), el filtro
  // vuelve solo a "todos" en vez de dejar una tabla vacía sin explicación.
  const filtros = [
    ["todos", "Todos", counts.todos, C.blue],
    ["panol", "Pañol", counts.panol, C.blue],
    ["carga", "Cargas", counts.carga, C.teal],
    ["adicional", "Adicionales", counts.adicional, C.violet],
    ["sinPrecio", "Sin precio", counts.sinPrecio, WARN],
  ].filter(([key, , n]) => key === "todos" || n > 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 950 }}>{row.label}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            {row.pedidos} pedido{row.pedidos === 1 ? "" : "s"} · {lines.length} línea{lines.length === 1 ? "" : "s"} de gasto
          </div>
        </div>
        <button type="button" className="plp-btn" onClick={() => onOpenBudget(row.key)} style={primaryButton(cov.sinPrecio ? C.violet : C.blue)}>
          <Sparkles size={14} /> {cov.sinPrecio > 0 ? `Completar ${cov.sinPrecio} precio${cov.sinPrecio === 1 ? "" : "s"}` : "Cargar presupuesto"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <MiniMetric label="Total" value={totalsLabel(row)} color={C.green} />
        <MiniMetric label="Normal" value={totalsLabel({ ARS: row.baseARS, USD: row.baseUSD })} color={C.blue} />
        <MiniMetric label="Adicionales" value={hasAdicionales ? totalsLabel({ ARS: row.adicionalARS, USD: row.adicionalUSD }) : "—"} color={C.violet} />
        <MiniMetric label="Precios cargados" value={`${cov.priced}/${cov.total}`} color={cov.sinPrecio ? WARN : C.green} />
      </div>

      {/* Un solo listado para los tres orígenes de gasto, filtrable. Antes eran tres
          bloques apilados con formatos distintos y no se podían comparar. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {filtros.map(([key, label, n, color]) => {
          const active = filtro === key;
          return (
            <button
              key={key}
              type="button"
              className="plp-btn"
              aria-pressed={active}
              onClick={() => setFiltro(key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1px solid ${active ? color : C.border}`,
                background: active ? `${color}14` : C.panel,
                color: active ? color : C.dim,
                borderRadius: 999,
                padding: "5px 11px",
                cursor: "pointer",
                fontSize: 11.5,
                fontWeight: 850,
                fontFamily: C.sans,
                whiteSpace: "nowrap",
              }}
            >
              {label}
              <span style={{ fontFamily: C.mono, fontSize: 10.5, opacity: 0.8 }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: OBRA_COLS, gap: 8, padding: "9px 11px", background: C.panel, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
          <span>Item</span><span>Origen</span><span>Cantidad</span><span>Unitario</span><span>Total</span>
        </div>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {visibles.length === 0 ? (
            <EmptyState text={lines.length ? "Nada para ese filtro." : "Esta obra todavía no tiene gasto cargado."} compact />
          ) : visibles.map((line) => (
            <div
              key={line.key}
              className="plp-row"
              style={{
                display: "grid",
                gridTemplateColumns: OBRA_COLS,
                gap: 8,
                alignItems: "center",
                padding: "10px 11px",
                borderTop: `1px solid ${C.border}`,
                background: line.revisar ? WARN_SOFT : "transparent",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  <span style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.titulo}</span>
                  {line.revisar && chip(WARN, "Revisar")}
                </div>
                {line.subtitulo && (
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.subtitulo}</div>
                )}
              </div>
              {chip(line.origenColor, line.adicional && line.origen === "panol" ? "Pañol adic." : line.origenLabel)}
              <div style={{ color: C.muted, fontSize: 12 }}>{line.cantidad || "-"} {line.unidad || ""}</div>
              <InlinePriceEditor
                item={line.editable || { id: null, source: "readonly", moneda: line.total?.currency }}
                unit={line.unit}
                onSave={line.editable?.source === "log" ? onSetManualPrice : onSetItemPrice}
              />
              <div style={{ color: line.total ? C.green : line.cuentaCobertura ? WARN : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>
                {line.total ? fmtMoney(line.total.value, line.total.currency) : line.cuentaCobertura ? "Sin precio" : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InlinePriceEditor({ item, unit, onSave }) {
  // Editable tanto para items de envío a pañol como para items de carga de compra:
  // el handler que llega por onSave sabe a qué tabla escribir.
  const canEdit = Boolean(item.id) && (item.source === "panol" || item.source === "log");
  const [value, setValue] = useState(unit != null ? String(unit) : "");
  const [moneda, setMoneda] = useState(item.moneda || "ARS");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(unit != null ? String(unit) : "");
    setMoneda(item.moneda || "ARS");
  }, [unit, item.moneda]);

  if (!canEdit) {
    return (
      <div style={{ color: unit != null ? C.green : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 850 }}>
        {unit != null ? fmtMoney(unit, item.moneda) : "—"}
      </div>
    );
  }

  const draft = normalizePriceInput(value);
  const draftNum = draft === null ? null : Number(draft);
  const changed = value.trim() !== "" && draftNum !== null && draftNum !== unit;

  async function commit(nextMoneda = moneda) {
    if (saving) return;
    if (value.trim() === "" || draftNum === null) return;
    if (draftNum === unit && nextMoneda === (item.moneda || "ARS")) return;
    setSaving(true);
    try {
      await onSave?.(item.id, { precio_unitario: value, moneda: nextMoneda });
    } finally {
      setSaving(false);
    }
  }

  function toggleMoneda() {
    const next = moneda === "ARS" ? "USD" : "ARS";
    setMoneda(next);
    if (value.trim() !== "" && draftNum !== null) commit(next);
  }

  return (
    <div
      className="plp-field"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        border: `1px solid ${changed ? C.greenB : unit == null ? WARN_BORDER : C.border}`,
        background: C.panelSolid,
        borderRadius: 8,
        padding: "3px 3px 3px 8px",
        opacity: saving ? 0.6 : 1,
      }}
    >
      <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>$</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        placeholder="precio"
        inputMode="decimal"
        style={{
          flex: 1,
          minWidth: 0,
          width: "100%",
          border: "none",
          background: "transparent",
          color: unit != null ? C.green : C.text,
          fontSize: 12,
          fontFamily: C.mono,
          fontWeight: unit != null ? 850 : 500,
          outline: "none",
          padding: "3px 0",
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleMoneda}
        title="Cambiar moneda"
        style={{
          flex: "none",
          minWidth: 40,
          border: `1px solid ${C.border}`,
          background: C.panel,
          color: moneda === "USD" ? C.green : C.t1,
          borderRadius: 6,
          padding: "4px 6px",
          fontSize: 10,
          fontWeight: 800,
          fontFamily: C.sans,
          cursor: "pointer",
        }}
      >
        {moneda}
      </button>
    </div>
  );
}

function MiniMetric({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 10 }}>
      <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontFamily: C.mono, fontSize: 15, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function BudgetImportModal({ candidates, scopeLabel, saving, onClose, onApply, onApplyManual }) {
  const [mode, setMode] = useState("manual");
  const [text, setText] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  // El precio actual viene precargado: así se edita lo que ya hay en vez de
  // tener que volver a tipearlo, y "listos para aplicar" cuenta sólo lo que cambió.
  const [manualRows, setManualRows] = useState(() => [...candidates]
    .sort((a, b) => {
      const aHasPrice = a.precio_unitario !== null && a.precio_unitario !== undefined && a.precio_unitario !== "";
      const bHasPrice = b.precio_unitario !== null && b.precio_unitario !== undefined && b.precio_unitario !== "";
      return Number(aHasPrice) - Number(bHasPrice) || String(a.descripcion || "").localeCompare(String(b.descripcion || ""));
    })
    .map((item) => {
      const actual = normalizePriceInput(item.precio_unitario);
      return {
        ...item,
        precioActual: actual,
        precio_unitario: actual === null ? "" : String(actual),
        moneda: item.moneda || "ARS",
        monedaActual: item.moneda || "ARS",
      };
    }));

  const analyze = useCallback((nextText) => {
    setRows(parseBudgetText(nextText, candidates));
  }, [candidates]);

  // Analiza solo mientras se escribe/pega: no hace falta apretar "Analizar".
  useEffect(() => {
    if (mode !== "paste") return undefined;
    const id = setTimeout(() => analyze(text.trim() ? text : ""), text.trim() ? 400 : 0);
    return () => clearTimeout(id);
  }, [text, mode, analyze]);

  async function readFile(file) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateManualRow(id, patch) {
    setManualRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function manualRowChanged(row) {
    const draft = normalizePriceInput(row.precio_unitario);
    if (draft === null) return false;
    return draft !== row.precioActual || row.moneda !== row.monedaActual;
  }

  const visibleManualRows = onlyMissing ? manualRows.filter((row) => row.precioActual === null) : manualRows;
  const missingCount = manualRows.filter((row) => row.precioActual === null).length;
  const ready = rows.filter((row) => row.itemId && normalizePriceInput(row.precio_unitario) !== null).length;
  const manualReady = manualRows.filter((row) => row.id && manualRowChanged(row)).length;
  const activeReady = mode === "manual" ? manualReady : ready;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "min(1100px, 100%)", maxHeight: "90vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr auto", border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 14, boxShadow: "0 24px 70px var(--shadow-strong)" }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center", background: C.topbarSoft }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: C.violetL, color: C.violet, border: `1px solid ${C.violetB}` }}>
            <Sparkles size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Cargar precios</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Alcance: {scopeLabel}. Editá a mano o pegá el presupuesto y se analiza solo.</div>
          </div>
          <button type="button" className="plp-btn" onClick={onClose} style={iconButton(C.dim)}><X size={15} /></button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {[
            ["manual", "A mano"],
            ["paste", "Pegar presupuesto"],
          ].map(([value, label]) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                className="plp-btn"
                aria-pressed={active}
                onClick={() => setMode(value)}
                style={{
                  border: `1px solid ${active ? C.blueB : C.border}`,
                  background: active ? C.blueL : C.panel,
                  color: active ? C.blue : C.text,
                  borderRadius: 999,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                  fontFamily: C.sans,
                }}
              >
                {label}
              </button>
            );
          })}
          {mode === "manual" && missingCount > 0 && (
            <button
              type="button"
              className="plp-btn"
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((v) => !v)}
              style={{
                border: `1px solid ${onlyMissing ? WARN_BORDER : C.border}`,
                background: onlyMissing ? WARN_SOFT : C.panel,
                color: onlyMissing ? WARN : C.text,
                borderRadius: 999,
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
                fontFamily: C.sans,
              }}
            >
              Sólo sin precio ({missingCount})
            </button>
          )}
          <div style={{ marginLeft: "auto", color: C.dim, fontSize: 12 }}>
            {mode === "manual" ? "Carga directa por item" : "Detecta precios desde texto"}
          </div>
        </div>

        {mode === "manual" ? (
          <div style={{ overflowY: "auto", padding: 16 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 130px 92px", gap: 8, padding: "9px 10px", background: C.panel, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
                <span>Item</span><span>Precio unit.</span><span>Moneda</span>
              </div>
              <div style={{ maxHeight: 540, overflowY: "auto" }}>
                {visibleManualRows.length === 0 ? (
                  <EmptyState text={manualRows.length ? "Todos los items ya tienen precio." : "No hay items candidatos para cargar precios."} compact />
                ) : visibleManualRows.map((row) => {
                  const changed = manualRowChanged(row);
                  return (
                    <div key={row.id} className="plp-row" style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 130px 92px", gap: 8, alignItems: "center", padding: 10, borderTop: `1px solid ${C.border}`, background: row.precioActual === null ? WARN_SOFT : "transparent" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
                          {row.source === "log" ? chip(C.blue, "Carga") : chip(C.violet, "Pañol")}
                        </div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                          {row.obra || "Sin obra"}{row.codigo ? ` · ${row.codigo}` : ""} · {row.cantidad || "-"} {row.unidad || ""}
                        </div>
                        {row.precioActual !== null && (
                          <div style={{ color: changed ? C.dim : C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 850, marginTop: 4, textDecoration: changed ? "line-through" : "none" }}>
                            Actual: {fmtMoney(row.precioActual, row.monedaActual)}
                          </div>
                        )}
                      </div>
                      <input
                        value={row.precio_unitario}
                        onChange={(e) => updateManualRow(row.id, { precio_unitario: e.target.value })}
                        placeholder="$ unit."
                        inputMode="decimal"
                        className="plp-field"
                        style={inp({ padding: "8px 9px", fontSize: 12, fontFamily: C.mono, textAlign: "right", borderColor: changed ? C.greenB : C.border, background: C.panelSolid })}
                      />
                      <select
                        value={row.moneda}
                        onChange={(e) => updateManualRow(row.id, { moneda: e.target.value })}
                        className="plp-field"
                        style={inp({ padding: "8px 9px", background: C.panelSolid, fontSize: 12 })}
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
        <div style={{ overflowY: "auto", padding: 16, display: "grid", gridTemplateColumns: "minmax(300px, 0.8fr) minmax(480px, 1.2fr)", gap: 12 }}>
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              placeholder={"Pegá el presupuesto acá...\n20 mtrs Antirruido $ 1200\n1 INODORO Ovalado I14388 USD 45"}
              className="plp-field"
              style={inp({ resize: "vertical", minHeight: 260, fontFamily: C.mono, fontSize: 12 })}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="plp-btn" style={{ ...secondaryButton(), cursor: "pointer" }}>
                <Upload size={14} /> {fileName || "Subir TXT/CSV"}
                <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => readFile(e.target.files?.[0])} style={{ display: "none" }} />
              </label>
              {text.trim() && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12 }}>
                  <Sparkles size={13} style={{ color: C.violet }} />
                  {rows.length ? `${rows.length} línea${rows.length === 1 ? "" : "s"} detectada${rows.length === 1 ? "" : "s"}` : "Analizando..."}
                </span>
              )}
            </div>
            <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45 }}>
              Se analiza solo mientras escribís: detecta cantidad, unidad, código, moneda y precio. Si el match no es correcto, elegí el item a mano antes de aplicar.
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(210px,1.1fr) 90px 78px", gap: 8, padding: "9px 10px", background: C.panel, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
              <span>Línea detectada</span><span>Item del pedido</span><span>Precio</span><span>Moneda</span>
            </div>
            <div style={{ maxHeight: 430, overflowY: "auto" }}>
              {rows.length === 0 ? (
                <EmptyState text="Pegá o subí un texto para ver las coincidencias." compact />
              ) : rows.map((row, index) => (
                <div key={`${row.raw}-${index}`} className="plp-row" style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(210px,1.1fr) 90px 78px", gap: 8, alignItems: "center", padding: 10, borderTop: `1px solid ${C.border}`, background: row.itemId ? "transparent" : WARN_SOFT }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
                    <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{row.cantidad || "-"} {row.unidad}{row.codigo ? ` · ${row.codigo}` : ""}</div>
                  </div>
                  <select value={row.itemId} onChange={(e) => updateRow(index, { itemId: e.target.value })} className="plp-field" style={inp({ padding: "7px 8px", background: C.panelSolid, fontSize: 12, borderColor: row.itemId ? C.border : WARN_BORDER })}>
                    <option value="">Elegir item...</option>
                    {candidates.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.obra ? `${it.obra} · ` : ""}{it.descripcion}{it.codigo ? ` · ${it.codigo}` : ""}
                      </option>
                    ))}
                  </select>
                  <input value={row.precio_unitario} onChange={(e) => updateRow(index, { precio_unitario: e.target.value })} placeholder="Unit." inputMode="decimal" className="plp-field" style={inp({ padding: "7px 8px", fontSize: 12, fontFamily: C.mono, textAlign: "right" })} />
                  <select value={row.moneda} onChange={(e) => updateRow(index, { moneda: e.target.value })} className="plp-field" style={inp({ padding: "7px 8px", background: C.panelSolid, fontSize: 12 })}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <div style={{ marginRight: "auto", color: activeReady ? C.green : C.dim, fontSize: 12, fontWeight: 850 }}>
            {activeReady === 0 ? "Nada para aplicar todavía" : `${activeReady} precio${activeReady === 1 ? "" : "s"} listo${activeReady === 1 ? "" : "s"} para aplicar`}
          </div>
          <button type="button" className="plp-btn" onClick={onClose} style={secondaryButton()}>Cancelar</button>
          <button
            type="button"
            className="plp-btn"
            onClick={() => (mode === "manual" ? onApplyManual?.(manualRows.filter(manualRowChanged)) : onApply(rows))}
            disabled={saving || activeReady === 0}
            style={{ ...primaryButton(C.green), opacity: saving || activeReady === 0 ? 0.55 : 1, cursor: saving || activeReady === 0 ? "default" : "pointer" }}
          >
            {saving ? "Aplicando..." : "Aplicar precios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseLoadForm({ form, setForm, obras = EMPTY, invoiceFile, setInvoiceFile, saving, onSubmit, onCancel }) {
  const toast = useToast();
  const [bulkText, setBulkText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const items = form.items?.length ? form.items : [makePurchaseLogItem()];
  const totals = items.reduce((acc, item) => {
    const total = purchaseLogItemTotal({
      ...item,
      precio_unitario: normalizePriceInput(item.precio_unitario),
    });
    if (total) acc[total.currency] = (acc[total.currency] || 0) + total.value;
    return acc;
  }, { ARS: 0, USD: 0 });
  const itemCount = items.filter((item) => String(item.descripcion || "").trim()).length;
  const revisarCount = items.filter((item) => String(item.descripcion || "").trim() && needsPurchaseItemReview(item)).length;
  const canSave = (Boolean(form.description.trim()) || itemCount > 0) && !saving;
  const selectedObra = obras.find((obra) => obra.id === form.project_id);

  // Si el título trae un código de obra ("Sanitarios 52-23") la obra se elige
  // sola. Sólo mientras el usuario no haya tocado el select a mano.
  const obraTouched = useRef(false);
  const [autoObra, setAutoObra] = useState(false);
  useEffect(() => {
    if (obraTouched.current || form.project_id) return;
    const guessed = guessObraId(form.description, obras);
    if (!guessed) return;
    setAutoObra(true);
    setForm((f) => (f.project_id ? f : { ...f, project_id: guessed }));
  }, [form.description, form.project_id, obras, setForm]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setItems(nextItems) {
    setForm((f) => ({ ...f, items: nextItems.length ? nextItems : [makePurchaseLogItem()] }));
  }

  function updateItem(localId, patch) {
    setItems(items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function removeItem(localId) {
    setItems(items.filter((item) => item.localId !== localId));
  }

  function addItem(patch = {}) {
    setItems([...items, makePurchaseLogItem(patch)]);
  }

  function analyzeBulk(sourceText = bulkText) {
    const parsedRows = String(sourceText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parsed = parsePanolLine(line) || {};
        const row = makePurchaseLogItem({
          descripcion: parsed.descripcion || line,
          codigo: parsed.codigo || "",
          cantidad: parsed.cantidad || "",
          unidad: parsed.unidad || "unidad",
          precio_unitario: parsed.precio_unitario || "",
          moneda: parsed.moneda === "USD" ? "USD" : "ARS",
        });
        return { ...row, revisar: needsPurchaseItemReview(row) };
      });
    if (!parsedRows.length) return;
    const current = items.filter((item) => String(item.descripcion || "").trim());
    setItems([...current, ...parsedRows]);
    setBulkText("");
  }

  async function handleReceiptPhoto(file) {
    if (!file) return;
    setOcrLoading(true);
    try {
      const base64 = await fileToBase64Payload(file);
      if (!base64) throw new Error("Archivo vacio");
      const mimeType = mimeTypeForFile(file);
      const { data, error } = await supabase.functions.invoke("extraer-comprobante", {
        body: { image_base64: base64, mime_type: mimeType, filename: file.name },
      });
      if (error) throw new Error(await readFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      const foundItems = Array.isArray(data?.items) ? data.items : [];
      if (!foundItems.length) {
        toast.error("No pude leer el comprobante, probá con otra foto/PDF o cargá a mano");
        return;
      }
      const parsedRows = foundItems.map((it) => {
        const row = makePurchaseLogItem({
          descripcion: it.descripcion || "Item sin descripcion",
          codigo: "",
          cantidad: it.cantidad ?? "",
          unidad: "unidad",
          precio_unitario: it.precio_unitario ?? "",
          moneda: it.moneda === "USD" ? "USD" : "ARS",
        });
        return { ...row, revisar: needsPurchaseItemReview(row) };
      });
      const current = items.filter((item) => String(item.descripcion || "").trim());
      setItems([...current, ...parsedRows]);
      toast.success(`${parsedRows.length} item${parsedRows.length === 1 ? "" : "s"} detectado${parsedRows.length === 1 ? "" : "s"} del comprobante.`);
    } catch (err) {
      const detail = err?.message ? `: ${err.message}` : "";
      toast.error(`No pude leer el comprobante${detail}`);
    } finally {
      setOcrLoading(false);
    }
  }

  const labelStyle = {
    color: C.dim,
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  };
  const inputLabel = { display: "grid", gap: 6, alignContent: "start" };

  return (
    <form onSubmit={onSubmit} style={{ ...panelStyle(), display: "grid", gap: 14 }}>
      <div style={sectionHeaderStyle()}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitleStyle()}>Cargar compra</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            Presupuesto, remito o factura con items; lo dudoso queda marcado para revisar.
          </div>
        </div>
        <button type="button" className="plp-btn" onClick={onCancel} style={iconButton(C.dim)}><X size={14} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.3fr) minmax(180px, 0.8fr) minmax(150px, 0.6fr) minmax(200px, 0.9fr)", gap: 10 }}>
        <label style={inputLabel}>
          <span style={labelStyle}>Título / descripción</span>
          <input value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Ej: Sanitarios 52-23" className="plp-field" style={inp({ background: C.panelSolid, fontWeight: 750 })} />
        </label>
        <label style={inputLabel}>
          <span style={labelStyle}>Proveedor</span>
          <input value={form.provider} onChange={(e) => setField("provider", e.target.value)} placeholder="Proveedor" className="plp-field" style={inp({ background: C.panelSolid })} />
        </label>
        <label style={inputLabel}>
          <span style={labelStyle}>Fecha</span>
          <input value={form.purchased_at} onChange={(e) => setField("purchased_at", e.target.value)} type="date" className="plp-field" style={inp({ background: C.panelSolid })} />
        </label>
        <label style={inputLabel}>
          <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
            Obra / barco
            {autoObra && <span style={{ color: C.blue, fontSize: 9, fontWeight: 900 }}>· detectada</span>}
          </span>
          <select
            value={form.project_id || ""}
            onChange={(e) => { obraTouched.current = true; setAutoObra(false); setField("project_id", e.target.value); }}
            className="plp-field"
            style={inp({ background: C.panelSolid, cursor: "pointer", borderColor: autoObra ? C.blueB : C.border })}
          >
            <option value="">Sin obra (gasto general)</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}{o.descripcion ? ` - ${o.descripcion}` : ""}</option>)}
          </select>
        </label>
      </div>

      <label style={inputLabel}>
        <span style={labelStyle}>Notas</span>
        <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Notas internas (opcional)" rows={2} className="plp-field" style={inp({ resize: "vertical", minHeight: 48, background: C.panelSolid })} />
      </label>

      <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Items</span>
              {revisarCount > 0 && chip(WARN, `${revisarCount} a revisar`)}
            </div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Total: {fmtMoney(totals.ARS, "ARS")}{totals.USD > 0 ? ` · ${fmtMoney(totals.USD, "USD")}` : ""}</div>
          </div>
          <button type="button" className="plp-btn" onClick={() => addItem()} style={secondaryButton()}><Plus size={14} /> Agregar item</button>
        </div>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden", minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.3fr) 100px 90px 90px 116px 80px 36px", gap: 8, padding: "9px 10px", background: C.panelSolid, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
            <span>Descripción</span><span>Código</span><span>Cantidad</span><span>Unidad</span><span>Precio unit.</span><span>Moneda</span><span />
          </div>
          {items.map((item) => {
            const revisar = needsPurchaseItemReview(item);
            const empty = !String(item.descripcion || "").trim();
            return (
              <div key={item.localId} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.3fr) 100px 90px 90px 116px 80px 36px", gap: 8, alignItems: "center", padding: 10, borderTop: `1px solid ${C.border}`, background: revisar && !empty ? WARN_SOFT : C.panel }}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <input value={item.descripcion} onChange={(e) => updateItem(item.localId, { descripcion: e.target.value })} placeholder="Descripción del item" className="plp-field" style={inp({ padding: "8px 9px", background: C.panelSolid, fontWeight: 750 })} />
                  {revisar && !empty && <span style={{ justifySelf: "start", color: WARN, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Revisar</span>}
                </div>
                <input value={item.codigo || ""} onChange={(e) => updateItem(item.localId, { codigo: e.target.value })} placeholder="Código" className="plp-field" style={inp({ padding: "8px 9px", background: C.panelSolid, fontSize: 12 })} />
                <input value={item.cantidad || ""} onChange={(e) => updateItem(item.localId, { cantidad: e.target.value })} placeholder="Cant." inputMode="decimal" className="plp-field" style={inp({ padding: "8px 9px", background: C.panelSolid, fontSize: 12, fontFamily: C.mono })} />
                <input value={item.unidad || ""} onChange={(e) => updateItem(item.localId, { unidad: e.target.value })} placeholder="unidad" className="plp-field" style={inp({ padding: "8px 9px", background: C.panelSolid, fontSize: 12 })} />
                <input value={item.precio_unitario || ""} onChange={(e) => updateItem(item.localId, { precio_unitario: e.target.value })} placeholder="$ unit." inputMode="decimal" className="plp-field" style={inp({ padding: "8px 9px", background: C.panelSolid, fontSize: 12, fontFamily: C.mono, textAlign: "right" })} />
                <select value={item.moneda || "ARS"} onChange={(e) => updateItem(item.localId, { moneda: e.target.value })} className="plp-field" style={inp({ padding: "8px 7px", background: C.panelSolid, fontSize: 12 })}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <button type="button" className="plp-btn" onClick={() => removeItem(item.localId)} style={iconButton(C.red)} title="Quitar item"><X size={13} /></button>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Pegar presupuesto / remito / factura</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Una línea por item. También acepta: DESCRIP | CODIGO | CANT | UNIDAD | $PRECIO.</div>
        </div>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          onPaste={(e) => {
            // Pegar ya carga los items: no hace falta apretar "Analizar" después.
            const pasted = e.clipboardData?.getData("text") || "";
            if (!pasted.includes("\n")) return;
            e.preventDefault();
            analyzeBulk(pasted);
          }}
          rows={5}
          placeholder={"20 mtrs Antirruido\nINODORO Ovalado | I14388 | 1 | unidad | $120.000"}
          className="plp-field"
          style={inp({ resize: "vertical", minHeight: 110, background: C.panelSolid, fontFamily: C.mono, fontSize: 12 })}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ marginRight: "auto", color: C.dim, fontSize: 11 }}>Al pegar varias líneas se cargan solas.</span>
          <label className="plp-btn" style={{ ...secondaryButton(), cursor: ocrLoading ? "default" : "pointer", opacity: ocrLoading ? 0.65 : 1 }}>
            <ImagePlus size={14} /> {ocrLoading ? "Leyendo comprobante..." : "Subir comprobante"}
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              disabled={ocrLoading}
              onChange={(e) => {
                handleReceiptPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
          <button type="button" className="plp-btn" onClick={() => analyzeBulk()} disabled={!bulkText.trim()} style={{ ...primaryButton(C.violet), opacity: bulkText.trim() ? 1 : 0.55 }}>
            <Sparkles size={14} /> Analizar
          </button>
        </div>
      </section>

      <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>Resumen</div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 850, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · {selectedObra?.codigo || "Sin obra"} · {fmtMoney(totals.ARS, "ARS")}{totals.USD > 0 ? ` · ${fmtMoney(totals.USD, "USD")}` : ""}
          </div>
          {revisarCount > 0 && (
            <div style={{ color: WARN, fontSize: 11, fontWeight: 800, marginTop: 3 }}>
              {revisarCount} item{revisarCount === 1 ? "" : "s"} sin cantidad o precio — se guardan igual, marcados para revisar.
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <label className="plp-btn" style={{ ...secondaryButton(), cursor: "pointer", maxWidth: 260 }}>
            <ImagePlus size={14} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invoiceFile ? invoiceFile.name : "Adjuntar factura"}</span>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setInvoiceFile(e.target.files[0])} style={{ display: "none" }} />
          </label>
          {invoiceFile && <button type="button" className="plp-btn" onClick={() => setInvoiceFile(null)} style={{ ...secondaryButton(), color: C.red }}>Quitar</button>}
          <button type="submit" className="plp-btn" disabled={!canSave} style={{ ...primaryButton(C.green), opacity: canSave ? 1 : 0.55, cursor: canSave ? "pointer" : "default" }}>
            {saving ? "Guardando..." : <><Upload size={14} /> Guardar carga</>}
          </button>
        </div>
      </div>
    </form>
  );
}


function EnvioRow({ envio, active, onClick }) {
  const resumen = resumenItems(envio.items || EMPTY);
  const meta = ENVIO_ESTADO_META[envio.estado] ?? { label: envio.estado, color: C.dim };
  const totals = envioTotals(envio);
  return (
    <button type="button" className="plp-card" aria-pressed={active} onClick={onClick} style={{
      textAlign: "left",
      border: `1px solid ${active ? C.blueB : C.border}`,
      borderLeft: `4px solid ${meta.color}`,
      background: active ? C.blueL : C.panelSolid,
      borderRadius: 11,
      padding: 11,
      cursor: "pointer",
      fontFamily: C.sans,
      color: C.text,
      display: "grid",
      gap: 8,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{envio.titulo}</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{envio.obra?.codigo || envio.destino || "Sin obra/destino"} · {envio.sede}</div>
        </div>
        {chip(meta.color, meta.label)}
      </div>
      <Progress resumen={resumen} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: C.dim, fontSize: 11 }}>
        <span>{fmtDate(envio.created_at)}</span>
        <span style={{ color: totals.ARS || totals.USD ? C.green : C.dim, fontFamily: C.mono, fontWeight: 800 }}>{totalsLabel(totals)}</span>
      </div>
    </button>
  );
}

function EnvioDetail({ envio, onDelete, onComment }) {
  const [comment, setComment] = useState("");

  if (!envio) return <EmptyState text="Selecciona un pedido para ver el detalle." />;
  const resumen = resumenItems(envio.items || EMPTY);
  const totals = envioTotals(envio);
  const meta = ENVIO_ESTADO_META[envio.estado] ?? { label: envio.estado, color: C.dim };

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    await onComment?.(envio, text);
    setComment("");
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: 13, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>{envio.titulo}</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
              {envio.obra?.codigo || envio.destino || "Sin obra/destino"} · {envio.sede} · {fmtDateTime(envio.created_at)}
            </div>
          </div>
          {chip(meta.color, meta.label)}
          <button type="button" className="plp-btn" onClick={() => onDelete(envio)} title="Borrar pedido a Pañol" style={iconButton(C.red)}>
            <Trash2 size={14} />
          </button>
        </div>
        <Progress resumen={resumen} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: C.dim, fontSize: 12 }}>
          <span><strong style={{ color: C.green }}>{totalsLabel(totals)}</strong></span>
          {totals.sinPrecio > 0 && <span style={{ color: WARN }}>{totals.sinPrecio} items sin precio</span>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", maxHeight: 480, overflowY: "auto" }}>
        {(envio.items || EMPTY).map((item) => {
          const itemMoney = itemTotal(item);
          return (
            <div key={item.id} className="plp-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px 92px", gap: 9, alignItems: "center", padding: "9px 13px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                  {item.cantidad || "-"} {item.unidad || ""}{item.codigo ? ` · ${item.codigo}` : ""}{item.nota ? ` · ${item.nota}` : ""}
                </div>
              </div>
              <StatusMini estado={item.estado} />
              <div style={{ color: itemMoney ? C.green : C.dim, fontFamily: C.mono, fontSize: 11, fontWeight: 800, textAlign: "right" }}>
                {itemMoney ? fmtMoney(itemMoney.value, itemMoney.currency) : "-"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 13, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.text, fontSize: 13, fontWeight: 900 }}>
          <MessageSquare size={15} style={{ color: C.blue }} />
          Mensajes y seguimiento
          <span style={{ marginLeft: "auto", color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{envio.eventos?.length || 0}</span>
        </div>
        {(envio.eventos || EMPTY).length === 0 ? (
          <div style={{ color: C.dim, fontSize: 12 }}>Sin mensajes todavía.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 210, overflowY: "auto" }}>
            {(envio.eventos || EMPTY).slice(0, 10).map((ev) => <EventLine key={ev.id} ev={ev} />)}
          </div>
        )}
        <div style={{ display: "grid", gap: 7 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Escribir mensaje para Pañol / Compras..."
            className="plp-field"
            style={inp({ resize: "vertical", minHeight: 54, fontSize: 12 })}
          />
          <button type="button" className="plp-btn" onClick={sendComment} disabled={!comment.trim()} style={{ ...primaryButton(C.green), justifySelf: "end", opacity: comment.trim() ? 1 : 0.55, cursor: comment.trim() ? "pointer" : "default" }}>
            <MessageSquare size={14} /> Comentar
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusMini({ estado }) {
  const meta = ITEM_ESTADO_META[estado] ?? ITEM_ESTADO_META.pendiente;
  return (
    <span style={{ justifySelf: "start", color: meta.color, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function EventLine({ ev }) {
  if (ev.tipo === "comentario") {
    return (
      <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 9, padding: "8px 9px" }}>
        <div style={{ color: C.text, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{ev.nota}</div>
        <div style={{ color: C.dim, fontSize: 10, fontFamily: C.mono, marginTop: 4 }}>{ev.actor?.username ? `${ev.actor.username} · ` : ""}{fmtDateTime(ev.created_at)}</div>
      </div>
    );
  }
  const color = ITEM_ESTADO_META[ev.estado_nuevo]?.color || C.blue;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "9px 1fr", gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, marginTop: 4 }} />
      <div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          {ev.tipo === "item_estado"
            ? `${ITEM_ESTADO_META[ev.estado_anterior]?.label || ev.estado_anterior} -> ${ITEM_ESTADO_META[ev.estado_nuevo]?.label || ev.estado_nuevo}`
            : ev.tipo === "creado" ? "Pedido creado"
            : ev.tipo === "estado" ? `Pedido -> ${ENVIO_ESTADO_META[ev.estado_nuevo]?.label || ev.estado_nuevo}`
            : ev.tipo}
        </div>
        {ev.nota && <div style={{ color: C.dim, fontSize: 11 }}>{ev.nota}</div>}
        <div style={{ color: C.dim, fontSize: 10, fontFamily: C.mono }}>{ev.actor?.username ? `${ev.actor.username} · ` : ""}{fmtDateTime(ev.created_at)}</div>
      </div>
    </div>
  );
}

function ManualLogList({ entries, loading, scopeLabel, onDelete, onSendToPanol }) {
  return (
    <section style={panelStyle()}>
      <div style={sectionHeaderStyle()}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitleStyle()}>Cargas de compra{scopeLabel ? ` · ${scopeLabel}` : ""}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            {scopeLabel ? "Sólo las cargas de la obra abierta." : "Presupuestos, remitos y facturas cargadas por items."}
          </div>
        </div>
        {!loading && entries.length > 0 && (
          <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, whiteSpace: "nowrap" }}>{entries.length}</span>
        )}
      </div>
      {loading ? (
        <ListSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <EmptyState text={scopeLabel ? "Esta obra no tiene cargas de compra." : "No hay cargas de compra registradas."} compact />
      ) : (
        <div style={{ display: "grid", gap: 7, maxHeight: 360, overflowY: "auto", paddingRight: 3 }}>
          {entries.map((entry) => {
            // El monto que se muestra sale de los items (ARS + USD), no del
            // header: así una carga con precios cargados nunca dice "Sin monto".
            const totals = purchaseLogEntryTotals(entry);
            const hasMoney = totals.ARS > 0 || totals.USD > 0;
            return (
              <div key={entry.id} className="plp-card" style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 10, display: "grid", gap: 5 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</div>
                    <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                      {entry.provider || "Sin proveedor"} · {fmtDate(entry.purchased_at)} · {usernameOf(entry.creator)}
                      {entry.items?.length ? ` · ${entry.items.length} item${entry.items.length === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  {entry.items?.length > 0 && (
                    <button type="button" className="plp-btn" onClick={() => onSendToPanol?.(entry)} style={secondaryButton()} title="Enviar a Pañol">
                      <Send size={13} /> Enviar a Pañol
                    </button>
                  )}
                  <button
                    type="button"
                    className="plp-btn"
                    onClick={() => onDelete(entry.id)}
                    style={{ ...secondaryButton(), color: C.red, borderColor: `${C.red}55` }}
                    title="Borrar carga"
                  >
                    <Trash2 size={13} /> Borrar
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ color: hasMoney ? C.green : C.dim, fontFamily: C.mono, fontSize: 13, fontWeight: 850 }}>
                      {hasMoney ? totalsLabel(totals) : "Sin monto"}
                    </span>
                    {totals.sinPrecio > 0 && <span style={{ color: WARN, fontSize: 11, fontWeight: 800 }}>{totals.sinPrecio} sin precio</span>}
                  </span>
                  {entry.invoice_url && (
                    <a href={entry.invoice_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontSize: 11, fontWeight: 800 }}>
                      Factura
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Placeholder de carga con la misma silueta que las tarjetas reales, para que la
// pantalla no salte cuando llegan los datos.
function ListSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 11, padding: 11, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width={62} height={16} radius={99} style={{ marginLeft: "auto" }} />
          </div>
          <Skeleton width="100%" height={6} radius={99} />
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton width={70} height={11} />
            <Skeleton width={90} height={11} style={{ marginLeft: "auto" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text, compact = false }) {
  return (
    <div style={{
      border: `1px dashed ${C.border2}`,
      background: C.panel,
      borderRadius: 12,
      padding: compact ? 18 : 30,
      color: C.dim,
      display: "grid",
      justifyItems: "center",
      gap: 8,
      textAlign: "center",
      fontSize: 13,
    }}>
      <PackageCheck size={compact ? 20 : 28} style={{ color: C.border2 }} />
      {text}
    </div>
  );
}

function panelStyle() {
  return {
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    borderRadius: 13,
    padding: 14,
    minWidth: 0,
  };
}

function sectionHeaderStyle() {
  return { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 };
}

function sectionTitleStyle() {
  return { color: C.text, fontSize: 14, fontWeight: 900 };
}

function primaryButton(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${color}40`,
    background: `${color}14`,
    color,
    borderRadius: 9,
    padding: "9px 13px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 850,
    fontFamily: C.sans,
  };
}

function secondaryButton() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    color: C.text,
    borderRadius: 9,
    padding: "9px 13px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
    fontFamily: C.sans,
  };
}

function iconButton(color) {
  return {
    width: 29,
    height: 29,
    display: "grid",
    placeItems: "center",
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    color,
    borderRadius: 8,
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  };
}

function inp(over = {}) {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    background: C.panel,
    color: C.text,
    padding: "10px 11px",
    fontSize: 13,
    fontFamily: C.sans,
    outline: "none",
    ...over,
  };
}
