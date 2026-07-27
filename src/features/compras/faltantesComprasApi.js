import { supabase } from "@/supabaseClient";

export const FALTANTE_ESTADOS = [
  { value: "nuevo", label: "Nuevo", color: "#ef4444" },
  { value: "en_revision", label: "En revisión", color: "#f59e0b" },
  { value: "pedido", label: "Pedido", color: "#3b82f6" },
  { value: "comprado", label: "Comprado", color: "#8b5cf6" },
  { value: "resuelto", label: "Resuelto", color: "#10b981" },
  { value: "descartado", label: "Descartado", color: "#71717a" },
];

export const FALTANTES_ABIERTOS = ["nuevo", "en_revision", "pedido", "comprado"];

export function faltanteEstadoMeta(value) {
  return FALTANTE_ESTADOS.find((estado) => estado.value === value) || FALTANTE_ESTADOS[0];
}

export async function fetchFaltantesCompras() {
  const { data, error } = await supabase
    .from("panol_faltantes_compras")
    .select(
      "*, " +
      "solicitud:panol_solicitudes!panol_faltantes_compras_solicitud_id_fkey(id,numero,estado,solicita,retira), " +
      "obra:produccion_obras!panol_faltantes_compras_obra_id_fkey(id,codigo,descripcion), " +
      "actualizado_por:profiles!panol_faltantes_compras_updated_by_fkey(id,username)"
    )
    .order("created_at", { ascending: false })
    .limit(800);
  if (error) throw error;
  return data ?? [];
}

export async function actualizarFaltanteCompras(id, patch = {}) {
  if (!id) throw new Error("Falta el faltante.");
  const clean = {};
  if (patch.estado !== undefined) {
    const estado = FALTANTE_ESTADOS.find((item) => item.value === patch.estado)?.value;
    if (!estado) throw new Error("Estado inválido.");
    clean.estado = estado;
  }
  if (patch.notas_compras !== undefined) {
    clean.notas_compras = String(patch.notas_compras ?? "").trim() || null;
  }
  if (!Object.keys(clean).length) return null;

  const { data, error } = await supabase
    .from("panol_faltantes_compras")
    .update(clean)
    .eq("id", id)
    .select("id,estado,notas_compras,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchFaltanteHistorial(id) {
  if (!id) return [];
  const { data, error } = await supabase
    .from("panol_faltantes_compras_historial")
    .select("id,accion,estado_anterior,estado_nuevo,created_at,actor:profiles!panol_faltantes_compras_historial_actor_id_fkey(id,username)")
    .eq("faltante_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
