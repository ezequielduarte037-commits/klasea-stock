import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extraerComprobanteImagen, extraerComprobantePDF } from "../_shared/openai.ts";

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
    const fileBase64 = String(body?.image_base64 || body?.base64 || "").trim();
    const mimeType = String(body?.mime_type || body?.mimeType || "image/jpeg");
    const filename = String(body?.filename || body?.file_name || "comprobante.pdf");
    if (!fileBase64) return json({ error: "image_base64 es obligatorio" }, 400);

    const isImage = mimeType.startsWith("image/");
    const isPDF = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPDF) return json({ error: "Solo se aceptan imagenes o PDF" }, 400);

    const parsed = isPDF
      ? await extraerComprobantePDF({ base64: fileBase64, mimeType: "application/pdf", filename })
      : await extraerComprobanteImagen({ base64: fileBase64, mimeType });
    return json(parsed);
  } catch (error) {
    console.error("[extraer-comprobante]", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo leer el comprobante" }, 400);
  }
});
