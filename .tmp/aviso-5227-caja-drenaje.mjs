import assert from 'node:assert/strict';
import { admin, asPurchaseUser, must } from '../tmp/jacuzzi-client.mjs';

const requestId = 'ce2c856c-dba0-42f4-9bc2-9c8ee5f2f62a';
const title = '52-27 · Caja drenaje ducha 800GPH · Rule';
const [request, items, snapshots, notices] = await Promise.all([
  must(admin.from('purchase_requests').select('id,title,status,project_id,priority,creator:profiles!purchase_requests_created_by_fkey(username),project:produccion_obras(codigo,estado)').eq('id', requestId).single()),
  must(admin.from('purchase_request_items').select('*').eq('request_id', requestId)),
  must(admin.from('panol_obra_materiales_snapshot').select('*').eq('purchase_request_id', requestId)),
  must(admin.from('panol_envios').select('id,titulo,estado').eq('purchase_request_id', requestId)),
]);
assert.equal(request.title, title);
assert.equal(request.creator.username, 'gaston.tec');
assert.equal(request.project.codigo, '52-27');
assert.equal(request.project.estado, 'activa');
assert.equal(request.status, 'nuevo');
assert.equal(items.length, 1);
const [item] = items;
assert.equal(item.id, 'e0d524fb-3ef8-4230-8445-7b4c49e41245');
assert.equal(item.status, 'pendiente');
assert.equal(Number(item.quantity), 2);
assert.equal(item.material_id, '183a1a53-1ca8-4ded-be4e-ee964a2a8dcb');
assert.equal(item.supplier_name, 'Trimer');
const rows = snapshots.filter(s => s.purchase_request_item_id === item.id);
assert.equal(rows.length, 1);
const [workLine] = rows;
assert.equal(workLine.obra_id, request.project_id);
assert.equal(workLine.material_id, item.material_id);
assert.equal(Number(workLine.cantidad), 2);
assert.equal(workLine.panol_envio_item_id, null);
const [itemNotices, workRequirements, workMaterialNotices] = await Promise.all([
  must(admin.from('panol_envio_items').select('id,envio_id,estado').eq('purchase_request_item_id', item.id)),
  must(admin.from('panol_obra_materiales_snapshot').select('id,estado,recepcion_estado,panol_envio_id,panol_envio_item_id').eq('obra_id', request.project_id).or('material_id.eq.' + item.material_id + ',requisito_material_id.eq.' + item.requisito_material_id)),
  must(admin.from('panol_envios').select('id,titulo,estado,items:panol_envio_items!inner(estado,material_id)').eq('obra_id', request.project_id).eq('items.material_id', item.material_id)),
]);
assert.equal(notices.length, 0, 'El pedido ya tiene aviso de ingreso.');
assert.equal(itemNotices.length, 0, 'El ítem del pedido ya tiene aviso de ingreso.');
assert.ok(!workRequirements.some(row => row.panol_envio_item_id && !['rechazado','recibido','parcial'].includes(row.recepcion_estado)));
assert.ok(!workMaterialNotices.some(n => !['cancelado','anulado'].includes(n.estado) && n.items.some(row => row.estado === 'pendiente')));
console.log(JSON.stringify({request: request.id, requestStatus: request.status, qty: item.quantity, itemStatus: item.status, workStatus: workLine.estado, priority: request.priority}));

if (process.argv.includes('--apply')) {
  const sb = await asPurchaseUser();
  try {
    const noticeId = await must(sb.rpc('panol_crear_envio', {
      p_titulo: title,
      p_sede: 'Chubut',
      p_prioridad: request.priority,
      p_obra_id: request.project_id,
      p_destino: null,
      p_observaciones: 'Trimer. 2 cajas de drenaje de ducha Rule de 800 GPH para la obra 52-27, según pedido de gaston.tec.',
      p_origen: 'compra',
      p_purchase_request_id: request.id,
      p_items: [{
        descripcion: item.description, cantidad: String(item.quantity), unidad: item.unit || 'unidad',
        obra_id: request.project_id, material_id: item.material_id,
        requisito_material_id: item.requisito_material_id, proveedor: item.supplier_name,
        purchase_request_item_id: item.id, obra_snapshot_item_id: workLine.id, recepcion_estado: 'pendiente',
      }],
    }));
    console.log('Aviso creado:', noticeId);
    const [notice, updatedRequest, updatedItem, updatedWorkLine] = await Promise.all([
      must(admin.from('panol_envios').select('id,estado,sede,obra_id,purchase_request_id,items:panol_envio_items(id,estado,cantidad,cantidad_recibida,material_id,purchase_request_item_id,obra_snapshot_item_id)').eq('id', noticeId).single()),
      must(admin.from('purchase_requests').select('status').eq('id', request.id).single()),
      must(admin.from('purchase_request_items').select('status').eq('id', item.id).single()),
      must(admin.from('panol_obra_materiales_snapshot').select('estado,panol_envio_id,panol_envio_item_id,recepcion_estado').eq('id', workLine.id).single()),
    ]);
    assert.equal(notice.estado, 'enviado');
    assert.equal(notice.sede, 'Chubut');
    assert.equal(notice.obra_id, request.project_id);
    assert.equal(notice.purchase_request_id, request.id);
    assert.equal(notice.items.length, 1);
    const [line] = notice.items;
    assert.equal(Number(line.cantidad), 2);
    assert.equal(line.cantidad_recibida, null);
    assert.equal(line.estado, 'pendiente');
    assert.equal(line.material_id, item.material_id);
    assert.equal(line.purchase_request_item_id, item.id);
    assert.equal(line.obra_snapshot_item_id, workLine.id);
    assert.equal(updatedWorkLine.panol_envio_id, noticeId);
    assert.equal(updatedWorkLine.panol_envio_item_id, line.id);
    assert.equal(updatedWorkLine.recepcion_estado, 'pendiente');
    assert.equal(updatedWorkLine.estado, workLine.estado);
    assert.equal(updatedRequest.status, request.status);
    assert.equal(updatedItem.status, item.status);
    console.log(JSON.stringify({ notice, requestStatus: updatedRequest.status, itemStatus: updatedItem.status, workStatus: updatedWorkLine.estado }));
  } finally {
    await sb.auth.signOut({ scope: 'local' });
  }
}
