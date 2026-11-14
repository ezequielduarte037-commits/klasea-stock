import { colLetra, descargarXlsx } from "../compras/xlsx.js";

/**
 * La lista de una obra y la matriz de una línea, exportadas a Excel.
 *
 * Sale para repasar ítem por ítem: antes de entregar el barco, durante la obra
 * para ver qué nunca se compró, y al terminar para ver qué sobró en la lista
 * (o se compró de más o nadie lo instaló). Por eso dos hojas:
 *
 *   Para imprimir  la lista agrupada como en pantalla, con una casilla para
 *                  tildar y una columna vacía para anotar a mano. Repite el
 *                  encabezado en cada página y entra de ancho en una A4.
 *   Datos          todo en una tabla plana, sin filas de grupo, para filtrar y
 *                  ordenar en Excel. Acá van los precios y las observaciones.
 *
 * Recibe filas ya calculadas (estado, cantidades): las mismas cuentas que la
 * pantalla, así el papel y la pantalla no se contradicen.
 */

const T = {
  navy: "12324A", navyClaro: "1E4A6B",
  texto: "16232C", suave: "5B6C77", tenue: "94A3AC",
  linea: "D6DEE4", grupo: "E7EDF1", cebra: "F7F9FA", blanco: "FFFFFF",
};

// Los colores de la columna Estado de la pantalla. "Pendiente" es la única
// excepción: en pantalla es gris, pero en el papel es lo que se sale a buscar
// (nunca se pidió), así que tiene que saltar a la vista.
const ESTADOS = {
  Pendiente: { color: "9E2A2A", fondo: "F6DEDE", b: true },
  Pedido: { color: "0A6480", fondo: "D9EDF4" },
  Comprado: { color: "1F4FA3", fondo: "DEE8F7" },
  "En pañol": { color: "12694A", fondo: "DCEFE6" },
  Parcial: { color: "5F3894", fondo: "EDE5F7" },
  Entregado: { color: "5F3894", fondo: "EDE5F7" },
};

const borde = { arriba: { color: T.linea }, abajo: { color: T.linea }, izq: { color: T.linea }, der: { color: T.linea } };
const medio = { v: "center" };

const ESTILO = {
  titulo: { fuente: { b: true, sz: 15, color: T.navy }, alineacion: medio },
  subtitulo: { fuente: { sz: 10, color: T.suave }, alineacion: medio },
  cabecera: { fuente: { b: true, sz: 10, color: T.blanco }, fondo: T.navyClaro, borde, alineacion: { v: "center", wrap: true } },
  grupo: { fuente: { b: true, sz: 10.5, color: T.navy }, fondo: T.grupo, borde, alineacion: medio },
};

const redondear = (v) => Math.round(Number(v || 0) * 100) / 100;

function celdaDe(col, valor, cebra) {
  const { tipo } = col;
  const wrap = !!col.envolver;
  const fondo = cebra ? T.cebra : undefined;
  const base = { borde, ...(fondo ? { fondo } : {}) };
  switch (tipo) {
    case "check":
      return { v: "☐", s: { ...base, fuente: { sz: 13, color: T.suave }, alineacion: { h: "center", v: "center" } } };
    case "notas":
      return { v: "", s: base };
    case "material":
      return { v: valor, s: { ...base, fuente: { sz: 10, color: T.texto }, alineacion: { v: "center", wrap } } };
    case "num": {
      const n = valor === "" || valor == null ? "" : redondear(valor);
      return { v: n, s: { ...base, fuente: { sz: 10, color: n ? T.texto : T.tenue }, alineacion: { h: "right", v: "center" } } };
    }
    case "cantidad":
      return { v: redondear(valor), s: { ...base, fuente: { b: true, sz: 10, color: T.texto }, alineacion: { h: "right", v: "center" } } };
    case "plata":
      return { v: valor || "", s: { ...base, fuente: { sz: 10, color: T.texto }, alineacion: { h: "right", v: "center" }, formatoNumero: "#,##0.00" } };
    case "centro":
      return { v: valor ?? "", s: { ...base, fuente: { sz: 9, color: T.suave }, alineacion: { h: "center", v: "center" } } };
    case "estado": {
      const e = ESTADOS[valor];
      return {
        v: valor || "",
        s: e
          ? { borde, fondo: e.fondo, fuente: { b: !!e.b, sz: 9.5, color: e.color }, alineacion: { h: "center", v: "center" } }
          : { ...base, fuente: { sz: 9.5, color: T.suave }, alineacion: { h: "center", v: "center" } },
      };
    }
    case "notaPrecio":
      // Sólo "Sin precio" falta de verdad; "En conjunto" y "No lleva" no.
      return { v: valor || "", s: { ...base, fuente: { b: valor === "Sin precio", sz: 9.5, color: valor === "Sin precio" ? "9E2A2A" : T.suave }, alineacion: medio } };
    default:
      return { v: valor ?? "", s: { ...base, fuente: { sz: 9.5, color: T.suave }, alineacion: { v: "center", wrap } } };
  }
}

