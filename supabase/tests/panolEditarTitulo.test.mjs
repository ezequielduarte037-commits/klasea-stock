import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const PANOL = '00000000-0000-4000-8000-000000000001';
const PAMPA = '00000000-0000-4000-8000-000000000002';
const COMPRAS = '00000000-0000-4000-8000-000000000003';
const OFICINA = '00000000-0000-4000-8000-000000000004';
const ENVIO = '00000000-0000-4000-8000-000000000010';
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const actor = (id) => q("select set_config('test.uid', $1, true)", [id || '']);
const editar = (titulo, id = ENVIO) => q('select panol_actualizar_titulo_envio($1,$2) titulo', [id, titulo]);

before(async () => {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('test.uid',true),'')::uuid
    $$;
    create table profiles(id uuid primary key,role text,sede text,is_admin boolean default false);
    create table panol_envios(id uuid primary key,titulo text,sede text,estado text,updated_at timestamptz);
    create table panol_envio_items(id uuid primary key default gen_random_uuid(),envio_id uuid,estado text,cantidad_recibida text);
    create table panol_envio_eventos(id uuid primary key default gen_random_uuid(),envio_id uuid,tipo text,nota text,actor_id uuid);
    grant usage on schema public to authenticated, anon;
  `);
  await db.exec(await readFile(new URL('../migrations/20260715120000_tecnica_panol_operador.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261029120000_panol_editar_titulo_aviso.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('begin');
  await q(`insert into profiles(id,role,sede) values
    ($1,'panol','Chubut'),($2,'panol','Pampa'),($3,'compras',null),($4,'oficina',null)`, [PANOL, PAMPA, COMPRAS, OFICINA]);
  await q("insert into panol_envios values($1,'Referencia incorrecta','Chubut','parcial','2026-10-01')", [ENVIO]);
  await q("insert into panol_envio_items(envio_id,estado,cantidad_recibida) values($1,'parcial','2')", [ENVIO]);
  await actor(PANOL);
});
afterEach(() => db.exec('rollback; reset role'));

test('Pañol corrige el título de su sede y deja autor y referencias en el historial', async () => {
  const items = await q('select * from panol_envio_items');
  await db.exec('set local role authenticated');
  assert.equal((await editar('  Remito corregido  '))[0].titulo, 'Remito corregido');
  await db.exec('reset role');
  const [envio] = await q('select * from panol_envios');
  assert.equal(envio.titulo, 'Remito corregido');
  assert.equal(envio.estado, 'parcial');
  assert.deepEqual(await q('select * from panol_envio_items'), items);
  const [evento] = await q('select * from panol_envio_eventos');
  assert.equal(evento.actor_id, PANOL);
  assert.equal(evento.tipo, 'titulo');
  assert.match(evento.nota, /Título anterior: Referencia incorrecta\nTítulo nuevo: Remito corregido/);
});

test('Compras también puede corregir avisos ya recibidos y cerrados', async () => {
  await actor(COMPRAS);
  for (const estado of ['recibido', 'cerrado', 'cancelado']) {
    await q('update panol_envios set estado=$1', [estado]);
    await editar(`Referencia ${estado}`);
    assert.equal((await q('select estado from panol_envios'))[0].estado, estado);
  }
});

test('rechaza otra sede, sólo lectura, sesión ausente y títulos vacíos sin dejar cambios', async () => {
  for (const [uid, titulo, error] of [
    [PAMPA, 'Otra sede', /Sin permiso/],
    [OFICINA, 'Sólo lectura', /Sin permiso/],
    [null, 'Sin sesión', /Sesión requerida/],
    [PANOL, '   ', /Completá el título/],
    [PANOL, null, /Completá el título/],
  ]) {
    await actor(uid);
    await db.exec('savepoint intento');
    await assert.rejects(editar(titulo), error);
    await db.exec('rollback to intento');
  }
  assert.equal((await q('select titulo from panol_envios'))[0].titulo, 'Referencia incorrecta');
  assert.equal((await q('select * from panol_envio_eventos')).length, 0);
});

test('el mismo título no agrega eventos y un aviso inexistente da error', async () => {
  await editar(' Referencia incorrecta ');
  assert.equal((await q('select * from panol_envio_eventos')).length, 0);
  await assert.rejects(editar('Título', '00000000-0000-4000-8000-000000000099'), /Aviso inexistente/);
});

test('revierte el título si falla el historial y no permite ejecutar como anónimo', async () => {
  await db.exec(`alter table panol_envio_eventos add constraint simular_error check(tipo <> 'titulo'); savepoint fallo`);
  await assert.rejects(editar('Cambio sin historial'), /simular_error/);
  await db.exec('rollback to fallo');
  assert.equal((await q('select titulo from panol_envios'))[0].titulo, 'Referencia incorrecta');
  await db.exec('set local role anon');
  await assert.rejects(editar('Anónimo'), /permission denied/);
});
