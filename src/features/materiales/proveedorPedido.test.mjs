import test from "node:test";
import assert from "node:assert/strict";
import { supplierSnapshotForMaterial } from "./proveedorPedido.js";

test("un precio de proveedor único conserva su identificación", () => {
  const row = supplierSnapshotForMaterial({}, { proveedorId: "iriarte-id", proveedor: "Iriarte" });
  assert.equal(row.supplier_id, "iriarte-id");
  assert.equal(row.supplier_name, "Iriarte");
});

test("un nombre con dos proveedores no asigna el pedido a una firma ficticia", () => {
  const row = supplierSnapshotForMaterial({ proveedor_id: "combined-id" }, {
    proveedorId: "combined-id", proveedor: "Janored o 2001",
  });
  assert.equal(row.supplier_id, null);
  assert.equal(row.supplier_name, null);
});
