import test from "node:test";
import assert from "node:assert/strict";
import { agruparConsumidos, consumoDeFilaVieja, esFilaDeConsumible } from "./consumiblesDeObra.js";

const consumibles = new Set(["lija", "fix"]);

test("separa de la lista del barco los consumibles y las solicitudes viejas", () => {
  assert.equal(esFilaDeConsumible({ source: "matriz", material_id: "anafe" }, consumibles), false);
  assert.equal(esFilaDeConsumible({ source: "remito", material_id: "lija" }, consumibles), true);
  assert.equal(esFilaDeConsumible({ source: "solicitud_consumible_retiro", material_id: null }, consumibles), true);
  assert.equal(esFilaDeConsumible({ source: "remito", material_id: "x", requisito_material_id: "fix" }, consumibles), true);
});

test("una fila vieja cuenta como consumo sólo si fue un retiro", () => {
  assert.equal(consumoDeFilaVieja({ source: "solicitud_consumible_retiro", estado: "pendiente", cantidad: "3" }), 3);
  assert.equal(consumoDeFilaVieja({ source: "historial_retiro_parcial", estado: "egresado", cantidad_egresada: 2, cantidad: 5 }), 2);
  assert.equal(consumoDeFilaVieja({ source: "remito", estado: "en_panol", cantidad: 10 }), 0);
  assert.equal(consumoDeFilaVieja({ source: "solicitud_consumible_retiro", cantidad: 4, notas: "[anulado] error" }), 0);
});

test("suma retiros de los dos registros, resta devoluciones y saltea anulados", () => {
  const lista = agruparConsumidos({
    movimientos: [
      { id: 1, tipo: "retiro", material_id: "lija", cantidad: 2, created_at: "2026-10-20T10:00:00Z", material: { descripcion: "Lija 80", unidad_medida: "rollo", config: { unidad_entrega: "metro" } } },
      { id: 2, tipo: "retiro", material_id: "lija", cantidad: 3, created_at: "2026-10-25T10:00:00Z", material: { descripcion: "Lija 80" } },
      { id: 3, tipo: "devolucion", material_id: "lija", cantidad: 1, created_at: "2026-10-26T10:00:00Z", material: { descripcion: "Lija 80" } },
      { id: 4, tipo: "retiro", material_id: "fix", cantidad: 50, anulado_at: "2026-10-21T00:00:00Z", material: { descripcion: "3,5 X 16 FIX" } },
      { id: 5, tipo: "inventario", material_id: "fix", cantidad: 300, material: { descripcion: "3,5 X 16 FIX" } },
    ],
    filasViejas: [
      { source: "solicitud_consumible_retiro", material_id: "lija", descripcion: "Lija 80", cantidad: 1, created_at: "2026-09-01T10:00:00Z" },
      { source: "remito", estado: "en_panol", material_id: "fix", descripcion: "3,5 X 16 FIX", cantidad: 100 },
    ],
  });
  assert.equal(lista.length, 1);
  assert.deepEqual(
    { descripcion: lista[0].descripcion, unidad: lista[0].unidad, cantidad: lista[0].cantidad, retiros: lista[0].retiros, ultimo: lista[0].ultimo },
    { descripcion: "Lija 80", unidad: "metro", cantidad: 5, retiros: 3, ultimo: "2026-10-26T10:00:00Z" },
  );
});
