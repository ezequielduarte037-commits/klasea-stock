import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must } from '../tmp/jacuzzi-client.mjs';
const req = '943950cc-94fb-48a9-b83b-8ad5c30e878a', obra = '4e967f5d-4022-4f68-9ca5-9a6f280829f3';
const map = { '05c0ef33-2b07-48ee-8898-f6181561b357':'10bc4734-c11e-4632-8115-8771d0000ae5', '102f5b7e-2cd9-4bbf-928f-420b0bbe4313':'78e841d9-e30c-4925-9eed-ad6bd1818662', '418154fe-8d19-4545-9b07-63144a0cf475':'3dbdb692-9d5d-4777-b595-aac787eb3de7', '9d7fad21-0d7b-4fd2-9fe2-edc318a292b2':'45ba32d7-78a3-4567-8f6d-97de89ba10d8', 'e6d3898d-3723-4e3d-ac48-c689f8fde52b':'13b56993-e4cb-419c-ba86-d4381278b0dc' };
const [r, items, envios] = await Promise.all([
  must(admin.from('purchase_requests').select('*').eq('id', req).single()),
  must(admin.from('purchase_request_items').select('*').eq('request_id', req)),
  must(admin.from('panol_envios').select('id').eq('purchase_request_id', req)),
]);
assert.equal(r.status, 'comprado'); assert.equal(envios.length, 0); assert.equal(items.length, 5);
assert.ok(items.every(i => i.status === 'pedido' && map[i.id]));
const sb = await asPurchaseUser();
try {
  const aviso = await must(sb.rpc('panol_crear_envio', {
    p_titulo: r.title, p_sede: 'Chubut', p_prioridad: r.priority, p_obra_id: obra, p_destino: null,
    p_observaciones: 'Pedido de gaston.tec del 03/11. Pasado a comprado el 17/11 sin importe: los precios se cargan después.',
    p_origen: 'compra', p_purchase_request_id: req,
    p_items: items.map(i => ({ descripcion: i.description, codigo: null, cantidad: String(Number(i.quantity)), unidad: i.unit || 'unidad',
      obra_id: obra, material_id: i.material_id, requisito_material_id: i.requisito_material_id || i.material_id,
      especificaciones: {}, proveedor: i.supplier_name || null, recepcion_estado: 'pendiente',
      purchase_request_item_id: i.id, obra_snapshot_item_id: map[i.id], es_adicional: false })),
  }));
  fs.appendFileSync('backups/anodos-5224-943950-20261117/operacion.jsonl', JSON.stringify({ aviso }) + '\n');
  const upd = await must(sb.from('panol_obra_materiales_snapshot').update({ estado: 'comprado' })
    .eq('panol_envio_id', aviso).eq('recepcion_estado', 'pendiente').select('id'));
  const [n, snaps, its] = await Promise.all([
    must(admin.from('panol_envios').select('id,titulo,sede,estado,obra_id,purchase_request_id,items:panol_envio_items(id,descripcion,cantidad,estado,purchase_request_item_id,obra_snapshot_item_id,material_id)').eq('id', aviso).single()),
    must(admin.from('panol_obra_materiales_snapshot').select('id,descripcion,estado,cantidad,recepcion_estado,panol_envio_item_id,purchase_request_item_id,es_adicional').eq('panol_envio_id', aviso)),
    must(admin.from('purchase_request_items').select('id,status').eq('request_id', req)),
  ]);
  fs.writeFileSync('backups/anodos-5224-943950-20261117/verificado.json', JSON.stringify({ n, snaps, its }, null, 2));
  console.log(JSON.stringify({ aviso, actualizados: upd.length, envio: { ...n, items: n.items.map(x => [x.descripcion, x.cantidad, x.estado, !!x.purchase_request_item_id, x.obra_snapshot_item_id?.slice(0,8)]) }, snaps: snaps.map(s => [s.id.slice(0,8), s.descripcion, s.cantidad, s.estado, s.recepcion_estado, s.es_adicional]), its: its.map(i => i.status) }, null, 1));
} finally { await sb.auth.signOut({ scope: 'local' }); }
