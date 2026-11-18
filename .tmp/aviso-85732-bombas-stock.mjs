import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, must, ACTOR } from '../tmp/jacuzzi-client.mjs';

const dir = 'backups/ingreso-85732-20261117';
const original = JSON.parse(fs.readFileSync(dir + '/antes-y-plan.json', 'utf8'));
const saved = JSON.parse(fs.readFileSync(dir + '/avisos-verificados.json', 'utf8'));
const destinations = new Set(['52-23', '55-2']);
const codes = ['10', '14A'];
const plans = original.plan.filter(p => codes.includes(p.code)).map(p => {
  const notice = saved.find(n => n.items[0]?.codigo === p.code);
  assert.ok(notice);
  return { ...p, id: notice.id, movements: p.lines.filter(l => destinations.has(l.obra)).map(line => {
    const item = notice.items.find(it => it.obra_snapshot_item_id === line.snapshotId);
    const originalSnapshot = original.snapshots.find(s => s.id === line.snapshotId);
    assert.ok(item && originalSnapshot && !item.purchase_request_item_id);
    return { line, item, originalSnapshot };
  }) };
});
assert.deepEqual(plans.map(p => [p.code, p.movements.reduce((qty, m) => qty + m.line.qty, 0)]).sort(), [['10', 7], ['14A', 1]]);
const targetSnapshotIds = plans.flatMap(p => p.movements.map(m => m.line.snapshotId));
const noticeIds = plans.map(p => p.id);
const [notices, items, snapshots] = await Promise.all([
  must(admin.from('panol_envios').select('*').in('id', noticeIds)),
  must(admin.from('panol_envio_items').select('*').in('envio_id', noticeIds)),
  must(admin.from('panol_obra_materiales_snapshot').select('*').in('id', targetSnapshotIds)),
]);
for (const plan of plans) {
  const notice = notices.find(n => n.id === plan.id);
  assert.ok(notice && notice.sede === 'Chubut' && notice.obra_id === null && notice.titulo.endsWith('OE 85732'));
  const rows = items.filter(i => i.envio_id === notice.id);
  assert.equal(rows.reduce((qty, i) => qty + Number(i.cantidad), 0), plan.total);
  for (const { line, item, originalSnapshot } of plan.movements) {
    const current = rows.find(i => i.id === item.id);
    assert.ok(current && current.estado === 'pendiente' && current.cantidad_recibida === null);
    assert.equal(Number(current.cantidad), line.qty);
    assert.equal(current.obra_snapshot_item_id, line.snapshotId);
    assert.equal(current.purchase_request_item_id, null);
    assert.equal(current.material_id, line.material);
    const matrix = snapshots.find(s => s.id === line.snapshotId);
    assert.ok(matrix && matrix.obra_id === line.obraId && matrix.panol_envio_id === notice.id);
    assert.ok(matrix.estado === 'comprado' && matrix.recepcion_estado === 'pendiente' && matrix.panol_envio_item_id === item.id);
    assert.equal(matrix.recepcion_cantidad_recibida, null);
    assert.equal(matrix.source, originalSnapshot.source);
  }
}

