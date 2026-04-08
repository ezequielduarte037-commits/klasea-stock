import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. Conectar a Supabase con permisos de administrador
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Calcular la hora en Buenos Aires + 30 minutos
  const targetDate = new Date(Date.now() + 30 * 60000);
  
  const opcionesFecha = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' as const };
  const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false as const };

  const partesFecha = new Intl.DateTimeFormat('en-CA', opcionesFecha).formatToParts(targetDate);
  const fechaTarget = `${partesFecha.find(p=>p.type==='year')?.value}-${partesFecha.find(p=>p.type==='month')?.value}-${partesFecha.find(p=>p.type==='day')?.value}`;
  
  const horaTarget = new Intl.DateTimeFormat('en-GB', opcionesHora).format(targetDate);

  // 3. Buscar eventos que coincidan y no estén notificados
  const { data: eventos, error } = await supabase
    .from('calendario_eventos')
    .select('*')
    .eq('fecha', fechaTarget)
    .eq('hora', horaTarget)
    .eq('notificado', false);

  if (error || !eventos || eventos.length === 0) {
    return new Response("Nada para notificar", { status: 200 });
  }

  // 4. Traer credenciales de WhatsApp
  const hostUrl = Deno.env.get('WA_HOST_URL');
  const idInstance = Deno.env.get('WA_ID_INSTANCE');
  const apiToken = Deno.env.get('WA_API_TOKEN');
  const chatId = Deno.env.get('WA_CHAT_ID'); 

  // 5. Mandar mensaje y marcar como notificado
  for (const ev of eventos) {
    // Acá definimos qué tipos de evento queremos que avisen (podés agregar más)
    const tiposValidos = ["botadura", "entrega", "entrega_material", "desmolde", "traslado"];
    if (!tiposValidos.includes(ev.tipo)) continue;

    let texto = `⏳ *RECORDATORIO - FALTA MEDIA HORA*\n\n*${ev.titulo}*\n⏰ Hora: ${ev.hora}`;
    if (ev.obra) texto += `\n🚤 Unidad: ${ev.obra}`;
    if (ev.notas) texto += `\n📝 Notas: ${ev.notas}`;

    // Disparar WhatsApp
    await fetch(`${hostUrl}/waInstance${idInstance}/sendMessage/${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: texto })
    });

    // Marcar en la BD
    await supabase
      .from('calendario_eventos')
      .update({ notificado: true })
      .eq('id', ev.id);
  }

  return new Response("Notificaciones enviadas", { status: 200 });
});