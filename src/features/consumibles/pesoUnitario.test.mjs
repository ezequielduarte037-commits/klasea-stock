import { test } from "node:test";
import assert from "node:assert/strict";
import { referenciaPeso } from "./pesoUnitario.js";

test("peso directo admite coma y punto, incluso fracciones de gramo", () => {
  assert.equal(referenciaPeso({ gramos:"0,2" }).pesoUnitarioG,0.2);
  assert.equal(referenciaPeso({ gramos:"4.05" }).pesoUnitarioG,4.05);
});

test("muestra divide por la cantidad exacta, sin redondear antes del conteo", () => {
  const r = referenciaPeso({ modo:"muestra", gramos:"29", piezas:"30" });
  assert.deepEqual(r,{ pesoUnitarioG:29/30,gramosMuestra:29,piezas:30 });
  assert.equal(Math.round(1495 / r.pesoUnitarioG),1547);
  assert.equal(referenciaPeso({ modo:"muestra",gramos:"31",piezas:"25" }).pesoUnitarioG,1.24);
});

test("rechaza pesos vacíos, cero, negativos o no finitos y muestras no enteras", () => {
  for (const gramos of [null,"",0,-1,"abc",Infinity]) assert.throws(()=>referenciaPeso({gramos}));
  for (const piezas of [null,"",0,-1,"2,5",Infinity]) assert.throws(()=>referenciaPeso({modo:"muestra",gramos:20,piezas}));
});
