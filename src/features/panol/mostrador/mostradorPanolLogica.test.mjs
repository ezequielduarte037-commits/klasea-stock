import test from "node:test";
import assert from "node:assert/strict";
import {
  LIBRE,
  agregarVariante,
  buscarGrupos,
  cambiarVariante,
  carritoPorOrigen,
  destinoSugerido,
  elegirProducto,
  enSede,
  faltaEnDestino,
  gruposDeOrigen,
  gruposEgresables,
  gruposPorCodigo,
  lineasConDestino,
  notaDelEgreso,
  pantallaOperario,
  problemasDelCarrito,
  productoElegido,
  refrescarCarrito,
  rielDeOrigenes,
  sinPrefijo,
  sumarAlCarrito,
  sumarCantidad,
  textoDestino,
  ubicacionParaSumar,
  ultimaLinea,
  ultimosMovimientos,
} from "./mostradorPanolLogica.js";

const OBRAS = [
  { id: "o1", codigo: "52-27", estado: "activa" },
  { id: "o2", codigo: "52-28", estado: "activa" },
  { id: "o3", codigo: "43-02", estado: "terminada" },
];

const fila = (extra) => ({ estado: "en_panol", source: "stock_general", stock_sede: "Pampa", cantidad: 1, unidad: "unidad", ...extra });

function ledger() {
  return [
    fila({ id: "r1", material_id: "m1", descripcion: "Inodoro Tecma marino", codigo: "INO-1", codigo_barra: "779000111", cantidad: 2, ubicacion: "B-3" }),
    fila({ id: "r2", material_id: "m1", descripcion: "Inodoro Tecma marino", codigo: "INO-1", source: "transferencia_ingreso", obra_id: "o1", obra: { id: "o1", codigo: "52-27", estado: "activa" } }),
    fila({ id: "r3", material_id: "m2", descripcion: "Bomba de achique", source: "transferencia_ingreso", obra_id: "o1", obra: { id: "o1", codigo: "52-27" }, opcion_asignada: "12 V", cantidad: 2, variantes: ["12 V", "24 V"] }),
    fila({ id: "r4", material_id: "m2", descripcion: "Bomba de achique", source: "transferencia_ingreso", obra_id: "o1", obra: { id: "o1", codigo: "52-27" }, opcion_asignada: "24 V", cantidad: 1, variantes: ["12 V", "24 V"] }),
    fila({ id: "r5", material_id: "m3", descripcion: "Grifería baño", es_requisito: true, productos_compatibles: [{ id: "p1", descripcion: "FV 0181" }, { id: "p2", descripcion: "Hydros 23" }] }),
    fila({ id: "r6", material_id: "m4", descripcion: "Chaleco salvavidas", stock_sede: "Chubut", cantidad: 4 }),
    // Ya salió: queda en el historial, no en el stock.
    fila({ id: "r7", material_id: "m5", descripcion: "Ducha teléfono", estado: "egresado", source: "transferencia_ingreso", obra_id: "o2", obra: { id: "o2", codigo: "52-28" }, cantidad_egresada: 1, egreso_at: "2026-10-19T13:42:10Z", retirado_por: "Gómez Carlos (DNI 30111222)" }),
    fila({ id: "r8", material_id: "m6", descripcion: "Grifo cocina", estado: "egresado", source: "transferencia_ingreso", obra_id: "o2", obra: { id: "o2", codigo: "52-28" }, cantidad_egresada: 1, egreso_at: "2026-10-19T13:42:40Z", retirado_por: "Gómez Carlos (DNI 30111222)" }),
  ];
}

const grupo = (grupos, material) => grupos.find((g) => g.material.id === material);

test("solo se ofrece lo que tiene saldo, con sus ubicaciones", () => {
  const grupos = gruposEgresables(ledger());
  assert.deepEqual(grupos.map((g) => g.material.id).sort(), ["m1", "m2", "m3", "m4"]);
  const inodoro = grupo(grupos, "m1");
  assert.equal(inodoro.conSaldo.length, 2);
  assert.equal(inodoro.conSaldo.find((l) => !l.obraId).available, 2);
  assert.equal(inodoro.conSaldo.find((l) => l.obraId === "o1").available, 1);
});

