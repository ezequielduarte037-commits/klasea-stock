import test from "node:test";
import assert from "node:assert/strict";
import { fichasPanolPorConfirmar, productosACrear, puedeCrearProductosDeBarco, renglonSinProducto } from "./productosACrear.js";

const AHORA = new Date("2026-10-19T12:00:00Z").getTime();
const fila = (extra) => ({ estado: "en_panol", source: "remito", recepcion_estado: "recibido", stock_sede: "Chubut", cantidad: 1, unidad: "unidad", ...extra });

test("sólo cuenta movimientos reales sin producto ni requisito", () => {
  assert.equal(renglonSinProducto(fila({ descripcion: "Bomba sumergible 12V" })), true);
  assert.equal(renglonSinProducto(fila({ descripcion: "Bomba", material_id: "m1" })), false);
  assert.equal(renglonSinProducto(fila({ descripcion: "Grifería", requisito_material_id: "r1" })), false);
  assert.equal(renglonSinProducto(fila({ descripcion: "Bomba", source: "ajuste_ubicacion", cantidad: 0 })), false);
  assert.equal(renglonSinProducto(fila({ descripcion: "Bomba", notas: "[anulado] error" })), false);
  assert.equal(renglonSinProducto(fila({ descripcion: "   " })), false);
  // Pedido sin recibir: todavía no es stock.
  assert.equal(renglonSinProducto(fila({ descripcion: "Bomba", estado: "comprado", recepcion_estado: "pendiente", source: "compra" })), false);
});

test("agrupa por descripción y código, con el saldo de la cuenta canónica", () => {
  const rows = [
    fila({ id: "a", descripcion: "Bomba sumergible 12V", codigo: "BS12", cantidad: 2, created_at: "2026-10-18T10:00:00Z", egreso_por_nombre: "pañol.chubut" }),
    fila({ id: "b", descripcion: "Bomba  sumergible 12v", codigo: "bs12", cantidad: 1, obra_id: "o1", obra: { id: "o1", codigo: "52-27" }, created_at: "2026-10-19T09:00:00Z", egreso_por_nombre: "pañol.pampa" }),
    fila({ id: "c", descripcion: "Bomba sumergible 12V", codigo: "BS12", estado: "egresado", cantidad: 1, cantidad_egresada: 1, egreso_at: "2026-10-19T11:00:00Z" }),
    fila({ id: "d", descripcion: "Inodoro marino", material_id: "m9" }),
  ];
  const [g, ...resto] = productosACrear(rows, { ahora: AHORA });
  assert.equal(resto.length, 0);
  assert.deepEqual(g.ids.sort(), ["a", "b", "c"]);
  // a y b suman; c es un retiro total (la fila egresada ya no suma ni resta).
  assert.equal(g.enStock, 3);
  assert.deepEqual(g.obras, ["52-27"]);
  assert.deepEqual(g.sedes, ["Chubut"]);
  assert.equal(g.ultimo, "2026-10-19T11:00:00Z");
});

test("lo viejo y sin saldo no aparece; lo reciente aunque haya salido, sí", () => {
  const rows = [
    fila({ id: "v", descripcion: "Cable viejo", estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-07-01T10:00:00Z" }),
    fila({ id: "r", descripcion: "Cable nuevo", estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-10-10T10:00:00Z" }),
    fila({ id: "s", descripcion: "Cable con saldo", created_at: "2026-07-01T10:00:00Z" }),
  ];
  assert.deepEqual(productosACrear(rows, { ahora: AHORA }).map((g) => g.descripcion), ["Cable nuevo", "Cable con saldo"]);
});

test("pañol no crea productos de barco; administración y técnica sí", () => {
  assert.equal(puedeCrearProductosDeBarco({ role: "panol" }), false);
  assert.equal(puedeCrearProductosDeBarco({ role: "panol", is_admin: true }), true);
  assert.equal(puedeCrearProductosDeBarco({ role: "tecnica" }), true);
  assert.equal(puedeCrearProductosDeBarco(null), false);
});

test("los parlantes ya vinculados a fichas provisionales también esperan confirmación", () => {
  const catalogo = [{ id: "parlante", descripcion: "PARLANTE FUSION XS-FLT652SPW", codigo: "010-02583-00", revisado: false, created_by_nombre: "pañol.chubut" }];
  const rows = [fila({ id: "ingreso", material_id: "parlante", requisito_material_id: "parlante", descripcion: "PARLANTE FUSION XS-FLT652SPB", cantidad: 3, created_at: "2026-10-19T09:00:00Z" })];
  assert.equal(productosACrear(rows, { ahora: AHORA }).length, 0);
  const [g] = fichasPanolPorConfirmar(catalogo, rows, { ahora: AHORA });
  assert.equal(g.materialId, "parlante");assert.equal(g.enStock, 3);assert.deepEqual(g.ids, ["ingreso"]);
  assert.deepEqual(g.descripcionesIngreso, ["PARLANTE FUSION XS-FLT652SPB"]);
  assert.equal(fichasPanolPorConfirmar([{ ...catalogo[0], revisado: true }], rows, { ahora: AHORA }).length, 0);
});

test("fichas por confirmar excluyen consumibles, anulados, necesidades y pedidos sin recibir", () => {
  const rows = [fila({ id: "a", material_id: "m", descripcion: "Producto", notas: "[anulado]" }),fila({ id: "b", material_id: "m", descripcion: "Producto", estado: "comprado", source: "compra", recepcion_estado: "pendiente" })];
  assert.deepEqual(fichasPanolPorConfirmar([{ id: "m", revisado: false }], rows, { ahora: AHORA }), []);
  const real = [fila({ id: "c", material_id: "m", descripcion: "Producto" })];
  for (const flags of [{ es_consumible: true }, { es_requisito: true }, { activo: false }]) assert.deepEqual(fichasPanolPorConfirmar([{ id: "m", ...flags }], real, { ahora: AHORA }), []);
});
