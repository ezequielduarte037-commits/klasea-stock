import fs from 'node:fs';
import {admin,must} from '../tmp/jacuzzi-client.mjs';
const keys = ['palma_pata','eje','eje_k55','escape_brida','bocina_tubo','bulones_manchon','limera_brida','limera_cano','limera_timon','pata_gallo','pata_gallo_conjunto','pata_conjunto','nucleo_pata','cachas_pata'];
const obras=await must(admin.from('produccion_obras').select('id,codigo,estado').in('codigo',['52-27','52-28','55-6']));
const procs=await must(admin.from('torneria_procesos').select('*').in('obra_id',obras.map(o=>o.id)));
const [items,ops]=await Promise.all([
  must(admin.from('torneria_items').select('*,material:panol_materiales(id,descripcion,unidad_medida,es_requisito),materiales:torneria_item_materiales(*)').in('proceso_id',procs.map(p=>p.id))),
  must(admin.from('torneria_operaciones').select('*').in('proceso_id',procs.map(p=>p.id))),
]);
const [components,moves,receipts]=await Promise.all([
  must(admin.from('torneria_operacion_items').select('*').in('operacion_id',ops.map(o=>o.id))),
  must(admin.from('torneria_movimientos').select('*').in('operacion_id',ops.map(o=>o.id))),
  must(admin.from('torneria_recepciones_panol').select('*').in('item_id',items.map(i=>i.id))),
]);
const moveItems=moves.length?await must(admin.from('torneria_movimiento_items').select('*').in('movimiento_id',moves.map(m=>m.id))):[];
const requestItems=[...new Set(items.map(i=>i.purchase_request_item_id).filter(Boolean))];
const materials=[...new Set(items.flatMap(i=>[i.material_id,...i.materiales.map(a=>a.material_id)].filter(Boolean)))];
const ledger=await must(admin.from('panol_obra_materiales_snapshot').select('*')
  .or('and(obra_id.in.('+obras.map(o=>o.id).join(',')+'),material_id.in.('+materials.join(',')+')),purchase_request_item_id.in.('+requestItems.join(',')+')'));
const inboxIds=[...new Set(ledger.map(l=>l.panol_envio_item_id).filter(Boolean))];
const [purchases,panolItems]=await Promise.all([
  requestItems.length?must(admin.from('purchase_request_items').select('*').in('id',requestItems)):[],
  inboxIds.length?must(admin.from('panol_envio_items').select('*,envio:panol_envios(id,titulo,sede,estado)').in('id',inboxIds)):[],
]);
const data={obras,procs,items,ops,components,moves,receipts,moveItems,ledger,purchases,panolItems};
fs.writeFileSync('.tmp/torneria-regularizacion-20261118-live.json',JSON.stringify(data,null,2));
const cOfProc=id=>obras.find(o=>o.id===procs.find(p=>p.id===id)?.obra_id)?.codigo;
console.log('PROCESOS',JSON.stringify(procs.map(p=>[p.id,cOfProc(p.id),p.estado,p.nombre])));
for(const i of items.filter(i=>i.activo&&(keys.includes(i.clave)||/palma|bocina|limera|eje|brida de salida|manchon|pata de gallo/i.test(i.descripcion)))){
  const opsIt=components.filter(c=>c.item_id===i.id).map(c=>{
    const o=ops.find(o=>o.id===c.operacion_id);
    return [o?.clave,o?.nombre,o?.tipo,o?.paso,o?.activa,c.id,c.cantidad,c.listo_salida_at,c.listo_retiro_at,
      moveItems.filter(m=>m.operacion_item_id===c.id).map(m=>[moves.find(a=>a.id===m.movimiento_id)?.tipo,m.cantidad,moves.find(a=>a.id===m.movimiento_id)?.destino,moves.find(a=>a.id===m.movimiento_id)?.fecha])];
  });
  const l=ledger.filter(l=>l.purchase_request_item_id&&l.purchase_request_item_id===i.purchase_request_item_id || (l.obra_id===procs.find(p=>p.id===i.proceso_id)?.obra_id&&l.material_id===i.material_id));
  console.log(JSON.stringify({obra:cOfProc(i.proceso_id),id:i.id,key:i.clave,desc:i.descripcion,qty:i.cantidad,unit:i.unidad,state:i.compra_estado,rec:i.recibido_astillero_at,result:i.es_resultado,material:i.material,pr:i.purchase_request_item_id,ledger:l.map(x=>[x.id,x.cantidad,x.estado,x.recepcion_estado,x.source,x.panol_envio_item_id,x.cantidad_egresada,x.stock_sede,x.purchase_request_item_id===i.purchase_request_item_id&&!!i.purchase_request_item_id]),ops:opsIt}));
}
