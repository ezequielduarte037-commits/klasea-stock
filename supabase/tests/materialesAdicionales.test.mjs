import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db=new PGlite();
const U='00000000-0000-0000-0000-000000000001',O='00000000-0000-0000-0000-000000000002',M='00000000-0000-0000-0000-000000000003',S='00000000-0000-0000-0000-000000000004';
const migration=await readFile(new URL('../migrations/20261019140000_materiales_pedidos_adicionales_cantidad.sql',import.meta.url),'utf8');
await db.exec(`
 create role anon;create role authenticated;
 create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table produccion_obras(id uuid primary key,codigo text);
 create table panol_materiales(id uuid primary key);
 create table panol_categorias(id uuid primary key,nombre text);
 create table purchase_requests(id uuid primary key default gen_random_uuid(),title text,description text,priority text,status text,project_id uuid references produccion_obras(id),destino text,source text,source_ref text,es_adicional boolean,tipo_pedido text,created_by uuid default auth.uid());
 create table purchase_request_items(id uuid primary key default gen_random_uuid(),request_id uuid references purchase_requests(id),description text,quantity text,unit text,destination text,material_id uuid references panol_materiales(id),requisito_material_id uuid references panol_materiales(id),especificaciones jsonb check(jsonb_typeof(especificaciones)='object'),catalog_source text,notes text,supplier_id uuid,supplier_name text,supplier_description text,supplier_code text,supplier_components jsonb check(jsonb_typeof(supplier_components)='array'));
 create table panol_obra_materiales_snapshot(id uuid primary key default gen_random_uuid(),obra_id uuid references produccion_obras(id),material_id uuid references panol_materiales(id),requisito_material_id uuid references panol_materiales(id),descripcion text,codigo text,cantidad numeric,unidad text,proveedor text,rubro text,tipo text,tipo_label text,precio_unitario numeric,moneda text,notas text,source text,es_adicional boolean,estado text,purchase_request_id uuid references purchase_requests(id),purchase_request_item_id uuid references purchase_request_items(id),panol_envio_id uuid,panol_envio_item_id uuid,recepcion_estado text,egreso_at timestamptz,especificaciones jsonb,especificaciones_origen text);
 create table panol_obra_addons(id uuid primary key default gen_random_uuid(),obra_id uuid references produccion_obras(id),material_id uuid references panol_materiales(id),descripcion text,cantidad numeric,proveedor text,tipo text check(tipo in ('adicional','opcional')),observaciones text,codigo text,unidad text,categoria_id uuid references panol_categorias(id),proveedor_id uuid,precio_unitario numeric,moneda text,imagen_url text,links jsonb,codigo_barra text,variantes jsonb,created_by uuid default auth.uid());
 insert into produccion_obras values('${O}','37-40');insert into panol_materiales values('${M}');
 insert into panol_obra_materiales_snapshot(id,obra_id,material_id,requisito_material_id,descripcion,cantidad,unidad,tipo,source,estado,recepcion_estado,egreso_at) values('${S}','${O}','${M}','${M}','LUZ DE PARRILLA',1,'unidad','base','matriz','egresado','recibido',now());
 select set_config('request.jwt.claim.sub','${U}',false);
`);
await db.exec(`alter table panol_obra_materiales_snapshot add column tipo_pedido text default 'estandar',add column stock_sede text,add column recepcion_cantidad_recibida text;
 -- Compatibilidad con el trigger existente: es_adicional depende del tipo de pedido.
 create function panol_snapshot_set_tipo() returns trigger language plpgsql as $$begin
 if new.purchase_request_id is not null then select coalesce(pr.tipo_pedido,new.tipo_pedido) into new.tipo_pedido from purchase_requests pr where pr.id=new.purchase_request_id; end if;
 if coalesce(new.stock_sede,'')='Pampa' and new.tipo_pedido='estandar' then new.tipo_pedido:='stock'; end if;
 new.es_adicional:=(new.tipo_pedido='adicional');return new;end;$$;
 create trigger trg_snapshot_set_tipo before insert or update on panol_obra_materiales_snapshot for each row execute function panol_snapshot_set_tipo();`);
