import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const q = async (sql, p = []) => (await db.query(sql,p)).rows;
const one = async (sql,p=[]) => (await q(sql,p))[0];
const TECH='00000000-0000-0000-0000-000000000001', BUY='00000000-0000-0000-0000-000000000002', OTHER='00000000-0000-0000-0000-000000000003';
const fixtureSQL=`
    set timezone='UTC';
    create role authenticated; create role anon; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table profiles(id uuid primary key,username text,role text,is_admin boolean default false,is_demo boolean default false,activo boolean default true,sede text);
    grant select on profiles to authenticated;
    create table produccion_obras(id uuid primary key default gen_random_uuid(),codigo text);
    create table purchase_requests(id uuid primary key default gen_random_uuid(),title text,project_id uuid,created_by uuid,assigned_to uuid,
      status text default 'nuevo',priority text default 'media',status_changed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create table request_followers(request_id uuid,user_id uuid);
    create table request_comments(id uuid primary key default gen_random_uuid(),request_id uuid,author_id uuid,body text,created_at timestamptz default now());
    create table request_comment_mentions(comment_id uuid,mentioned_user_id uuid);
    create table purchase_request_items(id uuid primary key default gen_random_uuid(),request_id uuid,description text,status text default 'pendiente',status_changed_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now());
    create table panol_envios(id uuid primary key default gen_random_uuid(),titulo text,sede text,estado text default 'enviado',prioridad text default 'media',created_by uuid,updated_at timestamptz default now(),created_at timestamptz default now());
    create table compras_avisos(id uuid primary key default gen_random_uuid(),titulo text,estado text default 'nuevo',prioridad text default 'media',created_by uuid,updated_at timestamptz default now(),created_at timestamptz default now());
    create table calendario_eventos(id uuid primary key default gen_random_uuid(),clase text default 'solicitud_logistica',tipo text default 'traslado',estado text default 'confirmado',
      titulo text default 'Movimiento',carga text,obra text,fecha date default current_date,hora text,fecha_solicitada date,hora_solicitada time,
      fecha_propuesta date,hora_propuesta time,fecha_confirmada date,hora_confirmada time,transportes jsonb default '[]',paradas jsonb default '[]',
      tipo_transporte text,proveedor_logistico text,prioridad text default 'normal',costo numeric,created_by uuid,created_at timestamptz default now(),
      confirmado_at timestamptz,propuesta_at timestamptz,aceptado_at timestamptz,completado_at timestamptz,updated_at timestamptz default now());
    create table calendario_eventos_historial(id uuid default gen_random_uuid(),evento_id uuid,accion text,actor_id uuid,created_at timestamptz default now());
    create function can_access_purchase_request(uuid,uuid) returns boolean language sql as $$select true$$;
    create function calendario_test_touch() returns trigger language plpgsql as $$begin new.updated_at:=now();return new;end$$;
    create trigger trg_calendario_eventos_touch before update on calendario_eventos for each row execute function calendario_test_touch();
    create function calendario_test_audit() returns trigger language plpgsql as $$begin insert into calendario_eventos_historial(evento_id,accion) values(new.id,'editado');return new;end$$;
    create trigger trg_calendario_eventos_auditar after update on calendario_eventos for each row execute function calendario_test_audit();
    insert into profiles(id,role) values('${TECH}','tecnica'),('${BUY}','compras'),('${OTHER}','tecnica');
    insert into calendario_eventos(id,created_by,created_at,updated_at) values('00000000-0000-0000-0000-000000000099','${TECH}','2026-01-01','2026-01-02');
  `;
before(async () => {
  await db.exec(fixtureSQL);
  await db.exec(await readFile('supabase/migrations/20261007150000_web_push_notificaciones.sql','utf8'));
});
after(async()=>db.close());
beforeEach(async()=>{ await db.exec('begin'); await q("select set_config('test.uid',$1,true)",[TECH]);
  for (const uid of [TECH,BUY,OTHER]) await q("insert into notificaciones_push_suscripciones(user_id,endpoint,p256dh,auth) values($1,$2,'pk','auth')",[uid,'https://fcm.googleapis.com/fcm/send/'+uid]); });
afterEach(async()=>db.exec('rollback'));

