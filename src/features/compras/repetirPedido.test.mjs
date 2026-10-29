import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsParaNuevoPedido, prefillRepetirPedido } from "./repetirPedido.js";
import { agregarDestinoPedido, destinoPedidoParaGuardar, restaurarDestinosPedido } from "./destinosPedido.js";

const original = {
  id: "pedido-anterior", title: "Tornillos inox", description: "<p>AISI 316, cabeza plana</p>",
  priority: "alta", es_adicional: true, project_id: "obra-anterior",
  destino: "K52-26 · K55-5", needed_at: "2026-01-01", status: "recibido",
  created_by: "otro-usuario", assigned_to: "comprador", source: "torneria",
  source_ref: "lista-anterior", source_url: "/torneria?obra=anterior",
  actual_amount: 50000, invoice_url: "https://example.com/factura.pdf",
  comments: [{ body: "Comprado" }],
};

const producto = {
  id: "item-anterior", request_id: original.id, description: "Tornillo M6", quantity: "12",
  unit: "unidad", link_url: "https://example.com/tornillo", material_id: "producto",
  requisito_material_id: "requisito", catalog_source: "panol",
  especificaciones: { material: "AISI 316", medidas: { largo: 40 } },
  notes: "Cabeza plana", image_url: "https://example.com/tornillo.png", image_path: "items/foto.png",
  supplier_code: "M6-40", supplier_description: "Tornillo inoxidable",
  destination: "Obra K52-26", status: "recibido", received_quantity: 12,
  unit_price: 500, actual_amount: 6000, status_changed_by: "comprador",
  source_item_id: "linea-vieja", created_at: "2026-01-01",
};

test("repite el contenido y exige elegir el destino sin heredar el historial de compra", () => {
  const copia = prefillRepetirPedido(original, [producto]);
  assert.equal(copia.repetido, true);
  assert.equal(copia.title, original.title);
  assert.equal(copia.description, original.description);
  assert.equal(copia.priority, "alta");
  assert.equal(copia.es_adicional, true);
  assert.equal(copia.project_id, "");
  assert.deepEqual(copia.destinos, []);
  assert.equal(copia.destino, "");
  assert.equal(copia.needed_at, "");
  for (const campo of ["id", "status", "created_by", "assigned_to", "source", "source_ref", "source_url", "actual_amount", "invoice_url", "comments"]) {
    assert.equal(Object.hasOwn(copia, campo), false, campo);
  }
});

test("conserva cantidad, catálogo y detalles técnicos sin reutilizar recepciones ni destinos por ítem", () => {
  const [copia] = itemsParaNuevoPedido([producto]);
  for (const campo of ["description", "quantity", "unit", "link_url", "material_id", "requisito_material_id", "catalog_source", "especificaciones", "notes", "image_url", "image_path", "supplier_code", "supplier_description"]) {
    assert.deepEqual(copia[campo], producto[campo], campo);
  }
  for (const campo of ["id", "request_id", "destination", "status", "received_quantity", "unit_price", "actual_amount", "status_changed_by", "source_item_id", "created_at"]) {
    assert.equal(Object.hasOwn(copia, campo), false, campo);
  }
  // NuevoPedido vuelve a normalizar el prefill antes de enviarlo.
  assert.deepEqual(itemsParaNuevoPedido(prefillRepetirPedido(original, [producto]).items), [copia]);
});

test("editar la copia no cambia los productos ni las especificaciones del original", () => {
  const [copia] = prefillRepetirPedido(original, [producto]).items;
  copia.quantity = "24";
  copia.especificaciones.medidas.largo = 50;
  assert.equal(producto.quantity, "12");
  assert.equal(producto.especificaciones.medidas.largo, 40);
});

test("se puede repetir en otra obra, en la misma o en varios destinos sin recuperar la obra anterior", () => {
  const obras = [{ id: "obra-anterior", codigo: "K52-26" }, { id: "obra-nueva", codigo: "K52-27" }];
  for (const obra of obras) {
    const form = restaurarDestinosPedido(prefillRepetirPedido(original, [producto]), obras);
    form.destinos = agregarDestinoPedido(form.destinos, obra.codigo, obra);
    const guardado = destinoPedidoParaGuardar(form, obras);
    assert.deepEqual(guardado, { project_id: obra.id, destino: null });
  }
  const form = prefillRepetirPedido(original, [producto]);
  form.destinos = obras.reduce((lista, obra) => agregarDestinoPedido(lista, obra.codigo, obra), []);
  assert.deepEqual(destinoPedidoParaGuardar(form, obras), { project_id: null, destino: "K52-26 · K52-27" });
});

test("admite pedidos sólo con descripción y cantidades vacías, numéricas o en texto", () => {
  assert.deepEqual(prefillRepetirPedido({ description: "Pedir lo mismo" }).items, []);
  assert.deepEqual(itemsParaNuevoPedido([null, {}, { description: "A" }, { description: "B", quantity: 0 }, { description: "C", quantity: "2 cajas" }]), [
    { description: "A", quantity: null, unit: "unidad", link_url: null },
    { description: "B", quantity: 0, unit: "unidad", link_url: null },
    { description: "C", quantity: "2 cajas", unit: "unidad", link_url: null },
  ]);
});
