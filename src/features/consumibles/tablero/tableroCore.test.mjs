import { test } from "node:test";
import assert from "node:assert/strict";
import { claveViaje, construirTablero, datosFila, diaArgentina, ranking, resolverPeriodo } from "./tableroCore.js";

const material = (id, unidad = "unidad", rubro = "Abrasivos") => ({ id, descripcion: id,
  unidad_medida: "unidad de compra", config: { unidad_entrega: unidad }, categoria: { id: rubro, nombre: rubro } });
const retiro = (extra = {}) => ({ id: "r1", material_id: "disco", material: material("disco"),
  sede: "Chubut", tipo: "retiro", cantidad: -2, costo_unitario_ars: 100,
  created_at: "2026-10-13T10:00:00Z", empleado_id: "e1", empleado_nombre: "Ana",
  obra_id: "o1", obra: { codigo: "KA-01" }, sector: "Carpintería", carril: "mostrador", lote: "l1", ...extra });
const rango = { inicio: "2026-10-13", fin: "2026-10-15" };

test("los períodos cierran por día argentino, incluso cerca de medianoche UTC", () => {
  assert.equal(diaArgentina("2026-10-14T02:59:59Z"), "2026-10-13");
  assert.equal(diaArgentina("2026-10-14T03:00:00Z"), "2026-10-14");
  assert.deepEqual(resolverPeriodo("hoy", {}, "2026-10-13"), { inicio: "2026-10-13", fin: "2026-10-13", desde: "2026-10-13T03:00:00.000Z", hasta: "2026-10-14T03:00:00.000Z" });
  assert.equal(resolverPeriodo("7", {}, "2026-10-13").inicio, "2026-10-07");
  assert.equal(resolverPeriodo("30", {}, "2026-10-13").inicio, "2026-09-14");
  assert.equal(resolverPeriodo("rango", { desde: "2026-10-01", hasta: "2026-10-13" }).hasta, "2026-10-14T03:00:00.000Z");
  assert.ok(resolverPeriodo("rango", { desde: "2026-10-14", hasta: "2026-10-13" }).error);
  assert.ok(resolverPeriodo("rango", { desde: "2026-02-30", hasta: "2026-10-13" }).error);
});

test("un carrito repartido valoriza cada fila, pero genera un viaje y una incidencia por artículo", () => {
  const filas = [
    retiro({ id: "a", cantidad: -2, fuera_cupo: true, canje: "sin_usado", autorizado_por: "Luis" }),
    retiro({ id: "b", cantidad: -3, obra_id: "o2", obra: { codigo: "KA-02" }, fuera_cupo: true, canje: "sin_usado", autorizado_por: "Luis" }),
    retiro({ id: "c", material_id: "adhesivo", material: material("adhesivo", "litro", "Adhesivos"), cantidad: -0.5, costo_unitario_ars: 200 }),
    retiro({ id: "d", cantidad: -1, lote: "l2", carril: "planificado" }),
    retiro({ id: "anulado", cantidad: -999, anulado_at: "2026-10-14T10:00:00Z" }),
    retiro({ id: "ingreso", cantidad: 100, tipo: "ingreso" }),
    retiro({ id: "devolucion", cantidad: 1, tipo: "devolucion" }),
    retiro({ id: "fuera", created_at: "2026-10-16T10:00:00Z" }),
  ];
  const r = construirTablero({ ...rango, movimientos: filas });
  assert.equal(r.totales.pesos, 700);
  assert.deepEqual(r.totales.porUnidad, [["litro", 0.5], ["unidad", 6]]);
  assert.equal(r.viajes, 2);
  assert.equal(r.personas[0].total, 2);
  assert.deepEqual(r.personas[0].dias, { "2026-10-13": 2 });
  assert.equal(r.fueraCupo.length, 1);
  assert.equal(r.fueraCupo[0].cantidad, 5);
  assert.equal(r.sinUsado.length, 1);
  assert.equal(r.sectores[0].planificadoPct, 50);
  assert.equal(r.sectores[0].mostradorPct, 50);
  assert.equal(r.dias[1].planificadoPct, null);
  assert.equal(ranking(r.grupos.obra, "pesos")[0].valor, 400);
  assert.equal(ranking(r.grupos.rubro, "cantidad", "litro")[0].nombre, "Adhesivos");
});

