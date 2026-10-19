import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db=new PGlite();
const TECH='00000000-0000-4000-8000-000000000001',CH='00000000-0000-4000-8000-000000000002',PA='00000000-0000-4000-8000-000000000003',AMBAS='00000000-0000-4000-8000-000000000004';
const M='00000000-0000-4000-8000-000000000010';
const q=async(sql,p=[]) => (await db.query(sql,p)).rows;
const cantidad=async(tabla) => Number((await q(`select count(*) n from ${tabla}`))[0].n);
const actor=(id) => q("select set_config('test.uid',$1,true)",[id]);
const producto=(creador=TECH,revisado=false) => q('insert into panol_materiales(id,descripcion,codigo,created_by,revisado) values($1,$2,$3,$4,$5)',[M,'PARLANTE FUSION XS-FL77SPGW','010-02433-00',creador,revisado]);
const movimiento=async(extra={}) => (await q(`insert into panol_obra_materiales_snapshot(material_id,requisito_material_id,stock_sede,estado,recepcion_estado,source,notas)
 values($1,$2,$3,$4,$5,$6,$7) returning id`,[extra.material||null,extra.requisito||null,extra.sede||'Chubut',extra.estado||'en_panol',extra.recepcion||'recibido',extra.source||'remito',extra.notas||null]))[0].id;

