import { admin, must } from '../tmp/jacuzzi-client.mjs';
const m = await must(admin.from('panol_materiales').select('id,codigo,descripcion,proveedor,activo,precio_unitario').or('descripcion.ilike.%anodo%alum%,descripcion.ilike.%ánodo%alum%,codigo.in.(23005,23103,23101,23201)'));
console.log(JSON.stringify(m.map(x=>[x.id,x.codigo,x.descripcion,x.proveedor,x.activo,x.precio_unitario])));
const pr = await must(admin.from('purchase_requests').select('id,title,status,actual_amount,proveedor,itemized_costs').ilike('proveedor','%flojumar%').order('updated_at',{ascending:false}).limit(3));
console.log(JSON.stringify(pr));
