import { supabase } from "@/supabaseClient";

/**
 * Salidas sólo con tarjeta (migración 20261118200000). Desde esta fecha, en
 * Chubut no sale material sin la tarjeta de quien retira. Si se la olvidó,
 * Técnica autoriza con su PIN. Laminación Pampa (sede Pampa) sigue sin
 * tarjeta. La base aplica la misma regla y la misma fecha: esto sólo decide
 * qué muestra la pantalla.
 */
export const TARJETA_OBLIGATORIA_DESDE = new Date("2026-11-19T00:00:00-03:00");

export function tarjetaObligatoria(sede, ahora = new Date()) {
  if (ahora < TARJETA_OBLIGATORIA_DESDE) return false;
  return String(sede ?? "").trim().toLowerCase() !== "pampa";
}

/** "gaston.tec" → "Gaston". */
export function nombreDeUsuario(usuario) {
  const base = String(usuario ?? "").split(/[.@_]/)[0].trim();
  return base ? base[0].toUpperCase() + base.slice(1) : String(usuario ?? "");
}

/** Personas de Técnica (o admin) que ya tienen PIN. */
export async function fetchAutorizadores() {
  const { data, error } = await supabase.rpc("tecnica_autorizadores");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, usuario: t.usuario, nombre: nombreDeUsuario(t.usuario) }));
}

/**
 * Verifica el PIN y deja la autorización registrada. tipo: "retiro_sin_tarjeta"
 * (sirve dos horas para esa persona) o "tarjeta" (una sola vez, 15 minutos).
 */
export async function autorizarConPin({ tecnicoId, pin, tipo, empleadoId = null, sede = null, motivo = null }) {
  if (!tecnicoId) throw new Error("Elegí quién de Técnica autoriza.");
  if (!/^\d{6}$/.test(String(pin ?? ""))) throw new Error("El PIN tiene 6 números.");
  const { data, error } = await supabase.rpc("tecnica_autorizar", {
    p_tecnico_id: tecnicoId,
    p_pin: String(pin),
    p_tipo: tipo,
    p_empleado_id: empleadoId,
    p_sede: sede,
    p_motivo: motivo,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "No se pudo autorizar.");
  return { id: data.id, tecnico: nombreDeUsuario(data.tecnico) };
}

export async function fetchMiPin() {
  const { data, error } = await supabase.rpc("tecnica_mi_pin");
  if (error) throw error;
  return data ?? { puede: false, tiene: false };
}

export async function guardarMiPin(pin) {
  const { error } = await supabase.rpc("tecnica_guardar_pin", { p_pin: String(pin ?? "") });
  if (error) throw error;
}
