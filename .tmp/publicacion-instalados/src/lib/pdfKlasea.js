// Papel de Klase A: la base común de los PDF que salen del sistema.
//
// La idea es la de un astillero de lujo y no la de un tablero: mucho blanco,
// títulos grandes en mayúsculas finas, rótulos chiquitos y espaciados, líneas
// de un pelo y nada de cajas de colores. El color se reserva para lo que
// tiene que saltar (un ausente, un saldo negativo); lo demás es tinta.
//
// Todo con Helvetica, que viene adentro de cualquier PDF: no se descarga
// ninguna fuente y el texto sigue siendo texto (se puede buscar y copiar).
//
// Uso típico:
//   const doc = new jsPDF({ unit: "pt", format: "a4" });
//   let y = encabezado(doc, { seccion: "Compras", eyebrow: "Rendición", titulo: "Caja chica", ... });
//   y = cifras(doc, { y, items: [...] });
//   autoTable(doc, { startY: y, ...tablaKlasea({ ... }) });
//   pie(doc, { izquierda: "Caja chica · Octubre" });

export const TINTA = [36, 36, 38];
export const ACENTO = [24, 38, 62];
export const GRIS = [124, 126, 130];
export const GRIS_SUAVE = [168, 170, 174];
export const PELO = [214, 216, 219];
export const NIEBLA = [237, 239, 241];
export const ROJO = [168, 36, 36];
export const VERDE = [32, 104, 72];

export const MARGEN = 46;

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** "12 NOV 2026": la fecha como rótulo, sin barras. */
export function fechaRotulo(valor) {
  const iso = String(valor || new Date().toISOString()).slice(0, 10);
  const [a, m, d] = iso.split("-");
  if (!a || !m || !d) return String(valor || "");
  return `${Number(d)} ${MESES[Number(m) - 1] || m} ${a}`;
}

export function fuente(doc, estilo, tam, color = TINTA) {
  doc.setFont("helvetica", estilo);
  doc.setFontSize(tam);
  doc.setTextColor(...color);
}

export function pelo(doc, x1, y1, x2, y2, color = PELO, grosor = 0.5) {
  doc.setDrawColor(...color);
  doc.setLineWidth(grosor);
  doc.line(x1, y1, x2, y2);
}

/**
 * Rótulo: mayúsculas chiquitas y espaciadas. Es la letra de los menús y de
 * los datos técnicos ("ESLORA", "MANGA") y acá se usa para todo lo que es
 * etiqueta y no dato.
 */
export function rotulo(doc, texto, x, y, { tam = 6.8, color = GRIS, espacio = 1.1, align = "left", estilo = "normal" } = {}) {
  const t = String(texto ?? "").toUpperCase();
  fuente(doc, estilo, tam, color);
  doc.setCharSpace(espacio);
  // El espaciado se suma después de cada letra: para alinear a la derecha o
  // al centro hay que medirlo a mano, si no el texto se corre.
  const ancho = doc.getTextWidth(t) + espacio * Math.max(t.length - 1, 0);
  const x0 = align === "right" ? x - ancho : align === "center" ? x - ancho / 2 : x;
  doc.text(t, x0, y);
  doc.setCharSpace(0);
  return ancho;
}

/** Ancho que ocupa un rótulo, para acomodar cosas al lado. */
export function anchoRotulo(doc, texto, { tam = 6.8, espacio = 1.1 } = {}) {
  const t = String(texto ?? "").toUpperCase();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(tam);
  return doc.getTextWidth(t) + espacio * Math.max(t.length - 1, 0);
}

/**
 * Título grande en mayúsculas. Se achica antes que salirse del ancho.
 * Devuelve el tamaño con el que quedó.
 */
export function titular(doc, texto, x, y, { tam = 30, ancho = 400, color = TINTA, align = "left" } = {}) {
  const t = String(texto ?? "").toUpperCase();
  let fs = tam;
  fuente(doc, "normal", fs, color);
  while (fs > 14 && doc.getTextWidth(t) > ancho) {
    fs -= 1;
    doc.setFontSize(fs);
  }
  doc.text(t, x, y, { align });
  return fs;
}

