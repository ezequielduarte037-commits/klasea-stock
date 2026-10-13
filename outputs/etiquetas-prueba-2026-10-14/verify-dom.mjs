import fs from 'node:fs';
const directory='outputs/etiquetas-prueba-2026-10-14';
const dom=fs.readFileSync(`${directory}/chrome-fonts-dom-corrected.html`,'utf8');
if(!dom.includes('data-fonts-ready="true"'))throw Error('Fonts were not loaded');
const match=dom.match(/<script type="application\/json" id="label-geometry">(.*?)<\/script>/s);
if(!match)throw Error('Geometry missing');
const rows=JSON.parse(match[1]);
if(rows.length!==5)throw Error('Expected five labels');
for(const r of rows){
 if(r.boxSizing!=='border-box')throw Error('App global border-box rule is missing');
 if(r.qr.right>r.page.width+0.1||r.qr.bottom>r.page.height+0.1)throw Error('QR is clipped');
 if(r.bars.right>r.page.width+0.1||r.bars.bottom>r.page.height+0.1)throw Error('Bars are clipped');
}
fs.writeFileSync(`${directory}/label-geometry.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify({labels:5,fontsLoaded:true,boxSizing:'border-box',qrAndBarsFullyInsidePage:true,first:rows[0]},null,2));
const html=fs.readFileSync(`${directory}/etiquetas-5.html`,'utf8');
fs.writeFileSync(`${directory}/etiquetas-5-missing-reset-diagnostic.html`,html.replace('*,*::before,*::after{box-sizing:border-box}',''));