test("la sede filtra ubicaciones, no productos enteros", () => {
  const grupos = gruposEgresables(ledger());
  assert.deepEqual(enSede(grupos, "Chubut").map((g) => g.material.id), ["m4"]);
  assert.equal(enSede(grupos, "Pampa").length, 3);
  assert.equal(enSede(grupos, "todas").length, 4);
});

test("el riel pone primero el stock libre y cuenta productos por obra", () => {
  const riel = rielDeOrigenes(enSede(gruposEgresables(ledger()), "Pampa"), OBRAS);
  assert.deepEqual(riel.map((r) => [r.codigo, r.productos]), [["Stock libre", 2], ["52-27", 2]]);
  assert.equal(gruposDeOrigen(gruposEgresables(ledger()), "o1").length, 2);
});

test("de dónde sale: con obra elegida, de ahí; con varias opciones y sin obra, se pregunta", () => {
  const grupos = gruposEgresables(ledger());
  const inodoro = grupo(grupos, "m1");
  assert.equal(ubicacionParaSumar(inodoro), null);
  assert.equal(ubicacionParaSumar(inodoro, "o1").obraId, "o1");
  assert.equal(ubicacionParaSumar(inodoro, LIBRE).obraId, "");
  assert.equal(ubicacionParaSumar(grupo(grupos, "m3")).available, 1);
  assert.equal(ubicacionParaSumar(grupo(grupos, "m3"), "o1"), null, "no tiene saldo en esa obra: se pregunta");
});

test("sumar nunca pasa lo que hay", () => {
  const inodoro = grupo(gruposEgresables(ledger()), "m1");
  const libre = inodoro.conSaldo.find((l) => !l.obraId);
  let r = sumarAlCarrito([], inodoro, libre, { ahora: 1 });
  assert.equal(r.cart.length, 1);
  assert.equal(r.cart[0].cantidad, "1");
  r = sumarAlCarrito(r.cart, inodoro, libre, { ahora: 2 });
  assert.equal(r.cart[0].cantidad, "2");
  assert.equal(r.tope, null);
  r = sumarAlCarrito(r.cart, inodoro, libre, { ahora: 3 });
  assert.equal(r.cart[0].cantidad, "2");
  assert.equal(r.tope, 2);
  // La otra ubicación del mismo producto va en otro renglón.
  r = sumarAlCarrito(r.cart, inodoro, inodoro.conSaldo.find((l) => l.obraId === "o1"), { ahora: 4 });
  assert.equal(r.cart.length, 2);
  assert.equal(ultimaLinea(r.cart).obraId, "o1");
  assert.equal(sumarCantidad(r.cart, r.cart[0].key, 5)[0].cantidad, "2");
  assert.equal(sumarCantidad(sumarCantidad(r.cart, r.cart[1].key, -1), r.cart[0].key, -1).length, 1);
});

test("variantes: cambiar usa el saldo de esa variante y no se duplican", () => {
  const bomba = grupo(gruposEgresables(ledger()), "m2");
  let { cart } = sumarAlCarrito([], bomba, bomba.conSaldo[0], { ahora: 1 });
  assert.equal(cart[0].available, 3);
  let r = cambiarVariante(cart, cart[0].key, "24 V");
  assert.equal(r.cart[0].variante, "24 V");
  assert.equal(r.cart[0].available, 1);
  cart = r.cart;
  r = agregarVariante(cart, cart[0].key, "12 V", { ahora: 2 });
  assert.equal(r.cart.length, 2);
  assert.equal(r.cart[1].available, 2);
  const otra = cambiarVariante(r.cart, r.cart[1].key, "24 V");
  assert.match(otra.error, /ya está/);
  // 1 de 24 V + 3 de 12 V: el renglón de 12 V se pasa de lo suyo.
  const excedido = r.cart.map((l, i) => (i === 1 ? { ...l, cantidad: "3" } : l));
  assert.ok(problemasDelCarrito(excedido).some((p) => /hay 2 de 12 V/.test(p.texto)));
});

test("un requisito no se firma sin elegir el producto concreto", () => {
  const grif = grupo(gruposEgresables(ledger()), "m3");
  const { cart } = sumarAlCarrito([], grif, grif.conSaldo[0]);
  assert.deepEqual(problemasDelCarrito(cart).map((p) => p.tipo), ["producto"]);
  assert.deepEqual(problemasDelCarrito(elegirProducto(cart, cart[0].key, "p2")), []);
  assert.equal(productoElegido(elegirProducto(cart, cart[0].key, "p2")[0]), "Hydros 23");
  assert.equal(sinPrefijo("CAJA DE PASO · 90X90X75", "Caja de paso"), "90X90X75");
  assert.equal(sinPrefijo("Caja de paso", "Caja de paso"), "Caja de paso");
});