/**
 * Cabecera de la primera hoja.
 *
 *   SECCIÓN ············ (K) ············ 12 NOV 2026
 *   ────────────────────────────────────────────────
 *   EYEBROW
 *   TÍTULO GRANDE
 *   subtítulo en gris
 *
 * Devuelve la Y donde puede empezar el contenido.
 */
export function encabezado(doc, {
  seccion = "",
  derecha = "",
  eyebrow = "",
  titulo = "",
  subtitulo = "",
  detalle = "",
  logo = null,
  logotipo = null,
  tamTitulo = 30,
} = {}) {
  const ancho = doc.internal.pageSize.getWidth();
  const util = ancho - MARGEN * 2;

  // Barra de arriba: sección a la izquierda, la marca al centro y la fecha (o
  // el número del papel) a la derecha. Con el logotipo completo (K + KLASE A)
  // la marca ya dice el nombre y a la izquierda va sólo la sección.
  const yBarra = 40;
  const conLogotipo = !!logotipo?.dataUrl;
  const izquierda = conLogotipo ? seccion || "" : seccion ? `Klase A  ·  ${seccion}` : "Klase A Yachts";
  if (izquierda) rotulo(doc, izquierda, MARGEN, yBarra, { color: TINTA });
  if (derecha) rotulo(doc, derecha, ancho - MARGEN, yBarra, { color: TINTA, align: "right" });
  if (conLogotipo) marcaCompleta(doc, { centro: ancho / 2, y: yBarra, logotipo });
  else marca(doc, { centro: ancho / 2, y: yBarra, logo });
  pelo(doc, MARGEN, yBarra + 14, ancho - MARGEN, yBarra + 14);

  let y = yBarra + 52;
  if (eyebrow) {
    rotulo(doc, eyebrow, MARGEN, y, { tam: 7.5, espacio: 1.6 });
    y += 30;
  } else {
    y += 18;
  }
  const fs = titular(doc, titulo, MARGEN, y, { tam: tamTitulo, ancho: util });
  y += Math.max(fs * 0.55, 14);
  if (subtitulo) {
    fuente(doc, "normal", 10.5, TINTA);
    y += 6;
    doc.text(String(subtitulo), MARGEN, y);
    y += 6;
  }
  if (detalle) {
    fuente(doc, "normal", 8.5, GRIS);
    y += 9;
    doc.text(String(detalle), MARGEN, y);
  }
  return y + 24;
}

/**
 * La marca chica, centrada: la K en su círculo. Si no hay imagen (en el
 * celular a veces no carga) se dibuja el círculo con la K en texto, que es
 * la misma idea con trazo fino.
 */
export function marca(doc, { centro, y, logo = null, tam = 20 }) {
  const top = y - tam / 2 - 3;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", centro - tam / 2, top, tam, tam, undefined, "FAST");
      return;
    } catch { /* sigue con la versión dibujada */ }
  }
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.6);
  doc.circle(centro, top + tam / 2, tam / 2 - 0.5, "S");
  fuente(doc, "normal", tam * 0.55, TINTA);
  doc.text("K", centro, top + tam / 2 + tam * 0.19, { align: "center" });
}

/**
 * El logotipo completo (K en su círculo + KLASE A), centrado sobre la barra.
 * `logotipo` es { dataUrl, aspect } de loadNavyWordmark (lib/pdfLogo).
 */
export function marcaCompleta(doc, { centro, y, logotipo, alto = 17 }) {
  const w = alto / (logotipo.aspect || 0.25);
  try {
    doc.addImage(logotipo.dataUrl, "PNG", centro - w / 2, y - alto + 4.5, w, alto, undefined, "FAST");
  } catch { /* sin imagen queda la barra igual */ }
}

/**
 * Cabecera corta para las hojas que siguen: sólo la barra y la línea.
 * Devuelve la Y donde sigue el contenido.
 */
