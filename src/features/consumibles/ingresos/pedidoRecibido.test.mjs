import test from "node:test";
import assert from "node:assert/strict";
import { lineasDePedidoRecibido, renglonesCompletos } from "./pedidoRecibido.js";

const catalogo = [
  { id: "a", descripcion: "Guantes", unidad: "par", config: { factor_compra: 12, unidad_compra: "caja", costo_unitario_ars: 100 } },
  { id: "b", descripcion: "Trapo", unidad: "unidad", config: {} },
];
const pedido = { items: [
  { id: "i1", material_id: "a", quantity: "3" },
  { id: "i2", material_id: "b", quantity: "10" },
  { id: "i3", material_id: "zzz", quantity: "1" },
] };

test("arma una línea por renglón con lo pedido y avisa los que no están en el catálogo", () => {
  const { lineas, sinCatalogo } = lineasDePedidoRecibido(pedido, catalogo);
  assert.equal(lineas.length, 2);
  assert.equal(sinCatalogo, 1);
  assert.equal(lineas[0].cantidad, "3");
  assert.equal(lineas[0].porCaja, true);
  assert.equal(lineas[0].pedidoItemId, "i1");
  assert.equal(lineas[1].porCaja, false);
});

test("sólo cierra los renglones que llegaron completos", () => {
  const { lineas } = lineasDePedidoRecibido(pedido, catalogo);
  assert.deepEqual(renglonesCompletos(lineas), ["i1", "i2"]);
  lineas[1].cantidad = "7";
  assert.deepEqual(renglonesCompletos(lineas), ["i1"]);
  lineas[0].cantidad = "4";
  assert.deepEqual(renglonesCompletos(lineas), ["i1"]);
});

test("una línea sin pedido (agregada a mano) no cierra nada", () => {
  assert.deepEqual(renglonesCompletos([{ cantidad: "5", porCaja: false }]), []);
});
