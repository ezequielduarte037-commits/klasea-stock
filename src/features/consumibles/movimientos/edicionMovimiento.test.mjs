import assert from "node:assert/strict";
import { test } from "node:test";
import { agregarProductoEdicion, cantidadEdicion, hayCambiosEdicion, itemsParaCorreccion, lineasParaEdicion } from "./edicionMovimiento.js";

test("junta un producto repartido y omite versiones anuladas", () => {
  const l = lineasParaEdicion([
    { material_id: "cinta", cantidad: -0.667, material: { descripcion: "Cinta", imagen_url: "foto.png" } },
    { material_id: "cinta", cantidad: -0.333 },
    { material_id: "cinta", cantidad: -8, anulado_at: "ayer" },
  ]);
  assert.equal(l.length, 1);
  assert.equal(l[0].cantidad, 1);
  assert.equal(l[0].item.imagenUrl, "foto.png");
});

test("agrega varias variantes y suma otro toque al mismo producto", () => {
  const cinta18 = { id: "18", descripcion: "Cinta verde 18 mm" };
  const cinta48 = { id: "48", descripcion: "Cinta verde 48 mm" };
  let l = agregarProductoEdicion([], cinta18);
  l = agregarProductoEdicion(l, cinta48);
  l = agregarProductoEdicion(l, cinta18);
  assert.deepEqual(itemsParaCorreccion(l).map((i) => [i.material_id, i.cantidad]), [["18", 2], ["48", 1]]);
});

test("acepta fracciones con coma y rechaza cantidades vacías, cero y no finitas", () => {
  assert.equal(cantidadEdicion("1,25"), 1.25);
  assert.equal(agregarProductoEdicion([{ materialId: "1", cantidad: "1,5" }], { id: "1" })[0].cantidad, 2.5);
  for (const n of ["", 0, -1, "Infinity", "NaN", "texto", 100000, 0.0001]) assert.equal(cantidadEdicion(n), null);
  assert.throws(() => itemsParaCorreccion([]), /al menos un producto/);
  assert.throws(() => itemsParaCorreccion([{ materialId: "1", cantidad: "" }]), /cantidad/);
});

test("detecta correcciones y no confunde la coma decimal ni el orden con un cambio", () => {
  const antes = [{ materialId: "18", cantidad: 1.5 }, { materialId: "48", cantidad: 2 }];
  assert.equal(hayCambiosEdicion(antes, [{ ...antes[1] }, { ...antes[0], cantidad: "1,5" }]), false);
  assert.equal(hayCambiosEdicion(antes, [{ ...antes[0], cantidad: 3 }, antes[1]]), true);
  assert.equal(hayCambiosEdicion(antes, [antes[0]]), true);
  assert.equal(hayCambiosEdicion(antes, [{ ...antes[0], cantidad: "" }, antes[1]]), false);
});
