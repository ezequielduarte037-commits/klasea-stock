import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarBandeja,
  avisosParaEntregar,
  buscarPersonas,
  buscarProductos,
  cabeceraDesdeLectura,
  candidatosPara,
  cantidadParaCampo,
  cantidadValida,
  codigoVisible,
  fechaCorta,
  iniciales,
  clasificarRenglones,
  compararUbicacion,
  diaHabilAnterior,
  llegoTarde,
  ordenarParaPreparar,
  problemasParaEntregar,
  proximoDiaHabil,
  repartirLectura,
  resumenItems,
  sugerirPersona,
  textoResultadoEntrega,
  textoRetiro,
} from "./solicitudesLogica.js";

const catalogo = [
  { id: "m1", descripcion: "Disco de corte 115 x 1", alias: "disco fino", ubicacion: "C2-03", codigos: ["M0047"] },
  { id: "m2", descripcion: "Tornillo autoperforante 8 x 1/2", alias: null, ubicacion: "C10-01", codigos: ["PARFIJ0016"] },
  { id: "m3", descripcion: "Lija al agua 600", alias: null, ubicacion: null, codigos: ["L600"] },
  { id: "m4", descripcion: "Guantes de nitrilo", alias: "guante descartable", ubicacion: "A1-01", codigos: ["G01"] },
];

// ── Fechas y "llegó tarde" ─────────────────────────────────────────────────

test("día hábil anterior y próximo saltan el fin de semana", () => {
  assert.equal(diaHabilAnterior("2026-10-14"), "2026-10-13"); // miércoles → martes
  assert.equal(diaHabilAnterior("2026-10-19"), "2026-10-16"); // lunes → viernes
  assert.equal(proximoDiaHabil("2026-10-13"), "2026-10-14");
  assert.equal(proximoDiaHabil("2026-10-16"), "2026-10-19"); // viernes → lunes
});

test("llegó tarde: después de las 15 del día de preparación, en hora argentina", () => {
  const base = { origen: "digital", fecha_retiro: "2026-10-14" };
  // 14:59 del martes (17:59 UTC) llega bien; 15:01 llega tarde.
  assert.equal(llegoTarde({ ...base, created_at: "2026-10-13T17:59:00Z" }), false);
  assert.equal(llegoTarde({ ...base, created_at: "2026-10-13T18:01:00Z" }), true);
  // Cargada el mismo día del retiro: tarde aunque sea a la mañana.
  assert.equal(llegoTarde({ ...base, created_at: "2026-10-14T09:30:00Z" }), true);
  // Para el lunes, el corte es el viernes a las 15.
  assert.equal(llegoTarde({ origen: "digital", fecha_retiro: "2026-10-19", created_at: "2026-10-16T19:00:00Z" }), true);
  assert.equal(llegoTarde({ origen: "digital", fecha_retiro: "2026-10-19", created_at: "2026-10-16T12:00:00Z" }), false);
  // Con días de anticipación no es tarde aunque se cargue a la noche.
  assert.equal(llegoTarde({ origen: "digital", fecha_retiro: "2026-10-16", created_at: "2026-10-13T23:00:00Z" }), false);
});

test("llegó tarde: el papel no se sabe, salvo que lo diga la observación", () => {
  assert.equal(llegoTarde({ origen: "papel", fecha_retiro: "2026-10-14", created_at: "2026-10-13T20:00:00Z" }), false);
  assert.equal(llegoTarde({ origen: "papel", observaciones: "Llegó después de las 15. Prepararla a la mañana." }), true);
  assert.equal(llegoTarde(null), false);
});

