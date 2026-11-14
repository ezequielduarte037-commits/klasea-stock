// Papel de Klase A para lo que se imprime desde una ventana HTML (encargos a
// Compras, faltantes de muebles…). Es la misma idea que lib/pdfKlasea.js:
// mucho blanco, títulos grandes en mayúsculas finas, rótulos chiquitos y
// espaciados, líneas de un pelo y nada de cajas de colores.
//
// Acá sí se puede usar la letra de la marca: Outfit en peso liviano.
//
// Estructura:
//   <header class="kp-barra"><span class="kp-rotulo">Compras</span>LOGO<span class="kp-rotulo">12 NOV 2026</span></header>
//   <p class="kp-eyebrow">Encargo a Compras</p>
//   <h1 class="kp-titulo">Título</h1>
//   <div class="kp-ficha"><div><span class="kp-rotulo">Obra</span><b>52-27</b></div>…</div>
//   <h2 class="kp-seccion">Ítems</h2>
//   <table class="kp-tabla">…</table>
//   <footer class="kp-pie"><span>…</span><span>…</span></footer>

export const FUENTES_PAPEL = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap">`;

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** "12 NOV 2026", la fecha como rótulo. */
export function fechaRotulo(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export const CSS_PAPEL = `
  :root{
    --kp-tinta:#242426;--kp-gris:#7c7e82;--kp-gris-suave:#a8aaae;
    --kp-pelo:#d6d8db;--kp-niebla:#edeff1;--kp-fondo:#f4f3f1;
    --kp-acento:#18263e;--kp-rojo:#a82424;
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{background:var(--kp-fondo)}
  body{font-family:'Outfit','Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:400;color:var(--kp-tinta);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}

  /* Botonera (no se imprime): botones de contorno, como un "ver más" */
  .kp-botonera{max-width:210mm;margin:22px auto 14px;padding:0 16px;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;align-items:center}
  .kp-botonera p{flex:1 1 100%;order:9;font-size:12px;color:var(--kp-gris);text-align:right}
  .kp-boton{min-height:40px;padding:9px 20px;border:1px solid var(--kp-tinta);border-radius:999px;background:transparent;color:var(--kp-tinta);font:500 11px/1 'Outfit','Helvetica Neue',Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;transition:background .15s,color .15s}
  .kp-boton:hover{background:var(--kp-tinta);color:#fff}
  .kp-boton.primario{background:var(--kp-tinta);color:#fff}
  .kp-boton.primario:hover{background:#000}
  .kp-boton:focus-visible{outline:2px solid var(--kp-acento);outline-offset:3px}
  .kp-boton:disabled{opacity:.55;cursor:wait}

  /* La hoja */
  .kp-hoja{max-width:210mm;margin:0 auto 28px;padding:15mm 17mm 13mm;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 40px rgba(0,0,0,.06)}

  /* Barra de arriba: sección · marca · fecha */
  .kp-barra{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding-bottom:12px;border-bottom:1px solid var(--kp-pelo)}
  .kp-barra > :last-child{text-align:right}
  /* logo-klasea.png es blanco y trae mucho margen: se recorta al dibujo
     (x 177-1376, y 324-683 de 1536x1024) y se pasa a tinta. El alto se
     maneja con font-size. */
  .kp-marca-caja{display:block;position:relative;overflow:hidden;font-size:20px;width:3.34em;height:1em}
  .kp-marca{position:absolute;left:-.493em;top:-.9025em;width:4.278em;height:auto;max-width:none;filter:invert(1);opacity:.9}
  .kp-marca-texto{font-weight:500;font-size:13px;letter-spacing:.32em}
  .kp-rotulo{font-size:9px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--kp-gris)}
  .kp-barra .kp-rotulo{color:var(--kp-tinta)}

  /* Título */
  .kp-eyebrow{margin-top:34px;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--kp-gris)}
  .kp-titulo{margin:8px 0 6px;font-weight:300;font-size:40px;line-height:1.04;letter-spacing:-.01em;text-transform:uppercase;overflow-wrap:anywhere}
  .kp-sub{font-size:15px;color:var(--kp-tinta)}
  .kp-detalle{font-size:12px;color:var(--kp-gris);margin-top:2px}

  /* Ficha: cifras como datos técnicos, separadas por un pelo */
  .kp-ficha{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin:26px 0 8px;border-top:1px solid var(--kp-pelo);border-bottom:1px solid var(--kp-pelo)}
  .kp-ficha > div{padding:12px 16px 13px;border-left:1px solid var(--kp-pelo);min-width:0}
  .kp-ficha > div:first-child{border-left:0;padding-left:0}
  .kp-ficha b{display:block;margin-top:5px;font-weight:300;font-size:22px;line-height:1.15;overflow-wrap:anywhere}
  .kp-ficha b.chico{font-size:15px;font-weight:400;line-height:1.35}
  .kp-ficha .alerta{color:var(--kp-rojo)}

  /* Sección: rótulo y una línea que llega al margen */
  .kp-seccion{display:flex;align-items:center;gap:14px;margin:30px 0 6px;font-size:10px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--kp-tinta)}
  .kp-seccion::after{content:"";flex:1;height:1px;background:var(--kp-pelo)}
  .kp-seccion .kp-cuenta{order:3;color:var(--kp-gris);font-weight:400}

  /* Tabla */
  .kp-tabla{width:100%;border-collapse:collapse;table-layout:fixed}
  .kp-tabla th{padding:6px 8px 8px;text-align:left;font-size:9px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;color:var(--kp-gris);border-bottom:1px solid var(--kp-tinta)}
  .kp-tabla td{padding:11px 8px;vertical-align:top;border-bottom:1px solid var(--kp-pelo);overflow-wrap:anywhere}
  .kp-tabla .num{text-align:right;font-variant-numeric:tabular-nums}
  .kp-tabla .apagado{color:var(--kp-gris)}

  /* Marcas: borde de un pelo y letra espaciada */
  .kp-marca-estado{display:inline-block;padding:2px 8px;border:1px solid currentColor;border-radius:999px;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;vertical-align:2px}
  .kp-marca-estado.rojo{color:var(--kp-rojo)}
  .kp-marca-estado.acento{color:var(--kp-acento)}

  /* Pie */
  .kp-pie{display:flex;justify-content:space-between;gap:16px;margin-top:34px;padding-top:10px;border-top:1px solid var(--kp-pelo);font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--kp-gris)}

  @media screen and (max-width:560px){
    .kp-botonera{margin-top:12px}
    .kp-boton{flex:1}
    .kp-botonera p{text-align:left}
    .kp-hoja{padding:22px 18px;margin:0}
    .kp-barra{grid-template-columns:1fr auto;}
    .kp-barra > :first-child{display:none}
    .kp-titulo{font-size:30px}
  }
  @page{size:A4 portrait;margin:14mm 15mm}
  @media print{
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    body{font-size:10.5pt}
    .kp-botonera{display:none!important}
    .kp-hoja{max-width:none;margin:0;padding:0;box-shadow:none}
    .kp-titulo,.kp-seccion{break-after:avoid;page-break-after:avoid}
    .kp-ficha,.kp-tabla tr{break-inside:avoid;page-break-inside:avoid}
    .kp-tabla thead{display:table-header-group}
  }
`;
