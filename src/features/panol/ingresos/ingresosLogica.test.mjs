import test from "node:test";
import assert from "node:assert/strict";
import {
  armarPedidos,
  buscarCatalogo,
  buscarRenglones,
  cambiarObra,
  carritoAgrupado,
  comparaConPedido,
  cuentasDelRenglon,
  materialesPorCodigo,
  planDeIngreso,
  problemasDelCarrito,
  renglonesDeMaterial,
  renglonesPorCodigo,
  resumenDelIngreso,
  sumarCantidad,
  sumarRenglon,
  sumarSinFicha,
  sumarSinPedido,
  agruparUltimos,
  cargarRemito,
  cambiarVariante,
  planDeIngreso as plan2,
  referenciaDeRemito,
  vinculosDelRemito,
  remitosParaElegir,
  enviosDelIngreso,
  obrasDelIngreso,
} from "./ingresosLogica.js";

const terminal = { id: "m1", descripcion: "Terminal preaislado ojal 6mm", codigo: "TP6", codigo_barra: "7790001", unidad: "unidad" };
const envios = [
  {
    id: "e1", titulo: "Electricidad 52-27", estado: "enviado", prioridad: "media", created_at: "2026-11-03", obra: { codigo: "52-27" },
    items: [
      { id: "i1", descripcion: "Terminal preaislado ojal 6mm", cantidad: "50", estado: "pendiente", material_id: "m1", material: terminal, obra_id: "o1", obra_codigo: "52-27" },
      { id: "i2", descripcion: "Cable 6mm", cantidad: "100", cantidad_recibida: "40", estado: "parcial", obra_id: "o1", obra_codigo: "52-27" },
      { id: "i3", descripcion: "Fusible", cantidad: "4", cantidad_recibida: "4", estado: "recibido" },
      { id: "i4", descripcion: "Relé", cantidad: "2", estado: "rechazado" },
    ],
  },
  { id: "e2", titulo: "Ya recibido", estado: "recibido", items: [{ id: "x", cantidad: "1", estado: "pendiente" }] },
  { id: "e3", titulo: "Bomba urgente", estado: "enviado", prioridad: "urgente", created_at: "2026-11-10", items: [{ id: "i5", descripcion: "Bomba de achique", cantidad: "1", estado: "pendiente", stock_general: true }] },
];

test("cuentas del renglón: pedido, llegó y falta", () => {
  assert.deepEqual(cuentasDelRenglon({ cantidad: "100", cantidad_recibida: "40" }), { pedido: 100, llego: 40, falta: 60 });
  assert.deepEqual(cuentasDelRenglon({ cantidad: "2,5 m" }), { pedido: 2.5, llego: 0, falta: 2.5 });
  assert.equal(cuentasDelRenglon({ cantidad: "" }).falta, null);
});

test("armarPedidos deja sólo lo que falta llegar y pone lo urgente primero", () => {
  const pedidos = armarPedidos(envios);
  assert.deepEqual(pedidos.map((p) => p.id), ["e3", "e1"]);
  const e1 = pedidos[1];
  assert.deepEqual(e1.renglones.map((r) => r.id).sort(), ["i1", "i2"]);
  assert.equal(e1.renglones.find((r) => r.id === "i2").falta, 60);
  assert.equal(e1.totalRenglones, 4);
});

test("el código del lector encuentra el renglón por su material y el catálogo", () => {
  const pedidos = armarPedidos(envios);
  assert.deepEqual(renglonesPorCodigo(pedidos, "7790001").map((r) => r.id), ["i1"]);
  assert.deepEqual(renglonesDeMaterial(pedidos, "m1").map((r) => r.id), ["i1"]);
  assert.deepEqual(materialesPorCodigo([terminal, { id: "m2", codigo: "X" }], " tp6 ").map((m) => m.id), ["m1"]);
});

test("buscar: renglones por palabras y catálogo sin requisitos ni consumibles", () => {
  const pedidos = armarPedidos(envios);
  assert.deepEqual(buscarRenglones(pedidos, "cable 6").map((r) => r.id), ["i2"]);
  const cat = [terminal, { id: "r", descripcion: "Terminal genérico", es_requisito: true }, { id: "c", descripcion: "Terminal lija", es_consumible: true }];
  assert.deepEqual(buscarCatalogo(cat, "terminal").map((m) => m.id), ["m1"]);
});

