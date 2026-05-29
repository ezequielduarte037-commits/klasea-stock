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

/**
 * Envía un mensaje de texto libre. Solo funciona dentro de la ventana de 24h
 * (es decir, el destinatario tiene que haber mandado algo en las últimas 24h).
 * Fuera de la ventana hay que usar templates aprobados.
 */
export async function sendText(to: string, text: string): Promise<unknown> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WA sendText failed (${res.status}): ${errText}`);
  }
  return await res.json();
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
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WA sendTemplate failed (${res.status}): ${errText}`);
  }
  return await res.json();
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
