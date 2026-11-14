import test from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetasMarmoleria, construirHtmlEtiquetasMarmoleria } from "./etiquetasMarmoleria.js";

const unidad = { id: "barco-1", codigo: "37-37" };
const pieza = (extra = {}) => ({ id: "pieza-1", unidad_id: unidad.id, sector: "Cockpit", pieza: "Tapa Mesada", color: "Desert Black", estado: "Pendiente", ...extra });

test("una etiqueta por pieza del barco, incluida recibida y a rehacer; excluye No lleva", () => {
  const { etiquetas } = armarEtiquetasMarmoleria({ unidad, piezas: [
    pieza(), pieza({ id: "2", estado: "Recibido" }), pieza({ id: "3", estado: "Rehacer" }), pieza({ id: "4", estado: "No lleva" }),
  ] });
  assert.equal(etiquetas.length, 3);
  assert.ok(etiquetas.every((e) => e.obra === "37-37"));
});

test("no imprime piezas de otra embarcación ni duplicadas", () => {
  assert.throws(() => armarEtiquetasMarmoleria({ unidad, piezas: [pieza({ unidad_id: "barco-2" })] }), /no corresponden/);
  assert.throws(() => armarEtiquetasMarmoleria({ unidad, piezas: [pieza(), pieza()] }), /repetidas/);
});

test("no inventa el material de una pieza vacía aunque su sector tenga piedra", () => {
  const lista = armarEtiquetasMarmoleria({ unidad, piezas: [pieza(), pieza({ id: "2", pieza: "Zócalo", color: null })] });
  assert.equal(lista.sinMaterial, 1);
  assert.equal(lista.etiquetas.find((e) => e.id === "2").material, "");
  assert.match(construirHtmlEtiquetasMarmoleria({ unidad, piezas: [pieza({ color: null })] }), /Material a confirmar/);
});

test("el orden agrupa sectores y conserva la numeración natural de piezas", () => {
  const lista = armarEtiquetasMarmoleria({ unidad, piezas: [
    pieza({ id: "3", pieza: "Zócalo 10" }), pieza({ id: "2", pieza: "Zócalo 2" }), pieza({ id: "1", sector: "Baño" }),
  ] });
  assert.deepEqual(lista.etiquetas.map((e) => e.id), ["1", "2", "3"]);
});

test("nombres, material y código con HTML se imprimen como texto", () => {
  const html = construirHtmlEtiquetasMarmoleria({ unidad: { ...unidad, codigo: '37-37 <script>alert(1)</script>' }, piezas: [pieza({ pieza: '<img src=x onerror="alert(1)">', color: 'A & B' })], autoPrint: false });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /A &amp; B/);
});

test("bloquea un barco vacío o una pieza sin nombre", () => {
  assert.throws(() => construirHtmlEtiquetasMarmoleria({ unidad, piezas: [] }), /no tiene piezas/);
  assert.throws(() => armarEtiquetasMarmoleria({ unidad, piezas: [pieza({ pieza: ' ' })] }), /sin nombre/);
});
