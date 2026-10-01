import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = {};
for (const file of ['.env','.env.backup.local']) { for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) { const m=line.match(/^([^#=]+)=(.*)$/); if(m) env[m[1].trim()]=m[2].trim().replace(/^['\"]|['\"]$/g,''); } }
const sb=createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const { data: ev } = await sb.from('panol_envio_eventos').select('created_at, tipo, estado_anterior, estado_nuevo, nota, actor_id, item_id').eq('envio_id', 'e78e00c8-58a4-411e-b1e7-caf4b5863c65').order('created_at');
for (const e of ev ?? []) console.log(e.created_at.slice(0,19), e.tipo, e.estado_anterior, '->', e.estado_nuevo, e.nota ?? '', e.actor_id?.slice(0,8));
const { data: pr } = await sb.from('purchase_requests').select('id, status, updated_at, status_changed_at, status_changed_by, title').eq('id', 'c9c2bddf-95d4-4894-84eb-7b049307fd03');
console.log('PEDIDO', JSON.stringify(pr));
const { data: items } = await sb.from('purchase_request_items').select('id, description, status, status_changed_at').eq('request_id', 'c9c2bddf-95d4-4894-84eb-7b049307fd03');
console.log('LINEAS', JSON.stringify(items));