test("texto del día de retiro", () => {
  const hoy = "2026-10-13";
  assert.deepEqual(textoRetiro("2026-10-13", hoy), { texto: "hoy", tono: "hoy" });
  assert.deepEqual(textoRetiro("2026-10-14", hoy), { texto: "mañana 7 h", tono: "manana" });
  assert.deepEqual(textoRetiro("2026-10-09", hoy), { texto: "era el vie 9", tono: "atrasada" });
  assert.deepEqual(textoRetiro("2026-10-19", hoy), { texto: "lun 19 7 h", tono: "futuro" });
  assert.equal(textoRetiro(null, hoy).tono, "sin");
  assert.equal(textoRetiro("2026-10-09", hoy, { cerrada: true }).texto, "vie 9");
});

// ── Bandeja ────────────────────────────────────────────────────────────────

const ahora = new Date("2026-10-13T20:00:00Z").getTime();
const sol = (extra) => ({ id: extra.numero, sede_origen: "Chubut", prioridad: "normal", created_at: "2026-10-13T12:00:00Z", ...extra });

test("bandeja: grupos, sede, sin sede y contadores", () => {
  const filas = [
    sol({ numero: 1, estado: "enviada", fecha_retiro: "2026-10-14" }),
    sol({ numero: 2, estado: "preparando", fecha_retiro: "2026-10-14" }),
    sol({ numero: 3, estado: "listo", fecha_retiro: "2026-10-14" }),
    sol({ numero: 4, estado: "entregado", retirado_at: "2026-10-12T10:00:00Z" }),
    sol({ numero: 5, estado: "entregado", retirado_at: "2026-09-20T10:00:00Z" }), // vieja
    sol({ numero: 6, estado: "enviada", sede_origen: "Pampa" }),
    sol({ numero: 7, estado: "enviada", sede_origen: null }),
    sol({ numero: 8, estado: "borrador" }),
    sol({ numero: 9, estado: "cancelado", updated_at: "2026-10-11T10:00:00Z" }),
  ];
  const b = armarBandeja(filas, { sede: "Chubut", ahora });
  assert.deepEqual(b.grupos.preparar.map((s) => s.numero), [1, 2]);
  assert.deepEqual(b.grupos.listas.map((s) => s.numero), [3]);
  assert.deepEqual(b.grupos.entregadas.map((s) => s.numero), [4]);
  assert.deepEqual(b.sinSede.map((s) => s.numero), [7]);
  assert.deepEqual(b.grupos.todas.map((s) => s.numero), [1, 2, 3, 4, 9]);
  assert.equal(b.contadores.todas, 5);
  assert.equal(b.contadores.sinSede, 1);
});

test("bandeja: buscando aparecen las entregadas viejas", () => {
  const filas = [
    sol({ numero: 5, estado: "entregado", retirado_at: "2026-09-20T10:00:00Z", solicita: "Juan Pérez" }),
    sol({ numero: 6, estado: "entregado", retirado_at: "2026-10-12T10:00:00Z", solicita: "Ana" }),
  ];
  const b = armarBandeja(filas, { sede: "Chubut", ahora, busqueda: "perez" });
  assert.deepEqual(b.grupos.entregadas.map((s) => s.numero), [5]);
  // Por número también.
  assert.deepEqual(armarBandeja(filas, { sede: "Chubut", ahora, busqueda: "6" }).grupos.entregadas.map((s) => s.numero), [6]);
});

test("bandeja: urgentes primero, después día de retiro y hora de carga", () => {
  const filas = [
    sol({ numero: 1, estado: "enviada", fecha_retiro: "2026-10-15", created_at: "2026-10-13T10:00:00Z" }),
    sol({ numero: 2, estado: "enviada", fecha_retiro: "2026-10-14", created_at: "2026-10-13T12:00:00Z" }),
    sol({ numero: 3, estado: "enviada", fecha_retiro: "2026-10-14", created_at: "2026-10-13T11:00:00Z" }),
    sol({ numero: 4, estado: "enviada", fecha_retiro: "2026-10-16", prioridad: "urgente" }),
    sol({ numero: 5, estado: "enviada", fecha_retiro: null }),
  ];
  const b = armarBandeja(filas, { sede: "Chubut", ahora });
  assert.deepEqual(b.grupos.preparar.map((s) => s.numero), [4, 3, 2, 1, 5]);
});

