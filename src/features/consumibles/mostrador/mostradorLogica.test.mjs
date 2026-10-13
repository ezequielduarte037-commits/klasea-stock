import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  agregarAlCarrito,
  agregarCodigoAlCatalogo,
  agruparMovimientos,
  agruparRetirosDeHoy,
  aplicarStockLocal,
  armarFilasDevolucion,
  datosParaRetiro,
  notasDelRetiro,
  armarPantallaOperario,
  avisoStock,
  buscarEnCatalogo,
  cantidadParaPeso,
  cantidadesDeHoy,
  conTimeout,
  destinoInicial,
  elegirFavoritos,
  encolarEnvio,
  cantidadTipeada,
  esErrorReintentable,
  evaluarCupo,
  fijarCanje,
  fijarCantidad,
  fijarPeso,
  guardarCola,
  leerCola,
  marcarIntento,
  margenPiezas,
  obrasVigentes,
  pareceUidTarjeta,
  problemasDelCarrito,
  quitarDeCola,
  rankingMasRetirados,
  repartoDeDestino,
  puedeRepartir,
  resumenDelRegistro,
  retirosPendientesDe,
  separarRafaga,
  sumarCantidad,
  textoDestino,
  COLA_KEY,
} from "./mostradorLogica.js";

// Ejecutamos las funciones del contrato real, sin cargar Supabase ni copiar el
// algoritmo. Si api.js cambia, estas pruebas usan ese mismo c?digo.
const contrato = readFileSync(new URL("../api.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function fuenteFuncion(nombre) {
  const inicio = contrato.indexOf("export function " + nombre + "(");
  const fin = contrato.indexOf("\n}\n", inicio) + 2;
  assert.ok(inicio >= 0 && fin > inicio, "Existe la funci?n del contrato: " + nombre);
  return contrato.slice(inicio, fin).replace("export ", "");
}
const fuenteReparto = fuenteFuncion("repartirEntreObras");
const fuenteRetiro = fuenteFuncion("armarFilasRetiro");
const repartir = new Function(fuenteReparto + ";return repartirEntreObras;")();
function armarFilasRetiro(parametros, { nuevoId }) {
  const constructor = new Function("nuevoId", "SEDES", fuenteReparto + ";" + fuenteRetiro + ";return armarFilasRetiro;")(nuevoId, ["Chubut", "Pampa"]);
  const datos = datosParaRetiro(parametros);
  return notasDelRetiro(constructor(datos), datos);
}

function idsEnSerie() {
  let n = 0;
  return () => `id-${++n}`;
}

const TRAPO = { id: "trapo", descripcion: "Trapo", unidad: "unidad", formaEntrega: "unidad", stock: 10, codigos: ["779100"], config: null, enMostrador: true, activo: true };
const TORNILLO = { id: "torn", descripcion: "Tornillo autoperforante 8x1", unidad: "unidad", formaEntrega: "peso", pesoUnitarioG: 3.2, stock: 500, codigos: ["KA0002"], config: null, enMostrador: true, activo: true };
const DISCO = { id: "disco", descripcion: "Disco de corte 4 1/2", unidad: "unidad", formaEntrega: "canje", stock: 3, codigos: ["KA0003"], config: { cupo_diario: 2 }, enMostrador: true, activo: true };
const TIJERA = { id: "tijera", descripcion: "Tijera de chapa", unidad: "unidad", formaEntrega: "prestamo", stock: 1, codigos: [], config: null, enMostrador: true, activo: true };
const porId = new Map([TRAPO, TORNILLO, DISCO, TIJERA].map((i) => [i.id, i]));
const EMPLEADO = { id: "emp-1", nombre: "Pérez Juan", dni: "30111222" };

// ── Lector ───────────────────────────────────────────────────────────────────

test("la ráfaga del lector se separa de lo que el pañolero escribió a mano", () => {
  const teclas = [
    { k: "l", t: 0 }, { k: "i", t: 180 }, { k: "j", t: 400 },
    { k: "7", t: 2000 }, { k: "7", t: 2012 }, { k: "9", t: 2025 }, { k: "1", t: 2037 }, { k: "0", t: 2049 },
  ];
  assert.deepEqual(separarRafaga(teclas), { rafaga: "77910", previo: "lij" });
});

test("lo tipeado despacio no es un escaneo", () => {
  const teclas = [{ k: "t", t: 0 }, { k: "r", t: 150 }, { k: "a", t: 300 }, { k: "p", t: 420 }, { k: "o", t: 560 }];
  assert.deepEqual(separarRafaga(teclas), { rafaga: null, previo: "trapo" });
});

test("una ráfaga demasiado corta no cuenta como código", () => {
  const teclas = [{ k: "a", t: 0 }, { k: "b", t: 300 }, { k: "1", t: 310 }, { k: "2", t: 320 }];
  assert.equal(separarRafaga(teclas).rafaga, null);
});

test("reconoce un UID de tarjeta y no confunde un EAN con una tarjeta", () => {
  assert.equal(pareceUidTarjeta("04A1B2C3D4E5F6"), true);
  assert.equal(pareceUidTarjeta("A1B2C3D4"), true);
  assert.equal(pareceUidTarjeta("1234567890"), true);
  assert.equal(pareceUidTarjeta("7791234567890"), false); // EAN-13
  assert.equal(pareceUidTarjeta("12345678"), false); // EAN-8: sin letras hex
  assert.equal(pareceUidTarjeta("KA0001"), false);
});

test("una cantidad tipeada en el campo del lector: x5, *5 o 5*", () => {
  assert.equal(cantidadTipeada("x5"), 5);
  assert.equal(cantidadTipeada("*2,5"), 2.5);
  assert.equal(cantidadTipeada("12*"), 12);
  assert.equal(cantidadTipeada("600"), null); // puede ser "Lija 600"
  assert.equal(cantidadTipeada("x0"), null);
  assert.equal(cantidadTipeada("trapo"), null);
});

// ── Catálogo ─────────────────────────────────────────────────────────────────

test("la búsqueda ignora acentos y orden de palabras, y prioriza lo que empieza igual", () => {
  const catalogo = [
    { id: "a", descripcion: "Lija al agua 600", codigos: [] },
    { id: "b", descripcion: "Paño de pulir", codigos: [] },
    { id: "c", descripcion: "Disco lija 80", codigos: [] },
  ];
  assert.deepEqual(buscarEnCatalogo(catalogo, "pano").map((i) => i.id), ["b"]);
  assert.deepEqual(buscarEnCatalogo(catalogo, "600 agua").map((i) => i.id), ["a"]);
  assert.deepEqual(buscarEnCatalogo(catalogo, "lija").map((i) => i.id), ["a", "c"]);
});

test("la búsqueda encuentra por código exacto", () => {
  const catalogo = [{ id: "a", descripcion: "Trapo", codigos: ["KA0001"] }];
  assert.equal(buscarEnCatalogo(catalogo, "ka0001")[0].id, "a");
});

test("el ranking cuenta retiros, no unidades, y un reparto cuenta una vez", () => {
  const ranking = rankingMasRetirados([
    { material_id: "guantes", cantidad: -100, lote: "l1" },
    { material_id: "trapo", cantidad: -1, lote: "l2" },
    { material_id: "trapo", cantidad: -1, lote: "l3" },
    { material_id: "trapo", cantidad: -0.5, lote: "l4" },
    { material_id: "trapo", cantidad: -0.5, lote: "l4" },
  ]);
  assert.deepEqual(ranking.map((r) => [r.materialId, r.veces]), [["trapo", 3], ["guantes", 1]]);
  assert.equal(ranking[0].cantidad, 3);
});

test("la botonera pone primero los favoritos fijos y completa con los más retirados", () => {
  const catalogo = [
    { id: "a", config: { favorito_orden: 2 } },
    { id: "b", config: { favorito_orden: 1 } },
    { id: "c", config: null },
    { id: "d", config: { favorito_orden: null } },
    { id: "e", config: null, enMostrador: false },
  ];
  const ranking = [{ materialId: "e" }, { materialId: "d" }, { materialId: "a" }, { materialId: "c" }];
  assert.deepEqual(elegirFavoritos(catalogo, ranking, 4).map((i) => i.id), ["b", "a", "d", "c"]);
});

test("vincular un código lo suma al ítem sin tocar el catálogo original", () => {
  const catalogo = [{ id: "a", codigos: ["X"] }];
  const nuevo = agregarCodigoAlCatalogo(catalogo, "a", "Y");
  assert.deepEqual(nuevo[0].codigos, ["X", "Y"]);
  assert.deepEqual(catalogo[0].codigos, ["X"]);
});

test("el stock local se descuenta con el signo de cada fila", () => {
  const out = aplicarStockLocal([{ id: "trapo", stock: 10 }, { id: "x", stock: null }], [
    { material_id: "trapo", cantidad: -3 },
    { material_id: "x", cantidad: 2 },
  ]);
  // Sin contar sigue sin stock: el retiro es pre-conteo.
  assert.deepEqual(out.map((i) => i.stock), [7, null]);
});

// ── Carrito ──────────────────────────────────────────────────────────────────

test("el mismo código otra vez suma 1 y la línea sube arriba", () => {
  let c = agregarAlCarrito([], TRAPO);
  c = agregarAlCarrito(c, DISCO);
  c = agregarAlCarrito(c, TRAPO);
  assert.deepEqual(c.map((l) => [l.materialId, l.cantidad]), [["trapo", 2], ["disco", 1]]);
});

test("lo que va por peso entra sin cantidad y escanearlo de nuevo no suma", () => {
  let c = agregarAlCarrito([], TORNILLO);
  c = agregarAlCarrito(c, TORNILLO);
  assert.equal(c.length, 1);
  assert.equal(c[0].cantidad, 0);
});

test("el canje arranca con el usado entregado", () => {
  const c = agregarAlCarrito([], DISCO);
  assert.equal(c[0].canje, "trajo_usado");
});

test("menos en 1 saca la línea; fijar cero también", () => {
  let c = agregarAlCarrito([], TRAPO);
  assert.deepEqual(sumarCantidad(c, "trapo", -1), []);
  c = fijarCantidad(c, "trapo", "2,5");
  assert.equal(c[0].cantidad, 2.5);
  assert.deepEqual(fijarCantidad(c, "trapo", 0), []);
});

test("el canje sin usado guarda quién autoriza; volver a 'trajo' lo limpia", () => {
  let c = agregarAlCarrito([], DISCO);
  c = fijarCanje(c, "disco", { trajoUsado: false, autoriza: "Gómez" });
  assert.deepEqual([c[0].canje, c[0].autorizaCanje], ["sin_usado", "Gómez"]);
  c = fijarCanje(c, "disco", { trajoUsado: true });
  assert.deepEqual([c[0].canje, c[0].autorizaCanje], ["trajo_usado", ""]);
});

test("la pesada: piezas calculadas, piezas a mano y unidad de peso", () => {
  assert.deepEqual(cantidadParaPeso({ gramos: 118, piezasCalculadas: 37 }), { cantidad: 37, modo: "balanza" });
  assert.deepEqual(cantidadParaPeso({ gramos: 10, piezasCalculadas: 3, piezasManual: 4 }), { cantidad: 4, modo: "manual" });
  assert.deepEqual(cantidadParaPeso({ gramos: 1250, unidad: "kg" }), { cantidad: 1.25, modo: "kg" });
  assert.deepEqual(cantidadParaPeso({ gramos: 300, unidad: "Gr." }), { cantidad: 300, modo: "g" });
  assert.equal(cantidadParaPeso({ gramos: 118 }), null); // sin calibrar y sin piezas a mano
});

test("fijar el peso guarda gramos y piezas", () => {
  let c = agregarAlCarrito([], TORNILLO);
  c = fijarPeso(c, "torn", { gramos: 118, cantidad: 37 });
  assert.deepEqual([c[0].cantidad, c[0].gramos], [37, 118]);
});

test("el margen de error de la Kretz en piezas", () => {
  assert.equal(margenPiezas(3.2), 1);
  assert.equal(margenPiezas(0.8), 4);
  assert.equal(margenPiezas(null), null);
});

test("el stock avisa pero no decide", () => {
  assert.equal(avisoStock({ stock: null }, 1).nivel, "sin_conteo");
  // Antes del primer conteo de la sede, un negativo no es alarma: se retira igual.
  assert.equal(avisoStock({ stock: -3 }, 1).nivel, "sin_conteo");
  const contado = "2026-10-12T10:00:00Z";
  assert.equal(avisoStock({ stock: 0, ultimoConteoAt: contado }, 1).nivel, "sin_stock");
  assert.equal(avisoStock({ stock: 2, ultimoConteoAt: contado }, 3).nivel, "negativo");
  assert.equal(avisoStock({ stock: 2, ultimoConteoAt: contado }, 3).queda, -1);
  assert.equal(avisoStock({ stock: 5, stockMinimo: 4, ultimoConteoAt: contado }, 1).nivel, "bajo");
  assert.equal(avisoStock({ stock: 5, ultimoConteoAt: contado }, 1).nivel, "ok");
});

test("problemas antes de firmar: falta pesar y canje sin autorizar", () => {
  let c = agregarAlCarrito([], TORNILLO);
  c = agregarAlCarrito(c, DISCO);
  c = fijarCanje(c, "disco", { trajoUsado: false });
  const p = problemasDelCarrito(c, porId);
  assert.deepEqual(p.map((x) => x.tipo), ["canje", "cantidad"]);
});

// ── Cupo ─────────────────────────────────────────────────────────────────────

test("el cupo suma lo de hoy, lo que está en la cola y el carrito", () => {
  const hoy = cantidadesDeHoy(
    [{ id: "m1", material_id: "disco", cantidad: -1 }],
    [{ id: "m2", material_id: "disco", cantidad: -1 }, { id: "m1", material_id: "disco", cantidad: -1 }],
  );
  assert.equal(hoy.get("disco"), 2);
  const c = agregarAlCarrito([], DISCO);
  const exc = evaluarCupo(c, porId, hoy);
  assert.equal(exc.length, 1);
  assert.deepEqual([exc[0].cupo, exc[0].ya, exc[0].total], [2, 2, 3]);
});

test("dentro del cupo no pide nada", () => {
  const c = agregarAlCarrito([], DISCO);
  assert.deepEqual(evaluarCupo(c, porId, new Map()), []);
});

test("los pendientes de la cola de una persona, solo desde hoy", () => {
  const cola = [
    { id: "a", tipo: "retiro", creadoAt: "2026-10-13T10:00:00Z", filas: [{ id: "f1", tipo: "retiro", empleado_id: "emp-1", material_id: "disco", cantidad: -1 }] },
    { id: "b", tipo: "retiro", creadoAt: "2026-10-12T10:00:00Z", filas: [{ id: "f2", tipo: "retiro", empleado_id: "emp-1", material_id: "disco", cantidad: -1 }] },
    { id: "c", tipo: "devolucion", creadoAt: "2026-10-13T11:00:00Z", filas: [{ id: "f3", tipo: "devolucion", empleado_id: "emp-1", material_id: "disco", cantidad: 1 }] },
  ];
  assert.deepEqual(retirosPendientesDe(cola, "emp-1", "2026-10-13T03:00:00Z").map((f) => f.id), ["f1"]);
});

// ── Destino ──────────────────────────────────────────────────────────────────

test("las obras terminadas no cuentan como obra asignada", () => {
  const obras = obrasVigentes([
    { id: "o1", codigo: "52-27", estado: "activa" },
    { id: "o2", codigo: "43-10", estado: "terminada" },
    { id: "o1", codigo: "52-27", estado: "activa" },
  ]);
  assert.deepEqual(obras.map((o) => o.id), ["o1"]);
  assert.deepEqual(destinoInicial(obras), { tipo: "obra", obraId: "o1" });
  assert.equal(destinoInicial([...obras, { id: "o3" }]), null);
  assert.equal(destinoInicial([]), null);
});

test("el destino se traduce a reparto o sector", () => {
  assert.deepEqual(repartoDeDestino({ tipo: "obra", obraId: "o1" }).reparto, [{ obraId: "o1", proporcion: 1 }]);
  assert.equal(repartoDeDestino({ tipo: "repartir", obraIds: ["o1", "o2", "o1"] }).reparto.length, 2);
  assert.deepEqual(repartoDeDestino({ tipo: "sector", sector: " Pintura " }), { reparto: [], sector: "Pintura", comentario: null, ok: true });
  assert.equal(repartoDeDestino(null).ok, false);
  // "Otro" pide para qué es; los demás sectores no.
  assert.equal(repartoDeDestino({ tipo: "sector", sector: "Otro" }).ok, false);
  assert.equal(repartoDeDestino({ tipo: "sector", sector: "Otro", comentario: "  " }).ok, false);
  assert.deepEqual(repartoDeDestino({ tipo: "sector", sector: "Otro", comentario: " visita de proveedor " }), { reparto: [], sector: "Otro", comentario: "visita de proveedor", ok: true });
  assert.equal(repartoDeDestino({ tipo: "sector", sector: "Tapicería", comentario: "no se usa" }).comentario, null);
  const obras = new Map([["o1", { codigo: "52-27" }], ["o2", { codigo: "43-30" }]]);
  assert.equal(textoDestino({ tipo: "repartir", obraIds: ["o1", "o2"] }, obras), "52-27 · 43-30 (repartido)");
});

// ── Filas ────────────────────────────────────────────────────────────────────

test("un retiro a una obra arma una fila por consumible, con signo y lote", () => {
  let c = agregarAlCarrito([], TRAPO);
  c = agregarAlCarrito(c, TRAPO);
  c = agregarAlCarrito(c, TIJERA);
  const filas = armarFilasRetiro({
    carrito: c, porId, empleado: EMPLEADO, metodoFirma: "nfc", sede: "Chubut",
    destino: { tipo: "obra", obraId: "o1" }, lote: "lote-1",
  }, { nuevoId: idsEnSerie(), repartir });
  assert.equal(filas.length, 2);
  const tijera = filas.find((f) => f.material_id === "tijera");
  const trapo = filas.find((f) => f.material_id === "trapo");
  assert.equal(trapo.cantidad, -2);
  assert.equal(trapo.obra_id, "o1");
  assert.equal(trapo.lote, "lote-1");
  assert.equal(trapo.carril, "mostrador");
  assert.equal(trapo.empleado_dni, "30111222");
  assert.equal(tijera.nota, "Préstamo: tiene que volver al pañol");
  assert.deepEqual(filas.map((f) => f.id), ["id-1", "id-2"]);
});

test("repartir: hasta 4 obras; con más (cuadrillas asignadas a todas) se elige una", () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `o${i + 1}`);
  assert.equal(puedeRepartir(ids(2).map((id) => ({ id }))), true);
  assert.equal(puedeRepartir(ids(4).map((id) => ({ id }))), true);
  assert.equal(puedeRepartir(ids(21).map((id) => ({ id }))), false);
  assert.equal(repartoDeDestino({ tipo: "repartir", obraIds: ids(21) }).ok, false);
  assert.throws(
    () => armarFilasRetiro({ carrito: agregarAlCarrito([], TRAPO), porId, empleado: EMPLEADO, sede: "Chubut", lote: "L", destino: { tipo: "repartir", obraIds: ids(21) } }, { nuevoId: idsEnSerie(), repartir }),
    /más de 4 obras/,
  );
});

