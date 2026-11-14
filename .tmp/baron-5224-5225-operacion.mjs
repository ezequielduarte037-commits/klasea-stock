import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {db,read,pages} from './baron3746-rest.mjs';
const {focus,catalog,allObras}=JSON.parse(readFileSync('.tmp/baron-5224-5225-stock.json'));
const expected=focus.filter(i=>i.requestDate.startsWith('2026-11-12')||i.request_id==='c938eaad-10c6-4df3-8ef1-72cbc0ba6d2f');
assert.equal(expected.length,12);
const originals=[...new Set(expected.map(i=>i.request_id))];
const mids=[...new Set(expected.map(i=>i.material_id))];
const oids=allObras.filter(o=>['52-24','52-25'].includes(o.codigo)).map(o=>o.id);
const now=new Date().toISOString();
const file='.tmp/baron-5224-5225-operacion.json';
const stock=async(id,oid=null)=>Number(await read(db.rpc('panol_stock_disponible_ubicacion',{p_material_id:id,p_sede:'Chubut',p_obra_id:oid})));
const exact=async(q,n)=>{const a=await read(q);assert.equal(a.length,n);return a;};
const load=async()=>Promise.all([
 read(db.from('purchase_requests').select('*,purchase_request_items(*)').in('id',originals)),
 pages(()=>db.from('panol_obra_materiales_snapshot').select('*').in('material_id',mids)),
 pages(()=>db.from('panol_envio_items').select('*,envio:panol_envios(id,estado,origen,obra_id,observaciones)').in('material_id',mids))
]);
let plan;
if(existsSync(file))plan=JSON.parse(readFileSync(file));
else {
 const [orders,ledger,envios]=await load();
 const rows=expected.map(i=>{
  const request=orders.find(r=>r.id===i.request_id);
  const item=request?.purchase_request_items.find(x=>x.id===i.id);
  const m=catalog.find(x=>x.id===i.material_id);
  const s=ledger.filter(x=>x.purchase_request_item_id===i.id);
  assert.equal(s.length,1);
  const snap=s[0];
  assert.equal(request.status,i.requestStatus);
  assert.equal(allObras.find(x=>x.id===request.project_id)?.codigo,i.obra);
  assert.equal(item.status,'pendiente');
  assert.equal(item.quantity,i.quantity);
  assert.equal(snap.estado,'pedido');
  assert.equal(snap.cantidad,Number(i.quantity));
  assert.equal(snap.obra_id,request.project_id);
  assert.equal(snap.panol_envio_item_id,null);
  assert.equal(snap.recepcion_estado,null);
  assert.equal(snap.stock_sede,'Chubut');
  assert(!envios.some(e=>e.purchase_request_item_id===i.id||e.obra_snapshot_item_id===snap.id));
  assert.equal(m.es_requisito,false);
  return {obra:i.obra,obraId:request.project_id,requestId:request.id,item,snap,m,cantidad:Number(i.quantity),buy:m.codigo==='B17538',transferId:randomUUID(),noticeId:randomUUID(),noticeItemId:randomUUID(),eventId:randomUUID()};
 });
 const balances=[];
 for(const mid of mids){
  const rs=rows.filter(x=>x.m.id===mid);
  const libre=await stock(mid);
  const qty=rs.reduce((t,r)=>t+r.cantidad,0);
  for(const r of rs)assert.equal(await stock(mid,r.obraId),0);
  assert(rs[0].buy?libre===0:libre>=qty);
  balances.push({mid,libre,asignar:rs[0].buy?0:qty});
 }
 const complete=orders.filter(r=>r.purchase_request_items.every(i=>rows.some(x=>x.item.id===i.id&&!x.buy))).map(r=>r.id);
 assert.equal(complete.length,8);
 plan={rows,balances,complete,orders,now};
 writeFileSync(file,JSON.stringify(plan,null,2),{flag:'wx'});
}
const log=(step,fields={})=>console.log(JSON.stringify({step,...fields}));
const rowById=async(table,id)=>read(db.from(table).select('*').eq('id',id).maybeSingle());
if(process.argv[2]!=='apply'){
 for(const r of plan.rows)log(r.buy?'Comprar y avisar':'Asignar', {obra:r.obra,codigo:r.m.codigo,cantidad:r.cantidad});
 log('Plan',{cerrarPedidos:plan.complete.length,parcial:'52-25 VHF'});
 process.exit(0);
}
const actor=await read(db.from('profiles').select('id').eq('username','ezequiel.adm').eq('is_admin',true).single());
const assignment=plan.rows.filter(r=>!r.buy);
const buying=plan.rows.filter(r=>r.buy);
const getOrder=async(id)=>read(db.from('purchase_requests').select('*,purchase_request_items(*)').eq('id',id).single());
const existingDebits=await read(db.from('panol_obra_materiales_snapshot').select('id').in('id',assignment.map(r=>r.transferId)));
if(!existingDebits.length){
 for(const b of plan.balances)assert.equal(await stock(b.mid),b.libre);
 for(const r of assignment){
  const fresh=await rowById('panol_obra_materiales_snapshot',r.snap.id);
  assert.equal(fresh.updated_at,r.snap.updated_at);
  assert.equal(await stock(r.m.id,r.obraId),0);
 }
 const transferRows=assignment.flatMap(r=>{
  const inbound={...r.snap,source:'transferencia_ingreso',estado:'en_panol',recepcion_estado:'recibido',recepcion_updated_at:now,producto_asignado_at:now,updated_at:now};
  const outbound={...Object.fromEntries(Object.keys(r.snap).map(k=>[k,null])),id:r.transferId,obra_id:null,material_id:r.m.id,requisito_material_id:r.m.id,descripcion:r.m.descripcion,codigo:r.m.codigo,cantidad:r.cantidad,unidad:r.snap.unidad,proveedor:r.m.proveedor,tipo:'transferencia',tipo_label:'Transferencia a obra',precio_unitario:r.m.precio_unitario,moneda:r.m.moneda,source:'transferencia_egreso',estado:'egresado',recepcion_estado:'egresado',recepcion_updated_at:now,created_at:now,updated_at:now,stock_sede:'Chubut',egreso_at:now,egreso_destino_obra_id:r.obraId,cantidad_egresada:r.cantidad,es_adicional:false,tipo_pedido:'estandar',cantidad_en_reclamo:0,es_regularizacion:false,producto_asignado_at:now,especificaciones:{}};
  return [inbound,outbound];
 });
 await exact(db.from('panol_obra_materiales_snapshot').upsert(transferRows,{onConflict:'id'}).select('id'),assignment.length*2);
 log('Asignado',{renglones:assignment.length});
}else assert.equal(existingDebits.length,assignment.length);
for(const b of plan.balances)assert.equal(await stock(b.mid),b.libre-b.asignar);
for(const r of assignment){
 assert.equal(await stock(r.m.id,r.obraId),r.cantidad);
 const current=await rowById('purchase_request_items',r.item.id);
 if(current.status!=='recibido'||Number(current.received_quantity)!==r.cantidad){
  assert.ok(['pendiente','recibido'].includes(current.status));
  await exact(db.from('purchase_request_items').update({status:'recibido',received_quantity:String(r.cantidad)}).eq('id',r.item.id).eq('updated_at',current.updated_at).select('id'),1);
 }
}
for(const id of plan.complete){
 const r=await getOrder(id);
 if(r.status!=='recibido'){
  assert.equal(r.status,'nuevo');
  assert.equal(r.purchase_request_items.length,1);
  assert.equal(r.purchase_request_items[0].status,'recibido');
  await exact(db.from('purchase_requests').update({status:'recibido',delivered_at:now,closed_at:now,received_quantity:r.purchase_request_items[0].received_quantity}).eq('id',id).eq('updated_at',r.updated_at).select('id'),1);
 }
}
log('Pedidos cubiertos cerrados',{pedidos:plan.complete.length});
for(const r of buying){
 const order=await getOrder(r.requestId);
 assert.equal(order.purchase_request_items.length,1);
 if(order.status==='nuevo'){
  await read(db.rpc('purchase_request_guardar_costos',{p_request_id:r.requestId,p_items:[{id:r.item.id,actual_amount:20000}],p_actual_amount:20000,p_confirmar:true}));
 }else {assert.equal(order.status,'comprado');assert.equal(Number(order.actual_amount),20000);}
 const snap=await rowById('panol_obra_materiales_snapshot',r.snap.id);
 if(snap.estado!=='comprado'||Number(snap.precio_unitario)!==20000){
  assert.ok(['pedido','comprado'].includes(snap.estado));
  await exact(db.from('panol_obra_materiales_snapshot').update({estado:'comprado',precio_unitario:20000,moneda:'ARS'}).eq('id',snap.id).eq('updated_at',snap.updated_at).select('id'),1);
 }
}
for(const r of buying){
 let e=await rowById('panol_envios',r.noticeId);
 const title='Bichero B17538 · '+r.obra;
 if(!e){
  const duplicate=await read(db.from('panol_envios').select('id').eq('obra_id',r.obraId).eq('titulo',title));
  assert.equal(duplicate.length,0);
  [e]=await exact(db.from('panol_envios').insert({id:r.noticeId,origen:'obra_matriz',purchase_request_id:r.requestId,titulo:title,obra_id:r.obraId,sede:'Chubut',prioridad:'media',estado:'borrador',created_by:actor.id}).select('*'),1);
 }
 assert.equal(e.observaciones,null);
 if(!await rowById('panol_envio_items',r.noticeItemId)){
  assert.equal(e.estado,'borrador');
  await exact(db.from('panol_envio_items').insert({id:r.noticeItemId,envio_id:e.id,purchase_request_item_id:r.item.id,obra_snapshot_item_id:r.snap.id,material_id:r.m.id,requisito_material_id:r.m.id,codigo:r.m.codigo,descripcion:r.m.descripcion,cantidad:'1',unidad:r.snap.unidad,precio_unitario:20000,moneda:'ARS',estado:'pendiente'}).select('id'),1);
 }
 const snap=await rowById('panol_obra_materiales_snapshot',r.snap.id);
 assert.equal(snap.panol_envio_id,e.id);
 assert.equal(snap.panol_envio_item_id,r.noticeItemId);
 assert.equal(snap.estado,'comprado');
 assert.equal(snap.recepcion_estado,'pendiente');
 if(!await rowById('panol_envio_eventos',r.eventId))await exact(db.from('panol_envio_eventos').insert({id:r.eventId,envio_id:e.id,tipo:'creado',estado_nuevo:'enviado',actor_id:actor.id}).select('id'),1);
 if(e.estado==='borrador')await exact(db.from('panol_envios').update({estado:'enviado'}).eq('id',e.id).eq('estado','borrador').select('id'),1);
 log('Aviso enviado',{obra:r.obra,aviso:e.id});
}
const [orders,ledger,envios]=await load();
for(const r of assignment){
 const snap=ledger.find(x=>x.id===r.snap.id);
 const debit=ledger.find(x=>x.id===r.transferId);
 const order=orders.find(x=>x.id===r.requestId);
 const i=order.purchase_request_items.find(x=>x.id===r.item.id);
 assert.equal(i.status,'recibido');
 assert.equal(Number(i.received_quantity),r.cantidad);
 assert.equal(snap.source,'transferencia_ingreso');
 assert.ok(['en_panol','recibido'].includes(snap.estado));
 assert.equal(snap.recepcion_estado,'recibido');
 assert.equal(snap.cantidad_egresada,0);
 assert.equal(debit.egreso_destino_obra_id,r.obraId);
 assert.equal(debit.notas,null);assert.equal(snap.notas,r.snap.notas);assert.equal(i.notes,r.item.notes);
 assert.equal(order.status,plan.complete.includes(order.id)?'recibido':'cotizando');
}
const mixed=orders.find(o=>o.id==='c938eaad-10c6-4df3-8ef1-72cbc0ba6d2f');
for(const i of mixed.purchase_request_items.filter(i=>!assignment.some(r=>r.item.id===i.id)))assert.deepEqual(i,plan.orders.find(o=>o.id===mixed.id).purchase_request_items.find(x=>x.id===i.id));
for(const r of buying){
 const o=orders.find(o=>o.id===r.requestId);
 const e=envios.find(e=>e.id===r.noticeItemId);
 const s=ledger.find(x=>x.id===r.snap.id);
 assert.equal(o.status,'comprado');assert.equal(Number(o.actual_amount),20000);
 assert.equal(Number(o.purchase_request_items[0].actual_amount),20000);
 assert.equal(e.estado,'pendiente');assert.equal(e.envio.estado,'enviado');assert.equal(e.envio.origen,'obra_matriz');assert.equal(e.envio.obra_id,r.obraId);assert.equal(e.envio.observaciones,null);assert.equal(e.nota,null);assert.equal(Number(e.precio_unitario),20000);
 assert.equal(s.estado,'comprado');assert.equal(s.recepcion_estado,'pendiente');assert.equal(s.recepcion_cantidad_recibida,null);
}
log('Verificado',{obras:oids.length,asignados:assignment.length,pedidosCerrados:plan.complete.length,avisos:buying.length});