test("bandeja: entregadas, la última arriba", () => {
  const filas = [
    sol({ numero: 1, estado: "entregado", retirado_at: "2026-10-12T10:00:00Z" }),
    sol({ numero: 2, estado: "entregado", retirado_at: "2026-10-13T10:00:00Z" }),
  ];
  assert.deepEqual(armarBandeja(filas, { sede: "Chubut", ahora }).grupos.entregadas.map((s) => s.numero), [2, 1]);
});

test("resumen de renglones", () => {
  const r = resumenItems([
    { estado: "preparado", material_id: "m1", material: { es_consumible: true } },
    { estado: "pendiente", material_id: null },
    { estado: "pendiente", material_id: "x", material: { es_consumible: false } },
    { estado: "faltante", material_id: "m2", material: { es_consumible: true } },
    { estado: "reemplazado", material_id: "m3", material: { es_consumible: true } },
  ]);
  assert.deepEqual(r, { total: 5, listos: 2, pendientes: 2, libres: 1, deObra: 1, faltantes: 1 });
});

// ── Renglones ──────────────────────────────────────────────────────────────

test("ubicación natural: C2-03 antes que C10-01, sin ubicación al final", () => {
  assert.ok(compararUbicacion("C2-03", "C10-01") < 0);
  assert.ok(compararUbicacion("c2-03", "C2-10") < 0);
  assert.ok(compararUbicacion(null, "A1") > 0);
  assert.ok(compararUbicacion("A1", "") < 0);
  const orden = ordenarParaPreparar([
    { descripcion: "Z", ubicacion: null },
    { descripcion: "B", ubicacion: "C10-01" },
    { descripcion: "A", ubicacion: "C2-03" },
    { descripcion: "C", ubicacion: "C2-03" },
  ]).map((r) => r.descripcion);
  assert.deepEqual(orden, ["A", "C", "B", "Z"]);
});

test("clasificar renglones: libres, de obra y consumibles en recorrido", () => {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const r = clasificarRenglones([
    { id: "i1", material_id: "m2", descripcion: "Tornillo", orden: 0, material: { es_consumible: true } },
    { id: "i2", material_id: null, descripcion: "cosa rara", orden: 1 },
    { id: "i3", material_id: "m1", descripcion: "Disco", orden: 2, material: { es_consumible: true } },
    { id: "i4", material_id: "mx", descripcion: "Resina", orden: 3, material: { es_consumible: false } },
    { id: "i5", material_id: "m9", descripcion: "Fuera de catálogo", orden: 4, material: { es_consumible: true, ubicacion: "B1" } },
  ], porId);
  assert.deepEqual(r.libres.map((i) => i.id), ["i2"]);
  assert.deepEqual(r.deObra.map((i) => i.id), ["i4"]);
  assert.deepEqual(r.consumibles.map((i) => i.id), ["i5", "i3", "i1"]);
  assert.equal(r.consumibles[0].item, null);
});

test("problemas para entregar: mismas reglas que la base", () => {
  const base = { estado: "listo", sede_origen: "Chubut" };
  const ok = [{ material_id: "m1", cantidad: 2, estado: "preparado", material: { es_consumible: true } }];
  assert.deepEqual(problemasParaEntregar(base, ok), []);
  assert.equal(problemasParaEntregar({ ...base, sede_origen: null }, ok)[0].tipo, "sede");
  const tipos = problemasParaEntregar(base, [
    ...ok,
    { material_id: null, cantidad: 1, estado: "pendiente" },
    { material_id: "x", cantidad: 1, estado: "pendiente", material: { es_consumible: false } },
  ]).map((p) => p.tipo);
  assert.deepEqual(tipos, ["libres", "obra"]);
  // Un libre marcado como faltante o en cero no cuenta (la base tampoco lo mira).
  assert.deepEqual(problemasParaEntregar(base, [...ok, { material_id: null, cantidad: 1, estado: "faltante" }]), []);
  assert.equal(problemasParaEntregar(base, [{ material_id: "m1", cantidad: 0, estado: "pendiente" }])[0].tipo, "vacia");
  assert.equal(problemasParaEntregar({ ...base, estado: "entregado" }, ok)[0].tipo, "entregada");
  assert.equal(problemasParaEntregar({ ...base, estado: "cancelado" }, ok)[0].tipo, "cancelada");
});

