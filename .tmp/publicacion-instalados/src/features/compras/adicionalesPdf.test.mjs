import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import {
  cantidadVisible, construirDetalleAdicionales, descripcionVisible, diferenciaDesglose,
  leerDesglose, prepararDetalle, textoPdf,
} from "./adicionalesPdf.js";

const renglon = (extra) => ({
  id: extra.id ?? Math.random().toString(36).slice(2),
  entry_date: "2026-09-01",
  created_at: "2026-09-01T10:00:00Z",
  detail: "Mesada",
  amount: 1000,
  currency: "ARS",
  notes: null,
  cantidad: null,
  ...extra,
});

test("pesos y dólares van por separado y nunca se suman", () => {
  const { monedas } = prepararDetalle([
    renglon({ amount: 100 }),
    renglon({ amount: 50.5 }),
    renglon({ amount: 3600, currency: "USD" }),
  ]);
  assert.deepEqual(monedas.map((m) => [m.moneda, m.total, m.filas.length]), [["ARS", 150.5, 2], ["USD", 3600, 1]]);
});

test("lo cancelado en Compras no va, aunque las notas digan otro estado", () => {
  const vivo = renglon({ id: "a", purchase_request_item_id: "pri", notes: "2 unidad / Estado: Pedido" });
  const enNotas = renglon({ id: "b", notes: "10 unidad / Estado: Cancelado", amount: null });
  const detalle = prepararDetalle([vivo, enNotas, renglon({ id: "c" })], {
    compraDe: (item) => (item.purchase_request_item_id === "pri" ? { estado: "cancelado" } : null),
  });
  assert.equal(detalle.cancelados, 2);
  assert.deepEqual(detalle.monedas[0].filas.map((r) => r.id), ["c"]);
  assert.equal(detalle.sinImporte.length, 0);
});

test("lo que no tiene importe va aparte, al final de la numeración, o no va", () => {
  const rows = [renglon({ id: "con" }), renglon({ id: "sin", amount: null })];
  const con = prepararDetalle(rows);
  assert.deepEqual([con.monedas[0].filas[0].numero, con.sinImporte[0].numero], [1, 2]);
  const sin = prepararDetalle(rows, { incluirSinImporte: false });
  assert.equal(sin.sinImporte.length, 0);
  assert.equal(sin.sinImporteOmitidos, 1);
});

test("la cantidad sale del renglón, de la compra o de las notas viejas, con unidad prolija", () => {
  assert.equal(cantidadVisible({ cantidad: "2,5" }), "2,5");
  assert.equal(cantidadVisible({}, { cantidad: "8", unidad: "unidad" }), "8 u.");
  assert.equal(cantidadVisible({}, { cantidad: "2", unidad: "lata" }), "2 latas");
  assert.equal(cantidadVisible({}, { cantidad: "4", unidad: "litro" }), "4 L");
  assert.equal(cantidadVisible({ notes: "3 metro / Estado: Pendiente" }), "3 m");
  assert.equal(cantidadVisible({ notes: "Vinculado desde pedido" }), "");
});

test("la descripción no se reescribe: sólo espacios y mayúscula inicial", () => {
  assert.equal(descripcionVisible("  pistón  de gas de 1200N "), "Pistón de gas de 1200N");
  assert.equal(descripcionVisible("70 MTS DE CADENA GALVANIZADA EN CALIEMNTE"), "70 MTS DE CADENA GALVANIZADA EN CALIEMNTE");
});

test("el texto se adapta a las fuentes del PDF sin perder tildes", () => {
  assert.equal(textoPdf("Zócalo ñandú “2 × 3” − 1 →"), "Zócalo ñandú “2 × 3” - 1 ?");
});

test("el desglose se lee de la columna y se compara con el importe", () => {
  const desglose = { emisor: "CMR", comprobantes: [{ numero: "1", importe: "10.5" }, { numero: "2", importe: 20 }, {}] };
  assert.equal(leerDesglose(desglose).comprobantes.length, 2);
  assert.equal(diferenciaDesglose({ amount: 30.5, desglose }), 0);
  assert.equal(diferenciaDesglose({ amount: 31, desglose }), -0.5);
  assert.equal(leerDesglose(null), null);
});

test("el PDF anexa las copias al final y enlaza renglón, desglose y copias", async () => {
  const original = new jsPDF({ unit: "pt", format: "a4" });
  original.text("Comprobante 1", 40, 40);
  original.addPage();
  original.text("Comprobante 2", 40, 40);
  const bytesOriginal = new Uint8Array(original.output("arraybuffer"));

  const conDesglose = renglon({
    id: "reb",
    detail: "Rebollar",
    amount: 30,
    desglose: { emisor: "CMR", comprobantes: [{ numero: "A", fecha: "2026-03-06", importe: 10, pagina: 1 }, { numero: "B", fecha: "2026-04-22", importe: 20, pagina: 2 }] },
    adjunto_path: "x.pdf",
  });
  const rows = [conDesglose, ...Array.from({ length: 60 }, (_, i) => renglon({ detail: `Renglón ${i}`, amount: i % 3 ? 10 : null }))];
  const { bytes, paginas, avisos } = await construirDetalleAdicionales({
    board: { name: "85-2" }, rows, adjuntos: new Map([["reb", bytesOriginal]]), fecha: "2026-10-01",
  });
  assert.deepEqual(avisos, []);

  const { PDFDocument, PDFName } = await import("pdf-lib");
  const final = await PDFDocument.load(bytes);
  assert.equal(final.getPageCount(), paginas);
  const enlaces = final.getPages().map((p) => p.node.lookup(PDFName.of("Annots"))?.size?.() ?? 0);
  // renglón -> anexo, anexo -> renglón + 2 copias, cada copia -> anexo
  assert.equal(enlaces.reduce((t, n) => t + n, 0), 1 + 3 + 2);
  assert.deepEqual(enlaces.slice(-2), [1, 1]);
});

test("si el desglose no suma el importe del renglón, avisa", async () => {
  const { avisos } = await construirDetalleAdicionales({
    board: { name: "X" },
    rows: [renglon({ amount: 100, desglose: { comprobantes: [{ numero: "1", importe: 90 }] } })],
  });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /suma \$ 90,00/);
});
