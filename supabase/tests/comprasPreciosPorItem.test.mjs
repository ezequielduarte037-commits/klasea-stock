import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {PGlite} from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db=new PGlite();
const MANAGER='00000000-0000-4000-8000-000000000001';
const REQUESTER='00000000-0000-4000-8000-000000000002';
const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
const actor=id=>q("select set_config('test.uid',$1,true)",[id]);
const fila=async(id)=>(await q('select * from purchase_requests where id=$1',[id]))[0];
const lineas=id=>q('select * from purchase_request_items where request_id=$1 order by description',[id]);
const crear=async(cantidad=2)=>{
  const id=(await q("insert into purchase_requests(status,created_by) values('cotizando',$1) returning id",[REQUESTER]))[0].id;
  const items=[];
  for(let i=0;i<cantidad;i++)items.push((await q('insert into purchase_request_items(request_id,description,quantity) values($1,$2,$3) returning *',[id,`Producto ${i+1}`,i===0?'2 unidades':'1,5 m²']))[0]);
  return {id,items};
};
const precios=(items,amount=10)=>items.map((i,index)=>({id:i.id,actual_amount:amount+index}));
const guardar=async(id,items,total=null,confirmar=true)=>(await q('select purchase_request_guardar_costos($1,$2::jsonb,$3,$4) data',[id,JSON.stringify(items),total,confirmar]))[0].data;
const rechaza=async(action,pattern=/ítem|importe|precio|lista/)=>{
  await db.exec('savepoint fallo');
  await assert.rejects(action(),pattern);
  await db.exec('rollback to fallo');
};

