// Compara el stock que calcula el robot (stockPanol.ts) con la cuenta de la app
// (src/features/panol/panolMovimientos.js), fila por fila del ledger real.
//
//   node --test supabase/functions/_shared/stockPanol.test.mjs
//
// Sin credenciales de servicio en .env.backup.local sólo corre el caso fijo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rowDelta as deltaApp } from "../../../src/features/panol/panolMovimientos.js";
import { rowDelta as deltaRobot, stockDeMaterial } from "./stockPanol.ts";

const FILAS_FIJAS = [
  { material_id: "a", estado: "en_panol", source: "stock_general", cantidad: 5, stock_sede: "Chubut" },
  { material_id: "a", estado: "recibido", recepcion_estado: "recibido", source: "remito", cantidad: "2,5", stock_sede: "Pampa" },
  { material_id: "a", estado: "egresado", source: "egreso_consumible", cantidad: 1, cantidad_egresada: 1, stock_sede: "Chubut" },
  { material_id: "a", estado: "egresado", source: "stock_general", cantidad: 3 },
  { material_id: "a", estado: "en_panol", source: "ajuste_ubicacion", cantidad: 9 },
  { requisito_material_id: "a", estado: "parcial", recepcion_estado: "parcial", source: "matriz", cantidad: 1, panol_envio_id: "e1" },
];

test("cada fila suma o resta lo mismo que en la app", () => {
  for (const fila of FILAS_FIJAS) assert.equal(deltaRobot(fila), deltaApp(fila), JSON.stringify(fila));
});

test("desglose por sede", () => {
  const { total, porSede } = stockDeMaterial("a", FILAS_FIJAS, new Map([["e1", "Chubut"]]));
  assert.equal(total, 7.5);
  assert.equal(porSede.get("Chubut"), 5);
  assert.equal(porSede.get("Pampa"), 2.5);
});

function credenciales() {
  const leer = (f) => fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/)
    .flatMap((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, "")]] : []; })) : {};
  const env = { ...leer(new URL("../../../.env", import.meta.url)), ...leer(new URL("../../../.env.backup.local", import.meta.url)) };
  return env.SUPABASE_SERVICE_ROLE_KEY ? { url: env.VITE_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY } : null;
}

const cred = credenciales();
test("el ledger real da el mismo delta en las dos cuentas", { skip: !cred && "sin credenciales de servicio" }, async () => {
  const filas = [];
  for (let desde = 0; desde < 20000; desde += 1000) {
    const res = await fetch(`${cred.url}/rest/v1/panol_obra_materiales_snapshot?select=material_id,requisito_material_id,estado,recepcion_estado,cantidad,cantidad_egresada,source,stock_sede,panol_envio_id`, {
      headers: { apikey: cred.key, Authorization: `Bearer ${cred.key}`, Range: `${desde}-${desde + 999}` },
    });
    const pagina = await res.json();
    filas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  assert.ok(filas.length > 100, "el ledger vino vacío");
  let distintas = 0;
  for (const fila of filas) if (deltaRobot(fila) !== deltaApp(fila)) distintas++;
  assert.equal(distintas, 0, `${distintas} filas dan distinto`);
});