test("avisos para entregar", () => {
  assert.deepEqual(avisosParaEntregar([
    { estado: "pendiente", cantidad: 1 },
    { estado: "pendiente", cantidad: 3 },
    { estado: "faltante", cantidad: 1 },
  ]), ["2 renglones sin tildar: se entregan igual.", "1 renglón marcado como faltante no se entrega."]);
  assert.deepEqual(avisosParaEntregar([{ estado: "preparado", cantidad: 1 }]), []);
});

test("cantidad válida", () => {
  assert.equal(cantidadValida("1,5"), 1.5);
  assert.equal(cantidadValida(" 3 "), 3);
  assert.equal(cantidadValida("0"), null);
  assert.equal(cantidadValida("-2"), null);
  assert.equal(cantidadValida("abc"), null);
  assert.equal(cantidadValida(""), null);
});

// ── Búsqueda ───────────────────────────────────────────────────────────────

test("buscar productos: por nombre, alias o código; lo que empieza igual primero", () => {
  const cat = catalogo.map((c) => ({ ...c, codigoEtiqueta: c.codigos[0] }));
  assert.deepEqual(buscarProductos(cat, "disco").map((i) => i.id), ["m1"]);
  assert.deepEqual(buscarProductos(cat, "descartable").map((i) => i.id), ["m4"]);
  assert.deepEqual(buscarProductos(cat, "parfij0016").map((i) => i.id), ["m2"]);
  assert.deepEqual(buscarProductos(cat, ""), []);
});

test("candidatos para un renglón escrito a mano", () => {
  assert.equal(candidatosPara("disco corte 115", catalogo)[0].id, "m1");
  // Sin medidas que coincidan, la palabra más larga igual sugiere algo.
  assert.equal(candidatosPara("guantes talle L", catalogo)[0].id, "m4");
  assert.deepEqual(candidatosPara("", catalogo), []);
});

// ── IA ─────────────────────────────────────────────────────────────────────

test("repartir lectura: claro entra, dudoso queda escrito a mano, repetido no se suma", () => {
  const r = repartirLectura([
    { descripcion: "Disco de corte 115 x 1", cantidad: 5, confianza: "alta" },
    { descripcion: "Lija al agua 600", cantidad: 2, confianza: "baja" },
    { descripcion: "Tornillo autoperforante 8 x 1/2", cantidad: null, confianza: "alta" },
    { descripcion: "Guantes de nitrilo", cantidad: 3, confianza: "media" },
    { descripcion: "Disco de corte 115 x 1", cantidad: 2, confianza: "alta" },
    { descripcion: "  ", cantidad: 1 },
    { descripcion: "cosa ilegible", cantidad: 1, confianza: "baja", observacion: "tachado" },
  ], catalogo, new Set(["m4"]));
  assert.deepEqual(r.nuevos.map((n) => [n.item.id, n.cantidad]), [["m1", 7]]);
  assert.equal(r.yaEstaban, 1);
  assert.deepEqual(r.dudosos.map((d) => d.descripcion), ["Lija al agua 600", "Tornillo autoperforante 8 x 1/2", "cosa ilegible"]);
  assert.equal(r.dudosos[1].cantidad, 1);
  assert.match(r.dudosos[1].observacion, /cantidad sin leer/);
  assert.match(r.dudosos[2].observacion, /tachado/);
});

