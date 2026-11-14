import test from "node:test";
import assert from "node:assert/strict";
import { coincideProveedor, esProveedorAlternativo, nombreProveedorVisible, nombresProveedor } from "./proveedorNombre.js";

test("Iriarte y Casa Iriarte se muestran como un solo proveedor", () => {
  assert.equal(nombreProveedorVisible("Casa Iriarte"), "Iriarte");
  assert.equal(coincideProveedor("Casa Iriarte", "Iriarte"), true);
});

test("otros alias comprobados no generan columnas separadas", () => {
  assert.equal(nombreProveedorVisible("Electro 2001"), "2001");
  assert.equal(nombreProveedorVisible("Power Bat"), "PowerBat");
  assert.equal(nombreProveedorVisible("Rincon del Herraje"), "Rincón del Herraje");
  assert.equal(nombreProveedorVisible("TRIMER"), "Trimer");
  assert.equal(nombreProveedorVisible("LEVY"), "Levy");
});

test("dos vendedores siguen siendo dos alternativas y no un proveedor combinado", () => {
  assert.deepEqual(nombresProveedor("Janored/2001"), ["Janored", "2001"]);
  assert.equal(nombreProveedorVisible("All Built/ADS"), "All Built o ADS");
  assert.equal(esProveedorAlternativo("Janored/2001"), true);
  assert.equal(coincideProveedor("Janored/2001", "2001"), true);
});

test("la falta de proveedor no cuenta como una empresa", () => {
  assert.deepEqual(nombresProveedor("Sin proveedor"), []);
  assert.equal(coincideProveedor("", "Sin proveedor"), true);
});
