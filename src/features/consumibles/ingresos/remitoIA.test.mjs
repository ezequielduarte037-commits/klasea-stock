import { test } from "node:test";
import assert from "node:assert/strict";
import { emparejarRenglones, lineaDesdeRenglonRemito, normalizarCodigoRemito, parecido } from "./remitoIA.js";
import { actualizarLinea, calcularLinea } from "./ingresoCalculos.js";
import { prepararIngreso } from "./ingresoRegistro.js";

const catalogo = [
  { id: "a", descripcion: "Parker cab fijadora AISI304 6 X 1 1/4", alias: null, codigos: ["PARFIJ0016"] },
  { id: "b", descripcion: "Parker cab fijadora AISI304 6 X 3/4", alias: null, codigos: ["PARFIJ0013"] },
  { id: "c", descripcion: "LIJA AL AGUA AA #600", alias: "Lija Al Agua 600", codigos: ["L0019", "7791234567890"] },
  { id: "d", descripcion: "BARBIJO 3 TELAS", alias: null, codigos: ["B007-3TEL"] },
];

test("por código de Rebollar, aunque venga con espacios o en minúscula", () => {
  const [r] = emparejarRenglones([{ descripcion: "lo que sea", codigo: "parfij 0016", cantidad: 500 }], catalogo);
  assert.equal(r.item.id, "a");
  assert.equal(r.por, "codigo");
  assert.equal(r.renglon.cantidad, 500);
  assert.equal(normalizarCodigoRemito(" b007-3tel "), "B007-3TEL");
  assert.equal(emparejarRenglones([{ descripcion: "x", codigo: "B007-3TEL", cantidad: 2 }], catalogo)[0].item.id, "d");
});

test("por nombre solo si coinciden todas las medidas", () => {
  const [r] = emparejarRenglones([{ descripcion: "Parker cab fijadora AISI304 6 x 3/4", cantidad: "100" }], catalogo);
  assert.equal(r.item?.id, "b");
  assert.equal(r.por, "nombre");
  // Otra medida: no lo confunde con ninguno.
  const [otro] = emparejarRenglones([{ descripcion: "Parker cab fijadora AISI304 8 x 1", cantidad: 1 }], catalogo);
  assert.equal(otro.item, null);
  assert.equal(parecido("Parker 8 x 1", catalogo[0]), 0);
});

test("el alias también sirve para emparejar", () => {
  const [r] = emparejarRenglones([{ descripcion: "Lija al agua 600", cantidad: 50 }], catalogo);
  assert.equal(r.item?.id, "c");
});

test("cantidades con coma decimal o miles", () => {
  const filas = emparejarRenglones([
    { descripcion: "a", codigo: "L0019", cantidad: "1.500,5" },
    { descripcion: "a", codigo: "L0019", cantidad: "2,5" },
    { descripcion: "a", codigo: "L0019", cantidad: 3 },
  ], catalogo);
  assert.deepEqual(filas.map((f) => f.renglon.cantidad), [1500.5, 2.5, 3]);
});

test("renglones vacíos se descartan y lo dudoso queda sin producto", () => {
  const filas = emparejarRenglones([{ descripcion: "", codigo: "" }, { descripcion: "Producto que no existe", cantidad: 1 }], catalogo);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].item, null);
});

const cinta = { id: "cinta", descripcion: "Cinta verde 48mm", unidad: "rollo", codigos: ["C0032"], config: { factor_compra: 18, unidad_compra: "caja", costo_unitario_ars: 5287.36 } };

test("18 rollos del remito no se convierten en 324 ni se divide el costo por 18", () => {
  const [r] = emparejarRenglones([{ codigo: "C0032", cantidad: "18,00", precio_unitario: "5.287,36" }], [cinta], { moneda: "ARS" });
  const linea = lineaDesdeRenglonRemito(r.item, r.renglon);
  const { filas: [m] } = prepararIngreso({ lineas: [linea] }, "Chubut", () => "id");
  assert.equal(m.cantidad, 18);
  assert.equal(m.costo_unitario_ars, 5287.36);
  assert.equal(linea.recordar, false);
});

test("el sellador cotizado por unidad conserva su costo aunque se compre en cajas de 12", () => {
  const item = { id: "s", unidad: "unidad", config: { factor_compra: 12, unidad_compra: "caja", costo_unitario_ars: 13274.8 } };
  const linea = lineaDesdeRenglonRemito(item, { cantidad: 12, precio_unitario: 13317.9 });
  assert.equal(linea.presentacionPendiente, false);
  const c = calcularLinea(linea);
  assert.equal(c.cantidadEntrega, 12);
  assert.equal(c.costoEntrega, 13274.8);
  assert.equal(c.subtotal, 159297.6);
});

test("blísteres, cartón, alcohol y látex se convierten una vez a la unidad de stock", () => {
  const casos = [
    ["cutter", "hoja", "blister", 10, 180.808, 5, 1808.08, 50],
    ["carton", "metro", "rollo", 25, 462.8, 2, 11570, 50],
    ["alcohol", "litro", "bidon", 5, 2694, 2, 13470, 10],
    ["latex", "par", "caja", 50, 108, 10, 5400, 500],
  ];
  for (const [id, unidad, compra, factor, costo, cantidad, precio, esperado] of casos) {
    const item = { id, unidad, config: { factor_compra: factor, unidad_compra: compra, costo_unitario_ars: costo } };
    const linea = lineaDesdeRenglonRemito(item, { cantidad, precio_unitario: precio });
    const c = calcularLinea(linea);
    assert.equal(c.valida, true, id);
    assert.equal(c.cantidadEntrega, esperado, id);
    assert.equal(c.costoEntrega, costo, id);
  }
});

test("sin evidencia de presentación no deja guardar hasta elegir unidad o caja", () => {
  const linea = lineaDesdeRenglonRemito(cinta, { cantidad: 18 });
  assert.equal(linea.presentacionPendiente, true);
  assert.equal(calcularLinea(linea).valida, false);
  assert.throws(() => prepararIngreso({ lineas: [linea] }, "Chubut"), /Revisá/);
  const resuelta = actualizarLinea(linea, { porCaja: false });
  assert.equal(calcularLinea(resuelta).valida, true);
  assert.equal(calcularLinea(resuelta).cantidadEntrega, 18);
  assert.equal(calcularLinea(resuelta).costoEntrega, 5287.36);
});

test("una unidad explícita se respeta, las contradicciones se revisan y USD no se compara con pesos", () => {
  assert.equal(calcularLinea(lineaDesdeRenglonRemito(cinta, { cantidad: 18, unidad: "rollos" })).cantidadEntrega, 18);
  const caja = lineaDesdeRenglonRemito(cinta, { cantidad: 2, unidad: "cajas" });
  assert.equal(calcularLinea(caja).cantidadEntrega, 36);
  assert.equal(calcularLinea(caja).costoEntrega, 5287.36);
  assert.equal(lineaDesdeRenglonRemito(cinta, { cantidad: 18, unidad: "caja", precio_unitario: 5287.36 }).presentacionPendiente, true);
  assert.equal(lineaDesdeRenglonRemito(cinta, { cantidad: 18, precio_unitario: 5287.36, moneda: "USD" }).presentacionPendiente, true);
});

test("una cantidad ilegible no se reemplaza por una unidad inventada", () => {
  const linea = lineaDesdeRenglonRemito(cinta, { cantidad: null, unidad: "rollo" });
  assert.equal(linea.cantidad, "");
  assert.equal(calcularLinea(linea).valida, false);
});
