import test from 'node:test';
import assert from 'node:assert/strict';
import { aporteDeFilaLedger, cantidadesDeFila, estadoObraForRow } from './estadoDeFila.js';

// Filas como las arma snapshotRowToView: el estado crudo va en snapshot_estado
// y el tipo en snapshot_tipo.
const conteo = (cantidad, extra = {}) => ({
  source: 'conteo_fisico', snapshot_tipo: 'conteo_fisico', snapshot_estado: 'en_panol',
  recepcion_estado: 'recibido', cantidad, obs: 'Conteo físico inicial — Obra 55-1', ...extra,
});
const retiroTotalDelConteo = (cantidad) => conteo(cantidad, { snapshot_estado: 'egresado', cantidad_egresada: cantidad });
const retiroParcialDelConteo = (cantidad) => ({
  source: 'historial_retiro_parcial', snapshot_tipo: 'conteo_fisico', snapshot_estado: 'egresado',
  recepcion_estado: 'egresado', cantidad, cantidad_egresada: cantidad,
});
const liberadoAStock = (cantidad) => ({
  source: 'transferencia_egreso', snapshot_tipo: 'transferencia', snapshot_estado: 'egresado',
  recepcion_estado: 'egresado', cantidad, cantidad_egresada: cantidad,
});

// Lo mismo que hace mergeMatrixAndSnapshotRows con las filas que no se mezclan.
function renglonConLedger(renglon, filas) {
  const total = filas.map(aporteDeFilaLedger).reduce((acc, aporte) => ({
    panol: acc.panol + aporte.panol,
    entregadoConteo: acc.entregadoConteo + aporte.entregadoConteo,
  }), { panol: 0, entregadoConteo: 0 });
  return { ...renglon, panolLedger: Math.max(0, total.panol), entregadoConteo: total.entregadoConteo };
}

const deMatriz = (cantidad) => ({ source: 'matriz', cantidad });

test('GHS 11 del 55-1: lo asignado por el conteo figura en pañol y no pide comprar', () => {
  const row = renglonConLedger(deMatriz(1), [conteo(1)]);
  assert.equal(estadoObraForRow(row), 'en_panol');
  const q = cantidadesDeFila(row);
  assert.equal(q.faltaComprar, 0);
  assert.equal(q.faltaEntregar, 1);
  assert.equal(q.panol, 1);
});

test('el conteo corto cubre sólo lo contado y pide comprar el resto', () => {
  const q = cantidadesDeFila(renglonConLedger(deMatriz(3), [conteo(2)]));
  assert.deepEqual([q.panol, q.faltaEntregar, q.faltaComprar], [2, 2, 1]);
});

test('retiro total del conteo: la obra ya lo tiene', () => {
  const row = renglonConLedger(deMatriz(1), [retiroTotalDelConteo(1)]);
  assert.equal(estadoObraForRow(row), 'egresado');
  const q = cantidadesDeFila(row);
  assert.deepEqual([q.entregado, q.faltaEntregar, q.faltaComprar], [1, 0, 0]);
});

test('retiro parcial: lo que queda se retira y lo retirado no se cuenta dos veces', () => {
  // 7 contadas, se llevaron 1: la fila del conteo queda en 6 y aparece el historial.
  const q = cantidadesDeFila(renglonConLedger(deMatriz(7), [conteo(6), retiroParcialDelConteo(1)]));
  assert.deepEqual([q.panol, q.entregado, q.faltaEntregar, q.faltaComprar], [7, 1, 6, 0]);
});

test('lo liberado a stock general deja de cubrir a la obra', () => {
  const row = renglonConLedger(deMatriz(1), [conteo(1), liberadoAStock(1)]);
  assert.equal(estadoObraForRow(row), 'pendiente');
  assert.equal(cantidadesDeFila(row).faltaComprar, 1);
});

test('una reversión del conteo descuenta el stock y no es una entrega', () => {
  const reversion = {
    source: 'conteo_fisico_reversion', snapshot_tipo: 'conteo_fisico_reversion', snapshot_estado: 'egresado',
    recepcion_estado: 'egresado', cantidad: 1, cantidad_egresada: 1,
  };
  assert.deepEqual(aporteDeFilaLedger(reversion), { panol: -1, entregadoConteo: 0 });
  const row = renglonConLedger(deMatriz(1), [conteo(1, { obs: '[anulado] Revierte movimiento' }), reversion]);
  assert.equal(cantidadesDeFila(row).faltaComprar, 1);
});

test('un retiro del conteo anulado no cuenta como entregado', () => {
  const anulado = { ...retiroParcialDelConteo(1), obs: '[anulado] Revierte movimiento x - Motivo reversion: ERROR' };
  assert.equal(aporteDeFilaLedger(anulado).entregadoConteo, 0);
});

test('conteo y egreso por separado (43-29): entregado, sin sumar de más', () => {
  const egreso = {
    source: 'egreso_producto', snapshot_tipo: 'egreso_producto', snapshot_estado: 'egresado',
    recepcion_estado: 'egresado', cantidad: 1, cantidad_egresada: 1,
  };
  const row = { ...renglonConLedger(deMatriz(1), [conteo(1), egreso]), egresadoLedger: 1 };
  assert.equal(row.panolLedger, 0);
  const q = cantidadesDeFila(row);
  assert.deepEqual([q.entregado, q.faltaEntregar, q.faltaComprar], [1, 0, 0]);
});

test('sin conteo la cuenta queda como antes', () => {
  assert.equal(cantidadesDeFila(deMatriz(4)).faltaComprar, 4);
  const enCompras = cantidadesDeFila({ ...deMatriz(4), estadoObra: 'pedido' });
  assert.deepEqual([enCompras.faltaComprar, enCompras.enCompras], [0, 4]);
  const recibido = { ...deMatriz(2), estadoObra: 'en_panol', recepcion_estado: 'recibido', recepcion_cantidad_recibida: '2' };
  assert.equal(estadoObraForRow(recibido), 'en_panol');
  assert.deepEqual([cantidadesDeFila(recibido).panol, cantidadesDeFila(recibido).faltaEntregar], [2, 2]);
});

test('el conteo nunca hace retroceder un estado más avanzado', () => {
  const row = { ...deMatriz(1), egreso_at: '2026-10-01T10:00:00Z', panolLedger: 1 };
  assert.equal(estadoObraForRow(row), 'egresado');
});
