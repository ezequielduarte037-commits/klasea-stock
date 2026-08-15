import { jsPDF } from "jspdf";

// Recibo imprimible de caja chica: el mismo papel que se llenaba a mano
// ("Recibí de ... la cantidad de ... en concepto de ... Son $ ...") pero ya
// completo. Lo único que queda por hacer arriba del papel es firmar.
//
// El papel va sin marca: ni logo, ni nombre de la empresa, ni pie. Quién
// entrega el dinero se escribe (o no) en "Recibí de".
//
// Salen dos copias por hoja (ORIGINAL y DUPLICADO) separadas por una línea de
// corte: una la firma quien cobra y queda en la carpeta de la caja, la otra se
// la lleva. Es exactamente el circuito que ya hacían con el talonario.

const NAVY = [15, 23, 42];
const MUTED = [110, 120, 135];
const LINE = [190, 197, 208];
const SOFT = [246, 248, 251];

/* ── Importe en letras ──────────────────────────────────────────────────────
   El número escrito con palabras es lo que hace que un recibo no se pueda
   adulterar agregándole un cero. Por eso se completa igual que a mano. */

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES = {
  10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
  16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
  20: "VEINTE", 21: "VEINTIUNO", 22: "VEINTIDÓS", 23: "VEINTITRÉS", 24: "VEINTICUATRO",
  25: "VEINTICINCO", 26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE",
};
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

// apocope = "un" en vez de "uno" (un mil, veintiún millones, un peso).
function menorCien(n, apocope) {
  if (n <= 0) return "";
  if (n <= 9) return apocope && n === 1 ? "UN" : UNIDADES[n];
  if (n <= 29) {
    if (apocope && n === 21) return "VEINTIÚN";
    return ESPECIALES[n];
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (!u) return DECENAS[d];
  return `${DECENAS[d]} Y ${apocope && u === 1 ? "UN" : UNIDADES[u]}`;
}

function menorMil(n, apocope) {
  if (n <= 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  return [CENTENAS[c], menorCien(r, apocope)].filter(Boolean).join(" ");
}

function menorMillon(n, apocope) {
  if (n <= 0) return "";
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMiles = miles === 1 ? "MIL" : miles > 1 ? `${menorMil(miles, true)} MIL` : "";
  return [parteMiles, menorMil(resto, apocope)].filter(Boolean).join(" ");
}

// apocope: el número va pegado al nombre de la moneda, así que termina en
// "veintiún pesos" y no en "veintiuno pesos".
export function numeroALetras(valor, apocope = false) {
  const n = Math.floor(Math.abs(Number(valor) || 0));
  if (n === 0) return "CERO";
  if (n >= 1e12) return String(n); // fuera de rango razonable para una caja chica

  const millones = Math.floor(n / 1e6);
  const resto = n % 1e6;
  const parteMillones = millones === 1
    ? "UN MILLÓN"
    : millones > 1
      ? `${menorMillon(millones, true)} MILLONES`
      : "";
  return [parteMillones, menorMillon(resto, apocope)].filter(Boolean).join(" ");
}

// "CIEN MIL PESOS" — como se escribe a mano. Los centavos sólo aparecen si
// existen: un "CON 00/100" en un importe redondo es ruido.
export function importeEnLetras(valor, moneda = "ARS") {
  const n = Math.abs(Number(valor) || 0);
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  const singular = entero === 1;
  const unidad = moneda === "USD"
    ? (singular ? "DÓLAR" : "DÓLARES")
    : (singular ? "PESO" : "PESOS");
  // "un millón DE pesos", pero "un millón quinientos mil pesos".
  const nexo = entero >= 1e6 && entero % 1e6 === 0 ? "DE " : "";
  const cola = centavos ? ` CON ${String(centavos).padStart(2, "0")}/100` : "";
  return `${numeroALetras(entero, true)} ${nexo}${unidad}${cola}`;
}

/* ── Formatos ───────────────────────────────────────────────────────────── */

function fmtMoney(value, moneda = "ARS") {
  const n = Number(value || 0);
  const text = n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "USD" ? `US$ ${text}` : `$ ${text}`;
}

function fmtFechaLarga(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

function safePart(value) {
  return String(value || "recibo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Número de recibo. Si viene de un movimiento se deriva de su id: reimprimir
// el mismo movimiento da siempre el mismo número, que es lo que uno espera
// cuando se pierde el papel y hay que sacarlo de nuevo.
export function numeroRecibo({ fecha, semilla } = {}) {
  const dia = String(fecha || new Date().toISOString().slice(0, 10)).slice(0, 10).replace(/-/g, "");
  const base = String(semilla || `${Date.now()}-${Math.random()}`);
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `R-${dia}-${hash.toString(36).toUpperCase().padStart(4, "0").slice(-4)}`;
}

/* ── Dibujo ─────────────────────────────────────────────────────────────── */

// Campo tipo talonario: etiqueta chica + valor sobre la línea.
// El texto se achica antes que desbordar, y si aun así no entra usa una
// segunda línea: un recibo con el concepto cortado no sirve como comprobante.
// Devuelve la Y de la última línea escrita.
function campo(doc, { x, y, w, label = "", value, size = 11, maxLineas = 1, lineHeight = 24 }) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const etiqueta = String(label).toUpperCase();
  const offset = etiqueta ? doc.getTextWidth(etiqueta) + 7 : 0;
  const anchoTexto = w - offset - 2;

  // Los saltos de línea que escribió el usuario se respetan: si cargó dos
  // viajes en dos renglones, en el papel siguen siendo dos renglones.
  const parrafos = String(value ?? "")
    .split(/\r?\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);

  let fs = size;
  let lineas = [];
  while (true) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fs);
    lineas = parrafos.flatMap((parrafo) => doc.splitTextToSize(parrafo, anchoTexto));
    if (lineas.length <= maxLineas || fs <= 6.5) break;
    fs -= 0.5;
  }
  if (lineas.length > maxLineas) {
    lineas = lineas.slice(0, maxLineas);
    lineas[maxLineas - 1] = `${String(lineas[maxLineas - 1]).trimEnd()}…`;
  }
  if (!lineas.length) lineas = [""];

  if (etiqueta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(etiqueta, x, y);
  }

  lineas.forEach((linea, index) => {
    const ly = y + index * lineHeight;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fs);
    doc.setTextColor(...NAVY);
    doc.text(linea, index === 0 ? x + offset : x, ly);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.7);
    doc.line(x, ly + 4.5, x + w, ly + 4.5);
  });

  return y + (lineas.length - 1) * lineHeight;
}

