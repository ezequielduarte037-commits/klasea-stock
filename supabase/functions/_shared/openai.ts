// Helper LLM del bot. Dos backends:
//   - OpenRouter (paid) → chat conversacional + vision para fotos / URLs
//   - Groq (free)       → Whisper para transcribir audios de WhatsApp
//
// Secrets:
//   OPENROUTER_API_KEY  → sk-or-v1-... (https://openrouter.ai/keys)
//   GROQ_API_KEY        → para Whisper (gratis en console.groq.com)

// ─── Config ──────────────────────────────────────────────────────────────────
const OR_BASE = "https://openrouter.ai/api/v1";
const OR_MODEL = "openai/gpt-4o-mini";    // vision + chat, cheap, rápido
const GROQ_BASE = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3";

function orAuth(): string {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("Falta OPENROUTER_API_KEY");
  return `Bearer ${key}`;
}

function groqAuth(): string {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("Falta GROQ_API_KEY");
  return `Bearer ${key}`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface ParsedPedido {
  title: string;
  description: string;
  priority: "baja" | "media" | "alta" | "urgente";
  items: Array<{
    description: string;
    quantity?: string;
    unit?: string;
    link_url?: string;
    image_url?: string;
  }>;
  project_code?: string | null;
  needed_at?: string | null;
}

export interface BotResponse {
  /** "question" → seguir conversando.  "draft" → mostrar resumen y pedir confirmación. */
  kind: "question" | "draft";
  /** Texto a mandar al usuario por WhatsApp. */
  message: string;
  /** Si kind === "draft", el pedido propuesto. */
  draft?: ParsedPedido;
}

/** Historial guardado en bot_conversations.context.history */
export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MessageInput {
  text?: string;
  /** Base64 de imágenes ya descargadas (sin el prefijo data:...). */
  images?: Array<{ mimeType: string; base64: string }>;
  /** Metadata de URLs detectadas en el texto. */
  urls?: Array<{ url: string; title?: string; description?: string; price?: string; site?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// chatWithBot — turno conversacional principal
// ─────────────────────────────────────────────────────────────────────────────
export async function chatWithBot(
  history: HistoryTurn[],
  input: MessageInput,
  opts?: { projectCodes?: string[] },
): Promise<BotResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const projectsHint = opts?.projectCodes?.length
    ? `Códigos de obra válidos en el sistema: ${opts.projectCodes.join(", ")}. Hacé matching flexible (K55-1 ≈ 55-1 ≈ K 55 1).`
    : "";

  const system = `Sos el asistente de compras del astillero Klase A. Recibís pedidos por WhatsApp de la oficina técnica.

Tu misión: armar un pedido completo y útil siguiendo un PROTOCOLO de preguntas. No saltees pasos. Cuando completaste todo el protocolo, recién ahí proponés el draft para confirmar.

═══════════════════════════════════════════════════════════════════════════
PROTOCOLO DE PREGUNTAS (en este orden, no saltes ningún paso):
═══════════════════════════════════════════════════════════════════════════

Para CADA ítem del pedido:
  PASO 1. QUÉ es. Si es vago ("tornillos", "masilla", "pintura") → pedí especificaciones con opciones concretas: "¿M6, M8 o M10?", "¿epoxi o poliéster?", "¿blanca, gris o transparente?". Una pregunta por turno. Si hay foto, link, marca, modelo o texto visible que ya permite comprarlo, no preguntes specs de nuevo.
  Para insumos genéricos de uso interno (reflectores, guantes, alargues, lámparas, pilas, cinta, trapos, etc.), aceptá la descripción genérica si sirve para compras. No preguntes marca/modelo/tipo salvo que el usuario lo pida o sea imprescindible.
  PASO 2. CANTIDAD. Si no la dijeron, pediscela ("¿cuántos necesitás?"). Aceptá rangos.

Cuando tenés un ítem completo (QUÉ + CUÁNTO):
  PASO 3. OBRA. Preguntá: "¿para qué obra es?". Si responden con código (K55, K42-1, 55-1, etc.) → tomalo. Si dicen "para stock" / "general" / "depósito" → aceptalo y dejá project_code = null. **NUNCA digas "casco", siempre "obra".**

Cuando ya tenés el primer ítem completo + obra:
  PASO 4 (OBLIGATORIO, NUNCA SALTAR). Preguntá EXACTO: "¿agregás algo más al pedido o lo confirmamos así?". Este paso es OBLIGATORIO incluso si parece obvio.
     → Si responden con otro ítem: volvé a PASO 1 con ese ítem nuevo. Cuando lo termines, volvé a preguntar PASO 4 (sumás indefinidamente).
     → Si responden "no" / "nada" / "eso es todo" / "así está bien": seguís al PASO 5.

  PASO 5 (OBLIGATORIO, NUNCA SALTAR). Preguntá EXACTO: "¿qué prioridad? ¿urgente, alta, media o baja?". Si ya lo mencionaron antes en la conversación, no preguntes de vuelta — usa esa.

  PASO 6. Recién ACÁ proponés el draft (kind=draft).

═══════════════════════════════════════════════════════════════════════════
REGLA DURA: el draft (kind=draft) SÓLO sale después de haber preguntado PASO 4 y PASO 5. Si no preguntaste alguno, devolvé kind=question.
═══════════════════════════════════════════════════════════════════════════

Preguntá con criterio: no hagas preguntas "por las dudas". Si el usuario dio una descripción usable para compras, avanzá. Pedí aclaración solo cuando el dato faltante cambia claramente qué se compra, cuánta cantidad va, para qué obra/stock es, o la prioridad.

DESCRIPCIÓN / NOTAS:
- Si el usuario pide "agregá en la descripción...", "sumá como detalle...", "nota: ...", o dice el motivo/uso ("son para los trabajadores del 52-23"), incorporalo en "description".
- Si esa nota menciona una obra/código, usalo también para project_code cuando matchee una obra válida.
- No conviertas una nota interna en un ítem nuevo.

═══════════════════════════════════════════════════════════════════════════
LINKS (Mercado Libre, etc.):
═══════════════════════════════════════════════════════════════════════════

Cuando el usuario manda un link, vas a recibir título / precio / descripción / imagen del producto.
- Tomá el título del producto como descripción del ítem.
- Guardá la URL completa en "link_url" del ítem.
- Si hay imagen del producto, guardala en "image_url" del ítem.
- Igual seguís el protocolo: si no dijeron cantidad, preguntala. Si no dijeron obra, preguntala. PASO 4 y 5 obligatorios.

═══════════════════════════════════════════════════════════════════════════
FOTOS (no links, sino fotos directas):
═══════════════════════════════════════════════════════════════════════════

Si te mandan una foto, mirala. Si es captura de producto, etiqueta, caja o folleto, leé el texto visible como OCR: marca, modelo, potencia, tensión, medida, color, IP, material y cualquier descripción del producto. Usá esos datos para describir el ítem. Si identificás el ítem, dalo por bueno. Si no, preguntá: "¿qué necesitás exactamente? ¿este mismo modelo, una pieza de repuesto, o algo similar?".

═══════════════════════════════════════════════════════════════════════════
ESTILO:
═══════════════════════════════════════════════════════════════════════════

- Rioplatense informal, breve, directo. Sin "estimado", sin "saludos cordiales".
- UNA pregunta por turno. Nunca preguntes dos cosas a la vez.
- Si hay opción múltiple, ofrecé 2-4 opciones concretas: "¿M6, M8 o M10?".
- Si el usuario claramente quiere acelerar ("dale ya", "no me preguntes más", "mandalo"), saltá los PASO 4 y 5 y proponé el draft con lo que tengas.
- Mensajes no-pedido (hola, gracias): respondé cordial breve y guialo.

PRIORIDAD (mapeo de la respuesta del usuario en PASO 5):
- "urgente", "ya", "ahora", "para hoy/mañana" → "urgente"
- "alta", "importante", "rápido", "esta semana" → "alta"
- "media", "normal", "como siempre" → "media"
- "baja", "cuando puedan", "sin apuro" → "baja"

UNIDADES típicas: unidad, kg, metro, m², litro, lata, rollo, par, juego, caja.

${projectsHint}

═══════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA — SIEMPRE JSON ESTRICTO (sin markdown, sin backticks).
═══════════════════════════════════════════════════════════════════════════

A) Necesitás más info (cualquier paso del protocolo no completado):
{"kind":"question","message":"<texto literal que el usuario va a leer en WhatsApp>"}

B) Ya completaste PASO 4 y PASO 5 — proponé el pedido:
{
  "kind":"draft",
  "draft":{
    "title":"título DESCRIPTIVO del pedido — ver REGLAS DE TÍTULO abajo",
    "description":"detalle de lo que se pide",
    "priority":"baja|media|alta|urgente",
    "items":[
      {"description":"...","quantity":"...","unit":"...","link_url":"opcional","image_url":"opcional"}
    ],
    "project_code":"K55-1",
    "needed_at":"YYYY-MM-DD"
  },
  "message":"<texto literal que el usuario va a leer — armalo VOS con formato amigable usando los ítems del draft. NO copies esta instrucción ni la palabra 'resumen visual'. Hacé algo como el ejemplo abajo>"
}

Usá null en project_code o needed_at cuando no correspondan.

═══════════════════════════════════════════════════════════════════════════
REGLAS DE TÍTULO (críticas — un mal título arruina la búsqueda después):
═══════════════════════════════════════════════════════════════════════════

El "title" tiene que ser DESCRIPTIVO y específico (40-80 caracteres). NUNCA genérico tipo "Pedido", "Pedido de stock", "Pedido de tornillos". Imaginá que la persona de compras tiene 50 pedidos en su lista — el título es lo único que ve para distinguirlos.

ESTRUCTURA recomendada del título:
  <ítem principal con specs> · <destino: stock o casco>

Si hay 1 solo ítem: incluí cantidad + tipo + especificación clave + destino.
Si hay 2 ítems: incluí los dos resumidos.
Si hay 3+ ítems: usá un encabezado tipo "Materiales varios" o "Tornillería + masilla" + destino.

Si el usuario marca el pedido para stock, agregalo en el título ("stock" o "depósito"), NO uses sólo "Pedido de stock" sin más detalle.

Ejemplos de BUENOS títulos:
✅ "10 tornillos M6 inox + 10 M8 - stock"
✅ "Masilla epoxi blanca Sika 2 latas - K55-1"
✅ "Cuerda náutica 8mm x 50m - K42-3"
✅ "Pintura antiincrustante azul 4 litros - K55-1"
✅ "Tornillería varia (M6, M8, M10) - stock"
✅ "Pinceles + rodillos + masilla - K55-1"
✅ "Pernos M8 inox x30 - K42-3 (Mercado Libre)"

Ejemplos de MALOS títulos (NUNCA usar):
❌ "Pedido"
❌ "Pedido de stock"
❌ "Tornillos"
❌ "Necesito tornillos"
❌ "Compra"
❌ "Material"

Si el usuario fue muy vago y aún después de las preguntas el ítem sigue siendo genérico, hacé el título con la mejor descripción que tengas. Pero NUNCA caigas en los ejemplos malos.

EJEMPLO de un "message" bien armado para el draft (vos generalo así, NO literalmente esto):
"📋 *Pedido para K55-1* — prioridad alta

• 10 tornillos M6
• 10 tornillos M8 (link)

Descripción: para terminar el montaje de cubierta.

¿Confirmás?"

(Después yo agrego "Respondé sí / no / corregí" al final, vos NO lo agregues.)

Hoy es ${today}.`;

  // Build messages array: system + history + new turn
  const messages: any[] = [{ role: "system", content: system }];

  // History
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Build new user content (multimodal si hay imágenes)
  const userContent: any[] = [];

  // Texto principal
  const textParts: string[] = [];
  if (input.text) textParts.push(input.text);

  if (input.urls && input.urls.length > 0) {
    textParts.push("\n[Información de los links del mensaje:]");
    for (const u of input.urls) {
      const bits: string[] = [];
      bits.push(`URL: ${u.url}`);
      if (u.site) bits.push(`Sitio: ${u.site}`);
      if (u.title) bits.push(`Título: ${u.title}`);
      if (u.price) bits.push(`Precio: ${u.price}`);
      if (u.description) bits.push(`Descripción: ${u.description}`);
      textParts.push(bits.join("\n"));
    }
  }

  const combinedText = textParts.join("\n").trim() || "(usuario mandó solo imagen)";
  userContent.push({ type: "text", text: combinedText });

  // Imágenes
  if (input.images && input.images.length > 0) {
    for (const img of input.images) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType || "image/jpeg"};base64,${img.base64}`,
        },
      });
    }
  }

  messages.push({
    role: "user",
    content: userContent.length === 1 ? userContent[0].text : userContent,
  });

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Bot",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter chatWithBot failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter sin contenido. Resp: ${JSON.stringify(data).slice(0, 300)}`);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenRouter devolvió JSON inválido: ${String(content).slice(0, 200)}`);
  }

  if (parsed.kind === "draft" && parsed.draft) {
    const d = parsed.draft;
    // sanity defaults
    if (!d.title) d.title = (input.text || "Pedido").slice(0, 60);
    if (!d.description) d.description = input.text || "";
    if (!["baja", "media", "alta", "urgente"].includes(d.priority)) d.priority = "media";
    if (!Array.isArray(d.items)) d.items = [];
    return {
      kind: "draft",
      message: String(parsed.message || "Listo, ¿confirmás?"),
      draft: d as ParsedPedido,
    };
  }

  // Default: question
  return {
    kind: "question",
    message: String(parsed.message || "¿Podés darme un poco más de detalle?"),
  };
}

// -----------------------------------------------------------------------------
// reviseDraftWithBot -- correcciones sobre un borrador existente.
// -----------------------------------------------------------------------------
export async function reviseDraftWithBot(
  history: HistoryTurn[],
  draft: ParsedPedido,
  correction: string,
  opts?: { projectCodes?: string[] },
): Promise<BotResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const projectsHint = opts?.projectCodes?.length
    ? `Códigos de obra válidos: ${opts.projectCodes.join(", ")}. Si el usuario menciona uno de forma flexible (52-23, K52-23, K 52 23), normalizalo en project_code.`
    : "";

  const system = `Sos el asistente de compras del astillero Klase A.

Ya existe un borrador de pedido y el usuario acaba de mandar una corrección, aclaración o nota.

Tu trabajo:
- Editar el borrador existente, no arrancar un pedido nuevo.
- Si el usuario pide agregar algo a la descripción, detalle o nota, agregalo en "description" conservando lo anterior.
- Si el usuario dice para qué se usa ("son para...", "es para...", "van para..."), agregalo a la descripción si no contradice el pedido.
- Si el usuario menciona una obra/código, setealo en project_code cuando corresponda.
- Si corrige cantidad, ítem, prioridad o fecha, actualizá solo ese dato.
- No hagas preguntas si la corrección es entendible. Preguntá solo si hay una ambigüedad real que podría cambiar qué se compra.
- Respondé breve, rioplatense y directo.

${projectsHint}

Formato SIEMPRE JSON estricto:

A) Si pudiste aplicar la corrección:
{
  "kind":"draft",
  "draft":{
    "title":"título descriptivo actualizado",
    "description":"descripción completa actualizada",
    "priority":"baja|media|alta|urgente",
    "items":[
      {"description":"...","quantity":"...","unit":"...","link_url":"opcional","image_url":"opcional"}
    ],
    "project_code":"K52-23",
    "needed_at":"YYYY-MM-DD"
  },
  "message":"mensaje breve con resumen actualizado"
}

Usá null en project_code o needed_at cuando no correspondan.

B) Solo si no se entiende la corrección:
{"kind":"question","message":"pregunta concreta de una sola cosa"}

