import test from "node:test";
import assert from "node:assert/strict";
import { guardarCatalogoIngreso, leerCatalogoIngreso } from "./catalogoIngresoCache.js";

const producto = { id: "guante", descripcion: "Guante", activo: true };
function almacen() {
  const datos = new Map();
  return { datos, getItem: (key) => datos.get(key) ?? null, setItem: (key, value) => datos.set(key, value) };
}

test("abre con la copia guardada y separa las sedes", () => {
  const storage = almacen();
  assert.equal(guardarCatalogoIngreso("Chubut", [producto], storage), true);
  assert.deepEqual(leerCatalogoIngreso("Chubut", storage), [producto]);
  assert.equal(leerCatalogoIngreso("Pampa", storage), null);
});

test("aprovecha Mostrador, descarta inactivos y conserva su copia de stock", () => {
  const storage = almacen();
  const key = "klasea.consumibles.mostrador.datos.Chubut";
  const previo = JSON.stringify({ catalogo: [producto, { ...producto, id: "inactivo", activo: false }], obras: ["obra"] });
  storage.setItem(key, previo);
  assert.deepEqual(leerCatalogoIngreso("Chubut", storage), [producto]);
  guardarCatalogoIngreso("Chubut", [], storage);
  assert.equal(storage.getItem(key), previo);
  assert.deepEqual(leerCatalogoIngreso("Chubut", storage), []);
});

test("un navegador sin almacenamiento o una copia dañada no rompen la carga", () => {
  const storage = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("sin espacio"); } };
  assert.equal(leerCatalogoIngreso("Chubut", storage), null);
  assert.equal(guardarCatalogoIngreso("Chubut", [producto], storage), false);
  const corrupto = almacen();
  corrupto.setItem("klasea.consumibles.ingreso.catalogo.v1.Chubut", "[{\"id\":123}]");
  assert.equal(leerCatalogoIngreso("Chubut", corrupto), null);
});