// Excel no agranda la fila sola si se le fija el alto, y sin alto fijo las
// filas quedan de 15 puntos: muy bajas para tildar con birome. Se calcula a
// mano cuántos renglones ocupa el texto más largo.
function altoDeFila(columnas, fila, minimo) {
  let renglones = 1;
  for (const col of columnas) {
    if (!col.envolver) continue;
    const texto = String(col.valor(fila) ?? "");
    if (!texto) continue;
    const porRenglon = Math.max(8, Math.floor(col.ancho * 1.12));
    renglones = Math.max(renglones, Math.ceil(texto.length / porRenglon));
  }
  return Math.max(minimo, renglones * 13 + 7);
}

function encabezado(ancho, titulo, subtitulo) {
  const relleno = (s) => Array.from({ length: ancho - 1 }, () => ({ v: "", s }));
  return [
    [{ v: titulo, s: ESTILO.titulo }, ...relleno(ESTILO.titulo)],
    [{ v: subtitulo, s: ESTILO.subtitulo }, ...relleno(ESTILO.subtitulo)],
    [],
  ];
}

/** La hoja que se imprime: agrupada, con casilla y lugar para anotar. */
function hojaParaImprimir({ titulo, subtitulo, pie, columnas, grupos }) {
  const ancho = columnas.length;
  const fin = colLetra(ancho - 1);
  const filas = encabezado(ancho, titulo, subtitulo);
  const merges = [`A1:${fin}1`, `A2:${fin}2`];
  const altos = { 0: 24, 1: 16 };

  const filaCabecera = filas.length;
  filas.push(columnas.map((col) => ({ v: col.titulo, s: { ...ESTILO.cabecera, alineacion: { h: col.alinear || "left", v: "center", wrap: true } } })));
  altos[filaCabecera] = 22;

  for (const grupo of grupos) {
    if (!grupo.filas.length) continue;
    const texto = `${grupo.nombre || "Sin clasificar"}  ·  ${grupo.filas.length} ${grupo.filas.length === 1 ? "ítem" : "ítems"}`;
    filas.push([{ v: texto, s: ESTILO.grupo }, ...Array.from({ length: ancho - 1 }, () => ({ v: "", s: ESTILO.grupo }))]);
    merges.push(`A${filas.length}:${fin}${filas.length}`);
    altos[filas.length - 1] = 20;
    grupo.filas.forEach((fila, i) => {
      filas.push(columnas.map((col) => celdaDe(col, col.valor(fila), i % 2 === 1)));
      altos[filas.length - 1] = altoDeFila(columnas, fila, 20);
    });
  }

  return {
    nombre: "Para imprimir",
    filas,
    merges,
    altos,
    activa: true,
    anchos: columnas.map((col) => col.ancho),
    congelar: { fila: filaCabecera + 1, col: 0 },
    imprimir: { orientacion: "landscape", ajustarAncho: true, repetirFilas: [filaCabecera], pie },
  };
}

