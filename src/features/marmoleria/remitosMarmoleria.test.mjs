import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { alternarPlantillaRemito, datosSolicitudRemito, numeroRemitoMarmoleria, validarRemitoMarmoleria } from "./remitosMarmoleria.js";
import { construirPdfRemitoMarmoleria } from "./remitoMarmoleriaPdf.js";

const pieza = (id = "pieza-a", extra = {}) => ({ id, pieza_id:id, codigo_barco:"55-2", linea:"K55", sector:"Cocina", pieza:"Mesada", color:"Purastone Desert Black", material:"Purastone Desert Black", cantidad:1, ...extra });
const remito = (extra = {}) => ({ numero:42, fecha:"2026-10-15", destinatario:"Marmolería de prueba", entregado_por:"Juan Pérez", retira:"", observaciones:"", items:[pieza()], ...extra });

test("selección por id conserva otros barcos y no mezcla plantillas homónimas", () => {
  const p1 = pieza("p1");
  const p2 = pieza("p2", { codigo_barco:"55-3" });
  const seleccion = alternarPlantillaRemito(alternarPlantillaRemito({}, p1), p2);
  assert.deepEqual(Object.keys(seleccion), ["p1", "p2"]);
  assert.equal(seleccion.p2.material, p2.color);
  assert.deepEqual(Object.keys(alternarPlantillaRemito(seleccion, p1)), ["p2"]);
  assert.equal(Object.keys(seleccion).length, 2);
});

test("impide emitir sin material, sin destinatario, sin piezas o con cantidades inválidas", () => {
  assert.equal(validarRemitoMarmoleria(remito()), "");
  for (const cantidad of [0, -1, 1.5, 1000, "", "abc"]) {
    assert.match(validarRemitoMarmoleria(remito({ items:[pieza("p", { cantidad })] })), /entero/);
  }
  assert.match(validarRemitoMarmoleria(remito({ items:[pieza("p", { material:"  " })] })), /material/);
  assert.match(validarRemitoMarmoleria(remito({ destinatario:" " })), /destinatario/);
  assert.match(validarRemitoMarmoleria(remito({ items:[] })), /Seleccioná/);
  assert.match(validarRemitoMarmoleria(remito({ items:[pieza(), pieza()] })), /repetidos/);
  assert.match(validarRemitoMarmoleria(remito({ fecha:"2026-02-30" })), /fecha/);
});

test("el pedido guarda solo ids, cantidades y material, sin aceptar barco/pieza desde el cliente", () => {
  const r = remito();
  const solicitud = datosSolicitudRemito({ ...r, destinatario:"  Marmolería   de prueba " }, [pieza("p", { cantidad:"3" })]);
  assert.equal(solicitud.destinatario, "Marmolería de prueba");
  assert.deepEqual(solicitud.items, [{ pieza_id:"p", cantidad:3, material:"Purastone Desert Black" }]);
  assert.equal(numeroRemitoMarmoleria(42), "MAR-000042");
});

test("el PDF contiene original y duplicado con idéntico folio, material y espacio para firma", async () => {
  const doc = construirPdfRemitoMarmoleria({ remito:remito() });
  assert.equal(doc.getNumberOfPages(), 2);
  const saved = await PDFDocument.load(doc.output("arraybuffer"));
  assert.equal(saved.getPageCount(), 2);
  for (const page of Object.values(doc.internal.pages).filter(Array.isArray)) {
    const text = page.join(" ");
    assert.match(text, /MAR-000042/);
    assert.match(text, /Desert Black/);
    assert.match(text, /Firma de quien retira/);
    assert.match(text, /55-2/);
  }
});

test("los remitos extensos repiten datos de entrega y firmas sin perder filas entre copias", () => {
  const r = remito({
    observaciones:"Verificar medidas al recibir las plantillas. ".repeat(15),
    items:Array.from({ length:65 }, (_, i) => pieza(`p${i}`, { pieza:`Plantilla_${i}_fin`, codigo_barco:i % 2 ? "55-3" : "55-2", cantidad:i % 3 + 1, observaciones:"Revisar el borde contra el mamparo y la posición de la bacha." })),
  });
  const doc = construirPdfRemitoMarmoleria({ remito:r });
  const pages = doc.internal.pages.slice(1);
  assert.ok(pages.length > 2);
  assert.equal(pages.length % 2, 0);
  const mitad = pages.length / 2;
  for (const [n, page] of pages.entries()) {
    const text = page.join(" ");
    assert.match(text, n < mitad ? /ORIGINAL/ : /DUPLICADO/);
    assert.match(text, /MAR-000042/);
    assert.match(text, /Firma de quien retira/);
    assert.match(text, /Juan/);
    assert.match(text, /Cant\./);
  }
  for (const conjunto of [pages.slice(0, mitad), pages.slice(mitad)]) {
    const text = conjunto.map((p) => p.join(" ")).join(" ");
    for (let i = 0; i < r.items.length; i += 1) assert.ok(text.includes(`Plantilla_${i}_fin`), `Falta la plantilla ${i}`);
  }
});
