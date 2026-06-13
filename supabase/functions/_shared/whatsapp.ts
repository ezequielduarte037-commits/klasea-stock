// Helpers de WhatsApp Cloud API.
// Las credenciales viven como secrets en Supabase:
//   WHATSAPP_PHONE_NUMBER_ID  — ID del número (no el número en sí)
//   WHATSAPP_TOKEN            — Access token (24h al principio, después permanente)

const GRAPH_VERSION = "v22.0";

function endpoint(): string {
  const pid = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!pid) throw new Error("Falta WHATSAPP_PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/messages`;
}

function authHeader(): string {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  if (!token) throw new Error("Falta WHATSAPP_TOKEN");
  return `Bearer ${token}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST al Graph API con reintento ante errores TRANSITORIOS de Meta.
 * Meta devuelve seguido un 500 con {"error":{"code":2,"is_transient":true,
 * "message":"An unexpected error has occurred. Please retry your request later."}}.
 * Sin reintento, el bot queda mudo al primer blip. Reintentamos solo cuando es
 * transitorio (5xx o is_transient); en 4xx reales (token, ventana 24h, etc.) cortamos.
 */
async function postGraph(label: string, payload: unknown): Promise<unknown> {
  const url = endpoint();
  const auth = authHeader();
  const MAX = 3;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();

    const errText = await res.text();
    lastErr = errText;
    const transient = res.status >= 500 || /["']?is_transient["']?\s*:\s*true/i.test(errText);
    if (!transient || attempt === MAX) {
      throw new Error(`WA ${label} failed (${res.status}): ${errText}`);
    }
    console.warn(`[whatsapp] ${label}: error transitorio de Meta (${res.status}), reintento ${attempt}/${MAX - 1}…`);
    await sleep(attempt * 800); // 800ms, 1600ms
  }
  throw new Error(`WA ${label} failed: ${lastErr}`);
}

/**
 * Envía un mensaje de texto libre. Solo funciona dentro de la ventana de 24h
 * (es decir, el destinatario tiene que haber mandado algo en las últimas 24h).
 * Fuera de la ventana hay que usar templates aprobados.
 * Reintenta automáticamente ante errores transitorios de Meta.
 */
export async function sendText(to: string, text: string): Promise<unknown> {
  return await postGraph("sendText", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

/**
 * Envía un template aprobado. Usar fuera de la ventana de 24h o para
 * notificaciones proactivas (ej: "tu pedido fue recibido").
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "es_AR",
  components?: unknown[],
): Promise<unknown> {
  return await postGraph("sendTemplate", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/**
 * Descarga el contenido binario de un media (imagen/audio/etc) recibido.
 * Se hace en 2 pasos: primero pedir la URL al media-id, después GET con auth.
 */
export async function downloadMedia(mediaId: string): Promise<{ blob: Blob; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { "Authorization": authHeader() },
  });
  if (!metaRes.ok) {
    throw new Error(`WA media metadata failed (${metaRes.status})`);
  }
  const meta = await metaRes.json();
  const url = meta.url;
  const mimeType = meta.mime_type || "application/octet-stream";

  const fileRes = await fetch(url, {
    headers: { "Authorization": authHeader() },
  });
  if (!fileRes.ok) {
    throw new Error(`WA media download failed (${fileRes.status})`);
  }
  return { blob: await fileRes.blob(), mimeType };
}

/**
 * Marca un mensaje como leído (los ✓✓ azules). Buena práctica para que
 * el usuario sepa que el bot recibió.
 */
export async function markRead(messageId: string): Promise<void> {
  await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => { /* no bloquea si falla */ });
}
