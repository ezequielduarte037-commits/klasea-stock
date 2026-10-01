import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Detalle de adicionales para entregarle al cliente.
 *
 * Es un detalle para revisión y pago, NO una factura: lo dice en el
 * encabezado y en el pie de cada hoja, y no afirma que nada esté pagado.
 *
 * Reglas que antes no se cumplían (medido con 85-2, 117 renglones):
 *  - El total va UNA vez, al final de su tabla. autoTable repetía el pie en
 *    las cinco hojas y parecía un subtotal de página.
 *  - Lo que no tiene importe no se mezcla con lo que se cobra: eran 93 de 117
 *    renglones "En cotizacion" entre medio. Van en su propia sección (o no
 *    van) y nunca se suman.
 *  - Los renglones cancelados en Compras no se le muestran al cliente.
 *  - Pesos y dólares nunca se suman entre sí.
 *  - Los nombres y descripciones no se corrigen: sólo se emprolija cómo se
 *    muestran (espacios, mayúscula inicial). Los errores se arreglan en la
 *    pantalla, que es de donde salen.
 *
 * Un renglón puede tener un desglose (los comprobantes que lo componen) y un
 * PDF adjunto con las copias. El desglose va en un anexo al que se llega con
 * un enlace desde el renglón, y las copias se agregan al final del mismo
 * archivo: el cliente las abre sin links externos ni archivos sueltos.
 */

const NAVY = [14, 54, 83];
const INK = [38, 42, 48];
const MUTED = [108, 117, 132];
const FAINT = [150, 157, 168];
const RULE = [214, 220, 228];
const HAIR = [232, 236, 241];
const SOFT = [244, 246, 249];

const MARGEN = 48;
const PIE = 50;
const ARRIBA_CONTINUACION = 54;

const LETRAS_ANEXO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const NO_FACTURA = "Detalle para revisión y pago. No válido como factura.";

/* ── Texto ───────────────────────────────────────────────────────────────── */

// Las fuentes estándar del PDF sólo tienen el juego WinAnsi. Lo que no está
// ahí salía como basura; se cambia por lo más parecido.
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REEMPLAZOS = { "−": "-", "‐": "-", "≥": ">=", "≤": "<=", "″": "\"", "′": "'" };

export function textoPdf(valor) {
  let salida = "";
  for (const caracter of String(valor ?? "").normalize("NFC")) {
    const codigo = caracter.codePointAt(0);
    if ((codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff) || WINANSI_EXTRA.has(caracter)) {
      salida += caracter;
    } else if (REEMPLAZOS[caracter]) {
      salida += REEMPLAZOS[caracter];
    } else if (caracter === "\n" || caracter === "\t") {
      salida += " ";
    } else {
      const base = caracter.normalize("NFD").replace(/[̀-ͯ]/g, "");
      salida += /^[\x20-\x7e]$/.test(base) ? base : "?";
    }
  }
  return salida;
}

