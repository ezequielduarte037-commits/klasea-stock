import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejamos el pre-flight de React
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { tipo, titulo, obra, fecha, hora, notas, esNuevo } = payload

    // Formateamos el texto que va a llegar al WhatsApp
    const accion = esNuevo ? "🟢 *NUEVO EVENTO*" : "🟠 *EVENTO ACTUALIZADO*";
    let texto = `${accion}\n\n*${titulo}*\n🗓️ Fecha: ${fecha}`;
    
    if (hora) texto += `\n⏰ Hora: ${hora}`;
    if (obra) texto += `\n🚤 Unidad: ${obra}`;
    if (notas) texto += `\n📝 Notas: ${notas}`;

    // Traemos tus credenciales guardadas en Supabase
    const hostUrl = Deno.env.get('WA_HOST_URL');
    const idInstance = Deno.env.get('WA_ID_INSTANCE');
    const apiToken = Deno.env.get('WA_API_TOKEN');
    const chatId = Deno.env.get('WA_CHAT_ID'); 

    // URL dinámica que armamos con tus datos de Green-API
    const apiUrl = `${hostUrl}/waInstance${idInstance}/sendMessage/${apiToken}`;

    // Disparamos el mensaje
    const waResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: chatId,
        message: texto
      })
    });

    if (!waResponse.ok) {
      throw new Error(`Error en API WhatsApp: ${waResponse.statusText}`);
    }

    return new Response(JSON.stringify({ success: true, message: "Notificación enviada" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Error enviando WhatsApp:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})