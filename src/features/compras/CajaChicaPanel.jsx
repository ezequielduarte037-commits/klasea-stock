import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ClipboardList,
  DollarSign,
  FileDown,
  Plus,
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
  createCajaChicaEntries,
  createCajaChicaEntry,
  deleteCajaChicaEntry,
  fetchCajaChicaEntries,
} from "@/features/compras/cajaChicaApi";
import { C } from "@/theme";

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

function reportDateLabel(from, to) {
  if (from && to) return `${fmtDate(from)} a ${fmtDate(to)}`;
  if (from) return `desde ${fmtDate(from)}`;
  if (to) return `hasta ${fmtDate(to)}`;
  return "todos los movimientos";
}

function exportPdfReport({ rows, stats, dateFrom, dateTo }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 42;
  const navy = [15, 23, 42];
  const muted = [98, 107, 123];
  const border = [220, 224, 230];

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Caja chica", left, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Periodo: ${reportDateLabel(dateFrom, dateTo)} - ${rows.length} movimientos`, left, 74);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 24, 31);
  doc.text(`Saldo ARS: ${fmtMoney(stats.ARS.ingresos - stats.ARS.egresos)}`, left, 104);
  doc.text(`Ingresos: ${fmtMoney(stats.ARS.ingresos)}`, left + 180, 104);
  doc.text(`Egresos: ${fmtMoney(stats.ARS.egresos)}`, left + 340, 104);

  autoTable(doc, {
    startY: 126,
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

  doc.save(`caja-chica-${dateFrom || "inicio"}-${dateTo || "hoy"}.pdf`);
}

function lowerText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function CajaChicaPanel() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [centroFilter, setCentroFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importRows, setImportRows] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchCajaChicaEntries();
      setRows(result.rows);
      setMissingTable(Boolean(result.missingTable));
    } catch (error) {
      toast.error(error?.message || "No se pudo cargar caja chica");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centros = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.centro_costo).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b), "es"));
  }, [rows]);

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

  const stats = useMemo(() => {
    const base = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
    filteredRows.forEach((row) => {
      const currency = row.moneda === "USD" ? "USD" : "ARS";
      const amount = Number(row.importe || 0);
      if (row.tipo === "ingreso") base[currency].ingresos += amount;
      else base[currency].egresos += amount;
    });
    return base;
  }, [filteredRows]);

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

  const saldoArs = stats.ARS.ingresos - stats.ARS.egresos;
  const saldoUsd = stats.USD.ingresos - stats.USD.egresos;

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const importe = parseMoney(form.importe);
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
      await createCajaChicaEntry({ ...form, importe });
      setForm(EMPTY_FORM);
      await load();
      toast.success("Movimiento guardado.");
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasteImport() {
    if (!importReady.length) {
      toast.warning("No encontré filas listas para importar.");
      return;
    }
    setSaving(true);
    try {
      await createCajaChicaEntries(importReady.map(normalizeImportRow));
      setPasteText("");
      setImportRows([]);
      await load();
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

  async function handleDelete(row) {
    const ok = window.confirm(`¿Borrar movimiento "${row.detalle}"?`);
    if (!ok) return;
    try {
      await deleteCajaChicaEntry(row.id);
      await load();
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
    a.download = `caja-chica-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!filteredRows.length) {
      toast.warning("No hay movimientos para exportar.");
      return;
    }
    exportPdfReport({ rows: filteredRows, stats, dateFrom, dateTo });
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
            Movimientos de ingreso y egreso por proveedor, detalle y centro de costo.
          </p>
        </div>
        <button type="button" onClick={load} style={smallBtn()}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" onClick={exportCsv} disabled={!filteredRows.length} style={smallBtn(!filteredRows.length)}>
          <Upload size={14} /> CSV
        </button>
        <button type="button" onClick={exportPdf} disabled={!filteredRows.length} style={smallBtn(!filteredRows.length)}>
          <FileDown size={14} /> PDF
        </button>
      </div>

      {missingTable && (
        <div style={{
          border: `1px solid ${C.amberB}`,
          background: C.amberL,
          color: C.text,
          borderRadius: 12,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.45,
        }}>
          Falta crear la tabla de caja chica en Supabase. Te dejo el SQL idempotente al final del mensaje para pegarlo en el SQL Editor.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <Kpi icon={<DollarSign size={16} />} label="Saldo ARS" value={fmtMoney(saldoArs)} color={saldoArs < 0 ? C.red : C.green} />
        <Kpi icon={<TrendingUp size={16} />} label="Ingresos" value={fmtMoney(stats.ARS.ingresos)} color={C.green} />
        <Kpi icon={<TrendingDown size={16} />} label="Egresos" value={fmtMoney(stats.ARS.egresos)} color={C.red} />
        <Kpi icon={<ClipboardList size={16} />} label="Movimientos" value={String(filteredRows.length)} color={C.blue} />
        {stats.USD.ingresos || stats.USD.egresos ? (
          <Kpi icon={<DollarSign size={16} />} label="Saldo USD" value={fmtMoney(saldoUsd, "USD")} color={saldoUsd < 0 ? C.red : C.green} />
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <section style={cardStyle()}>
          <SectionTitle title="Nuevo movimiento" subtitle="Mismo criterio que la planilla: fecha, proveedor, detalle, centro e importe." />
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
              <button type="submit" disabled={saving || missingTable} style={primaryBtn(saving || missingTable)}>
                <Plus size={14} /> Guardar
              </button>
            </div>
          </form>
        </section>

        <section style={cardStyle()}>
          <SectionTitle title="Pegar desde Excel" subtitle="Copiá filas de la planilla con columnas Fecha, Proveedor, Detalle, Centro, Importe e Ingreso." />
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
              <button type="button" onClick={handlePasteImport} disabled={saving || missingTable || !importReady.length} style={primaryBtn(saving || missingTable || !importReady.length)}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
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
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Desde" style={inputStyle()} />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Hasta" style={inputStyle()} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={useCurrentMonth} style={smallBtn()}>Este mes</button>
              <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} style={smallBtn()}>Todo</button>
            </div>
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
                ) : filteredRows.length ? filteredRows.map((row) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle({ whiteSpace: "nowrap", color: C.dim })}>{fmtDate(row.fecha)}</td>
                    <td style={tdStyle({ fontWeight: 750 })}>{row.proveedor || "-"}</td>
                    <td style={tdStyle()}>{row.detalle}</td>
                    <td style={tdStyle()}>
                      <span style={pill(C.blue)}>{row.centro_costo || "Sin centro"}</span>
                    </td>
                    <td style={tdStyle({ color: C.red, fontFamily: C.mono, fontWeight: 800 })}>
                      {row.tipo === "egreso" ? fmtMoney(row.importe, row.moneda) : "-"}
                    </td>
                    <td style={tdStyle({ color: C.green, fontFamily: C.mono, fontWeight: 800 })}>
                      {row.tipo === "ingreso" ? fmtMoney(row.importe, row.moneda) : "-"}
                    </td>
                    <td style={tdStyle({ textAlign: "right" })}>
                      <button type="button" onClick={() => handleDelete(row)} style={iconBtn(C.red)} title="Borrar">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} style={emptyCell()}>No hay movimientos para mostrar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside style={cardStyle()}>
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
