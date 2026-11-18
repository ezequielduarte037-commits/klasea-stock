import fs from 'node:fs';
import { admin, must } from '../tmp/jacuzzi-client.mjs';

const request = '45b9bb64-63ff-4db9-91e8-4c1c403359dd';
const requestItem = 'e94d2984-fdd9-4d14-b444-67a649229586';
const obra = 'f75fef37-f0d8-4ce5-b206-32b9c3e2aa57';
const supplier = '5ee14014-e761-4ff0-98e6-4f8f19ec2cf5';
const fields = 'id,descripcion,alias,codigo,categoria_id,proveedor,unidad_medida,activo,es_requisito,precio_unitario,moneda';
const [order, items, snapshots, docs, already, catalog, terms, categories] = await Promise.all([
  must(admin.from('purchase_requests').select('*,creator:profiles!purchase_requests_created_by_fkey(username),project:produccion_obras(codigo,estado)').eq('id', request).single()),
  must(admin.from('purchase_request_items').select('*').eq('request_id', request)),
  must(admin.from('panol_obra_materiales_snapshot').select('*').or('purchase_request_item_id.eq.' + requestItem + ',and(obra_id.eq.' + obra + ',material_id.eq.56990c06-2345-4039-9743-b6be04711462)')),
  must(admin.from('panol_envios').select('id,titulo,estado,obra_id,purchase_request_id').or('titulo.ilike.%34661%,titulo.ilike.%34662%,observaciones.ilike.%34661%,observaciones.ilike.%34662%,purchase_request_id.eq.' + request)),
  must(admin.from('panol_envio_items').select('id,envio_id,cantidad,estado').eq('purchase_request_item_id', requestItem)),
  must(admin.from('panol_materiales').select(fields).or('descripcion.ilike.%racor%,descripcion.ilike.%niple%,descripcion.ilike.%pasacasc%,descripcion.ilike.%filtro%agua%,descripcion.ilike.%filtro%medium%,codigo.ilike.%TEERAC%,codigo.ilike.%1037%')),
  must(admin.from('panol_material_proveedores').select('*,material:panol_materiales('+fields+')').eq('proveedor_id', supplier).limit(1000)),
  must(admin.from('panol_categorias').select('id,nombre').or('nombre.ilike.%bronce%,nombre.ilike.%sanitario%,nombre.ilike.%grifer%,nombre.ilike.%mec.nica%')),
]);
fs.writeFileSync('.tmp/aviso-iriarte-34661-34662-live.json', JSON.stringify({order,items,snapshots,docs,already,catalog,terms,categories}, null, 2));
console.log(JSON.stringify({order:{title:order.title,status:order.status,priority:order.priority,creator:order.creator,project:order.project,proveedor:order.proveedor},items:items.map(i=>[i.id,i.description,i.quantity,i.status,i.supplier_name,i.supplier_code,i.supplier_components,i.actual_amount]),snapshots:snapshots.map(s=>[s.id,s.estado,s.cantidad,s.material_id,s.panol_envio_item_id,s.purchase_request_item_id,s.aux]),docs,already,terms:terms.filter(t=>/TEERAC|PX RAC1M|C127 3\/4X3\/4|TO1.C|TO3\/4C|1037|FILTRO MEDIUM|RACOR CODO 1\/4/i.test([t.codigo_proveedor,t.denominacion_proveedor].join(' '))).map(t=>[t.material?.id,t.material?.descripcion,t.codigo_proveedor,t.denominacion_proveedor,t.precio,t.componentes_pedido]),catalog:catalog.length,termsTotal:terms.length,categories},null,2));
