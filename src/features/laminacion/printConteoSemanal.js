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
  const filas = [...materiales]
    .sort((a, b) => String(a.categoria || "Sin categoría").localeCompare(String(b.categoria || "Sin categoría"), "es")
      || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
    .map((material, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="material">${esc(material.nombre)}</td>
        <td>${esc(material.categoria || "Sin categoría")}</td>
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
  :root{--ink:#16212b;--muted:#5c6b77;--soft:#edf2f5;--line:#cbd6de;--blue:#176b87}
  html,body{margin:0;background:#eef2f4;color:var(--ink);font-family:'Segoe UI',Arial,sans-serif}
  body{padding:22px 16px 70px}
  .toolbar{max-width:1120px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:8px}
  button{border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font:600 13px 'Segoe UI',Arial,sans-serif;padding:9px 15px;cursor:pointer}
  button.primary{border-color:var(--blue);background:var(--blue);color:#fff}
  .sheet{max-width:1120px;margin:0 auto;background:#fff;padding:28px 30px 24px;box-shadow:0 10px 36px rgba(22,33,43,.10)}
  .header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:3px solid var(--ink)}
  .brand{font-size:16px;font-weight:900;letter-spacing:.22em;color:var(--blue)}
  .kicker{margin-top:8px;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
  h1{margin:0;font-size:28px;line-height:1.1;letter-spacing:-.03em}
  .date{text-align:right;font-size:12px;color:var(--muted);line-height:1.6}
  .date strong{display:block;color:var(--ink);font-size:14px}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:18px 0 14px}
  .meta-item{border:1px solid var(--line);border-radius:8px;padding:8px 10px;min-height:42px}
  .meta-label{display:block;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .meta-line{display:block;height:18px;margin-top:4px;border-bottom:1px solid #8b9aa5}
  .hint{margin:0 0 14px;padding:9px 11px;border-left:3px solid var(--blue);background:#f0f7fa;color:var(--muted);font-size:11px;line-height:1.45}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}
  th{padding:8px 6px;background:var(--soft);border:1px solid var(--line);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;text-align:left;line-height:1.2}
  td{height:30px;padding:6px;border:1px solid var(--line);vertical-align:middle}
  th:nth-child(1),td:nth-child(1){width:4%;text-align:center}
  th:nth-child(2),td:nth-child(2){width:25%}
  th:nth-child(3),td:nth-child(3){width:15%}
  th:nth-child(4),td:nth-child(4){width:8%;text-align:center}
  th:nth-child(5),td:nth-child(5){width:10%;text-align:right}
  th:nth-child(6),td:nth-child(6){width:11%;text-align:right}
  th:nth-child(7),td:nth-child(7){width:10%;text-align:right}
  th:nth-child(8),td:nth-child(8){width:17%}
  .num{color:var(--muted);font-variant-numeric:tabular-nums}
  .material{font-weight:700}
  .unit{color:var(--muted);font-weight:600}
  .system{font-weight:700;font-variant-numeric:tabular-nums;color:var(--blue)}
  .blank{background:repeating-linear-gradient(135deg,#fff,#fff 5px,#f7f9fa 5px,#f7f9fa 6px)}
  .difference{background:#fff}
  .notes{background:#fff}
  .footer{display:flex;justify-content:space-between;gap:20px;margin-top:16px;padding-top:10px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}
  @media (max-width:700px){
    .meta{grid-template-columns:1fr}
    .sheet{padding:20px 12px}
    h1{font-size:23px}
    .header{gap:12px}
    table{font-size:9px}
    th{font-size:8px}
  }
  @media print{
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    body{padding:0}
    .toolbar{display:none!important}
    .sheet{max-width:none;box-shadow:none;padding:0}
    tr{break-inside:avoid}
    thead{display:table-header-group}
    @page{size:A4 landscape;margin:10mm}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <main class="sheet">
    <header class="header">
      <div>
        <div class="brand">KLASE A</div>
        <div class="kicker">Planilla operativa de inventario</div>
        <h1>Conteo semanal · Laminación</h1>
      </div>
      <div class="date">Fecha de emisión<strong>${esc(fecha)}</strong>Semana: __________________</div>
    </header>
    <section class="meta" aria-label="Datos del conteo">
      <div class="meta-item"><span class="meta-label">Galpón / sede</span><strong>${esc(sede)}</strong></div>
      <div class="meta-item"><span class="meta-label">Pañolero</span><span class="meta-line"></span></div>
      <div class="meta-item"><span class="meta-label">Revisó</span><span class="meta-line"></span></div>
    </section>
    <p class="hint"><strong>Cómo usarla:</strong> contá físicamente cada material y anotá la cantidad en “Conteo físico”. Si no coincide con “Stock sistema”, registrá la diferencia y dejá una observación para revisar el ajuste.</p>
    <table>
      <thead><tr>
        <th>N°</th><th>Material</th><th>Categoría</th><th>Unidad</th><th>Stock sistema</th><th>Conteo físico</th><th>Diferencia</th><th>Observaciones</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="8">No hay materiales cargados.</td></tr>'}</tbody>
    </table>
    <footer class="footer"><span>Total de materiales: <strong>${materiales.length}</strong></span><span>Firma / conformidad: __________________________________________</span><span>KlaseA · Laminación</span></footer>
  </main>
  <script>
    window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print()}catch(e){}},350)});
  </script>
</body>
</html>`;

  const win = window.open("", "conteo-semanal-laminacion", "width=1200,height=820");
  if (!win) {
    window.alert("El navegador bloqueó la ventana emergente. Habilitá los pop-ups para imprimir la planilla.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
