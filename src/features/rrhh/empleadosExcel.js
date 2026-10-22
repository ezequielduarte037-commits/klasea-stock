import { colLetra, descargarXlsx } from "../compras/xlsx.js";

// Comparte el escritor con las listas de obra: conserva los estilos también
// en Excel de escritorio, sin agregar dependencias al navegador.
const T = { navy: "12324A", azul: "1E4A6B", cyan: "14B8A6", tinta: "203444", gris: "617583", linea: "DFE7ED", cebra: "F5F8FB", blanco: "FFFFFF", rubro: "E5EDF5" };
const GRUPOS = {
  casa: { nombre: "De la casa", orden: 0, fondo: "E8F0FC", color: "2457A0" },
  contratista: { nombre: "Contratistas", singular: "Contratista", orden: 1, fondo: "E3F4F1", color: "126C61" },
  sin_asignar: { nombre: "Sin clasificar", orden: 2, fondo: "F0EDF7", color: "69518A" },
};
const zona = "America/Argentina/Buenos_Aires";
const limpio = (v) => String(v ?? "").trim();
const comparar = (a, b) => limpio(a).localeCompare(limpio(b), "es", { numeric: true, sensitivity: "base" });
const borde = { abajo: { color: T.linea } };
const base = { fuente: { name: "Calibri", sz: 11, color: T.tinta }, alineacion: { v: "center", wrap: true }, borde };
const cabecera = { fuente: { name: "Calibri", b: true, sz: 10, color: T.blanco }, fondo: T.azul, alineacion: { v: "center", wrap: true } };

function partesFecha(fecha) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(fecha).map(p => [p.type, p.value]));
}

