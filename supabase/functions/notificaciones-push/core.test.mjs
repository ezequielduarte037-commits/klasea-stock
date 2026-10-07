import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubscription, validPushEndpoint, vapidConfiguration, notificationPayload, deliverPush, skipDelivery, skipStaleLogistics, timestampVersion, retryDelay } from './core.ts';

const encode = (bytes) => Buffer.from(bytes).toString('base64url');
const publicBytes = Uint8Array.from({ length: 65 }, (_, i) => i === 0 ? 4 : i);
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-token', keys: { p256dh: encode(publicBytes), auth: encode(new Uint8Array(16)) } };
const vapid = { publicKey: encode(publicBytes), privateKey: encode(new Uint8Array(32)), subject: 'mailto:compras@allyachts.com.ar' };
const makeRequest = (s) => ({ endpoint: s.endpoint, method: 'POST', headers: { TTL: 300, 'Content-Length': 3, Authorization: 'test-vapid' }, body: new Uint8Array([1,2,3]) });

test('acepta endpoints Android/Apple/Firefox/Edge y bloquea SSRF y redirecciones de URL', () => {
  for (const url of [subscription.endpoint,'https://web.push.apple.com/Qtoken','https://updates.push.services.mozilla.com/wpush/v2/token','https://wns.notify.windows.com/?token=x']) assert.equal(validPushEndpoint(url), true, url);
  for (const url of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/path','https://localhost/path','https://fcm.googleapis.com.evil.example/path','https://evilpush.apple.com/path','https://user:pass@fcm.googleapis.com/path','https://fcm.googleapis.com:8443/path','https://fcm.googleapis.com/path#secret','https://internal.local/path']) assert.equal(validPushEndpoint(url), false, url);
  assert.deepEqual(validateSubscription(subscription), subscription);
  assert.equal(validateSubscription({ ...subscription, keys: { ...subscription.keys, auth: encode(new Uint8Array(15)) } }), null);
  assert.equal(validateSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: encode(new Uint8Array(65)) } }), null);
});

test('configuración exige tres secretos válidos, nunca devuelve privado al payload', () => {
  const env = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: vapid.subject };
  assert.deepEqual(vapidConfiguration((k) => env[k]), vapid);
  assert.equal(vapidConfiguration((k) => k === 'VAPID_PRIVATE_KEY' ? undefined : env[k]), null);
  assert.equal(vapidConfiguration((k) => k === 'VAPID_SUBJECT' ? 'https://localhost/test' : env[k]), null);
  const p = notificationPayload({ title: 'Aviso', body: '<b>Hoy</b>', url: '//evil.example', clave: 'logistica:id', fecha: '2026-10-07T12:00:00Z' }, 'id', 'user');
  assert.equal(p.url, '/'); assert.equal(p.body, 'Hoy'); assert.equal(p.userId, 'user'); assert.equal(p.fecha, '2026-10-07T12:00:00Z');
  assert.equal('privateKey' in p, false);
});

test('prueba enviada significa 2xx aceptado, transporte cifrado y redirect error', async () => {
  let options;
  const result = await deliverPush(subscription, { notificationId: 'a-b', title: 'Hidrogrúa', urgency: 'high' }, vapid,
    (s, p, o) => { options = o; assert.equal(JSON.parse(p).title, 'Hidrogrúa'); return makeRequest(s); },
    async (url, init) => { assert.equal(url, subscription.endpoint); assert.equal(init.redirect, 'error'); assert.equal(init.headers.get('content-length'), null); assert.deepEqual([...init.body],[1,2,3]); return new Response(null, { status: 201 }); });
  assert.equal(result.sent, true); assert.equal(options.contentEncoding, 'aes128gcm'); assert.equal(options.urgency, 'high');
});

