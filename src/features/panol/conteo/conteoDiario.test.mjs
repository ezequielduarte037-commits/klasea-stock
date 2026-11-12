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

test("el recorrido ordena por ubicación con números naturales y deja lo sin ubicación al final", async () => {
  const { ordenRecorrido } = await import("./conteoDiario.js");
  const items = [
    { id: "a", orden: 1, material: { ubicacion: "A10" } },
    { id: "b", orden: 2, material: { ubicacion: "" } },
    { id: "c", orden: 3, material: { ubicacion: "A2" } },
    { id: "d", orden: 4, material: { ubicacion: "a2" } },
    { id: "e", orden: 5, material: { ubicacion: "B1" } },
  ];
  assert.deepEqual(ordenRecorrido(items).map((i) => i.id), ["c", "d", "a", "e", "b"]);
});

test("el historial marca días sin lista, incompletos y completos, y cuenta por persona", async () => {
  const { resumenHistorial } = await import("./conteoDiario.js");
  const item = (id, extra = {}) => ({ id, estado: "pendiente", ...extra });
  const lotes = [
    // Lunes 09/11: completa (2 de 2), uno ajustado.
    { id: "l1", fecha: "2026-11-09", items: [
      item("1", { estado: "ok", contado_por: "tomas", contado_at: "2026-11-09T10:00:00-03:00" }),
      item("2", { estado: "ajustado", contado_por: "tomas", contado_at: "2026-11-09T11:30:00-03:00" }),
    ] },
    // Martes 10/11: 1 de 3; el segundo conteo lo hace lautaro el miércoles.
    { id: "l2", fecha: "2026-11-10", items: [
      item("3", { estado: "revisar", contado_por: "tomas", contado_at: "2026-11-10T09:00:00-03:00", recontado_por: "lautaro", recontado_at: "2026-11-11T08:15:00-03:00" }),
      item("4", { estado: "pasado" }),
      item("5", { estado: "pasado" }),
    ] },
    // Jueves 12/11 (hoy): armada, sin contar.
    { id: "l3", fecha: "2026-11-12", items: [item("6"), item("7")] },
  ];
  const r = resumenHistorial(lotes, { hoy: "2026-11-12", dias: 7 });
  // 06/11 (vie) a 12/11 (jue): sábado 7 y domingo 8 no aparecen.
  assert.deepEqual(r.filas.map((f) => f.fecha), ["2026-11-12", "2026-11-11", "2026-11-10", "2026-11-09", "2026-11-06"]);
  const porFecha = Object.fromEntries(r.filas.map((f) => [f.fecha, f]));
  assert.equal(porFecha["2026-11-12"].estado, "por_empezar");
  assert.equal(porFecha["2026-11-11"].estado, "sin_lista");
  assert.equal(porFecha["2026-11-11"].personas[0].segundo, 1);
  assert.equal(porFecha["2026-11-10"].estado, "incompleta");
  assert.equal(porFecha["2026-11-10"].contados, 1);
  assert.equal(porFecha["2026-11-09"].estado, "completa");
  assert.equal(porFecha["2026-11-06"].estado, "sin_lista");
  // Hoy no se juzga: 4 días hábiles pasados, 2 con lista, 1 completo.
  assert.equal(r.totales.diasHabiles, 4);
  assert.equal(r.totales.diasConLista, 2);
  assert.equal(r.totales.diasCompletos, 1);
  assert.equal(r.totales.diasSinContar, 2);
  assert.equal(r.totales.asignados, 5);
  assert.equal(r.totales.contados, 3);
  assert.equal(r.totales.cumplimiento, 60);
  const tomas = r.personas.find((p) => p.uid === "tomas");
  assert.equal(tomas.conteo, 3);
  assert.equal(tomas.dias, 2);
});

test("el historial arranca el día de la primera lista", async () => {
  const { resumenHistorial } = await import("./conteoDiario.js");
  const lotes = [{ id: "l1", fecha: "2026-11-11", items: [{ id: "1", estado: "pasado" }] }];
  const r = resumenHistorial(lotes, { hoy: "2026-11-12", dias: 30, inicio: "2026-11-11" });
  assert.equal(r.desde, "2026-11-11");
  assert.deepEqual(r.filas.map((f) => f.estado), ["sin_armar", "sin_contar"]);
  assert.equal(r.totales.diasHabiles, 1);
});