test("repartir entre obras usa el contrato: gramos enteros en la primera parte", () => {
  let c = agregarAlCarrito([], TORNILLO);
  c = fijarPeso(c, "torn", { gramos: 120, cantidad: 3 });
  const filas = armarFilasRetiro({
    carrito: c, porId, empleado: EMPLEADO, sede: "Pampa",
    destino: { tipo: "repartir", obraIds: ["o1", "o2", "o3"] }, lote: "L",
  }, { nuevoId: idsEnSerie(), repartir });
  assert.equal(filas.length, 3);
  assert.deepEqual(filas.map((f) => f.cantidad), [-1, -1, -1]);
  assert.deepEqual(filas.map((f) => f.gramos), [120, null, null]);
  assert.ok(filas.every((f) => f.lote === "L"));
});

test("sector «Otro»: sin comentario no se registra; con comentario va en la nota de cada renglón", () => {
  const base = { porId, empleado: EMPLEADO, metodoFirma: "sin_tarjeta", sede: "Chubut", lote: "L" };
  assert.throws(
    () => armarFilasRetiro({ ...base, carrito: agregarAlCarrito([], TRAPO), destino: { tipo: "sector", sector: "Otro" } }, { nuevoId: idsEnSerie(), repartir }),
    /para qué o para quién/,
  );
  let c = agregarAlCarrito([], TRAPO);
  c = agregarAlCarrito(c, TIJERA);
  const filas = armarFilasRetiro({ ...base, carrito: c, destino: { tipo: "sector", sector: "Otro", comentario: " lata de fana para el galpón " } }, { nuevoId: idsEnSerie(), repartir });
  const trapo = filas.find((f) => f.material_id === "trapo");
  const tijera = filas.find((f) => f.material_id === "tijera");
  assert.equal(trapo.sector, "Otro");
  assert.equal(trapo.nota, "lata de fana para el galpón");
  assert.equal(tijera.nota, "Préstamo: tiene que volver al pañol · lata de fana para el galpón");
  assert.equal(textoDestino({ tipo: "sector", sector: "Otro", comentario: "lata de fana" }), "Otro: lata de fana");
  assert.equal(textoDestino({ tipo: "sector", sector: "Tapicería" }), "Tapicería");
});

