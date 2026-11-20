import test from "node:test";
import assert from "node:assert/strict";
import {
  CON_INGRESO,
  SIN_CLASIFICAR,
  agruparPorMes,
  baseParaOtroEscaneo,
  buscarRemitos,
  carpetasDelArchivo,
  contextoDeArchivo,
  detalleDeRemito,
  fechaCorta,
  nombreDeRemito,
  remitosDeCarpeta,
  tituloDeCarpeta,
} from "./archivoRemitos.js";

const o5527 = { id: "o1", codigo: "52-27", linea_nombre: "K52" };
const o551 = { id: "o2", codigo: "55-1", linea_nombre: "K55" };
const remitos = [
  { id: "a", proveedor: "Trimer", numero: "0001-12", fecha: "2026-11-18", obras: [o5527, o551], carpetas: [] },
  { id: "b", proveedor: "Maxi Herrero", created_at: "2026-11-19T10:00:00Z", obras: [], carpetas: ["Garantías"] },
  { id: "c", proveedor: "trimer", titulo: "Bridas", fecha: "2026-10-02", obras: [o5527], carpetas: [], panol_envio_id: "e1" },
  { id: "d", proveedor: "", created_at: "2026-09-01T00:00:00Z", obras: [], carpetas: [] },
];

test("carpetas por barco: una sección por línea, cada barco con su cuenta", () => {
  const g = carpetasDelArchivo(remitos, "barco");
  assert.deepEqual(g.map((x) => x.titulo), ["K52", "K55"]);
  assert.deepEqual(g[0].carpetas, [{ key: "barco:52-27", titulo: "52-27", total: 2 }]);
  assert.equal(g[1].carpetas[0].total, 1);
});

test("carpetas por proveedor juntan mayúsculas y acentos; carpetas propias igual", () => {
  const p = carpetasDelArchivo(remitos, "proveedor")[0].carpetas;
  assert.deepEqual(p.map((c) => [c.titulo, c.total]), [["Maxi Herrero", 1], ["Trimer", 2]]);
  const c = carpetasDelArchivo(remitos, "carpeta")[0].carpetas;
  assert.deepEqual(c, [{ key: "carpeta:garantias", titulo: "Garantías", total: 1 }]);
  assert.deepEqual(carpetasDelArchivo([], "carpeta"), []);
});

test("remitos de una carpeta y de los atajos", () => {
  assert.deepEqual(remitosDeCarpeta(remitos, "barco:52-27").map((r) => r.id), ["a", "c"]);
  assert.deepEqual(remitosDeCarpeta(remitos, "proveedor:trimer").map((r) => r.id), ["a", "c"]);
  assert.deepEqual(remitosDeCarpeta(remitos, "carpeta:garantias").map((r) => r.id), ["b"]);
  assert.deepEqual(remitosDeCarpeta(remitos, SIN_CLASIFICAR).map((r) => r.id), ["d"]);
  assert.deepEqual(remitosDeCarpeta(remitos, CON_INGRESO).map((r) => r.id), ["c"]);
  assert.equal(remitosDeCarpeta(remitos).length, 4);
  assert.equal(tituloDeCarpeta("barco:52-27", carpetasDelArchivo(remitos, "barco")), "52-27");
  assert.equal(tituloDeCarpeta(SIN_CLASIFICAR), "Sin clasificar");
});

test("buscar por todas las palabras, sin acentos, en barcos y carpetas", () => {
  assert.deepEqual(buscarRemitos(remitos, "trimer 55-1").map((r) => r.id), ["a"]);
  assert.deepEqual(buscarRemitos(remitos, "garantias").map((r) => r.id), ["b"]);
  assert.deepEqual(buscarRemitos(remitos, "k52").map((r) => r.id), ["a", "c"]);
  assert.equal(buscarRemitos(remitos, "  ").length, 4);
});

test("agrupado por mes, los más nuevos primero", () => {
  const g = agruparPorMes(remitos);
  assert.deepEqual(g.map((x) => [x.titulo, x.remitos.map((r) => r.id)]), [
    ["noviembre 2026", ["b", "a"]],
    ["octubre 2026", ["c"]],
    ["septiembre 2026", ["d"]],
  ]);
});

test("nombre, detalle y fecha de una fila", () => {
  assert.equal(nombreDeRemito(remitos[2]), "Bridas");
  assert.equal(detalleDeRemito(remitos[2]), "trimer · sin número");
  assert.equal(detalleDeRemito(remitos[0]), "Nº 0001-12");
  assert.equal(nombreDeRemito(remitos[3]), "Remito sin proveedor");
  assert.equal(fechaCorta("2026-11-18"), "18/11/26");
});

test("escaneos seguidos heredan dónde va, no la referencia; un archivo viejo no hereda", () => {
  const previo = { obras: [o551], carpetas: ["X"], proveedor: "Trimer", titulo: "Bridas", notas: "n" };
  assert.deepEqual(baseParaOtroEscaneo(previo), { obras: [o551], carpetas: ["X"], proveedor: "Trimer", titulo: "", notas: "" });
  const escaneo = { contexto: previo, idsPrevios: ["viejo"], lanzadoEn: Date.parse("2026-11-20T10:00:00Z") };
  assert.equal(contextoDeArchivo({ id: "viejo", updatedAt: "2026-11-20T10:01:00Z" }, escaneo), null);
  assert.equal(contextoDeArchivo({ id: "nuevo", updatedAt: "2026-11-19T10:00:00Z" }, escaneo), null);
  assert.equal(contextoDeArchivo({ id: "nuevo", updatedAt: "2026-11-20T10:02:00Z" }, escaneo), previo);
});
