import { createClient } from '@supabase/supabase-js';
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from 'web-push';
import {
  deliverPush, notificationPayload, skipDelivery, skipStaleLogistics, validPushEndpoint,
  validateSubscription, vapidConfiguration, type MakeRequest, type VapidConfig,
} from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
class PublicError extends Error {
  constructor(message: string, readonly status = 400, readonly reason = 'invalid_request') { super(message); }
}
const admin = () => createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});
type DB = ReturnType<typeof admin>;
const makeRequest = webPush.generateRequestDetails as unknown as MakeRequest;

async function loadProfile(db: DB, userId: string) {
  // La instalación legacy no tiene profiles.activo. SELECT * sólo se usa en
  // servidor y devuelve abajo los cuatro datos operativos; no expone el perfil.
  const { data, error } = await db.from('profiles').select('*').eq('id',userId).maybeSingle();
  return { error, data: data ? { role: String(data.role || ''), activo: data.activo !== false,
    is_demo: data.is_demo === true, is_admin: data.is_admin === true } : null };
}

async function authenticate(req: Request, db: DB) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new PublicError('Iniciá sesión para configurar notificaciones.', 401, 'unauthenticated');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new PublicError('La sesión venció. Volvé a ingresar.', 401, 'unauthenticated');
  const { data: profile, error: queryError } = await loadProfile(db,data.user.id);
  if (queryError) throw queryError;
  if (!profile || profile.activo === false || profile.is_demo || profile.role === 'cliente') throw new PublicError('Esta cuenta no recibe notificaciones operativas.', 403, 'account_disabled');
  return data.user.id;
}