/** La hoja para trabajar en Excel: plana, con autofiltro, sin merges. */
function hojaDeDatos({ titulo, subtitulo, pie, columnas, filas: datos }) {
  const ancho = columnas.length;
  const fin = colLetra(ancho - 1);
  const filas = encabezado(ancho, titulo, subtitulo);
  const filaCabecera = filas.length;
  filas.push(columnas.map((col) => ({ v: col.titulo, s: { ...ESTILO.cabecera, alineacion: { h: col.alinear || "left", v: "center", wrap: true } } })));
  datos.forEach((fila, i) => {
    filas.push(columnas.map((col) => celdaDe(col, col.valor(fila), i % 2 === 1)));
  });
  return {
    nombre: "Datos",
    filas,
    merges: [`A1:${fin}1`, `A2:${fin}2`],
    altos: { 0: 24, 1: 16, [filaCabecera]: 30 },
    anchos: columnas.map((col) => col.ancho),
    congelar: { fila: filaCabecera + 1, col: 2 },
    autofiltro: `A${filaCabecera + 1}:${fin}${filaCabecera + 1 + datos.length}`,
    imprimir: { orientacion: "landscape", ajustarAncho: true, repetirFilas: [filaCabecera], pie },
  };
}

function fechaLarga(fecha) {
  return fecha.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fechaArchivo = (fecha) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
};

function lineaDeSubtitulo({ total, agrupadoPor, filtros, extra, fecha }) {
  return [
    `${total} ${total === 1 ? "ítem" : "ítems"}`,
    agrupadoPor ? `agrupado por ${agrupadoPor}` : "",
    ...(extra || []),
    filtros?.length ? `filtrado: ${filtros.join(", ")}` : "",
    `exportado ${fechaLarga(fecha)}`,
  ].filter(Boolean).join("  ·  ");
}

