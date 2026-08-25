import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extraerComprobanteImagen, extraerComprobantePDF, extraerComprobanteTexto } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version",
};

function withCors(req: Request) {
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  return requestedHeaders
    ? { ...corsHeaders, "Access-Control-Allow-Headers": requestedHeaders }
    : corsHeaders;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// "Cerebro de proveedores": arma un bloque de contexto con el perfil de cada
// proveedor clasificado + ejemplos reales de productos que ya le compramos
// (derivados del catálogo). Cada remito cargado enriquece el contexto del
// siguiente. Si algo falla, devuelve "" y la extracción sigue como siempre.
// deno-lint-ignore no-explicit-any
// Nombres con los que aparecemos NOSOTROS en un comprobante. Un remito nos lo
// emiten a nosotros, asi que estos nombres estan siempre en la hoja —como
// destinatario— y el modelo los tomaba de proveedor. Peor todavia: "All Built"
// esta cargado en panol_proveedores, asi que la propia lista se lo confirmaba.
// Se puede sobreescribir por env si cambia la razon social.
const NOSOTROS = (Deno.env.get("EMPRESA_ALIAS") || "All Built,AllBuilt,All-Built,Klase A,KlaseA,Astillero Klase A")
  .split(",").map((x) => x.trim()).filter(Boolean);

function esNombrePropio(nombre: string): boolean {
  const limpio = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  if (!limpio) return false;
  return NOSOTROS.some((n) => {
    const propio = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    return propio && limpio === propio;
  });
}

async function buildProveedorContext(supabase: any, proveedorFoco = ""): Promise<string> {
  try {
    const [provRes, matRes] = await Promise.all([
      // Antes pedia solo los que tienen "tipo" cargado y cortaba en 30: de 67
      // proveedores activos la IA veia 7. Casa Iriarte no estaba, asi que en sus
      // remitos el unico nombre conocido era el nuestro. Ahora los ve a todos;
      // el tipo pasa a ser opcional porque casi ninguno lo tiene.
      supabase
        .from("panol_proveedores")
        .select("nombre,tipo,rubros,perfil")
        .eq("activo", true)
        .order("nombre")
        .limit(300),
      supabase
        .from("panol_materiales")
        .select("proveedor,descripcion")
        .eq("activo", true)
        .limit(2000),
    ]);
    const provs = provRes.data ?? [];
    const materiales = matRes.data ?? [];

    const norm = (s: unknown) =>
      String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    const lines: string[] = [];
    const foco = String(proveedorFoco || "").trim();
    if (foco) {
      const focoNorm = norm(foco);
      const ejemplosFoco = materiales
        .filter((material: any) => {
          const proveedorMaterial = norm(material.proveedor);
          return proveedorMaterial && (proveedorMaterial.includes(focoNorm) || focoNorm.includes(proveedorMaterial));
        })
        .map((material: any) => String(material.descripcion || "").trim().slice(0, 72))
        .filter(Boolean)
        .filter((descripcion: string, index: number, list: string[]) => list.indexOf(descripcion) === index)
        .slice(0, 18);
      lines.push(`FOCO DEL REMITO: "${foco}". Productos ya presentes en catalogo: ${ejemplosFoco.length ? ejemplosFoco.join("; ") : "sin ejemplos aun"}.`);
    }
    for (const p of provs) {
      const nombre = String(p.nombre || "").trim();
      if (!nombre) continue;
      // Estamos cargados como proveedor de nosotros mismos. Ofrecerselo al
      // modelo es justamente lo que hacia que eligiera "All Built".
      if (esNombrePropio(nombre)) continue;
      // tokens significativos del nombre ("Rincón del Herraje" → rincon, herraje)
      const tokens = norm(nombre).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
      const ejemplos: string[] = [];
      if (tokens.length) {
        for (const m of materiales) {
          const provTexto = norm(m.proveedor);
          if (!provTexto) continue;
          if (tokens.some((t) => provTexto.includes(t))) {
            const d = String(m.descripcion || "").trim().slice(0, 55);
            if (d && !ejemplos.includes(d)) ejemplos.push(d);
            if (ejemplos.length >= 6) break;
          }
        }
      }
      const partes = [
        p.tipo ? `- "${nombre}" [${p.tipo}]` : `- "${nombre}"`,
        p.rubros ? `Trae: ${String(p.rubros).slice(0, 130)}` : "",
        p.perfil ? `${String(p.perfil).slice(0, 130)}` : "",
        ejemplos.length ? `Ya comprado: ${ejemplos.join("; ")}` : "",
      ].filter(Boolean);
      lines.push(partes.join(" · "));
    }
    if (!lines.length) return "";

    return `

CONOCIMIENTO DE PROVEEDORES DEL ASTILLERO (contexto real del sistema — usalo):
${lines.join("\n")}

SOMOS NOSOTROS, NUNCA EL PROVEEDOR: ${NOSOTROS.join(', ')}. Estos nombres aparecen en casi todos los remitos porque somos QUIENES RECIBIMOS. Si los ves en el encabezado, junto a "Cliente:", "Señores:", "Entregar a:" o en la dirección de entrega, ignoralos: el proveedor es el OTRO nombre de la hoja, el que emite.

Cómo usar este conocimiento:
- Si el proveedor del documento matchea uno de la lista (aunque venga abreviado, con código o con errores de tipeo), devolvé en "proveedor" el nombre CANÓNICO de la lista.
- Usá el rubro/perfil del proveedor para interpretar ítems ambiguos o abreviados del remito (ej.: en un remito de un proveedor de broncería, "codo 1/2" es un codo de bronce).
- Los "Ya comprado" muestran cómo escribimos las descripciones en el catálogo: redactá las descripciones nuevas en ese estilo (español, tipo oración, con la medida incluida).
- Si el documento no corresponde a ninguno de la lista, seguí normal (no fuerces un match).`;
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: withCors(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "No autenticado" }, 401);

    const body = await req.json();
    const sectores = Array.isArray(body?.sectores) ? body.sectores.map((s: unknown) => String(s)).filter(Boolean) : [];
    const proveedorIndicado = String(body?.proveedor || "").trim();
    const monedaIndicada = ["ARS", "USD"].includes(String(body?.moneda || "").toUpperCase())
      ? String(body.moneda).toUpperCase()
      : "";
    const tipoEsperado = ["remito", "factura", "presupuesto"].includes(String(body?.tipo_esperado || "").toLowerCase())
      ? String(body.tipo_esperado).toLowerCase()
      : "";
    const proveedorContexto = await buildProveedorContext(supabase, proveedorIndicado);
    const contexto = [
      proveedorContexto,
      proveedorIndicado
        ? `\nPROVEEDOR INDICADO POR EL USUARIO: ${proveedorIndicado}. Priorizalo para interpretar nombres abreviados y buscar coincidencias con sus productos, pero no inventes datos que no esten en el comprobante.`
        : "",
      monedaIndicada
        ? `\nMONEDA INDICADA POR EL USUARIO: ${monedaIndicada}. Usala como moneda por defecto de las lineas sin simbolo o moneda explicita; si el comprobante muestra otra moneda, prevalece el comprobante.`
        : "",
      tipoEsperado
        ? `\nTIPO ESPERADO POR ESTE FLUJO: ${tipoEsperado.toUpperCase()}. Esto sirve para detectar un archivo equivocado, no para forzar la clasificacion. Si el documento real no es un ${tipoEsperado}, clasificalo como corresponda y devolve items vacios.`
        : "",
    ].join("\n");

    // Presupuesto/remito pegado como TEXTO (no requiere archivo).
    const texto = String(body?.text || body?.texto || "").trim();
    if (texto) {
      const parsedTexto = await extraerComprobanteTexto({ text: texto, sectores, contexto });
      return json(parsedTexto);
    }

    const fileBase64 = String(body?.image_base64 || body?.base64 || "").trim();
    const mimeType = String(body?.mime_type || body?.mimeType || "image/jpeg");
    const filename = String(body?.filename || body?.file_name || "comprobante.pdf");
    if (!fileBase64) return json({ error: "Mandá texto (text) o un archivo (image_base64)." }, 400);

    const isImage = mimeType.startsWith("image/");
    const isPDF = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPDF) return json({ error: "Solo se aceptan imagenes o PDF" }, 400);

    const parsed = isPDF
      ? await extraerComprobantePDF({ base64: fileBase64, mimeType: "application/pdf", filename, sectores, contexto })
      : await extraerComprobanteImagen({ base64: fileBase64, mimeType, sectores, contexto });
    return json(parsed);
  } catch (error) {
    console.error("[extraer-comprobante]", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo leer el comprobante" }, 400);
  }
});