test("externo: sin quién autoriza no se registra; con autorización queda en cada renglón", () => {
  const base = { porId, empleado: { id: "ext-1", nombre: "Herrero Juan" }, metodoFirma: "sin_tarjeta", sede: "Chubut", lote: "L", destino: { tipo: "obra", obraId: "o1" }, externo: true };
  assert.throws(() => armarFilasRetiro({ ...base, carrito: agregarAlCarrito([], TRAPO) }, { nuevoId: idsEnSerie(), repartir }), /externo: falta quién del astillero autoriza/);
  const filas = armarFilasRetiro({ ...base, carrito: agregarAlCarrito([], TRAPO), autorizaCupo: " Encargado Pérez " }, { nuevoId: idsEnSerie(), repartir });
  assert.equal(filas[0].autorizado_por, "Encargado Pérez");
  assert.equal(filas[0].fuera_cupo, false);
  assert.equal(filas[0].obra_id, "o1");
});

test("a un sector: sin obra y con el sector", () => {
  const filas = armarFilasRetiro({
    carrito: agregarAlCarrito([], TRAPO), porId, empleado: EMPLEADO, metodoFirma: "sin_tarjeta", sede: "Chubut",
    destino: { tipo: "sector", sector: "Pintura" }, lote: "L",
  }, { nuevoId: idsEnSerie(), repartir });
  assert.equal(filas[0].obra_id, null);
  assert.equal(filas[0].sector, "Pintura");
  assert.equal(filas[0].metodo_firma, "sin_tarjeta");
});

