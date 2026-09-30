import { supabase } from "@/supabaseClient";

export const OTRA_SEDE_PANOL = { Pampa: "Chubut", Chubut: "Pampa" };

export async function fetchTrasladosSede({ sede = null, limit = 120 } = {}) {
  let query = supabase
    .from("panol_traslados_sede")
    .select("id,material_id,obra_id,cantidad,sede_origen,sede_destino,estado,nota,motivo_cancelacion,created_at,recibido_at,cancelado_at,material:panol_materiales!panol_traslados_sede_material_id_fkey(id,codigo,descripcion,unidad_medida),obra:produccion_obras(id,codigo)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sede === "Pampa" || sede === "Chubut") {
    query = query.or(`sede_origen.eq.${sede},sede_destino.eq.${sede}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function iniciarTrasladoSede({
  materialId, cantidad, sedeOrigen, sedeDestino, obraId = null,
  nota = null, variante = null,
}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  if (!materialId) throw new Error("Elegí un producto del catálogo.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (!OTRA_SEDE_PANOL[sedeOrigen] || OTRA_SEDE_PANOL[sedeOrigen] !== sedeDestino) {
    throw new Error("El origen y el destino deben ser sedes distintas.");
  }
  const { data, error } = await supabase.rpc("panol_iniciar_traslado_sede", {
    p_material_id: materialId,
    p_cantidad: qty,
    p_sede_origen: sedeOrigen,
    p_sede_destino: sedeDestino,
    p_obra_id: obraId || null,
    p_nota: String(nota || "").trim() || null,
    p_variante: String(variante || "").trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function confirmarTrasladoSede(id) {
  const { data, error } = await supabase.rpc("panol_confirmar_traslado_sede", {
    p_traslado_id: id,
  });
  if (error) throw error;
  return data;
}

export async function cancelarTrasladoSede(id, motivo) {
  const clean = String(motivo || "").trim();
  if (!clean) throw new Error("Escribí el motivo de la cancelación.");
  const { data, error } = await supabase.rpc("panol_cancelar_traslado_sede", {
    p_traslado_id: id,
    p_motivo: clean,
  });
  if (error) throw error;
  return data;
}
