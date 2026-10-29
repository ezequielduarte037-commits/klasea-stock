import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { rowDelta, rowHasRecordedEgreso } from '../src/features/panol/panolMovimientos.js';

process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const movimientoId = 'e9d6a89e-9b9d-4905-aa9f-c1997e3da926';
const materialId = '0f862566-a342-4d1c-9379-c772c2675a7b';
const origenId = 'a7315fae-f0c4-451e-be31-267dd16fc840';
const destinoId = 'b11cf272-f8b5-4a3f-8972-e6a8bd266d05';
const carpeta = 'backups/chromecast-3736-20261021';

async function leer(query) {
  const { data, error } = await query;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}
async function movimientos() {
  return leer(db.from('panol_obra_materiales_snapshot').select('*').eq('material_id', materialId).order('id'));
}
function stock(rows) {
  const saldos = {};
  for (const r of rows) {
    const key = `${r.stock_sede || ''}|${r.obra_id || ''}`;
    const delta = rowDelta(r);
    if (delta) saldos[key] = (saldos[key] || 0) + delta;
  }
  return saldos;
}

const antes = await movimientos();
const fila = antes.find(r => r.id === movimientoId);
assert.ok(fila);
assert.equal(fila.obra_id, origenId, 'El movimiento ya cambió: no repetir la corrección.');
assert.equal(fila.obra_origen_id, origenId);
assert.equal(fila.egreso_destino_obra_id, null);
assert.equal(fila.estado, 'egresado');
assert.equal(fila.source, 'remito');
assert.equal(fila.cantidad, 1);
assert.equal(fila.cantidad_egresada, 1);
assert.equal(fila.cantidad_en_reclamo, 0);
assert.equal(fila.egreso_at, '2026-10-21T13:03:36.244181+00:00');
assert.equal(fila.egreso_por, '3ed8b48c-1db2-4cf3-840d-44566a72b42b');
assert.ok(rowHasRecordedEgreso(fila));
assert.equal(rowDelta(fila), 0);
const obras = await leer(db.from('produccion_obras').select('id,codigo,estado').in('id', [origenId, destinoId]));
assert.equal(obras.find(o => o.id === destinoId)?.codigo, '37-36');
assert.equal(obras.find(o => o.id === origenId)?.codigo, '37-44');

const nota = 'Corrección de destino solicitada el 21/10/2026: el Chromecast retirado el 21/10 a las 10:03 fue entregado al barco del río 37-36, no al 37-44. Se conserva el egreso original de 1 unidad; sin devolución ni nuevo descuento de stock.';
const patch = {
  obra_id: destinoId,
  egreso_destino_obra_id: destinoId,
  egreso_nota: [fila.egreso_nota, nota].filter(Boolean).join(' · '),
  updated_at: new Date().toISOString(),
};
// Sigue el formato de panol_egresar_obra_materiales para retiros totales:
// obra_id es la obra receptora y obra_origen_id conserva la asignación original.
assert.deepEqual(stock(antes), stock(antes.map(r => r.id === movimientoId ? { ...r, ...patch } : r)));
fs.mkdirSync(carpeta, { recursive: true });
fs.writeFileSync(`${carpeta}/antes.json`, JSON.stringify({ obras, movimientos: antes, stock: stock(antes), patch }, null, 2), { flag: 'wx' });
const cambiadas = await leer(db.from('panol_obra_materiales_snapshot').update(patch)
  .eq('id', movimientoId).eq('updated_at', fila.updated_at).eq('obra_id', origenId)
  .eq('estado', 'egresado').eq('cantidad_egresada', 1).is('egreso_destino_obra_id', null)
  .select('*'));
assert.equal(cambiadas.length, 1, 'No se modificó el movimiento: revisar cambios concurrentes.');
const despues = await movimientos();
fs.writeFileSync(`${carpeta}/despues.json`, JSON.stringify({ movimientos: despues, stock: stock(despues) }, null, 2));
assert.equal(despues.length, antes.length);
assert.deepEqual(stock(despues), stock(antes), 'El stock debe conservarse en cada obra y sede.');
for (const previa of antes) {
  const actual = despues.find(r => r.id === previa.id);
  if (previa.id !== movimientoId) {
    assert.deepEqual(actual, previa, 'Otro movimiento cambió durante la verificación.');
    continue;
  }
  assert.equal(actual.obra_id, destinoId);
  assert.equal(actual.egreso_destino_obra_id, destinoId);
  assert.equal(actual.egreso_nota, patch.egreso_nota);
  for (const key of Object.keys(previa)) {
    if (!(key in patch)) assert.deepEqual(actual[key], previa[key], `Cambió el campo ${key}`);
  }
}
console.log(JSON.stringify({ corregido: true, movimientoId, destino: '37-36', cantidad: 1, fechaOriginal: fila.egreso_at, stockSinCambios: true, respaldo: carpeta }));
