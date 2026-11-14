import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recepcionAnticipada, cantidadPendienteDeCompra } from './recepcionesAnticipadas.js';

test('el pedido de una pieza toma sólo el faltante físico, usando la cantidad del renglón', () => {
  const item = {
    material_id: 'tubo-75', cantidad: 2,
    materiales: [{ material_id: 'tubo-75', cantidad: 1 }],
    recepciones_panol: [{ material_id: 'tubo-75', cantidad: 1 }],
  };
  assert.equal(recepcionAnticipada(item).completa, false);
  assert.equal(cantidadPendienteDeCompra(item, 'tubo-75'), 1);
});
test('un lote pide cada material por su cantidad pendiente, sin volver a comprar lo recibido', () => {
  const item = {
    cantidad: 1, materiales: [{ material_id: 'a', cantidad: 2 }, { material_id: 'b', cantidad: 3 }],
    recepciones_panol: [{ material_id: 'a', cantidad: 2 }, { material_id: 'b', cantidad: 1 }],
  };
  assert.equal(cantidadPendienteDeCompra(item, 'a'), 0);
  assert.equal(cantidadPendienteDeCompra(item, 'b'), 2);
  assert.equal(recepcionAnticipada(item).completa, false);
});
test('las cantidades enviadas al taller siguen como prueba del ingreso inicial', () => {
  const item = { material_id: 'tubo-75', cantidad: 2,
    recepciones_panol: [{ material_id: 'tubo-75', cantidad: 2, cantidad_egresada: 2 }] };
  assert.equal(recepcionAnticipada(item).completa, true);
  assert.equal(cantidadPendienteDeCompra(item, 'tubo-75'), 0);
});
test('un material sin catálogo conserva el pedido habitual', () => {
  const item = { cantidad: 2 };
  assert.equal(recepcionAnticipada(item).completa, false);
  assert.equal(cantidadPendienteDeCompra(item, null), 2);
});
