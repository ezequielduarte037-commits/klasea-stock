import test from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenOperaciones } from "./mostradorPersistencia.js";

/** Simula el orden de eventos y el commit de IndexedDB, sin dependencias nuevas. */
function indexedDBDePrueba() {
  const datos = new Map();
  const opciones = [];
  let creada = false;
  let serie = Promise.resolve();
  const simulador = { datos, opciones, fallaCommit: false };
  const db = {
    createObjectStore: () => ({ createIndex() {} }),
    close() {},
    transaction(nombre, modo, config) {
      assert.equal(nombre, "operaciones"); opciones.push(config);
      const pedidos = [];
      let borrador;
      let abortada = false;
      const tx = {
        abort() { abortada = true; },
        objectStore() {
          const pedir = (obtener) => {
            const req = {};
            pedidos.push(() => { req.result = structuredClone(obtener()); req.onsuccess?.(); });
            return req;
          };
          return {
            getAll: () => pedir(() => [...borrador.values()]),
            get: (id) => pedir(() => borrador.get(id)),
            index: (indice) => ({ get: (id) => pedir(() => [...borrador.values()].find((e) => e[indice] === id)) }),
            add: (e) => pedir(() => {
              if (borrador.has(e.id) || [...borrador.values()].some((v) => v.borradorId === e.borradorId)) throw Error("ConstraintError");
              borrador.set(e.id, structuredClone(e)); return e.id;
            }),
            put: (e) => pedir(() => { borrador.set(e.id, structuredClone(e)); return e.id; }),
          };
        },
      };
      // Se inicia después de que el consumidor haya instalado sus callbacks.
      const turno = serie.then(() => {
        borrador = new Map([...datos].map(([k, v]) => [k, structuredClone(v)]));
        try { while (pedidos.length && !abortada) pedidos.shift()(); }
        catch (e) { tx.error = e; abortada = true; }
        if (simulador.fallaCommit && modo === "readwrite") { tx.error = Error("QuotaExceededError al confirmar"); abortada = true; }
        if (abortada) { tx.onabort?.(); return; }
        datos.clear(); for (const [k, v] of borrador) datos.set(k, v);
        tx.oncomplete?.();
      });
      serie = turno.catch(() => {});
      return tx;
    },
  };
  simulador.indexedDB = { open() {
    const req = { result: db };
    queueMicrotask(() => {
      if (!creada) { req.onupgradeneeded?.(); creada = true; }
      req.onsuccess?.();
    });
    return req;
  } };
  return simulador;
}
const envio = (id) => ({ id, borradorId: "carrito:" + id, filas: [{ id: "fila:" + id }] });

test("sin IndexedDB el almacenamiento rechaza el éxito", async () => {
  await assert.rejects(crearAlmacenOperaciones(null).guardar(envio("A")), /no puede guardar/);
});

test("dos pestañas guardan carritos distintos sin perder ninguno", async () => {
  const sim = indexedDBDePrueba();
  const a = crearAlmacenOperaciones(sim.indexedDB);
  const b = crearAlmacenOperaciones(sim.indexedDB);
  await Promise.all([a.guardar(envio("A")), b.guardar(envio("B"))]);
  assert.deepEqual((await a.listar()).map((e) => e.id), ["A", "B"]);
  assert.ok(sim.opciones.every((o) => o.durability === "strict"));
});

test("un borrador duplicado conserva el primer lote y sus ids", async () => {
  const sim = indexedDBDePrueba();
  const a = crearAlmacenOperaciones(sim.indexedDB);
  const b = crearAlmacenOperaciones(sim.indexedDB);
  const [primero, segundo] = await Promise.all([a.guardar(envio("A")), b.guardar({ ...envio("B"), borradorId: "carrito:A" })]);
  assert.equal(primero.id, "A"); assert.equal(segundo.id, "A");
  assert.equal(sim.datos.size, 1);
});

test("onsuccess de los pedidos no anuncia éxito si después falla el commit", async () => {
  const sim = indexedDBDePrueba(); sim.fallaCommit = true;
  const almacen = crearAlmacenOperaciones(sim.indexedDB);
  await assert.rejects(almacen.guardar(envio("A")), /QuotaExceededError/);
  assert.equal(sim.datos.size, 0);
});

test("actualizaciones concurrentes leen la versión confirmada por la otra pestaña", async () => {
  const sim = indexedDBDePrueba();
  const a = crearAlmacenOperaciones(sim.indexedDB);
  const b = crearAlmacenOperaciones(sim.indexedDB);
  await a.guardar({ ...envio("A"), intentos: 0 });
  const sumar = (e) => ({ ...e, intentos: e.intentos + 1 });
  await Promise.all([a.actualizar("A", sumar), b.actualizar("A", sumar)]);
  assert.equal((await a.listar())[0].intentos, 2);
});
