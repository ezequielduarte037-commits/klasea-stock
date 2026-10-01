import test from "node:test";
import assert from "node:assert/strict";
import { materialDeSector, materialHeredable } from "./marmShared.js";

// Lo que pasó en el 85-2: el Salón tenía material en las piezas viejas y las
// tres cargadas el 01/10 quedaron vacías.
const salon85_2 = [
  { sector: "Salón", pieza: "Zócalo 2", color: "Macchia Vecchia Pulido" },
  { sector: "Salón", pieza: "Mesada", color: "Macchia Vecchia Pulido" },
  { sector: "Salón", pieza: "pieza 1", color: null },
  { sector: "Camarote de Marinero", pieza: "Mesada Cocina", color: "Macchia Vecchia Mate" },
];

test("el material del ambiente sale de todas sus piezas, no de la primera", () => {
  const piezas = [
    { color: null },
    { color: "Laurent" },
    { color: "laurent " },
    { color: "Negro Marquina" },
  ];
  assert.deepEqual(materialDeSector(piezas), { material: "Laurent", unico: false });
  assert.deepEqual(materialDeSector([{ color: null }]), { material: "", unico: false });
});

test("una pieza nueva hereda el material de su ambiente", () => {
  assert.equal(materialHeredable(salon85_2, "Salón"), "Macchia Vecchia Pulido");
  assert.equal(materialHeredable(salon85_2, "Camarote de Marinero"), "Macchia Vecchia Mate");
  assert.equal(materialHeredable(salon85_2, "Fly"), "");
});

test("con dos piedras en el ambiente no hereda ninguna", () => {
  const piezas = [
    { sector: "Baño", color: "Laurent" },
    { sector: "Baño", color: "Negro Marquina" },
  ];
  assert.equal(materialHeredable(piezas, "Baño"), "");
});
