import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparParaConteo,
  claveDia,
  inicioDelDia,
  admiteDecimales,
  cantidadFinalDeConteo,
  coincideBusqueda,
  estadoConteoDeHoy,
  estanteriaDe,
  modoAgrupadoPorDefecto,
  normalizarTexto,
  piezasPorPeso,
  stockAlInicioDelDia,
  sugerirConteoDiario,
  unidadEnTexto,
} from "./conteoCalculos.js";

const HOY = new Date("2026-10-13T10:00:00-03:00");
const haceDias = (d, h = 9) => new Date(Date.UTC(2026, 9, 13 - d, h + 3)).toISOString();

test("el día del conteo cambia a las 03 UTC, sin depender del teléfono", () => {
  assert.equal(claveDia("2026-10-13T02:59:59Z"), "2026-10-12");
  assert.equal(claveDia("2026-10-13T03:00:00Z"), "2026-10-13");
  assert.equal(inicioDelDia("2026-10-13T02:59:59Z").toISOString(), "2026-10-12T03:00:00.000Z");
});

test("la búsqueda ignora tildes, mayúsculas y espacios en las medidas", () => {
  const item = { descripcion: "Fijador 6 X 3/4", rubro: "Fijaciones", codigoEtiqueta: "KA0012" };
  assert.equal(normalizarTexto("Químicos  6 x 1"), "quimicos 6x1");
  assert.equal(coincideBusqueda(item, "fijador 6x3/4"), true);
  assert.equal(coincideBusqueda(item, "ka0012"), true);
  assert.equal(coincideBusqueda(item, "fijacion 6x"), true);
  assert.equal(coincideBusqueda(item, "mecha"), false);
});

test("la estantería es lo que va antes del guion", () => {
  assert.equal(estanteriaDe("c2-03"), "C2");
  assert.equal(estanteriaDe("AFUERA"), "AFUERA");
  assert.equal(estanteriaDe("  "), null);
});

test("agrupado por ubicación: estanterías en orden natural y lo que no tiene ubicación al final por rubro", () => {
  const items = [
    { id: "1", descripcion: "Mecha 10", ubicacion: "C10-01", rubro: "Mechas" },
    { id: "2", descripcion: "Mecha 3", ubicacion: "C2-03", rubro: "Mechas" },
    { id: "3", descripcion: "Mecha 3,25", ubicacion: "C2-01", rubro: "Mechas" },
    { id: "4", descripcion: "Lija 80", ubicacion: null, rubro: "Lijas y abrasivos" },
    { id: "5", descripcion: "Trapo", ubicacion: null, rubro: null },
  ];
  const grupos = agruparParaConteo(items, "ubicacion");
  assert.deepEqual(grupos.map((g) => g.titulo), ["Estantería C2", "Estantería C10", "Sin ubicación · Lijas y abrasivos", "Sin ubicación · Sin rubro"]);
  assert.deepEqual(grupos[0].items.map((i) => i.id), ["3", "2"]);
});

test("agrupado por rubro: orden natural de descripciones", () => {
  const items = [
    { id: "a", descripcion: "Mecha 10", rubro: "Mechas" },
    { id: "b", descripcion: "Mecha 3,25", rubro: "Mechas" },
    { id: "c", descripcion: "Mecha 3", rubro: "Mechas" },
    { id: "d", descripcion: "Guantes", rubro: "EPP" },
  ];
  const grupos = agruparParaConteo(items, "rubro");
  assert.deepEqual(grupos.map((g) => g.titulo), ["EPP", "Mechas"]);
  assert.deepEqual(grupos[1].items.map((i) => i.descripcion), ["Mecha 3", "Mecha 3,25", "Mecha 10"]);
});

test("sin ubicaciones cargadas se agrupa por rubro", () => {
  assert.equal(modoAgrupadoPorDefecto([{ ubicacion: null }, { ubicacion: "C1-1" }, { ubicacion: "" }]), "rubro");
  assert.equal(modoAgrupadoPorDefecto([{ ubicacion: "C1-1" }, { ubicacion: "C1-2" }, { ubicacion: "" }]), "ubicacion");
});