Hoy es ${today}.`;

  const messages: any[] = [{ role: "system", content: system }];
  for (const turn of history.slice(-8)) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: "user",
    content: JSON.stringify({
      current_draft: draft,
      user_correction: correction,
    }),
  });

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Bot",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0.15,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter reviseDraftWithBot failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter sin contenido. Resp: ${JSON.stringify(data).slice(0, 300)}`);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenRouter devolvió JSON inválido: ${String(content).slice(0, 200)}`);
  }

  if (parsed.kind === "draft" && parsed.draft) {
    const d = parsed.draft;
    if (!d.title) d.title = draft.title || "Pedido";
    if (!d.description) d.description = draft.description || d.title || "";
    if (!["baja", "media", "alta", "urgente"].includes(d.priority)) d.priority = draft.priority || "media";
    if (!Array.isArray(d.items)) d.items = Array.isArray(draft.items) ? draft.items : [];
    if (d.project_code === undefined) d.project_code = draft.project_code ?? null;
    if (d.needed_at === undefined) d.needed_at = draft.needed_at ?? null;
    return {
      kind: "draft",
      message: String(parsed.message || "Listo, actualicé el pedido. ¿Confirmás?"),
      draft: d as ParsedPedido,
    };
  }

  return {
    kind: "question",
    message: String(parsed.message || "¿Qué querés cambiar exactamente?"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// transcribeAudio — Whisper vía Groq (gratis)
// ─────────────────────────────────────────────────────────────────────────────
export async function transcribeAudio(blob: Blob, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `audio.${mimeExt(mimeType)}`);
  form.append("model", WHISPER_MODEL);
  form.append("language", "es");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { "Authorization": groqAuth() },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq transcribe failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return String(data?.text || "").trim();
}

function mimeExt(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("webm")) return "webm";
  return "ogg";
}

// ─── Legacy compat: si algún código sigue importando parsePedido, no rompe ──
export async function parsePedido(rawText: string, opts?: { projectCodes?: string[] }): Promise<ParsedPedido> {
  const r = await chatWithBot([], { text: rawText }, opts);
  if (r.kind === "draft" && r.draft) return r.draft;
  // Si el LLM quiso preguntar, devolvemos un draft mínimo para no romper el caller.
  return {
    title: rawText.slice(0, 60),
    description: rawText,
    priority: "media",
    items: [],
    project_code: null,
    needed_at: null,
  };
}
