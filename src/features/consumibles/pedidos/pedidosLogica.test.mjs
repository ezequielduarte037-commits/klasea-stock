import test from "node:test";
import assert from "node:assert/strict";
import { estadoDePedido, estadoDeRenglon, renglonDesdeItem, textoWhatsApp, renglonesParaMostrar, totalDePedido } from "./pedidosLogica.js";

test("un renglón nuevo toma unidad de compra, factor y costo de la config", () => {
  const r = renglonDesdeItem({ id: "a", unidad: "metro", config: { factor_compra: 45, unidad_compra: "rollo", costo_unitario_ars: 516.5679 } }, 2);
  assert.deepEqual(r, { material_id: "a", cantidad: 2, unidad_compra: "rollo", factor: 45, costo_compra_ars: 23245.56 });
  assert.equal(renglonDesdeItem({ id: "b", unidad: "par", config: {} }).unidad_compra, "par");
});

test("lo recibido se pasa a unidades de compra con el factor del renglón", () => {
  assert.deepEqual(estadoDeRenglon({ cantidad: 3, factor: 12 }, 24), { pedido: 3, recibido: 2, pendiente: 1, completo: false });
  assert.equal(estadoDeRenglon({ cantidad: 3, factor: 12 }, 40).completo, true);
});

test("el estado del pedido sale de lo que llegó", () => {
  const p = { estado: "pedido", items: [{ id: "a", cantidad: 1, factor: 1 }, { id: "b", cantidad: 2, factor: 1 }] };
  assert.equal(estadoDePedido(p, new Map()), "esperando");
  assert.equal(estadoDePedido(p, new Map([["a", 1]])), "parcial");
  assert.equal(estadoDePedido(p, new Map([["a", 1], ["b", 2]])), "completo");
  assert.equal(estadoDePedido({ ...p, estado: "cerrado" }), "cerrado");
});

test("texto para WhatsApp con código del proveedor y total", () => {
  const pedido = { sede: "Chubut", proveedor: "Rebollar", numero: 4, pedido_at: "2026-10-20T12:00:00Z", items: [{ id: "x", material_id: "a", cantidad: 2, unidad_compra: "rollo", factor: 45, costo_compra_ars: 100 }] };
  const renglones = renglonesParaMostrar(pedido, new Map([["a", { descripcion: "Lija en banda", unidad: "metro", config: { proveedor_codigo: "L0029" } }]]));
  const t = textoWhatsApp({ pedido, renglones });
  assert.match(t, /• 2 rollo x45 — \[L0029\] Lija en banda/);
  assert.match(t, /Pedido N° 4/);
  assert.deepEqual(totalDePedido(renglones), { total: 200, sinCosto: 0 });
});
