import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
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
  Send,
  Sparkles,
  Store,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import {
  createPurchaseLog,
  deletePurchaseLog,
  fetchAdditionalBoards,
  fetchAdditionalItems,
  fetchProjects,
  fetchPurchaseLog,
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
import EnviarAPanolModal, { parsePanolLine } from "@/features/panol/EnviarAPanolModal";
import { C } from "@/theme";

const EMPTY = [];

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

function itemTotal(item) {
  const price = Number(item.precio_unitario);
  if (!Number.isFinite(price)) return null;
  return {
    currency: item.moneda || "ARS",
    value: price * numericQty(item.cantidad),
  };
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

function StatCard({ icon: IconComponent, label, value, detail, color }) {
  const icon = IconComponent ? <IconComponent size={16} /> : null;
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 12,
      padding: 14,
      display: "flex",
      gap: 11,
      alignItems: "center",
      minWidth: 0,
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        display: "grid",
        placeItems: "center",
        background: `${color}14`,
        border: `1px solid ${color}35`,
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontFamily: C.mono, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{value}</div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 850, marginTop: 4 }}>{label}</div>
        {detail && <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>}
      </div>
    </div>
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

function costKeyFromEnvio(envio) {
  const label = envio.obra?.codigo || envio.destino || "Sin obra/destino";
  return normalizeSearch(label) || "sin-obra";
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
    const key = costKeyFromEnvio(envio);
    const label = envio.obra?.codigo || envio.destino || "Sin obra/destino";
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
    const amount = Number(entry.amount);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    row.manuales.push({
      id: entry.id,
      description: entry.description,
      provider: entry.provider || "",
      amount: hasAmount ? amount : null,
      fecha: entry.purchased_at,
    });
    if (hasAmount) {
      row.ARS = (row.ARS || 0) + amount;
      row.baseARS += amount;
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
  const [panolModal, setPanolModal] = useState(false);
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
    amount: "",
    provider: "",
    notes: "",
    project_id: "",
    purchased_at: new Date().toISOString().slice(0, 10),
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
    setForm({ description: "", amount: "", provider: "", notes: "", project_id: "", purchased_at: new Date().toISOString().slice(0, 10) });
    setInvoiceFile(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) return;
    if (String(form.amount || "").trim() && !(Number(form.amount) > 0)) {
      toast.warning("Si cargas un monto, tiene que ser mayor a 0.");
      return;
    }
    setSaving(true);
    try {
      let invoice_url;
      let invoice_path;
      if (invoiceFile) {
        const r = await uploadPurchaseLogInvoice(invoiceFile, profile.id);
        invoice_url = r.url;
        invoice_path = r.path;
      }
      await createPurchaseLog({
        description: form.description.trim(),
        amount: form.amount ? Number(form.amount) : null,
        provider: form.provider.trim() || null,
        notes: form.notes.trim() || null,
        project_id: form.project_id || null,
        purchased_at: form.purchased_at || new Date().toISOString().slice(0, 10),
        invoice_url: invoice_url || null,
        invoice_path: invoice_path || null,
      });
      toast.success("Compra registrada");
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
      title: "Eliminar registro",
      message: "Esto borra la compra manual del log.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePurchaseLog(id);
      toast.success("Registro eliminado");
      load();
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar el registro.");
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

  async function handleApplyBudgetRows(rows) {
    const toApply = rows
      .map((row) => ({ ...row, precio: normalizePriceInput(row.precio_unitario) }))
      .filter((row) => row.itemId && row.precio !== null);

    if (!toApply.length) {
      toast.warning("No hay precios listos para aplicar.");
      return;
    }

    setSavingPrices(true);
    try {
      for (const row of toApply) {
        await updateEnvioItemPrice(row.itemId, {
          precio_unitario: row.precio,
          moneda: row.moneda,
        });
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

  async function handleApplyManualPriceRows(rows) {
    const toApply = rows
      .map((row) => ({ ...row, precio: normalizePriceInput(row.precio_unitario) }))
      .filter((row) => row.id && row.precio !== null);

    if (!toApply.length) {
      toast.warning("No hay precios listos para aplicar.");
      return;
    }

    setSavingPrices(true);
    try {
      for (const row of toApply) {
        await updateEnvioItemPrice(row.id, {
          precio_unitario: row.precio,
          moneda: row.moneda,
        });
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

  const thisMonth = entries.filter((e) => {
    const d = new Date(e.purchased_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const manualTotal = entries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthlyTotal = thisMonth.reduce((s, e) => s + Number(e.amount || 0), 0);

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

  const gastoPorObra = costosPorObra.slice(0, 8);

  const budgetCandidates = useMemo(() => {
    const rows = budgetModal?.obraKey
      ? (costosPorObra.find((row) => row.key === budgetModal.obraKey)?.items || EMPTY)
      : costosPorObra.flatMap((row) => row.items);
    return rows.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      codigo: item.codigo,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precio_unitario: item.precio_unitario,
      moneda: item.moneda || "ARS",
      pedido: item.pedido,
      obra: costosPorObra.find((row) => row.items.some((it) => it.id === item.id))?.label || "",
    }));
  }, [budgetModal, costosPorObra]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: "var(--blue-soft)",
          border: `1px solid ${C.blueB}`,
          color: C.blue,
        }}>
          <ClipboardList size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color: C.text, fontSize: 19, fontWeight: 900 }}>Registro de compras</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            Compras manuales, pedidos enviados a pañol, seguimiento y gasto por obra.
          </div>
        </div>
        <ViewTabs value={view} onChange={setView} />
        <button type="button" onClick={() => setPanolModal(true)} style={primaryButton(C.blue)}>
          <Plus size={14} /> Nuevo envío a pañol
        </button>
        <button type="button" onClick={() => setBudgetModal({ obraKey: view === "costos" ? selectedObraKey : "" })} style={secondaryButton()}>
          <Sparkles size={14} /> Cargar precios
        </button>
        <button type="button" onClick={() => setShowForm((v) => !v)} style={secondaryButton()}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cerrar carga" : "Compra manual"}
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <StatCard icon={DollarSign} label="Este mes" value={fmtMoney(monthlyTotal)} detail={`${thisMonth.length} compras manuales`} color={C.green} />
        <StatCard icon={FileText} label="Manual registrado" value={fmtMoney(manualTotal)} detail={`${entries.length} registros`} color={C.blue} />
        <StatCard icon={Warehouse} label="A pañol activos" value={panolKpis.enviados} detail={`${panolKpis.itemsPendientes} items pendientes`} color={C.amber} />
        <StatCard icon={AlertTriangle} label="Novedades pañol" value={panolKpis.novedades} detail="faltantes, sin info o rechazados" color={C.red} />
      </div>

      {showForm && (
        <ManualForm
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
          onOpenBudget={(obraKey) => setBudgetModal({ obraKey })}
          onSetItemPrice={handleSetItemPrice}
        />
      )}

      {view === "__legacy" && (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, 0.9fr)", gap: 12, alignItems: "start" }}>
        <section style={panelStyle()}>
          <div style={sectionHeaderStyle()}>
            <div>
              <div style={sectionTitleStyle()}>Seguimiento de pedidos a pañol</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Lo que compras mandó y el estado que informó pañol.</div>
            </div>
            <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12 }}>{filteredEnvios.length}/{envios.length}</span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar obra, item, destino..."
              style={{ ...inp(), flex: "1 1 230px", minWidth: 0 }}
            />
            <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ ...inp(), flex: "0 0 150px" }}>
              <option value="activos">Activos</option>
              <option value="enviado">Enviado</option>
              <option value="parcial">Parcial</option>
              <option value="recibido">Recibido</option>
              <option value="cancelado">Cancelado</option>
              <option value="todos">Todos</option>
            </select>
          </div>

          {loading ? (
            <EmptyState text="Cargando seguimiento..." />
          ) : filteredEnvios.length === 0 ? (
            <EmptyState text="No hay pedidos a pañol para ese filtro." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(270px, 0.9fr) minmax(340px, 1.1fr)", gap: 10, minHeight: 420 }}>
              <div style={{ display: "grid", gap: 7, alignContent: "start", maxHeight: 560, overflowY: "auto", paddingRight: 3 }}>
                {filteredEnvios.map((envio) => (
                  <EnvioRow
                    key={envio.id}
                    envio={envio}
                    active={selectedEnvio?.id === envio.id}
                    onClick={() => setSelectedEnvioId(envio.id)}
                  />
                ))}
              </div>
              <EnvioDetail envio={selectedEnvio} onDelete={handleDeleteEnvio} />
            </div>
          )}
        </section>

        <aside style={{ display: "grid", gap: 12 }}>
          <section style={panelStyle()}>
            <div style={sectionHeaderStyle()}>
              <div>
                <div style={sectionTitleStyle()}>Gasto por obra / destino</div>
                <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Calculado desde items enviados a pañol con precio cargado.</div>
              </div>
            </div>
            {gastoPorObra.length === 0 ? (
              <EmptyState text="Todavía no hay precios cargados en items de pañol." compact />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {gastoPorObra.map((row) => (
                  <div key={row.key} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <div style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.key}</div>
                      <div style={{ color: C.dim, fontSize: 11 }}>{row.pedidos} ped.</div>
                    </div>
                    <div style={{ color: C.green, fontFamily: C.mono, fontSize: 14, fontWeight: 850, marginTop: 5 }}>
                      {totalsLabel(row)}
                    </div>
                    {row.sinPrecio > 0 && <div style={{ color: C.amber, fontSize: 11, marginTop: 4 }}>{row.sinPrecio} items sin precio</div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <ManualLogList entries={entries} loading={loading} onDelete={handleDeleteLog} />
        </aside>
      </div>

      )}

      {panolModal && (
        <EnviarAPanolModal
          open
          profile={profile}
          prefill={null}
          onClose={(saved) => { setPanolModal(false); if (saved) load(); }}
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
            onClick={() => onChange(v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${active ? C.border2 : "transparent"}`,
              background: active ? C.panelSolid : "transparent",
              color: active ? C.text : C.dim,
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
        <div>
          <div style={sectionTitleStyle()}>Pedidos a Pañol</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            Lo que Compras mando, con recepcion y mensajes de Pañol en el mismo lugar.
          </div>
        </div>
        <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12 }}>{filteredEnvios.length}/{envios.length}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar obra, item, destino..."
          style={{ ...inp(), flex: "1 1 260px", minWidth: 0 }}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ ...inp(), flex: "0 0 160px", background: C.panelSolid }}>
          <option value="activos">Activos</option>
          <option value="enviado">Enviado</option>
          <option value="parcial">Parcial</option>
          <option value="recibido">Recibido</option>
          <option value="cancelado">Cancelado</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {loading ? (
        <EmptyState text="Cargando pedidos..." />
      ) : filteredEnvios.length === 0 ? (
        <EmptyState text="No hay pedidos a Pañol para ese filtro." />
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

function GastoObraView({ loading, rows, selectedKey, setSelectedKey, entries, onDeleteLog, onOpenBudget, onSetItemPrice }) {
  const selected = rows.find((row) => row.key === selectedKey) || rows[0] || null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.45fr) minmax(520px, 1fr)", gap: 12, alignItems: "start" }}>
      <section style={panelStyle()}>
        <div style={sectionHeaderStyle()}>
          <div>
            <div style={sectionTitleStyle()}>Gasto por obra</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Entrar a cada barco, ver items y separar adicionales.</div>
          </div>
        </div>
        {loading ? (
          <EmptyState text="Cargando costos..." compact />
        ) : rows.length === 0 ? (
          <EmptyState text="Todavia no hay pedidos ni precios para agrupar." compact />
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 680, overflowY: "auto", paddingRight: 3 }}>
            {rows.map((row) => {
              const active = selected?.key === row.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setSelectedKey(row.key)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${active ? C.blue : C.border}`,
                    background: active ? "var(--blue-soft)" : C.panel,
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
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", color: C.dim, fontSize: 11 }}>
                    <span>{row.pedidos} pedidos</span>
                    <span>{row.items.length} items</span>
                    {row.adicionalItems > 0 && <span style={{ color: C.violet }}>{row.adicionalItems} adicionales</span>}
                  </div>
                  <div style={{ color: row.ARS || row.USD ? C.green : C.dim, fontFamily: C.mono, fontSize: 14, fontWeight: 900 }}>{totalsLabel(row)}</div>
                  {row.sinPrecio > 0 && <div style={{ color: C.amber, fontSize: 11, fontWeight: 800 }}>{row.sinPrecio} items sin precio</div>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section style={panelStyle()}>
        {!selected ? (
          <EmptyState text="Selecciona una obra para ver el detalle." />
        ) : (
          <ObraCostDetail row={selected} onOpenBudget={onOpenBudget} onSetItemPrice={onSetItemPrice} />
        )}
      </section>

      <div style={{ gridColumn: "1 / -1" }}>
        <ManualLogList entries={entries} loading={loading} onDelete={onDeleteLog} />
      </div>
    </div>
  );
}

function ObraCostDetail({ row, onOpenBudget, onSetItemPrice }) {
  const priced = row.items.filter((item) => item.total).length;
  return (
    <div style={{ display: "grid", gap: 13 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 950 }}>{row.label}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            {row.items.length} items de pedidos a Pañol · {row.adicionales.length} registros de adicionales
          </div>
        </div>
        <button type="button" onClick={() => onOpenBudget(row.key)} style={primaryButton(C.violet)}>
          <Sparkles size={14} /> Cargar presupuesto
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <MiniMetric label="Total" value={totalsLabel(row)} color={C.green} />
        <MiniMetric label="Normal" value={totalsLabel({ ARS: row.baseARS, USD: row.baseUSD })} color={C.blue} />
        <MiniMetric label="Adicionales" value={totalsLabel({ ARS: row.adicionalARS, USD: row.adicionalUSD })} color={C.violet} />
        <MiniMetric label="Precios cargados" value={`${priced}/${row.items.length}`} color={row.sinPrecio ? C.amber : C.green} />
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.5fr) 92px 96px 96px 112px", gap: 8, padding: "9px 11px", background: C.panel, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
          <span>Item</span><span>Tipo</span><span>Cantidad</span><span>Unitario</span><span>Total</span>
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto" }}>
          {row.items.length === 0 ? (
            <EmptyState text="No hay items enviados a Pañol para esta obra." compact />
          ) : row.items.map((item) => {
            const unit = item.precio_unitario == null || item.precio_unitario === "" ? null : Number(item.precio_unitario);
            return (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.5fr) 92px 96px 96px 112px", gap: 8, alignItems: "center", padding: "10px 11px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{item.pedido}{item.codigo ? ` · ${item.codigo}` : ""}{item.nota ? ` · ${item.nota}` : ""}</div>
                </div>
                {item.tipo === "adicional" ? chip(C.violet, "Adicional") : chip(C.blue, "Normal")}
                <div style={{ color: C.muted, fontSize: 12 }}>{item.cantidad || "-"} {item.unidad || ""}</div>
                <InlinePriceEditor item={item} unit={unit} onSave={onSetItemPrice} />
                <div style={{ color: item.total ? C.green : C.amber, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>{item.total ? fmtMoney(item.total.value, item.total.currency) : "Sin precio"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {row.adicionales.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Adicionales vinculados</div>
          {row.adicionales.map((item) => (
            <div key={item.id} style={{ border: `1px solid ${C.border}`, background: item.linkedToPanol ? C.panel : "var(--violet-soft)", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <ReceiptText size={15} color={C.violet} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.detail}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{item.provider || "Sin proveedor"}{item.requestTitle ? ` · ${item.requestTitle}` : ""}{item.linkedToPanol ? " · conectado a pedido a Pañol" : ""}</div>
              </div>
              <div style={{ color: item.amount ? C.green : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>{item.amount ? fmtMoney(item.amount, item.currency) : "Sin monto"}</div>
            </div>
          ))}
        </div>
      )}

      {row.manuales && row.manuales.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Compras manuales</div>
          {row.manuales.map((item) => (
            <div key={item.id} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <FileText size={15} color={C.blue} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{item.provider || "Sin proveedor"}{item.fecha ? ` · ${fmtDate(item.fecha)}` : ""}</div>
              </div>
              <div style={{ color: item.amount ? C.green : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>{item.amount ? fmtMoney(item.amount, "ARS") : "Sin monto"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlinePriceEditor({ item, unit, onSave }) {
  const canEdit = item.source === "panol" && item.id;
  const [value, setValue] = useState("");
  const [moneda, setMoneda] = useState(item.moneda || "ARS");

  if (!canEdit) {
    return (
      <div style={{ color: unit ? C.green : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 850 }}>
        {unit ? fmtMoney(unit, item.moneda) : "-"}
      </div>
    );
  }

  const hasDraft = normalizePriceInput(value) !== null;

  async function save() {
    if (!hasDraft) return;
    await onSave?.(item.id, { precio_unitario: value, moneda });
    setValue("");
  }

  return (
    <div style={{ display: "grid", gap: 5 }}>
      {unit ? (
        <div style={{ color: C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 850 }}>
          {fmtMoney(unit, item.moneda)}
        </div>
      ) : (
        <div style={{ color: C.amber, fontSize: 10, fontWeight: 850 }}>Sin precio</div>
      )}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder="$ unit."
          inputMode="decimal"
          style={{
            width: 72,
            boxSizing: "border-box",
            border: `1px solid ${hasDraft ? C.greenB : C.border}`,
            background: C.panelSolid,
            color: C.text,
            borderRadius: 7,
            padding: "6px 7px",
            fontSize: 12,
            fontFamily: C.mono,
            outline: "none",
          }}
        />
        <select
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          style={{
            width: 58,
            border: `1px solid ${C.border}`,
            background: C.panelSolid,
            color: C.text,
            borderRadius: 7,
            padding: "6px 5px",
            fontSize: 11,
            fontFamily: C.sans,
            outline: "none",
          }}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={!hasDraft} title="Guardar precio" style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: `1px solid ${hasDraft ? C.greenB : C.border}`, background: hasDraft ? "var(--green-soft)" : C.panel, color: hasDraft ? C.green : C.dim, borderRadius: 7, cursor: hasDraft ? "pointer" : "default", padding: 0 }}>
          <Check size={13} />
        </button>
      </div>
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
  const [manualRows, setManualRows] = useState(() => [...candidates]
    .sort((a, b) => {
      const aHasPrice = a.precio_unitario !== null && a.precio_unitario !== undefined && a.precio_unitario !== "";
      const bHasPrice = b.precio_unitario !== null && b.precio_unitario !== undefined && b.precio_unitario !== "";
      return Number(aHasPrice) - Number(bHasPrice) || String(a.descripcion || "").localeCompare(String(b.descripcion || ""));
    })
    .map((item) => ({
      ...item,
      precioActual: item.precio_unitario,
      precio_unitario: "",
      moneda: item.moneda || "ARS",
    })));

  function analyze(nextText = text) {
    setRows(parseBudgetText(nextText, candidates));
  }

  async function readFile(file) {
    if (!file) return;
    setFileName(file.name);
    const body = await file.text();
    setText(body);
    setRows(parseBudgetText(body, candidates));
  }

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateManualRow(index, patch) {
    setManualRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const ready = rows.filter((row) => row.itemId && normalizePriceInput(row.precio_unitario) !== null).length;
  const manualReady = manualRows.filter((row) => row.id && normalizePriceInput(row.precio_unitario) !== null).length;
  const activeReady = mode === "manual" ? manualReady : ready;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "min(1100px, 100%)", maxHeight: "90vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr auto", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 14, boxShadow: `0 20px 70px ${C.shadow || "rgba(0,0,0,0.35)"}` }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--violet-soft)", color: C.violet, border: `1px solid ${C.border}` }}>
            <Sparkles size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Cargar precios desde presupuesto</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Alcance: {scopeLabel}. Pega texto o subi CSV/TXT, revisa matches y aplica.</div>
          </div>
          <button type="button" onClick={onClose} style={iconButton(C.dim)}><X size={15} /></button>
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
                onClick={() => setMode(value)}
                style={{
                  border: `1px solid ${active ? C.blue : C.border}`,
                  background: active ? "var(--blue-soft)" : C.panel,
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
                {manualRows.length === 0 ? (
                  <EmptyState text="No hay items candidatos para cargar precios." compact />
                ) : manualRows.map((row, index) => {
                  const currentPrice = normalizePriceInput(row.precioActual);
                  const draftReady = normalizePriceInput(row.precio_unitario) !== null;
                  return (
                    <div key={row.id || `${row.descripcion}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 130px 92px", gap: 8, alignItems: "center", padding: 10, borderTop: `1px solid ${C.border}`, background: currentPrice !== null ? C.panelSolid : "transparent" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                          {row.obra || "Sin obra"}{row.codigo ? ` · ${row.codigo}` : ""} · {row.cantidad || "-"} {row.unidad || ""}
                        </div>
                        {currentPrice !== null && (
                          <div style={{ color: C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 850, marginTop: 4 }}>
                            Actual: {fmtMoney(currentPrice, row.moneda)}
                          </div>
                        )}
                      </div>
                      <input
                        value={row.precio_unitario}
                        onChange={(e) => updateManualRow(index, { precio_unitario: e.target.value })}
                        placeholder={currentPrice !== null ? String(row.precioActual) : "$ unit."}
                        inputMode="decimal"
                        style={inp({ padding: "8px 9px", fontSize: 12, fontFamily: C.mono, textAlign: "right", borderColor: draftReady ? C.greenB : C.border, background: C.panelSolid })}
                      />
                      <select
                        value={row.moneda}
                        onChange={(e) => updateManualRow(index, { moneda: e.target.value })}
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
              placeholder={"Pega el presupuesto aca...\n20 mtrs Antirruido $ 1200\n1 INODORO Ovalado I14388 USD 45"}
              style={inp({ resize: "vertical", minHeight: 260, fontFamily: C.mono, fontSize: 12 })}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => analyze()} disabled={!text.trim()} style={{ ...primaryButton(C.violet), opacity: text.trim() ? 1 : 0.5 }}>
                <Sparkles size={14} /> Analizar texto
              </button>
              <label style={{ ...secondaryButton(), cursor: "pointer" }}>
                <Upload size={14} /> {fileName || "Subir TXT/CSV"}
                <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => readFile(e.target.files?.[0])} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45 }}>
              Detecta cantidad, unidad, codigo final, moneda y precio. Si el match no es correcto, elegi el item manualmente antes de aplicar.
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(210px,1.1fr) 90px 78px", gap: 8, padding: "9px 10px", background: C.panel, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
              <span>Linea detectada</span><span>Item del pedido</span><span>Precio</span><span>Moneda</span>
            </div>
            <div style={{ maxHeight: 430, overflowY: "auto" }}>
              {rows.length === 0 ? (
                <EmptyState text="Analiza un texto para ver las correcciones." compact />
              ) : rows.map((row, index) => (
                <div key={`${row.raw}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(210px,1.1fr) 90px 78px", gap: 8, alignItems: "center", padding: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
                    <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{row.cantidad || "-"} {row.unidad}{row.codigo ? ` · ${row.codigo}` : ""}</div>
                  </div>
                  <select value={row.itemId} onChange={(e) => updateRow(index, { itemId: e.target.value })} style={inp({ padding: "7px 8px", background: C.panelSolid, fontSize: 12 })}>
                    <option value="">Elegir item...</option>
                    {candidates.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.obra ? `${it.obra} · ` : ""}{it.descripcion}{it.codigo ? ` · ${it.codigo}` : ""}
                      </option>
                    ))}
                  </select>
                  <input value={row.precio_unitario} onChange={(e) => updateRow(index, { precio_unitario: e.target.value })} placeholder="Unit." style={inp({ padding: "7px 8px", fontSize: 12, fontFamily: C.mono })} />
                  <select value={row.moneda} onChange={(e) => updateRow(index, { moneda: e.target.value })} style={inp({ padding: "7px 8px", background: C.panelSolid, fontSize: 12 })}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ marginRight: "auto", color: activeReady ? C.green : C.dim, fontSize: 12, fontWeight: 850 }}>{activeReady} precios listos para aplicar</div>
          <button type="button" onClick={onClose} style={secondaryButton()}>Cancelar</button>
          <button
            type="button"
            onClick={() => (mode === "manual" ? onApplyManual?.(manualRows) : onApply(rows))}
            disabled={saving || activeReady === 0}
            style={{ ...primaryButton(C.green), opacity: saving || activeReady === 0 ? 0.55 : 1 }}
          >
            {saving ? "Aplicando..." : "Aplicar precios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualForm({ form, setForm, obras = EMPTY, invoiceFile, setInvoiceFile, saving, onSubmit, onCancel }) {
  const selectedObra = obras.find((obra) => obra.id === form.project_id);
  const amountText = String(form.amount || "").trim();
  const amountNumber = Number(form.amount);
  const amountInvalid = amountText && !(amountNumber > 0);
  const canSave = Boolean(form.description.trim()) && !amountInvalid && !saving;
  const preview = [
    amountText && !amountInvalid ? fmtMoney(amountNumber, "ARS") : "$0",
    form.provider.trim() || "Sin proveedor",
    selectedObra?.codigo || "Sin obra",
    form.purchased_at ? fmtDate(form.purchased_at) : "Sin fecha",
  ].join(" · ");
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
        <div>
          <div style={sectionTitleStyle()}>Nueva compra manual</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Una compra, un monto total y una obra opcional.</div>
        </div>
        <button type="button" onClick={onCancel} style={iconButton(C.dim)}><X size={14} /></button>
      </div>

      <label style={inputLabel}>
        <span style={labelStyle}>Descripcion</span>
        <input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Que compraste?"
          required
          style={inp({ background: C.panelSolid, fontWeight: 750 })}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      <label style={inputLabel}>
        <span style={labelStyle}>Obra / barco</span>
        <select value={form.project_id || ""} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          style={inp({ background: C.panelSolid, cursor: "pointer" })}>
          <option value="">Sin obra (gasto general)</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}{o.descripcion ? ` — ${o.descripcion}` : ""}</option>)}
        </select>
      </label>

        <label style={inputLabel}>
          <span style={labelStyle}>Proveedor</span>
          <div style={{ position: "relative" }}>
            <Store size={14} color={C.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="Proveedor"
              style={inp({ background: C.panelSolid, paddingLeft: 34 })}
            />
          </div>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <label style={inputLabel}>
          <span style={labelStyle}>Monto</span>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: amountInvalid ? C.red : C.dim, fontFamily: C.mono, fontSize: 13, fontWeight: 900 }}>$</span>
            <input
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0"
              style={inp({ background: C.panelSolid, paddingLeft: 30, textAlign: "right", fontFamily: C.mono, fontWeight: 850, borderColor: amountInvalid ? C.red : C.border })}
            />
          </div>
          {amountInvalid && <span style={{ color: C.red, fontSize: 11, fontWeight: 800 }}>El monto tiene que ser mayor a 0.</span>}
        </label>
        <label style={inputLabel}>
          <span style={labelStyle}>Fecha</span>
          <div style={{ position: "relative" }}>
            <Calendar size={14} color={C.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={form.purchased_at}
              onChange={(e) => setForm((f) => ({ ...f, purchased_at: e.target.value }))}
              type="date"
              style={inp({ background: C.panelSolid, paddingLeft: 34 })}
            />
          </div>
        </label>
      </div>

      <label style={inputLabel}>
        <span style={labelStyle}>Notas</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Notas (opcional)"
          rows={2}
          style={inp({ resize: "vertical", minHeight: 54, background: C.panelSolid })}
        />
      </label>

      <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>Resumen</div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 850, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <label style={{ ...secondaryButton(), cursor: "pointer", maxWidth: 260 }}>
            <ImagePlus size={14} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invoiceFile ? invoiceFile.name : "Adjuntar factura"}</span>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setInvoiceFile(e.target.files[0])} style={{ display: "none" }} />
          </label>
          {invoiceFile && <button type="button" onClick={() => setInvoiceFile(null)} style={{ ...secondaryButton(), color: C.red }}>Quitar</button>}
          <button type="submit" disabled={!canSave} style={{ ...primaryButton(C.green), opacity: canSave ? 1 : 0.55 }}>
            {saving ? "Guardando..." : <><Upload size={14} /> Guardar</>}
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
    <button type="button" onClick={onClick} style={{
      textAlign: "left",
      border: `1px solid ${active ? C.border2 : C.border}`,
      borderLeft: `4px solid ${meta.color}`,
      background: active ? C.panelSolid2 : C.panelSolid,
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
          <button type="button" onClick={() => onDelete(envio)} title="Borrar pedido a pañol" style={iconButton(C.red)}>
            <Trash2 size={14} />
          </button>
        </div>
        <Progress resumen={resumen} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: C.dim, fontSize: 12 }}>
          <span><strong style={{ color: C.green }}>{totalsLabel(totals)}</strong></span>
          {totals.sinPrecio > 0 && <span style={{ color: C.amber }}>{totals.sinPrecio} items sin precio</span>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", maxHeight: 480, overflowY: "auto" }}>
        {(envio.items || EMPTY).map((item) => {
          const itemMoney = itemTotal(item);
          return (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px 92px", gap: 9, alignItems: "center", padding: "9px 13px", borderBottom: `1px solid ${C.border}` }}>
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
            style={inp({ resize: "vertical", minHeight: 54, fontSize: 12 })}
          />
          <button type="button" onClick={sendComment} disabled={!comment.trim()} style={{ ...primaryButton(C.green), justifySelf: "end", opacity: comment.trim() ? 1 : 0.55 }}>
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

function ManualLogList({ entries, loading, onDelete }) {
  return (
    <section style={panelStyle()}>
      <div style={sectionHeaderStyle()}>
        <div>
          <div style={sectionTitleStyle()}>Compras manuales</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Facturas y compras cargadas fuera del flujo de pedidos.</div>
        </div>
      </div>
      {loading ? (
        <EmptyState text="Cargando compras..." compact />
      ) : entries.length === 0 ? (
        <EmptyState text="No hay compras manuales registradas." compact />
      ) : (
        <div style={{ display: "grid", gap: 7, maxHeight: 360, overflowY: "auto", paddingRight: 3 }}>
          {entries.slice(0, 12).map((entry) => (
            <div key={entry.id} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 10, display: "grid", gap: 5 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</div>
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                    {entry.provider || "Sin proveedor"} · {new Date(entry.purchased_at).toLocaleDateString("es-AR")} · {usernameOf(entry.creator)}
                  </div>
                </div>
                <button type="button" onClick={() => onDelete(entry.id)} style={iconButton(C.dim)} title="Eliminar"><Trash2 size={13} /></button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span style={{ color: C.green, fontFamily: C.mono, fontSize: 13, fontWeight: 850 }}>{entry.amount ? fmtMoney(entry.amount) : "Sin monto"}</span>
                {entry.invoice_url && (
                  <a href={entry.invoice_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontSize: 11, fontWeight: 800 }}>
                    Factura
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