test("fuera de cupo y canje sin usado quedan marcados con quién autoriza", () => {
  let c = agregarAlCarrito([], DISCO);
  c = fijarCanje(c, "disco", { trajoUsado: false, autoriza: "Gómez" });
  const filas = armarFilasRetiro({
    carrito: c, porId, empleado: EMPLEADO, sede: "Chubut",
    destino: { tipo: "obra", obraId: "o1" }, lote: "L",
    excedidos: [{ materialId: "disco" }], autorizaCupo: "Ruiz",
  }, { nuevoId: idsEnSerie(), repartir });
  assert.equal(filas[0].fuera_cupo, true);
  assert.equal(filas[0].canje, "sin_usado");
  assert.equal(filas[0].autorizado_por, "Gómez / Ruiz");
});

test("no arma el retiro si falta el destino, la autorización o la cantidad", () => {
  const deps = { nuevoId: idsEnSerie(), repartir };
  const base = { carrito: agregarAlCarrito([], TRAPO), porId, empleado: EMPLEADO, sede: "Chubut", lote: "L" };
  assert.throws(() => armarFilasRetiro({ ...base, destino: null }, deps), /obra o el sector/);
  assert.throws(() => armarFilasRetiro({ ...base, sede: "Rosario", destino: { tipo: "sector", sector: "X" } }, deps), /sede/);
  assert.throws(() => armarFilasRetiro({ ...base, destino: { tipo: "sector", sector: "X" }, excedidos: [{ materialId: "trapo" }] }, deps), /autoriza/);
  assert.throws(() => armarFilasRetiro({ ...base, carrito: agregarAlCarrito([], TORNILLO), destino: { tipo: "sector", sector: "X" } }, deps), /vacío/);
  assert.throws(() => armarFilasRetiro({ ...base, empleado: null, destino: { tipo: "sector", sector: "X" } }, deps), /quién retira/);
});

