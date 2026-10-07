/** Reglas puras y envío inyectable para probar sin servicios ni credenciales. */
export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export type PushResult = { sent: boolean; expired: boolean; retryable: boolean; reason: string; retrySeconds: number };
type PushPayload = Record<string, unknown>;
type RequestDetails = { endpoint: string; method: string; headers: Record<string, unknown>; body: Uint8Array };
export type MakeRequest = (subscription: Subscription, payload: string, options: Record<string, unknown>) => RequestDetails;

function base64Bytes(value: unknown, size: number): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length > 100) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return bytes.length === size ? bytes : null;
  } catch { return null; }
}

/** Un endpoint escrito por el cliente nunca puede apuntar a red interna. */
export function validPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || (url.pathname === '/' && !url.search)) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com')
      || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com');
  } catch { return false; }
}

export function validateSubscription(value: unknown): Subscription | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<Subscription>;
  if (!validPushEndpoint(s.endpoint)) return null;
  const publicKey = base64Bytes(s.keys?.p256dh, 65);
  if (publicKey?.[0] !== 4 || !base64Bytes(s.keys?.auth, 16)) return null;
  return { endpoint: s.endpoint!, keys: { p256dh: s.keys!.p256dh, auth: s.keys!.auth } };
}

export function vapidConfiguration(env: (key: string) => string | undefined): VapidConfig | null {
  const publicKey = env('VAPID_PUBLIC_KEY')?.trim() || '';
  const privateKey = env('VAPID_PRIVATE_KEY')?.trim() || '';
  const subject = env('VAPID_SUBJECT')?.trim() || '';
  if (base64Bytes(publicKey, 65)?.[0] !== 4 || !base64Bytes(privateKey, 32)) return null;
  try {
    const url = new URL(subject);
    if (url.protocol === 'mailto:') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)) return null;
    } else if (url.protocol !== 'https:' || url.hostname === 'localhost' || !url.hostname.includes('.')) return null;
  } catch { return null; }
  return { publicKey, privateKey, subject };
}

export function notificationPayload(raw: PushPayload, id: string, userId: string): PushPayload {
  const path = typeof raw.url === 'string' && raw.url.startsWith('/') && !raw.url.startsWith('//') ? raw.url : '/';
  return {
    title: String(raw.title || 'Klase A').slice(0, 100),
    body: String(raw.body || '').replace(/<[^>]+>/g, '').slice(0, 240),
    url: path,
    tag: String(raw.tag || id).slice(0, 200),
    notificationId: id,
    userId,
    categoria: String(raw.categoria || 'logistica'),
    clave: typeof raw.clave === 'string' ? raw.clave.slice(0, 200) : null,
    // Postgres conserva microsegundos; no truncar la versión a Date/3 decimales.
    fecha: typeof raw.fecha === 'string' && Number.isFinite(Date.parse(raw.fecha)) ? raw.fecha : null,
  };
}

export function retryDelay(attempt: number, retryAfter: string | null, now = Date.now()): number {
  const seconds = Number(retryAfter);
  const requested = retryAfter && Number.isFinite(seconds) ? seconds : retryAfter ? (Date.parse(retryAfter) - now) / 1000 : 0;
  return Math.min(3600, Math.max(30, 30 * 2 ** Math.min(Math.max(attempt - 1, 0), 6), Number.isFinite(requested) ? requested : 0));
}

export function timestampVersion(value: unknown): bigint | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  const fractional = value.match(/T\d{2}:\d{2}:\d{2}\.(\d+)/)?.[1] || '';
  return BigInt(Date.parse(value))*1000n+BigInt(fractional.padEnd(6,'0').slice(3,6) || '0');
}

