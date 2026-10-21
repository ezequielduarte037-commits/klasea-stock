import test from "node:test";
import assert from "node:assert/strict";
import { rowDelta } from "./panolMovimientos.js";
import { rowEgresoKind, rowInHistory, rowIsAsignacionStock, rowIsMovimientoEspejo } from "./stockGrupos.js";

// Forma real del par registrado al liberar el faro del 52-24 el 21/10.
const salida = {
  id: "liberacion-salida", material_id: "faro", obra_id: "52-24", obra_origen_id: "52-24",
  egreso_destino_obra_id: null, source: "transferencia_egreso", tipo_label: "Liberado de obra",
  estado: "egresado", recepcion_estado: "egresado", cantidad: 1, cantidad_egresada: 1,
  stock_sede: "Chubut", created_at: "2026-10-21T18:33:41.926068Z",
};
const entrada = {
  ...salida, id: "liberacion-entrada", obra_id: null, source: "transferencia_ingreso",
  tipo_label: "Liberado a stock", estado: "en_panol", recepcion_estado: "recibido", cantidad_egresada: 0,
};

test("liberar una reserva muestra una sola acción a stock, sin obra destino ficticia", () => {
  const visibles = [salida, entrada].filter(row => !rowIsMovimientoEspejo(row));
  assert.deepEqual(visibles.map(row => row.id), [salida.id]);
  assert.deepEqual([salida, entrada].filter(rowInHistory).map(rowEgresoKind), ["liberacion"]);
  assert.equal(rowIsAsignacionStock(entrada), false);
  assert.equal(rowDelta(salida), -1);
  assert.equal(rowDelta(entrada), 1);
  assert.equal(rowDelta(salida) + rowDelta(entrada), 0);
});

test("la clasificación usa origen y destino aunque cambie el texto del registro", () => {
  assert.equal(rowEgresoKind({ ...salida, tipo_label: "Transferencia" }), "liberacion");
  assert.equal(rowIsMovimientoEspejo({ ...entrada, tipo_label: "Transferencia recibida" }), true);
});

test("una reasignación a otra obra conserva una sola entrada con destino real", () => {
  const out = { ...salida, tipo_label: "Transferencia a obra", egreso_destino_obra_id: "52-25" };
  const incoming = { ...entrada, tipo_label: "Transferencia recibida", obra_id: "52-25" };
  assert.equal(rowIsMovimientoEspejo(out), true);
  assert.equal(rowIsMovimientoEspejo(incoming), false);
  assert.equal(rowEgresoKind(incoming), "reasignacion");
  assert.equal(rowInHistory(incoming), true);
});

test("retirar después el stock liberado mantiene su egreso físico visible", () => {
  const retirado = { ...entrada, estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-10-22T12:00:00Z" };
  assert.equal(rowIsMovimientoEspejo(retirado), false);
  assert.equal(rowInHistory(retirado), true);
  assert.equal(rowEgresoKind(retirado), "egreso");
  assert.equal(rowDelta(retirado), 0);
  assert.equal(rowEgresoKind(salida), "liberacion");
});

test("el historial conserva el total liberado cuando se retira sólo una parte", () => {
  const out = { ...salida, cantidad: 3, cantidad_egresada: 3 };
  const restante = { ...entrada, cantidad: 2, cantidad_egresada: 1 };
  const retiro = { ...entrada, id: "retiro-parcial", source: "historial_retiro_parcial", estado: "egresado", cantidad: 1, cantidad_egresada: 1 };
  assert.deepEqual([out, restante, retiro].filter(rowInHistory).map(rowEgresoKind), ["liberacion", "egreso"]);
  assert.equal(rowDelta(out) + rowDelta(restante) + rowDelta(retiro), -1);
});
