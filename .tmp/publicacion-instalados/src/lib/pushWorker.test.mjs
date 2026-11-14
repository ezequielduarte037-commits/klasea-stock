import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function worker() {
  const handlers = new Map(), notifications = [], navigation = [], store = new Map();
  const currentClient = { url: 'https://klasea.test/', navigate: async (url) => navigation.push(url), focus: async () => { navigation.push('focus'); return currentClient; } };
  const self = { location: { origin: 'https://klasea.test' }, addEventListener: (name, listener) => handlers.set(name, listener),
    skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [currentClient], openWindow: async (url) => navigation.push(url) },
    registration: { showNotification: async (title, options) => notifications.push({ title, ...options }) } };
  const indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, createObjectStore() {}, transaction() {
        const transaction = { objectStore: () => ({
          get: (key) => query(key), put: (value, key) => query(key, value, true),
        }) };
        function query(key, value, write = false) {
          const operation = {};
          queueMicrotask(() => { if (write) store.set(key, value); operation.result = store.get(key); operation.onsuccess?.(); transaction.oncomplete?.(); });
          return operation;
        }
        return transaction;
      } };
      request.onsuccess?.();
    });
    return request;
  } };
  vm.runInNewContext(await readFile('public/klasea-push-sw.js', 'utf8'), { self, indexedDB, URL });
  const emit = async (type, options) => {
    const promises = []; handlers.get(type)({ ...options, waitUntil: (promise) => promises.push(promise) });
    await Promise.all(promises);
  };
  const bind = (userId) => emit('message', { data: { type: 'PUSH_USER', userId }, ports: [{ postMessage() {} }] });
  return { handlers, notifications, navigation, emit, bind };
}
test('push móvil muestra contenido propio y abre el movimiento con lectura sincronizable', async () => {
  const w = await worker(); await w.bind('tecnica');
  await w.emit('push', { data: { json: () => ({ title: 'Hidrogrúa confirmada', body: 'Hoy 14:00 · Chubut', userId: 'tecnica', url: '/calendario?open=1', tag: 'logistica:1', clave: 'logistica:1', fecha: '2026-10-07T12:00:00Z' }) } });
  const n = w.notifications[0];
  assert.equal(n.title, 'Hidrogrúa confirmada'); assert.equal(n.body, 'Hoy 14:00 · Chubut');
  assert.equal(new URL(n.data.url).searchParams.get('open'), '1');
  assert.equal(new URL(n.data.url).searchParams.get('_push_clave'), 'logistica:1');
  assert.equal(new URL(n.data.url).searchParams.get('_push_user'), 'tecnica');
  await w.emit('notificationclick', { notification: { data: n.data, close() {} } });
  assert.equal(w.navigation[0], 'focus'); assert.equal(w.navigation[1], n.data.url);
});
test('cambiar de cuenta o salir nunca muestra datos de la cuenta anterior', async () => {
  const w = await worker(); await w.bind('otra');
  await w.emit('push', { data: { json: () => ({ userId: 'anterior', title: 'Pedido privado', body: 'Contenido privado', url: '/compras?open=privado' }) } });
  assert.equal(w.notifications[0].title, 'Klase A');
  assert.doesNotMatch(JSON.stringify(w.notifications), /Contenido privado|Pedido privado|open=privado/);
  await w.bind(null);
  await w.emit('notificationclick', { notification: { data: { userId: 'anterior', url: 'https://otra.test/' }, close() {} } });
  assert.deepEqual(w.navigation, ['focus', 'https://klasea.test/']);
});
test('payload inválido produce fallback visible y los links externos son descartados', async () => {
  const w = await worker(); await w.bind('tecnica');
  await w.emit('push', { data: { json: () => { throw new Error('JSON roto'); } } });
  assert.equal(w.notifications[0].title, 'Klase A');
  await w.emit('push', { data: { json: () => ({ userId: 'tecnica', url: 'https://otra.test', body: 'Aviso' }) } });
  assert.equal(w.notifications[1].data.url, 'https://klasea.test/');
  assert.equal(w.handlers.has('fetch'), false);
});
