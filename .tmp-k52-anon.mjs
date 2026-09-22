import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = {};
for (const file of ['.env','.env.local']) { if (!fs.existsSync(file)) continue; for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) { const m=line.match(/^([^#=]+)=(.*)$/); if(m) env[m[1].trim()]=m[2].trim().replace(/^['\"]|['\"]$/g,''); } }
const supabase=createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
for (const table of ['panol_materiales','panol_material_modelo','panol_precios','panol_comprobantes','panol_comprobante_items']) {
 const {count,error}=await supabase.from(table).select('*',{count:'exact',head:true});
 console.log(table, error?('ERR '+error.code+' '+error.message):count);
}

