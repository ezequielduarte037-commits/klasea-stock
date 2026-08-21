import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoKUrl from "@/assets/logos/logo-k.png";
import { minToHM } from "./api";

// Informe de asistencia de una persona, para imprimir o adjuntar a un legajo.
// Mismo estilo que la hoja de ruta del cadete: barra navy, logo y tabla.

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

function fmtFechaLarga(iso) {
  if (!iso) return "-";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtFechaCorta(iso) {
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
}

function safePart(s) {
  return String(s || "seguimiento")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

const ESTADO_LABEL = {
  presente: "Presente",
  tarde: "Tarde",
  ausente: "AUSENTE",
  justificada: "Justificada",
};

// Construye el documento y lo devuelve sin guardarlo, para poder generarlo y
// medirlo en una prueba sin depender del navegador.
export async function construirSeguimientoPdf(seguimiento, { generadoPor = "" } = {}) {
  const { empleado, desde, hasta, dias, resumen } = seguimiento;
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
  const ficha = [
    empleado?.dni ? `DNI ${empleado.dni}` : "",
    empleado?.sede || "",
    empleado?.contratista?.nombre || (empleado?.grupo === "casa" ? "Gente de la casa" : ""),
  ].filter(Boolean).join("   ·   ");
  if (ficha) doc.text(ficha, left, 80);
  doc.text(`Del ${fmtFechaLarga(desde)} al ${fmtFechaLarga(hasta)}`, left, ficha ? 93 : 80);

  // ── Resumen ────────────────────────────────────────────────────────────────
  const yResumen = ficha ? 108 : 95;
  const celdas = [
    ["Presentes", String(resumen.presentes)],
    ["Ausentes", String(resumen.ausentes)],
    ["Justificadas", String(resumen.justificadas)],
    ["Tarde", String(resumen.tarde)],
    ["Salió en jornada", String(resumen.diasConSalida)],
    ["Horas trabajadas", minToHM(resumen.minutosTrabajados)],
  ];
  const anchoCelda = (pageWidth - left * 2) / celdas.length;
  doc.setDrawColor(...border);
  doc.setFillColor(247, 249, 252);
  doc.rect(left, yResumen, pageWidth - left * 2, 40, "FD");
  celdas.forEach(([label, valor], i) => {
    const x = left + anchoCelda * i;
    if (i > 0) doc.line(x, yResumen, x, yResumen + 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), x + 8, yResumen + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    // Las ausencias en rojo: es el número que se busca al abrir esta hoja.
    doc.setTextColor(...(label === "Ausentes" && resumen.ausentes > 0 ? rojo : navy));
    doc.text(valor, x + 8, yResumen + 33);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(
    `Sobre ${resumen.diasComputados} día(s) computado(s). Los domingos —y los sábados sin fichaje— no cuentan como falta.`,
    left,
    yResumen + 54,
  );

  // ── Detalle ────────────────────────────────────────────────────────────────
  // Los días no laborables sin fichaje no entran: son seis domingos de ruido que
  // tapan lo que importa. Un sábado trabajado sí aparece, porque tiene fichaje.
  const filas = dias.filter((d) => d.estado !== "no laborable");

  autoTable(doc, {
    startY: yResumen + 66,
    head: [["Fecha", "Día", "Entrada", "Salida", "Horas", "Estado", "Observaciones"]],
    body: filas.map((d) => [
      fmtFechaCorta(d.fecha),
      d.dia,
      d.entrada || "—",
      d.salida || "—",
      d.minutos != null ? minToHM(d.minutos) : "—",
      ESTADO_LABEL[d.estado] || d.estado,
      d.observaciones.join(" · "),
    ]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4.5, textColor: [24, 31, 42], lineColor: border, valign: "middle" },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 58 },
      2: { cellWidth: 46, halign: "center" },
      3: { cellWidth: 46, halign: "center" },
      4: { cellWidth: 42, halign: "center" },
      5: { cellWidth: 74 },
      6: { cellWidth: "auto" },
    },
    // Una ausencia tiene que saltar a la vista sin leer la fila entera.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const fila = filas[data.row.index];
      if (fila?.estado === "ausente") {
        data.cell.styles.textColor = rojo;
        if (data.column.index === 5) data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left, right: left },
  });

  // ── Pie ────────────────────────────────────────────────────────────────────
  const finY = doc.lastAutoTable?.finalY ?? yResumen + 66;
  const pageHeight = doc.internal.pageSize.getHeight();
  const yPie = Math.min(finY + 30, pageHeight - 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  const emitido = new Date().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  doc.text(`Emitido el ${emitido}${generadoPor ? ` por ${generadoPor}` : ""} · Datos del fichero de acceso.`, left, yPie);

  return { doc, nombreArchivo: `seguimiento-${safePart(empleado?.nombre)}-${desde}_${hasta}.pdf` };
}

export async function exportSeguimientoPdf(seguimiento, opciones = {}) {
  const { doc, nombreArchivo } = await construirSeguimientoPdf(seguimiento, opciones);
  doc.save(nombreArchivo);
  return nombreArchivo;
}
