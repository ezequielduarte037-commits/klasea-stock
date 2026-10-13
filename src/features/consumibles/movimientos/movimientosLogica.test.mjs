import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparFilas,
  agruparPorDia,
  cantidadTexto,
  cuentas,
  destinoTexto,
  diaArgentina,
  esPreConteo,
  filasParaExcel,
  filtrarEntradas,
  mapaPrimerConteo,
  origenTexto,
  resumenRetiros,
} from "./movimientosLogica.js";

const material = (descripcion, codigo, unidad = "unidad") => ({ id: `m-${codigo}`, descripcion, unidad_medida: "unid", config: [{ codigo_etiqueta: codigo, unidad_entrega: unidad }] });
const lija = material("LIJA AL AGUA AA #600", "L0019", "hoja");
const trapo = material("Trapo Blanco CAMISETA x Kilo", "T0009", "kg");

const fila = (extra) => ({
  id: extra.id,
  material_id: extra.material?.id ?? lija.id,
  material: lija,
  sede: "Chubut",
  tipo: "retiro",
  cantidad: -1,
  costo_unitario_ars: 100,
  created_at: "2026-10-13T12:00:00+00:00",
  empleado_nombre: "Juan Pérez",
  obra: null,
  lote: null,
  solicitud_id: null,
  anulado_at: null,
  ...extra,
});

// Un retiro del mostrador repartido entre dos obras (mismo lote) y otro producto del mismo carrito.
const carrito = [
  fila({ id: "a1", lote: "L1", cantidad: -2, obra: { codigo: "52-23" }, carril: "mostrador", origen: "mostrador" }),
  fila({ id: "a2", lote: "L1", cantidad: -1, obra: { codigo: "52-24" }, carril: "mostrador", origen: "mostrador" }),
  fila({ id: "a3", lote: "L1", cantidad: -0.5, material: trapo, material_id: trapo.id, costo_unitario_ars: null, carril: "mostrador", origen: "mostrador", sector: "Pintura" }),
];
const solicitud = fila({ id: "s1", solicitud_id: "sol-9", solicitud: { numero: 196 }, origen: "solicitud", carril: "planificado", cantidad: -4, created_at: "2026-10-13T10:00:00+00:00" });
const ingreso = fila({ id: "i1", tipo: "ingreso", cantidad: 50, remito: "R-0001-123", empleado_nombre: null, created_by: "u1", origen: "ingreso", created_at: "2026-10-12T15:00:00+00:00", costo_unitario_ars: 90 });
const conteo = fila({ id: "c1", tipo: "inventario", cantidad: 40, contado: 40, teorico: null, empleado_nombre: null, created_by: "u1", origen: "conteo", created_at: "2026-10-13T11:00:00+00:00" });
const anulado = fila({ id: "x1", anulado_at: "2026-10-13T13:00:00Z", anulado_motivo: "Cargado por error", created_at: "2026-10-13T12:30:00+00:00" });

const primeros = mapaPrimerConteo([{ material_id: lija.id, sede: "Chubut", primer_conteo_at: "2026-10-13T11:00:00+00:00" }, { material_id: trapo.id, sede: "Chubut", primer_conteo_at: null }]);
const entradas = agruparFilas([...carrito, solicitud, ingreso, conteo, anulado], { primeros, nombres: new Map([["u1", "pañol.chubut"]]) });

test("un retiro repartido entre obras es un solo renglón con las dos obras", () => {
  const e = entradas.find((x) => x.clave === `retiro|${lija.id}|L1`);
  assert.deepEqual(e.ids, ["a1", "a2"]);
  assert.equal(e.cantidad, -3);
  assert.deepEqual(e.obras, ["52-23", "52-24"]);
  assert.equal(destinoTexto(e), "52-23 · 52-24");
  assert.equal(e.valor, 300);
  assert.equal(e.codigo, "L0019");
  assert.equal(e.unidad, "hoja");
});

test("otro producto del mismo carrito va en su propio renglón; sin obra muestra el sector", () => {
  const e = entradas.find((x) => x.materialId === trapo.id);
  assert.equal(e.cantidad, -0.5);
  assert.equal(destinoTexto(e), "Pintura");
  assert.equal(e.sinCosto, 1);
  assert.equal(cantidadTexto(e), "−0.5");
  // "Otro" muestra el comentario que se escribió en el mostrador.
  assert.equal(destinoTexto({ ...e, sector: "Otro", nota: "visita de proveedor" }), "Otro: visita de proveedor");
});

test("pre-conteo: antes del primer conteo de su producto y sede, o sin conteo", () => {
  assert.equal(esPreConteo(solicitud, primeros), true); // 10 h, el conteo fue a las 11
  assert.equal(esPreConteo(carrito[0], primeros), false); // 12 h, después del conteo
  assert.equal(esPreConteo(carrito[2], primeros), true); // el trapo nunca se contó
  assert.equal(esPreConteo(conteo, primeros), false); // un conteo nunca es pre-conteo
  assert.equal(esPreConteo({ ...carrito[0], sede: "Pampa" }, primeros), true); // la otra sede no tiene conteo
});