test("la devolución suma, lleva lote y avisa que vuelve un préstamo", () => {
  const filas = armarFilasDevolucion({
    carrito: agregarAlCarrito([], TIJERA), porId, empleado: EMPLEADO, metodoFirma: "nfc",
    sede: "Pampa", obraId: "o1", nota: "sobró", lote: "L",
  }, { nuevoId: idsEnSerie() });
  assert.equal(filas[0].tipo, "devolucion");
  assert.equal(filas[0].cantidad, 1);
  assert.equal(filas[0].origen, "devolucion");
  assert.equal(filas[0].nota, "Vuelve el préstamo · sobró");
  assert.equal(filas[0].metodo_firma, "nfc");
});

test("una devolución sin nombre no lleva método de firma", () => {
  const filas = armarFilasDevolucion({ carrito: agregarAlCarrito([], TRAPO), porId, sede: "Pampa", lote: "L" }, { nuevoId: idsEnSerie() });
  assert.equal(filas[0].empleado_id, null);
  assert.equal(filas[0].metodo_firma, null);
});

// ── Cola sin conexión ────────────────────────────────────────────────────────

function storageDePrueba() {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    datos,
  };
}

test("la cola guarda los mismos ids y la hora real del retiro", () => {
  const filas = [{ id: "f1", material_id: "trapo", cantidad: -1 }];
  let cola = encolarEnvio([], { id: "L1", tipo: "retiro", filas, creadoAt: "2026-10-13T10:00:00.000Z" });
  cola = encolarEnvio(cola, { id: "L1", tipo: "retiro", filas });
  assert.equal(cola.length, 1);
  assert.equal(cola[0].filas[0].id, "f1");
  assert.equal(cola[0].filas[0].created_at, "2026-10-13T10:00:00.000Z");
  assert.equal(filas[0].created_at, undefined); // no toca el original
});

