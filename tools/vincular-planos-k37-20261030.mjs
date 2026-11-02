import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { documentToMaterialLink, mergeDocumentAttachments } from '../src/features/materiales/productDocuments.js';
process.loadEnvFile('.env'); process.loadEnvFile('.env.backup.local');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'fiwugzjeegzlgclfayfd.supabase.co');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function read(q) { const { data, error } = await q; if (error) throw Error(JSON.stringify(error)); return data; }
const source = await read(db.from('purchase_requests').select('id,attachments').eq('id','fda13bb6-5577-4bc4-92a8-6531fa8267c5').single());
assert.equal(source.attachments.length, 3);
const pairs = [
  ['57e58ef2-6c6f-4db0-88b2-19bc7e9e5fb2', 'Acrilico Comando Chico Babor', 'Acrilico comando babor chico en DXF.dxf'],
  ['47c9c7bc-e88e-4946-83e7-6d511d9a134a', 'Acrilico Comando Chico Estribor', 'Acrilico comando estribor chico en DXF.dxf'],
  ['108ab2e7-27f0-4a85-842b-8508ba687bff', 'Acrilico de comando grande K37', 'Acrilico grande comando DXF.dxf'],
];
const materials = await read(db.from('panol_materiales').select('*').in('id', pairs.map(p=>p[0])));
const requestIds = ['16d3658d-e52d-4aa8-8115-35c404c69cbe','84accb95-9801-4c23-ac82-80c537f6fd2a'];
const requests = await read(db.from('purchase_requests').select('*').in('id',requestIds));
const items = await read(db.from('purchase_request_items').select('*').in('request_id',requestIds));
const dir='backups/planos-k37-20261030';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/antes.json`,JSON.stringify({source,materials,requests,items},null,2),{flag:'wx'});
for(const [id,desc,name] of pairs) {
 const material=materials.find(m=>m.id===id);assert.equal(material.descripcion,desc);
 const file=source.attachments.find(a=>a.name===name);assert.ok(file);
 const response=await fetch(file.url,{method:'HEAD'});assert.equal(response.status,200,name);
 const link={...documentToMaterialLink(file,'37'),nota:'Plano K37 del pedido de referencia fda13bb6-5577-4bc4-92a8-6531fa8267c5.'};
 const links=[...(material.links||[]).filter(x=>x.url!==file.url),link];
 await read(db.from('panol_materiales').update({links}).eq('id',id).eq('links',JSON.stringify(material.links||[])).select('id').single());
}
for(const request of requests) {
 assert.equal(request.status,'nuevo');
 assert.ok(/^37-/.test(request.title));
 const rows=items.filter(i=>i.request_id===request.id);assert.equal(rows.length,3);
 for(const row of rows)assert.ok(pairs.some(p=>p[0]===row.material_id));
 const attachments=mergeDocumentAttachments(request.attachments||[],source.attachments);
 await read(db.from('purchase_requests').update({attachments}).eq('id',request.id).eq('updated_at',request.updated_at).select('id').single());
}
const after={materials:await read(db.from('panol_materiales').select('id,descripcion,links').in('id',pairs.map(p=>p[0]))),requests:await read(db.from('purchase_requests').select('id,title,status,attachments').in('id',requestIds))};
assert.ok(after.materials.every(m=>m.links.filter(x=>x.kind==='documento'&&x.linea==='37').length===1));
assert.ok(after.requests.every(r=>r.attachments.length===3&&r.status==='nuevo'));
fs.writeFileSync(`${dir}/despues.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({productos:after.materials.length,pedidos:after.requests.map(r=>r.title),planosPorPedido:3}));
