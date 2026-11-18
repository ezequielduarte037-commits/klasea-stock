import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must } from '../tmp/jacuzzi-client.mjs';
const req = '943950cc-94fb-48a9-b83b-8ad5c30e878a';
const precios = [
  { id: '05c0ef33-2b07-48ee-8898-f6181561b357', actual_amount: 179964 },
  { id: '102f5b7e-2cd9-4bbf-928f-420b0bbe4313', actual_amount: 82698 },
  { id: '418154fe-8d19-4545-9b07-63144a0cf475', actual_amount: 39300 },
  { id: '9d7fad21-0d7b-4fd2-9fe2-edc318a292b2', actual_amount: 44660 },
  { id: 'e6d3898d-3723-4e3d-ac48-c689f8fde52b', actual_amount: 44660 },
];
const total = precios.reduce((s, p) => s + p.actual_amount, 0);
assert.equal(total, 391282);
const r = await must(admin.from('purchase_requests').select('status,actual_amount,proveedor').eq('id', req).single());
assert.equal(r.status, 'comprado'); assert.equal(r.actual_amount, null);
const sb = await asPurchaseUser();
try {
  const saved = await must(sb.rpc('purchase_request_guardar_costos', { p_request_id: req, p_items: precios, p_actual_amount: total, p_confirmar: false }));
  assert.equal(saved.request.status, 'comprado');
  assert.equal(Number(saved.request.actual_amount), total);
  if (!r.proveedor) await must(sb.from('purchase_requests').update({ proveedor: 'Flojumar' }).eq('id', req).is('proveedor', null).select('id').single());
  const v = await must(admin.from('purchase_requests').select('status,actual_amount,proveedor,itemized_costs,items:purchase_request_items(description,status,actual_amount)').eq('id', req).single());
  fs.appendFileSync('backups/anodos-5224-943950-20261117/operacion.jsonl', JSON.stringify({ precios, total, remito: 'Flojumar 0001-00010207 17/11/2026' }) + '\n');
  console.log(JSON.stringify(v, null, 1));
} finally { await sb.auth.signOut({ scope: 'local' }); }