await db.exec(migration);
await db.exec(migration); // idempotencia de la instalación
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const item=(quantity=4,snapshot_id=S)=>({snapshot_id,description:'LUZ DE PARRILLA',quantity,unit:'unidad',material_id:M,requisito_material_id:M,especificaciones:{color:'cálida'},supplier_components:[],notes:'Extra cockpit'});
const pedir=async(items,token=crypto.randomUUID(),titulo='37-40 - Luces adicionales')=>(await q('select materiales_pedir_adicional_obra($1,$2,$3,$4,$5) as resultado',[O,titulo,JSON.stringify(items),JSON.stringify(items),token]))[0].resultado;
const original=(await q('select * from panol_obra_materiales_snapshot where id=$1',[S]))[0];
const S2='00000000-0000-0000-0000-000000000005';
await q("insert into panol_obra_materiales_snapshot(id,obra_id,material_id,requisito_material_id,descripcion,cantidad,unidad,tipo,source,estado) values($1,$2,$3,$3,'Otra luz',1,'unidad','base','matriz','pendiente')",[S2,O,M]);

test('4 unidades adicionales preservan la unidad entregada y enlazan compra, ficha y recepción',async()=>{
 const r=await pedir([item()]);
 assert.equal(r.request.es_adicional,true);assert.equal(r.request.tipo_pedido,'adicional');
 const [linea]=await q('select * from purchase_request_items where request_id=$1',[r.request.id]);assert.equal(Number(linea.quantity),4);
 const [snap]=await q('select * from panol_obra_materiales_snapshot where purchase_request_item_id=$1',[linea.id]);
 assert.equal(snap.source,'adicional_obra');assert.equal(Number(snap.cantidad),4);assert.equal(snap.estado,'pedido');assert.equal(snap.recepcion_estado,null);assert.equal(snap.egreso_at,null);
 assert.deepEqual(snap.especificaciones,{color:'cálida'});
 const [addon]=await q('select * from panol_obra_addons where obra_snapshot_id=$1',[snap.id]);assert.equal(Number(addon.cantidad),4);assert.equal(addon.material_id,M);
 assert.deepEqual((await q('select * from panol_obra_materiales_snapshot where id=$1',[S]))[0],original);
});

test('un reintento no crea otro pedido y otro envío sí genera un adicional independiente',async()=>{
 const token=crypto.randomUUID(),antes=(await q('select count(*)::int as n from purchase_requests'))[0].n;
 const a=await pedir([item(7)],token),b=await pedir([item(7)],token);
 assert.equal(a.request.id,b.request.id);assert.equal(b.reutilizado,true);
 assert.equal((await q('select count(*)::int as n from purchase_requests'))[0].n,antes+1);
 await assert.rejects(pedir([item(8)],token),/ya fue creado/);
 const c=await pedir([item(7)]);assert.notEqual(a.request.id,c.request.id);
 const snaps=await q('select id from panol_obra_materiales_snapshot where purchase_request_id in ($1,$2)',[a.request.id,c.request.id]);assert.equal(new Set(snaps.map(s=>s.id)).size,2);
});

test('si un ítem es inválido se revierte todo el envío, incluidos los adicionales',async()=>{
 const antes=await q('select (select count(*) from purchase_requests)::int pedidos,(select count(*) from purchase_request_items)::int items,(select count(*) from panol_obra_materiales_snapshot)::int snapshots,(select count(*) from panol_obra_addons)::int addons');
 for(const cantidad of [0,-1,'NaN','Infinity',null])await assert.rejects(pedir([item(2),item(cantidad,S2)]),/cantidad mayor/);
 await assert.rejects(pedir([item(2),item(3)]),/repetidos/);
 await assert.rejects(pedir([item(2),item(3,'00000000-0000-0000-0000-000000000099')]),/no pertenece/);
 assert.deepEqual(await q('select (select count(*) from purchase_requests)::int pedidos,(select count(*) from purchase_request_items)::int items,(select count(*) from panol_obra_materiales_snapshot)::int snapshots,(select count(*) from panol_obra_addons)::int addons'),antes);
});

