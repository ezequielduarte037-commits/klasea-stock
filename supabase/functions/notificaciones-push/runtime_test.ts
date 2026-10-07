// @deno-types="npm:@types/web-push@3.6.4"
import webPush from 'web-push';
import { createECDH, randomBytes } from 'node:crypto';
import { deliverPush, type MakeRequest } from './core.ts';

Deno.test('Deno genera VAPID y cifra un envío aes128gcm con web-push oficial', async () => {
  const device = createECDH('prime256v1'); device.generateKeys();
  const subscription = { endpoint: 'https://web.push.apple.com/Qtest', keys: {
    p256dh: device.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'),
  } };
  const keys = webPush.generateVAPIDKeys();
  const transport: typeof fetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get('content-encoding') !== 'aes128gcm' || !headers.get('authorization')?.startsWith('vapid t=')) {
      throw new Error('Faltan cifrado o firma');
    }
    if (!(init?.body instanceof Uint8Array) || init.body.length < 100) throw new Error('Falta payload cifrado');
    return new Response(null, { status: 201 });
  };
  const result = await deliverPush(subscription, { title: 'Hidrogrúa', notificationId: 'runtime-test' },
    { ...keys, subject: 'mailto:compras@allyachts.com.ar' }, webPush.generateRequestDetails as unknown as MakeRequest, transport);
  if (!result.sent) throw new Error(result.reason);
});