test("la cola sobrevive en el almacenamiento y se vacía al enviar", () => {
  const s = storageDePrueba();
  let cola = encolarEnvio([], { id: "L1", tipo: "retiro", filas: [{ id: "f1" }], creadoAt: "x" });
  guardarCola(s, cola);
  assert.equal(leerCola(s).length, 1);
  cola = marcarIntento(leerCola(s), "L1", { error: "Failed to fetch", ahora: "y" });
  assert.equal(cola[0].intentos, 1);
  assert.equal(cola[0].error, "Failed to fetch");
  guardarCola(s, quitarDeCola(cola, "L1"));
  assert.equal(s.datos.has(COLA_KEY), false);
});

test("una cola rota en el almacenamiento no rompe el mostrador", () => {
  const s = storageDePrueba();
  s.setItem(COLA_KEY, "{no es json");
  assert.deepEqual(leerCola(s), []);
  s.setItem(COLA_KEY, JSON.stringify([{ id: "x", filas: [] }, { nada: 1 }]));
  assert.deepEqual(leerCola(s), []);
});

test("qué errores se reintentan", () => {
  assert.equal(esErrorReintentable(new Error("x"), { online: false }), true);
  assert.equal(esErrorReintentable({ message: "TypeError: Failed to fetch", code: "" }), true);
  assert.equal(esErrorReintentable({ message: "x", status: 503 }), true);
  assert.equal(esErrorReintentable({ message: "JWT expired", code: "PGRST301" }), true);
  assert.equal(esErrorReintentable(Object.assign(new Error("lento"), { esTimeout: true })), true);
  assert.equal(esErrorReintentable({ message: 'new row for relation "consumibles_movimientos" violates check constraint', code: "23514" }), false);
  assert.equal(esErrorReintentable({ message: "insert or update on table violates foreign key constraint", code: "23503" }), false);
});

