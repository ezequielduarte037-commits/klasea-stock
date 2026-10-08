import { supabase } from "@/supabaseClient";

// Revisiones técnicas: lotes chicos para depurar las matrices de línea y las
// etapas de producción. Todo lo que escribe pasa por funciones de la base que
// validan que quien responde sea dueño de la línea y guardan cómo deshacer.

export const LINEAS = ["55", "37", "52"];

export const TIPOS = {
  falta: { nombre: "Se usa y no está en la matriz", corto: "Faltantes" },
  producto: { nombre: "Elegir el producto", corto: "Productos" },
  etapa: { nombre: "Etapas de producción", corto: "Etapas" },
  sin_uso: { nombre: "¿Va en la matriz?", corto: "Sin uso" },
};

function errorLegible(error, fallback) {
  const msg = String(error?.message || "");
  // Los mensajes de las funciones de la base ya vienen en castellano.
  return new Error(/^[A-ZÁÉÍÓÚÑ¿]/.test(msg) && !/^(JWT|Failed|TypeError)/.test(msg) ? msg : fallback);
}

export async function cargarTablero() {
  const [duenos, revisiones, liberaciones] = await Promise.all([
    supabase.from("revision_duenos").select("modelo, user_id, perfil:profiles!revision_duenos_user_id_fkey(username)"),
    supabase.from("revisiones_tecnicas").select("id, modelo, tipo, titulo, orden, semana, total, respondidos, estado, completada_at").order("orden"),
    supabase.from("revision_liberaciones").select("id, modelo, liberada_at, nota, perfil:profiles!revision_liberaciones_liberada_por_fkey(username)").eq("vigente", true),
  ]);
  const error = duenos.error || revisiones.error || liberaciones.error;
  if (error) throw errorLegible(error, "No pudimos cargar las revisiones. Reintentá en un momento.");
  return { duenos: duenos.data || [], revisiones: revisiones.data || [], liberaciones: liberaciones.data || [] };
}

export async function cargarItems(revisionId) {
  const { data, error } = await supabase.from("revision_items")
    .select("id, revision_id, modelo, tipo, material_id, linea_proceso_id, orden, contexto, respuesta, valor, nota, respondido_at, perfil:profiles!revision_items_respondido_por_fkey(username)")
    .eq("revision_id", revisionId).order("orden");
  if (error) throw errorLegible(error, "No pudimos abrir el lote. Reintentá en un momento.");
  return data || [];
}

export async function responder(itemId, respuesta, valor = null, nota = null) {
  const { data, error } = await supabase.rpc("revision_responder", { p_item: itemId, p_respuesta: respuesta, p_valor: valor, p_nota: nota });
  if (error) throw errorLegible(error, "No se pudo guardar la respuesta. Reintentá.");
  return data;
}

export async function deshacer(itemId) {
  const { data, error } = await supabase.rpc("revision_deshacer", { p_item: itemId });
  if (error) throw errorLegible(error, "No se pudo deshacer. Reintentá.");
  return data;
}

export async function liberar(modelo, nota = null) {
  const { data, error } = await supabase.rpc("revision_liberar", { p_modelo: modelo, p_nota: nota });
  if (error) throw errorLegible(error, "No se pudo liberar la lista. Reintentá.");
  return data;
}

/** Productos del catálogo para elegir el de un requisito. */
export async function buscarProductos(texto, excluirId) {
  const q = String(texto || "").trim().replace(/[%,()]/g, " ");
  if (q.length < 2) return [];
  let query = supabase.from("panol_materiales").select("id, descripcion, codigo, proveedor, activo")
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`).limit(12);
  if (excluirId) query = query.neq("id", excluirId);
  const { data, error } = await query;
  if (error) throw errorLegible(error, "No pudimos buscar en el catálogo.");
  return (data || []).filter((p) => p.activo !== false);
}

/** Lunes de la semana (fecha local) en formato YYYY-MM-DD. */
export function lunesDe(fecha = new Date()) {
  const d = new Date(fecha);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
