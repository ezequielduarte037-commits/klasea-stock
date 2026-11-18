import fs from 'node:fs';
import { admin, must } from '../tmp/jacuzzi-client.mjs';
const test = 'bastidor,mignon,bauhaus,6111,6121,6910,4742,cambre,canal electric,sxxii,siglo xxii'.split(',');
const or = (fields) => fields.flatMap(field => test.map(s => `${field}.ilike.%${s}%`)).join(',');
const productIds = ['METECTAP0003','METECTAP0065','METECTEC0084','METECTEC0086','6910','4742','6111','6121'];
const [byItem, byRequest, catalog, duplicates, suppliers] = await Promise.all([
  must(admin.from('purchase_request_items').select('*').or(or(['description','supplier_name','supplier_description','supplier_code'])).order('created_at',{ascending:false}).limit(500)),
  must(admin.from('purchase_requests').select('id').or(or(['title','description','proveedor'])).order('created_at',{ascending:false}).limit(100)),
  must(admin.from('panol_materiales').select('id,descripcion,alias,codigo,proveedor,categoria_id,unidad_medida,activo,es_requisito,precio_unitario,notas').or(or(['descripcion','alias','codigo'])+',codigo.in.('+productIds.join(',')+')').order('descripcion').limit(500)),
  must(admin.from('panol_envios').select('id,titulo,estado,purchase_request_id,obra_id,observaciones').or('titulo.ilike.%120931%,observaciones.ilike.%120931%')),
  must(admin.from('panol_proveedores').select('id,nombre').or('nombre.ilike.%canal%elect%,nombre.ilike.%adimatel%')),
]);
const requestIds = [...new Set([...byRequest.map(r=>r.id),...byItem.map(r=>r.request_id)])];
const requests = [];
for (let start=0; start<requestIds.length; start+=70) {
  requests.push(...await must(admin.from('purchase_requests').select('*,project:produccion_obras(codigo,estado),creator:profiles!purchase_requests_created_by_fkey(username)').in('id',requestIds.slice(start,start+70))));
}
const relevant = requests.filter(r=>!['recibido','cancelado'].includes(r.status) || r.created_at >= '2026-11-10');
const items = relevant.length ? await must(admin.from('purchase_request_items').select('*').in('request_id',relevant.map(r=>r.id))) : [];
const catalogIds = catalog.map(m=>m.id);
const since = '2026-11-10';
const [incoming, snapshots] = await Promise.all([
  must(admin.from('panol_envio_items').select('id,material_id,estado,descripcion,cantidad,obra_snapshot_item_id,purchase_request_item_id,envio:panol_envios!inner(id,titulo,estado,obra_id,sede,purchase_request_id,created_at)').or(or(['descripcion','codigo'])+',codigo.in.('+productIds.join(',')+')').gte('envio.created_at',since).limit(250)),
  items.length ? must(admin.from('panol_obra_materiales_snapshot').select('*').in('purchase_request_item_id',items.map(i=>i.id))) : [],
]);
const terms = suppliers.length ? await must(admin.from('panol_material_proveedores').select('*').in('proveedor_id',suppliers.map(s=>s.id)).or(or(['denominacion_proveedor','codigo_proveedor'])+',codigo_proveedor.in.('+productIds.join(',')+')')) : [];
fs.writeFileSync('.tmp/aviso-canal-120931-live.json',JSON.stringify({requests,relevant,items,snapshots,catalog,terms,incoming,duplicates,suppliers},null,2));
for (const r of relevant.sort((a,b)=>b.created_at.localeCompare(a.created_at))) {
  console.log('PEDIDO',JSON.stringify([r.id,r.created_at,r.title,r.status,r.creator?.username,r.project?.codigo,r.proveedor,r.description,items.filter(i=>i.request_id===r.id).map(i=>[i.id,i.description,i.quantity,i.status,i.material_id,i.supplier_description,i.supplier_code,i.actual_amount,i.supplier_components])]));
}
console.log(JSON.stringify({duplicates,suppliers,catalogCount:catalog.length,termsCount:terms.length,incoming},null,2));
