import fs from 'node:fs';
import assert from 'node:assert/strict';
import {admin,must,asPurchaseUser,ACTOR} from '../tmp/jacuzzi-client.mjs';

const data=JSON.parse(fs.readFileSync('.tmp/aviso-85732-planilla.json','utf8'));
const local=JSON.parse(fs.readFileSync('.tmp/aviso-85732-live.json','utf8'));
const apply=process.argv.includes('--apply');
const backup='backups/ingreso-85732-20261117';
const orders={
  A:'9138b978-6f4a-48d1-bf4f-d4fbc58f65fa',
  B:'dc1d8635-459c-40bf-b2e0-764663a65386',
  C:'740c38e6-a07a-4721-a2c1-1e6f4aba0a0b',
  D:'2b84303c-63d7-417c-a199-c59784f2043b',
  E:'8066be1d-6e4a-4171-8755-c23b48ebe5de',
};
const products=[
  ['43 12V','Tablero Rule 43 para bomba de achique 12 V','6a0afd2f-71a1-4159-8cc4-16e15d26ad57',4,[['37-42',3],['37-43',1]]],
  ['31395-4012','Bomba de agua Jabsco PAR-MAX3 12 V · 3 GPM · 40 PSI','ca73afec-3c5d-4507-ae50-feb188081410',1,[['52-27',1,'J']]],
  ['14A','Bomba de achique Rule 3700 GPH 12 V','1cea6ed1-4dc2-4ec1-8da0-7cba5c9bfa1c',2,[['52-27',1,'C'],['52-23',1]]],
  ['10','Bomba de achique Rule 2000 GPH 12 V','895e8fc5-60e9-44bf-baeb-54dbe2c509bb',44,[['52-25',4,'A'],['52-27',4,'B'],['37-43',3],['37-44',2],['37-46',3],['52-23',4],['52-26',2],['52-28',4],['55-2',3],['55-3',3],['55-4',3],['55-5',3],['55-6',3],['55-7',3]]],
  ['35A','Flotante Rule-A-Matic 35A · 14 A','9f04de6f-b777-41f0-8876-40e62510d848',14,[['37-40',1],['37-41',1],['37-42',1],['37-43',3],['37-44',3],['52-23',1],['52-26',1],['52-27',1],['55-2',1],['55-4',1]]],
  ['37A','Flotante Rule SuperSwitch 37A · 20 A · rojo','d553e65c-1370-4101-a848-e71d52f864e5',1,[['52-25',1,'D']]],
  ['4187','Base de antena inoxidable Shakespeare 4187','2d98e85a-bde0-421c-a0f0-61697283eee1',14,[['52-25',1,'E'],['52-26',1],['52-27',1],['52-28',1],['STOCK',10]]],
];
const inputObras=new Map(local.obras.map(o=>[o.codigo,o]));
const byKey=(code,obra)=>data.matches.find(m=>m.code===code&&m.obra.codigo===obra&&(!['43 12V'].includes(code)||m.fila.id===products[0][2]));
const cells=products.flatMap(([code,,,,assign])=>assign.map(([obra])=>byKey(code,obra)).filter(Boolean));
const targetSnapshotIds=[...new Set(cells.flatMap(x=>[x.celda.snapshotId,x.celda.configuracionSnapshotId]).filter(Boolean))];
const knownRequests=local.requestItems.filter(i=>Object.values(orders).includes(i.id)||i.material_id===products[1][2]||i.material_id===products[5][2]);
const [prev,snapshots,pri,reqs,currentWorks,incoming]=await Promise.all([
  must(admin.from('panol_envios').select('id,titulo,estado,observaciones').or('titulo.ilike.%85732%,observaciones.ilike.%85732%')),
  must(admin.from('panol_obra_materiales_snapshot').select('*').in('id',targetSnapshotIds)),
  must(admin.from('purchase_request_items').select('*').in('id',knownRequests.map(i=>i.id))),
  must(admin.from('purchase_requests').select('id,title,created_by,project_id,status').in('id',[...new Set(knownRequests.map(i=>i.request_id))])),
  must(admin.from('produccion_obras').select('id,codigo,estado,solo_stock').in('id',[...new Set(cells.map(c=>c.obra.id))])),
  must(admin.from('panol_envio_items').select('id,estado,purchase_request_item_id,envio_id,panol_envios!inner(estado)').in('purchase_request_item_id',knownRequests.map(i=>i.id))),
]);
assert.equal(prev.length,0,'Ya hay avisos de esta orden; revisar antes de duplicarlos.');
assert.ok(currentWorks.every(o=>o.estado==='activa'&&!o.solo_stock));
const jabscoSnapshot=snapshots.find(s=>s.id===byKey('31395-4012','52-27').celda.snapshotId);
orders.J=jabscoSnapshot.purchase_request_item_id;
assert.ok(orders.J,'El pedido Jabsco debe coincidir con el que ya está asociado a la planilla.');
const plan=products.map(([code,desc,mat,total,assign])=>{
  const lines=assign.map(([obra,qty,order])=>{
    if(obra==='STOCK')return {obra,qty,material:mat,requisito:mat};
    const cell=byKey(code,obra);
    assert.ok(cell && cell.celda.pendiente>=qty&&!cell.celda.avisoPendiente,code+' '+obra+' no está disponible');
    const existing=snapshots.find(s=>s.id===cell.celda.snapshotId);
    const requestItem=order?pri.find(i=>i.id===orders[order]):null;
    const request=requestItem?reqs.find(r=>r.id===requestItem.request_id):null;
    if(order){
      assert.ok(request&&request.created_by===local.profiles.find(x=>x.username==='gaston.tec').id);
      assert.ok(!['recibido','cancelado'].includes(request.status)&&['pendiente','pedido','comprado'].includes(requestItem.status));
      assert.equal(request.project_id,cell.obra.id);
      assert.equal(requestItem.material_id,mat);
      assert.equal(Number(requestItem.quantity),qty);
      assert.equal(existing?.purchase_request_item_id,requestItem.id);
      assert.equal(Number(existing?.cantidad),qty);
      assert.ok(!incoming.some(i=>i.purchase_request_item_id===requestItem.id && !['rechazado','falta_stock'].includes(i.estado) && !['cancelado','anulado'].includes(i.panol_envios.estado)));
    } else {
      assert.ok(!existing?.purchase_request_id&&!existing?.purchase_request_item_id,code+' '+obra+' ya tiene otro pedido vinculado');
    }
    if(existing) {
      assert.equal(existing.panol_envio_item_id,null);
      assert.ok(['pendiente','pedido','comprado'].includes(existing.estado));
      assert.ok([cell.celda.requisitoId,mat].includes(existing.requisito_material_id||existing.material_id));
      assert.ok([cell.celda.requisitoId,mat].includes(existing.material_id));
    }
    return {obra,qty,obraId:cell.obra.id,material:mat,requisito:cell.celda.requisitoId,
      snapshotId:existing&&Number(existing.cantidad)===qty?existing.id:null, baseSnapshot:existing?.id||null,
      req:request?.id||null, requestItem:requestItem?.id||null};
  });
  assert.equal(lines.reduce((sum,x)=>sum+x.qty,0),total,code);
  const firstOrder=lines.find(x=>x.req);
  const primary=code==='10'?lines[1]:firstOrder||lines[0];
  return {code,desc,total,lines,primaryRequest:primary?.req||null,primaryObra:primary?.obraId||null};
});
assert.equal(plan.find(x=>x.code==='10').lines.filter(x=>!x.req).reduce((s,x)=>s+x.qty,0),36);
console.log(JSON.stringify(plan.map(p=>[p.code,p.total,p.lines.map(x=>[x.obra,x.qty,x.requestItem?'pedido Gastón':x.snapshotId?'obra':'obra, renglón por crear'])]),null,2));
const unlinked=pri.filter(i=>['pendiente','pedido','comprado'].includes(i.status)&&!plan.some(p=>p.lines.some(l=>l.requestItem===i.id)));
console.log('Pedidos que siguen abiertos:',unlinked.map(i=>[i.id,i.description,reqs.find(r=>r.id===i.request_id)?.title]));
if(apply){
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(backup+'/antes-y-plan.json',JSON.stringify({plan,snapshots,pri,reqs},null,2),{flag:'wx'});
const sb=await asPurchaseUser();
const results=[];
for(const p of plan){
  const uniqueReqs=[...new Set(p.lines.map(x=>x.req).filter(Boolean))];
  const singleReq=!p.lines.some(x=>!x.req)&&uniqueReqs.length===1?uniqueReqs[0]:null;
  const obras=p.lines.filter(x=>x.obraId).map(x=>x.obra+' × '+x.qty);
  const stock=p.lines.find(x=>!x.obraId)?.qty||0;
  const observations=[
    'Trimer · Orden de entrega 0000085732 del 17/11/2026 · Código '+p.code+'. Total: '+p.total+' unidad(es).',
    obras.length?'Obras: '+obras.join(', ')+'.':null,
    stock?'Stock general: '+stock+'.':null,
    p.code==='10'?'8 unidades para pedidos de gaston.tec (4 para 52-25 y 4 para 52-27) y 36 unidades adicionales para faltantes de obras.':null,
  ].filter(Boolean).join('\n');
  const title=p.desc+' · OE 85732';
  const byTitle=await must(admin.from('panol_envios').select('id').eq('titulo',title));
  assert.equal(byTitle.length,0,'Aviso ya creado: '+title);
  const items=[];
  for(const l of p.lines){
    let sid=l.snapshotId;
    if(l.obraId&&!sid){
      const ref=snapshots.find(s=>s.id===l.baseSnapshot);
      const inserted=await must(sb.from('panol_obra_materiales_snapshot').insert({obra_id:l.obraId,material_id:l.material,
        requisito_material_id:l.requisito,descripcion:p.desc,codigo:p.code,cantidad:l.qty,unidad:'unidad',
        proveedor:'Trimer',source:'matriz',estado:'pendiente',es_adicional:false,created_by:ACTOR,
        tipo:ref?.tipo||'variable',tipo_label:ref?.tipo_label||'Variable',notas:'Asignación de la orden de entrega 0000085732.'}).select('*').single());
      sid=inserted.id;
      fs.appendFileSync(backup+'/registro.jsonl',JSON.stringify({newSnapshot:sid,code:p.code,obra:l.obra})+'\n');
    } else if(sid&&l.requisito!==l.material&&snapshots.find(s=>s.id===sid)?.material_id!==l.material){
      await must(sb.rpc('panol_asignar_producto_snapshot',{p_snapshot_id:sid,p_producto_material_id:l.material,p_origen:'panol'}));
      fs.appendFileSync(backup+'/registro.jsonl',JSON.stringify({assignedProduct:sid,code:p.code,obra:l.obra})+'\n');
    }
    items.push({descripcion:p.desc,codigo:p.code,cantidad:String(l.qty),unidad:'unidad',obra_id:l.obraId||null,
      material_id:l.material,requisito_material_id:l.requisito,proveedor:'Trimer',recepcion_estado:'pendiente',
      purchase_request_item_id:l.requestItem||null,obra_snapshot_item_id:sid||null,es_adicional:false});
  }
  const id=await must(sb.rpc('panol_crear_envio',{p_titulo:title,p_sede:'Chubut',p_prioridad:'media',
    p_obra_id:items.every(i=>i.obra_id&&i.obra_id===items[0].obra_id)?p.primaryObra:null,
    p_destino:null,p_observaciones:observations,p_origen:p.primaryRequest?'compra':'obra_matriz',
    p_purchase_request_id:singleReq,p_items:items}));
  fs.appendFileSync(backup+'/registro.jsonl',JSON.stringify({id,code:p.code,title})+'\n');
  if(p.primaryRequest&&!singleReq){
    const updated=await must(sb.from('panol_envios').update({purchase_request_id:p.primaryRequest}).eq('id',id).is('purchase_request_id',null).select('id').single());
    assert.equal(updated.id,id);
  }
  const soleWorks=items.filter(i=>!i.purchase_request_item_id&&i.obra_snapshot_item_id).map(i=>i.obra_snapshot_item_id);
  if(soleWorks.length){
    const updated=await must(sb.from('panol_obra_materiales_snapshot').update({estado:'comprado'}).eq('panol_envio_id',id)
      .eq('recepcion_estado','pendiente').in('estado',['pendiente','pedido','comprado']).in('id',soleWorks).select('id'));
    assert.equal(updated.length,soleWorks.length,'No todos los renglones de obra quedaron Comprado');
  }
  const result=await must(admin.from('panol_envios').select('id,titulo,sede,estado,purchase_request_id,items:panol_envio_items(id,material_id,requisito_material_id,codigo,cantidad,estado,cantidad_recibida,purchase_request_item_id,obra_snapshot_item_id)').eq('id',id).single());
  assert.equal(result.items.length,items.length);
  assert.equal(result.items.reduce((s,x)=>s+Number(x.cantidad),0),p.total);
  assert.equal(result.purchase_request_id,p.primaryRequest);
  assert.equal(result.sede,'Chubut');assert.equal(result.estado,'enviado');
  for(const row of items){
    const candidates=result.items.filter(x=>x.obra_snapshot_item_id===row.obra_snapshot_item_id&&x.purchase_request_item_id===row.purchase_request_item_id);
    assert.equal(candidates.length,1);
    const [saved]=candidates;
    assert.equal(saved.material_id,row.material_id);
    if(row.obra_snapshot_item_id)assert.equal(saved.requisito_material_id,row.requisito_material_id);
    assert.equal(saved.cantidad,row.cantidad);
    assert.equal(saved.estado,'pendiente');assert.equal(saved.cantidad_recibida,null);
  }
  results.push(result);
  fs.writeFileSync(backup+'/avisos-verificados.json',JSON.stringify(results,null,2));
  console.log('Guardado y verificado:',p.code,id);
}
await sb.auth.signOut({scope:'local'});
}