if (process.argv.includes('--apply')) {
  fs.writeFileSync(dir + '/antes-bombas-a-stock.json', JSON.stringify({ notices, items, snapshots }, null, 2), { flag: 'wx' });
  const journal = (record) => fs.appendFileSync(dir + '/bombas-a-stock.jsonl', JSON.stringify(record) + '\n');
  for (const plan of plans) {
    for (const { line, item, originalSnapshot } of plan.movements) {
      const updated = items.find(i => i.id === item.id);
      const stock = await must(admin.from('panol_obra_materiales_snapshot').insert({
        obra_id: null, material_id: line.material, requisito_material_id: line.requisito,
        codigo: updated.codigo, descripcion: updated.descripcion, cantidad: line.qty, unidad: updated.unidad,
        proveedor: 'Trimer', tipo: 'stock_general', tipo_label: 'Stock general', source: 'stock_general',
        estado: 'comprado', stock_sede: 'Chubut', es_adicional: false, created_by: ACTOR,
        notas: 'Orden 0000085732. Reasignado a stock general desde ' + line.obra + '.',
      }).select('id').single());
      journal({ step: 'stock creado', snapshot: stock.id, item: item.id, obra: line.obra });
      await must(admin.from('panol_envio_items').update({ obra_snapshot_item_id: stock.id })
        .eq('id', item.id).eq('envio_id', plan.id).eq('estado', 'pendiente').is('cantidad_recibida', null)
        .eq('obra_snapshot_item_id', line.snapshotId).select('id').single());
      journal({ step: 'aviso reasignado', snapshot: stock.id, item: item.id });
      const currentStock = await must(admin.from('panol_obra_materiales_snapshot').select('*').eq('id', stock.id).single());
      assert.equal(currentStock.obra_id, null);
      assert.equal(currentStock.panol_envio_item_id, item.id);
      assert.equal(currentStock.panol_envio_id, plan.id);
      assert.equal(Number(currentStock.cantidad), line.qty);
      assert.equal(currentStock.recepcion_estado, 'pendiente');
      const restoreFields = [
        'material_id', 'requisito_material_id', 'estado', 'recepcion_estado', 'recepcion_cantidad_recibida',
        'recepcion_nota', 'recepcion_updated_at', 'stock_sede', 'stock_nota', 'panol_envio_id', 'panol_envio_item_id',
        'producto_asignado_at', 'producto_asignado_por', 'producto_asignacion_origen',
      ];
      const restore = Object.fromEntries(restoreFields.map(k => [k, originalSnapshot[k]]));
      const restored = await must(admin.from('panol_obra_materiales_snapshot').update(restore)
        .eq('id', line.snapshotId).eq('panol_envio_item_id', item.id).eq('recepcion_estado', 'pendiente')
        .select('id,obra_id,estado,panol_envio_item_id').single());
      assert.equal(restored.obra_id, line.obraId);
      assert.equal(restored.estado, originalSnapshot.estado);
      assert.equal(restored.panol_envio_item_id, null);
      journal({ step: 'requerimiento restaurado', snapshot: restored.id });
    }
    const stockQty = plan.movements.reduce((qty, m) => qty + m.line.qty, 0);
    const remaining = plan.lines.filter(l => !destinations.has(l.obra));
    const oldNotice = notices.find(n => n.id === plan.id);
    const observations = [
      oldNotice.observaciones.split('\n')[0],
      'Obras: ' + remaining.map(l => l.obra + ' × ' + l.qty).join(', ') + '.',
      'Stock general: ' + stockQty + '.',
      plan.code === '10' ? '8 unidades para pedidos de gaston.tec (4 para 52-25 y 4 para 52-27), 29 para otros faltantes de obras y 7 para stock general.' : null,
    ].filter(Boolean).join('\n');
    await must(admin.from('panol_envios').update({ observaciones: observations }).eq('id', plan.id)
      .eq('observaciones', oldNotice.observaciones).select('id').single());
    const after = await must(admin.from('panol_envio_items').select('*').eq('envio_id', plan.id));
    assert.equal(after.length, items.filter(i => i.envio_id === plan.id).length);
    assert.equal(after.reduce((qty, i) => qty + Number(i.cantidad), 0), plan.total);
    const movingIds = new Set(plan.movements.map(m => m.item.id));
    for (const unchanged of items.filter(i => i.envio_id === plan.id && !movingIds.has(i.id))) {
      assert.deepEqual(after.find(i => i.id === unchanged.id), unchanged);
    }
    console.log(JSON.stringify({ aviso: plan.id, codigo: plan.code, aStock: stockQty, total: plan.total }));
  }
} else {
  console.log(JSON.stringify(plans.map(p => ({ aviso: p.id, codigo: p.code, pendientes: p.movements.map(m => m.line) }))));
}
