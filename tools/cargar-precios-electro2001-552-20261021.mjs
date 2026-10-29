import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { rowDelta } from '../src/features/panol/panolMovimientos.js';

process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const requestId = '1261e588-bbae-4185-89b0-1578bf74d123';
const obraId = '488b6dd4-01a3-4e57-bcd4-621f8e909f96';
const carpeta = 'backups/precios-electro2001-552-20261021';
const fuente = 'Presupuesto Electro2001 / GRUPO ELECTRO SRL P 0001-00147790 del 20/10/2026';
const observacion = 'El pedido solicita Macroled Milán y el presupuesto cotiza Mónaco negro; equivalencia de línea y llaves combinables pendientes de confirmación.';
const filas = [
  ['7925f535-c76d-4705-9a2d-b0890855652a', '692e7d5b-bd13-4c3f-91a6-2dad3c911ba2', 4, 4351.5747, 10.5, 17406.30, '086R / M-2CN-N'],
  ['8bebbaaf-cc9c-494e-9e64-0d50b800a63b', '7f0e2662-4517-4e68-889f-46db0b7d32b6', 4, 5590.7647, 21, 22363.06, 'BR1R / M-2CN-1TC-N'],
  ['14761810-5ab1-4ac9-951d-8e043b43537a', '5eccbf9a-9b9c-4544-b5c3-793dc354ad83', 1, 5485.0974, 10.5, 5485.10, '102R / M-3CN-N'],
  ['beb5063c-2c68-47b7-82c4-810551b5af37', 'ff321a90-d9a4-496f-8206-9a637bb8dde2', 6, 6647.4385, 10.5, 39884.63, '142R / M-4CN-N'],
  ['755abfaa-e237-43d0-b413-8f7247d763b5', '758d53c8-2d39-41d5-adf1-56837b2d25d5', 8, 21901.9650, 21, 175215.72, '082R / M-2TC-1USB-C-N'],
  ['3454e9cc-92fd-40d6-b3af-81b307a1f232', '0e08a2cc-d0f8-4d2e-920c-88ac14166a83', 5, 3381.3560, 21, 16906.78, '146R / M-2TC-N'],
].map(([itemId, materialId, cantidad, precio, iva, subtotal, codigo]) => ({ itemId, materialId, cantidad, precio, iva, subtotal, codigo }));
async function leer(query) {
  const { data, error } = await query;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}