test('410/404 expiran el dispositivo; 429/5xx/red reintentan; 401 explica configuración', async () => {
  for (const status of [404,410]) {
    const r = await deliverPush(subscription, {}, vapid, makeRequest, async () => new Response(null, { status }));
    assert.equal(r.sent,false); assert.equal(r.expired,true); assert.equal(r.retryable,false);
  }
  for (const status of [429,500,503]) {
    const r = await deliverPush(subscription, {}, vapid, makeRequest, async () => new Response(null, { status, headers: { 'retry-after': '120' } }));
    assert.equal(r.retryable,true); assert.equal(r.retrySeconds,120);
  }
  const unauthorized = await deliverPush(subscription, {}, vapid, makeRequest, async () => new Response(null, { status: 401 }));
  assert.equal(unauthorized.reason,'push_http_401'); assert.equal(unauthorized.retryable,false);
  const offline = await deliverPush(subscription, {}, vapid, makeRequest, async () => { throw new Error('network'); },3);
  assert.equal(offline.retrySeconds,120); assert.equal(offline.retryable,true);
  assert.equal(retryDelay(5,'999999'),3600);
});

test('no entrega avisos de cuenta anterior, perfiles de baja, preferencias ni ya leídos; recordatorios sí', () => {
  const row = { user_id:'a', categoria:'logistica', payload:{ fecha:'2026-10-07T12:00:00Z' } };
  const sub = { user_id:'a',enabled:true }; const profile={ activo:true,role:'tecnica' };
  assert.equal(skipDelivery(row, { ...sub,user_id:'b' },profile,null,null),'account_changed');
  assert.equal(skipDelivery(row,sub,{ ...profile,activo:false },null,null),'user_inactive');
  assert.equal(skipDelivery(row,sub,{ ...profile,is_demo:true },null,null),'user_inactive');
  assert.equal(skipDelivery(row,sub,{ ...profile,role:'panol' },null,null),'audience_changed');
  assert.equal(skipDelivery(row,sub,{ role:'tecnica',is_demo:false },null,null),null);
  assert.equal(skipDelivery(row,sub,profile,{ push_enabled:true,categorias:['compras'] },null),'preference_disabled');
  assert.equal(skipDelivery(row,sub,profile,null,'2026-10-07T13:00:00Z'),'already_read');
  assert.equal(skipDelivery({ ...row,payload:{ ...row.payload,recordatorio:true } },sub,profile,null,'2026-10-07T13:00:00Z'),null);
});

test('precisión de microsegundos: leído anterior dentro del mismo milisegundo no silencia la nueva versión', () => {
  const older='2026-10-07T12:00:00.000001Z', newer='2026-10-07T12:00:00.000999Z';
  assert.ok(timestampVersion(older)<timestampVersion(newer));
  assert.equal(timestampVersion(newer),timestampVersion('2026-10-07T09:00:00.000999-03:00'));
  const row={ user_id:'a',categoria:'logistica',payload:{ fecha:newer } };
  assert.equal(skipDelivery(row,{user_id:'a',enabled:true},{activo:true,role:'tecnica'},null,older),null);
  assert.equal(notificationPayload({fecha:newer},'id','a').fecha,newer);
});

test('no despacha confirmaciones o recordatorios reemplazados/cancelados; DELETE explícito sí sin link roto', () => {
  const payload={ fecha:'2026-10-07T12:00:00.000001Z' };
  assert.equal(skipStaleLogistics(payload,{estado:'confirmado',logistica_notificada_at:'2026-10-07T12:00:00.000999Z'}),'superseded');
  assert.equal(skipStaleLogistics(payload,null),'source_deleted');
  assert.equal(skipStaleLogistics({...payload,recordatorio:true},{estado:'cancelado',logistica_notificada_at:payload.fecha}),'movement_not_confirmed');
  assert.equal(skipStaleLogistics(payload,{estado:'confirmado',logistica_notificada_at:payload.fecha,clase:'evento',tipo:'feriado'}),'source_no_longer_operational');
  assert.equal(skipStaleLogistics({logisticaEliminada:true,fecha:null},null),null);
});
