import { jsPDF } from "jspdf";
import { GRIS, PELO, TINTA, fuente, pelo, rotulo } from "../../lib/pdfKlasea.js";

// Recibo imprimible de caja chica: el mismo papel que se llenaba a mano
// ("Recibí de ... la cantidad de ... en concepto de ... Son $ ...") pero ya
// completo. Lo único que queda por hacer arriba del papel es firmar.
//
// El papel va sin marca: ni logo, ni nombre de la empresa, ni pie. Quién
// entrega el dinero se escribe (o no) en "Recibí de". Del papel de la casa
// toma sólo la tipografía y las líneas.
//
// Salen dos copias por hoja (ORIGINAL y DUPLICADO) separadas por una línea de
// corte: una la firma quien cobra y queda en la carpeta de la caja, la otra se
// la lleva. Es exactamente el circuito que ya hacían con el talonario.

// Mismo papel que el resto (lib/pdfKlasea): rótulos espaciados, líneas de un
// pelo, nada de cajas. Pero sin la cabecera de la casa: este papel no lleva
// marca.

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

// Campo de talonario: rótulo chiquito y espaciado arriba, el dato abajo sobre
// su renglón. El texto se achica antes que desbordar, y si aun así no entra
// usa los renglones siguientes (el concepto tiene cuatro, como el talonario
// viejo): un recibo con el concepto cortado no sirve
// como comprobante. Los renglones se dibujan aunque queden vacíos, así el
// papel se ve igual siempre.
function campo(doc, { x, y, w, label, value, size = 11.5, renglones = 1, lineHeight = 18 }) {
  rotulo(doc, label, x, y, { tam: 6.6, espacio: 1.3 });

  // Los saltos de línea que escribió el usuario se respetan: si cargó dos
  // viajes en dos renglones, en el papel siguen siendo dos renglones.
  const parrafos = String(value ?? "")
    .split(/\r?\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);

  let fs = size;
  let lineas = [];
  while (true) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    lineas = parrafos.flatMap((parrafo) => doc.splitTextToSize(parrafo, w - 2));
    if (lineas.length <= renglones || fs <= 7) break;
    fs -= 0.5;
  }
  if (lineas.length > renglones) {
    lineas = lineas.slice(0, renglones);
    lineas[renglones - 1] = `${String(lineas[renglones - 1]).replace(/[\s.]+$/, "")}…`;
  }

  for (let i = 0; i < renglones; i += 1) {
    const ly = y + 16 + i * lineHeight;
    if (lineas[i]) {
      fuente(doc, "normal", fs, TINTA);
      doc.text(lineas[i], x, ly);
    }
    pelo(doc, x, ly + 5, x + w, ly + 5, PELO, 0.5);
  }
}

function lineaFirma(doc, { x, y, w, label }) {
  pelo(doc, x, y, x + w, y, TINTA, 0.5);
  rotulo(doc, label, x + w / 2, y + 11, { tam: 6.2, espacio: 1.3, align: "center" });
}

// Un dato de referencia al costado del importe: rótulo arriba, valor abajo.
// Si ni achicado entra, se corta con puntos suspensivos: que se vea que hay
// más, en vez de perder media razón social sin aviso.
function referencia(doc, { x, y, w, label, value }) {
  const anchoRotulo = 90;
  rotulo(doc, label, x, y, { tam: 6, espacio: 1.2 });
  x += anchoRotulo;
  w -= anchoRotulo;
  let fs = 9.5;
  fuente(doc, "normal", fs, TINTA);
  const texto = String(value);
  while (fs > 6.5 && doc.getTextWidth(texto) > w) {
    fs -= 0.5;
    doc.setFontSize(fs);
  }
  let valor = texto;
  if (doc.getTextWidth(valor) > w) {
    while (valor.length > 1 && doc.getTextWidth(`${valor}…`) > w) valor = valor.slice(0, -1);
    valor = `${valor.trimEnd()}…`;
  }
  doc.text(valor, x, y);
}