const nombreArchivo = (texto) => String(texto || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");

/* ── Lista de una obra ─────────────────────────────────────────────────── */

/**
 * grupos: [{ nombre, filas: [{ descripcion, requisito, codigo, proveedor, rubro,
 *   origen, cantidad, unidad, recibido, entregado, faltaComprar, faltaEntregar,
 *   estado, accion, etapas, precio, moneda, obs }] }]
 * agrupadoPor: "rubro" | "proveedor" | "etapa" | "tipo"
 */
export function hojasListaObra({ obra, linea, grupos, agrupadoPor = "rubro", filtros = [], fecha = new Date() }) {
  const todas = grupos.flatMap((g) => g.filas);
  if (!todas.length) throw new Error("No hay materiales para exportar con los filtros puestos.");

  const titulo = `Obra ${obra}${linea ? ` · ${linea}` : ""} — Lista de materiales`;
  const subtitulo = lineaDeSubtitulo({ total: todas.length, agrupadoPor, filtros, fecha });
  const pie = `Obra ${obra} · lista de materiales · ${fechaLarga(fecha)}`;

  // Si se agrupa por proveedor, la columna de al lado dice el rubro: repetir
  // en cada fila el nombre del grupo no informa nada.
  const otra = agrupadoPor === "proveedor"
    ? { titulo: "Rubro", ancho: 25, tipo: "texto", envolver: true, valor: (f) => f.rubro }
    : { titulo: "Proveedor", ancho: 22, tipo: "texto", envolver: true, valor: (f) => f.proveedor };

  const imprimir = [
    { titulo: "✓", ancho: 4.5, tipo: "check", alinear: "center", valor: () => "" },
    { titulo: "Material", ancho: 46, tipo: "material", envolver: true, valor: (f) => f.descripcion },
    { titulo: "Código", ancho: 16, tipo: "texto", valor: (f) => f.codigo },
    otra,
    { titulo: "Cant.", ancho: 7, tipo: "cantidad", alinear: "right", valor: (f) => f.cantidad },
    { titulo: "Un.", ancho: 7, tipo: "centro", alinear: "center", valor: (f) => f.unidad },
    { titulo: "Recib.", ancho: 7, tipo: "num", alinear: "right", valor: (f) => f.recibido },
    { titulo: "Entreg.", ancho: 7.5, tipo: "num", alinear: "right", valor: (f) => f.entregado },
    { titulo: "Estado", ancho: 11, tipo: "estado", alinear: "center", valor: (f) => f.estado },
    { titulo: "Notas", ancho: 28, tipo: "notas", valor: () => "" },
  ];

  const datos = [
    { titulo: "Rubro", ancho: 18, tipo: "texto", valor: (f) => f.rubro },
    { titulo: "Material", ancho: 44, tipo: "material", valor: (f) => f.descripcion },
    { titulo: "Requisito de matriz", ancho: 26, tipo: "texto", valor: (f) => f.requisito },
    { titulo: "Código", ancho: 16, tipo: "texto", valor: (f) => f.codigo },
    { titulo: "Proveedor", ancho: 22, tipo: "texto", valor: (f) => f.proveedor },
    { titulo: "Origen", ancho: 14, tipo: "texto", valor: (f) => f.origen },
    { titulo: "Necesario", ancho: 10, tipo: "cantidad", alinear: "right", valor: (f) => f.cantidad },
    { titulo: "Unidad", ancho: 9, tipo: "centro", alinear: "center", valor: (f) => f.unidad },
    { titulo: "Recibido", ancho: 9.5, tipo: "num", alinear: "right", valor: (f) => f.recibido },
    { titulo: "Entregado", ancho: 10, tipo: "num", alinear: "right", valor: (f) => f.entregado },
    { titulo: "Falta comprar", ancho: 10, tipo: "num", alinear: "right", valor: (f) => f.faltaComprar },
    { titulo: "Falta entregar", ancho: 10, tipo: "num", alinear: "right", valor: (f) => f.faltaEntregar },
    { titulo: "Estado", ancho: 11, tipo: "estado", alinear: "center", valor: (f) => f.estado },
    { titulo: "Qué hacer", ancho: 17, tipo: "texto", valor: (f) => f.accion },
    { titulo: "Etapa de compra", ancho: 20, tipo: "texto", valor: (f) => f.etapas },
    { titulo: "Precio unit.", ancho: 13, tipo: "plata", alinear: "right", valor: (f) => f.precio },
    { titulo: "Moneda", ancho: 8, tipo: "centro", alinear: "center", valor: (f) => (f.precio ? f.moneda : "") },
    { titulo: "Total", ancho: 14, tipo: "plata", alinear: "right", valor: (f) => (f.precio ? redondear(f.precio * (Number(f.cantidad) || 0)) : "") },
    { titulo: "Observaciones", ancho: 40, tipo: "texto", valor: (f) => f.obs },
  ];

  return [
    hojaParaImprimir({ titulo, subtitulo, pie, columnas: imprimir, grupos }),
    hojaDeDatos({ titulo, subtitulo, pie, columnas: datos, filas: todas }),
  ];
}

export function exportarListaObraXlsx(opciones) {
  const fecha = opciones.fecha || new Date();
  const hojas = hojasListaObra({ ...opciones, fecha });
  descargarXlsx(`lista-obra-${nombreArchivo(opciones.obra)}-${fechaArchivo(fecha)}.xlsx`, hojas);
}

/* ── Matriz de una línea ───────────────────────────────────────────────── */

/**
 * grupos: [{ nombre, filas: [{ descripcion, requisito, codigo, proveedor, rubro,
 *   tipo, esBase, cantidad, unidad, precio, moneda, precioNota, obs }] }]
 * precioNota: lo que dice la columna Precio cuando no hay importe
 * ("En conjunto", "No lleva", "Sin precio").
 */
export function hojasMatrizLinea({ linea, grupos, agrupadoPor = "proveedor", filtros = [], extra = [], fecha = new Date() }) {
  const todas = grupos.flatMap((g) => g.filas);
  if (!todas.length) throw new Error("No hay materiales para exportar con los filtros puestos.");

  const titulo = `Matriz ${linea} — Lista maestra de la línea`;
  const subtitulo = lineaDeSubtitulo({ total: todas.length, agrupadoPor, filtros, extra, fecha });
  const pie = `Matriz ${linea} · lista maestra · ${fechaLarga(fecha)}`;

  const otra = agrupadoPor === "proveedor"
    ? { titulo: "Rubro", ancho: 25, tipo: "texto", envolver: true, valor: (f) => f.rubro }
    : { titulo: "Proveedor", ancho: 22, tipo: "texto", envolver: true, valor: (f) => f.proveedor };

  const imprimir = [
    { titulo: "✓", ancho: 4.5, tipo: "check", alinear: "center", valor: () => "" },
    { titulo: "Material", ancho: 50, tipo: "material", envolver: true, valor: (f) => f.descripcion },
    { titulo: "Código", ancho: 16, tipo: "texto", valor: (f) => f.codigo },
    otra,
    { titulo: "Cant.", ancho: 7.5, tipo: "cantidad", alinear: "right", valor: (f) => f.cantidad },
    { titulo: "Un.", ancho: 7, tipo: "centro", alinear: "center", valor: (f) => f.unidad },
    // Casi todo es estándar: la columna sólo marca lo que no lo es.
    { titulo: "Tipo", ancho: 13, tipo: "texto", envolver: true, valor: (f) => (f.esBase ? "" : f.tipo) },
    { titulo: "Notas", ancho: 30, tipo: "notas", valor: () => "" },
  ];

  const datos = [
    { titulo: "Rubro", ancho: 18, tipo: "texto", valor: (f) => f.rubro },
    { titulo: "Material", ancho: 46, tipo: "material", valor: (f) => f.descripcion },
    { titulo: "Requisito de matriz", ancho: 26, tipo: "texto", valor: (f) => f.requisito },
    { titulo: "Código", ancho: 16, tipo: "texto", valor: (f) => f.codigo },
    { titulo: "Proveedor", ancho: 22, tipo: "texto", valor: (f) => f.proveedor },
    { titulo: "Tipo", ancho: 16, tipo: "texto", valor: (f) => f.tipo },
    { titulo: "Cantidad", ancho: 10, tipo: "cantidad", alinear: "right", valor: (f) => f.cantidad },
    { titulo: "Unidad", ancho: 9, tipo: "centro", alinear: "center", valor: (f) => f.unidad },
    { titulo: "Precio unit.", ancho: 13, tipo: "plata", alinear: "right", valor: (f) => f.precio },
    { titulo: "Moneda", ancho: 8, tipo: "centro", alinear: "center", valor: (f) => (f.precio ? f.moneda : "") },
    { titulo: "Total", ancho: 14, tipo: "plata", alinear: "right", valor: (f) => (f.precio && f.total !== null ? redondear(f.total ?? f.precio * (Number(f.cantidad) || 0)) : "") },
    { titulo: "Nota de precio", ancho: 13, tipo: "notaPrecio", valor: (f) => (f.precio ? "" : f.precioNota) },
    { titulo: "Observaciones", ancho: 44, tipo: "texto", valor: (f) => f.obs },
  ];

  return [
    hojaParaImprimir({ titulo, subtitulo, pie, columnas: imprimir, grupos }),
    hojaDeDatos({ titulo, subtitulo, pie, columnas: datos, filas: todas }),
  ];
}

export function exportarMatrizLineaXlsx(opciones) {
  const fecha = opciones.fecha || new Date();
  const hojas = hojasMatrizLinea({ ...opciones, fecha });
  descargarXlsx(`matriz-${nombreArchivo(opciones.linea)}-${fechaArchivo(fecha)}.xlsx`, hojas);
}
