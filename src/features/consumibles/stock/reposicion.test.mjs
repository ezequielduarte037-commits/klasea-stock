import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aUnidadesDeCompra,
  armarPedidoSugerido,
  cantidadAReponer,
  conUnidadesDeCompra,
  consumoDiarioPromedio,
  consumoPorMaterial,
  diasDeHistoria,
  filasExcel,
  lineaDePedido,
  minimoSugerido,
  necesitaReponer,
  textoWhatsApp,
  totalDePedido,
} from "./reposicion.js";

test("se repone en el mínimo o por debajo, y sólo si hay mínimo", () => {
  assert.equal(necesitaReponer({ stock: 10, minimo: 10 }), true);
  assert.equal(necesitaReponer({ stock: 11, minimo: 10 }), false);
  assert.equal(necesitaReponer({ stock: -3, minimo: 5 }), true);
  assert.equal(necesitaReponer({ stock: 0, minimo: null }), false);
  assert.equal(necesitaReponer({ stock: 0, minimo: 0 }), false);
});

test("cantidad a reponer: hasta el máximo, o hasta el doble del mínimo", () => {
  assert.equal(cantidadAReponer({ stock: 4, minimo: 10, maximo: 50 }), 46);
  assert.equal(cantidadAReponer({ stock: 4, minimo: 10, maximo: null }), 16);
  assert.equal(cantidadAReponer({ stock: -2, minimo: 10, maximo: null }), 22);
  // Un máximo que no llega al mínimo es un error de carga: se usa el doble del mínimo.
  assert.equal(cantidadAReponer({ stock: 4, minimo: 10, maximo: 8 }), 16);
  assert.equal(cantidadAReponer({ stock: 30, minimo: 10, maximo: 50 }), 0);
});

test("a unidades de compra: hacia arriba y al múltiplo del lote", () => {
  assert.deepEqual(aUnidadesDeCompra(250, { factor: 100 }), { unidadesCompra: 3, cantidadEntrega: 300 });
  assert.deepEqual(aUnidadesDeCompra(300, { factor: 100 }), { unidadesCompra: 3, cantidadEntrega: 300 });
  assert.deepEqual(aUnidadesDeCompra(250, { factor: 100, lote: 5 }), { unidadesCompra: 5, cantidadEntrega: 500 });
  assert.deepEqual(aUnidadesDeCompra(7, {}), { unidadesCompra: 7, cantidadEntrega: 7 });
  assert.deepEqual(aUnidadesDeCompra(0.3 * 3, { factor: 0.3 }), { unidadesCompra: 3, cantidadEntrega: 0.9 });
  assert.deepEqual(aUnidadesDeCompra(0, { factor: 10 }), { unidadesCompra: 0, cantidadEntrega: 0 });
});

const tornillo = {
  id: "t1",
  descripcion: "Tornillo fixador 6 x 1",
  codigoEtiqueta: "KA0001",
  unidad: "unidad",
  stockMinimo: 200,
  stockPorSede: { Chubut: { stock: 120 }, Pampa: { stock: 900 } },
  config: { proveedor_nombre: "Rebollar", proveedor_codigo: "TF61", unidad_compra: "caja", factor_compra: 100, lote_compra: 1, stock_maximo: 500, costo_unitario_ars: 12.5 },
};

test("renglón del pedido: stock de la sede, conversión y costo por unidad de compra", () => {
  const l = lineaDePedido(tornillo, "Chubut");
  assert.equal(l.reponer, 380);
  assert.equal(l.unidadesCompra, 4);
  assert.equal(l.cantidadEntrega, 400);
  assert.equal(l.costoCompra, 1250);
  assert.equal(l.subtotal, 5000);
  assert.equal(l.codigoProveedor, "TF61");
  assert.equal(lineaDePedido(tornillo, "Pampa"), null);
});

test("editar las unidades recalcula equivalencia y subtotal", () => {
  const l = conUnidadesDeCompra(lineaDePedido(tornillo, "Chubut"), "6");
  assert.equal(l.cantidadEntrega, 600);
  assert.equal(l.subtotal, 7500);
});

