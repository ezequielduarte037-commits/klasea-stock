import assert from 'node:assert/strict';
import { admin, asPurchaseUser, must, ACTOR } from '../tmp/jacuzzi-client.mjs';
const id = '2885f786-a62f-4614-baec-5723d9bc263e';
const envioId = 'c957c6d9-51dd-43cb-bac1-099735d55466';
const [item, notice, others] = await Promise.all([
  must(admin.from('panol_envio_items').select('*').eq('id',id).single()),
  must(admin.from('panol_envios').select('id,sede,obra_id,observaciones').eq('id',envioId).single()),
  must(admin.from('panol_obra_materiales_snapshot').select('id').eq('panol_envio_item_id',id)),
]);
assert.equal(item.envio_id, envioId);
assert.equal(item.obra_snapshot_item_id, null);
assert.equal(others.length, 0);
assert.equal(item.material_id,'2d98e85a-bde0-421c-a0f0-61697283eee1');
assert.equal(item.purchase_request_item_id, null);
assert.equal(notice.sede,'Chubut');
assert.equal(notice.obra_id, null);
assert.ok(notice.observaciones.includes('Stock general: 10.'));
assert.equal(Number(item.cantidad),10);
assert.ok(['pendiente','parcial','recibido'].includes(item.estado));
const qty = item.estado === 'pendiente' ? Number(item.cantidad) : Number(item.cantidad_recibida ?? item.cantidad);
assert.ok(qty > 0 && qty <= 10);
const sb = await asPurchaseUser();
try {
  const stock = await must(sb.from('panol_obra_materiales_snapshot').insert({
    obra_id: null, estado: 'pendiente', source:'stock_general', stock_sede: 'Chubut',
    tipo: 'stock_general', tipo_label: 'Stock general', codigo: item.codigo, descripcion: item.descripcion,
    material_id: item.material_id, requisito_material_id: item.material_id, cantidad: qty, unidad: item.unidad,
    proveedor: 'Trimer', created_by: ACTOR, es_adicional: false, notas: 'Orden de entrega 0000085732. Destino stock general Chubut.',
  }).select('id').single());
  console.log('Renglón de stock:', stock.id);
  const updated = await must(sb.from('panol_envio_items').update({obra_snapshot_item_id:stock.id})
    .eq('id',id).eq('estado',item.estado).is('obra_snapshot_item_id',null).select('id,estado').single());
  const verify = await must(admin.from('panol_obra_materiales_snapshot').select('obra_id,stock_sede,cantidad,estado,recepcion_estado,panol_envio_id,panol_envio_item_id').eq('id',stock.id).single());
  assert.equal(verify.panol_envio_item_id,id);
  assert.equal(verify.panol_envio_id,envioId);
  assert.equal(verify.obra_id,null);
  assert.equal(verify.stock_sede,'Chubut');
  assert.equal(updated.estado,item.estado);
  assert.equal(verify.recepcion_estado,item.estado);
  console.log(JSON.stringify(verify));
} finally {
  await sb.auth.signOut({scope:'local'});
}
