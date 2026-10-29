import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { rowDelta } from '../src/features/panol/panolMovimientos.js';

process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const requisitoId = '2586db10-4c4d-4bcf-862b-aff422fa471e';
// Identidad histórica del SKU Bosch, corroborada por la auditoría de 55-4.
const productoId = 'a409c8e8-f10b-4fb5-8719-61079b6bcb8a';
const obraId = 'cdddce11-3d17-4945-837c-8fc0362c26e2';
const snapshotId = '4ed6d91a-3868-441d-b87b-0b3d303dbec5';
const carpeta = 'backups/heladera-bosch-55-3-20261022';
async function leer(query) {
  const { data, error } = await query;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}
const [requisito, obra, anteriores, productos, precios, auditoria] = await Promise.all([
  leer(db.from('panol_materiales').select('*').eq('id', requisitoId).single()),
  leer(db.from('produccion_obras').select('id,codigo').eq('id', obraId).single()),
  leer(db.from('panol_obra_materiales_snapshot').select('*').eq('requisito_material_id', requisitoId).order('id')),
  leer(db.from('panol_materiales').select('*').or(`id.eq.${productoId},codigo.eq.KIN86ADD0`)),
  leer(db.from('panol_precios').select('*').eq('id', 'd17fc043-3836-47b2-ad15-e391963c169e')),
  leer(db.from('panol_obra_materiales_snapshot_audit').select('*').eq('id', '4be64bff-a872-4258-9447-a62cf1d87a5a').single()),
]);
assert.equal(obra.codigo, '55-3');
assert.equal(requisito.es_requisito, true);
assert.equal(requisito.codigo, 'KIN86ADD0');
assert.ok(requisito.variantes.includes('Heladera BOSCH KIN86ADD0 panelable'));
assert.equal(auditoria.valor_anterior, productoId);
assert.equal(auditoria.valor_nuevo, null);
assert.equal(productos.some(p => p.id === productoId), false);
assert.equal(productos.filter(p => p.id !== requisitoId && p.es_requisito !== true && p.activo !== false).length, 0, 'Ya existe otro SKU Bosch; no duplicarlo.');
assert.equal(precios.length, 1);
const precio = precios[0];
assert.equal(precio.precio_unitario, 3181818.18);
assert.equal(precio.fecha, '2026-09-28');
const fila = anteriores.find(s => s.id === snapshotId);
assert.ok(fila);
assert.equal(fila.obra_id, obraId);
assert.equal(fila.material_id, requisitoId);
assert.equal(fila.estado, 'pendiente');
assert.equal(fila.cantidad, 1);
for (const k of ['purchase_request_id', 'purchase_request_item_id', 'panol_envio_id', 'panol_envio_item_id', 'recepcion_estado', 'egreso_at']) assert.equal(fila[k], null);
assert.equal(fila.cantidad_egresada, 0);
assert.equal(rowDelta(fila), 0);
const nota = 'Reparación solicitada el 22/10/2026: se recupera el SKU concreto Bosch KIN86ADD0, cuyo vínculo se había perdido al eliminar la ficha. Se conserva separado el requisito Heladera Panelable K55. Precio de referencia existente del 28/09/2026, sin IVA; no es una nueva cotización.';
const producto = {
  id: productoId, categoria_id: requisito.categoria_id, descripcion: 'Heladera BOSCH KIN86ADD0 PANELABLE',
  codigo: 'KIN86ADD0', alias: 'Bosch, Heladera panelable K55', unidad_medida: requisito.unidad_medida || 'unidad',
  precio_unitario: precio.precio_unitario, moneda: precio.moneda, proveedor: precio.proveedor,
  proveedor_id: precio.proveedor_id, notas: nota, origen: 'manual', activo: true,
  es_requisito: false, producto_por_obra: false, variantes: [], variantes_precios: {},
};
const patch = {
  material_id: productoId, requisito_material_id: requisitoId, variante: null,
  producto_asignado_at: new Date().toISOString(), producto_asignacion_origen: 'asignacion_obra',
  especificaciones_origen: 'asignacion_obra', updated_at: new Date().toISOString(),
};
fs.mkdirSync(carpeta, { recursive: true });
fs.writeFileSync(`${carpeta}/antes-y-plan.json`, JSON.stringify({ requisito, obra, snapshots: anteriores, productos, precio, auditoria, producto, patch }, null, 2), { flag: 'wx' });
await leer(db.from('panol_materiales').insert(producto).select('id').single());
await leer(db.from('panol_requisito_productos').insert({ requisito_material_id: requisitoId, producto_material_id: productoId, variante_legacy: 'Heladera BOSCH KIN86ADD0 panelable', origen: 'manual', activo: true }).select('id').single());
await leer(db.from('panol_precios').insert({ material_id: productoId, precio_unitario: precio.precio_unitario, moneda: precio.moneda, fecha: precio.fecha, proveedor: precio.proveedor, proveedor_id: precio.proveedor_id, fuente: precio.fuente }).select('id').single());
const cambiadas = await leer(db.from('panol_obra_materiales_snapshot').update(patch)
  .eq('id', snapshotId).eq('updated_at', fila.updated_at).eq('material_id', requisitoId)
  .eq('requisito_material_id', requisitoId).eq('estado', 'pendiente')
  .is('purchase_request_id', null).is('panol_envio_id', null).select('*'));
