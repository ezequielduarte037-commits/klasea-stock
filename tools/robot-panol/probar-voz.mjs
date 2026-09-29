// Prueba la función robot-panol-voz sin el robot: le manda preguntas (texto o
// audio) como si fuera él, muestra qué entendió y qué contestó, y guarda la voz
// en tools/robot-panol/runtime/.
//
//   node tools/robot-panol/probar-voz.mjs                      (preguntas de ejemplo)
//   node tools/robot-panol/probar-voz.mjs --texto "¿cuánto queda de masilla poliéster?"
//   node tools/robot-panol/probar-voz.mjs --voz "¿dónde está el racor de una pulgada?"
//   node tools/robot-panol/probar-voz.mjs --audio pregunta.wav
//   node tools/robot-panol/probar-voz.mjs --escuchar           (reproduce cada respuesta)
//
// --voz arma el audio con la voz en español de Windows, para probar también
// el paso de audio a texto.
//
// Credencial: usa ROBOT_ID y ROBOT_TOKEN si están. Si no, crea un robot de
// prueba con la clave de servicio de .env.backup.local (mismo dueño y sede que
// el robot de Chubut) y lo revoca al terminar. Nunca confirma pedidos: eso
// sólo pasa con el doble toque del robot, salvo que se pase --confirmar.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const raiz = new URL("../../", import.meta.url);
const leer = (nombre) => {
  const archivo = new URL(nombre, raiz);
  if (!fs.existsSync(archivo)) return {};
  return Object.fromEntries(fs.readFileSync(archivo, "utf8").split(/\r?\n/).flatMap((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
};
const env = { ...leer(".env"), ...leer(".env.backup.local"), ...process.env };
const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICIO = env.SUPABASE_SERVICE_ROLE_KEY;
const runtime = new URL("./runtime/", import.meta.url);
fs.mkdirSync(runtime, { recursive: true });

const args = process.argv.slice(2);
const valores = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const escuchar = args.includes("--escuchar");
const preguntas = [
  ...valores("--texto").map((t) => ({ texto: t })),
  ...valores("--voz").map((t) => ({ voz: t })),
  ...valores("--audio").map((a) => ({ audio: a })),
];
if (!preguntas.length) {
  preguntas.push(
    { texto: "¿Cuánto queda de masilla poliéster?" },
    { voz: "¿Dónde está el racor de una pulgada?" },
    { texto: "Armame un pedido: dos masillas poliéster y tres lijas en seco ciento veinte" },
    { texto: "¿Qué tengo en el pedido?" },
    { texto: "Listo, mandalo" },
    { texto: "¿Qué envíos faltan recibir?" },
  );
}

async function rest(ruta, opciones = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opciones.headers || {}) },
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${ruta}: ${res.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

async function credencial() {
  if (env.ROBOT_ID && env.ROBOT_TOKEN) return { id: env.ROBOT_ID, token: env.ROBOT_TOKEN, temporal: false };
  if (!SERVICIO) throw new Error("Falta ROBOT_ID/ROBOT_TOKEN o la clave de servicio en .env.backup.local.");
  const [robot] = await rest("panol_robots?select=created_by,sede&sede=eq.Chubut&revoked_at=is.null&order=created_at.desc&limit=1");
  if (!robot) throw new Error("No hay un robot de Chubut vinculado para copiarle el dueño.");
  const token = randomBytes(32).toString("hex");
  const [nuevo] = await rest("panol_robots", {
    method: "POST",
    body: JSON.stringify({ nombre: "Prueba de voz (temporal)", sede: "Chubut", created_by: robot.created_by, token_hash: `\\x${createHash("sha256").update(token).digest("hex")}` }),
  });
  return { id: nuevo.id, token, temporal: true };
}

function wavDeVoz(frase, destino) {
  // Voz en español de Windows, a 16 kHz mono como graba el robot.
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };
    $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);
    $s.SetOutputToWaveFile($env:ROBOT_WAV, $f); $s.Speak($env:ROBOT_FRASE); $s.Dispose()`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { env: { ...process.env, ROBOT_WAV: destino, ROBOT_FRASE: frase } });
  return fs.readFileSync(destino);
}

function wavDePcm(pcm, hz = 24000) {
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0); cab.writeUInt32LE(36 + pcm.length, 4); cab.write("WAVE", 8); cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(hz, 24);
  cab.writeUInt32LE(hz * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write("data", 36); cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}

async function preguntar(cred, pregunta) {
  const headers = { Authorization: `Bearer ${ANON}`, apikey: ANON, "x-robot-id": cred.id, "x-robot-token": cred.token };
  let body;
  if (pregunta.texto || pregunta.accion) { headers["Content-Type"] = "application/json"; body = JSON.stringify(pregunta.accion ? pregunta : { texto: pregunta.texto }); }
  else {
    headers["Content-Type"] = "audio/wav";
    body = pregunta.audio ? fs.readFileSync(pregunta.audio) : wavDeVoz(pregunta.voz, path.join(new URL(runtime).pathname.replace(/^\/([A-Z]:)/, "$1"), "pregunta.wav"));
  }
  const inicio = Date.now();
  const res = await fetch(`${URL_BASE}/functions/v1/robot-panol-voz?formato=json&audio=1`, { method: "POST", headers, body });
  const cuerpo = await res.json().catch(async () => ({ error: await res.text() }));
  return { status: res.status, ms: Date.now() - inicio, ...cuerpo };
}

const cred = await credencial();
if (cred.temporal) console.log(`Robot de prueba temporal creado (se revoca al terminar).`);
let fallos = 0;

// --voces: la misma frase con varias voces, para elegir de oído (runtime/voz-*.wav).
if (args.includes("--voces")) {
  const frase = valores("--frase")[0] || "En Chubut quedan dieciocho masillas poliéster. Están en la estantería C uno, estante dos. ¿Querés que las sume al pedido?";
  const voces = [
    ["google/gemini-3.8-flash-tts", "Achird"], ["google/gemini-3.8-flash-tts", "Puck"], ["google/gemini-3.8-flash-tts", "Charon"],
    ["google/gemini-3.8-flash-tts", "Orus"], ["google/gemini-3.8-flash-tts", "Sulafat"], ["google/gemini-3.8-flash-tts", "Aoede"],
    ["google/gemini-3.8-flash-lite-tts", "Puck"],
    ["x-ai/grok-voice-tts-1.0", "rex"], ["x-ai/grok-voice-tts-1.0", "leo"], ["x-ai/grok-voice-tts-1.0", "ara"],
    ["microsoft/mai-voice-2", "es-MX-Valeria:MAI-Voice-2"],
  ];
  try {
    for (const [modelo, voz] of voces) {
      const r = await preguntar(cred, { accion: "probar_voz", texto: frase, voz, modelo });
      const nombre = `voz-${modelo.split("/")[0]}-${voz.split(":")[0]}.wav`;
      if (r.audio_pcm_24k_base64) {
        const archivo = new URL(nombre, runtime);
        const pcm = Buffer.from(r.audio_pcm_24k_base64, "base64");
        fs.writeFileSync(archivo, wavDePcm(pcm));
        // A 24 kHz la frase dura unos 8-10 s: si da el doble o la mitad, el proveedor usa otra frecuencia.
        console.log(`✓ ${modelo} · ${voz} → runtime/${nombre} (${(pcm.length / 48000).toFixed(1)} s a 24 kHz, ${(r.ms / 1000).toFixed(1)} s en generarse)`);
        if (escuchar) execFileSync("powershell.exe", ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer $env:ROBOT_WAV).PlaySync()`], { env: { ...process.env, ROBOT_WAV: archivo.pathname.replace(/^\/([A-Z]:)/, "$1") } });
      } else console.log(`✗ ${modelo} · ${voz}: ${r.error || r.voz_error || "no vino audio"}`);
    }
  } finally {
    if (cred.temporal) await rest(`panol_robots?id=eq.${cred.id}`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  }
  process.exit(0);
}

