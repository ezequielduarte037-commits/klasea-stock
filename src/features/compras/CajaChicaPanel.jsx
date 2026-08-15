import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoKUrl from "@/assets/logos/logo-k.png";
import {
  CalendarRange,
  FileDown,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  WandSparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  createCajaChicaClosure,
  createCajaChicaEntries,
  createCajaChicaEntry,
  deleteCajaChicaEntry,
  ensureCajaChicaCierreAbierto,
  fetchCajaChicaClosures,
  fetchCajaChicaEntries,
  leerReciboDeNotas,
  notasConRecibo,
  updateCajaChicaClosure,
  updateCajaChicaEntry,
} from "@/features/compras/cajaChicaApi";
import { fetchProfiles } from "@/features/compras/purchaseRequestsApi";
import ReciboModal from "@/features/compras/ReciboModal";
import { C } from "@/theme";

// null = caja de compras (histórica, sin dueño). Un uuid = la caja de ese cadete.
const CAJA_COMPRAS = "__compras__";

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  fecha: TODAY,
  tipo: "egreso",
  proveedor: "",
  detalle: "",
  centro_costo: "",
  importe: "",
  moneda: "ARS",
  notas: "",
};

const EMPTY_CIERRE = {
  nombre: "",
  fecha_desde: "",
  fecha_hasta: "",
  notas: "",
};

function fmtMoney(value, currency = "ARS") {
  const n = Number(value || 0);
  const text = n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "USD" ? `USD ${text}` : `$${text}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  let text = String(value || "").trim();
  if (!text || /^[-]+$/.test(text)) return null;
  text = text.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!text) return null;

  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else {
    const sep = text.includes(",") ? "," : text.includes(".") ? "." : null;
    if (sep) {
      const parts = text.split(sep);
      if (parts.length > 2) {
        text = parts.join("");
      } else {
        const [whole, tail = ""] = parts;
        text = tail.length === 3 ? `${whole}${tail}` : `${whole}.${tail}`;
      }
    }
  }

  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function detectCurrency(value) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (/\bUSD\b|US\$|U\$S|\bDOLAR(?:ES)?\b|\bDLS\b/.test(text)) return "USD";
  return "ARS";
}

function parseDateCell(value, fallback = null) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 30000 && serial < 70000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }

  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!match) return fallback;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${month}-${day}`;
}

function shouldSkipPasteLine(cells) {
  const joined = cells.join(" ").toLowerCase();
  if (!joined.trim()) return true;
  if (joined.includes("proveedor") && joined.includes("detalle")) return true;
  if (joined.includes("fecha") && joined.includes("importe")) return true;
  if (joined.includes("sum(") || joined.includes("subtotal") || joined.includes("saldo") || joined.includes("total")) return true;
  return false;
}

function rowIssues(row) {
  const issues = [];
  if (!row.fecha) issues.push("fecha");
  if (!String(row.detalle || "").trim()) issues.push("detalle");
  if (!parseMoney(row.importe)) issues.push("importe");
  return issues;
}

function normalizeImportRow(row) {
  const importe = parseMoney(row.importe);
  return {
    fecha: row.fecha || TODAY,
    proveedor: String(row.proveedor || "").trim(),
    detalle: String(row.detalle || "").trim() || "(sin detalle)",
    centro_costo: String(row.centro_costo || "").trim(),
    tipo: row.tipo === "ingreso" ? "ingreso" : "egreso",
    importe: importe || 0,
    moneda: row.moneda === "USD" ? "USD" : "ARS",
  };
}

function analyzeExcelPaste(text) {
  let lastDate = TODAY;
  return String(text || "")
    .split(/\r?\n/)
    .map((line, index) => ({ raw: line.trimEnd(), index }))
    .filter((line) => line.raw.trim())
    .map(({ raw, index }) => ({ raw, index, cells: raw.split("\t").map((cell) => cell.trim()) }))
    .filter(({ cells }) => !shouldSkipPasteLine(cells))
    .map(({ raw, index, cells }) => {
      const [fechaRaw, proveedorRaw, detalleRaw, centroRaw, egresoRaw, ingresoRaw] = cells;
      const fecha = parseDateCell(fechaRaw, lastDate);
      if (fecha) lastDate = fecha;

      const ingresoValor = parseMoney(ingresoRaw);
      const egresoValor = parseMoney(egresoRaw);
      const importe = ingresoValor || egresoValor || (cells.length >= 5 ? parseMoney(cells[cells.length - 1]) : null);
      const detalleFallback = cells.length <= 3 ? cells.join(" ") : "";
      const row = {
        key: `${index}-${raw.slice(0, 16)}`,
        raw,
        fecha,
        proveedor: proveedorRaw || "",
        detalle: detalleRaw || detalleFallback,
        centro_costo: centroRaw || "",
        tipo: ingresoValor ? "ingreso" : "egreso",
        importe: importe ? String(importe) : "",
        moneda: detectCurrency(raw),
      };
      return { ...row, issues: rowIssues(row) };
    });
}

function dateInRange(value, from, to) {
  if (!value) return true;
  const date = String(value).slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function cierreDateLabel(cierre) {
  if (!cierre) return "sin cierre";
  if (cierre.fecha_desde && cierre.fecha_hasta) return `${fmtDate(cierre.fecha_desde)} a ${fmtDate(cierre.fecha_hasta)}`;
  if (cierre.fecha_desde) return `desde ${fmtDate(cierre.fecha_desde)}`;
  if (cierre.fecha_hasta) return `hasta ${fmtDate(cierre.fecha_hasta)}`;
  return "sin fechas";
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
    if (img.complete && img.naturalWidth) {
      resolve(img);
    }
  });
}

async function loadNavyLogo() {
  const img = await loadImage(logoKUrl);
  if (!img) return null;
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum > 90) { px[i] = 15; px[i + 1] = 23; px[i + 2] = 42; px[i + 3] = 255; }
      else { px[i + 3] = 0; }
    }
    ctx.putImageData(data, 0, 0);
    return { dataUrl: cvs.toDataURL("image/png"), aspect: h / w };
  } catch {
    return null;
  }
}

