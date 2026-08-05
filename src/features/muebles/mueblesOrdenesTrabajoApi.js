import { supabase } from "@/supabaseClient";

export const MUEBLES_OT_TYPES = {
  maderas: { title: "OT de maderas", short: "Maderas" },
  herrajes: { title: "OT de kit de herrajes", short: "Kit de herrajes" },
};

function normalizeModel(value) {
  return String(value || "")
    .trim()
    .replace(/^K/i, "")
    .split("-")[0];
}

function isMissingOtSchema(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01"
    || error?.code === "42703"
    || error?.code === "PGRST202"
    || error?.code === "PGRST205"
    || message.includes("schema cache")
    || message.includes("does not exist")
    || message.includes("could not find the table");
}

function schemaError(error) {
  if (!isMissingOtSchema(error)) return error;
  return new Error("Falta aplicar la migración de OT de materiales de Muebles en Supabase.");
}

async function fetchOrdersBy(column, value) {
  if (!value) return [];
  const { data: orders, error } = await supabase
    .from("muebles_ordenes_trabajo")
    .select("id,lote_id,linea_id,tipo,numero_ot,titulo,proveedor,notas,config,creado_por,actualizado_por,created_at,updated_at")
    .eq(column, value)
    .order("tipo");
  if (error) throw schemaError(error);

  const ids = (orders || []).map((row) => row.id);
  if (!ids.length) return [];
  const { data: items, error: itemError } = await supabase
    .from("muebles_orden_trabajo_items")
    .select("id,orden_trabajo_id,material_id,obra_snapshot_id,descripcion,codigo,cantidad,cantidad_texto,unidad,notas,detalle,origen,orden,created_at,updated_at")
    .in("orden_trabajo_id", ids)
    .order("orden");
  if (itemError) throw schemaError(itemError);

  const byOrder = new Map();
  for (const item of items || []) {
    const list = byOrder.get(item.orden_trabajo_id) || [];
    list.push(item);
    byOrder.set(item.orden_trabajo_id, list);
  }
  return (orders || []).map((order) => ({
    ...order,
    items: byOrder.get(order.id) || [],
  }));
}

export async function fetchMueblesOrdenesTrabajo(loteId) {
  return fetchOrdersBy("lote_id", loteId);
}

export async function fetchMueblesOtScopes({ loteId, lineaId }) {
  const [linea, obra] = await Promise.all([
    fetchOrdersBy("linea_id", lineaId),
    fetchOrdersBy("lote_id", loteId),
  ]);
  return { linea, obra };
}

async function fetchObraByCode(code) {
  if (!code || code === "Sin asignar") return null;
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,linea_nombre,estado")
    .eq("codigo", code)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchSnapshotCandidates(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id,obra_id,material_id,descripcion,codigo,cantidad,unidad,proveedor,rubro,tipo,notas,source,estado,orden")
    .eq("obra_id", obraId)
    .order("orden", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    key: `obra:${row.id}`,
    material_id: row.material_id,
    obra_snapshot_id: row.id,
    descripcion: row.descripcion,
    codigo: row.codigo,
    cantidad: row.cantidad,
    unidad: row.unidad || "unidad",
    notas: row.notas,
    proveedor: row.proveedor,
    rubro: row.rubro,
    estado: row.estado,
    origen: "matriz_obra",
    sourceLabel: "Lista de la obra",
  }));
}

async function fetchLineCandidates(model) {
  const normalized = normalizeModel(model);
  if (!normalized) return [];
  const { data: matrix, error: matrixError } = await supabase
    .from("panol_material_modelo")
    .select("id,material_id,modelo,cantidad,variante")
    .eq("modelo", normalized)
    .gt("cantidad", 0);
  if (matrixError) throw matrixError;

  const materialIds = [...new Set((matrix || []).map((row) => row.material_id).filter(Boolean))];
  if (!materialIds.length) return [];
  const { data: materials, error: materialError } = await supabase
    .from("panol_materiales")
    .select("id,descripcion,codigo,unidad_medida,proveedor,notas,activo")
    .in("id", materialIds);
  if (materialError) throw materialError;

  const materialById = new Map((materials || []).map((row) => [row.id, row]));
  return (matrix || []).map((row) => {
    const material = materialById.get(row.material_id);
    if (!material || material.activo === false) return null;
    return {
      key: `linea:${row.id}`,
      material_id: row.material_id,
      obra_snapshot_id: null,
      descripcion: material.descripcion,
      codigo: material.codigo,
      cantidad: row.cantidad,
      unidad: material.unidad_medida || "unidad",
      notas: material.notas,
      proveedor: material.proveedor,
      rubro: null,
      estado: null,
      origen: "matriz_linea",
      sourceLabel: `Matriz K${normalized}`,
    };
  }).filter(Boolean);
}

export async function fetchMueblesMaterialCandidates({ obraCodigo, modelo }) {
  const obra = await fetchObraByCode(obraCodigo);
  const [snapshotRows, lineRows] = await Promise.all([
    fetchSnapshotCandidates(obra?.id),
    fetchLineCandidates(modelo || obra?.linea_nombre),
  ]);

  const seen = new Set();
  const candidates = [];
  for (const row of [...snapshotRows, ...lineRows]) {
    const key = row.material_id ? `material:${row.material_id}` : `text:${String(row.descripcion || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(row);
  }
  return { obra, candidates };
}

export async function saveMueblesOrdenTrabajo({ scope = "obra", loteId, lineaId, tipo, numeroOt, titulo, notas, config, items }) {
  const payload = (items || []).map((item, index) => ({
    material_id: item.material_id || null,
    obra_snapshot_id: item.obra_snapshot_id || null,
    descripcion: String(item.descripcion || "").trim(),
    codigo: String(item.codigo || "").trim() || null,
    cantidad: item.cantidad === "" || item.cantidad == null ? null : item.cantidad,
    cantidad_texto: String(item.cantidad_texto ?? item.cantidad ?? "").trim() || null,
    unidad: String(item.unidad || "unidad").trim() || "unidad",
    notas: String(item.notas || "").trim() || null,
    detalle: item.detalle && typeof item.detalle === "object" ? item.detalle : {},
    origen: item.origen || "manual",
    orden: index,
  })).filter((item) => item.descripcion);

  const { data, error } = await supabase.rpc("muebles_ot_guardar_contexto", {
    p_lote_id: scope === "obra" ? loteId : null,
    p_linea_id: scope === "linea" ? lineaId : null,
    p_tipo: tipo,
    p_numero_ot: String(numeroOt || "").trim() || null,
    p_titulo: String(titulo || MUEBLES_OT_TYPES[tipo]?.title || "OT").trim(),
    p_notas: String(notas || "").trim() || null,
    p_items: payload,
    p_config: config && typeof config === "object" ? config : {},
  });
  if (error) throw schemaError(error);
  return data;
}

export async function discardMueblesOrdenTrabajoOverride({ loteId, tipo }) {
  const { error } = await supabase.rpc("muebles_ot_descartar_override", {
    p_lote_id: loteId,
    p_tipo: tipo,
  });
  if (error) throw schemaError(error);
}
