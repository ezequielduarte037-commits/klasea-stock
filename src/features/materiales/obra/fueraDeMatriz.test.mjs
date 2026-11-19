import test from "node:test";
import assert from "node:assert/strict";
import { sumarFueraDeMatriz } from "./fueraDeMatriz.js";
import { cantidadesDeFila } from "./estadoDeFila.js";

// Las tres filas de la cámara Hikvision de la 52-25 (19/11/2026).
const madre = { id: "madre", source: "remito", snapshot_estado: "en_panol", estadoObra: "en_panol", recepcion_estado: "recibido", recepcion_cantidad_recibida: "2", cantidad: 1, cantidad_egresada: 1 };
const hija = { id: "hija", source: "historial_retiro_parcial", snapshot_estado: "egresado", estadoObra: "egresado", recepcion_estado: "egresado", recepcion_cantidad_recibida: "1", cantidad: 1, cantidad_egresada: 1, egreso_at: "2026-11-19T12:57:10Z" };
const otro = { id: "otro", source: "remito", snapshot_estado: "en_panol", estadoObra: "en_panol", recepcion_estado: "recibido", recepcion_cantidad_recibida: "1", cantidad: 1, cantidad_egresada: 0 };
const cuenta = (row) => { const q = cantidadesDeFila(row); return [q.necesita, q.panol, q.entregado]; };

test("remito de 2 con 1 retirada: recibido 2, entregado 1, aunque gane la hija", () => {
  assert.deepEqual(cuenta(sumarFueraDeMatriz(hija, [madre, hija])), [2, 2, 1]);
  assert.deepEqual(cuenta(sumarFueraDeMatriz(madre, [madre, hija])), [2, 2, 1]);
});

test("un segundo ingreso suma en vez de reemplazar al primero", () => {
  assert.deepEqual(cuenta(sumarFueraDeMatriz(otro, [madre, hija, otro])), [3, 3, 1]);
});

test("una sola fila queda como estaba", () => {
  assert.equal(sumarFueraDeMatriz(otro, [otro]), otro);
});

test("madre retirada entera: cantidad_egresada ya es el total", () => {
  const entera = { ...madre, snapshot_estado: "egresado", estadoObra: "egresado", recepcion_cantidad_recibida: null, cantidad: 1, cantidad_egresada: 2, egreso_at: "2026-11-19T13:00:00Z" };
  assert.deepEqual(cuenta(sumarFueraDeMatriz(entera, [entera, hija])), [2, 2, 2]);
});

test("un ingreso anulado no suma", () => {
  const anulado = { ...otro, id: "anulado", obs: "[anulado]" };
  assert.deepEqual(cuenta(sumarFueraDeMatriz(madre, [madre, hija, anulado])), [2, 2, 1]);
});