async function exportPdfReport({ rows, cierre }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 42;
  const navy = [15, 23, 42];
  const muted = [98, 107, 123];
  const border = [220, 224, 230];

  try {
    const logoObj = await loadNavyLogo();
    if (logoObj) {
      const logoWidth = 34;
      const logoHeight = logoObj.aspect * logoWidth;
      doc.addImage(logoObj.dataUrl, "PNG", pageWidth - left - logoWidth, 26, logoWidth, logoHeight);
    }
  } catch (err) {
    console.error("No se pudo cargar el logo para el PDF:", err);
  }

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Caja chica", left, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`${cierre?.nombre || "Cierre"} - ${cierreDateLabel(cierre)}`, left, 60);

  // Calcular totales
  const stats = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
  rows.forEach((row) => {
    const currency = row.moneda === "USD" ? "USD" : "ARS";
    const amount = Number(row.importe || 0);
    if (row.tipo === "ingreso") stats[currency].ingresos += amount;
    else stats[currency].egresos += amount;
  });

  const saldoArs = stats.ARS.ingresos - stats.ARS.egresos;
  const saldoUsd = stats.USD.ingresos - stats.USD.egresos;
  const hasUsd = stats.USD.ingresos > 0 || stats.USD.egresos > 0;

  // Dibujar tarjetas de totales
  const yCards = 78;
  const cardWidth = 160;
  const gap = 15;
  const cardHeight = hasUsd ? 52 : 38;

  // Card 1: Ingresos
  let x = left;
  doc.setFillColor(248, 250, 252);
  doc.rect(x, yCards, cardWidth, cardHeight, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.rect(x, yCards, cardWidth, cardHeight, "S");
  doc.setFillColor(34, 197, 94); // Verde para ingresos
  doc.rect(x, yCards, 4, cardHeight, "F");

  let cx = x + 4 + (cardWidth - 4) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL INGRESOS", cx, yCards + 14, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(fmtMoney(stats.ARS.ingresos, "ARS"), cx, yCards + 28, { align: "center" });

  if (hasUsd) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(fmtMoney(stats.USD.ingresos, "USD"), cx, yCards + 42, { align: "center" });
  }

  // Card 2: Egresos
  x = left + cardWidth + gap;
  doc.setFillColor(248, 250, 252);
  doc.rect(x, yCards, cardWidth, cardHeight, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(x, yCards, cardWidth, cardHeight, "S");
  doc.setFillColor(239, 68, 68); // Rojo para egresos
  doc.rect(x, yCards, 4, cardHeight, "F");

  cx = x + 4 + (cardWidth - 4) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL EGRESOS", cx, yCards + 14, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(fmtMoney(stats.ARS.egresos, "ARS"), cx, yCards + 28, { align: "center" });

  if (hasUsd) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(fmtMoney(stats.USD.egresos, "USD"), cx, yCards + 42, { align: "center" });
  }

  // Card 3: Saldo
  x = left + 2 * (cardWidth + gap);
  doc.setFillColor(248, 250, 252);
  doc.rect(x, yCards, cardWidth, cardHeight, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(x, yCards, cardWidth, cardHeight, "S");
  const saldoColor = saldoArs >= 0 ? [59, 130, 246] : [239, 68, 68];
  doc.setFillColor(...saldoColor);
  doc.rect(x, yCards, 4, cardHeight, "F");

  cx = x + 4 + (cardWidth - 4) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("SALDO ACTUAL", cx, yCards + 14, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...(saldoArs >= 0 ? [15, 23, 42] : [239, 68, 68]));
  doc.text(fmtMoney(saldoArs, "ARS"), cx, yCards + 28, { align: "center" });

  if (hasUsd) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...(saldoUsd >= 0 ? [100, 116, 139] : [239, 68, 68]));
    doc.text(fmtMoney(saldoUsd, "USD"), cx, yCards + 42, { align: "center" });
  }

  const startTableY = yCards + cardHeight + 16;

  autoTable(doc, {
    startY: startTableY,
    head: [["Fecha", "Proveedor", "Detalle", "Centro", "Egreso", "Ingreso"]],
    body: rows.map((row) => [
      fmtDate(row.fecha),
      row.proveedor || "-",
      row.detalle || "-",
      row.centro_costo || "-",
      row.tipo === "egreso" ? fmtMoney(row.importe, row.moneda) : "-",
      row.tipo === "ingreso" ? fmtMoney(row.importe, row.moneda) : "-",
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [24, 31, 42], lineColor: border },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 92 },
      2: { cellWidth: 170 },
      3: { cellWidth: 86 },
      4: { halign: "right", cellWidth: 72 },
      5: { halign: "right", cellWidth: 72 },
    },
    margin: { left, right: left },
  });

  const name = String(cierre?.nombre || "caja-chica")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  doc.save(`${name}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function lowerText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeFilePart(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// lockedOwnerId: si viene un uuid, el panel queda fijo a la caja de ese usuario
// (se usa como caja propia del cadete) y se oculta el selector de dueño.
export default function CajaChicaPanel({ lockedOwnerId } = {}) {
  const toast = useToast();
  const [owners, setOwners] = useState([]);          // cadetes con caja propia
  const [ownerSel, setOwnerSel] = useState(lockedOwnerId || CAJA_COMPRAS); // CAJA_COMPRAS | uuid del cadete
  const [cierres, setCierres] = useState([]);
  const [selectedCierreId, setSelectedCierreId] = useState("");
  const [cierreForm, setCierreForm] = useState(EMPTY_CIERRE);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [missingClosuresTable, setMissingClosuresTable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [centroFilter, setCentroFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importRows, setImportRows] = useState([]);
  // Recibo imprimible: el mismo papel que se llenaba a mano. Sale de un
  // movimiento ya cargado, o se arma suelto y de paso queda asentado.
  const [recibo, setRecibo] = useState(null);

  // null = caja de compras; uuid = caja del cadete seleccionado.
  const ownerId = lockedOwnerId != null ? lockedOwnerId : (ownerSel === CAJA_COMPRAS ? null : ownerSel);

  useEffect(() => {
    if (lockedOwnerId != null) return; // caja fija: no hace falta el selector de dueños
    fetchProfiles()
      .then((rows) => setOwners((rows || []).filter((p) => p.role === "cadete")))
      .catch(() => setOwners([]));
  }, [lockedOwnerId]);

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = (e) => setIsMobile(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  async function loadCierres(preferredId = selectedCierreId) {
    setLoading(true);
    try {
      const result = await fetchCajaChicaClosures({ ownerId });
      const nextCierres = result.rows;
      setCierres(nextCierres);
      setMissingClosuresTable(Boolean(result.missingTable));
      const stillExists = nextCierres.some((cierre) => cierre.id === preferredId);
      setSelectedCierreId(stillExists ? preferredId : (nextCierres[0]?.id || ""));
    } catch (error) {
      toast.error(error?.message || "No se pudieron cargar los cierres.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCierres(ownerSel === CAJA_COMPRAS ? selectedCierreId : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerSel]);

  async function loadEntries(cierreId = selectedCierreId) {
    if (!cierreId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchCajaChicaEntries({ cierreId, ownerId });
      setRows(result.rows);
      setMissingTable(Boolean(result.missingTable));
    } catch (error) {
      toast.error(error?.message || "No se pudo cargar caja chica");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries(selectedCierreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCierreId]);

  async function refreshAll() {
    await loadCierres(selectedCierreId);
    await loadEntries(selectedCierreId);
  }

  const centros = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.centro_costo).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b), "es"));
  }, [rows]);

  // Cerrar es la acción que separa "esto ya está rendido" de "esto sigue vivo".
  // Va detrás de un resumen porque cerrar sin ver el número que estás cerrando
  // es exactamente cómo se llega a un cierre mal hecho.
  const [cerrarOpen, setCerrarOpen] = useState(false);
  // Reabrir pide motivo: que se pueda, pero que no sea un click. Si reabrir
  // cuesta lo mismo que cerrar, el estado deja de significar algo.
  const [reabrirMotivo, setReabrirMotivo] = useState("");
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [cierreBusy, setCierreBusy] = useState(false);

  const selectedCierre = useMemo(
    () => cierres.find((cierre) => cierre.id === selectedCierreId) || null,
    [cierres, selectedCierreId],
  );

  const filteredRows = useMemo(() => {
    const q = lowerText(query);
    return rows.filter((row) => {
      if (tipoFilter !== "todos" && row.tipo !== tipoFilter) return false;
      if (centroFilter !== "todos" && row.centro_costo !== centroFilter) return false;
      if (!dateInRange(row.fecha, dateFrom, dateTo)) return false;
      if (!q) return true;
      return lowerText(`${row.fecha} ${row.proveedor} ${row.detalle} ${row.centro_costo}`).includes(q);
    });
  }, [centroFilter, dateFrom, dateTo, query, rows, tipoFilter]);

  const centrosTop = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      if (row.tipo !== "egreso") return;
      const key = row.centro_costo || "Sin centro";
      const current = map.get(key) || { centro: key, ARS: 0, USD: 0, count: 0 };
      current[row.moneda === "USD" ? "USD" : "ARS"] += Number(row.importe || 0);
      current.count += 1;
      map.set(key, current);
    });
    return Array.from(map.values())
      .sort((a, b) => b.ARS - a.ARS || b.USD - a.USD)
      .slice(0, 8);
  }, [filteredRows]);

  const importReady = useMemo(() => importRows.filter((row) => rowIssues(row).length === 0), [importRows]);
  const importReview = importRows.length - importReady.length;

  const cajaCerrada = selectedCierre?.estado === "cerrado";

  // Sólo las abiertas: un recibo no puede ir a parar a una caja ya rendida.
  const cajasAbiertas = useMemo(
    () => cierres.filter((cierre) => cierre.estado !== "cerrado").map((cierre) => ({ id: cierre.id, nombre: cierre.nombre })),
    [cierres],
  );

  // Totales de la caja ENTERA, sin los filtros de la vista. Cerrar mirando un
  // subtotal filtrado sería cerrar por un número que no es el de la caja.
  const totalesCaja = useMemo(() => {
    const base = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
    rows.forEach((row) => {
      const cur = row.moneda === "USD" ? "USD" : "ARS";
      const amount = Number(row.importe || 0);
      if (row.tipo === "ingreso") base[cur].ingresos += amount;
      else base[cur].egresos += amount;
    });
    return {
      ...base,
      movimientos: rows.length,
      saldoArs: base.ARS.ingresos - base.ARS.egresos,
      saldoUsd: base.USD.ingresos - base.USD.egresos,
    };
  }, [rows]);

  async function confirmarCierre() {
    if (!selectedCierre || cierreBusy) return;
    setCierreBusy(true);
    try {
      await updateCajaChicaClosure(selectedCierre.id, {
        estado: "cerrado",
        fecha_hasta: selectedCierre.fecha_hasta || new Date().toISOString().slice(0, 10),
      });
      setCerrarOpen(false);
      await refreshAll();
      toast.success("Caja cerrada. No admite movimientos nuevos.");
    } catch (error) {
      toast.error(error?.message || "No se pudo cerrar la caja.");
    } finally {
      setCierreBusy(false);
    }
  }

  async function confirmarReapertura() {
    if (!selectedCierre || cierreBusy) return;
    const motivo = reabrirMotivo.trim();
    if (!motivo) {
      toast.warning("Escribí por qué la reabrís.");
      return;
    }
    setCierreBusy(true);
    try {
      // El motivo se apila en las notas con fecha: reabrir sin dejar rastro es
      // lo mismo que no haberla cerrado nunca.
      const sello = `[Reabierta ${new Date().toLocaleDateString("es-AR")}] ${motivo}`;
      await updateCajaChicaClosure(selectedCierre.id, {
        estado: "abierto",
        notas: [selectedCierre.notas, sello].filter(Boolean).join("\n"),
      });
      setReabrirOpen(false);
      setReabrirMotivo("");
      await refreshAll();
      toast.success("Caja reabierta. Queda registrado el motivo.");
    } catch (error) {
      toast.error(error?.message || "No se pudo reabrir la caja.");
    } finally {
      setCierreBusy(false);
    }
  }

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function patchCierreForm(patch) {
    setCierreForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleCreateCierre(event) {
    event.preventDefault();
    if (!cierreForm.nombre.trim()) {
      toast.warning("Poné un nombre para el cierre.");
      return;
    }
    setSaving(true);
    try {
      const created = await createCajaChicaClosure({ ...cierreForm, owner_id: ownerId });
      setCierreForm(EMPTY_CIERRE);
      await loadCierres(created.id);
      toast.success("Cierre creado.");
    } catch (error) {
      toast.error(error?.message || "No se pudo crear el cierre.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const importe = parseMoney(form.importe);
    if (!selectedCierreId) {
      toast.warning("Primero seleccioná o creá un cierre.");
      return;
    }
    // Una caja cerrada está rendida. Aceptar un movimiento más la vuelve a
    // dejar mal sin que nadie se entere hasta el próximo arqueo.
    if (cajaCerrada) {
      toast.warning("Esta caja está cerrada. Reabrila si necesitás corregir algo.");
      return;
    }
    if (!form.detalle.trim()) {
      toast.warning("Cargá un detalle para el movimiento.");
      return;
    }
    if (!importe) {
      toast.warning("Cargá un importe válido.");
      return;
    }

    setSaving(true);
    try {
      await createCajaChicaEntry({ ...form, importe, cierre_id: selectedCierreId, owner_id: ownerId });
      setForm(EMPTY_FORM);
      await loadEntries(selectedCierreId);
      toast.success("Movimiento guardado.");
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasteImport() {
    if (!selectedCierreId) {
      toast.warning("Primero seleccioná o creá un cierre.");
      return;
    }
    if (!importReady.length) {
      toast.warning("No encontré filas listas para importar.");
      return;
    }
    setSaving(true);
    try {
      await createCajaChicaEntries(importReady.map((row) => ({ ...normalizeImportRow(row), cierre_id: selectedCierreId, owner_id: ownerId })));
      setPasteText("");
      setImportRows([]);
      await loadEntries(selectedCierreId);
      toast.success(`${importReady.length} movimientos importados.`);
    } catch (error) {
      toast.error(error?.message || "No se pudo importar el pegado.");
    } finally {
      setSaving(false);
    }
  }

  function handleAnalyzePaste() {
    const analyzed = analyzeExcelPaste(pasteText);
    setImportRows(analyzed);
    if (!analyzed.length) {
      toast.warning("No encontré movimientos en el texto pegado.");
      return;
    }
    const review = analyzed.filter((row) => rowIssues(row).length > 0).length;
    if (review > 0) toast.warning(`${review} filas necesitan revisión antes de importar.`);
    else toast.success(`${analyzed.length} filas listas para importar.`);
  }

  function patchImportRow(key, patch) {
    setImportRows((list) => list.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      return { ...next, issues: rowIssues(next) };
    }));
  }

  function useCurrentMonth() {
    const range = currentMonthRange();
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  // Desde un movimiento el gasto ya está cargado: sólo falta el papel. Por eso
  // no vuelve a ofrecer registrarlo, y si ya tenía un recibo en borrador
  // reusa su número en vez de inventar otro.
  function abrirReciboDeMovimiento(row) {
    const marca = leerReciboDeNotas(row.notas);
    setRecibo({
      puedeRegistrar: false,
      initial: {
        entryId: row.id,
        numero: marca?.numero,
        estado: marca?.estado,
        semilla: row.id,
        fecha: row.fecha,
        proveedor: row.proveedor || "",
        // El movimiento guarda el concepto en una línea (unido con " · ").
        // Al volver al recibo se separa de nuevo en renglones.
        concepto: String(row.detalle || "").split(" · ").join("\n"),
        centroCosto: row.centro_costo || "",
        importe: row.importe,
        moneda: row.moneda,
      },
    });
  }

  function abrirReciboNuevo() {
    setRecibo({
      puedeRegistrar: !missingTable,
      initial: { fecha: TODAY },
    });
  }

  // Si no hay ninguna caja abierta se crea una: que falte el cierre no puede
  // ser el motivo por el que un gasto quede sin registrar.
  async function registrarEgresoDeRecibo({ movimiento, cajaId, recibo: marca }) {
    let destino = cajaId;
    if (!destino) {
      const caja = await ensureCajaChicaCierreAbierto({
        ownerId,
        nombre: `Caja chica ${new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })}`,
      });
      destino = caja?.id;
    }
    if (!destino) throw new Error("No se pudo determinar la caja donde registrar el egreso.");

    const creado = await createCajaChicaEntry({
      ...movimiento,
      notas: notasConRecibo(movimiento.notas, marca),
      cierre_id: destino,
      owner_id: ownerId,
    });
    await loadCierres(destino);
    await loadEntries(destino);
    return creado;
  }

  async function marcarReciboEmitido({ entryId, numero }) {
    const row = rows.find((item) => item.id === entryId);
    if (!row) return;
    const notas = notasConRecibo(row.notas, { numero, estado: "emitido" });
    if (notas === row.notas) return;
    await updateCajaChicaEntry(entryId, { notas });
    await loadEntries(selectedCierreId);
  }

  async function handleDelete(row) {
    const ok = window.confirm(`¿Borrar movimiento "${row.detalle}"?`);
    if (!ok) return;
    try {
      await deleteCajaChicaEntry(row.id);
      await loadEntries(selectedCierreId);
      toast.success("Movimiento borrado.");
    } catch (error) {
      toast.error(error?.message || "No se pudo borrar.");
    }
  }

  function exportCsv() {
    const header = ["Fecha", "Proveedor", "Detalle", "Centro de costo", "Tipo", "Importe", "Moneda"];
    const lines = filteredRows.map((row) => [
      row.fecha,
      row.proveedor || "",
      row.detalle || "",
      row.centro_costo || "",
      row.tipo,
      String(row.importe || 0).replace(".", ","),
      row.moneda || "ARS",
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFilePart(selectedCierre?.nombre || "caja-chica")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!filteredRows.length) {
      toast.warning("No hay movimientos para exportar.");
      return;
    }
    try {
      await exportPdfReport({ rows: filteredRows, cierre: selectedCierre });
    } catch (e) {
      console.error(e);
      alert("Error generating PDF: " + e.message + "\n" + e.stack);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, color: C.text }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: C.amberL,
          border: `1px solid ${C.amberB}`,
          color: C.amber,
        }}>
          <Wallet size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 850 }}>Caja chica</h2>
          <p style={{ margin: "5px 0 0", color: C.dim, fontSize: 13 }}>
            Movimientos organizados por cierres semanales o por período.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirReciboNuevo}
          style={{ ...smallBtn(), border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, fontWeight: 900 }}
          title="Armar un recibo para que lo firmen"
        >
          <Receipt size={14} /> Recibo
        </button>
        <button type="button" onClick={refreshAll} style={smallBtn()}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" onClick={exportCsv} disabled={!filteredRows.length} style={smallBtn(!filteredRows.length)}>
          <Upload size={14} /> CSV
        </button>
        <button type="button" onClick={exportPdf} disabled={!filteredRows.length} style={smallBtn(!filteredRows.length)}>
          <FileDown size={14} /> PDF
        </button>
      </div>

      {(missingTable || missingClosuresTable) && (
        <div style={{
          border: `1px solid ${C.amberB}`,
          background: C.amberL,
          color: C.text,
          borderRadius: 12,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.45,
        }}>
          Falta aplicar el SQL de caja chica con cierres en Supabase. Te lo dejo al final para pegarlo en el SQL Editor.
        </div>
      )}

      <section style={cardStyle()}>
        <SectionTitle
          title="Cierres"
          subtitle="Cada carga queda dentro de un cierre. Usalo como la planilla: un bloque por semana o por período real."
        />
        {!lockedOwnerId && owners.length > 0 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6, alignSelf: "center" }}>Caja:</span>
            {[{ id: CAJA_COMPRAS, label: "Compras" }, ...owners.map((o) => ({ id: o.id, label: o.username }))].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setOwnerSel(opt.id)}
                style={{
                  border: `1px solid ${ownerSel === opt.id ? C.blueB : C.border}`,
                  background: ownerSel === opt.id ? C.blueL : C.panel2,
                  color: ownerSel === opt.id ? C.blue : C.text,
                  borderRadius: 999,
                  padding: "5px 13px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 850,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {/* Banda de caja activa. El problema que resuelve es concreto: no saber
            en qué caja estás cargando. Va antes que todo lo demás y muestra las
            dos cosas que definen el contexto: cuál es y cuánto tiene. */}
        {selectedCierre && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            border: `1px solid ${cajaCerrada ? C.border : C.blueB}`,
            background: cajaCerrada ? C.panel2 : C.blueL,
            borderRadius: 12, padding: "10px 13px", marginBottom: 12,
          }}>
            <Wallet size={16} style={{ color: cajaCerrada ? C.dim : C.blue, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 950, lineHeight: 1.15 }}>
                {selectedCierre.nombre}
              </div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
                {totalesCaja.movimientos} movimiento{totalesCaja.movimientos === 1 ? "" : "s"}
                {cajaCerrada ? " · cerrada, no admite carga" : " · caja en uso"}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.dim, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Saldo</div>
                <div style={{ color: totalesCaja.saldoArs < 0 ? C.red : C.text, fontFamily: C.mono, fontSize: 16, fontWeight: 950 }}>
                  {fmtMoney(totalesCaja.saldoArs, "ARS")}
                </div>
                {(totalesCaja.USD.ingresos > 0 || totalesCaja.USD.egresos > 0) && (
                  <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{fmtMoney(totalesCaja.saldoUsd, "USD")}</div>
                )}
              </div>
              {cajaCerrada ? (
                <button type="button" onClick={() => setReabrirOpen(true)}
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 850, fontFamily: C.sans, whiteSpace: "nowrap" }}>
                  Reabrir
                </button>
              ) : (
                <button type="button" onClick={() => setCerrarOpen(true)}
                  style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans, whiteSpace: "nowrap" }}>
                  Cerrar caja
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 1fr) minmax(300px, 0.9fr)", gap: 12 }}>
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            {/* Abiertas primero. Mezcladas, con una lista larga, terminás
                cargando movimientos en una caja de hace tres meses. */}
            {cierres.length ? [...cierres].sort((a, b) => {
              const ra = a.estado === "cerrado" ? 1 : 0;
              const rb = b.estado === "cerrado" ? 1 : 0;
              return ra - rb;
            }).map((cierre) => (
              <button
                key={cierre.id}
                type="button"
                onClick={() => setSelectedCierreId(cierre.id)}
                style={{
                  textAlign: "left",
                  border: `1px solid ${selectedCierreId === cierre.id ? C.blueB : C.border}`,
                  background: selectedCierreId === cierre.id ? C.blueL : C.panel2,
                  color: C.text,
                  borderRadius: 10,
                  padding: 11,
                  cursor: "pointer",
                  display: "grid",
                  gap: 5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{cierre.nombre}</strong>
                  {/* Abierta = azul (está en uso), cerrada = gris apagado (ya
                      está rendida). El verde sugería "correcta" y las dos lo
                      son; lo que cambia es si admite movimientos. */}
                  <span style={pill(cierre.estado === "cerrado" ? C.dim : C.blue)}>{cierre.estado === "cerrado" ? "Cerrada" : "Abierta"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 12 }}>
                  <CalendarRange size={13} /> {cierreDateLabel(cierre)}
                </div>
                {cierre.notas && <div style={{ color: C.dim, fontSize: 12 }}>{cierre.notas}</div>}
              </button>
            )) : (
              <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 10, padding: 18, color: C.dim, fontSize: 13 }}>
                No hay cierres cargados todavía.
              </div>
            )}
          </div>

          <form onSubmit={handleCreateCierre} style={{ display: "grid", gap: 8, border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 850, color: C.text }}>Nuevo cierre</div>
            <Field label="Nombre">
              <input value={cierreForm.nombre} onChange={(e) => patchCierreForm({ nombre: e.target.value })} placeholder="Ej: Cierre 14/05 al 21/05" style={inputStyle()} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
              <Field label="Desde">
                <input type="date" value={cierreForm.fecha_desde} onChange={(e) => patchCierreForm({ fecha_desde: e.target.value })} style={inputStyle()} />
              </Field>
              <Field label="Hasta">
                <input type="date" value={cierreForm.fecha_hasta} onChange={(e) => patchCierreForm({ fecha_hasta: e.target.value })} style={inputStyle()} />
              </Field>
            </div>
            <Field label="Notas">
              <input value={cierreForm.notas} onChange={(e) => patchCierreForm({ notas: e.target.value })} placeholder="Opcional: feriado, semana corta, etc." style={inputStyle()} />
            </Field>
            <button type="submit" disabled={saving || missingClosuresTable} style={primaryBtn(saving || missingClosuresTable)}>
              <Plus size={14} /> Crear cierre
            </button>
          </form>
        </div>
      </section>

      {selectedCierre && (
        <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.1, color: C.dim, textTransform: "uppercase", fontWeight: 850 }}>Cierre activo</div>
            <div style={{ fontSize: 16, fontWeight: 850, marginTop: 3 }}>{selectedCierre.nombre}</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{cierreDateLabel(selectedCierre)}</div>
          </div>
          <div style={{ fontFamily: C.mono, color: C.blue, fontWeight: 900 }}>{filteredRows.length} movimientos</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <section style={cardStyle()}>
          <SectionTitle title="Nuevo movimiento" subtitle={selectedCierre ? `Se guarda en ${selectedCierre.nombre}.` : "Primero seleccioná o creá un cierre."} />
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              <Field label="Fecha">
                <input type="date" value={form.fecha} onChange={(e) => patchForm({ fecha: e.target.value })} style={inputStyle()} />
              </Field>
              <Field label="Tipo">
                <select value={form.tipo} onChange={(e) => patchForm({ tipo: e.target.value })} style={inputStyle()}>
                  <option value="egreso">Egreso</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </Field>
              <Field label="Moneda">
                <select value={form.moneda} onChange={(e) => patchForm({ moneda: e.target.value })} style={inputStyle()}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe">
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 6 }}>
                  <span style={{ color: C.dim, fontWeight: 800 }}>{form.moneda === "USD" ? "USD" : "$"}</span>
                  <input
                    value={form.importe}
                    onChange={(e) => patchForm({ importe: e.target.value })}
                    placeholder="0"
                    inputMode="decimal"
                    style={{ ...inputStyle(), textAlign: "right" }}
                  />
                </div>
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              <Field label="Proveedor">
                <input value={form.proveedor} onChange={(e) => patchForm({ proveedor: e.target.value })} placeholder="Ej: Uber, Casa Iriarte..." style={inputStyle()} />
              </Field>
              <Field label="Centro de costo">
                <input value={form.centro_costo} onChange={(e) => patchForm({ centro_costo: e.target.value })} placeholder="Ej: 55-4, logística..." style={inputStyle()} />
              </Field>
            </div>

            <Field label="Detalle">
              <input value={form.detalle} onChange={(e) => patchForm({ detalle: e.target.value })} placeholder="Qué se compró o qué ingreso fue" style={inputStyle()} />
            </Field>

            <Field label="Notas">
              <textarea value={form.notas} onChange={(e) => patchForm({ notas: e.target.value })} placeholder="Opcional" rows={3} style={{ ...inputStyle(), resize: "vertical" }} />
            </Field>

            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ color: C.dim, fontSize: 12 }}>
                Vista previa: <strong style={{ color: form.tipo === "ingreso" ? C.green : C.red }}>{form.tipo === "ingreso" ? "+" : "-"} {fmtMoney(parseMoney(form.importe) || 0, form.moneda)}</strong>
                {form.proveedor ? ` · ${form.proveedor}` : ""}
                {form.centro_costo ? ` · ${form.centro_costo}` : ""}
              </div>
              <button type="submit" disabled={saving || missingTable || !selectedCierreId} style={primaryBtn(saving || missingTable || !selectedCierreId)}>
                <Plus size={14} /> Guardar
              </button>
            </div>
          </form>
        </section>

        <section style={cardStyle()}>
          <SectionTitle title="Pegar desde Excel" subtitle={selectedCierre ? "Pegá filas del cierre seleccionado. Primero analizamos y después importamos." : "Seleccioná un cierre antes de importar."} />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"14/05/2026\tUBER\tTRASLADO A PAMPA\tLOGISTICA\t3700\t\n14/05/2026\tVERONICA\tINGRESO CAJA\t\t\t12000000"}
            rows={8}
            style={{ ...inputStyle(), resize: "vertical", fontFamily: C.mono, fontSize: 12, lineHeight: 1.55 }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ color: C.dim, fontSize: 12 }}>
              {importRows.length
                ? `${importReady.length} listas · ${importReview} para revisar`
                : "Primero analizamos el pegado, después importamos."}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleAnalyzePaste} disabled={!pasteText.trim()} style={smallBtn(!pasteText.trim())}>
                <WandSparkles size={14} /> Analizar
              </button>
              <button type="button" onClick={handlePasteImport} disabled={saving || missingTable || !selectedCierreId || !importReady.length} style={primaryBtn(saving || missingTable || !selectedCierreId || !importReady.length)}>
                <Upload size={14} /> Importar listas
              </button>
            </div>
          </div>

          {importRows.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
              {importRows.map((row) => {
                const issues = rowIssues(row);
                const needsReview = issues.length > 0;
                return (
                  <div key={row.key} style={{
                    border: `1px solid ${needsReview ? C.amberB : C.greenB}`,
                    background: needsReview ? C.amberL : C.greenL,
                    borderRadius: 10,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong style={{ color: needsReview ? C.amber : C.green, fontSize: 12 }}>
                        {needsReview ? `Revisar: ${issues.join(", ")}` : "Lista para importar"}
                      </strong>
                      <span style={{ color: C.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.raw}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
                      <input type="date" value={row.fecha || ""} onChange={(e) => patchImportRow(row.key, { fecha: e.target.value })} style={miniInput()} />
                      <select value={row.tipo} onChange={(e) => patchImportRow(row.key, { tipo: e.target.value })} style={miniInput()}>
                        <option value="egreso">Egreso</option>
                        <option value="ingreso">Ingreso</option>
                      </select>
                      <select value={row.moneda || "ARS"} onChange={(e) => patchImportRow(row.key, { moneda: e.target.value })} style={miniInput()}>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                      <input value={row.proveedor || ""} onChange={(e) => patchImportRow(row.key, { proveedor: e.target.value })} placeholder="Proveedor" style={miniInput()} />
                      <input value={row.detalle || ""} onChange={(e) => patchImportRow(row.key, { detalle: e.target.value })} placeholder="Detalle" style={miniInput()} />
                      <input value={row.centro_costo || ""} onChange={(e) => patchImportRow(row.key, { centro_costo: e.target.value })} placeholder="Centro" style={miniInput()} />
                      <input value={row.importe || ""} onChange={(e) => patchImportRow(row.key, { importe: e.target.value })} placeholder="Importe" inputMode="decimal" style={{ ...miniInput(), textAlign: "right" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <section style={cardStyle({ padding: 0, overflow: "hidden" })}>
          <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: C.dim }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proveedor, detalle o centro..." style={{ ...inputStyle(), paddingLeft: 32 }} />
            </div>
            <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} style={inputStyle()}>
              <option value="todos">Todos</option>
              <option value="egreso">Egresos</option>
              <option value="ingreso">Ingresos</option>
            </select>
            <select value={centroFilter} onChange={(e) => setCentroFilter(e.target.value)} style={inputStyle()}>
              <option value="todos">Todos los centros</option>
              {centros.map((centro) => <option key={centro} value={centro}>{centro}</option>)}
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
              <thead>
                <tr>
                  {["Fecha", "Proveedor", "Detalle", "Centro", "Egreso", "Ingreso", ""].map((head) => (
                    <th key={head} style={thStyle()}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={emptyCell()}>Cargando caja chica...</td></tr>
                ) : filteredRows.length ? filteredRows.map((row) => {
                  const marcaRecibo = leerReciboDeNotas(row.notas);
                  return (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle({ whiteSpace: "nowrap", color: C.dim })}>{fmtDate(row.fecha)}</td>
                    <td style={tdStyle({ fontWeight: 750 })}>{row.proveedor || "-"}</td>
                    <td style={tdStyle()}>
                      <div>{row.detalle}</div>
                      {/* Borrador = el gasto está asentado pero el papel todavía
                          no salió. Es la lista de lo que falta imprimir. */}
                      {marcaRecibo && (
                        <div style={{ marginTop: 5 }}>
                          <span style={pill(marcaRecibo.estado === "borrador" ? C.blue : C.dim)}>
                            {marcaRecibo.estado === "borrador" ? "Recibo en borrador" : `Recibo ${marcaRecibo.numero}`}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle()}>
                      <span style={pill(C.blue)}>{row.centro_costo || "Sin centro"}</span>
                    </td>
                    <td style={tdStyle({ color: C.red, fontFamily: C.mono, fontWeight: 800 })}>
                      {row.tipo === "egreso" ? fmtMoney(row.importe, row.moneda) : "-"}
                    </td>
                    <td style={tdStyle({ color: C.green, fontFamily: C.mono, fontWeight: 800 })}>
                      {row.tipo === "ingreso" ? fmtMoney(row.importe, row.moneda) : "-"}
                    </td>
                    <td style={tdStyle({ textAlign: "right", whiteSpace: "nowrap" })}>
                      <button
                        type="button"
                        onClick={() => abrirReciboDeMovimiento(row)}
                        style={{ ...iconBtn(C.blue), marginRight: 6 }}
                        title={marcaRecibo?.estado === "borrador" ? "Completar e imprimir el recibo pendiente" : "Imprimir recibo de este movimiento"}
                      >
                        <Receipt size={14} />
                      </button>
                      <button type="button" onClick={() => handleDelete(row)} style={iconBtn(C.red)} title="Borrar">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr><td colSpan={7} style={emptyCell()}>No hay movimientos para mostrar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside style={{ display: "none" }}>
          <SectionTitle title="Centros de costo" subtitle="Egresos principales para revisar por obra o área." />
          <div style={{ display: "grid", gap: 8 }}>
            {centrosTop.length ? centrosTop.map((item) => (
              <div key={item.centro} style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13 }}>{item.centro}</strong>
                  <span style={{ fontFamily: C.mono, color: C.red, fontWeight: 850, fontSize: 12 }}>{fmtMoney(item.ARS)}</span>
                </div>
                <div style={{ marginTop: 5, color: C.dim, fontSize: 12 }}>
                  {item.count} movimientos{item.USD ? ` · ${fmtMoney(item.USD, "USD")}` : ""}
                </div>
              </div>
            )) : (
              <div style={{ color: C.dim, fontSize: 13, padding: "18px 0" }}>Sin centros cargados todavía.</div>
            )}
          </div>
        </aside>
      </div>

      {/* Cerrar: el resumen va antes de la confirmación, no después. Es el
          número por el que estás firmando. */}
      {cerrarOpen && selectedCierre && (
        <CajaModal
          titulo={`Cerrar ${selectedCierre.nombre}`}
          bajada="Después de cerrarla no se pueden cargar movimientos. Se puede reabrir, pero pide un motivo."
          onClose={() => setCerrarOpen(false)}
          pie={<>
            <button type="button" onClick={() => setCerrarOpen(false)} style={ghostBtn()}>Cancelar</button>
            <button type="button" onClick={confirmarCierre} disabled={cierreBusy}
              style={{ ...primaryBtn(cierreBusy), background: C.greenL, color: C.green, borderColor: C.greenB }}>
              {cierreBusy ? "Cerrando…" : "Cerrar la caja"}
            </button>
          </>}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {[
              ["Movimientos", String(totalesCaja.movimientos), C.text],
              ["Ingresos", fmtMoney(totalesCaja.ARS.ingresos, "ARS"), C.green],
              ["Egresos", fmtMoney(totalesCaja.ARS.egresos, "ARS"), C.red],
              ["Saldo", fmtMoney(totalesCaja.saldoArs, "ARS"), totalesCaja.saldoArs < 0 ? C.red : C.blue],
            ].map(([label, valor, color]) => (
              <div key={label} style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 10, padding: "9px 11px" }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                <div style={{ color, fontFamily: C.mono, fontSize: 16, fontWeight: 950, marginTop: 3 }}>{valor}</div>
              </div>
            ))}
          </div>
          {(totalesCaja.USD.ingresos > 0 || totalesCaja.USD.egresos > 0) && (
            <div style={{ color: C.muted, fontSize: 12 }}>
              En dólares: ingresos {fmtMoney(totalesCaja.USD.ingresos, "USD")} · egresos {fmtMoney(totalesCaja.USD.egresos, "USD")} · saldo <strong>{fmtMoney(totalesCaja.saldoUsd, "USD")}</strong>
            </div>
          )}
          {totalesCaja.movimientos === 0 && (
            <div style={{ color: C.red, fontSize: 12, fontWeight: 800 }}>
              Ojo: esta caja no tiene ningún movimiento cargado.
            </div>
          )}
        </CajaModal>
      )}

      {reabrirOpen && selectedCierre && (
        <CajaModal
          titulo={`Reabrir ${selectedCierre.nombre}`}
          bajada="Queda registrado con fecha en las notas de la caja."
          onClose={() => { setReabrirOpen(false); setReabrirMotivo(""); }}
          pie={<>
            <button type="button" onClick={() => { setReabrirOpen(false); setReabrirMotivo(""); }} style={ghostBtn()}>Cancelar</button>
            <button type="button" onClick={confirmarReapertura} disabled={cierreBusy || !reabrirMotivo.trim()}
              style={primaryBtn(cierreBusy || !reabrirMotivo.trim())}>
              {cierreBusy ? "Reabriendo…" : "Reabrir"}
            </button>
          </>}
        >
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>¿Por qué la reabrís?</span>
            <input
              autoFocus
              value={reabrirMotivo}
              onChange={(event) => setReabrirMotivo(event.target.value)}
              placeholder="Ej: faltó cargar el remito del 8/8"
              style={inputStyle()}
            />
          </label>
        </CajaModal>
      )}

      {recibo && (
        <ReciboModal
          initial={recibo.initial}
          puedeRegistrar={recibo.puedeRegistrar}
          cajas={cajasAbiertas}
          cajaIdInicial={cajaCerrada ? "" : selectedCierreId}
          onRegistrar={registrarEgresoDeRecibo}
          onEmitido={marcarReciboEmitido}
          onClose={() => setRecibo(null)}
        />
      )}
    </div>
  );
}

// Modal chico y propio: los de esta pantalla son dos preguntas cortas y no
// justifican arrastrar un componente más pesado.
function CajaModal({ titulo, bajada, onClose, children, pie }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.5)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(470px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.28)", display: "grid" }}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{titulo}</div>
          {bajada && <div style={{ color: C.dim, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{bajada}</div>}
        </div>
        <div style={{ padding: 16, display: "grid", gap: 11 }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>{pie}</div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div style={cardStyle({ display: "flex", alignItems: "center", gap: 12 })}>
      <div style={{
        width: 34,
        height: 34,
        display: "grid",
        placeItems: "center",
        borderRadius: 10,
        background: `${color}18`,
        color,
        border: `1px solid ${color}44`,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color, fontFamily: C.mono, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{value}</div>
        <div style={{ marginTop: 5, color: C.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>{label}</div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 850 }}>{title}</h3>
      {subtitle && <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 12, lineHeight: 1.35 }}>{subtitle}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 850 }}>{label}</span>
      {children}
    </label>
  );
}

function cardStyle(extra = {}) {
  return {
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    borderRadius: 13,
    padding: 14,
    boxShadow: "0 12px 30px var(--shadow)",
    ...extra,
  };
}

function inputStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${C.border}`,
    background: C.panelSolid2,
    color: C.text,
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    fontWeight: 650,
    outline: "none",
    fontFamily: C.sans,
  };
}

