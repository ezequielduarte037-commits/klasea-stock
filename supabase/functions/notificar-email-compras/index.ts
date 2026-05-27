import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const {
      type,
      requestTitle,
      changedBy,
      message,
      newStatus,
      oldStatus,
      newPriority,
      oldPriority,
      newPriorityLabel,
      oldPriorityLabel,
      createdByName,
      source,
    } = payload

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const comprasEmail = Deno.env.get('COMPRAS_EMAIL') ?? 'compras@allyachts.com.ar'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (changedBy) {
      const { data: who } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", changedBy)
        .single()

      if (who && (who.role === "compras" || who.role === "admin")) {
        return new Response(JSON.stringify({ message: "Cambio hecho por compras/admin, omitido" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    const link = supabaseUrl.replace('.supabase.co', '.netlify.app')
    let subject = ""
    let html = ""

    if (type === "new_request") {
      subject = `[Compras] Nueva solicitud: ${requestTitle}`
      html = `<h2>Nueva solicitud de compra</h2>
<p><strong>Título:</strong> ${requestTitle}</p>
${source ? `<p><strong>Origen:</strong> ${source}</p>` : ""}
<p><strong>Creado por:</strong> ${createdByName || changedBy}</p>
<hr>
<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`
    } else if (type === "new_message") {
      subject = `[Compras] Mensaje en: ${requestTitle}`
      html = `<h2>Nuevo mensaje</h2>
<p><strong>Solicitud:</strong> ${requestTitle}</p>
<p><strong>De:</strong> ${createdByName || changedBy}</p>
<p><strong>Mensaje:</strong></p>
<blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#666;margin:0">${(message || "").replace(/\n/g, "<br>")}</blockquote>
<hr>
<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`
    } else if (type === "status_update") {
      subject = `[Compras] Estado actualizado: ${requestTitle}`
      html = `<h2>Estado actualizado</h2>
<p><strong>Solicitud:</strong> ${requestTitle}</p>
<p><strong>Cambio:</strong> ${oldStatus || "?"} → <strong>${newStatus}</strong></p>
<p><strong>Por:</strong> ${createdByName || changedBy}</p>
<hr>
<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`
    } else if (type === "priority_update") {
      const oldP = oldPriorityLabel || oldPriority || "?"
      const newP = newPriorityLabel || newPriority || "?"
      subject = `[Compras] Prioridad actualizada: ${requestTitle}`
      html = `<h2>Prioridad actualizada</h2>
<p><strong>Solicitud:</strong> ${requestTitle}</p>
<p><strong>Cambio:</strong> ${oldP} → <strong>${newP}</strong></p>
<p><strong>Por:</strong> ${createdByName || changedBy}</p>
<hr>
<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Klase A Stock <notificaciones@envios.klasea.com>",
        to: [comprasEmail],
        subject,
        html,
      }),
    })

    return new Response(JSON.stringify({ success: true, to: comprasEmail }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
