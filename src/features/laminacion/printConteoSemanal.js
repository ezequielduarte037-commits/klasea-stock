function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(number);
}

export function printConteoSemanal({ sede, materiales = [], stockPorMaterial = {} }) {
  const fecha = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const ordenados = [...materiales].sort(
    (a, b) => String(a.categoria || "Sin categoría").localeCompare(String(b.categoria || "Sin categoría"), "es")
      || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"),
  );
  const total = ordenados.length;
  // Escala automática para que la planilla completa entre siempre en 1 hoja A4 vertical
  const rowHeight = total <= 30 ? 22 : total <= 38 ? 19 : Math.max(15, Math.floor(680 / total));
  const fontSize = total <= 30 ? 10 : total <= 38 ? 9.5 : 8.8;
  const cellPadY = total <= 30 ? 2.5 : total <= 38 ? 2 : 1.5;

  const filas = ordenados
    .map((material, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="material">${esc(material.nombre)}</td>
        <td class="category">${esc(material.categoria || "Sin categoría")}</td>
        <td class="unit">${esc(material.unidad || "unidad")}</td>
        <td class="system">${fmt(stockPorMaterial[material.id])}</td>
        <td class="blank"></td>
        <td class="blank difference"></td>
        <td class="notes"></td>
      </tr>
    `).join("");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Conteo semanal · Laminación · ${esc(sede)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  :root{
    --ink:#16212b;
    --muted:#5c6b77;
    --soft:#edf2f5;
    --line:#cbd6de;
    --blue:#176b87;
    --row-h:${rowHeight}px;
    --font-table:${fontSize}px;
    --cell-py:${cellPadY}px;
  }
  html,body{margin:0;background:#eef2f4;color:var(--ink);font-family:'Segoe UI',Arial,sans-serif}
  body{padding:18px 14px 48px}
  .toolbar{max-width:794px;margin:0 auto 12px;display:flex;justify-content:flex-end;gap:8px}
  button{border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font:600 13px 'Segoe UI',Arial,sans-serif;padding:8px 14px;cursor:pointer}
  button.primary{border-color:var(--blue);background:var(--blue);color:#fff}
  .sheet{max-width:794px;margin:0 auto;background:#fff;padding:18px 22px 16px;box-shadow:0 10px 36px rgba(22,33,43,.10)}
  .header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding-bottom:8px;border-bottom:2px solid var(--ink)}
  .header-left{display:flex;flex-direction:column;gap:2px}
  .brand-row{display:flex;align-items:center;gap:8px}
  .brand{font-size:12px;font-weight:900;letter-spacing:.2em;color:var(--blue)}
  .kicker{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  h1{margin:0;font-size:20px;line-height:1.1;letter-spacing:-.02em}
  .date{text-align:right;font-size:10.5px;color:var(--muted);line-height:1.35;white-space:nowrap}
  .date strong{color:var(--ink);font-size:12px;margin-left:4px}
  .meta{display:grid;grid-template-columns:1.1fr 1.45fr 1.45fr;gap:8px;margin:8px 0 6px}
  .meta-item{display:flex;align-items:baseline;gap:6px;border:1px solid var(--line);border-radius:6px;padding:5px 8px;min-height:28px}
  .meta-label{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
  .meta-value{font-size:11px;font-weight:700;color:var(--ink)}
  .meta-line{flex:1;height:13px;border-bottom:1px solid #8b9aa5}
  .hint{margin:0 0 7px;padding:4px 8px;border-left:3px solid var(--blue);background:#f0f7fa;color:var(--muted);font-size:9.5px;line-height:1.3}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--font-table)}
  th{padding:4px 4px;background:var(--soft);border:1px solid var(--line);font-size:8px;letter-spacing:.03em;text-transform:uppercase;text-align:left;line-height:1.15;white-space:nowrap}
  td{height:var(--row-h);padding:var(--cell-py) 5px;border:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
  th:nth-child(1),td:nth-child(1){width:4%;text-align:center}
  th:nth-child(2),td:nth-child(2){width:27%}
  th:nth-child(3),td:nth-child(3){width:13%}
  th:nth-child(4),td:nth-child(4){width:7.5%;text-align:center}
  th:nth-child(5),td:nth-child(5){width:9.5%;text-align:right}
  th:nth-child(6),td:nth-child(6){width:12%;text-align:right}
  th:nth-child(7),td:nth-child(7){width:10%;text-align:right}
  th:nth-child(8),td:nth-child(8){width:17%}
  .num{color:var(--muted);font-variant-numeric:tabular-nums}
  .material{font-weight:700}
  .category{color:var(--muted)}
  .unit{color:var(--muted);font-weight:600}
  .system{font-weight:700;font-variant-numeric:tabular-nums;color:var(--blue)}
  .blank{background:repeating-linear-gradient(135deg,#fff,#fff 5px,#f7f9fa 5px,#f7f9fa 6px)}
  .difference{background:#fff}
  .notes{background:#fff}
  .footer{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:8px;padding-top:6px;border-top:1px solid var(--line);color:var(--muted);font-size:9.5px}
  @media (max-width:700px){
    .meta{grid-template-columns:1fr}
    .sheet{padding:16px 10px}
    h1{font-size:18px}
    .header{gap:10px}
  }
  @media print{
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff;height:auto}
    body{padding:0}
    .toolbar{display:none!important}
    .sheet{max-width:none;box-shadow:none;padding:0;page-break-after:avoid;break-inside:avoid}
    tr{break-inside:avoid}
    thead{display:table-header-group}
    @page{size:A4 portrait;margin:7mm 9mm}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <main class="sheet" id="sheet">
    <header class="header">
      <div class="header-left">
        <div class="brand-row">
          <span class="brand">KLASE A</span>
          <span class="kicker">· Planilla operativa de inventario</span>
        </div>
        <h1>Conteo semanal · Laminación</h1>
      </div>
      <div class="date">
        <div>Fecha de emisión:<strong>${esc(fecha)}</strong></div>
        <div>Semana: __________________</div>
      </div>
    </header>
    <section class="meta" aria-label="Datos del conteo">
      <div class="meta-item"><span class="meta-label">Galpón / sede:</span><span class="meta-value">${esc(sede)}</span></div>
      <div class="meta-item"><span class="meta-label">Pañolero:</span><span class="meta-line"></span></div>
      <div class="meta-item"><span class="meta-label">Revisó:</span><span class="meta-line"></span></div>
    </section>
    <p class="hint"><strong>Cómo usarla:</strong> contá físicamente cada material y anotá la cantidad en “Conteo físico”. Si no coincide con “Stock sistema”, registrá la diferencia y dejá una observación para revisar el ajuste.</p>
    <table>
      <thead><tr>
        <th>N°</th><th>Material</th><th>Categoría</th><th>Unidad</th><th>Stock sist.</th><th>Conteo físico</th><th>Diferencia</th><th>Observaciones</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="8">No hay materiales cargados.</td></tr>'}</tbody>
    </table>
    <footer class="footer"><span>Total de materiales: <strong>${materiales.length}</strong></span><span>Firma / conformidad: __________________________________________</span><span>KlaseA · Laminación</span></footer>
  </main>
  <script>
    (function(){
      function fitSinglePage(){
        var sheet=document.getElementById('sheet');
        if(!sheet)return;
        sheet.style.zoom='';
        var maxH=1040;
        var h=sheet.scrollHeight;
        if(h>maxH){
          sheet.style.zoom=String(Math.max(0.72,Math.floor((maxH/h)*1000)/1000));
        }
      }
      window.addEventListener('beforeprint',fitSinglePage);
      window.addEventListener('load',function(){
        fitSinglePage();
        setTimeout(function(){try{window.focus();window.print()}catch(e){}},350);
      });
    })();
  </script>
</body>
</html>`;

  const win = window.open("", "conteo-semanal-laminacion", "width=960,height=860");
  if (!win) {
    window.alert("El navegador bloqueó la ventana emergente. Habilitá los pop-ups para imprimir la planilla.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
