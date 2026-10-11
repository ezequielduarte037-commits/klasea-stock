import { elegirHoja, encontrarEncabezado } from "./normalizarLista.js";

export async function leerExcel(datos) {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array" });
  const cache = new Map();
  const filasDe = (nombre) => {
    if (cache.has(nombre)) return cache.get(nombre);
    const hoja = libro.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null, blankrows: true });
    const encabezado = encontrarEncabezado(filas);
    if (encabezado) {
      const rango = XLSX.utils.decode_range(hoja["!ref"] || "A1");
      const columna = encabezado.columnas.codigo;
      // Un código numérico puede estar formateado como 000123. Conservamos
      // esa identidad, pero los precios siguen siendo números sin formato.
      filas.forEach((fila, indice) => {
        if (indice <= encabezado.fila) return;
        const celda = hoja[XLSX.utils.encode_cell({ r: rango.s.r + indice, c: rango.s.c + columna })];
        if (celda?.t === "n") fila[columna] = XLSX.utils.format_cell(celda);
      });
    }
    cache.set(nombre, filas);
    return filas;
  };
  const hoja = elegirHoja(libro.SheetNames, filasDe);
  if (!hoja) throw new Error("No encontré una hoja con Código, Descripción y Precio. Revisá los encabezados del Excel.");
  return { hoja, filas: filasDe(hoja) };
}
