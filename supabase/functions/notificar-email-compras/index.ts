import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertComprasAvisoAccess,
  assertPurchaseRequestAccess,
  authenticateFunctionRequest,
  createAdminClient,
  ResponseError,
} from "../_shared/functionAuth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// notificar-email-compras
//
// Manda los mails a compras. Hay dos formas de despertarla:
//
//   1. DESDE LA BASE: { emailId }. El trigger compras_email_encolar anota cada
//      pedido nuevo, mensaje y cambio de estado o prioridad en compras_emails y
//      llama acá con el id. Es el camino principal y cubre todas las pantallas,
//      incluso las que no existen todavía. La función NO confía en lo que le
//      mandan: con el id lee la fila y todo lo demás sale de la base.
//
//   2. DESDE LA PANTALLA: { type, requestId | avisoId, ... } con el JWT del
//      usuario. Queda para los dos avisos que la base no puede detectar sola:
//      "nuevo_aviso" y "pedido_recibido". Los otros cuatro tipos se ignoran si
//      el registro existe, porque ya los manda la base; si no existe -la
//      migración 20260916100000 todavía no se aplicó- se mandan directo, para
//      que el cambio no deje un hueco en el medio.
//
// Por eso verify_jwt = false en supabase/config.toml: el trigger llama sin
// token. El camino 1 no necesita autenticación porque no acepta contenido, y el
// camino 2 valida el JWT acá adentro.
//
// POR QUÉ EL REMITENTE ES onboarding@resend.dev. Es el único que entregó alguna
// vez. notificaciones@envios.klasea.com nunca existió en DNS, así que Resend lo
// rechaza. Si algún día se verifica un dominio propio, se configura con el
// secreto EMAIL_FROM sin tocar código.
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = "https://klasea-stock.vercel.app";
const REMITENTE = "Klase A Stock <onboarding@resend.dev>";
const DESTINATARIO = "compras@allyachts.com.ar";

