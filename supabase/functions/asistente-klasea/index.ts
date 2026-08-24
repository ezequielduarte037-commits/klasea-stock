import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateFunctionRequest,
  createAdminClient,
  ResponseError,
} from "../_shared/functionAuth.ts";
import { askKlaseaAssistant } from "../_shared/klaseaAssistant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const recentRequests = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 12;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(userId) || []).filter((at) => now - at < 60_000);
  if (recent.length >= LIMIT_PER_MINUTE) return false;
  recent.push(now);
  recentRequests.set(userId, recent);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const admin = createAdminClient();
    const auth = await authenticateFunctionRequest(req, admin);
    if (!auth.userId) throw new ResponseError("No autenticado", 401);
    if (!checkRateLimit(auth.userId)) {
      return json({ error: "Hiciste muchas preguntas seguidas. Esperá un minuto y probá de nuevo." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const result = await askKlaseaAssistant({
      question: body?.question,
      context: body?.context,
      history: body?.history,
      role: auth.profile?.is_admin ? "admin" : auth.profile?.role,
    });
    return json(result);
  } catch (error) {
    console.error("asistente-klasea error:", error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : "No se pudo consultar al asistente";
    const status = error instanceof ResponseError ? error.status : 400;
    return json({ error: message }, status);
  }
});

