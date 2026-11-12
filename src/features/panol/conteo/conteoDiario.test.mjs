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

test("explica cada renglón con lo que decía el sistema, lo contado y en cuánto quedó", async () => {
  const { explicarConteo, motivoAnulacion } = await import("./conteoDiario.js");
  const nombre = (uid) => ({ t: "Tomas", l: "Lautaro", c: "Ezequiel" }[uid] || "Alguien");
  const falta = explicarConteo({ estado: "ajustado", teorico: 3, contado: 2, contado_por: "t", ajuste: -1, unidad: "unidad" }, { nombre });
  assert.equal(falta.texto, "El sistema decía 3 y Tomas contó 2 (faltaba 1). Como la diferencia es chica, se corrigió sola. Se descontó 1: el sistema quedó en 2.");
  const sobra = explicarConteo({ estado: "ajustado", teorico: 0, contado: 2, contado_por: "t", ajuste: 2, ajuste_anulado: { motivo: "se duplico", por: "t" } }, { nombre });
  assert.match(sobra.texto, /2 de más.*Se sumaron 2: el sistema quedó en 2\. Tomas anuló ese ajuste \(motivo: «se duplico»\), así que el sistema volvió a 0/);
  assert.equal(sobra.tono, "red");
  const revisar = explicarConteo({ estado: "revisar", teorico: 15, contado: 18, contado_por: "t", recontado: 3, recontado_por: "l" }, { nombre });
  assert.equal(revisar.texto, "El sistema decía 15; Tomas contó 18 y Lautaro volvió a contar 3. Los conteos no coinciden entre sí, así que no se tocó el stock: lo resuelve Compras.");
  const ciego = explicarConteo({ estado: "recontar", teorico: 3, contado: 1, contado_por: "t" }, { nombre, verNumeros: false });
  assert.doesNotMatch(ciego.texto, /\d/);
  const metros = explicarConteo({ estado: "ok", teorico: 4.5, contado: 4.5, contado_por: "t", unidad: "m" }, { nombre });
  assert.equal(metros.texto, "El sistema decía 4,5 m y Tomas contó 4,5 m: coincide. No se tocó el stock.");
  assert.equal(motivoAnulacion("Conteo diario 10/11\n[anulado] Revierte movimiento x - Motivo reversion: se duplico"), "se duplico");
  assert.equal(motivoAnulacion("Conteo diario 10/11"), null);
});

test("el segundo conteo dice por qué no se corrigió solo", async () => {
  const { explicarConteo } = await import("./conteoDiario.js");
  const nombre = () => "Tomas";
  const pocas = explicarConteo({ estado: "recontar", teorico: 3, contado: 2, contado_por: "t", recuento_motivo: "pocas" }, { nombre });
  assert.equal(pocas.texto, "El sistema decía 3 y Tomas contó 2 (faltaba 1). Hay pocas unidades: no se corrige solo aunque la diferencia sea chica. Falta que otra persona lo cuente, y para ajustar los dos conteos tienen que dar igual.");
  const ciego = explicarConteo({ estado: "recontar", teorico: 3, contado: 2, contado_por: "t", recuento_motivo: "caro" }, { nombre, verNumeros: false });
  assert.equal(ciego.texto, "Tomas lo contó y no coincidió con el sistema. Es un producto caro: no se corrige solo aunque la diferencia sea chica. Falta que otra persona lo cuente.");
  const viejo = explicarConteo({ estado: "recontar", teorico: 3, contado: 1, contado_por: "t" }, { nombre });
  assert.equal(viejo.texto, "El sistema decía 3 y Tomas contó 1 (faltaban 2). No se corrige solo. Falta que otra persona lo cuente.");
});
