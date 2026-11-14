import { CSS_PAPEL, FUENTES_PAPEL, fechaRotulo } from "@/lib/impresionKlasea";

// Impresion / envio de FALTANTES de muebles de una unidad (barco).
// Abre una ventana con el papel de la casa (lib/impresionKlasea). Permite imprimir,
// guardar como PDF o mandar la lista por WhatsApp. Espeja el patron de
// printPurchaseRequest.js.

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Solo destacamos los estados "especiales"; "No enviado" es el faltante por
// defecto y va sin badge para no ensuciar la lista.
function estadoBadge(estado) {
  if (estado === "Parcial")  return '<span class="kp-marca-estado acento">Parcial</span>';
  if (estado === "Rehacer")  return '<span class="kp-marca-estado rojo">Rehacer</span>';
  return "";
}

export function printFaltantes({ linea, unidad, chapa, faltantes = [], total = 0 }, logoUrl) {
  const titulo = `${esc(linea)} · ${esc(unidad)}`;
  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Agrupar por sector preservando el orden de llegada.
  const groups = {};
  for (const f of faltantes) {
    const s = f.sector || "General";
    (groups[s] = groups[s] || []).push(f);
  }

  // Texto para WhatsApp (formato liviano).
  const waLines = [`*Faltantes — ${linea} · ${unidad}*`];
  if (chapa) waLines.push(`Chapa: ${chapa}`);
  waLines.push(`${faltantes.length} de ${total} muebles pendientes`, "");
  for (const [sector, rows] of Object.entries(groups)) {
    waLines.push(`*${sector}*`);
    for (const r of rows) waLines.push(`• ${r.nombre}${r.estado && r.estado !== "No enviado" ? ` (${r.estado})` : ""}`);
    waLines.push("");
  }
  const waText = encodeURIComponent(waLines.join("\n").trim());

  const absLogoUrl = logoUrl?.startsWith("/") ? window.location.origin + logoUrl : logoUrl;

  const seccionesHtml = faltantes.length
    ? Object.entries(groups).map(([sector, rows]) => `
      <section class="sector">
        <h2 class="kp-seccion">${esc(sector)} <span class="kp-cuenta">${rows.length}</span></h2>
        ${rows.map((r, i) => `
          <div class="item">
            <div class="item-num">${String(i + 1).padStart(2, "0")}</div>
            <div class="item-main">
              <div class="item-top">
                <span class="item-name">${esc(r.nombre)}</span>
                ${r.medidas ? `<span class="item-med">${esc(r.medidas)}</span>` : ""}
                ${estadoBadge(r.estado)}
              </div>
              ${r.obs ? `<div class="item-obs">${esc(r.obs)}</div>` : ""}
            </div>
            <div class="item-check" aria-hidden="true"></div>
          </div>
        `).join("")}
      </section>
    `).join("")
    : `<div class="empty">Sin faltantes: todos los muebles están completos.</div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Faltantes ${titulo}</title>
${FUENTES_PAPEL}
<style>
  ${CSS_PAPEL}
  .sector{break-inside:avoid}
  .item{display:flex;align-items:flex-start;gap:14px;padding:10px 0;border-bottom:1px solid var(--kp-pelo);break-inside:avoid}
  .item-num{flex-shrink:0;width:22px;padding-top:1px;color:var(--kp-gris-suave);font-size:11px;font-variant-numeric:tabular-nums}
  .item-main{flex:1;min-width:0}
  .item-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .item-name{font-size:14px;font-weight:400}
  .item-med{font-size:11px;color:var(--kp-gris);font-family:'JetBrains Mono',ui-monospace,Consolas,monospace}
  .item-obs{font-size:12px;color:var(--kp-gris);margin-top:3px}
  .item-check{flex-shrink:0;width:12px;height:12px;margin-top:3px;border:1px solid var(--kp-gris)}
  .empty{padding:48px 0;text-align:center;font-weight:300;font-size:18px;color:var(--kp-gris)}
</style>
</head>
<body>

<div class="kp-botonera">
  <button class="kp-boton" onclick="window.close()">Cerrar</button>
  <button class="kp-boton" onclick="window.open('https://wa.me/?text=${waText}','_blank')">WhatsApp</button>
  <button class="kp-boton primario" onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<main class="kp-hoja">
  <header class="kp-barra">
    <span class="kp-rotulo">Muebles</span>
    ${absLogoUrl ? `<span class="kp-marca-caja"><img class="kp-marca" src="${esc(absLogoUrl)}" alt="Klase A" /></span>` : '<span class="kp-marca-texto">KLASE A</span>'}
    <span class="kp-rotulo">${esc(fechaRotulo())}</span>
  </header>

  <p class="kp-eyebrow">Faltantes de producción</p>
  <h1 class="kp-titulo">${titulo}</h1>

  <div class="kp-ficha">
    <div><span class="kp-rotulo">Pendientes</span><b${faltantes.length ? ' class="alerta"' : ""}>${faltantes.length}</b></div>
    <div><span class="kp-rotulo">Muebles</span><b>${total}</b></div>
    ${chapa ? `<div><span class="kp-rotulo">Chapa</span><b class="chico">${esc(chapa)}</b></div>` : ""}
  </div>

  ${seccionesHtml}

  <footer class="kp-pie"><span>Klase A Yachts · Muebles</span><span>Generado el ${esc(fecha)}</span></footer>
</main>

<script>
  (function(){
    function go(){ setTimeout(function(){ try{ window.focus(); window.print(); }catch(e){} }, 350); }
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  })();
</script>

</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=760");
  if (!win) {
    alert("El navegador bloqueó la ventana emergente. Habilitá los pop-ups para este sitio.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
