import fs from 'node:fs';import{createClient}from'@supabase/supabase-js';
process.loadEnvFile('.env');process.loadEnvFile('.env.backup.local');
const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;const db=createClient(url,key,{auth:{persistSession:false}});
const schema=await(await fetch(url+'/rest/v1/',{headers:{apikey:key,Authorization:'Bearer '+key}})).json();fs.mkdirSync('backups/placas-antiruido-20261103',{recursive:true});fs.writeFileSync('backups/placas-antiruido-20261103/schema.json',JSON.stringify(schema,null,2));
for(const t of ['panol_materiales','materiales']){const {data,error}=await db.from(t).select('*');if(error)throw error;console.log(JSON.stringify({table:t,matches:data.filter(x=>/compos|anti.?ruido|acustic|acústic/i.test(x.descripcion||x.nombre||''))}));}
console.log(JSON.stringify({tables:Object.keys(schema.definitions||{}).filter(x=>/panol|material|stock|purchase_request_items/.test(x))}));
