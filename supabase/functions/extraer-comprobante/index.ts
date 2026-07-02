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
async function buildProveedorContext(supabase: any): Promise<string> {
  try {
    const [provRes, matRes] = await Promise.all([
      supabase
        .from("panol_proveedores")
        .select("nombre,tipo,rubros,perfil")
        .not("tipo", "is", null)
        .eq("activo", true)
        .limit(30),
      supabase
        .from("panol_materiales")
        .select("proveedor,descripcion")
        .eq("activo", true)
        .limit(2000),
    ]);
    const provs = provRes.data ?? [];
    if (!provs.length) return "";
    const materiales = matRes.data ?? [];

    const norm = (s: unknown) =>
      String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    const lines: string[] = [];
    for (const p of provs) {
      const nombre = String(p.nombre || "").trim();
      if (!nombre) continue;
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
        `- "${nombre}" [${p.tipo}]`,
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
    const contexto = await buildProveedorContext(supabase);

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
