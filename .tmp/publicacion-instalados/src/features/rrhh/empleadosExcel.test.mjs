import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { armarXlsx } from "../compras/xlsx.js";
import { hojasEmpleadosExcel, prepararEmpleadosExcel } from "./empleadosExcel.js";

const fecha = new Date("2026-10-22T14:30:00Z");
const empleados = [
  { id: "c1", nombre: "Zúñiga, Ana", dni: "00123456", grupo: "casa", oficio_id: "elec", sede: "Chubut", activo: true, ficha: true },
  { id: "t1", nombre: "Álvarez, Luis", dni: "12345678", grupo: "contratista", oficio: { nombre: "Electricidad" }, contratista_id: "jefe", activo: true, externo: true },
  { id: "b1", nombre: "Pérez, Rosa", dni: "90123456", grupo: "casa", oficio: { nombre: "Carpintería" }, activo: false, ficha: false, fecha_baja: "2026-10-21T01:00:00Z" },
  { id: "p1", nombre: "Sin clasificar", dni: "", grupo: "sin_asignar", activo: true, provisorio: true, ficha: false },
];
const opciones = {
  empleados, oficios: [{ id: "elec", nombre: "Electricidad" }], contratistas: [{ id: "jefe", nombre: "Servicios del Río" }],
  asignaciones: [{ empleado_id: "c1", obra: { codigo: "52-25" } }, { empleado_id: "c1", obra: { codigo: "52-24" } }, { empleado_id: "c1", obra: { codigo: "52-24" } }],
  fecha, alcance: "Todos los registros",
};
const valores = row => row.map(c => c && typeof c === "object" && !(c instanceof Date) ? c.v : c);

test("ordena por rubro, vínculo y nombre sin cambiar los datos de origen", () => {
  const antes = structuredClone(empleados);
  const datos = prepararEmpleadosExcel(opciones);
  assert.deepEqual(datos.map(d => d.nombre), ["Pérez, Rosa", "Zúñiga, Ana", "Álvarez, Luis", "Sin clasificar"]);
  assert.equal(datos[1].dni, "00123456");
  assert.equal(datos[1].obras, "52-24, 52-25");
  assert.equal(datos[2].contratista, "Servicios del Río");
  assert.equal(datos[2].condicion, "Activo · Externo");
  assert.equal(datos[3].condicion, "Activo · Provisorio");
  assert.equal(datos[3].rubro, "Sin rubro asignado");
  assert.equal(datos[0].baja.getDate(), 20, "la baja usa el día de Buenos Aires");
  assert.deepEqual(empleados, antes);
});

test("la hoja agrupada separa rubros y personal; el listado conserva una fila por persona", () => {
  const [agrupada, listado] = hojasEmpleadosExcel(opciones);
  assert.equal(agrupada.nombre, "Por rubro");
  assert.equal(listado.nombre, "Listado");
  assert.ok(agrupada.filas.some(f => f[0]?.v === "Electricidad (2)"));
  assert.ok(agrupada.filas.some(f => f[0]?.v === "De la casa (1)"));
  assert.ok(agrupada.filas.some(f => f[0]?.v === "Contratistas (1)"));
  assert.ok(agrupada.filas.some(f => f[0]?.v === "Sin rubro asignado (1)"));
  assert.equal(listado.filas.length, 7 + empleados.length);
  assert.equal(listado.autofiltro, "A7:J11");
  assert.deepEqual(listado.congelar, { fila: 7, col: 2 });
  assert.match(agrupada.filas[3][0].v, /4 personas.*De la casa: 2.*Contratistas: 1.*Sin clasificar: 1/);
});

test("el alcance y los filtros viajan con la exportación; no agrega empleados ocultos", () => {
  const [agrupada, listado] = hojasEmpleadosExcel({ ...opciones, empleados: [empleados[0]], alcance: "Equipo activo", filtros: ["Sede: Chubut", "Sólo personal que ficha"] });
  assert.equal(listado.filas.length, 8);
  assert.match(agrupada.filas[1][0].v, /Equipo activo.*22\/10\/2026/);
  assert.match(agrupada.filas[4][0].v, /Sede: Chubut; Sólo personal que ficha/);
  assert.equal(valores(listado.filas[6]).includes("Fecha de baja"), false);
  assert.equal(listado.autofiltro, "A7:I8");
});

test("un XLSX real conserva estilos, DNI de texto, fechas, filtros e impresión", () => {
  const zip = unzipSync(armarXlsx(hojasEmpleadosExcel(opciones)));
  const sheet = strFromU8(zip["xl/worksheets/sheet2.xml"]);
  const libro = strFromU8(zip["xl/workbook.xml"]);
  const estilos = strFromU8(zip["xl/styles.xml"]);
  assert.match(sheet, /r="B9" t="inlineStr"[^>]*>.*?00123456/);
  assert.match(sheet, /<autoFilter ref="A7:J11"\/>/);
  assert.match(sheet, /xSplit="2" ySplit="7"/);
  assert.match(sheet, /orientation="landscape" fitToWidth="1" fitToHeight="0"/);
  assert.match(sheet, /r="J8"[^>]*><v>\d+/);
  assert.match(libro, /_xlnm.Print_Titles/);
  assert.match(estilos, /FF12324A/);
  assert.match(estilos, /FF14B8A6/);
  assert.match(estilos, /formatCode="dd\/mm\/yyyy"/);
});

test("textos parecidos a fórmulas permanecen como texto y sin registros no exporta", () => {
  const hojas = hojasEmpleadosExcel({ empleados: [{ nombre: '=HYPERLINK("https://example.com")', dni: "+0012" }], fecha });
  const xml = strFromU8(unzipSync(armarXlsx(hojas))["xl/worksheets/sheet2.xml"]);
  assert.equal(xml.includes("<f>"), false);
  assert.match(xml, /HYPERLINK/);
  assert.match(xml, /\+0012/);
  assert.throws(() => hojasEmpleadosExcel(), /No hay empleados/);
});
