import test from "node:test";
import assert from "node:assert/strict";
import { rowDelta } from "./panolMovimientos.js";
import { buildProductGroups, necesitaReponer, nombreDeMovimiento, rowEgresoKind, rowInHistory, rowIsAsignacionStock, rowIsMovimientoEspejo, rowIsReasignacionRetirada, rowIsReasignacionSinObra, rowRecepcionOriginal, stockParaMinimo } from "./stockGrupos.js";

// Forma real del par registrado al liberar el faro del 52-24 el 21/10.
const salida = {
  id: "liberacion-salida", material_id: "faro", obra_id: "52-24", obra_origen_id: "52-24",
  egreso_destino_obra_id: null, source: "transferencia_egreso", tipo_label: "Liberado de obra",
  estado: "egresado", recepcion_estado: "egresado", cantidad: 1, cantidad_egresada: 1,
  stock_sede: "Chubut", created_at: "2026-10-21T18:33:41.926068Z",
};
const entrada = {
  ...salida, id: "liberacion-entrada", obra_id: null, source: "transferencia_ingreso",
  tipo_label: "Liberado a stock", estado: "en_panol", recepcion_estado: "recibido", cantidad_egresada: 0,
};

test("liberar una reserva muestra una sola acción a stock, sin obra destino ficticia", () => {
  const visibles = [salida, entrada].filter(row => !rowIsMovimientoEspejo(row));
  assert.deepEqual(visibles.map(row => row.id), [salida.id]);
  assert.deepEqual([salida, entrada].filter(rowInHistory).map(rowEgresoKind), ["liberacion"]);
  assert.equal(rowIsAsignacionStock(entrada), false);
  assert.equal(rowDelta(salida), -1);
  assert.equal(rowDelta(entrada), 1);
  assert.equal(rowDelta(salida) + rowDelta(entrada), 0);
});

test("la clasificación usa origen y destino aunque cambie el texto del registro", () => {
  assert.equal(rowEgresoKind({ ...salida, tipo_label: "Transferencia" }), "liberacion");
  assert.equal(rowIsMovimientoEspejo({ ...entrada, tipo_label: "Transferencia recibida" }), true);
});

test("una reasignación a otra obra conserva una sola entrada con destino real", () => {
  const out = { ...salida, tipo_label: "Transferencia a obra", egreso_destino_obra_id: "52-25" };
  const incoming = { ...entrada, tipo_label: "Transferencia recibida", obra_id: "52-25" };
  assert.equal(rowIsMovimientoEspejo(out), true);
  assert.equal(rowIsMovimientoEspejo(incoming), false);
  assert.equal(rowEgresoKind(incoming), "reasignacion");
  assert.equal(rowInHistory(incoming), true);
});

