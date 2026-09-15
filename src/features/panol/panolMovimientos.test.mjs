import test from "node:test";
import assert from "node:assert/strict";
import { rowDelta, rowHasRecordedEgreso, rowIsEgreso } from "./panolMovimientos.js";

test("un retiro total conserva el origen sin duplicar el descuento de stock", () => {
  const row = {
    source: "transferencia_ingreso",
    estado: "egresado",
    cantidad: 1,
    cantidad_egresada: 1,
    egreso_at: "2026-09-14T16:14:04.368831Z",
    egreso_por: "operator-id",
  };

  assert.equal(rowHasRecordedEgreso(row), true);
  assert.equal(rowIsEgreso(row), false);
  assert.equal(rowDelta(row), 0);
});

test("una transferencia recibida activa continúa siendo una asignación con stock", () => {
  const row = {
    source: "transferencia_ingreso",
    estado: "en_panol",
    recepcion_estado: "recibido",
    cantidad: 1,
  };

  assert.equal(rowHasRecordedEgreso(row), false);
  assert.equal(rowDelta(row), 1);
});

test("el historial de retiro parcial se reconoce como salida sin otro delta", () => {
  const row = {
    source: "historial_retiro_parcial",
    estado: "egresado",
    cantidad: 2,
    cantidad_egresada: 2,
    egreso_at: "2026-09-14T16:14:04.368831Z",
  };

  assert.equal(rowHasRecordedEgreso(row), true);
  assert.equal(rowIsEgreso(row), false);
  assert.equal(rowDelta(row), 0);
});

test("un egreso histórico sigue visible aunque sea anterior a los campos de auditoría", () => {
  const row = {
    source: "stock_general",
    estado: "egresado",
    cantidad: 1,
  };

  assert.equal(rowHasRecordedEgreso(row), true);
  assert.equal(rowDelta(row), 0);
});

test("los movimientos de egreso explícitos conservan su delta negativo", () => {
  const row = {
    source: "egreso_solicitud",
    estado: "egresado",
    cantidad: 1,
    cantidad_egresada: 1,
  };

  assert.equal(rowHasRecordedEgreso(row), true);
  assert.equal(rowIsEgreso(row), true);
  assert.equal(rowDelta(row), -1);
});
