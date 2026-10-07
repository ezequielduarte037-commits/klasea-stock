// Usa el mismo PostgreSQL local que torneriaRecepcionesAnticipadas.test.mjs.
// node --test supabase/tests/panolCierreEgreso.test.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const USER = '00000000-0000-0000-0000-000000000001';
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const fn = (source, name) => {
  const match = source.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]+?\\$\\$;`));
  assert.ok(match, `Falta la función ${name}`);
  return match[0];
};

before(async () => {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create table profiles(id uuid primary key, role text, sede text);
    create table produccion_obras(id uuid primary key default gen_random_uuid(), codigo text);
    create table panol_materiales(id uuid primary key default gen_random_uuid(), descripcion text default 'Tornillo',
      codigo text, unidad_medida text default 'unidad', proveedor text, precio_unitario numeric default 2, moneda text default 'USD',
      activo boolean default true, es_requisito boolean default false);
    create table panol_envios(id uuid primary key default gen_random_uuid(), sede text);
    create table panol_devoluciones(id uuid primary key);
    create table panol_requisito_productos(requisito_material_id uuid, producto_material_id uuid,
      variante_legacy text, activo boolean default true, updated_at timestamptz default now());
    create table panol_obra_materiales_snapshot(id uuid primary key default gen_random_uuid(), obra_id uuid, obra_origen_id uuid,
      material_id uuid, requisito_material_id uuid, descripcion text, codigo text, cantidad numeric, cantidad_egresada numeric,
      unidad text, proveedor text, rubro text, tipo text, tipo_label text, precio_unitario numeric, moneda text, notas text,
      source text, estado text, recepcion_estado text, recepcion_updated_at timestamptz, stock_sede text, stock_nota text,
      egreso_at timestamptz, egreso_por uuid, egreso_nota text, retirado_por text, sector_destino text, egreso_destino_obra_id uuid,
      es_adicional boolean, variante text, producto_asignado_at timestamptz, producto_asignado_por uuid,
      producto_asignacion_origen text, panol_envio_id uuid, created_at timestamptz default now());
    create function public.is_panol_manager(uuid) returns boolean language sql as
      $$select exists(select 1 from profiles where id=$1 and role in ('admin','tecnica','compras'))$$;
    create function public.can_receive_envio(text,uuid) returns boolean language sql as
      $$select exists(select 1 from profiles where id=$2 and role='panol' and sede=$1)$$;
    insert into profiles values('${USER}', 'admin', 'Chubut');
  `);
  const base = await readFile('supabase/migrations/20260915300000_panol_cierre_materiales_obra.sql', 'utf8');
  await db.exec(base.slice(base.indexOf('create table if not exists'), base.indexOf('alter table public.panol_obra_cierres enable')));
  const stock = await readFile('supabase/migrations/20260813133000_panol_egreso_requisitos_concretos_y_lotes.sql', 'utf8');
  const disponible = await readFile('supabase/migrations/20260812190000_panol_stock_sin_negativos.sql', 'utf8');
  for (const name of ['panol_stock_movimiento_delta', 'panol_preparar_stock_producto', 'panol_egresar_producto', 'panol_transferir_producto']) {
    await db.exec(fn(stock, name));
  }
  await db.exec(fn(disponible, 'panol_stock_disponible_ubicacion'));
  for (const name of ['panol_cierre_puede_operar', 'panol_cierre_puede_excepcion', 'panol_cierre_snapshot_anulado', 'panol_cierre_registrar_evento', 'panol_cierre_resolver']) {
    await db.exec(fn(base, name));
  }
  const productos = await readFile('supabase/migrations/20260916110000_panol_cierre_solo_productos.sql', 'utf8');
  await db.exec(fn(productos, 'panol_cierre_refrescar_items'));
  await db.exec(fn(productos, 'panol_cierre_requisitos_sin_producto'));
  await db.exec(await readFile('supabase/migrations/20261007120000_panol_cierre_egreso_directo.sql', 'utf8'));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec('begin');
  await q("select set_config('test.uid', $1, true)", [USER]);
});
afterEach(async () => db.exec('rollback'));

async function fixture(cantidad = 10) {
  const obra = await one("insert into produccion_obras(codigo) values('K55-101') returning *");
  const material = await one('insert into panol_materiales default values returning *');
  const cierre = await one('insert into panol_obra_cierres(obra_id) values($1) returning *', [obra.id]);
  await stock(obra.id, material.id, cantidad);
  await q('select panol_cierre_refrescar_items($1)', [cierre.id]);
  const item = await one('select * from panol_obra_cierre_items where cierre_id=$1', [cierre.id]);
  return { obra, material, cierre, item };
}
async function stock(obra, material, cantidad, sede = 'Chubut', notas = null) {
  return one(`insert into panol_obra_materiales_snapshot(obra_id,material_id,cantidad,stock_sede,source,estado,recepcion_estado,descripcion,unidad,notas)
    values($1,$2,$3,$4,'stock_general','en_panol','recibido','Tornillo','unidad',$5) returning *`, [obra, material, cantidad, sede, notas]);
}
const egresar = (f, cantidad = 10, key = 'egreso-1', sede = 'Chubut', obs = null) =>
  q('select panol_cierre_egresar($1,$2,$3,$4,$5)', [f.item.id, cantidad, sede, obs, key]);
