import { descargarXlsx, celdaRef, colLetra } from "@/features/compras/xlsx";

/**
 * La planilla por obra, exportada a Excel.
 *
 * Tres hojas, porque son tres preguntas distintas y mezclarlas obliga a filtrar
 * a mano cada vez:
 *
 *   Planilla   la matriz completa, con el mismo mapa de calor de la pantalla.
 *   Comprar    solo lo que hay que comprar, agrupado por proveedor y listo
 *              para mandar. Es la hoja que se imprime.
 *   Resumen    de donde salio el archivo: linea, alcance, filtros y totales.
 *
 * El calor se calcula igual que en pantalla -por cantidad y en escala
 * logaritmica- para que el Excel y la pantalla no se contradigan.
 */

const T = {
  navy: "12324A", navyClaro: "1E4A6B",
  texto: "16232C", suave: "5B6C77", tenue: "94A3AC",
  linea: "D6DEE4", lineaFuerte: "AEBEC8",
  cabecera: "E7EDF1", cebra: "F7F9FA", blanco: "FFFFFF",
  verde: "12694A", verdeSuave: "DCEFE6",
  cyan: "0A6480", cyanSuave: "D9EDF4",
  rojo: "9E2A2A",
  violeta: "5F3894", violetaSuave: "EDE5F7",
};

// Los cinco pasos del mapa de calor, del faltante mas chico al mas grande.
const CALOR = ["F6DEDE", "EFC2C2", "E59D9D", "D46F6F", "BE4141"];
const CALOR_TEXTO = ["9E2A2A", "9E2A2A", "6B1A1A", "FFFFFF", "FFFFFF"];

const bordeSuave = { arriba: { color: T.linea }, abajo: { color: T.linea }, izq: { color: T.linea }, der: { color: T.linea } };

const titulo = { fuente: { b: true, sz: 16, color: T.blanco }, fondo: T.navy, alineacion: { v: "center" } };
const subtitulo = { fuente: { sz: 10, color: "C6D6E2" }, fondo: T.navy, alineacion: { v: "center" } };
const cabecera = { fuente: { b: true, sz: 10, color: T.navy }, fondo: T.cabecera, borde: bordeSuave, alineacion: { h: "center", v: "center", wrap: true } };
const cabeceraIzq = { ...cabecera, alineacion: { h: "left", v: "center", wrap: true } };
const grupoFila = { fuente: { b: true, sz: 10, color: T.navyClaro }, fondo: "EDF2F5", borde: bordeSuave, alineacion: { v: "center" } };
const texto = { fuente: { sz: 10, color: T.texto }, borde: bordeSuave, alineacion: { v: "center" } };
const textoTenue = { fuente: { sz: 9, color: T.suave }, borde: bordeSuave, alineacion: { v: "center" } };
const num = { fuente: { sz: 10, color: T.texto }, borde: bordeSuave, alineacion: { h: "center", v: "center" }, formatoNumero: "0.##" };
const numComprar = { fuente: { b: true, sz: 10, color: T.rojo }, borde: bordeSuave, alineacion: { h: "center", v: "center" }, formatoNumero: "0.##" };
const vacio = { fuente: { sz: 10, color: T.tenue }, borde: bordeSuave, alineacion: { h: "center", v: "center" } };

const redondear = (v) => Math.round(Number(v || 0) * 100) / 100;
const nOf = (v) => Number(v || 0);

/** El mismo escalon de calor que usa la pantalla. */
function escalonDeCalor(cantidad, techo) {
  if (!(cantidad > 0)) return -1;
  const tope = Math.log((techo || 1) + 1);
  const nivel = tope > 0 ? Math.min(1, Math.log(cantidad + 1) / tope) : 1;
  return Math.min(4, Math.floor(nivel * 5));
}

function estadoDeCelda(celda) {
  if (!celda) return "nolleva";
  if (celda.requiereProductoConcreto && !celda.productoDefinido) return "sindef";
  if (nOf(celda.pendiente) > 0) return "falta";
  if (nOf(celda.enPanol) > 0) return "espera";
  if (nOf(celda.egresado) > 0) return "entregado";
  return "vacio";
}

