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
  reviseDraftWithBot,
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
let warnedMissingAppSecret = false;

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hasValidMetaSignature(rawBody: string, signature: string, appSecret: string): Promise<boolean> {
  const supplied = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, supplied);
}

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

  const rawBody = await req.text();
  const appSecret = String(Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();
  if (appSecret) {
    const signature = req.headers.get("X-Hub-Signature-256") || "";
    if (!(await hasValidMetaSignature(rawBody, signature, appSecret))) {
      console.warn("[wa-webhook] firma de Meta ausente o invalida");
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (!warnedMissingAppSecret) {
    warnedMissingAppSecret = true;
    console.warn("[wa-webhook] WHATSAPP_APP_SECRET no configurado; firma de Meta aun no exigida");
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (body?.object !== "whatsapp_business_account") {
    return new Response("Invalid webhook object", { status: 400 });
  }
  const expectedPhoneId = String(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
  const receivedPhoneId = String(body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || "").trim();
  if (expectedPhoneId && receivedPhoneId !== expectedPhoneId) {
    console.warn("[wa-webhook] phone_number_id no coincide con la cuenta configurada");
    return new Response("Invalid destination", { status: 403 });
  }

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

  const messages = Array.isArray(value?.messages) ? value.messages : [];
  const msg = messages[0];
  if (!msg) return;

  const from = String(msg.from || "");
  if (!from) return;
  const messageId = msg.id;
  const type = msg.type;
  console.log(`[wa-webhook] msg de ${from} tipo=${type}`);

  // Ignorar mensajes viejos: Meta REINTENTA entregar webhooks que fallaron
  // (p. ej. durante el outage por el 401). Sin esto, el bot responde "de la nada"
  // a un mensaje de hace horas. Solo procesamos lo de los últimos ~10 minutos.
  const tsSec = Number(msg.timestamp || 0);
  if (tsSec > 0 && Date.now() / 1000 - tsSec > 600) {
    console.log(`[wa-webhook] mensaje viejo (${Math.round(Date.now() / 1000 - tsSec)}s) — reintento de Meta, ignorado`);
    if (messageId) markRead(messageId);
    return;
  }

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
  // Cancelar / reset: detecta la intención aunque NO esté al inicio
  // ("quiero cancelar ese pedido", "descartá eso", "olvidate", etc.).
  if (/\b(cancelar|cancel[aá]|descart\w+|resetear|reset|salir|olvidate|olvid[aá])\b/i.test(lower)) {
    await resetConversation(db, from);
    await sendText(from, "Listo, cancelé lo que estaba en curso. Mandame qué necesitás cuando quieras.");
    return;
  }

  // 3) Estado de conversación
  const { data: convo } = await db
    .from("bot_conversations")
    .select("phone, user_id, state, context, last_message_at")
    .eq("phone", from)
    .maybeSingle();

  // Si la última actividad es vieja (>30 min), NO revivimos un borrador colgado:
  // arrancamos de cero para no tomar un "hola" como corrección de algo viejo.
  const STALE_MS = 30 * 60 * 1000;
  const lastAt = convo?.last_message_at ? new Date(convo.last_message_at).getTime() : 0;
  const stale = lastAt > 0 && Date.now() - lastAt > STALE_MS;

  const state = stale ? "idle" : (convo?.state || "idle");
  const ctx = (stale ? {} : (convo?.context || {})) as { history?: HistoryTurn[]; draft?: ParsedPedido; photo_urls?: string[]; photo_media_ids?: string[] };
  const history: HistoryTurn[] = Array.isArray(ctx.history) ? ctx.history : [];
  const photoUrls: string[] = Array.isArray(ctx.photo_urls) ? ctx.photo_urls : [];
  const photoMediaIds: string[] = Array.isArray(ctx.photo_media_ids) ? ctx.photo_media_ids : [];

  // Saludo suelto con algo pendiente → NO es una corrección. Reseteamos y saludamos.
  const isGreeting = lower.length <= 20 &&
    /^(hola+|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|hey|ey|hello|hi|que tal|qué tal)\b/i.test(lower);
  if (isGreeting && state !== "idle") {
    await resetConversation(db, from);
    await sendText(from, `¡Hola ${profile.username}! 👋 ¿Qué necesitás pedir?`);
    return;
  }

  // 4) Esperando confirmación de un draft → manejar sí/no/correcciones
  if (state === "awaiting_confirm" && ctx.draft) {
    await handleConfirmation(db, from, profile, inputText, ctx.draft, history, photoUrls, photoMediaIds, messages);
    return;
  }

  // 5) Default: turno conversacional con LLM
  await handleConversationTurn(db, from, profile, messages, history, photoUrls, photoMediaIds);
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
async function uploadPurchasePhotoFromBlob(
  db: SupabaseClient,
  profile: any,
  blob: Blob,
  mimeType?: string,
): Promise<string | null> {
  const ext = ((mimeType || "image/jpeg").split("/")[1] || "jpg").split("+")[0];
  const path = `${profile.id}/wa-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage
    .from("purchase-request-photos")
    .upload(path, blob, { cacheControl: "3600", contentType: mimeType || "image/jpeg", upsert: false });

  if (upErr) {
    console.error("[wa-webhook] error subiendo foto a storage:", upErr);
    return null;
  }

  const { data: pub } = db.storage.from("purchase-request-photos").getPublicUrl(path);
  return pub?.publicUrl || null;
}

async function appendIncomingImagesToPhotos(
  db: SupabaseClient,
  profile: any,
  messages: any[],
  existingPhotos: string[] = [],
  existingMediaIds: string[] = [],
  includeVision = false,
): Promise<{
  photoUrls: string[];
  photoMediaIds: string[];
  visionImages: Array<{ mimeType: string; base64: string }>;
  added: number;
}> {
  const photoUrls = [...existingPhotos];
  const mediaIds = [...existingMediaIds];
  const seen = new Set(mediaIds);
  const visionImages: Array<{ mimeType: string; base64: string }> = [];
  let added = 0;

  for (const msg of messages || []) {
    const mediaId = msg?.image?.id;
    if (!mediaId || seen.has(mediaId)) continue;

    try {
      const { blob, mimeType } = await downloadMedia(mediaId);
      if (includeVision) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < buf.length; i += chunkSize) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
        }
        visionImages.push({ mimeType: mimeType || "image/jpeg", base64: btoa(binary) });
        console.log(`[wa-webhook] imagen descargada (${buf.length} bytes, ${mimeType})`);
      }

      const publicUrl = await uploadPurchasePhotoFromBlob(db, profile, blob, mimeType);
      if (publicUrl) {
        photoUrls.push(publicUrl);
        mediaIds.push(mediaId);
        seen.add(mediaId);
        added += 1;
        console.log(`[wa-webhook] foto adjuntada al pedido: ${publicUrl}`);
      }
    } catch (err) {
      console.error("[wa-webhook] error adjuntando imagen al pedido pendiente:", err);
    }
  }

  return { photoUrls, photoMediaIds: mediaIds, visionImages, added };
}

async function handleConversationTurn(
  db: SupabaseClient,
  from: string,
  profile: any,
  messages: any[],
  history: HistoryTurn[],
  existingPhotos: string[] = [],
  existingPhotoMediaIds: string[] = [],
): Promise<void> {
  const msg = messages[0];
  // Armar input multimodal
  const input: MessageInput = { images: [], urls: [] };
  // URLs de fotos que ya se adjuntaron en turnos previos + las de este turno.
  let photoUrls: string[] = [...existingPhotos];
  let photoMediaIds: string[] = [...existingPhotoMediaIds];

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

  const imageResult = await appendIncomingImagesToPhotos(
    db,
    profile,
    messages,
    photoUrls,
    photoMediaIds,
    true,
  );
  photoUrls = imageResult.photoUrls;
  photoMediaIds = imageResult.photoMediaIds;
  input.images!.push(...imageResult.visionImages);

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

  if (resp.kind === "draft" && resp.draft) {
    const directEdit = applySimpleDraftEdit(text, resp.draft, projects ?? []);
    resp = directEdit ?? {
      ...resp,
      message: ensureDescriptionVisible(resp.message, resp.draft),
    };
  }

  // Guardar el turno del usuario en history (texto que la IA "vio")
  const userText = [
    text,
    ...(input.images && input.images.length ? [`[imagen adjunta]`] : []),
    ...(input.urls && input.urls.length ? input.urls.map((u) => `[link: ${u.title || u.url}]`) : []),
  ].filter(Boolean).join(" ").trim();

  const newHistory: HistoryTurn[] = [
    ...history,
    { role: "user" as const, content: userText || "(media)" },
    { role: "assistant" as const, content: resp.message },
  ].slice(-MAX_HISTORY);

  if (resp.kind === "question") {
    // Seguimos en modo gathering
    await db.from("bot_conversations").upsert({
      phone: from,
      user_id: profile.id,
      state: "gathering",
      context: { history: newHistory, photo_urls: photoUrls, photo_media_ids: photoMediaIds },
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
    context: { history: newHistory, draft: { ...draft, project_id: projectId }, photo_urls: photoUrls, photo_media_ids: photoMediaIds },
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
  photoUrls: string[] = [],
  photoMediaIds: string[] = [],
  messages: any[] = [],
): Promise<void> {
  const t = text.trim().toLowerCase();
  const incomingImages = await appendIncomingImagesToPhotos(db, profile, messages, photoUrls, photoMediaIds, false);
  const nextPhotoUrls = incomingImages.photoUrls;
  const nextPhotoMediaIds = incomingImages.photoMediaIds;

  if (incomingImages.added > 0 && !t) {
    const newHistory: HistoryTurn[] = [
      ...history,
      { role: "user" as const, content: "[imagen adjunta]" },
      { role: "assistant" as const, content: "Listo, adjunté la foto al pedido pendiente." },
    ].slice(-MAX_HISTORY);
    await db.from("bot_conversations").upsert({
      phone: from,
      user_id: profile.id,
      state: "awaiting_confirm",
      context: { history: newHistory, draft, photo_urls: nextPhotoUrls, photo_media_ids: nextPhotoMediaIds },
      last_message_at: new Date().toISOString(),
    });
    await sendText(from, `Listo, adjunté la foto al ${draft.intent === "aviso" ? "aviso" : "pedido"} pendiente. Van ${nextPhotoUrls.length} foto${nextPhotoUrls.length !== 1 ? "s" : ""}.\n\nRespondé *si* para crear, *no* para descartar, o mandá otra corrección.`);
    return;
  }

  if (/^(si|sí|sip|dale|confirmo|ok|okey|yes|y|listo|👍|✅)\b/i.test(t)) {
    try {
      if (draft.intent === "aviso") {
        const aviso = await createAvisoFromBot(db, profile, from, draft);
        await resetConversation(db, from);
        notifyComprasAviso(aviso.id, draft.title, profile.id, profile.username).catch((e) =>
          console.warn("[wa-webhook] notify aviso fail:", e),
        );
        const url = `https://klasea-stock.vercel.app/compras?tab=avisos&aviso=${aviso.id}`;
        await sendText(from, `✅ Aviso registrado: *${draft.title}*\n\nCompras fue notificado.\n🔗 ${url}`);
        return;
      }

      const request = await createPurchaseRequestFromBot(db, profile, draft, nextPhotoUrls);
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
    await sendText(from, `OK, descarté el ${draft.intent === "aviso" ? "aviso" : "pedido"}. Mandame otra cosa cuando quieras.`);
    return;
  }

  // Cualquier otra cosa → corrección sobre el borrador actual.
  const { data: projects } = await db.from("produccion_obras")
    .select("id, codigo").neq("estado", "archivada");
  const activeProjects = projects ?? [];
  const projectCodes = activeProjects.map((p: any) => p.codigo).filter(Boolean);

  const directEdit = applySimpleDraftEdit(text, draft, activeProjects);
  let resp: BotResponse;
  try {
    resp = directEdit ?? (await reviseDraftWithBot(history, draft, text, { projectCodes }));
  } catch (err) {
    console.error("[wa-webhook] reviseDraftWithBot error:", err);
    await sendText(from, "No pude aplicar esa corrección. ¿Me la mandás de nuevo más concreta?");
    return;
  }

  const userTurn = {
    role: "user" as const,
    content: [text, incomingImages.added > 0 ? "[imagen adjunta]" : ""].filter(Boolean).join(" ").trim(),
  };
  const assistantTurn = { role: "assistant" as const, content: resp.message };
  const newHistory: HistoryTurn[] = [...history, userTurn, assistantTurn].slice(-MAX_HISTORY);

  if (resp.kind === "question") {
    await db.from("bot_conversations").upsert({
      phone: from,
      user_id: profile.id,
      state: "awaiting_confirm",
      context: { history: newHistory, draft, photo_urls: nextPhotoUrls, photo_media_ids: nextPhotoMediaIds },
      last_message_at: new Date().toISOString(),
    });
    await sendText(from, resp.message);
    return;
  }

  const nextDraft = resp.draft!;
  const projectId = matchProjectId(activeProjects, nextDraft.project_code) || draft.project_id || null;
  const savedDraft = { ...nextDraft, project_id: projectId };
  const message = ensureDescriptionVisible(resp.message, savedDraft);

  await db.from("bot_conversations").upsert({
    phone: from,
    user_id: profile.id,
    state: "awaiting_confirm",
    context: { history: newHistory, draft: savedDraft, photo_urls: nextPhotoUrls, photo_media_ids: nextPhotoMediaIds },
    last_message_at: new Date().toISOString(),
  });

  await sendText(from, `${message}\n\nRespondé *si* para crear, *no* para descartar, o corregí lo que falte.`);
}

function matchProjectId(projects: any[], code?: string | null): string | null {
  if (!code) return null;
  const norm = (s: string) => String(s || "").toLowerCase().replace(/^k\s*/, "").replace(/\s+/g, "");
  const target = norm(code);
  const m = projects.find((p) => norm(p.codigo) === target);
  return m?.id || null;
}

function applySimpleDraftEdit(
  text: string,
  draft: ParsedPedido & { project_id?: string | null },
  projects: any[],
): BotResponse | null {
  const note = extractDescriptionNote(text);
  if (!note) return null;

  const mentionedProject = findMentionedProjectCode(text, projects);
  const nextProjectCode = mentionedProject || draft.project_code || null;
  const updatedDraft = {
    ...draft,
    description: appendToDescription(draft.description || draft.title || "", note),
    project_code: nextProjectCode,
    project_id: matchProjectId(projects, nextProjectCode) || draft.project_id || null,
  };

  return {
    kind: "draft",
    draft: updatedDraft,
    message: formatDraftUpdateMessage(updatedDraft, "Listo, agregué esa nota a la descripción."),
  };
}

function extractDescriptionNote(text: string): string | null {
  const patterns = [
    /(?:agr[eé]g(?:a|á|ue|ale|alo|ar)|sum(?:a|á|e|ale)|pon(?:e|é|ele)|inclu(?:i|í|ye|ya))\s+(?:en\s+)?(?:la\s+)?(?:descripci[oó]n|detalle|nota)\s*(?:que|:|-)?\s*(.+)$/i,
    /(?:descripci[oó]n|detalle|nota)\s*(?:que|:|-)\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const note = match?.[1]?.trim();
    if (note) return cleanupNote(note);
  }
  return null;
}

function cleanupNote(note: string): string {
  return note
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendToDescription(description: string, note: string): string {
  const base = description.trim();
  const clean = sentenceCase(cleanupNote(note));
  if (!base) return clean;
  if (base.toLowerCase().includes(clean.toLowerCase())) return base;
  const separator = /[.!?]$/.test(base) ? " " : ". ";
  return `${base}${separator}${clean}`;
}

function sentenceCase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function findMentionedProjectCode(text: string, projects: any[]): string | null {
  const normalizedText = normalizeProjectText(text);
  for (const project of projects) {
    const code = String(project?.codigo || "");
    const normalizedCode = normalizeProjectCode(code);
    if (normalizedCode && normalizedText.includes(normalizedCode)) return code;
  }

  const raw = text.match(/\b(?:k\s*)?(\d{2}(?:[-\s]\d{1,3})?)\b/i);
  if (!raw) return null;
  return `K${raw[1].replace(/\s+/g, "-")}`;
}

function normalizeProjectCode(value: string): string {
  return String(value || "").toLowerCase().replace(/^k\s*/, "").replace(/\s+/g, "");
}

function normalizeProjectText(value: string): string {
  return String(value || "").toLowerCase().replace(/\bk\s*/g, "").replace(/\s+/g, "");
}

function formatDraftUpdateMessage(draft: ParsedPedido, lead: string): string {
  const lines = [
    lead,
    "",
    `*${draft.title || "Pedido"}*`,
  ];
  if (draft.project_code) lines.push(`Obra: ${draft.project_code}`);
  if (draft.priority) lines.push(`Prioridad: ${draft.priority}`);
  if (draft.description) lines.push(`Descripción: ${truncateText(draft.description, 420)}`);
  if (Array.isArray(draft.items) && draft.items.length > 0) {
    lines.push("");
    lines.push("Ítems:");
    for (const item of draft.items.slice(0, 8)) {
      const qty = item.quantity ? `${item.quantity} ${item.unit || ""}`.trim() : "";
      lines.push(`• ${[qty, item.description].filter(Boolean).join(" - ")}`);
    }
  }
  return lines.join("\n");
}

function ensureDescriptionVisible(message: string, draft: ParsedPedido): string {
  const description = String(draft.description || "").trim();
  if (!description || description.length < 8) return message;
  if (String(draft.title || "").trim().toLowerCase() === description.toLowerCase()) return message;
  if (message.toLowerCase().includes(description.toLowerCase())) return message;
  return `${message}\n\nDescripción: ${truncateText(description, 420)}`;
}

function truncateText(value: string, max: number): string {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB
// ─────────────────────────────────────────────────────────────────────────────
async function createPurchaseRequestFromBot(
  db: SupabaseClient, profile: any, draft: any, photoUrls: string[] = [],
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
    // Foto principal + galería con TODAS las fotos que el usuario mandó al bot.
    photo_url: photoUrls[0] || null,
    photo_urls: photoUrls.length ? photoUrls : null,
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
      // Solo conservamos image_url si viene de un link de producto (metadata real).
      // Una foto suelta no tiene URL de ítem confiable → va a la galería del pedido.
      image_url: it.link_url ? (it.image_url || null) : null,
    }));
    await db.from("purchase_request_items").insert(itemRows);
  }
  return request;
}

async function createAvisoFromBot(
  db: SupabaseClient,
  profile: any,
  phone: string,
  draft: ParsedPedido & { project_id?: string | null },
): Promise<{ id: string }> {
  const material = String(draft.material || "").trim()
    || firstItemDescription(draft)
    || String(draft.title || "").trim();
  const payload = {
    titulo: draft.title || material || "Aviso a compras",
    detalle: draft.description || draft.title || null,
    material: material || null,
    project_id: draft.project_id || null,
    destino: draft.project_id ? null : (draft.destino || draft.project_code || null),
    prioridad: draft.priority || "media",
    estado: "nuevo",
    origen: "whatsapp",
    created_by: profile.id,
    source_ref: `${profile.username || "usuario"} / ${phone}`,
  };

  const { data, error } = await db
    .from("compras_avisos")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

function firstItemDescription(draft: ParsedPedido): string | null {
  const first = Array.isArray(draft.items) ? draft.items[0] : null;
  return first?.description ? String(first.description).trim() : null;
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

async function notifyComprasAviso(
  avisoId: string, title: string, userId: string, username: string,
): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notificar-email-compras`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      type: "nuevo_aviso",
      avisoId,
      requestTitle: title,
      changedBy: userId,
      createdByName: username,
      source: "whatsapp",
    }),
  });
}