test("el destino arranca solo cuando no hay nada que decidir", () => {
  const grupos = gruposEgresables(ledger());
  const bomba = grupo(grupos, "m2");
  const asignado = sumarAlCarrito([], bomba, bomba.conSaldo[0]).cart;
  assert.deepEqual(destinoSugerido(asignado, []), { obraId: null, sector: null, comentario: "" });

  const grif = grupo(grupos, "m3");
  const conLibre = sumarAlCarrito(asignado, grif, grif.conSaldo[0]).cart;
  assert.equal(destinoSugerido(conLibre, [{ id: "o1" }]).obraId, "o1");
  assert.equal(destinoSugerido(conLibre, [{ id: "o2" }]), null, "cargarlo a 52-28 reasignaría la bomba de 52-27");
  assert.equal(destinoSugerido(conLibre, [{ id: "o1" }, { id: "o2" }]), null);
});

test("lo de stock libre sin obra pide un sector, y el sector cuenta como observación", () => {
  const grif = grupo(gruposEgresables(ledger()), "m3");
  const cart = sumarAlCarrito([], grif, grif.conSaldo[0]).cart;
  assert.match(faltaEnDestino(cart, { obraId: null, sector: null, comentario: "" }), /sector/);
  assert.equal(faltaEnDestino(cart, { obraId: null, sector: "Mecánica", comentario: "" }), "");
  assert.equal(faltaEnDestino(cart, { obraId: null, sector: "Otro", comentario: "" }), "Escribí para qué es");
  assert.equal(faltaEnDestino(cart, { obraId: "o2", sector: null, comentario: "" }), "");
  assert.deepEqual(notaDelEgreso({ obraId: null, sector: "Mecánica" }, ""), { sectorDestino: "Mecánica", nota: "Destino: Mecánica" });
  assert.deepEqual(notaDelEgreso({ obraId: null, sector: "Otro", comentario: "galpón" }, "urgente"), { sectorDestino: "Otro: galpón", nota: "Destino: Otro: galpón · urgente" });
  assert.deepEqual(notaDelEgreso({ obraId: "o1", sector: "Mecánica" }, ""), { sectorDestino: "", nota: "" });
});

test("cargarlo a otra obra marca lo que se reasigna", () => {
  const grupos = gruposEgresables(ledger());
  const bomba = grupo(grupos, "m2");
  const grif = grupo(grupos, "m3");
  let cart = sumarAlCarrito([], bomba, bomba.conSaldo[0]).cart;
  cart = sumarAlCarrito(cart, grif, grif.conSaldo[0]).cart;
  const lineas = lineasConDestino(cart, { obraId: "o2" }, OBRAS);
  assert.deepEqual(lineas.map((l) => [l.origen, l.destino, l.reasigna]), [["52-27", "52-28", true], ["Stock libre Pampa", "52-28", false]]);
  const cadaUno = lineasConDestino(cart, { obraId: null, sector: "Pintura" }, OBRAS);
  assert.deepEqual(cadaUno.map((l) => l.destino), ["52-27", "Pintura"]);
  assert.equal(textoDestino(cart, { obraId: null, sector: "Pintura" }, OBRAS), "52-27 · Pintura");
  assert.deepEqual(carritoPorOrigen(cart, OBRAS).map((g) => g.titulo), ["Stock libre · Pampa", "Asignado a 52-27"]);
});

test("asignar a la obra donde ya está no tiene sentido", () => {
  const bomba = grupo(gruposEgresables(ledger()), "m2");
  const cart = sumarAlCarrito([], bomba, bomba.conSaldo[0]).cart;
  assert.match(faltaEnDestino(cart, { obraId: "o1" }, "asignar", OBRAS), /ya está asignado a 52-27/);
  assert.equal(faltaEnDestino(cart, { obraId: "o2" }, "asignar", OBRAS), "");
  assert.equal(faltaEnDestino(cart, null, "asignar"), "Elegí la obra");
});

