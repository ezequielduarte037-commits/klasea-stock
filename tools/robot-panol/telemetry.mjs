// Diagnóstico USB y audio local. No persiste ni transmite grabaciones a Internet.
export class Telemetry {
  constructor() {
    this.partial = ''; this.mic = null; this.net = null; this.diag = null;
    this.voice = null; this.http = null; this.version = null; this.history = []; this.events = [];
    this.recording = null; this.transfer = null; this.capture = null;
  }
  event(text) { this.events.push({ at: Date.now(), text }); this.events = this.events.slice(-12); }
  resetConnection() { this.partial = ''; this.transfer = null; this.version = null; }
  push(chunk) {
    this.partial += chunk.toString();
    const lines = this.partial.split('\n'); this.partial = lines.pop();
    if (this.partial.length > 8192) this.partial = '';
    for (const raw of lines) this.line(raw.trim());
  }
  line(line) {
    const at = Date.now();
    const match = line.match(/^KLASE_(MIC|NET|DIAG|VOICE|VERSION|LOCAL|HTTP) (\{.*\})$/);
    if (match) {
      let data; try { data = JSON.parse(match[2]); } catch { return; }
      const key = { MIC: 'mic', NET: 'net', DIAG: 'diag', VOICE: 'voice', VERSION: 'version', LOCAL: 'capture', HTTP: 'http' }[match[1]];
      this[key] = { ...data, at };
      if (key === 'mic') {
        this.history.push({ at, pico: data.pico, level: data.level });
        this.history = this.history.filter(p => at - p.at < 30000).slice(-320);
      }
      if (key === 'voice') this.event(data.status===200?'El robot recibió una respuesta.':'La consulta de voz falló.');
      if (key === 'http' && data.stage==='done') this.event(data.status===401?'Conexión HTTPS verificada.':'Prueba de conexión: '+data.status);
      if (key === 'capture' && data.error) this.event(data.error);
      return;
    }
    const begin = line.match(/^KLASE_WAV_INICIO (\d+)$/);
    if (begin) {
      const expected = Number(begin[1]);
      this.transfer = expected >= 44 && expected <= 256044 ? { expected, chunks: [], size: 0 } : null;
    } else if (line.startsWith('KLASE_WAV ') && this.transfer) {
      const encoded = line.slice(10);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) { this.transfer = null; return; }
      const b = Buffer.from(encoded, 'base64');
      this.transfer.size += b.length;
      if (this.transfer.size > this.transfer.expected) { this.transfer = null; return; }
      this.transfer.chunks.push(b);
    } else if (line === 'KLASE_WAV_FIN' && this.transfer) {
      const t = this.transfer; this.transfer = null;
      const wav = Buffer.concat(t.chunks);
      if (wav.length !== t.expected || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE'
        || wav.readUInt32LE(40) !== wav.length - 44 || wav.readUInt32LE(24) !== 16000) {
        this.event('La grabación llegó incompleta. Probá de nuevo.'); return;
      }
      this.recording = { id: at, wav, seconds: (wav.length - 44) / 32000 };
      this.capture = { state: 'ready', at };
      this.event('Grabación local lista para escuchar.');
    } else if (/^KLASE_.*_(READY|ERROR)$/.test(line) || line === 'KLASE_ROBOT_READY') this.event(line.replace('KLASE_', '').replaceAll('_', ' '));
  }
  snapshot() {
    const now = Date.now();
    return { mic: this.mic, net: this.net, diag: this.diag, voice: this.voice, http: this.http, version: this.version,
      history: this.history.filter(p => now - p.at < 30000), events: this.events,
      capture: this.capture, transfer: !!this.transfer,
      recording: this.recording && { id: this.recording.id, seconds: this.recording.seconds } };
  }
}