test("cabecera desde la lectura: solo campos vacíos y con confianza", () => {
  const cab = {
    solicita: { valor: "Juan Pérez", confianza: "alta" },
    retira: { valor: "Pedro", confianza: "baja" },
    tarea: { valor: "Laminar casco", confianza: "media" },
    obra: { valor: "52-27", confianza: "alta" },
    sector: { valor: "Laminación", confianza: "alta" },
  };
  const obras = [{ id: "o1", codigo: "52-27" }];
  assert.deepEqual(
    cabeceraDesdeLectura(cab, { solicita: "", tarea: "Ya escrita" }, { obras, sectores: ["Laminación"] }),
    { solicita: "Juan Pérez", obra_id: "o1", obra_texto: "52-27", sector: "Laminación" },
  );
  assert.deepEqual(cabeceraDesdeLectura(cab, { solicita: "Otro", obra_id: "o9", sector: "Pintura", tarea: "x" }, { obras, sectores: ["Laminación"] }), {});
});

// ── Personas ───────────────────────────────────────────────────────────────

const empleados = [
  { id: "e1", nombre: "PEREZ, Juan Carlos", dni: "30111222" },
  { id: "e2", nombre: "GOMEZ, Pedro", dni: "28999000" },
  { id: "e3", nombre: "GOMEZ, Ana", dni: "35123456" },
];

test("buscar personas por nombre o DNI", () => {
  assert.deepEqual(buscarPersonas(empleados, "juan perez").map((e) => e.id), ["e1"]);
  assert.deepEqual(buscarPersonas(empleados, "999").map((e) => e.id), ["e2"]);
  assert.deepEqual(buscarPersonas(empleados, "gomez").map((e) => e.id), ["e2", "e3"]);
  assert.deepEqual(buscarPersonas(empleados, ""), []);
});

test("sugerir quién retira: solo si es una sola persona", () => {
  assert.equal(sugerirPersona({ retira: "Pedro Gomez" }, empleados).persona.id, "e2");
  assert.equal(sugerirPersona({ retira: "", solicita: "Juan Perez" }, empleados).campo, "solicita");
  const varias = sugerirPersona({ retira: "Gomez" }, empleados);
  assert.equal(varias.persona, null);
  assert.equal(varias.varias, true);
  assert.equal(sugerirPersona({}, empleados), null);
});

test("texto del resultado de la entrega", () => {
  assert.equal(textoResultadoEntrega({ movimientos: 9, retira: "Juan" }), "9 renglones registrados a nombre de Juan.");
  assert.equal(textoResultadoEntrega({ movimientos: 1 }, { nombre: "Ana" }), "1 renglón registrado a nombre de Ana.");
  assert.match(textoResultadoEntrega({ ya_entregada: true, numero: 12 }), /La N° 12 ya estaba entregada/);
});

test("cantidad como se escribe acá: miles con punto, decimales con coma", () => {
  assert.equal(cantidadValida("1.500"), 1500);
  assert.equal(cantidadValida("1.500,5"), 1500.5);
  assert.equal(cantidadValida("1.5"), 1.5);
  assert.equal(cantidadValida(12), 12);
  // Lo que muestra el campo se vuelve a leer igual.
  for (const n of [1, 1.5, 1000, 12345.125]) assert.equal(cantidadValida(cantidadParaCampo(n)), n);
  assert.equal(cantidadParaCampo(1500), "1500");
  assert.equal(cantidadParaCampo(0.25), "0,25");
});

test("textos chicos: fecha corta, iniciales y código visible", () => {
  assert.equal(fechaCorta("2026-10-14"), "mié 14/10");
  assert.equal(fechaCorta(null), "");
  assert.equal(iniciales("PEREZ, Juan"), "PJ");
  assert.equal(iniciales(""), "?");
  assert.equal(codigoVisible({ codigoEtiqueta: "M0047", codigo: "X" }), "M0047");
  assert.equal(codigoVisible({ config: { proveedor_codigo: "P1" } }), "P1");
  assert.equal(codigoVisible(null, { codigo: "R9" }), "R9");
});
