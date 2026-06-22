// notify-wa-update
// ─────────────────────────────────────────────────────────────────────────────
// Notifica al CREADOR del pedido por WhatsApp cuando alguien (que no sea él)
// actualiza algo: cambia el estado, agrega prioridad, comenta, cambia estado
// de ítem, etc. Lo típico es que compras haga cambios y el técnico que pidió
// se entera por WA sin tener que abrir la web.
//
// Reglas:
//   - Recipient: creator + followers que activaron notify_whatsapp.
//   - Skip si el actor es el propio recipient (no se autonotifica), salvo "created".
//   - Skip si el destinatario no tiene teléfono vinculado a WhatsApp.
//
// Payload esperado:
// {
//   requestId: string,                // uuid del purchase_request
//   eventType: "created" | "status" | "priority" | "comment" | "item_status"
//            | "amount" | "delivery_date" | "received",
//   actorId?: string,                 // uuid del usuario que hizo el cambio
//   payload: { ... }                  // datos del evento (ver formatMessage)
// }
// Para avisos:
// {
//   avisoId: string,
//   eventType: "aviso_status" | "aviso_comment",
//   actorId?: string,
//   payload: { ... }
// }
//
// Limitación: WhatsApp Cloud API solo permite texto libre si el destinatario
// interactuó con el bot en las últimas 24h. Fuera de esa ventana hay que usar
// template aprobado. Por ahora hacemos best-effort: si Meta rechaza, log + skip.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendText } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const APP_URL_BASE = "https://klasea-stock.vercel.app/compras";

function linkTo(requestId: string): string {
  return `${APP_URL_BASE}?open=${requestId}`;
}

function linkToAviso(avisoId: string): string {
  return `${APP_URL_BASE}?tab=avisos&aviso=${avisoId}`;
}