const item = (f) => one('select * from panol_obra_cierre_items where id=$1', [f.item.id]);
const head = (f) => one('select * from panol_obra_cierres where id=$1', [f.cierre.id]);
const refresh = (f) => q('select panol_cierre_refrescar_items($1)', [f.cierre.id]);
const close = (f) => one('select panol_cierre_conciliar($1) as resumen', [f.cierre.id]);
const snapshots = (f) => q('select * from panol_obra_materiales_snapshot where material_id=$1 order by source', [f.material.id]);
const saldo = async (f, obra = f.obra.id, sede = 'Chubut') => Number((await one(
  'select panol_stock_disponible_ubicacion($1,$2,$3) as cantidad', [f.material.id, sede, obra])).cantidad);
async function rejected(action, message) {
  await db.exec('savepoint rechazo');
  try { await assert.rejects(action, message); }
  finally { await db.exec('rollback to savepoint rechazo; release savepoint rechazo'); }
}

test('egreso total de la misma obra sin pasar por stock general, con auditoría y cierre', async () => {
  const f = await fixture();
  await egresar(f, 10, 'total', 'Chubut', 'Salida anterior al sistema');
  const rows = await snapshots(f);
  assert.equal(rows.length, 2);
  const salida = rows.find(row => row.source === 'egreso_producto');
  assert.equal(salida.obra_id, f.obra.id);
  assert.equal(salida.obra_origen_id, f.obra.id);
  assert.equal(salida.egreso_destino_obra_id, null);
  assert.equal(salida.egreso_por, USER);
  assert.equal(salida.precio_unitario, '2');
  assert.match(salida.egreso_nota, /Regularización de egreso no registrado/);
  assert.equal(await saldo(f), 0);
  assert.equal(await saldo(f, null), 0);
  const resolution = await one('select * from panol_obra_cierre_resoluciones where item_id=$1', [f.item.id]);
  assert.equal(resolution.snapshot_id, salida.id);
  assert.equal(resolution.usuario_id, USER);
  assert.equal(resolution.cantidad, '10.000');
  await refresh(f);
  assert.equal((await item(f)).estado, 'resuelto');
  assert.equal((await item(f)).cantidad_reservada, '0.000');
  assert.equal((await head(f)).items_total, 1);
  assert.equal((await head(f)).items_pendientes, 0);
  assert.deepEqual((await close(f)).resumen, { items: 1, liberados: 0, egresados: 10, diferencias: 0 });
});

test('egreso parcial conserva el saldo pendiente y bloquea el cierre prematuro', async () => {
  const f = await fixture(); await egresar(f, 3);
  assert.equal(await saldo(f), 7);
  const state = await item(f);
  assert.equal(state.estado, 'parcial');
  assert.equal(state.cantidad_utilizada, '3.000');
  assert.equal(state.cantidad_pendiente, '7.000');
  await rejected(() => close(f), /sin liberar, egresar o documentar/);
  await egresar(f, 7, 'segundo');
  assert.equal((await close(f)).resumen.egresados, 10);
});

test('reintento idéntico no duplica el egreso, incluso después de cerrar', async () => {
  const f = await fixture(); await egresar(f); await egresar(f); await close(f); await egresar(f);
  assert.equal((await snapshots(f)).length, 2);
  assert.equal((await item(f)).cantidad_utilizada, '10.000');
  assert.equal((await q("select * from panol_obra_cierre_eventos where tipo='egreso_regularizado'")).length, 1);
});

test('una clave usada no acepta cambios de cantidad, sede, nota ni de acción', async () => {
  const f = await fixture(); await egresar(f, 3);
  for (const args of [[4, 'egreso-1'], [3, 'egreso-1', 'Pampa'], [3, 'egreso-1', 'Chubut', 'Otra nota']]) {
    await rejected(() => egresar(f, ...args), /reintento ya registró otra operación/);
  }
  await rejected(() => q(`select panol_cierre_resolver(p_item_id:=$1,p_recibido:=3,p_sede:='Chubut',p_idempotency_key:='egreso-1')`, [f.item.id]), /reintento ya registró otra operación/);
  await q(`select panol_cierre_resolver(p_item_id:=$1,p_aclaracion:=1,p_observacion:='Diferencia',p_idempotency_key:='diferencia')`, [f.item.id]);
  await rejected(() => egresar(f, 1, 'diferencia'), /reintento ya registró otra operación/);
  assert.equal(await saldo(f), 7);
});

test('actualiza el saldo antes de validar una cantidad de una pantalla desactualizada', async () => {
  const f = await fixture();
  await q(`select panol_egresar_producto(p_material_id:=$1,p_cantidad:=8,p_sede:='Chubut',p_obra_id:=$2)`, [f.material.id, f.obra.id]);
  await rejected(() => egresar(f, 3), /supera lo pendiente/);
  assert.equal(await saldo(f), 2);
});

