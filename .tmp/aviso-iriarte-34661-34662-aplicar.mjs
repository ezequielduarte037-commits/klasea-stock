import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must, ACTOR } from '../tmp/jacuzzi-client.mjs';

const source = JSON.parse(fs.readFileSync('.tmp/aviso-iriarte-34661-34662-live.json', 'utf8'));
const [ordered] = source.items;
const [requirement] = source.snapshots;
const dir = 'backups/iriarte-34661-34662-20261117';
const journalPath = dir + '/operacion.jsonl';
const resume = process.argv.includes('--resume');
const checkpoint = resume
  ? fs.readFileSync(journalPath, 'utf8').trim().split('\n').map(row => JSON.parse(row))
  : [];
const stockLines = [
  { doc: '34661', code: 'C 127 C 1/4 X 3/8', name: 'Racor codo 1/4" x 3/8" para manguera', quantity: 16, unitPrice: 9991.61 },
  { doc: '34661', code: 'C 1037-5 10X1/4', name: 'Niple 10 mm x 1/4" gas hembra', quantity: 16, unitPrice: 5845.61 },
  { doc: '34662', code: 'PX TEERAC1', name: 'Tee racor plástica de 1"', quantity: 12, unitPrice: 851.43 },
  { doc: '34662', code: 'PX TEERAC3/4', name: 'Tee racor plástica de 3/4"', quantity: 12, unitPrice: 369.87 },
  { doc: '34662', code: 'PX RAC1M', name: 'Racor rosca macho plástico de 1"', quantity: 12, unitPrice: 353.64, material: '85ca5b29-7008-4a34-a701-5406c399cc6b' },
  { doc: '34662', code: 'TO1"C', name: 'Toma pasacasco cromada de 1"', quantity: 6, unitPrice: 71671.33, material: '8b49cf46-7284-4bb5-a8d8-3116aaac60a9' },
  { doc: '34662', code: 'TO3/4C', name: 'Toma pasacasco cromada de 3/4"', quantity: 6, unitPrice: 61094.88, material: '6a26c134-4a30-4f7a-94ad-ca5cba930f5d' },
  { doc: '34662', code: 'C127 3/4X3/4 FU LR', name: 'Racor macho fundido 3/4" x 3/4" para manguera', quantity: 6, unitPrice: 14923.70, material: 'ea90e114-7151-4647-92cd-12a20126e289' },
];
const stockQuantity = stockLines.reduce((sum, line) => sum + line.quantity, 0);
assert.equal(stockQuantity, 86);
const filterNetCents = 17894130 + 1649520;
const filterGrossAmount = Math.floor((filterNetCents * 121 + 50) / 100) / 100;
assert.equal(filterGrossAmount, 236478.17);
const title = 'Casa Iriarte · 34661 y 34662 · filtros 52-27 y stock';
const observations = [
  'Casa Iriarte. Presupuestos 34661 y 34662 del 17/11/2026.',
  'Obra 52-27: 2 conjuntos de filtro Medium de 3/4" inoxidable con soporte plástico. Incluye 2 filtros y 2 soportes del 34662. Pedido de gaston.tec.',
  'Precio de los conjuntos según los renglones impresos: ARS 195.436,50 netos, ARS 236.478,17 con IVA 21%.',
  'Stock general Chubut: 8 renglones, 86 unidades. Precios unitarios impresos sin IVA.',
].join('\n');

const [purchase, item, snapshot, existing, linked, exactCodes, knownProducts] = await Promise.all([
  must(admin.from('purchase_requests').select('*').eq('id', source.order.id).single()),
  must(admin.from('purchase_request_items').select('*').eq('request_id', source.order.id)),
  must(admin.from('panol_obra_materiales_snapshot').select('*').eq('id', requirement.id).single()),
  must(admin.from('panol_envios').select('id,titulo').or('titulo.ilike.%34661%,titulo.ilike.%34662%,observaciones.ilike.%34661%,observaciones.ilike.%34662%,purchase_request_id.eq.' + source.order.id)),
  must(admin.from('panol_envio_items').select('id').eq('purchase_request_item_id', ordered.id)),
  must(admin.from('panol_materiales').select('id,codigo,descripcion,activo').in('codigo', stockLines.filter(l => !l.material).map(l => l.code))),
  must(admin.from('panol_materiales').select('id,descripcion,activo,es_requisito').in('id', stockLines.filter(l => l.material).map(l => l.material))),
]);
assert.equal(source.order.creator.username, 'gaston.tec');
assert.equal(source.order.project.codigo, '52-27');
assert.equal(purchase.status, resume ? 'comprado' : 'nuevo');
if (resume) {
  assert.ok(checkpoint.some(row => row.pedidoComprado === purchase.id && row.cost === filterGrossAmount));
  assert.equal(Number(purchase.actual_amount), filterGrossAmount);
}
assert.equal(purchase.project_id, snapshot.obra_id);
assert.equal(purchase.updated_at, source.order.updated_at);
assert.equal(item.length, 1);
assert.equal(item[0].id, ordered.id);
assert.equal(item[0].status, resume ? 'pedido' : 'pendiente');
if (resume) assert.equal(Number(item[0].actual_amount), filterGrossAmount);
assert.equal(item[0].updated_at, ordered.updated_at);
assert.equal(item[0].supplier_name, 'Iriarte');
assert.deepEqual(item[0].supplier_components.map(c => c.codigo), ['FAG-FIL-MED3/4INOX','FAG-REP-SOP.PL']);
assert.equal(Number(item[0].quantity), 2);
assert.equal(snapshot.purchase_request_item_id, ordered.id);
assert.equal(snapshot.panol_envio_item_id, null);
assert.equal(snapshot.material_id, ordered.material_id);
assert.equal(snapshot.estado, 'pedido');
assert.equal(existing.length, 0, 'Ya hay un aviso para estos presupuestos o el pedido.');
assert.equal(linked.length, 0, 'El renglón del pedido ya tiene aviso.');
assert.equal(exactCodes.length, resume ? 4 : 0, 'Cambió el catálogo de las fichas del aviso.');
assert.equal(knownProducts.length, 4);
assert.ok(knownProducts.every(p => p.activo && !p.es_requisito));

