import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoRevisarUnidad } from "./reglas.js";

const item = (descripcion, unidad = "unidad", factor = 1) => ({ descripcion, unidad, config: { factor_compra: factor } });

test("revisar unidad: blíster sin factor, rollos que se cortan y cajas por N", () => {
  assert.match(motivoRevisarUnidad(item("T118B Hoja calar Blister")), /blíster/);
  assert.equal(motivoRevisarUnidad(item("T118B Hoja calar Blister", "hoja", 5)), null);
  assert.match(motivoRevisarUnidad(item("Lija en rollo 0,12x45mts #36", "rollo")), /metro/);
  assert.equal(motivoRevisarUnidad(item("Lija en rollo 0,12x45mts #36", "metro", 45)), null);
  assert.match(motivoRevisarUnidad(item("PLURIBOL x25mts", "rollo")), /metro/);
  assert.match(motivoRevisarUnidad(item("GUANTES DE NITRILO X 100unid", "unidad")), /factor es 100/);
  assert.equal(motivoRevisarUnidad(item("PRECINTOS X 15cm x100unid", "unidad", 100)), null);
  // El cartón pasado a metro sin decir cuántos metros trae el rollo.
  const carton = { descripcion: "CARTON ROLLO", unidad: "metro", formaEntrega: "fraccionado", config: { unidad_compra: "unidad", factor_compra: 1 } };
  assert.match(motivoRevisarUnidad(carton), /cada metro vale el envase entero/);
  assert.equal(motivoRevisarUnidad({ ...carton, config: { unidad_compra: "rollo", factor_compra: 50 } }), null);
});

test("revisar unidad: no marca medidas ni rollos que se entregan enteros", () => {
  assert.equal(motivoRevisarUnidad(item("3,5 X 16 FIX")), null);
  assert.equal(motivoRevisarUnidad(item("Cinta DobleA #988 18mm x 50mts", "rollo")), null);
  assert.equal(motivoRevisarUnidad(item("LIJA AL AGUA AA #600")), null);
  assert.equal(motivoRevisarUnidad(item("LIJA X METRO #36", "metro")), null);
  assert.equal(motivoRevisarUnidad(item("Film x 2400", "rollo")), null);
});
