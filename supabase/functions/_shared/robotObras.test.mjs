import test from "node:test";
import assert from "node:assert/strict";
import { normalizarCodigoObra, materialesRegistrados, consultarMaterialesObra, leerPaginas } from "./robotObras.ts";

test("código de barco sin guión y adicionales fuera del catálogo", () => {
  assert.equal(normalizarCodigoObra("52-23"), normalizarCodigoObra("5223"));
  const r = materialesRegistrados([
    { id: "a", descripcion: "Griferías negras", cantidad: null, estado: "comprado", source: "addon" },
    { id: "b", descripcion: "Canilla cocina", cantidad: 2, estado: "recibido", unidad: "unid" },
    { id: "c", descripcion: "Canilla vieja", cantidad: 90, estado: "cancelado" },
    { id: "d", descripcion: "Canilla anulada", cantidad: 100, estado: "comprado", notas: "[ANULADO]" },
  ], new Map(), "griferías");
  assert.equal(r.registros, 2);
  assert.equal(r.materiales[0].cantidad, null, "una fila no es una unidad");
  assert.deepEqual(r.resumen_por_estado, [
    { estado: "comprado", unidad: "unidad", cantidad_conocida: 0, registros_sin_cantidad: 1 },
    { estado: "recibido", unidad: "unidad", cantidad_conocida: 2, registros_sin_cantidad: 0 },
  ]);
});

test("estados, cantidades parciales y unidades no se confunden con stock", () => {
  const catalogo = new Map([["cat", { id: "cat", descripcion: "Grifería cocina", alias: "Canilla" }]]);
  const r = materialesRegistrados([
    { id: "a", material_id: "cat", descripcion: "Modelo especial", cantidad: 3, cantidad_egresada: 1, estado: "egresado", unidad: "unidad" },
    { id: "b", descripcion: "Grifería", cantidad: "2,5", estado: "pendiente", unidad: "metro" },
    { id: "c", descripcion: "Grifería", cantidad: "", estado: "comprado" },
  ], catalogo, "grifería");
  assert.equal(r.registros, 3);
  assert.equal(r.materiales[0].cantidad, 1);
  assert.equal(r.materiales[1].cantidad, 2.5);
  assert.equal(r.materiales[2].cantidad, null);
  assert.equal(r.resumen_por_estado.length, 3);
  assert.match(r.nota, /NO stock/);
});

function dbFalso(tablas, falla = false) {
  return { from(tabla) {
    let filtro;
    return { select() { return this; }, eq(columna, valor) { filtro = [columna, valor]; return this; }, order() { return this; },
      async range(desde, hasta) {
        const filas = (tablas[tabla] || []).filter((f) => !filtro || f[filtro[0]] === filtro[1]);
        return falla ? { error: new Error("base no disponible") } : { data: filas.slice(desde, hasta + 1) };
      },
    };
  } };
}

test("consulta paginada y filtrada por barco, sin coincidencias parciales", async () => {
  const filas = Array.from({ length: 1001 }, (_, i) => ({ id: `${i}`, obra_id: "a", descripcion: "Canilla baldeo", cantidad: 1, estado: "egresado" }));
  const db = dbFalso({ produccion_obras: [{ id: "a", codigo: "52-23" }, { id: "b", codigo: "52-230" }], panol_obra_materiales_snapshot: [...filas, { id: "otro", obra_id: "b", descripcion: "Canilla baldeo", cantidad: 9999 }] });
  const r = await consultarMaterialesObra(db, "5223", "canilla baldeo", new Map());
  assert.equal(r.obra, "52-23");
  assert.equal(r.registros, 1001);
  assert.equal(r.resumen_por_estado[0].cantidad_conocida, 1001);
  assert.equal(r.materiales.length, 30);
  assert.equal(r.detalle_truncado, true);
  assert.equal((await consultarMaterialesObra(db, "52", "canilla", new Map())).obra_encontrada, false);
  await assert.rejects(leerPaginas(() => dbFalso({}, true).from("x").select()), /base no disponible/);
});
