import {db} from './baron3746-rest.mjs';
import fs from 'node:fs';
const {rows,mat}=JSON.parse(fs.readFileSync('.tmp/baron3746-read.json'));
const ix=[0,15,33,43,46,63,66,110,121,158,186,207,237,254,264,269,291,304,320,325,329,359,369,384];
const mi=[106,115,249,320,386,604,662,693,783,845,851,868,905,1092,1108,1182,1333,1380,1459,1477,1503,1528,1597,1655,1665,1669,1673,1926,1993,2054,2106,2448,2557,2562,2589,2606,2654,2659,2701,2712,2731];
const ids=[...new Set([...ix.map(i=>rows[i].material_id),...mi.map(i=>mat[i].id)].filter(Boolean))];
const res=await Promise.all([db.from('panol_precios').select('*').in('material_id',ids).order('fecha',{ascending:false}).order('created_at',{ascending:false}).limit(500),db.from('panol_proveedores').select('id,nombre').ilike('nombre','%bar%'),db.from('panol_material_proveedores').select('*').in('material_id',ids)]);
for(let i=0;i<res.length;i++)console.log(i,res[i].error|| (i===1?res[i].data:res[i].data.length));
fs.writeFileSync('.tmp/baron3746-extra.json',JSON.stringify(res.map(x=>x.data)));
for(const i of ix){const r=rows[i],m=mat.find(m=>m.id===r.material_id);console.log(i,mat.indexOf(m),r.descripcion,r.cantidad,r.unidad,r.precio_unitario,r.moneda,'|',m?.codigo,m?.precio_unitario,m?.moneda,m?.es_requisito,JSON.stringify(r.especificaciones),r.panol_envio_item_id,r.purchase_request_item_id,r.requisito_material_id)}
for(const i of mi){const m=mat[i],p=res[0].data?.find(x=>x.material_id===m.id);console.log('M',i,m.descripcion,m.codigo,m.precio_unitario,m.moneda,m.activo,m.es_requisito,'|',p?.precio_unitario,p?.moneda,p?.fecha,p?.fuente,p?.proveedor)}

