import test from "node:test";
import assert from "node:assert/strict";
import { armarPedidos, faltantesParaObras, inicioSemana, isoFecha, sugerirSemanasRubro, textoPedido } from "./calendario.js";

const HOY = new Date(2026, 10, 5); // jueves 05/11/2026
const nec = (extra = {}) => ({
  linea: "52", filaId: "m1", material_id: "m1", requisito_material_id: "m1", snapshotId: null,
  descripcion: "Codo bronce 1/2", codigo: "C12", unidad: "unidad", proveedor: "Iriarte",
  categoria_id: "bro", rubro: "Broncería", obraId: "o1", obra: "52-28", desmolde: "2026-12-07",
  cantidad: 10, sinModelo: false, libreKey: "m1", ...extra,
});

test("comprar = desmolde + semana de compra", () => {
  const r = armarPedidos({ necesidades: [nec()], semanasRubro: new Map([["52|bro", 0]]), hoy: HOY });
  const ped = r.proveedores[0].pedidos[0];
  assert.equal(isoFecha(ped.comprarAntes), "2026-12-07");
  assert.equal(ped.items[0].semanaFuente, "rubro");
  assert.equal(ped.atrasado, false);
});

test("manda el ítem, después el proveedor, después el rubro, después la sugerida", () => {
  const base = { necesidades: [nec({ proveedor: "Trimer", categoria_id: "mec", rubro: "Mecánica" })], hoy: HOY, semanasALaVista: 30 };
  const fuente = (extra) => armarPedidos({ ...base, ...extra }).proveedores[0].pedidos[0].items[0];
  const todo = { semanasItem: new Map([["52|m1", 2]]), semanasProveedor: new Map([["trimer", -4]]), semanasRubro: new Map([["52|mec", 1]]), sugeridas: new Map([["52|mec", { semana: 0, fuente: "base" }]]) };
  assert.deepEqual([fuente(todo).semanaFuente, fuente(todo).semana], ["item", 2]);
  const sinItem = { ...todo, semanasItem: new Map() };
  assert.deepEqual([fuente(sinItem).semanaFuente, isoFecha(fuente(sinItem).comprarAntes)], ["proveedor", "2026-11-09"]);
  assert.equal(fuente({ ...sinItem, semanasProveedor: new Map() }).semanaFuente, "rubro");
  assert.equal(fuente({ sugeridas: todo.sugeridas }).semanaFuente, "sugerida");
  const sinNada = armarPedidos(base);
  assert.equal(sinNada.proveedores.length, 0);
  assert.equal(sinNada.sinFecha[0].items, 1);
});

test("un pedido por obra dentro de cada proveedor, aunque sea el mismo producto", () => {
  const r = armarPedidos({
    necesidades: [
      nec({ linea: "37", obraId: "a", obra: "37-44", cantidad: 7, desmolde: "2026-11-30" }),
      nec({ obraId: "b", obra: "52-28", cantidad: 10 }),
      nec({ filaId: "m2", material_id: "m2", libreKey: "m2", descripcion: "Bomba", proveedor: "Trimer", categoria_id: "mec", obraId: "b", obra: "52-28" }),
    ],
    semanasRubro: new Map([["37|bro", 0], ["52|bro", 0]]),
    semanasProveedor: new Map([["trimer", -4]]),
    hoy: HOY,
    semanasALaVista: 8,
  });
  const iriarte = r.proveedores.find((p) => p.proveedor === "Iriarte");
  assert.deepEqual(iriarte.pedidos.map((p) => [p.obra, p.items.length, p.items[0].faltan]), [["37-44", 1, 7], ["52-28", 1, 10]]);
  assert.equal(r.proveedores.find((p) => p.proveedor === "Trimer").semanaProveedor, -4);
  assert.equal(r.totalPedidos, 3);
});

test("vencido: obra desmoldada y tendría que haber llegado hace más de un mes", () => {
  const args = {
    necesidades: [
      nec({ obraId: "v", obra: "52-23", desmolde: "2026-01-12" }),
      // Desmoldada hace dos semanas: lo que falta sigue haciendo falta.
      nec({ obraId: "r", obra: "37-46", linea: "37", desmolde: "2026-10-22", proveedor: "Trimer", filaId: "m9", material_id: "m9", libreKey: "m9" }),
      nec({ obraId: "f", obra: "52-28", desmolde: "2027-01-04", rubro: "Vidrios", categoria_id: "vid" }),
    ],
    semanasRubro: new Map([["52|bro", 0], ["52|vid", -13]]),
    semanasProveedor: new Map([["trimer", -4]]),
    hoy: HOY,
  };
  const r = armarPedidos(args);
  assert.deepEqual(r.vencidos.map((v) => [v.obra, v.items]), [["52-23", 1]]);
  // Los vidrios de una obra sin desmoldar están atrasados, no vencidos.
  assert.deepEqual(r.proveedores.find((p) => p.proveedor === "Iriarte").pedidos.map((p) => [p.obra, p.atrasado]), [["52-28", true]]);
  assert.deepEqual(r.proveedores.find((p) => p.proveedor === "Trimer").pedidos.map((p) => [p.obra, p.atrasado]), [["37-46", true]]);
  const conVencidos = armarPedidos({ ...args, incluirVencidos: true });
  assert.deepEqual(conVencidos.proveedores.find((p) => p.proveedor === "Iriarte").pedidos.map((p) => p.obra), ["52-23", "52-28"]);
});