export function encabezadoContinuacion(doc, { seccion = "", derecha = "", titulo = "" } = {}) {
  const ancho = doc.internal.pageSize.getWidth();
  const yBarra = 40;
  rotulo(doc, titulo ? `${seccion ? `${seccion}  ·  ` : ""}${titulo}` : seccion || "Klase A Yachts", MARGEN, yBarra, { color: TINTA });
  if (derecha) rotulo(doc, derecha, ancho - MARGEN, yBarra, { color: TINTA, align: "right" });
  pelo(doc, MARGEN, yBarra + 14, ancho - MARGEN, yBarra + 14);
  return yBarra + 40;
}

/**
 * Fila de cifras, como la ficha técnica de un barco: rótulo chiquito arriba,
 * número grande abajo, separados por líneas verticales finas. Sin cajas.
 *
 * items: [{ rotulo, valor, nota?, color? }]
 * Devuelve la Y de abajo.
 */
export function cifras(doc, { y, items = [], x = MARGEN, ancho = null, tamValor = 19 }) {
  const util = ancho ?? doc.internal.pageSize.getWidth() - MARGEN * 2;
  if (!items.length) return y;
  const col = util / items.length;
  const hayNota = items.some((it) => it.nota);
  const alto = hayNota ? 58 : 44;

  pelo(doc, x, y, x + util, y);
  items.forEach((it, i) => {
    const cx = x + col * i + (i === 0 ? 0 : 14);
    if (i > 0) pelo(doc, x + col * i, y + 10, x + col * i, y + alto - 6);
    rotulo(doc, it.rotulo, cx, y + 17);
    let fs = tamValor;
    fuente(doc, "normal", fs, it.color || TINTA);
    const max = col - (i === 0 ? 14 : 28);
    while (fs > 10 && doc.getTextWidth(String(it.valor)) > max) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    doc.text(String(it.valor), cx, y + 17 + fs + 3);
    if (it.nota) {
      fuente(doc, "normal", 8, GRIS);
      doc.text(String(it.nota), cx, y + alto - 4);
    }
  });
  pelo(doc, x, y + alto + 6, x + util, y + alto + 6);
  return y + alto + 6;
}

/**
 * Título de una sección dentro del papel: rótulo + línea que llega hasta el
 * margen, con un dato opcional a la derecha.
 */
export function seccion(doc, { y, titulo, derecha = "" }) {
  const ancho = doc.internal.pageSize.getWidth();
  const w = rotulo(doc, titulo, MARGEN, y, { tam: 7.5, espacio: 1.5, color: TINTA });
  const wd = derecha ? anchoRotulo(doc, derecha) : 0;
  if (derecha) rotulo(doc, derecha, ancho - MARGEN, y, {});
  pelo(doc, MARGEN + w + 10, y - 2.5, ancho - MARGEN - (wd ? wd + 10 : 0), y - 2.5);
  return y + 12;
}

/**
 * Opciones de jspdf-autotable con el estilo de la casa: encabezado en rótulo
 * chiquito con una línea de tinta abajo, renglones separados por un pelo, sin
 * fondos ni cebra. Se pueden pisar con `extra` (columnStyles, didParseCell…).
 */
