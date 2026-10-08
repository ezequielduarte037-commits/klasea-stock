import { supabase } from "@/supabaseClient";

// Revisiones técnicas: la misión de cada día hábil para depurar la matriz de
// cada línea (30 productos), definir un condicionante y revisar una semana del
// plan de producción. Todo lo que escribe pasa por funciones de la base que
// validan que quien responde sea dueño de la línea y guardan cómo deshacer.

export const LINEAS = ["55", "37", "52"];

export const FLUJOS = {
  productos: { nombre: "Productos de la matriz", corto: "Productos" },
  condicionante: { nombre: "Condicionante del día", corto: "Condicionantes" },
  semana: { nombre: "Semana del plan", corto: "Plan" },
};

export const TIPOS_CONDICIONANTE = [
  ["motorizacion", "Motorización"],
  ["configuracion", "Configuración"],
  ["equipamiento", "Equipamiento"],
  ["opcional_estandar", "Opcional"],
  ["otro", "Otro"],
];

export const ACCIONES_CONDICIONANTE = [
  ["extra", "Agrega"],
  ["quita", "Quita"],
  ["matriz", "Suma"],
];

function errorLegible(error, fallback) {
  const msg = String(error?.message || "");
  // Los mensajes de las funciones de la base ya vienen en castellano.
  return new Error(/^[A-ZÁÉÍÓÚÑ¿]/.test(msg) && !/^(JWT|Failed|TypeError|PGRST)/.test(msg) ? msg : fallback);
}

export async function cargarTablero() {
  const [duenos, revisiones, liberaciones] = await Promise.all([
    supabase.from("revision_duenos").select("modelo, user_id, perfil:profiles!revision_duenos_user_id_fkey(username)"),
    supabase.from("revisiones_tecnicas")
      .select("id, modelo, tipo, titulo, orden, semana, dia, total, respondidos, estado, completada_at")
      .in("tipo", Object.keys(FLUJOS)).order("dia").order("orden"),
    supabase.from("revision_liberaciones").select("id, modelo, liberada_at, nota, perfil:profiles!revision_liberaciones_liberada_por_fkey(username)").eq("vigente", true),
  ]);
  const error = duenos.error || revisiones.error || liberaciones.error;
  if (error) throw errorLegible(error, "No pudimos cargar las revisiones. Reintentá en un momento.");
  return { duenos: duenos.data || [], revisiones: revisiones.data || [], liberaciones: liberaciones.data || [] };
}