test("conTimeout corta lo que no contesta y deja pasar lo que sí", async () => {
  await assert.rejects(conTimeout(new Promise(() => {}), 20), (e) => e.esTimeout === true);
  assert.equal(await conTimeout(Promise.resolve(7), 50), 7);
});

// ── Hoy, movimientos y pantalla del operario ─────────────────────────────────

test("lo de hoy se agrupa por consumible", () => {
  const hoy = agruparRetirosDeHoy([
    { material_id: "trapo", cantidad: -1 },
    { material_id: "trapo", cantidad: -2 },
    { material_id: "disco", cantidad: -1 },
  ], porId);
  assert.deepEqual(hoy.map((h) => [h.descripcion, h.cantidad]), [["Trapo", 3], ["Disco de corte 4 1/2", 1]]);
});

test("los movimientos se agrupan por carrito y lo planificado no se anula acá", () => {
  const grupos = agruparMovimientos([
    { id: "1", lote: "A", tipo: "retiro", created_at: "3", obra: { codigo: "52-27" }, carril: "mostrador" },
    { id: "2", lote: "A", tipo: "retiro", created_at: "3", obra: { codigo: "43-30" }, carril: "mostrador", anulado_at: "x" },
    { id: "3", lote: null, tipo: "devolucion", created_at: "2", sector: "Pintura" },
    { id: "4", lote: "B", tipo: "retiro", created_at: "1", carril: "planificado" },
  ]);
  assert.equal(grupos.length, 3);
  assert.equal(grupos[0].filas.length, 2);
  assert.equal(grupos[0].activas.length, 1);
  assert.equal(grupos[0].destino, "52-27 · 43-30");
  assert.equal(grupos[0].anulable, true);
  assert.equal(grupos[1].destino, "Pintura");
  assert.equal(grupos[2].anulable, false);
});