test("el carrito guardado se pone al día con lo que retiró otro", () => {
  const rows = ledger();
  const inodoro = grupo(gruposEgresables(rows), "m1");
  let { cart } = sumarAlCarrito([], inodoro, inodoro.conSaldo.find((l) => !l.obraId));
  cart = sumarAlCarrito(cart, inodoro, inodoro.conSaldo.find((l) => !l.obraId)).cart;
  // Otro retiró uno: la fila quedó en 1.
  const despues = rows.map((r) => (r.id === "r1" ? { ...r, cantidad: 1 } : r));
  const fresco = refrescarCarrito(cart, gruposEgresables(despues));
  assert.equal(fresco[0].available, 1);
  assert.equal(fresco[0].sourceRows[0].cantidad, 1);
  assert.ok(problemasDelCarrito(fresco).some((p) => p.tipo === "stock"));
  assert.equal(refrescarCarrito(fresco, gruposEgresables(despues)), fresco, "sin cambios devuelve el mismo carrito");
  // Leyendo sólo Chubut, lo de Pampa no se toca (no está en esa lectura).
  assert.equal(refrescarCarrito(cart, [], { sede: "Chubut" }), cart);
});

test("buscar y leer códigos", () => {
  const grupos = gruposEgresables(ledger());
  assert.deepEqual(buscarGrupos(grupos, "inod").map((g) => g.material.id), ["m1"]);
  assert.deepEqual(buscarGrupos(grupos, "bomba 52-27").map((g) => g.material.id), ["m2"]);
  assert.deepEqual(buscarGrupos(grupos, "b-3").map((g) => g.material.id), ["m1"]);
  assert.deepEqual(gruposPorCodigo(grupos, "779000111").map((g) => g.material.id), ["m1"]);
  assert.deepEqual(gruposPorCodigo(grupos, "nada"), []);
});

test("los últimos movimientos juntan un mismo carrito", () => {
  const ult = ultimosMovimientos(ledger(), { obras: OBRAS, sede: "Pampa" });
  // El retiro de 13:42 (dos renglones) y las asignaciones a 52-27 del ejemplo.
  assert.deepEqual(ult.map((g) => g.tipo), ["retiro", "asignacion"]);
  assert.equal(ult[0].quien, "Gómez Carlos (DNI 30111222)");
  assert.equal(ult[0].destino, "52-28");
  assert.deepEqual(ult[0].items.map((i) => i.cantidad), [1, 1]);
  assert.equal(ult[1].destino, "52-27");
  assert.equal(ultimosMovimientos(ledger(), { obras: OBRAS, sede: "Chubut" }).length, 0);
});

test("la pantalla del operario dice si es retiro o asignación", () => {
  const bomba = grupo(gruposEgresables(ledger()), "m2");
  const cart = sumarAlCarrito([], bomba, bomba.conSaldo[0]).cart;
  const retiro = pantallaOperario({ cart, obras: OBRAS, persona: { nombre: "Gómez Carlos", dni: "1" }, retiradoPor: "Gómez Carlos (DNI 1)", estado: "identified" });
  assert.equal(retiro.mode, "retiro");
  assert.equal(retiro.employee.name, "Gómez Carlos");
  assert.equal(retiro.destination, "52-27");
  const asignar = pantallaOperario({ modo: "asignar", cart, obras: OBRAS, destino: { obraId: "o2" }, persona: { nombre: "X" } });
  assert.equal(asignar.mode, "reasignacion");
  assert.equal(asignar.employee, null);
  assert.equal(asignar.destination, "52-28");
});

test("una liberación se muestra una vez como a stock y no como retiro ni reasignación", () => {
  const base = { material_id: "faro", descripcion: "Faro", cantidad: 1, stock_sede: "Pampa", obra_origen_id: "o1", created_at: "2026-10-21T18:33:41Z" };
  const salida = { ...base, id: "salida", source: "transferencia_egreso", estado: "egresado", obra_id: "o1", egreso_destino_obra_id: null, cantidad_egresada: 1 };
  const entrada = { ...base, id: "entrada", source: "transferencia_ingreso", estado: "en_panol", recepcion_estado: "recibido", obra_id: null, cantidad_egresada: 0 };
  const ult = ultimosMovimientos([salida, entrada], { obras: OBRAS, sede: "Pampa" });
  assert.equal(ult.length, 1);
  assert.equal(ult[0].tipo, "liberacion");
  assert.equal(ult[0].destino, "52-27 → Stock general Pampa");
  assert.equal(ult[0].items[0].cantidad, 1);
});
