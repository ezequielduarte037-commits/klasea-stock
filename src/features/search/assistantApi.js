import { supabase } from "@/supabaseClient";

const MAX_CONTEXT_ITEMS = 24;
const MAX_HISTORY_ITEMS = 6;
const PURCHASE_STATUSES = ["nuevo", "en_revision", "cotizando", "comprado", "recibido", "cancelado"];
const PURCHASE_COUNTS_TTL_MS = 30_000;
let purchaseCountsCache = { expiresAt: 0, value: null };

const ASSISTANT_SECTIONS_BY_ROLE = {
  admin: ["obras", "materiales", "compras", "solicitudes"],
  tecnica: ["obras", "materiales", "compras", "solicitudes"],
  compras: ["materiales", "compras", "solicitudes"],
  panol: ["materiales", "compras", "solicitudes"],
};

function assistantRole(profile) {
  if (profile?.is_admin || profile?.role === "admin") return "admin";
  return String(profile?.role || "").trim().toLowerCase();
}

export function canUseKlaseaAssistant(profile) {
  return Object.hasOwn(ASSISTANT_SECTIONS_BY_ROLE, assistantRole(profile));
}

function text(value, maxLength = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Math.round(number(value) * 1000) / 1000;
}

function purchaseCountIntent(question) {
  const value = normalized(question);
  const mentionsPurchases = /(^| )(pedido|pedidos|compra|compras|solicitud|solicitudes)( |$)/.test(value);
  const asksForCount = /(^| )(cuanto|cuantos|cuanta|cuantas|cantidad|total|totales|hay|resumen)( |$)/.test(value);
  return mentionsPurchases && asksForCount;
}

