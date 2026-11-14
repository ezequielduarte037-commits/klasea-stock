import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('.tmp/baron3746-report-data.json','utf8'));
const fx=1540;
const fmt=(v,d=2)=>Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
const ars=v=>'$'+fmt(v);
const sign=v=>(v<0?'−':'+')+ars(Math.abs(v));
const amount=(p,m)=>p==null?'—':(m==='USD'?'USD ':'$')+fmt(p);
const records=rows.map(r=>{
 const cat=r.catalogPrice==null?null:r.catalogPrice*(r.catalogCurrency==='USD'?fx:1);
 const dif=cat==null?null:r.net-cat;
 return {...r,cat,dif};
});
const comparables=records.filter(r=>r.cat!=null);
const comparableBefore=comparables.reduce((s,r)=>s+r.cat*r.qty,0);
const comparableAfter=comparables.reduce((s,r)=>s+r.net*r.qty,0);
const comparableDiff=comparableAfter-comparableBefore;
const receiptDiff=28118.826446-33482.05/1.21;
const notice=process.argv[2];
const text=[
'# Obra 37-46 · Comparación de precios Baron',
'',
'Aviso de ingreso a Pañol Chubut: **Baron · 37-46 · 10/11/2026**. '+(notice?'Identificador: `'+notice+'`.':''),
'',
'Los 33 renglones incluidos suman **ARS 6.789.636,00** a precios impresos, **ARS 6.111.351,36** con el 9,99 % de descuento y **ARS 5.050.703,61** sin IVA del 21 %. Los cuatro excluidos son B19055 (bow thruster), B19410 (túnel), B19888 (panel con joystick) e I23423 (sensor KUS).',
'',
'La diferencia es **nuevo neto menos precio anterior de catálogo**, por la unidad indicada. Cuando el catálogo estaba en USD, se usó **ARS 1.540 por USD** solo para la comparación. Es la equivalencia aproximada que surge del total del comprobante completo con descuento y su referencia de USD 5.652. La columna de la lista de la obra conserva los valores tal como figuraban antes de la actualización.',
'',
'En '+comparables.length+' renglones con precio previo de catálogo, el subtotal comparable pasó de **'+ars(comparableBefore)+'** a **'+ars(comparableAfter)+'**. Diferencia de **'+sign(comparableDiff)+'** ('+fmt(comparableDiff/comparableBefore*100,2)+' %). Se usaron las cantidades del aviso.',
'',
'| Código | Producto | Cantidad | Unitario impreso | Catálogo anterior | Lista de obra anterior | Nuevo neto ARS | Diferencia unitaria ARS |',
'|---|---|---:|---:|---:|---:|---:|---:|',
...records.map(r=>'| '+r.code+' | '+r.name+' | '+fmt(r.qty,r.qty%1?2:0)+' '+r.unit+' | '+ars(r.gross)+(r.documentUnit==='pie'?' / pie':'')+' | '+amount(r.catalogPrice,r.catalogCurrency)+' | '+amount(r.obraPrice,r.obraCurrency)+' | '+ars(r.net)+' | '+(r.dif==null?'—':sign(r.dif))+' |'),
'',
'## Equivalencias y referencias de la obra',
'',
'- **A16267 y A16149.** El comprobante cobra por pie. En el aviso y el catálogo se expresaron por metro: 25 pies son 7,62 m por medida. La lista pide 6 m de cada medida.',
'- **D01245 + C57229.** Cada defensa y sus 3 m de cabo quedan en '+ars(35111.338843+3*914.977686)+' netos. La lista tenía USD 41,24 por conjunto, aproximadamente '+ars(41.24*fx)+'. Diferencia orientativa por conjunto de '+sign(35111.338843+3*914.977686-41.24*fx)+'.',
'- **C57251.** Se dio de alta el cabo de 14 mm por metro. Los 40 m equivalen a los cuatro tramos de 10 m de la lista: '+ars(10*2953.220661)+' netos por tramo frente a USD 15 por tramo en la lista. Diferencia orientativa de '+sign(10*2953.220661-15*fx)+'.',
'- **O02153.** Sin precio anterior para ese SKU en catálogo. La lista tenía USD 1,50 por omega chico. Diferencia orientativa de '+sign(583.205289-1.5*fx)+' por unidad.',
'- **P81364.** El catálogo lo identifica por SKU como Luz de parrilla Seaflo. En el aviso se usó la descripción de la copia de Baron. Sin precio de catálogo. Como referencia, el aviso Baron de la obra 55-2 (27/10/2026) tenía '+ars(33482.05)+' con IVA y descuento, equivalente a '+ars(33482.05/1.21)+' sin IVA. Diferencia de '+sign(receiptDiff)+'. La lista de la 37-46 mostraba ARS 39,80, un valor que no se usó para calcular la variación.',
'- **C98074 y C98075.** La lista agrupaba los dos pulsadores con una sola cantidad de 2. El aviso identifica cada uno con su SKU y cantidad 1.',
'- **C98089.** Se agregó el corte térmico de 100 A como renglón propio porque la lista existente tenía una térmica de 80 A.',
'',
].join('\n');
const dir='entregables/obra-37-46';
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/comparacion-precios-baron-2026-11-10.md',text);
console.log(JSON.stringify({comparableCount:comparables.length,comparableBefore,comparableAfter,comparableDiff,largest:comparables.map(r=>({code:r.code,unit:r.dif,total:r.dif*r.qty})).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total)).slice(0,8)}));

