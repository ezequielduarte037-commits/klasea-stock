import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { numeroRemitoMarmoleria } from "./remitosMarmoleria.js";

const NAVY = [14, 54, 83];
const INK = [40, 47, 58];
const MUTED = [100, 111, 125];
const RULE = [214, 220, 228];
const limpio = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const fechaTexto = (iso) => String(iso ?? "").slice(0, 10).split("-").reverse().join("/");

export function nombreArchivoRemitoMarmoleria(remito) {
  return `Remito-${numeroRemitoMarmoleria(remito.numero)}-${remito.fecha}.pdf`;
}

// Cada copia tiene la misma captura de datos y su propia paginación. El pie
// de firma se reserva en TODAS las hojas, incluso en remitos de varios barcos.
export function construirPdfRemitoMarmoleria({ remito, logo = null }) {
  if (!remito?.items?.length) throw new Error("El remito no tiene plantillas.");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const m = 36;
  const ancho = w - 2 * m;
  const folio = numeroRemitoMarmoleria(remito.numero);
  const total = remito.items.reduce((sum, i) => sum + Number(i.cantidad), 0);
  doc.setProperties({ title: `Remito de plantillas ${folio}`, author: "Klase A Yachts", subject: "Original y duplicado de entrega de plantillas de marmolería" });
  doc.setLanguage("es-AR");

  const texto = (str, x, y, size = 9, bold = false, color = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(str, x, y, { baseline: "top", lineHeightFactor: 1.3 });
  };
  const envolver = (str, width, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(limpio(str), width);
  };
  const destinatario = envolver(remito.destinatario, ancho);
  const entrega = envolver(remito.entregado_por, ancho / 2 - 12);
  const retira = envolver(remito.retira || "A completar al retirar", ancho / 2 - 12);
  const obs = remito.observaciones ? envolver(remito.observaciones, ancho) : [];
  const yPersonas = 115 + destinatario.length * 12;
  const yObs = yPersonas + 18 + Math.max(entrega.length, retira.length) * 12;
  const yTabla = yObs + (obs.length ? 18 + obs.length * 12 : 0) + 20;

  const encabezado = (copia) => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, w, 5, "F");
    if (logo?.dataUrl) doc.addImage(logo.dataUrl, "PNG", m, 25, 28, 28 * (logo.aspect || 1), undefined, "FAST");
    texto("KLASE A YACHTS", m + (logo?.dataUrl ? 40 : 0), 27, 10, true, NAVY);
    texto("Remito de plantillas", m, 51, 18, true);
    texto(copia, w - m - 153, 27, 9, true, NAVY);
    texto(folio, w - m - 153, 45, 14, true);
    texto(`Fecha: ${fechaTexto(remito.fecha)}`, w - m - 153, 65, 9, false, MUTED);
    doc.setDrawColor(...RULE);
    doc.line(m, 88, w - m, 88);
    texto("DESTINATARIO / MARMOLERÍA", m, 99, 7, true, MUTED);
    texto(destinatario, m, 113, 10, true);
    texto("ENTREGA", m, yPersonas, 7, true, MUTED);
    texto("RETIRA", m + ancho / 2, yPersonas, 7, true, MUTED);
    texto(entrega, m, yPersonas + 14);
    texto(retira, m + ancho / 2, yPersonas + 14);
    if (obs.length) {
      texto("OBSERVACIONES", m, yObs, 7, true, MUTED);
      texto(obs, m, yObs + 14);
    }
    texto(`${remito.items.length} renglones  |  ${total} plantillas`, m, yTabla - 13, 8, false, MUTED);
  };

  for (const [indice, copia] of ["ORIGINAL", "DUPLICADO"].entries()) {
    if (indice) doc.addPage();
    const primera = doc.getNumberOfPages();
    autoTable(doc, {
      startY: yTabla,
      margin: { top: yTabla, bottom: 116, left: m, right: m },
      head: [["Cant.", "Barco / línea", "Sector", "Plantilla", "Material"]],
      body: remito.items.map((i) => [
        String(i.cantidad),
        [limpio(i.codigo_barco), limpio(i.linea)].filter(Boolean).join("\n"),
        limpio(i.sector),
        [limpio(i.pieza), i.observaciones ? `Obs.: ${limpio(i.observaciones)}` : ""].filter(Boolean).join("\n"),
        limpio(i.material),
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 7, overflow: "linebreak", textColor: INK, lineColor: RULE, lineWidth: 0.3 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      columnStyles: {
        0: { cellWidth: 34, halign: "center" },
        1: { cellWidth: 68 },
        2: { cellWidth: 80 },
        3: { cellWidth: 171 },
        4: { cellWidth: ancho - 353 },
      },
      rowPageBreak: "avoid",
      didDrawPage: () => encabezado(copia),
    });
    const ultima = doc.getNumberOfPages();
    for (let page = primera; page <= ultima; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...RULE);
      doc.line(m, h - 103, w - m, h - 103);
      texto("Recibí conforme las plantillas detalladas en esta hoja.", m, h - 94, 8, false, MUTED);
      doc.line(m, h - 51, m + ancho / 2 - 14, h - 51);
      doc.line(m + ancho / 2 + 8, h - 51, w - m, h - 51);
      texto("Firma de quien retira", m, h - 45, 8, false, MUTED);
      texto("Aclaración y DNI", m + ancho / 2 + 8, h - 45, 8, false, MUTED);
      const destino = indice ? "Para la marmolería" : "Para Klase A: conservar firmado";
      texto(`${folio}  |  ${copia}  |  ${destino}`, m, h - 23, 7, false, MUTED);
      const pagina = `Hoja ${page - primera + 1} de ${ultima - primera + 1}`;
      doc.setFontSize(7);
      texto(pagina, w - m - doc.getTextWidth(pagina), h - 23, 7, false, MUTED);
    }
  }
  return doc;
}
