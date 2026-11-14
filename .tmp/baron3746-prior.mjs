import {db,read} from './baron3746-rest.mjs';
import fs from 'node:fs';
const {obra,rows,mat}=JSON.parse(fs.readFileSync('.tmp/baron3746-read.json'));
const a=await read(db.from('panol_envios').select('*').eq('titulo','55-2 · Baron'));
const i=await read(db.from('panol_envio_items').select('*').in('envio_id',a.map(x=>x.id)));
for(const z of i)console.log(z.codigo,z.descripcion,z.precio_unitario,z.moneda,z.unidad,mat.findIndex(m=>m.id===z.material_id));
console.log('Sedes de lista',Object.fromEntries([...new Set(rows.map(x=>x.stock_sede))].map(s=>[s,rows.filter(x=>x.stock_sede===s).length])));
for(const [j,m] of mat.entries())if(/a16267|a16149|c57251|ducto.*ac|p81364|r15007/i.test([m.codigo,m.descripcion,m.notas].join(' ')))console.log(j,m.descripcion,m.codigo,m.notas,m.unidad_medida,m.precio_unitario,m.moneda,m.activo);
console.log('cat',Object.keys(mat[0])); console.log('event', (await db.from('panol_envio_eventos').select('*').eq('envio_id',a[0].id).limit(1)).data);