/** Espacios prolijos y mayúscula inicial. No toca nada más del texto cargado. */
export function descripcionVisible(valor) {
  const limpio = String(valor ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return "Sin descripción";
  return limpio[0].toLocaleUpperCase("es-AR") + limpio.slice(1);
}

export function plata(valor, moneda = "ARS") {
  const numero = Number(valor || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "USD" ? `USD ${numero}` : `$ ${numero}`;
}

export function fechaCorta(iso) {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

export function fechaLarga(iso) {
  const fecha = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isNaN(fecha.getTime())
    ? ""
    : fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

export function hoyISO() {
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
}

const plural = (n, uno, varios) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

/* ── Cantidad ────────────────────────────────────────────────────────────── */

const UNIDADES = [
  [/^(u|un|und|unid|unidad|unidades)\.?$/i, () => "u."],
  [/^(m|mt|mts|metro|metros)\.?$/i, () => "m"],
  [/^(m2|m²|mts2|metro cuadrado|metros cuadrados)$/i, () => "m²"],
  [/^(kg|kgs|kilo|kilos)\.?$/i, () => "kg"],
  // "L" y no "l": "4 l" se lee como 41.
  [/^(l|lt|lts|litro|litros)\.?$/i, () => "L"],
];

function unidadVisible(unidad, cantidad) {
  const texto = String(unidad || "").trim();
  if (!texto) return "";
  for (const [patron, corta] of UNIDADES) if (patron.test(texto)) return corta();
  const minuscula = texto.toLocaleLowerCase("es-AR");
  // "2 lata" -> "2 latas": la unidad viene en singular desde Compras.
  if (cantidad !== 1 && /^[a-záéíóúñ]+$/.test(minuscula) && !/s$/.test(minuscula)) {
    return /[aeiouáéíóú]$/.test(minuscula) ? `${minuscula}s` : `${minuscula}es`;
  }
  return minuscula;
}

function numeroCantidad(valor) {
  const texto = String(valor ?? "").trim();
  if (!/^\d+([.,]\d+)?$/.test(texto)) return null;
  return Number(texto.replace(",", "."));
}

/**
 * "8 u.", "2 latas", "10 m²". Primero la cantidad cargada a mano en el
 * renglón; si no hay, la de la línea de compra vinculada.
 */
export function cantidadVisible(item, compra = null) {
  const manual = String(item?.cantidad ?? "").trim();
  if (manual) {
    const n = numeroCantidad(manual);
    return n === null ? manual : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }
  let cantidad = compra?.cantidad ?? null;
  let unidad = compra?.unidad ?? "";
  if (cantidad == null) {
    // Renglones viejos: la cantidad quedó escrita en las notas al vincularlos.
    const match = String(item?.notes || "").match(/^([\d.,]+)\s*([^/]*?)\s*\/\s*Estado/i);
    if (match) [, cantidad, unidad] = match;
  }
  const n = numeroCantidad(cantidad);
  if (n === null) return "";
  const numero = n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const u = unidadVisible(unidad, n);
  return u ? `${numero} ${u}` : numero;
}

/* ── Desglose ────────────────────────────────────────────────────────────── */

/** Normaliza lo que viene de la columna `desglose` (jsonb). */
export function leerDesglose(valor) {
  const crudo = typeof valor === "string" ? (() => { try { return JSON.parse(valor); } catch { return null; } })() : valor;
  if (!crudo || typeof crudo !== "object") return null;
  const comprobantes = (Array.isArray(crudo.comprobantes) ? crudo.comprobantes : [])
    .map((c) => ({
      numero: String(c?.numero ?? "").trim(),
      fecha: String(c?.fecha ?? "").slice(0, 10),
      importe: c?.importe === "" || c?.importe == null ? null : Number(c.importe),
      pagina: c?.pagina === "" || c?.pagina == null ? null : Math.trunc(Number(c.pagina)) || null,
    }))
    .filter((c) => c.numero || c.importe != null);
  if (!comprobantes.length) return null;
  return { emisor: String(crudo.emisor ?? "").trim(), comprobantes };
}

export function sumaDesglose(desglose) {
  return Math.round((desglose?.comprobantes ?? []).reduce((t, c) => t + Number(c.importe || 0), 0) * 100) / 100;
}

/** Diferencia (en centavos redondeados) entre el desglose y el importe del renglón. */
export function diferenciaDesglose(item) {
  const desglose = leerDesglose(item?.desglose);
  if (!desglose || item?.amount == null) return 0;
  return Math.round((sumaDesglose(desglose) - Number(item.amount)) * 100) / 100;
}

function resumenDesglose(desglose) {
  const fechas = desglose.comprobantes.map((c) => c.fecha).filter(Boolean).sort();
  const partes = [plural(desglose.comprobantes.length, "comprobante", "comprobantes")];
  if (desglose.emisor) partes[0] += ` de ${desglose.emisor}`;
  if (fechas.length > 1 && fechas[0] !== fechas[fechas.length - 1]) {
    partes.push(`del ${fechaCorta(fechas[0])} al ${fechaCorta(fechas[fechas.length - 1])}`);
  } else if (fechas.length) {
    partes.push(`del ${fechaCorta(fechas[0])}`);
  }
  return partes.join(", ");
}

/* ── Armado del contenido ────────────────────────────────────────────────── */

/**
 * Pasa los renglones de la tabla a lo que va en el PDF.
 *
 * @param {object[]} rows  renglones de purchase_additional_items
 * @param {object} [opciones]
 * @param {(item) => ({estado?: string, cantidad?: any, unidad?: string} | null)} [opciones.compraDe]
 *        estado actual de la línea de compra vinculada (no el que quedó
 *        escrito en las notas cuando se vinculó)
 * @param {boolean} [opciones.incluirSinImporte]
 */
export function prepararDetalle(rows, { compraDe = () => null, incluirSinImporte = true } = {}) {
  const estadoDe = (item) => {
    const vivo = compraDe(item)?.estado;
    if (vivo) return String(vivo).toLowerCase();
    const enNotas = String(item.notes || "").match(/Estado:\s*([^/]+)/i);
    return enNotas ? enNotas[1].trim().toLowerCase() : "";
  };

  const ordenados = [...rows].sort((a, b) =>
    String(a.entry_date || "").localeCompare(String(b.entry_date || ""))
    || String(a.created_at || "").localeCompare(String(b.created_at || "")));

  const cancelados = ordenados.filter((item) => estadoDe(item) === "cancelado");
  const vigentes = ordenados.filter((item) => estadoDe(item) !== "cancelado");

  const renglon = (item) => {
    const desglose = leerDesglose(item.desglose);
    return {
      id: item.id,
      descripcion: descripcionVisible(item.detail),
      cantidad: cantidadVisible(item, compraDe(item)),
      importe: item.amount == null || item.amount === "" ? null : Number(item.amount),
      moneda: item.currency === "USD" ? "USD" : "ARS",
      desglose,
      adjunto: item.adjunto_path
        ? { path: item.adjunto_path, nombre: item.adjunto_nombre || "comprobantes.pdf" }
        : null,
      item,
    };
  };

  const conImporte = vigentes.filter((item) => item.amount != null && item.amount !== "").map(renglon);
  const sinImporte = vigentes.filter((item) => item.amount == null || item.amount === "").map(renglon);

  const monedas = ["ARS", "USD"]
    .map((moneda) => {
      const filas = conImporte.filter((r) => r.moneda === moneda);
      const total = Math.round(filas.reduce((t, r) => t + r.importe, 0) * 100) / 100;
      return { moneda, filas, total };
    })
    .filter((m) => m.filas.length);

  // Numeración corrida en todo el documento: el cliente puede decir "el 12".
  let numero = 0;
  for (const m of monedas) for (const r of m.filas) r.numero = ++numero;
  if (incluirSinImporte) for (const r of sinImporte) r.numero = ++numero;

  const anexos = [];
  for (const m of monedas) {
    for (const r of m.filas) {
      if (!r.desglose) continue;
      r.anexo = { letra: LETRAS_ANEXO[anexos.length] ?? String(anexos.length + 1), renglon: r };
      anexos.push(r.anexo);
    }
  }

  return {
    monedas,
    sinImporte: incluirSinImporte ? sinImporte : [],
    sinImporteOmitidos: incluirSinImporte ? 0 : sinImporte.length,
    cancelados: cancelados.length,
    anexos,
  };
}

/* ── PDF ─────────────────────────────────────────────────────────────────── */

async function cargarPdfLib() {
  return import("pdf-lib");
}

/**
 * Arma el PDF completo y devuelve sus bytes.
 *
 * @param {object} p
 * @param {object} p.board          tabla de adicionales (name, project)
 * @param {object[]} p.rows         renglones
 * @param {(item) => object|null} [p.compraDe]
 * @param {boolean} [p.incluirSinImporte]
 * @param {string|null} [p.logo]    dataURL del logo ya en navy
 * @param {Map<string, ArrayBuffer|Uint8Array>} [p.adjuntos]  bytes del PDF adjunto por id de renglón
 * @param {string} [p.fecha]        ISO
 * @returns {Promise<{ bytes: Uint8Array, paginas: number, avisos: string[] }>}
 */
export async function construirDetalleAdicionales({
  board, rows, compraDe, incluirSinImporte = true, logo = null, adjuntos = new Map(), fecha = hoyISO(),
}) {
  const detalle = prepararDetalle(rows, { compraDe, incluirSinImporte });
  const avisos = [];

  // Las copias se leen antes de dibujar: hace falta saber cuántas hojas suman
  // para poner "Página n de N" en todas.
  const pdfLib = detalle.anexos.some((a) => adjuntos.has(a.renglon.id)) ? await cargarPdfLib() : null;
  const copias = new Map();
  for (const anexo of detalle.anexos) {
    const bytes = adjuntos.get(anexo.renglon.id);
    if (!bytes || !pdfLib) continue;
    try {
      const original = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      copias.set(anexo.renglon.id, original);
    } catch {
      avisos.push(`No se pudo leer el PDF adjunto de "${anexo.renglon.descripcion}": el anexo va sin las copias.`);
    }
  }
  const hojasCopias = [...copias.values()].reduce((t, d) => t + d.getPageCount(), 0);

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  const fondo = alto - PIE;
  const obra = textoPdf(board?.project?.codigo || board?.name || "");
  const descripcionObra = textoPdf(board?.project?.descripcion || "");

  const fuente = (estilo, tam, color) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...color);
  };
  const trazo = (x1, y1, x2, y2, color, grosor) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(grosor);
    doc.line(x1, y1, x2, y2);
  };

  /* Encabezados */
  const encabezadoContinuacion = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, ancho, 6, "F");
    fuente("bold", 8.5, NAVY);
    doc.text(textoPdf(`Detalle de adicionales  ·  ${obra}`), MARGEN, 30);
    fuente("normal", 8.5, MUTED);
    doc.text(textoPdf(fechaLarga(fecha)), ancho - MARGEN, 30, { align: "right" });
  };

  // Hojas que ya tienen su encabezado: la primera (marca) y las de
  // continuación, las abra quien las abra (nuevaHoja o autoTable al cortar).
  const conEncabezado = new Set([1]);
  const asegurarEncabezado = () => {
    const actual = doc.internal.getCurrentPageInfo().pageNumber;
    if (conEncabezado.has(actual)) return;
    conEncabezado.add(actual);
    encabezadoContinuacion();
  };

  const nuevaHoja = () => {
    doc.addPage();
    asegurarEncabezado();
    return ARRIBA_CONTINUACION;
  };

  // Primera hoja: marca como siempre (banda navy, K, KLASE A / YACHTS).
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, ancho, 12, "F");
  if (logo) doc.addImage(logo, "PNG", MARGEN, 34, 38, 38, undefined, "FAST");
  fuente("bold", 21, NAVY);
  doc.text("KLASE A", MARGEN + 50, 52);
  fuente("bold", 7.5, MUTED);
  doc.setCharSpace(3.6);
  doc.text("YACHTS", MARGEN + 51.5, 65);
  doc.setCharSpace(0);
  fuente("normal", 9, MUTED);
  doc.text(textoPdf(fechaLarga(fecha)), ancho - MARGEN, 52, { align: "right" });

  fuente("bold", 24, INK);
  doc.text("Detalle de adicionales", MARGEN, 118);
  fuente("normal", 11, INK);
  let y = 140;
  doc.text(textoPdf(`Embarcación ${obra}${descripcionObra ? `  ·  ${descripcionObra}` : ""}`), MARGEN, y);
  y += 16;
  fuente("normal", 9, MUTED);
  doc.text(textoPdf(NO_FACTURA), MARGEN, y);
  y += 22;

  /* Totales, bien visibles y por moneda */
  const cajas = detalle.monedas.map((m) => ({
    titulo: m.moneda === "USD" ? "Total en dólares" : "Total en pesos",
    valor: plata(m.total, m.moneda),
    pie: plural(m.filas.length, "renglón", "renglones"),
  }));
  if (cajas.length) {
    const separacion = 12;
    const anchoCaja = (util - separacion * (cajas.length - 1)) / cajas.length;
    cajas.forEach((caja, i) => {
      const x = MARGEN + i * (anchoCaja + separacion);
      doc.setFillColor(...(i === 0 ? NAVY : SOFT));
      doc.roundedRect(x, y, anchoCaja, 66, 4, 4, "F");
      fuente("bold", 7.5, i === 0 ? [190, 205, 220] : MUTED);
      doc.setCharSpace(0.8);
      doc.text(caja.titulo.toUpperCase(), x + 14, y + 19);
      doc.setCharSpace(0);
      fuente("bold", 19, i === 0 ? [255, 255, 255] : NAVY);
      doc.text(caja.valor, x + 14, y + 43);
      fuente("normal", 8.5, i === 0 ? [190, 205, 220] : MUTED);
      doc.text(caja.pie, x + 14, y + 57);
    });
    y += 66 + 12;
    if (detalle.monedas.length > 1) {
      fuente("normal", 8.5, MUTED);
      doc.text("Los importes en pesos y en dólares se informan por separado y no se suman entre sí.", MARGEN, y + 4);
      y += 14;
    }
  } else {
    fuente("normal", 10, MUTED);
    doc.text("Todavía no hay renglones con importe.", MARGEN, y + 10);
    y += 24;
  }
  const notas = [];
  if (detalle.sinImporte.length) {
    notas.push(`${plural(detalle.sinImporte.length, "renglón está", "renglones están")} en cotización: van al final y no se incluyen en los totales.`);
  }
  if (detalle.sinImporteOmitidos) {
    notas.push(`${plural(detalle.sinImporteOmitidos, "renglón en cotización no figura", "renglones en cotización no figuran")} en este detalle.`);
  }
  if (notas.length) {
    fuente("normal", 8.5, MUTED);
    for (const nota of notas) { doc.text(textoPdf(nota), MARGEN, y + 4); y += 13; }
  }
  y += 14;

  /* Tablas */
  const COL = { numero: 30, cantidad: 66, importe: 112 };
  const anchoDescripcion = (conImporte) => util - COL.numero - COL.cantidad - (conImporte ? COL.importe : 0);
  const enlacesAAnexo = []; // { pagina, y, h, anexo }

  const tituloSeccion = (titulo, detalleDerecha, nota = "") => {
    const altoTitulo = nota ? 40 : 26;
    if (y + altoTitulo + 60 > fondo) y = nuevaHoja();
    fuente("bold", 13, INK);
    doc.text(textoPdf(titulo), MARGEN, y + 12);
    if (detalleDerecha) {
      fuente("normal", 9, MUTED);
      doc.text(textoPdf(detalleDerecha), ancho - MARGEN, y + 12, { align: "right" });
    }
    if (nota) {
      fuente("normal", 8.5, MUTED);
      doc.text(textoPdf(nota), MARGEN, y + 27);
    }
    y += altoTitulo;
  };

  const tabla = ({ filas, conImporte, moneda, total }) => {
    const anchoDesc = anchoDescripcion(conImporte);
    // La descripción se parte acá y no en autoTable para saber cuántos
    // renglones son de la descripción y cuántos del aviso del anexo.
    fuente("normal", 9.5, INK);
    const cuerpo = filas.map((r) => {
      const principal = doc.splitTextToSize(textoPdf(r.descripcion), anchoDesc - 14);
      const extra = r.anexo
        ? doc.splitTextToSize(textoPdf(`${resumenDesglose(r.desglose)}. Ver desglose en el Anexo ${r.anexo.letra} ›`), anchoDesc - 14)
        : [];
      r._lineasPrincipales = principal.length;
      const celdas = [String(r.numero), [...principal, ...extra].join("\n"), textoPdf(r.cantidad || "")];
      if (conImporte) celdas.push(r.importe === 0 ? "Sin cargo" : plata(r.importe, moneda));
      return celdas;
    });
    const cabecera = ["N°", "Descripción", "Cant."];
    if (conImporte) cabecera.push("Importe");
    const columnStyles = {
      0: { cellWidth: COL.numero, halign: "right", textColor: MUTED, fontSize: 8.5 },
      1: { cellWidth: anchoDesc },
      2: { cellWidth: COL.cantidad, halign: "center", textColor: MUTED, fontSize: 9 },
    };
    if (conImporte) columnStyles[3] = { cellWidth: COL.importe, halign: "right", fontStyle: "bold" };

    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, top: ARRIBA_CONTINUACION, bottom: PIE },
      head: [cabecera],
      body: cuerpo,
      foot: conImporte
        ? [["", { content: moneda === "USD" ? "Total en dólares" : "Total en pesos", colSpan: 2 }, plata(total, moneda)]]
        : undefined,
      showFoot: "lastPage",
      showHead: "everyPage",
      theme: "plain",
      rowPageBreak: "avoid",
      styles: {
        font: "helvetica", fontSize: 9.5, textColor: INK, valign: "top",
        cellPadding: { top: 6.5, bottom: 6.5, left: 7, right: 7 }, overflow: "linebreak",
      },
      // Borde del mismo color que el fondo: sin él quedaba una línea blanca
      // entre celda y celda del total.
      headStyles: { fontStyle: "bold", fontSize: 8, textColor: MUTED, fillColor: SOFT, valign: "middle", lineColor: SOFT, lineWidth: 0.8 },
      footStyles: { fontStyle: "bold", fontSize: 10.5, textColor: [255, 255, 255], fillColor: NAVY, valign: "middle", lineColor: NAVY, lineWidth: 0.8 },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === 3) data.cell.styles.halign = "right";
        if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "center";
        if (data.section === "foot" && data.column.index === 3) data.cell.styles.halign = "right";
      },
      willDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 1) return;
        const r = filas[data.row.index];
        if (r?.anexo) {
          r._lineasExtra = data.cell.text.slice(r._lineasPrincipales);
          data.cell.text = data.cell.text.slice(0, r._lineasPrincipales);
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body") {
          // Filete entre renglones: más liviano que una grilla.
          trazo(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height, HAIR, 0.6);
        }
        if (data.section !== "body" || data.column.index !== 1) return;
        const r = filas[data.row.index];
        if (!r?.anexo || !r._lineasExtra?.length) return;
        const lineaAlto = 9.5 * 1.15;
        const yExtra = data.cell.y + data.cell.padding("top") + r._lineasPrincipales * lineaAlto + 2;
        fuente("normal", 8.5, NAVY);
        doc.text(r._lineasExtra, data.cell.x + data.cell.padding("left"), yExtra, { baseline: "top", lineHeightFactor: 1.25 });
        enlacesAAnexo.push({
          pagina: doc.internal.getCurrentPageInfo().pageNumber,
          y: data.cell.y,
          h: data.cell.height,
          anexo: r.anexo,
        });
        r.anexo.paginaRenglon = doc.internal.getCurrentPageInfo().pageNumber;
        r.anexo.yRenglon = data.cell.y;
      },
      didDrawPage: asegurarEncabezado,
    });
    y = doc.lastAutoTable.finalY + 30;
  };

  detalle.monedas.forEach((m) => {
    tituloSeccion(
      m.moneda === "USD" ? "Adicionales en dólares" : "Adicionales en pesos",
      plural(m.filas.length, "renglón", "renglones"),
    );
    tabla({ filas: m.filas, conImporte: true, moneda: m.moneda, total: m.total });
  });

  if (detalle.sinImporte.length) {
    tituloSeccion(
      "En cotización",
      plural(detalle.sinImporte.length, "renglón", "renglones"),
      "Todavía no tienen importe. No se incluyen en los totales de este detalle.",
    );
    tabla({ filas: detalle.sinImporte, conImporte: false });
  }

  /* Anexos: desglose de cada renglón que lo tiene */
  const enlacesACopia = []; // { pagina, x, y, w, h, anexo, paginaCopia }
  const paginaAnexo = new Map();
  for (const anexo of detalle.anexos) {
    const r = anexo.renglon;
    const copia = copias.get(r.id);
    y = nuevaHoja();
    paginaAnexo.set(anexo.letra, doc.internal.getCurrentPageInfo().pageNumber);
    anexo.pagina = doc.internal.getCurrentPageInfo().pageNumber;

    fuente("bold", 8, MUTED);
    doc.setCharSpace(0.8);
    doc.text(`ANEXO ${anexo.letra}`, MARGEN, y + 8);
    doc.setCharSpace(0);
    fuente("bold", 17, INK);
    const titulo = doc.splitTextToSize(textoPdf(`Desglose de “${r.descripcion}”`), util);
    doc.text(titulo, MARGEN, y + 30);
    y += 30 + (titulo.length - 1) * 20 + 16;
    fuente("normal", 9.5, INK);
    const resumen = doc.splitTextToSize(textoPdf(`${resumenDesglose(r.desglose)}. Corresponde al renglón ${r.numero} del detalle, por ${plata(r.importe, r.moneda)}.`), util);
    doc.text(resumen, MARGEN, y);
    y += resumen.length * 12 + 4;
    fuente("normal", 9, NAVY);
    doc.text("Volver al renglón", MARGEN, y + 6);
    anexo.volver = { pagina: doc.internal.getCurrentPageInfo().pageNumber, x: MARGEN, y: y - 3, w: doc.getTextWidth("Volver al renglón"), h: 13 };
    y += 24;

    const suma = sumaDesglose(r.desglose);
    const coincide = Math.abs(suma - r.importe) < 0.005;
    if (!coincide) {
      avisos.push(`El desglose de "${r.descripcion}" suma ${plata(suma, r.moneda)} y el renglón dice ${plata(r.importe, r.moneda)}.`);
    }

    const conCopia = !!copia;
    const head = [["N°", "Comprobante", "Fecha", "Importe"]];
    if (conCopia) head[0].push("Copia");
    const body = r.desglose.comprobantes.map((c, i) => {
      const fila = [String(i + 1), textoPdf(c.numero || "-"), fechaCorta(c.fecha) || "-", c.importe == null ? "-" : plata(c.importe, r.moneda)];
      if (conCopia) fila.push(c.pagina ? "Ver copia ›" : "");
      return fila;
    });
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, top: ARRIBA_CONTINUACION, bottom: PIE },
      head,
      body,
      foot: [["", { content: coincide ? "Total" : "Total del desglose", colSpan: 2 }, plata(suma, r.moneda), ...(conCopia ? [""] : [])]],
      showFoot: "lastPage",
      theme: "plain",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 9.5, textColor: INK, cellPadding: { top: 6, bottom: 6, left: 7, right: 7 } },
      headStyles: { fontStyle: "bold", fontSize: 8, textColor: MUTED, fillColor: SOFT, lineColor: SOFT, lineWidth: 0.8 },
      footStyles: { fontStyle: "bold", fontSize: 10.5, textColor: [255, 255, 255], fillColor: NAVY, lineColor: NAVY, lineWidth: 0.8 },
      columnStyles: {
        0: { cellWidth: 30, halign: "right", textColor: MUTED, fontSize: 8.5 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 82 },
        3: { cellWidth: 112, halign: "right" },
        ...(conCopia ? { 4: { cellWidth: 76, halign: "right", textColor: NAVY, fontSize: 8.5 } } : {}),
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.section !== "body") data.cell.styles.halign = "right";
      },
      didDrawCell: (data) => {
        if (data.section === "body") {
          trazo(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height, HAIR, 0.6);
        }
        if (!conCopia || data.section !== "body" || data.column.index !== 4) return;
        const c = r.desglose.comprobantes[data.row.index];
        if (!c?.pagina || c.pagina > copia.getPageCount()) return;
        enlacesACopia.push({
          pagina: doc.internal.getCurrentPageInfo().pageNumber,
          x: MARGEN, y: data.cell.y, w: util, h: data.cell.height,
          anexo, paginaCopia: c.pagina,
        });
      },
      didDrawPage: asegurarEncabezado,
    });
    y = doc.lastAutoTable.finalY + 18;
    if (conCopia) {
      anexo.hojasCopia = copia.getPageCount();
      fuente("normal", 9, MUTED);
      const texto = doc.splitTextToSize(
        `Las copias de los comprobantes van a continuación (${plural(copia.getPageCount(), "hoja", "hojas")}). Cada renglón de esta tabla abre su copia.`,
        util,
      );
      if (y + texto.length * 12 > fondo) y = nuevaHoja();
      doc.text(texto, MARGEN, y);
    }
  }

  // Enlaces del renglón al anexo y del anexo al renglón: las dos hojas ya existen.
  for (const enlace of enlacesAAnexo) {
    doc.setPage(enlace.pagina);
    doc.link(MARGEN, enlace.y, util, enlace.h, { pageNumber: enlace.anexo.pagina, top: 0 });
  }
  for (const anexo of detalle.anexos) {
    if (!anexo.volver || !anexo.paginaRenglon) continue;
    doc.setPage(anexo.volver.pagina);
    doc.link(anexo.volver.x, anexo.volver.y, anexo.volver.w, anexo.volver.h, { pageNumber: anexo.paginaRenglon, top: Math.max(0, anexo.yRenglon - 20) });
  }

  /* Pie en todas las hojas propias, contando las copias que se agregan después */
  const hojasPropias = doc.getNumberOfPages();
  const total = hojasPropias + hojasCopias;
  for (let n = 1; n <= hojasPropias; n += 1) {
    doc.setPage(n);
    trazo(MARGEN, alto - 36, ancho - MARGEN, alto - 36, HAIR, 0.6);
    fuente("normal", 7.5, FAINT);
    doc.text(textoPdf(`Klase A Yachts  ·  ${NO_FACTURA}`), MARGEN, alto - 24);
    doc.text(`Página ${n} de ${total}`, ancho - MARGEN, alto - 24, { align: "right" });
  }

  let bytes = new Uint8Array(doc.output("arraybuffer"));
  if (!copias.size) return { bytes, paginas: total, avisos };

  /* Copias originales al final, con enlaces de ida y vuelta */
  const { PDFDocument, PDFName, PDFNull, StandardFonts, rgb } = pdfLib;
  const final = await PDFDocument.load(bytes);
  const helvetica = await final.embedFont(StandardFonts.Helvetica);
  const enlace = (pagina, [x1, y1, x2, y2], destino, arriba) => {
    const anotacion = final.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x1, y1, x2, y2],
      Border: [0, 0, 0],
      Dest: [destino.ref, PDFName.of("XYZ"), PDFNull, arriba ?? PDFNull, PDFNull],
    });
    pagina.node.addAnnot(final.context.register(anotacion));
  };

  const inicioCopia = new Map();
  let numeroHoja = hojasPropias;
  for (const anexo of detalle.anexos) {
    const original = copias.get(anexo.renglon.id);
    if (!original) continue;
    const paginas = await final.copyPages(original, original.getPageIndices());
    inicioCopia.set(anexo.letra, final.getPageCount());
    paginas.forEach((pagina, i) => {
      final.addPage(pagina);
      numeroHoja += 1;
      const { width } = pagina.getSize();
      // Rótulo abajo, sobre fondo blanco para que se lea aunque el escaneo
      // tenga algo en el margen.
      const rotulo = textoPdf(`Anexo ${anexo.letra}  ·  Copia ${i + 1} de ${paginas.length}  ·  Página ${numeroHoja} de ${total}`);
      const volver = "Volver al desglose";
      const tam = 7.5;
      const anchoRotulo = helvetica.widthOfTextAtSize(rotulo, tam);
      const anchoVolver = helvetica.widthOfTextAtSize(volver, tam);
      pagina.drawRectangle({ x: 0, y: 0, width, height: 22, color: rgb(1, 1, 1) });
      pagina.drawText(rotulo, { x: width - 24 - anchoRotulo, y: 8, size: tam, font: helvetica, color: rgb(0.45, 0.48, 0.53) });
      pagina.drawText(volver, { x: 24, y: 8, size: tam, font: helvetica, color: rgb(NAVY[0] / 255, NAVY[1] / 255, NAVY[2] / 255) });
      enlace(pagina, [22, 5, 26 + anchoVolver, 18], final.getPage(anexo.pagina - 1));
    });
  }

  for (const e of enlacesACopia) {
    const inicio = inicioCopia.get(e.anexo.letra);
    if (inicio == null) continue;
    const pagina = final.getPage(e.pagina - 1);
    const altoPagina = pagina.getSize().height;
    enlace(pagina, [e.x, altoPagina - e.y - e.h, e.x + e.w, altoPagina - e.y], final.getPage(inicio + e.paginaCopia - 1));
  }

  bytes = await final.save({ useObjectStreams: true });
  return { bytes, paginas: final.getPageCount(), avisos };
}

export function nombreArchivoDetalle(board, fecha = hoyISO()) {
  const nombre = String(board?.project?.codigo || board?.name || "adicionales")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `Adicionales_${nombre || "obra"}_${fecha}.pdf`;
}
