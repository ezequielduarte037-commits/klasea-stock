import test from "node:test";
import assert from "node:assert/strict";
import { asociarPedidoAlRemito, detectarPedidoRemito, proveedorDelRemito, quitarPedidoDelRemito, validarPedidoDelRemito, vincularRemitoPedido } from "./pedidoRemito.js";
import { incorporarLecturaRemito } from "./remitoIA.js";
import { lineasDePedidoRecibido, pedidosPorRecibir } from "./pedidoRecibido.js";
import { calcularLinea } from "./ingresoCalculos.js";
import { prepararIngreso } from "./ingresoRegistro.js";
import { estadoDePedido } from "../pedidos/pedidosLogica.js";

const catalogo = [
  { id: "a", descripcion: "Cinta verde", unidad: "rollo", codigos: ["C0032"], config: { factor_compra: 18, unidad_compra: "caja", costo_unitario_ars: 5000 } },
  { id: "b", descripcion: "Guante", unidad: "par", codigos: ["G1"], config: { factor_compra: 12, unidad_compra: "caja", costo_unitario_ars: 100 } },
  { id: "c", descripcion: "Trapo", unidad: "unidad", codigos: ["T1"], config: { factor_compra: 1 } },
];
const pedido = { id: "p8", numero: 8, sede: "Chubut", proveedor: "Rebollar", estado: "pedido", pedido_at: "2026-11-02T11:00:00Z",
  items: [
    { id: "i1", material_id: "a", cantidad: 2, pendiente: 2, factor: 18, unidad_compra: "caja" },
    { id: "i2", material_id: "b", cantidad: 3, pendiente: 3, factor: 12, unidad_compra: "caja" },
  ] };
const vacio = () => ({ remito: "", proveedor: "Rebollar", lineas: [], sinEmparejar: [], escaneos: [] });
const leer = (items, b = vacio(), extra = {}) => incorporarLecturaRemito(b, { tipo_documento: "remito", es_comprobante: true, proveedor: "Rebollar", numero: "R1", fecha: "2026-11-03", items, ...extra }, catalogo).borrador;
const cinta = (cantidad = 18) => ({ codigo: "C0032", cantidad, unidad: "rollo" });
const guantes = (cantidad = 12) => ({ codigo: "G1", cantidad, unidad: "par" });

test("remito leído por IA queda vinculado a un pedido real y sus cantidades actualizan lo recibido", () => {
  const b = asociarPedidoAlRemito(leer([cinta(), guantes()]), [pedido], "Chubut");
  assert.equal(b.pedidoId, "p8");
  assert.equal(b.pedidoAutomatico, true);
  assert.deepEqual(b.lineas.map((l) => l.pedidoItemId), ["i1", "i2"]);
  const envio = prepararIngreso(b, "Chubut", (() => { let n = 0; return () => `m${n++}`; })());
  assert.deepEqual(envio.filas.map((f) => [f.pedido_item_id, f.cantidad]), [["i1", 18], ["i2", 12]]);
  const recibidos = new Map(envio.filas.map((f) => [f.pedido_item_id, f.cantidad]));
  assert.equal(estadoDePedido(pedido, recibidos), "parcial");
  assert.deepEqual(pedidosPorRecibir([pedido], recibidos)[0].items.map((i) => i.pendiente), [1, 2]);
});

test("la detección compara proveedor, sede, fecha y sólo pedidos con saldo pendiente", () => {
  const b = leer([cinta()]);
  const ajenos = [
    { ...pedido, id: "pampa", sede: "Pampa" },
    { ...pedido, id: "otro", proveedor: "Famiq" },
    { ...pedido, id: "carrito", estado: "borrador" },
    { ...pedido, id: "cerrado", estado: "cerrado" },
    { ...pedido, id: "futuro", pedido_at: "2026-11-04T12:00:00Z" },
    { ...pedido, id: "recibido", items: pedido.items.map((i) => ({ ...i, pendiente: 0 })) },
  ];
  assert.equal(detectarPedidoRemito(b, ajenos, "Chubut").candidatos.length, 0);
  for (const proveedor of ["REBOLLAR S.R.L.", "CMR Insumos Industriales S.A.", "CMR"]) {
    assert.equal(proveedorDelRemito(proveedor), "rebollar");
    assert.equal(asociarPedidoAlRemito({ ...b, proveedor }, [pedido], "Chubut").pedidoId, "p8");
  }
});

