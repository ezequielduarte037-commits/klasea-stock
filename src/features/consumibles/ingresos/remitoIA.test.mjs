import { test } from "node:test";
import assert from "node:assert/strict";
import { emparejarRenglones, normalizarCodigoRemito, parecido } from "./remitoIA.js";

const catalogo = [
  { id: "a", descripcion: "Parker cab fijadora AISI304 6 X 1 1/4", alias: null, codigos: ["PARFIJ0016"] },
  { id: "b", descripcion: "Parker cab fijadora AISI304 6 X 3/4", alias: null, codigos: ["PARFIJ0013"] },
  { id: "c", descripcion: "LIJA AL AGUA AA #600", alias: "Lija Al Agua 600", codigos: ["L0019", "7791234567890"] },
  { id: "d", descripcion: "BARBIJO 3 TELAS", alias: null, codigos: ["B007-3TEL"] },
];

test("por código de Rebollar, aunque venga con espacios o en minúscula", () => {
  const [r] = emparejarRenglones([{ descripcion: "lo que sea", codigo: "parfij 0016", cantidad: 500 }], catalogo);
  assert.equal(r.item.id, "a");
  assert.equal(r.por, "codigo");
  assert.equal(r.renglon.cantidad, 500);
  assert.equal(normalizarCodigoRemito(" b007-3tel "), "B007-3TEL");
  assert.equal(emparejarRenglones([{ descripcion: "x", codigo: "B007-3TEL", cantidad: 2 }], catalogo)[0].item.id, "d");
});

test("por nombre solo si coinciden todas las medidas", () => {
  const [r] = emparejarRenglones([{ descripcion: "Parker cab fijadora AISI304 6 x 3/4", cantidad: "100" }], catalogo);
  assert.equal(r.item?.id, "b");
  assert.equal(r.por, "nombre");
  // Otra medida: no lo confunde con ninguno.
  const [otro] = emparejarRenglones([{ descripcion: "Parker cab fijadora AISI304 8 x 1", cantidad: 1 }], catalogo);
  assert.equal(otro.item, null);
  assert.equal(parecido("Parker 8 x 1", catalogo[0]), 0);
});

test("el alias también sirve para emparejar", () => {
  const [r] = emparejarRenglones([{ descripcion: "Lija al agua 600", cantidad: 50 }], catalogo);
  assert.equal(r.item?.id, "c");
});

test("cantidades con coma decimal o miles", () => {
  const filas = emparejarRenglones([
    { descripcion: "a", codigo: "L0019", cantidad: "1.500,5" },
    { descripcion: "a", codigo: "L0019", cantidad: "2,5" },
    { descripcion: "a", codigo: "L0019", cantidad: 3 },
  ], catalogo);
  assert.deepEqual(filas.map((f) => f.renglon.cantidad), [1500.5, 2.5, 3]);
});

test("renglones vacíos se descartan y lo dudoso queda sin producto", () => {
  const filas = emparejarRenglones([{ descripcion: "", codigo: "" }, { descripcion: "Producto que no existe", cantidad: 1 }], catalogo);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].item, null);
});
