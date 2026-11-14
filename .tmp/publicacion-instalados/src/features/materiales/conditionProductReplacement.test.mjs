import test from "node:test";
import assert from "node:assert/strict";
import { findConditionProductReplacements } from "./conditionProductReplacement.js";

const base = [{ materialId: "requisito", productoMaterialId: "cromado", cantidad: 2 }];
const links = [
  { requisito_material_id: "requisito", producto_material_id: "cromado" },
  { requisito_material_id: "requisito", producto_material_id: "negro" },
];
const items = [
  { id: "quita", material_id: "cromado", tipo_item: "quita", cantidad: 2 },
  { id: "agrega", material_id: "negro", tipo_item: "extra", cantidad: 2 },
];

test("sustituye cromado por negro en el mismo requisito", () => {
  const result = findConditionProductReplacements(base, items, links);
  assert.deepEqual(result.replacements.map(({ requirementId, productId }) => ({ requirementId, productId })), [
    { requirementId: "requisito", productId: "negro" },
  ]);
  assert.deepEqual([...result.consumedItemIds], ["quita", "agrega"]);
});

test("no sustituye si cantidad o vínculo son ambiguos", () => {
  assert.equal(findConditionProductReplacements(base, [{ ...items[0], cantidad: 1 }, items[1]], links).replacements.length, 0);
  assert.equal(findConditionProductReplacements(base, items, links.slice(0, 1)).replacements.length, 0);
  assert.equal(findConditionProductReplacements(base, [...items, { ...items[1], id: "agrega-otro" }], links).replacements.length, 0);
});

test("respeta accesorios de una unidad y no consume opciones inactivas", () => {
  const one = [{ ...base[0], cantidad: 1 }];
  const oneItems = items.map((item) => ({ ...item, cantidad: 1 }));
  assert.equal(findConditionProductReplacements(one, oneItems, links).replacements.length, 1);
  assert.equal(findConditionProductReplacements(one, [{ ...oneItems[0], activo: false }, oneItems[1]], links).replacements.length, 0);
});
