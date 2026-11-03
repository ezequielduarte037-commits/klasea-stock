import test from "node:test";
import assert from "node:assert/strict";
import { armarCalendario, inicioSemana, isoFecha, sugerirPlazo, sugerirSemanasRubro, textoPedido } from "./calendario.js";

const HOY = new Date(2026, 10, 3); // martes 03/11/2026
const item = (extra = {}) => ({ linea: "52", material_id: "m1", descripcion: "Bomba achique", codigo: "B1", unidad: "unidad", proveedor: "Trimer", categoria_id: "mec", rubro: "Mecánica", cantidad: 2, ...extra });

test("fecha de compra = desmolde + semana del rubro − plazo − margen", () => {
  const r = armarCalendario({
    matriz: [item()],
    obras: [{ id: "o1", codigo: "52-28", linea: "52", desmolde: "2026-12-07" }],
    semanasRubro: new Map([["52|mec", 2]]),
    plazos: new Map([["trimer", 10]]),
    hoy: HOY,
  });
  const [sem] = r.semanas;
  const prod = sem.proveedores[0].productos[0];
  assert.equal(isoFecha(prod.necesita), "2026-12-21");
  assert.equal(isoFecha(prod.comprarAntes), "2026-12-04"); // 21/12 − 10 − 7
  assert.equal(sem.clave, "2026-11-30");
  assert.equal(prod.semanaFuente, "rubro");
});

test("la excepción del ítem manda sobre el rubro y la sugerencia sobre nada", () => {
  const base = { matriz: [item()], obras: [{ id: "o1", codigo: "52-28", linea: "52", desmolde: "2027-02-01" }], hoy: HOY, plazos: new Map([["trimer", 10]]) };
  const conItem = armarCalendario({ ...base, semanasRubro: new Map([["52|mec", 2]]), semanasItem: new Map([["52|m1", -4]]) });
  assert.equal(conItem.semanas[0].proveedores[0].productos[0].semanaFuente, "item");
  const sugerida = armarCalendario({ ...base, sugeridas: new Map([["52|mec", { semana: 0, fuente: "base" }]]) });
  assert.equal(sugerida.semanas[0].proveedores[0].productos[0].semanaFuente, "sugerida");
  const sinNada = armarCalendario(base);
  assert.equal(sinNada.semanas.length, 0);
  assert.equal(sinNada.sinFecha[0].items, 1);
});

test("lo llegado o pedido no se compra; lo vencido va a confirmar", () => {
  const obras = [
    { id: "a", codigo: "52-23", linea: "52", desmolde: "2026-01-12" },
    { id: "b", codigo: "52-27", linea: "52", desmolde: "2026-10-28" },
    { id: "c", codigo: "52-28", linea: "52", desmolde: "2027-02-01" },
  ];
  const r = armarCalendario({
    matriz: [item(), item({ material_id: "m2", descripcion: "Filtro" })],
    obras,
    llegados: new Set(["c|m1"]),
    obraFilas: new Map([["c|m2", { estado: "comprado" }]]),
    semanasRubro: new Map([["52|mec", 4]]),
    hoy: HOY,
  });
  // 52-23 (vencido) y 52-27 (necesita 25/11, no vencido) — 52-28 ya cubierta.
  assert.equal(r.cubiertas, 2);
  assert.deepEqual(r.aConfirmar.map((a) => [a.obra, a.items]), [["52-23", 2]]);
  assert.equal(r.totalAComprar, 2);
});

test("el stock libre cubre primero a la obra que lo necesita antes", () => {
  const r = armarCalendario({
    matriz: [item({ cantidad: 2 })],
    obras: [
      { id: "x", codigo: "52-28", linea: "52", desmolde: "2027-02-01" },
      { id: "y", codigo: "52-27", linea: "52", desmolde: "2026-12-01" },
    ],
    libre: new Map([["m1", 3]]),
    semanasRubro: new Map([["52|mec", 2]]),
    plazos: new Map([["trimer", 10]]),
    hoy: HOY,
    semanasALaVista: 30,
  });
  assert.deepEqual(r.conStock.map((n) => n.obra), ["52-27"]);
  const prod = r.semanas[0].proveedores[0].productos[0];
  assert.equal(prod.total, 1);
  assert.equal(prod.deStock, 1);
  assert.deepEqual(prod.obras.map((o) => o.obra), ["52-28"]);
});

test("agrupa por proveedor y suma obras; lo atrasado va primero", () => {
  const r = armarCalendario({
    matriz: [item(), item({ material_id: "m3", proveedor: "", descripcion: "Sin prov" })],
    obras: [
      { id: "p", codigo: "52-27", linea: "52", desmolde: "2026-11-01" },
      { id: "q", codigo: "52-28", linea: "52", desmolde: "2026-11-02" },
    ],
    semanasRubro: new Map([["52|mec", 3]]),
    plazos: new Map([["trimer", 30]]),
    hoy: HOY,
  });
  assert.equal(r.semanas[0].clave, "atrasado");
  const trimer = r.semanas[0].proveedores.find((p) => p.proveedor === "Trimer");
  assert.equal(trimer.productos[0].total, 4);
  assert.deepEqual(trimer.productos[0].obras.map((o) => o.obra), ["52-27", "52-28"]);
  assert.equal(r.semanas.flatMap((s) => s.proveedores).at(-1).proveedor, "Sin proveedor");
});

test("sugerencias: con datos la mediana, sin datos la base del rubro", () => {
  const rubros = [{ linea: "37", categoria_id: "e", rubro: "Electricidad" }, { linea: "52", categoria_id: "e", rubro: "Electricidad" }, { linea: "37", categoria_id: "x", rubro: "A asignar" }];
  const llegadas = [2, 2, 1, 3, 2, 2].map((s) => ({ linea: "37", categoria_id: "e", semanas: s }))
    .concat([-13, -14, -12, -15, -13].map((s) => ({ linea: "52", categoria_id: "e", semanas: s })));
  const s = sugerirSemanasRubro(rubros, llegadas);
  assert.deepEqual(s.get("37|e"), { semana: 2, fuente: "según 6 llegadas" });
  assert.deepEqual(s.get("52|e"), { semana: 2, fuente: "base" }); // las negativas son compras adelantadas
  assert.equal(s.has("37|x"), false);
  assert.deepEqual(sugerirPlazo("Trimer", new Map([["trimer", { dias: [8, 12, 10] }]])), { dias: 10, fuente: "medido en 3 pedidos" });
  assert.deepEqual(sugerirPlazo("Iriarte", new Map(), 29), { dias: 29, fuente: "general" });
});

test("semana arranca el lunes y el texto del pedido lista las obras", () => {
  assert.equal(isoFecha(inicioSemana(new Date(2026, 10, 8))), "2026-11-02");
  const t = textoPedido("Trimer", [{ descripcion: "Bomba", codigo: "B1", total: 3, unidad: "unidad", obras: [{ obra: "52-27", cantidad: 2 }, { obra: "52-28", cantidad: 1 }] }]);
  assert.equal(t, "Pedido a Trimer\n- Bomba (B1) × 3 unidad  [52-27: 2, 52-28: 1]");
});