async function tablesConfigured(db: DB) {
  const results = await Promise.all([
    db.from('notificaciones_push_suscripciones').select('id', { head: true }).limit(1),
    db.from('notificaciones_push_outbox').select('id', { head: true }).limit(1),
    db.from('notificaciones_push_preferencias').select('user_id', { head: true }).limit(1),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error && ['42P01','PGRST205'].includes(failed.error.code)) return false;
  if (failed?.error) throw failed.error;
  return true;
}

type Outbox = {
  id: string; subscription_id: string; user_id: string; categoria: string;
  payload: Record<string, unknown>; attempts: number; lease_id: string; expires_at: string;
};
async function dispatchItem(db: DB, row: Outbox, vapid: VapidConfig) {
  const [subscriptionResult, profileResult, prefResult, readResult, logisticsResult] = await Promise.all([
    db.from('notificaciones_push_suscripciones').select('*').eq('id', row.subscription_id).maybeSingle(),
    loadProfile(db,row.user_id),
    db.from('notificaciones_push_preferencias').select('push_enabled,categorias').eq('user_id', row.user_id).maybeSingle(),
    typeof row.payload.clave === 'string'
      ? db.from('notificaciones_lecturas').select('leida_hasta').eq('user_id', row.user_id).eq('clave', row.payload.clave).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.categoria === 'logistica' && typeof row.payload.logisticaId === 'string'
      ? db.from('calendario_eventos').select('estado,logistica_notificada_at,clase,tipo').eq('id', row.payload.logisticaId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [subscriptionResult, profileResult, prefResult, readResult, logisticsResult]) if (result.error) throw result.error;
  const subscription = subscriptionResult.data;
  const skip = Date.parse(row.expires_at) <= Date.now() ? 'notice_expired'
    : skipDelivery(row, subscription, profileResult.data, prefResult.data, readResult.data?.leida_hasta || null)
      || (row.categoria === 'logistica' && row.payload.logisticaId ? skipStaleLogistics(row.payload,logisticsResult.data) : null);
  let update: Record<string, unknown>;
  if (skip) update = { status: 'skipped', last_error: skip, locked_at: null, lease_id: null };
  else {
    const payload = { ...notificationPayload(row.payload, row.id, row.user_id), urgency: row.payload.urgency };
    const result = await deliverPush({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload, vapid, makeRequest, fetch, row.attempts, Math.floor((Date.parse(row.expires_at)-Date.now())/1000));
    if (result.expired) {
      const { error } = await db.from('notificaciones_push_suscripciones').update({ enabled: false, last_error: result.reason, updated_at: new Date().toISOString() })
        .eq('id', row.subscription_id).eq('user_id', row.user_id);
      if (error) throw error;
    }
    update = result.sent ? { status: 'sent', sent_at: new Date().toISOString(), last_error: null }
      : { status: result.retryable && row.attempts < 5 ? 'pending' : 'failed', last_error: result.reason,
        available_at: new Date(Date.now()+result.retrySeconds*1000).toISOString() };
    update.locked_at = null; update.lease_id = null;
  }
  const { error } = await db.from('notificaciones_push_outbox').update(update).eq('id', row.id).eq('lease_id', row.lease_id).eq('status', 'processing');
  if (error) throw error;
  return update.status;
}

async function processQueue(db: DB, vapid: VapidConfig) {
  const { error: reminderError } = await db.rpc('notificaciones_push_recordatorios');
  if (reminderError) throw reminderError;
  const { data, error } = await db.rpc('notificaciones_push_claim', { p_limit: 20 });
  if (error) throw error;
  const rows = (data || []) as Outbox[];
  const totals: Record<string, number> = { claimed: rows.length, sent: 0, skipped: 0, pending: 0, failed: 0 };
  // Cuatro envíos en paralelo, <=40s por lote, lease de120s.
  for (let i = 0; i < rows.length; i += 4) {
    const outcomes = await Promise.allSettled(rows.slice(i, i+4).map((row) => dispatchItem(db, row, vapid)));
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') totals[String(outcome.value)]++;
      else { totals.failed++; console.error('push_delivery_storage_failed'); }
    }
  }
  return totals;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Usá POST.', reason: 'invalid_method' }, 405);
  try {
    if (Number(req.headers.get('content-length') || '0') > 16384) throw new PublicError('Solicitud demasiado grande.', 413);
    const raw = await req.text();
    if (raw.length > 16384) throw new PublicError('Solicitud demasiado grande.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw || '{}'); } catch { throw new PublicError('Solicitud inválida.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PublicError('Solicitud inválida.');
    const db = admin();
    const vapid = vapidConfiguration((key) => Deno.env.get(key));
    if (body.action === 'process') {
      const secret = Deno.env.get('PUSH_CRON_SECRET');
      if (!secret || secret.length < 32 || req.headers.get('x-push-secret') !== secret) throw new PublicError('No autorizado.', 401, 'unauthenticated');
      if (!vapid) throw new PublicError('Falta configurar Web Push en el servidor.', 503, 'vapid_not_configured');
      return json(await processQueue(db, vapid));
    }
    const userId = await authenticate(req, db);
    const configured = await tablesConfigured(db);
    if (body.action === 'config') {
      let cronReady = false;
      if (configured) {
        const { data: state, error } = await db.rpc('notificaciones_push_estado');
        if (error) throw error;
        cronReady = !!state?.cronReady && (Deno.env.get('PUSH_CRON_SECRET')?.length || 0) >= 32;
      }
      return json({ enabled: !!vapid && configured && cronReady, publicKey: vapid?.publicKey || null,
        tablesConfigured: configured, cronReady, reason: !configured ? 'migration_required' : !vapid ? 'vapid_not_configured' : !cronReady ? 'cron_not_configured' : null });
    }
    if (!configured) throw new PublicError('Falta activar la base de notificaciones. Contactá al administrador.', 503, 'migration_required');
    if (body.action === 'unsubscribe') {
      if (!validPushEndpoint(body.endpoint)) throw new PublicError('Dispositivo inválido.');
      const { error } = await db.from('notificaciones_push_suscripciones').update({ enabled: false, updated_at: new Date().toISOString() }).eq('endpoint', body.endpoint).eq('user_id', userId);
      if (error) throw error;
      return json({ enabled: false });
    }
    if (!vapid) throw new PublicError('Falta configurar Web Push en el servidor.', 503, 'vapid_not_configured');
    if (body.action === 'subscribe') {
      const subscription = validateSubscription(body.subscription);
      if (!subscription) throw new PublicError('La suscripción no es válida. Volvé a activar las notificaciones.', 400, 'invalid_subscription');
      const { data, error } = await db.from('notificaciones_push_suscripciones').upsert({
        user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
        device_label: typeof body.deviceLabel === 'string' ? body.deviceLabel.slice(0, 100) : null,
        enabled: true, last_error: null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' }).select('id').single();
      if (error) throw error;
      return json({ id: data.id, enabled: true });
    }
    if (body.action === 'test') {
      if (!validPushEndpoint(body.endpoint)) throw new PublicError('Activá este dispositivo antes de probar.', 400, 'subscription_required');
      const { data: subscription, error } = await db.from('notificaciones_push_suscripciones').select('*').eq('endpoint', body.endpoint).eq('user_id', userId).eq('enabled', true).maybeSingle();
      if (error) throw error;
      if (!subscription) throw new PublicError('Activá este dispositivo antes de probar.', 400, 'subscription_required');
      const now = new Date();
      // Compare-and-set evita varias pruebas simultáneas o spam desde otra pestaña.
      const { data: claimed, error: claimError } = await db.from('notificaciones_push_suscripciones')
        .update({ last_test_at: now.toISOString() }).eq('id', subscription.id).eq('user_id', userId)
        .or(`last_test_at.is.null,last_test_at.lt.${new Date(now.getTime()-30000).toISOString()}`).select('id').maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) throw new PublicError('Esperá 30 segundos para volver a probar.', 429, 'test_rate_limited');
      const payload = notificationPayload({ title: 'Las notificaciones están activas', body: 'Este dispositivo ya puede recibir avisos de Klase A.',
        url: '/', tag: 'klasea-push-test', categoria: 'test' }, crypto.randomUUID(), userId);
      const result = await deliverPush({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, vapid, makeRequest, fetch, 1, 300);
      if (result.expired) {
        const { error: updateError } = await db.from('notificaciones_push_suscripciones').update({ enabled: false, last_error: result.reason }).eq('id', subscription.id).eq('user_id', userId);
        if (updateError) throw updateError;
      }
      if (!result.sent) throw new PublicError(result.expired ? 'El permiso de este dispositivo venció. Desactivá y volvé a activar las notificaciones.'
        : result.reason === 'push_http_401' || result.reason === 'push_http_403' || result.reason === 'encryption_failed'
          ? 'El servidor no pudo autenticar el envío. El administrador debe revisar las claves Web Push.'
          : 'No se pudo enviar la prueba. Reintentá en unos segundos.', 502, result.reason);
      return json({ sent: true });
    }
    throw new PublicError('Acción no válida.');
  } catch (error) {
    if (error instanceof PublicError) return json({ error: error.message, reason: error.reason }, error.status);
    // Los errores de proveedor/DB jamás exponen endpoints, claves ni secretos.
    console.error('push_request_failed', (error as { code?: string })?.code || 'internal_error');
    return json({ error: 'No se pudo completar la operación. Reintentá en unos segundos.', reason: 'server_error' }, 500);
  }
});
