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
  intent?: "pedido" | "aviso";
  title: string;
  description: string;
  priority: "baja" | "media" | "alta" | "urgente";
  material?: string | null;
  destino?: string | null;
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

export interface ParsedComprobante {
  proveedor?: string | null;
  numero?: string | null;
  fecha?: string | null;
  items: Array<{
    descripcion: string;
    cantidad?: number | string | null;
    precio_unitario?: number | string | null;
    moneda?: "ARS" | "USD" | string | null;
    total?: number | string | null;
    sector?: string | null;
  }>;
}

function normalizeComprobanteMoneda(value: unknown, fallback?: unknown): "ARS" | "USD" | null {
  const raw = `${value ?? fallback ?? ""}`.trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes("USD") || raw.includes("U$S") || raw.includes("US$") || raw.includes("DOLAR")) return "USD";
  if (raw.includes("ARS") || raw.includes("$") || raw.includes("PESO")) return "ARS";
  return null;
}

// Bloque de prompt para que la IA clasifique cada ítem en uno de los sectores dados.
// Usa criterio náutico de astillero (bow/stern → propulsión, cable → electricidad, etc.).
function clasificacionBloque(sectores?: string[]): string {
  const lista = (sectores ?? []).filter((s) => s && s.trim());
  if (!lista.length) return "";
  return `

Clasificación de sector (MUY IMPORTANTE):
- A cada ítem agregale "sector": elegí EXACTAMENTE uno de esta lista (copialo igual): ${lista.map((s) => `"${s}"`).join(", ")}.
- Usá criterio náutico de astillero. Ejemplos: bow thruster / hélice de proa / stern / sail-drive / eje / transmisión / motor / combustible / escape → propulsión o mecánica; cable / batería / disyuntor / luminaria / cargador / inversor → eléctrico; GPS / radar / sonda / VHF / piloto → electrónica o navegación; bomba de agua / inodoro / tanque / grifería → plomería o sanitarios; ánodo / antifouling / pasacasco → casco; A/C / heladera / cocina → confort.
- Si dudás entre un sector padre y su subsector, elegí el subsector más específico de la lista. Si ninguno aplica, dejá "sector" en null.`;
}

