const texto = (value) => String(value ?? "").trim();
const normalizar = (value) => texto(value).toLowerCase();
export const codigoObraEtiqueta = (codigo) => texto(codigo).replace(/^k(?=\d)/i, "");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const FORMATOS_ETIQUETAS_MUEBLES = [
  { id: "40x30", nombre: "40 × 30 mm", ancho: 40, largo: 30, disenoAncho: 40, disenoAlto: 30, rotar: false },
  { id: "50x80", nombre: "50 × 80 mm", ancho: 50, largo: 80, disenoAncho: 80, disenoAlto: 50, rotar: true },
];

export function prepararEtiquetasMuebles({ unidad, linea, piezas = [], plantilla = [], ots = [] }) {
  const obra = codigoObraEtiqueta(unidad?.codigo);
  if (!unidad?.id || !obra || !linea?.id || unidad.linea_id !== linea.id) throw Error("Elegí una obra y su línea de muebles.");
  if (piezas.some(p => p.unidad_id !== unidad.id) || plantilla.some(p => p.linea_id !== linea.id)) {
    throw Error("Las piezas o los números no corresponden a esta obra.");
  }
  const ot = ots.find(o => normalizar(o.modelo) === normalizar(linea.nombre)
    && normalizar(codigoObraEtiqueta(o.barco)) === normalizar(obra));
  const enchapado = texto(ot?.tipo_chapa) || texto(unidad.chapa_manual);
  const numeros = new Map(plantilla.map(p => [p.mueble_id, p.nro_pieza]));
  const ids = new Set();
  const muebles = new Set();
  const numerosUsados = new Set();
  const etiquetas = piezas.filter(p => normalizar(p.estado) !== "no lleva").map(p => {
    if (!p.id || !p.mueble_id || ids.has(p.id) || muebles.has(p.mueble_id)) throw Error("Hay piezas repetidas. Actualizá la obra antes de imprimir.");
    ids.add(p.id); muebles.add(p.mueble_id);
    const numeroRaw = numeros.get(p.mueble_id);
    const numero = numeroRaw != null && Number.isSafeInteger(Number(numeroRaw)) && Number(numeroRaw) > 0 ? Number(numeroRaw) : null;
    if (numero && numerosUsados.has(numero)) throw Error("Dos piezas tienen el mismo número. Revisá la plantilla de la línea.");
    if (numero) numerosUsados.add(numero);
    const nombre = texto(p.prod_muebles?.nombre);
    return { id: p.id, obra, numero, nombre, sector: texto(p.prod_muebles?.sector), enchapado, imprimible: Boolean(numero && nombre) };
  }).sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity) || a.nombre.localeCompare(b.nombre, "es-AR", { numeric: true }));
  return { unidad, linea, obra, enchapado, etiquetas };
}

export function seleccionarEtiquetasMuebles(datos, ids) {
  if (!Array.isArray(ids) || !ids.length) throw Error("Seleccioná al menos una pieza para imprimir.");
  const seleccion = new Set(ids);
  const etiquetas = datos.etiquetas.filter(e => seleccion.has(e.id));
  if (seleccion.size !== ids.length || etiquetas.length !== seleccion.size) throw Error("Cambió la lista de piezas. Actualizá y volvé a seleccionar.");
  if (etiquetas.some(e => !e.imprimible)) throw Error("Las piezas seleccionadas necesitan nombre y número de línea.");
  return etiquetas;
}

