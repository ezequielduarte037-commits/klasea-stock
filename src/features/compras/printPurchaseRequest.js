import { usernameOf } from "@/features/compras/purchaseRequestsApi";

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtFull(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function printPurchaseRequest(request, logoUrl) {
  if (!request) return;

  const followers = request.followers ?? [];
  const ccList = followers.map((f) => esc(usernameOf(f.profile))).join(", ") || "—";

  const absLogoUrl = logoUrl?.startsWith("/") ? window.location.origin + logoUrl : logoUrl;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(request.title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#222;background:#fff;padding:28px 32px;max-width:720px;margin:0 auto}
  @media print{body{padding:12px 20px}}
  a{color:#1a73e8}
  img{max-width:100%;height:auto}
  .hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee}
  .hdr-logo{height:24px;width:auto;display:block;filter:invert(1)}
  .hdr-date{font-size:10px;color:#999;margin-left:auto}
  .subj{font-size:16px;font-weight:700;color:#000;margin-bottom:10px}
  .meta{font-size:12px;color:#555;line-height:1.8;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee}
  .meta .l{color:#999;display:inline-block;width:44px}
  .body{font-size:14px;color:#222;line-height:1.7;padding:6px 0 8px}
  .body p{margin:0 0 8px}
  .body p:last-child{margin:0}
  .body ul,.body ol{padding-left:20px;margin:6px 0}
  .att{display:inline-block;margin-top:10px;padding:6px;border:1px solid #e8eaed;border-radius:6px;background:#fafafa}
</style>
</head>
<body>

<div class="hdr">
  ${absLogoUrl ? `<img class="hdr-logo" src="${esc(absLogoUrl)}" alt="KLASE A" />` : '<div style="font-size:13px;font-weight:800;letter-spacing:2px;color:#1a1a2e">KLASE A</div>'}
  <div class="hdr-date">${fmtFull(new Date().toISOString())}</div>
</div>

<div class="subj">${esc(request.title)}</div>

<div class="meta">
  <div><span class="l">De:</span> ${esc(usernameOf(request.creator))}</div>
  <div><span class="l">Para:</span> Compras</div>
  <div><span class="l">Fecha:</span> ${esc(fmtFull(request.created_at))}</div>
  ${request.project?.codigo ? `<div><span class="l">Proy:</span> ${esc(request.project.codigo)}</div>` : ""}
  <div><span class="l">CC:</span> ${ccList}</div>
</div>

<div class="body">${request.description || '<span style="color:#999;font-style:italic">Sin descripción.</span>'}</div>

${request.photo_url ? `<div class="att"><img src="${esc(request.photo_url)}" alt="Foto" /></div>` : ""}

</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("El navegador bloqueó la ventana emergente. Habilitá los pop-ups para este sitio.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}