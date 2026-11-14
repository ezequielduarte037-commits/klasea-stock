import { test } from "node:test";
import assert from "node:assert/strict";
import { lecturaDesdePush, lecturasParaSincronizar, mergeLecturas, normalizarLecturas, notificacionLeida } from "./notificacionesLecturas.js";

const vieja = "2026-10-07T09:00:00.000Z";
const nueva = "2026-10-07T10:00:00.000Z";

test("una lectura de otro dispositivo se restaura y nunca retrocede", () => {
  const escritorio = { "logistica:viaje": nueva, "compra:pedido": vieja };
  const celular = { "logistica:viaje": vieja };
  assert.deepEqual(mergeLecturas(escritorio, celular), escritorio);
  assert.deepEqual(mergeLecturas(celular, escritorio), escritorio);
  assert.equal(lecturasParaSincronizar(celular, escritorio).length, 0);
});

test("un fallo de red conserva solo lecturas pendientes para el próximo reintento", () => {
  const local = { "logistica:viaje": nueva, "compra:pedido": vieja };
  const remoto = [{ clave: "logistica:viaje", leida_hasta: vieja }];
  assert.deepEqual(lecturasParaSincronizar(local, remoto), [
    { clave: "logistica:viaje", leida_hasta: nueva },
    { clave: "compra:pedido", leida_hasta: vieja },
  ]);
  assert.deepEqual(lecturasParaSincronizar(local, local), []);
});

test("leer una versión no oculta una reprogramación posterior de la misma entidad", () => {
  const vistas = { "logistica:viaje": vieja };
  assert.equal(notificacionLeida({ clave: "logistica:viaje", fecha: vieja }, vistas), true);
  assert.equal(notificacionLeida({ clave: "logistica:viaje", fecha: nueva }, vistas), false);
  assert.equal(notificacionLeida({ clave: "compra:pedido", fecha: vieja }, vistas), false);
});

test("cache inválida no crea lecturas ni rompe la sincronización", () => {
  assert.deepEqual(normalizarLecturas(null), {});
  assert.deepEqual(normalizarLecturas({ "logistica:invalida": "mañana", raro: nueva, [`compra:${"x".repeat(200)}`]: nueva }), {});
  assert.equal(notificacionLeida({ clave: "logistica:viaje", fecha: "" }, { "logistica:viaje": nueva }), false);
  assert.deepEqual(normalizarLecturas([{ clave: "compra:pedido", leida_hasta: "2026-10-07T06:00:00-03:00" }]), { "compra:pedido": vieja });
});

test("abrir el push marca sólo la versión recibida y sólo en la cuenta correcta", () => {
  const url = new URL("https://klasea.test/calendario?open=viaje");
  url.searchParams.set("_push_clave", "logistica:viaje");
  url.searchParams.set("_push_fecha", vieja);
  url.searchParams.set("_push_user", "usuario");
  assert.deepEqual(lecturaDesdePush(url, "usuario", Date.parse(nueva)), { clave: "logistica:viaje", fecha: vieja });
  assert.equal(lecturaDesdePush(url, "otro", Date.parse(nueva)), null);
  assert.equal(url.searchParams.get("open"), "viaje");
  url.searchParams.set("_push_fecha", "2026-11-07T10:00:00Z");
  assert.equal(lecturaDesdePush(url, "usuario", Date.parse(nueva)), null);
  url.searchParams.set("_push_fecha", vieja);
  url.searchParams.set("_push_clave", "desconocido:viaje");
  assert.equal(lecturaDesdePush(url, "usuario", Date.parse(nueva)), null);
});

test("los microsegundos de PostgreSQL conservan la versión exacta y no confunden lecturas", () => {
  const anterior = "2026-10-07T09:00:00.000100+00:00";
  const posterior = "2026-10-07T09:00:00.000200+00:00";
  const vistas = normalizarLecturas({ "logistica:viaje": anterior });
  assert.equal(vistas["logistica:viaje"], "2026-10-07T09:00:00.000100Z");
  assert.equal(notificacionLeida({ clave: "logistica:viaje", fecha: anterior }, vistas), true);
  assert.equal(notificacionLeida({ clave: "logistica:viaje", fecha: posterior }, vistas), false);
  assert.deepEqual(lecturasParaSincronizar({ "logistica:viaje": posterior }, vistas), [
    { clave: "logistica:viaje", leida_hasta: "2026-10-07T09:00:00.000200Z" },
  ]);
  assert.equal(mergeLecturas({ "logistica:viaje": posterior }, vistas)["logistica:viaje"], "2026-10-07T09:00:00.000200Z");
  const url = new URL("https://klasea.test/calendario");
  url.searchParams.set("_push_clave", "logistica:viaje");
  url.searchParams.set("_push_fecha", posterior);
  url.searchParams.set("_push_user", "usuario");
  assert.equal(lecturaDesdePush(url, "usuario", Date.parse(nueva)).fecha, "2026-10-07T09:00:00.000200Z");
});
