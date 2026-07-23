import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vincularItemsCatalogo } from "../_shared/openai.ts";

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

// Límites defensivos para que un remito enorme no dispare el costo ni el tamaño del prompt.
const MAX_ITEMS = 80;
const MAX_CANDIDATOS = 12;

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
    const proveedor = String(body?.proveedor || "").trim();

    // deno-lint-ignore no-explicit-any
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      // deno-lint-ignore no-explicit-any
      .map((it: any) => ({
        index: Number(it?.index),
        descripcion: String(it?.descripcion || "").trim(),
        codigo: it?.codigo ? String(it.codigo).trim() : null,
        cantidad: it?.cantidad ?? null,
      }))
      // deno-lint-ignore no-explicit-any
      .filter((it: any) => Number.isInteger(it.index) && it.descripcion)
      .slice(0, MAX_ITEMS);

    if (!items.length) return json({ matches: [] });

    // deno-lint-ignore no-explicit-any
    const rawCand = body?.candidatos && typeof body.candidatos === "object" ? body.candidatos : {};
    const candidatos: Record<string, Array<{ id: string; descripcion: string; codigo: string | null }>> = {};
    for (const it of items) {
      const list = Array.isArray(rawCand[String(it.index)]) ? rawCand[String(it.index)] : [];
      candidatos[String(it.index)] = list
        // deno-lint-ignore no-explicit-any
        .map((c: any) => ({
          id: String(c?.id || "").trim(),
          descripcion: String(c?.descripcion || "").trim(),
          codigo: c?.codigo ? String(c.codigo).trim() : null,
        }))
        // deno-lint-ignore no-explicit-any
        .filter((c: any) => c.id && c.descripcion)
        .slice(0, MAX_CANDIDATOS);
    }

    const matches = await vincularItemsCatalogo({ items, candidatos, proveedor });
    return json({ matches });
  } catch (error) {
    console.error("[vincular-comprobante]", error);
    return json({ error: error instanceof Error ? error.message : "No se pudieron vincular los ítems" }, 400);
  }
});
