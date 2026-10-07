import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as lecturas from "../lib/notificacionesLecturas.js";

// Ejecuta el hook real con una agenda de efectos y respuestas controladas.
// No necesita navegador ni una cuenta Supabase para reproducir las carreras.
const source = await readFile(new URL("./useNotificaciones.js", import.meta.url), "utf8");
const importPattern = /^import\s+([\s\S]*?)\s+from\s+["'][^"']+["'];\r?\n/gm;
const importedNames = [...source.matchAll(importPattern)].flatMap((match) => match[1].replace(/[{}]/g, "").split(",").map((name) => name.trim()).filter(Boolean));
const factory = new Function(...importedNames, source.replace(importPattern, "").replace("export default function", "return function"));
const fecha = "2026-10-07T09:00:00.000Z";
const nueva = "2026-10-07T10:00:00.000Z";
const envio = (id = "compartido", updated_at = fecha) => ({ id, titulo: id, sede: "Pampa", estado: "pendiente", created_by: "otro", created_at: fecha, updated_at });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function harness(responder, rpc = async () => ({ error: null })) {
  let cursor = 0;
  let dirty = true;
  let profile = { id: "A", role: "panol", sede: "Pampa" };
  let output;
  const slots = [];
  const effects = [];
  const badges = [];
  const calls = [];
  const storage = new Map();
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const useMemo = (fn, deps) => {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
    return slots[i].value;
  };
  const bindings = {
    useMemo, useCallback: (fn, deps) => useMemo(() => fn, deps), useId: () => useMemo(() => "test", []),
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next) => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i];
        slots[i] = { deps, cleanup: null };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    supabase: {
      from(table) {
        const request = { table, filter: [] };
        const query = {};
        for (const method of ["select", "in", "not", "order", "limit", "or", "gte", "update"]) {
          query[method] = (...args) => { request[method] = args; return query; };
        }
        query.eq = (...args) => { request.filter.push(args); return query; };
        query.single = () => query;
        query.then = (resolve, reject) => {
          calls.push(request);
          return Promise.resolve(responder(request)).then(resolve, reject);
        };
        return query;
      },
      rpc,
      channel() {
        const channel = { on: () => channel, subscribe: () => channel };
        return channel;
      },
      removeChannel() {},
    },
    operationalRole: (p) => p?.role || "", userIdOf: (p) => p?.id,
    puedeVerRecepcion: (p) => p.role === "panol", puedeVerProduccion: () => false,
    puedeVerCompras: () => false, puedeVerLogistica: () => false, isComprasOperativo: () => false,
    sedeOperativa: (p) => p?.sede || "", audienciaRecepcion: (row, p) => ({ ok: row.created_by !== p.id }),
    audienciaAviso: () => ({ ok: false }), audienciaCompra: () => ({ ok: false }), audienciaProduccion: () => ({ ok: false }),
    esAccionPropia: (id, p) => id === p?.id, gravedadAviso: () => "warning", gravedadCompra: () => "info",
    gravedadItem: () => "info", gravedadRecepcion: () => "warning",
    cargarAvisosLogistica: async () => [], notificacionLogistica: () => null,
    ...lecturas, updatePushBadge: (count) => badges.push(count),
  };
  const hook = factory(...importedNames.map((name) => {
    assert.ok(Object.hasOwn(bindings, name), `binding faltante: ${name}`);
    return bindings[name];
  }));
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  globalThis.window = {
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    addEventListener() {}, removeEventListener() {}, clearTimeout() {}, clearInterval() {},
    setTimeout: () => 1, setInterval: () => 1,
    location: { href: "https://klasea.test/inicio" }, history: { state: {}, replaceState() {} },
  };
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  return {
    calls, badges,
    get output() { return output; },
    setProfile(p) { profile = p; dirty = true; },
    async flush() {
      for (let pass = 0; pass < 25; pass++) {
        if (dirty) {
          dirty = false;
          cursor = 0;
          output = hook(profile);
          effects.splice(0).forEach((run) => run());
        }
        await Promise.resolve();
      }
      if (dirty) { cursor = 0; dirty = false; output = hook(profile); effects.splice(0).forEach((run) => run()); }
      return output;
    },
    close() {
      slots.forEach((slot) => slot.cleanup?.());
      globalThis.window = priorWindow;
      globalThis.document = priorDocument;
    },
  };
}

