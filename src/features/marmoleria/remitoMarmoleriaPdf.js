import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { numeroRemitoMarmoleria } from "./remitosMarmoleria.js";

const NAVY = [18, 43, 63];
const INK = [27, 33, 39];
const MUTED = [82, 91, 100];
const RULE = [165, 173, 181];
const PAPER = [244, 246, 248];
const MARGIN = 32;
const TOP = 18;
const SIGNATURE_HEIGHT = 63;
const FOOTER_HEIGHT = 18;
const limpio = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const fechaTexto = (iso) => String(iso ?? "").slice(0, 10).split("-").reverse().join("/");
const cantidadTexto = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

export function nombreArchivoRemitoMarmoleria(remito) {
  return `Remito-${numeroRemitoMarmoleria(remito.numero)}-${remito.fecha}.pdf`;
}

function dibujarCopia(doc, { remito, logo, copia, top, bottom }) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const ancho = w - 2 * MARGIN;
  const right = w - MARGIN;
  const folio = numeroRemitoMarmoleria(remito.numero);
  const total = remito.items.reduce((sum, i) => sum + Number(i.cantidad), 0);

  const texto = (str, x, y, size = 9, bold = false, color = INK, align = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(str, x, y, { baseline: "top", lineHeightFactor: 1.2, align });
  };
  const envolver = (str, width, size = 9, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(limpio(str), width);
  };
  const linea = (x1, y1, x2, y2) => {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.45);
    doc.line(x1, y1, x2, y2);
  };
  const destinatario = envolver(remito.destinatario, ancho - 20, 10, true);
  const entrega = envolver(remito.entregado_por, ancho / 2 - 20);
  const retira = remito.retira ? envolver(remito.retira, ancho / 2 - 20) : [];
  const obs = remito.observaciones ? envolver(remito.observaciones, ancho - 20, 8.5) : [];
  const destinatarioH = Math.max(30, 19 + destinatario.length * 12);
  const personasH = Math.max(30, 19 + Math.max(entrega.length, retira.length) * 10.8);
  const datosY = top + 62;
  const detalleY = datosY + destinatarioH + personasH + 7;
  const tablaY = detalleY + 15;
  const footerY = bottom - FOOTER_HEIGHT;
  const limiteContenido = footerY - SIGNATURE_HEIGHT - 8;
  const paginas = [];

  const encabezado = (soloNotas = false) => {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.rect(MARGIN, top, ancho, 56);
    const division = right - 190;
    linea(division, top, division, top + 56);
    let marcaX = MARGIN + 12;
    if (logo?.dataUrl) {
      const aspect = logo.aspect || 1;
      const logoW = Math.min(31, 34 / aspect);
      const logoH = logoW * aspect;
      doc.addImage(logo.dataUrl, "PNG", marcaX, top + 10, logoW, logoH, undefined, "FAST");
      marcaX += 42;
    }
    texto("KLASE A", marcaX, top + 11, 15, true, NAVY);
    texto("YACHTS", marcaX, top + 29, 8, false, MUTED);
    texto("ENTREGA DE PLANTILLAS / MARMOLERÍA", MARGIN + 12, top + 43, 7, true, MUTED);
    texto("REMITO", division + 12, top + 9, 9, true);
    texto(copia, right - 12, top + 10, 8, true, NAVY, "right");
    texto(folio, division + 12, top + 24, 15, true, NAVY);
    texto(`Fecha: ${fechaTexto(remito.fecha)}`, division + 12, top + 43, 9);

    doc.rect(MARGIN, datosY, ancho, destinatarioH + personasH);
    linea(MARGIN, datosY + destinatarioH, right, datosY + destinatarioH);
    linea(MARGIN + ancho / 2, datosY + destinatarioH, MARGIN + ancho / 2, datosY + destinatarioH + personasH);
    texto("MARMOLERÍA / DESTINATARIO", MARGIN + 10, datosY + 5, 6.8, true, MUTED);
    texto(destinatario, MARGIN + 10, datosY + 16, 10, true);
    const personasY = datosY + destinatarioH;
    texto("ENTREGADO POR", MARGIN + 10, personasY + 5, 6.8, true, MUTED);
    texto("RETIRA", MARGIN + ancho / 2 + 10, personasY + 5, 6.8, true, MUTED);
    texto(entrega, MARGIN + 10, personasY + 16);
    if (retira.length) texto(retira, MARGIN + ancho / 2 + 10, personasY + 16);
    else linea(MARGIN + ancho / 2 + 10, personasY + personasH - 7, right - 10, personasY + personasH - 7);

    texto(soloNotas ? "CONTINUACIÓN DEL REMITO" : "DETALLE DE PLANTILLAS", MARGIN, detalleY, 7.5, true);
    texto(`${cantidadTexto(remito.items.length, "renglón", "renglones")} / ${cantidadTexto(total, "plantilla", "plantillas")}`,
      right, detalleY, 8, false, MUTED, "right");
  };

  autoTable(doc, {
    startY: tablaY,
    margin: { top: tablaY, bottom: h - limiteContenido, left: MARGIN, right: MARGIN },
    head: [["Barco / línea", "Sector", "Plantilla / detalle", "Material", "Cant."]],
    body: remito.items.map((i) => [
      [limpio(i.codigo_barco), limpio(i.linea)].filter(Boolean).join(" / "),
      limpio(i.sector),
      [limpio(i.pieza), i.observaciones ? `Obs.: ${limpio(i.observaciones)}` : ""].filter(Boolean).join("\n"),
      limpio(i.material),
      String(i.cantidad),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica", fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 7, right: 7 },
      overflow: "linebreak", valign: "middle", textColor: INK, lineColor: RULE, lineWidth: 0.35,
    },
    headStyles: { fillColor: PAPER, textColor: INK, fontStyle: "bold", fontSize: 8, minCellHeight: 22 },
    columnStyles: {
      0: { cellWidth: 75, fontStyle: "bold" },
      1: { cellWidth: 75 },
      2: { cellWidth: 176 },
      3: { cellWidth: ancho - 364 },
      4: { cellWidth: 38, halign: "center", fontStyle: "bold" },
    },
    rowPageBreak: "avoid",
    didDrawPage: ({ cursor }) => {
      encabezado();
      paginas.push({ numero: doc.internal.getCurrentPageInfo().pageNumber, fin: cursor.y });
    },
  });

  let ultima = paginas[paginas.length - 1];
  const obsH = obs.length ? 22 + obs.length * 10.2 : 0;
  if (ultima.fin + (obs.length ? obsH + 8 : 0) > limiteContenido) {
    // Las notas extensas se conservan completas en una hoja de continuación.
    // No reducen el espacio de la tabla ni se repiten en cada hoja.
    doc.addPage();
    encabezado(true);
    ultima = { numero: doc.internal.getCurrentPageInfo().pageNumber, fin: tablaY };
    paginas.push(ultima);
  }
  doc.setPage(ultima.numero);
  if (obs.length) {
    const y = ultima.fin + 8;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, ancho, obsH - 2);
    texto("OBSERVACIONES DE LA ENTREGA", MARGIN + 10, y + 5, 6.8, true, MUTED);
    texto(obs, MARGIN + 10, y + 16, 8.5);
    ultima.fin += obsH + 8;
  }

  for (const [indice, pagina] of paginas.entries()) {
    doc.setPage(pagina.numero);
    const y = pagina.fin + 9;
    linea(MARGIN, y, right, y);
    texto("Recibí conforme las plantillas indicadas en este remito.", MARGIN, y + 7, 8.5);
    const firmaW = ancho * 0.37;
    const aclaracionX = MARGIN + ancho * 0.41;
    const dniX = MARGIN + ancho * 0.82;
    for (const [x1, x2, label] of [
      [MARGIN, MARGIN + firmaW, "Firma de quien retira"],
      [aclaracionX, aclaracionX + firmaW, "Aclaración"],
      [dniX, right, "DNI"],
    ]) {
      linea(x1, y + 45, x2, y + 45);
      texto(label, x1, y + 50, 7.5, false, MUTED);
    }
    const destino = copia === "ORIGINAL" ? "Archivo Klase A - conservar firmado" : "Para quien retira";
    const estado = remito.numero == null ? "BORRADOR - SIN EMITIR" : folio;
    texto(`${estado} | ${copia} | ${destino}`, MARGIN, footerY + 8, 7, false, MUTED);
    texto(`Hoja ${indice + 1} de ${paginas.length}`, right, footerY + 8, 7, false, MUTED, "right");
  }
  return { paginas: paginas.length, altoContenido: ultima.fin - top };
}