test("el último conteo del día gana y cuenta las veces", () => {
  const estado = estadoConteoDeHoy([
    { material_id: "m1", tipo: "inventario", contado: 120, teorico: 0, cantidad: 120, created_at: "2026-10-12T10:00:00Z", created_by: "u1" },
    { material_id: "m1", tipo: "inventario", contado: 118, teorico: 120, cantidad: -2, created_at: "2026-10-12T11:00:00Z", created_by: "u2" },
    { material_id: "m2", tipo: "retiro", cantidad: -3, created_at: "2026-10-12T11:00:00Z" },
    { material_id: "m3", tipo: "inventario", contado: 5, teorico: 0, cantidad: 5, created_at: "2026-10-12T11:00:00Z", anulado_at: "2026-10-12T12:00:00Z" },
  ]);
  assert.equal(estado.size, 1);
  assert.deepEqual(estado.get("m1"), { contado: 118, teorico: 120, diferencia: -2, at: "2026-10-12T11:00:00Z", por: "u2", veces: 2 });
});

test("stock al inicio del día descuenta lo movido hoy (sin anulados)", () => {
  assert.equal(stockAlInicioDelDia(10, [{ cantidad: -5 }, { cantidad: 3 }, { cantidad: -100, anulado_at: "x" }]), 12);
  // Sin contar no hay stock al inicio del día (y no aparece como negativo).
  assert.equal(stockAlInicioDelDia(null, []), null);
  assert.equal(stockAlInicioDelDia(null, [{ tipo: "retiro", cantidad: -4 }]), null);
});

test("stock al inicio del día con un conteo hoy: sale del teórico de ese conteo", () => {
  const retiro = (h, c) => ({ tipo: "retiro", cantidad: c, created_at: `2026-10-14T${h}:00:00Z` });
  // Primer conteo de su historia (teórico vacío): a la mañana no había stock.
  assert.equal(stockAlInicioDelDia(38, [retiro("10", -5), { tipo: "inventario", cantidad: 40, teorico: null, created_at: "2026-10-14T12:00:00Z" }, retiro("13", -2)]), null);
  // Ya tenía conteo: teórico 20 a las 12, con 5 retirados antes ⇒ arrancó en 25.
  assert.equal(stockAlInicioDelDia(16, [retiro("13", -2), { tipo: "inventario", cantidad: -2, teorico: 20, created_at: "2026-10-14T12:00:00Z" }, retiro("10", -5)]), 25);
});

test("reconteo: reemplaza o suma a lo ya contado hoy", () => {
  assert.equal(cantidadFinalDeConteo({ contadoAhora: "30", modo: "reemplazar", contadoAntesHoy: 50 }), 30);
  assert.equal(cantidadFinalDeConteo({ contadoAhora: "30", modo: "sumar", contadoAntesHoy: 50 }), 80);
  assert.equal(cantidadFinalDeConteo({ contadoAhora: "1,5", modo: "sumar", contadoAntesHoy: 2.25 }), 3.75);
  assert.equal(cantidadFinalDeConteo({ contadoAhora: "" }), null);
  assert.equal(cantidadFinalDeConteo({ contadoAhora: "-1" }), null);
});

test("peso: resta el envase y pasa a piezas", () => {
  assert.deepEqual(piezasPorPeso({ gramosTotales: 1250, gramosEnvase: 250, pesoUnitarioG: 2.5 }), { netos: 1000, piezas: 400 });
  assert.deepEqual(piezasPorPeso({ gramosTotales: 100, pesoUnitarioG: null }), { netos: 100, piezas: null });
  assert.equal(piezasPorPeso({ gramosTotales: 100, gramosEnvase: 300, pesoUnitarioG: 2 }), null);
  assert.equal(piezasPorPeso({ gramosTotales: 100, gramosEnvase: -3, pesoUnitarioG: 2 }), null);
  assert.equal(piezasPorPeso({ gramosTotales: 0, pesoUnitarioG: 2 }), null);
});

