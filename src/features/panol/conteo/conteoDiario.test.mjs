import test from "node:test";
import assert from "node:assert/strict";
import { buildProductGroups } from "../stockGrupos.js";
import { clasificarABC, elegirConteoDelDia, exactitud, fechaLocal, teoricoEnSede } from "./conteoDiario.js";

const NOW = new Date("2026-11-03T10:00:00-03:00");

// n productos con stock; el i-ésimo tiene i movimientos recientes.
function stock(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({ id: `in-${i}`, material_id: `m${i}`, descripcion: `Producto ${i}`, source: "remito", estado: "en_panol", recepcion_estado: "recibido", cantidad: 50 + i, stock_sede: "Chubut", created_at: "2026-01-10T10:00:00Z" });
    for (let k = 0; k < i; k += 1) {
      rows.push({ id: `out-${i}-${k}`, material_id: `m${i}`, descripcion: `Producto ${i}`, source: "egreso_producto", estado: "egresado", cantidad: 1, cantidad_egresada: 1, stock_sede: "Chubut", egreso_at: "2026-10-20T10:00:00Z" });
    }
  }
  return rows;
}

test("los más movidos son A, después B y el resto C", () => {
  const groups = buildProductGroups(stock(20));
  const clases = clasificarABC(groups, NOW);
  assert.equal(clases.get("m19"), "A");
  assert.equal(clases.get("m17"), "A");
  assert.equal(clases.get("m16"), "B");
  assert.equal(clases.get("m0"), "C");
  assert.equal([...clases.values()].filter((c) => c === "A").length, 3);
});

test("arma 20 renglones con el reparto 3 evento · 7 A · 5 B · 5 C cuando alcanza", () => {
  const rows = stock(200);
  // Tres con problema de stock negativo.
  for (const id of ["m5", "m6", "m7"]) rows.push({ id: `neg-${id}`, material_id: id, source: "egreso_producto", estado: "egresado", cantidad: 300, cantidad_egresada: 300, stock_sede: "Chubut", egreso_at: "2026-10-01T10:00:00Z" });
  const lista = elegirConteoDelDia(buildProductGroups(rows), { sede: "Chubut", fecha: "2026-11-03", now: NOW });
  assert.equal(lista.length, 20);
  const por = (clase) => lista.filter((item) => item.clase === clase).length;
  assert.deepEqual([por("evento"), por("A"), por("B"), por("C")], [3, 7, 5, 5]);
  assert.deepEqual(lista.filter((i) => i.clase === "evento").map((i) => i.material_id).sort(), ["m5", "m6", "m7"]);
  assert.equal(new Set(lista.map((i) => i.material_id)).size, 20);
});

test("la misma sede y fecha da la misma lista; otro día cambia", () => {
  const groups = buildProductGroups(stock(200));
  const a = elegirConteoDelDia(groups, { sede: "Chubut", fecha: "2026-11-03", now: NOW });
  const b = elegirConteoDelDia(groups, { sede: "Chubut", fecha: "2026-11-03", now: NOW });
  const c = elegirConteoDelDia(groups, { sede: "Chubut", fecha: "2026-11-04", now: NOW });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((i) => i.material_id), c.map((i) => i.material_id));
});

test("lo contado hace poco no vuelve y lo que quedó de ayer va primero", () => {
  const groups = buildProductGroups(stock(30));
  const ultimoConteo = new Map(groups.map((g) => [g.material.id, "2026-11-01T10:00:00Z"]));
  ultimoConteo.delete("m3");
  const lista = elegirConteoDelDia(groups, { ultimoConteo, arrastre: [{ material_id: "m10", fecha: "2026-11-02" }], sede: "Chubut", fecha: "2026-11-03", now: NOW });
  assert.equal(lista[0].material_id, "m10");
  assert.equal(lista[0].clase, "arrastre");
  assert.equal(lista[0].motivo, "Quedó del 02/11");
  assert.ok(lista.some((i) => i.material_id === "m3"));
  // Con todo contado hace dos días igual se completa la lista (lo más viejo primero).
  assert.equal(lista.length, 20);
});

test("los requisitos de matriz no se cuentan", () => {
  const rows = stock(5).map((r) => (r.material_id === "m4" ? { ...r, es_requisito: true } : r));
  const lista = elegirConteoDelDia(buildProductGroups(rows), { sede: "Chubut", fecha: "2026-11-03", now: NOW });
  assert.ok(!lista.some((i) => i.material_id === "m4"));
  assert.equal(lista.length, 4);
});

test("el sistema cuenta lo físico de la sede: libre más reservado", () => {
  const rows = [
    { material_id: "x", source: "remito", estado: "en_panol", recepcion_estado: "recibido", cantidad: 10, stock_sede: "Chubut" },
    { material_id: "x", source: "remito", estado: "en_panol", recepcion_estado: "recibido", cantidad: 3, stock_sede: "Chubut", obra_id: "52-27" },
    { material_id: "x", source: "egreso_producto", estado: "egresado", cantidad: 2, cantidad_egresada: 2, stock_sede: "Chubut" },
    { material_id: "x", source: "remito", estado: "en_panol", recepcion_estado: "recibido", cantidad: 7, stock_sede: "Pampa" },
    { material_id: "y", source: "remito", estado: "en_panol", recepcion_estado: "recibido", cantidad: 5, stock_sede: "Chubut" },
  ];
  assert.deepEqual(teoricoEnSede(rows, "x", "Chubut"), { total: 11, libre: 8 });
  assert.deepEqual(teoricoEnSede(rows, "x", "Pampa"), { total: 7, libre: 7 });
});

test("exactitud mira sólo lo cerrado", () => {
  assert.equal(exactitud([{ estado: "pendiente" }]), null);
  assert.deepEqual(exactitud([{ estado: "ok" }, { estado: "ok" }, { estado: "ajustado" }, { estado: "revisar" }, { estado: "recontar" }]), { cerrados: 4, ok: 2, porcentaje: 50 });
});

test("la fecha del lote es la local", () => {
  assert.equal(fechaLocal(new Date(2026, 10, 3, 23, 30)), "2026-11-03");
});
