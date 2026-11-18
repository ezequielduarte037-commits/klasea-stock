import { admin, must } from '../tmp/jacuzzi-client.mjs';
const m = await must(admin.from('panol_materiales').select('id,codigo,descripcion,proveedor,origen,notas,activo,categoria_id,links,variantes').or('id.eq.69280c74-86ff-4eb8-89a5-1c02ad779068,descripcion.ilike.%isotherm%,descripcion.ilike.%65l%,descripcion.ilike.%heladera%'));
console.log(JSON.stringify(m,null,1));
const s = await must(admin.from('panol_obra_materiales_snapshot').select('id,obra_id,descripcion,estado,purchase_request_id').eq('material_id','69280c74-86ff-4eb8-89a5-1c02ad779068'));
console.log('usos snapshot', JSON.stringify(s));
const a = await must(admin.from('panol_obra_addons').select('id,obra_id,descripcion').eq('material_id','69280c74-86ff-4eb8-89a5-1c02ad779068'));
console.log('usos addons', JSON.stringify(a));
