import { test } from "node:test";
import assert from "node:assert/strict";
import { actualizarLinea, agregarAlRemito, agruparIngresos, calcularLinea, cambiosDeConfig, lineaDesdeItem, remitoRepetido, totalRemito } from "./ingresoCalculos.js";

const tornillo = {
  id: "t1",
  descripcion: "Tornillo 6 x 1",
  unidad: "unidad",
  config: { factor_compra: 100, unidad_compra: "caja", costo_unitario_ars: 12.5, proveedor_codigo: "TF61" },
};
const trapo = { id: "tr", descripcion: "Trapo", unidad: "unidad", config: null };

test("la línea arranca con la conversión y el costo de la config", () => {
  const l = lineaDesdeItem(tornillo);
  assert.equal(l.porCaja, true);
  assert.equal(l.factor, "100");
  assert.equal(l.unidadCompra, "caja");
  assert.equal(l.costo, "1250");
  assert.deepEqual(calcularLinea({ ...l, cantidad: "3" }), { valida: true, factor: 100, cantidadEntrega: 300, costoEntrega: 12.5, subtotal: 3750 });
});

test("sin config se carga suelto y sin costo", () => {
  const l = lineaDesdeItem(trapo);
  assert.equal(l.porCaja, false);
  assert.equal(l.costo, "");
  assert.deepEqual(calcularLinea({ ...l, cantidad: "20" }), { valida: true, factor: 1, cantidadEntrega: 20, costoEntrega: null, subtotal: null });
});

test("una línea por caja sin factor no es válida", () => {
  const l = { ...lineaDesdeItem(trapo), porCaja: true, factor: "" };
  assert.equal(calcularLinea(l).valida, false);
  assert.equal(calcularLinea({ ...lineaDesdeItem(trapo), cantidad: "0" }).valida, false);
});

test("escanear dos veces el mismo producto suma uno", () => {
  let lineas = agregarAlRemito([], tornillo);
  lineas = agregarAlRemito(lineas, trapo);
  lineas = agregarAlRemito(lineas, tornillo);
  assert.equal(lineas.length, 2);
  assert.equal(lineas[0].cantidad, "2");
});

test("se recuerda la unidad de compra sólo si cambió", () => {
  const l = lineaDesdeItem(trapo);
  assert.equal(cambiosDeConfig(l), null);
  assert.deepEqual(cambiosDeConfig({ ...l, porCaja: true, factor: "50", unidadCompra: "bolsa" }), { factor_compra: 50, unidad_compra: "bolsa" });
  assert.equal(cambiosDeConfig({ ...l, porCaja: true, factor: "50", unidadCompra: "bolsa", recordar: false }), null);
  assert.equal(cambiosDeConfig(lineaDesdeItem(tornillo)), null);
});

test("total del remito", () => {
  const lineas = [{ ...lineaDesdeItem(tornillo), cantidad: "2" }, { ...lineaDesdeItem(trapo), cantidad: "5" }, { ...lineaDesdeItem(trapo), cantidad: "" }];
  assert.deepEqual(totalRemito(lineas), { total: 2500, sinCosto: 1, validas: 2 });
});

test("cambiar entre unidad y caja mantiene el precio de cada sellador", () => {
  const sellador = { id: "s", unidad: "unidad", config: { factor_compra: 12, unidad_compra: "caja", costo_unitario_ars: 13274.8 } };
  let l = actualizarLinea(lineaDesdeItem(sellador), { porCaja: false, cantidad: "12" });
  assert.equal(calcularLinea(l).cantidadEntrega, 12);
  assert.equal(calcularLinea(l).costoEntrega, 13274.8);
  l = actualizarLinea(l, { porCaja: true, cantidad: "1" });
  assert.equal(l.costo, "159297.6");
  assert.equal(calcularLinea(l).cantidadEntrega, 12);
  assert.equal(calcularLinea(l).costoEntrega, 13274.8);
  l = actualizarLinea(l, { porCaja: false });
  assert.equal(l.costo, "13274.8");
});

test("editar cuántas trae la caja no divide el precio unitario, aunque el campo quede vacío", () => {
  let l = lineaDesdeItem(tornillo);
  l = actualizarLinea(l, { factor: "" });
  assert.equal(calcularLinea(l).valida, false);
  l = actualizarLinea(l, { factor: "50" });
  assert.equal(l.costo, "625");
  assert.equal(calcularLinea(l).costoEntrega, 12.5);
  assert.equal(calcularLinea(l).cantidadEntrega, 50);
});

test("el precio editado a mano se conserva al cambiar la presentación", () => {
  let l = actualizarLinea(lineaDesdeItem(tornillo), { costo: "2000" });
  l = actualizarLinea(l, { porCaja: false });
  assert.equal(l.costo, "20");
  l = actualizarLinea(l, { porCaja: true, factor: "50" });
  assert.equal(calcularLinea(l).costoEntrega, 20);
  assert.equal(l.costo, "1000");
  l = actualizarLinea(l, { costo: "" });
  assert.equal(actualizarLinea(l, { porCaja: false }).costo, "");
});

test("los borradores anteriores también convierten el precio al cambiar de caja a unidad", () => {
  const l = { ...lineaDesdeItem(tornillo), costo: "1500" };
  delete l.costoEntregaReferencia;
  assert.equal(calcularLinea(actualizarLinea(l, { porCaja: false })).costoEntrega, 15);
});

test("historial por carga y remito repetido", () => {
  const movs = [
    { id: "1", tipo: "ingreso", lote: "A", remito: "0001-123", cantidad: 300, costo_unitario_ars: 12.5, created_at: "2026-10-13T10:00:00Z" },
    { id: "2", tipo: "ingreso", lote: "A", remito: "0001-123", cantidad: 20, costo_unitario_ars: null, created_at: "2026-10-13T10:00:01Z" },
    { id: "3", tipo: "ingreso", lote: "B", remito: "0001-200", cantidad: 5, costo_unitario_ars: 10, created_at: "2026-10-14T10:00:00Z", anulado_at: "2026-10-14T11:00:00Z" },
  ];
  const g = agruparIngresos(movs);
  assert.deepEqual(g.map((x) => x.lote), ["B", "A"]);
  assert.equal(g[1].total, 3750);
  assert.equal(g[1].activas, 2);
  assert.equal(g[0].anulado, true);
  assert.equal(remitoRepetido(g, " 0001-123 ")?.lote, "A");
  assert.equal(remitoRepetido(g, "0001-200"), null);
  assert.equal(remitoRepetido(g, ""), null);
});
