import { supabase } from "@/supabaseClient";

export async function listarRemitosMarmoleria({ desde = 0, limite = 30 } = {}) {
  const { data, error } = await supabase.from("marm_remitos")
    .select("id,numero,fecha,destinatario,entregado_por,retira,observaciones,items,created_at")
    .order("numero", { ascending: false }).range(desde, desde + limite - 1);
  if (error) throw error;
  return data ?? [];
}

export async function emitirRemitoMarmoleria(id, solicitud) {
  const { data, error } = await supabase.rpc("marm_emitir_remito", {
    p_id: id,
    p_fecha: solicitud.fecha,
    p_destinatario: solicitud.destinatario,
    p_entregado_por: solicitud.entregado_por,
    p_retira: solicitud.retira,
    p_observaciones: solicitud.observaciones,
    p_items: solicitud.items,
  });
  if (error) throw error;
  return data;
}

export function errorRemitosMarmoleria(error) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code)) {
    return "Los remitos todavía no están habilitados en la base de datos. Falta instalar la actualización de marmolería.";
  }
  return error?.message || "No se pudo completar la operación. Intentá nuevamente.";
}
