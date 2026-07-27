import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extraerSolicitudPanolImagen } from "../_shared/openai.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Lee la FOTO de una solicitud de pañol escrita a mano y devuelve un borrador
// estructurado, campo por campo, con su nivel de confianza.
//
// Lo que NO hace, a propósito: no escribe nada en la base. Devuelve una
// propuesta y se corta. Quien confirma es pañol desde la pantalla de revisión,
// porque con letra manuscrita la IA se equivoca seguido y un error que entra
// solo al sistema es mucho peor que uno que se ve y se corrige.
//
// La API key vive únicamente acá (Deno.env, dentro de _shared/openai.ts). Ver
// las env vars documentadas en ese archivo:
//   OPENROUTER_API_KEY (obligatoria), OPENROUTER_BASE_URL,
//   OPENROUTER_MODEL_EXTRACT, OPENROUTER_MODEL_SOLICITUD (todas opcionales).
// ─────────────────────────────────────────────────────────────────────────────

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

// Los códigos de obra del sistema, para que el modelo devuelva "K55-1" y no
// "casco 55" cuando lo escrito matchea una obra real. Si falla, se sigue sin
// contexto: la lectura igual sirve, sólo queda como texto libre.
// deno-lint-ignore no-explicit-any
async function obrasActivas(supabase: any): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("produccion_obras")
      .select("codigo, descripcion")
      .limit(120);
    return (data ?? [])
      // deno-lint-ignore no-explicit-any
      .map((o: any) => String(o.codigo || o.descripcion || "").trim())
      .filter(Boolean);
  } catch {
    return [];
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
    const base64 = String(body?.image_base64 || body?.base64 || "").trim();
    const mimeType = String(body?.mime_type || body?.mimeType || "image/jpeg");
    if (!base64) return json({ error: "Mandá la foto en image_base64." }, 400);
    if (!mimeType.startsWith("image/")) {
      return json({ error: "La lectura de solicitudes sólo acepta fotos (jpg, png, webp)." }, 400);
    }

    const sectores = Array.isArray(body?.sectores)
      ? body.sectores.map((s: unknown) => String(s)).filter(Boolean)
      : [];
    const obras = Array.isArray(body?.obras) && body.obras.length
      ? body.obras.map((o: unknown) => String(o)).filter(Boolean)
      : await obrasActivas(supabase);

    const parsed = await extraerSolicitudPanolImagen({ base64, mimeType, sectores, obras });
    return json(parsed);
  } catch (error) {
    console.error("[extraer-solicitud-panol]", error);
    // Se devuelve 400 con el motivo en el body (misma convención que
    // extraer-comprobante): el frontend lo muestra y deja seguir a mano.
    return json(
      { error: error instanceof Error ? error.message : "No se pudo leer la solicitud" },
      400,
    );
  }
});
