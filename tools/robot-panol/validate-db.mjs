import pg from './runtime/node_modules/pg/lib/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env={};
for(const line of (await readFile('.env.audit.local','utf8')).split(/\r?\n/)) {
  const m=line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
}
const client=new pg.Client({host:env.KLASEA_AUDIT_DB_HOST,port:Number(env.KLASEA_AUDIT_DB_PORT),
  user:env.KLASEA_AUDIT_DB_USER,password:env.KLASEA_AUDIT_DB_PASSWORD,database:env.KLASEA_AUDIT_DB_NAME,
  ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
let transaction=false;
try {
  await client.connect();
  const schema=await client.query("select has_schema_privilege(current_user,'public','CREATE') as can_create, to_regclass('public.panol_robots') is not null as exists");
  if(!schema.rows[0].can_create)throw Error('La cuenta de verificacion no tiene permiso CREATE; no se aplico nada.');
  if(schema.rows[0].exists)throw Error('La integracion ya existe; este ensayo no la modifica.');
  const html=await (await fetch('http://127.0.0.1:4188/')).text();
  const token=html.match(/const token='([a-f0-9]+)'/)[1];
  const status=await (await fetch('http://127.0.0.1:4188/status',{headers:{'X-Robot-Session':token}})).json();
  if(!status.user)throw Error('Se necesita una cuenta conectada en el panel para probar el vinculo.');
  const users=await client.query('select id from public.profiles where username=$1 and public.can_receive_envio($2,id)',[status.user,'Chubut']);
  assert.equal(users.rowCount,1,'Cuenta sin permiso de recepcion en Chubut');
  await client.query('begin');transaction=true;
  await client.query("set local lock_timeout='3s'; set local statement_timeout='15s'");
  let sql=await readFile('supabase/migrations/20260926120000_robot_panol_consulta_autonoma.sql','utf8');
  sql=sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
  await client.query(sql);
  await client.query("select set_config('request.jwt.claim.sub',$1,true)",[users.rows[0].id]);
  const pair=(await client.query("select public.panol_robot_vincular('Chubut','Ensayo reversible') as pair")).rows[0].pair;
  const feed=(await client.query('select public.panol_robot_feed($1,$2,0) as feed',[pair.id,pair.token])).rows[0].feed;
  assert.equal(feed.sede,'Chubut');assert.equal(feed.status,'ok');assert.ok(feed.notices.every(n=>n.sede==='Chubut'));
  const expected=(await client.query("select count(*)::int as total from public.panol_envios where sede='Chubut' and estado in ('enviado','en_preparacion','parcial')")).rows[0].total;
  assert.equal(feed.total,expected);
  assert.equal((await client.query("select has_table_privilege('anon','public.panol_robots','SELECT') as permitted")).rows[0].permitted,false);
  async function denied(label,secret) {
    await client.query('savepoint rejected_token');
    try {await client.query('select public.panol_robot_feed($1,$2,0)',[pair.id,secret]);throw Error(label+' no rechazo el acceso');}
    catch(e){if(e.code!=='42501')throw e;await client.query('rollback to rejected_token');}
    await client.query('release savepoint rejected_token');
  }
  await denied('Token incorrecto','0'.repeat(64));
  await client.query('select public.panol_robot_revocar($1)',[pair.id]);
  await denied('Dispositivo revocado',pair.token);
  await client.query('rollback');transaction=false;
  console.log(JSON.stringify({rollback:true,countsCorrect:true,chubutOnly:true,invalidTokenRejected:true,revocationVerified:true,anonTableDenied:true,total:expected}));
} catch(e){console.error(e.message);process.exitCode=1;}
finally{if(transaction)await client.query('rollback').catch(()=>{});await client.end();}
