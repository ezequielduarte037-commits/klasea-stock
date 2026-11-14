import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cargarMarcasPdf } from "@/lib/pdfLogo";
import {
  ABAJO, GRIS, MARGEN, TINTA, cifras, encabezado, encabezadoContinuacion, fechaRotulo, firma, pie, tablaKlasea,
} from "@/lib/pdfKlasea";

// Hoja de ruta imprimible para el cadete: las paradas en orden, con un
// casillero para marcar a mano lo que todavía no está hecho.

function fmtMoney(v, m = "ARS") {
  const n = Number(v || 0);
  const t = n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return m === "USD" ? `US$ ${t}` : `$ ${t}`;
}
function fmtFechaLarga(v) {
  if (!v) return "";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  const t = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function safePart(s) {
  return String(s || "ruta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

export async function construirRutaPdf({ ruta, paradas = [], cadeteNombre = "" }, { logo = undefined, logotipo = null } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  let marcas = { logo, logotipo };
  if (logo === undefined) {
    try { marcas = await cargarMarcasPdf(); } catch { marcas = { logo: null, logotipo: null }; }
  }

  const hechas = paradas.filter((p) => p.estado === "hecho");
  const noPude = paradas.filter((p) => p.estado === "no_pude");
  const totalArs = hechas.filter((p) => (p.moneda || "ARS") !== "USD").reduce((a, p) => a + Number(p.importe || 0), 0);
  const totalUsd = hechas.filter((p) => p.moneda === "USD").reduce((a, p) => a + Number(p.importe || 0), 0);

  let y = encabezado(doc, {
    seccion: "Cadete",
    derecha: fechaRotulo(ruta?.fecha),
    eyebrow: "Hoja de ruta",
    titulo: cadeteNombre || "Recorrido",
    subtitulo: fmtFechaLarga(ruta?.fecha),
    detalle: ruta?.estado ? `Estado de la ruta: ${ruta.estado}` : "",
    logo: marcas.logo,
    logotipo: marcas.logotipo,
  });

  y = cifras(doc, {
    y,
    items: [
      { rotulo: "Paradas", valor: String(paradas.length) },
      { rotulo: "Hechas", valor: String(hechas.length) },
      { rotulo: "No pude", valor: String(noPude.length) },
      { rotulo: "Gastado", valor: `${fmtMoney(totalArs)}${totalUsd ? `  +  ${fmtMoney(totalUsd, "USD")}` : ""}` },
    ],
  });

  const detalleCell = (p) => {
    const base = p.detalle || "—";
    if (p.estado === "no_pude" && p.motivo) return `${base}\nNo pude: ${p.motivo}`;
    return base;
  };

  autoTable(doc, tablaKlasea({
    startY: y + 26,
    margin: { left: MARGEN, right: MARGEN, top: 80, bottom: ABAJO },
    head: [["", "Proveedor", "Dirección", "Qué retirar", "Hecho", "Gastado"]],
    body: paradas.map((p, i) => [
      String(i + 1).padStart(2, "0"),
      p.proveedor || "—",
      p.direccion || "—",
      detalleCell(p),
      "",
      p.estado === "hecho" && p.importe != null ? fmtMoney(p.importe, p.moneda) : "",
    ]),
    columnStyles: {
      0: { cellWidth: 26, textColor: GRIS },
      1: { cellWidth: 104 },
      2: { cellWidth: 118, textColor: GRIS },
      3: { cellWidth: "auto" },
      4: { cellWidth: 44, halign: "center" },
      5: { cellWidth: 70, halign: "right" },
    },
    styles: { cellPadding: { top: 9, right: 6, bottom: 9, left: 6 } },
    // El casillero se dibuja: un cuadradito fino que se tilda con birome.
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 4) return;
      const p = paradas[data.row.index];
      const lado = 10;
      const cx = data.cell.x + data.cell.width / 2;
      const cy = data.cell.y + data.cell.height / 2;
      doc.setDrawColor(...(p?.estado ? TINTA : GRIS));
      doc.setLineWidth(0.7);
      doc.rect(cx - lado / 2, cy - lado / 2, lado, lado, "S");
      if (p?.estado === "hecho") {
        doc.line(cx - 3, cy + 0.2, cx - 0.8, cy + 2.6);
        doc.line(cx - 0.8, cy + 2.6, cx + 3.4, cy - 2.8);
      } else if (p?.estado === "no_pude") {
        doc.line(cx - 3, cy, cx + 3, cy);
      }
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) encabezadoContinuacion(doc, { seccion: "Hoja de ruta", titulo: cadeteNombre, derecha: fechaRotulo(ruta?.fecha) });
    },
  }));

  let fin = (doc.lastAutoTable?.finalY || y) + 64;
  if (fin > doc.internal.pageSize.getHeight() - ABAJO - 20) {
    doc.addPage();
    fin = encabezadoContinuacion(doc, { seccion: "Hoja de ruta", titulo: cadeteNombre, derecha: fechaRotulo(ruta?.fecha) }) + 40;
  }
  firma(doc, { x: ancho - MARGEN - 190, y: fin, ancho: 190, texto: "Firma / conforme" });

  pie(doc, { izquierda: `Hoja de ruta  ·  ${cadeteNombre || "cadete"}` });
  return { doc, nombre: `hoja-ruta-${safePart(cadeteNombre)}-${String(ruta?.fecha || "").slice(0, 10)}.pdf` };
}

export async function exportRutaPdf(datos) {
  const { doc, nombre } = await construirRutaPdf(datos);
  doc.save(nombre);
}
