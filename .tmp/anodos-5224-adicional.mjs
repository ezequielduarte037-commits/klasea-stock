import { admin, must } from '../tmp/jacuzzi-client.mjs';
const ids = ['3dbdb692-9d5d-4777-b595-aac787eb3de7','13b56993-e4cb-419c-ba86-d4381278b0dc','45ba32d7-78a3-4567-8f6d-97de89ba10d8'];
const s = await must(admin.from('panol_obra_materiales_snapshot').update({ es_adicional: true }).in('id', ids).eq('source','adicional_obra').select('id,es_adicional,estado,panol_envio_item_id'));
console.log(JSON.stringify(s));
const ei = await admin.from('panol_envio_items').select('*').eq('envio_id','d114f5eb-4d81-481f-ace1-2dcaa0a56cf4').limit(1);
console.log(Object.keys(ei.data?.[0]||{}).filter(k=>/adic/.test(k)), ei.error?.message);
