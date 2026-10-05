// Preparación: npm install --prefix tmp/torneria-db-test --no-audit --no-fund @electric-sql/pglite
// Ejecución: node --test supabase/tests/torneriaRecepcionesAnticipadas.test.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const TUBO = '00000000-0000-0000-0000-000000000075';
const OTRO = '00000000-0000-0000-0000-000000000076';
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

before(async () => {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.is_torneria_viewer(uuid) returns boolean language sql as 'select true';
    create table panol_materiales(id uuid primary key default gen_random_uuid(), descripcion text, es_requisito boolean default false);
    create table torneria_procesos(id uuid primary key default gen_random_uuid(), obra_id uuid, estado text default 'activo');
    create table torneria_items(id uuid primary key default gen_random_uuid(), proceso_id uuid references torneria_procesos,
      clave text default 'tubo_bocina', descripcion text default 'Tubo', material_id uuid references panol_materiales,
      cantidad numeric default 2, activo boolean default true, no_lleva boolean default false, es_resultado boolean default false,
      compra_estado text default 'pendiente_solicitud', purchase_request_id uuid, purchase_request_item_id uuid,
      solicitado_at timestamptz, comprado_at timestamptz, recibido_astillero_at timestamptz, created_at timestamptz default now(), orden int default 0);
    create table torneria_item_materiales(item_id uuid references torneria_items on delete cascade, material_id uuid references panol_materiales,
      cantidad numeric, primary key(item_id,material_id));
    create table torneria_plantilla_items(id uuid primary key default gen_random_uuid(), clave text, es_resultado boolean default false,
      material_id uuid references panol_materiales, cantidad numeric default 2);
    create table torneria_plantilla_item_materiales(plantilla_item_id uuid references torneria_plantilla_items, material_id uuid,
      cantidad numeric, primary key(plantilla_item_id,material_id));
    create table panol_envios(id uuid primary key default gen_random_uuid(), sede text);
    create table panol_obra_materiales_snapshot(id uuid primary key default gen_random_uuid(), obra_id uuid, obra_origen_id uuid,
      material_id uuid references panol_materiales, descripcion text default 'Tubo', codigo text, cantidad numeric,
      unidad text default 'unidad', proveedor text, rubro text, precio_unitario numeric, moneda text,
      source text default 'tecnica', estado text default 'pendiente', recepcion_estado text,
      recepcion_cantidad_recibida text, recepcion_updated_at timestamptz, created_at timestamptz default now(), updated_at timestamptz,
      cantidad_egresada numeric default 0, stock_sede text default 'Chubut', purchase_request_item_id uuid, panol_envio_id uuid,
      egreso_at timestamptz, egreso_por uuid, egreso_nota text, retirado_por text, sector_destino text);
    create table torneria_operacion_items(id uuid primary key default gen_random_uuid(), item_id uuid references torneria_items,
      cantidad_requerida numeric default 2);
    create table torneria_movimientos(id uuid primary key default gen_random_uuid(), tipo text default 'salida', destino text default 'Tornería',
      responsable text default 'Mecánica', remito text, fecha timestamptz default now());
    create table torneria_movimiento_items(id uuid primary key default gen_random_uuid(), movimiento_id uuid references torneria_movimientos,
      operacion_item_id uuid references torneria_operacion_items, cantidad numeric);
    insert into panol_materiales(id,descripcion) values
      ('${TUBO}','Tubo PRFV (tubo bocina) D.int=75mm, D.ext=92mm, largo=1m'),
      ('${OTRO}','Tubo PRFV D.int=76mm, esp=7mm');
    insert into torneria_plantilla_items(clave) values ('tubo_bocina');
    insert into torneria_plantilla_items(clave,es_resultado) values ('tubo_bocina',true);
  `);
  const stockMigration = await readFile('supabase/migrations/20260813133000_panol_egreso_requisitos_concretos_y_lotes.sql', 'utf8');
  const stockFn = stockMigration.match(/create or replace function public\.panol_stock_movimiento_delta\([\s\S]+?\$\$;/)[0];
  await db.exec(stockFn);
  await db.exec(await readFile('supabase/migrations/20260915220000_torneria_salida_saca_del_panol.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261005133000_torneria_recepciones_anticipadas.sql', 'utf8'));
  await db.exec(`create trigger trg_torneria_items_estampar_compra before update on torneria_items
    for each row execute function public.torneria_items_estampar_compra();`);
});
after(async () => db.close());
beforeEach(async () => db.exec('begin'));
afterEach(async () => db.exec('rollback'));

async function process() {
  return one('insert into torneria_procesos(obra_id) values(gen_random_uuid()) returning *');
}
async function item(p, quantity = 2, options = {}) {
  return one(`insert into torneria_items(proceso_id,material_id,cantidad,compra_estado,purchase_request_item_id,purchase_request_id,no_lleva,es_resultado)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [p.id, options.material ?? TUBO, quantity, options.state || 'pendiente_solicitud', options.requestItem || null,
      options.request || null, options.noLleva || false, options.result || false]);
}
async function stock(p, quantity = 2, options = {}) {
  return one(`insert into panol_obra_materiales_snapshot(obra_id,material_id,cantidad,estado,recepcion_estado,
    recepcion_cantidad_recibida,recepcion_updated_at,source,purchase_request_item_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [p?.obra_id || null, options.material || TUBO, quantity, options.state || 'en_panol', options.reception || 'recibido',
      options.received ?? String(quantity), '2026-09-25T12:00:00Z', options.source || 'tecnica', options.requestItem || null]);
}
const state = (i) => one('select * from torneria_items where id=$1', [i.id]);
const allocations = (i) => q('select * from torneria_recepciones_panol where item_id=$1', [i.id]);
async function send(i, quantity, operation = null) {
  const op = operation || await one('insert into torneria_operacion_items(item_id,cantidad_requerida) values($1,$2) returning *', [i.id, i.cantidad]);
  const mov = await one('insert into torneria_movimientos default values returning *');
  await q('insert into torneria_movimiento_items(movimiento_id,operacion_item_id,cantidad) values($1,$2,$3)', [mov.id,op.id,quantity]);
  return { op, mov };
}

test('vincula la plantilla del tubo exacto y conserva el resultado K55', async () => {
  const templates = await q('select * from torneria_plantilla_items order by es_resultado');
  assert.equal(templates[0].material_id, TUBO);
  assert.equal(templates[1].material_id, null);
});
test('aviso pendiente no es recepción; confirmar Pañol lo reconoce sin pedido', async () => {
  const p = await process(), i = await item(p);
  const s = await stock(p, 2, { state: 'pendiente', reception: 'pendiente' });
  assert.equal((await state(i)).compra_estado, 'pendiente_solicitud');
  await q(`update panol_obra_materiales_snapshot set estado='en_panol',recepcion_estado='recibido' where id=$1`, [s.id]);
  assert.equal((await state(i)).compra_estado, 'recibido_astillero');
  assert.equal((await state(i)).solicitado_at, null);
  assert.equal((await state(i)).recibido_astillero_at.toISOString(), '2026-09-25T12:00:00.000Z');
});
test('la recepción anterior al seguimiento se reconoce al crear el ítem', async () => {
  const p = await process(); await stock(p);
  const i = await item(p);
  assert.equal((await state(i)).compra_estado, 'recibido_astillero');
  assert.equal((await allocations(i))[0].cantidad, '2');
});
test('parcial cuenta cantidad física y acumula ingresos separados', async () => {
  const p = await process(), i = await item(p);
  await stock(p, 8, { reception: 'parcial', received: '1,0' });
  assert.equal((await state(i)).compra_estado, 'pendiente_solicitud');
  assert.equal(Number((await allocations(i))[0].cantidad), 1);
  await stock(p, 1);
  assert.equal((await state(i)).compra_estado, 'recibido_astillero');
});
test('medida distinta, otra obra y stock general no se asignan a esta obra', async () => {
  const p = await process(), other = await process(), i = await item(p);
  await stock(p, 2, { material: OTRO }); await stock(other); await stock(null);
  assert.equal((await state(i)).compra_estado, 'pendiente_solicitud');
  assert.deepEqual(await allocations(i), []);
  const general = await q('select * from torneria_stock_general($1::uuid[])', [[TUBO]]);
  assert.equal(general[0].cantidad, '2');
  assert.equal(general[0].sede, 'Chubut');
});
test('un lote no queda recibido hasta tener todos sus materiales', async () => {
  const p = await process(), i = await item(p, 1);
  await q('insert into torneria_item_materiales(item_id,material_id,cantidad) values($1,$2,2),($1,$3,3)', [i.id,TUBO,OTRO]);
  await stock(p,2);
  assert.equal((await state(i)).compra_estado, 'pendiente_solicitud');
  await stock(p,3,{material:OTRO});
  assert.equal((await state(i)).compra_estado, 'recibido_astillero');
});
test('el mismo lote no cubre dos renglones; exceso queda en Pañol', async () => {
  const p = await process(), first = await item(p), second = await item(p);
  await stock(p,3);
  const allocated = [...await allocations(first), ...await allocations(second)];
  assert.equal(allocated.reduce((sum,row) => sum + Number(row.cantidad),0),3);
  assert.equal([await state(first),await state(second)].filter(i=>i.compra_estado==='recibido_astillero').length,1);
});
test('anular o reducir un ingreso deshace la recepción automática', async () => {
  const p = await process(), i = await item(p), s = await stock(p);
  await q('update panol_obra_materiales_snapshot set cantidad=1 where id=$1', [s.id]);
  assert.equal((await state(i)).compra_estado, 'pendiente_solicitud');
  assert.equal((await state(i)).recibido_astillero_at,null);
  await q(`update panol_obra_materiales_snapshot set estado='cancelado' where id=$1`,[s.id]);
  assert.deepEqual(await allocations(i),[]);
});
test('no lleva, conjunto y disponibilidad manual no se reinterpretan', async () => {
  const p = await process();
  const skipped = await item(p,2,{state:'recibido_astillero'});
  const excluded = await item(p,2,{noLleva:true});
  const result = await item(p,2,{result:true,state:'no_aplica'});
  await stock(p,6);
  assert.deepEqual(await allocations(skipped),[]);
  assert.deepEqual(await allocations(excluded),[]);
  assert.deepEqual(await allocations(result),[]);
});
test('la compra existente conserva su circuito y no presta stock a otro renglón', async () => {
  const p = await process(), requestItem = crypto.randomUUID(), request = crypto.randomUUID();
  const linked = await item(p,2,{requestItem,request,state:'comprado'});
  const unlinked = await item(p);
  await stock(p,2,{requestItem});
  assert.deepEqual(await allocations(linked),[]);
  assert.deepEqual(await allocations(unlinked),[]);
});
test('pedir sólo el faltante conserva el ingreso parcial al llegar la compra', async () => {
  const p = await process(), i = await item(p); await stock(p,1);
  await q(`update torneria_items set purchase_request_id=$2,purchase_request_item_id=$3,compra_estado='solicitado' where id=$1`,
    [i.id,crypto.randomUUID(),crypto.randomUUID()]);
  await stock(p,1);
  assert.equal((await state(i)).compra_estado,'recibido_astillero');
  assert.equal((await allocations(i)).reduce((sum,r)=>sum+Number(r.cantidad),0),2);
});
test('salida parcial descuenta sólo lo enviado y editar no duplica el retiro', async () => {
  const p = await process(), i = await item(p), s = await stock(p,4);
  const { op,mov } = await send(i,1);
  assert.equal(Number((await one('select cantidad from panol_obra_materiales_snapshot where id=$1',[s.id])).cantidad),3);
  await q('delete from torneria_movimiento_items where movimiento_id=$1',[mov.id]);
  await q('insert into torneria_movimiento_items(movimiento_id,operacion_item_id,cantidad) values($1,$2,1)',[mov.id,op.id]);
  assert.equal(Number((await one('select cantidad from panol_obra_materiales_snapshot where id=$1',[s.id])).cantidad),3);
  await send(i,1,op);
  assert.equal(Number((await one('select cantidad from panol_obra_materiales_snapshot where id=$1',[s.id])).cantidad),2);
  // Un segundo viaje transforma la misma pieza; no vuelve a sacar materia prima.
  await send(i,2);
  assert.equal(Number((await one('select cantidad from panol_obra_materiales_snapshot where id=$1',[s.id])).cantidad),2);
});
test('salida total y compras posteriores no hacen retroceder el material', async () => {
  const p = await process(), i = await item(p), s = await stock(p);
  await send(i,2);
  assert.equal((await one('select estado from panol_obra_materiales_snapshot where id=$1',[s.id])).estado,'egresado');
  await stock(p,1);
  assert.equal((await state(i)).compra_estado,'recibido_astillero');
  assert.equal(Number((await allocations(i))[0].cantidad_egresada),2);
});
test('un retiro histórico separado disminuye el stock que se puede reconocer', async () => {
  const p = await process();
  await stock(p,2);
  await stock(p,1,{state:'egresado',source:'egreso_producto'});
  const i = await item(p);
  assert.equal((await state(i)).compra_estado,'pendiente_solicitud');
  assert.equal(Number((await allocations(i))[0].cantidad),1);
});
test('cancelar un proceso libera el material de la obra', async () => {
  const p = await process(), i = await item(p); await stock(p);
  await q(`update torneria_procesos set estado='cancelado' where id=$1`,[p.id]);
  assert.deepEqual(await allocations(i),[]);
  assert.equal((await state(i)).compra_estado,'pendiente_solicitud');
});
test('se puede volver a ejecutar el SQL completo sin duplicar reservas ni descontar stock', async () => {
  const p = await process(), i = await item(p), s = await stock(p);
  const migration = await readFile('supabase/migrations/20261005133000_torneria_recepciones_anticipadas.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await state(i)).compra_estado, 'recibido_astillero');
  assert.equal((await allocations(i)).length, 1);
  assert.equal(Number((await allocations(i))[0].cantidad), 2);
  assert.equal(Number((await one('select cantidad from panol_obra_materiales_snapshot where id=$1', [s.id])).cantidad), 2);
});
