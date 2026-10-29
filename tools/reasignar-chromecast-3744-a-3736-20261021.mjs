import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { rowDelta } from '../src/features/panol/panolMovimientos.js';

process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const id = 'e9d6a89e-9b9d-4905-aa9f-c1997e3da926';
const origen = 'a7315fae-f0c4-451e-be31-267dd16fc840';
const destino = 'b11cf272-f8b5-4a3f-8972-e6a8bd266d05';
const material = '0f862566-a342-4d1c-9379-c772c2675a7b';
const carpeta = 'backups/chromecast-3736-20261021';
async function leer(query) {
  const { data, error } = await query;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}
const consulta = () => db.from('panol_obra_materiales_snapshot').select('*').eq('material_id', material).order('id');
const antes = await leer(consulta());
const fila = antes.find(r => r.id === id);
const anteriorVerificado = JSON.parse(fs.readFileSync(`${carpeta}/despues.json`, 'utf8')).movimientos.find(r => r.id === id);
assert.deepEqual(fila, anteriorVerificado, 'El movimiento cambió desde la primera corrección.');
assert.equal(fila.obra_id, destino);
assert.equal(fila.obra_origen_id, origen);
assert.equal(fila.egreso_destino_obra_id, destino);
assert.equal(fila.estado, 'egresado');
assert.equal(fila.cantidad_egresada, 1);
assert.equal(rowDelta(fila), 0);
const obras = await leer(db.from('produccion_obras').select('id,codigo').in('id', [origen, destino]));
assert.equal(obras.find(o => o.id === origen)?.codigo, '37-44');
assert.equal(obras.find(o => o.id === destino)?.codigo, '37-36');
const original = JSON.parse(fs.readFileSync(`${carpeta}/antes.json`, 'utf8')).movimientos.find(r => r.id === id);
const nota = 'Reasignación aclarada el 21/10/2026: 1 Chromecast originalmente asignado al 37-44 fue reasignado y entregado al barco del río 37-36. Corresponde al retiro del 21/10/2026 a las 10:03. Se conserva el egreso original, sin devolución ni nuevo descuento de stock.';
// El historial de reasignaciones con salida usa obra_id como origen y
// egreso_destino_obra_id como destino (StockPanolScreen.movDetalleDestino).
const patch = {
  obra_id: origen,
  egreso_nota: [original.egreso_nota, nota].filter(Boolean).join(' · '),
  updated_at: new Date().toISOString(),
};
fs.writeFileSync(`${carpeta}/antes-reasignacion.json`, JSON.stringify({ movimientos: antes, obras, patch }, null, 2), { flag: 'wx' });
const cambiadas = await leer(db.from('panol_obra_materiales_snapshot').update(patch)
  .eq('id', id).eq('updated_at', fila.updated_at).eq('obra_id', destino)
  .eq('obra_origen_id', origen).eq('egreso_destino_obra_id', destino)
  .eq('estado', 'egresado').eq('cantidad_egresada', 1).select('*'));
assert.equal(cambiadas.length, 1, 'No se actualizó el movimiento: revisar concurrencia.');
const despues = await leer(consulta());
fs.writeFileSync(`${carpeta}/despues-reasignacion.json`, JSON.stringify({ movimientos: despues }, null, 2));
assert.equal(despues.length, antes.length);
for (const previa of antes) {
  const actual = despues.find(r => r.id === previa.id);
  if (previa.id !== id) assert.deepEqual(actual, previa);
  else {
    assert.equal(actual.obra_id, origen);
    assert.equal(actual.obra_origen_id, origen);
    assert.equal(actual.egreso_destino_obra_id, destino);
    assert.equal(actual.egreso_nota, patch.egreso_nota);
    for (const key of Object.keys(previa)) {
      if (!(key in patch)) assert.deepEqual(actual[key], previa[key], `Cambió ${key}`);
    }
  }
  assert.equal(rowDelta(actual), rowDelta(previa));
}
console.log(JSON.stringify({ corregido: true, movimiento: id, tipo: 'reasignacion_egreso', recorrido: '37-44 → 37-36', cantidad: 1, stockSinCambios: true, fechaOriginalConservada: true }));
