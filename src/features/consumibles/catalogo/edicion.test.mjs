import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiosDeFicha, estadoInicial } from "./edicion.js";

const ficha = (config) => estadoInicial({ config, stockMinimo: null, ubicacion: null, alias: null, info: null });

test("pasar a metro sin factor no se guarda: cada metro valdría el rollo entero", () => {
  const inicial = ficha({ forma_entrega: "unidad", unidad_entrega: "unidad", unidad_compra: "unidad", factor_compra: 1 });
  assert.throws(() => cambiosDeFicha({ ...inicial, forma_entrega: "fraccionado", unidad_entrega: "metro" }, inicial), /cargá el factor/);
  const ok = cambiosDeFicha({ ...inicial, forma_entrega: "fraccionado", unidad_entrega: "metro", unidad_compra: "rollo", factor_compra: "50" }, inicial);
  assert.deepEqual(ok.config, { forma_entrega: "fraccionado", unidad_entrega: "metro", unidad_compra: "rollo", factor_compra: 50 });
});

test("fraccionado en otra unidad que la de compra pide el factor; la misma unidad, no", () => {
  const cola = ficha({ forma_entrega: "unidad", unidad_entrega: "unidad", unidad_compra: "kg", factor_compra: 1 });
  assert.throws(() => cambiosDeFicha({ ...cola, forma_entrega: "fraccionado" }, cola), /cuántos unidad trae cada kg/);
  const film = ficha({ forma_entrega: "unidad", unidad_entrega: "rollo", unidad_compra: "rollos", factor_compra: 1 });
  assert.equal(cambiosDeFicha({ ...film, forma_entrega: "fraccionado" }, film).config.forma_entrega, "fraccionado");
  // Sin tocar unidad ni forma, una ficha vieja con unidades distintas se sigue pudiendo editar.
  assert.equal(cambiosDeFicha({ ...cola, notas: "lata de 4 kg" }, cola).config.notas, "lata de 4 kg");
});