const TIPOS_DESDE_LA_BASE = new Set(["new_request", "new_message", "status_update", "priority_update"]);
const TIPOS_DESDE_LA_PANTALLA = new Set(["nuevo_aviso", "pedido_recibido"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTADOS: Record<string, string> = {
  nuevo: "Nuevo",
  en_revision: "En revisión",
  cotizando: "Cotizando",
  comprado: "Comprado",
  recibido: "Recibido",
  cancelado: "Cancelado",
};

const PRIORIDADES: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

type Fila = {
  id: string | null;
  tipo: string;
  request_id: string | null;
  aviso_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  valor_antes: string | null;
  valor_nuevo: string | null;
  datos: Record<string, unknown>;
  created_at: string;
};

type Mail = { subject: string; html: string; text: string };
type Resultado = Mail | { omitir: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function enLinea(value: unknown, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * La descripción del pedido sale del editor de texto enriquecido y se guarda
 * como HTML: "<p>Hola&nbsp;David,&nbsp;necesitamos...</p><ul><li>...". Escapada
 * tal cual, el mail mostraba las etiquetas crudas, y los &nbsp; pegaban todas
 * las palabras en una sola tira que estiraba la tarjeta y empujaba la columna
 * de renglones fuera de la pantalla del celular. Pasaba en 83 de los últimos
 * 200 pedidos. Se pasa a texto conservando párrafos y viñetas, y recién después
 * se escapa para el mail.
 */
function htmlATexto(valor: unknown) {
  return String(valor ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(#39|apos);/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sólo http(s): un "javascript:" pegado como link no puede terminar en un mail. */
function linkSeguro(valor: unknown) {
  const texto = String(valor ?? "").trim();
  return /^https?:\/\//i.test(texto) ? texto : "";
}

function etiqueta(mapa: Record<string, string>, valor: unknown) {
  const clave = String(valor ?? "");
  return mapa[clave] ?? (clave || "—");
}

/** "2026-09-20" → "20/09/2026". Las fechas de needed_at vienen sin hora. */
function fecha(valor: unknown) {
  const texto = String(valor ?? "");
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : texto;
}

function fechaHora(valor: unknown) {
  const d = new Date(String(valor ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Reenvío de un aviso que no salió en su momento (datos.atrasado = true). Sin
 * esta marca, un pedido de hace dos días llega como si fuera de hoy y compras
 * no tiene forma de saber que ya pasó tiempo.
 */
function atraso(datos: Record<string, unknown>, fechaEvento: unknown) {
  if (datos.atrasado !== true) return { prefijo: "[Compras]", nota: undefined };
  const cuando = fechaHora(fechaEvento);
  return {
    prefijo: "[Compras · atrasado]",
    nota: `Este aviso es${cuando ? ` del ${escapeHtml(cuando)}` : " de antes"} y no te llegó en su momento por una falla en el envío de mails. Te lo reenviamos ahora.`,
  };
}

function linkSolicitud(requestId: string) {
  return `${APP_URL}/compras?open=${encodeURIComponent(requestId)}`;
}

function linkAviso(avisoId: string) {
  return `${APP_URL}/compras?tab=avisos&aviso=${encodeURIComponent(avisoId)}`;
}

// ── Plantilla ───────────────────────────────────────────────────────────────
//
// Una sola para todos los avisos, con tablas y estilos en línea porque es lo
// único que Outlook y Gmail respetan. Arriba siempre dice de qué solicitud se
// trata: era exactamente lo que faltaba en el mail viejo.

function plantilla(o: {
  encabezado: string;
  bajada?: string;
  nota?: string;
  ficha: Array<[string, string | null | undefined]>;
  cuerpo?: string;
  boton?: { texto: string; url: string };
}) {
  const filas = o.ficha
    .filter(([, valor]) => valor)
    .map(([nombre, valor]) => `<tr>
<td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(nombre)}</td>
<td style="padding:4px 0;color:#0f172a;font-size:14px;overflow-wrap:anywhere">${valor}</td>
</tr>`)
    .join("");

  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:22px 24px 4px">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700">Klase A · Compras</div>
<h1 style="margin:6px 0 4px;font-size:20px;line-height:1.3;color:#0f172a">${o.encabezado}</h1>
${o.bajada ? `<p style="margin:0;color:#475569;font-size:14px;line-height:1.45">${o.bajada}</p>` : ""}
${o.nota ? `<p style="margin:12px 0 0;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e3a8a;font-size:13px;line-height:1.45">${o.nota}</p>` : ""}
</td></tr>
${filas ? `<tr><td style="padding:14px 24px 4px"><table role="presentation" cellpadding="0" cellspacing="0">${filas}</table></td></tr>` : ""}
${o.cuerpo ? `<tr><td style="padding:10px 24px 4px">${o.cuerpo}</td></tr>` : ""}
${o.boton ? `<tr><td style="padding:16px 24px 24px"><a href="${o.boton.url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${escapeHtml(o.boton.texto)}</a></td></tr>` : ""}
</table>
<p style="text-align:center;color:#94a3b8;font-size:11px;margin:14px 0 0">Aviso automático de Klase A Stock</p>
</div>`;
}

function textoPlano(o: { encabezado: string; ficha: Array<[string, string | null | undefined]>; extra?: string; url?: string }) {
  const limpio = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return [
    limpio(o.encabezado),
    "",
    ...o.ficha.filter(([, v]) => v).map(([k, v]) => `${k}: ${limpio(String(v))}`),
    o.extra ? `\n${o.extra}` : "",
    o.url ? `\nAbrir: ${o.url}` : "",
  ].join("\n");
}

function citaMensaje(cuerpo: unknown) {
  return `<div style="border-left:3px solid #2563eb;background:#f8fafc;padding:10px 14px;border-radius:0 8px 8px 0;color:#1e293b;font-size:14px;line-height:1.5;overflow-wrap:anywhere">${escapeHtml(cuerpo).replace(/\n/g, "<br>")}</div>`;
}

type Renglon = { description?: string; quantity?: unknown; unit?: string; notes?: string; status?: string; link_url?: string | null };

function tablaRenglones(items: Renglon[], { max = 25, titulo = true } = {}) {
  if (!items.length) {
    return `<p style="margin:8px 0;color:#64748b;font-size:13px">Todavía no tiene renglones cargados.</p>`;
  }
  const visibles = items.slice(0, max);
  const resto = items.length - visibles.length;
  const filas = visibles.map((item) => `<tr>
<td style="padding:7px 10px 7px 0;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#475569;font-size:13px;vertical-align:top">${escapeHtml(item.quantity ?? "")} ${escapeHtml(item.unit ?? "")}</td>
<td style="padding:7px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;overflow-wrap:anywhere">${escapeHtml(item.description)}${linkSeguro(item.link_url) ? ` · <a href="${escapeHtml(linkSeguro(item.link_url))}" style="color:#2563eb">ver link</a>` : ""}${item.notes ? `<br><span style="color:#94a3b8;font-size:12px">${escapeHtml(item.notes)}</span>` : ""}</td>
</tr>`).join("");
  return `${titulo ? `<p style="margin:6px 0 6px;color:#0f172a;font-size:14px;font-weight:700">Qué se pide (${items.length})</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${filas}</table>
${resto > 0 ? `<p style="margin:6px 0 0;color:#64748b;font-size:12px">y ${resto} renglón${resto === 1 ? "" : "es"} más en la app.</p>` : ""}`;
}

// ── Lecturas ────────────────────────────────────────────────────────────────

type Pedido = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  needed_at: string | null;
  destino: string | null;
  proveedor: string | null;
  created_at: string;
  project: { codigo?: string } | null;
  creador: { username?: string } | null;
};

async function cargarPedido(supabase: SupabaseClient, id: string | null): Promise<Pedido | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(`id,title,description,status,priority,needed_at,destino,proveedor,created_at,
      project:produccion_obras!purchase_requests_project_id_fkey(codigo),
      creador:profiles!purchase_requests_created_by_fkey(username)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Pedido) ?? null;
}

async function cargarRenglones(supabase: SupabaseClient, requestId: string): Promise<Renglon[]> {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .select("description,quantity,unit,notes,status,link_url")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Renglon[];
}

async function nombreDe(supabase: SupabaseClient, id: string | null) {
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

/**
 * El pedido se crea primero y los renglones llegan después, en llamadas
 * separadas desde la pantalla. El trigger salta en el alta del pedido, así que
 * si se armara el mail en ese instante saldría vacío. Se espera a que el pedido
 * tenga unos segundos y a que la cantidad de renglones deje de cambiar.
 */
async function esperarRenglones(supabase: SupabaseClient, pedido: Pedido) {
  const edad = Date.now() - new Date(pedido.created_at).getTime();
  if (edad < 12_000) await esperar(12_000 - edad);
  let anterior = -1;
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { count } = await supabase
      .from("purchase_request_items")
      .select("id", { count: "exact", head: true })
      .eq("request_id", pedido.id);
    const actual = count ?? 0;
    if (actual === anterior) return;
    anterior = actual;
    await esperar(3_000);
  }
}

function fichaPedido(pedido: Pedido): Array<[string, string | null]> {
  return [
    ["Solicitud", `<strong>${escapeHtml(pedido.title || "Sin título")}</strong>`],
    ["Obra", pedido.project?.codigo ? escapeHtml(pedido.project.codigo) : (pedido.destino ? escapeHtml(pedido.destino) : null)],
    ["Prioridad", pedido.priority ? escapeHtml(etiqueta(PRIORIDADES, pedido.priority)) : null],
    ["Estado", pedido.status ? escapeHtml(etiqueta(ESTADOS, pedido.status)) : null],
  ];
}

// ── Armado de cada aviso ────────────────────────────────────────────────────

async function armarMail(supabase: SupabaseClient, fila: Fila): Promise<Resultado> {
  const datos = fila.datos ?? {};
  const actor = (await nombreDe(supabase, fila.actor_id)) ?? (datos.createdByName ? String(datos.createdByName) : null);

  if (fila.tipo === "nuevo_aviso") {
    let aviso: Record<string, unknown> | null = null;
    if (fila.aviso_id) {
      const { data } = await supabase
        .from("compras_avisos")
        .select("id,titulo,detalle,material,destino,prioridad,created_at,project:produccion_obras!compras_avisos_project_id_fkey(codigo)")
        .eq("id", fila.aviso_id)
        .maybeSingle();
      aviso = data ?? null;
    }
    if (fila.aviso_id && !aviso) return { omitir: "El aviso ya no existe." };
    const titulo = String(aviso?.titulo ?? datos.requestTitle ?? "Aviso a compras");
    const obra = (aviso?.project as { codigo?: string } | null)?.codigo ?? (aviso?.destino ? String(aviso.destino) : null);
    const detalle = aviso?.detalle ?? datos.message ?? "";
    const ficha: Array<[string, string | null]> = [
      ["Aviso", `<strong>${escapeHtml(titulo)}</strong>`],
      ["Material", aviso?.material ? escapeHtml(aviso.material) : null],
      ["Obra", obra ? escapeHtml(obra) : null],
      ["Prioridad", aviso?.prioridad ? escapeHtml(etiqueta(PRIORIDADES, aviso.prioridad)) : null],
      ["Creado por", actor ? escapeHtml(actor) : null],
      ["Origen", datos.source === "whatsapp" ? "WhatsApp" : null],
    ];
    const url = fila.aviso_id ? linkAviso(fila.aviso_id) : `${APP_URL}/compras?tab=avisos`;
    return {
      subject: `${atraso(datos, aviso?.created_at ?? fila.created_at).prefijo} Nuevo aviso${actor ? ` de ${enLinea(actor, 40)}` : ""}: ${enLinea(titulo)}`,
      html: plantilla({
        encabezado: "Nuevo aviso a compras",
        nota: atraso(datos, aviso?.created_at ?? fila.created_at).nota,
        ficha,
        cuerpo: detalle ? citaMensaje(detalle) : undefined,
        boton: { texto: "Ver el aviso", url },
      }),
      text: textoPlano({ encabezado: "Nuevo aviso a compras", ficha, extra: detalle ? String(detalle) : "", url }),
    };
  }

  const pedido = await cargarPedido(supabase, fila.request_id);
  if (!pedido) return { omitir: "La solicitud ya no existe." };
  const url = linkSolicitud(pedido.id);
  const titulo = pedido.title || "Sin título";

  if (fila.tipo === "new_request") {
    await esperarRenglones(supabase, pedido);
    const items = await cargarRenglones(supabase, pedido.id);
    const quien = actor ?? pedido.creador?.username ?? null;
    const descripcion = htmlATexto(pedido.description).slice(0, 1500);
    const ficha: Array<[string, string | null]> = [
      ["Solicitud", `<strong>${escapeHtml(titulo)}</strong>`],
      ["Obra", pedido.project?.codigo ? escapeHtml(pedido.project.codigo) : (pedido.destino ? escapeHtml(pedido.destino) : null)],
      ["Prioridad", pedido.priority ? escapeHtml(etiqueta(PRIORIDADES, pedido.priority)) : null],
      ["Necesario para", pedido.needed_at ? escapeHtml(fecha(pedido.needed_at)) : null],
      ["Pedido por", quien ? escapeHtml(quien) : null],
      ["Proveedor sugerido", pedido.proveedor ? escapeHtml(pedido.proveedor) : null],
      ["Origen", datos.source === "whatsapp" ? "WhatsApp" : null],
    ];
    const cuerpo = [
      descripcion ? `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.5;overflow-wrap:anywhere">${escapeHtml(descripcion).replace(/\n/g, "<br>")}</p>` : "",
      tablaRenglones(items),
    ].join("");
    const extra = [
      descripcion,
      ...items.map((i) => `- ${i.quantity ?? ""} ${i.unit ?? ""} ${i.description ?? ""}${linkSeguro(i.link_url) ? ` (${linkSeguro(i.link_url)})` : ""}`.trim()),
    ].filter(Boolean).join("\n");
    return {
      subject: `${atraso(datos, pedido.created_at).prefijo} Nueva solicitud${quien ? ` de ${enLinea(quien, 40)}` : ""}: ${enLinea(titulo)}`,
      html: plantilla({ encabezado: "Nueva solicitud de compra", nota: atraso(datos, pedido.created_at).nota, ficha, cuerpo, boton: { texto: "Ver la solicitud", url } }),
      text: textoPlano({ encabezado: "Nueva solicitud de compra", ficha, extra, url }),
    };
  }

  if (fila.tipo === "new_message") {
    let cuerpoMensaje = datos.message ? String(datos.message) : "";
    let adjuntos = 0;
    let fechaMensaje: string | null = null;
    if (fila.comment_id) {
      const { data: comentario } = await supabase
        .from("request_comments")
        .select("body,attachments,created_at")
        .eq("id", fila.comment_id)
        .maybeSingle();
      if (!comentario) return { omitir: "El mensaje ya no existe." };
      cuerpoMensaje = String(comentario.body ?? "");
      adjuntos = Array.isArray(comentario.attachments) ? comentario.attachments.length : 0;
      fechaMensaje = comentario.created_at ?? null;

      // Cambiar la prioridad publica solo un mensaje "Cambié la prioridad de X
      // a Y." y además dispara su propio aviso de prioridad. Con uno alcanza.
      if (/^Cambié la prioridad de /.test(cuerpoMensaje) && fechaMensaje) {
        const desde = new Date(new Date(fechaMensaje).getTime() - 120_000).toISOString();
        const { count } = await supabase
          .from("compras_emails")
          .select("id", { count: "exact", head: true })
          .eq("request_id", pedido.id)
          .eq("tipo", "priority_update")
          .gte("created_at", desde);
        if ((count ?? 0) > 0) return { omitir: "Es el mensaje automático del cambio de prioridad: ese aviso ya sale aparte." };
      }
    }
    if (!cuerpoMensaje.trim() && !adjuntos) return { omitir: "Mensaje vacío." };

    const items = await cargarRenglones(supabase, pedido.id);
    const ficha = fichaPedido(pedido);
    const cuerpo = [
      cuerpoMensaje.trim() ? citaMensaje(cuerpoMensaje) : "",
      adjuntos ? `<p style="margin:8px 0 0;color:#475569;font-size:13px">Con ${adjuntos} adjunto${adjuntos === 1 ? "" : "s"}: se ven en la app.</p>` : "",
      items.length ? `<div style="margin-top:16px">${tablaRenglones(items, { max: 6 })}</div>` : "",
    ].join("");
    const encabezado = actor ? `${escapeHtml(actor)} escribió en una solicitud` : "Nuevo mensaje en una solicitud";
    return {
      subject: `${atraso(datos, fechaMensaje ?? fila.created_at).prefijo} ${actor ? `${enLinea(actor, 40)} escribió en` : "Mensaje en"}: ${enLinea(titulo)}`,
      html: plantilla({ encabezado, nota: atraso(datos, fechaMensaje ?? fila.created_at).nota, ficha, cuerpo, boton: { texto: "Ver la solicitud y responder", url } }),
      text: textoPlano({ encabezado, ficha, extra: cuerpoMensaje, url }),
    };
  }

  if (fila.tipo === "status_update") {
    // Una recepción manda su propio aviso, con el detalle de si fue parcial. El
    // cambio de estado a "recibido" que la acompaña no suma nada: se espera un
    // rato a que llegue el de recepción y, si llegó, este no sale.
    if (fila.valor_nuevo === "recibido" && fila.id) {
      await esperar(20_000);
      const desde = new Date(Date.now() - 5 * 60_000).toISOString();
      const { count } = await supabase
        .from("compras_emails")
        .select("id", { count: "exact", head: true })
        .eq("request_id", pedido.id)
        .eq("tipo", "pedido_recibido")
        .neq("estado", "omitido")
        .gte("created_at", desde);
      if ((count ?? 0) > 0) return { omitir: "La recepción ya se avisó con su propio mail." };
    }
    const antes = etiqueta(ESTADOS, fila.valor_antes);
    const nuevo = etiqueta(ESTADOS, fila.valor_nuevo);
    const items = await cargarRenglones(supabase, pedido.id);
    const ficha: Array<[string, string | null]> = [
      ["Solicitud", `<strong>${escapeHtml(titulo)}</strong>`],
      ["Obra", pedido.project?.codigo ? escapeHtml(pedido.project.codigo) : (pedido.destino ? escapeHtml(pedido.destino) : null)],
      ["Estado", `${escapeHtml(antes)} → <strong>${escapeHtml(nuevo)}</strong>`],
      ["Cambiado por", actor ? escapeHtml(actor) : null],
      ["Prioridad", pedido.priority ? escapeHtml(etiqueta(PRIORIDADES, pedido.priority)) : null],
    ];
    return {
      subject: `${atraso(datos, fila.created_at).prefijo} ${enLinea(titulo)}: ${antes} → ${nuevo}`,
      html: plantilla({
        encabezado: "Cambió el estado de una solicitud",
        nota: atraso(datos, fila.created_at).nota,
        ficha,
        cuerpo: items.length ? tablaRenglones(items, { max: 6 }) : undefined,
        boton: { texto: "Ver la solicitud", url },
      }),
      text: textoPlano({ encabezado: "Cambió el estado de una solicitud", ficha, url }),
    };
  }

  if (fila.tipo === "priority_update") {
    const antes = etiqueta(PRIORIDADES, fila.valor_antes);
    const nuevo = etiqueta(PRIORIDADES, fila.valor_nuevo);
    const ficha: Array<[string, string | null]> = [
      ["Solicitud", `<strong>${escapeHtml(titulo)}</strong>`],
      ["Obra", pedido.project?.codigo ? escapeHtml(pedido.project.codigo) : (pedido.destino ? escapeHtml(pedido.destino) : null)],
      ["Prioridad", `${escapeHtml(antes)} → <strong>${escapeHtml(nuevo)}</strong>`],
      ["Cambiado por", actor ? escapeHtml(actor) : null],
      ["Necesario para", pedido.needed_at ? escapeHtml(fecha(pedido.needed_at)) : null],
    ];
    return {
      subject: `${atraso(datos, fila.created_at).prefijo} Prioridad ${nuevo}: ${enLinea(titulo)}`,
      html: plantilla({ encabezado: "Cambió la prioridad de una solicitud", nota: atraso(datos, fila.created_at).nota, ficha, boton: { texto: "Ver la solicitud", url } }),
      text: textoPlano({ encabezado: "Cambió la prioridad de una solicitud", ficha, url }),
    };
  }

  if (fila.tipo === "pedido_recibido") {
    const lugar = datos.source === "laminacion" ? "laminación" : "pañol";
    const mensaje = datos.message ? String(datos.message) : "";
    const parcial = /parcial/i.test(mensaje) || /parcial/i.test(String(datos.requestTitle ?? ""));
    const encabezado = parcial ? `Llegó parte del pedido a ${lugar}` : `El pedido llegó a ${lugar}`;
    const ficha = fichaPedido(pedido);
    return {
      subject: `${atraso(datos, fila.created_at).prefijo} ${parcial ? "Recepción parcial" : "Recibido"} en ${lugar}: ${enLinea(titulo)}`,
      html: plantilla({
        nota: atraso(datos, fila.created_at).nota,
        encabezado,
        ficha,
        cuerpo: mensaje ? citaMensaje(mensaje) : undefined,
        boton: { texto: "Ver la solicitud", url },
      }),
      text: textoPlano({ encabezado, ficha, extra: mensaje, url }),
    };
  }

  return { omitir: `Tipo de aviso desconocido: ${fila.tipo}` };
}

// ── Envío ───────────────────────────────────────────────────────────────────

async function mandar(mail: Mail) {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) throw new Error("Falta el secreto RESEND_API_KEY en Supabase.");
  const cuerpo = JSON.stringify({
    from: Deno.env.get("EMAIL_FROM") || REMITENTE,
    to: [Deno.env.get("COMPRAS_EMAIL") || DESTINATARIO],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  // Resend acepta 2 envíos por segundo. Si varios avisos salen juntos -alguien
  // carga cinco pedidos seguidos- los que se pasan vuelven con 429: se espera
  // y se reintenta en vez de marcarlos como error.
  for (let intento = 1; ; intento++) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: cuerpo,
    });
    if (response.ok) return;
    const detalle = await response.text();
    if (response.status === 429 && intento < 4) {
      await esperar(1_200 * intento);
      continue;
    }
    throw new Error(`Resend rechazó el mail (${response.status}): ${detalle.slice(0, 300)}`);
  }
}

// ── Cola ────────────────────────────────────────────────────────────────────

async function procesar(supabase: SupabaseClient, id: string) {
  // Sin key no se toma la fila: si se tomara, cada intento fallido gastaría uno
  // de los tres reintentos y el mail se perdería antes de que alguien cargue el
  // secreto. Queda pendiente, con el motivo a la vista, y sale en el próximo
  // barrido después de configurarlo.
  if (!(Deno.env.get("RESEND_API_KEY") ?? "")) {
    await supabase
      .from("compras_emails")
      .update({ motivo: "En espera: falta el secreto RESEND_API_KEY en Supabase." })
      .eq("id", id)
      .eq("estado", "pendiente");
    return;
  }

  const { data: tomadas, error } = await supabase.rpc("compras_email_tomar", { p_id: id });
  if (error) {
    console.error("compras_email_tomar", id, error);
    return;
  }
  const fila = (Array.isArray(tomadas) ? tomadas[0] : tomadas) as Fila | undefined;
  if (!fila) return; // otra invocación la tomó, o ya salió

  const ahora = () => new Date().toISOString();
  try {
    const resultado = await armarMail(supabase, fila);
    if ("omitir" in resultado) {
      await supabase.from("compras_emails")
        .update({ estado: "omitido", motivo: resultado.omitir, procesado_at: ahora() })
        .eq("id", id);
      return;
    }
    await mandar(resultado);
    await supabase.from("compras_emails")
      .update({ estado: "enviado", asunto: resultado.subject, motivo: null, procesado_at: ahora() })
      .eq("id", id);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("notificar-email-compras", id, mensaje);
    await supabase.from("compras_emails")
      .update({ estado: "error", motivo: mensaje.slice(0, 500), procesado_at: ahora() })
      .eq("id", id);
  }
}

/**
 * Cada vez que la función se despierta, además de su mail revisa si quedó algo
 * colgado: filas pendientes cuya llamada se perdió, errores con reintentos
 * disponibles o envíos que quedaron a mitad. Sin cron: el próximo aviso
 * arrastra a los atrasados. Solo mira las últimas 24 horas, para no mandarle a
 * compras de golpe una tanda de avisos viejos.
 */
async function barrer(supabase: SupabaseClient, excepto: string | null) {
  const ahora = Date.now();
  const hace1min = new Date(ahora - 60_000).toISOString();
  const hace5min = new Date(ahora - 5 * 60_000).toISOString();
  const hace24h = new Date(ahora - 24 * 3_600_000).toISOString();
  let consulta = supabase
    .from("compras_emails")
    .select("id")
    .gt("created_at", hace24h)
    .or(`and(estado.eq.pendiente,created_at.lt."${hace1min}"),and(estado.eq.error,intentos.lt.3),and(estado.eq.enviando,tomado_at.lt."${hace5min}")`)
    .order("created_at", { ascending: true })
    .limit(10);
  if (excepto) consulta = consulta.neq("id", excepto);
  const { data, error } = await consulta;
  if (error) {
    console.error("barrido de compras_emails", error);
    return;
  }
  for (const { id } of data ?? []) await procesar(supabase, id as string);
}

async function existeRegistro(supabase: SupabaseClient) {
  const { error } = await supabase.from("compras_emails").select("id", { head: true, count: "exact" }).limit(1);
  return !error;
}

function enSegundoPlano(trabajo: Promise<unknown>): Response | Promise<Response> {
  const seguro = trabajo.catch((err) => console.error("notificar-email-compras (segundo plano):", err));
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(seguro);
    return json({ aceptado: true }, 202);
  }
  return seguro.then(() => json({ ok: true }));
}

// ── Entrada ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const supabase = createAdminClient();

  // 1. Desde la base.
  if (payload.emailId !== undefined) {
    const id = String(payload.emailId);
    if (!UUID.test(id)) return json({ error: "emailId inválido" }, 400);
    return enSegundoPlano(procesar(supabase, id).then(() => barrer(supabase, id)));
  }

  // 2. Desde la pantalla.
  try {
    const auth = await authenticateFunctionRequest(req, supabase, { allowServiceRole: true });
    const tipo = String(payload.type ?? "");
    if (!TIPOS_DESDE_LA_BASE.has(tipo) && !TIPOS_DESDE_LA_PANTALLA.has(tipo)) {
      throw new ResponseError("Tipo de notificación inválido", 400);
    }

    const requestId = UUID.test(String(payload.requestId ?? "")) ? String(payload.requestId) : null;
    const avisoId = UUID.test(String(payload.avisoId ?? "")) ? String(payload.avisoId) : null;
    if (requestId) await assertPurchaseRequestAccess(supabase, requestId, auth);
    else if (avisoId) await assertComprasAvisoAccess(supabase, avisoId, auth);
    else throw new ResponseError("Falta pedido o aviso para autorizar", 400);

    const hayRegistro = await existeRegistro(supabase);
    if (TIPOS_DESDE_LA_BASE.has(tipo) && hayRegistro) {
      return json({ message: "Este aviso ya lo manda la base." });
    }

    const actorId = auth.isService
      ? (UUID.test(String(payload.changedBy ?? "")) ? String(payload.changedBy) : null)
      : auth.userId;
    let rol: string | null = null;
    if (actorId) {
      const { data: perfil } = await supabase.from("profiles").select("role").eq("id", actorId).maybeSingle();
      rol = (perfil?.role as string | undefined) ?? null;
    }
    const omitir = rol === "compras" || rol === "admin"
      ? "Lo hizo compras o un admin: no se le avisa a compras."
      : null;

    const datos = {
      message: payload.message ?? null,
      source: payload.source ?? null,
      requestTitle: payload.requestTitle ?? null,
      createdByName: payload.createdByName ?? null,
    };
    const valorAntes = tipo === "priority_update" ? payload.oldPriority : payload.oldStatus;
    const valorNuevo = tipo === "priority_update" ? payload.newPriority : payload.newStatus;

    if (hayRegistro) {
      const { data: fila, error } = await supabase
        .from("compras_emails")
        .insert({
          tipo,
          origen: "pantalla",
          request_id: requestId,
          aviso_id: requestId ? null : avisoId,
          actor_id: actorId,
          datos,
          estado: omitir ? "omitido" : "pendiente",
          motivo: omitir,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (omitir) return json({ message: omitir });
      return enSegundoPlano(procesar(supabase, fila.id).then(() => barrer(supabase, fila.id)));
    }

    // Transición: la migración del registro todavía no se aplicó.
    if (omitir) return json({ message: omitir });
    const resultado = await armarMail(supabase, {
      id: null,
      tipo,
      request_id: requestId,
      aviso_id: requestId ? null : avisoId,
      comment_id: null,
      actor_id: actorId,
      valor_antes: valorAntes ? String(valorAntes) : null,
      valor_nuevo: valorNuevo ? String(valorNuevo) : null,
      datos,
      created_at: new Date().toISOString(),
    });
    if ("omitir" in resultado) return json({ message: resultado.omitir });
    await mandar(resultado);
    return json({ success: true });
  } catch (error) {
    console.error("notificar-email-compras error:", error);
    const status = error instanceof ResponseError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Error interno";
    return json({ error: message }, status);
  }
});
