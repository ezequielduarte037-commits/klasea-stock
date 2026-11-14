import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { numeroRemitoMarmoleria } from "./remitosMarmoleria.js";
import { GRIS, PELO, TINTA, marca, rotulo, tablaKlasea } from "../../lib/pdfKlasea.js";

// Mismo papel que el resto de los PDF (lib/pdfKlasea): rótulos espaciados,
// líneas de un pelo y nada de cajas. La geometría es la de siempre: dos
// copias recortables por hoja cuando entra.
const NAVY = TINTA;
const INK = TINTA;
const MUTED = GRIS;
const RULE = PELO;
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

function dibujarCopia(doc, { remito, logo, logotipo, copia, top, bottom }) {
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
  const destinatario = envolver(remito.destinatario, ancho, 10.5, true);
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

  // Rótulo con la Y de arriba, como el resto de esta hoja (baseline top).
  const rot = (str, x, y, opciones = {}) => rotulo(doc, str, x, y + (opciones.tam ?? 6.8) * 0.78, opciones);

  const encabezado = (soloNotas = false) => {
    if (logotipo?.dataUrl) {
      // El logotipo completo (K + KLASE A) ya dice el nombre.
      const alto = 17;
      doc.addImage(logotipo.dataUrl, "PNG", MARGIN, top + 2, alto / (logotipo.aspect || 0.25), alto, undefined, "FAST");
      rot("Entrega de plantillas  ·  Marmolería", MARGIN, top + 28, { tam: 6.5, espacio: 1.1 });
    } else {
      let marcaX = MARGIN;
      if (logo?.dataUrl) {
        marca(doc, { centro: MARGIN + 11, y: top + 14, logo: logo.dataUrl, tam: 22 });
        marcaX += 32;
      }
      rot("Klase A Yachts", marcaX, top + 6, { tam: 8, espacio: 1.6, color: TINTA });
      rot("Entrega de plantillas  ·  Marmolería", marcaX, top + 20, { tam: 6.5, espacio: 1.1 });
    }
    rot(`Remito  ·  ${copia}`, right, top + 6, { align: "right", color: TINTA });
    texto(folio, right, top + 18, 17, false, INK, "right");
    texto(`Fecha: ${fechaTexto(remito.fecha)}`, right, top + 40, 8.5, false, MUTED, "right");
    linea(MARGIN, top + 56, right, top + 56);

    const personasY = datosY + destinatarioH;
    linea(MARGIN, personasY, right, personasY);
    linea(MARGIN, personasY + personasH, right, personasY + personasH);
    linea(MARGIN + ancho / 2, personasY + 6, MARGIN + ancho / 2, personasY + personasH - 6);
    rot("Marmolería / destinatario", MARGIN, datosY + 6);
    texto(destinatario, MARGIN, datosY + 16, 10.5, true);
    rot("Entregado por", MARGIN, personasY + 6);
    rot("Retira", MARGIN + ancho / 2 + 12, personasY + 6);
    texto(entrega, MARGIN, personasY + 16);
    if (retira.length) texto(retira, MARGIN + ancho / 2 + 12, personasY + 16);
    else linea(MARGIN + ancho / 2 + 12, personasY + personasH - 7, right, personasY + personasH - 7);

    rot(soloNotas ? "Continuación del remito" : "Detalle de plantillas", MARGIN, detalleY, { tam: 7, espacio: 1.4, color: TINTA });
    texto(`${cantidadTexto(remito.items.length, "renglón", "renglones")} / ${cantidadTexto(total, "plantilla", "plantillas")}`,
      right, detalleY, 8, false, MUTED, "right");
  };

  autoTable(doc, tablaKlasea({
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
    styles: { fontSize: 9, cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 } },
    headStyles: { cellPadding: { top: 2, bottom: 5, left: 6, right: 6 } },
    columnStyles: {
      0: { cellWidth: 75, fontStyle: "bold" },
      1: { cellWidth: 75, textColor: MUTED },
      2: { cellWidth: 176 },
      3: { cellWidth: ancho - 364 },
      4: { cellWidth: 38, halign: "center", fontStyle: "bold" },
    },
    rowPageBreak: "avoid",
    didDrawPage: ({ cursor }) => {
      encabezado();
      paginas.push({ numero: doc.internal.getCurrentPageInfo().pageNumber, fin: cursor.y });
    },
  }));

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
    rot("Observaciones de la entrega", MARGIN, y + 5);
    texto(obs, MARGIN, y + 16, 8.5);
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
      doc.setDrawColor(...TINTA);
      doc.setLineWidth(0.5);
      doc.line(x1, y + 45, x2, y + 45);
      texto(label, x1, y + 50, 7.5, false, MUTED);
    }
    const destino = copia === "ORIGINAL" ? "Archivo Klase A - conservar firmado" : "Para quien retira";
    const estado = remito.numero == null ? "BORRADOR - SIN EMITIR" : folio;
    texto(`${estado}  ·  ${copia}  ·  ${destino}`, MARGIN, footerY + 8, 6.8, false, MUTED);
    texto(`Hoja ${indice + 1} de ${paginas.length}`, right, footerY + 8, 6.8, false, MUTED, "right");
  }
  return { paginas: paginas.length, altoContenido: ultima.fin - top };
}

// Dos copias recortables en una A4 cuando el contenido cabe con su tamaño
// de letra normal. Los remitos extensos usan hojas completas, sin achicar texto.
export function construirPdfRemitoMarmoleria({ remito, logo = null, logotipo = null }) {
  if (!remito?.items?.length) throw new Error("El remito no tiene plantillas.");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: `Remito de plantillas ${numeroRemitoMarmoleria(remito.numero)}`, author: "Klase A Yachts", subject: "Original y duplicado de entrega de plantillas de marmolería" });
  doc.setLanguage("es-AR");

  // Medir con el mismo motor de tablas evita decidir por cantidad de renglones:
  // también importan las descripciones, materiales y nombres que se envuelven.
  const prueba = new jsPDF({ unit: "pt", format: "a4" });
  const medida = dibujarCopia(prueba, { remito, logo, logotipo, copia: "ORIGINAL", top: TOP, bottom: h - TOP });
  const compactar = medida.paginas === 1
    && medida.altoContenido + SIGNATURE_HEIGHT + FOOTER_HEIGHT + 8 <= h / 2 - 2 * TOP;
  if (compactar) {
    dibujarCopia(doc, { remito, logo, logotipo, copia: "ORIGINAL", top: TOP, bottom: h / 2 - TOP });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(MARGIN, h / 2, w - MARGIN, h / 2);
    doc.setLineDashPattern([], 0);
    dibujarCopia(doc, { remito, logo, logotipo, copia: "DUPLICADO", top: h / 2 + TOP, bottom: h - TOP });
  } else {
    dibujarCopia(doc, { remito, logo, logotipo, copia: "ORIGINAL", top: TOP + 10, bottom: h - 28 });
    doc.addPage();
    dibujarCopia(doc, { remito, logo, logotipo, copia: "DUPLICADO", top: TOP + 10, bottom: h - 28 });
  }
  return doc;
}
