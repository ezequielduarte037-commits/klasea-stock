import {createClient} from '@supabase/supabase-js';
import fs from 'node:fs';
process.loadEnvFile('.env'); process.loadEnvFile('.env.backup.local'); const e=process.env;
export const db=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export async function read(q){const {data,error}=await q;if(error)throw Error(JSON.stringify(error));return data}
export async function pages(make){const rows=[];for(let i=0;;i+=1000){const page=await read(make().order('id').range(i,i+999));rows.push(...page);if(page.length<1000)return rows}}
if(process.argv[2]==='read'){
const obra=await read(db.from('produccion_obras').select('*').eq('codigo','37-46').single());
const [rows,mat,avisos]=await Promise.all([
pages(()=>db.from('panol_obra_materiales_snapshot').select('*').eq('obra_id',obra.id)),
pages(()=>db.from('panol_materiales').select('*')),
pages(()=>db.from('panol_envios').select('*').eq('obra_id',obra.id)),

]);
const items=(await Promise.all(Array.from({length:Math.ceil(avisos.length/80)},(_,i)=>pages(()=>db.from('panol_envio_items').select('*').in('envio_id',avisos.slice(i*80,(i+1)*80).map(x=>x.id)))))).flat();
fs.writeFileSync('.tmp/baron3746-read.json',JSON.stringify({obra,rows,mat,avisos,items}));
console.log({obra:obra.codigo,id:obra.id,sede:obra.sede,rows:rows.length,mat:mat.length,avisos:avisos.length,items:items.length});
}