async function estado() {
  const [pedido, items, snapshots] = await Promise.all([
    leer(db.from('purchase_requests').select('*').eq('id', requestId).single()),
    leer(db.from('purchase_request_items').select('*').eq('request_id', requestId).order('id')),
    leer(db.from('panol_obra_materiales_snapshot').select('*').eq('purchase_request_id', requestId).order('id')),
  ]);
  return { pedido, items, snapshots };
}
const antes = await estado();
assert.equal(antes.pedido.project_id, obraId);
assert.equal(antes.items.length, 6);
assert.equal(antes.snapshots.length, 6);
assert.equal(antes.pedido.estimated_amount, 328000);
const fmt = (n, digits = 2) => n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const agregar = (original, nota) => [original, nota].filter(Boolean).join('\n\n');
const plan = [];
for (const f of filas) {
  const item = antes.items.find(i => i.id === f.itemId);
  const snap = antes.snapshots.find(s => s.purchase_request_item_id === f.itemId);
  assert.equal(item?.material_id, f.materialId);
  assert.equal(Number(item.quantity), f.cantidad);
  assert.equal(snap?.material_id, f.materialId);
  assert.equal(snap.obra_id, obraId);
  assert.equal(Number(snap.cantidad), f.cantidad);
  assert.equal(snap.precio_unitario, null);
  assert.ok(!String(item.notes || '').includes('00147790'), 'Este presupuesto ya está registrado.');
  assert.equal(Math.round(f.cantidad * f.precio * 100), Math.round(f.subtotal * 100));
  const nota = `${fuente}. Código cotizado: ${f.codigo}. Precio unitario neto ARS $${fmt(f.precio, 4)}; IVA ${fmt(f.iva, f.iva % 1 ? 1 : 0)}%; cantidad ${f.cantidad}; subtotal neto ARS $${fmt(f.subtotal)}. ${observacion}`;
  plan.push({ table: 'purchase_request_items', before: item, patch: { notes: agregar(item.notes, nota) } });
  plan.push({ table: 'panol_obra_materiales_snapshot', before: snap, patch: { precio_unitario: f.precio, moneda: 'ARS', notas: agregar(snap.notas, nota) } });
}
const neto = filas.reduce((s, f) => s + f.cantidad * f.precio, 0);
const iva = filas.reduce((s, f) => s + f.cantidad * f.precio * f.iva / 100, 0);
assert.equal(Math.round(neto * 100), 27726159);
assert.equal(Math.round(iva * 100), 5163345);
assert.equal(Math.round((neto + iva) * 100), 32889504);
const resumen = `${fuente}: 6 renglones / 28 unidades. Precios unitarios netos y alícuotas de IVA detallados en las notas de cada ítem. Neto ARS $277.261,59 + IVA ARS $51.633,45 = total cotizado ARS $328.895,04. ${observacion} Se conserva el costo real previamente registrado hasta contar con confirmación del importe final de compra.`;
plan.push({ table: 'purchase_requests', before: antes.pedido, patch: { estimated_amount: 328895.04, description: agregar(antes.pedido.description, resumen) } });
fs.mkdirSync(carpeta, { recursive: true });
fs.writeFileSync(`${carpeta}/antes-y-plan.json`, JSON.stringify({ fuente, antes, plan }, null, 2), { flag: 'wx' });
const aplicados = [];
try {
  for (const p of plan) {
    const actual = await leer(db.from(p.table).select('*').eq('id', p.before.id).single());
    // Algunos triggers sólo actualizan updated_at en las filas relacionadas.
    for (const key of Object.keys(p.before)) {
      if (key !== 'updated_at') assert.deepEqual(actual[key], p.before[key], `Cambió ${p.table}.${key}; revisar concurrencia.`);
    }
    const rows = await leer(db.from(p.table).update(p.patch).eq('id', actual.id).eq('updated_at', actual.updated_at).select('*'));
    assert.equal(rows.length, 1, 'No se pudo confirmar la actualización.');
    aplicados.push({ ...p, after: rows[0] });
    fs.writeFileSync(`${carpeta}/aplicados.json`, JSON.stringify(aplicados, null, 2));
  }
  const despues = await estado();
  fs.writeFileSync(`${carpeta}/despues.json`, JSON.stringify(despues, null, 2));
  for (const p of plan) {
    const actual = p.table === 'purchase_requests' ? despues.pedido : (p.table === 'purchase_request_items' ? despues.items : despues.snapshots).find(r => r.id === p.before.id);
    for (const key of Object.keys(p.before)) {
      if (key === 'updated_at') continue;
      assert.deepEqual(actual[key], key in p.patch ? p.patch[key] : p.before[key], `${p.table}.${key} no coincide.`);
    }
    if (p.table === 'panol_obra_materiales_snapshot') assert.equal(rowDelta(actual), rowDelta(p.before));
  }
  console.log(JSON.stringify({ cargados: filas.length, obra: '55-2', preciosUnitarios: 'ARS sin IVA', neto: 277261.59, iva: 51633.45, totalCotizado: 328895.04, costoRealConservado: despues.pedido.actual_amount, observacionConservada: true, stockSinCambios: true }));
} catch (error) {
  fs.writeFileSync(`${carpeta}/error.json`, JSON.stringify({ error: error.message, aplicados: aplicados.map(p => ({ table: p.table, id: p.before.id })) }, null, 2));
  // Revertir únicamente nuestros campos si siguen teniendo el valor escrito.
  for (const p of aplicados.reverse()) {
    const actual = await leer(db.from(p.table).select('*').eq('id', p.before.id).single());
    for (const key of Object.keys(p.patch)) assert.deepEqual(actual[key], p.patch[key], 'Hay una edición posterior; no sobrescribirla.');
    const rollback = Object.fromEntries(Object.keys(p.patch).map(key => [key, p.before[key]]));
    const rows = await leer(db.from(p.table).update(rollback).eq('id', actual.id).eq('updated_at', actual.updated_at).select('id'));
    assert.equal(rows.length, 1, 'Revisar reversión por concurrencia.');
  }
  throw error;
}
