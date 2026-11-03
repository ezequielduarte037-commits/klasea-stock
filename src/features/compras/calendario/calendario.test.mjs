import test from "node:test";
import assert from "node:assert/strict";
import { armarPedidos, inicioSemana, isoFecha, sugerirPlazo, sugerirSemanasRubro, textoPedido } from "./calendario.js";

const HOY = new Date(2026, 10, 3); // martes 03/11/2026
const nec = (extra = {}) => ({
  linea: "52", filaId: "m1", material_id: "m1", requisito_material_id: "m1", snapshotId: null,
  descripcion: "Codo bronce 1/2", codigo: "C12", unidad: "unidad", proveedor: "Iriarte",
  categoria_id: "bro", rubro: "Broncería", obraId: "o1", obra: "52-28", desmolde: "2026-12-07",
  cantidad: 10, sinModelo: false, libreKey: "m1", ...extra,
});

test("fecha de compra = desmolde + semana del rubro − plazo − margen", () => {
  const r = armarPedidos({
    necesidades: [nec()],
    semanasRubro: new Map([["52|bro", 2]]),
    plazos: new Map([["iriarte", 10]]),
    hoy: HOY,
  });
  const ped = r.proveedores[0].pedidos[0];
  assert.equal(isoFecha(ped.necesita), "2026-12-21");
  assert.equal(isoFecha(ped.comprarAntes), "2026-12-04"); // 21/12 − 10 − 7
  assert.equal(ped.items[0].semanaFuente, "rubro");
  assert.equal(ped.atrasado, false);
});

test("un pedido por obra dentro de cada proveedor, aunque sea el mismo producto", () => {
  const r = armarPedidos({
    necesidades: [
      nec({ linea: "37", obraId: "a", obra: "37-44", cantidad: 7, desmolde: "2026-11-30" }),
      nec({ obraId: "b", obra: "52-28", cantidad: 10 }),
      nec({ filaId: "m2", material_id: "m2", libreKey: "m2", descripcion: "Bomba", proveedor: "Trimer", categoria_id: "mec", obraId: "b", obra: "52-28" }),
    ],
    semanasRubro: new Map([["37|bro", 2], ["52|bro", 2], ["52|mec", 0]]),
    plazos: new Map([["iriarte", 10], ["trimer", 10]]),
    hoy: HOY,
  });
  const iriarte = r.proveedores.find((p) => p.proveedor === "Iriarte");
  assert.deepEqual(iriarte.pedidos.map((p) => [p.obra, p.items.length, p.items[0].faltan]), [["37-44", 1, 7], ["52-28", 1, 10]]);
  assert.equal(r.totalPedidos, 3);
});

test("la excepción del ítem manda sobre el rubro y la sugerencia sobre nada", () => {
  const base = { necesidades: [nec({ desmolde: "2027-02-01" })], hoy: HOY, plazos: new Map([["iriarte", 10]]), semanasALaVista: 30 };
  const conItem = armarPedidos({ ...base, semanasRubro: new Map([["52|bro", 2]]), semanasItem: new Map([["52|m1", -4]]) });
  assert.equal(conItem.proveedores[0].pedidos[0].items[0].semanaFuente, "item");
  const sugerida = armarPedidos({ ...base, sugeridas: new Map([["52|bro", { semana: 0, fuente: "base" }]]) });
  assert.equal(sugerida.proveedores[0].pedidos[0].items[0].semanaFuente, "sugerida");
  const sinNada = armarPedidos(base);
  assert.equal(sinNada.proveedores.length, 0);
  assert.equal(sinNada.sinFecha[0].items, 1);
});

test("lo vencido no se pide salvo que se quiera ver", () => {
  const args = {
    necesidades: [nec({ obraId: "v", obra: "52-23", desmolde: "2026-01-12" }), nec({ obraId: "f", obra: "52-28", desmolde: "2026-12-07" })],
    semanasRubro: new Map([["52|bro", 2]]),
    hoy: HOY,
  };
  const r = armarPedidos(args);
  assert.deepEqual(r.vencidos.map((v) => [v.obra, v.items]), [["52-23", 1]]);
  assert.deepEqual(r.proveedores[0].pedidos.map((p) => p.obra), ["52-28"]);
  const conVencidos = armarPedidos({ ...args, incluirVencidos: true });
  assert.deepEqual(conVencidos.proveedores[0].pedidos.map((p) => [p.obra, p.atrasado]), [["52-23", true], ["52-28", false]]);
});

test("el stock libre cubre primero a la obra que lo necesita antes", () => {
  const r = armarPedidos({
    necesidades: [
      nec({ obraId: "x", obra: "52-28", cantidad: 2, desmolde: "2027-02-01" }),
      nec({ obraId: "y", obra: "52-27", cantidad: 2, desmolde: "2026-12-01" }),
    ],
    libre: new Map([["m1", 3]]),
    semanasRubro: new Map([["52|bro", 2]]),
    plazos: new Map([["iriarte", 10]]),
    hoy: HOY,
    semanasALaVista: 30,
  });
  assert.deepEqual(r.conStock.map((n) => n.obra), ["52-27"]);
  const [ped] = r.proveedores[0].pedidos;
  assert.equal(ped.obra, "52-28");
  assert.equal(ped.items[0].faltan, 1);
  assert.equal(ped.items[0].deStock, 1);
});

test("el pedido entra entero si su ítem más urgente cae en la vista; sin proveedor va al final", () => {
  const r = armarPedidos({
    necesidades: [
      nec({ desmolde: "2026-11-16" }),
      nec({ filaId: "m3", material_id: "m3", libreKey: "m3", categoria_id: "gri", rubro: "Griferías", desmolde: "2026-11-16" }),
      nec({ filaId: "m4", material_id: "m4", libreKey: "m4", proveedor: "", desmolde: "2026-11-16" }),
    ],
    semanasRubro: new Map([["52|bro", 2], ["52|gri", 30]]),
    plazos: new Map([["iriarte", 10]]),
    hoy: HOY,
    semanasALaVista: 4,
  });
  assert.equal(r.proveedores[0].proveedor, "Iriarte");
  assert.equal(r.proveedores[0].pedidos[0].items.length, 2);
  assert.equal(r.proveedores.at(-1).proveedor, "Sin proveedor");
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

test("semana arranca el lunes y el texto del pedido es de una obra", () => {
  assert.equal(isoFecha(inicioSemana(new Date(2026, 10, 8))), "2026-11-02");
  const t = textoPedido("Iriarte", "52-28", [{ descripcion: "Codo bronce 1/2", codigo: "C12", faltan: 10, unidad: "unidad" }, { descripcion: "Niple", cantidad: 2.5, unidad: "m" }]);
  assert.equal(t, "Pedido a Iriarte · Obra 52-28\n- 10 unidad  Codo bronce 1/2 (C12)\n- 2,5 m  Niple");
});
