import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env');process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'fiwugzjeegzlgclfayfd.supabase.co');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const dir='backups/maderas-20261029';fs.mkdirSync(dir,{recursive:true});
const fuente='Lista informada por Ezequiel 29/10/2026';const actor='b93b4fda-590a-41b7-8382-317aa74917e1';
const ids=['3f51e374-3107-4bdf-b5f6-b8a8f38a5cfa','1df2b152-2f7c-404c-b178-cb89fc3385b1','4e884835-4820-446f-94c2-aa24c0e487fa'];
async function read(q){const r=await q;if(r.error)throw Error(JSON.stringify(r.error));return r.data;}
const before={};for(const t of ['materiales','materiales_secundarios_precios','panol_materiales','panol_precios'])before[t]=await read(db.from(t).select('*'));
before.requests=await read(db.from('purchase_requests').select('*').in('id',ids));before.items=await read(db.from('purchase_request_items').select('*').in('request_id',ids));
before.pedidos=await read(db.from('pedidos').select('*').in('purchase_request_id',ids));
const fx=await(await fetch('https://dolarapi.com/v1/dolares/oficial')).json();assert.equal(fx.venta,1560);assert.ok(fx.fechaActualizacion.startsWith('2026-10-29'));
const productos=[];
function add(nombre,precio,moneda,unidad,primary=[],wood=null,factor=1,nota=''){productos.push({nombre,precio,moneda,unidad,primary,wood,factor,nota});}
const terci={3:13.5,4:19,6:27,9:37,12:47.5,15:57,18:68};
for(const [mm,p]of Object.entries(terci))add(`Terciado naval ${mm}mm 2,20 x 1,60 m`,p,'USD','placa',before.panol_materiales.filter(x=>x.descripcion===`Terciado ${mm}mm`).map(x=>x.id),before.materiales.find(x=>x.nombre===`Terciado ${mm}mm`)?.id,1,'Placa 2,20 x 1,60 m.');
const mdf={3:19900,6:24900,9:36920,12:44500,15:55150,18:64658};
for(const[mm,p]of Object.entries(mdf))add(`MDF ${mm}mm 2,75 x 1,83 m`,p,'ARS','placa',[],before.materiales.find(x=>x.nombre===`Fibrofacil ${mm}mm`)?.id,1,'Placa 2,75 x 1,83 m.');
add('Ultralight naval 26mm (honeycomb)',140,'USD','panel',[],'16b3a341-11dd-44dc-b76e-8072cf8949af');
add('Pie de Okumé',3.3,'USD','pies',before.panol_materiales.filter(x=>/^(Tablón Okume|Pie de Okumé)$/.test(x.descripcion)).map(x=>x.id),'54a2dc77-e2ab-4981-837a-bdbf5d53b28d',15);
add('Pie de Marupá',3,'USD','pies',[],'c01f367c-f56e-4d4e-a8e6-055a62fbfe19',15);
add('Pie de teca',32,'USD','pies',[],'b347aaeb-1e69-493b-91d2-eb56dc5a99a7',15,'Máximo del rango informado: USD 26–32/pie².');
add('Formica Polar',98000,'ARS','placa',[],'0a867662-8f03-4313-a545-c7ae86f6930d');add('Formica Marfil',98000,'ARS','placa');
add('Melamina sobre MDF 18mm',118000,'ARS','placa',[],null,1,'Máximo del rango informado: ARS 98.000–118.000 por hoja, según modelo.');
add('Fondo melamina 3mm',68000,'ARS','placa',[],null,1,'Máximo del rango informado: ARS 54.000–68.000, según modelo.');
add('Pie de loro blanco',3200,'ARS','pies',['3e5f02dd-b219-45c7-baad-40fffb6bb743']);
add('Pie de cedro tonna',2600,'ARS','pies',[],'8fda9cea-aece-4947-840b-74cc7649bbb5',15);
add('Pie de Lenga (marcos)',4100,'ARS','pies',['367dfc04-27b7-4cb9-81be-84eddb766812'],'5a5f84ca-0d45-4e85-b7cc-2e97583eef81',15);
add('Chapa reconstituida (modelo sin definir)',19.7,'USD','m²',[],null,1,'Máximo del rango USD 7,70–19,70/m².');
add('Chapa reconstituida gris plata',7.7,'USD','m²');add('Chapa reconstituida nogal italiano',19.7,'USD','m²');
add('Melamina Faplac Ceniza 18mm 1,83 x 2,75 m',100000,'ARS','placa',[],null,1,'Precio indicado para pedido de Kevin, obra 55-3.');
add('Melamina Faplac Ceniza 3mm 1,83 x 2,75 m',100000,'ARS','placa',[],null,1,'Precio indicado para pedido de Kevin, obra 55-3.');
fs.writeFileSync(`${dir}/antes-y-plan.json`,JSON.stringify({before,productos,fx},null,2),{flag:'wx'});
const log=[];function record(r){log.push(r);fs.writeFileSync(`${dir}/aplicados.json`,JSON.stringify(log,null,2));}
const cat='55a47151-3f6c-46ea-8dc5-5271261c66dc';
for(const p of productos){
 const nota=[fuente,p.nota,p.unidad==='pies'?'Precio por pie².':'','Importe tal como informado; IVA no discriminado.'].filter(Boolean).join(' ');
 if(!p.primary.length){assert.ok(!before.panol_materiales.some(x=>x.descripcion===p.nombre));const n=await read(db.from('panol_materiales').insert({categoria_id:cat,descripcion:p.nombre,unidad_medida:p.unidad,precio_unitario:p.precio,moneda:p.moneda,notas:nota,origen:'carga_manual',activo:true,created_by:actor}).select('*').single());p.primary=[n.id];record({table:'panol_materiales',inserted:n});}
 else for(const id of p.primary){const old=before.panol_materiales.find(x=>x.id===id);assert.ok(old);const patch={precio_unitario:p.precio,moneda:p.moneda,notas:[old.notas,nota].filter(Boolean).join('\n')};await read(db.from('panol_materiales').update(patch).eq('id',id).select('id').single());record({table:'panol_materiales',id,patch});}
 for(const id of p.primary){const n=await read(db.from('panol_precios').insert({material_id:id,precio_unitario:p.precio,moneda:p.moneda,fecha:'2026-10-29',fuente}).select('*').single());record({table:'panol_precios',inserted:n});}
 if(p.wood){const old=before.materiales.find(x=>x.id===p.wood);assert.ok(old);const n=await read(db.from('materiales_secundarios_precios').insert({catalogo:'maderas',material_id:p.wood,precio_base:p.precio,moneda:p.moneda,unidad_precio:p.unidad==='pies'?'pie²':p.unidad,factor_unidad_matriz:p.factor,precio_unidad_matriz:p.precio*p.factor,incluye_iva:false,fecha:'2026-10-29',fuente,notas:[nota,p.factor===15?'Estimación: 15 pie² por tablón (300 pie² ≈ 20 tablones, informado por Ezequiel); no representa una medición exacta.':''].filter(Boolean).join(' ')}).select('*').single());record({table:'materiales_secundarios_precios',inserted:n});}
}
for(const id of ids){
 const req=before.requests.find(x=>x.id===id);assert.equal(req.status,'nuevo');const items=before.items.filter(x=>x.request_id===id);assert.equal(items.length,id===ids[0]?3:id===ids[1]?4:2);
 const costs=[];
 for(const item of items){let p;if(id===ids[2])p=productos.find(x=>x.nombre===item.description);else p=productos.find(x=>x.wood===item.material_id);assert.ok(p,item.description);const base=p.precio*p.factor*Number(item.quantity);const amount=Math.round(base*(p.moneda==='USD'?fx.venta:1)*100)/100;
 const note=`${fuente}. ${p.moneda} ${base} por ${item.quantity} ${item.unit}.${p.factor===15?' Estimado con 15 pie² por tablón.':''}${p.moneda==='USD'?` Equivalente ARS ${amount}, dólar oficial vendedor ${fx.venta} (${fx.fechaActualizacion}).`:''}`;
 await read(db.from('purchase_request_items').update({notes:[item.notes,note].filter(Boolean).join('\n'),...(id===ids[2]?{material_id:p.primary[0],catalog_source:'panol',destination:'Obra 55-3'}:{})}).eq('id',item.id).select('id').single());record({table:'purchase_request_items',id:item.id,notes:note});costs.push({id:item.id,actual_amount:amount});
 }
 const project=id===ids[0]?'f75fef37-f0d8-4ce5-b206-32b9c3e2aa57':id===ids[2]?'cdddce11-3d17-4945-837c-8fc0362c26e2':null;
 const patch={status_changed_by:actor,...(project?{project_id:project}:{})};await read(db.from('purchase_requests').update(patch).eq('id',id).eq('status','nuevo').select('id').single());
 const result=await read(db.rpc('purchase_request_guardar_costos',{p_request_id:id,p_items:costs,p_actual_amount:costs.reduce((s,x)=>s+x.actual_amount,0),p_confirmar:true}));assert.equal(result.request.status,'comprado');record({table:'purchase_requests',id,result});
}
const after={requests:await read(db.from('purchase_requests').select('*').in('id',ids)),items:await read(db.from('purchase_request_items').select('*').in('request_id',ids)),wood:await read(db.from('materiales').select('*')),prices:await read(db.from('materiales_secundarios_precios').select('*').eq('fuente',fuente)),catalog:await read(db.from('panol_materiales').select('*').in('id',productos.flatMap(p=>p.primary)))};
for(const b of before.materiales){const a=after.wood.find(x=>x.id===b.id);assert.deepEqual(a,b,'Inventario modificado');}
for(const p of productos)for(const id of p.primary){const a=after.catalog.find(x=>x.id===id);assert.equal(Number(a.precio_unitario),p.precio);assert.equal(a.moneda,p.moneda);}
assert.deepEqual(after.requests.map(x=>x.status),['comprado','comprado','comprado']);
fs.writeFileSync(`${dir}/despues.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({productos:productos.length,catalogo:after.catalog.length,preciosMaderas:after.prices.length,pedidos:after.requests.map(x=>({titulo:x.title,estado:x.status,totalARS:x.actual_amount})),stockSinCambios:true}));