test("origen: solicitud con número, mostrador, remito y conteo inicial", () => {
  const por = (id) => entradas.find((e) => e.ids.includes(id));
  assert.equal(origenTexto(por("s1")), "Solicitud N° 196");
  assert.equal(origenTexto(por("a1")), "Mostrador");
  assert.equal(origenTexto(por("i1")), "Remito R-0001-123");
  assert.equal(origenTexto(por("c1")), "Conteo inicial");
  assert.equal(origenTexto({ ...por("c1"), teorico: 37 }), "Conteo");
  assert.equal(por("i1").registro, "pañol.chubut");
  assert.equal(cantidadTexto(por("c1")), "40");
  assert.equal(cantidadTexto(por("i1")), "+50");
});

test("los anulados no se ven salvo que se pidan, y no cuentan en los totales", () => {
  assert.equal(filtrarEntradas(entradas).some((e) => e.anulado), false);
  assert.equal(filtrarEntradas(entradas, { verAnulados: true }).some((e) => e.anulado), true);
  assert.deepEqual(filtrarEntradas(entradas, { soloAnulados: true }).map((e) => e.ids[0]), ["x1"]);
  const c = cuentas(entradas);
  assert.equal(c.anulados, 1);
  assert.equal(c.todos, 5);
  assert.equal(c.retiro, 3);
  assert.equal(c.ingreso, 1);
  assert.equal(c.inventario, 1);
  assert.equal(c.preConteo, 3); // solicitud, trapo e ingreso del 12/10
});

test("filtros por tipo, pre-conteo y búsqueda por obra, persona, código o N° de solicitud", () => {
  assert.equal(filtrarEntradas(entradas, { tipo: "ingreso" }).length, 1);
  assert.equal(filtrarEntradas(entradas, { tipo: "retiro", soloPreConteo: true }).length, 2);
  assert.equal(filtrarEntradas(entradas, { q: "52-24" }).length, 1);
  assert.equal(filtrarEntradas(entradas, { q: "juan perez" }).length, 3);
  assert.equal(filtrarEntradas(entradas, { q: "l0019" }).length, 4);
  assert.equal(filtrarEntradas(entradas, { q: "196" }).length, 1);
  assert.equal(filtrarEntradas(entradas, { q: "trapo pintura" }).length, 1);
});

test("resumen de retiros y agrupado por día argentino", () => {
  const r = resumenRetiros(entradas);
  assert.equal(r.renglones, 3);
  assert.equal(r.valor, 700); // 300 de la lija repartida + 400 de la solicitud; el trapo no tiene costo
  assert.equal(r.sinCosto, 1);
  assert.equal(r.personas, 1);
  // 01:30 UTC del 14 es todavía el 13 en Argentina.
  assert.equal(diaArgentina("2026-10-14T01:30:00Z"), "2026-10-13");
  const dias = agruparPorDia(filtrarEntradas(entradas));
  assert.deepEqual(dias.map((d) => d.dia), ["2026-10-13", "2026-10-12"]);
  assert.equal(dias[0].entradas[0].createdAt >= dias[0].entradas.at(-1).createdAt, true);
});

test("la planilla lleva una fila por renglón con valor, pre-conteo y anulación", () => {
  const { cab, filas } = filasParaExcel(entradas);
  assert.equal(cab.length, filas[0].length);
  const fx = filas.find((f) => f[3] === "LIJA AL AGUA AA #600" && f[cab.indexOf("Anulado")] === "sí");
  assert.equal(fx[cab.indexOf("Motivo")], "Cargado por error");
  assert.ok(filas[0][0] instanceof Date);
});

test("externos: marca, filtro, búsqueda por empresa y columnas de la planilla", () => {
  const externo = fila({ id: "e1", lote: "LX", empleado_nombre: "Gómez Carlos", empleado_empresa: "Herrería Gómez", empleado_externo: true, autorizado_por: "Encargado Pérez", obra: { codigo: "55-1" } });
  const lista = agruparFilas([...carrito, externo], { primeros });
  const e = lista.find((x) => x.ids.includes("e1"));
  assert.equal(e.externo, true);
  assert.equal(e.empresa, "Herrería Gómez");
  assert.equal(cuentas(lista).externos, 1);
  assert.deepEqual(filtrarEntradas(lista, { soloExternos: true }).map((x) => x.ids[0]), ["e1"]);
  assert.equal(filtrarEntradas(lista, { q: "herreria gomez" }).length, 1);
  const { cab, filas } = filasParaExcel([e]);
  assert.equal(filas[0][cab.indexOf("Empresa (externo)")], "Herrería Gómez");
  assert.equal(filas[0][cab.indexOf("Autorizó")], "Encargado Pérez");
  assert.equal(lista.find((x) => x.ids.includes("a1")).externo, false);
});
