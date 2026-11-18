import fs from 'node:fs';
import { admin, must } from '../tmp/jacuzzi-client.mjs';
const ids = [
  ...JSON.parse(fs.readFileSync('backups/ingreso-85732-20261117/avisos-verificados.json')).map(n => n.id),
  'f98fe4e4-d7fa-4d9e-bd3f-b821eee5ebe2',
  'ea9bb2f9-cdb3-49c6-925c-34c36a734372',
  'c763f94a-0506-4f34-9cda-d546183acd42',
];
const notices = await must(admin.from('panol_envios').select('id,titulo,sede,estado,obra_id,created_by,items:panol_envio_items(*)').in('id',ids));
const items = notices.flatMap(n=>n.items);
const snapshotIds = [...new Set(items.map(i=>i.obra_snapshot_item_id).filter(Boolean))];
const [snapshots,works,events] = await Promise.all([
  must(admin.from('panol_obra_materiales_snapshot').select('*').or('id.in.('+snapshotIds.join(',')+'),panol_envio_id.in.('+ids.join(',')+')')),
  must(admin.from('produccion_obras').select('id,codigo')),
  must(admin.from('panol_envio_eventos').select('envio_id,item_id,tipo,estado_nuevo,nota,created_at').in('envio_id',ids).order('created_at',{ascending:false}).limit(35)),
]);
fs.writeFileSync('.tmp/panol-stock-20261117-live.json',JSON.stringify({notices,snapshots,works,events},null,2));
for (const n of notices) {
  console.log(n.id,n.titulo,n.estado);
  for (const i of n.items) {
    const s = snapshots.find(s=>s.id===i.obra_snapshot_item_id);
    const work = works.find(w=>w.id===(s?.obra_id||n.obra_id));
    console.log([i.id,work?.codigo||'STOCK',i.descripcion,i.estado,i.cantidad,i.cantidad_recibida,s?.estado,s?.recepcion_estado,s?.cantidad,s?.stock_sede,s?.source].join(' | '));
  }
}
console.log('EVENTOS', JSON.stringify(events.slice(0,8)));