export async function extraerComprobanteImagen(input: { base64: string; mimeType?: string; sectores?: string[] }): Promise<ParsedComprobante> {
  const mimeType = input.mimeType || "image/jpeg";
  const system = `Sos un extractor de comprobantes del astillero Klase A.

Leés fotos de remitos, facturas o presupuestos. Devolvés SOLO JSON estricto, sin markdown.

Objetivo:
- proveedor: nombre si se ve claro, si no null.
- numero: número de comprobante/remito/factura/presupuesto si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
- No inventes datos. Si no se ve claro, dejalo null o vacío.
- Normalizá números: 1.234,56 -> 1234.56. Si hay subtotal/IVA, no lo pongas como ítem.
- Si no hay precio unitario pero sí cantidad y total, dejá precio_unitario null.
- Si no hay cantidad clara, deja cantidad null.
- Moneda es obligatoria por item: "USD" o "ARS". Si el documento, encabezado o seccion dice USD/U$S/US$, todos los precios de esa zona son USD aunque cada linea no lo repita. Si no hay ninguna senal de USD, usa ARS.
- Las descripciones tienen que servir para matchear contra un catalogo de materiales.

Formato:
{
  "proveedor": "texto|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45}
  ]
}`;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Comprobantes",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraé los datos de este comprobante. Devolvé JSON estricto." + clasificacionBloque(input.sectores) },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${input.base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter extraerComprobante failed (${res.status}): ${errText.slice(0, 300)}`);
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

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((it: any) => ({
          descripcion: String(it.descripcion ?? it.description ?? "").trim(),
          cantidad: it.cantidad ?? it.quantity ?? null,
          precio_unitario: it.precio_unitario ?? it.unit_price ?? null,
          moneda: normalizeComprobanteMoneda(it.moneda ?? it.currency ?? it.divisa, parsed.moneda ?? parsed.currency ?? parsed.divisa ?? parsed.moneda_documento),
          total: it.total ?? null,
          sector: it.sector ? String(it.sector).trim() : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  return {
    proveedor: parsed.proveedor ? String(parsed.proveedor).trim() : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
  };
}

// extraerComprobanteTexto -- presupuestos/remitos pegados como TEXTO (WhatsApp, mail).
export async function extraerComprobanteTexto(input: { text: string; sectores?: string[] }): Promise<ParsedComprobante> {
  const texto = String(input.text || "").trim();
  if (!texto) throw new Error("Texto vacío");
  const system = `Sos un extractor de presupuestos del astillero Klase A.

Recibís el TEXTO de un presupuesto, remito o factura (pegado de WhatsApp, mail o planilla). Devolvés SOLO JSON estricto, sin markdown.

Objetivo:
- proveedor: nombre si se ve claro, si no null.
- numero: número de presupuesto/remito si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
- No inventes datos. Si no se ve claro, dejalo null o vacío.
- Normalizá números: 1.234,56 -> 1234.56. Si hay subtotal/IVA, no lo pongas como ítem.
- Si no hay precio unitario pero sí cantidad y total, dejá precio_unitario null.
- Si no hay cantidad clara, deja cantidad null.
- Moneda es obligatoria por item: "USD" o "ARS". Si el texto dice USD/U$S/US$, todos esos precios son USD. Si no hay señal de USD, usá ARS.
- Las descripciones tienen que servir para matchear contra un catalogo de materiales.

Formato:
{
  "proveedor": "texto|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45}
  ]
}`;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Presupuestos",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Extraé los ítems de este presupuesto. Devolvé JSON estricto.${clasificacionBloque(input.sectores)}\n\n${texto}` },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter extraerComprobanteTexto failed (${res.status}): ${errText.slice(0, 300)}`);
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

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((it: any) => ({
          descripcion: String(it.descripcion ?? it.description ?? "").trim(),
          cantidad: it.cantidad ?? it.quantity ?? null,
          precio_unitario: it.precio_unitario ?? it.unit_price ?? null,
          moneda: normalizeComprobanteMoneda(it.moneda ?? it.currency ?? it.divisa, parsed.moneda ?? parsed.currency ?? parsed.divisa ?? parsed.moneda_documento),
          total: it.total ?? null,
          sector: it.sector ? String(it.sector).trim() : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  return {
    proveedor: parsed.proveedor ? String(parsed.proveedor).trim() : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// chatWithBot — turno conversacional principal
// ─────────────────────────────────────────────────────────────────────────────
// extraerComprobantePDF -- OCR de PDFs de remitos, facturas y presupuestos.
export async function extraerComprobantePDF(input: { base64: string; mimeType?: string; filename?: string; sectores?: string[] }): Promise<ParsedComprobante> {
  const mimeType = input.mimeType || "application/pdf";
  const filename = input.filename || "comprobante.pdf";
  const system = `Sos un extractor de comprobantes del astillero Klase A.

Lees PDFs de remitos, facturas o presupuestos. Devolves SOLO JSON estricto, sin markdown.

Objetivo:
- proveedor: nombre si se ve claro, si no null.
- numero: numero de comprobante/remito/factura/presupuesto si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
- No inventes datos. Si no se ve claro, dejalo null o vacio.
- Normaliza numeros: 1.234,56 -> 1234.56. Si hay subtotal/IVA, no lo pongas como item.
- Si no hay precio unitario pero si cantidad y total, deja precio_unitario null.
- Si no hay cantidad clara, deja cantidad null.
- Moneda es obligatoria por item: "USD" o "ARS". Si el documento, encabezado o seccion dice USD/U$S/US$, todos los precios de esa zona son USD aunque cada linea no lo repita. Si no hay ninguna senal de USD, usa ARS.
- Las descripciones tienen que servir para matchear contra un catalogo de materiales.

Formato:
{
  "proveedor": "texto|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45}
  ]
}`;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Comprobantes",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae los datos de este PDF. Devolve JSON estricto." + clasificacionBloque(input.sectores) },
            {
              type: "file",
              file: {
                filename,
                file_data: `data:${mimeType};base64,${input.base64}`,
              },
            },
          ],
        },
      ],
      plugins: [
        {
          id: "file-parser",
          pdf: { engine: "mistral-ocr" },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter extraerComprobante PDF failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter sin contenido. Resp: ${JSON.stringify(data).slice(0, 300)}`);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenRouter devolvio JSON invalido: ${String(content).slice(0, 200)}`);
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((it: any) => ({
          descripcion: String(it.descripcion ?? it.description ?? "").trim(),
          cantidad: it.cantidad ?? it.quantity ?? null,
          precio_unitario: it.precio_unitario ?? it.unit_price ?? null,
          moneda: normalizeComprobanteMoneda(it.moneda ?? it.currency ?? it.divisa, parsed.moneda ?? parsed.currency ?? parsed.divisa ?? parsed.moneda_documento),
          total: it.total ?? null,
          sector: it.sector ? String(it.sector).trim() : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  return {
    proveedor: parsed.proveedor ? String(parsed.proveedor).trim() : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
  };
}

// chatWithBot -- turno conversacional principal.
export async function chatWithBot(
  history: HistoryTurn[],
  input: MessageInput,
  opts?: { projectCodes?: string[] },
): Promise<BotResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const projectsHint = opts?.projectCodes?.length
    ? `Códigos de obra válidos en el sistema: ${opts.projectCodes.join(", ")}. Hacé matching flexible (K55-1 ≈ 55-1 ≈ K 55 1).`
    : "";

  const system = `Sos el asistente de compras del astillero Klase A. Recibís pedidos y avisos por WhatsApp de la oficina técnica.