assert.equal(cambiadas.length, 1, 'La obra cambió durante la reparación. El SKU quedó recuperado; revisar antes de asignarlo.');
await leer(db.from('panol_obra_materiales_snapshot_audit').insert({ snapshot_id: snapshotId, obra_id: obraId, material_id: productoId, descripcion: fila.descripcion, campo: 'producto_definido', valor_anterior: { material_id: requisitoId }, valor_nuevo: { material_id: productoId }, nota: 'A pedido del usuario se define Bosch KIN86ADD0 para 55-3. Se recupera la ficha de producto y compatibilidad; se conserva el requisito y el stock.', origen: 'correccion_catalogo', contexto: { reparacion: 'heladera-bosch-55-3-20261022' } }).select('id').single());
const [despues, sku, compatibles, requisitoDespues] = await Promise.all([
  leer(db.from('panol_obra_materiales_snapshot').select('*').eq('requisito_material_id', requisitoId).order('id')),
  leer(db.from('panol_materiales').select('*').eq('id', productoId).single()),
  leer(db.from('panol_requisito_productos').select('*').eq('requisito_material_id', requisitoId).eq('producto_material_id', productoId)),
  leer(db.from('panol_materiales').select('*').eq('id', requisitoId).single()),
]);
fs.writeFileSync(`${carpeta}/despues.json`, JSON.stringify({ snapshots: despues, sku, compatibles }, null, 2));
assert.deepEqual(requisitoDespues, requisito, 'El requisito genérico no debe cambiar.');
assert.equal(sku.es_requisito, false);
assert.equal(sku.activo, true);
assert.equal(compatibles.length, 1);
assert.equal(compatibles[0].activo, true);
assert.equal(despues.length, anteriores.length);
for (const previa of anteriores) {
  const actual = despues.find(s => s.id === previa.id);
  if (previa.id !== snapshotId) assert.deepEqual(actual, previa, 'No deben cambiar otros barcos.');
  else for (const key of Object.keys(previa)) if (!(key in patch)) assert.deepEqual(actual[key], previa[key], `Cambió ${key}`);
  assert.equal(rowDelta(actual), rowDelta(previa));
}
assert.equal(despues.find(s => s.id === snapshotId).material_id, productoId);
console.log(JSON.stringify({ reparado: true, obra: '55-3', producto: sku.descripcion, productoSeleccionable: sku.activo && !sku.es_requisito, compatibilidadRestablecida: true, otrasObrasSinCambios: true, stockSinCambios: true }));
