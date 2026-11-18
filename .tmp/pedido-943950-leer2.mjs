import { admin, must } from '../tmp/jacuzzi-client.mjs';
const id = '943950cc-94fb-48a9-b83b-8ad5c30e878a';
const obra='4e967f5d-4022-4f68-9ca5-9a6f280829f3';
const tables = ['purchase_request_comments','purchase_request_messages'];
for (const t of tables) { const r = await admin.from(t).select('*').eq('request_id', id); console.log(t, r.error?.message ?? JSON.stringify(r.data,null,1)); }
const ei = await must(admin.from('panol_envio_items').select('*,envio:panol_envios(id,titulo,estado,sede,created_at)').eq('id','56bb94fc-3d93-4859-9d72-32db90d4095e'));
console.log(JSON.stringify(ei,null,1));
const mats=['ab26f59b-ef28-4718-a043-4cd7253f73eb','7c5801b7-51d5-4240-9bcb-56af620eccde','3bedd34e-ee72-40ef-9571-9e68a80ad891','96fbcfa4-43df-4ea8-8749-dfe5dc9a2f80'];
const all = await must(admin.from('panol_obra_materiales_snapshot').select('id,estado,cantidad,material_id,descripcion,panol_envio_item_id,purchase_request_item_id,source,recepcion_estado,stock_sede,es_adicional').eq('obra_id',obra).in('material_id',mats));
console.log(JSON.stringify(all,null,1));
const m = await must(admin.from('panol_materiales').select('id,codigo,descripcion,proveedor,precio_unitario,moneda').in('id',mats));
console.log(JSON.stringify(m,null,1));
