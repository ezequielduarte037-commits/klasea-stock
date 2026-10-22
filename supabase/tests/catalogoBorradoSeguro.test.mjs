import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const PRODUCTO = '00000000-0000-0000-0000-000000000001';
const REQUISITO = '00000000-0000-0000-0000-000000000002';
const ACTOR = '00000000-0000-0000-0000-000000000003';
const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const borrar = () => db.query('select panol_borrar_material_seguro($1) as ok', [PRODUCTO]);
const referenciaProtegida = e => ['23503', '23001'].includes(e.code);
let migration;
before(async () => {
  await db.exec(`
    create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
    create table panol_materiales(id uuid primary key, descripcion text);
    create table panol_material_modelo(id int generated always as identity primary key, material_id uuid references panol_materiales(id) on delete cascade, producto_predeterminado_id uuid references panol_materiales(id) on delete set null, cantidad numeric);
    create table panol_obra_materiales_snapshot(id int generated always as identity primary key, material_id uuid references panol_materiales(id) on delete set null, requisito_material_id uuid references panol_materiales(id) on delete set null, estado text);
    create table purchase_request_items(id int generated always as identity primary key, material_id uuid, requisito_material_id uuid references panol_materiales(id) on delete set null, catalog_source text);
    create table panol_envio_items(id int generated always as identity primary key, material_id uuid references panol_materiales(id) on delete set null);
    create table panol_materiales_audit(id int generated always as identity primary key, material_id uuid references panol_materiales(id) on delete set null);
    grant usage on schema public,auth to authenticated,service_role;
    grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
    alter table panol_materiales enable row level security;
    create policy lectura on panol_materiales for select to authenticated using(true);
    create policy escritura on panol_materiales for all to authenticated using(current_setting('test.admin',true)='true') with check(current_setting('test.admin',true)='true');
  `);
  migration = await readFile('supabase/migrations/20261022120000_catalogo_borrado_seguro.sql', 'utf8');
  await db.exec(migration);
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('reset role; truncate panol_materiales cascade;');
  await db.query("select set_config('test.uid',$1,false),set_config('test.role','authenticated',false),set_config('test.admin','true',false)", [ACTOR]);
  await db.query("insert into panol_materiales values($1,'Producto'),($2,'Requisito')", [PRODUCTO, REQUISITO]);
  await db.query('insert into panol_material_modelo(material_id,cantidad) values($1,1)', [PRODUCTO]);
});

test('impide borrar el SKU utilizado en una obra y conserva su matriz aunque falle el RPC', async () => {
  for (const estado of ['pendiente', 'pedido', 'en_panol', 'egresado']) {
    await db.query('insert into panol_obra_materiales_snapshot(material_id,requisito_material_id,estado) values($1,$2,$3)', [PRODUCTO, REQUISITO, estado]);
    await assert.rejects(borrar(), referenciaProtegida);
    assert.equal((await uno('select count(*) as n from panol_material_modelo where material_id=$1', [PRODUCTO])).n, 1);
    assert.equal((await uno('select material_id from panol_obra_materiales_snapshot limit 1')).material_id, PRODUCTO);
  }
});

test('el DELETE directo tampoco deja vacíos el producto ni el requisito', async () => {
  await db.query('insert into panol_obra_materiales_snapshot(material_id,requisito_material_id) values($1,$2)', [PRODUCTO, REQUISITO]);
  for (const id of [PRODUCTO, REQUISITO]) await assert.rejects(db.query('delete from panol_materiales where id=$1', [id]), referenciaProtegida);
  assert.equal((await uno('select count(*) as n from panol_materiales')).n, 2);
});

test('protege el estándar de la matriz y los productos de un envío', async () => {
  await db.query('insert into panol_material_modelo(material_id,producto_predeterminado_id) values($1,$2)', [REQUISITO, PRODUCTO]);
  await assert.rejects(borrar(), referenciaProtegida);
  await db.query('update panol_material_modelo set producto_predeterminado_id=null');
  await db.query('insert into panol_envio_items(material_id) values($1)', [PRODUCTO]);
  await assert.rejects(borrar(), referenciaProtegida);
});

test('protege Compras sin FK y una falla no elimina las cantidades de matriz', async () => {
  await db.query("insert into purchase_request_items(material_id,catalog_source) values($1,'panol')", [PRODUCTO]);
  await assert.rejects(borrar(), /vinculado a compras/);
  assert.equal((await uno('select cantidad from panol_material_modelo where material_id=$1', [PRODUCTO])).cantidad, '1');
  assert.equal((await uno('select material_id from purchase_request_items')).material_id, PRODUCTO);
});

test('permite eliminar un producto realmente sin uso; la auditoría no bloquea y se mantiene', async () => {
  await db.query('insert into panol_materiales_audit(material_id) values($1)', [PRODUCTO]);
  assert.equal((await borrar()).rows[0].ok, true);
  assert.equal((await uno('select count(*) as n from panol_material_modelo where material_id=$1', [PRODUCTO])).n, 0);
  assert.equal((await uno('select material_id from panol_materiales_audit')).material_id, null);
});

test('respeta RLS y requiere autenticación', async () => {
  await db.query("select set_config('test.uid','',false),set_config('test.role','',false)");
  await assert.rejects(borrar(), /No autenticado/);
  await db.query("select set_config('test.uid',$1,false),set_config('test.role','authenticated',false),set_config('test.admin','false',false)", [ACTOR]);
  await db.exec('set role authenticated');
  assert.equal((await borrar()).rows[0].ok, false);
  await db.exec('reset role');
  assert.equal((await uno('select count(*) as n from panol_material_modelo where material_id=$1', [PRODUCTO])).n, 1);
});

test('la migración es repetible', async () => {
  await db.exec(migration);
  const acciones = (await db.query("select confdeltype from pg_constraint where conrelid='panol_obra_materiales_snapshot'::regclass and contype='f'")).rows;
  assert.ok(acciones.every(c => c.confdeltype === 'r'));
});