test("pedido agrupado por proveedor: Rebollar primero, sin proveedor al final", () => {
  const items = [
    tornillo,
    { id: "g", descripcion: "Guantes", unidad: "par", stockMinimo: 10, stockPorSede: { Chubut: { stock: 2 } }, config: { proveedor_nombre: "Ferretería Sur" } },
    { id: "x", descripcion: "Trapo", unidad: "unidad", stockMinimo: 5, stockPorSede: {}, config: null },
    { id: "ok", descripcion: "Cinta", unidad: "rollo", stockMinimo: 5, stockPorSede: { Chubut: { stock: 50 } }, config: { proveedor_nombre: "Rebollar" } },
  ];
  const grupos = armarPedidoSugerido(items, "Chubut");
  assert.deepEqual(grupos.map((g) => g.proveedor), ["Rebollar", "Ferretería Sur", "Sin proveedor"]);
  assert.equal(grupos[0].lineas.length, 1);
  assert.equal(grupos[2].sinProveedor, true);
  assert.equal(grupos[2].lineas[0].reponer, 10);
});

test("total del pedido: suma lo que tiene costo y cuenta lo que no", () => {
  assert.deepEqual(totalDePedido([
    { unidadesCompra: 2, subtotal: 100 },
    { unidadesCompra: 1, subtotal: null },
    { unidadesCompra: 0, subtotal: 999 },
  ]), { total: 100, sinCosto: 1 });
});

test("consumo: retiros y mermas suman, devoluciones restan, anulados y otra sede no", () => {
  const movs = [
    { material_id: "a", tipo: "retiro", cantidad: -10, created_at: "2026-10-14T10:00:00Z", sede: "Chubut" },
    { material_id: "a", tipo: "devolucion", cantidad: 2, created_at: "2026-10-14T11:00:00Z", sede: "Chubut" },
    { material_id: "a", tipo: "merma", cantidad: -1, created_at: "2026-10-15T11:00:00Z", sede: "Chubut" },
    { material_id: "a", tipo: "retiro", cantidad: -50, created_at: "2026-10-15T11:00:00Z", sede: "Pampa" },
    { material_id: "a", tipo: "retiro", cantidad: -5, created_at: "2026-10-15T11:00:00Z", sede: "Chubut", anulado_at: "x" },
    { material_id: "a", tipo: "ingreso", cantidad: 100, created_at: "2026-10-15T11:00:00Z", sede: "Chubut" },
    { material_id: "a", tipo: "retiro", cantidad: -7, created_at: "2026-10-01T11:00:00Z", sede: "Chubut" },
  ];
  const c = consumoPorMaterial(movs, { desde: "2026-10-13T00:00:00Z", sede: "Chubut" });
  assert.equal(c.get("a"), 9);
});

test("mínimo sugerido: consumo diario × (entrega + seguridad), con historia suficiente", () => {
  assert.equal(consumoDiarioPromedio(21, 7), 3);
  assert.equal(consumoDiarioPromedio(10, 0), null);
  assert.equal(minimoSugerido({ consumoDiario: 3, diasEntrega: 2, diasSeguridad: 3 }), 15);
  assert.equal(minimoSugerido({ consumoDiario: 1.1, diasEntrega: 3, diasSeguridad: 3 }), 7);
  assert.equal(minimoSugerido({ consumoDiario: 3, diasHistoria: 4 }), null);
  assert.equal(minimoSugerido({ consumoDiario: 0 }), null);
  assert.equal(diasDeHistoria("2026-10-12T10:00:00Z", new Date("2026-10-22T10:00:00Z")), 10);
  assert.equal(diasDeHistoria(null), 0);
  assert.equal(diasDeHistoria("2026-01-01T00:00:00Z", new Date("2026-10-22T10:00:00Z")), 30);
});

test("texto para WhatsApp y filas de Excel", () => {
  const [grupo] = armarPedidoSugerido([tornillo], "Chubut");
  const txt = textoWhatsApp(grupo, { sede: "Chubut", fecha: new Date(2026, 9, 13) });
  assert.match(txt, /Pañol Chubut/);
  assert.match(txt, /Proveedor: Rebollar · 13\/10\/2026/);
  assert.match(txt, /• 4 cajas x100 — \[TF61\] Tornillo fixador 6 x 1/);
  assert.match(txt, /Total estimado: \$ 5\.000 sin IVA/);
  const filas = filasExcel(grupo);
  assert.equal(filas.length, 3);
  assert.deepEqual(filas[1].slice(0, 5), ["TF61", "Tornillo fixador 6 x 1", 4, "caja x100", "400 unidades"]);
  assert.equal(filas[2][9], 5000);
});
