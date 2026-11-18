import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must } from '../tmp/jacuzzi-client.mjs';

const requestId = 'ce2c856c-dba0-42f4-9bc2-9c8ee5f2f62a';
const recipientId = 'b2bfcbbf-f6ed-491e-9095-d6d4ddadaf13';
const journal = '.tmp/panol-recibidos-gaston-bot-confirmado.json';
const { notices, snapshots, works } = JSON.parse(fs.readFileSync('.tmp/panol-stock-20261117-live.json'));
const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
const workMap = new Map(works.map(w => [w.id, w.codigo]));
const categories = new Map();
const shortNames = new Map([
  ['Bomba de achique Rule 2000 GPH 12 V', 'bomba de achique Rule 2000 GPH'],
  ['Bomba de achique Rule 3700 GPH 12 V', 'bomba de achique Rule 3700 GPH'],
  ['Bomba de agua Jabsco PAR-MAX3 12 V · 3 GPM · 40 PSI', 'bomba Jabsco PAR-MAX3'],
  ['Base de antena inoxidable Shakespeare 4187', 'base inox Shakespeare 4187'],
  ['Flotante Rule-A-Matic 35A · 14 A', 'flotante Rule 35A'],
  ['Caja drenaje ducha 800GPH · Rule', 'caja de drenaje Rule 800 GPH'],
  ['Filtro de agua Medium inoxidable 3/4" con soporte plástico', 'filtro inox ¾″ con soporte'],
]);

for (const n of notices) {
  assert.equal(n.sede, 'Chubut');
  for (const item of n.items) {
    if (!['recibido','parcial'].includes(item.estado)) continue;
    const snapshot = snapshotMap.get(item.obra_snapshot_item_id);
    assert.ok(snapshot, 'El renglón recibido no tiene movimiento: ' + item.id);
    const work = workMap.get(snapshot.obra_id ?? n.obra_id);
    const supplier = n.titulo.startsWith('Casa Iriarte') ? 'Casa Iriarte'
      : n.titulo.startsWith('Canal Electric') ? 'Canal Electric' : 'Trimer';
    const category = work || 'stock:' + supplier;
    const planned = Number(String(item.cantidad).replace(',','.'));
    // En recepciones completas se usa el total del renglón. Tras un parcial,
    // el campo cantidad_recibida puede conservar la cifra de aquel parcial.
    const qty = item.estado === 'parcial'
      ? Number(String(item.cantidad_recibida).replace(',','.')) : planned;
    assert.ok(qty > 0 && planned >= qty, 'Cantidad de recepción inválida para ' + item.id);
    const name = shortNames.get(item.descripcion) || item.descripcion;
    const itemText = (item.estado === 'parcial' ? qty + ' de ' + planned : qty) + ' × ' + name;
    const group = categories.get(category) || [];
    group.push(itemText);
    categories.set(category, group);
  }
}
for (const category of ['52-25','52-27','stock:Trimer','stock:Canal Electric','stock:Casa Iriarte']) {
  assert.ok(categories.has(category), 'Falta el destino esperado: ' + category);
}
const listOrder = keys => keys.sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const cat = key => categories.get(key).join(', ');
const notes = [
  'Hola Gastón, te paso lo que recibió Pañol Chubut el 17/11.',
  '',
  '*52-25:* ' + cat('52-25') + '.',
  '*52-27:* ' + cat('52-27') + '.',
  '',
  '*Otras obras*',
  ...listOrder([...categories.keys()].filter(key=>!['52-25','52-27'].includes(key) && !key.startsWith('stock:')))
    .map(key=>'• ' + key + ': ' + cat(key) + '.'),
  '',
  '*Stock general Chubut*',
  ...['Trimer','Canal Electric','Casa Iriarte'].map(provider=>'• ' + provider + ': ' + cat('stock:'+provider) + '.'),
];
const text = notes.join('\n');
assert.ok(text.length <= 4096);
const [request, user, phone] = await Promise.all([
  must(admin.from('purchase_requests').select('created_by,title').eq('id',requestId).single()),
  must(admin.from('profiles').select('username,activo').eq('id',recipientId).single()),
  must(admin.from('user_phones').select('verified_at').eq('user_id',recipientId).single()),
]);
assert.equal(request.created_by,recipientId);
assert.equal(user.username,'gaston.tec');
assert.equal(user.activo,true);
assert.ok(phone.verified_at);
if (!process.argv.includes('--send')) {
  console.log(text);
} else {
  assert.ok(!fs.existsSync(journal), 'Este resumen ya fue enviado.');
  const sb = await asPurchaseUser();
  try {
    const { data, error } = await sb.functions.invoke('notify-wa-update', {
      body: { requestId, eventType: 'received_summary', payload: { recipientId, text } },
    });
    if (error) {
      const context = error.context instanceof Response ? await error.context.json().catch(()=>null) : null;
      throw Error(JSON.stringify({ message:error.message, status:error.context?.status, explanation:context?.error }));
    }
    assert.equal(data.ok,true);
    assert.equal(data.sent,1);
    assert.match(data.messageId,/^wamid\./);
    fs.writeFileSync(journal,JSON.stringify({ time:new Date().toISOString(), requestId, recipientId, text, messageId:data.messageId },null,2),{flag:'wx'});
    console.log('WhatsApp aceptó el resumen del bot para gaston.tec.');
  } finally {
    await sb.auth.signOut({scope:'local'});
  }
}
