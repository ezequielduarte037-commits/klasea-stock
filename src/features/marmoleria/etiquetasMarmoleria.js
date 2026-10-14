import { cleanText } from "./marmShared.js";

export const FORMATO_ETIQUETAS_MARMOLERIA = {
  ancho: 80,
  alto: 50,
  papelAncho: 50,
  papelAlto: 80,
};

const comparar = (a, b) => a.localeCompare(b, "es-AR", { numeric: true, sensitivity: "base" });

/** Una etiqueta por pieza del barco, independientemente del filtro del checklist. */
export function armarEtiquetasMarmoleria({ unidad, piezas = [] }) {
  const obra = cleanText(unidad?.codigo);
  if (!unidad?.id || !obra) throw new Error("Elegí una embarcación para imprimir sus etiquetas.");
  if (piezas.some((p) => p.unidad_id !== unidad.id)) {
    throw new Error("Las piezas no corresponden a la embarcación seleccionada.");
  }
  const activas = piezas.filter((p) => cleanText(p.estado).toLowerCase() !== "no lleva");
  if (activas.some((p) => !cleanText(p.pieza))) throw new Error("Hay una pieza sin nombre. Completalo antes de imprimir.");
  if (new Set(activas.map((p) => p.id)).size !== activas.length) throw new Error("Hay piezas repetidas en la lista. Actualizá el barco.");
  const etiquetas = activas.map((p) => ({
    id: p.id,
    obra,
    sector: cleanText(p.sector),
    pieza: cleanText(p.pieza),
    material: cleanText(p.color),
  })).sort((a, b) => comparar(a.sector, b.sector) || comparar(a.pieza, b.pieza) || comparar(a.id, b.id));
  return { obra, etiquetas, sinMaterial: etiquetas.filter((e) => !e.material).length };
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** El diseño se ve horizontal; al imprimir gira para el rollo de 50 × 80 mm. */
export function construirHtmlEtiquetasMarmoleria({ unidad, piezas, autoPrint = true }) {
  const { obra, etiquetas, sinMaterial } = armarEtiquetasMarmoleria({ unidad, piezas });
  if (!etiquetas.length) throw new Error("Esta embarcación no tiene piezas para etiquetar.");
  const f = FORMATO_ETIQUETAS_MARMOLERIA;
  const paginas = etiquetas.map((e) => `<section class="marm-label-page">
    <article class="marm-label" data-pieza-id="${esc(e.id)}">
      <header class="marm-label-header">
        <div class="marm-label-brand">KLASE A</div>
        <div class="marm-label-obra" data-fit data-max="22" data-min="12">${esc(e.obra)}</div>
      </header>
      <div class="marm-label-main">
        <div class="marm-label-sector" data-fit data-max="8.5" data-min="7">${esc(e.sector || "Pieza")}</div>
        <div class="marm-label-pieza" data-fit data-max="19" data-min="9">${esc(e.pieza)}</div>
      </div>
      <div class="marm-label-material-block">
        <div class="marm-label-caption">Material</div>
        <div class="marm-label-material" data-fit data-max="16" data-min="9">${esc(e.material || "Material a confirmar")}</div>
      </div>
    </article>
  </section>`).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Etiquetas de marmolería · ${esc(obra)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:#edf0f3;color:#162d40;font-family:Arial,Helvetica,sans-serif;padding:20px}
  .toolbar{max-width:920px;margin:0 auto 20px;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}
  h1{font-size:19px;margin:0 0 5px}
  .help{font-size:12px;line-height:1.5;color:#526373;margin:0}
  .actions{display:flex;gap:8px;flex-wrap:wrap}
  button{border:1px solid #cbd3da;background:white;border-radius:8px;padding:10px 14px;font:600 13px Arial;cursor:pointer;color:#162d40}
  #print-all{background:#163e5d;border-color:#163e5d;color:white}
  button:disabled{opacity:.5;cursor:default}
  #warning{max-width:920px;margin:0 auto 16px;padding:10px 12px;background:#fff3d9;border:1px solid #e9cc89;border-radius:8px;color:#725016;font-size:13px}
  #warning:empty{display:none}
  .pages{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;max-width:1040px;margin:auto}
  .marm-label-page{width:${f.ancho}mm;height:${f.alto}mm;background:white;box-shadow:0 2px 12px #163e5d18;outline:1px solid #d9dfe4;flex:none}
  .marm-label{width:${f.ancho}mm;height:${f.alto}mm;padding:3mm 4mm;color:black;background:white;display:grid;grid-template-rows:9.5mm 12.5mm auto;align-content:center;gap:1.5mm;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
  .marm-label-header{display:grid;grid-template-columns:minmax(0,1fr) 32mm;align-items:center;border-bottom:.25mm solid black;padding-bottom:1mm;min-height:0}
  .marm-label-brand{font-size:14pt;font-style:italic;line-height:1;font-weight:400;letter-spacing:.02em}
  .marm-label-obra{font-size:22pt;font-weight:700;line-height:1;text-align:right;height:8mm}
  .marm-label-main{display:grid;grid-template-rows:3.5mm minmax(0,1fr);gap:1mm;min-width:0;min-height:0}
  .marm-label-sector{font-size:8.5pt;font-weight:700;line-height:1.1;letter-spacing:.08em;text-transform:uppercase}
  .marm-label-pieza{font-size:19pt;font-weight:700;line-height:1.06}
  .marm-label-material-block{display:flex;flex-direction:column;gap:.8mm;padding:1.2mm 1.5mm;border:.25mm solid black;border-radius:1mm;min-width:0;min-height:0}
  .marm-label-caption{font-size:7pt;font-weight:400;line-height:1.15;letter-spacing:.08em;text-transform:uppercase}
  .marm-label-material{font-size:16pt;font-weight:700;line-height:1.06;max-height:12mm;flex:none}
  [data-fit]{min-width:0;min-height:0;overflow-wrap:anywhere}
  @page{size:${f.papelAncho}mm ${f.papelAlto}mm;margin:0}
  @media print{
    html,body{margin:0!important;padding:0!important;background:white!important}
    .toolbar,#warning{display:none!important}
    .pages{display:block;max-width:none;margin:0}
    .marm-label-page{position:relative;width:${f.papelAncho}mm;height:${f.papelAlto - 0.3}mm;margin:0;outline:none;box-shadow:none;overflow:hidden;break-inside:avoid;break-after:page;page-break-after:always}
    .marm-label-page:last-child{break-after:auto;page-break-after:auto}
    .marm-label{position:absolute;left:0;top:0;transform-origin:0 0;transform:translateX(${f.alto}mm) rotate(90deg)}
    body.print-one .marm-label-page:not(:first-child){display:none!important}
    body.print-one .marm-label-page:first-child{break-after:auto;page-break-after:auto}
  }
</style></head><body>
<header class="toolbar"><div><h1>Etiquetas · ${esc(obra)}</h1>
  <p class="help">${etiquetas.length} etiquetas · Una por pieza · Papel 50 × 80 mm</p>
  <p class="help">P1S: papel E 50 × 80 mm, orientación vertical, escala 100 %, sin márgenes ni encabezados.</p>
</div><div class="actions"><button id="print-one" disabled>Probar una</button><button id="print-all" disabled>Imprimir todas (${etiquetas.length})</button></div></header>
<div id="warning">${sinMaterial ? `${sinMaterial} ${sinMaterial === 1 ? "pieza sin material: saldrá" : "piezas sin material: saldrán"} como «Material a confirmar».` : ""}</div>
<main class="pages">${paginas}</main>
<script>
  (function(){
    var ready=false;
    function fit(){
      var failed=false;
      document.querySelectorAll('[data-fit]').forEach(function(el){
        var size=Number(el.dataset.max),min=Number(el.dataset.min);
        el.style.fontSize=size+'pt';
        while(size>min&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)){size=Math.max(min,size-.5);el.style.fontSize=size+'pt';}
        if(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)failed=true;
      });
      if(failed)document.getElementById('warning').textContent='Hay un nombre o material demasiado largo. Revisá las piezas antes de imprimir.';
      return !failed;
    }
    function print(one){
      if(!ready||!fit())return;
      document.body.classList.toggle('print-one',one);
      window.focus();window.print();
    }
    document.getElementById('print-one').addEventListener('click',function(){print(true)});
    document.getElementById('print-all').addEventListener('click',function(){print(false)});
    window.addEventListener('afterprint',function(){document.body.classList.remove('print-one')});
    window.addEventListener('beforeprint',fit);
    async function init(){
      if(document.fonts)await document.fonts.ready;
      ready=fit();
      document.getElementById('print-one').disabled=!ready;
      document.getElementById('print-all').disabled=!ready;
      document.documentElement.dataset.etiquetasReady=String(ready);
      ${autoPrint ? `if(ready)requestAnimationFrame(function(){print(false)});` : ""}
    }
    if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true});
  })();
</script></body></html>`;
}