function lineaFirma(doc, { x, y, w, label }) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.7);
  doc.line(x, y, x + w, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x + w / 2, y + 10, { align: "center" });
}

function dibujarRecibo(doc, recibo, { y0, alto, copia }) {
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;
  const W = pageW - M * 2;
  const inner = M + 18;
  const innerW = W - 36;

  // Marco
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.roundedRect(M, y0, W, alto, 9, 9, "S");

  // Banda navy (esquinas de abajo cuadradas para que apoye en el cuerpo)
  doc.setFillColor(...NAVY);
  doc.roundedRect(M, y0, W, 48, 9, 9, "F");
  doc.rect(M, y0 + 38, W, 10, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text("RECIBO", inner, y0 + 31);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(recibo.numero, M + W - 18, y0 + 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 226);
  doc.text(copia, M + W - 18, y0 + 38, { align: "right" });

  // Lugar y fecha
  let y = y0 + 70;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const lugarFecha = [recibo.lugar, fmtFechaLarga(recibo.fecha)].filter(Boolean).join(", ");
  doc.text(lugarFecha, M + W - 18, y, { align: "right" });

  // Cuerpo. Los renglones van en posiciones fijas: así el recibo se ve igual
  // siempre, tenga el concepto un renglón o cuatro, y el importe nunca se
  // acerca al renglón de la firma.
  campo(doc, { x: inner, y: y0 + 94, w: innerW, label: "Recibí de", value: recibo.emisor });
  campo(doc, { x: inner, y: y0 + 124, w: innerW, label: "La cantidad de", value: recibo.enLetras, size: 10.5, maxLineas: 2, lineHeight: 20 });
  campo(doc, { x: inner, y: y0 + 170, w: innerW, label: "En concepto de", value: recibo.concepto, size: 11, maxLineas: 4, lineHeight: 19 });

  // Importe en números: la caja del papel, en grande y sin lugar a dudas.
  y = y0 + 244;
  const boxW = 232;
  const boxH = 42;
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...LINE);
  doc.roundedRect(inner, y, boxW, boxH, 7, 7, "FD");
  doc.setFillColor(...NAVY);
  doc.rect(inner, y + 7, 3.5, boxH - 14, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("SON", inner + 16, y + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...NAVY);
  doc.text(fmtMoney(recibo.importe, recibo.moneda), inner + 16, y + 34);

  // Datos de referencia al costado del importe: sirven para archivar el papel
  // sin tener que abrir el sistema.
  const refX = inner + boxW + 20;
  const refs = [
    recibo.proveedor ? ["Proveedor", recibo.proveedor] : null,
    recibo.centroCosto ? ["Centro de costo", recibo.centroCosto] : null,
    recibo.dni ? ["DNI / CUIT", recibo.dni] : null,
  ].filter(Boolean);
  const refValorX = refX + 76;
  const refValorW = inner + innerW - refValorX;
  let ry = y + 12;
  refs.slice(0, 3).forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), refX, ry);
    doc.setFont("helvetica", "bold");
    let fs = 9;
    doc.setFontSize(fs);
    const texto = String(value);
    while (fs > 6.5 && doc.getTextWidth(texto) > refValorW) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    // Si ni achicado entra, se corta con puntos suspensivos: que se vea que
    // hay más, en vez de perder media razón social sin aviso.
    let valor = texto;
    if (doc.getTextWidth(valor) > refValorW) {
      while (valor.length > 1 && doc.getTextWidth(`${valor}…`) > refValorW) valor = valor.slice(0, -1);
      valor = `${valor.trimEnd()}…`;
    }
    doc.setTextColor(...NAVY);
    doc.text(valor, refValorX, ry);
    ry += 14;
  });

  // Firmas. Los dos renglones van vacíos a propósito: los completa de puño y
  // letra quien cobra, que es de lo que da fe el papel.
  const firmaY = y0 + alto - 40;
  const anchoFirma = (innerW - 28) / 2;
  lineaFirma(doc, { x: inner, y: firmaY, w: anchoFirma - 20, label: "Firma" });
  lineaFirma(doc, { x: inner + anchoFirma + 8, y: firmaY, w: anchoFirma - 20, label: "Aclaración" });

}

