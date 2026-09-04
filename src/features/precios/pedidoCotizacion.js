import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { zipSync } from "fflate";
import { loadNavyLogo } from "@/lib/pdfLogo";
import { descargarXlsx, celdaRef } from "@/features/compras/xlsx";
import {
  indiceProveedoresPorNombre,
  precioDesactualizado,
  precioVigente,
  proveedorPrincipalId,
} from "@/features/materiales/api";

/**
 * Lista de precios a completar: los ítems que le compramos a un proveedor con
 * una columna vacía para que escriba el precio.
 *
 * A propósito no es una "nota de pedido de cotización" con condiciones de pago,
 * validez de oferta y firma: es la lista y nada más. Lo único que se mantiene
 * fijo es el código interno en cada renglón, porque es la llave con la que
 * después "Cargar remito o factura" vuelve a encontrar el material del catálogo.
 *
 * Sale en tres formatos porque cada proveedor contesta distinto: PDF (imprimir
 * o mandar y que lo devuelvan a mano), Excel (lo completan en la compu) y texto
 * plano (pegarlo en un chat).
 */

const ARCHIVO_MAX = 60;
const TEXTO_MAX_ITEMS = 45;

const navy = [14, 54, 83];
const ink = [45, 48, 54];
const muted = [108, 117, 132];
const XLSX_NAVY = "0E3653";
const XLSX_HEADER = "F1F4F7";
const XLSX_COMPLETAR = "EEF4FA";
const XLSX_BORDE = { izq: {}, der: {}, arriba: {}, abajo: {} };

const limpiar = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();

/**
 * La variante va pegada a la descripción en vez de en su propia columna: casi
 * ningún proveedor tiene variantes, y una columna con "—" en 219 de 220
 * renglones le come el ancho justo a la descripción, que es lo que el proveedor
 * necesita leer.
 */
const descripcionFila = (fila) =>
  fila.variante
    ? `${limpiar(fila.material.descripcion)} — ${limpiar(fila.variante)}`
    : limpiar(fila.material.descripcion);