try {
  for (const [i, pregunta] of preguntas.entries()) {
    const etiqueta = pregunta.texto ? `texto: "${pregunta.texto}"` : pregunta.voz ? `voz: "${pregunta.voz}"` : `audio: ${pregunta.audio}`;
    const r = await preguntar(cred, pregunta);
    console.log(`\n${i + 1}. ${etiqueta}  →  ${r.status} en ${(r.ms / 1000).toFixed(1)} s`);
    if (r.error) { fallos++; console.log(`   ERROR: ${r.error}`); continue; }
    if (!pregunta.texto) console.log(`   oyó: "${r.oido}"`);
    for (const h of r.herramientas || []) console.log(`   · ${h.nombre}(${JSON.stringify(h.args)}) → ${JSON.stringify(h.resultado).slice(0, 220)}`);
    console.log(`   contestó: "${r.texto}"${r.confirmar ? "  [espera doble toque]" : ""}`);
    if (r.audio_pcm_24k_base64) {
      const archivo = new URL(`respuesta-${i + 1}.wav`, runtime);
      fs.writeFileSync(archivo, wavDePcm(Buffer.from(r.audio_pcm_24k_base64, "base64")));
      console.log(`   voz: ${archivo.pathname.replace(/^\/([A-Z]:)/, "$1")}`);
      if (escuchar) execFileSync("powershell.exe", ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer $env:ROBOT_WAV).PlaySync()`], { env: { ...process.env, ROBOT_WAV: archivo.pathname.replace(/^\/([A-Z]:)/, "$1") } });
    } else { console.log(`   voz: no vino audio${r.voz_error ? ` (${r.voz_error})` : ""}`); fallos++; }
    if (r.confirmar && args.includes("--confirmar")) {
      const c = await preguntar(cred, { accion: "confirmar_pedido" });
      console.log(`   confirmación: ${c.texto || c.error}`);
    }
  }
  if (!args.includes("--confirmar")) {
    // El pedido de prueba no se manda: se vacía para no dejarlo colgado.
    await preguntar(cred, { texto: "Borrá todo el pedido" }).catch(() => {});
  }
} finally {
  if (cred.temporal) {
    await rest(`panol_robots?id=eq.${cred.id}`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
    console.log("\nRobot de prueba revocado.");
  }
}
process.exitCode = fallos ? 1 : 0;