test("el número de remito no se confunde con el número del pedido ni elige al más reciente entre empates", () => {
  const otro = { ...pedido, id: "p9", numero: 9, pedido_at: "2026-11-03T09:00:00Z", items: pedido.items.map((i) => ({ ...i, id: i.id + "-otro", cantidad: 1, pendiente: 1 })) };
  const b = leer([cinta(), guantes()], vacio(), { numero: "8" });
  const detected = detectarPedidoRemito(b, [otro, pedido], "Chubut");
  assert.equal(detected.automatico, null);
  assert.equal(detected.candidatos.length, 2);
  const sinVincular = asociarPedidoAlRemito(b, [otro, pedido], "Chubut");
  assert.throws(() => prepararIngreso(sinVincular, "Chubut"), /Elegí el pedido/);
  const elegido = vincularRemitoPedido(sinVincular, pedido, "Chubut");
  assert.equal(elegido.pedidoAutomatico, false);
  assert.deepEqual(elegido.lineas.map((l) => l.cantidad), ["18", "12"]);
});

test("una coincidencia más completa identifica al pedido y deja los productos extra sin vínculo", () => {
  const soloCinta = { ...pedido, id: "p4", items: [pedido.items[0]] };
  const b = leer([cinta(), guantes()]);
  assert.equal(asociarPedidoAlRemito(b, [soloCinta, pedido], "Chubut").pedidoId, "p8");
  const conExtra = asociarPedidoAlRemito(leer([cinta(), guantes(), { codigo: "T1", cantidad: 4, unidad: "unidad" }]), [pedido], "Chubut");
  assert.deepEqual(conExtra.lineas.map((l) => l.pedidoItemId), ["i1", "i2", undefined]);
  assert.equal(prepararIngreso(conExtra, "Chubut").filas[2].pedido_item_id, undefined);
});

test("escanear después de Recibir reemplaza lo esperado por lo que llegó y no duplica ni recibe productos ausentes", () => {
  const { lineas } = lineasDePedidoRecibido(pedido, catalogo);
  const previo = { ...vacio(), lineas, pedidoId: pedido.id, pedidoTitulo: "Pedido N° 8" };
  const b = asociarPedidoAlRemito(leer([cinta(12)], previo), [pedido], "Chubut");
  assert.equal(b.lineas.length, 1);
  assert.equal(b.lineas[0].cantidad, "12");
  assert.equal(b.lineas[0].pedidoItemId, "i1");
  assert.equal(calcularLinea(b.lineas[0]).cantidadEntrega, 12);
  assert.equal(previo.lineas.length, 2);
  assert.equal(previo.lineas[0].cantidad, "2");
});

test("otra página del mismo remito conserva lo leído, sin repetir las cantidades precargadas", () => {
  const primero = asociarPedidoAlRemito(leer([cinta()]), [pedido], "Chubut");
  const segundo = asociarPedidoAlRemito(leer([guantes()], primero), [pedido], "Chubut");
  assert.equal(segundo.lineas.length, 2);
  assert.deepEqual(segundo.lineas.map((l) => calcularLinea(l).cantidadEntrega), [18, 12]);
});

test("vincular no inventa presentación ni reemplaza cantidades o precios por los del pedido", () => {
  const b = leer([{ codigo: "C0032", cantidad: 5 }]);
  const linea = b.lineas[0];
  assert.equal(linea.presentacionPendiente, true);
  const vinculado = asociarPedidoAlRemito(b, [pedido], "Chubut");
  assert.deepEqual(calcularLinea(vinculado.lineas[0]), calcularLinea(linea));
  assert.equal(vinculado.lineas[0].cantidad, "5");
  assert.throws(() => prepararIngreso(vinculado, "Chubut"), /Revisá/);
});

