import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { rowDelta } from '../src/features/panol/panolMovimientos.js';

// 29/10/2026: el pañol egresó para el barco del río 52-19 material del stock de
// la 52-26 y la 64-21, directo desde la obra y con una observación. Así la
// lista de esas obras lo daba por entregado. 52-19 no está cargada como obra
// (decisión de Ezequiel: destino en texto), así que el renglón sale de la obra
// (obra_id null) y conserva de dónde vino en obra_origen_id. El stock no cambia:
// el renglón ya estaba egresado.
process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const carpeta = 'backups/egresos-rio-52-19-20261029';
const destino = 'Río · 52-19';
const correcciones = [
  { id: 'db6ceb6b-dc3a-462e-9eba-3eee40f27a76', obra: '52-26', cantidad: 1, source: 'remito' },
  { id: '4ac94f6e-ee4b-485a-b39d-a3bd6e430c93', obra: '64-21', cantidad: 3, source: 'historial_retiro_parcial' },
  { id: '94e00453-1df6-4232-b772-adac6bbbbb6a', obra: '64-21', cantidad: 2, source: 'historial_retiro_parcial', aclaracion: 'La "64-19" anotada es el 52-19 del río.' },
];

async function leer(query) {
  const { data, error } = await query;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}

const obras = await leer(db.from('produccion_obras').select('id,codigo').in('codigo', ['52-26', '64-21']));
const obraId = (codigo) => obras.find((o) => o.codigo === codigo)?.id;
const antes = await leer(db.from('panol_obra_materiales_snapshot').select('*').in('id', correcciones.map((c) => c.id)).order('id'));
assert.equal(antes.length, correcciones.length);
for (const c of correcciones) {
  const fila = antes.find((r) => r.id === c.id);
  assert.equal(fila.obra_id, obraId(c.obra), `${c.id}: ya no está en la ${c.obra}, no repetir.`);
  assert.equal(fila.estado, 'egresado');
  assert.equal(fila.source, c.source);
  assert.equal(Number(fila.cantidad_egresada), c.cantidad);
  assert.equal(fila.egreso_destino_obra_id, null);
  assert.equal(rowDelta(fila), 0);
}
fs.mkdirSync(carpeta, { recursive: true });
fs.writeFileSync(`${carpeta}/antes.json`, JSON.stringify({ obras, movimientos: antes }, null, 2), { flag: 'wx' });

const despues = [];
for (const c of correcciones) {
  const fila = antes.find((r) => r.id === c.id);
  const nota = [
    `Corregido el 29/10/2026: se retiró del stock de la ${c.obra} para el barco del río 52-19 (reasignación con egreso).`,
    c.aclaracion,
    'Sin cambio de stock ni de fecha.',
  ].filter(Boolean).join(' ');
  const patch = {
    obra_id: null,
    obra_origen_id: fila.obra_origen_id || fila.obra_id,
    sector_destino: destino,
    egreso_nota: [fila.egreso_nota, nota].filter(Boolean).join(' · '),
    updated_at: new Date().toISOString(),
  };
  const [cambiada] = await leer(db.from('panol_obra_materiales_snapshot').update(patch)
    .eq('id', c.id).eq('updated_at', fila.updated_at).eq('obra_id', fila.obra_id).select('*'));
  assert.ok(cambiada, `${c.id}: no se actualizó, revisar cambios concurrentes.`);
  for (const key of Object.keys(fila)) {
    if (!(key in patch)) assert.deepEqual(cambiada[key], fila[key], `Cambió ${key}`);
  }
  assert.equal(rowDelta(cambiada), rowDelta(fila));
  despues.push(cambiada);
}
fs.writeFileSync(`${carpeta}/despues.json`, JSON.stringify({ movimientos: despues }, null, 2));
console.log(JSON.stringify({ corregidos: despues.map((r) => ({ id: r.id, descripcion: r.descripcion, origen: correcciones.find((c) => c.id === r.id).obra, destino })), stockSinCambios: true, respaldo: carpeta }));
