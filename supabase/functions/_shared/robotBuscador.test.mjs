// Prueba el buscador del robot contra el catálogo real (lectura, con la clave
// de servicio de .env.backup.local). Sin credenciales sólo corre el caso fijo.
//
//   node --test supabase/functions/_shared/robotBuscador.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buscar, buscarFamilia, indexar, medidasHabladas, ubicacionHablada } from "./robotBuscador.ts";

const FIJO = indexar([
  { id: "1", descripcion: "MASILLA E-POXY" },
  { id: "2", descripcion: "Racor 1\"" },
  { id: "3", descripcion: "Racor 3/4\" A 1\"" },
  { id: "4", descripcion: "Lija En Seco 120" },
  { id: "5", descripcion: "Lija En Seco 80" },
  { id: "6", descripcion: "Codo 90° HH bronce 1½\"" },
  { id: "7", descripcion: "Codo 90° HH bronce 1\"", codigo: "C 116 1 FU" },
]);
const primero = (q) => buscar(FIJO, q)[0]?.material.descripcion;

test("habla contra catálogo escrito", () => {
  assert.equal(primero("cuánto queda de masilla epoxi"), "MASILLA E-POXY");
  assert.equal(primero("dónde está el racor de una pulgada"), "Racor 1\"");
  assert.equal(primero("lijas en seco ciento veinte"), "Lija En Seco 120");
  assert.equal(primero("codos de bronce de 1 pulgada"), "Codo 90° HH bronce 1\"");
  assert.equal(primero("código C116 1 FU"), "Codo 90° HH bronce 1\"");
  assert.equal(buscar(FIJO, "lija en seco").length, 2, "sin número hay que preguntar cuál");
});

test("medidas y estanterías habladas", () => {
  assert.equal(medidasHabladas("cupla de media pulgada").trim(), "cupla de 1/2");
  assert.equal(ubicacionHablada("C1-2"), "estantería C1, estante 2");
  assert.equal(ubicacionHablada("F1"), "estantería F1");
  assert.equal(ubicacionHablada("AFUERA", "JAULA DE VIDRIOS"), "afuera, jaula de vidrios");
});

function credenciales() {
  const leer = (f) => fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/)
    .flatMap((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, "")]] : []; })) : {};
  const env = { ...leer(new URL("../../../.env", import.meta.url)), ...leer(new URL("../../../.env.backup.local", import.meta.url)) };
  return env.SUPABASE_SERVICE_ROLE_KEY ? { url: env.VITE_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY } : null;
}
const cred = credenciales();

test("familias completas, baldeo histórico y medidas estrictas", () => {
  const indice = indexar([
    { id: "1", descripcion: "CANILLA VALDEOS" },
    { id: "2", descripcion: "Grifería Monocomando Para Ducha Sin Transferencia Negro Mate" },
    { id: "3", descripcion: "Grifería ducha FV plateada" },
    { id: "4", descripcion: "Canilla cocina negra" },
    { id: "5", descripcion: "Racor 1\"" },
    { id: "6", descripcion: "Racor 1/2\"" },
  ]);
  assert.deepEqual(buscarFamilia(indice, "canilla de baldeo").map((c) => c.material.id), ["1"]);
  assert.equal(buscarFamilia(indice, "griferías").length, 4, "no oculta las variantes largas");
  assert.deepEqual(buscarFamilia(indice, "racor de una pulgada").map((c) => c.material.id), ["5"]);
  assert.equal(buscarFamilia(indice, "racor de dos pulgadas").length, 0, "no ignora la medida ausente");
  assert.equal(buscarFamilia(indice, "canilla de baldeo gigante").length, 0);
});

test("catálogo real", { skip: !cred && "sin credenciales de servicio" }, async () => {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${cred.url}/rest/v1/panol_materiales?select=id,descripcion,alias,codigo,codigo_barra,unidad_medida,ubicacion,ubicacion_obs,es_consumible&activo=neq.false`, {
      headers: { apikey: cred.key, Authorization: `Bearer ${cred.key}`, Range: `${desde}-${desde + 999}` },
    });
    const pagina = await res.json();
    filas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  const indice = indexar(filas);
  const casos = {
    "masilla poliester": /masilla poli[eé]ster/i,
    "masilla epoxi": /e-?poxy/i,
    "cinta aislante negra": /cinta aislante negra/i,
    "racor de una pulgada": /^racor 1"$/i,
    "lija en seco ciento veinte": /lija en seco 120/i,
    "guantes de latex": /guantes latex/i,
    "cinta doble faz": /doble faz/i,
  };
  for (const [dicho, esperado] of Object.entries(casos)) {
    const r = buscar(indice, dicho);
    assert.ok(r.length, `"${dicho}" no encontró nada`);
    assert.match(r[0].material.descripcion, esperado, `"${dicho}" → ${r.map((c) => c.material.descripcion).join(" | ")}`);
  }
});