export function tablaKlasea({ head, body, foot, columnStyles = {}, margin, startY, ...extra } = {}) {
  const opciones = {
    head,
    body,
    foot,
    startY,
    theme: "plain",
    margin: margin || { left: MARGEN, right: MARGEN },
    styles: {
      font: "helvetica",
      fontSize: 8.6,
      textColor: TINTA,
      cellPadding: { top: 6.5, right: 6, bottom: 6.5, left: 6 },
      lineColor: PELO,
      lineWidth: 0,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fontSize: 6.4,
      fontStyle: "normal",
      textColor: GRIS,
      cellPadding: { top: 4, right: 6, bottom: 7, left: 6 },
    },
    footStyles: {
      fontSize: 9,
      fontStyle: "bold",
      textColor: TINTA,
      cellPadding: { top: 9, right: 6, bottom: 9, left: 6 },
    },
    columnStyles,
  };
  // Lo que pasa cada papel se suma al estilo de la casa en vez de pisarlo
  // entero (un cellPadding propio no tiene que perder el valign).
  for (const [clave, valor] of Object.entries(extra)) {
    const base = opciones[clave];
    opciones[clave] = base && typeof base === "object" && !Array.isArray(base) && valor && typeof valor === "object" && !Array.isArray(valor)
      ? { ...base, ...valor }
      : valor;
  }

  const willDrawCell = extra.willDrawCell;
  const didDrawCell = extra.didDrawCell;
  const didParseCell = extra.didParseCell;
  opciones.didParseCell = (data) => {
    // El encabezado sigue la alineación de su columna (autoTable sólo la
    // aplica al cuerpo). Al alinear a la derecha se le suma al relleno lo que
    // ocupa el espaciado, que autoTable no mide.
    if (data.section === "head" || data.section === "foot") {
      const halign = columnStyles[data.column.index]?.halign;
      if (halign) data.cell.styles.halign = halign;
    }
    didParseCell?.(data);
    if (data.section === "head" && data.cell.styles.halign === "right") {
      const largo = String(data.cell.text?.join?.("") ?? data.cell.raw ?? "").length;
      const p = data.cell.styles.cellPadding;
      data.cell.styles.cellPadding = { ...p, right: (p.right ?? 6) + 0.9 * Math.max(largo - 1, 0) };
    }
  };
  opciones.willDrawCell = (data) => {
    // Encabezado espaciado como un rótulo.
    if (data.section === "head") data.doc.setCharSpace(0.9);
    willDrawCell?.(data);
  };
  opciones.didDrawCell = (data) => {
    const d = data.doc;
    d.setCharSpace(0);
    const { x, y, width, height } = data.cell;
    if (data.section === "head") {
      d.setDrawColor(...TINTA);
      d.setLineWidth(0.7);
      d.line(x, y + height, x + width, y + height);
    } else if (data.section === "body") {
      d.setDrawColor(...PELO);
      d.setLineWidth(0.4);
      d.line(x, y + height, x + width, y + height);
    } else if (data.section === "foot" && data.row.index === 0) {
      d.setDrawColor(...TINTA);
      d.setLineWidth(0.7);
      d.line(x, y, x + width, y);
    }
    didDrawCell?.(data);
  };
  // El encabezado se ve en mayúsculas sin tener que escribirlo así.
  if (Array.isArray(head)) {
    opciones.head = head.map((fila) => fila.map((c) => (typeof c === "string" ? c.toUpperCase() : c?.content ? { ...c, content: String(c.content).toUpperCase() } : c)));
  }
  return opciones;
}

/**
 * Pie en todas las hojas: línea fina, a la izquierda lo que es el papel y a
 * la derecha "1 / 3". Se llama al final, cuando ya se sabe cuántas hojas hay.
 */
export function pie(doc, { izquierda = "Klase A Yachts", centro = "" } = {}) {
  const total = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    const y = alto - 28;
    pelo(doc, MARGEN, y - 10, ancho - MARGEN, y - 10);
    rotulo(doc, izquierda, MARGEN, y, { tam: 6, color: GRIS });
    if (centro) rotulo(doc, centro, ancho / 2, y, { tam: 6, color: GRIS, align: "center" });
    rotulo(doc, `${String(p).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, ancho - MARGEN, y, { tam: 6, color: GRIS, align: "right" });
  }
}

/** Línea de firma con su rótulo abajo, centrado. */
export function firma(doc, { x, y, ancho, texto }) {
  pelo(doc, x, y, x + ancho, y, TINTA, 0.5);
  rotulo(doc, texto, x + ancho / 2, y + 11, { tam: 6.2, align: "center" });
}

/** Margen de abajo que respetan las tablas para no pisar el pie. */
export const ABAJO = 58;