test("tocar un renglón suma lo que falta; el lector suma de a uno", () => {
  const [, e1] = armarPedidos(envios);
  const cable = e1.renglones.find((r) => r.id === "i2");
  let cart = sumarRenglon([], cable);
  assert.equal(cart[0].cantidad, "60");
  cart = sumarRenglon(cart, cable, 1);
  assert.equal(cart[0].cantidad, "61");
  assert.equal(comparaConPedido(cart[0]).tipo, "de_mas");
  cart = sumarCantidad(cart, cart[0].key, -11);
  assert.deepEqual(comparaConPedido(cart[0]), { tipo: "parcial", diferencia: 10 });
});

test("plan: la cantidad recibida es acumulada y decide recibido o parcial", () => {
  const [, e1] = armarPedidos(envios);
  const cable = e1.renglones.find((r) => r.id === "i2");
  const terminalR = e1.renglones.find((r) => r.id === "i1");
  let cart = sumarRenglon([], cable, 20); // llegaron 20 más de los 60 que faltaban
  cart = sumarRenglon(cart, terminalR); // los 50
  const { recibir, crear } = planDeIngreso(cart, { sede: "Chubut" });
  assert.equal(crear, null);
  assert.deepEqual(recibir.find((r) => r.id === "i2"), { id: "i2", envioId: "e1", estado: "parcial", cantidadRecibida: "60" });
  assert.deepEqual(recibir.find((r) => r.id === "i1"), { id: "i1", envioId: "e1", estado: "recibido", cantidadRecibida: "50" });
});

test("lo que llega sin pedido arma un envío de remito y pide el número", () => {
  let cart = sumarSinPedido([], terminal);
  cart = sumarSinPedido(cart, terminal, { cantidad: 2 });
  cart = sumarSinFicha(cart, { descripcion: "Bisagra inox 3 pulgadas", codigo: "abc1" });
  assert.equal(cart.length, 2);
  assert.equal(cart[0].cantidad, "3");
  assert.equal(problemasDelCarrito(cart, "").at(-1).key, "referencia");
  assert.deepEqual(problemasDelCarrito(cart, "0001-123"), []);
  cart = cambiarObra(cart, cart[0].key, "o9");
  const { crear } = planDeIngreso(cart, { sede: "Pampa", referencia: " 0001-123 " });
  assert.equal(crear.titulo, "0001-123");
  assert.equal(crear.origen, "remito");
  assert.deepEqual(crear.items.map((i) => [i.material_id, i.obra_id, i.cantidad, i.codigo]), [["m1", "o9", "3", "TP6"], [null, null, "1", "ABC1"]]);
  assert.ok(crear.items.every((i) => i.recepcion_estado === "recibido"));
});

test("cambiar de obra junta con la línea igual que ya estaba", () => {
  let cart = sumarSinPedido([], terminal, { obraId: "o1" });
  cart = sumarSinPedido(cart, terminal);
  cart = cambiarObra(cart, cart[1].key, "o1");
  assert.equal(cart.length, 1);
  assert.equal(cart[0].cantidad, "2");
});

test("agrupado: pedidos primero, después sin pedido; resumen para el listo", () => {
  const [, e1] = armarPedidos(envios);
  let cart = sumarSinPedido([], terminal);
  cart = sumarRenglon(cart, e1.renglones[0], 5);
  const grupos = carritoAgrupado(cart);
  assert.deepEqual(grupos.map((g) => g.titulo), ["Electricidad 52-27", "Sin pedido"]);
  const r = resumenDelIngreso(cart, { sede: "Chubut", referencia: "R1" });
  assert.equal(r.unidades, 6);
  assert.equal(r.pedidos, 1);
  assert.equal(r.sinPedido, 1);
  assert.match(r.items.find((i) => i.descripcion === "Terminal preaislado ojal 6mm" && i.detalle.includes("Stock")).detalle, /Stock Chubut/);
});

