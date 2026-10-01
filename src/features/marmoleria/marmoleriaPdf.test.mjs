import test from "node:test";
import assert from "node:assert/strict";
import { armarListado, construirPdfMarmoleria, nombresDePiedra } from "./marmoleriaPdf.js";

const pieza = (extra) => ({
  codigo_barco: "55-2",
  sector: "Cocina",
  pieza: "Mesada",
  color: "Purastone Desert Black",
  estado: "Enviado",
  fecha_envio: "2026-09-14",
  prioridad: "Media",
  opcional: false,
  observaciones: null,
  ...extra,
});

test("la misma piedra escrita distinto figura una sola vez y bien escrita", () => {
  const nombres = nombresDePiedra([
    pieza({ color: "Purastone travertino navona     " }),
    pieza({ color: "Purastone travertino navona" }),
    pieza({ color: "Purastone Travertino Navona" }),
  ]);
  assert.equal(nombres.size, 1);
  assert.equal([...nombres.values()][0], "Purastone Travertino Navona");
});

test("una pieza sin piedra queda vacía, no con la de otra pieza del ambiente", () => {
  const [barco] = armarListado([
    pieza({ pieza: "Mesada", color: "Macchia Vecchia Mate" }),
    pieza({ pieza: "Zocalo 1", color: null }),
  ]).barcos;
  const [mesada, zocalo] = barco.ambientes[0].piezas;
  assert.equal(mesada.piedra, "Macchia Vecchia Mate");
  assert.equal(zocalo.piedra, "");
});

test("barcos en orden numérico y ambientes agrupados sin importar mayúsculas", () => {
  const listado = armarListado([
    pieza({ codigo_barco: "85-10" }),
    pieza({ codigo_barco: "85-2", sector: "cocina", pieza: "zocalo 2" }),
    pieza({ codigo_barco: "85-2", sector: "Cocina", pieza: "Zocalo 10" }),
    pieza({ codigo_barco: "85-2", sector: "Baño", pieza: "Bacha" }),
  ]);
  assert.deepEqual(listado.barcos.map((b) => b.codigo), ["85-2", "85-10"]);
  const [banio, cocina] = listado.barcos[0].ambientes;
  assert.equal(banio.nombre, "Baño");
  assert.equal(cocina.piezas.length, 2);
  assert.deepEqual(cocina.piezas.map((p) => p.pieza), ["Zocalo 2", "Zocalo 10"]);
});

test("cuenta las piezas a rehacer y las fechas de envío de cada barco", () => {
  const [barco] = armarListado([
    pieza({ estado: "Rehacer", fecha_envio: "2026-09-18" }),
    pieza({ fecha_envio: "2026-09-14" }),
    pieza({ fecha_envio: "2026-09-14" }),
  ]).barcos;
  assert.equal(barco.rehacer, 1);
  assert.deepEqual(barco.fechas, ["2026-09-14", "2026-09-18"]);
});

test("un barco más largo que una hoja se parte en varias hojas sin romper", () => {
  const piezas = Array.from({ length: 70 }, (_, i) =>
    pieza({
      sector: `Ambiente ${i % 7}`,
      pieza: `Pieza ${i}`,
      color: i % 5 ? "Laurent" : "",
      estado: i % 9 ? "Enviado" : "Rehacer",
      observaciones: i % 11 ? null : "Medir de nuevo contra el mamparo antes de cortar la pieza",
    }),
  );
  const doc = construirPdfMarmoleria({ piezas, fecha: "2026-10-01" });
  assert.ok(doc.getNumberOfPages() >= 3);
});
