import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must, ACTOR } from '../tmp/jacuzzi-client.mjs';

const requestId = '353887b4-e3fb-4764-a417-c20a72ed94cc';
const projectId = 'dcc01fcd-fdb1-4f5d-8ea7-095a6551c560';
const title = 'Canal Electric · Factura B 00006-00120931 · 52-25 y stock';
const provider = 'Canal Electric';
const source = 'Canal Electric. Ticket-factura B 00006-00120931 del 17/11/2026.';
const invoice = [
  { model: '6910', code: 'METECTAP0003', description: 'Bastidor Cambre Mignon 6910', invoiceQuantity: 20, unitCents: 77651, requestItem: '7f41a030-c4bb-4496-9b48-ce819b7091a3' },
  { model: '4742', code: 'METECTAP0065', description: 'Tapa Cambre SXXII Mignon 4742, 2 módulos, gris', invoiceQuantity: 20, unitCents: 246942, requestItem: 'a13e9a78-f1f8-4733-aa54-f67645fdd6c5' },
  { model: '6111', code: 'METECTEC0084', description: 'Combinación Bauhaus 6111 gris', invoiceQuantity: 60, unitCents: 356915 },
  { model: '6121', code: 'METECTEC0086', description: 'Combinación Bauhaus 6121 doble gris', invoiceQuantity: 60, unitCents: 382462 },
];
const [request, items, existing, snapshots, catalog] = await Promise.all([
  must(admin.from('purchase_requests').select('*,project:produccion_obras(codigo,estado),creator:profiles!purchase_requests_created_by_fkey(username)').eq('id', requestId).single()),
  must(admin.from('purchase_request_items').select('*').eq('request_id', requestId)),
  must(admin.from('panol_envios').select('id,titulo').or('titulo.ilike.%120931%,observaciones.ilike.%120931%,purchase_request_id.eq.' + requestId)),
  must(admin.from('panol_obra_materiales_snapshot').select('id').or('purchase_request_id.eq.' + requestId + ',purchase_request_item_id.in.(' + invoice.filter(row => row.requestItem).map(row => row.requestItem).join(',') + ')')),
  must(admin.from('panol_materiales').select('id,codigo').in('codigo', invoice.flatMap(row => [row.model, row.code]))),
]);
assert.equal(request.title, '52-25 - Encargos bastidores y tapas Mignon');
assert.equal(request.creator.username, 'gaston.tec');
assert.equal(request.project.codigo, '52-25');
assert.equal(request.project.estado, 'activa');
assert.equal(request.project_id, projectId);
assert.equal(request.status, 'nuevo');
assert.equal(items.length, 2);
assert.ok(items.every(row => row.status === 'pendiente' && Number(row.quantity) === 8 && !row.material_id));
assert.equal(existing.length, 0, 'Ya existe un aviso para esta factura o pedido.');
assert.equal(snapshots.length, 0, 'El pedido ya tiene renglones en la lista de obra.');
assert.equal(catalog.length, 0, 'Hay una ficha que coincide con un código.');
const workCosts = invoice.filter(row => row.requestItem).map(row => {
  const requested = items.find(item => item.id === row.requestItem);
  assert.ok(requested);
  return { id: requested.id, actual_amount: row.unitCents * Number(requested.quantity) / 100 };
});
const totalCents = invoice.filter(row => row.requestItem).reduce((total, row) => total + row.unitCents * 8, 0);
assert.equal(totalCents, 2596744);
const grossInvoiceCents = 50854548;
const roundedLineCents = invoice.reduce((total, row) => total + row.unitCents * row.invoiceQuantity, 0);
assert.equal(grossInvoiceCents - roundedLineCents, 68);
const observations = [
  source,
  'Para 52-25, pedido de gaston.tec: 8 bastidores Mignon 6910 y 8 tapas Mignon 4742. ARS 25.967,44 según los precios unitarios impresos.',
  'Para stock general: 12 bastidores 6910, 12 tapas 4742, 60 combinaciones Bauhaus 6111 gris y 60 combinaciones Bauhaus 6121 doble gris.',
  'Total impreso de la factura ARS 508.545,48. Diferencia de ARS 0,68 al extender los precios unitarios impresos a las 160 unidades.',
].join('\n');

