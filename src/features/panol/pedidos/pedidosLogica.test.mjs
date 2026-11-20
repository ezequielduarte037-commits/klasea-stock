import test from "node:test";
import assert from "node:assert/strict";
import {
  buscarPedidos,
  cantidadTexto,
  correccionDeRenglon,
  cuentasDeFiltros,
  cuentasDeRenglones,
  filtrarPedidos,
  filtrarRenglones,
  ordenarPedidos,
  porRecibir,
  renglonesDelPedido,
  resumenDelPedido,
} from "./pedidosLogica.js";

const envios = [
  { id: "a", titulo: "Electricidad 52-27", estado: "enviado", prioridad: "media", created_at: "2026-11-03", obra: { codigo: "52-27" },
    items: [{ estado: "pendiente", descripcion: "Bornera T2", cantidad: "4" }, { estado: "recibido", descripcion: "Cable 6mm", cantidad: "100", cantidad_recibida: "100" }] },
  { id: "b", titulo: "Bomba urgente", estado: "parcial", prioridad: "urgente", created_at: "2026-11-10",
    items: [{ estado: "parcial", descripcion: "Bomba de achique Rule", cantidad: "3", cantidad_recibida: "2" }] },
  { id: "c", titulo: "Griferías", estado: "enviado", prioridad: "media", created_at: "2026-09-01",
    items: [{ estado: "falta_stock", descripcion: "Monocomando" }, { estado: "pendiente", descripcion: "Ducha" }] },
  { id: "d", titulo: "Viejo", estado: "recibido", created_at: "2026-08-01", items: [{ estado: "recibido" }] },
  { id: "e", titulo: "Cancelado", estado: "cancelado", created_at: "2026-08-02", items: [{ estado: "pendiente" }] },
  { id: "f", titulo: "Todo llegó", estado: "parcial", created_at: "2026-10-01", items: [{ estado: "recibido" }, { estado: "recibido" }] },
];

test("resumen del pedido: recibidos, faltan y novedades", () => {
  assert.deepEqual(resumenDelPedido(envios[0].items), { total: 2, recibidos: 1, parciales: 0, pendientes: 1, novedades: 0, faltan: 1, completo: false });
  assert.equal(resumenDelPedido(envios[2].items).novedades, 1);
  assert.equal(resumenDelPedido(envios[5].items).completo, true);
});

test("filtros de la bandeja", () => {
  assert.deepEqual(filtrarPedidos(envios, "por_recibir").map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual(filtrarPedidos(envios, "novedades").map((e) => e.id), ["c"]);
  assert.deepEqual(filtrarPedidos(envios, "recibidos").map((e) => e.id), ["d", "f"]);
  assert.deepEqual(cuentasDeFiltros(envios), { por_recibir: 3, novedades: 1, recibidos: 2, todos: 6 });
  assert.equal(porRecibir({ estado: "enviado", items: [] }), true);
});

test("orden: urgente, después con novedades, después lo más viejo; recibidos lo más nuevo arriba", () => {
  const espera = ordenarPedidos(filtrarPedidos(envios, "por_recibir"), "por_recibir");
  assert.deepEqual(espera.map((e) => e.id), ["b", "c", "a"]);
  assert.deepEqual(ordenarPedidos(filtrarPedidos(envios, "recibidos"), "recibidos").map((e) => e.id), ["f", "d"]);
});

test("buscar también por lo que trae cada pedido", () => {
  assert.deepEqual(buscarPedidos(envios, "bornera").map((e) => e.id), ["a"]);
  assert.deepEqual(buscarPedidos(envios, "52-27 cable").map((e) => e.id), ["a"]);
  assert.deepEqual(buscarPedidos(envios, "griferias").map((e) => e.id), ["c"]);
});

test("renglones: lo que falta arriba, filtros y cantidades", () => {
  const r = renglonesDelPedido([
    { id: "1", estado: "recibido", descripcion: "A", cantidad: "2" },
    { id: "2", estado: "parcial", descripcion: "B", cantidad: "4", cantidad_recibida: "1" },
    { id: "3", estado: "pendiente", descripcion: "C", cantidad: "3 m", unidad: "m" },
    { id: "4", estado: "rechazado", descripcion: "D", cantidad: "1" },
  ]);
  assert.deepEqual(r.map((x) => x.id), ["4", "3", "2", "1"]);
  assert.deepEqual(cuentasDeRenglones(r), { todos: 4, faltan: 2, recibidos: 1, novedades: 1 });
  assert.deepEqual(filtrarRenglones(r, "todos", "b").map((x) => x.id), ["2"]);
  assert.equal(cantidadTexto(r[2]), "1 de 4");
  assert.equal(cantidadTexto(r[1]), "3 m");
  assert.equal(r[3].enStock, 2);
});

test("corregir un renglón: estado según la cantidad y aviso si sale del stock", () => {
  const [parcial] = renglonesDelPedido([{ estado: "parcial", cantidad: "4", cantidad_recibida: "2" }]);
  assert.deepEqual(correccionDeRenglon(parcial, { estado: "recibido", cantidad: "4" }), { estado: "recibido", cantidadRecibida: "4", sacaDelStock: false });
  assert.deepEqual(correccionDeRenglon(parcial, { estado: "recibido", cantidad: "1" }), { estado: "parcial", cantidadRecibida: "1", sacaDelStock: true });
  assert.deepEqual(correccionDeRenglon(parcial, { estado: "pendiente" }), { estado: "pendiente", cantidadRecibida: null, sacaDelStock: true });
  assert.ok(correccionDeRenglon(parcial, { estado: "recibido", cantidad: "" }).error);
  const [sinCantidad] = renglonesDelPedido([{ estado: "recibido", cantidad: "3" }]);
  assert.equal(correccionDeRenglon(sinCantidad, { estado: "pendiente" }).sacaDelStock, true);
});