export async function cargarItems(revisionId) {
  const { data, error } = await supabase.from("revision_items")
    .select("id, revision_id, modelo, tipo, material_id, condicionante_id, semana, sugerencia, orden, contexto, respuesta, valor, nota, respondido_at, perfil:profiles!revision_items_respondido_por_fkey(username)")
    .eq("revision_id", revisionId).order("orden");
  if (error) throw errorLegible(error, "No pudimos abrir la revisión. Reintentá en un momento.");
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

export async function guardarCondicionante(itemId, { nombre, tipo, porDefecto, items }) {
  const { data, error } = await supabase.rpc("revision_condicionante_guardar", {
    p_item: itemId, p_nombre: nombre, p_tipo: tipo, p_por_defecto: porDefecto,
    p_items: items.map((i) => ({ material_id: i.material.id, tipo_item: i.accion, cantidad: Number(i.cantidad), unidad: i.material.unidad_medida || null })),
  });
  if (error) throw errorLegible(error, "No se pudo guardar el condicionante. Reintentá.");
  return data;
}

/** Productos del catálogo (para condicionantes: lo que agrega o quita). */
export async function buscarCatalogo(texto) {
  const q = String(texto || "").trim().replace(/[%,()]/g, " ");
  if (q.length < 2) return [];
  const { data, error } = await supabase.from("panol_materiales").select("id, descripcion, codigo, proveedor, unidad_medida, activo")
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`).limit(15);
  if (error) throw errorLegible(error, "No pudimos buscar en el catálogo.");
  return (data || []).filter((p) => p.activo !== false);
}

/** Plan de producción de una línea: etapas, ubicación, tareas, materiales y la matriz para asignar. */
export async function cargarPlan(modelo) {
  const { data: linea, error: e1 } = await supabase.from("lineas_produccion").select("id, nombre, semanas_produccion_estimadas")
    .eq("nombre", `K${modelo}`).eq("activa", true).maybeSingle();
  if (e1) throw errorLegible(e1, "No pudimos cargar el plan de la línea.");
  if (!linea) return { linea: null, etapas: [], matriz: [] };
  const { data: etapas, error: e2 } = await supabase.from("linea_procesos").select("id, nombre, orden, dias_estimados")
    .eq("linea_id", linea.id).eq("activo", true).order("orden");
  if (e2) throw errorLegible(e2, "No pudimos cargar las etapas.");
  const ids = (etapas || []).map((e) => e.id);
  const [offsets, tareas, mats, matriz] = await Promise.all([
    supabase.from("fechas_offsets").select("evento_key, semanas").eq("modelo", "*").in("evento_key", ids.map((id) => `linea_proceso:${id}`)),
    ids.length ? supabase.from("linea_proceso_tareas").select("id, linea_proceso_id, nombre, orden").in("linea_proceso_id", ids).order("orden") : { data: [] },
    ids.length ? supabase.from("linea_proceso_materiales").select("linea_proceso_id, material_id, cantidad, unidad, material:panol_materiales!linea_proceso_materiales_material_id_fkey(descripcion)").in("linea_proceso_id", ids) : { data: [] },
    supabase.from("panol_material_modelo").select("material_id, cantidad, material:panol_materiales!panol_material_modelo_material_id_fkey(descripcion, codigo, unidad_medida)")
      .eq("modelo", modelo).eq("variante", "standard"),
  ]);
  const error = offsets.error || tareas.error || mats.error || matriz.error;
  if (error) throw errorLegible(error, "No pudimos cargar el plan de la línea.");
  const semanaDe = new Map((offsets.data || []).map((o) => [o.evento_key.replace("linea_proceso:", ""), Number(o.semanas)]));
  return {
    linea,
    etapas: (etapas || []).map((e) => ({
      ...e,
      semana: semanaDe.has(e.id) ? semanaDe.get(e.id) : null,
      tareas: (tareas.data || []).filter((t) => t.linea_proceso_id === e.id),
      materiales: (mats.data || []).filter((m) => m.linea_proceso_id === e.id),
    })),
    matriz: (matriz.data || []).filter((m) => m.material).map((m) => ({ id: m.material_id, cantidad: m.cantidad, ...m.material })),
  };
}

export async function ajustarEtapa(etapaId, semanas, dias) {
  const { error } = await supabase.rpc("revision_etapa_ajustar", { p_etapa: etapaId, p_semanas: semanas, p_dias: dias });
  if (error) throw errorLegible(error, "No se pudo guardar la etapa. Reintentá.");
}

export async function materialEtapa(etapaId, materialId, quitar = false) {
  const { error } = await supabase.rpc("revision_etapa_material", { p_etapa: etapaId, p_material: materialId, p_quitar: quitar });
  if (error) throw errorLegible(error, "No se pudo actualizar el material de la etapa. Reintentá.");
}

/** Semanas que ocupa una etapa: desde su semana de inicio, una por cada 5 días hábiles. */
export function semanasDeEtapa(etapa) {
  if (etapa.semana == null || Number.isNaN(etapa.semana)) return null;
  const largo = Math.max(1, Math.ceil((Number(etapa.dias_estimados) || 5) / 5));
  return { desde: etapa.semana, hasta: etapa.semana + largo - 1 };
}

/** Fecha local de hoy como YYYY-MM-DD. */
export function hoyISO(fecha = new Date()) {
  const d = new Date(fecha);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
