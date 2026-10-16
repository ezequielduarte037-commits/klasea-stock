import test from "node:test";
import assert from "node:assert/strict";
import { codigoObraEtiqueta, prepararEtiquetasMuebles, seleccionarEtiquetasMuebles, construirHtmlEtiquetasMuebles } from "./etiquetasMuebles.js";

const unidad = { id: "u1", codigo: "K37-44", linea_id: "l1", chapa_manual: "Roble Plata Rayado" };
const linea = { id: "l1", nombre: "K37" };
const pieza = (id, extra = {}) => ({ id, unidad_id: "u1", mueble_id: `m-${id}`, estado: "No enviado", prod_muebles: { nombre: `Pieza ${id}`, sector: "Salón" }, ...extra });
const numero = (id, nro_pieza) => ({ linea_id: "l1", mueble_id: `m-${id}`, nro_pieza });
const preparar = (extra = {}) => prepararEtiquetasMuebles({ unidad, linea, piezas: [pieza("a"), pieza("b")], plantilla: [numero("a", 24), numero("b", 4)], ...extra });

test("usa el número fijo de la línea y ordena por él, aunque cambie el orden del checklist", () => {
  const datos = preparar();
  assert.equal(datos.obra, "37-44");
  assert.deepEqual(datos.etiquetas.map(e => [e.id, e.numero]), [["b", 4], ["a", 24]]);
  assert.deepEqual(preparar({ piezas: [pieza("b"), pieza("a")] }).etiquetas, datos.etiquetas);
  assert.equal(codigoObraEtiqueta("KA-44"), "KA-44");
});
test("incluye recibidas y a rehacer, excluye No lleva, sin tomar piezas que sólo estén en la plantilla", () => {
  const datos = preparar({ piezas: [pieza("a", { estado: "Completo" }), pieza("b", { estado: "Rehacer" }), pieza("c", { estado: "No lleva" })], plantilla: [numero("a", 24), numero("b", 4), numero("c", 9), numero("d", 80)] });
  assert.deepEqual(datos.etiquetas.map(e => e.id), ["b", "a"]);
});
test("el enchapado corresponde al barco y modelo exactos; una OT vacía permite el dato manual", () => {
  const incorrectas = [{ modelo: "K37", barco: "37-440", tipo_chapa: "Incorrecto" }, { modelo: "K52", barco: "37-44", tipo_chapa: "Otro modelo" }];
  assert.equal(preparar({ ots: incorrectas }).enchapado, "Roble Plata Rayado");
  assert.equal(preparar({ ots: [...incorrectas, { modelo: " k37 ", barco: "37-44", tipo_chapa: "Nogal Natural" }] }).enchapado, "Nogal Natural");
  assert.equal(preparar({ ots: [{ modelo: "K37", barco: "K37-44", tipo_chapa: " " }] }).enchapado, "Roble Plata Rayado");
});
test("no confunde el campo color con el enchapado ni asigna números por posición", () => {
  const datos = preparar({ unidad: { ...unidad, chapa_manual: null, color: "Blanco" }, plantilla: [] });
  assert.equal(datos.enchapado, "");
  assert.ok(datos.etiquetas.every(e => e.numero === null && !e.imprimible));
  assert.throws(() => seleccionarEtiquetasMuebles(datos, ["a"]), /necesitan nombre y número/);
});
test("rechaza cruces de obra o línea, piezas duplicadas y números repetidos", () => {
  assert.throws(() => preparar({ piezas: [pieza("a", { unidad_id: "otra" })] }), /no corresponden/);
  assert.throws(() => preparar({ plantilla: [{ ...numero("a", 1), linea_id: "otra" }] }), /no corresponden/);
  assert.throws(() => preparar({ piezas: [pieza("a"), pieza("a")] }), /repetidas/);
  assert.throws(() => preparar({ plantilla: [numero("a", 4), numero("b", 4)] }), /mismo número/);
});
test("imprime sólo las piezas elegidas; no acepta una selección que desapareció", () => {
  const datos = preparar();
  assert.deepEqual(seleccionarEtiquetasMuebles(datos, ["a"]).map(e => e.numero), [24]);
  assert.throws(() => seleccionarEtiquetasMuebles(datos, []), /al menos una/);
  assert.throws(() => seleccionarEtiquetasMuebles(datos, ["b", "faltante"]), /Cambió la lista/);
  assert.throws(() => seleccionarEtiquetasMuebles(datos, ["a", "a"]), /Cambió la lista/);
});
test("el HTML trata los nombres y la chapa como texto, y conserva el formato físico de 50 × 80", () => {
  const datos = preparar({ unidad: { ...unidad, chapa_manual: '<img src=x onerror="alert(1)">' }, piezas: [pieza("a", { prod_muebles: { nombre: "Mesa <script>alert(1)</script>", sector: "A & B" } })] });
  const html = construirHtmlEtiquetasMuebles({ datos, ids: ["a"] });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /Mesa &lt;script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /@page\{size:50mm 80mm/);
});
test("un nombre faltante no se imprime y un enchapado vacío queda explícito", () => {
  const datos = preparar({ piezas: [pieza("a", { prod_muebles: null })] });
  assert.equal(datos.etiquetas[0].imprimible, false);
  const sinChapa = preparar({ unidad: { ...unidad, chapa_manual: null } });
  assert.match(construirHtmlEtiquetasMuebles({ datos: sinChapa, ids: ["a"] }), /Enchapado a confirmar/);
});
