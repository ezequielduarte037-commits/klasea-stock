import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { PGlite } from "../../tmp/torneria-db-test/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
const USER = "00000000-0000-0000-0000-000000000001";
const EMP = "00000000-0000-0000-0000-000000000002";
const M1 = "00000000-0000-0000-0000-000000000011";
const M2 = "00000000-0000-0000-0000-000000000012";
const OBRA1 = "00000000-0000-0000-0000-000000000021";
const OBRA2 = "00000000-0000-0000-0000-000000000022";
const LOTE = "00000000-0000-0000-0000-000000000031";
const KEY = "00000000-0000-0000-0000-000000000041";
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
const fn = (s, n) => s.match(new RegExp(`create or replace function public\\.${n}\\([\\s\\S]+?\\$\\$;`))[0];

before(async () => {
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function panol_es_operador_solicitudes(uuid) returns boolean language sql as $$select $1='${USER}'::uuid$$;
    create table panol_materiales(id uuid primary key, es_consumible boolean default true, activo boolean default true);
    create table panol_solicitudes(id uuid primary key);
    create table rrhh_empleados(id uuid primary key, nombre text, dni text);
    create table produccion_obras(id uuid primary key, codigo text);
    create table consumibles_config(material_id uuid primary key, forma_entrega text default 'unidad',
      activo_mostrador boolean default true, costo_unitario_ars numeric, cupo_diario numeric);
    create function consumibles_datos_empleado(uuid, out nombre text, out dni text) returns record language sql as
      $$select nombre,dni from rrhh_empleados where id=$1$$;
    create function consumibles_empresa_empleado(uuid, out empresa text, out externo boolean) returns record language sql as
      $$select nullif(current_setting('test.empresa',true),''), coalesce(current_setting('test.externo',true),'false')::boolean$$;
  `);
  const base = await readFile("supabase/migrations/20261010120000_consumibles_base.sql", "utf8");
  await db.exec(base.slice(base.indexOf("create table if not exists public.consumibles_movimientos"), base.indexOf("create index if not exists consumibles_mov_material_idx")));
  await db.exec("alter table consumibles_movimientos add column empleado_empresa text; alter table consumibles_movimientos add column empleado_externo boolean default false;");
  const externos = await readFile("supabase/migrations/20261013200000_consumibles_externos.sql", "utf8");
  await db.exec(fn(externos, "consumibles_movimiento_completar"));
  await db.exec(fn(base, "consumibles_movimiento_solo_anular"));
    await db.exec(`create trigger completar before insert on consumibles_movimientos for each row execute function consumibles_movimiento_completar();
    create trigger solo_anular before update on consumibles_movimientos for each row execute function consumibles_movimiento_solo_anular();`);
  await db.exec(await readFile("supabase/migrations/20261013160000_consumibles_stock_pre_conteo.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261014120000_consumibles_corregir_operacion.sql", "utf8"));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec(`truncate consumibles_correcciones,consumibles_movimientos,consumibles_config,panol_materiales,rrhh_empleados,produccion_obras,panol_solicitudes cascade;
    select set_config('test.uid','${USER}',false);
    select set_config('test.empresa','',false); select set_config('test.externo','false',false);
    insert into panol_materiales(id) values('${M1}'),('${M2}');
    insert into consumibles_config(material_id,costo_unitario_ars) values('${M1}',999),('${M2}',20);
    insert into rrhh_empleados values('${EMP}','Juan Pérez','123');
    insert into produccion_obras values('${OBRA1}','K55'),('${OBRA2}','K85');
  `);
});

async function fixture({ tipo = "retiro", fecha = "2026-10-14T12:00:00Z", cantidad = 3, partes = 2, externo = false } = {}) {
  await q("select set_config('test.empresa',$1,false),set_config('test.externo',$2,false)", [externo ? "Vidriería" : "", String(externo)]);
  const ids = [];
  for (let i = 0; i < partes; i++) {
    const f = await one(`insert into consumibles_movimientos(material_id,sede,tipo,cantidad,gramos,empleado_id,empleado_nombre,empleado_dni,
      empleado_externo,empleado_empresa,metodo_firma,obra_id,carril,lote,costo_unitario_ars,created_at)
      values($1,'Chubut',$2,$3,100,$4,'Juan Pérez','123',$5,$6,'nfc',$7,'mostrador',$8,10,$9) returning id`,
    [M1, tipo, (tipo === "retiro" ? -1 : 1) * cantidad / partes, EMP, externo, externo ? "Vidriería" : null, i ? OBRA2 : OBRA1, LOTE, fecha]);
    ids.push(f.id);
  }
  return ids;
}
const corregir = (ids, items, { id = KEY, motivo = "Cantidad equivocada", autoriza = null } = {}) => one(
  "select consumibles_corregir_operacion($1,$2,$3::jsonb,$4,$5) as res", [id, ids, JSON.stringify(items), motivo, autoriza]);
const item = (id, cantidad, canje = null) => ({ material_id: id, cantidad, canje });
const actuales = () => q("select * from consumibles_movimientos where tipo <> 'inventario' and anulado_at is null order by material_id,obra_id");

test("corrige cantidad, agrega otra cinta y conserva destino, identidad, costo y fecha", async () => {
  const ids = await fixture();
  await db.exec(`update rrhh_empleados set nombre='Nombre cambiado',dni='456';
    select set_config('test.empresa','Empresa nueva',false);select set_config('test.externo','true',false);`);
  await corregir(ids, [item(M1, 4), item(M2, 2)]);
  const filas = await actuales();
  assert.equal(filas.length, 4);
  assert.equal(filas.filter((f) => f.material_id === M1).reduce((n, f) => n + Number(f.cantidad), 0), -4);
  assert.equal(filas.filter((f) => f.material_id === M2).reduce((n, f) => n + Number(f.cantidad), 0), -2);
  for (const f of filas) {
    assert.equal(f.empleado_nombre, "Juan Pérez");
    assert.equal(f.metodo_firma, "nfc");
    assert.equal(f.empleado_dni, "123");
    assert.equal(f.empleado_empresa, null);
    assert.equal(f.empleado_externo, false);
    assert.equal(f.created_at.toISOString(), "2026-10-14T12:00:00.000Z");
    assert.equal(Number(f.costo_unitario_ars), f.material_id === M1 ? 10 : 20);
    assert.equal(f.gramos, null);
  }
  assert.equal(Number((await one("select count(*) n from consumibles_movimientos where anulado_at is not null")).n), ids.length);
  assert.equal((await q("select * from consumibles_correcciones")).length, 1);
});

test("reintentar no duplica y reutilizar la clave con otro cambio falla", async () => {
  const ids = await fixture();
  const items = [item(M1, 5)];
  const primera = await corregir(ids, items);
  const segunda = await corregir(ids, items);
  assert.equal(primera.res.lote, segunda.res.lote);
  assert.equal(segunda.res.ya_corregida, true);
  assert.equal((await actuales()).length, 2);
  await assert.rejects(corregir(ids, [item(M1, 6)]), /clave/);
});

test("cantidades ínfimas repartidas suman exacto y nunca generan filas cero", async () => {
  const ids = await fixture({ cantidad: 1, partes: 5 });
  await corregir(ids, [item(M1, 0.002)]);
  const filas = await actuales();
  assert.equal(filas.length, 2);
  assert.equal(filas.reduce((n, f) => n + Number(f.cantidad), 0), -0.002);
});

test("mantiene el stock antes y después del corte del inventario", async () => {
  const ids = await fixture({ fecha: "2026-10-13T12:00:00Z" });
  await q("insert into consumibles_movimientos(material_id,sede,tipo,cantidad,contado,created_at) values($1,'Chubut','inventario',100,100,'2026-10-14T10:00:00Z')", [M1]);
  await corregir(ids, [item(M1, 7)]);
  const s = await one("select * from consumibles_stock where material_id=$1", [M1]);
  assert.equal(Number(s.stock), 100);
  assert.equal(Number(s.pre_conteo_retirado), 7);
  const nuevas = await fixture({ fecha: "2026-10-14T12:00:00Z", cantidad: 4 });
  // Las correcciones usan un lote nuevo, por eso el retiro posterior puede conservar su lote original.
  await corregir(nuevas, [item(M1, 6)], { id: "00000000-0000-0000-0000-000000000042" });
  assert.equal(Number((await one("select stock from consumibles_stock where material_id=$1", [M1])).stock), 94);
});

test("retirar un producto del carrito y corregir devolución conservan los signos", async () => {
  const ids = await fixture({ tipo: "devolucion" });
  await corregir(ids, [item(M2, 1.5)]);
  const filas = await actuales();
  assert.ok(filas.every((f) => f.tipo === "devolucion" && Number(f.cantidad) > 0));
  assert.equal(filas.reduce((n, f) => n + Number(f.cantidad), 0), 1.5);
  assert.ok(filas.every((f) => f.material_id === M2));
});

test("rechaza retiro incompleto, edición obsoleta y solicitudes sin tocar el original", async () => {
  const ids = await fixture();
  await assert.rejects(corregir(ids.slice(0, 1), [item(M1, 1)]), /Faltan productos/);
  assert.equal((await actuales()).length, 2);
  await corregir(ids, [item(M1, 1)]);
  await assert.rejects(corregir(ids, [item(M1, 2)], { id: "00000000-0000-0000-0000-000000000042" }), /cambió/);
});

test("los movimientos de solicitudes se corrigen desde su solicitud", async () => {
  await db.exec(`insert into panol_solicitudes values('${LOTE}');`);
  const f = await one(`insert into consumibles_movimientos(material_id,sede,tipo,cantidad,solicitud_id,origen)
    values($1,'Chubut','retiro',-1,$2,'solicitud') returning id`, [M1, LOTE]);
  await assert.rejects(corregir([f.id], [item(M1, 2)]), /desde la solicitud/);
  assert.equal((await actuales()).length, 1);
});

test("el cupo no suma a la vez la versión anterior y la corregida", async () => {
  await q("update consumibles_config set cupo_diario=5 where material_id=$1", [M1]);
  const ids = await fixture({ cantidad: 3 });
  await corregir(ids, [item(M1, 4)]);
  assert.ok((await actuales()).every((f) => !f.fuera_cupo));
});

test("valida permiso, catálogo, cantidades, duplicados y rollback de inserciones parciales", async () => {
  const ids = await fixture();
  await q("select set_config('test.uid',$1,false)", [EMP]);
  await assert.rejects(corregir(ids, [item(M1, 4)]), /Sin permiso/);
  await q("select set_config('test.uid',$1,false)", [USER]);
  for (const items of [[item(M1, 2), item(M2, 0)], [item(M1, 2), item(M1, 3)], [item(M1, "NaN")], [item(M1, 0.0001)], [item("00000000-0000-0000-0000-000000000099", 1)]]) {
    await assert.rejects(corregir(ids, items));
    assert.equal((await actuales()).length, 2);
    assert.equal((await q("select * from consumibles_correcciones")).length, 0);
  }
});

test("exige autorización para externos, cupo y canje sin el usado", async () => {
  const ids = await fixture({ externo: true });
  await q("update consumibles_config set forma_entrega='canje',cupo_diario=2 where material_id=$1", [M2]);
  await assert.rejects(corregir(ids, [item(M1, 3), item(M2, 4, "sin_usado")]), /quién autoriza/);
  await corregir(ids, [item(M1, 3), item(M2, 4, "sin_usado")], { autoriza: "Encargado" });
  const filas = await actuales();
  assert.ok(filas.filter((f) => f.material_id === M2).every((f) => f.fuera_cupo && f.canje === "sin_usado" && f.autorizado_por === "Encargado"));
});
