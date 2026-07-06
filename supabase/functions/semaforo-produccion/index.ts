import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim()
    if (!jwt) return json({ error: "No autenticado" }, 401)
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401)

    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin, role")
      .eq("id", userData.user.id)
      .single()
    const isAdmin = !!prof && (prof.is_admin === true || prof.role === "admin")
    const isGestion = isAdmin || prof?.role === "oficina" || prof?.role === "tecnica"
    if (!isGestion) return json({ error: "No autorizado" }, 403)

    const { data: obras, error: queryError } = await supabase
      .from("v_produccion_semaforo")
      .select("*")
      .order("obra_codigo")

    if (queryError) {
      console.error("Query error:", queryError)
      return json({ error: queryError.message }, 500)
    }

    const resultados = (obras || []).map(obra => {
      const dias = obra.dias_garantizados || 0
      let estado: "verde" | "ambar" | "rojo"
      if (dias === 0) estado = "rojo"
      else if (dias <= 7) estado = "ambar"
      else estado = "verde"

      let quiebres = []
      if (obra.quiebres_detalle) {
        try {
          quiebres = typeof obra.quiebres_detalle === "string"
            ? JSON.parse(obra.quiebres_detalle)
            : obra.quiebres_detalle
        } catch { quiebres = [] }
      }

      return {
        obra_id: obra.obra_id,
        obra_codigo: obra.obra_codigo,
        linea_nombre: obra.linea_nombre,
        obra_estado: obra.obra_estado,
        fecha_inicio: obra.fecha_inicio,
        fecha_fin_estimada: obra.fecha_fin_estimada,
        etapa_actual: obra.etapa_actual,
        fecha_bloqueo: obra.fecha_bloqueo,
        dias_garantizados: dias,
        estado,
        quiebres,
      }
    })

    const total = resultados.length
    const verdes = resultados.filter(r => r.estado === "verde").length
    const ambar = resultados.filter(r => r.estado === "ambar").length
    const rojas = resultados.filter(r => r.estado === "rojo").length

    return json({
      success: true,
      timestamp: new Date().toISOString(),
      kpis: { total, verdes, ambar, rojas },
      obras: resultados,
    })
  } catch (error) {
    console.error("Error:", error)
    return json({ error: error.message }, 400)
  }
})
