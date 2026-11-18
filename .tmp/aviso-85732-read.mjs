import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env'); process.loadEnvFile('.env.backup.local');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function read(q) {
  const {data,error}=await q;
  if(error) throw Error(JSON.stringify(error));
  return data;
}
async function pages(q) {
  const all=[];
  for(let start=0;;start+=800){
    const data=await read(q().order('id').range(start,start+799));
    all.push(...data); if(data.length<800)return all;
  }
}
const actor='b93b4fda-590a-41b7-8382-317aa74917e1';
const like='descripcion.ilike.%achique%,descripcion.ilike.%par-max%,descripcion.ilike.%par max%,descripcion.ilike.%rule%,descripcion.ilike.%flotan%,descripcion.ilike.%antena%,descripcion.ilike.%superswitch%,descripcion.ilike.%31395%';
const res=await Promise.allSettled([
  read(db.from('profiles').select('id,username,role,is_admin').or('username.ilike.%gaston%,id.eq.'+actor)),
  read(db.from('panol_envios').select('id,titulo,sede,estado,observaciones').or('titulo.ilike.%85732%,observaciones.ilike.%85732%')),
  pages(()=>db.from('panol_materiales').select('*').or(like+',codigo.in.(43 12V,31395-4012,14A,10,35A,37A,4187)')),
  pages(()=>db.from('produccion_obras').select('*')),
  read(db.from('panol_envio_items').select('*,panol_envios!inner(titulo,sede,estado,created_at)').or(like).order('created_at',{ascending:false}).limit(100)),
]);
for(const [i,v] of res.entries())if(v.status==='rejected') console.error(i,String(v.reason));
if(res.some(x=>x.status==='rejected'))process.exit(1);
const [profiles,existing,catalog,obras,avisos]=res.map(x=>x.value);
const gaston=profiles.find(p=>p.username.toLowerCase()==='gaston.tec');
if(!gaston) throw Error('No se encontró gaston.tec');
const requests=await pages(()=>db.from('purchase_requests').select('*').eq('created_by',gaston.id));
const requestItems=[];
for(let j=0;j<requests.length;j+=75){
  requestItems.push(...await pages(()=>db.from('purchase_request_items').select('*').in('request_id',requests.slice(j,j+75).map(r=>r.id))));
}
const snapshots=await pages(()=>db.from('panol_obra_materiales_snapshot').select('*').or(like));
fs.writeFileSync('.tmp/aviso-85732-live.json',JSON.stringify({profiles,existing,catalog,obras,avisos,requests,requestItems,snapshots},null,2));
console.log(JSON.stringify({profiles,existing,catalog:catalog.length,obras:obras.length,avisos:avisos.length,requests:requests.length,requestItems:requestItems.length,snapshots:snapshots.length,obraColumns:Object.keys(obras[0]||{}),requestColumns:Object.keys(requests[0]||{}),itemColumns:Object.keys(requestItems[0]||{}),snapshotColumns:Object.keys(snapshots[0]||{})},null,2));