function supa(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const { requestId, avisoId, eventType, payload = {}, actorId } = body;
  if ((!requestId && !avisoId) || !eventType) {
    return new Response(JSON.stringify({ error: "requestId/avisoId y eventType requeridos" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = avisoId
      ? await notifyAvisoParticipants({ avisoId, eventType, payload, actorId })
      : await notifyParticipants({ requestId, eventType, payload, actorId });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-wa-update] error:", err);
    return new Response(JSON.stringify({ error: String(err).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface NotifyArgs {
  requestId: string;
  eventType: string;
  payload: Record<string, any>;
  actorId?: string;
}

interface NotifyAvisoArgs {
  avisoId: string;
  eventType: string;
  payload: Record<string, any>;
  actorId?: string;
}

async function notifyParticipants(args: NotifyArgs): Promise<{ sent: number; skipped: number; errors: number }> {
  const db = supa();

  const { data: request, error: reqErr } = await db
    .from("purchase_requests")
    .select(`
      id, title, status, priority, source,
      created_by,
      creator:profiles!purchase_requests_created_by_fkey(id, username)
    `)
    .eq("id", args.requestId)
    .maybeSingle();

  if (reqErr || !request) {
    console.warn("[notify-wa-update] request no encontrado:", args.requestId);
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // Regla: se notifica al creador y a los copiados que pidieron WhatsApp.
  // Si el actor es el mismo destinatario, no se notifica.
  const creatorId = request.created_by;
  const recipientIds = new Set<string>();

  if (creatorId && (args.eventType === "created" || !args.actorId || args.actorId !== creatorId)) {
    recipientIds.add(creatorId);
  }

  const { data: followerRows, error: followerErr } = await db
    .from("request_followers")
    .select("user_id")
    .eq("request_id", args.requestId)
    .eq("notify_whatsapp", true);

  if (followerErr) {
    console.error("[notify-wa-update] error buscando followers:", followerErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }

  for (const f of followerRows || []) {
    const uid = String((f as any).user_id || "");
    if (!uid) continue;
    if (args.actorId && args.actorId === uid) continue;
    recipientIds.add(uid);
  }

  if (recipientIds.size === 0) {
    return { sent: 0, skipped: 1, errors: 0 };
  }

  // Buscar teléfonos verificados de destinatarios
  const { data: phones, error: phErr } = await db
    .from("user_phones")
    .select("user_id, phone, profiles:profiles!user_phones_user_id_fkey(username)")
    .in("user_id", [...recipientIds])
    .not("verified_at", "is", null);

  if (phErr) {
    console.error("[notify-wa-update] error buscando teléfonos:", phErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }

  if (!phones || phones.length === 0) {
    // Nadie tiene WhatsApp vinculado — no podemos notificar.
    return { sent: 0, skipped: recipientIds.size, errors: 0 };
  }

  const message = formatMessage(args.eventType, request as any, args.payload);
  if (!message) {
    console.warn("[notify-wa-update] eventType desconocido:", args.eventType);
    return { sent: 0, skipped: recipientIds.size, errors: 0 };
  }

  let sent = 0, errors = 0;
  for (const p of phones) {
    try {
      await sendText(p.phone, message);
      sent++;
      console.log(`[notify-wa-update] enviado a ${p.phone} (${(p as any).profiles?.username}) — ${args.eventType}`);
    } catch (err) {
      errors++;
      console.warn(`[notify-wa-update] falla envío a ${p.phone}:`, String(err).slice(0, 200));
      // Si es 131047 (re-engagement requerido), simplemente loggeamos.
      // Para producción real habría que armar templates aprobados.
    }
  }

  return { sent, skipped: Math.max(0, recipientIds.size - sent), errors };
}

async function notifyAvisoParticipants(args: NotifyAvisoArgs): Promise<{ sent: number; skipped: number; errors: number }> {
  const db = supa();

  const { data: aviso, error: avisoErr } = await db
    .from("compras_avisos")
    .select(`
      id, titulo, estado, prioridad, created_by,
      creator:profiles!compras_avisos_created_by_fkey(id, username)
    `)
    .eq("id", args.avisoId)
    .maybeSingle();

  if (avisoErr || !aviso) {
    console.warn("[notify-wa-update] aviso no encontrado:", args.avisoId);
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const creatorId = aviso.created_by;
  if (!creatorId) return { sent: 0, skipped: 0, errors: 0 };
  if (args.actorId && args.actorId === creatorId) {
    return { sent: 0, skipped: 1, errors: 0 };
  }

  const { data: phones, error: phErr } = await db
    .from("user_phones")
    .select("user_id, phone, profiles:profiles!user_phones_user_id_fkey(username)")
    .eq("user_id", creatorId)
    .not("verified_at", "is", null);

  if (phErr) {
    console.error("[notify-wa-update] error buscando teléfonos para aviso:", phErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }

  if (!phones || phones.length === 0) {
    return { sent: 0, skipped: 1, errors: 0 };
  }

  const message = formatAvisoMessage(args.eventType, aviso as any, args.payload);
  if (!message) {
    console.warn("[notify-wa-update] eventType aviso desconocido:", args.eventType);
    return { sent: 0, skipped: phones.length, errors: 0 };
  }

  let sent = 0, errors = 0;
  for (const p of phones) {
    try {
      await sendText(p.phone, message);
      sent++;
      console.log(`[notify-wa-update] aviso enviado a ${p.phone} (${(p as any).profiles?.username}) — ${args.eventType}`);
    } catch (err) {
      errors++;
      console.warn(`[notify-wa-update] falla envío aviso a ${p.phone}:`, String(err).slice(0, 200));
    }
  }

  return { sent, skipped: Math.max(0, phones.length - sent), errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatos de mensaje por tipo de evento.
// ─────────────────────────────────────────────────────────────────────────────
function formatMessage(eventType: string, request: any, payload: Record<string, any>): string | null {
  const title = request.title || "Pedido";
  const actorName = payload.actorName || "Alguien";

  switch (eventType) {
    case "created": {
      const source = payload.source === "whatsapp" ? "WhatsApp" : "la app";
      return `Pedido creado: *${title}*\n\nCompras fue notificado.\nCreado desde ${source}.\n\n${linkTo(request.id)}`;
    }

    case "status": {
      const oldLabel = labelStatus(payload.oldStatus);
      const newLabel = labelStatus(payload.newStatus);
      const emoji = statusEmoji(payload.newStatus);
      return `${emoji} *${title}*\n\nEstado: ${oldLabel} → *${newLabel}*\n_${actorName}_\n\n🔗 ${linkTo(request.id)}`;
    }

    case "priority": {
      const oldL = labelPriority(payload.oldPriority);
      const newL = labelPriority(payload.newPriority);
      const emoji = newL === "URGENTE" ? "🚨" : "⚡";
      return `${emoji} *${title}*\n\nPrioridad: ${oldL} → *${newL}*\n_${actorName}_\n\n🔗 ${linkTo(request.id)}`;
    }

    case "comment": {
      const body = String(payload.body || "").slice(0, 300);
      const trail = String(payload.body || "").length > 300 ? "…" : "";
      return `💬 *${title}*\n\n${actorName}:\n${body}${trail}\n\n🔗 ${linkTo(request.id)}`;
    }

    case "item_status": {
      const itemDesc = String(payload.itemDescription || "ítem").slice(0, 80);
      const newL = labelItemStatus(payload.newStatus);
      const emoji = itemStatusEmoji(payload.newStatus);
      return `${emoji} Ítem *${itemDesc}* → *${newL}*\nPedido: ${title}\n_${actorName}_\n\n🔗 ${linkTo(request.id)}`;
    }

    case "amount": {
      const amt = formatMoney(payload.amount);
      const kind = payload.kind === "actual" ? "Costo real" : "Cotización";
      return `💰 *${title}*\n\n${kind}: *${amt}*\n_${actorName}_\n\n🔗 ${linkTo(request.id)}`;
    }

    case "delivery_date": {
      const date = String(payload.date || "").slice(0, 30);
      return `📅 *${title}*\n\nFecha estimada de entrega: *${date}*\n_${actorName}_\n\n🔗 ${linkTo(request.id)}`;
    }

    case "received": {
      const qty = String(payload.quantity || "").slice(0, 80);
      const notes = String(payload.notes || "").slice(0, 200);
      const lines = [`✅ *RECIBIDO* — ${title}`];
      if (qty) lines.push(`Cantidad: ${qty}`);
      if (notes) lines.push(`Notas: ${notes}`);
      lines.push(`_${actorName}_`);
      lines.push(``);
      lines.push(`🔗 ${linkTo(request.id)}`);
      return lines.join("\n");
    }

    default:
      return null;
  }
}

function formatAvisoMessage(eventType: string, aviso: any, payload: Record<string, any>): string | null {
  const title = aviso.titulo || "Aviso a compras";
  const actorName = payload.actorName || "Compras";

  switch (eventType) {
    case "aviso_status": {
      const oldLabel = labelAvisoStatus(payload.oldStatus);
      const newLabel = labelAvisoStatus(payload.newStatus);
      return `📌 *Aviso a compras*\n\n*${title}*\nEstado: ${oldLabel} → *${newLabel}*\n_${actorName}_\n\n🔗 ${linkToAviso(aviso.id)}`;
    }

    case "aviso_comment": {
      const body = String(payload.body || "").slice(0, 300);
      const trail = String(payload.body || "").length > 300 ? "…" : "";
      return `💬 *Aviso a compras*\n\n*${title}*\n${actorName}:\n${body}${trail}\n\n🔗 ${linkToAviso(aviso.id)}`;
    }

    default:
      return null;
  }
}

// ─── Labels y emojis ─────────────────────────────────────────────────────────
function labelStatus(s?: string): string {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "en_revision": return "En revisión";
    case "cotizando": return "Cotizando";
    case "comprado": return "Comprado";
    case "recibido": return "Recibido";
    case "cancelado": return "Cancelado";
    default: return s || "?";
  }
}

function labelAvisoStatus(s?: string): string {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "visto": return "Visto";
    case "en_proceso": return "En proceso";
    case "resuelto": return "Resuelto";
    case "descartado": return "Descartado";
    default: return s || "?";
  }
}

function statusEmoji(s?: string): string {
  switch (s) {
    case "nuevo": return "🆕";
    case "en_revision": return "👀";
    case "cotizando": return "💲";
    case "comprado": return "🛒";
    case "recibido": return "✅";
    case "cancelado": return "❌";
    default: return "🔄";
  }
}

function labelPriority(p?: string): string {
  switch (p) {
    case "baja": return "Baja";
    case "media": return "Media";
    case "alta": return "Alta";
    case "urgente": return "URGENTE";
    default: return p || "?";
  }
}

function labelItemStatus(s?: string): string {
  switch (s) {
    case "pendiente": return "Pendiente";
    case "en_panol": return "En pañol";
    case "pedido": return "Pedido";
    case "recibido": return "Recibido";
    case "cancelado": return "Cancelado";
    default: return s || "?";
  }
}

function itemStatusEmoji(s?: string): string {
  switch (s) {
    case "en_panol": return "📦";
    case "pedido": return "🛒";
    case "recibido": return "✅";
    case "cancelado": return "❌";
    default: return "📋";
  }
}

function formatMoney(n: any): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? "?");
  return `$${x.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}