const catalogo = [
  { id: "neg", descripcion: "Lija 80", ubicacion: "B1-1", stockInicioDia: -4 },
  { id: "mucho", descripcion: "Disco corte", ubicacion: "A1-1", stockInicioDia: 10 },
  { id: "poco", descripcion: "Mecha 3", ubicacion: "A1-2", stockInicioDia: 10 },
  { id: "recien", descripcion: "Cinta", ubicacion: "A1-3", stockInicioDia: 10 },
  { id: "nunca", descripcion: "Trapo", ubicacion: "Z9-9", stockInicioDia: 0 },
  { id: "viejo", descripcion: "Guantes", ubicacion: "A2-1", stockInicioDia: 3 },
];

test("contar hoy: negativos primero, después los que más salen y los más viejos", () => {
  const retiros = [
    ...Array.from({ length: 9 }, () => ({ material_id: "mucho", created_at: haceDias(2) })),
    ...Array.from({ length: 2 }, () => ({ material_id: "poco", created_at: haceDias(3) })),
    ...Array.from({ length: 20 }, () => ({ material_id: "recien", created_at: haceDias(1) })),
    { material_id: "mucho", created_at: haceDias(40) }, // fuera de la ventana
  ];
  const conteos = [
    { material_id: "neg", created_at: haceDias(1) },
    { material_id: "mucho", created_at: haceDias(10) },
    { material_id: "poco", created_at: haceDias(10) },
    { material_id: "recien", created_at: haceDias(2) }, // contado hace 2 días: no entra por movimiento
    { material_id: "viejo", created_at: haceDias(25) },
  ];
  const s = sugerirConteoDiario({ items: catalogo, retiros, conteos, hoy: HOY, cantidad: 5 });
  assert.deepEqual(s.map((x) => x.id), ["neg", "mucho", "poco", "nunca", "viejo"]);
  assert.equal(s[0].razon, "negativo");
  assert.equal(s[1].motivo, "Sale mucho: 9 retiros en 30 días");
  assert.equal(s[3].motivo, "Nunca se contó");
  assert.equal(s[4].motivo, "No se cuenta hace 25 días");
});

test("contar hoy: lo de hoy no cambia la lista", () => {
  const base = { items: catalogo, retiros: [], conteos: [{ material_id: "viejo", created_at: haceDias(25) }], hoy: HOY, cantidad: 3 };
  const antes = sugerirConteoDiario(base).map((x) => x.id);
  const despues = sugerirConteoDiario({
    ...base,
    conteos: [...base.conteos, { material_id: "nunca", created_at: new Date(2026, 9, 13, 9, 30).toISOString() }],
    retiros: [{ material_id: "poco", created_at: new Date(2026, 9, 13, 8, 0).toISOString() }],
  }).map((x) => x.id);
  assert.deepEqual(despues, antes);
});

test("contar hoy: sin historia devuelve los primeros por ubicación, sin repetir", () => {
  const s = sugerirConteoDiario({ items: catalogo.map((i) => ({ ...i, stockInicioDia: 0 })), hoy: HOY, cantidad: 10 });
  assert.equal(s.length, catalogo.length);
  assert.equal(new Set(s.map((x) => x.id)).size, catalogo.length);
  assert.equal(s[0].id, "mucho");
});

test("unidades en texto y decimales", () => {
  assert.equal(unidadEnTexto("unidad", 3), "unidades");
  assert.equal(unidadEnTexto("unidad", 1), "unidad");
  assert.equal(unidadEnTexto("rollo", 0), "rollos");
  assert.equal(unidadEnTexto("par", 2), "pares");
  assert.equal(admiteDecimales("litro"), true);
  assert.equal(admiteDecimales("unidad"), false);
});
