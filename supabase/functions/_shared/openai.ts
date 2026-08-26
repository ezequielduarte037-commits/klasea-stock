// Helper LLM del bot. Dos backends:
//   - OpenRouter (paid) → chat conversacional + vision para fotos / URLs
//   - Groq (free)       → Whisper para transcribir audios de WhatsApp
//
// La API de OpenRouter es compatible con la de OpenAI: lo único propio es la
// base URL y la key. Por eso todo pasa por `fetch(`${OR_BASE}/chat/completions`)`.
//
// ⚠ LA KEY VIVE SÓLO ACÁ, DEL LADO DEL SERVIDOR (Deno.env). Este archivo lo
// importan únicamente edge functions; jamás entra al bundle de Vite. Si la
// llamada saliera del navegador, la key quedaría a la vista de cualquiera que
// abra las devtools.
//
// ─── Variables de entorno (supabase secrets set …) ───────────────────────────
//   OPENROUTER_API_KEY            (obligatoria) sk-or-v1-… → https://openrouter.ai/keys
//   GROQ_API_KEY                  (obligatoria sólo para transcribir audios)
//   OPENROUTER_BASE_URL           (opcional) default https://openrouter.ai/api/v1
//   OPENROUTER_MODEL_EXTRACT      (opcional) default google/gemini-2.5-pro
//   OPENROUTER_MODEL_CHAT         (opcional) default openai/gpt-4o-mini
//   OPENROUTER_MODEL_SOLICITUD    (opcional) modelo para leer la solicitud de
//                                 pañol manuscrita; si no está, usa el de extract.

// ─── Config ──────────────────────────────────────────────────────────────────
// Todo configurable por env con el valor de hoy como default: cambiar de modelo
// o apuntar a otro gateway compatible no tiene que requerir un deploy de código.
const OR_BASE = Deno.env.get("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1";
// Extracción de remitos/facturas/presupuestos (visión + PDF + texto).
// Gemini Pro lee mejor fotos con mala luz y respeta el prompt largo de reglas.
// Si el costo se dispara, bajar a "google/gemini-2.5-flash" (misma familia, más barato).
const OR_MODEL_EXTRACT = Deno.env.get("OPENROUTER_MODEL_EXTRACT") || "google/gemini-2.5-pro";
// Chat conversacional de WhatsApp: mini alcanza y es mucho más barato.
const OR_MODEL_CHAT = Deno.env.get("OPENROUTER_MODEL_CHAT") || "openai/gpt-4o-mini";
// Letra manuscrita: por default el mismo que lee remitos, que es el que mejor
// se banca fotos con mala luz y papel arrugado.
const OR_MODEL_SOLICITUD = Deno.env.get("OPENROUTER_MODEL_SOLICITUD") || OR_MODEL_EXTRACT;
const GROQ_BASE = Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1";
const WHISPER_MODEL = Deno.env.get("GROQ_WHISPER_MODEL") || "whisper-large-v3";

export class OpenRouterRequestError extends Error {
  readonly operation: string;
  readonly status: number | null;
  readonly code: string | null;

  constructor(operation: string, status: number | null, details: string, code: string | null = null) {
    super(`OpenRouter ${operation} failed${status ? ` (${status})` : ""}: ${details}`);
    this.name = "OpenRouterRequestError";
    this.operation = operation;
    this.status = status;
    this.code = code;
  }
}

function openRouterErrorCode(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.code || parsed?.code || "").trim() || null;
  } catch {
    return null;
  }
}

function shouldRetryOpenRouter(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(response: Response): number {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 1500);
  }
  return 500;
}