/* ── API ────────────────────────────────────────────────────────────────── */

export function normalizeRecibo(input = {}) {
  const importe = Number(input.importe || 0);
  const moneda = input.moneda === "USD" ? "USD" : "ARS";
  const fecha = String(input.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    numero: input.numero || numeroRecibo({ fecha, semilla: input.semilla }),
    fecha,
    lugar: String(input.lugar || "").trim(),
    emisor: String(input.emisor || "").trim(),
    proveedor: String(input.proveedor || "").trim(),
    dni: String(input.dni || "").trim(),
    concepto: String(input.concepto || "").trim(),
    centroCosto: String(input.centroCosto || "").trim(),
    importe,
    moneda,
    enLetras: importeEnLetras(importe, moneda),
  };
}

export async function buildReciboPdf(input, { copias = 2 } = {}) {
  const recibo = normalizeRecibo(input);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const alto = 356;
  const etiquetas = copias >= 2 ? ["ORIGINAL", "DUPLICADO"] : ["ORIGINAL"];

  etiquetas.forEach((copia, index) => {
    const y0 = 46 + index * (alto + 32);
    dibujarRecibo(doc, recibo, { y0, alto, copia });
  });

  if (etiquetas.length > 1) {
    // Línea de corte entre las dos copias.
    const pageW = doc.internal.pageSize.getWidth();
    const yCorte = 46 + alto + 16;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([4, 4], 0);
    doc.line(28, yCorte, pageW - 28, yCorte);
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("cortar aquí", pageW / 2, yCorte - 4, { align: "center" });
  }

  const nombre = `recibo-${safePart(recibo.numero)}${recibo.proveedor ? `-${safePart(recibo.proveedor)}` : ""}.pdf`;
  return { doc, recibo, nombre };
}

export async function descargarReciboPdf(input, options) {
  const { doc, nombre } = await buildReciboPdf(input, options);
  doc.save(nombre);
}

// Abre el diálogo de impresión directo. Si el navegador bloquea el pop-up
// (pasa en el celular) no se pierde el recibo: se descarga.
export async function imprimirRecibo(input, options) {
  const { doc, nombre } = await buildReciboPdf(input, options);
  try {
    doc.autoPrint();
    const url = doc.output("bloburl");
    const win = window.open(url, "_blank");
    if (!win) {
      doc.save(nombre);
      return { impreso: false, descargado: true };
    }
    return { impreso: true, descargado: false };
  } catch {
    doc.save(nombre);
    return { impreso: false, descargado: true };
  }
}
