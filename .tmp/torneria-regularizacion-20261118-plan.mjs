import assert from 'node:assert/strict';
import fs from 'node:fs';

const d=JSON.parse(fs.readFileSync('.tmp/torneria-regularizacion-20261118-live.json'));
const specs={
  '52-27':['brida_limera','cano_limera','palma_pata','brida_escape','tubo_bocina','bulones_manchon'],
  '52-28':['brida_limera','cano_limera','palma_pata','brida_escape','tubo_bocina','bulones_manchon'],
  '55-6':['palma_pata'],
};
const expectedOps={
  brida_limera:'limera_brida_t1',cano_limera:'limera_cano_t1',palma_pata:'pata_palma_t1',
  brida_escape:'escape_t1',tubo_bocina:'bocina_t1',bulones_manchon:'manchon_t1',
};
const plan=[];
for (const [obra,keys] of Object.entries(specs)) {
  const work=d.obras.find(o=>o.codigo===obra);
  const process=d.procs.find(p=>p.obra_id===work.id);
  for (const key of keys) {
    const item=d.items.find(i=>i.clave===key&&i.proceso_id===process.id&&i.activo);
    const operation=d.ops.find(o=>o.proceso_id===process.id&&o.clave===expectedOps[key]);
    const component=d.components.find(c=>c.item_id===item.id&&c.operacion_id===operation.id);
    assert.ok(item && operation?.activa && component && operation.destino==='Torneria' && !item.es_resultado && !item.no_lleva);
    assert.equal(component.cantidad_enviada,0);
    assert.equal(component.cantidad_recibida,0);
    const linked=d.ledger.find(s=>item.purchase_request_item_id&&s.purchase_request_item_id===item.purchase_request_item_id);
    const received = key==='tubo_bocina'
      ? d.ledger.find(s=>s.obra_id===work.id&&s.material_id===item.material_id&&s.source==='manual'&&s.recepcion_estado==='recibido')
      : null;
    const notice=linked&&d.panolItems.find(r=>r.id===linked.panol_envio_item_id);
    const receivedNotice=received&&d.panolItems.find(r=>r.id===received.panol_envio_item_id);
    const mode=key==='bulones_manchon'?'directo':received?'reutilizar':'recibir';
    if(mode==='directo') assert.ok(!linked && operation.origen==='Proveedor' && component.cantidad_requerida===1 && item.cantidad===12);
    else {
      assert.equal(operation.origen,'Astillero');
      assert.ok(notice && notice.estado==='pendiente' && notice.envio.sede==='Chubut' && linked.material_id===item.material_id);
      assert.equal(Number(notice.cantidad),item.cantidad);
    }
    if (mode==='reutilizar') {
      assert.ok(receivedNotice && receivedNotice.estado==='recibido' && receivedNotice.envio.titulo==='Tubos de bocina K52' && receivedNotice.envio.sede==='Chubut');
      assert.equal(received.cantidad,item.cantidad);
    }
    plan.push({
      obra:work.codigo, obraId:work.id, itemId:item.id, description:item.descripcion, opId:operation.id, componentId:component.id,
      materialId:item.material_id, purchaseItemId:item.purchase_request_item_id, purchaseId:item.purchase_request_id,
      mode, quantity:item.cantidad, operationQuantity:component.cantidad_requerida, plannedSnapshot:linked?.id??null,
      pendingNoticeItem:notice?.id??null, physicalSnapshot:(received||linked)?.id??null, receivedNotice:receivedNotice?.id??null,
    });
  }
}
assert.deepEqual(Object.fromEntries(['recibir','reutilizar','directo'].map(mode=>[mode,plan.filter(p=>p.mode===mode).length])),{recibir:9,reutilizar:2,directo:2});
const dir='backups/torneria-regularizacion-20261118';
fs.mkdirSync(dir,{recursive:true});
if (!fs.existsSync(dir+'/antes-y-plan.json')) fs.writeFileSync(dir+'/antes-y-plan.json',JSON.stringify({plan,estado:d},null,2),{flag:'wx'});
fs.writeFileSync('.tmp/torneria-regularizacion-20261118-plan.json',JSON.stringify(plan,null,2));
const cols=['obra','obraId','itemId','description','opId','componentId','materialId','purchaseItemId','purchaseId','mode','quantity','operationQuantity','plannedSnapshot','pendingNoticeItem','physicalSnapshot','receivedNotice'];
const sqlValue=x=>x==null?'null':typeof x==='number'?String(x):"'"+x.replaceAll("'","''")+"'";
fs.writeFileSync('.tmp/torneria-regularizacion-20261118-valores.sql',
  'insert into t_regularizar values\n'+plan.map(p=>'('+cols.map(k=>sqlValue(p[k])).join(',')+')').join(',\n')+';\n');
console.log(plan.map(p=>[p.obra,p.description,p.quantity,p.operationQuantity,p.mode].join(' | ')).join('\n'));