test('migración completa inicializa marca sin alterar updated_at/historial y restaura triggers', async()=>{
  const row=await one("select updated_at,logistica_notificada_at from calendario_eventos where id='00000000-0000-0000-0000-000000000099'");
  assert.equal(row.updated_at.toISOString(),'2026-01-02T00:00:00.000Z'); assert.equal(row.logistica_notificada_at.toISOString(),'2026-01-01T00:00:00.000Z');
  assert.equal((await one('select count(*)::int n from calendario_eventos_historial')).n,0);
  assert.deepEqual((await q("select tgenabled from pg_trigger where tgname in ('trg_calendario_eventos_touch','trg_calendario_eventos_auditar')")).map(r=>r.tgenabled),['O','O']);
});

test('hidrogrúa confirmada avisa a técnica y compras ajenos; editar costo no renueva',async()=>{
  const event=await one("insert into calendario_eventos(titulo,tipo_transporte,created_by) values('Hidrogrúa hoy','hidrogrua',$1) returning *",[TECH]);
  assert.deepEqual((await q('select user_id from notificaciones_push_outbox order by user_id')).map(r=>r.user_id),[BUY,OTHER]);
  await q('update calendario_eventos set costo=100 where id=$1',[event.id]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,2);
  const updated=await one('select * from calendario_eventos where id=$1',[event.id]);
  assert.equal(updated.logistica_notificada_at.getTime(),event.logistica_notificada_at.getTime());
  await q("update calendario_eventos set fecha=current_date+1 where id=$1",[event.id]);
  assert.equal((await one('select logistica_cambio from calendario_eventos where id=$1',[event.id])).logistica_cambio,'reprogramado');
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,4);
});

test('solicitud sin confirmar sólo llega a coordinadores; cancelarla no avisa a técnica',async()=>{
  const event=await one("insert into calendario_eventos(estado,created_by) values('solicitado',$1) returning id",[TECH]);
  assert.deepEqual((await q('select user_id from notificaciones_push_outbox')).map(r=>r.user_id),[BUY]);
  await q("update calendario_eventos set estado='cancelado' where id=$1",[event.id]);
  // Nunca estuvo en la agenda de técnica: sólo coordinación (el autor no se avisa a sí mismo).
  assert.deepEqual((await q('select user_id from notificaciones_push_outbox order by created_at')).map(r=>r.user_id),[BUY,BUY]);
});

test('cancelar un movimiento confirmado sí avisa a técnica',async()=>{
  const event=await one("insert into calendario_eventos(estado,created_by,confirmado_at) values('confirmado',$1,now()) returning id",[BUY]);
  await q('delete from notificaciones_push_outbox');
  await q("update calendario_eventos set estado='cancelado' where id=$1",[event.id]);
  const rows=await q('select user_id,payload from notificaciones_push_outbox order by user_id');
  assert.deepEqual(rows.map(r=>r.user_id),[BUY,OTHER]);
  assert.equal(rows[0].payload.title,'Movimiento cancelado');
});

test('renglones del mismo pedido y estado salen en un solo aviso al cerrar la ventana',async()=>{
  const obra=await one("insert into produccion_obras(codigo) values('52-27') returning id");
  const pedido=await one("insert into purchase_requests(title,created_by,project_id) values('Maderas',$1,$2) returning id",[TECH,obra.id]);
  for (const d of ['Terciado 9 mm','Terciado 18 mm','Listón']) await q("insert into purchase_request_items(request_id,description) values($1,$2)",[pedido.id,d]);
  await q('delete from notificaciones_push_outbox');
  await q("select set_config('test.uid',$1,true)",[BUY]);
  await q("update purchase_request_items set status='recibido' where request_id=$1 and description like 'Terciado%'",[pedido.id]);
  await q("update purchase_request_items set status='recibido' where request_id=$1 and description='Listón'",[pedido.id]);
  const rows=await q('select user_id,payload,available_at from notificaciones_push_outbox');
  assert.equal(rows.length,1); assert.equal(rows[0].user_id,TECH);
  assert.equal(rows[0].payload.title,'Material recibido');
  assert.match(rows[0].payload.body,/ y 2 más · Maderas · Obra 52-27$/);
  assert.equal(rows[0].payload.tag,'compra:'+pedido.id);
  assert.ok(rows[0].available_at.getTime()>Date.now(),'espera a que cierre la ventana');
  // Otro estado es otro aviso; volver a pendiente no avisa.
  await q("update purchase_request_items set status='cancelado' where request_id=$1 and description='Listón'",[pedido.id]);
  await q("update purchase_request_items set status='pendiente' where request_id=$1 and description='Terciado 9 mm'",[pedido.id]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,2);
});

