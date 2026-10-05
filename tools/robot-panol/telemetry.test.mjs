import test from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry } from './telemetry.mjs';
function sampleWav() {
  const b=Buffer.alloc(364); b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;
}
test('rearma JSON partido por el puerto y conserva los textos como datos',()=>{
  const t=new Telemetry();t.push('KLASE_MI');t.push('C {"pico":1200,"level":2,"dc":1450}\r\nKLASE_VOICE {"texto":"<script>hola</script>"}\n');
  assert.equal(t.mic.pico,1200);assert.equal(t.history.length,1);assert.equal(t.voice.texto,'<script>hola</script>');
  t.push('KLASE_NET {roto}\n');assert.equal(t.net,null);
});
test('recibe un WAV local completo aunque los fragmentos USB tengan cualquier tamaño',()=>{
  const wav=sampleWav(),t=new Telemetry();
  const serial=`KLASE_WAV_INICIO ${wav.length}\nKLASE_WAV ${wav.toString('base64')}\nKLASE_WAV_FIN\n`;
  for(let i=0;i<serial.length;i+=17)t.push(serial.slice(i,i+17));
  assert.deepEqual(t.recording.wav,wav);assert.equal(t.snapshot().recording.seconds,.01);
  assert.equal(t.snapshot().capture.state,'ready');assert.equal(t.snapshot().recording.wav,undefined);
});
test('rechaza WAV incompleto, excesivo o con cabecera inválida',()=>{
  for(const kind of ['short','large','header']){
    const t=new Telemetry(),wav=sampleWav();if(kind==='header')wav.write('NOPE');
    const size=kind==='short'?wav.length+2:kind==='large'?99999999:wav.length;
    t.push(`KLASE_WAV_INICIO ${size}\nKLASE_WAV ${wav.toString('base64')}\nKLASE_WAV_FIN\n`);
    assert.equal(t.recording,null);
  }
});
test('acota el historial y descarta fragmentos de una conexión anterior',()=>{
  const t=new Telemetry();for(let i=0;i<400;i++)t.push('KLASE_MIC {"pico":1}\n');
  assert.equal(t.history.length,320);t.push('KLASE_NET {');t.resetConnection();t.push('"wifi":3}\n');assert.equal(t.net,null);
});
test('distingue fallo de voz y conexión HTTPS sin afirmar una respuesta exitosa',()=>{
  const t=new Telemetry();t.push('KLASE_VOICE {"status":-11,"texto":"Servidor sin respuesta"}\n');
  assert.equal(t.events.at(-1).text,'La consulta de voz falló.');
  t.push('KLASE_HTTP {"stage":"done","status":401,"ms":150}\n');
  assert.equal(t.snapshot().http.status,401);assert.equal(t.events.at(-1).text,'Conexión HTTPS verificada.');
});
