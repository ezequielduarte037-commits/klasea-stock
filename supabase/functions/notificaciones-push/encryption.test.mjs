// npm install --prefix tmp/notificaciones-push-test --no-save --ignore-scripts web-push@3.6.7
import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import webPush from '../../../tmp/notificaciones-push-test/node_modules/web-push/src/index.js';
import ece from '../../../tmp/notificaciones-push-test/node_modules/http_ece/ece.js';
import { deliverPush, notificationPayload } from './core.ts';

test('cifrado Web Push real se descifra con la clave del dispositivo y firma VAPID válida', async () => {
  const receiver = createECDH('prime256v1'); receiver.generateKeys();
  const auth = randomBytes(16);
  const subscription = { endpoint: 'https://web.push.apple.com/Qdevice-token', keys: {
    p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url'),
  } };
  const vapid = { ...webPush.generateVAPIDKeys(), subject: 'mailto:compras@allyachts.com.ar' };
  const payload = notificationPayload({ title: 'Hidrogrúa confirmada', body: 'Hoy 14:00 · K55', url: '/calendario?open=evento',
    tag: 'logistica:evento', clave: 'logistica:evento', fecha: '2026-10-07T12:00:00Z' }, 'notification-123', 'tecnico');
  const result = await deliverPush(subscription, payload, vapid, webPush.generateRequestDetails, async (url, init) => {
    assert.equal(url, subscription.endpoint);
    assert.equal(init.headers.get('content-encoding'), 'aes128gcm');
    const ciphertext = Buffer.from(init.body);
    assert.equal(ciphertext.includes(Buffer.from('Hidrogrúa')), false);
    const plain = ece.decrypt(ciphertext, { version: 'aes128gcm', privateKey: receiver, authSecret: auth });
    assert.deepEqual(JSON.parse(plain.toString()), payload);
    const authorization = init.headers.get('authorization');
    const match = authorization.match(/^vapid t=(.+), k=(.+)$/); assert.ok(match);
    assert.equal(match[2], vapid.publicKey);
    const [header,claims,signature] = match[1].split('.');
    const data = JSON.parse(Buffer.from(claims,'base64url').toString());
    assert.equal(data.aud, 'https://web.push.apple.com'); assert.equal(data.sub, vapid.subject);
    assert.ok(data.exp > Date.now()/1000 && data.exp <= Date.now()/1000+24*3600);
    const keyBytes = Buffer.from(vapid.publicKey,'base64url');
    const publicKey = createPublicKey({ key: { kty:'EC',crv:'P-256',x:keyBytes.subarray(1,33).toString('base64url'),y:keyBytes.subarray(33,65).toString('base64url') },format:'jwk' });
    assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), { key:publicKey,dsaEncoding:'ieee-p1363' }, Buffer.from(signature,'base64url')),true);
    return new Response(null,{ status:201 });
  });
  assert.equal(result.sent, true);
});
