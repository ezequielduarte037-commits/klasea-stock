import { CSS_PAPEL, FUENTES_PAPEL, fechaRotulo } from "@/lib/impresionKlasea";
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
    ? `<section class="items">
        <h2 class="kp-seccion">Ítems solicitados <span class="kp-cuenta">${printable.length}</span></h2>
        <table class="kp-tabla">
          <thead>
            <tr>
              <th scope="col">Detalle</th>
              <th scope="col" class="num cant">Cantidad</th>
              ${hasItemDest ? '<th scope="col" class="dest">Destino</th>' : ""}
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
                <td class="num cant item-qty">${esc(fmtItemQty(it))}</td>
                ${hasItemDest ? `<td class="dest apagado">${esc(it.destination || "-")}</td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>`
    : "";
  const attachments = normalizePurchaseRequestAttachments(request).filter((row) => httpUrl(row.url));
  const attachmentsHtml = attachments.length
    ? `<div class="attachments">
        <h2 class="kp-seccion">Archivos adjuntos</h2>
        ${attachments.map((attachment) => `
          <div class="attachment">
            <span>${esc(attachment.name || "Archivo adjunto")}</span>
            <a href="${esc(attachment.url)}" target="_blank" rel="noopener noreferrer">${esc(attachment.url)}</a>
          </div>
        `).join("")}
      </div>`
    : "";

  const absLogoUrl = logoUrl?.startsWith("/") ? window.location.origin + logoUrl : logoUrl;

  const obra = request.project?.codigo ? ["Obra", request.project.codigo] : request.destino ? ["Destino", request.destino] : null;
  const ficha = [
    ["Solicitado por", usernameOf(request.creator)],
    ["Fecha del pedido", fmtFull(request.created_at)],
    obra,
    request.needed_at ? ["Necesario para", fmtDate(request.needed_at)] : null,
  ].filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(request.title)}</title>
${FUENTES_PAPEL}
<style>
  ${CSS_PAPEL}
  a{color:var(--kp-acento)}
  img{max-width:100%;height:auto}
  .body{margin-top:22px;font-size:14.5px;line-height:1.65;overflow-wrap:anywhere}
  .body p{margin:0 0 8px}
  .body p:last-child{margin:0}
  .body ul,.body ol{padding-left:20px;margin:6px 0}
  .body h1,.body h2,.body h3,.body h4{font-size:16px;font-weight:500;margin:12px 0 8px}
  .copia{margin-top:14px;font-size:12px;color:var(--kp-gris)}
  .copia .kp-rotulo{margin-right:8px}
  .kp-tabla .cant{width:116px}
  .kp-tabla .dest{width:120px}
  .item-desc{font-weight:500}
  .item-code{font-family:'JetBrains Mono',ui-monospace,Consolas,monospace;font-size:11px;color:var(--kp-gris);margin-left:4px}
  .item-notes{color:var(--kp-gris);font-size:12px;margin-top:4px;white-space:pre-wrap}
  .item-link{font-size:11px;margin-top:5px;overflow-wrap:anywhere}
  .item-qty{font-size:16px;font-weight:400}
  .attachment{padding:10px 0;border-bottom:1px solid var(--kp-pelo);font-size:14px;overflow-wrap:anywhere}
  .attachment span{font-weight:500}
  .attachment a{display:block;font-size:11px;margin-top:3px;overflow-wrap:anywhere}
  @media screen and (max-width:560px){
    .kp-tabla .cant{width:84px}.kp-tabla .dest{width:80px}
    .kp-tabla td{padding:10px 5px;font-size:13px}.item-qty{font-size:14px}
  }
  @media print{
    .body p{orphans:3;widows:3}
    .attachment{break-inside:avoid;page-break-inside:avoid}
  }
</style>
</head>
<body>
<div class="kp-botonera" aria-label="Compartir e imprimir el encargo">
  <button type="button" id="copy-request" class="kp-boton">Copiar para WhatsApp</button>
  <button type="button" id="print-request" class="kp-boton primario">Imprimir / Guardar PDF</button>
  <p id="copy-status" role="status">Copiá el texto para pegarlo en un chat, o guardá la ficha como PDF.</p>
</div>
<main class="kp-hoja">
<header class="kp-barra">
  <span class="kp-rotulo">Compras</span>
  ${absLogoUrl ? `<span class="kp-marca-caja"><img class="kp-marca" src="${esc(absLogoUrl)}" alt="Klase A" /></span>` : '<span class="kp-marca-texto">KLASE A</span>'}
  <span class="kp-rotulo">${esc(fechaRotulo(request.created_at ? new Date(request.created_at) : new Date()))}</span>
</header>

<p class="kp-eyebrow">Encargo a Compras</p>
<h1 class="kp-titulo">${esc(request.title || "Encargo sin título")}</h1>

<div class="kp-ficha">
  ${ficha.map(([rotulo, valor]) => `<div><span class="kp-rotulo">${esc(rotulo)}</span><b class="chico">${esc(valor || "—")}</b></div>`).join("")}
</div>
${followers.length ? `<p class="copia"><span class="kp-rotulo">En copia</span>${ccList}</p>` : ""}

${request.description ? `<div class="body">${descriptionHtml(request.description)}</div>` : ""}

${itemsHtml}
${attachmentsHtml}
<footer class="kp-pie"><span>Klase A Yachts · Encargo a Compras</span><span>${esc(fmtFull(request.created_at))}</span></footer>
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
