import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoKUrl from "@/assets/logos/logo-k.png";
import {
  CalendarRange,
  ChevronDown,
  FileDown,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  Upload,
  Wallet,
  WandSparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Cargando from "@/components/ui/Cargando";
import { CSS_COMPRAS_MODULO } from "./estilos";
import { Aviso, Buscar, Cabecera, Modal, Vacio } from "./ui";
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

  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
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
  // Una caja cerrada esta rendida: no se borra, pero tampoco tiene por que
  // seguir ocupando la lista de las que se usan.
  const [verCerradas, setVerCerradas] = useState(false);
  // La administración de cierres arranca plegada: la barra de arriba ya dice en
  // cuál se está parado, que es lo único que hace falta saber para cargar.
  const [verCierres, setVerCierres] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [missingClosuresTable, setMissingClosuresTable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [centroFilter, setCentroFilter] = useState("todos");
  const [pasteText, setPasteText] = useState("");
  const [importRows, setImportRows] = useState([]);
  // Recibo imprimible: el mismo papel que se llenaba a mano. Sale de un
  // movimiento ya cargado, o se arma suelto y de paso queda asentado.
  const [recibo, setRecibo] = useState(null);
  const [pegarOpen, setPegarOpen] = useState(false);
  const confirm = useConfirm();

  // null = caja de compras; uuid = caja del cadete seleccionado.
  const ownerId = lockedOwnerId != null ? lockedOwnerId : (ownerSel === CAJA_COMPRAS ? null : ownerSel);

  useEffect(() => {
    if (lockedOwnerId != null) return; // caja fija: no hace falta el selector de dueños
    fetchProfiles()
      .then((rows) => setOwners((rows || []).filter((p) => p.role === "cadete")))
      .catch(() => setOwners([]));
  }, [lockedOwnerId]);

  async function loadCierres(preferredId = selectedCierreId) {
    setLoading(true);
    try {
      const result = await fetchCajaChicaClosures({ ownerId });
      const nextCierres = result.rows;
      setCierres(nextCierres);
      setMissingClosuresTable(Boolean(result.missingTable));
      // Al entrar, la caja de trabajo es siempre la abierta. Antes se tomaba
      // simplemente el primer cierre ordenado por fecha y, si era una caja
      // cerrada, quedaba seleccionada como principal aunque hubiera otra lista
      // para seguir cargando movimientos.
      const preferred = nextCierres.find((cierre) => cierre.id === preferredId);
      const abierta = nextCierres.find((cierre) => cierre.estado !== "cerrado");
      const siguiente = preferred && preferred.estado !== "cerrado"
        ? preferred
        : (abierta || preferred || nextCierres[0]);
      setSelectedCierreId(siguiente?.id || "");
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
      if (!q) return true;
      return lowerText(`${row.fecha} ${row.proveedor} ${row.detalle} ${row.centro_costo}`).includes(q);
    });
  }, [centroFilter, query, rows, tipoFilter]);

  const importReady = useMemo(() => importRows.filter((row) => rowIssues(row).length === 0), [importRows]);
  const importReview = importRows.length - importReady.length;

  const cajaCerrada = selectedCierre?.estado === "cerrado";

  // Abiertas arriba y siempre a la vista. Cerradas detras de un desplegable y
  // de la mas nueva a la mas vieja: son historial, no lugares donde cargar.
  const cierresAbiertos = useMemo(
    () => cierres.filter((cierre) => cierre.estado !== "cerrado"),
    [cierres],
  );
  const cierresCerrados = useMemo(() => {
    const cuando = (cierre) => cierre.fecha_hasta || cierre.fecha_desde || cierre.created_at || "";
    return cierres
      .filter((cierre) => cierre.estado === "cerrado")
      .sort((a, b) => String(cuando(b)).localeCompare(String(cuando(a))));
  }, [cierres]);

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
      // Si la caja se creó sin fecha de inicio, se toma la del movimiento más
      // viejo: una caja rendida que figura "sin fechas" no se puede archivar
      // ni buscar después.
      const masViejo = rows
        .map((row) => row.fecha)
        .filter(Boolean)
        .sort()[0];
      await updateCajaChicaClosure(selectedCierre.id, {
        estado: "cerrado",
        fecha_hasta: selectedCierre.fecha_hasta || new Date().toISOString().slice(0, 10),
        ...(selectedCierre.fecha_desde || !masViejo ? {} : { fecha_desde: masViejo }),
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
      setPegarOpen(false);
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
    const ok = await confirm({ title: "Borrar movimiento", message: `Se borra «${row.detalle}» de la caja.`, confirmLabel: "Borrar", tone: "danger" });
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

  const opcionesCaja = [{ id: CAJA_COMPRAS, label: "Compras" }, ...owners.map((o) => ({ id: o.id, label: o.username }))];
  const conUsd = totalesCaja.USD.ingresos > 0 || totalesCaja.USD.egresos > 0;
  const tarjetaCierre = (cierre) => {
    const elegida = selectedCierreId === cierre.id;
    const cerrada = cierre.estado === "cerrado";
    return (
      <button
        key={cierre.id}
        type="button"
        className={`cmp-caja-op${elegida ? " on" : ""}`}
        onClick={() => { setSelectedCierreId(cierre.id); setVerCierres(false); }}
      >
        <span style={{ minWidth: 0 }}>
          <b>{cierre.nombre}</b>
          <small><CalendarRange size={12} /> {cierreDateLabel(cierre)}{cierre.notas ? ` · ${cierre.notas.split("\n")[0]}` : ""}</small>
        </span>
        {/* Abierta = azul (está en uso), cerrada = apagada (ya está rendida). */}
        <span className="cmp-estado" data-tono={cerrada ? "neutro" : "azul"}>{cerrada ? "Cerrada" : "Abierta"}</span>
      </button>
    );
  };

  return (
    <div className="cmp-ambito cmp-caja">
      <style href="klasea-compras" precedence="default">{CSS_COMPRAS_MODULO}</style>

      <Cabecera
        eyebrow="Compras · Gastos"
        titulo="Caja"
        acento="chica"
        sub="Movimientos organizados por cajas: una por semana o por período, y se cierran al rendir."
        acciones={(
          <>
            <button type="button" className="ui-btn ui-btn-suave chico" onClick={abrirReciboNuevo} title="Armar un recibo para que lo firmen"><Receipt size={14} /> Recibo</button>
            <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={exportCsv} disabled={!filteredRows.length}><Upload size={14} /> CSV</button>
            <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={exportPdf} disabled={!filteredRows.length}><FileDown size={14} /> PDF</button>
            <button type="button" className="cmp-btn-ic" onClick={refreshAll} title="Volver a leer" aria-label="Volver a leer la caja"><RefreshCw size={15} /></button>
          </>
        )}
      />

      {(missingTable || missingClosuresTable) && (
        <Aviso tono="cian">Falta aplicar el SQL de caja chica con cierres en Supabase.</Aviso>
      )}

      {!lockedOwnerId && owners.length > 0 && (
        <div className="cmp-filtros">
          <span className="cmp-rotulo">Caja de</span>
          <div className="cmp-seg" role="radiogroup" aria-label="De quién es la caja">
            {opcionesCaja.map((opt) => (
              <button key={opt.id} type="button" role="radio" aria-checked={ownerSel === opt.id} className={ownerSel === opt.id ? "on" : ""} onClick={() => setOwnerSel(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* La caja en la que se está cargando: cuál es y cuánto tiene. Es lo
          primero que hay que saber antes de anotar un gasto. */}
      <section className={`cmp-caja-actual${cajaCerrada ? " cerrada" : ""}`}>
        <div className="cmp-caja-nombre">
          <span className="cmp-bloque-ic" data-tono={cajaCerrada ? "neutro" : "azul"}><Wallet size={18} /></span>
          <span style={{ minWidth: 0 }}>
            <b>{selectedCierre?.nombre || (loading ? "Cargando…" : "Sin caja elegida")}</b>
            <small>
              {selectedCierre ? <>{cierreDateLabel(selectedCierre)} · {totalesCaja.movimientos} {totalesCaja.movimientos === 1 ? "movimiento" : "movimientos"} · {cajaCerrada ? "cerrada, no admite carga" : "en uso"}</> : "Creá una caja para empezar a cargar."}
            </small>
          </span>
        </div>
        <div className="cmp-caja-cifras">
          <div><span>Ingresos</span><b className="mono" data-tono="verde">{fmtMoney(totalesCaja.ARS.ingresos, "ARS")}</b></div>
          <div><span>Egresos</span><b className="mono" data-tono="rojo">{fmtMoney(totalesCaja.ARS.egresos, "ARS")}</b></div>
          <div className="saldo">
            <span>Saldo</span>
            <b className="mono" data-tono={totalesCaja.saldoArs < 0 ? "rojo" : undefined}>{fmtMoney(totalesCaja.saldoArs, "ARS")}</b>
            {conUsd && <small className="mono">{fmtMoney(totalesCaja.saldoUsd, "USD")}</small>}
          </div>
        </div>
        <div className="cmp-caja-acc">
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setVerCierres(true)}>
            <ChevronDown size={14} /> Cambiar de caja <span className="mono" style={{ color: "var(--subtle)" }}>{cierres.length}</span>
          </button>
          {selectedCierre && (cajaCerrada ? (
            <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setReabrirOpen(true)}>Reabrir</button>
          ) : (
            <button type="button" className="ui-btn chico" data-tono="verde" onClick={() => setCerrarOpen(true)}>Cerrar caja</button>
          ))}
        </div>
      </section>

      <div className="cmp-caja-grilla">
        {/* Movimientos: lo que se viene a mirar. */}
        <section className="cmp-bloque" style={{ minWidth: 0 }}>
          <div className="cmp-bloque-cab">
            <div className="cmp-filtros" style={{ flex: 1 }}>
              <Buscar value={query} onChange={setQuery} placeholder="Buscar proveedor, detalle o centro…" />
              <div className="cmp-seg" role="radiogroup" aria-label="Tipo de movimiento">
                {[["todos", "Todos"], ["egreso", "Egresos"], ["ingreso", "Ingresos"]].map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={tipoFilter === v} className={tipoFilter === v ? "on" : ""} onClick={() => setTipoFilter(v)}>{l}</button>
                ))}
              </div>
              {centros.length > 0 && (
                <select className="ui-input" style={{ width: "auto", minHeight: 36 }} value={centroFilter} onChange={(e) => setCentroFilter(e.target.value)} aria-label="Centro de costo">
                  <option value="todos">Todos los centros</option>
                  {centros.map((centro) => <option key={centro} value={centro}>{centro}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="cmp-bloque-cuerpo sin-pad">
            {loading ? (
              <Cargando texto="Trayendo la caja…" />
            ) : !filteredRows.length ? (
              <Vacio icono={Wallet} titulo={rows.length ? "Ningún movimiento coincide" : "Todavía no hay movimientos"} texto={rows.length ? "Probá con otro término o sacá el filtro." : "Cargá el primero acá al lado o pegá filas desde Excel."} />
            ) : (
              <div className="cmp-tabla" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
                <table className="cmp-t" style={{ minWidth: 720 }}>
                  <thead>
                    <tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th>Centro</th><th className="der">Importe</th><th /></tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const marcaRecibo = leerReciboDeNotas(row.notas);
                      const ingreso = row.tipo === "ingreso";
                      return (
                        <tr key={row.id}>
                          <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--dim)", fontSize: 12.5 }}>{fmtDate(row.fecha)}</td>
                          <td className="nom" style={{ whiteSpace: "nowrap" }}>{row.proveedor || "—"}</td>
                          <td>
                            <div>{row.detalle}</div>
                            {/* Borrador = el gasto está asentado pero el papel todavía no salió. */}
                            {marcaRecibo && (
                              <span className="cmp-tag" data-tono={marcaRecibo.estado === "borrador" ? "azul" : "neutro"} style={{ marginTop: 5 }}>
                                {marcaRecibo.estado === "borrador" ? "Recibo en borrador" : `Recibo ${marcaRecibo.numero}`}
                              </span>
                            )}
                          </td>
                          <td>{row.centro_costo ? <span className="cmp-tag" data-tono="azul">{row.centro_costo}</span> : <span className="cmp-ayuda">sin centro</span>}</td>
                          <td className="der mono" style={{ fontWeight: 650, whiteSpace: "nowrap", color: ingreso ? "var(--green)" : "var(--red)" }}>
                            {ingreso ? "+" : "−"} {fmtMoney(row.importe, row.moneda)}
                          </td>
                          <td className="der" style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              className="cmp-btn-ic chico"
                              onClick={() => abrirReciboDeMovimiento(row)}
                              title={marcaRecibo?.estado === "borrador" ? "Completar e imprimir el recibo pendiente" : "Imprimir el recibo de este movimiento"}
                              aria-label="Recibo"
                              style={{ display: "inline-grid", marginRight: 6 }}
                            >
                              <Receipt size={14} />
                            </button>
                            <button type="button" className="cmp-btn-ic chico peligro" onClick={() => handleDelete(row)} title="Borrar" aria-label={`Borrar ${row.detalle}`} style={{ display: "inline-grid" }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Carga rápida, al costado: se carga sin perder de vista la caja. */}
        <aside className="cmp-bloque cmp-caja-carga">
          <div className="cmp-bloque-cab">
            <div style={{ minWidth: 0 }}>
              <h2 className="cmp-bloque-tit">Nuevo movimiento</h2>
              <p className="cmp-bloque-txt">{selectedCierre ? (cajaCerrada ? "Esta caja está cerrada: reabrila para corregir." : `Va a ${selectedCierre.nombre}.`) : "Primero elegí o creá una caja."}</p>
            </div>
          </div>
          <div className="cmp-bloque-cuerpo">
            <form onSubmit={handleSubmit} className="cmp-form">
              <div className="cmp-campo c6">
                <div className="cmp-seg" role="radiogroup" aria-label="Tipo" style={{ justifySelf: "start" }}>
                  <button type="button" role="radio" aria-checked={form.tipo === "egreso"} className={form.tipo === "egreso" ? "on" : ""} data-tono={form.tipo === "egreso" ? "rojo" : undefined} onClick={() => patchForm({ tipo: "egreso" })}>Egreso</button>
                  <button type="button" role="radio" aria-checked={form.tipo === "ingreso"} className={form.tipo === "ingreso" ? "on" : ""} data-tono={form.tipo === "ingreso" ? "verde" : undefined} onClick={() => patchForm({ tipo: "ingreso" })}>Ingreso</button>
                </div>
              </div>
              <label className="cmp-campo c4"><span>Importe</span>
                <input className="ui-input num" value={form.importe} onChange={(e) => patchForm({ importe: e.target.value })} placeholder="0" inputMode="decimal" style={{ textAlign: "right" }} />
              </label>
              <label className="cmp-campo c2"><span>Moneda</span>
                <select className="ui-input" value={form.moneda} onChange={(e) => patchForm({ moneda: e.target.value })}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="cmp-campo c6"><span>Detalle</span>
                <input className="ui-input" value={form.detalle} onChange={(e) => patchForm({ detalle: e.target.value })} placeholder="Qué se compró o qué ingreso fue" />
              </label>
              <label className="cmp-campo"><span>Proveedor</span>
                <input className="ui-input" value={form.proveedor} onChange={(e) => patchForm({ proveedor: e.target.value })} placeholder="Uber, Iriarte…" />
              </label>
              <label className="cmp-campo"><span>Centro de costo</span>
                <input className="ui-input" value={form.centro_costo} onChange={(e) => patchForm({ centro_costo: e.target.value })} placeholder="55-4, logística…" list="cmp-caja-centros" />
                <datalist id="cmp-caja-centros">{centros.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label className="cmp-campo"><span>Fecha</span>
                <input type="date" className="ui-input" value={form.fecha} onChange={(e) => patchForm({ fecha: e.target.value })} />
              </label>
              <label className="cmp-campo"><span>Notas</span>
                <input className="ui-input" value={form.notas} onChange={(e) => patchForm({ notas: e.target.value })} placeholder="Opcional" />
              </label>
              <div className="cmp-campo c6 cmp-caja-previa">
                <span className="mono" data-tono={form.tipo === "ingreso" ? "verde" : "rojo"}>{form.tipo === "ingreso" ? "+" : "−"} {fmtMoney(parseMoney(form.importe) || 0, form.moneda)}</span>
                <button type="submit" className="ui-btn ui-btn-primario chico" disabled={saving || missingTable || !selectedCierreId || cajaCerrada}><Plus size={14} /> Guardar</button>
              </div>
            </form>
            <button type="button" className="cmp-link" style={{ marginTop: 12 }} onClick={() => setPegarOpen(true)} disabled={!selectedCierreId || cajaCerrada}>
              <WandSparkles size={13} style={{ verticalAlign: -2 }} /> Pegar varias filas desde Excel
            </button>
          </div>
        </aside>
      </div>

      {/* ── Cambiar de caja o crear una ── */}
      {verCierres && (
        <Modal
          icono={Wallet}
          titulo="Cajas"
          sub="Elegí en cuál cargar, o creá una nueva para la semana o el período."
          ancho
          onCerrar={() => setVerCierres(false)}
        >
          <div className="cmp-caja-cajas">
            <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <div className="cmp-rotulo">Abiertas</div>
              {cierresAbiertos.length ? cierresAbiertos.map(tarjetaCierre) : <p className="cmp-ayuda">No hay ninguna caja abierta: creá una acá al lado.</p>}
              {cierresCerrados.length > 0 && (
                <>
                  <button type="button" className="cmp-link" style={{ justifySelf: "start", marginTop: 8 }} onClick={() => setVerCerradas((v) => !v)}>
                    {verCerradas ? "Ocultar las cerradas" : `Ver las cerradas · ${cierresCerrados.length}`}
                  </button>
                  {verCerradas && cierresCerrados.map(tarjetaCierre)}
                </>
              )}
            </div>
            <form onSubmit={handleCreateCierre} className="cmp-form cmp-caja-nueva">
              <div className="cmp-campo c6 cmp-rotulo">Nueva caja</div>
              <label className="cmp-campo c6"><span>Nombre</span>
                <input className="ui-input" value={cierreForm.nombre} onChange={(e) => patchCierreForm({ nombre: e.target.value })} placeholder="Ej.: Semana del 14/05 al 21/05" />
              </label>
              <label className="cmp-campo"><span>Desde</span>
                <input type="date" className="ui-input" value={cierreForm.fecha_desde} onChange={(e) => patchCierreForm({ fecha_desde: e.target.value })} />
              </label>
              <label className="cmp-campo"><span>Hasta</span>
                <input type="date" className="ui-input" value={cierreForm.fecha_hasta} onChange={(e) => patchCierreForm({ fecha_hasta: e.target.value })} />
              </label>
              <label className="cmp-campo c6"><span>Notas</span>
                <input className="ui-input" value={cierreForm.notas} onChange={(e) => patchCierreForm({ notas: e.target.value })} placeholder="Opcional: feriado, semana corta…" />
              </label>
              <div className="cmp-campo c6" style={{ justifyItems: "end" }}>
                <button type="submit" className="ui-btn ui-btn-primario chico" disabled={saving || missingClosuresTable}><Plus size={14} /> Crear caja</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── Pegar desde Excel ── */}
      {pegarOpen && (
        <Modal
          icono={WandSparkles}
          titulo="Pegar desde Excel"
          sub={selectedCierre ? `Pegá las filas y revisalas antes de importar. Van a ${selectedCierre.nombre}.` : "Elegí una caja antes de importar."}
          ancho
          onCerrar={() => setPegarOpen(false)}
          bloqueado={saving}
          pie={(
            <>
              <div className="izq">{importRows.length ? `${importReady.length} listas · ${importReview} para revisar` : "Primero se analiza, después se importa."}</div>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={handleAnalyzePaste} disabled={!pasteText.trim()}><WandSparkles size={14} /> Analizar</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={async () => { await handlePasteImport(); }} disabled={saving || missingTable || !selectedCierreId || !importReady.length}><Upload size={14} /> Importar {importReady.length || ""}</button>
            </>
          )}
        >
          <textarea
            className="ui-input mono"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"14/05/2026\tUBER\tTRASLADO A PAMPA\tLOGISTICA\t3700\t\n14/05/2026\tVERONICA\tINGRESO CAJA\t\t\t12000000"}
            rows={7}
            style={{ fontSize: 12, lineHeight: 1.55 }}
          />
          {importRows.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {importRows.map((row) => {
                const issues = rowIssues(row);
                const revisar = issues.length > 0;
                return (
                  <div key={row.key} className="cmp-caja-imp" data-tono={revisar ? "cian" : "verde"}>
                    <div className="cab">
                      <b>{revisar ? `Revisar: ${issues.join(", ")}` : "Lista para importar"}</b>
                      <small>{row.raw}</small>
                    </div>
                    <div className="campos">
                      <input type="date" className="ui-input" value={row.fecha || ""} onChange={(e) => patchImportRow(row.key, { fecha: e.target.value })} aria-label="Fecha" />
                      <select className="ui-input" value={row.tipo} onChange={(e) => patchImportRow(row.key, { tipo: e.target.value })} aria-label="Tipo">
                        <option value="egreso">Egreso</option>
                        <option value="ingreso">Ingreso</option>
                      </select>
                      <select className="ui-input" value={row.moneda || "ARS"} onChange={(e) => patchImportRow(row.key, { moneda: e.target.value })} aria-label="Moneda">
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                      <input className="ui-input" value={row.proveedor || ""} onChange={(e) => patchImportRow(row.key, { proveedor: e.target.value })} placeholder="Proveedor" aria-label="Proveedor" />
                      <input className="ui-input" value={row.detalle || ""} onChange={(e) => patchImportRow(row.key, { detalle: e.target.value })} placeholder="Detalle" aria-label="Detalle" />
                      <input className="ui-input" value={row.centro_costo || ""} onChange={(e) => patchImportRow(row.key, { centro_costo: e.target.value })} placeholder="Centro" aria-label="Centro" />
                      <input className="ui-input num" value={row.importe || ""} onChange={(e) => patchImportRow(row.key, { importe: e.target.value })} placeholder="Importe" inputMode="decimal" style={{ textAlign: "right" }} aria-label="Importe" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Cerrar: el resumen va antes de la confirmación. Es el número por el que se firma. */}
      {cerrarOpen && selectedCierre && (
        <Modal
          icono={Wallet}
          tono="verde"
          titulo={`Cerrar ${selectedCierre.nombre}`}
          sub="Después de cerrarla no se pueden cargar movimientos. Se puede reabrir, pero pide un motivo."
          onCerrar={() => setCerrarOpen(false)}
          bloqueado={cierreBusy}
          pie={(
            <>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setCerrarOpen(false)}>Cancelar</button>
              <button type="button" className="ui-btn" data-tono="verde" onClick={confirmarCierre} disabled={cierreBusy}>{cierreBusy ? "Cerrando…" : "Cerrar la caja"}</button>
            </>
          )}
        >
          <div className="cmp-caja-cifras modal">
            <div><span>Movimientos</span><b className="mono">{totalesCaja.movimientos}</b></div>
            <div><span>Ingresos</span><b className="mono" data-tono="verde">{fmtMoney(totalesCaja.ARS.ingresos, "ARS")}</b></div>
            <div><span>Egresos</span><b className="mono" data-tono="rojo">{fmtMoney(totalesCaja.ARS.egresos, "ARS")}</b></div>
            <div className="saldo"><span>Saldo</span><b className="mono" data-tono={totalesCaja.saldoArs < 0 ? "rojo" : "azul"}>{fmtMoney(totalesCaja.saldoArs, "ARS")}</b></div>
          </div>
          {conUsd && (
            <p className="cmp-ayuda">En dólares: ingresos {fmtMoney(totalesCaja.USD.ingresos, "USD")} · egresos {fmtMoney(totalesCaja.USD.egresos, "USD")} · saldo <b>{fmtMoney(totalesCaja.saldoUsd, "USD")}</b></p>
          )}
          {totalesCaja.movimientos === 0 && <Aviso tono="rojo">Ojo: esta caja no tiene ningún movimiento cargado.</Aviso>}
        </Modal>
      )}

      {reabrirOpen && selectedCierre && (
        <Modal
          icono={Wallet}
          titulo={`Reabrir ${selectedCierre.nombre}`}
          sub="El motivo queda registrado con fecha en las notas de la caja."
          onCerrar={() => { setReabrirOpen(false); setReabrirMotivo(""); }}
          bloqueado={cierreBusy}
          pie={(
            <>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => { setReabrirOpen(false); setReabrirMotivo(""); }}>Cancelar</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={confirmarReapertura} disabled={cierreBusy || !reabrirMotivo.trim()}>{cierreBusy ? "Reabriendo…" : "Reabrir"}</button>
            </>
          )}
        >
          <label className="cmp-campo c6"><span>¿Por qué la reabrís?</span>
            <input className="ui-input" autoFocus value={reabrirMotivo} onChange={(event) => setReabrirMotivo(event.target.value)} placeholder="Ej.: faltó cargar el remito del 8/8" />
          </label>
        </Modal>
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