function dibujarRecibo(doc, recibo, { y0, alto, copia }) {
  const pageW = doc.internal.pageSize.getWidth();
  const M = 52;
  const W = pageW - M * 2;
  const derecha = M + W;

  // Barra de arriba: qué copia es y el número. Sin marca: quién entrega el
  // dinero se escribe (o no) en "Recibí de".
  rotulo(doc, copia, M, y0 + 10, { color: TINTA, espacio: 1.6 });
  rotulo(doc, `N.º  ${recibo.numero}`, derecha, y0 + 10, { color: TINTA, espacio: 1.2, align: "right" });
  pelo(doc, M, y0 + 20, derecha, y0 + 20);

  // Título y, a la derecha, lugar y fecha.
  fuente(doc, "normal", 30, TINTA);
  doc.setCharSpace(1.5);
  doc.text("RECIBO", M, y0 + 60);
  doc.setCharSpace(0);
  const lugarFecha = [recibo.lugar, fmtFechaLarga(recibo.fecha)].filter(Boolean).join(", ");
  if (lugarFecha) {
    rotulo(doc, "Lugar y fecha", derecha, y0 + 45, { tam: 6, espacio: 1.2, align: "right" });
    fuente(doc, "normal", 10, TINTA);
    doc.text(lugarFecha, derecha, y0 + 59, { align: "right" });
  }

  // Cuerpo. Los renglones van en posiciones fijas: así el recibo se ve igual
  // siempre, tenga el concepto un renglón o tres, y el importe nunca se
  // acerca a las firmas.
  campo(doc, { x: M, y: y0 + 84, w: W, label: "Recibí de", value: recibo.emisor });
  campo(doc, { x: M, y: y0 + 118, w: W, label: "La cantidad de", value: recibo.enLetras, size: 10.5, renglones: 2, lineHeight: 16 });
  campo(doc, { x: M, y: y0 + 168, w: W, label: "En concepto de", value: recibo.concepto, size: 11, renglones: 4, lineHeight: 15 });

  // Importe en números, grande y sin lugar a dudas, como la cifra principal
  // de una ficha técnica. Al lado, los datos para archivar el papel sin abrir
  // el sistema.
  const yImporte = y0 + 244;
  const anchoImporte = 236;
  pelo(doc, M, yImporte, derecha, yImporte, TINTA, 0.7);
  rotulo(doc, "Son", M, yImporte + 15, { tam: 6.6, espacio: 1.3 });
  let fs = 25;
  fuente(doc, "normal", fs, TINTA);
  const importe = fmtMoney(recibo.importe, recibo.moneda);
  while (fs > 14 && doc.getTextWidth(importe) > anchoImporte - 12) {
    fs -= 1;
    doc.setFontSize(fs);
  }
  doc.text(importe, M, yImporte + 43);

  const refs = [
    recibo.proveedor ? ["Proveedor", recibo.proveedor] : null,
    recibo.centroCosto ? ["Centro de costo", recibo.centroCosto] : null,
    recibo.dni ? ["DNI / CUIT", recibo.dni] : null,
  ].filter(Boolean);
  if (refs.length) {
    const xRefs = M + anchoImporte;
    pelo(doc, xRefs, yImporte + 8, xRefs, yImporte + 48, PELO, 0.5);
    // Apilados: en fila no entra una razón social larga.
    refs.forEach(([label, value], i) => {
      referencia(doc, { x: xRefs + 18, y: yImporte + 16 + i * 14, w: derecha - xRefs - 18, label, value });
    });
  }
  pelo(doc, M, yImporte + 56, derecha, yImporte + 56);

  // Firmas. Los dos renglones van vacíos a propósito: los completa de puño y
  // letra quien cobra, que es de lo que da fe el papel.
  const firmaY = y0 + alto - 22;
  const anchoFirma = (W - 40) / 2;
  lineaFirma(doc, { x: M, y: firmaY, w: anchoFirma, label: "Firma" });
  lineaFirma(doc, { x: M + anchoFirma + 40, y: firmaY, w: anchoFirma, label: "Aclaración" });
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
    doc.setDrawColor(...PELO);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([3, 4], 0);
    doc.line(28, yCorte, pageW - 28, yCorte);
    doc.setLineDashPattern([], 0);
    rotulo(doc, "Cortar aquí", pageW / 2, yCorte - 5, { tam: 5.5, espacio: 1.2, color: GRIS, align: "center" });
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