async function postOpenRouterChat(body: Record<string, unknown>, operation: string): Promise<Response> {
  const request = () => fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Bot",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });

  let response: Response;
  try {
    response = await request();
  } catch (error) {
    console.warn(`[wa-webhook] OpenRouter ${operation} sin respuesta. Reintentando una vez...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      response = await request();
    } catch (retryError) {
      throw new OpenRouterRequestError(operation, null, String(retryError || error), "network_error");
    }
  }
  if (!response.ok && shouldRetryOpenRouter(response.status)) {
    const status = response.status;
    console.warn(`[wa-webhook] OpenRouter ${operation} error ${status}. Reintentando una vez...`);
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response)));
    response = await request();
  }

  if (!response.ok) {
    const raw = await response.text();
    throw new OpenRouterRequestError(
      operation,
      response.status,
      raw.slice(0, 300) || "respuesta sin detalle",
      openRouterErrorCode(raw),
    );
  }
  return response;
}

function orAuth(): string {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new OpenRouterRequestError("config", null, "Falta OPENROUTER_API_KEY", "missing_api_key");
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

// Un remito o presupuesto nos lo emiten a NOSOTROS, asi que nuestro nombre esta
// siempre en la hoja como destinatario. Peor: muchos proveedores ponen su nombre
// solo en el logo -una imagen- y en el texto dejan nada mas la direccion y el
// CUIT. Ahi el UNICO nombre de empresa legible es el nuestro, y el modelo lo
// devolvia de proveedor. Paso con el presupuesto 33117 de Tigre.
const NOMBRES_PROPIOS = (Deno.env.get("EMPRESA_ALIAS") || "All Built,AllBuilt,All-Built,Klase A,KlaseA,Astillero Klase A")
  .split(",").map((x) => x.trim()).filter(Boolean);

function esNuestroNombre(valor: unknown): boolean {
  const limpio = String(valor ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    // "ALL BUILT S.A", "All-Built SRL" y "allbuilt" tienen que caer todos.
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sa|srl)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!limpio) return false;
  return NOMBRES_PROPIOS.some((n) => {
    const propio = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    return propio && limpio === propio;
  });
}

/**
 * El proveedor que devolvemos, o null.
 *
 * Devolver null cuando no se sabe es mejor que devolver nuestro propio nombre:
 * null se ve y se corrige, un nombre equivocado se carga sin que nadie lo mire.
 */
function proveedorLimpio(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  return esNuestroNombre(texto) ? null : texto;
}

export interface ParsedComprobante {
  tipo_documento?: "remito" | "factura" | "presupuesto" | "otro";
  es_comprobante?: boolean;
  confianza_documento?: "alta" | "media" | "baja";
  motivo_clasificacion?: string | null;
  /** Lo que la IA no pudo resolver del documento. Vacio si leyo todo limpio. */
  dudas?: string[];
  proveedor?: string | null;
  /** CUIT de quien EMITE. Cuando el nombre solo esta en el logo, es lo unico que identifica al proveedor. */
  cuit_emisor?: string | null;
  numero?: string | null;
  fecha?: string | null;
  items: Array<{
    descripcion: string;
    codigo?: string | null;
    cantidad?: number | string | null;
    unidad?: string | null;
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

// Reglas comunes a las tres vías de extracción (foto, PDF y texto pegado). Vivían
// duplicadas en cada prompt y se desincronizaban: una mejora aprendida de un
// remito real sólo llegaba a una de las tres.
const REGLAS_COMPROBANTE = `- No inventes datos. Si no se ve claro, dejalo null o vacio.
- MUCHOS PROVEEDORES NO ESCRIBEN SU NOMBRE: lo tienen solo en el logo, que es una imagen, y en el texto dejan nada mas la direccion, el telefono y el CUIT. En esos casos el UNICO nombre de empresa que se lee es el del DESTINATARIO, o sea nosotros. No lo uses: dejá proveedor en null y cargá cuit_emisor. Un null se corrige a mano; un nombre equivocado se carga sin que nadie lo mire.
- PROVEEDOR = QUIEN EMITE el documento, nunca el destinatario. Si el comprobante dice "CLIENTE:", "Senores:", "Facturar a:" o similar, ese nombre es el que RECIBE: no lo pongas como proveedor. El emisor esta en el membrete, el pie de pagina, la web o el CUIT del encabezado. Si no lo podes distinguir con seguridad, deja proveedor en null.
- NUMEROS (clave): detecta el formato por el ULTIMO separador. En "99,100.00" el punto es decimal y la coma es separador de miles -> 99100.00; en "1.234,56" la coma es decimal -> 1234.56. Nunca tomes la coma como decimal si despues hay un punto.
- Si hay columnas Cantidad, Precio e Importe/Total, usa la relacion Cantidad x Precio = Importe para validar y CORREGIR el precio (el Importe es la verdad). Ej: Cantidad 12, Importe 396000 -> precio_unitario = 33000 (no 33).
- precio_unitario es POR UNIDAD, no el total. Sanity check: un repuesto nautico no vale $5 ni $33; si te queda un precio absurdamente chico, recalculalo como Importe / cantidad. Un unitario con muchos decimales (295.7873) es VALIDO: no lo redondees ni lo descartes.
- COLUMNA DE IVA POR LINEA: muchos presupuestos traen la alicuota en cada renglon ("21.00%", "21,00", "10.5"). Eso NO es cantidad, ni precio, ni total: ignorala. Distinto es un renglon final de IVA/subtotal/total general, que tampoco es un item.
- Si no hay precio unitario pero si cantidad y total, deja precio_unitario null.
- Si no hay cantidad clara, deja cantidad null.
- CANTIDAD Y UNIDAD PEGADAS: es habitual leer "100.00 m.", "20,00 UN" o "5 nº" en una sola celda. Separalas: cantidad 100, unidad "m".
- Moneda es obligatoria por item: "USD" o "ARS". Si el documento, encabezado o seccion dice USD/U$S/US$, todos los precios de esa zona son USD aunque cada linea no lo repita. Si no hay ninguna senal de USD, usa ARS.
- Las descripciones tienen que servir para matchear contra un catalogo de materiales.
- La descripcion se usa para buscar el producto en nuestro catalogo por parecido de palabras: cada palabra de mas que el catalogo no tiene EMPEORA la busqueda. Por eso los codigos de proveedor o fabricante (T13673, C89150, "17005 NEG") van SIEMPRE en el campo "codigo" y nunca dentro del texto de la descripcion.
- Si el presupuesto trae una columna de Familia/Rubro/Categoria/Tipo ADEMAS de la del articulo, usala SOLO si el articulo por si solo no se entiende. Cuando el articulo ya nombra el producto ("Cable electronica 1x 0,75 NEG"), dejalo tal cual. Cuando el articulo es un fragmento sin sentido propio ("C/VENTEO WTR RECT"), ahi si anteponé la familia: "TAPA TANQUE - ATTWOOD C/VENTEO WTR RECT". El criterio es que la descripcion se entienda sola con la MENOR cantidad de palabras agregadas.`;

const NO_INVENTAR = `
DECIR "NO SE" ES UNA RESPUESTA VALIDA Y PREFERIDA:
- Estos documentos llegan escaneados: hay renglones borrosos, cortados, torcidos o escritos a mano. Es NORMAL no poder leer alguno.
- Si un renglon no se lee con seguridad, NO inventes una descripcion que suene creible. Devolvelo con la parte que SI leiste, "confianza_lectura":"baja" y en "duda" que fue lo que no pudiste leer ("la cantidad esta tapada por el sello", "dice ...ORCA 1/2, falta el principio").
- Una descripcion inventada que parece correcta es lo PEOR que podes devolver: entra al stock sin que nadie la mire. Una duda escrita la resuelve una persona en cinco segundos mirando el papel.
- Nunca completes una medida, un codigo ni una cantidad "por lo que suele venir" o por lo que vende ese proveedor. Si no esta en la hoja, no esta.
- Si el renglon es directamente ilegible, no lo devuelvas como item: escribilo en "dudas" del documento.
- Ante dos lecturas posibles, elegi la que MENOS agrega: mejor "CODO 1/2" que "CODO MACHO HEMBRA 1/2 BRONCE" si el resto lo estas suponiendo.
- "dudas" es una lista de frases cortas sobre lo que no pudiste resolver del documento entero (proveedor tapado, total que no cierra, renglon ilegible, hoja cortada). Vacia si esta todo claro.
`;

const CLASIFICACION_DOCUMENTO = `CLASIFICACION OBLIGATORIA ANTES DE EXTRAER:
- Clasifica el documento real, sin asumir que es un comprobante solo porque te pidieron leer uno.
- "tipo_documento" debe ser exactamente: "remito", "factura", "presupuesto" u "otro".
- "es_comprobante" es true solo para remito, factura o presupuesto reales.
- Informes de gastos, reportes, listados internos, manuales, ordenes de trabajo, presentaciones, planillas de seguimiento y documentos administrativos son "otro", aunque tengan tablas, cantidades, precios o nombres de proveedores.
- Un remito real normalmente evidencia entrega: emisor/proveedor, numero o referencia de remito y renglones con cantidades entregadas. No conviertas encabezados, KPIs, comparaciones ni filas de resumen en productos.
- Si el documento es "otro", devuelve items: [] y no intentes rescatar renglones como compras.
- "confianza_documento" debe ser "alta", "media" o "baja". Ante duda usa "baja" y no inventes.
- "motivo_clasificacion" explica en una frase corta la evidencia visible usada.
- Si el contexto indica un TIPO ESPERADO y el archivo no coincide, manten la clasificacion real; nunca lo fuerces al tipo esperado.`;

// Muchos presupuestos escriben cada producto en DOS renglones: el de arriba con
// los numeros y el de abajo con marca / codigo del proveedor / rubro. Sin esta
// regla el modelo los toma como items distintos (o se traba y no devuelve ninguno).
const REGLA_ITEM_MULTILINEA = `
- ITEMS DE DOS RENGLONES (frecuente): un mismo producto puede ocupar dos renglones. El primero trae N°, codigo, cantidad, unidad, descripcion y precios. El segundo, debajo y sin numero de orden, trae marca, codigo del fabricante y rubro separados por barras o guiones (ej. "FEPLAST | 17005 NEG | Cables Electronica", "MH | 104 | UF-ECO"). Ese segundo renglon es CONTINUACION del item de arriba, NO un item nuevo: fusionalos en un solo objeto. Si un renglon no tiene numero de orden ni cantidad ni precio propio, casi seguro es continuacion del anterior.
- DONDE VA CADA DATO DEL SEGUNDO RENGLON (importante): "descripcion" se usa para buscar el producto en nuestro catalogo por parecido de palabras, asi que tiene que quedar LIMPIA. La marca y el rubro NO van en la descripcion: agregan palabras que el catalogo no tiene y arruinan la busqueda. El codigo del fabricante va en el campo "codigo" (ahi vale oro: da coincidencia exacta), NUNCA dentro del texto de la descripcion.
  Ejemplo correcto para "1 6JOS 100.00 m. Cable electronica 1x 0,75 NEG extraflexib" + "FEPLAST | 17005 NEG | Cables Electronica":
  {"descripcion":"Cable electronica 1x 0,75 NEG extraflexib","codigo":"17005 NEG","cantidad":100,"unidad":"m"}
  Mal: {"descripcion":"FEPLAST Cables Electronica - Cable electronica 1x 0,75 NEG extraflexib (17005 NEG)"}`;

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

export async function extraerComprobanteImagen(input: { base64: string; mimeType?: string; sectores?: string[]; contexto?: string }): Promise<ParsedComprobante> {
  const mimeType = input.mimeType || "image/jpeg";
  const system = `Sos un extractor de comprobantes del astillero Klase A.

Leés fotos de remitos, facturas o presupuestos. Devolvés SOLO JSON estricto, sin markdown.

${CLASIFICACION_DOCUMENTO}

Objetivo:
- proveedor: nombre de QUIEN EMITE si se ve claro, si no null. Nunca devuelvas el nombre del destinatario.
- cuit_emisor: el CUIT de quien EMITE (el del membrete/encabezado, NO el del destinatario). Solo los digitos.
- numero: número de comprobante/remito/factura/presupuesto si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
${REGLAS_COMPROBANTE}${REGLA_ITEM_MULTILINEA}
${NO_INVENTAR}

Formato:
{
  "tipo_documento": "remito|factura|presupuesto|otro",
  "es_comprobante": true,
  "confianza_documento": "alta|media|baja",
  "motivo_clasificacion": "evidencia breve",
  "proveedor": "texto|null",
  "cuit_emisor": "digitos|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45, "confianza_lectura":"alta|media|baja", "duda":"texto|null"}
  ],
  "dudas": ["lo que no pudiste resolver, frases cortas"]
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
      model: OR_MODEL_EXTRACT,
      temperature: 0,
      max_tokens: 8000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + (input.contexto || "") },
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
          confianza_lectura: ["alta", "media", "baja"].includes(String(it.confianza_lectura || "").toLowerCase())
            ? String(it.confianza_lectura).toLowerCase()
            : null,
          duda: it.duda ? String(it.duda).trim().slice(0, 200) : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  const dudas = Array.isArray(parsed.dudas)
    ? parsed.dudas.map((d: any) => String(d || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    tipo_documento: ["remito", "factura", "presupuesto"].includes(String(parsed.tipo_documento || "").toLowerCase())
      ? String(parsed.tipo_documento).toLowerCase() as "remito" | "factura" | "presupuesto"
      : "otro",
    es_comprobante: parsed.es_comprobante === true,
    confianza_documento: ["alta", "media", "baja"].includes(String(parsed.confianza_documento || "").toLowerCase())
      ? String(parsed.confianza_documento).toLowerCase() as "alta" | "media" | "baja"
      : "baja",
    motivo_clasificacion: parsed.motivo_clasificacion ? String(parsed.motivo_clasificacion).trim() : null,
    proveedor: proveedorLimpio(parsed.proveedor),
    cuit_emisor: parsed.cuit_emisor ? String(parsed.cuit_emisor).replace(/\D/g, "") || null : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
    dudas,
  };
}

// extraerComprobanteTexto -- presupuestos/remitos pegados como TEXTO (WhatsApp, mail).
export async function extraerComprobanteTexto(input: { text: string; sectores?: string[]; contexto?: string }): Promise<ParsedComprobante> {
  const texto = String(input.text || "").trim();
  if (!texto) throw new Error("Texto vacío");
  const system = `Sos un extractor de presupuestos del astillero Klase A.

Recibís el TEXTO de un presupuesto, remito o factura (pegado de WhatsApp, mail o planilla). Devolvés SOLO JSON estricto, sin markdown.

${CLASIFICACION_DOCUMENTO}

Objetivo:
- proveedor: nombre de QUIEN EMITE si se ve claro, si no null. Nunca devuelvas el nombre del destinatario.
- cuit_emisor: el CUIT de quien EMITE (el del membrete/encabezado, NO el del destinatario). Solo los digitos.
- numero: número de presupuesto/remito si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
${REGLAS_COMPROBANTE}${REGLA_ITEM_MULTILINEA}
${NO_INVENTAR}

Formato:
{
  "tipo_documento": "remito|factura|presupuesto|otro",
  "es_comprobante": true,
  "confianza_documento": "alta|media|baja",
  "motivo_clasificacion": "evidencia breve",
  "proveedor": "texto|null",
  "cuit_emisor": "digitos|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45, "confianza_lectura":"alta|media|baja", "duda":"texto|null"}
  ],
  "dudas": ["lo que no pudiste resolver, frases cortas"]
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
      model: OR_MODEL_EXTRACT,
      temperature: 0,
      max_tokens: 8000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + (input.contexto || "") },
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
          confianza_lectura: ["alta", "media", "baja"].includes(String(it.confianza_lectura || "").toLowerCase())
            ? String(it.confianza_lectura).toLowerCase()
            : null,
          duda: it.duda ? String(it.duda).trim().slice(0, 200) : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  const dudas = Array.isArray(parsed.dudas)
    ? parsed.dudas.map((d: any) => String(d || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    tipo_documento: ["remito", "factura", "presupuesto"].includes(String(parsed.tipo_documento || "").toLowerCase())
      ? String(parsed.tipo_documento).toLowerCase() as "remito" | "factura" | "presupuesto"
      : "otro",
    es_comprobante: parsed.es_comprobante === true,
    confianza_documento: ["alta", "media", "baja"].includes(String(parsed.confianza_documento || "").toLowerCase())
      ? String(parsed.confianza_documento).toLowerCase() as "alta" | "media" | "baja"
      : "baja",
    motivo_clasificacion: parsed.motivo_clasificacion ? String(parsed.motivo_clasificacion).trim() : null,
    proveedor: proveedorLimpio(parsed.proveedor),
    cuit_emisor: parsed.cuit_emisor ? String(parsed.cuit_emisor).replace(/\D/g, "") || null : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
    dudas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// chatWithBot — turno conversacional principal
// ─────────────────────────────────────────────────────────────────────────────
// extraerComprobantePDF -- OCR de PDFs de remitos, facturas y presupuestos.
export async function extraerComprobantePDF(input: { base64: string; mimeType?: string; filename?: string; sectores?: string[]; contexto?: string }): Promise<ParsedComprobante> {
  const mimeType = input.mimeType || "application/pdf";
  const filename = input.filename || "comprobante.pdf";
  const exhaustiveTableProtocol = `

LECTURA EXHAUSTIVA DE TABLA:
- Lee cada renglon de producto de la tabla, desde el primero hasta antes de subtotales, IVA o totales. Cada renglon debe resultar en un objeto de items; no agrupes ni descartes renglones repetidos.
- Extrae codigo, descripcion completa, cantidad, unidad, precio_unitario, moneda y total. Codigo y unidad pueden ser null solo si realmente no aparecen.
- Conserva medidas tecnicas como 1/4, 1 1/2, 50 mm o 2 x 2 dentro de descripcion. No las confundas con la cantidad.
- Antes de responder revisa el conteo de renglones contra items. Si el PDF muestra 27 productos, devuelve exactamente 27 items.
`;
  const system = `Sos un extractor de comprobantes del astillero Klase A.

Lees PDFs de remitos, facturas o presupuestos. Devolves SOLO JSON estricto, sin markdown.

${CLASIFICACION_DOCUMENTO}

Objetivo:
- proveedor: nombre de QUIEN EMITE si se ve claro, si no null. Nunca devuelvas el nombre del destinatario.
- cuit_emisor: el CUIT de quien EMITE (el del membrete/encabezado, NO el del destinatario). Solo los digitos.
- numero: numero de comprobante/remito/factura/presupuesto si se ve, si no null.
- fecha: formato YYYY-MM-DD si se puede interpretar, si no null.
- items: lineas de producto/servicio con descripcion, cantidad, precio_unitario, moneda y total.

Reglas:
${REGLAS_COMPROBANTE}${REGLA_ITEM_MULTILINEA}
${NO_INVENTAR}

Formato:
{
  "tipo_documento": "remito|factura|presupuesto|otro",
  "es_comprobante": true,
  "confianza_documento": "alta|media|baja",
  "motivo_clasificacion": "evidencia breve",
  "proveedor": "texto|null",
  "cuit_emisor": "digitos|null",
  "numero": "texto|null",
  "fecha": "YYYY-MM-DD|null",
  "items": [
    {"descripcion":"...", "cantidad":1, "precio_unitario":123.45, "moneda":"USD", "total":123.45, "confianza_lectura":"alta|media|baja", "duda":"texto|null"}
  ],
  "dudas": ["lo que no pudiste resolver, frases cortas"]
}`;

  // Los PDFs de sistemas de gestion (Electrobase, Tango, Bejerman…) vienen con
  // capa de texto: "pdf-text" la lee tal cual, exacta y gratis. "mistral-ocr"
  // rasteriza y adivina, que es peor y mas caro justo en el caso facil. Se usa
  // OCR solo como plan B, para PDFs escaneados o exportados como imagen.
  async function pedir(engine: "pdf-text" | "mistral-ocr") {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": orAuth(),
        "Content-Type": "application/json",
        "HTTP-Referer": "https://klasea-stock.vercel.app",
        "X-Title": "Klase A Comprobantes",
      },
      body: JSON.stringify({
        model: OR_MODEL_EXTRACT,
        temperature: 0,
        max_tokens: 16000,
        reasoning: { effort: "low" },
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system + exhaustiveTableProtocol + (input.contexto || "") },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae TODOS los renglones de productos de este PDF, de punta a punta. Antes de devolver, conta los renglones fisicos de la tabla y verifica que items tenga esa misma cantidad. Devuelve un objeto por renglon: no agrupes, no resumas y no omitas renglones aunque repitan codigo o descripcion. Conserva los codigos, unidades y medidas tecnicas. Devolve JSON estricto." + clasificacionBloque(input.sectores) },
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
        plugins: [{ id: "file-parser", pdf: { engine } }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter extraerComprobante PDF [${engine}] failed (${res.status}): ${errText.slice(0, 300)}`);
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
    return parsed;
  }

  let parsed: any;
  try {
    parsed = await pedir("pdf-text");
  } catch (error) {
    console.error("[extraerComprobantePDF] pdf-text falló, reintento con OCR", error);
    parsed = null;
  }

  const sinItems = !parsed || !Array.isArray(parsed.items) || parsed.items.length === 0;
  // El proveedor no salio, o salio nuestro propio nombre. Las dos cosas
  // significan lo mismo: en la capa de texto no estaba el nombre del emisor.
  const sinProveedor = !parsed?.proveedor || esNuestroNombre(parsed.proveedor);

  // Un PDF escaneado devuelve texto vacio y por lo tanto cero items: ahi si vale
  // el OCR. Antes esta era la unica razon para usarlo, y por eso el presupuesto
  // 33117 salia mal: "pdf-text" le leyo los 16 renglones perfecto, pero el
  // nombre del proveedor esta SOLO en el logo, dibujado como vectores. No hay
  // texto que leer, asi que el modelo agarro el unico nombre de la hoja: el
  // nuestro, como destinatarios. OCR rasteriza y si mira el membrete.
  if (!parsed || (parsed.es_comprobante !== false && (sinItems || sinProveedor))) {
    let ocr: any = null;
    try {
      ocr = await pedir("mistral-ocr");
    } catch (error) {
      console.error("[extraerComprobantePDF] OCR fallo", error);
    }

    if (ocr) {
      if (sinItems || !parsed) {
        parsed = ocr;
      } else {
        // Los renglones de la capa de texto son exactos; los del OCR son una
        // lectura de pixeles. Se conserva lo bueno de cada uno: items del texto,
        // encabezado del OCR, que es lo unico que le faltaba.
        const proveedorOcr = esNuestroNombre(ocr.proveedor) ? null : ocr.proveedor;
        parsed = {
          ...parsed,
          proveedor: proveedorOcr || parsed.proveedor,
          cuit_emisor: ocr.cuit_emisor || parsed.cuit_emisor,
          numero: parsed.numero || ocr.numero,
          fecha: parsed.fecha || ocr.fecha,
        };
      }
    }
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((it: any) => ({
          codigo: it.codigo ? String(it.codigo).trim() : null,
          descripcion: String(it.descripcion ?? it.description ?? "").trim(),
          cantidad: it.cantidad ?? it.quantity ?? null,
          unidad: it.unidad ? String(it.unidad).trim() : (it.unit ? String(it.unit).trim() : null),
          precio_unitario: it.precio_unitario ?? it.unit_price ?? null,
          moneda: normalizeComprobanteMoneda(it.moneda ?? it.currency ?? it.divisa, parsed.moneda ?? parsed.currency ?? parsed.divisa ?? parsed.moneda_documento),
          total: it.total ?? null,
          sector: it.sector ? String(it.sector).trim() : null,
          confianza_lectura: ["alta", "media", "baja"].includes(String(it.confianza_lectura || "").toLowerCase())
            ? String(it.confianza_lectura).toLowerCase()
            : null,
          duda: it.duda ? String(it.duda).trim().slice(0, 200) : null,
        }))
        .filter((it: any) => it.descripcion)
    : [];

  const dudas = Array.isArray(parsed.dudas)
    ? parsed.dudas.map((d: any) => String(d || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    tipo_documento: ["remito", "factura", "presupuesto"].includes(String(parsed.tipo_documento || "").toLowerCase())
      ? String(parsed.tipo_documento).toLowerCase() as "remito" | "factura" | "presupuesto"
      : "otro",
    es_comprobante: parsed.es_comprobante === true,
    confianza_documento: ["alta", "media", "baja"].includes(String(parsed.confianza_documento || "").toLowerCase())
      ? String(parsed.confianza_documento).toLowerCase() as "alta" | "media" | "baja"
      : "baja",
    motivo_clasificacion: parsed.motivo_clasificacion ? String(parsed.motivo_clasificacion).trim() : null,
    proveedor: proveedorLimpio(parsed.proveedor),
    cuit_emisor: parsed.cuit_emisor ? String(parsed.cuit_emisor).replace(/\D/g, "") || null : null,
    numero: parsed.numero ? String(parsed.numero).trim() : null,
    fecha: parsed.fecha ? String(parsed.fecha).slice(0, 10) : null,
    items,
    dudas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// extraerSolicitudPanolImagen — foto del papel de pedido a pañol, escrito A MANO.
// ─────────────────────────────────────────────────────────────────────────────
// Diferencia clave con los comprobantes: acá NO hay un documento impreso, hay
// letra manuscrita de un tipo apurado en el taller. Se asume de entrada que va
// a fallar seguido, así que lo importante no es acertar sino DECIR CUÁNTO SE
// ESTÁ ARRIESGANDO en cada campo: el resultado va a una pantalla donde un humano
// corrige antes de guardar, y un "alta" mentiroso es peor que un "baja" honesto.

export type Confianza = "alta" | "media" | "baja";

export interface CampoLeido {
  valor: string | null;
  confianza: Confianza;
}

export interface ParsedSolicitudPanol {
  cabecera: {
    obra: CampoLeido;
    sector: CampoLeido;
    prioridad: CampoLeido;
    fecha_pedido: CampoLeido;
    fecha_retiro: CampoLeido;
    solicita: CampoLeido;
    retira: CampoLeido;
    tarea: CampoLeido;
    numero: CampoLeido;
  };
  items: Array<{
    descripcion: string;
    cantidad: number | null;
    unidad: string | null;
    observacion: string | null;
    confianza: Confianza;
  }>;
  /** Lo que el modelo no pudo leer en absoluto. Se muestra tal cual para que el humano decida. */
  ilegible?: string | null;
}

const CONFIANZAS: Confianza[] = ["alta", "media", "baja"];

function normalizeConfianza(value: unknown, fallback: Confianza = "baja"): Confianza {
  const raw = String(value ?? "").trim().toLowerCase();
  return (CONFIANZAS as string[]).includes(raw) ? (raw as Confianza) : fallback;
}

// Un campo vacío no puede venir con confianza "alta": si no hay valor, no hay
// nada de qué estar seguro. Se fuerza acá y no en el prompt porque es una regla
// dura y el modelo la puede desobedecer.
function campo(raw: unknown): CampoLeido {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bruto = obj.valor ?? obj.value ?? (typeof raw === "string" ? raw : null);
  const valor = bruto == null ? null : String(bruto).trim() || null;
  return { valor, confianza: valor ? normalizeConfianza(obj.confianza) : "baja" };
}

function cantidadLeida(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  // "2,5" y "2.5" son lo mismo escritos a mano; "3 u" trae la unidad pegada.
  const limpio = String(raw).replace(",", ".").replace(/[^0-9.]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function extraerSolicitudPanolImagen(input: {
  base64: string;
  mimeType?: string;
  /** Sectores válidos del sistema, para que elija uno en vez de inventar el nombre. */
  sectores?: string[];
  /** Códigos de obra existentes, para normalizar "casco 50" → "K50". */
  obras?: string[];
}): Promise<ParsedSolicitudPanol> {
  const mimeType = input.mimeType || "image/jpeg";
  const hoy = new Date().toISOString().slice(0, 10);

  const listaSectores = (input.sectores ?? []).filter(Boolean);
  const listaObras = (input.obras ?? []).filter(Boolean).slice(0, 80);

  const system = `Sos el lector de solicitudes de pañol del astillero Klase A.

Recibís la FOTO de un formulario de pedido a pañol COMPLETADO A MANO. Devolvés SOLO JSON estricto, sin markdown.

CONTEXTO QUE CAMBIA TODO: esto es letra manuscrita de alguien apurado en un taller, sobre un papel que puede estar arrugado, manchado o mal iluminado. Lo que devolvés NO se guarda: se le muestra a una persona de pañol que lo corrige antes de confirmar. Por eso tu trabajo real es doble:
1. Leer lo que puedas.
2. Ser BRUTALMENTE HONESTO con la confianza de cada cosa.

REGLA MÁS IMPORTANTE — LA CONFIANZA ES EL PRODUCTO:
- "alta"  = lo leés clarísimo, letra de imprenta legible, no hay ninguna otra lectura posible.
- "media" = lo leés pero podría ser otra cosa parecida (un 1 que puede ser 7, una palabra a medio entender).
- "baja"  = estás adivinando, o el campo está tachado, borroneado o cortado.
- Ante la duda, BAJÁ la confianza. Un "media" de más no cuesta nada; un "alta" equivocado hace que la persona no lo revise y entre un error al sistema.
- Si un campo está VACÍO en el papel, devolvé valor null (no lo rellenes con lo que "debería" decir).
- NUNCA inventes ítems, cantidades ni nombres que no estén escritos. Es correcto y esperado devolver pocos ítems.

CABECERA (campos del formulario):
- obra: la obra/barco. Puede venir como código ("K55-1", "55-1") o como texto suelto ("taller", "casco 50", "stock").${listaObras.length ? ` Obras que existen en el sistema: ${listaObras.join(", ")}. Si lo escrito matchea una de esas (aunque esté abreviado o con otra grafía), devolvé el código de la lista.` : ""}
- sector: quién pide.${listaSectores.length ? ` Elegí EXACTAMENTE uno de: ${listaSectores.map((s) => `"${s}"`).join(", ")}. Si no matchea ninguno, null.` : ""}
- prioridad: "urgente" sólo si el papel lo dice o está marcado/subrayado/en rojo. Si no, "normal".
- fecha_pedido / fecha_retiro: formato YYYY-MM-DD. Si el papel escribe "12/3" sin año, asumí el año en curso (hoy es ${hoy}). Si no hay fecha, null.
- solicita: quién firma el pedido. retira: quién lo va a buscar, si es otra persona.
- tarea: para qué es / observaciones generales escritas en la cabecera.
- numero: el "N° pañol" preimpreso o escrito arriba, si se ve.

ÍTEMS (las filas de la tabla):
- Una fila del papel = un objeto. No agrupes, no resumas, no completes filas vacías.
- descripcion: lo que pide, TAL CUAL está escrito. No "mejores" la redacción ni agregues specs que no están. Si dice "bulones 8x40", eso va.
- cantidad: número. Si no se lee o está vacía, null (no pongas 1 "por las dudas").
- unidad: u, m, kg, litro, rollo, caja, par… si está escrita. Si no, null.
- observacion: la columna de marca/medida/observación, si tiene algo.
- confianza: por ÍTEM, con el mismo criterio de arriba. Una fila garabateada va en "baja" aunque le pongas texto.
- Si una fila es totalmente ilegible pero se ve que hay algo escrito, incluila con la mejor lectura que tengas y confianza "baja". Es mejor que la persona vea "algo ilegible acá" a que la fila desaparezca.

Si hay partes del papel que no pudiste leer para nada, describilas en "ilegible" (ej: "las últimas 2 filas están tapadas por un doblez").

Formato EXACTO de salida:
{
  "cabecera": {
    "obra":         {"valor":"texto|null","confianza":"alta|media|baja"},
    "sector":       {"valor":"texto|null","confianza":"alta|media|baja"},
    "prioridad":    {"valor":"normal|urgente|null","confianza":"alta|media|baja"},
    "fecha_pedido": {"valor":"YYYY-MM-DD|null","confianza":"alta|media|baja"},
    "fecha_retiro": {"valor":"YYYY-MM-DD|null","confianza":"alta|media|baja"},
    "solicita":     {"valor":"texto|null","confianza":"alta|media|baja"},
    "retira":       {"valor":"texto|null","confianza":"alta|media|baja"},
    "tarea":        {"valor":"texto|null","confianza":"alta|media|baja"},
    "numero":       {"valor":"texto|null","confianza":"alta|media|baja"}
  },
  "items": [
    {"descripcion":"...","cantidad":2,"unidad":"u","observacion":"texto|null","confianza":"alta|media|baja"}
  ],
  "ilegible": "texto|null"
}`;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Solicitudes Pañol",
    },
    body: JSON.stringify({
      model: OR_MODEL_SOLICITUD,
      temperature: 0,
      max_tokens: 6000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Leé esta solicitud de pañol manuscrita. Devolvé JSON estricto y sé honesto con la confianza de cada campo." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${input.base64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter extraerSolicitudPanol failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter sin contenido. Resp: ${JSON.stringify(data).slice(0, 300)}`);

  // deno-lint-ignore no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenRouter devolvió JSON inválido: ${String(content).slice(0, 200)}`);
  }

  const cab = (parsed?.cabecera && typeof parsed.cabecera === "object" ? parsed.cabecera : {}) as Record<string, unknown>;

  const prioridad = campo(cab.prioridad);
  // El único valor que importa es "urgente": cualquier otra cosa es el default.
  if (prioridad.valor && !/urgen/i.test(prioridad.valor)) prioridad.valor = "normal";
  else if (prioridad.valor) prioridad.valor = "urgente";

  const items = Array.isArray(parsed?.items)
    ? parsed.items
      // deno-lint-ignore no-explicit-any
      .map((it: any) => ({
        descripcion: String(it?.descripcion ?? it?.description ?? "").trim(),
        cantidad: cantidadLeida(it?.cantidad ?? it?.quantity),
        unidad: it?.unidad ? String(it.unidad).trim().slice(0, 20) : null,
        observacion: it?.observacion ? String(it.observacion).trim().slice(0, 300) : null,
        confianza: normalizeConfianza(it?.confianza),
      }))
      // deno-lint-ignore no-explicit-any
      .filter((it: any) => it.descripcion)
    : [];

  return {
    cabecera: {
      obra: campo(cab.obra),
      sector: campo(cab.sector),
      prioridad,
      fecha_pedido: campo(cab.fecha_pedido),
      fecha_retiro: campo(cab.fecha_retiro),
      solicita: campo(cab.solicita),
      retira: campo(cab.retira),
      tarea: campo(cab.tarea),
      numero: campo(cab.numero),
    },
    items,
    ilegible: parsed?.ilegible ? String(parsed.ilegible).slice(0, 500) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// vincularItemsCatalogo — matching semántico de líneas de remito contra el catálogo.
// ─────────────────────────────────────────────────────────────────────────────
// Recibe cada ítem del remito con una lista corta de candidatos (pre-filtrados por
// similitud lexical en el frontend) y le pide a la IA que elija el mismo producto,
// entendiendo las abreviaturas del rubro (MACHO=M, HEMBRA=H, FUND=bronce fundido…).
export interface VinculoMatch {
  index: number;
  material_id: string | null;
  confianza: "alta" | "media" | "baja";
  motivo?: string;
}

export async function vincularItemsCatalogo(input: {
  items: Array<{ index: number; descripcion: string; codigo?: string | null; cantidad?: number | string | null }>;
  candidatos: Record<string, Array<{ id: string; descripcion: string; codigo?: string | null }>>;
  proveedor?: string;
}): Promise<VinculoMatch[]> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return [];

  const system = `Sos el vinculador de remitos del astillero Klase A. Tu trabajo es decir, para cada línea de un remito, cuál producto del CATÁLOGO existente es EXACTAMENTE el mismo, o si es un producto nuevo que todavía no está.

Devolvés SOLO JSON estricto, sin markdown.

Cómo pensar cada línea:
- Compará la descripción de la línea del remito contra su lista de candidatos (cada candidato tiene un id y una descripción del catálogo).
- Elegí el candidato que sea EL MISMO producto: mismo tipo + misma conexión + mismo material + MISMA MEDIDA.

Abreviaturas del rubro (tratalas como equivalentes):
- "MACHO" = "M" ; "HEMBRA" = "H" ; "M/H" o "MACHO HEMBRA" = macho-hembra.
- "FUND" / "FUNDIDO" = bronce fundido (bronce). Si la línea dice FUND y el candidato dice "bronce", es el mismo material.
- "PX" / "PLAST" = plástico.
- "MANG" = manguera. "ESP" = espiga. "RR" o "ENTRERROSCA" = entrerrosca.
- Tipos: RACOR, CODO, TEE, NIPLE, CUPLA, TAPA, BUJE, UNION, TUERCA, etc.

Reglas duras:
- LA MEDIDA MANDA. "1x3/4" NO es lo mismo que "1x1" ni "1/2x3/8". Si la medida difiere, NO es el mismo producto → material_id = null, confianza = "baja". Un racor de una medida jamás reemplaza al de otra.
- Solo devolvé un material_id que esté EN la lista de candidatos de ESA línea. Nunca inventes un id.
- Si ningún candidato es el mismo producto (por medida, tipo o material), devolvé material_id = null: es un producto NUEVO. Es correcto y esperado que muchas líneas sean nuevas.
- confianza: "alta" = es el mismo producto sin dudas (tipo + medida + material coinciden). "media" = muy probablemente el mismo pero hay algo ambiguo (falta un dato, medida escrita raro). "baja" = no hay match confiable (dejá material_id null).

Formato de salida:
{ "matches": [ { "index": 0, "material_id": "id-del-candidato-o-null", "confianza": "alta|media|baja", "motivo": "una frase corta" } ] }
Devolvé un objeto por cada línea recibida, con su mismo index.`;

  const provLine = input.proveedor ? `\nProveedor del remito: ${input.proveedor}.` : "";
  const payload = {
    lineas: items.map((it) => ({
      index: it.index,
      descripcion: it.descripcion,
      codigo: it.codigo || null,
      cantidad: it.cantidad ?? null,
      candidatos: (input.candidatos?.[String(it.index)] ?? []).map((c) => ({
        id: c.id,
        descripcion: c.descripcion,
        codigo: c.codigo || null,
      })),
    })),
  };

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": orAuth(),
      "Content-Type": "application/json",
      "HTTP-Referer": "https://klasea-stock.vercel.app",
      "X-Title": "Klase A Vinculador",
    },
    body: JSON.stringify({
      model: OR_MODEL_EXTRACT,
      temperature: 0,
      max_tokens: 8000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Vinculá estas líneas con sus candidatos.${provLine}\n\n${JSON.stringify(payload)}` },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter vincularItems failed (${res.status}): ${errText.slice(0, 300)}`);
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

  // Set de ids válidos por índice: la IA solo puede elegir candidatos que le pasamos.
  const validByIndex = new Map<number, Set<string>>();
  for (const it of items) {
    validByIndex.set(
      it.index,
      new Set((input.candidatos?.[String(it.index)] ?? []).map((c) => String(c.id))),
    );
  }

  const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
  return rawMatches
    .map((m: any) => {
      const index = Number(m?.index);
      if (!Number.isInteger(index)) return null;
      const rawId = m?.material_id == null ? null : String(m.material_id).trim();
      const valid = validByIndex.get(index);
      const material_id = rawId && valid?.has(rawId) ? rawId : null;
      const confRaw = String(m?.confianza || "").toLowerCase();
      const confianza = ["alta", "media", "baja"].includes(confRaw)
        ? (confRaw as "alta" | "media" | "baja")
        : "baja";
      return {
        index,
        material_id,
        confianza: material_id ? confianza : "baja",
        motivo: m?.motivo ? String(m.motivo).slice(0, 160) : "",
      } as VinculoMatch;
    })
    .filter(Boolean) as VinculoMatch[];
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
Para AVISO: juntá qué material/tema falta, para qué obra o destino, y prioridad. Cuando esté claro, proponé el resumen sin preguntar confirmación dentro de message; el webhook agrega la única pregunta final.

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
  PASO 4. Proponé INMEDIATAMENTE el pedido armado (kind=draft), mostrando todos los ítems, la obra y la prioridad.
  - Si el usuario ya indicó prioridad, respetala. Si no la indicó, usá "media" sin hacer otra pregunta.
  - NO preguntes antes si quiere agregar algo más y NO agregues una segunda pregunta de confirmación dentro de message. El webhook mostrará el pedido y debajo preguntará una sola vez si quiere agregar algo o confirmarlo.
  - Si después el usuario manda otro ítem, se agrega al borrador existente y se vuelve a mostrar el pedido completo actualizado.

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
- Igual seguís el protocolo: si no dijeron cantidad, preguntala. Si no dijeron obra, preguntala. Cuando esos datos estén, proponé el draft.

═══════════════════════════════════════════════════════════════════════════
FOTOS (no links, sino fotos directas):
═══════════════════════════════════════════════════════════════════════════

Si te mandan una foto, mirala con criterio. Distinguí TEXTO LEÍDO (dato firme) de APARIENCIA (no afirmar):
- Si es captura de producto, etiqueta, caja, folleto o pantalla: leé el TEXTO visible como OCR (marca, modelo, potencia, tensión, medida, código, IP). Eso es firme → usalo para describir el ítem.
- Si es una foto "a mano" de una pieza suelta SIN etiqueta ni texto: describí solo lo que se ve con seguridad (qué tipo de pieza y, si es obvio, el tamaño relativo). NO afirmes material, medidas exactas, color técnico ni marca solo porque "parece" (una bisagra que parece plástica puede ser nylon, acero pintado o bronce). Ver REGLA 0.5.
- Si un atributo determinante (material, medida, tipo) no está escrito en la foto ni lo dijo el usuario, NO lo inventes: preguntá ("¿de qué material? ¿plástica, bronce, acero?").
- Si con lo firme alcanza para comprar, dalo por bueno. Si no identificás la pieza, preguntá: "¿qué necesitás exactamente? ¿este mismo modelo, un repuesto, o algo similar?".

═══════════════════════════════════════════════════════════════════════════
ESTILO Y SEGURIDAD JSON:
═══════════════════════════════════════════════════════════════════════════

- Rioplatense informal, breve, directo. Sin "estimado", sin "saludos cordiales".
- UNA pregunta por turno. Nunca preguntes dos cosas a la vez.
- Si hay opción múltiple, ofrecé 2-4 opciones concretas: "¿M6, M8 o M10?".
- Si el usuario claramente quiere acelerar ("dale ya", "no me preguntes más", "mandalo"), proponé el draft con lo que tengas.
- Mensajes no-pedido (hola, gracias): respondé cordial breve y guialo.
- REGLA CRÍTICA DE JSON: Si copiás texto del usuario que contiene comillas dobles ("), ESCAPALAS SIEMPRE como \\" o reemplazalas por comillas simples ('). Un JSON con comillas dobles sin escapar es inválido y rompe el sistema.

PRIORIDAD (si el usuario la menciona; si no, usar "media"):
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
  <ítem principal con specs> · <destino: stock u obra>

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

Descripción: para terminar el montaje de cubierta."

(El webhook agrega después la única pregunta "¿Querés agregar algo más o lo confirmamos así?". Vos NO agregues preguntas ni instrucciones de confirmación dentro de message.)

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

  const res = await postOpenRouterChat({
    model: OR_MODEL_CHAT,
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages,
  }, "chatWithBot");

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
      message: String(parsed.message || "Listo, armé el pedido."),
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
- Si el usuario manda un producto nuevo con su cantidad, AGREGALO a items sin borrar ni reemplazar los anteriores. Actualizá el título y el resumen para mostrar el pedido completo.
- No hagas preguntas si la corrección es entendible. Preguntá solo si hay una ambigüedad real que podría cambiar qué se compra.
- En message mostrale el borrador actualizado, pero NO agregues una pregunta de confirmación: el webhook agrega una sola al final.
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

  const res = await postOpenRouterChat({
    model: OR_MODEL_CHAT,
    temperature: 0.15,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages,
  }, "reviseDraftWithBot");

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
      message: String(parsed.message || "Listo, actualicé el pedido."),
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