function miniInput() {
  return {
    ...inputStyle(),
    padding: "7px 8px",
    fontSize: 12,
    borderRadius: 7,
  };
}

function ghostBtn() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.muted,
    borderRadius: 9,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: C.sans,
  };
}

function primaryBtn(disabled = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${disabled ? C.border : C.blueB}`,
    background: disabled ? C.panel2 : C.blue,
    color: disabled ? C.dim : "var(--inverse-text)",
    borderRadius: 9,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 850,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function smallBtn(disabled = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    color: disabled ? C.dim : C.text,
    borderRadius: 9,
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function iconBtn(color) {
  return {
    width: 30,
    height: 30,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 8,
    border: `1px solid ${color}44`,
    background: `${color}12`,
    color,
    cursor: "pointer",
  };
}

function pill(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: 999,
    border: `1px solid ${color}44`,
    background: `${color}12`,
    color,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 850,
  };
}

function thStyle() {
  return {
    textAlign: "left",
    padding: "10px 12px",
    color: C.dim,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: 850,
    background: C.panel2,
    borderBottom: `1px solid ${C.border}`,
  };
}

function tdStyle(extra = {}) {
  return {
    padding: "11px 12px",
    color: C.text,
    fontSize: 13,
    verticalAlign: "top",
    ...extra,
  };
}

function emptyCell() {
  return {
    padding: 28,
    color: C.dim,
    textAlign: "center",
    fontSize: 13,
  };
}
