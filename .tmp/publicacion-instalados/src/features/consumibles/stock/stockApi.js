import { supabase } from "@/supabaseClient";
import { DIA_MS } from "../conteo/conteoCalculos";
import { fetchConsumoDesde } from "../conteo/conteoApi";

/**
 * Lecturas y escrituras propias de Stock y reposición.
 */

/** Consumo de los últimos 30 días, de las dos sedes (columna 7 d y mínimo sugerido). */
export async function fetchConsumo30Dias(ahora = new Date()) {
  return fetchConsumoDesde(null, new Date(new Date(ahora).getTime() - 30 * DIA_MS));
}

/** Primer conteo de la sede: desde ahí hay registro para promediar consumo. */
export async function fetchPrimerConteo(sede) {
  const { data, error } = await supabase
    .from("consumibles_movimientos")
    .select("created_at")
    .eq("sede", sede)
    .eq("tipo", "inventario")
    .is("anulado_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at ?? null;
}