Tu misión: distinguir si el usuario quiere hacer un PEDIDO o registrar un AVISO, y armar un borrador completo y útil. No rompas el flujo de pedidos existente.

INTENCION OBLIGATORIA:
- PEDIDO = el usuario quiere comprar, conseguir o reponer algo. Ej: "Necesito 6 tubos de adhesivo para el K52", "comprame una bomba para stock".
- AVISO = el usuario alerta, recuerda o marca a compras que falta algo estándar o reglamentario, sin cargarlo como compra directa. Ej: "Avisá a compras que al K55 le falta el extintor que va estándar", "Ojo que al 52-23 no le cargaron el chaleco salvavidas reglamentario", "recordá pedir las baterías del 55-4 que siempre se olvidan".
- Si es ambiguo, preguntá UNA vez exactamente: "¿Es un pedido para comprar, o un aviso para que compras lo tenga en cuenta?".
- Todo draft debe incluir intent: "pedido" o "aviso".

Para PEDIDO: seguí el PROTOCOLO de preguntas de compra.
Para AVISO: juntá qué material/tema falta, para qué obra o destino, y prioridad. Cuando esté claro, proponé resumen y preguntá confirmación: "¿lo registro como aviso a compras?".

═══════════════════════════════════════════════════════════════════════════
REGLA 0 — EXTRAER PRIMERO, PREGUNTAR DESPUÉS (la más importante)
═══════════════════════════════════════════════════════════════════════════
Antes de preguntar NADA, leé el mensaje completo (y todo el historial) y extraé TODO lo que ya está dicho: qué es, cantidad, unidad, obra, prioridad, notas.
NUNCA preguntes un dato que el usuario YA te dio. Re-preguntar algo ya dicho es el PEOR error y arruina la experiencia.

Reconocé la cantidad cuando viene pegada al pedido, en cualquier forma:
- "1 lata de pintura" → cantidad=1, unidad=lata, ítem=pintura. (NO preguntes la cantidad, ya está.)
- "necesito dos metros de manguera" → cantidad=2, unidad=metro.
- "un par de guantes" → cantidad=2, unidad=par. "media docena de brocas" → cantidad=6.
- "10 kg de masilla", "tres rollos de cinta", "una caja de tornillos" → todas tienen cantidad.
- Si NO hay ningún número ni palabra de cantidad ("necesito pintura", "mandá masilla") → ahí sí preguntás la cantidad.

Solo preguntás lo que GENUINAMENTE falta. Ejemplo "necesito 1 lata de pintura": ya tenés ítem y cantidad → lo único que podría faltar es la especificación (color) y después obra. NO arranques preguntando "¿cuántas latas?".

═══════════════════════════════════════════════════════════════════════════
REGLA 0.5 — NO INVENTAR ATRIBUTOS (tan importante como la 0)
═══════════════════════════════════════════════════════════════════════════
NUNCA agregues a un ítem un atributo que el usuario NO dijo y que NO está escrito en una etiqueta/link. No supongas material, marca, medida exacta, color "técnico" ni modelo por tu cuenta. Inventar un dato es peor que no tenerlo: arruina la compra.
- Si el usuario dice "12 bisagras pequeñas" → el ítem es "bisagra pequeña", NO "bisagra de plástico". No sabés el material.
- Si un atributo es determinante para comprar (material, medida, tipo) y no lo tenés, PREGUNTALO; no lo rellenes con una suposición.
- Usá EXACTAMENTE las palabras del usuario para describir el ítem. Podés sumar specs solo si vienen de algo firme: lo que el usuario escribió, texto leído de una etiqueta/foto, o metadata de un link.

═══════════════════════════════════════════════════════════════════════════
PROTOCOLO DE PREGUNTAS (en este orden, no saltes ningún paso):
═══════════════════════════════════════════════════════════════════════════

