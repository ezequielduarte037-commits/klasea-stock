import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_LOTE, RETIRO_INSTALADO, enParalelo, esInstalado, estadoParaGuardar, planCambioEstadoLote } from "./cambioEstadoLote.js";

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

test("Instalado se guarda como egresado con la marca, sin pedir quién retiró", () => {
  assert.deepEqual(estadoParaGuardar("instalado", "Juan"), { estado: "egresado", retiradoPor: RETIRO_INSTALADO });
  assert.deepEqual(estadoParaGuardar("egresado", "Juan"), { estado: "egresado", retiradoPor: "Juan" });
  assert.ok(esInstalado({ retirado_por: " instalado en el barco " }));
  assert.ok(!esInstalado({ retirado_por: "Anterior al sistema" }));
});

test("Instalado: un entregado se puede pasar, uno ya instalado no se toca", () => {
  const rows = [
    { id: 1, estado: "pendiente" },
    { id: 2, estado: "egresado", retirado_por: "Juan" },
    { id: 3, estado: "egresado", retirado_por: RETIRO_INSTALADO },
    { id: 4, estado: "en_panol" },
  ];
  const plan = planCambioEstadoLote(rows, "instalado", estadoDe);
  assert.deepEqual(plan.aplicar.map((r) => r.id), [1, 2, 4]);
  assert.deepEqual(plan.yaEstan.map((r) => r.id), [3]);
  assert.deepEqual(plan.descuentanStock.map((r) => r.id), [4]);
  assert.equal(plan.pideQuienRetiro, false);
});