test("el costo faltante se marca y el costo cero se considera conocido", () => {
  const r = construirTablero({ ...rango, movimientos: [retiro({ costo_unitario_ars: null }), retiro({ id: "cero", lote: "cero", costo_unitario_ars: 0, obra_id: "gratis", obra: { codigo: "Gratis" } })] });
  assert.equal(r.totales.sinCosto, 1);
  assert.equal(r.totales.conCosto, 1);
  assert.equal(r.totales.pesos, 0);
  assert.equal(ranking(r.grupos.obra, "pesos").length, 2);
  assert.equal(datosFila(retiro({ costo_unitario_ars: "0" })).tieneCosto, true);
});

test("los retiros planificados sin lote se agrupan por solicitud, persona, día y sede", () => {
  const a = retiro({ lote: null, solicitud_id: "s1", carril: "planificado" });
  const b = retiro({ id: "r2", lote: null, solicitud_id: "s1", carril: "planificado" });
  assert.equal(claveViaje(a), claveViaje(b));
  assert.notEqual(claveViaje(a), claveViaje({ ...a, sede: "Pampa" }));
  assert.notEqual(claveViaje(a), claveViaje({ ...a, empleado_id: "otra" }));
  assert.notEqual(claveViaje(a), claveViaje({ ...a, created_at: "2026-10-14T10:00:00Z" }));
  const r = construirTablero({ ...rango, movimientos: [a, b, retiro({ id: "sin", lote: null }), retiro({ id: "sector", lote: "sector", carril: "sector" })] });
  assert.equal(r.viajes, 3);
  assert.equal(r.sinLote, 1);
  assert.equal(r.otrosCarriles, 1);
  assert.equal(r.sectores[0].planificado, 1);
  assert.equal(r.sectores[0].mostrador, 1);
});

test("la merma exige un conteo anterior del mismo producto y sede aunque esté fuera del rango", () => {
  const conteo = (id, sede, created_at, cantidad) => retiro({ id, sede, tipo: "inventario", created_at, cantidad });
  const inicialChubut = conteo("i1", "Chubut", "2026-10-12T10:00:00Z", -5);
  const inicialPampa = conteo("i2", "Pampa", "2026-10-13T10:00:00Z", -7);
  const diferencia = conteo("i3", "Chubut", "2026-10-14T10:00:00Z", -3);
  const diferenciaPampa = conteo("i4", "Pampa", "2026-10-15T10:00:00Z", -2);
  const positivo = conteo("i5", "Chubut", "2026-10-15T12:00:00Z", 4);
  const r = construirTablero({ ...rango, conteos: [positivo, diferencia, inicialPampa, diferenciaPampa, inicialChubut], movimientos: [inicialPampa, diferencia, diferenciaPampa, positivo, retiro({ id: "merma-directa", tipo: "merma", cantidad: -99 })] });
  assert.deepEqual(r.mermas.map((m) => m.id), ["i4", "i3"]);
  assert.equal(r.resumenMermas.pesos, 500);
  assert.deepEqual(r.resumenMermas.porUnidad, [["unidad", 5]]);
});

test("sin movimientos hay ceros, listas vacías y días sin actividad", () => {
  const r = construirTablero(rango);
  assert.equal(r.viajes, 0);
  assert.equal(r.totales.pesos, 0);
  assert.deepEqual(r.personas, []);
  assert.deepEqual(r.mermas, []);
  assert.equal(r.dias.length, 3);
  assert.equal(r.dias.every((d) => d.planificadoPct === null), true);
});
