import DOMPurify from "dompurify";
import {
  normalizePurchaseRequestAttachments,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import { supplierPurchaseLines } from "@/features/materiales/proveedorPedido";

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtFull(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtItemQty(item) {
  const raw = item?.quantity;
  const number = raw === "" || raw == null ? NaN : Number(raw);
  const qty = Number.isFinite(number) ? number.toLocaleString("es-AR", { maximumFractionDigits: 6 }) : String(raw ?? "");
  const unit = item?.unit ?? "";
  const text = `${qty}${unit ? ` ${unit}` : ""}`.trim();
  return text || "—";
}

function fmtDate(value) {
  // Una columna date no se convierte a UTC: en Argentina perdería un día.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function descriptionHtml(value) {
  const raw = String(value || "");
  if (!/<[a-z!/][\s\S]*>/i.test(raw)) return esc(raw).replace(/\r?\n/g, "<br>");
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "img"],
    ALLOWED_ATTR: ["href", "src", "alt", "title"],
  }).replace(/&nbsp;|\u00a0/g, " ");
}

function descriptionText(value) {
  const element = document.createElement("div");
  element.innerHTML = descriptionHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ");
  return (element.textContent || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function printableItems(request) {
  return (Array.isArray(request.items) ? request.items : []).flatMap((item) =>
    supplierPurchaseLines(item).map((line) => ({ ...item, ...line })),
  );
}

/** El mismo encargo completo se copia desde el detalle y desde la impresión. */
export function buildPurchaseRequestText(request) {
  const lines = [
    `Pedido: ${request.title || "Sin título"}`,
    `De: ${usernameOf(request.creator)}`,
    "Para: Compras",
    `Fecha: ${fmtFull(request.created_at)}`,
  ];
  const destination = request.project?.codigo || request.destino;
  const cc = (request.followers || []).map((follower) => usernameOf(follower.profile)).join(", ");
  const priority = REQUEST_PRIORITIES.find((row) => row.value === request.priority)?.label || request.priority;
  const status = REQUEST_STATUSES.find((row) => row.value === request.status)?.label || request.status;
  if (destination) lines.push(`Destino/obra: ${destination}`);
  if (cc) lines.push(`CC: ${cc}`);
  if (priority) lines.push(`Prioridad: ${priority}`);
  if (status) lines.push(`Estado: ${status}`);
  if (request.needed_at) lines.push(`Necesario para: ${fmtDate(request.needed_at)}`);
  const description = descriptionText(request.description);
  if (description) lines.push("", "Descripción:", description);

  const items = printableItems(request);
  lines.push("", `Ítems solicitados (${items.length}):`);
  if (!items.length) lines.push("Sin ítems cargados.");
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.description}${item.code ? ` (${item.code})` : ""} — ${fmtItemQty(item)}`);
    if (item.destination) lines.push(`   Destino: ${item.destination}`);
    if (item.notes) lines.push(`   Nota: ${item.notes}`);
    if (httpUrl(item.link_url)) lines.push(`   Enlace: ${httpUrl(item.link_url)}`);
    if (httpUrl(item.image_url)) lines.push(`   Foto: ${httpUrl(item.image_url)}`);
  });
  const attachments = normalizePurchaseRequestAttachments(request).filter((row) => httpUrl(row.url));
  if (attachments.length) {
    lines.push("", "Archivos adjuntos:");
    attachments.forEach((row) => lines.push(`${row.name || "Archivo adjunto"}: ${row.url}`));
  }
  return lines.join("\n").trim();
}

export async function copyPurchaseRequestText(request, target = window) {
  const text = buildPurchaseRequestText(request);
  if (target.navigator.clipboard?.writeText) {
    try {
      await target.navigator.clipboard.writeText(text);
      return;
    } catch { /* Algunos navegadores exponen la API pero no permiten usarla. */ }
  }
  const doc = target.document;
  const previousFocus = doc.activeElement;
  const input = doc.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  doc.body.appendChild(input);
  try {
    input.focus();
    input.select();
    if (!doc.execCommand("copy")) throw new Error("No se pudo copiar el pedido.");
  } finally {
    input.remove();
    previousFocus?.focus?.();
  }
}

export function buildPurchaseRequestHtml(request, logoUrl) {
  if (!request) return;

  const followers = request.followers ?? [];
  const ccList = followers.map((f) => esc(usernameOf(f.profile))).join(", ") || "—";

  const printable = printableItems(request);
  // Solo mostramos la columna "Destino" si algún ítem tiene destino propio.
  // Si no (el destino vive a nivel pedido, ya figura en la cabecera) la omitimos
  // para no dejar una columna de "-".
  const hasItemDest = printable.some((it) => String(it.destination || "").trim());
  const itemsHtml = printable.length
    ? `<div class="items">
        <h2 class="items-title">Ítems solicitados · ${printable.length}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Detalle</th>
              <th scope="col">Cantidad</th>
              ${hasItemDest ? '<th scope="col">Destino</th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${printable.map((it) => `
              <tr>
                <td>
                  <div class="item-desc">${esc(it.description || "Item sin detalle")}${it.code ? ` <span class="item-code">${esc(it.code)}</span>` : ""}</div>
                  ${it.notes ? `<div class="item-notes">${esc(it.notes)}</div>` : ""}
                  ${httpUrl(it.link_url) ? `<div class="item-link"><a href="${esc(httpUrl(it.link_url))}" target="_blank" rel="noopener noreferrer">${esc(it.link_url)}</a></div>` : ""}
                  ${httpUrl(it.image_url) ? `<div class="item-link"><a href="${esc(httpUrl(it.image_url))}" target="_blank" rel="noopener noreferrer">Foto del ítem</a></div>` : ""}
                </td>
                <td class="item-qty">${esc(fmtItemQty(it))}</td>
                ${hasItemDest ? `<td>${esc(it.destination || "-")}</td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`
    : "";
  const attachments = normalizePurchaseRequestAttachments(request).filter((row) => httpUrl(row.url));
  const attachmentsHtml = attachments.length
    ? `<div class="attachments">
        <h2 class="items-title">Archivos adjuntos</h2>
        ${attachments.map((attachment) => `
          <div class="attachment">
            <span>${esc(attachment.name || "Archivo adjunto")}</span>
            <a href="${esc(attachment.url)}" target="_blank" rel="noopener noreferrer">${esc(attachment.url)}</a>
          </div>
        `).join("")}
      </div>`
    : "";

  const absLogoUrl = logoUrl?.startsWith("/") ? window.location.origin + logoUrl : logoUrl;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(request.title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.55;color:#202936;background:#f2f4f7}
  .toolbar{max-width:210mm;margin:20px auto 12px;display:flex;flex-wrap:wrap;gap:10px;padding:0 12px}
  .toolbar button{min-height:42px;padding:9px 16px;border:1px solid #c6ced8;border-radius:8px;background:#fff;color:#202936;font:600 14px 'Segoe UI',Arial,sans-serif;cursor:pointer}
  .toolbar button.primary{background:#153c60;color:#fff;border-color:#153c60}
  .toolbar button:focus-visible{outline:3px solid #5689c4;outline-offset:2px}
  .toolbar button:disabled{opacity:.6;cursor:wait}
  .toolbar p{flex:1 1 100%;font-size:12px;color:#536174}
  .sheet{max-width:210mm;margin:0 auto 24px;padding:16mm 17mm;background:#fff;border:1px solid #dce1e7;border-radius:10px;box-shadow:0 4px 18px #2029360a}
  a{color:#1a73e8}
  img{max-width:100%;height:auto}
  .hdr{display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:18px;border-bottom:2px solid #273f57}
  .hdr-logo{height:38px;width:38px;object-fit:contain;display:block;filter:invert(1)}
  .brand{font-size:16px;font-weight:700;letter-spacing:1px}
  .eyebrow{font-size:11px;letter-spacing:1.2px;color:#536174;text-transform:uppercase}
  .subj{font-size:24px;line-height:1.25;font-weight:700;margin-bottom:20px;overflow-wrap:anywhere}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-bottom:24px;padding-bottom:22px;border-bottom:1px solid #dce1e7}
  .meta div{min-width:0;font-size:14px;overflow-wrap:anywhere}
  .meta .l{display:block;color:#536174;font-size:11px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px}
  .body{font-size:15px;line-height:1.65;margin-bottom:26px;overflow-wrap:anywhere}
  .body p{margin:0 0 8px}
  .body p:last-child{margin:0}
  .body ul,.body ol{padding-left:20px;margin:6px 0}
  .body h1,.body h2,.body h3,.body h4{font-size:17px;margin:12px 0 8px}
  .items{margin-top:16px}
  .items-title{font-size:13px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}
  th{text-align:left;color:#465366;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid #9ca9b8;border-bottom:1px solid #9ca9b8;padding:10px 8px}
  td{vertical-align:top;border-bottom:1px solid #dce1e7;padding:14px 8px;line-height:1.45;overflow-wrap:anywhere}
  th:nth-child(2),td:nth-child(2){width:116px;text-align:right}
  th:nth-child(3),td:nth-child(3){width:120px}
  .item-desc{font-weight:600}
  .item-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#536174;margin-left:4px}
  .item-notes{color:#536174;font-size:12px;margin-top:4px;white-space:pre-wrap}
  .item-link{font-size:11px;margin-top:5px;overflow-wrap:anywhere}
  .item-qty{font-size:16px;font-weight:700}
  .attachments{margin-top:26px}
  .attachment{padding:9px 0;border-bottom:1px solid #dce1e7;font-size:14px;overflow-wrap:anywhere}
  .attachment span{font-weight:600}
  .attachment a{display:block;font-size:11px;margin-top:3px;overflow-wrap:anywhere}
  footer{font-size:10px;color:#536174;margin-top:30px;border-top:1px solid #dce1e7;padding-top:10px}
  @media screen and (max-width:560px){
    .toolbar{margin-top:12px}.toolbar button{flex:1;padding:9px 10px;font-size:13px}
    .sheet{padding:24px 20px;margin:0;border-radius:0;border-left:0;border-right:0}
    .subj{font-size:22px}.meta{grid-template-columns:1fr;gap:12px}
    th:nth-child(2),td:nth-child(2){width:90px}th:nth-child(3),td:nth-child(3){width:82px}
    td{padding:12px 5px;font-size:13px}.item-qty{font-size:14px}
  }
  @page{size:A4 portrait;margin:15mm}
  @media print{
    body{background:#fff;font-size:11pt}
    .toolbar{display:none!important}
    .sheet{max-width:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none}
    .hdr,.subj,.meta,.items-title{break-inside:avoid;page-break-inside:avoid}
    .subj,.items-title{break-after:avoid;page-break-after:avoid}
    thead{display:table-header-group}
    tr,.attachment{break-inside:avoid;page-break-inside:avoid}
    .body p{orphans:3;widows:3}
  }
</style>
</head>
<body>
<div class="toolbar" aria-label="Compartir e imprimir el encargo">
  <button type="button" id="copy-request">Copiar para WhatsApp</button>
  <button type="button" id="print-request" class="primary">Imprimir / Guardar PDF</button>
  <p id="copy-status" role="status">Copiá el texto para pegarlo en un chat, o guardá la ficha como PDF.</p>
</div>
<main class="sheet">
<div class="hdr">
  ${absLogoUrl ? `<img class="hdr-logo" src="${esc(absLogoUrl)}" alt="" />` : ""}
  <div><div class="brand">KLASE A</div><div class="eyebrow">Encargo a Compras</div></div>
</div>

<h1 class="subj">${esc(request.title || "Encargo sin título")}</h1>

<div class="meta">
  <div><span class="l">Solicitado por</span> ${esc(usernameOf(request.creator))}</div>
  <div><span class="l">Fecha del pedido</span> ${esc(fmtFull(request.created_at))}</div>
  ${request.project?.codigo ? `<div><span class="l">Obra</span> ${esc(request.project.codigo)}</div>` : request.destino ? `<div><span class="l">Destino</span> ${esc(request.destino)}</div>` : ""}
  ${request.needed_at ? `<div><span class="l">Necesario para</span> ${esc(fmtDate(request.needed_at))}</div>` : ""}
  ${followers.length ? `<div><span class="l">En copia</span> ${ccList}</div>` : ""}
</div>

${request.description ? `<div class="body">${descriptionHtml(request.description)}</div>` : ""}

${itemsHtml}
${attachmentsHtml}
<footer>Klase A · Encargo a Compras</footer>
</main>
</body>
</html>`;
  return html;
}

export function printPurchaseRequest(request, logoUrl) {
  if (!request) return;
  const win = window.open("", "_blank", "width=850,height=900");
  if (!win) {
    alert("El navegador bloqueó la ventana emergente. Habilitá los pop-ups para este sitio.");
    return;
  }
  win.document.open();
  win.document.write(buildPurchaseRequestHtml(request, logoUrl));
  win.document.close();
  win.document.getElementById("print-request").addEventListener("click", () => win.print());
  const copyButton = win.document.getElementById("copy-request");
  const status = win.document.getElementById("copy-status");
  copyButton.addEventListener("click", async () => {
    copyButton.disabled = true;
    try {
      await copyPurchaseRequestText(request, win);
      status.textContent = "Pedido copiado completo. Pegalo en WhatsApp.";
    } catch {
      status.textContent = "No se pudo copiar. Probá de nuevo o guardá la ficha como PDF.";
    } finally {
      copyButton.disabled = false;
    }
  });
  return win;
}