test("últimos ingresos: un envío por minuto es una tarjeta", () => {
  const g = agruparUltimos([
    { envio_id: "e1", marcado_at: "2026-11-20T10:01:05Z", descripcion: "A", cantidad_recibida: "2", envio: { titulo: "P" } },
    { envio_id: "e1", marcado_at: "2026-11-20T10:01:40Z", descripcion: "B", cantidad: "1", envio: { titulo: "P" } },
    { envio_id: "e9", updated_at: "2026-11-20T11:00:00Z", descripcion: "C", cantidad: "1", envio: { titulo: "R", origen: "remito" } },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].sinPedido, true);
  assert.equal(g[1].items.length, 2);
});

test("refrescar: si otro equipo lo recibió, la línea queda frenada", async () => {
  const { refrescarCarrito } = await import("./ingresosLogica.js");
  const [, e1] = armarPedidos(envios);
  const cable = e1.renglones.find((r) => r.id === "i2");
  const cart = sumarRenglon([], cable, 5);
  const otraVez = armarPedidos(envios);
  assert.equal(refrescarCarrito(cart, otraVez), cart);
  const sinCable = armarPedidos(envios.map((e) => ({ ...e, items: (e.items || []).filter((i) => i.id !== "i2") })));
  const frenado = refrescarCarrito(cart, sinCable);
  assert.equal(frenado[0].yaRecibido, true);
  assert.match(problemasDelCarrito(frenado)[0].texto, /ya se recibió/);
});

test("novedades: sin nada recibido cambia el estado; con parte recibida sólo avisa", async () => {
  const { opcionesDeNovedad, mensajeDeNovedad } = await import("./ingresosLogica.js");
  const [, e1] = armarPedidos(envios);
  const terminalR = e1.renglones.find((r) => r.id === "i1");
  const cable = e1.renglones.find((r) => r.id === "i2");
  assert.deepEqual(opcionesDeNovedad(terminalR), { modo: "estado", estados: ["falta_stock", "sin_info", "rechazado"] });
  assert.deepEqual(opcionesDeNovedad({ ...terminalR, estado: "falta_stock" }).estados, ["sin_info", "rechazado", "pendiente"]);
  assert.equal(opcionesDeNovedad(cable).modo, "mensaje");
  assert.equal(mensajeDeNovedad(cable, null, "el resto la semana que viene"), "Cable 6mm: llegaron 40 de 100. el resto la semana que viene");
  assert.equal(mensajeDeNovedad(terminalR, "rechazado"), "Terminal preaislado ojal 6mm: rechazado");
});

test("un remito escaneado va primero a los renglones que lo esperan y lo que sobra a stock", () => {
  const pedidos = armarPedidos(envios);
  const catalogo = [terminal, { id: "m9", descripcion: "Tornillo", unidad: "unidad" }, { id: "mc", descripcion: "Lija", es_consumible: true }];
  const items = [
    { id: "s1", descripcion: "TERMINAL OJAL 6", cantidad: "60", material_id: "m1" },
    { id: "s2", descripcion: "Cable 6mm", cantidad: "60" },
    { id: "s3", descripcion: "Tornillo", cantidad: "10", material_id: "m9" },
    { id: "s4", descripcion: "Lija al agua 220", cantidad: "5", material_id: "mc" },
    { id: "s5", descripcion: "Pieza rara", cantidad: "2", scanner_unidad: "unidad" },
    { id: "s6", descripcion: "Sin cantidad", cantidad: "" },
    { id: "s7", descripcion: "Ya entró", cantidad: "1", material_id: "m9", scanner_ingreso_envio_id: "e0" },
  ];
  const { cart, resumen } = cargarRemito([], items, { pedidos, catalogo });
  const linea = (k) => cart.find((l) => l.key === k);
  // 50 al renglón del pedido, los 10 de más a stock sin pedido.
  assert.equal(linea("r:i1").cantidad, "50");
  assert.deepEqual(linea("r:i1").remitoItems, ["s1"]);
  assert.equal(linea("m:m1:stock:").cantidad, "10");
  // Sin producto en el catálogo pero con la descripción exacta del renglón.
  assert.equal(linea("r:i2").cantidad, "60");
  assert.equal(linea("m:m9:stock:").cantidad, "10");
  assert.ok(cart.some((l) => l.tipo === "nuevo" && l.label === "Pieza rara" && l.remitoItems[0] === "s5"));
  assert.equal(resumen.aPedidos, 2);
  assert.equal(resumen.sinPedido, 1);
  assert.equal(resumen.sinFicha, 1);
  assert.deepEqual(resumen.consumibles, ["Lija al agua 220"]);
  assert.deepEqual(resumen.sinCantidad, ["Sin cantidad"]);
  assert.equal(resumen.yaIngresados, 1);

  // Lo que ya estaba en el carrito cuenta: no se pasa de lo que falta.
  const otra = cargarRemito(sumarRenglon([], pedidos[1].renglones.find((r) => r.id === "i1"), 45), [{ id: "t1", cantidad: "8", material_id: "m1" }], { pedidos, catalogo });
  assert.equal(otra.cart.find((l) => l.key === "r:i1").cantidad, "50");
  assert.equal(otra.cart.find((l) => l.key === "m:m1:stock:").cantidad, "3");
});