before(async()=>{
  await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;
    create schema auth;grant usage on schema auth to authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_admin boolean default false);
    insert into profiles(id,role) values('${MANAGER}','compras'),('${REQUESTER}','tecnica');
    create table purchase_requests(id uuid primary key default gen_random_uuid(),status text not null,
      actual_amount numeric(12,2),estimated_amount numeric(12,2),title text default 'Pedido',created_by uuid);
    create table purchase_request_items(id uuid primary key default gen_random_uuid(),request_id uuid references purchase_requests on delete cascade,
      description text,quantity text,unit text default 'unidad',status text default 'pendiente',created_at timestamptz default now(),updated_at timestamptz default now());
    grant select on profiles to authenticated,service_role;
    grant all on purchase_requests,purchase_request_items to authenticated,service_role;
    alter table purchase_requests enable row level security;alter table purchase_request_items enable row level security;
    create policy pedidos on purchase_requests using(created_by=auth.uid() or exists(select 1 from profiles where id=auth.uid() and role='compras'));
    create policy items on purchase_request_items using(exists(select 1 from purchase_requests r where r.id=request_id));
    -- Historial anterior a exigir precios.
    insert into purchase_requests(id,status,created_by) values('00000000-0000-4000-8000-000000000010','comprado','${REQUESTER}');
    insert into purchase_request_items(request_id,description) values('00000000-0000-4000-8000-000000000010','Sin desglose histórico');`);
  await db.exec(await readFile(new URL('../migrations/20261023120000_compras_precio_obligatorio.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261023140000_compras_precios_por_item.sql',import.meta.url),'utf8'));
  const arrastre=await readFile(new URL('../migrations/20260915100000_pedido_arrastra_sus_lineas.sql',import.meta.url),'utf8');
  await db.exec(arrastre.match(/create or replace function public.purchase_item_rank[\s\S]*?\$rank\$;/)[0]);
  await db.exec(arrastre.match(/create or replace function public.purchase_request_arrastra_lineas[\s\S]*?\$fn\$;/)[0]);
  await db.exec(`create trigger arrastre after update of status on purchase_requests for each row execute function purchase_request_arrastra_lineas();
    create function simular_fallo_precio() returns trigger language plpgsql as $$begin
      if new.description='Falla' and new.actual_amount is distinct from old.actual_amount then raise exception 'Fallo simulado al guardar un ítem';end if;return new;end$$;
    create trigger fallo_precio before update on purchase_request_items for each row execute function simular_fallo_precio();`);
});
after(()=>db.close());
beforeEach(async()=>{await db.exec('begin');await actor(MANAGER);await db.exec('set local role authenticated');});
afterEach(()=>db.exec('reset role;rollback'));

test('exige todos los importes, calcula centavos exactos y confirma junto con los renglones',async()=>{
  const {id,items}=await crear();
  await rechaza(()=>guardar(id,[{id:items[0].id,actual_amount:12.34}]));
  assert.equal((await fila(id)).status,'cotizando');assert((await lineas(id)).every(i=>i.actual_amount===null));
  const result=await guardar(id,[{id:items[0].id,actual_amount:12.34},{id:items[1].id,actual_amount:0.01}],999999);
  assert.equal(result.request.status,'comprado');assert.equal(Number(result.request.actual_amount),12.35);assert.equal(result.request.itemized_costs,true);
  assert.deepEqual(result.items.map(i=>i.status),['pedido','pedido']);
  assert.deepEqual((await lineas(id)).map(i=>Number(i.actual_amount)),[12.34,0.01]);
});

test('no confirma con total global ni reparte el total anterior entre varios productos',async()=>{
  const {id}=await crear();
  await q('update purchase_requests set actual_amount=500 where id=$1',[id]);
  await rechaza(()=>q("update purchase_requests set status='comprado',actual_amount=500 where id=$1",[id]));
  assert.equal(Number((await fila(id)).actual_amount),500);assert((await lineas(id)).every(i=>i.actual_amount===null));
});

test('rechaza precio nulo, cero, negativo, monto que redondea a cero y formatos no numéricos',async()=>{
  const {id,items}=await crear();
  for(const amount of [null,0,-1,0.001,'texto','Infinity']) {
    const data=precios(items);data[1].actual_amount=amount;
    await rechaza(()=>guardar(id,data));
    assert.equal((await fila(id)).status,'cotizando');assert((await lineas(id)).every(i=>i.actual_amount===null));
  }
});

test('rechaza duplicados, IDs ajenos, cancelados y listas desactualizadas sin guardar parte de la compra',async()=>{
  const a=await crear(),b=await crear();
  await rechaza(()=>guardar(a.id,precios([a.items[0],a.items[0]])));
  await rechaza(()=>guardar(a.id,precios([a.items[0],b.items[0]])));
  await q("update purchase_request_items set status='cancelado' where id=$1",[a.items[1].id]);
  await rechaza(()=>guardar(a.id,precios(a.items)));
  assert((await lineas(a.id)).every(i=>i.actual_amount===null));
  const result=await guardar(a.id,precios([a.items[0]],100));assert.equal(Number(result.request.actual_amount),100);
});

test('una falla de la segunda fila revierte también el precio guardado en la primera',async()=>{
  const {id,items}=await crear();await q("update purchase_request_items set description='Falla' where id=$1",[items[1].id]);
  await rechaza(()=>guardar(id,precios(items)),/Fallo simulado/);
  assert((await lineas(id)).every(i=>i.actual_amount===null));assert.equal((await fila(id)).status,'cotizando');
});

test('un total fuera del rango admitido revierte todos los importes',async()=>{
  const {id,items}=await crear();
  await rechaza(()=>guardar(id,items.map(i=>({id:i.id,actual_amount:9999999999.99}))),/overflow/);
  assert((await lineas(id)).every(i=>i.actual_amount===null));assert.equal((await fila(id)).status,'cotizando');
});

test('editar precios conserva Recibido y recalcula el total; el total no se puede falsear ni quitar el desglose',async()=>{
  const {id,items}=await crear();await guardar(id,precios(items));await q("update purchase_requests set status='recibido' where id=$1",[id]);
  const result=await guardar(id,precios(items,20),null,false);
  assert.equal(result.request.status,'recibido');assert.equal(Number(result.request.actual_amount),41);
  await q('update purchase_requests set actual_amount=9999 where id=$1',[id]);assert.equal(Number((await fila(id)).actual_amount),41);
  await rechaza(()=>q('update purchase_requests set itemized_costs=false where id=$1',[id]),/calcula por ítem/);
  await rechaza(()=>q('update purchase_request_items set actual_amount=null where id=$1',[items[0].id]));
  assert.equal(Number((await fila(id)).actual_amount),41);
});

test('altas, cancelaciones y borrados de renglones mantienen el total sin perder precios',async()=>{
  const {id,items}=await crear();await guardar(id,precios(items,10));
  await rechaza(()=>q("insert into purchase_request_items(request_id,description) values($1,'Sin precio')",[id]));
  await q("insert into purchase_request_items(request_id,description,actual_amount) values($1,'Extra',5.5)",[id]);
  assert.equal(Number((await fila(id)).actual_amount),26.5);
  await q("update purchase_request_items set status='cancelado' where id=$1",[items[1].id]);assert.equal(Number((await fila(id)).actual_amount),15.5);
  await q('delete from purchase_request_items where id=$1',[items[0].id]);assert.equal(Number((await fila(id)).actual_amount),5.5);
});

test('históricos sin desglose siguen recibiéndose; al editar sus precios exige completar cada ítem',async()=>{
  const id='00000000-0000-4000-8000-000000000010';
  await q("update purchase_requests set title='Histórico',status='recibido' where id=$1",[id]);
  assert.equal((await fila(id)).actual_amount,null);assert.equal((await fila(id)).itemized_costs,false);
  await guardar(id,precios(await lineas(id),50),null,false);assert.equal(Number((await fila(id)).actual_amount),50);assert.equal((await fila(id)).status,'recibido');
});

test('una recepción parcial automática de un pedido histórico sigue funcionando sin inventar precios',async()=>{
  await db.exec('reset role');
  await db.exec(`create function recepcion_historica_mock() returns trigger language plpgsql as $$begin
    update purchase_requests set status=case when new.status='recibido' then 'recibido' else 'comprado' end where id=new.request_id;
    return new;end$$;
    create trigger recepcion_historica_mock after update of status on purchase_request_items
    for each row when (new.description='Sin desglose histórico') execute function recepcion_historica_mock();`);
  await db.exec('set local role authenticated');
  const id='00000000-0000-4000-8000-000000000010';
  await q("update purchase_request_items set status='recibido' where request_id=$1",[id]);
  await q("update purchase_request_items set status='parcial' where request_id=$1",[id]);
  assert.equal((await fila(id)).status,'comprado');assert.equal((await fila(id)).actual_amount,null);assert.equal((await fila(id)).itemized_costs,false);
});

test('los pedidos sin renglones admiten el importe general, sin inventar ítems',async()=>{
  const {id}=await crear(0);await rechaza(()=>guardar(id,[],0));
  const result=await guardar(id,[],150);assert.equal(Number(result.request.actual_amount),150);assert.equal(result.request.itemized_costs,false);assert.equal(result.items.length,0);
});

test('sólo Compras modifica precios; el creador conserva edición de descripción y la RLS sigue activa',async()=>{
  const {id,items}=await crear();await guardar(id,precios(items));await actor(REQUESTER);
  await rechaza(()=>guardar(id,precios(items,40)),/Sólo Compras/);
  await rechaza(()=>q('update purchase_request_items set actual_amount=50 where id=$1',[items[0].id]),/Sólo Compras/);
  await rechaza(()=>q('update purchase_request_items set actual_amount=null where id=$1',[items[0].id]),/Sólo Compras/);
  await q("update purchase_request_items set description='Nombre corregido' where id=$1",[items[0].id]);
  assert.equal((await q('select description from purchase_request_items where id=$1',[items[0].id]))[0].description,'Nombre corregido');
  await actor('00000000-0000-4000-8000-000000000099');assert.equal((await lineas(id)).length,0);
});
