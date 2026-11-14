import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ABAJO, GRIS, MARGEN, ROJO, cifras, encabezado, encabezadoContinuacion, fechaRotulo, pie, tablaKlasea,
} from "@/lib/pdfKlasea";

// Rendición de caja chica: los movimientos del cierre elegido (o lo que esté
// filtrado en pantalla) con los totales arriba. Es la lista y nada más: sin
// firmas ni leyendas.

function fmtMoney(value, currency = "ARS") {
  const n = Number(value || 0);
  const text = Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signo = n < 0 ? "-" : "";
  return currency === "USD" ? `${signo}US$ ${text}` : `${signo}$ ${text}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function periodo(cierre) {
  if (!cierre) return "";
  if (cierre.fecha_desde && cierre.fecha_hasta) return `Del ${fmtDate(cierre.fecha_desde)} al ${fmtDate(cierre.fecha_hasta)}`;
  if (cierre.fecha_desde) return `Desde el ${fmtDate(cierre.fecha_desde)}`;
  if (cierre.fecha_hasta) return `Hasta el ${fmtDate(cierre.fecha_hasta)}`;
  return "";
}

export function totalesCajaChica(rows) {
  const t = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
  for (const row of rows) {
    const moneda = row.moneda === "USD" ? "USD" : "ARS";
    const importe = Number(row.importe || 0);
    if (row.tipo === "ingreso") t[moneda].ingresos += importe;
    else t[moneda].egresos += importe;
  }
  return t;
}

export function nombreArchivoCajaChica(cierre, hoy = new Date().toISOString().slice(0, 10)) {
  const name = String(cierre?.nombre || "caja-chica")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return `${name}-${hoy}.pdf`;
}

export function construirCajaChicaPdf({ rows = [], cierre = null, logo = null, logotipo = null, hoy = new Date().toISOString().slice(0, 10) }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const t = totalesCajaChica(rows);
  const saldoArs = t.ARS.ingresos - t.ARS.egresos;
  const saldoUsd = t.USD.ingresos - t.USD.egresos;
  const hayUsd = t.USD.ingresos > 0 || t.USD.egresos > 0;
  const nombre = cierre?.nombre || "Caja chica";
  const cantidad = `${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"}`;

  let y = encabezado(doc, {
    seccion: "Compras",
    derecha: fechaRotulo(hoy),
    eyebrow: "Rendición de caja chica",
    titulo: nombre,
    subtitulo: periodo(cierre),
    detalle: cantidad,
    logo,
    logotipo,
  });

  const notaUsd = (v) => (hayUsd ? fmtMoney(v, "USD") : null);
  y = cifras(doc, {
    y,
    items: [
      { rotulo: "Ingresos", valor: fmtMoney(t.ARS.ingresos), nota: notaUsd(t.USD.ingresos) },
      { rotulo: "Egresos", valor: fmtMoney(t.ARS.egresos), nota: notaUsd(t.USD.egresos) },
      { rotulo: "Saldo", valor: fmtMoney(saldoArs), nota: notaUsd(saldoUsd), color: saldoArs < 0 ? ROJO : undefined },
    ],
  });

  const totalFila = (moneda) => [
    { content: moneda === "USD" ? "Total en dólares" : "Total", colSpan: 4 },
    fmtMoney(t[moneda].egresos, moneda),
    fmtMoney(t[moneda].ingresos, moneda),
  ];

  autoTable(doc, tablaKlasea({
    startY: y + 26,
    margin: { left: MARGEN, right: MARGEN, top: 80, bottom: ABAJO },
    head: [["Fecha", "Proveedor", "Detalle", "Centro de costo", "Egreso", "Ingreso"]],
    body: rows.map((row) => [
      fmtDate(row.fecha),
      row.proveedor || "—",
      row.detalle || "—",
      row.centro_costo || "—",
      row.tipo === "egreso" ? fmtMoney(row.importe, row.moneda) : "",
      row.tipo === "ingreso" ? fmtMoney(row.importe, row.moneda) : "",
    ]),
    foot: hayUsd ? [totalFila("ARS"), totalFila("USD")] : [totalFila("ARS")],
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 50, textColor: GRIS },
      1: { cellWidth: 98 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 84, textColor: GRIS },
      4: { cellWidth: 72, halign: "right" },
      5: { cellWidth: 72, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && String(data.cell.raw) === "—") data.cell.styles.textColor = [190, 192, 196];
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) encabezadoContinuacion(doc, { seccion: "Caja chica", titulo: nombre, derecha: fechaRotulo(hoy) });
    },
  }));

  pie(doc, { izquierda: `Caja chica  ·  ${nombre}` });
  return doc;
}

export async function exportarCajaChicaPdf({ rows, cierre }) {
  let marcas = {};
  try {
    const { cargarMarcasPdf } = await import("@/lib/pdfLogo");
    marcas = await cargarMarcasPdf();
  } catch { /* sale igual, con la marca dibujada */ }
  const doc = construirCajaChicaPdf({ rows, cierre, ...marcas });
  doc.save(nombreArchivoCajaChica(cierre));
}
