import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {PGlite} from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
const PAN='00000000-0000-0000-0000-000000000001',RRHH='00000000-0000-0000-0000-000000000002',TEC='00000000-0000-0000-0000-000000000003',COMP='00000000-0000-0000-0000-000000000004',PANADMIN='00000000-0000-0000-0000-000000000005';
const OLD='00000000-0000-0000-0000-000000000011',NUEVO='00000000-0000-0000-0000-000000000012';
const query=async(s,p=[]) => (await db.query(s,p)).rows;
const one=async(s,p=[]) => (await query(s,p))[0];
const actor=async(id)=>db.query("select set_config('test.uid',$1,false)",[id]);
const alta=async(id=NUEVO,dni='12345678',nombre='Persona prueba')=>(await one('select consumibles_alta_externo($1,$2,$3,$4,$5) as r',[id,nombre,'Empresa',dni,'Chubut'])).r;
const confirmar=async(id,datos={})=>(await one('select rrhh_guardar_alta_empleado($1,$2::jsonb) as r',[id,JSON.stringify({nombre:'Nombre revisado',dni:'12345678',grupo:'casa',ficha:true,sede:'Pampa',...datos})])).r;
let migration;
before(async()=>{
 await db.exec(`create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,username text,role text,is_admin boolean default false);
 insert into profiles values('${PAN}','operador.panol','panol',false),('${RRHH}','rrhh','rrhh',false),('${TEC}','tecnica','tecnica',false),('${COMP}','compras','compras',false),('${PANADMIN}','panol.admin','panol',true);
 create function panol_es_operador_solicitudes(uuid) returns boolean language sql as $$select exists(select 1 from profiles where id=$1)$$;
 create table rrhh_contratistas(id uuid primary key default gen_random_uuid(),nombre text,activo boolean,externo boolean,created_at timestamptz default now());
 create table rrhh_empleados(id uuid primary key default gen_random_uuid(),nombre text,dni text unique,grupo text,contratista_id uuid references rrhh_contratistas(id),ficha boolean default true,activo boolean default true,sede text,notas text,created_at timestamptz default now(),foto_url text,nfc_uid text unique,nfc_asignado_at timestamptz,nfc_asignado_por uuid);
 insert into rrhh_empleados(id,nombre,dni,notas) values('${OLD}','Alta antigua','88888888','Externo: alta desde el mostrador de consumibles el 16/10/2026 por operador.panol. Completar en RRHH.');
 create table retiros(empleado_id uuid references rrhh_empleados(id),cantidad numeric);
 insert into retiros values('${OLD}',5);`);
 const base=await readFile('supabase/migrations/20261013200000_consumibles_externos.sql','utf8');
 await db.exec(base.match(/create or replace function public\.consumibles_alta_externo\([\s\S]+?\$\$;/)[0]);
 migration=await readFile('supabase/migrations/20261019110000_rrhh_altas_provisorias_panol.sql','utf8');
 await db.exec(migration);
});
after(()=>db.close());
beforeEach(async()=>{await actor('');await db.exec(`delete from rrhh_empleados where id <> '${OLD}';`);});
test('reclasifica el alta histórica conservando ID, notas y retiros; rerun no la duplica',async()=>{
 const old=await one('select * from rrhh_empleados where id=$1',[OLD]);
 assert.equal(old.provisorio,true);assert.equal(old.ficha,false);assert.equal(old.alta_creado_por,PAN);assert.equal(old.alta_origen,'panol');
 assert.equal((await one('select sum(cantidad) as n from retiros')).n,'5');
 await db.exec(migration);assert.equal((await query('select * from rrhh_empleados')).length,1);
});
test('Pañol registra provisoriamente; conserva idempotencia por id, DNI y nombre/empresa',async()=>{
 await actor(PAN);const a=await alta();assert.equal(a.provisorio,true);
 assert.equal((await alta()).id,a.id);assert.equal((await alta('00000000-0000-0000-0000-000000000013')).id,a.id);
 assert.equal((await alta('00000000-0000-0000-0000-000000000014',null)).id,a.id);
 const e=await one('select * from rrhh_empleados where id=$1',[a.id]);assert.equal(e.alta_creado_por,PAN);assert.equal(e.ficha,false);
});
test('el mostrador crea provisorios incluso para otros operadores',async()=>{
 await actor(TEC);assert.equal((await alta()).provisorio,true);
});
test('Pañol y Compras no confirman y Pañol administrador tampoco elude la revisión',async()=>{
 await actor(PAN);await alta();
 for(const id of [PAN,COMP,PANADMIN]){await actor(id);await assert.rejects(confirmar(NUEVO),/RRHH o Técnica/);await assert.rejects(db.query('update rrhh_empleados set provisorio=false where id=$1',[NUEVO]),/RRHH o Técnica/);}
 assert.equal((await one('select provisorio from rrhh_empleados where id=$1',[NUEVO])).provisorio,true);
});
test('un INSERT directo de Pañol administrador también queda provisorio, sin fichar',async()=>{
 await actor(PANADMIN);const e=await one("insert into rrhh_empleados(nombre,dni,provisorio,ficha) values('Intento directo','44444444',false,true) returning *");
 assert.equal(e.provisorio,true);assert.equal(e.ficha,false);assert.equal(e.alta_confirmado_por,null);
});
test('RRHH y Técnica confirman con datos revisados y auditoría del aprobador; conservan retiros',async()=>{
 for(const id of [RRHH,TEC]){
  await actor(PAN);await alta();await db.query('insert into retiros values($1,3)',[NUEVO]);
  await actor(id);const e=await confirmar(NUEVO);assert.equal(e.provisorio,false);assert.equal(e.alta_confirmado_por,id);assert.ok(e.alta_confirmado_at);assert.equal(e.alta_creado_por,PAN);assert.equal(e.grupo,'casa');assert.equal(e.ficha,true);
  assert.equal((await one('select sum(cantidad) as n from retiros where empleado_id=$1',[NUEVO])).n,'3');
  await assert.rejects(confirmar(NUEVO),/ya está confirmado/);await actor('');await db.query('delete from retiros where empleado_id=$1',[NUEVO]);await db.query('delete from rrhh_empleados where id=$1',[NUEVO]);
 }
});
test('no aprueba sin DNI válido, con DNI duplicado ni con campos de procedencia falsificados',async()=>{
 await actor(PAN);await alta();await actor(RRHH);
 await assert.rejects(confirmar(NUEVO,{dni:''}),/DNI válido/);
 await assert.rejects(confirmar(NUEVO,{dni:'88888888'}),/duplicate key/);
 const e=await confirmar(NUEVO,{alta_creado_por:RRHH,alta_origen:'rrhh',alta_confirmado_por:PAN});
 assert.equal(e.alta_creado_por,PAN);assert.equal(e.alta_origen,'panol');assert.equal(e.alta_confirmado_por,RRHH);
});
test('Técnica crea un alta definitiva, pero ningún alta rápida confirma un DNI existente',async()=>{
 await actor(TEC);const e=await confirmar(null);assert.equal(e.provisorio,false);assert.equal(e.alta_confirmado_por,TEC);
 await actor(PAN);const reused=await alta();assert.equal(reused.id,e.id);assert.equal(reused.provisorio,false);
});
