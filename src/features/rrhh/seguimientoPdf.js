import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoKUrl from "@/assets/logos/logo-k.png";
import { minToHM } from "./api";

// Informe de asistencia de una persona, para imprimir o adjuntar al legajo.
// Mismo estilo que la hoja de ruta del cadete: barra navy, logo y tabla.
//
// Recibe el MISMO historial que muestra el modal de Seguimiento por persona.
// No recalcula nada: si el papel dijera algo distinto que la pantalla, no
// habria forma de saber cual vale.

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
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
  } catch { return null; }
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function fmtFechaLarga(iso) {
  if (!iso) return "-";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

function fechaYDia(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { corta: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`, dia: DIAS[new Date(y, m - 1, d).getDay()] ?? "" };
}

function safePart(s) {
  return String(s || "seguimiento")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

// Mismas etiquetas que los chips del modal.
const ESTADO_LABEL = {
  presente: "Presente",
  tarde: "Llegada tarde",
  incompleta: "Marcación incompleta",
  justificada: "Ausencia justificada",
  ausente: "AUSENTE",
};

function detalleDeFila(row) {
  if (row.marcacion) {
    const horas = row.minutos != null ? ` (${minToHM(row.minutos)})` : "";
    return `${row.entrada || "sin entrada"} – ${row.salida || "sin salida"}${horas}`;
  }
  return row.justificacion?.motivo || "Sin marcación registrada";
}

export async function construirSeguimientoPdf({ empleado, desde, hasta, historial = [], resumen = {} }, { generadoPor = "" } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 42;
  const navy = [15, 23, 42];
  const muted = [98, 107, 123];
  const border = [220, 224, 230];
  const rojo = [185, 28, 28];

  try {
    const logo = await loadNavyLogo();
    if (logo) {
      const w = 34;
      doc.addImage(logo.dataUrl, "PNG", pageWidth - left - w, 26, w, logo.aspect * w);
    }
  } catch { /* sin logo sale igual */ }

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Seguimiento de asistencia", left, 46);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(String(empleado?.nombre || "-"), left, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  const ficha = [empleado?.dni ? `DNI ${empleado.dni}` : "", empleado?.sede || ""].filter(Boolean).join("   ·   ");
  if (ficha) doc.text(ficha, left, 80);
  doc.text(`Del ${fmtFechaLarga(desde)} al ${fmtFechaLarga(hasta)}`, left, ficha ? 93 : 80);

  // ── Resumen ────────────────────────────────────────────────────────────────
  const yResumen = ficha ? 108 : 95;
  const celdas = [
    ["Presentes", String(resumen.presentes ?? 0), false],
    ["Tardes", String(resumen.tardes ?? 0), false],
    ["Ausentes", String(resumen.ausentes ?? 0), (resumen.ausentes ?? 0) > 0],
    ["Justificadas", String(resumen.justificadas ?? 0), false],
    ["Días del período", String(historial.length), false],
  ];
  const anchoCelda = (pageWidth - left * 2) / celdas.length;
  doc.setDrawColor(...border);
  doc.setFillColor(247, 249, 252);
  doc.rect(left, yResumen, pageWidth - left * 2, 40, "FD");
  celdas.forEach(([label, valor, alarma], i) => {
    const x = left + anchoCelda * i;
    if (i > 0) doc.line(x, yResumen, x, yResumen + 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), x + 8, yResumen + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    // Las ausencias en rojo: es el numero que se busca al abrir esta hoja.
    doc.setTextColor(...(alarma ? rojo : navy));
    doc.text(valor, x + 8, yResumen + 33);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("No incluye sábados ni domingos.", left, yResumen + 54);

  // ── Detalle ────────────────────────────────────────────────────────────────
  // En pantalla se lista del dia mas nuevo al mas viejo; en papel se lee mejor
  // en orden, de la primera fecha del rango a la ultima.
  const filas = [...historial].reverse();

  autoTable(doc, {
    startY: yResumen + 66,
    head: [["Fecha", "Día", "Estado", "Detalle"]],
    body: filas.map((row) => {
      const { corta, dia } = fechaYDia(row.fecha);
      return [corta, dia, ESTADO_LABEL[row.tipo] || row.tipo, detalleDeFila(row)];
    }),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: [24, 31, 42], lineColor: border, valign: "middle" },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 40 },
      2: { cellWidth: 128 },
      3: { cellWidth: "auto" },
    },
    // Una ausencia tiene que saltar a la vista sin leer la fila entera.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (filas[data.row.index]?.tipo === "ausente") {
        data.cell.styles.textColor = rojo;
        if (data.column.index === 2) data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left, right: left },
  });

  // ── Pie ────────────────────────────────────────────────────────────────────
  const finY = doc.lastAutoTable?.finalY ?? yResumen + 66;
  const yPie = Math.min(finY + 30, doc.internal.pageSize.getHeight() - 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  const emitido = new Date().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  doc.text(`Emitido el ${emitido}${generadoPor ? ` por ${generadoPor}` : ""} · Datos del fichero de acceso.`, left, yPie);

  return { doc, nombreArchivo: `seguimiento-${safePart(empleado?.nombre)}-${desde}_${hasta}.pdf` };
}

export async function exportSeguimientoPdf(datos, opciones = {}) {
  const { doc, nombreArchivo } = await construirSeguimientoPdf(datos, opciones);
  doc.save(nombreArchivo);
  return nombreArchivo;
}