test("el stock libre cubre primero a la obra que compra antes", () => {
  const r = armarPedidos({
    necesidades: [
      nec({ obraId: "x", obra: "52-28", cantidad: 2, desmolde: "2027-02-01" }),
      nec({ obraId: "y", obra: "52-27", cantidad: 2, desmolde: "2026-12-01" }),
    ],
    libre: new Map([["m1", 3]]),
    semanasRubro: new Map([["52|bro", 0]]),
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
    semanasRubro: new Map([["52|bro", 0], ["52|gri", 30]]),
    hoy: HOY,
    semanasALaVista: 4,
  });
  assert.equal(r.proveedores[0].proveedor, "Iriarte");
  assert.equal(r.proveedores[0].pedidos[0].items.length, 2);
  assert.equal(r.proveedores.at(-1).proveedor, "Sin proveedor");
});

test("sugerencias: llegada mediana menos la entrega, o la base del rubro", () => {
  const rubros = [{ linea: "37", categoria_id: "e", rubro: "Electricidad" }, { linea: "52", categoria_id: "v", rubro: "Vidrios" }, { linea: "37", categoria_id: "x", rubro: "A asignar" }];
  const llegadas = [2, 2, 1, 3, 2, 2].map((s) => ({ linea: "37", categoria_id: "e", semanas: s }))
    .concat([-13, -14, -12, -15, -13].map((s) => ({ linea: "52", categoria_id: "v", semanas: s })));
  const s = sugerirSemanasRubro(rubros, llegadas);
  assert.deepEqual(s.get("37|e"), { semana: -1, fuente: "según 6 llegadas" });
  assert.deepEqual(s.get("52|v"), { semana: -13, fuente: "base" }); // las negativas son compras adelantadas
  assert.equal(s.has("37|x"), false);
});

test("semana arranca el lunes y el texto del pedido es de una obra", () => {
  assert.equal(isoFecha(inicioSemana(new Date(2026, 10, 8))), "2026-11-02");
  const t = textoPedido("Iriarte", "52-28", [{ descripcion: "Codo bronce 1/2", codigo: "C12", faltan: 10, unidad: "unidad" }, { descripcion: "Niple", cantidad: 2.5, unidad: "m" }]);
  assert.equal(t, "Pedido a Iriarte · Obra 52-28\n- 10 unidad  Codo bronce 1/2 (C12)\n- 2,5 m  Niple");
});

test("faltantes: hay 1 libre y lo necesitan 3 barcos, faltan 2", () => {
  const r = faltantesParaObras({
    necesidades: [
      nec({ obraId: "a", obra: "52-27", cantidad: 1, desmolde: "2026-11-09" }),
      nec({ obraId: "b", obra: "52-28", cantidad: 1, desmolde: "2026-11-23" }),
      nec({ obraId: "c", obra: "37-45", linea: "37", cantidad: 1, desmolde: "2026-12-07" }),
    ],
    libre: new Map([["m1", 1]]),
    semanasRubro: new Map([["52|bro", 0], ["37|bro", 0]]),
    hoy: HOY,
  });
  assert.equal(r.faltan.length, 1);
  const [p] = r.faltan;
  assert.equal(p.libre, 1);
  assert.equal(p.necesario, 3);
  assert.equal(p.faltan, 2);
  // El libre va al que lo necesita primero.
  assert.deepEqual(p.necesitan.map((x) => [x.obra, x.deStock, x.faltan]), [["52-27", 1, 0], ["52-28", 0, 1], ["37-45", 0, 1]]);
  // Pedir antes = la compra de la primera obra que queda sin cubrir; se necesita tres semanas después.
  assert.equal(isoFecha(p.comprarAntes), "2026-11-23");
  assert.equal(isoFecha(p.necesitan[1].necesita), "2026-12-14");
});

test("faltantes: si lo libre alcanza no avisa, y lo lejano no cuenta", () => {
  const r = faltantesParaObras({
    necesidades: [
      nec({ obraId: "a", obra: "52-27", cantidad: 2, desmolde: "2026-11-16" }),
      nec({ obraId: "b", obra: "52-28", cantidad: 5, desmolde: "2027-06-01" }),
    ],
    libre: new Map([["m1", 2]]),
    semanasRubro: new Map([["52|bro", 0]]),
    hoy: HOY,
  });
  assert.equal(r.faltan.length, 0);
  assert.equal(r.cubiertos, 1);
});

test("faltantes: lo que ya tendría que estar en el barco va a confirmar, no se suma", () => {
  const r = faltantesParaObras({
    necesidades: [
      nec({ obraId: "v", obra: "37-40", linea: "37", cantidad: 1, desmolde: "2026-08-03" }),
      nec({ obraId: "w", obra: "37-41", linea: "37", cantidad: 1, desmolde: "2026-09-07" }),
      nec({ obraId: "f", obra: "52-28", cantidad: 1, desmolde: "2026-11-23" }),
    ],
    semanasRubro: new Map([["52|bro", 0], ["37|bro", 0]]),
    hoy: HOY,
  });
  assert.deepEqual(r.faltan.map((p) => [p.faltan, p.necesitan.map((x) => x.obra)]), [[1, ["52-28"]]]);
  assert.equal(r.aConfirmar.length, 1);
  assert.deepEqual(r.aConfirmar[0].obras.map((o) => [o.obra, o.semanasAtraso]), [["37-40", 10], ["37-41", 5]]);
});
