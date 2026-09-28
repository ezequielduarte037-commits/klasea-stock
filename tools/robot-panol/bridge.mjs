import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { makeFeed, canonicalSede } from './feed.mjs';

const root = new URL('../../', import.meta.url);
const env = {};
for (const name of ['.env', '.env.local']) {
  try {
    for (const line of (await readFile(new URL(name, root), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw Error('Falta configuracion publica de Supabase.');
const secret = randomBytes(32).toString('hex');
const browserSecret = randomBytes(24).toString('hex');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
let profile = null, serial = null, serialReady = false, refreshing = false;
let generation = 0;
let lastAck = 0;
let shuttingDown = false;
let cloudPaired = false;
let cloudReady = false;
async function probeCloud() {
  if (cloudReady) return;
  const publicClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await publicClient.rpc('panol_robot_feed',
    { p_id: '00000000-0000-0000-0000-000000000000', p_token: '', p_offset: 0 });
  cloudReady = error?.code === '42501';
}
let feed = { type: 'feed', status: 'login', total: 0, urgent: 0, notices: [] };
let attempts = [];
const sameSecret = (a, b) => typeof a === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isLoopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function sendSerial(data) { if (serialReady && serial?.stdin.writable) serial.stdin.write(JSON.stringify(data) + '\n'); }
function startSerial() {
  serialReady = false;
  serial = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    fileURLToPath(new URL('serial.ps1', import.meta.url)), '-Port', process.env.ROBOT_PORT || 'COM5'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  serial.stdout.on('data', data => {
    if (data.toString().includes('SERIAL_READY')) { serialReady = true; sendSerial(feed); }
    if (data.toString().includes('KLASE_FEED_OK')) lastAck = Date.now();
  });
  serial.stderr.on('data', () => {});
  serial.on('error', () => { serialReady = false; });
  serial.on('exit', () => { serialReady = false; if (!shuttingDown) setTimeout(startSerial, 5000); });
}
async function refresh() {
  if (!profile || refreshing) return;
  refreshing = true;
  const ownGeneration = generation;
  const ownProfile = profile;
  try {
    let query = supabase.from('panol_envios').select(
      'id,titulo,sede,destino,estado,prioridad,created_at,obra:produccion_obras(codigo),items:panol_envio_items(descripcion,estado,obra_snapshot_item_id)')
      .in('estado', ['enviado', 'en_preparacion', 'parcial']).order('created_at', { ascending: false }).limit(1000);
    const sede = 'Chubut';
    query = query.eq('sede', sede);
    const { data, error } = await query;
    if (error) throw error;
    // No adivinar la obra de un aviso que reparte sus productos entre varios barcos.
    const ids = [...new Set(data.flatMap(r => r.items || []).map(i => i.obra_snapshot_item_id).filter(Boolean))];
    const obras = new Map();
    for (let n = 0; n < ids.length; n += 100) {
      const { data: snaps, error: snapError } = await supabase.from('panol_obra_materiales_snapshot')
        .select('id,obra:produccion_obras!panol_obra_materiales_snapshot_obra_id_fkey(codigo)').in('id', ids.slice(n, n + 100));
      if (snapError) throw snapError;
      for (const s of snaps || []) if (s.obra?.codigo) obras.set(s.id, s.obra.codigo);
    }
    if (ownGeneration !== generation) return;
    feed = makeFeed(data, { ...ownProfile, sede }, obras);
    if (data.length === 1000) feed.status = 'limit';
  } catch {
    // Una consulta fallida no significa que no haya pendientes.
    if (ownGeneration === generation) feed = { type: 'feed', status: 'error', total: 0, urgent: 0, notices: [] };
  } finally { refreshing = false; sendSerial(feed); }
}
async function body(req) {
  let raw = '';
  for await (const part of req) { raw += part; if (raw.length > 16384) throw Error('Formulario demasiado grande'); }
  return JSON.parse(raw || '{}');
}
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/device' && req.method === 'GET') {
      if (!sameSecret(req.headers.authorization, `Bearer ${secret}`)) return json(res, 401, { error: 'No autorizado' });
      return json(res, 200, feed);
    }
    if (!isLoopback(req)) return json(res, 403, { error: 'Configuracion solo desde esta PC' });
    if (!['127.0.0.1:4188','localhost:4188','[::1]:4188'].includes(req.headers.host)) return json(res, 403, { error: 'Direccion local requerida' });
    if (req.method === 'GET' && req.url === '/') {
      const html = (await readFile(new URL('panel.html', import.meta.url), 'utf8')).replace('__BROWSER_SECRET__', browserSecret);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(html);
    }
    if (!sameSecret(req.headers['x-robot-session'], browserSecret)) return json(res, 403, { error: 'Sesion del panel requerida' });
    if (req.url === '/shutdown' && req.method === 'POST') {
      shuttingDown = true;
      json(res, 200, { ok: true });
      serial?.stdin.end();
      server.close();
      setTimeout(() => { serial?.kill(); process.exit(0); }, 1200);
      return;
    }
    if (req.url === '/status' && req.method === 'GET') return json(res, 200,
      { serial: serialReady, lastAck, cloudPaired, cloudReady, sede: 'Chubut', user: profile?.username || (profile ? 'Conectado' : null), feed,
        addresses: Object.values(networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:4188/device`) });
    if (req.url === '/login' && req.method === 'POST') {
      attempts = attempts.filter(t => Date.now() - t < 60000);
      if (attempts.length >= 5) return json(res, 429, { error: 'Espera un minuto antes de intentar de nuevo' });
      attempts.push(Date.now());
      const { email, password } = await body(req);
      generation++; profile = null;
      feed = { type: 'feed', status: 'login', total: 0, urgent: 0, notices: [] }; sendSerial(feed);
      await supabase.auth.signOut();
      const identity = String(email || '').trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({ email: identity.includes('@') ? identity : `${identity}@klasea.local`, password });
      if (error) return json(res, 401, { error: 'No se pudo iniciar sesion. Revisa tus datos.' });
      const result = await supabase.from('profiles').select('id,username,role,sede').eq('id', data.user.id).single();
      if (result.error) { await supabase.auth.signOut(); return json(res, 403, { error: 'No se pudo cargar el perfil' }); }
      profile = result.data;
      await refresh();
      return json(res, 200, { ok: true });
    }
    if (req.url === '/wifi' && req.method === 'POST') {
      if (!serialReady) return json(res, 409, { error: 'Conecta el robot por USB para configurar Wi-Fi' });
      const { ssid, password } = await body(req);
      if (!ssid || String(ssid).length > 32) return json(res, 400, { error: 'Revisa el nombre de red' });
      // Configuracion definitiva: sin direccion de PC ni token del puente local.
      sendSerial({ type: 'wifi', ssid, password: password || '', url: '', token: '' });
      return json(res, 200, { ok: true });
    }
    if (req.url === '/pair' && req.method === 'POST') {
      if (!cloudReady) return json(res, 409, { error: 'Falta habilitar la integracion del robot en Supabase.' });
      if (!profile || !serialReady) return json(res, 409, { error: 'Inicia sesion y conecta el robot por USB' });
      if (cloudPaired) return json(res, 200, { ok: true, sede: 'Chubut' });
      const { data, error } = await supabase.rpc('panol_robot_vincular', { p_sede: 'Chubut', p_nombre: 'Robot panol Chubut' });
      if (error) return json(res, 409, { error: error.code === 'PGRST202'
        ? 'Falta habilitar la integracion del robot en Supabase. No se vinculo el dispositivo.'
        : 'No se pudo vincular. La cuenta necesita permiso de recepcion en Chubut.' });
      sendSerial({ type: 'cloud', id: data.id, token: data.token,
        url: `${env.VITE_SUPABASE_URL}/rest/v1/rpc/panol_robot_feed`, apikey: env.VITE_SUPABASE_ANON_KEY });
      cloudPaired = true;
      return json(res, 200, { ok: true, sede: 'Chubut' });
    }
    if (req.url === '/logout' && req.method === 'POST') {
      generation++; profile = null; await supabase.auth.signOut();
      feed = { type: 'feed', status: 'login', total: 0, urgent: 0, notices: [] }; sendSerial(feed);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Ruta inexistente' });
  } catch { return json(res, 400, { error: 'No se pudo completar la operacion' }); }
});
server.listen(4188, '0.0.0.0', () => console.log('Robot Klase: http://127.0.0.1:4188'));
startSerial();
probeCloud().catch(() => {});
setInterval(() => probeCloud().catch(() => {}), 30000);
setInterval(refresh, 15000);
process.on('SIGINT', () => { serial?.kill(); server.close(); process.exit(0); });