test("una sugerencia dudosa de la IA sólo vale si un pedido la espera", () => {
  const pedidos = armarPedidos(envios);
  const { cart, resumen } = cargarRemito([], [
    { id: "d1", descripcion: "TERM. 6", cantidad: "5", scanner_material_sugerido_id: "m1" },
    { id: "d2", descripcion: "Algo parecido", cantidad: "1", scanner_material_sugerido_id: "m9" },
  ], { pedidos, catalogo: [terminal, { id: "m9", descripcion: "Tornillo" }] });
  assert.equal(cart.find((l) => l.key === "r:i1").cantidad, "5");
  assert.equal(resumen.dudosos, 1);
  assert.ok(cart.some((l) => l.tipo === "nuevo" && l.label === "Algo parecido"));
});

test("al confirmar, cada renglón del remito queda en su envío", () => {
  const pedidos = armarPedidos(envios);
  let { cart } = cargarRemito([], [
    { id: "s1", cantidad: "60", material_id: "m1" },
    { id: "s3", cantidad: "2", material_id: "m9" },
  ], { pedidos, catalogo: [terminal, { id: "m9", descripcion: "Tornillo", variantes: ["A"] }] });
  cart = cambiarVariante(cart, "m:m9:stock:", "A");
  const v = vinculosDelRemito(cart, { envioCreado: "nuevo" });
  assert.deepEqual(v, [
    { envioId: "e1", items: [{ scanner_item_id: "s1", material_id: "m1" }] },
    { envioId: "nuevo", items: [{ scanner_item_id: "s3", material_id: "m9" }] },
  ]);
  assert.ok(plan2(cart, { sede: "Chubut", referencia: "R" }).crear.items.length === 2);
  assert.equal(referenciaDeRemito({ numero: "0001-123", proveedor: "Janored" }), "Remito 0001-123 · Janored");
  assert.equal(referenciaDeRemito({}), "Remito escaneado");
  assert.equal(referenciaDeRemito({ proveedor: "Baron", fecha: "2026-11-18" }), "Remito Baron 18/11");
});

test("elegir el remito archivado: filtra por lo escrito y trae los más nuevos", () => {
  const lista = [
    { id: "a", proveedor: "Trimer", numero: "0001-12", created_at: "2026-11-18", obras: [{ codigo: "55-1" }] },
    { id: "b", proveedor: "Maxi Herrero", created_at: "2026-11-19" },
    { id: "c", proveedor: "Trimer", created_at: "2026-11-20", titulo: "Bridas" },
  ];
  assert.deepEqual(remitosParaElegir(lista, "").map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual(remitosParaElegir(lista, "trimer").map((r) => r.id), ["c", "a"]);
  assert.deepEqual(remitosParaElegir(lista, "TRIMER 55-1").map((r) => r.id), ["a"]);
  assert.deepEqual(remitosParaElegir(lista, "", { max: 1 }).map((r) => r.id), ["c"]);
});

test("envíos y barcos de un ingreso", () => {
  const pedidos = armarPedidos(envios);
  let cart = sumarRenglon([], pedidos[1].renglones.find((r) => r.id === "i1"));
  cart = sumarRenglon(cart, pedidos[0].renglones[0]);
  cart = sumarSinPedido(cart, { id: "m9", descripcion: "Tornillo" }, { obraId: "o7" });
  assert.deepEqual(enviosDelIngreso(cart, { envioCreado: "nuevo" }), ["nuevo", "e1", "e3"]);
  assert.deepEqual(enviosDelIngreso(cart).length, 2);
  assert.deepEqual(obrasDelIngreso(cart), ["o1", "o7"]);
});
