import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const pedido = async (status = 'cotizando', actual = null, estimated = 1000) => (
  await query('insert into purchase_requests(status,actual_amount,estimated_amount) values($1,$2,$3) returning id', [status, actual, estimated])
)[0].id;
const fila = async (id) => (await query('select * from purchase_requests where id=$1', [id]))[0];
const rechazado = async (sql, params = []) => {
  await db.exec('savepoint precio');
  await assert.rejects(query(sql, params), /importe real mayor a cero/);
  await db.exec('rollback to precio');
};

before(async () => {
  await db.exec(`create table purchase_requests (
    id integer generated always as identity primary key,
    status text not null,
    actual_amount numeric(12,2),
    estimated_amount numeric(12,2),
    title text default 'Pedido de prueba'
  );
  -- Historial anterior a la regla: no se corrigen ni inventan precios.
  insert into purchase_requests(status) values('comprado'),('recibido');
  create table purchase_request_items(request_id integer, status text);
  create function sincronizar_recepcion_mock() returns trigger language plpgsql as $$
  begin
    update purchase_requests set status=case when new.status='recibido' then 'recibido' else 'comprado' end
    where id=new.request_id;
    return new;
  end;$$;
  create trigger recepcion_mock after insert or update on purchase_request_items
    for each row execute function sincronizar_recepcion_mock();`);
  await db.exec(await readFile(new URL('../migrations/20261023120000_compras_precio_obligatorio.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
beforeEach(() => db.exec('begin'));
afterEach(() => db.exec('rollback'));

test('un monto cotizado no permite comprar sin precio real y se conserva el estado anterior', async () => {
  const id = await pedido();
  await rechazado("update purchase_requests set status='comprado' where id=$1", [id]);
  assert.equal((await fila(id)).status, 'cotizando');
  assert.equal((await fila(id)).actual_amount, null);
});

test('rechaza nulo, cero, negativo, NaN y un importe que redondea a cero al comprar', async () => {
  const id = await pedido();
  for (const amount of [null, 0, -10, 'NaN', '0.001']) {
    await rechazado("update purchase_requests set status='comprado',actual_amount=$2 where id=$1", [id, amount]);
    assert.equal((await fila(id)).status, 'cotizando');
    assert.equal((await fila(id)).actual_amount, null);
  }
});

test('confirma precio y estado juntos, admite centavos y reutiliza un precio real guardado', async () => {
  const id = await pedido();
  await query("update purchase_requests set status='comprado',actual_amount=0.01 where id=$1", [id]);
  assert.equal((await fila(id)).status, 'comprado');
  assert.equal(Number((await fila(id)).actual_amount), 0.01);
  const existente = await pedido('cotizando', 12500.25);
  await query("update purchase_requests set status='comprado' where id=$1", [existente]);
  assert.equal(Number((await fila(existente)).actual_amount), 12500.25);
});

test('la inserción directa tampoco permite crear una compra sin precio', async () => {
  await rechazado("insert into purchase_requests(status) values('comprado')");
  await rechazado("insert into purchase_requests(status,actual_amount) values('comprado',0)");
  assert.equal((await fila(await pedido('comprado', 50))).status, 'comprado');
});

test('no se puede borrar o invalidar el precio después de comprar o recibir', async () => {
  for (const status of ['comprado', 'recibido']) {
    const id = await pedido(status, 250);
    for (const amount of [null, 0, -1, 'NaN']) {
      await rechazado('update purchase_requests set actual_amount=$2 where id=$1', [id, amount]);
      assert.equal(Number((await fila(id)).actual_amount), 250);
    }
    await query('update purchase_requests set actual_amount=300 where id=$1', [id]);
    assert.equal(Number((await fila(id)).actual_amount), 300);
  }
});

test('los pedidos históricos sin precio permiten seguir recibiendo y editando otros datos', async () => {
  await query("update purchase_requests set title='Entrega pendiente',status=status where id=1");
  await query("update purchase_requests set status='recibido' where id=1");
  assert.equal((await fila(1)).status, 'recibido');
  assert.equal((await fila(1)).actual_amount, null);
  await query('update purchase_requests set actual_amount=500 where id=2');
  assert.equal(Number((await fila(2)).actual_amount), 500);
});

test('la sincronización de una recepción parcial histórica no se bloquea, el cambio directo sí', async () => {
  await rechazado("update purchase_requests set status='comprado' where id=2");
  await query("insert into purchase_request_items(request_id,status) values(2,'parcial')");
  assert.equal((await fila(2)).status, 'comprado');
  assert.equal((await fila(2)).actual_amount, null);
  await query("update purchase_request_items set status='recibido' where request_id=2");
  assert.equal((await fila(2)).status, 'recibido');
});

test('se puede cotizar, cancelar y reabrir sin precio; volver a comprar exige cargarlo', async () => {
  const id = await pedido('nuevo');
  for (const status of ['en_revision', 'cotizando', 'cancelado', 'nuevo']) {
    await query('update purchase_requests set status=$2 where id=$1', [id, status]);
  }
  await rechazado("update purchase_requests set status='comprado' where id=$1", [id]);
});