function fechaBaja(valor) {
  if (!valor) return "";
  const soloFecha = limpio(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  const p = partesFecha(fecha);
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
}

export function prepararEmpleadosExcel({ empleados = [], contratistas = [], oficios = [], asignaciones = [] } = {}) {
  const contratistaPorId = new Map(contratistas.map(c => [c.id, c.nombre]));
  const oficioPorId = new Map(oficios.map(o => [o.id, o.nombre]));
  const obrasPorId = new Map();
  for (const a of asignaciones) {
    const codigo = limpio(a.obra?.codigo);
    if (!a.empleado_id || !codigo) continue;
    if (!obrasPorId.has(a.empleado_id)) obrasPorId.set(a.empleado_id, new Set());
    obrasPorId.get(a.empleado_id).add(codigo);
  }
  return empleados.map(e => {
    const grupo = GRUPOS[e.grupo] ? e.grupo : "sin_asignar";
    return {
      nombre: limpio(e.nombre) || "Sin nombre", dni: limpio(e.dni), grupo,
      vinculo: GRUPOS[grupo].singular || GRUPOS[grupo].nombre,
      contratista: grupo === "contratista" ? limpio(e.contratista?.nombre || contratistaPorId.get(e.contratista_id)) || "Sin asignar" : "",
      rubro: limpio(e.oficio?.nombre || oficioPorId.get(e.oficio_id)) || "Sin rubro asignado",
      sede: limpio(e.sede) || "Sin asignar",
      obras: [...(obrasPorId.get(e.id) ?? [])].sort(comparar).join(", "),
      ficha: e.ficha === false ? "No" : "Sí",
      condicion: [e.activo === false ? "Baja" : "Activo", e.provisorio === true ? "Provisorio" : "", e.externo === true ? "Externo" : ""].filter(Boolean).join(" · "),
      baja: fechaBaja(e.fecha_baja),
    };
  }).sort((a, b) => (a.rubro === "Sin rubro asignado") - (b.rubro === "Sin rubro asignado")
    || comparar(a.rubro, b.rubro) || GRUPOS[a.grupo].orden - GRUPOS[b.grupo].orden
    || comparar(a.contratista, b.contratista) || comparar(a.nombre, b.nombre) || comparar(a.dni, b.dni));
}

function columnas(conBaja, plana = false) {
  return [
    { titulo: "Nombre y apellido", key: "nombre", ancho: 36 },
    { titulo: "DNI", key: "dni", ancho: 16 },
    ...(plana ? [{ titulo: "Rubro / oficio", key: "rubro", ancho: 26 }] : []),
    { titulo: "Vínculo", key: "vinculo", ancho: 19 },
    { titulo: "Contratista", key: "contratista", ancho: 25 },
    { titulo: "Sede", key: "sede", ancho: 15 },
    { titulo: "Obras asignadas", key: "obras", ancho: 24 },
    { titulo: "Ficha", key: "ficha", ancho: 10 },
    { titulo: "Condición", key: "condicion", ancho: 24 },
    ...(conBaja ? [{ titulo: "Fecha de baja", key: "baja", ancho: 16 }] : []),
  ];
}

function filaEmpleado(persona, cols, indice) {
  return cols.map(col => {
    const s = { ...base, ...(indice % 2 ? { fondo: T.cebra } : {}) };
    if (col.key === "dni") s.formatoNumero = "@";
    if (col.key === "baja") s.formatoNumero = "dd/mm/yyyy";
    if (col.key === "nombre") s.fuente = { ...base.fuente, b: true };
    if (col.key === "vinculo") {
      const grupo = GRUPOS[persona.grupo];
      s.fondo = grupo.fondo;
      s.fuente = { ...base.fuente, color: grupo.color, b: true, sz: 10 };
    }
    if (col.key === "ficha") s.alineacion = { h: "center", v: "center" };
    return { v: persona[col.key], s };
  });
}

function altoEmpleado(persona, cols) {
  const lineas = Math.max(1, ...cols.map(c => c.key === "baja" ? 1 : Math.ceil(limpio(persona[c.key]).length / Math.max(8, c.ancho - 2))));
  return Math.max(28, lineas * 15 + 10);
}

function iniciarHoja(nombre, cols, datos, { fecha, alcance, filtros }) {
  const fin = colLetra(cols.length - 1);
  const fechaTexto = fecha.toLocaleString("es-AR", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const filaAncha = (v, s) => [{ v, s }, ...Array.from({ length: cols.length - 1 }, () => ({ v: "", s }))];
  const totalPorGrupo = Object.keys(GRUPOS).map(key => `${GRUPOS[key].nombre}: ${datos.filter(d => d.grupo === key).length}`).join("    ");
  const filas = [
    filaAncha("KLASEA  /  RECURSOS HUMANOS", { fondo: T.navy, fuente: { name: "Calibri", sz: 17, b: true, color: T.blanco }, alineacion: { v: "center" } }),
    filaAncha(`Listado de empleados. ${alcance}. Exportado el ${fechaTexto}`, { fondo: T.navy, fuente: { name: "Calibri", sz: 11, color: "DCE8F1" }, alineacion: { v: "center", wrap: true } }),
    filaAncha("", { fondo: T.cyan }),
    filaAncha(`${datos.length} personas    ${totalPorGrupo}`, { fuente: { name: "Calibri", sz: 11, b: true, color: T.navy }, alineacion: { v: "center", wrap: true } }),
    filaAncha(filtros.length ? `Filtros aplicados: ${filtros.join("; ")}` : "Todos los registros del alcance elegido.", { fuente: { name: "Calibri", sz: 10, color: T.gris }, alineacion: { v: "center", wrap: true } }),
    [],
    cols.map(c => ({ v: c.titulo, s: cabecera })),
  ];
  return {
    nombre, filas, anchos: cols.map(c => c.ancho),
    merges: [1, 2, 3, 4, 5].map(f => `A${f}:${fin}${f}`),
    altos: { 0: 36, 1: 28, 2: 4, 3: 30, 4: 30, 5: 8, 6: 30 },
    congelar: { fila: 7, col: nombre === "Listado" ? 2 : 0 },
    imprimir: { orientacion: "landscape", ajustarAncho: true, repetirFilas: [6], pie: `KlaseA - RRHH - ${alcance}` },
  };
}

export function hojasEmpleadosExcel(opciones = {}) {
  const datos = prepararEmpleadosExcel(opciones);
  if (!datos.length) throw new Error("No hay empleados para exportar con este alcance.");
  const contexto = { fecha: opciones.fecha ?? new Date(), alcance: opciones.alcance || "Equipo activo", filtros: opciones.filtros ?? [] };
  const conBaja = datos.some(d => d.baja || d.condicion.startsWith("Baja"));
  const cols = columnas(conBaja);
  const agrupada = iniciarHoja("Por rubro", cols, datos, contexto);
  agrupada.activa = true;
  const fin = colLetra(cols.length - 1);
  let rubroActual;
  let grupoActual;
  datos.forEach((persona, indice) => {
    if (rubroActual !== persona.rubro) {
      rubroActual = persona.rubro;
      grupoActual = null;
      const cantidad = datos.filter(d => d.rubro === rubroActual).length;
      agrupada.filas.push([{ v: `${rubroActual} (${cantidad})`, s: { fondo: T.rubro, fuente: { name: "Calibri", sz: 12, b: true, color: T.navy }, alineacion: { v: "center" } } }]);
      agrupada.merges.push(`A${agrupada.filas.length}:${fin}${agrupada.filas.length}`);
      agrupada.altos[agrupada.filas.length - 1] = 29;
    }
    if (grupoActual !== persona.grupo) {
      grupoActual = persona.grupo;
      const cantidad = datos.filter(d => d.rubro === rubroActual && d.grupo === grupoActual).length;
      const grupo = GRUPOS[persona.grupo];
      agrupada.filas.push([{ v: `${grupo.nombre} (${cantidad})`, s: { fondo: grupo.fondo, fuente: { name: "Calibri", sz: 10, b: true, color: grupo.color }, alineacion: { v: "center" } } }]);
      agrupada.merges.push(`A${agrupada.filas.length}:${fin}${agrupada.filas.length}`);
      agrupada.altos[agrupada.filas.length - 1] = 23;
    }
    agrupada.filas.push(filaEmpleado(persona, cols, indice));
    agrupada.altos[agrupada.filas.length - 1] = altoEmpleado(persona, cols);
  });
  const colsPlanas = columnas(conBaja, true);
  const listado = iniciarHoja("Listado", colsPlanas, datos, contexto);
  datos.forEach((persona, i) => {
    listado.filas.push(filaEmpleado(persona, colsPlanas, i));
    listado.altos[listado.filas.length - 1] = altoEmpleado(persona, colsPlanas);
  });
  listado.autofiltro = `A7:${colLetra(colsPlanas.length - 1)}${listado.filas.length}`;
  return [agrupada, listado];
}

export function exportarEmpleadosExcel(opciones) {
  const fecha = opciones.fecha ?? new Date();
  const p = partesFecha(fecha);
  const archivo = `empleados-klasea-${p.year}-${p.month}-${p.day}.xlsx`;
  descargarXlsx(archivo, hojasEmpleadosExcel({ ...opciones, fecha }));
}