// Dos copias recortables en una A4 cuando el contenido cabe con su tamaño
// de letra normal. Los remitos extensos usan hojas completas, sin achicar texto.
export function construirPdfRemitoMarmoleria({ remito, logo = null }) {
  if (!remito?.items?.length) throw new Error("El remito no tiene plantillas.");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: `Remito de plantillas ${numeroRemitoMarmoleria(remito.numero)}`, author: "Klase A Yachts", subject: "Original y duplicado de entrega de plantillas de marmolería" });
  doc.setLanguage("es-AR");

  // Medir con el mismo motor de tablas evita decidir por cantidad de renglones:
  // también importan las descripciones, materiales y nombres que se envuelven.
  const prueba = new jsPDF({ unit: "pt", format: "a4" });
  const medida = dibujarCopia(prueba, { remito, logo, copia: "ORIGINAL", top: TOP, bottom: h - TOP });
  const compactar = medida.paginas === 1
    && medida.altoContenido + SIGNATURE_HEIGHT + FOOTER_HEIGHT + 8 <= h / 2 - 2 * TOP;
  if (compactar) {
    dibujarCopia(doc, { remito, logo, copia: "ORIGINAL", top: TOP, bottom: h / 2 - TOP });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(MARGIN, h / 2, w - MARGIN, h / 2);
    doc.setLineDashPattern([], 0);
    dibujarCopia(doc, { remito, logo, copia: "DUPLICADO", top: h / 2 + TOP, bottom: h - TOP });
  } else {
    dibujarCopia(doc, { remito, logo, copia: "ORIGINAL", top: TOP + 10, bottom: h - 28 });
    doc.addPage();
    dibujarCopia(doc, { remito, logo, copia: "DUPLICADO", top: TOP + 10, bottom: h - 28 });
  }
  return doc;
}
