import test from "node:test";
import assert from "node:assert/strict";
import { lineasDePedidoRecibido, pedidosPorRecibir } from "./pedidoRecibido.js";
import { prepararIngreso } from "./ingresoRegistro.js";
import { actualizarLinea, calcularLinea } from "./ingresoCalculos.js";

const catalogo = [
  { id: "a", descripcion: "Guantes", unidad: "par", config: { factor_compra: 12, unidad_compra: "caja", costo_unitario_ars: 100 } },
  { id: "b", descripcion: "Trapo", unidad: "unidad", config: {} },
];
const pedido = {
  id: "p1", numero: 7, estado: "pedido", items: [
    { id: "i1", material_id: "a", cantidad: 3, factor: 12, unidad_compra: "caja", costo_compra_ars: 1200 },
    { id: "i2", material_id: "b", cantidad: 10, factor: 1, unidad_compra: "unidad", costo_compra_ars: null },
    { id: "i3", material_id: "zzz", cantidad: 1, factor: 1 },
  ],
};

test("sólo ofrece los pedidos confirmados con algo por llegar, y lo que falta de cada renglón", () => {
  const recibidos = new Map([["i1", 24], ["i2", 10]]); // llegaron 2 cajas de 3 y todos los trapos
  const [p] = pedidosPorRecibir([pedido, { ...pedido, id: "p2", estado: "borrador" }, { ...pedido, id: "p3", estado: "cerrado" }], recibidos);
  assert.equal(p.id, "p1");
  assert.deepEqual(p.items.map((r) => [r.id, r.pendiente]), [["i1", 1], ["i3", 1]]);
  assert.equal(pedidosPorRecibir([pedido], new Map([["i1", 36], ["i2", 10], ["i3", 1]])).length, 0);
});

test("arma las líneas como se pidió (cajas y factor del renglón) y avisa lo que no está en el catálogo", () => {
  const { lineas, sinCatalogo } = lineasDePedidoRecibido(pedidosPorRecibir([pedido])[0], catalogo);
  assert.equal(sinCatalogo, 1);
  const [guantes, trapo] = lineas;
  assert.equal(guantes.cantidad, "3");
  assert.equal(guantes.porCaja, true);
  assert.equal(guantes.factor, "12");
  assert.equal(guantes.costo, "1200");
  assert.equal(guantes.pedidoItemId, "i1");
  assert.equal(trapo.porCaja, false);
  assert.equal(trapo.cantidad, "10");
});

test("el ingreso guarda a qué renglón del pedido corresponde cada fila", () => {
  const { lineas } = lineasDePedidoRecibido(pedidosPorRecibir([pedido])[0], catalogo);
  let n = 0;
  const envio = prepararIngreso({ remito: "R1", proveedor: "Rebollar", nota: "", lineas, pedidoId: "p1", pedidoTitulo: "Pedido N° 7" }, "Chubut", () => `id${n++}`);
  assert.equal(envio.filas[0].pedido_item_id, "i1");
  assert.equal(envio.filas[0].cantidad, 36);
  assert.equal(envio.filas[1].pedido_item_id, "i2");
  assert.match(envio.filas[0].nota, /Pedido N° 7/);
  const suelto = prepararIngreso({ remito: "", proveedor: "", nota: "", lineas: [lineas[1]] }, "Chubut", () => `x${n++}`);
  assert.equal(suelto.filas[0].pedido_item_id, undefined);
});

test("pedido sin precio usa el costo por unidad aunque su factor difiera del catálogo", () => {
  for (const factor of [1, 6]) {
    const p = { items: [{ id: "i", material_id: "a", cantidad: 2, factor, costo_compra_ars: null }] };
    const { lineas: [l] } = lineasDePedidoRecibido(p, catalogo);
    assert.equal(calcularLinea(l).cantidadEntrega, 2 * factor);
    assert.equal(calcularLinea(l).costoEntrega, 100);
  }
});

test("al cambiar a unidades se conserva el precio acordado del pedido", () => {
  const p = { items: [{ id: "i", material_id: "a", cantidad: 1, factor: 12, costo_compra_ars: 2400 }] };
  const { lineas: [l] } = lineasDePedidoRecibido(p, catalogo);
  const suelto = actualizarLinea(l, { porCaja: false, cantidad: "12" });
  assert.equal(calcularLinea(suelto).costoEntrega, 200);
  assert.equal(calcularLinea(suelto).subtotal, 2400);
});
