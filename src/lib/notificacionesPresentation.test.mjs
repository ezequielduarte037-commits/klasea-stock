import test from "node:test";
import assert from "node:assert/strict";
import { filterNotifications, groupNotifications, notificationDateBucket } from "./notificacionesPresentation.js";

const now = new Date("2026-10-07T03:30:00Z");
const tz = "America/Argentina/Buenos_Aires";
const attention = (item) => item.requiereAccion === true;
const items = Object.freeze([
  Object.freeze({ id: "mov", titulo: "Hidrogrúa confirmada", detalle: "Obra K52 · Técnica · 10:00", actor: "José", tipo: "logistica", fecha: "2026-10-07T03:05:00Z", leida: false, requiereAccion: false }),
  Object.freeze({ id: "pedido", titulo: "Revisá el pedido", detalle: "Obra K52", tipo: "compras", fecha: "2026-10-06T23:00:00Z", leida: false, requiereAccion: true }),
  Object.freeze({ id: "leida", titulo: "Recepción de tubos", detalle: "Obra K51", tipo: "recepcion", fecha: "2026-10-07T03:10:00Z", leida: true, requiereAccion: true }),
]);

test("buscar combina palabras repartidas entre título, obra, detalle y actor, sin exigir tildes", () => {
  assert.deepEqual(filterNotifications(items, { search: "  hidrogrua K52 jose " }).map((item) => item.id), ["mov"]);
  assert.deepEqual(filterNotifications(items, { search: "tecnica pedido" }), []);
});

test("filtros de módulo y lectura se combinan, y leído jamás vuelve a pedir atención", () => {
  assert.deepEqual(filterNotifications(items, { type: "logistica", state: "sin-leer" }, attention).map((item) => item.id), ["mov"]);
  assert.deepEqual(filterNotifications(items, { state: "atencion" }, attention).map((item) => item.id), ["pedido"]);
  assert.deepEqual(filterNotifications(items, { type: "recepcion", state: "sin-leer" }, attention), []);
});

test("la fecha se agrupa por el día del celular, incluso a ambos lados de medianoche UTC", () => {
  assert.deepEqual(notificationDateBucket("2026-10-07T02:59:00Z", now, tz), { key: "2026-10-06", label: "Ayer" });
  assert.deepEqual(notificationDateBucket("2026-10-07T03:00:00Z", now, tz), { key: "2026-10-07", label: "Hoy" });
  assert.equal(notificationDateBucket("2026-10-08T03:00:00Z", now, tz).label, "Mañana");
});

test("atención va primero sin confundir una confirmación logística informativa", () => {
  const groups = groupNotifications(items, attention, now, tz);
  assert.deepEqual(groups.map((group) => group.key), ["atencion", "novedades", "leidas"]);
  assert.equal(groups[0].dates[0].label, "Ayer");
  assert.equal(groups[1].dates[0].items[0].id, "mov");
  assert.deepEqual(items.map((item) => item.id), ["mov", "pedido", "leida"]);
});

test("una fecha inválida no rompe el panel ni muestra Invalid Date", () => {
  assert.equal(notificationDateBucket("sin-fecha", now, tz).label, "Fecha no disponible");
  const groups = groupNotifications([...items, { id: "vieja", fecha: null, leida: true }], attention, now, tz);
  assert.equal(groups[2].dates.at(-1).key, "sin-fecha");
});
