import fs from 'node:fs';import assert from 'node:assert/strict';import{createClient}from'@supabase/supabase-js';
process.loadEnvFile('.env');process.loadEnvFile('.env.backup.local');assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'fiwugzjeegzlgclfayfd.supabase.co');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});async function read(q){const{data,error}=await q;if(error)throw Error(JSON.stringify(error));return data;}
const req='c167ab7b-53ae-4a6a-b0eb-d78929ba1bef',actor='b93b4fda-590a-41b7-8382-317aa74917e1',obra='dcc01fcd-fdb1-4f5d-8ea7-095a6551c560',fuente='Imagen de precios Audio 52-25 informada por Ezequiel 02/11/2026';
const rows=[
 ['010-02138-00','FUSION MS-RA670 Apollo Marine Stereo',1,'unidad',1194250,1194250,'2caad168-3b46-46ba-9752-d4d226496c0d'],
 ['010-03067-00','JL AUDIO M3-770X-S-Gm-i Speaker (93521)',3,'juego',769775.21,2309325.62,null],
 ['010-03268-00','JL AUDIO M3-770ETXv3-Sb-S-Gm-i Speaker (93537)',1,'juego',1543093.39,1543093.39,null],
 ['010-03264-00','JL AUDIO M3-10IB-S-Gm-i-4 Sub (93529)',1,'unidad',675324.79,675324.79,null],
 ['010-13715-00','JL AUDIO M-SWMCPv3-1.315 Mount Fixture (91279)',1,'juego',612750.41,612750.41,null],
].map(([code,desc,qty,unit,price,total,materialId])=>({code,desc,qty,unit,price,total,materialId}));
assert.equal(Math.round(rows.reduce((s,x)=>s+x.total,0)*100),633474421);
const before={request:await read(db.from('purchase_requests').select('*').eq('id',req).single()),items:await read(db.from('purchase_request_items').select('*').eq('request_id',req)),catalog:await read(db.from('panol_materiales').select('*').or('id.eq.2caad168-3b46-46ba-9752-d4d226496c0d,codigo.in.(010-02138-00,010-03067-00,010-03268-00,010-03264-00,010-13715-00)')),envios:await read(db.from('panol_envios').select('*').eq('purchase_request_id',req))};
assert.equal(before.request.status,'comprado');assert.equal(before.request.project_id,obra);assert.equal(before.items.length,1);assert.equal(before.items[0].description,'Equipo de STEREO NEGRO');assert.equal(before.envios.length,0);
const dir='backups/audio5225-20261102';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/antes-y-plan.json`,JSON.stringify({before,rows},null,2),{flag:'wx'});const log=[];function record(x){log.push(x);fs.writeFileSync(`${dir}/aplicados.json`,JSON.stringify(log,null,2));}
const category=before.catalog.find(m=>m.id===rows[0].materialId).categoria_id;const costs=[];
for(let n=0;n<rows.length;n++){const r=rows[n];const note=`${fuente}. Código ${r.code}. Precio por ${r.unit}: ARS ${r.price}; cantidad ${r.qty}; importe cotizado ARS ${r.total}. Se conserva el importe del renglón de la imagen; no se agregan impuestos no indicados.`;
 if(!r.materialId){const found=before.catalog.filter(m=>m.codigo===r.code);assert.ok(found.length<=1);r.materialId=found[0]?.id;if(!r.materialId){const m=await read(db.from('panol_materiales').insert({categoria_id:category,descripcion:r.desc,codigo:r.code,unidad_medida:r.unit,precio_unitario:r.price,moneda:'ARS',notas:note,origen:'compra',created_by:actor}).select('*').single());r.materialId=m.id;record({catalogCreated:m});}}
 const old=before.catalog.find(m=>m.id===r.materialId);if(old){await read(db.from('panol_materiales').update({precio_unitario:r.price,moneda:'ARS',codigo:r.code,notas:[old.notas,note].filter(Boolean).join('\n')}).eq('id',old.id).select('id').single());record({catalogUpdated:old.id});}
 await read(db.from('panol_precios').insert({material_id:r.materialId,precio_unitario:r.price,moneda:'ARS',fecha:'2026-11-02',fuente}));
 const itemPatch={description:r.desc,quantity:String(r.qty),unit:r.unit,material_id:r.materialId,catalog_source:'panol',destination:'Obra 52-25',notes:note,supplier_code:r.code,status:'pedido',actual_amount:r.total,status_changed_by:actor};let item;
 if(n===0)item=await read(db.from('purchase_request_items').update(itemPatch).eq('id',before.items[0].id).eq('updated_at',before.items[0].updated_at).select('*').single());
 else item=await read(db.from('purchase_request_items').insert({request_id:req,...itemPatch}).select('*').single());
 r.itemId=item.id;costs.push({id:item.id,actual_amount:r.total});record({item});
}
const saved=await read(db.rpc('purchase_request_guardar_costos',{p_request_id:req,p_items:costs,p_actual_amount:6334744.21,p_confirmar:false}));assert.equal(saved.request.actual_amount,6334744.21);assert.equal(saved.request.status,'comprado');assert.equal(saved.items.length,5);
fs.writeFileSync(`${dir}/despues.json`,JSON.stringify({saved,rows},null,2));console.log(JSON.stringify({total:6334744.21,items:5,catalogueCreated:log.filter(x=>x.catalogCreated).length,reused:log.filter(x=>x.catalogUpdated).length}));