test("las dudas pendientes impiden asociar prematuramente y un borrador persistido conserva sus vínculos", () => {
  const b = leer([cinta(), { descripcion: "Producto ilegible", cantidad: 1 }]);
  assert.equal(detectarPedidoRemito(b, [pedido], "Chubut").automatico, null);
  const resuelto = asociarPedidoAlRemito({ ...b, sinEmparejar: [] }, [pedido], "Chubut");
  const restaurado = JSON.parse(JSON.stringify(resuelto));
  assert.equal(restaurado.pedidoId, "p8");
  assert.equal(restaurado.lineas[0].pedidoItemId, "i1");
});

test("un ingreso explícitamente sin pedido se conserva así aunque se vuelva a consultar", () => {
  const b = quitarPedidoDelRemito(asociarPedidoAlRemito(leer([cinta()]), [pedido], "Chubut"));
  assert.equal(asociarPedidoAlRemito(b, [pedido], "Chubut").pedidoId, null);
  assert.equal(prepararIngreso(b, "Chubut").filas[0].pedido_item_id, undefined);
});

test("recibir en otro equipo obliga a revisar el vínculo antes de guardar; un reintento conserva sus ids", () => {
  const b = asociarPedidoAlRemito(leer([cinta()]), [pedido], "Chubut");
  assert.doesNotThrow(() => validarPedidoDelRemito(b, [pedido], "Chubut"));
  assert.throws(() => validarPedidoDelRemito(b, [], "Chubut"), /ya se recibió/);
  assert.throws(() => validarPedidoDelRemito(b, [{ ...pedido, items: [] }], "Chubut"), /ya se recibió/);
  const enviado = { ...b, envio: prepararIngreso(b, "Chubut") };
  assert.equal(asociarPedidoAlRemito(enviado, [], "Chubut"), enviado);
  assert.equal(quitarPedidoDelRemito(enviado), enviado);
  assert.equal(prepararIngreso(enviado, "Chubut"), enviado.envio);
});

test("una lectura de otro proveedor no queda vinculada al pedido precargado de Rebollar", () => {
  const previo = { ...vacio(), pedidoId: pedido.id, lineas: lineasDePedidoRecibido(pedido, catalogo).lineas };
  const b = asociarPedidoAlRemito(leer([cinta()], previo, { proveedor: "Famiq" }), [pedido], "Chubut");
  assert.equal(b.proveedor, "Famiq");
  assert.equal(b.pedidoId, null);
  assert.equal(b.lineas[0].pedidoItemId, undefined);
});

test("al quitar el producto que distinguía al pedido, una detección automática vuelve a pedir elección", () => {
  const otro = { ...pedido, id: "p4", items: [pedido.items[0]] };
  const b = asociarPedidoAlRemito(leer([cinta(), guantes()]), [pedido, otro], "Chubut");
  assert.equal(b.pedidoId, "p8");
  const quitado = asociarPedidoAlRemito({ ...b, lineas: b.lineas.slice(0, 1) }, [pedido, otro], "Chubut");
  assert.equal(quitado.pedidoId, null);
  assert.equal(quitado.lineas[0].pedidoItemId, undefined);
  assert.throws(() => vincularRemitoPedido(quitado, { ...pedido, sede: "Pampa" }, "Chubut"), /sede/);
});

test("la elección manual se conserva aunque otra opción tenga más coincidencias", () => {
  const otro = { ...pedido, id: "p4", items: [pedido.items[0]] };
  const elegido = vincularRemitoPedido(leer([cinta(), guantes()]), otro, "Chubut");
  const actualizado = asociarPedidoAlRemito(elegido, [pedido, otro], "Chubut");
  assert.equal(actualizado.pedidoId, "p4");
  assert.equal(actualizado.lineas[1].pedidoItemId, undefined);
});