test('el catálogo permite repetir el mismo material en dos adicionales sin modificar la matriz',async()=>{
 const datos={material_id:M,descripcion:'LUZ DE PARRILLA',cantidad:3,unidad:'unidad'};
 const [a]=await q('select a.* from materiales_crear_adicional_obra($1,$2) a',[O,JSON.stringify(datos)]);
 const [b]=await q('select a.* from materiales_crear_adicional_obra($1,$2) a',[O,JSON.stringify(datos)]);
 assert.notEqual(a.id,b.id);assert.notEqual(a.obra_snapshot_id,b.obra_snapshot_id);
 const r=await pedir([{...item(5,a.obra_snapshot_id),addon_id:a.id}]);
 const [snap]=await q('select * from panol_obra_materiales_snapshot where purchase_request_id=$1',[r.request.id]);
 assert.equal(snap.id,a.obra_snapshot_id);assert.equal(Number(snap.cantidad),5);
 assert.equal(Number((await q('select cantidad from panol_obra_addons where id=$1',[a.id]))[0].cantidad),5);
 assert.deepEqual((await q('select * from panol_obra_materiales_snapshot where id=$1',[S]))[0],original);
});

test('RLS del operador se conserva y un rechazo revierte el pedido completo',async()=>{
 await db.exec(`grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;grant select,insert,update on all tables in schema public to authenticated;
 alter table panol_obra_materiales_snapshot enable row level security;
 create policy leer on panol_obra_materiales_snapshot for select to authenticated using(true);
 create policy insertar on panol_obra_materiales_snapshot for insert to authenticated with check(false);
 set role authenticated;`);
 const antes=(await q('select count(*)::int n from purchase_requests'))[0].n;
 try{await assert.rejects(pedir([item(2)]),/row-level security/);assert.equal((await q('select count(*)::int n from purchase_requests'))[0].n,antes);}
 finally{await db.exec('reset role;');}
});

test('reasignar mueve sólo el adicional elegido y rechaza los que ya tienen compra',async()=>{
 const destino='00000000-0000-0000-0000-000000000090';await q('insert into produccion_obras values($1,$2)',[destino,'37-41']);
 const crear=async()=> (await q('select a.* from materiales_crear_adicional_obra($1,$2) a',[O,JSON.stringify({material_id:M,descripcion:'LUZ DE PARRILLA',cantidad:2})]))[0];
 const a=await crear(),b=await crear();
 const [antes]=await q('select * from panol_obra_materiales_snapshot where id=$1',[b.obra_snapshot_id]);
 await q('select materiales_reasignar_adicional_obra($1,$2)',[a.id,destino]);
 assert.equal((await q('select obra_id from panol_obra_materiales_snapshot where id=$1',[a.obra_snapshot_id]))[0].obra_id,destino);
 assert.deepEqual((await q('select * from panol_obra_materiales_snapshot where id=$1',[b.obra_snapshot_id]))[0],antes);
 await pedir([{...item(2,b.obra_snapshot_id),addon_id:b.id}]);
 await assert.rejects(q('select materiales_reasignar_adicional_obra($1,$2)',[b.id,destino]),/compras o movimientos/);
});

test('la recepción de una parte conserva la cantidad pedida y marca parcial',async()=>{
 const r=await pedir([item(4)]);
 await q("update panol_obra_materiales_snapshot set recepcion_estado='recibido',estado='en_panol',recepcion_cantidad_recibida='2' where purchase_request_id=$1",[r.request.id]);
 const [s]=await q('select * from panol_obra_materiales_snapshot where purchase_request_id=$1',[r.request.id]);
 assert.equal(Number(s.cantidad),4);assert.equal(s.recepcion_estado,'parcial');assert.equal(s.estado,'parcial');assert.equal(s.es_adicional,true);
 const [a]=await q('select * from panol_obra_addons where obra_snapshot_id=$1',[s.id]);
 const nuevo=await pedir([{...item(3,s.id),addon_id:a.id}]);
 const [otro]=await q('select * from panol_obra_materiales_snapshot where purchase_request_id=$1',[nuevo.request.id]);
 assert.notEqual(otro.id,s.id);assert.equal(Number(otro.cantidad),3);assert.equal(otro.recepcion_estado,null);
});

test('sin sesión no se permiten altas ni pedidos',async()=>{
 await db.exec("select set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(pedir([item()]),/autenticado/);
 await assert.rejects(q('select materiales_crear_adicional_obra($1,$2)',[O,JSON.stringify({descripcion:'Prueba',cantidad:1})]),/autenticado/);
 await db.close();
});
