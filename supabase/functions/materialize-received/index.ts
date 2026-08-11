import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  assertPurchaseRequestAccess,
  authenticateFunctionRequest,
  createAdminClient,
  ResponseError,
} from "../_shared/functionAuth.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const supabase = createAdminClient()
    const auth = await authenticateFunctionRequest(req, supabase)
    const { requestId } = await req.json()
    if (!requestId) return json({ error: "requestId es obligatorio" }, 400)
    await assertPurchaseRequestAccess(supabase, String(requestId), auth)

    const { data: request, error: reqError } = await supabase
      .from("purchase_requests")
      .select("id")
      .eq("id", requestId)
      .single()
    if (reqError) throw reqError
    if (!request) return json({ error: "Pedido no encontrado" }, 404)

    // Compatibilidad con clientes antiguos: la función permanece desplegable,
    // pero ya no genera movimientos. "Recibido" en Compras sólo actualiza el
    // circuito comercial. El stock físico se ingresa desde Laminación.
    return json({
      created: 0,
      skipped: 0,
      disabled: true,
      reason: "Los ingresos de laminación se registran únicamente desde el panel de Laminación.",
    })
  } catch (error) {
    console.error("materialize-received error:", error)
    const message = error instanceof Error ? error.message : "Error materializando pedido recibido"
    const status = error instanceof ResponseError ? error.status : 400
    return json({ error: message }, status)
  }
})