test("una respuesta de la cuenta anterior no restaura su lista ni sus lecturas", async () => {
  const oldEnvios = deferred();
  const oldReads = deferred();
  let receptionCall = 0;
  const h = harness(({ table, filter }) => table === "panol_envios"
    ? (++receptionCall === 1 ? oldEnvios.promise : { data: [envio("cuenta-B")], error: null })
    : filter.some(([, value]) => value === "A") ? oldReads.promise : { data: [], error: null });
  try {
    await h.flush();
    h.setProfile({ id: "B", role: "panol", sede: "Pampa" });
    await h.flush();
    assert.deepEqual(h.output.lista.map((n) => n.meta.envio.id), ["cuenta-B"]);
    oldEnvios.resolve({ data: [envio("cuenta-A")], error: null });
    oldReads.resolve({ data: [{ clave: "recepcion:cuenta-B", leida_hasta: fecha }], error: null });
    await h.flush();
    assert.deepEqual(h.output.lista.map((n) => n.meta.envio.id), ["cuenta-B"]);
    assert.equal(h.output.unreadCount, 1);
  } finally { h.close(); }
});

test("salir y volver a la misma cuenta tampoco acepta una consulta anterior", async () => {
  const old = deferred();
  let receptionCall = 0;
  const h = harness(({ table }) => table === "panol_envios"
    ? (++receptionCall === 1 ? old.promise : { data: [envio(`consulta-${receptionCall}`)], error: null })
    : { data: [], error: null });
  try {
    await h.flush();
    h.setProfile({ id: "B", role: "panol", sede: "Pampa" });
    await h.flush();
    h.setProfile({ id: "A", role: "panol", sede: "Pampa" });
    await h.flush();
    assert.equal(h.output.lista[0].meta.envio.id, "consulta-3");
    old.resolve({ data: [envio("vieja")], error: null });
    await h.flush();
    assert.equal(h.output.lista[0].meta.envio.id, "consulta-3");
  } finally { h.close(); }
});

test("un fallo de consulta conserva el último resultado y muestra la fuente que falló", async () => {
  let fail = false;
  const h = harness(({ table }) => table === "panol_envios"
    ? fail ? { data: null, error: { message: "offline" } } : { data: [envio()], error: null }
    : { data: [], error: null });
  try {
    await h.flush();
    assert.equal(h.output.ready, true);
    assert.equal(h.output.freshEvents.length, 0);
    fail = true;
    await h.output.recargar();
    await h.flush();
    assert.equal(h.output.lista.length, 1);
    assert.deepEqual(h.output.errorSources, ["Recepción"]);
    assert.match(h.output.errorCarga, /Recepción/);
  } finally { h.close(); }
});

test("lecturas del servidor restauran el celular y no producen toasts históricos", async () => {
  const h = harness(({ table }) => table === "panol_envios"
    ? { data: [envio()], error: null }
    : { data: [{ clave: "recepcion:compartido", leida_hasta: fecha }], error: null });
  try {
    await h.flush();
    assert.equal(h.output.lista[0].leida, true);
    assert.equal(h.output.unreadCount, 0);
    assert.equal(h.output.freshEvents.length, 0);
    assert.equal(h.badges.at(-1), 0);
  } finally { h.close(); }
});

test("leer offline conserva el estado local, expone el fallo y se sincroniza al recargar", async () => {
  let offline = true;
  const writes = [];
  const h = harness(({ table }) => table === "panol_envios"
    ? { data: [envio()], error: null } : { data: [], error: null }, async (name, args) => {
      assert.equal(name, "notificaciones_marcar_leidas");
      writes.push(args.p_lecturas);
      return { error: offline ? { message: "offline" } : null };
    });
  try {
    await h.flush();
    assert.equal((await h.output.markLeido(h.output.lista[0])).ok, false);
    await h.flush();
    assert.equal(h.output.lista[0].leida, true);
    assert.equal(h.output.errorLecturas, true);
    offline = false;
    await h.output.recargar();
    await h.flush();
    assert.equal(h.output.errorLecturas, false);
    assert.equal(h.output.unreadCount, 0);
    assert.deepEqual(writes.at(-1), [{ clave: "recepcion:compartido", leida_hasta: fecha }]);
  } finally { h.close(); }
});

test("una versión nueva genera un aviso una vez y vuelve a quedar sin leer", async () => {
  let version = fecha;
  const h = harness(({ table }) => table === "panol_envios"
    ? { data: [envio("compartido", version)], error: null }
    : { data: [{ clave: "recepcion:compartido", leida_hasta: fecha }], error: null });
  try {
    await h.flush();
    version = nueva;
    await h.output.recargar();
    await h.flush();
    assert.equal(h.output.unreadCount, 1);
    assert.equal(h.output.freshEvents.length, 1);
    h.output.consumeFreshEvents();
    await h.flush();
    await h.output.recargar();
    await h.flush();
    assert.equal(h.output.freshEvents.length, 0);
  } finally { h.close(); }
});
