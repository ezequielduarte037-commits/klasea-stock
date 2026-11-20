import { supabase } from "@/supabaseClient";
import { ENVIO_ESTADO_META, ITEM_ESTADO_META } from "@/features/panol/panolApi";

/**
 * Los pedidos de la bandeja. Trae de cada renglón lo justo para contar y para
 * buscar por lo que trae ("¿en qué pedido está la bomba?").
 */
export async function fetchPedidos({ sede = null } = {}) {
  let q = supabase
    .from("panol_envios")
    .select("id,titulo,sede,estado,prioridad,origen,destino,observaciones,obra_id,purchase_request_id,created_at,obra:produccion_obras(id,codigo),items:panol_envio_items(id,estado,descripcion,codigo)")
    .order("created_at", { ascending: false });
  if (sede) q = q.eq("sede", sede);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(value, currency = "ARS") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${currency === "USD" ? "US$" : "$"} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** La hoja para imprimir el pedido (la misma de siempre). Devuelve false si el navegador bloqueó la ventana. */
export function imprimirPedido(envio, { verPrecios = false } = {}) {
  if (!envio) return false;
  const items = envio.items || [];
  const meta = [
    envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : null,
    `Pañol ${envio.sede || ""}`.trim(),
    envio.destino ? `Destino: ${envio.destino}` : null,
    `Prioridad: ${envio.prioridad || "media"}`,
    `Estado: ${(ENVIO_ESTADO_META[envio.estado]?.label) || envio.estado}`,
  ].filter(Boolean);
  const filas = items.map((it, i) => {
    const em = ITEM_ESTADO_META[it.estado] || ITEM_ESTADO_META.pendiente;
    const precio = verPrecios && it.precio_unitario != null && it.precio_unitario !== "" ? money(it.precio_unitario, it.moneda) : "";
    return `<tr>
      <td class="n">${i + 1}</td>
      <td>${esc(it.descripcion)}${it.codigo ? `<div class="cod">${esc(it.codigo)}</div>` : ""}${precio ? `<div class="cod">${esc(precio)}</div>` : ""}</td>
      <td class="c">${esc(it.cantidad || "")} ${esc(it.unidad || "")}</td>
      <td class="c rec">${it.cantidad_recibida != null && it.cantidad_recibida !== "" ? esc(it.cantidad_recibida) : ""}</td>
      <td class="c">${esc(em.label)}</td>
      <td>${esc(it.nota || "")}</td>
    </tr>`;
  }).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(envio.titulo || "Pedido a Pañol")}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:6px}
    .brand{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#555}
    h1{font-size:18px;margin:2px 0 0}
    .meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:#333;margin:8px 0 12px;font-size:12px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}
    th{background:#f1f1f1;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
    td.c{text-align:center;white-space:nowrap} td.n{text-align:center;color:#888;width:26px}
    td.rec{font-weight:bold} .cod{color:#777;font-size:10px;margin-top:2px}
    .foot{margin-top:14px;color:#777;font-size:10px;display:flex;justify-content:space-between}
    @media print{body{margin:12mm}}
  </style></head><body>
    <div class="head">
      <div><div class="brand">Astillero Klase A · Pedido a Pañol</div><h1>${esc(envio.titulo || "Pedido a Pañol")}</h1></div>
      <div style="text-align:right;color:#555">${new Date(envio.created_at || Date.now()).toLocaleDateString("es-AR")}</div>
    </div>
    <div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
    ${envio.observaciones ? `<div style="margin:0 0 10px;color:#333">Obs.: ${esc(envio.observaciones)}</div>` : ""}
    <table><thead><tr><th>#</th><th>Descripción</th><th>Pedido</th><th>Recibido</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${filas || `<tr><td colspan="6" style="text-align:center;color:#999;padding:18px">Sin ítems</td></tr>`}</tbody></table>
    <div class="foot"><span>${items.length} ítem${items.length === 1 ? "" : "s"}</span><span>Impreso ${new Date().toLocaleString("es-AR")}</span></div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

/** La foto de cada producto del catálogo (Map material_id → url). Si falla, el pedido se ve igual, sin fotos. */
export async function fetchFotosDeMateriales(ids = []) {
  const limpios = [...new Set(ids.filter(Boolean))];
  const fotos = new Map();
  for (let i = 0; i < limpios.length; i += 150) {
    const { data, error } = await supabase
      .from("panol_materiales")
      .select("id,imagen_url")
      .in("id", limpios.slice(i, i + 150))
      .not("imagen_url", "is", null);
    if (error) break;
    for (const m of data ?? []) if (m.imagen_url) fotos.set(m.id, m.imagen_url);
  }
  return fotos;
}