fs.mkdirSync(dir, { recursive: true });
if (!resume) fs.writeFileSync(dir + '/antes-y-plan.json', JSON.stringify({ purchase, item, snapshot, stockLines, stockQuantity, filterGrossAmount, observations }, null, 2), { flag: 'wx' });
const record = data => fs.appendFileSync(journalPath, JSON.stringify(data) + '\n');
const sb = await asPurchaseUser();
try {
  const stockPayload = [];
  for (const line of stockLines) {
    if (!line.material && resume) {
      const entry = checkpoint.find(row => row.code === line.code && row.material);
      assert.ok(entry && exactCodes.some(m => m.id === entry.material && m.codigo === line.code && m.activo));
      line.material = entry.material;
    } else if (!line.material) {
      const created = await must(admin.from('panol_materiales').insert({
        categoria_id: 'e8b74375-401e-4700-b6b2-bb32cedbfdfb',
        codigo: line.code, descripcion: line.name, proveedor: 'Iriarte', unidad_medida: 'unidad',
        precio_unitario: line.unitPrice, moneda: 'ARS', origen: 'compra',
        created_by: ACTOR, activo: true,
        notas: 'Casa Iriarte, presupuesto ' + line.doc + ' del 17/11/2026. Precio impreso sin IVA.',
      }).select('id').single());
      line.material = created.id;
      record({ material: created.id, code: line.code });
    }
    const priorStock = checkpoint.find(row => row.code === line.code && row.snapshot);
    assert.ok(!resume || priorStock);
    const stockSnapshot = resume
      ? await must(admin.from('panol_obra_materiales_snapshot').select('*').eq('id', priorStock.snapshot).single())
      : await must(sb.from('panol_obra_materiales_snapshot').insert({
      obra_id: null, material_id: line.material, requisito_material_id: line.material, descripcion: line.name,
      codigo: line.code, cantidad: line.quantity, unidad: 'unidad', proveedor: 'Iriarte',
      tipo: 'stock_general', tipo_label: 'Stock general', source: 'stock_general', estado: 'pendiente',
      stock_sede: 'Chubut', precio_unitario: line.unitPrice, moneda: 'ARS', es_adicional: false,
      created_by: ACTOR, notas: 'Casa Iriarte, presupuesto ' + line.doc + ' del 17/11/2026.',
    }).select('id').single());
    if (resume) {
      assert.equal(stockSnapshot.panol_envio_item_id, null);
      assert.equal(stockSnapshot.obra_id, null);
      assert.equal(stockSnapshot.material_id, line.material);
      assert.equal(Number(stockSnapshot.cantidad), line.quantity);
      assert.equal(stockSnapshot.estado, 'pendiente');
    } else record({ snapshot: stockSnapshot.id, code: line.code });
    stockPayload.push({
      descripcion: line.name, codigo: line.code, cantidad: String(line.quantity), unidad: 'unidad',
      material_id: line.material, requisito_material_id: line.material,
      proveedor: 'Iriarte', precio_unitario: line.unitPrice, moneda: 'ARS',
      obra_snapshot_item_id: stockSnapshot.id, recepcion_estado: 'pendiente', es_adicional: false,
    });
  }

  const saved = resume ? { request: purchase, items: item } : await must(sb.rpc('purchase_request_guardar_costos', {
    p_request_id: purchase.id, p_items: [{ id: ordered.id, actual_amount: filterGrossAmount }],
    p_actual_amount: filterGrossAmount, p_confirmar: true,
  }));
  assert.equal(saved.request.status, 'comprado');
  assert.equal(Number(saved.request.actual_amount), filterGrossAmount);
  assert.equal(Number(saved.items[0].actual_amount), filterGrossAmount);
  if (!resume) record({ pedidoComprado: saved.request.id, cost: filterGrossAmount });
  if (!saved.request.proveedor) {
    await must(sb.from('purchase_requests').update({ proveedor: 'Iriarte' }).eq('id', purchase.id)
      .eq('status', 'comprado').is('proveedor', null).select('id').single());
  }
  assert.equal(saved.items[0].status, 'pedido');
  const workPayload = {
    descripcion: 'Filtro de agua Medium inoxidable 3/4" con soporte plástico',
    cantidad: '2', unidad: 'unidad', material_id: ordered.material_id,
    requisito_material_id: ordered.requisito_material_id, obra_id: purchase.project_id,
    purchase_request_item_id: ordered.id, obra_snapshot_item_id: snapshot.id,
    proveedor: 'Iriarte', precio_unitario: filterGrossAmount / 2, moneda: 'ARS',
    recepcion_estado: 'pendiente', es_adicional: false,
  };
  const aviso = await must(sb.rpc('panol_crear_envio', {
    p_titulo: title, p_sede: 'Chubut', p_prioridad: purchase.priority,
    p_obra_id: null, p_destino: null, p_observaciones: observations, p_origen: 'compra',
    p_purchase_request_id: null, p_items: [workPayload, ...stockPayload],
  }));
  record({ aviso });
  await must(sb.from('panol_envios').update({ purchase_request_id: purchase.id }).eq('id', aviso)
    .is('purchase_request_id', null).select('id').single());
  await must(sb.from('panol_obra_materiales_snapshot').update({ estado: 'comprado' })
    .eq('id', snapshot.id).eq('panol_envio_id', aviso).eq('recepcion_estado', 'pendiente').select('id').single());

  const [verifiedNotice, verifiedRequest, verifiedItem, allocations] = await Promise.all([
    must(admin.from('panol_envios').select('id,titulo,sede,estado,obra_id,purchase_request_id,items:panol_envio_items(*)').eq('id', aviso).single()),
    must(admin.from('purchase_requests').select('id,status,actual_amount,proveedor').eq('id', purchase.id).single()),
    must(admin.from('purchase_request_items').select('id,status,actual_amount').eq('id', ordered.id).single()),
    must(admin.from('panol_obra_materiales_snapshot').select('id,obra_id,estado,cantidad,material_id,panol_envio_item_id,recepcion_estado,precio_unitario,purchase_request_id').eq('panol_envio_id', aviso)),
  ]);
  assert.equal(verifiedNotice.sede, 'Chubut');
  assert.equal(verifiedNotice.estado, 'enviado');
  assert.equal(verifiedNotice.obra_id, null);
  assert.equal(verifiedNotice.purchase_request_id, purchase.id);
  assert.equal(verifiedNotice.items.length, 9);
  assert.equal(allocations.length, 9);
  assert.equal(verifiedRequest.status, 'comprado');
  assert.equal(verifiedItem.status, 'pedido');
  assert.equal(Number(verifiedRequest.actual_amount), filterGrossAmount);
  assert.equal(Number(verifiedItem.actual_amount), filterGrossAmount);
  const fromOrder = verifiedNotice.items.filter(i => i.purchase_request_item_id);
  assert.equal(fromOrder.length, 1);
  assert.equal(fromOrder[0].purchase_request_item_id, ordered.id);
  assert.equal(fromOrder[0].obra_snapshot_item_id, snapshot.id);
  assert.equal(Number(fromOrder[0].cantidad), 2);
  assert.equal(Number(fromOrder[0].precio_unitario) * 2, filterGrossAmount);
  for (const receivedLine of verifiedNotice.items) {
    const allocation = allocations.find(a => a.id === receivedLine.obra_snapshot_item_id);
    const expected = receivedLine.purchase_request_item_id
      ? workPayload
      : stockPayload.find(l => l.obra_snapshot_item_id === receivedLine.obra_snapshot_item_id);
    assert.ok(expected && allocation);
    assert.equal(allocation.obra_id, expected.obra_id ?? null);
    assert.equal(allocation.purchase_request_id, expected.obra_id ? purchase.id : null);
    assert.equal(allocation.panol_envio_item_id, receivedLine.id);
    assert.equal(allocation.material_id, expected.material_id);
    assert.equal(receivedLine.material_id, expected.material_id);
    assert.equal(Number(receivedLine.cantidad), Number(expected.cantidad));
    assert.equal(receivedLine.estado, 'pendiente');
    assert.equal(receivedLine.cantidad_recibida, null);
    assert.ok(!['recibido', 'en_panol', 'parcial'].includes(allocation.estado));
    assert.equal(allocation.recepcion_estado, 'pendiente');
  }
  fs.writeFileSync(dir + '/verificado.json', JSON.stringify({ verifiedNotice, verifiedRequest, verifiedItem, allocations }, null, 2));
  console.log(JSON.stringify({ aviso, compra: verifiedRequest, paraObra: 2, renglonesStock: stockPayload.length, stockQuantity }));
} finally {
  await sb.auth.signOut({ scope: 'local' });
}
