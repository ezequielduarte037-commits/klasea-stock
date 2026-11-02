import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { rowDelta, rowIsAnulado } from '../src/features/panol/panolMovimientos.js';
process.loadEnvFile('.env');process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'fiwugzjeegzlgclfayfd.supabase.co');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function read(q){const {data,error}=await q;if(error)throw Error(JSON.stringify(error));return data;}
const materialId='d3e05f98-6c70-4825-82ca-fcd33b8db9b8',actor='b93b4fda-590a-41b7-8382-317aa74917e1',ref='matafuegos-estandar-construccion-20261030';
const [material,obras,matriz,snapshot,items,prior]=await Promise.all([
 read(db.from('panol_materiales').select('*').eq('id',materialId).single()),
 read(db.from('produccion_obras').select('id,codigo,estado,linea_nombre,solo_stock,fecha_fin_real').eq('estado','activa')),
 read(db.from('panol_material_modelo').select('*').eq('material_id',materialId)),
 read(db.from('panol_obra_materiales_snapshot').select('*').eq('material_id',materialId)),
 read(db.from('purchase_request_items').select('*,request:purchase_requests(id,status,project_id,title)').or(`material_id.eq.${materialId},description.ilike.%mata%fuego%,description.ilike.%extintor%`)),
 read(db.from('purchase_requests').select('id').eq('source_ref',ref)),
]);assert.equal(prior.length,0,'Este pedido ya existe.');
const live=snapshot.filter(r=>!rowIsAnulado(r));
assert.equal(live.filter(r=>!r.obra_id).reduce((s,r)=>s+rowDelta(r),0),0,'Cambió el stock libre: revisar antes de comprar.');
const plan=[],covered=[];
for(const obra of obras.filter(o=>!o.solo_stock&&!o.fecha_fin_real)){
 const modelo=obra.linea_nombre?.match(/^K(37|52|55)$/)?.[1];
 const rule=matriz.find(m=>m.modelo===modelo&&m.variante==='standard');if(!rule)continue;
 const rows=live.filter(r=>r.obra_id===obra.id);
 const requerimientos=rows.filter(r=>r.source==='matriz');assert.ok(requerimientos.length<=1,obra.codigo);
 const pending=items.filter(i=>i.request?.project_id===obra.id&&i.status!=='cancelado'&&i.request.status!=='cancelado'&&(i.material_id===materialId||/1\s*kg/i.test(i.description)));
 const assigned=Math.max(0,rows.reduce((s,r)=>s+rowDelta(r),0));
 const delivered=rows.filter(r=>r.estado==='egresado'&&!String(r.source).includes('transferencia_egreso')).reduce((s,r)=>s+Math.max(Number(r.cantidad_egresada)||0,Number(r.cantidad)||0),0);
 const need=Number(rule.cantidad);const missing=pending.length?0:Math.max(0,need-assigned-delivered);
 if(missing)plan.push({obra,need,quantity:missing,snapshot:requerimientos[0]||null});else covered.push({obra:obra.codigo,need,assigned,delivered,pending:pending.map(i=>i.request.id)});
}
plan.sort((a,b)=>a.obra.codigo.localeCompare(b.obra.codigo,'es',{numeric:true}));
assert.equal(plan.length,15);assert.equal(plan.reduce((s,p)=>s+p.quantity,0),42);
const dir='backups/matafuegos-20261030';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/antes-y-plan.json`,JSON.stringify({material,obras,matriz,snapshot,items,plan,covered},null,2),{flag:'wx'});
const description=['Matafuegos de 1 kg para completar las listas estándar de las obras activas en construcción.',...plan.map(p=>`${p.obra.codigo}: ${p.quantity} unidades`),'Total: 42 unidades.','85-2 y 85-3 ya tienen pedidos abiertos de 8 unidades cada uno; no duplicar.'].join('\n');
const request=await read(db.from('purchase_requests').insert({title:'Matafuegos 1 kg · barcos en construcción · 42 unidades',description,priority:'media',status:'nuevo',created_by:actor,status_changed_by:actor,source:'materiales_obra',source_ref:ref,destino:'Chubut 2120',es_adicional:false,tipo_pedido:'estandar'}).select('*').single());
fs.writeFileSync(`${dir}/pedido.json`,JSON.stringify(request,null,2));
const createdItems=await read(db.from('purchase_request_items').insert(plan.map(p=>({request_id:request.id,description:'Matafuego 1kg',quantity:String(p.quantity),unit:'unidad',status:'pendiente',material_id:materialId,requisito_material_id:materialId,catalog_source:'panol',destination:`Obra ${p.obra.codigo}`,notes:`Lista estándar ${p.obra.linea_nombre} · obra ${p.obra.codigo}.`,status_changed_by:actor}))).select('*'));
const changed=[];
for(const p of plan){const item=createdItems.find(i=>i.destination===`Obra ${p.obra.codigo}`);assert.ok(item);
 const patch={estado:'pedido',purchase_request_id:request.id,purchase_request_item_id:item.id};
 let saved;
 if(p.snapshot){assert.equal(p.snapshot.estado,'pendiente');assert.equal(p.snapshot.purchase_request_id,null);saved=await read(db.from('panol_obra_materiales_snapshot').update(patch).eq('id',p.snapshot.id).eq('updated_at',p.snapshot.updated_at).is('purchase_request_id',null).select('*').single());}
 else saved=await read(db.from('panol_obra_materiales_snapshot').insert({obra_id:p.obra.id,material_id:materialId,requisito_material_id:materialId,descripcion:material.descripcion,cantidad:p.need,unidad:'unidad',tipo:'base',tipo_label:'Base',source:'matriz',stock_sede:'Chubut',es_adicional:false,tipo_pedido:'estandar',created_by:actor,precio_unitario:material.precio_unitario,moneda:material.moneda,...patch}).select('*').single());
 changed.push(saved);fs.writeFileSync(`${dir}/vinculados.json`,JSON.stringify(changed,null,2));
}
const after={request:await read(db.from('purchase_requests').select('*').eq('id',request.id).single()),items:await read(db.from('purchase_request_items').select('*').eq('request_id',request.id)),snapshots:await read(db.from('panol_obra_materiales_snapshot').select('*').eq('purchase_request_id',request.id))};
assert.equal(after.items.length,15);assert.equal(after.items.reduce((s,i)=>s+Number(i.quantity),0),42);assert.equal(after.snapshots.length,15);assert.ok(after.snapshots.every(s=>s.estado==='pedido'&&s.cantidad_egresada===0));assert.equal(after.request.status,'nuevo');
// Las existencias y los movimientos que ya estaban registrados permanecen intactos.
const latest=await read(db.from('panol_obra_materiales_snapshot').select('*').in('id',snapshot.map(s=>s.id)));
for(const old of snapshot){const actual=latest.find(s=>s.id===old.id);assert.ok(actual);assert.equal(rowDelta(actual),rowDelta(old));for(const field of ['cantidad','cantidad_egresada','recepcion_estado','egreso_at'])assert.deepEqual(actual[field],old[field]);}
fs.writeFileSync(`${dir}/despues.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({id:request.id,total:42,reparto:plan.map(p=>({obra:p.obra.codigo,cantidad:p.quantity})),cubiertos:covered,stockSinCambios:true}));