export function construirHtmlEtiquetasMuebles({ datos, ids, autoPrint = false, vistaPrevia = false, formato = "50x80" }) {
  const papel = FORMATOS_ETIQUETAS_MUEBLES.find(f => f.id === formato);
  if (!papel) throw Error("Elegí un tamaño de etiqueta disponible.");
  const compacto = formato === "40x30";
  const etiquetas = seleccionarEtiquetasMuebles(datos, ids);
  const paginas = etiquetas.map(e => `<section class="et-page"><article class="et-label">
    <header class="et-header"><span class="et-brand">KLASE A</span><strong class="et-obra" data-fit data-max="${compacto ? 13 : 22}" data-min="${compacto ? 8 : 12}">${esc(e.obra)}</strong></header>
    <div class="et-main"><div class="et-description"><div class="et-sector" data-fit data-max="${compacto ? 6 : 8}" data-min="${compacto ? 4.5 : 6}">${esc(e.sector || "Muebles")}</div><div class="et-name" data-fit data-max="${compacto ? 10 : 18}" data-min="${compacto ? 5.5 : 9}">${esc(e.nombre)}</div></div><div class="et-number"><span>PIEZA</span><strong data-fit data-max="${compacto ? 18 : 28}" data-min="${compacto ? 9 : 12}">${esc(e.numero)}</strong></div></div>
    <div class="et-veneer"><span>ENCHAPADO</span><strong data-fit data-max="${compacto ? 10 : 15}" data-min="${compacto ? 6 : 9}">${esc(e.enchapado || "Enchapado a confirmar")}</strong></div>
  </article></section>`).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiquetas de muebles · ${esc(datos.obra)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{padding:20px;background:#edf0f3;color:#162d40;font-family:Arial,Helvetica,sans-serif}
  .toolbar{max-width:920px;margin:0 auto 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.toolbar h1{font-size:19px;margin:0 0 6px}.toolbar p{font-size:12px;line-height:1.5;color:#526373;margin:0}.actions{display:flex;gap:8px;flex-wrap:wrap}
  button{border:1px solid #cbd3da;background:white;border-radius:8px;padding:10px 14px;font:600 13px Arial;color:#162d40;cursor:pointer}#print-all{background:#163e5d;color:white;border-color:#163e5d}button:disabled{opacity:.5;cursor:default}
  #warning{max-width:920px;margin:0 auto 16px;padding:10px 12px;background:#fff3d9;border:1px solid #e9cc89;border-radius:8px;color:#725016;font-size:13px}#warning:empty{display:none}
  .pages{display:flex;justify-content:center;flex-wrap:wrap;gap:20px;max-width:1040px;margin:auto}.et-page{width:${papel.disenoAncho}mm;height:${papel.disenoAlto}mm;background:white;box-shadow:0 2px 12px #163e5d18;outline:1px solid #d9dfe4;flex:none}
  .et-label{width:80mm;height:50mm;padding:3mm 4mm;color:black;background:white;display:grid;grid-template-rows:9.5mm 15mm auto;align-content:center;gap:1.5mm;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
  .et-header{display:grid;grid-template-columns:minmax(0,1fr) 32mm;align-items:center;border-bottom:.25mm solid black;padding-bottom:1mm;min-height:0}.et-brand{font-size:14pt;font-style:italic;line-height:1;letter-spacing:.02em}.et-obra{font-size:22pt;font-weight:700;line-height:1;text-align:right;height:8mm}
  .et-main{display:grid;grid-template-columns:minmax(0,1fr) 16mm;gap:2mm;min-height:0}.et-description{display:grid;grid-template-rows:3.5mm minmax(0,1fr);gap:1mm;min-width:0;min-height:0}.et-sector{font-size:8pt;font-weight:700;line-height:1.1;letter-spacing:.06em;text-transform:uppercase}.et-name{font-size:18pt;font-weight:700;line-height:1.06}
  .et-number{border-left:.25mm solid black;padding-left:2mm;display:grid;grid-template-rows:3mm minmax(0,1fr);gap:1mm;text-align:center;min-height:0}.et-number span,.et-veneer>span{font-size:7pt;line-height:1.15;letter-spacing:.07em}.et-number strong{font-size:28pt;line-height:1;font-weight:700}
  .et-veneer{border:.25mm solid black;border-radius:1mm;padding:1.2mm 1.5mm;display:flex;flex-direction:column;gap:.7mm;min-width:0}.et-veneer strong{font-size:15pt;line-height:1.06;max-height:9.5mm;flex:none}
  [data-fit]{min-width:0;min-height:0;overflow-wrap:anywhere}
  body.preview{padding:0;background:transparent;overflow:hidden}.preview .toolbar,.preview #warning{display:none}.preview .pages{flex-wrap:nowrap;gap:0}.preview .et-page{box-shadow:none;outline:none;transform:scale(var(--preview-scale,1));transform-origin:top center}
  ${compacto ? `
  .et-label{width:40mm;height:30mm;padding:1.5mm 2mm;grid-template-rows:6mm 9mm 7mm;gap:.8mm}
  .et-header{grid-template-columns:minmax(0,1fr) 18mm;padding-bottom:.5mm}.et-brand{font-size:8pt}.et-obra{height:5mm}
  .et-main{grid-template-columns:minmax(0,1fr) 8mm;gap:1mm}.et-description{grid-template-rows:2.5mm minmax(0,1fr);gap:.5mm}
  .et-sector{letter-spacing:.02em}.et-number{padding-left:1mm;grid-template-rows:2mm minmax(0,1fr);gap:.5mm}.et-number span,.et-veneer>span{font-size:5pt;letter-spacing:.02em}
  .et-veneer{padding:.5mm 1mm;gap:.3mm;border-radius:.5mm}.et-veneer strong{max-height:4mm}
  ` : ""}
  @page{size:${papel.ancho}mm ${papel.largo}mm;margin:0}@media print{html,body{margin:0!important;padding:0!important;background:white!important}.toolbar,#warning{display:none!important}.pages{display:block;max-width:none;margin:0}.et-page{position:relative;width:${papel.ancho}mm;height:${papel.largo - .3}mm;margin:0;outline:none;box-shadow:none;overflow:hidden;break-inside:avoid;break-after:page;page-break-after:always}.et-page:last-child{break-after:auto;page-break-after:auto}.et-label{position:absolute;left:0;top:0;transform-origin:0 0;transform:${papel.rotar ? `translateX(${papel.ancho}mm) rotate(90deg)` : "none"}}body.print-one .et-page:not(:first-child){display:none!important}body.print-one .et-page:first-child{break-after:auto;page-break-after:auto}}
</style></head><body${vistaPrevia ? ' class="preview"' : ""}>
<header class="toolbar"><div><h1>Etiquetas de muebles · ${esc(datos.obra)}</h1><p>${etiquetas.length} etiquetas · Una por pieza · Papel ${papel.nombre}</p><p>P1S: papel ${papel.nombre}, ${papel.rotar ? "orientación vertical" : "sin giro"}, escala 100 %, sin márgenes ni encabezados.</p></div><div class="actions"><button id="print-one" disabled>Probar una</button><button id="print-all" disabled>Imprimir todas (${etiquetas.length})</button></div></header>
<div id="warning">${!datos.enchapado ? "Falta el enchapado: las etiquetas dirán «Enchapado a confirmar»." : ""}</div><main class="pages">${paginas}</main>
<script>(function(){var ready=false;function fit(){var failed=false;document.querySelectorAll('[data-fit]').forEach(function(el){var size=Number(el.dataset.max),min=Number(el.dataset.min);el.style.fontSize=size+'pt';while(size>min&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)){size=Math.max(min,size-.5);el.style.fontSize=size+'pt'}if(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)failed=true});if(failed)document.getElementById('warning').textContent='Hay un nombre, enchapado o número demasiado largo. Revisalo antes de imprimir.';document.documentElement.style.setProperty('--preview-scale',Math.min(1,document.documentElement.clientWidth/(${papel.disenoAncho}*96/25.4)));return !failed}function print(one){if(!ready||!fit())return;document.body.classList.toggle('print-one',one);window.focus();window.print()}document.getElementById('print-one').addEventListener('click',function(){print(true)});document.getElementById('print-all').addEventListener('click',function(){print(false)});window.addEventListener('afterprint',function(){document.body.classList.remove('print-one')});window.addEventListener('beforeprint',fit);window.addEventListener('resize',fit);async function init(){if(document.fonts)await document.fonts.ready;ready=fit();document.getElementById('print-one').disabled=!ready;document.getElementById('print-all').disabled=!ready;document.documentElement.dataset.etiquetasReady=String(ready);${autoPrint && !vistaPrevia ? "if(ready)requestAnimationFrame(function(){print(false)});" : ""}}if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true})})();</script></body></html>`;
}
