import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env');process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'fiwugzjeegzlgclfayfd.supabase.co');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function read(q){const {data,error}=await q;if(error)throw Error(JSON.stringify(error));return data;}
const req='c40f8de8-a993-48bf-94ae-a092dbc3a375',obra='ebef12e9-d0c9-4a71-8516-950c1fdd8627',actor='b93b4fda-590a-41b7-8382-317aa74917e1';
const fuente='Rincón del Herraje · Presupuesto CC101488 · 30/10/2026';
const rows=[
 ['21551','Bisagra piano acero niquelado 32 x 0,7 mm x 3,5 m · Häfele 351.01.735',2,26047.17,52094.34,['7e3c7648-3a3f-44cc-bb17-08f302fd42b6']],
 ['56503','Guía telescópica con amortiguación 450 mm cincado negro · Häfele 494.02.074',6,16810.08,100860.47,['77ba072f-1df3-432a-b74d-bac85881bcc6']],
 ['56502','Guía telescópica con amortiguación 400 mm cincado negro · Häfele 494.02.073',6,15534.82,93208.91,['8e45696d-adac-4085-9ec6-22bdf311d42d']],
 ['21526','Bisagra Metalla Clip 110° Ø35 codo 0 · Häfele 311.04.239',20,1115.22,22304.44,['1f641f41-acfd-43b2-96df-6339f70987c5']],
 ['21527','Bisagra Metalla Clip 110° Ø35 codo 9 · Häfele 311.04.240',42,1315.29,55242.05,['b0b30108-3b84-4af3-8586-832adf424311','b18079e6-a811-449b-9e39-aa5ce2dac136']],
 ['22142','Placa de montaje Metalla Clip · Häfele 311.71.500',62,193.49,11996.08,[]],
 ['59056','Pistón elevador de puerta 80N · Häfele 373.82.302',4,4694.91,18779.65,['6cc618a3-0fb6-4caa-861c-38038c2f0ff9']],
 ['57768','Pistón elevador de puerta 60N · Häfele 373.82.301',6,4694.91,28169.48,['100c748a-0dfd-4445-a753-89c9255e27ae']],
 ['38813','Embellecedor redondo 16 mm BR. NIQ. · 9-422-01N',100,1290.51,129050.74,[]],
 ['38815','Embellecedor redondo 14 mm BR. NIQ. · 9-422-02N',100,1099.61,109960.76,[]],
].map(([code,desc,qty,unit,total,items])=>({code,desc,qty,unit,total,items}));
assert.equal(Math.round(rows.reduce((s,x)=>s+x.total,0)*100),62166692);
const before={request:await read(db.from('purchase_requests').select('*').eq('id',req).single()),items:await read(db.from('purchase_request_items').select('*').eq('request_id',req)),catalog:await read(db.from('panol_materiales').select('*').in('codigo',rows.map(x=>x.code))),envios:await read(db.from('panol_envios').select('*').eq('purchase_request_id',req))};
assert.equal(before.request.status,'nuevo');assert.equal(before.items.length,10);assert.equal(before.envios.length,0);
const dir='backups/herrajes554-20261030';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/antes-y-plan.json`,JSON.stringify({before,rows},null,2),{flag:'wx'});
const log=[];function record(x){log.push(x);fs.writeFileSync(`${dir}/aplicados.json`,JSON.stringify(log,null,2));}
// Las correderas no cotizadas conservan sus IDs y seguimiento en un pedido pendiente.
const pendientes=before.items.filter(x=>/LARGO (200|250)mm/.test(x.description));assert.equal(pendientes.length,2);
const follow=await read(db.from('purchase_requests').insert({title:'Herrajes 55-4 · pendientes: correderas 200 y 250 mm',description:'Pendientes del kit de herrajes 55-4. No figuran en el presupuesto CC101488 de Rincón del Herraje del 30/10/2026. Entregar a Oberti.',priority:'alta',status:'nuevo',created_by:actor,status_changed_by:actor,project_id:obra,source:'web',source_ref:req}).select('*').single());record({pendingRequest:follow});
for(const p of pendientes){await read(db.from('purchase_request_items').update({request_id:follow.id,notes:[p.notes,'Pendiente de cotización: no incluido en CC101488.'].filter(Boolean).join('\n')}).eq('id',p.id).eq('request_id',req).select('id').single());record({pendingItem:p.id});}
const costs=[];
for(const r of rows){
 const exact=before.catalog.filter(x=>x.codigo===r.code&&x.descripcion===r.desc);assert.ok(exact.length<=1);
 let mat=exact[0];if(!mat){mat=await read(db.from('panol_materiales').insert({categoria_id:'55a47151-3f6c-46ea-8dc5-5271261c66dc',codigo:r.code,descripcion:r.desc,unidad_medida:'unidad',precio_unitario:r.unit,moneda:'ARS',proveedor:'Rincón del Herraje',origen:'presupuesto',notas:`${fuente}. Cantidad ${r.qty}; subtotal cotizado ARS ${r.total}. IVA no discriminado.`,created_by:actor}).select('*').single());record({catalog:mat});}
 await read(db.from('panol_precios').insert({material_id:mat.id,precio_unitario:r.unit,moneda:'ARS',fecha:'2026-10-30',proveedor:'Rincón del Herraje',fuente}));
 if(!r.items.length){const it=await read(db.from('purchase_request_items').insert({request_id:req,description:r.desc,quantity:String(r.qty),unit:'unidad',status:'pendiente',notes:`${fuente}. Código ${r.code}; subtotal ARS ${r.total}. Entregar a Oberti.`,material_id:mat.id,catalog_source:'panol',destination:'Obra 55-4',supplier_name:'Rincón del Herraje',supplier_code:r.code}).select('*').single());r.items=[it.id];record({newItem:it});costs.push({id:it.id,actual_amount:r.total});}
 else{let assigned=0;for(let index=0;index<r.items.length;index++){const id=r.items[index],it=before.items.find(x=>x.id===id);assert.ok(it);const qty=r.code==='21551'?2:Number(it.quantity);const amount=index===r.items.length-1?Math.round((r.total-assigned)*100)/100:Math.round(r.total*qty/r.qty*100)/100;assigned+=amount;
 const patch={material_id:mat.id,catalog_source:'panol',supplier_name:'Rincón del Herraje',supplier_code:r.code,notes:[it.notes,`${fuente}. Código ${r.code}; precio unitario impreso ARS ${r.unit}; importe de este renglón ARS ${amount}. Se respeta el subtotal cotizado por diferencias de redondeo.`,r.code==='21551'?'Se compran 2 unidades de 3,5 m según presupuesto; pedido original: 1,5 m.':null].filter(Boolean).join('\n'),...(r.code==='21551'?{quantity:'2',unit:'unidad',description:r.desc}:{})};
 await read(db.from('purchase_request_items').update(patch).eq('id',id).eq('request_id',req).select('id').single());record({item:id,patch});costs.push({id,actual_amount:amount});}}
 r.material_id=mat.id;
}
assert.equal(Math.round(costs.reduce((s,x)=>s+x.actual_amount,0)*100),62166692);
await read(db.from('purchase_requests').update({project_id:obra,proveedor:'Rincón del Herraje',status_changed_by:actor,estimated_amount:621666.92,description:[before.request.description,`${fuente}. Total ARS 621.666,92. Correderas 200/250 mm pendientes en pedido separado.`].join('\n')}).eq('id',req).select('id').single());
const saved=await read(db.rpc('purchase_request_guardar_costos',{p_request_id:req,p_items:costs,p_actual_amount:621666.92,p_confirmar:true}));assert.equal(saved.request.actual_amount,621666.92);assert.equal(saved.request.status,'comprado');
fs.writeFileSync(`${dir}/despues.json`,JSON.stringify({saved,rows,pendingRequest:follow},null,2));console.log(JSON.stringify({request:req,total:saved.request.actual_amount,estado:saved.request.status,items:saved.items.length,pendientes:follow.id}));
