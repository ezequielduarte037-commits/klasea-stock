import {readFileSync,writeFileSync} from 'node:fs';
import {snapshotRowToView,addonRowToView,mergeMatrixAndSnapshotRows,cantidadesDeFila,accionDeFila,snapshotEstadoFromRecepcion,latestRecepcionItem,norm} from './griferias-rules.mjs';
import {rowIsAnulado,rowDelta} from '../src/features/panol/panolMovimientos.js';
import {db,pages,read} from './baron3746-rest.mjs';
const {data,catalog,matriz}=JSON.parse(readFileSync('.tmp/griferias-live.json'));
const {keep,addons,materiales,cats,req,envItems,free}=JSON.parse(readFileSync('.tmp/griferias-raw.json'));
const ids=data.flatMap(l=>l.obras.map(o=>o.id));
const more=await Promise.all(['obra_snapshot_item_id','purchase_request_item_id'].map(async field=>{
 const picked=[...new Set(keep.map(x=>x[field==='obra_snapshot_item_id'?'id':field]).filter(Boolean))];
 return (await Promise.all(Array.from({length:Math.ceil(picked.length/65)},(_,i)=>pages(()=>db.from('panol_envio_items').select('*,envio:panol_envios(id,titulo,estado,sede)').in(field,picked.slice(i*65,(i+1)*65)))))).flat();
}));
const env=[...new Map([...envItems,...more.flat()].map(x=>[x.id,x])).values()];
const excludes=await read(db.from('panol_obra_material_exclusiones').select('*').in('obra_id',ids));
const products=new Map(materiales.map(m=>[m.id,m]));
const requests=new Map(req.map(r=>[r.id,r]));
const itemRequests=new Map(req.flatMap(r=>(r.purchase_request_items||[]).map(i=>[i.id,r])));
function classify(t){
 const s=norm(t);
 if(/^(?:mueble|codo|toma flex|flexible|manguera|sopapa|desague|valvula|caja drenaje|rejilla|bomba|percha|portarrollo|soporte|neon|sifon|adaptador|cartucho|tapon|traba|chapa|plano|instalacion|ceramico|kit de instalacion)/.test(s))return '';
 if(/(?:lavarropas|baldeo|drenaje|achique)/.test(s))return '';
 if(/(?:grifer|monocomando|canilla|mezclador|duchador|\bducha\b|rociador)/.test(s)&&!s.startsWith('bacha'))return 'Grifería';
 if(/(?:bacha|pileta|lavatorio)/.test(s))return 'Bacha';
 return '';
}
const lines=[];
for(const l of data){
 for(const o of l.obras){
  const exclusion=new Set(excludes.filter(x=>x.obra_id===o.id).map(x=>x.material_id));
  const source=l.filas.flatMap(f=>{
   const c=f.porObra[o.id];if(!c?.desdeMatriz||exclusion.has(f.id))return [];
   const m=products.get(f.id);
   const defaultId=matriz.find(x=>x.material_id===f.id&&norm(x.modelo).replace(/^k/,'')===norm(l.linea).replace(/^k/,'')&&String(x.variante||'standard').toLowerCase()==='standard')?.producto_predeterminado_id;
   const replacement=c.configuraciones.some(x=>x.delta===0)&&!c.productoEstandar&&c.productoMaterialId;
   const p=products.get(replacement||defaultId);
   return [{id:f.id,materialId:f.id,requisitoMaterialId:f.id,productoMaterialId:p?.id,producto:p,productoEstandar:!!p&&!replacement,productoCondicionante:!!replacement,esRequisito:m?.es_requisito||!!p||l.families.some(x=>x.requisito_material_id===f.id),material:m,source:c.baseRequerido?'matriz':'condicionante',descripcion:p?.descripcion||f.descripcion,requisitoDescripcion:f.descripcion,codigo:p?.codigo||f.codigo,cantidad:c.requerido,baseCantidad:c.baseRequerido,unidad:f.unidad,proveedor:p?.proveedor||f.proveedor,rubro:f.rubro,bucket:{key:c.baseRequerido?'base':'condicionante'},obs:m?.notas,condicionantes:c.configuraciones}];
  });
  const extra=addons.filter(a=>a.obra_id===o.id).map(a=>addonRowToView(a,products,cats));
  const snapshots=keep.filter(r=>r.obra_id===o.id&&!exclusion.has(r.requisito_material_id||r.material_id)&&!rowIsAnulado(r));
  const views=snapshots.map(r=>{
   const it=latestRecepcionItem(env.filter(i=>i.obra_snapshot_item_id===r.id||(r.purchase_request_item_id&&r.purchase_request_item_id===i.purchase_request_item_id)));
   const enriched=it?{...r,estado:r.estado==='egresado'?r.estado:snapshotEstadoFromRecepcion(it.estado)||r.estado,panol_envio_id:it.envio_id,panol_envio_item_id:it.id,recepcion_estado:it.estado,recepcion_cantidad_recibida:it.cantidad_recibida??r.recepcion_cantidad_recibida,recepcion_envio:it.envio}:r;
   return snapshotRowToView(enriched,products,cats);
  });
  for(const row of mergeMatrixAndSnapshotRows([...source,...extra],views)){
   const tipo=classify(row.descripcion)||classify(row.requisitoDescripcion);if(!tipo)continue;
   const q=cantidadesDeFila(row);
   const order=requests.get(row.purchase_request_id)||itemRequests.get(row.purchase_request_item_id);
   const envItem=env.find(i=>i.id===row.panol_envio_item_id);
   const stocks=free.filter(x=>x.material_id===(row.productoMaterialId||row.materialId)&&!rowIsAnulado(x)).reduce((m,x)=>(m[x.stock_sede||'Sin sede']=(m[x.stock_sede||'Sin sede']||0)+rowDelta(x),m),{});
   lines.push({obra:o.codigo,linea:l.linea,tipo,descripcion:row.descripcion,reqDesc:row.requisitoDescripcion,producto:row.producto?.descripcion,codigo:row.codigo,proveedor:row.proveedor,cantidad:q.necesita,entregado:Math.min(q.necesita,q.entregado),panol:q.faltaEntregar,compras:q.enCompras,comprar:q.faltaComprar,accion:accionDeFila(row).texto,estado:row.estadoObra,recepcion:row.recepcion_estado,envio:envItem?.envio?.estado,envioSede:envItem?.envio?.sede,envioTitulo:envItem?.envio?.titulo,pedido:order&&{title:order.title,status:order.status,id:order.id},stocks,materialId:row.materialId,productoId:row.productoMaterialId,obs:row.obs,source:row.source,raw:snapshots.filter(r=>r.id===row.snapshotId).map(r=>({estado:r.estado,recepcion:r.recepcion_estado,source:r.source,tipo:r.tipo,qty:r.cantidad,egreso:r.cantidad_egresada,notas:r.notas}))[0]});
  }
 }
}
writeFileSync('.tmp/griferias-merged.json',JSON.stringify(lines));
console.log({lines:lines.length,exclusiones:excludes.length,env:env.length});