test("retirar después el stock liberado mantiene su egreso físico visible", () => {
  const retirado = { ...entrada, estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-10-22T12:00:00Z" };
  assert.equal(rowIsMovimientoEspejo(retirado), false);
  assert.equal(rowInHistory(retirado), true);
  assert.equal(rowEgresoKind(retirado), "egreso");
  assert.equal(rowDelta(retirado), 0);
  assert.equal(rowEgresoKind(salida), "liberacion");
});

test("el historial conserva el total liberado cuando se retira sólo una parte", () => {
  const out = { ...salida, cantidad: 3, cantidad_egresada: 3 };
  const restante = { ...entrada, cantidad: 2, cantidad_egresada: 1 };
  const retiro = { ...entrada, id: "retiro-parcial", source: "historial_retiro_parcial", estado: "egresado", cantidad: 1, cantidad_egresada: 1 };
  assert.deepEqual([out, restante, retiro].filter(rowInHistory).map(rowEgresoKind), ["liberacion", "egreso"]);
  assert.equal(rowDelta(out) + rowDelta(restante) + rowDelta(retiro), -1);
});

// Forma de la brújula del 52-26 que se llevaron al barco del río 52-19 (sin
// obra cargada) después de la corrección del 29/10.
test("material de una obra que salió a un destino sin obra se lee como reasignación con egreso", () => {
  const brujula = {
    id: "brujula", material_id: "brujula", obra_id: null, obra_origen_id: "52-26", tipo: "remito", tipo_label: "Remito",
    egreso_destino_obra_id: null, sector_destino: "Río · 52-19", source: "remito",
    estado: "egresado", recepcion_estado: "recibido", cantidad: 1, cantidad_egresada: 1,
    egreso_at: "2026-10-29T13:24:00Z", stock_sede: "Chubut",
  };
  assert.equal(rowIsReasignacionSinObra(brujula), true);
  assert.equal(rowEgresoKind(brujula), "reasignacion_egreso");
  assert.equal(rowInHistory(brujula), true);
  assert.equal(rowDelta(brujula), 0);
  // Lo liberado a stock que después se retira sigue siendo un egreso de stock.
  const liberadoYRetirado = { ...entrada, estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-10-22T10:00:00Z" };
  assert.equal(rowIsReasignacionSinObra(liberadoYRetirado), false);
});

// ── Libre, reservado y "Reponer" (03/11/2026) ────────────────────────────────
const ingreso = (extra = {}) => ({
  material_id: "anafe", descripcion: "Anafe 2 hornallas", source: "remito", estado: "en_panol",
  recepcion_estado: "recibido", cantidad: 1, stock_sede: "Pampa", created_at: "2026-10-20T10:00:00Z", ...extra,
});

test("separa lo libre de lo reservado para cada obra", () => {
  const [group] = buildProductGroups([
    ingreso({ id: "a", cantidad: 4 }),
    ingreso({ id: "b", obra_id: "55-4", obra: { id: "55-4", codigo: "55-4", estado: "activa" } }),
    ingreso({ id: "c", obra_id: "37-39", obra: { id: "37-39", codigo: "37-39", estado: "terminada" }, cantidad: 2 }),
  ]);
  assert.equal(group.total, 7);
  assert.equal(group.stockLibre, 4);
  assert.equal(group.stockReservado, 3);
  assert.deepEqual(group.reservas.map((r) => [r.label, r.available, r.obraEstado]), [["37-39", 2, "terminada"], ["55-4", 1, "activa"]]);
});

test("lo entregado a su obra no pide reposición", () => {
  const obra = { obra_id: "64-21", obra: { id: "64-21", codigo: "64-21", estado: "activa" } };
  // Un retiro total deja el mismo renglón en "egresado": no suma ni resta.
  const [group] = buildProductGroups([
    ingreso({ id: "in", ...obra, estado: "egresado", egreso_at: "2026-10-28T10:00:00Z" }),
  ]);
  assert.equal(group.total, 0);
  assert.equal(necesitaReponer(group), false);
});

test("el remito 62753 recibido y retirado para la misma obra conserva la recepción y se lee como egreso", () => {
  const fecha = "2026-08-24T12:53:23Z";
  const row = ingreso({
    obra_id: "55-2", egreso_destino_obra_id: "55-2", estado: "egresado",
    recepcion_cantidad_recibida: "1", recepcion_updated_at: fecha,
    egreso_at: "2026-09-24T15:49:32Z", cantidad_egresada: 1,
  });
  assert.equal(rowEgresoKind(row), "egreso");
  assert.equal(rowDelta(row), 0);
  assert.deepEqual(rowRecepcionOriginal(row), { fecha, cantidad: 1 });
  assert.equal(rowRecepcionOriginal({ ...row, recepcion_cantidad_recibida: null }), null);
  assert.equal(rowRecepcionOriginal({ ...row, source: "historial_retiro_parcial" }), null);

  const reasignado = { ...row, obra_origen_id: "55-1" };
  assert.equal(rowIsReasignacionRetirada(reasignado), true);
  assert.equal(rowEgresoKind(reasignado), "reasignacion_egreso");
});

test("con mínimo, se compara sólo el stock libre", () => {
  const obra = { obra_id: "52-27", obra: { id: "52-27", codigo: "52-27", estado: "activa" } };
  const [group] = buildProductGroups([
    ingreso({ id: "libre", cantidad: 2, stock_minimo: 5 }),
    ingreso({ id: "res", cantidad: 6, stock_minimo: 5, ...obra }),
  ]);
  assert.equal(group.total, 8);
  assert.equal(stockParaMinimo(group), 2);
  assert.equal(necesitaReponer(group), true);
  assert.equal(necesitaReponer({ ...group, stockMinimo: 2 }), true);
  assert.equal(necesitaReponer({ ...group, stockMinimo: 1 }), false);
});

test("sin mínimo no hay reposición aunque el libre quede en cero", () => {
  const [group] = buildProductGroups([
    ingreso({ id: "in" }),
    ingreso({ id: "out", source: "egreso_producto", estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-10-30T10:00:00Z" }),
  ]);
  assert.equal(group.stockLibre, 0);
  assert.equal(necesitaReponer(group), false);
});

test("con una obra filtrada el mínimo mira el saldo del grupo", () => {
  const obra = { obra_id: "55-1", obra: { id: "55-1", codigo: "55-1", estado: "activa" } };
  const [group] = buildProductGroups([ingreso({ id: "r", cantidad: 3, stock_minimo: 2, ...obra })], "obra::55-1");
  assert.equal(group.alcanceObra, true);
  assert.equal(stockParaMinimo(group), 3);
  assert.equal(necesitaReponer(group), false);
});

test("un negativo va a reconciliar, no a reponer", () => {
  assert.equal(necesitaReponer({ total: -1, stockLibre: -1, stockMinimo: 5 }), false);
});

test("el movimiento muestra el nombre actual y guarda el que tenía al registrarse", () => {
  // Manija renombrada el 26/10: el egreso del 05/11 heredó el nombre viejo.
  assert.deepEqual(
    nombreDeMovimiento({ descripcion: "MANIJA PUERTA K37", descripcion_catalogo: "MANIJA K37/K55/K52" }),
    { nombre: "MANIJA K37/K55/K52", historico: "MANIJA PUERTA K37" },
  );
  // Sólo mayúsculas o acentos distintos no es otro nombre.
  assert.equal(nombreDeMovimiento({ descripcion: "Luz de lectura MEDIANA", descripcion_catalogo: "Luz de lectura mediana" }).historico, "");
  // Sin ficha queda la copia del movimiento.
  assert.deepEqual(nombreDeMovimiento({ descripcion: "Cerradura magnética" }), { nombre: "Cerradura magnética", historico: "" });
  assert.equal(nombreDeMovimiento({}).nombre, "(sin descripción)");
});

test("una reasignación que después se retira sigue viéndose como reasignación", () => {
  // Soporte de TV, 06/11/2026: tomas lo reasigna del 64-21 al 55-2 y 43 s
  // después lautaro lo egresa. El egreso queda grabado sobre la llegada.
  const base = {
    material_id: "soporte", cantidad: 1, stock_sede: "Chubut", created_at: "2026-11-06T11:38:16Z",
  };
  const salida = {
    ...base, id: "salida", source: "transferencia_egreso", tipo_label: "Transferencia a obra",
    estado: "egresado", recepcion_estado: "egresado", cantidad_egresada: 1,
    obra_id: "64-21", obra_origen_id: "64-21", egreso_destino_obra_id: "55-2",
  };
  const llegada = {
    ...base, id: "llegada", source: "transferencia_ingreso", tipo_label: "Transferencia recibida",
    estado: "en_panol", recepcion_estado: "recibido", cantidad_egresada: 0,
    obra_id: "55-2", obra_origen_id: "64-21", egreso_destino_obra_id: null,
  };
  const retirada = {
    ...llegada, estado: "egresado", cantidad_egresada: 1, egreso_at: "2026-11-06T11:38:59Z",
    retirado_por: "Curatitoli Damian",
  };

  // Antes del retiro: la llegada muestra la reasignación y la salida es espejo.
  assert.equal(rowEgresoKind(llegada), "reasignacion");
  assert.equal(rowIsMovimientoEspejo(salida), true);
  assert.equal(rowIsReasignacionRetirada(llegada), false);

  // Después: la misma fila es reasignación + egreso, no un egreso a secas.
  assert.equal(rowIsReasignacionRetirada(retirada), true);
  assert.equal(rowEgresoKind(retirada), "reasignacion_egreso");
  assert.equal(rowInHistory(retirada), true);

  // Una liberación a stock retirada después no es reasignación.
  assert.equal(rowIsReasignacionRetirada({ ...retirada, obra_id: null }), false);
});

test("el egreso arranca sin cantidad y avisa el renglón vacío (reloj de combustible, 14/10)", async () => {
  const { defaultEgresoQty, faltaCantidad, makeCartItem, renglonSinCantidad } = await import("./stockGrupos.js");
  // Había 15 libres: antes la cantidad venía en 15 y se confirmó así.
  assert.equal(defaultEgresoQty({ available: 15 }), "");
  const linea = makeCartItem({ key: "reloj", label: "Reloj nivel combustible" }, { key: "stock", available: 15, sede: "Chubut" });
  assert.equal(linea.cantidad, "");
  assert.equal(faltaCantidad(""), true);
  assert.equal(faltaCantidad("0"), true);
  assert.equal(faltaCantidad("1"), false);
  assert.equal(faltaCantidad("0,5"), false);
  const escrita = { ...linea, key: "otro", cantidad: "1" };
  assert.equal(renglonSinCantidad([escrita, linea]), linea);
  assert.equal(renglonSinCantidad([escrita]), null);
});
