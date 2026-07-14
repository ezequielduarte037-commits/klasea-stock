import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoKUrl from "@/assets/logos/logo-k.png";

// Hoja de ruta imprimible para el cadete: barra navy + logo + tabla de paradas
// con casilleros para marcar a mano lo que todavía no está hecho.

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

function fmtMoney(v, m = "ARS") {
  const n = Number(v || 0);
  const t = n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return m === "USD" ? `USD ${t}` : `$${t}`;
}
function fmtFechaLarga(v) {
  if (!v) return "-";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function safePart(s) {
  return String(s || "ruta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

export async function exportRutaPdf({ ruta, paradas = [], cadeteNombre = "" }) {
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
  } catch { /* sin logo igual sale */ }

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Hoja de ruta", left, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  const sub = [cadeteNombre ? `Cadete: ${cadeteNombre}` : "", fmtFechaLarga(ruta?.fecha)].filter(Boolean).join("   ·   ");
  doc.text(sub, left, 62);
  doc.setFontSize(8);
  doc.text(`${paradas.length} parada(s)${ruta?.estado ? ` · ${ruta.estado}` : ""}`, left, 75);

  const estadoBox = (p) => (p.estado === "hecho" ? "[ X ]" : p.estado === "no_pude" ? "[ - ]" : "[    ]");
  const detalleCell = (p) => {
    const base = p.detalle || "-";
    if (p.estado === "no_pude" && p.motivo) return `${base}\n(No pude: ${p.motivo})`;
    return base;
  };

  autoTable(doc, {
    startY: 90,
    head: [["#", "Proveedor", "Direccion", "Que retirar", "Hecho", "$ gastado"]],
    body: paradas.map((p, i) => [
      String(i + 1),
      p.proveedor || "-",
      p.direccion || "-",
      detalleCell(p),
      estadoBox(p),
      p.estado === "hecho" && p.importe != null ? fmtMoney(p.importe, p.moneda) : "",
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: [24, 31, 42], lineColor: border, valign: "middle" },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 104 },
      2: { cellWidth: 110 },
      3: { cellWidth: 140 },
      4: { cellWidth: 50, halign: "center" },
      5: { cellWidth: 70, halign: "right" },
    },
    margin: { left, right: left },
  });

  // Total gastado + firma
  const totalArs = paradas.filter((p) => p.estado === "hecho" && (p.moneda || "ARS") !== "USD").reduce((a, p) => a + Number(p.importe || 0), 0);
  const totalUsd = paradas.filter((p) => p.estado === "hecho" && p.moneda === "USD").reduce((a, p) => a + Number(p.importe || 0), 0);
  const endY = (doc.lastAutoTable?.finalY || 90) + 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(`Total gastado: ${fmtMoney(totalArs, "ARS")}${totalUsd ? `  +  ${fmtMoney(totalUsd, "USD")}` : ""}`, left, endY);

  doc.setDrawColor(...border);
  doc.setLineWidth(1);
  doc.line(pageWidth - left - 180, endY + 34, pageWidth - left, endY + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Firma / conforme", pageWidth - left - 90, endY + 46, { align: "center" });

  doc.save(`hoja-ruta-${safePart(cadeteNombre)}-${String(ruta?.fecha || "").slice(0, 10)}.pdf`);
}