Para CADA ítem del pedido:
  PASO 1. QUÉ es. Si es vago ("tornillos", "masilla", "pintura") → pedí especificaciones con opciones concretas: "¿M6, M8 o M10?", "¿epoxi o poliéster?", "¿blanca, gris o transparente?". Una pregunta por turno. Si hay foto, link, marca, modelo o texto visible que ya permite comprarlo, no preguntes specs de nuevo.
  Para insumos genéricos de uso interno (reflectores, guantes, alargues, lámparas, pilas, cinta, trapos, etc.), aceptá la descripción genérica si sirve para compras. No preguntes marca/modelo/tipo salvo que el usuario lo pida o sea imprescindible.
  PASO 2. CANTIDAD. Primero EXTRAELA del mensaje (ver REGLA 0: "1 lata", "dos metros", "un par"…). Solo si NO hay ningún número ni palabra de cantidad, pediscela ("¿cuántos necesitás?"). Si ya la dijeron, tomala y NO vuelvas a preguntar. Aceptá rangos.

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

Si te mandan una foto, mirala con criterio. Distinguí TEXTO LEÍDO (dato firme) de APARIENCIA (no afirmar):
- Si es captura de producto, etiqueta, caja, folleto o pantalla: leé el TEXTO visible como OCR (marca, modelo, potencia, tensión, medida, código, IP). Eso es firme → usalo para describir el ítem.
- Si es una foto "a mano" de una pieza suelta SIN etiqueta ni texto: describí solo lo que se ve con seguridad (qué tipo de pieza y, si es obvio, el tamaño relativo). NO afirmes material, medidas exactas, color técnico ni marca solo porque "parece" (una bisagra que parece plástica puede ser nylon, acero pintado o bronce). Ver REGLA 0.5.
- Si un atributo determinante (material, medida, tipo) no está escrito en la foto ni lo dijo el usuario, NO lo inventes: preguntá ("¿de qué material? ¿plástica, bronce, acero?").
- Si con lo firme alcanza para comprar, dalo por bueno. Si no identificás la pieza, preguntá: "¿qué necesitás exactamente? ¿este mismo modelo, un repuesto, o algo similar?".

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

B) Ya completaste lo necesario — proponé el pedido o aviso:
{
  "kind":"draft",
  "draft":{
    "intent":"pedido|aviso",
    "title":"título DESCRIPTIVO del pedido — ver REGLAS DE TÍTULO abajo",
    "description":"detalle de lo que se pide",
    "material":"material/tema principal si intent=aviso, si no null",
    "destino":"destino libre si no hay obra, si no null",
    "priority":"baja|media|alta|urgente",
    "items":[
      {"description":"...","quantity":"...","unit":"...","link_url":"opcional","image_url":"opcional"}
    ],
    "project_code":"K55-1",
    "needed_at":"YYYY-MM-DD"
  },
  "message":"<texto literal que el usuario va a leer — armalo VOS con formato amigable usando los ítems del draft. NO copies esta instrucción ni la palabra 'resumen visual'. Hacé algo como el ejemplo abajo>"
}

Usá null en project_code, needed_at, material o destino cuando no correspondan. Para avisos, items puede ser [].

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
    if (d.intent !== "aviso") d.intent = "pedido";
    if (!["baja", "media", "alta", "urgente"].includes(d.priority)) d.priority = "media";
    if (d.material === undefined) d.material = d.intent === "aviso" ? d.title : null;
    if (d.destino === undefined) d.destino = null;
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
- Mantener current_draft.intent. Si el borrador era aviso, sigue siendo aviso salvo que el usuario pida explícitamente convertirlo en pedido.
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
    "intent":"pedido|aviso",
    "title":"título descriptivo actualizado",
    "description":"descripción completa actualizada",
    "material":"material/tema principal si intent=aviso, si no null",
    "destino":"destino libre si no hay obra, si no null",
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
    if (d.intent !== "aviso" && d.intent !== "pedido") d.intent = draft.intent || "pedido";
    if (!d.title) d.title = draft.title || "Pedido";
    if (!d.description) d.description = draft.description || d.title || "";
    if (!["baja", "media", "alta", "urgente"].includes(d.priority)) d.priority = draft.priority || "media";
    if (d.material === undefined) d.material = draft.material ?? (d.intent === "aviso" ? d.title : null);
    if (d.destino === undefined) d.destino = draft.destino ?? null;
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
    intent: "pedido",
    title: rawText.slice(0, 60),
    description: rawText,
    priority: "media",
    items: [],
    project_code: null,
    needed_at: null,
  };
}
