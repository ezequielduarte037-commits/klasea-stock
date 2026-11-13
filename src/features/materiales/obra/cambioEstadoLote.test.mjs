import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_LOTE, enParalelo, planCambioEstadoLote } from "./cambioEstadoLote.js";

const estadoDe = (row) => row.estado;

test("en lote no se ofrece En pañol: sumaría stock que no existe", () => {
  assert.ok(!ESTADOS_LOTE.some((e) => e.value === "en_panol"));
});

test("saltea lo que ya está en ese estado", () => {
  const plan = planCambioEstadoLote([{ id: 1, estado: "pendiente" }, { id: 2, estado: "egresado" }], "egresado", estadoDe);
  assert.deepEqual(plan.aplicar.map((r) => r.id), [1]);
  assert.deepEqual(plan.yaEstan.map((r) => r.id), [2]);
  assert.equal(plan.pideQuienRetiro, true);
});

test("avisa cuáles se descuentan del pañol al pasar a Entregado", () => {
  const plan = planCambioEstadoLote([{ id: 1, estado: "pendiente" }, { id: 2, estado: "en_panol" }], "egresado", estadoDe);
  assert.deepEqual(plan.descuentanStock.map((r) => r.id), [2]);
});

test("volver a Pendiente no pide persona ni descuenta", () => {
  const plan = planCambioEstadoLote([{ id: 1, estado: "egresado" }], "pendiente", estadoDe);
  assert.equal(plan.pideQuienRetiro, false);
  assert.equal(plan.descuentanStock.length, 0);
});

test("enParalelo respeta el límite y junta los errores sin cortar", async () => {
  let enCurso = 0, maximo = 0, avances = 0;
  const res = await enParalelo([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    enCurso += 1; maximo = Math.max(maximo, enCurso);
    await new Promise((r) => setTimeout(r, 5));
    enCurso -= 1;
    if (n === 4) throw new Error("falló");
    return n * 2;
  }, () => { avances += 1; });
  assert.ok(maximo <= 3);
  assert.equal(avances, 7);
  assert.equal(res.filter((r) => r.ok).length, 6);
  assert.equal(res[3].ok, false);
});