export function skipStaleLogistics(payload: PushPayload, current: { estado: string; logistica_notificada_at: string | null; clase?: string; tipo?: string } | null): string | null {
  if (payload.logisticaEliminada === true) return null;
  if (!current) return 'source_deleted';
  if (current.clase && current.clase !== 'solicitud_logistica'
    && !(current.clase === 'evento' && ['desmolde','traslado','botadura','entrega','entrega_material'].includes(current.tipo || ''))) return 'source_no_longer_operational';
  if (payload.recordatorio === true && current.estado !== 'confirmado') return 'movement_not_confirmed';
  const expected = timestampVersion(payload.fecha), actual = timestampVersion(current.logistica_notificada_at);
  if (expected !== null && actual !== null && expected !== actual) return 'superseded';
  return null;
}

/** web-push genera VAPID y cifra aes128gcm; fetch usa el transporte Deno nativo. */
export async function deliverPush(
  subscription: Subscription,
  payload: PushPayload,
  vapid: VapidConfig,
  makeRequest: MakeRequest,
  send: typeof fetch = fetch,
  attempt = 1,
  ttlSeconds = 3600,
): Promise<PushResult> {
  if (!validateSubscription(subscription)) return { sent: false, expired: true, retryable: false, reason: 'invalid_subscription', retrySeconds: 0 };
  let details: RequestDetails;
  try {
    details = makeRequest(subscription, JSON.stringify(payload), {
      vapidDetails: vapid, contentEncoding: 'aes128gcm',
      TTL: Math.max(1, Math.min(86400, ttlSeconds)),
      urgency: payload.urgency === 'high' ? 'high' : 'normal',
      // Una entrega incierta se reintenta con el mismo topic y tag, coalesciendo
      // duplicados en proveedor y sistema operativo. HTTP+DB no es exactamente una vez.
      topic: String(payload.notificationId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || undefined,
    });
  } catch {
    return { sent: false, expired: false, retryable: false, reason: 'encryption_failed', retrySeconds: 0 };
  }
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(details.headers)) if (key.toLowerCase() !== 'content-length') headers.set(key, String(value));
    const response = await send(details.endpoint, {
      method: 'POST', headers, body: new Uint8Array(details.body) as BodyInit,
      redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    // No almacenar bodies del proveedor: pueden contener claves/endpoints.
    await response.body?.cancel();
    if (response.ok) return { sent: true, expired: false, retryable: false, reason: 'accepted', retrySeconds: 0 };
    const expired = response.status === 404 || response.status === 410;
    const retryable = response.status === 429 || response.status >= 500 || response.status === 408;
    return { sent: false, expired, retryable, reason: `push_http_${response.status}`, retrySeconds: retryDelay(attempt, response.headers.get('retry-after')) };
  } catch {
    return { sent: false, expired: false, retryable: true, reason: 'push_unreachable', retrySeconds: retryDelay(attempt, null) };
  }
}

export function skipDelivery(
  row: { user_id: string; categoria: string; payload: PushPayload },
  subscription: { user_id: string; enabled: boolean } | null,
  profile: { activo?: boolean; role: string; is_demo?: boolean; is_admin?: boolean } | null,
  preferences: { push_enabled: boolean; categorias: string[] } | null,
  readUntil: string | null,
): string | null {
  if (!subscription?.enabled) return 'subscription_disabled';
  if (subscription.user_id !== row.user_id) return 'account_changed';
  if (!profile || profile.activo === false || profile.is_demo || profile.role === 'cliente') return 'user_inactive';
  if (row.categoria === 'logistica' && !profile.is_admin && !['admin','compras','tecnica','administracion'].includes(profile.role)) return 'audience_changed';
  if (row.categoria === 'panol' && profile.role !== 'panol') return 'audience_changed';
  if (preferences?.push_enabled === false || (preferences && !preferences.categorias.includes(row.categoria))) return 'preference_disabled';
  const readVersion = timestampVersion(readUntil), eventVersion = timestampVersion(row.payload.fecha);
  if (row.payload.recordatorio !== true && readVersion !== null && eventVersion !== null && readVersion >= eventVersion) return 'already_read';
  return null;
}