export function slugArchivo(valor, porDefecto = "proveedor") {
  const base = String(valor || porDefecto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || porDefecto).slice(0, ARCHIVO_MAX);
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaCorta(valor) {
  if (!valor) return "";
  const fecha = new Date(`${String(valor).slice(0, 10)}T12:00:00`);
  return Number.isNaN(fecha.getTime())
    ? ""
    : fecha.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function plata(valor, moneda = "ARS") {
  if (valor == null || valor === "") return "";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";
  const texto = numero.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return moneda === "USD" ? `USD ${texto}` : `$ ${texto}`;
}

/* ── Selección de ítems ──────────────────────────────────────────────────── */

/**
 * Materiales que se le compran a un proveedor, con el precio que hoy tenemos
 * cargado PARA ESE proveedor.
 *
 * `incluirAlternativos` trae además los materiales cuyo proveedor principal es
 * otro y este figura como alternativa. Viene apagado porque en la práctica esos
 * vínculos son casi todos basura heredada: de los 56 que hay en el catálogo, 10
 * son ventanas de Mercoglass colgadas de Favicur por el nombre viejo
 * "Mercoglass/Favicur". Pedirle a un proveedor lo que le compramos a otro es la
 * excepción, no la regla.
 */
export function itemsDeProveedor(materiales, proveedor, { incluirAlternativos = false } = {}) {
  const proveedorId = proveedor?.id;
  if (!proveedorId) return [];
  const indice = indiceProveedoresPorNombre([proveedor]);
  const salida = [];
  for (const material of materiales || []) {
    if (material.activo === false) continue;
    const esPrincipal = proveedorPrincipalId(material, indice) === proveedorId;
    const alterno = incluirAlternativos
      ? (material.proveedores_lista || []).find((row) => row.proveedor_id === proveedorId)
      : null;
    if (!esPrincipal && !alterno) continue;
    const precio = esPrincipal ? material.precio_unitario : alterno?.precio;
    const vigente = esPrincipal ? precioVigente(material) : null;
    salida.push({
      material,
      esPrincipal,
      precio: precio ?? null,
      moneda: (esPrincipal ? material.moneda : alterno?.moneda) || "ARS",
      fecha: vigente?.fecha || null,
      // "Vencido" solo aplica al proveedor principal: es el único que tiene
      // historial de precios con fecha en panol_precios.
      vencido: esPrincipal && precio != null && precioDesactualizado(material),
    });
  }
  return salida.sort((a, b) =>
    a.material.descripcion.localeCompare(b.material.descripcion, "es"),
  );
}

export const ALCANCES = [
  { id: "pendientes", label: "Sin precio o a revisar" },
  { id: "sin-precio", label: "Solo sin precio" },
  { id: "revisar", label: "Solo a revisar" },
  { id: "todos", label: "Todo lo que le compramos" },
];

export function filtrarPorAlcance(items, alcance) {
  if (alcance === "sin-precio") return items.filter((item) => item.precio == null);
  if (alcance === "revisar") return items.filter((item) => item.vencido);
  if (alcance === "pendientes")
    return items.filter((item) => item.precio == null || item.vencido);
  return items;
}

/**
 * Clave de "esto es literalmente lo mismo": sin tildes, en minúscula y con
 * cualquier signo convertido en UN espacio.
 *
 * Nace de un caso real: una migración vieja (origen `migracion_variante`) sacó
 * cada variante a material propio pero al padre le dejó el array `variantes`,
 * así que el mismo producto aparece dos veces con distinto separador —
 * "Bomba achique 2000gph 12V · Rule" (material suelto) y
 * "Bomba achique 2000gph 12V — Rule" (variante del padre). Eran 96 renglones
 * repetidos sobre 946 en 13 proveedores.
 *
 * Los signos se reemplazan por espacio y no se borran: si se borraran,
 * "Cable 2x1,5" y "Cable 2x15" quedarían iguales y son cosas distintas.
 */
const claveRepetido = (fila) => {
  const plano = (texto) =>
    String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${plano(descripcionFila(fila))}|${plano(fila.material.unidad_medida)}`;
};

/**
 * Entre dos renglones que dicen lo mismo gana el que hace volver mejor el
 * precio: primero el que tiene código, después el que es material propio (sin
 * variante), porque el importador de remitos aplica el precio al material y no
 * a la variante.
 */
const puntajeRepetido = (fila) => (fila.codigo ? 2 : 0) + (fila.variante ? 0 : 1);

function quitarRepetidos(filas) {
  const porClave = new Map();
  const repetidos = [];
  for (const fila of filas) {
    const clave = claveRepetido(fila);
    const previa = porClave.get(clave);
    if (!previa) {
      porClave.set(clave, fila);
      continue;
    }
    const gana = puntajeRepetido(fila) > puntajeRepetido(previa) ? fila : previa;
    // Map conserva la posición original al reemplazar el valor: el orden
    // alfabético de la lista no se altera.
    porClave.set(clave, gana);
    repetidos.push(descripcionFila(gana === fila ? previa : fila));
  }
  return { filas: [...porClave.values()], repetidos };
}

/**
 * Un renglón por variante cuando el material las tiene (23L / 4L / 1L no se
 * cotizan al mismo precio). Cada variante puede tener su propio código.
 *
 * Devuelve también los renglones repetidos que se descartaron, para poder
 * avisar en pantalla sin tocar el catálogo.
 */
export function expandirFilas(items, { porVariante = true } = {}) {
  const filas = [];
  for (const item of items) {
    const variantes =
      porVariante && Array.isArray(item.material.variantes)
        ? item.material.variantes
        : [];
    if (!variantes.length) {
      filas.push({
        ...item,
        variante: null,
        codigo: limpiar(item.material.codigo),
        precioRef: item.precio,
      });
      continue;
    }
    const porNombre =
      item.material.variantes_precios &&
      typeof item.material.variantes_precios === "object"
        ? item.material.variantes_precios
        : {};
    for (const nombre of variantes) {
      const info = porNombre[nombre] || {};
      filas.push({
        ...item,
        variante: String(nombre),
        codigo: limpiar(info.codigo || item.material.codigo),
        precioRef: info.precio ?? item.precio,
        moneda: info.moneda || item.moneda,
      });
    }
  }
  return quitarRepetidos(filas);
}

/* ── PDF ─────────────────────────────────────────────────────────────────── */

let logoCache;
function cargarLogoNavy() {
  // Memorizado: al generar 20 listas de una no tiene sentido recolorear el PNG
  // 20 veces. Si falla, la lista sale igual sin logo.
  if (logoCache === undefined)
    logoCache = Promise.resolve()
      .then(loadNavyLogo)
      .catch(() => null);
  return logoCache;
}

/**
 * Arma el PDF y lo devuelve sin guardar (para descargar, imprimir o zippear).
 */
export async function construirPedidoPdf({ proveedor, filas, opciones = {} }) {
  const { fecha = hoyISO(), mostrarUltimoPrecio = false } = opciones;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 40;
  const ancho = pageWidth - left * 2;
  const logo = await cargarLogoNavy();
  // Muchos materiales del catálogo no tienen código: si no hay ninguno, la
  // columna se saca en vez de imprimir 60 guiones.
  const hayCodigo = filas.some((fila) => fila.codigo);
  const nombreProveedor = limpiar(proveedor?.nombre) || "Proveedor";

  const encabezado = (compacto) => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, compacto ? 4 : 6, "F");
    if (compacto) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...navy);
      doc.text(`Precios a completar · ${nombreProveedor}`, left, 26);
      return;
    }
    if (logo?.dataUrl) {
      const w = 26;
      doc.addImage(logo.dataUrl, "PNG", pageWidth - left - w, 26, w, w * (logo.aspect || 1));
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...ink);
    doc.text("Precios a completar", left, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text(
      `${nombreProveedor}  ·  ${fechaCorta(fecha)}  ·  ${filas.length} ítem${filas.length === 1 ? "" : "s"}`,
      left,
      65,
    );
  };

  const pie = (numero) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 157, 168);
    doc.text(`Página ${numero}`, left, pageHeight - 20);
    doc.text("Klase A Yachts", pageWidth - left, pageHeight - 20, { align: "right" });
  };

  encabezado(false);

  const cabecera = ["#"];
  if (hayCodigo) cabecera.push("Código");
  cabecera.push("Descripción", "Unidad");
  if (mostrarUltimoPrecio) cabecera.push("Últ. precio");
  cabecera.push("Precio");

  const cuerpo = filas.map((fila, indice) => {
    const row = [String(indice + 1)];
    if (hayCodigo) row.push(fila.codigo || "—");
    row.push(descripcionFila(fila));
    row.push(limpiar(fila.material.unidad_medida) || "u.");
    if (mostrarUltimoPrecio)
      row.push(fila.precioRef != null ? plata(fila.precioRef, fila.moneda) : "—");
    row.push("");
    return row;
  });

  // Ancho fijo para todo lo que no es descripción; la descripción se queda con
  // lo que sobra (es la columna que de verdad necesita aire).
  // "Un." tiene que aguantar "unidad" en una linea: con menos ancho se parte en
  // dos y cada renglon pasa a medir el doble (220 items = 11 hojas en vez de 7).
  const w = { indice: 20, codigo: 56, unidad: 46, ultimo: 58, precio: 80 };
  const fijos =
    w.indice +
    w.unidad +
    w.precio +
    (hayCodigo ? w.codigo : 0) +
    (mostrarUltimoPrecio ? w.ultimo : 0);
  const columnStyles = {};
  let col = 0;
  columnStyles[col++] = { cellWidth: w.indice, halign: "center", textColor: muted, fontSize: 8 };
  if (hayCodigo) columnStyles[col++] = { cellWidth: w.codigo, fontSize: 8.5, textColor: muted };
  columnStyles[col++] = { cellWidth: Math.max(130, ancho - fijos), fontStyle: "bold" };
  columnStyles[col++] = { cellWidth: w.unidad, halign: "center", fontSize: 8.5, textColor: muted };
  if (mostrarUltimoPrecio)
    columnStyles[col++] = { cellWidth: w.ultimo, halign: "right", fontSize: 8.5, textColor: muted };
  const colPrecio = col;
  columnStyles[col] = { cellWidth: w.precio };

  autoTable(doc, {
    startY: 82,
    margin: { left, right: left, top: 40, bottom: 38 },
    head: [cabecera],
    body: cuerpo,
    theme: "grid",
    rowPageBreak: "avoid",
    columnStyles,
    // Renglones altos: el proveedor escribe el precio a mano sobre el papel.
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 8, right: 5, bottom: 8, left: 5 },
      lineColor: [223, 228, 234],
      lineWidth: 0.7,
      textColor: ink,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 244, 247],
      textColor: [31, 36, 43],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 7, right: 5, bottom: 7, left: 5 },
    },
    didParseCell: (data) => {
      // La única columna que completa el proveedor va marcada en el encabezado.
      if (data.section === "head" && data.column.index === colPrecio) {
        data.cell.styles.fillColor = navy;
        data.cell.styles.textColor = [255, 255, 255];
      }
      if (data.section === "body" && String(data.cell.raw) === "—") {
        data.cell.styles.textColor = [175, 182, 192];
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) encabezado(true);
      pie(data.pageNumber);
    },
  });

  return doc;
}

export function nombreArchivoPedido(proveedor, fecha = hoyISO(), extension = "pdf") {
  return `Precios-${slugArchivo(proveedor?.nombre)}-${fecha}.${extension}`;
}

export async function descargarPedidoPdf(pedido) {
  const doc = await construirPedidoPdf(pedido);
  doc.save(nombreArchivoPedido(pedido.proveedor, pedido.opciones?.fecha));
}

export async function imprimirPedidoPdf(pedido) {
  const doc = await construirPedidoPdf(pedido);
  doc.autoPrint();
  const url = doc.output("bloburl");
  const ventana = window.open(url, "_blank");
  // Si el navegador bloquea la pestaña, al menos que quede el archivo.
  if (!ventana) doc.save(nombreArchivoPedido(pedido.proveedor, pedido.opciones?.fecha));
  return !!ventana;
}

/** Un PDF por proveedor dentro de un zip: se manda uno a cada uno. */
export async function descargarPedidosZip(pedidos, { fecha = hoyISO() } = {}) {
  const archivos = {};
  for (const pedido of pedidos) {
    const doc = await construirPedidoPdf(pedido);
    let nombre = nombreArchivoPedido(pedido.proveedor, pedido.opciones?.fecha || fecha);
    let intento = 2;
    while (archivos[nombre]) {
      nombre = nombreArchivoPedido(
        { nombre: `${pedido.proveedor?.nombre || "proveedor"}-${intento}` },
        pedido.opciones?.fecha || fecha,
      );
      intento += 1;
    }
    archivos[nombre] = new Uint8Array(doc.output("arraybuffer"));
  }
  // Los PDF ya vienen comprimidos: nivel bajo para no perder tiempo de más.
  const zip = zipSync(archivos, { level: 1 });
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Precios-proveedores-${fecha}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Excel ───────────────────────────────────────────────────────────────── */

function hojaPedido(pedido, { activa = false } = {}) {
  const { proveedor, filas, opciones = {} } = pedido;
  const { fecha = hoyISO(), mostrarUltimoPrecio = false } = opciones;
  const hayCodigo = filas.some((fila) => fila.codigo);

  const cabecera = {
    fuente: { b: 1, sz: 10, color: "FFFFFF" },
    fondo: XLSX_NAVY,
    borde: XLSX_BORDE,
    alineacion: { h: "center", v: "center", wrap: true },
  };
  const cabeceraRef = {
    ...cabecera,
    fuente: { b: 1, sz: 10, color: "1F242B" },
    fondo: XLSX_HEADER,
  };
  const celda = { borde: XLSX_BORDE, alineacion: { v: "center", wrap: true }, fuente: { sz: 10 } };
  const celdaTenue = { ...celda, fuente: { sz: 10, color: "7A828F" } };
  const celdaCompletar = {
    borde: XLSX_BORDE,
    fondo: XLSX_COMPLETAR,
    alineacion: { v: "center", h: "right" },
    formatoNumero: "#,##0.00",
  };

  const columnas = ["#"];
  if (hayCodigo) columnas.push("Código");
  columnas.push("Descripción", "Unidad");
  if (mostrarUltimoPrecio) columnas.push("Últ. precio");
  columnas.push("Precio");

  const filasHoja = [
    [
      {
        v: `Precios a completar — ${limpiar(proveedor?.nombre) || "Proveedor"}`,
        s: { fuente: { b: 1, sz: 14, color: XLSX_NAVY } },
      },
    ],
    [
      {
        v: `Klase A Yachts · ${fechaCorta(fecha)} · ${filas.length} ítem${filas.length === 1 ? "" : "s"}`,
        s: { fuente: { sz: 10, color: "6C7584" } },
      },
    ],
    [],
    columnas.map((nombre) => ({ v: nombre, s: nombre === "Precio" ? cabecera : cabeceraRef })),
  ];
  const filaCabecera = filasHoja.length - 1;

  filas.forEach((fila, indice) => {
    const row = [
      { v: indice + 1, s: { ...celdaTenue, alineacion: { h: "center", v: "center" } } },
    ];
    if (hayCodigo) row.push({ v: fila.codigo || "", s: celdaTenue });
    row.push({ v: descripcionFila(fila), s: celda });
    row.push({
      v: limpiar(fila.material.unidad_medida) || "u.",
      s: { ...celdaTenue, alineacion: { h: "center", v: "center" } },
    });
    if (mostrarUltimoPrecio)
      row.push({
        v: fila.precioRef != null ? Number(fila.precioRef) : "",
        s: { ...celdaTenue, alineacion: { h: "right", v: "center" }, formatoNumero: "#,##0.00" },
      });
    row.push({ v: "", s: celdaCompletar });
    filasHoja.push(row);
  });

  const anchos = [5];
  if (hayCodigo) anchos.push(16);
  anchos.push(58, 9);
  if (mostrarUltimoPrecio) anchos.push(14);
  anchos.push(16);

  return {
    nombre: (limpiar(proveedor?.nombre) || "Proveedor")
      .replace(/[\\/*?:[\]]/g, " ")
      .slice(0, 31),
    filas: filasHoja,
    anchos,
    altos: { 0: 22 },
    congelar: { col: 0, fila: filaCabecera + 1 },
    autofiltro: `${celdaRef(filaCabecera, 0)}:${celdaRef(filaCabecera, columnas.length - 1)}`,
    activa,
  };
}

/** Un solo libro: una hoja por proveedor. */
export function descargarPedidoXlsx(pedidos, { fecha = hoyISO() } = {}) {
  const hojas = pedidos.map((pedido, indice) => hojaPedido(pedido, { activa: indice === 0 }));
  const nombre =
    pedidos.length === 1
      ? nombreArchivoPedido(pedidos[0].proveedor, pedidos[0].opciones?.fecha || fecha, "xlsx")
      : `Precios-proveedores-${fecha}.xlsx`;
  descargarXlsx(nombre, hojas);
}

/* ── Texto plano (WhatsApp / mail) ───────────────────────────────────────── */

export function textoPedido({ proveedor, filas }) {
  const lineas = [
    `Hola${proveedor?.nombre ? ` ${limpiar(proveedor.nombre)}` : ""}, ¿nos pasás precio de estos ítems?`,
    "",
  ];
  filas.slice(0, TEXTO_MAX_ITEMS).forEach((fila, indice) => {
    const partes = [`${indice + 1}. `];
    if (fila.codigo) partes.push(`[${fila.codigo}] `);
    partes.push(limpiar(fila.material.descripcion));
    if (fila.variante) partes.push(` — ${fila.variante}`);
    const unidad = limpiar(fila.material.unidad_medida);
    if (unidad) partes.push(` (${unidad})`);
    lineas.push(partes.join(""));
  });
  if (filas.length > TEXTO_MAX_ITEMS)
    lineas.push(`… y ${filas.length - TEXTO_MAX_ITEMS} ítems más (van en la planilla adjunta).`);
  lineas.push("");
  lineas.push("Gracias!");
  return lineas.join("\n");
}
