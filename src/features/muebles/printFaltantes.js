// Impresion / envio de FALTANTES de muebles de una unidad (barco).
// Abre una ventana con un diseno limpio + logo Klase A. Permite imprimir,
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
  if (estado === "Parcial")  return '<span class="badge badge-amber">Parcial</span>';
  if (estado === "Rehacer")  return '<span class="badge badge-red">Rehacer</span>';
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
        <div class="sector-head">
          <span class="sector-name">${esc(sector)}</span>
          <span class="sector-count">${rows.length}</span>
        </div>
        ${rows.map((r, i) => `
          <div class="item">
            <div class="item-num">${i + 1}</div>
            <div class="item-main">
              <div class="item-top">
                <span class="item-name">${esc(r.nombre)}</span>
                ${r.medidas ? `<span class="item-med">${esc(r.medidas)}</span>` : ""}
                ${estadoBadge(r.estado)}
              </div>
              ${r.obs ? `<div class="item-obs">${esc(r.obs)}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </section>
    `).join("")
    : `<div class="empty">✓ Sin faltantes — todos los muebles están completos.</div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Faltantes ${titulo}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--ink:#18181b;--muted:#71717a;--soft:#a1a1aa;--line:#e4e4e7;--amber:#b45309;--red:#b91c1c}
  html,body{background:#f4f4f5}
  body{font-family:'Segoe UI',Arial,sans-serif;color:var(--ink);padding:24px 16px 80px}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:34px 38px 42px;box-shadow:0 10px 40px rgba(0,0,0,.08)}

  /* Toolbar (no imprime) */
  .toolbar{max-width:820px;margin:0 auto 16px;display:flex;gap:8px;justify-content:flex-end}
  .toolbar button{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink);transition:all .15s}
  .toolbar button:hover{background:#f4f4f5}
  .toolbar .b-print{background:#18181b;border-color:#18181b;color:#fff}
  .toolbar .b-wa{background:#25d366;border-color:#1ebe5a;color:#062b14}

  /* Header */
  .hdr{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid var(--ink)}
  .hdr-logo{height:26px;width:auto;display:block;filter:invert(1)}
  .hdr-meta{text-align:right;line-height:1.5}
  .hdr-kicker{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--soft);font-weight:700}
  .hdr-date{font-size:12px;color:var(--muted);margin-top:2px}

  /* Titulo + chips */
  .title{font-size:25px;font-weight:800;letter-spacing:-.01em;margin:18px 0 12px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
  .chip{font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .chip strong{color:var(--ink);font-weight:800}
  .chip-warn{background:#fffbeb;border-color:#fde68a;color:#92400e}
  .chip-warn strong{color:#92400e}

  /* Secciones por sector */
  .sector{margin-bottom:22px;break-inside:avoid}
  .sector-head{display:flex;align-items:center;justify-content:space-between;border-left:3px solid var(--ink);padding:0 0 0 10px;margin-bottom:8px}
  .sector-name{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--ink)}
  .sector-count{font-size:11px;font-weight:700;color:var(--soft);font-variant-numeric:tabular-nums}

  .item{display:flex;gap:12px;padding:9px 4px;border-bottom:1px solid #f1f1f3;break-inside:avoid}
  .item:last-child{border-bottom:none}
  .item-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#f4f4f5;color:var(--muted);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
  .item-main{flex:1;min-width:0}
  .item-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .item-name{font-size:14px;font-weight:600;color:var(--ink)}
  .item-med{font-size:11px;color:var(--soft);font-family:ui-monospace,'Cascadia Code',Consolas,monospace}
  .item-obs{font-size:12px;color:var(--muted);font-style:italic;margin-top:3px}

  .badge{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid}
  .badge-amber{background:#fef3c7;border-color:#fcd34d;color:var(--amber)}
  .badge-red{background:#fee2e2;border-color:#fca5a5;color:var(--red)}

  .empty{padding:48px 0;text-align:center;color:#16a34a;font-size:15px;font-weight:600}

  .foot{max-width:820px;margin:18px auto 0;display:flex;justify-content:space-between;font-size:11px;color:var(--soft)}

  @media print{
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    body{padding:0}
    .toolbar{display:none !important}
    .sheet{border:none;border-radius:0;box-shadow:none;max-width:none;padding:8px 4px}
    .foot{margin-top:24px}
    @page{margin:14mm}
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="b-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <button class="b-wa" onclick="window.open('https://wa.me/?text=${waText}','_blank')">📲 WhatsApp</button>
  <button onclick="window.close()">Cerrar</button>
</div>

<div class="sheet">
  <div class="hdr">
    ${absLogoUrl ? `<img class="hdr-logo" src="${esc(absLogoUrl)}" alt="KLASE A" />` : '<div style="font-size:16px;font-weight:900;letter-spacing:3px">KLASE A</div>'}
    <div class="hdr-meta">
      <div class="hdr-kicker">Faltantes de producción</div>
      <div class="hdr-date">${esc(fecha)}</div>
    </div>
  </div>

  <div class="title">${titulo}</div>
  <div class="chips">
    <span class="chip chip-warn"><strong>${faltantes.length}</strong> pendientes</span>
    <span class="chip">de <strong>${total}</strong> muebles</span>
    ${chapa ? `<span class="chip">Chapa · <strong>${esc(chapa)}</strong></span>` : ""}
  </div>

  ${seccionesHtml}
</div>

<div class="foot">
  <span>Klase A — Muebles</span>
  <span>Generado el ${esc(fecha)}</span>
</div>

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