before(async()=>{
 await db.exec(`create role authenticated;create role anon;create role service_role;
 create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,sede text,is_admin boolean default false,is_demo boolean default false,activo boolean default true);
 grant select on profiles to authenticated;
 create table panol_materiales(id uuid primary key default gen_random_uuid(),descripcion text,codigo text,created_by uuid,revisado boolean default false,activo boolean default true,es_consumible boolean default false,es_requisito boolean default false);
 grant select,update on panol_materiales to authenticated;
 create table panol_envios(id uuid primary key default gen_random_uuid(),sede text);
 create table panol_obra_materiales_snapshot(id uuid primary key default gen_random_uuid(),material_id uuid,requisito_material_id uuid,stock_sede text,panol_envio_id uuid,
   descripcion text default 'PARLANTE DEL INGRESO',cantidad numeric default 3,estado text,recepcion_estado text,source text,notas text,egreso_nota text,recepcion_nota text,stock_nota text);
 create table notificaciones_mock(user_id uuid,event_key text,payload jsonb);
 create function notificaciones_push_encolar(p_users uuid[],p_actor uuid,p_categoria text,p_key text,p_payload jsonb,
   p_expires_at timestamptz default now()+interval '24 hours',p_disponible timestamptz default now(),p_agrupar boolean default false)
 returns integer language plpgsql as $$begin
   if current_setting('test.fail_queue',true)='true' then raise exception 'queue failure'; end if;
   insert into notificaciones_mock select u,p_key,p_payload from unnest(p_users) u;return cardinality(p_users);
 end$$;`);
 await db.exec(await readFile(new URL('../migrations/20261019180000_panol_confirmacion_productos_avisos.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec('begin');
 await q(`insert into profiles(id,role,sede,is_demo,activo) values
 ($1,'tecnica','ambas',false,true),($2,'panol','Chubut',false,true),($3,'panol','Pampa',false,true),($4,'panol','ambas',false,true),
 ('00000000-0000-4000-8000-000000000005','panol','Chubut',true,true),
 ('00000000-0000-4000-8000-000000000006','panol','Chubut',false,false),
 ('00000000-0000-4000-8000-000000000007','cliente','Chubut',false,true)`,[TECH,CH,PA,AMBAS]);
 await actor(TECH);
});
afterEach(async()=>{await db.exec('reset role;rollback');});

test('crear y vincular varios movimientos envía un solo aviso por producto a los pañoleros de sus sedes',async()=>{
 await producto();await movimiento();await movimiento();
 await q('update panol_obra_materiales_snapshot set material_id=$1',[M]);
 assert.equal(await cantidad('panol_productos_resueltos'),1);
 const aviso=(await q('select * from panol_productos_resueltos'))[0];
 assert.deepEqual(new Set(aviso.destinatarios),new Set([CH,AMBAS]));assert.deepEqual(aviso.sedes,['Chubut']);
 const push=(await q('select payload from notificaciones_mock'))[0].payload;
 assert.equal(push.title,'Producto confirmado');assert.equal(push.clave,`recepcion:producto-${aviso.id}`);assert.equal(push.url,`/stock-panol?material=${M}`);
 assert.equal(await cantidad('notificaciones_mock'),2);
 assert.deepEqual((await q('select cantidad from panol_obra_materiales_snapshot')).map(r=>Number(r.cantidad)),[3,3]);
 await q('update panol_obra_materiales_snapshot set material_id=$1',[M]);
 await q("update panol_obra_materiales_snapshot set cantidad=4");assert.equal(await cantidad('panol_productos_resueltos'),1);
});

test('vincular un producto existente confirmado también avisa e incluye las dos sedes afectadas',async()=>{
 await producto(TECH,true);await movimiento();await movimiento({sede:'Pampa'});
 await q('update panol_obra_materiales_snapshot set material_id=$1',[M]);
 const aviso=(await q('select * from panol_productos_resueltos'))[0];assert.deepEqual(new Set(aviso.destinatarios),new Set([CH,PA,AMBAS]));
 assert.deepEqual(aviso.sedes,['Chubut','Pampa']);
});

test('la ficha antigua creada por Pañol avisa al confirmarse, incluso desde la edición del catálogo',async()=>{
 await producto(CH);await movimiento({material:M,requisito:M});
 await q('update panol_materiales set revisado=true where id=$1',[M]);assert.equal(await cantidad('panol_productos_resueltos'),1);
 await q('select panol_confirmar_producto_catalogo($1)',[M]);assert.equal(await cantidad('panol_productos_resueltos'),1);
});

test('vincular a una ficha provisional no avisa hasta que Técnica la confirme',async()=>{
 await producto(CH);await movimiento();await q('update panol_obra_materiales_snapshot set material_id=$1',[M]);
 assert.equal(await cantidad('panol_productos_resueltos'),0);
 assert.equal((await q('select panol_confirmar_producto_catalogo($1) ok',[M]))[0].ok,true);
 assert.equal(await cantidad('panol_productos_resueltos'),1);assert.equal((await q('select panol_confirmar_producto_catalogo($1) ok',[M]))[0].ok,false);
});

test('Pañol no puede confirmar su ficha ni falsificar avisos; cada destinatario sólo ve los suyos',async()=>{
 await producto(CH);await movimiento({material:M});
 await actor(CH);await db.exec('savepoint permiso');
 await assert.rejects(q('select panol_confirmar_producto_catalogo($1)',[M]),/Sólo Técnica/);await db.exec('rollback to permiso');
 await db.exec('savepoint directo');await assert.rejects(q('update panol_materiales set revisado=true where id=$1',[M]),/confirmación de productos/);await db.exec('rollback to directo');
 await actor(TECH);await q('select panol_confirmar_producto_catalogo($1)',[M]);
 await db.exec('set local role authenticated');await actor(CH);assert.equal(await cantidad('panol_productos_resueltos'),1);
 await actor(PA);assert.equal(await cantidad('panol_productos_resueltos'),0);
 await db.exec('savepoint falso');await assert.rejects(q("insert into panol_productos_resueltos(descripcion) values('falso')"),/permission denied/);await db.exec('rollback to falso');
});

test('pedidos sin recibir, anulados y ajustes de ubicación no generan confirmaciones',async()=>{
 await producto();await movimiento({estado:'comprado',recepcion:'pendiente',source:'compra'});await movimiento({notas:'[anulado]'});await movimiento({source:'ajuste_ubicacion'});
 await q('update panol_obra_materiales_snapshot set material_id=$1',[M]);assert.equal(await cantidad('panol_productos_resueltos'),0);
});

test('una falla al encolar revierte la resolución y no pierde el aviso',async()=>{
 await producto(CH);await movimiento({material:M});await db.exec("select set_config('test.fail_queue','true',true);savepoint fallo");
 await assert.rejects(q('select panol_confirmar_producto_catalogo($1)',[M]),/queue failure/);await db.exec('rollback to fallo');
 assert.equal((await q('select revisado from panol_materiales'))[0].revisado,false);assert.equal(await cantidad('panol_productos_resueltos'),0);
});