test('estados de compras en castellano, con pedido y obra en el cuerpo',async()=>{
  const obra=await one("insert into produccion_obras(codigo) values('55-5') returning id");
  const pedido=await one("insert into purchase_requests(title,created_by,project_id) values('Bulonería',$1,$2) returning id",[TECH,obra.id]);
  await q('delete from notificaciones_push_outbox');
  await q("select set_config('test.uid',$1,true)",[BUY]);
  await q("update purchase_requests set status='en_revision' where id=$1",[pedido.id]);
  const row=await one('select payload from notificaciones_push_outbox');
  assert.equal(row.payload.title,'Pedido en revisión'); assert.equal(row.payload.body,'Bulonería · Obra 55-5');
});

test('outbox idempotente, claim excluye lease vigente y recupera lease vencido',async()=>{
  const users=[TECH,BUY]; const payload={title:'Aviso',tag:'test'};
  const enqueue=()=>q('select notificaciones_push_encolar($1,null,$2,$3,$4::jsonb) n',[users,'compras','dedupe',JSON.stringify(payload)]);
  assert.equal((await enqueue())[0].n,2); assert.equal((await enqueue())[0].n,0);
  const claimed=await q('select * from notificaciones_push_claim(1)');assert.equal(claimed.length,1); assert.equal(claimed[0].attempts,1);
  assert.equal((await q('select * from notificaciones_push_claim(10)')).length,1);
  assert.equal((await q('select * from notificaciones_push_claim(10)')).length,0);
  await q("update notificaciones_push_outbox set locked_at=now()-interval '3 minutes' where id=$1",[claimed[0].id]);
  const reclaim=await q('select * from notificaciones_push_claim(10)');assert.equal(reclaim.length,1);assert.equal(reclaim[0].attempts,2);assert.notEqual(reclaim[0].lease_id,claimed[0].lease_id);
});

test('preferencias, baja y sede evitan entrega fuera de audiencia',async()=>{
  await q("insert into notificaciones_push_preferencias(user_id,categorias) values($1,array['compras'])",[OTHER]);
  await q('update profiles set activo=false where id=$1',[BUY]);
  await q('insert into calendario_eventos(created_by) values($1)',[TECH]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,0);
  await q("update profiles set role='panol',sede='Chubut',activo=true where id=$1",[BUY]);
  await q("insert into panol_envios(titulo,sede,created_by) values('Materiales','Pampa',$1)",[TECH]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,0);
  await q("insert into panol_envios(titulo,sede,created_by) values('Materiales','Chubut',$1)",[TECH]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,1);
});

test('compras participantes: nuevo, comentario y estado, sin ediciones triviales ni autor',async()=>{
  const pedido=await one("insert into purchase_requests(title,created_by) values('Comprar tornillos',$1) returning id",[TECH]);
  assert.deepEqual((await q('select user_id from notificaciones_push_outbox')).map(r=>r.user_id),[BUY]);
  await q('update purchase_requests set title=$1 where id=$2',['Tornillos inox',pedido.id]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,1);
  await q("select set_config('test.uid',$1,true)",[BUY]);
  await q("insert into request_comments(request_id,author_id,body) values($1,$2,'Pedido enviado')",[pedido.id,BUY]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,2);
  await q("select set_config('test.uid',$1,true)",[BUY]);
  await q("update purchase_requests set status='comprado',status_changed_at=now() where id=$1",[pedido.id]);
  assert.equal((await one('select count(*)::int n from notificaciones_push_outbox')).n,3);
});

test('lectura concurrente nunca retrocede y RLS no permite escribir otra cuenta',async()=>{
  const mark=(timestamp)=>q('select notificaciones_marcar_leidas($1::jsonb)',[JSON.stringify([{clave:'logistica:a',leida_hasta:timestamp}])]);
  await mark('2026-01-02T00:00:00Z'); await mark('2026-01-01T00:00:00Z');
  assert.equal((await one('select leida_hasta from notificaciones_lecturas')).leida_hasta.toISOString(),'2026-01-02T00:00:00.000Z');
  await db.exec('set local role authenticated');
  assert.equal((await q('select * from notificaciones_lecturas')).length,1);
  await db.exec('savepoint denied_write');
  await assert.rejects(()=>q("insert into notificaciones_lecturas(user_id,clave,leida_hasta) values($1,'otra',now())",[BUY]),/permission denied/);
  await db.exec('rollback to savepoint denied_write');
  await db.exec('reset role');
});

