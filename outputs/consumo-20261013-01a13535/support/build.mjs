import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const workDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const input = 'C:/Users/ezequ/Downloads/consumo-consumibles-2026-10-13.xlsx';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const source = JSON.parse(await fs.readFile(path.join(workDir, 'source-data.json'), 'utf8'));
const detail = source.find(s=>s.name==='Detalle').rows.slice(1).map(r=>{
  const o={};for(const [k,v]of Object.entries(r.cells))o[k.replace(/\d+/g,'')]=v;return o;
});
const monthMap = {};
for(const r of detail){const m=monthMap[r.O]??={rows:0,missing:0,value:0};m.rows++;if(r.M==null)m.missing++;else m.value+=r.M;}
const C = {navy:'#17324D',blue:'#2563A6',lightBlue:'#EFF5FC',ink:'#24364B',muted:'#62758A',line:'#D9E3ED',amber:'#C88516',lightAmber:'#FFF3DD',white:'#FFFFFF',pale:'#F7F9FC'};
const MONEY = '"$" #,##0.00';
const INT = '#,##0';
const PCT = '0.0%';

function base(sh,range){
  sh.showGridLines=false;
  sh.getRange(range).format={font:{name:'Arial',size:10,color:C.ink},verticalAlignment:'center',rowHeight:23};
}
function header(sh,range){
  sh.getRange(range).format={fill:C.navy,font:{name:'Arial',size:10,bold:true,color:C.white},rowHeight:36,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',borders:{insideVertical:{style:'thin',color:C.white}}};
}
function table(sh,range,name){
  const t=sh.tables.add(range,true,name);t.style='TableStyleMedium2';t.showBandedColumns=false;t.showFilterButton=true;
  return t;
}
function title(sh,cell,text){
  sh.getRange(cell).values=[[text]];sh.getRange(cell).format.font={name:'Arial',size:16,bold:true,color:C.navy};
}
function chart(sh,ranges,titleText,start,end,{color=C.blue,horizontal=true,legend=false,type='bar',money=true}={}){
  const ch=sh.charts.add(type,ranges);ch.title=titleText;ch.setPosition(start,end);
  ch.titleTextStyle.typeface='Arial';ch.titleTextStyle.fontSize=15;ch.titleTextStyle.bold=true;
  ch.hasLegend=legend;
  if(legend)ch.legend={position:'bottom',textStyle:{typeface:'Arial',fontSize:12}};
  if(type==='bar'){ch.barOptions.direction=horizontal?'bar':'column';ch.barOptions.gapWidth=65;}
  if(type!=='doughnut'){
    ch.xAxis={axisType:'textAxis',textStyle:{typeface:'Arial',fontSize:12}};
    ch.yAxis={numberFormatCode:money?'"$"0.0,," M"':'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:'Arial',fontSize:12}};
  }
  ch.chartFill=C.white;ch.plotAreaFill=C.white;
  if(type!=='doughnut')ch.series.items.forEach(s=>s.fill=color);
  if(type==='doughnut')ch.dataLabels={showValue:true};
  return ch;
}

// Detail sheets retain every original data field and record.
const dsh=wb.worksheets.getItem('Detalle');
base(dsh,'A1:P1493');
const widths=[104,65,85,220,125,115,188,320,90,84,125,140,145,405,95,210];
widths.forEach((w,i)=>dsh.getRangeByIndexes(0,i,1493,1).format.columnWidthPx=w);
dsh.getRange('A2:A1493').values=detail.map(r=>[new Date(`${r.A}T00:00:00Z`)]);
dsh.getRange('A2:A1493').setNumberFormat('dd/mm/yyyy');
dsh.getRange('I2:I1493').setNumberFormat(detail.every(r=>Number.isInteger(r.I))?INT:'#,##0.00');
dsh.getRange('L2:M1493').setNumberFormat(MONEY);
dsh.getRange('C2:C1493').setNumberFormat('0');
dsh.getRange('O1:P1').values=[['Mes','Solicita']];
table(dsh,'A1:P1493','RetirosHistoricos');header(dsh,'A1:P1');
dsh.freezePanes.freezeRows(1);dsh.freezePanes.freezeColumns(4);dsh.tabColor=C.blue;
dsh.getRange('L2:N1493').conditionalFormats.addCustom('$N2<>""',{fill:C.lightAmber,font:{color:'#8B5A12'}});

// Analysis tabs keep their original grouped values; added percentages are live.
for(const s of source.filter(s=>s.name.startsWith('Por ')&&s.name!=='Por producto')){
  const sh=wb.worksheets.getItem(s.name);const n=s.rows.length;
  base(sh,`A1:F${n+2}`);
  [s.name==='Por persona'?250:s.name==='Por mes y rubro'?335:245,105,150,140,115,110].forEach((w,i)=>sh.getRangeByIndexes(0,i,n+2,1).format.columnWidthPx=w);
  sh.getRange('E1:F1').values=[['% del valor','% sin valor']];
  sh.getRange(`E2:E${n}`).formulas=Array.from({length:n-1},(_,i)=>[`=IF('Resumen'!$B$7=0,"",C${i+2}/'Resumen'!$B$7)`]);
  sh.getRange(`F2:F${n}`).formulas=Array.from({length:n-1},(_,i)=>[`=IF(B${i+2}=0,"",D${i+2}/B${i+2})`]);
  sh.getRange(`B2:B${n}`).setNumberFormat(INT);sh.getRange(`D2:D${n}`).setNumberFormat(INT);
  sh.getRange(`C2:C${n}`).setNumberFormat(MONEY);sh.getRange(`E2:F${n+2}`).setNumberFormat(PCT);
  table(sh,`A1:F${n}`,`Analisis${source.indexOf(s)}`);header(sh,'A1:F1');
  const t=n+2;sh.getRange(`A${t}`).values=[['TOTAL']];
  sh.getRange(`B${t}:F${t}`).formulas=[[`=SUM(B2:B${n})`,`=SUM(C2:C${n})`,`=SUM(D2:D${n})`,`=SUM(E2:E${n})`,`=IF(B${t}=0,"",D${t}/B${t})`]];
  sh.getRange(`C${t}`).setNumberFormat(MONEY);sh.getRange(`B${t}`).setNumberFormat(INT);sh.getRange(`D${t}`).setNumberFormat(INT);
  sh.getRange(`A${t}:F${t}`).format={fill:C.lightBlue,font:{bold:true,color:C.navy},borders:{top:{style:'thin',color:C.navy}},rowHeight:28};
  sh.getRange(`F2:F${n}`).conditionalFormats.add('colorScale',{colors:[C.white,C.lightAmber,'#EDC882'],thresholds:['min',{type:'percentile',value:50},'max']});
  sh.getRange('G1:G24').format.columnWidthPx=25;
  sh.getRange('H1:R24').format.columnWidthPx=65;
  sh.freezePanes.freezeRows(1);sh.tabColor=C.blue;
  if(s.name!=='Por mes y rubro'){
    const count=Math.min(n-1,s.name==='Por rubro'?10:s.name==='Por sector'?6:8);
    const ttl=s.name==='Por sector'?'Valor por sector (pesos sin IVA)':s.name==='Por rubro'?'Valor por rubro (pesos sin IVA)':s.name==='Por persona'?'8 personas con mayor valor registrado':'8 obras con mayor valor registrado';
    chart(sh,[sh.getRange(`A1:A${count+1}`),sh.getRange(`C1:C${count+1}`)],ttl,'H2','R21');
    sh.getRange('H23:R23').merge();sh.getRange('H23').values=[['Valorización a costos del 13/10/2026. Registros de solicitudes de papel.']];
    sh.getRange('H23:R23').format.font={name:'Arial',size:10,color:C.muted,italic:true};
  }
}

const prod=wb.worksheets.getItem('Por producto');
base(prod,'A1:H141');
[330,185,125,110,125,85,150,100].forEach((w,i)=>prod.getRangeByIndexes(0,i,141,1).format.columnWidthPx=w);
prod.getRange('H1').values=[['Con valor']];
prod.getRange('D2:D141').setNumberFormat(INT);prod.getRange('E2:E141').setNumberFormat(INT);prod.getRange('G2:G141').setNumberFormat(MONEY);
prod.getRange('H2:H141').setNumberFormat('[=1]"Sí";[=0]"No";General');
table(prod,'A1:H141','ConsumoPorProducto');header(prod,'A1:H1');prod.freezePanes.freezeRows(1);prod.freezePanes.freezeColumns(1);
prod.getRange('G2:H141').conditionalFormats.addCustom('$H2=0',{fill:C.lightAmber,font:{color:'#8B5A12'}});
prod.getRange('I1:I23').format.columnWidthPx=24;prod.getRange('J1:T23').format.columnWidthPx=65;
chart(prod,[prod.getRange('A1:A11'),prod.getRange('D1:D11')],'10 productos más pedidos (renglones)','J2','T23',{money:false});
prod.tabColor=C.blue;

const pending=wb.worksheets.getItem('Sin valorizar');
base(pending,'A1:E43');[285,395,110,130,90].forEach((w,i)=>pending.getRangeByIndexes(0,i,43,1).format.columnWidthPx=w);
pending.getRange('C2:C43').setNumberFormat(INT);pending.getRange('D2:D43').setNumberFormat(INT);
table(pending,'A1:E43','ProductosSinValor');header(pending,'A1:E1');pending.freezePanes.freezeRows(1);pending.tabColor=C.amber;
pending.getRange('F1:F24').format.columnWidthPx=24;pending.getRange('G1:Q24').format.columnWidthPx=65;
chart(pending,[pending.getRange('A1:A11'),pending.getRange('C1:C11')],'10 productos sin valor más pedidos','G2','Q23',{money:false,color:C.amber});
pending.getRange('G25:Q25').merge();pending.getRange('G25').values=[['La cantidad total se lee por producto y unidad; no se suman unidades distintas.']];
pending.getRange('G25:Q25').format.font={name:'Arial',size:10,color:C.muted,italic:true};

const newSh=wb.worksheets.getItem('Registro nuevo (desde 13-10)');
base(newSh,'A1:P10');[105,108,90,115,220,110,105,125,100,325,125,85,90,145,150,180].forEach((w,i)=>newSh.getRangeByIndexes(0,i,10,1).format.columnWidthPx=w);
const newRows=source.find(s=>s.name===newSh.name).rows.slice(1);
newSh.getRange('A2:A10').values=newRows.map(r=>[new Date(`${r.cells[`A${r.row}`]}T00:00:00Z`)]);
newSh.getRange('A2:A10').setNumberFormat('dd/mm/yyyy');newSh.getRange('L2:L10').setNumberFormat(INT);newSh.getRange('N2:O10').setNumberFormat(MONEY);
table(newSh,'A1:P10','RegistroDesde13Oct');header(newSh,'A1:P1');newSh.freezePanes.freezeRows(1);newSh.freezePanes.freezeColumns(1);newSh.tabColor='#678CA3';
newSh.getRange('A13:J13').merge();newSh.getRange('A13').values=[['Este registro desde el 13/10 se mantiene separado del histórico hasta el 09/10.']];
newSh.getRange('A13:J13').format.font={name:'Arial',size:10,color:C.muted,italic:true};

// The main view combines the period, key measures, comparisons and coverage.
const sum=wb.worksheets.getItem('Resumen');sum.getRange('A1:R60').clear({applyTo:'all'});
base(sum,'A1:R60');sum.tabColor=C.navy;
sum.getRange('A1:A60').format.columnWidthPx=22;sum.getRange('R1:R60').format.columnWidthPx=22;
sum.getRange('B1:Q60').format.columnWidthPx=72;sum.getRange('A1:R60').format.rowHeight=22;
sum.getRange('B2:Q2').merge();title(sum,'B2','Consumo de consumibles');sum.getRange('B2:Q2').format.rowHeight=30;
sum.getRange('B3:Q3').merge();sum.getRange('B3').values=[['Retiros por solicitudes de papel. Período: 05/08/2026 al 09/10/2026.']];
sum.getRange('B3:Q3').format.font={name:'Arial',size:10,color:C.muted};
sum.getRange('B4:Q4').format={rowHeight:8,borders:{bottom:{style:'thin',color:C.line}}};
const cards=[['B6:E9','B6:E6','B7:E8','Valorizado sin IVA',`=SUM('Detalle'!M2:M1493)`,MONEY,C.lightBlue],['G6:I9','G6:I6','G7:I8','Renglones retirados',`=COUNTA('Detalle'!C2:C1493)`,INT,C.pale],['K6:M9','K6:M6','K7:M8','Solicitudes',171,INT,C.pale],['O6:Q9','O6:Q6','O7:Q8','Sin valorizar',`=COUNTBLANK('Detalle'!M2:M1493)`,INT,C.lightAmber]];
for(const [area,labelRange,valueRange,label,value,fmt,fill]of cards){
  sum.getRange(area).format.fill=fill;sum.getRange(labelRange).merge();sum.getRange(labelRange).values=[[label]];
  sum.getRange(labelRange).format={font:{name:'Arial',size:10,color:C.muted},horizontalAlignment:'left'};
  sum.getRange(valueRange).merge();if(typeof value==='string')sum.getRange(valueRange.split(':')[0]).formulas=[[value]];else sum.getRange(valueRange.split(':')[0]).values=[[value]];
  sum.getRange(valueRange).format={font:{name:'Arial',size:16,bold:true,color:fill===C.lightAmber?'#8B5A12':C.navy},horizontalAlignment:'left',numberFormat:fmt};
}
sum.getRange('B11:Q11').merge();sum.getRange('B11').values=[['48 personas distintas que retiraron. El registro nuevo desde el 13/10 está en su propia hoja.']];
sum.getRange('B11:Q11').format.font={name:'Arial',size:10,color:C.muted};

sum.getRange('B49:C49').values=[['Sector','Valor ($)']];
sum.getRange('F49:G49').values=[['Rubro','Valor ($)']];
for(let i=0;i<6;i++){
  sum.getRange(`B${50+i}:C${50+i}`).formulas=[[`='Por sector'!A${i+2}`,`='Por sector'!C${i+2}`]];
  sum.getRange(`F${50+i}:G${50+i}`).formulas=[[`='Por rubro'!A${i+2}`,`='Por rubro'!C${i+2}`]];
}
sum.getRange('K49:N49').values=[['Mes','Valor ($)','Renglones','Sin valor']];
sum.getRange('K50:K52').values=[['Ago 2026'],['Sep 2026'],['Oct 2026']];
sum.getRange('O49:P49').values=[['Cobertura','Renglones']];
sum.getRange('O50:O51').values=[['Con valor'],['Sin valor']];
sum.getRange('P50:P51').formulas=[[`=G7-O7`],[`=O7`]];
sum.getRange('O53:P53').values=[['Con valor (%)',null]];sum.getRange('P53').formulas=[['=IF(G7=0,"",P50/G7)']];sum.getRange('P53').setNumberFormat(PCT);

// Group only the months actually present. Values stay at the source valuation basis.
const monthSh=wb.worksheets.getItem('Por mes y rubro');
monthSh.getRange('H24:L24').values=[['Mes','Valor ($)','Renglones','Sin valor','% sin valor']];
monthSh.getRange('H25:H27').values=[['2026-08'],['2026-09'],['2026-10']];
monthSh.getRange('I25:L27').formulas=Array.from({length:3},(_,i)=>{const r=i+25;return [`=SUMIFS('Detalle'!$M$2:$M$1493,'Detalle'!$O$2:$O$1493,H${r})`,`=COUNTIFS('Detalle'!$O$2:$O$1493,H${r})`,`=J${r}-COUNTIFS('Detalle'!$O$2:$O$1493,H${r},'Detalle'!$M$2:$M$1493,"<>")`,`=IF(J${r}=0,"",K${r}/J${r})`];});
monthSh.getRange('I25:I27').setNumberFormat(MONEY);monthSh.getRange('J25:K27').setNumberFormat(INT);monthSh.getRange('L25:L27').setNumberFormat(PCT);
monthSh.getRange('H24:L27').format={font:{name:'Arial',size:10,color:C.ink},rowHeight:26};
monthSh.getRange('H24:H27').format.columnWidthPx=110;monthSh.getRange('I24:I27').format.columnWidthPx=150;monthSh.getRange('J24:L27').format.columnWidthPx=115;
header(monthSh,'H24:L24');
for(let i=0;i<3;i++)sum.getRange(`L${50+i}:N${50+i}`).formulas=[[`='Por mes y rubro'!I${25+i}`,`='Por mes y rubro'!J${25+i}`,`='Por mes y rubro'!K${25+i}`]];
chart(monthSh,[sum.getRange('K49:K52'),sum.getRange('L49:L52')],'Valor registrado por mes (pesos sin IVA)','H2','R20',{horizontal:false});
monthSh.getRange('H29:R29').merge();monthSh.getRange('H29').values=[['Agosto y octubre son parciales. No se extrapolan a meses completos.']];monthSh.getRange('H29:R29').format.font={name:'Arial',size:10,color:C.muted,italic:true};

chart(sum,[wb.worksheets.getItem('Por sector').getRange('A1:A7'),wb.worksheets.getItem('Por sector').getRange('C1:C7')],'Valor por sector (pesos sin IVA)','B13','I27');
chart(sum,[wb.worksheets.getItem('Por rubro').getRange('A1:A7'),wb.worksheets.getItem('Por rubro').getRange('C1:C7')],'6 rubros con mayor valor registrado','K13','R27');
chart(sum,[sum.getRange('K49:K52'),sum.getRange('L49:L52')],'Valor por mes (pesos sin IVA)','B29','I42',{horizontal:false});
chart(sum,sum.getRange('O49:P51'),'Cobertura de valorización (renglones)','K29','R42',{type:'doughnut',legend:true,color:C.blue,money:false});
sum.getRange('B43:Q43').merge();sum.getRange('B43').values=[['Agosto y octubre son parciales. Valores a costos del 13/10/2026, en pesos sin IVA.']];
sum.getRange('B45:Q46').merge();sum.getRange('B45').values=[['Este registro es un mínimo: incluye solo los retiros que pasaron por la hoja de papel. El consumo total requiere el historial de ventas de Rebollar.']];
sum.getRange('B43:Q46').format={font:{name:'Arial',size:10,color:C.muted},wrapText:true};
// Use generous spans for the few chart support values; all remain inspectable.
sum.getRange('B48:Q60').clear({applyTo:'all'});
sum.getRange('B48:Q48').merge();sum.getRange('B48').values=[['Totales por mes y cobertura de valorización']];sum.getRange('B48:Q48').format.font={name:'Arial',size:11,bold:true,color:C.navy};
const mergeValue=(range,value,formula=false)=>{sum.getRange(range).merge();const a=range.split(':')[0];sum.getRange(a)[formula?'formulas':'values']=[[value]];};
mergeValue('B49:D49','Mes');mergeValue('E49:G49','Valor ($)');mergeValue('H49:I49','Renglones');mergeValue('K49:N49','Cobertura');mergeValue('O49:Q49','Renglones');
header(sum,'B49:I49');header(sum,'K49:Q49');
for(let i=0;i<3;i++){
  mergeValue(`B${50+i}:D${50+i}`,['Ago 2026','Sep 2026','Oct 2026'][i]);
  mergeValue(`E${50+i}:G${50+i}`,`='Por mes y rubro'!I${25+i}`,true);
  mergeValue(`H${50+i}:I${50+i}`,`='Por mes y rubro'!J${25+i}`,true);
}
mergeValue('K50:N50','Con valor');mergeValue('K51:N51','Sin valor');mergeValue('O50:Q50','=G7-O7',true);mergeValue('O51:Q51','=O7',true);
mergeValue('K53:N53','Con valor (%)');mergeValue('O53:Q53','=IF(G7=0,"",O50/G7)',true);sum.getRange('O53:Q53').setNumberFormat(PCT);
sum.getRange('E50:G52').setNumberFormat(MONEY);sum.getRange('H50:I52').setNumberFormat(INT);sum.getRange('O50:Q51').setNumberFormat(INT);
sum.getRange('B50:Q53').format={font:{name:'Arial',size:10,color:C.ink},rowHeight:26,verticalAlignment:'center'};
sum.getRange('B58:Q58').merge();sum.getRange('B58').values=[['Generado el 13/10/2026. Solicitudes y personas corresponden al corte original del histórico.']];sum.getRange('B58:Q58').format.font={name:'Arial',size:10,color:C.muted};
// Rebind after changing the layout of chart support cells.
const sumCharts=sum.charts.items;
sumCharts[2].delete();sumCharts[3].delete();
chart(sum,[sum.getRange('B49:B52'),sum.getRange('E49:E52')],'Valor por mes (pesos sin IVA)','B29','I42',{horizontal:false});
chart(sum,[sum.getRange('K49:K51'),sum.getRange('O49:O51')],'Cobertura de valorización (renglones)','K29','R42',{type:'doughnut',legend:true,money:false});
monthSh.charts.items[0].delete();
chart(monthSh,[sum.getRange('B49:B52'),sum.getRange('E49:E52')],'Valor registrado por mes (pesos sin IVA)','H2','R20',{horizontal:false});

wb.recalculate();
const actual=sum.getRange('B7').values[0][0];const expected=detail.reduce((a,r)=>a+(r.M??0),0);
if(Math.abs(actual-expected)>0.011)throw new Error(`Total mismatch: ${actual} != ${expected}`);
if(sum.getRange('G7').values[0][0]!==1492||sum.getRange('O7').values[0][0]!==383)throw new Error('Count mismatch');
// Zero is a valued record; a genuinely blank amount is pending.
dsh.getRange('M2').values=[[0]];
if(sum.getRange('O7').values[0][0]!==382||monthSh.getRange('K25').values[0][0]!==136)throw new Error('Blank versus zero check failed');
dsh.getRange('M2').values=[[null]];
wb.recalculate();
for(let i=0;i<3;i++){
  const expectedMonth=monthMap[['2026-08','2026-09','2026-10'][i]];
  const vals=monthSh.getRange(`I${25+i}:K${25+i}`).values[0];
  if(Math.abs(vals[0]-expectedMonth.value)>0.011||vals[1]!==expectedMonth.rows||vals[2]!==expectedMonth.missing)throw new Error(`Month mismatch ${JSON.stringify(vals)}`);
}
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},summary:'Final formula scan',maxChars:3000})).ndjson);
console.log((await wb.inspect({kind:'table',range:'Resumen!B6:Q11',include:'values,formulas',tableMaxRows:6,tableMaxCols:16,maxChars:3500})).ndjson);
const previews=[['Resumen','A1:R46'],['Detalle','A1:I9'],['Por sector','A1:R24'],['Por rubro','A1:R23'],['Por persona','A1:R24'],['Por obra','A1:R24'],['Por mes y rubro','A1:R33'],['Por producto','A1:T24'],['Sin valorizar','A1:Q26'],['Registro nuevo (desde 13-10)','A1:P14']];
for(let i=0;i<previews.length;i++){
  const [sheetName,range]=previews[i];const blob=await wb.render({sheetName,range,scale:1.3,format:'png'});
  await fs.writeFile(path.join(workDir,`final-${i}.png`),new Uint8Array(await blob.arrayBuffer()));
}
const supportPreview=await wb.render({sheetName:'Resumen',range:'B48:Q58',scale:1.3,format:'png'});
await fs.writeFile(path.join(workDir,'final-support.png'),new Uint8Array(await supportPreview.arrayBuffer()));
const outputPath=path.join(workDir,'..','consumo-consumibles-mejorado.xlsx');
await(await SpreadsheetFile.exportXlsx(wb)).save(outputPath);
await fs.writeFile(path.join(workDir,'verification.json'),JSON.stringify({total:actual,rows:1492,missing:383,months:monthMap,sheets:previews.map(p=>p[0]),chartBindings:previews.flatMap(([name])=>wb.worksheets.getItem(name).charts.items.map(c=>({sheet:name,title:c.title.text,series:c.series.items.map(s=>({formula:s.formula,categoryFormula:s.categoryFormula}))})))},null,2));
console.log(JSON.stringify({output:outputPath,total:actual,sheets:10,charts:11}));