async function purchaseStatusCounts() {
  if (purchaseCountsCache.value && purchaseCountsCache.expiresAt > Date.now()) {
    return purchaseCountsCache.value;
  }
  const results = await Promise.all(PURCHASE_STATUSES.map(async (status) => {
    const { count, error } = await supabase
      .from("purchase_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw error;
    return [status, Number(count) || 0];
  }));
  const value = Object.fromEntries(results);
  purchaseCountsCache = { value, expiresAt: Date.now() + PURCHASE_COUNTS_TTL_MS };
  return value;
}

async function directPurchaseCountAnswer(question) {
  if (!purchaseCountIntent(question)) return null;
  const counts = await purchaseStatusCounts();
  const pendingManagement = counts.nuevo + counts.en_revision + counts.cotizando;
  const open = pendingManagement + counts.comprado;
  const total = open + counts.recibido + counts.cancelado;
  const intent = normalized(question);

  let answer;
  if (/(^| )(pendiente|pendientes|abierto|abiertos)( |$)/.test(intent)) {
    answer = `Compras tiene ${pendingManagement} pedido${pendingManagement === 1 ? "" : "s"} pendiente${pendingManagement === 1 ? "" : "s"} de gestión: ${counts.nuevo} nuevo${counts.nuevo === 1 ? "" : "s"}, ${counts.en_revision} en revisión y ${counts.cotizando} cotizando. Además hay ${counts.comprado} comprado${counts.comprado === 1 ? "" : "s"} esperando recepción. Total abierto: ${open}.`;
  } else if (/(^| )(comprado|comprados|recibir|recepcion)( |$)/.test(intent)) {
    answer = `Hay ${counts.comprado} pedido${counts.comprado === 1 ? " comprado" : "s comprados"} esperando recepción o cierre.`;
  } else if (/(^| )(nuevo|nuevos)( |$)/.test(intent)) {
    answer = `Hay ${counts.nuevo} pedido${counts.nuevo === 1 ? " nuevo" : "s nuevos"} esperando revisión.`;
  } else if (/(^| )(cotizando|cotizacion)( |$)/.test(intent)) {
    answer = `Hay ${counts.cotizando} pedido${counts.cotizando === 1 ? "" : "s"} en cotización.`;
  } else {
    answer = `Hay ${open} pedidos abiertos en Compras y ${total} pedidos en total. Abiertos: ${counts.nuevo} nuevos, ${counts.en_revision} en revisión, ${counts.cotizando} cotizando y ${counts.comprado} comprados esperando recepción.`;
  }

  return {
    answer,
    model: "klasea/compras",
    links: [{ label: "Abrir pendientes de Compras", path: "/compras?tab=pendientes" }],
  };
}

function stockSummary(rows = [], rowDelta, rowIsTransit) {
  let total = 0;
  let inTransit = 0;
  const bySede = new Map();
  rows.forEach((row) => {
    if (rowIsTransit(row)) {
      inTransit += number(row.cantidad);
      return;
    }
    const delta = rowDelta(row);
    total += delta;
    if (Math.abs(delta) <= 0.0001) return;
    const sede = text(row.stock_sede || row.panol_envio?.sede || "Sin sede", 80);
    bySede.set(sede, (bySede.get(sede) || 0) + delta);
  });
  return {
    stockTotal: roundQty(total),
    stockInTransit: roundQty(inTransit),
    stockBySede: [...bySede.entries()]
      .map(([sede, quantity]) => ({ sede, quantity: roundQty(quantity) }))
      .filter((row) => Math.abs(row.quantity) > 0.0001)
      .sort((a, b) => b.quantity - a.quantity),
  };
}

async function stockByMaterial(groups = []) {
  const materials = groups
    .find((group) => group?.key === "materiales")
    ?.items?.slice(0, 8) || [];
  if (!materials.length) return new Map();
  const { rowDelta, rowIsTransit } = await import("@/features/panol/panolMovimientos");
  const ids = materials.map((item) => item.id).filter(Boolean);
  const encodedIds = ids.join(",");
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("material_id,requisito_material_id,estado,recepcion_estado,cantidad,cantidad_egresada,source,stock_sede,stock_nota,notas,recepcion_nota,egreso_nota")
    .in("estado", ["en_panol", "recibido", "parcial", "problema"])
    .or(`material_id.in.(${encodedIds}),requisito_material_id.in.(${encodedIds})`)
    .limit(5000);
  if (error) throw error;

  return new Map(ids.map((id) => {
    const rows = (data || []).filter((row) => row.material_id === id || row.requisito_material_id === id);
    return [id, stockSummary(rows, rowDelta, rowIsTransit)];
  }));
}

async function buildContext(groups = [], profile) {
  const role = assistantRole(profile);
  const allowedSections = new Set(ASSISTANT_SECTIONS_BY_ROLE[role] || []);
  const canOpenStock = ["admin", "tecnica", "panol"].includes(role);
  const materialStock = await stockByMaterial(groups);
  return groups
    .filter((group) => allowedSections.has(group?.key))
    .flatMap((group) => (group?.items || []).map((item) => ({
      id: text(item?.id, 80),
      section: text(group.key, 40),
      title: text(item?.title),
      detail: text(item?.subtitle),
      meta: text(item?.meta, 140),
      status: text(item?.status, 60),
      path: text(item?.path, 300),
      stockPath: canOpenStock ? text(item?.stockPath, 400) : "",
      unit: text(item?.unit, 40),
      location: text(item?.location, 140),
      ...(materialStock.get(item?.id) || {}),
    })))
    .slice(0, MAX_CONTEXT_ITEMS);
}

function normalized(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOCK_WORDS = new Set(["hay", "stock", "disponible", "disponibles", "existencia", "existencias", "queda", "quedan", "tenemos", "tengo", "cuanto", "cuantos", "cantidad", "en", "el", "la", "los", "las", "de"]);

function questionTokens(question) {
  return normalized(question).split(" ").filter((token) => token.length > 1 && !STOCK_WORDS.has(token));
}

function tokenVariants(token) {
  const values = new Set([token]);
  if (token.length > 4 && token.endsWith("es")) values.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) values.add(token.slice(0, -1));
  return [...values];
}

function contextMatchScore(item, tokens) {
  const haystack = ` ${normalized(`${item.title || ""} ${item.detail || ""}`)} `;
  return tokens.reduce((score, token) => {
    const found = tokenVariants(token).some((variant) => haystack.includes(` ${variant} `) || haystack.includes(variant));
    return score + (found ? (/^\d+$/.test(token) ? 3 : 1) : 0);
  }, 0);
}

function fmtQty(value) {
  return roundQty(value).toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

function stockResultLine(item) {
  const total = number(item.stockTotal);
  const unit = item.unit || "unidad";
  const bySede = (item.stockBySede || [])
    .filter((row) => number(row.quantity) > 0.0001)
    .map((row) => `${row.sede}: ${fmtQty(row.quantity)}`)
    .join(" · ");
  const details = [bySede, item.location ? `Ubicación: ${item.location}` : ""].filter(Boolean).join(" · ");
  if (total < -0.0001) return `${item.title}: saldo ${fmtQty(total)} ${unit}; requiere conciliación.${details ? ` ${details}.` : ""}`;
  if (total <= 0.0001) return `${item.title}: sin stock disponible.`;
  return `${item.title}: ${fmtQty(total)} ${unit} en stock.${details ? ` ${details}.` : ""}`;
}

function directStockAnswer(question, context) {
  const intent = normalized(question);
  if (!/(^| )(stock|hay|disponible|disponibles|existencia|existencias|queda|quedan|tenemos|tengo|cantidad|cuanto|cuantos)( |$)/.test(intent)) return null;
  const materials = context.filter((item) => item.section === "materiales" && Number.isFinite(Number(item.stockTotal)));
  if (!materials.length) return null;

  const tokens = questionTokens(question);
  const ranked = materials.map((item) => ({ item, score: contextMatchScore(item, tokens) })).sort((a, b) => b.score - a.score);
  const bestScore = ranked[0]?.score || 0;
  const selected = ranked.filter((entry) => entry.score >= Math.max(1, bestScore - 1)).slice(0, 6).map((entry) => entry.item);
  if (!selected.length) return null;

  const available = selected.filter((item) => number(item.stockTotal) > 0.0001);
  const opening = available.length
    ? selected.length === 1 ? "Sí, hay stock disponible." : `Sí. Encontré stock en ${available.length} de ${selected.length} coincidencias:`
    : selected.length === 1 ? "No figura stock físico disponible para ese producto." : "No figura stock físico disponible en las coincidencias más cercanas:";
  return {
    answer: [opening, ...selected.map(stockResultLine)].join("\n"),
    model: "klasea/stock",
    links: selected.map((item) => ({
      label: `Ver ${item.title}`,
      path: item.stockPath || item.path || "/stock-panol",
    })),
  };
}

function buildHistory(messages = []) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message?.role) && message?.content)
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => ({
      role: message.role,
      content: text(message.content, 900),
    }));
}

export async function askKlaseaAssistant({ question, groups = [], messages = [], profile }) {
  if (!canUseKlaseaAssistant(profile)) {
    throw new Error("Tu rol no tiene habilitado el asistente de Klase A.");
  }
  const purchaseCountAnswer = await directPurchaseCountAnswer(question);
  if (purchaseCountAnswer) return purchaseCountAnswer;
  const context = await buildContext(groups, profile);
  const directAnswer = directStockAnswer(question, context);
  if (directAnswer) return directAnswer;
  const payload = {
    question: text(question, 600),
    context,
    history: buildHistory(messages),
  };

  const { data, error } = await supabase.functions.invoke("asistente-klasea", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.answer) throw new Error("El asistente no devolvió una respuesta.");
  return data;
}
