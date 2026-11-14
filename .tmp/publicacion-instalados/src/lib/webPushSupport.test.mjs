import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPushWorker, localNotificationUrl, pushSupport, removeLegacyWorkers, vapidKeyBytes } from './webPushSupport.js';

const browser = (extra = {}) => ({ isSecureContext: true, PushManager: {}, navigator: { userAgent: 'Android Chrome', serviceWorker: {} }, ...extra });
test('Android detecta capacidad y iPhone exige abrir la instalación de inicio', () => {
  assert.equal(pushSupport(browser()).supported, true);
  const nav = { userAgent: 'iPhone', serviceWorker: {} };
  assert.equal(pushSupport(browser({ navigator: nav })).reason, 'install');
  assert.equal(pushSupport(browser({ navigator: { ...nav, standalone: true } })).supported, true);
  assert.equal(pushSupport(browser({ navigator: { ...nav, userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 } })).reason, 'install');
});
test('HTTP y navegadores viejos dan un motivo accionable', () => {
  assert.equal(pushSupport(browser({ isSecureContext: false })).reason, 'secure');
  assert.equal(pushSupport({ ...browser(), navigator: {} }).reason, 'unsupported');
});
test('actualizar conserva solo el worker push y elimina los caches workers antiguos', async () => {
  const deleted = [];
  const make = (id, worker) => ({ ...worker, unregister: async () => deleted.push(id) });
  const modern = make('push', { active: { scriptURL: 'https://klasea.test/klasea-push-sw.js' } });
  const installing = make('new', { installing: { scriptURL: 'https://klasea.test/klasea-push-sw.js' } });
  const old = make('old', { active: { scriptURL: 'https://klasea.test/sw.js' } });
  assert.equal(isPushWorker(modern), true);
  await removeLegacyWorkers({ serviceWorker: { getRegistrations: async () => [modern, installing, old] } }, 'https://klasea.test');
  assert.deepEqual(deleted, ['old']);
});
test('la clave VAPID exige una clave P-256 completa', () => {
  const key = Buffer.from([4, ...Array(64).fill(12)]).toString('base64url');
  assert.equal(vapidKeyBytes(key).length, 65);
  assert.throws(() => vapidKeyBytes('abc'), /clave pública válida/);
});
test('links de notificaciones jamás salen del sitio y preservan el detalle', () => {
  const origin = 'https://klasea.test';
  assert.equal(localNotificationUrl('/calendario?open=hidrogrua#detalle', origin), '/calendario?open=hidrogrua#detalle');
  for (const path of ['https://otra.test/compras', '//otra.test', 'javascript:alert(1)', 'data:text/html,test']) assert.equal(localNotificationUrl(path, origin), '/');
});