export async function exportarPlanillaXlsx({
  linea,
  obraSeleccionada,
  obras,
  grupos,
  cantidadComprar,
  catalogo = [],
}) {
  const filas = grupos.flatMap((grupo) => grupo.filas.map((fila) => ({ grupo: grupo.nombre, fila })));
  if (!filas.length) throw new Error("No hay materiales para exportar con los filtros puestos.");

  const fecha = new Date();
  const alcance = obraSeleccionada?.codigo || "Todas las obras activas";
  const porId = new Map(catalogo.map((m) => [m.id, m]));

  // El techo del calor, sobre lo que realmente se exporta.
  const faltantes = [];
  for (const { fila } of filas) {
    for (const obra of obras) {
      const n = nOf(fila.porObra[obra.id]?.pendiente);
      if (n > 0) faltantes.push(n);
    }
  }
  faltantes.sort((a, b) => a - b);
  const techo = faltantes.length ? faltantes[Math.floor((faltantes.length - 1) * 0.95)] || 1 : 1;

  /* ── Hoja 1 · Planilla ─────────────────────────────────────────────────── */
  const ancho = 5 + obras.length;
  const hoja = [];
  const merges = [];
  const altos = {};

  hoja.push([{ v: `PLANILLA POR OBRA · ${linea}`, s: titulo }, ...Array(ancho - 1).fill({ v: "", s: titulo })]);
  merges.push(`A1:${colLetra(ancho - 1)}1`);
  altos[0] = 30;

  const cuando = fecha.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  hoja.push([{ v: `${alcance}  ·  ${filas.length} materiales  ·  exportado ${cuando}`, s: subtitulo }, ...Array(ancho - 1).fill({ v: "", s: subtitulo })]);
  merges.push(`A2:${colLetra(ancho - 1)}2`);
  altos[1] = 18;

  hoja.push([]);

  const filaCabecera = hoja.length;
  hoja.push([
    { v: "Material", s: cabeceraIzq },
    { v: "Código", s: cabeceraIzq },
    { v: "Proveedor", s: cabeceraIzq },
    { v: "Un.", s: cabecera },
    { v: "Libre en pañol", s: cabecera },
    ...obras.map((obra) => ({ v: obra.codigo, s: cabecera })),
  ]);
  altos[filaCabecera] = 32;

  let grupoActual = null;
  for (const { grupo, fila } of filas) {
    if (grupo !== grupoActual) {
      grupoActual = grupo;
      hoja.push([{ v: grupo, s: grupoFila }, ...Array(ancho - 1).fill({ v: "", s: grupoFila })]);
      merges.push(`A${hoja.length}:${colLetra(ancho - 1)}${hoja.length}`);
    }
    const comprar = redondear(cantidadComprar(fila));
    const material = porId.get(fila.id);
    hoja.push([
      { v: fila.descripcion, s: texto },
      { v: fila.codigo || material?.codigo || "", s: textoTenue },
      { v: fila.proveedor || "sin proveedor", s: fila.proveedor ? textoTenue : { ...textoTenue, fuente: { sz: 9, color: T.rojo } } },
      { v: fila.unidad || "", s: { ...textoTenue, alineacion: { h: "center", v: "center" } } },
      { v: nOf(fila.enPanolLibre) || "", s: num },
      ...obras.map((obra) => {
        const celda = fila.porObra[obra.id];
        const estado = estadoDeCelda(celda);
        if (estado === "nolleva") return { v: "", s: vacio };
        if (estado === "sindef") return { v: "?", s: { fuente: { b: true, sz: 10, color: T.violeta }, fondo: T.violetaSuave, borde: bordeSuave, alineacion: { h: "center", v: "center" } } };
        if (estado === "falta") {
          const paso = escalonDeCalor(nOf(celda.pendiente), techo);
          return {
            v: nOf(celda.pendiente),
            s: { fuente: { b: true, sz: 10, color: CALOR_TEXTO[paso] }, fondo: CALOR[paso], borde: bordeSuave, alineacion: { h: "center", v: "center" }, formatoNumero: "0.##" },
          };
        }
        if (estado === "espera") return { v: nOf(celda.enPanol), s: { fuente: { sz: 10, color: T.cyan }, fondo: T.cyanSuave, borde: bordeSuave, alineacion: { h: "center", v: "center" }, formatoNumero: "0.##" } };
        if (estado === "entregado") return { v: nOf(celda.egresado), s: { fuente: { sz: 10, color: T.verde }, fondo: T.verdeSuave, borde: bordeSuave, alineacion: { h: "center", v: "center" }, formatoNumero: "0.##" } };
        return { v: "", s: vacio };
      }),
    ]);
    if (comprar > 0) hoja[hoja.length - 1][0] = { v: fila.descripcion, s: { ...texto, fuente: { b: true, sz: 10, color: T.texto } } };
  }

  // La leyenda, para que el archivo se entienda sin la pantalla al lado.
  hoja.push([]);
  hoja.push([{ v: "CÓMO LEERLA", s: { fuente: { b: true, sz: 9, color: T.suave } } }]);
  hoja.push([
    { v: "falta poco", s: { fuente: { sz: 9, color: T.suave }, alineacion: { h: "right", v: "center" } } },
    ...CALOR.slice(0, 3).map((c) => ({ v: "", s: { fondo: c, borde: bordeSuave } })),
    { v: "falta mucho", s: { fuente: { sz: 9, color: T.suave } } },
  ]);
  hoja.push([
    { v: "", s: null },
    { v: "", s: { fondo: T.cyanSuave, borde: bordeSuave } },
    { v: "esperando retiro en pañol", s: { fuente: { sz: 9, color: T.suave } } },
  ]);
  hoja.push([
    { v: "", s: null },
    { v: "", s: { fondo: T.verdeSuave, borde: bordeSuave } },
    { v: "ya entregado a la obra", s: { fuente: { sz: 9, color: T.suave } } },
  ]);
  hoja.push([
    { v: "", s: null },
    { v: "?", s: { fuente: { b: true, sz: 10, color: T.violeta }, fondo: T.violetaSuave, borde: bordeSuave, alineacion: { h: "center" } } },
    { v: "producto de matriz sin definir", s: { fuente: { sz: 9, color: T.suave } } },
  ]);
  hoja.push([
    { v: "", s: null },
    { v: "", s: { borde: bordeSuave } },
    { v: "vacío = este barco no lleva ese material", s: { fuente: { sz: 9, color: T.suave } } },
  ]);

  /* ── Hoja 2 · Comprar ──────────────────────────────────────────────────── */
  const aComprar = filas
    .map(({ fila }) => ({ fila, cantidad: redondear(cantidadComprar(fila)) }))
    .filter((x) => x.cantidad > 0)
    .sort((a, b) => {
      const pa = a.fila.proveedor || "zzz sin proveedor";
      const pb = b.fila.proveedor || "zzz sin proveedor";
      return pa.localeCompare(pb, "es") || a.fila.descripcion.localeCompare(b.fila.descripcion, "es");
    });

  const compra = [];
  const mergesCompra = [];
  const altosCompra = {};
  compra.push([{ v: `QUÉ HAY QUE COMPRAR · ${linea}`, s: titulo }, ...Array(4).fill({ v: "", s: titulo })]);
  mergesCompra.push("A1:E1");
  altosCompra[0] = 30;
  compra.push([{ v: `${alcance}  ·  ${aComprar.length} materiales  ·  ${cuando}`, s: subtitulo }, ...Array(4).fill({ v: "", s: subtitulo })]);
  mergesCompra.push("A2:E2");
  altosCompra[1] = 18;
  compra.push([]);
  const filaCabCompra = compra.length;
  compra.push([
    { v: "Material", s: cabeceraIzq },
    { v: "Código", s: cabeceraIzq },
    { v: "Cantidad", s: cabecera },
    { v: "Un.", s: cabecera },
    { v: "Libre en pañol", s: cabecera },
  ]);
  altosCompra[filaCabCompra] = 26;

  let proveedorActual = null;
  for (const { fila, cantidad } of aComprar) {
    const proveedor = fila.proveedor || "SIN PROVEEDOR ASIGNADO";
    if (proveedor !== proveedorActual) {
      proveedorActual = proveedor;
      const tono = fila.proveedor ? grupoFila : { ...grupoFila, fuente: { b: true, sz: 10, color: T.rojo } };
      compra.push([{ v: proveedor, s: tono }, ...Array(4).fill({ v: "", s: tono })]);
      mergesCompra.push(`A${compra.length}:E${compra.length}`);
    }
    compra.push([
      { v: fila.descripcion, s: texto },
      { v: fila.codigo || "", s: textoTenue },
      { v: cantidad, s: numComprar },
      { v: fila.unidad || "", s: { ...textoTenue, alineacion: { h: "center", v: "center" } } },
      { v: nOf(fila.enPanolLibre) || "", s: num },
    ]);
  }
  if (!aComprar.length) {
    compra.push([{ v: "No hay nada para comprar con los filtros puestos.", s: textoTenue }]);
  }

  /* ── Hoja 3 · Resumen ──────────────────────────────────────────────────── */
  const conFalta = filas.filter(({ fila }) => obras.some((o) => nOf(fila.porObra[o.id]?.pendiente) > 0)).length;
  const sinDefinir = filas.reduce((total, { fila }) => total + obras.filter((o) => {
    const c = fila.porObra[o.id];
    return c?.requiereProductoConcreto && !c.productoDefinido;
  }).length, 0);
  const sinProveedor = filas.filter(({ fila }) => !fila.proveedor && cantidadComprar(fila) > 0).length;
  const unidades = redondear(aComprar.reduce((s, x) => s + x.cantidad, 0));

  const resumen = [
    [{ v: `RESUMEN · ${linea}`, s: titulo }, { v: "", s: titulo }, { v: "", s: titulo }],
    [{ v: alcance, s: subtitulo }, { v: "", s: subtitulo }, { v: "", s: subtitulo }],
    [],
    [{ v: "Dato", s: cabeceraIzq }, { v: "Valor", s: cabecera }, { v: "", s: cabecera }],
    [{ v: "Materiales en la planilla", s: texto }, { v: filas.length, s: num }],
    [{ v: "Obras incluidas", s: texto }, { v: obras.length, s: num }],
    [{ v: "Materiales con algo faltante", s: texto }, { v: conFalta, s: num }],
    [{ v: "Materiales que hay que comprar", s: texto }, { v: aComprar.length, s: numComprar }],
    [{ v: "Unidades a comprar en total", s: texto }, { v: unidades, s: numComprar }],
    [{ v: "De esos, sin proveedor asignado", s: texto }, { v: sinProveedor, s: sinProveedor ? numComprar : num }],
    [{ v: "Cruces con producto de matriz sin definir", s: texto }, { v: sinDefinir, s: num }],
    [],
    [{ v: "Exportado", s: textoTenue }, { v: fecha, s: { ...textoTenue, formatoNumero: "dd/mm/yyyy hh:mm" } }],
    [{ v: "Sistema", s: textoTenue }, { v: "Klase A · Planilla por obra", s: textoTenue }],
  ];

  descargarXlsx(`planilla-${linea}${obraSeleccionada ? `-${obraSeleccionada.codigo}` : ""}.xlsx`, [
    {
      nombre: "Planilla",
      filas: hoja,
      merges,
      altos,
      activa: true,
      anchos: [46, 16, 22, 8, 13, ...obras.map(() => 9.5)],
      // Se congela debajo de la cabecera y despues de la columna del material,
      // que es lo mismo que hace la pantalla al scrollear.
      congelar: { fila: filaCabecera + 1, col: 1 },
      autofiltro: `${celdaRef(filaCabecera, 0)}:${celdaRef(filaCabecera, ancho - 1)}`,
    },
    {
      nombre: "Comprar",
      filas: compra,
      merges: mergesCompra,
      altos: altosCompra,
      anchos: [48, 18, 12, 8, 14],
      congelar: { fila: filaCabCompra + 1, col: 0 },
      autofiltro: `A${filaCabCompra + 1}:E${filaCabCompra + 1}`,
    },
    { nombre: "Resumen", filas: resumen, merges: ["A1:C1", "A2:C2"], altos: { 0: 30, 1: 18 }, anchos: [42, 20, 4] },
  ]);

  return { materiales: filas.length, comprar: aComprar.length };
}