test('la sede elegida no puede consumir otra sede ni reclasificar saldo genérico', async () => {
  const f = await fixture();
  const requisito = await one('insert into panol_materiales(es_requisito) values(true) returning *');
  await q('insert into panol_requisito_productos(requisito_material_id,producto_material_id) values($1,$2)', [requisito.id, f.material.id]);
  await stock(f.obra.id, requisito.id, 20, 'Pampa');
  await rejected(() => egresar(f, 2, 'sede', 'Pampa'), /Stock insuficiente en Pampa/);
  assert.equal((await snapshots(f)).length, 1);
  assert.equal(await saldo(f), 10);
});

test('stock general y otra obra no cubren faltantes de la obra actual', async () => {
  const f = await fixture(2);
  const otraObra = await one("insert into produccion_obras(codigo) values('K55-102') returning *");
  await stock(null, f.material.id, 20); await stock(otraObra.id, f.material.id, 20);
  await rejected(() => egresar(f, 3), /supera lo pendiente/);
  assert.equal(await saldo(f, null), 20);
  assert.equal(await saldo(f, otraObra.id), 20);
});

test('valida cantidad, precisión, sede y clave desde el servidor', async () => {
  const f = await fixture();
  for (const cantidad of [0, -1, 0.0001, 'NaN', 'Infinity', null]) {
    await rejected(() => egresar(f, cantidad), /cantidad mayor a cero/);
  }
  await rejected(() => egresar(f, 1, 'invalido', 'Otro'), /pañol de origen/);
  await rejected(() => egresar(f, 1, null), /clave de la operación/);
  await egresar(f, 0.125);
  assert.equal(await saldo(f), 9.875);
});

test('respeta autenticación y permisos existentes, incluida la sede del operador', async () => {
  const f = await fixture();
  await q("select set_config('test.uid', '', true)");
  await rejected(() => egresar(f), /Usuario no autenticado/);
  await q("select set_config('test.uid', $1, true)", [USER]);
  await q("update profiles set role='consulta' where id=$1", [USER]);
  await rejected(() => egresar(f), /Sin permiso para revisar/);
  await q("update profiles set role='panol', sede='Pampa' where id=$1", [USER]);
  await rejected(() => egresar(f), /Sin permiso para egresar producto/);
  assert.equal((await snapshots(f)).length, 1);
});

test('solo opera revisiones abiertas y productos concretos activos', async () => {
  const f = await fixture();
  await q("update panol_obra_cierres set estado='conciliada' where id=$1", [f.cierre.id]);
  await rejected(() => egresar(f), /revisión ya está cerrada/);
  await q("update panol_obra_cierres set estado='pendiente' where id=$1", [f.cierre.id]);
  await q('update panol_materiales set es_requisito=true where id=$1', [f.material.id]);
  await rejected(() => egresar(f), /producto concreto/);
  await q('update panol_materiales set es_requisito=false, activo=false where id=$1', [f.material.id]);
  await rejected(() => egresar(f), /Producto inexistente o inactivo/);
});

test('no consume saldos anulados de una sede', async () => {
  const f = await fixture();
  await stock(f.obra.id, f.material.id, 10, 'Pampa', '[anulado]');
  await rejected(() => egresar(f, 1, 'anulado', 'Pampa'), /Stock insuficiente/);
});

test('liberar el resto de un egreso parcial sigue usando el circuito de stock general', async () => {
  const f = await fixture(); await egresar(f, 4);
  await q(`select panol_cierre_resolver(p_item_id:=$1,p_recibido:=6,p_sede:='Chubut',p_idempotency_key:='liberar')`, [f.item.id]);
  assert.equal(await saldo(f), 0);
  assert.equal(await saldo(f, null), 6);
  assert.deepEqual((await close(f)).resumen, { items: 1, liberados: 6, egresados: 4, diferencias: 0 });
});

test('las diferencias documentadas quedan fuera de la cantidad egresable', async () => {
  const f = await fixture();
  await q(`select panol_cierre_resolver(p_item_id:=$1,p_aclaracion:=2,p_observacion:='Saldo a revisar',p_idempotency_key:='nota')`, [f.item.id]);
  await rejected(() => egresar(f, 9), /supera lo pendiente/);
  await egresar(f, 8);
  assert.equal((await item(f)).cantidad_pendiente, '0.000');
  assert.equal((await close(f)).resumen.diferencias, 2);
});

test('un fallo al auditar revierte también el movimiento de stock', async () => {
  const f = await fixture();
  await db.exec(`create function impedir_evento_test() returns trigger language plpgsql as
    $$begin raise exception 'Fallo de auditoría simulado'; end$$;
    create trigger impedir_evento before insert on panol_obra_cierre_eventos for each row execute function impedir_evento_test();`);
  await rejected(() => egresar(f), /Fallo de auditoría simulado/);
  assert.equal(await saldo(f), 10);
  assert.equal((await snapshots(f)).length, 1);
  assert.equal((await item(f)).cantidad_utilizada, '0.000');
  assert.equal((await q('select * from panol_obra_cierre_resoluciones')).length, 0);
});
