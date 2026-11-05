import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Ejecuta el contrato real con un transporte controlado.
const fuente = readFileSync(new URL("../api.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/\bexport /g, "");
function api(respuesta, llamadas = []) {
  const cliente = {
    rpc: async (nombre) => { llamadas.push(nombre); return respuesta; },
    from: () => { throw new Error("Ingresos no debe encadenar lecturas de tablas"); },
  };
  return new Function("supabase", "normalizarCodigo", `${fuente}; return fetchCatalogoIngreso;`)(cliente, (v) => String(v ?? "").trim().toUpperCase());
}

test("una llamada conserva productos, rubros, presentación, costo y todos los códigos", async () => {
  const llamadas = [];
  const cargar = api({ data: {
    materiales: [{ id: "g", descripcion: "Guante", codigo: "G1", codigo_barra: "ean1", categoria_id: "h", unidad_medida: "par" }],
    categorias: [{ id: "h", nombre: "Guantes", parent_id: "p" }, { id: "p", nombre: "Seguridad" }],
    configuraciones: [{ material_id: "g", codigo_etiqueta: "et1", proveedor_codigo: "R1", costo_unitario_ars: 25, unidad_compra: "caja", factor_compra: 12 }],
    codigos: [{ material_id: "g", codigo: "ean2" }, { material_id: "g", codigo: "ean3" }],
  } }, llamadas);
  const [item] = await cargar({ sede: "Chubut" });
  assert.deepEqual(llamadas, ["consumibles_catalogo_ingresos"]);
  assert.equal(item.rubroPadre, "Seguridad");
  assert.equal(item.unidad, "par");
  assert.equal(item.costoUnitarioArs, 25);
  assert.equal(item.config.factor_compra, 12);
  assert.deepEqual(item.codigosBarra, ["ean2", "ean3", "ean1"]);
  assert.deepEqual(item.codigos, ["ET1", "EAN2", "EAN3", "EAN1", "G1", "R1"]);
  assert.equal(item.stock, null);
});

test("un catálogo de más de 1000 productos no se recorta", async () => {
  const materiales = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), descripcion: `Producto ${i}` }));
  const cargar = api({ data: { materiales, categorias: [], configuraciones: [], codigos: [] } });
  assert.equal((await cargar()).length, 1205);
});

test("un error de permisos o una respuesta incompleta ofrece reintento", async () => {
  await assert.rejects(api({ error: new Error("sin permiso") })(), /sin permiso/);
  await assert.rejects(api({ data: { materiales: [] } })(), /catálogo llegó incompleto/);
});
