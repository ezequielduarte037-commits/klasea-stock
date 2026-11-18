import { admin, must } from '../tmp/jacuzzi-client.mjs';
const id='c74e9c32-5088-49cc-9c25-68b8ec884c33';
const ad = await must(admin.from('panol_obra_addons').select('*').eq('id',id));
console.log('addon', JSON.stringify(ad, null, 1));
const a=ad[0];
if (a?.obra_snapshot_id) {
  const s = await must(admin.from('panol_obra_materiales_snapshot').select('*').eq('id',a.obra_snapshot_id));
  console.log('snap', JSON.stringify(s,null,1));
  const pr = s[0]?.purchase_request_id;
  if (pr) { const p = await must(admin.from('purchase_requests').select('*').eq('id',pr)); console.log('pr', JSON.stringify(p,null,1)); }
}
const it = await must(admin.from('purchase_request_items').select('*').eq('request_id','0f501afc-db20-4074-bded-040761ed149d'));
console.log('items', JSON.stringify(it,null,1));