test('recordatorio futuro es único, vence al comenzar y no avisa movimientos pasados',async()=>{
  const event=await one(`insert into calendario_eventos(created_by,fecha,fecha_confirmada,hora_confirmada) values($1,
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    ((now()+interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires')::date,
    ((now()+interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires')::time) returning id`,[TECH]);
  await q('delete from notificaciones_push_outbox');
  assert.equal((await one('select notificaciones_push_recordatorios() n')).n,3);
  assert.equal((await one('select notificaciones_push_recordatorios() n')).n,0);
  const row=await one('select * from notificaciones_push_outbox');assert.equal(row.payload.recordatorio,true);assert.ok(row.expires_at.getTime()>Date.now());
  assert.match(row.payload.title,/^Movimiento a las \d{2}:\d{2}$/);
  await q('delete from notificaciones_push_outbox');
  await q("update calendario_eventos set hora_confirmada=((now()-interval '2 hours') at time zone 'America/Argentina/Buenos_Aires')::time where id=$1",[event.id]);
  await q('delete from notificaciones_push_outbox');
  assert.equal((await one('select notificaciones_push_recordatorios() n')).n,0);
});

test('config operativa requiere cron activo, Vault y pg_net sin revelar secretos ni acceso cliente',async()=>{
  assert.equal((await one('select notificaciones_push_estado() state')).state.cronReady,false);
  await db.exec(`create schema cron;create table cron.job(jobname text,active boolean);
    create schema vault;create table vault.secrets(name text);
    create schema net;create function net.http_post(text,jsonb,jsonb,jsonb,integer) returns bigint language sql as $$select 1::bigint$$;
    insert into cron.job values('klasea-notificaciones-push',true);
    insert into vault.secrets values('notificaciones_push_project_url'),('notificaciones_push_cron_secret');`);
  assert.deepEqual((await one('select notificaciones_push_estado() state')).state,{cronReady:true});
  await q('update cron.job set active=false');
  assert.equal((await one('select notificaciones_push_estado() state')).state.cronReady,false);
  await db.exec('set local role authenticated;savepoint private_rpc');
  await assert.rejects(()=>q('select notificaciones_push_estado()'),/permission denied/);
  await db.exec('rollback to savepoint private_rpc;reset role');
});

test('demo no recibe push ni puede escribir preferencias o lecturas',async()=>{
  await q('update profiles set is_demo=true where id=$1',[OTHER]);
  await q('insert into calendario_eventos(created_by) values($1)',[TECH]);
  assert.deepEqual((await q('select user_id from notificaciones_push_outbox')).map(r=>r.user_id),[BUY]);
  await q("select set_config('test.uid',$1,true)",[OTHER]);
  await db.exec('set local role authenticated;savepoint demo_rpc');
  await assert.rejects(()=>q('select notificaciones_marcar_leidas($1::jsonb)',[JSON.stringify([{clave:'a',leida_hasta:new Date().toISOString()}])]),/no puede guardar/);
  await db.exec('rollback to savepoint demo_rpc;savepoint demo_pref');
  await assert.rejects(()=>q('insert into notificaciones_push_preferencias(user_id) values($1)',[OTHER]),/row-level security/);
  await db.exec('rollback to savepoint demo_pref;reset role');
});

test('borrar movimiento futuro avisa cancelación sin reutilizar marca leída ni abrir fila borrada',async()=>{
  const event=await one('insert into calendario_eventos(created_by) values($1) returning id',[TECH]);
  await q('delete from notificaciones_push_outbox');
  await q('delete from calendario_eventos where id=$1',[event.id]);
  const rows=await q('select payload from notificaciones_push_outbox');
  assert.equal(rows.length,2);
  assert.equal(rows[0].payload.logisticaEliminada,true);assert.equal(rows[0].payload.clave,null);assert.equal(rows[0].payload.fecha,null);
  assert.equal(rows[0].payload.url,'/calendario');
});

