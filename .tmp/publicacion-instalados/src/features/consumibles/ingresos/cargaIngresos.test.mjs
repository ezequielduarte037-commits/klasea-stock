import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conPlazoLectura } from "../lecturas.js";

const fuente = readFileSync(new URL("./IngresosTab.jsx", import.meta.url), "utf8");
const inicio = fuente.indexOf("  const cargar = useCallback(");
const fin = fuente.indexOf("\n  useEffect(", inicio);
const callback = fuente.slice(inicio, fin);

function crearCarga({ historial, catalogo = Promise.resolve([{ id: "guante" }]) }) {
  let mostrado;
  let opciones;
  const cargar = new Function("useCallback", "setErrorCarga", "cargarHistorial", "fetchCatalogoIngreso", "conPlazoLectura", "setCatalogo", "cargarPedidos", "sede", "setCatalogoVigente", "guardarCatalogoIngreso", `${callback}; return cargar;`)(
    (fn) => fn, () => {}, historial,
    (args) => { opciones = args; return catalogo; }, conPlazoLectura,
    (cat) => { mostrado = cat; }, async () => {}, "Chubut", () => {}, () => {},
  );
  return { cargar, mostrado: () => mostrado, opciones: () => opciones };
}

test("permite cargar el remito aunque el historial no responda", async () => {
  const carga = crearCarga({ historial: () => new Promise(() => {}) });
  await conPlazoLectura(carga.cargar(), 1000);
  assert.deepEqual(carga.mostrado(), [{ id: "guante" }]);
  assert.deepEqual(carga.opciones(), { sede: "Chubut" });
});

test("un fallo del historial no se presenta como error del catálogo", async () => {
  const carga = crearCarga({ historial: async () => { throw new Error("historial sin red"); } });
  await carga.cargar();
  assert.ok(carga.mostrado());
});

test("un fallo real del catálogo permite ofrecer reintento", async () => {
  const carga = crearCarga({ historial: async () => [], catalogo: Promise.reject(new Error("catálogo sin red")) });
  await assert.rejects(carga.cargar(), /catálogo sin red/);
  assert.equal(carga.mostrado(), undefined);
});
