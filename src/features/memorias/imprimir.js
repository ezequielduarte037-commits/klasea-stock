// Planilla de la memoria para imprimir o guardar en PDF (la que se lleva a la
// reunión con el cliente). Hoja A4 en blanco y negro, sin controles.
import { SECCIONES, estaDefinido, NO_LLEVA } from "./campos";
import { traerAdicionalesObra } from "./memoriasApi";
import { loadNavyLogo } from "@/lib/pdfLogo";

function esc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Outfit", "Segoe UI", system-ui, sans-serif; color: #111827; font-size: 11.5px; }
  .cab { display: flex; align-items: flex-end; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid #111827; }
  .cab h1 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
  .cab .linea { font-size: 12px; color: #4b5563; font-weight: 600; }
  .cab .fecha { margin-left: auto; text-align: right; font-size: 10.5px; color: #6b7280; }
  .cli { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 10px 0 4px; border: 1px solid #111827; }
  .cli div { padding: 6px 8px; border-left: 1px solid #111827; }
  .cli div:first-child { border-left: 0; }
  .cli small { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  .cli b { font-size: 12.5px; }
  h2 { margin: 14px 0 0; padding: 4px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; background: #e5e7eb; border: 1px solid #111827; border-bottom: 0; }
  table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
  td { border: 1px solid #111827; padding: 5px 8px; vertical-align: top; }
  td.et { width: 34%; font-weight: 600; }
  td.va { white-space: pre-wrap; }
  td.va .nota { display: block; margin-top: 2px; color: #4b5563; font-size: 10.5px; }
  td.vacio { color: #9ca3af; }
  .no { color: #6b7280; font-style: italic; }
  .equipos { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #111827; border-top: 0; }
  .equipos div { padding: 5px 8px; border-top: 1px solid #111827; border-left: 1px solid #111827; }
  .equipos div:nth-child(3n+1) { border-left: 0; }
  .equipos div:nth-child(-n+3) { border-top: 0; }
  .caja { display: inline-block; width: 11px; height: 11px; margin-right: 6px; border: 1.5px solid #111827; vertical-align: -1px; text-align: center; line-height: 9px; font-size: 10px; font-weight: 700; }
  .pie { margin-top: 16px; font-size: 9.5px; color: #9ca3af; }
`;

function valorHtml(campo, datos) {
  const valor = datos[campo.key];
  const nota = String(datos[`${campo.key}_obs`] || "").trim();
  if (!estaDefinido(campo, valor)) return `<td class="va vacio">—</td>`;
  const texto = String(valor).trim();
  const clase = texto.toLowerCase() === NO_LLEVA.toLowerCase() ? ' class="no"' : "";
  return `<td class="va"><span${clase}>${esc(texto)}</span>${nota ? `<span class="nota">${esc(nota)}</span>` : ""}</td>`;
}

export async function imprimirMemoria({ obra, linea, campos, datos }) {
  // La ventana se abre en el clic (después de esperar datos el navegador la bloquea).
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write("<p style='font-family:system-ui;padding:24px;color:#555'>Armando la planilla…</p>");

  const [adic, logo] = await Promise.allSettled([traerAdicionalesObra(obra.id), loadNavyLogo()]);
  const adicionales = adic.status === "fulfilled" ? adic.value : [];
  const logoSrc = logo.status === "fulfilled" ? logo.value?.dataUrl : null;

  const bloques = [];
  for (const seccion of SECCIONES) {
    if (seccion.key === "cliente") continue;
    const propios = campos.filter((c) => c.seccion === seccion.key && (!c.extra || estaDefinido(c, datos[c.key])));
    if (seccion.key === "equipos") {
      if (!propios.length) continue;
      const celdas = propios.map((c) => {
        const v = datos[c.key];
        const marca = v === true ? "✓" : v === false ? "✕" : "";
        const nota = String(datos[`${c.key}_obs`] || "").trim();
        return `<div><span class="caja">${marca}</span>${esc(c.label)}${nota ? ` <span class="no">· ${esc(nota)}</span>` : ""}</div>`;
      });
      while (celdas.length % 3) celdas.push("<div></div>");
      bloques.push(`<h2>${esc(seccion.label)}</h2><div class="equipos">${celdas.join("")}</div>`);
      continue;
    }
    const filas = propios.map((c) => `<tr><td class="et">${esc(c.label)}</td>${valorHtml(c, datos)}</tr>`);
    if (seccion.key === "adicionales" && adicionales.length) {
      for (const a of adicionales) {
        filas.push(`<tr><td class="et">${esc(a.tipo === "opcional" ? "Opcional" : "Adicional")}</td><td class="va">${esc(a.descripcion)} × ${esc(a.cantidad || 1)}<span class="nota">${esc(a.estado.label)}</span></td></tr>`);
      }
    }
    if (filas.length) bloques.push(`<h2>${esc(seccion.label)}</h2><table>${filas.join("")}</table>`);
  }

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Memoria ${esc(obra.codigo)}</title><style>${CSS}</style></head><body>
    <div class="cab">
      ${logoSrc ? `<img src="${logoSrc}" alt="Klase A" style="height:34px">` : ""}
      <div><div class="linea">Memoria descriptiva · ${esc(linea)}</div><h1>${esc(obra.codigo)}</h1></div>
      <div class="fecha">${esc(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }))}</div>
    </div>
    <div class="cli">
      <div><small>Propietario</small><b>${esc(datos.propietario || "—")}</b></div>
      <div><small>Nombre del barco</small><b>${esc(datos.nombre_barco || "—")}</b></div>
      <div><small>Constructor</small><b>${esc(datos.constructor || "—")}</b></div>
    </div>
    ${bloques.join("")}
    <div class="pie">Klase A · impreso desde el sistema</div>
    <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
  </body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