test('cuerpo operativo muestra fecha propuesta vigente, recursos en español y recorrido',async()=>{
  const event=await one(`insert into calendario_eventos(created_by,estado,tipo_transporte,fecha,fecha_confirmada,fecha_propuesta,hora_confirmada,hora_propuesta,transportes,paradas)
    values($1,'solicitado','hidrogrua','2030-10-07','2030-10-07','2030-10-08','09:00','14:30',
      '[{"tipo":"hidrogrua","cantidad":1}]','[{"lugar":"Galpón Pampa"},{"lugar":"Chubut"}]') returning id`,[TECH]);
  await q('delete from notificaciones_push_outbox');
  await q("select set_config('test.uid',$1,true)",[BUY]);
  await q("update calendario_eventos set estado='fecha_propuesta' where id=$1",[event.id]);
  const row=await one('select payload from notificaciones_push_outbox');
  assert.match(row.payload.body,/08\/10 14:30/);assert.match(row.payload.body,/Hidrogrúa/);assert.match(row.payload.body,/Galpón Pampa → Chubut/);
  assert.equal(row.payload.body.includes('07/10 09:00'),false);
  await q("update calendario_eventos set fecha_propuesta=(now() at time zone 'America/Argentina/Buenos_Aires')::date+1 where id=$1",[event.id]);
  assert.match((await one("select notificaciones_logistica_detalle(to_jsonb(e)) d from calendario_eventos e where id=$1",[event.id])).d,/Mañana 14:30/);
});

test('SQL de activación completo es válido, idempotente y no expone token en texto del cron',async()=>{
  const setupDB=new PGlite();
  try {
    await setupDB.exec(`create schema cron;
      create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,active boolean default true,command text);
      create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language sql as $$
        insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
        on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
      create schema vault;create table vault.secrets(id uuid default gen_random_uuid(),name text unique,secret text);
      create function vault.create_secret(p_secret text,p_name text) returns uuid language sql as $$
        insert into vault.secrets(secret,name) values(p_secret,p_name) returning id$$;
      create function vault.update_secret(p_id uuid,p_secret text) returns void language sql as $$update vault.secrets set secret=p_secret where id=p_id$$;
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create schema net;create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000)
        returns bigint language sql as $$select 1::bigint$$;`);
    const token='test-only-'+ 'x'.repeat(40);
    const source=(await readFile('supabase/sql-editor/activar_notificaciones_push_cron.sql','utf8'))
      .replace('https://YOUR_PROJECT_REF.supabase.co','https://test-project.supabase.co')
      .replace('REPLACE_WITH_THE_SAME_PUSH_CRON_SECRET',token);
    await setupDB.exec(source);await setupDB.exec(source);
    const jobs=(await setupDB.query('select * from cron.job')).rows;
    assert.equal(jobs.length,1);assert.equal(jobs[0].schedule,'* * * * *');assert.equal(jobs[0].command.includes(token),false);
    assert.equal((await setupDB.query('select count(*)::int n from vault.secrets')).rows[0].n,2);
  } finally { await setupDB.close(); }
});

test('migración completa funciona con profiles legacy sin activo, manteniendo lecturas y preferencias propias',async()=>{
  const legacyDB=new PGlite();
  try {
    await legacyDB.exec(fixtureSQL.replace(',activo boolean default true',''));
    await legacyDB.exec(await readFile('supabase/migrations/20261007150000_web_push_notificaciones.sql','utf8'));
    for (const uid of [TECH,BUY,OTHER]) await legacyDB.query("insert into notificaciones_push_suscripciones(user_id,endpoint,p256dh,auth) values($1,$2,'pk','auth')",[uid,'https://fcm.googleapis.com/fcm/send/'+uid]);
    await legacyDB.query("select set_config('test.uid',$1,false)",[TECH]);
    await legacyDB.query('insert into calendario_eventos(created_by) values($1)',[TECH]);
    assert.deepEqual((await legacyDB.query('select user_id from notificaciones_push_outbox order by user_id')).rows.map(r=>r.user_id),[BUY,OTHER]);
    await legacyDB.query("insert into purchase_requests(title,created_by) values('Pedido legacy',$1)",[TECH]);
    await legacyDB.query("update profiles set role='panol',sede='Chubut' where id=$1",[BUY]);
    await legacyDB.query("insert into panol_envios(titulo,sede,created_by) values('Materiales','Chubut',$1)",[TECH]);
    assert.equal((await legacyDB.query('select count(*)::int n from notificaciones_push_outbox')).rows[0].n,4);
    await legacyDB.exec('set role authenticated');
    await legacyDB.query('insert into notificaciones_push_preferencias(user_id) values($1)',[TECH]);
    await legacyDB.query('select notificaciones_marcar_leidas($1::jsonb)',[JSON.stringify([{clave:'logistica:legacy',leida_hasta:'2026-01-01T00:00:00Z'}])]);
    assert.equal((await legacyDB.query('select count(*)::int n from notificaciones_lecturas')).rows[0].n,1);
    await legacyDB.exec('reset role');
    assert.equal((await legacyDB.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='activo'")).rows[0].n,0);
  } finally { await legacyDB.close(); }
});
