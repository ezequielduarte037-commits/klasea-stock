import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarDestinoPedido, destinoPedidoParaGuardar, pedidoIncluyeObra, restaurarDestinosPedido } from "./destinosPedido.js";

const projects = [{ id: "52", codigo: "K52-1" }, { id: "hunter", codigo: "Hunter 175" }, { id: "otro52", codigo: "K52-10" }];

test("un solo barco conserva el vínculo anterior", () => {
  assert.deepEqual(destinoPedidoParaGuardar({ destinos: [{ obra_id: "52", valor: "K52-1" }], destino: "" }, projects), {
    project_id: "52", destino: null,
  });
});

test("varias embarcaciones se guardan juntas sin asignar todo el pedido a la primera", () => {
  const destinos = agregarDestinoPedido(agregarDestinoPedido([], "K52-1", projects[0]), "Hunter 175", projects[1]);
  const payload = destinoPedidoParaGuardar({ destinos, destino: "" }, projects);
  assert.deepEqual(payload, { project_id: null, destino: "K52-1 · Hunter 175" });
  assert.equal(pedidoIncluyeObra(payload, projects[0]), true);
  assert.equal(pedidoIncluyeObra(payload, projects[1]), true);
  assert.equal(pedidoIncluyeObra(payload, projects[2]), false);
});

test("un nombre libre funciona sin seleccionar una embarcación", () => {
  assert.deepEqual(destinoPedidoParaGuardar({ destinos: [], destino: "  La Esperanza en el río  " }), {
    project_id: null, destino: "La Esperanza en el río",
  });
});

test("la referencia libre se conserva junto a las embarcaciones seleccionadas", () => {
  assert.deepEqual(destinoPedidoParaGuardar({ destinos: [{ obra_id: "52", valor: "K52-1" }], destino: "Barco Sol en el río" }, projects), {
    project_id: null, destino: "K52-1 · Barco Sol en el río",
  });
});

test("se puede crear sin obra ni referencia", () => {
  assert.deepEqual(destinoPedidoParaGuardar({ destinos: [], destino: "" }), { project_id: null, destino: null });
});

test("la misma embarcación no se duplica al seleccionarla otra vez o escribir su código", () => {
  const destinos = agregarDestinoPedido([], "K52-1", projects[0]);
  assert.equal(agregarDestinoPedido(destinos, "K52-1", projects[0]), destinos);
  assert.deepEqual(destinoPedidoParaGuardar({ destinos, destino: " k52-1 " }, projects), { project_id: "52", destino: null });
});

test("los borradores y prefill de una sola obra siguen funcionando", () => {
  const restaurado = restaurarDestinosPedido({ project_id: "52", destino: "K52-1", title: "Tornillos" }, projects);
  assert.deepEqual(restaurado.destinos, [{ valor: "K52-1", obra_id: "52" }]);
  assert.equal(restaurado.destino, "");
  assert.equal(restaurado.title, "Tornillos");
  assert.deepEqual(destinoPedidoParaGuardar(restaurado, projects), { project_id: "52", destino: null });
  assert.deepEqual(destinoPedidoParaGuardar({ project_id: "52", destino: "K52-1" }, projects), { project_id: "52", destino: null });
});

test("se pueden retomar borradores con varias obras y un nombre libre", () => {
  const form = { destinos: [{ valor: "K52-1", obra_id: "52" }, { valor: "Hunter 175", obra_id: "hunter" }], destino: "La Esperanza" };
  const restaurado = restaurarDestinosPedido(JSON.parse(JSON.stringify(form)), projects);
  assert.deepEqual(restaurado.destinos, form.destinos);
  assert.equal(destinoPedidoParaGuardar(restaurado, projects).destino, "K52-1 · Hunter 175 · La Esperanza");
});

test("los destinos de stock y las referencias antiguas se conservan", () => {
  assert.deepEqual(destinoPedidoParaGuardar({ destino: "Stock Chubut 2120" }), { project_id: null, destino: "Stock Chubut 2120" });
  assert.deepEqual(destinoPedidoParaGuardar({ destinos: [{ valor: "Stock Pampa 1050", obra_id: null }], destino: "" }), {
    project_id: null, destino: "Stock Pampa 1050",
  });
});
