import {db,read} from './baron3746-rest.mjs';
import {lines,excluded,factor,money} from './baron3746-lines.mjs';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const {obra,rows,mat,avisos,items:oldItems}=JSON.parse(fs.readFileSync('.tmp/baron3746-read.json'));
const supplier='6794d0d7-fa22-4be5-87f9-e1f36b94b07a';
const responsable=avisos.find(a=>a.titulo==='Cajas de piso · 37-46').created_by;
const title='Baron · 37-46 · 10/11/2026';
const source='Baron 10/11/2026 · obra 37-46 · referencia 83035 · descuento 9,99 % · sin IVA 21 %';
const obs='Compra Baron del 10/11/2026 (ref. 83035), obra 37-46. 33 renglones. Unitarios ARS netos del descuento 9,99 % y de IVA 21 %. Importe con descuento e IVA: ARS 6.111.351,36. Mangueras A16267 y A16149: 25 pies = 7,62 m cada una. Cabo C57251: 40 m para cuatro tramos de 10 m. Calefactor C89412, serie 63562015047. Alcance: se excluyen bow thruster, túnel, comando e instrumento KUS.';
const px6=n=>Math.round(n*1e6)/1e6;
const ids=lines.map(l=>mat[l.code==='G20052'?2054:l.mi]?.id).filter(Boolean);
const [catalog,history,profiles,sup,duplicate,liveRows]=await Promise.all([
  read(db.from('panol_materiales').select('*').in('id',ids)),
  read(db.from('panol_precios').select('*').in('material_id',ids).order('fecha',{ascending:false}).order('created_at',{ascending:false}).limit(500)),
  read(db.from('profiles').select('id,username,is_admin').eq('id',responsable).single()),
  read(db.from('panol_proveedores').select('id,nombre').eq('id',supplier).single()),
  read(db.from('panol_envios').select('id,estado').eq('obra_id',obra.id).eq('titulo',title)),
  read(db.from('panol_obra_materiales_snapshot').select('*').eq('obra_id',obra.id)),
]);
assert.equal(profiles.username,'ezequiel.adm');
assert.equal(sup.nombre,'Baron');
assert.equal(duplicate.length,0,'Ya existe el aviso');
assert.ok(!oldItems.some(x=>lines.some(l=>l.code===x.codigo)));
assert.ok(liveRows.every(r=>r.stock_sede==='Chubut'));
assert.equal(lines.length,33);
assert.equal(lines.reduce((a,l)=>a+l.qty*l.gross,0),6789636);
const catalogNuevo={id:randomUUID(),categoria_id:mat[2589].categoria_id,codigo:'C57251',descripcion:'Cabo Dacron Five Oceans Solid Black 14 mm',proveedor:'Baron',proveedor_id:supplier,unidad_medida:'metro',origen:'manual',notas:'Cabo por metro, código Baron C57251. Fuente: copia del 10/11/2026 para la obra 37-46.',activo:true,es_requisito:false};
const groupRow=rows[359];
const noticeId=randomUUID();
let orden=Math.max(...liveRows.map(r=>r.orden??0))+1;
const build=(l)=>{
  const base=l.si==null?null:liveRows.find(r=>r.id===rows[l.si].id);
  if(base){
    assert.equal(base.updated_at,rows[l.si].updated_at);
    assert.equal(base.estado,'pendiente');
    assert.equal(base.panol_envio_item_id,null);
    assert.equal(base.purchase_request_item_id,null);
  }
  const product=l.mi==null?null:catalog.find(m=>m.id===mat[l.code==='G20052'?2054:l.mi].id);
  assert.ok(l.mi==null||product?.activo);
  assert.ok(l.mi==null||!product.es_requisito);
  const productId=product?.id??catalogNuevo.id;
  const previous=history.find(p=>p.material_id===productId)??product;
  const received=l.unit==='pie'?l.qty*.3048:l.qty;
  const unit=l.unit==='pie'?'metro':l.unit;
  const price=px6(l.gross*factor/(l.unit==='pie'?.3048:1));
  const fresh=l.si==null||l.code==='C98075';
  const snapshotId=fresh?randomUUID():base.id;
  const itemId=randomUUID();
  const reqId=base?.requisito_material_id||base?.material_id||productId;
  const note=[source,
    l.unit==='pie'?'25 pies equivalen a 7,62 m.':null,
    l.code==='C57251'?'40 m para cuatro tramos de 10 m.':null,
    l.code==='D01245'?'Los 18 m de cabo para estas seis defensas figuran por separado (C57229).':null,
    l.code==='C57229'?'3 m por cada defensa de la obra.':null,
    l.code==='C98089'?'Corte térmico de 100 A cotizado. La térmica de 80 A es otro renglón.':null,
    l.code==='C89412'?'Serie 63562015047.':null,
    l.code==='A16073'?'Producto de esta compra para el requerimiento de rejillas blancas de la obra.':null,
    l.code==='P81364'?'Identificado por SKU P81364; el catálogo lo denomina Luz de parrilla Seaflo.':null,
  ].filter(Boolean).join('. ');
  const snapPrice=price;
  const snapFields={
    material_id:productId,requisito_material_id:reqId,
    descripcion:l.name,codigo:l.code,unidad:unit,proveedor:'Baron',
    cantidad:fresh||l.code==='C98074'||l.code==='C57251'?received:base.cantidad,
    precio_unitario:snapPrice,moneda:'ARS',estado:'comprado',
    notas:[base?.notas,note].filter(Boolean).join('\n'),
  };
  if(base?.material_id!==productId)Object.assign(snapFields,{producto_asignacion_origen:'asignacion_obra',producto_asignado_at:new Date().toISOString(),producto_asignado_por:responsable});
  const snapshot=fresh?{
    id:snapshotId,obra_id:obra.id,stock_sede:'Chubut',
    source:base?.source??'obra_matriz',tipo:base?.tipo??'manual',
    tipo_label:base?.tipo_label??'Compra Baron',rubro:base?.rubro??null,
    tipo_pedido:'estandar',orden:orden++,es_adicional:false,
    created_by:responsable,especificaciones:base?.especificaciones??{},
    ...snapFields,
  }:snapFields;
  const item={id:itemId,envio_id:noticeId,codigo:l.code,descripcion:l.name,cantidad:String(received),unidad:unit,estado:'pendiente',material_id:productId,requisito_material_id:reqId,obra_snapshot_item_id:snapshotId,precio_unitario:price,moneda:'ARS'};
  const priceRow={id:randomUUID(),material_id:productId,proveedor:'Baron',proveedor_id:supplier,precio_unitario:price,moneda:'ARS',fecha:'2026-11-10',fuente:source};
  return {...l,base,product,previous,received,unit,price,fresh,snapshotId,snapshot,item,priceRow,productId};
};
const plan=lines.map(build);
assert.equal(new Set(plan.map(l=>l.snapshotId)).size,33);
assert.equal(new Set(plan.map(l=>l.productId)).size,33);
assert.ok(plan.every(l=>!excluded.includes(l.code)));
const newEntry=plan.find(l=>!l.product);
const oldExcluded=liveRows.filter(r=>excluded.includes(r.codigo)||/bowthruster|sensor.*(agua|combustible)/i.test(r.descripcion));
const folder='backups/baron-37-46-20261112';
const notice={id:noticeId,titulo:title,origen:'obra_matriz',obra_id:obra.id,sede:'Chubut',estado:'borrador',prioridad:'media',observaciones:obs,created_by:responsable};
const fieldView=plan.map(l=>({code:l.code,name:l.name,documentQty:l.qty,documentUnit:lines.find(x=>x.code===l.code).unit,gross:l.gross,net:l.price,qty:l.received,unit:l.unit,snapshot:l.base?.descripcion,obraPrice:l.base?.precio_unitario,obraCurrency:l.base?.moneda,catalogPrice:l.previous?.precio_unitario,catalogCurrency:l.previous?.moneda,catalogSource:l.previous?.fuente??(l.previous?.precio_unitario!=null?'Ficha':null),catalogDate:l.previous?.fecha,link:l.fresh?(l.base?'Separado de un renglón agrupado':'Agregado a la obra'):'Lista existente'}));
console.table(fieldView.map(({code,documentQty,unit,qty,net,catalogPrice,catalogCurrency,obraPrice,obraCurrency,link})=>({code,documentQty,unit,qty,net,catalogPrice,catalogCurrency,obraPrice,obraCurrency,link})));
if(process.argv[2]!=='apply'){
  fs.writeFileSync('.tmp/baron3746-report-data.json',JSON.stringify(fieldView,null,2));process.exit(0);
}
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/antes-y-plan.json',JSON.stringify({obra,plan,notice,oldExcluded,history,oldItems},null,2),{flag:'wx'});
const save=(name,data)=>fs.writeFileSync(folder+'/'+name+'.json',JSON.stringify(data,null,2));
const exact=async (q,expected)=>{const a=await read(q);assert.equal(a.length,expected);return a};
const journal=[];
const record=(step)=>{journal.push(step);save('pasos',journal)};
try{
  await exact(db.from('panol_envios').insert(notice).select('id'),1);record('Aviso en borrador');
  await exact(db.from('panol_materiales').insert({...catalogNuevo,precio_unitario:newEntry.price,moneda:'ARS',created_by:responsable}).select('id'),1);record('Ficha de cabo 14 mm');
  const newRows=plan.filter(l=>l.fresh).map(l=>l.snapshot);
  await exact(db.from('panol_obra_materiales_snapshot').insert(newRows).select('id'),newRows.length);record('Renglones nuevos');
  for(const l of plan.filter(l=>!l.fresh)){
    await exact(db.from('panol_obra_materiales_snapshot').update(l.snapshot).eq('id',l.snapshotId).eq('updated_at',l.base.updated_at).select('id'),1);
    record('Lista '+l.code);
  }
  const linked=await exact(db.from('panol_envio_items').insert(plan.map(l=>l.item)).select('*'),33);record('33 renglones vinculados');
  for(const l of plan){
    const i=linked.find(x=>x.id===l.item.id);
    assert.equal(i.material_id,l.productId);assert.equal(i.estado,'pendiente');
    assert.equal(i.obra_snapshot_item_id,l.snapshotId);
    assert.equal(i.cantidad_recibida,null);
    assert.equal(Number(i.cantidad),l.received);
    assert.equal(Number(i.precio_unitario),l.price);
  }
  for(const l of plan.filter(l=>l.product)){
    const patch={precio_unitario:l.price,moneda:'ARS',proveedor:'Baron',proveedor_id:supplier};
    let q=db.from('panol_materiales').update(patch).eq('id',l.product.id);
    for(const key of Object.keys(patch))q=l.product[key]==null?q.is(key,null):q.eq(key,l.product[key]);
    await exact(q.select('id'),1);record('Catálogo '+l.code);
  }
  await exact(db.from('panol_precios').insert(plan.map(l=>l.priceRow)).select('id'),33);record('Historial de precios');
  const snaps=await exact(db.from('panol_obra_materiales_snapshot').select('*').in('id',plan.map(l=>l.snapshotId)),33);
  for(const l of plan){
    const r=snaps.find(x=>x.id===l.snapshotId);
    assert.equal(r.estado,'comprado');assert.equal(r.panol_envio_id,noticeId);assert.equal(r.panol_envio_item_id,l.item.id);assert.equal(r.recepcion_estado,'pendiente');assert.equal(r.recepcion_cantidad_recibida,null);assert.equal(r.material_id,l.productId);assert.equal(r.precio_unitario,l.price);
  }
  const products=await exact(db.from('panol_materiales').select('id,precio_unitario,moneda,proveedor_id').in('id',plan.map(l=>l.productId)),33);
  for(const l of plan){const p=products.find(x=>x.id===l.productId);assert.equal(p.precio_unitario,l.price);assert.equal(p.moneda,'ARS');assert.equal(p.proveedor_id,supplier)}
  const exNow=await exact(db.from('panol_obra_materiales_snapshot').select('*').in('id',oldExcluded.map(x=>x.id)),oldExcluded.length);
  for(const before of oldExcluded)assert.deepEqual(exNow.find(x=>x.id===before.id),before);
  await exact(db.from('panol_envio_eventos').insert({envio_id:noticeId,tipo:'creado',estado_nuevo:'enviado',nota:obs,actor_id:responsable}).select('id'),1);
  const [published]=await exact(db.from('panol_envios').update({estado:'enviado'}).eq('id',noticeId).eq('estado','borrador').select('*'),1);
  record('Aviso enviado');
  save('verificado',{notice:published,items:linked,snapshots:snaps,precios:products,fieldView});
  fs.writeFileSync('.tmp/baron3746-report-data.json',JSON.stringify(fieldView,null,2));
  console.log(JSON.stringify({noticeId,items:linked.length,existing:plan.length-newRows.length,added:newRows.length,gross:6789636,discounted:money(6789636*.9001),net:money(linked.reduce((a,i)=>a+i.cantidad*i.precio_unitario,0))}));
}catch(e){save('error',{message:e.message,journal});throw e}