test("la pantalla del operario recibe el formato que ya entiende", () => {
  let c = agregarAlCarrito([], DISCO);
  c = agregarAlCarrito(c, TRAPO);
  const p = armarPantallaOperario({
    carrito: c, porId, sede: "Chubut",
    persona: { nombre: "Pérez Juan", dni: "30111222", fotoUrl: "" },
    destinoTexto: "52-27", estado: "identified",
  });
  assert.equal(p.mode, "retiro");
  assert.equal(p.status, "identified");
  assert.equal(p.items.length, 2);
  assert.equal(p.items[1].variant, "canje: trajo el usado");
  assert.equal(p.items[0].origin, "Pañol Chubut");
  assert.equal(p.items[0].destination, "52-27");
  assert.equal(p.employee.name, "Pérez Juan");
  assert.equal(p.totalUnits, 2);
  assert.equal(p.completedAt, null);
});

test("el resumen de listo dice qué, a quién, adónde y qué tiene que volver", () => {
  let c = agregarAlCarrito([], TIJERA);
  c = agregarAlCarrito(c, TRAPO);
  const r = resumenDelRegistro({ carrito: c, porId, persona: { nombre: "Pérez Juan", metodo: "nfc" }, destinoTexto: "52-27" });
  assert.equal(r.quien, "Pérez Juan");
  assert.equal(r.destino, "52-27");
  assert.equal(r.unidades, 2);
  assert.deepEqual(r.prestamos, ["Tijera de chapa"]);
});

test("el contrato conserva 0,002 entre cuatro obras y ordena materiales", () => {
  let c = fijarPeso(agregarAlCarrito([], TORNILLO), "torn", { gramos: 20, cantidad: 0.002 });
  c = agregarAlCarrito(c, TRAPO);
  const filas = armarFilasRetiro({ carrito: c, porId, empleado: EMPLEADO, sede: "Chubut", lote: "L", destino: { tipo: "repartir", obraIds: ["1", "2", "3", "4"] } }, { nuevoId: idsEnSerie() });
  const tornillos = filas.filter((f) => f.material_id === "torn");
  assert.deepEqual(tornillos.map((f) => f.cantidad), [-0.001, -0.001]);
  assert.equal(tornillos.reduce((s, f) => s + (f.gramos || 0), 0), 20);
  assert.deepEqual(filas.map((f) => f.material_id), [...filas.map((f) => f.material_id)].sort());
});
