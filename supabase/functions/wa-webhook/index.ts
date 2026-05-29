// WhatsApp Cloud API webhook receiver — bot conversacional.
// Recibe: GET (verify) y POST (mensajes). Para mensajes vinculados:
//   - texto / botón / interactivo
//   - foto (vision)
//   - audio / voz (transcripto con Whisper)
//   - URLs (fetch de metadata Open Graph)
// Mantiene un historial multi-turn en bot_conversations.context.history y
// deja que el LLM decida si preguntar más o proponer un draft.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendText, markRead, downloadMedia } from "../_shared/whatsapp.ts";
import {
  chatWithBot,
  transcribeAudio,
  type BotResponse,
  type HistoryTurn,
  type MessageInput,
  type ParsedPedido,
} from "../_shared/openai.ts";
import { extractUrls, fetchUrlMeta } from "../_shared/urlmeta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_HISTORY = 16; // últimos 16 turnos (8 user + 8 assistant)

function supa(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const processing = handleEvent(body).catch((err) => {
    console.error("[wa-webhook] error procesando evento:", err);
  });

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(processing);
  } else {
    await processing;
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
async function handleEvent(body: any): Promise<void> {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (value?.statuses) {
    console.log("[wa-webhook] status:", JSON.stringify(value.statuses));
    return;
  }

  const msg = value?.messages?.[0];
  if (!msg) return;

  const from = String(msg.from || "");
  if (!from) return;
  const messageId = msg.id;
  const type = msg.type;
  console.log(`[wa-webhook] msg de ${from} tipo=${type}`);
  if (messageId) markRead(messageId);

  const db = supa();

  // 1) Vinculación
  const { data: bound } = await db
    .from("user_phones")
    .select("user_id, verified_at, profiles:profiles!user_phones_user_id_fkey(id, username, role, is_admin)")
    .eq("phone", from)
    .not("verified_at", "is", null)
    .maybeSingle();

  // Para mensajes de no-vinculados, solo procesamos el texto
  const inputText = await extractTextOnly(msg);

  if (!bound) {
    await handleUnbound(db, from, inputText);
    return;
  }

  const profile = (bound as any).profiles;
  if (!profile) {
    await sendText(from, "No encontré tu perfil en el sistema. Avisale a un admin.");
    return;
  }

  // 2) Comandos rápidos
  const lower = inputText.trim().toLowerCase();
  if (/^(menu|ayuda|help|\?)\b/i.test(lower)) {
    await sendHelp(from, profile.username);
    return;
  }
  if (/^(cancelar|salir|reset)\b/i.test(lower)) {
    await resetConversation(db, from);
    await sendText(from, "Listo, cancelé lo que estaba en curso. Mandame algo cuando quieras.");
    return;
  }

  // 3) Estado de conversación
  const { data: convo } = await db
    .from("bot_conversations")
    .select("phone, user_id, state, context")
    .eq("phone", from)
    .maybeSingle();

  const state = convo?.state || "idle";
  const ctx = (convo?.context || {}) as { history?: HistoryTurn[]; draft?: ParsedPedido };
  const history: HistoryTurn[] = Array.isArray(ctx.history) ? ctx.history : [];

  // 4) Esperando confirmación de un draft → manejar sí/no/correcciones
  if (state === "awaiting_confirm" && ctx.draft) {
    await handleConfirmation(db, from, profile, inputText, ctx.draft, history);
    return;
  }

  // 5) Default: turno conversacional con LLM
  await handleConversationTurn(db, from, profile, msg, history);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vinculación
// ─────────────────────────────────────────────────────────────────────────────
async function extractTextOnly(msg: any): Promise<string> {
  if (msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.image?.caption) return msg.image.caption;
  return "";
}

async function handleUnbound(db: SupabaseClient, from: string, text: string): Promise<void> {
  const match = text.match(/(?:vincular|asociar|link)\s+(\d{6})/i);
  if (!match) {
    await sendText(from,
      `Hola 👋\n\nTu número no está vinculado todavía.\n\nPara conectarte:\n1) Entrá al sistema klasea-stock\n2) Sidebar → botón de teléfono ☎\n3) Te va a dar un código de 6 dígitos\n4) Mandalo acá así: *vincular 123456*`);
    return;
  }
  const code = match[1];
  const { data: pending } = await db
    .from("user_phones")
    .select("user_id, pending_code_expires_at, profiles:profiles!user_phones_user_id_fkey(username)")
    .eq("pending_code", code).maybeSingle();
  if (!pending) { await sendText(from, "❌ Código inválido. Generá uno nuevo desde el sistema."); return; }
  const expiresAt = new Date((pending as any).pending_code_expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    await sendText(from, "❌ El código venció. Generá uno nuevo desde el sistema."); return;
  }
  const { data: phoneTaken } = await db.from("user_phones")
    .select("user_id").eq("phone", from).neq("user_id", (pending as any).user_id).maybeSingle();
  if (phoneTaken) { await sendText(from, "❌ Este número ya está vinculado a otro usuario."); return; }
  const { error } = await db.from("user_phones").update({
    phone: from, verified_at: new Date().toISOString(),
    pending_code: null, pending_code_expires_at: null,
  }).eq("user_id", (pending as any).user_id);
  if (error) { console.error(error); await sendText(from, "❌ Error guardando la vinculación."); return; }
  const username = (pending as any).profiles?.username || "usuario";
  await sendText(from,
    `✅ Listo, ${username}. Estás conectado.\n\nMandame lo que necesitás pedir a compras. Podés mandar texto, foto, audio, o link de Mercado Libre. Si me falta info te voy a preguntar antes de armar el pedido.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ayuda / reset
// ─────────────────────────────────────────────────────────────────────────────
async function sendHelp(to: string, username: string): Promise<void> {
  await sendText(to,
`Hola ${username} 👋

Puedo armarte pedidos para compras. Decime qué necesitás como si me lo contaras a un colega.

Lo que entiendo:
• Texto en cualquier formato
• Fotos (con o sin descripción)
• Audios (los transcribo)
• Links de Mercado Libre u otros (los abro y leo)

Si me falta info importante (cantidad, casco, etc) te pregunto. Cuando esté claro, te muestro un resumen y vos confirmás.

Comandos:
• *ayuda* — este mensaje
• *cancelar* — descarta el pedido en curso y reinicia`);
}

async function resetConversation(db: SupabaseClient, phone: string): Promise<void> {
  await db.from("bot_conversations").upsert({
    phone, state: "idle", context: {}, last_message_at: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Turno conversacional (gathering / draft)
// ─────────────────────────────────────────────────────────────────────────────
async function handleConversationTurn(
  db: SupabaseClient,
  from: string,
  profile: any,
  msg: any,
  history: HistoryTurn[],
): Promise<void> {
  // Armar input multimodal
  const input: MessageInput = { images: [], urls: [] };

  // Texto / caption
  let text = "";
  if (msg.text?.body) text = msg.text.body;
  else if (msg.image?.caption) text = msg.image.caption;
  else if (msg.button?.text) text = msg.button.text;
  else if (msg.interactive?.button_reply?.title) text = msg.interactive.button_reply.title;
  else if (msg.interactive?.list_reply?.title) text = msg.interactive.list_reply.title;

  // Audio → Whisper
  if ((msg.type === "audio" || msg.type === "voice")) {
    const mediaId = msg.audio?.id || msg.voice?.id;
    if (mediaId) {
      try {
        const { blob, mimeType } = await downloadMedia(mediaId);
        text = (await transcribeAudio(blob, mimeType)).trim();
        console.log(`[wa-webhook] audio transcripto: "${text.slice(0, 100)}"`);
      } catch (err) {
        console.error("[wa-webhook] transcribe error:", err);
        await sendText(from, "No pude transcribir el audio. ¿Podés escribirlo o mandarlo de nuevo?");
        return;
      }
    }
  }

  input.text = text;

  // Imagen → descargo + base64 para vision
  if (msg.image?.id) {
    try {
      const { blob, mimeType } = await downloadMedia(msg.image.id);
      const buf = new Uint8Array(await blob.arrayBuffer());
      // btoa con chunks (Deno no maneja > ~100KB en una sola call sin issues)
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < buf.length; i += chunkSize) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      input.images!.push({ mimeType: mimeType || "image/jpeg", base64 });
      console.log(`[wa-webhook] imagen descargada (${buf.length} bytes, ${mimeType})`);
    } catch (err) {
      console.error("[wa-webhook] error descargando imagen:", err);
    }
  }

  // URLs en el texto → fetch metadata
  const urls = extractUrls(text);
  if (urls.length > 0) {
    const fetches = await Promise.all(urls.slice(0, 3).map(fetchUrlMeta));
    input.urls = fetches.map((m) => ({
      url: m.url, title: m.title, description: m.description, price: m.price, site: m.site,
    }));
    console.log(`[wa-webhook] URLs procesadas: ${urls.length}`);
  }

  if (!input.text && (!input.images || input.images.length === 0)) {
    await sendText(from, "No entendí qué mandaste. Probá texto, foto, audio o link.");
    return;
  }

  // Códigos de obra activos para que el LLM matchee correctamente
  const { data: projects } = await db.from("produccion_obras")
    .select("id, codigo").neq("estado", "archivada");
  const projectCodes = (projects ?? []).map((p: any) => p.codigo).filter(Boolean);

  // Llamar al LLM
  let resp: BotResponse;
  try {
    resp = await chatWithBot(history, input, { projectCodes });
  } catch (err) {
    console.error("[wa-webhook] chatWithBot error:", err);
    await sendText(from, "Hmm, tuve un problema procesando tu mensaje. Probá de nuevo en un momento.");
    return;
  }

  // Guardar el turno del usuario en history (texto que la IA "vio")
  const userText = [
    text,
    ...(input.images && input.images.length ? [`[imagen adjunta]`] : []),
    ...(input.urls && input.urls.length ? input.urls.map((u) => `[link: ${u.title || u.url}]`) : []),
  ].filter(Boolean).join(" ").trim();

  const newHistory: HistoryTurn[] = [
    ...history,
    { role: "user", content: userText || "(media)" },
    { role: "assistant", content: resp.message },
  ].slice(-MAX_HISTORY);

  if (resp.kind === "question") {
    // Seguimos en modo gathering
    await db.from("bot_conversations").upsert({
      phone: from,
      user_id: profile.id,
      state: "gathering",
      context: { history: newHistory },
      last_message_at: new Date().toISOString(),
    });
    await sendText(from, resp.message);
    return;
  }

  // kind === "draft" — proponer y esperar confirmación
  const draft = resp.draft!;
  const projectId = matchProjectId(projects ?? [], draft.project_code);

  await db.from("bot_conversations").upsert({
    phone: from,
    user_id: profile.id,
    state: "awaiting_confirm",
    context: { history: newHistory, draft: { ...draft, project_id: projectId } },
    last_message_at: new Date().toISOString(),
  });

  await sendText(from, `${resp.message}\n\nRespondé *si* para crear, *no* para descartar, o corregí lo que falte.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmación
// ─────────────────────────────────────────────────────────────────────────────
async function handleConfirmation(
  db: SupabaseClient,
  from: string,
  profile: any,
  text: string,
  draft: ParsedPedido & { project_id?: string | null },
  history: HistoryTurn[],
): Promise<void> {
  const t = text.trim().toLowerCase();

  if (/^(si|sí|sip|dale|confirmo|ok|okey|yes|y|listo|👍|✅)\b/i.test(t)) {
    try {
      const request = await createPurchaseRequestFromBot(db, profile, draft);
      await resetConversation(db, from);
      notifyCompras(request.id, draft.title, profile.id, profile.username).catch((e) =>
        console.warn("[wa-webhook] notify compras fail:", e),
      );
      const url = `https://klasea-stock.vercel.app/compras?open=${request.id}`;
      await sendText(from, `✅ Pedido creado: *${draft.title}*\n\nCompras fue notificado.\n🔗 ${url}`);
    } catch (err) {
      console.error("[wa-webhook] crear pedido fail:", err);
      await sendText(from, "❌ Hubo un error guardando el pedido. Intentá de nuevo.");
    }
    return;
  }

  if (/^(no|nop|cancelar|descartar|borrar)\b/i.test(t)) {
    await resetConversation(db, from);
    await sendText(from, "OK, descarté el pedido. Mandame otra cosa cuando quieras.");
    return;
  }

  // Cualquier otra cosa → corrección. Re-procesamos manteniendo el history.
  // Forzamos un "user" más con el texto de corrección y dejamos al LLM decidir.
  await handleConversationTurn(db, from, profile, { text: { body: text } }, history);
}

function matchProjectId(projects: any[], code?: string | null): string | null {
  if (!code) return null;
  const norm = (s: string) => String(s || "").toLowerCase().replace(/^k\s*/, "").replace(/\s+/g, "");
  const target = norm(code);
  const m = projects.find((p) => norm(p.codigo) === target);
  return m?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB
// ─────────────────────────────────────────────────────────────────────────────
async function createPurchaseRequestFromBot(
  db: SupabaseClient, profile: any, draft: any,
): Promise<{ id: string }> {
  const payload: any = {
    title: draft.title,
    description: draft.description || draft.title,
    priority: draft.priority || "media",
    status: "nuevo",
    project_id: draft.project_id || null,
    needed_at: draft.needed_at || null,
    source: "whatsapp",
    source_ref: profile.username,
    created_by: profile.id,
  };
  const { data: request, error } = await db
    .from("purchase_requests").insert(payload).select("id").single();
  if (error) throw error;

  if (Array.isArray(draft.items) && draft.items.length > 0) {
    const itemRows = draft.items.map((it: any) => ({
      request_id: request.id,
      description: it.description,
      quantity: it.quantity || null,
      unit: it.unit || "unidad",
      link_url: it.link_url || null,
      image_url: it.image_url || null,
    }));
    await db.from("purchase_request_items").insert(itemRows);
  }
  return request;
}

async function notifyCompras(
  requestId: string, title: string, userId: string, username: string,
): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notificar-email-compras`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      type: "new_request", requestId, requestTitle: title,
      changedBy: userId, createdByName: username, source: "whatsapp",
    }),
  });
}
