import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admin, asPurchaseUser, must } from '../tmp/jacuzzi-client.mjs';
const gaston = 'b2bfcbbf-f6ed-491e-9095-d6d4ddadaf13';
const { notices, snapshots, works } = JSON.parse(fs.readFileSync('.tmp/panol-stock-20261117-live.json','utf8'));
const itemIds = [...new Set(notices.flatMap(n=>n.items.map(i=>i.purchase_request_item_id).filter(Boolean)))];
const orderItems = await must(admin.from('purchase_request_items').select('id,request_id,description,quantity,unit,status').in('id',itemIds));
const orderIds = [...new Set(orderItems.map(i=>i.request_id))];
const [requests, followers, user] = await Promise.all([
  must(admin.from('purchase_requests').select('id,title,status,project_id,created_by').in('id',orderIds).eq('created_by',gaston)),
  must(admin.from('request_followers').select('request_id,user_id').in('request_id',orderIds).eq('notify_whatsapp',true)),
  must(admin.from('profiles').select('username,activo').eq('id',gaston).single()),
]);
assert.equal(user.username, 'gaston.tec');
assert.equal(user.activo,true);
const bundle = [];
for (const request of requests) {
  const received = notices.flatMap(n=>n.items).filter(i=>['recibido','parcial'].includes(i.estado) && orderItems.some(o=>o.id===i.purchase_request_item_id&&o.request_id===request.id));
  if (!received.length) continue;
  const lines = received.map(i=>{
    const snapshot = snapshots.find(r=>r.id===i.obra_snapshot_item_id);
    assert.ok(snapshot && request.project_id === snapshot.obra_id);
    assert.ok(['parcial','recibido'].includes(snapshot.recepcion_estado));
    const actual = Number(i.estado==='parcial'?i.cantidad_recibida:i.cantidad);
    assert.ok(actual>0);
    return { qty:actual, desc:i.descripcion, partial:i.estado==='parcial', id:i.id, orderItemId:i.purchase_request_item_id };
  });
  const obra = works.find(w=>w.id===request.project_id)?.codigo;
  const amt = lines.reduce((sum,l)=>sum+l.qty,0);
  const qty = lines.length===1 ? amt+' unidad'+(amt===1?'':'es') : lines.map(l=>l.qty+' '+(/bastidor/i.test(l.desc)?'bastidores':/tapa/i.test(l.desc)?'tapas':'unidades')).join(' y ');
  const foot = 'Pañol Chubut. Obra '+obra+'. '
    + (request.status !== 'recibido' || lines.some(l=>l.partial) ? 'Ingreso parcial del pedido. ' : '')
    + lines.map(l=>l.qty+' × '+l.desc).join('; ')+'.';
  bundle.push({id:request.id,title:request.title,status:request.status,obra,qty,foot,lines,followers:followers.filter(f=>f.request_id===request.id&&f.user_id!==gaston)});
}
bundle.sort((a,b)=>a.obra.localeCompare(b.obra,'es',{numeric:true}) || a.title.localeCompare(b.title,'es'));
console.log(JSON.stringify(bundle.map(({id,title,status,qty,foot,followers})=>({id,title,status,qty,foot,followers:followers.length})),null,2));
fs.writeFileSync('.tmp/wa-gaston-solo-pedidos-plan.json',JSON.stringify(bundle,null,2));

if (process.argv.includes('--send')) {
  const logPath = '.tmp/wa-gaston-solo-pedidos-enviados.jsonl';
  const verifiedContact = await must(admin.from('user_phones').select('phone,verified_at').eq('user_id',gaston).single());
  assert.ok(verifiedContact.phone && verifiedContact.verified_at);
  assert.equal(bundle.length,8);
  assert.ok(bundle.every(x=>x.followers.length===0 && ['52-25','52-27'].includes(x.obra)));
  const previous = fs.existsSync(logPath)
    ? fs.readFileSync(logPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)) : [];
  const sb = await asPurchaseUser();
  try {
    for (const [index, order] of bundle.entries()) {
      if (previous.some(x=>x.requestId===order.id && x.sent===1)) continue;
      const otherFollowers = await must(admin.from('request_followers').select('user_id').eq('request_id',order.id)
        .eq('notify_whatsapp',true).neq('user_id',gaston));
      assert.equal(otherFollowers.length,0,'Hay otros destinatarios en '+order.title);
      const notes = (index===0 ? 'Corrección del resumen anterior. ' : '') + order.foot;
      assert.ok(notes.length<=200 && order.qty.length<=80);
      const { data,error } = await sb.functions.invoke('notify-wa-update',{
        body:{ requestId:order.id,eventType:'received',payload:{quantity:order.qty,notes} },
      });
      if (error) {
        const response = error.context instanceof Response ? await error.context.json().catch(()=>null) : null;
        throw Error(JSON.stringify({request:order.id,message:error.message,explanation:response?.error}));
      }
      fs.appendFileSync(logPath,JSON.stringify({requestId:order.id,title:order.title,sent:data.sent,skipped:data.skipped,errors:data.errors})+'\n');
      assert.deepEqual([data.ok,data.sent,data.errors],[true,1,0],'El bot no confirmó este aviso: '+order.title);
      console.log('Enviado al titular: '+order.title);
    }
  } finally {
    await sb.auth.signOut({scope:'local'});
  }
}