const dir = 'backups/canal-electric-120931-20261117';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/antes-y-plan.json', JSON.stringify({ request, items, invoice, workCosts, observations }, null, 2), { flag: 'wx' });
const log = row => fs.appendFileSync(dir + '/operacion.jsonl', JSON.stringify(row) + '\n');
const sb = await asPurchaseUser();
try {
  const payload = [];
  for (const row of invoice) {
    const product = await must(admin.from('panol_materiales').insert({
      categoria_id: '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c',
      descripcion: row.description, codigo: row.code, proveedor: provider, unidad_medida: 'unidad',
      precio_unitario: row.unitCents / 100, moneda: 'ARS', origen: 'compra', created_by: ACTOR,
      activo: true, notas: source + ' Modelo ' + row.model + '. Precio unitario impreso.',
    }).select('id').single());
    log({ material: product.id, codigo: row.code });
    const ordered = items.find(item => item.id === row.requestItem);
    if (ordered) {
      await must(sb.from('purchase_request_items').update({
        material_id: product.id, requisito_material_id: product.id, catalog_source: 'panol',
        supplier_name: provider, supplier_description: row.description, supplier_code: row.code,
      }).eq('id', ordered.id).eq('updated_at', ordered.updated_at).select('id').single());
      log({ itemVinculado: ordered.id, material: product.id });
    }
    const allocations = ordered
      ? [{ quantity: Number(ordered.quantity), ordered }, { quantity: row.invoiceQuantity - Number(ordered.quantity) }]
      : [{ quantity: row.invoiceQuantity }];
    for (const allocation of allocations) {
      const workItem = allocation.ordered;
      const obraId = workItem ? request.project_id : null;
      const snapshot = await must(sb.from('panol_obra_materiales_snapshot').insert({
        obra_id: obraId, descripcion: row.description, codigo: row.code, cantidad: allocation.quantity,
        unidad: 'unidad', material_id: product.id, requisito_material_id: product.id, proveedor: provider,
        source: workItem ? 'compra' : 'stock_general', estado: 'pendiente',
        tipo: workItem ? 'base' : 'stock_general', tipo_label: workItem ? 'Base' : 'Stock general',
        precio_unitario: row.unitCents / 100, moneda: 'ARS', stock_sede: 'Chubut',
        purchase_request_id: workItem ? requestId : null, purchase_request_item_id: workItem?.id ?? null,
        notas: source, es_adicional: false, created_by: ACTOR,
      }).select('id').single());
      log({ asignacion: snapshot.id, codigo: row.code, obraId, cantidad: allocation.quantity });
      payload.push({
        descripcion: row.description, codigo: row.code, cantidad: String(allocation.quantity), unidad: 'unidad',
        material_id: product.id, requisito_material_id: product.id, proveedor: provider, precio_unitario: row.unitCents / 100,
        moneda: 'ARS', obra_id: obraId, obra_snapshot_item_id: snapshot.id, purchase_request_item_id: workItem?.id ?? null,
        recepcion_estado: 'pendiente', es_adicional: false,
      });
    }
  }
  await must(sb.from('purchase_requests').update({ proveedor: provider }).eq('id', requestId).eq('status', 'nuevo').select('id').single());
  const bought = await must(sb.rpc('purchase_request_guardar_costos', {
    p_request_id: requestId, p_items: workCosts, p_actual_amount: totalCents / 100, p_confirmar: true,
  }));
  assert.equal(bought.request.status, 'comprado');
  assert.equal(Number(bought.request.actual_amount), totalCents / 100);
  log({ pedidoComprado: requestId, importe: bought.request.actual_amount });
  const noticeId = await must(sb.rpc('panol_crear_envio', {
    p_titulo: title, p_sede: 'Chubut', p_prioridad: request.priority, p_obra_id: null,
    p_destino: null, p_observaciones: observations, p_origen: 'compra', p_purchase_request_id: null, p_items: payload,
  }));
  log({ aviso: noticeId });
  await must(sb.from('panol_envios').update({ purchase_request_id: requestId }).eq('id', noticeId)
    .is('purchase_request_id', null).select('id').single());
  const workSnapshotIds = payload.filter(row => row.obra_id).map(row => row.obra_snapshot_item_id);
  const workUpdated = await must(sb.from('panol_obra_materiales_snapshot').update({ estado: 'comprado' })
    .in('id', workSnapshotIds).eq('panol_envio_id', noticeId).eq('recepcion_estado', 'pendiente').select('id'));
  assert.equal(workUpdated.length, 2);
  const [notice, allocations, purchased, orderItems] = await Promise.all([
    must(admin.from('panol_envios').select('id,titulo,sede,estado,obra_id,purchase_request_id,items:panol_envio_items(*)').eq('id', noticeId).single()),
    must(admin.from('panol_obra_materiales_snapshot').select('id,obra_id,estado,material_id,panol_envio_item_id,recepcion_estado,purchase_request_id').eq('panol_envio_id', noticeId)),
    must(admin.from('purchase_requests').select('id,status,actual_amount,proveedor').eq('id', requestId).single()),
    must(admin.from('purchase_request_items').select('id,actual_amount,status,material_id').eq('request_id', requestId)),
  ]);
  assert.equal(notice.sede, 'Chubut');
  assert.equal(notice.estado, 'enviado');
  assert.equal(notice.obra_id, null);
  assert.equal(notice.purchase_request_id, requestId);
  assert.equal(notice.items.length, 6);
  assert.equal(allocations.length, 6);
  assert.equal(purchased.status, 'comprado');
  assert.equal(Number(purchased.actual_amount), totalCents / 100);
  for (const row of notice.items) {
    const expected = payload.find(p => p.obra_snapshot_item_id === row.obra_snapshot_item_id);
    const allocation = allocations.find(a => a.id === row.obra_snapshot_item_id);
    assert.ok(expected && allocation);
    assert.equal(allocation.obra_id, expected.obra_id);
    assert.equal(allocation.purchase_request_id, expected.obra_id ? requestId : null);
    assert.equal(row.purchase_request_item_id, expected.purchase_request_item_id);
    assert.equal(row.material_id, expected.material_id);
    assert.equal(row.cantidad, expected.cantidad);
    assert.equal(row.estado, 'pendiente');
    assert.equal(row.cantidad_recibida, null);
    assert.equal(allocation.recepcion_estado, 'pendiente');
    assert.ok(['pendiente', 'pedido', 'comprado'].includes(allocation.estado));
    if (expected.purchase_request_item_id) {
      const ordered = orderItems.find(i => i.id === expected.purchase_request_item_id);
      assert.equal(Number(ordered.actual_amount), workCosts.find(i => i.id === ordered.id).actual_amount);
      assert.equal(ordered.material_id, expected.material_id);
    }
  }
  assert.equal(notice.items.filter(row => !row.purchase_request_item_id).reduce((sum, row) => sum + Number(row.cantidad), 0), 144);
  fs.writeFileSync(dir + '/verificado.json', JSON.stringify({ notice, allocations, purchased, orderItems }, null, 2));
  console.log(JSON.stringify({ noticeId, purchased, workQuantity: 16, stockQuantity: 144, grossInvoiceCents, roundingDifference: 68 }));
} finally {
  await sb.auth.signOut({ scope: 'local' });
}
