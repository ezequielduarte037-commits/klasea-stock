import pg from '../tools/robot-panol/runtime/node_modules/pg/lib/index.js';
import fs from 'node:fs';
process.loadEnvFile('.env.audit.local'); const e=process.env;
export const db=new pg.Client({host:e.KLASEA_AUDIT_DB_HOST,port:+e.KLASEA_AUDIT_DB_PORT,user:e.KLASEA_AUDIT_DB_USER,password:e.KLASEA_AUDIT_DB_PASSWORD,database:e.KLASEA_AUDIT_DB_NAME,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
export const read=async (q,v)=> (await db.query(q,v)).rows;
if(process.argv[2]==='read'){
await db.connect();
try{
const [obra]=await read("select id,codigo,sede,modelo from produccion_obras where codigo=$1",['37-46']);
const rows=await read("select * from panol_obra_materiales_snapshot where obra_id=$1",[obra.id]);
const mat=await read("select * from panol_materiales where activo or id in (select material_id from panol_obra_materiales_snapshot where obra_id=$1)",[obra.id]);
const avisos=await read("select e.id,e.titulo,e.observaciones,e.estado,e.sede,i.codigo,i.descripcion,i.cantidad,i.estado as item_estado,i.obra_snapshot_item_id,i.material_id from panol_envios e join panol_envio_items i on i.envio_id=e.id where e.obra_id=$1 or i.obra_id=$1 or i.obra_snapshot_item_id=any($2::uuid[])",[obra.id,rows.map(x=>x.id)]);
fs.writeFileSync('.tmp/baron3746-read.json',JSON.stringify({obra,rows,mat,avisos}));
console.log(obra,rows.length,mat.length,avisos.length);
}finally{await db.end()}
}
