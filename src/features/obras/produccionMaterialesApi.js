import { supabase } from "@/supabaseClient";

const MATERIAL_SELECT =
  "id,categoria_id,codigo,descripcion,proveedor,unidad_medida,activo,es_consumible";

const numberOr = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function catalogModelForLine(linea) {
  const match = String(linea?.nombre || "").match(/\d+/);
  return match?.[0]?.replace(/^0+(?=\d)/, "") || "";
}

async function fetchMaterials(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("panol_materiales")
    .select(MATERIAL_SELECT)
    .in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

export async function fetchProduccionMateriales({ linea, processIds = [] } = {}) {
  const ids = [...new Set(processIds.filter(Boolean))];
  const modelo = catalogModelForLine(linea);

  const assignmentsQuery = ids.length
    ? supabase
      .from("linea_proceso_materiales")
      .select("id,linea_proceso_id,linea_proceso_tarea_id,material_id,cantidad,unidad,notas,orden,created_at,updated_at")
      .in("linea_proceso_id", ids)
      .order("orden", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const matrixQuery = modelo
    ? supabase
      .from("panol_material_modelo")
      .select("id,material_id,modelo,cantidad,variante")
      .eq("modelo", modelo)
    : Promise.resolve({ data: [], error: null });

  const purchaseLinksQuery = ids.length
    ? supabase
      .from("linea_compra_etapa_procesos")
      .select("linea_proceso_id,compra_etapa_id")
      .in("linea_proceso_id", ids)
    : Promise.resolve({ data: [], error: null });

  const [assignmentsRes, matrixRes, linksRes] = await Promise.all([
    assignmentsQuery,
    matrixQuery,
    purchaseLinksQuery,
  ]);
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (matrixRes.error) throw matrixRes.error;
  if (linksRes.error) throw linksRes.error;

  const purchaseStageIds = [...new Set((linksRes.data ?? []).map((row) => row.compra_etapa_id).filter(Boolean))];
  let purchaseStages = [];
  if (purchaseStageIds.length) {
    const { data, error } = await supabase
      .from("linea_compra_etapas")
      .select("id,nombre,orden,color,activa")
      .in("id", purchaseStageIds)
      .neq("activa", false)
      .order("orden", { ascending: true });
    if (error) throw error;
    purchaseStages = data ?? [];
  }

  const materialIds = [
    ...(assignmentsRes.data ?? []).map((row) => row.material_id),
    ...(matrixRes.data ?? []).map((row) => row.material_id),
  ];
  const materialById = await fetchMaterials(materialIds);

  const matrixByMaterial = new Map();
  for (const row of matrixRes.data ?? []) {
    const material = materialById.get(row.material_id);
    if (!material || material.activo === false) continue;
    const current = matrixByMaterial.get(row.material_id);
    const variant = String(row.variante || "standard").trim() || "standard";
    const variants = new Set(current?.variantes || []);
    variants.add(variant);
    const prefer = !current || (variant === "standard" && current.variante !== "standard");
    matrixByMaterial.set(row.material_id, {
      ...(prefer ? {
        ...material,
        cantidad: numberOr(row.cantidad),
        unidad: material.unidad_medida || "unidad",
        variante: variant,
        matrixRowId: row.id,
      } : current),
      variantes: [...variants],
    });
  }

  const stageById = new Map(purchaseStages.map((row) => [row.id, row]));
  const purchaseStagesByProcess = new Map(ids.map((id) => [id, []]));
  for (const link of linksRes.data ?? []) {
    const stage = stageById.get(link.compra_etapa_id);
    if (!stage) continue;
    purchaseStagesByProcess.get(link.linea_proceso_id)?.push(stage);
  }

  return {
    modelo,
    matrix: [...matrixByMaterial.values()].sort((a, b) =>
      String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es")),
    assignments: (assignmentsRes.data ?? []).map((row) => ({
      ...row,
      material: materialById.get(row.material_id) || null,
    })),
    purchaseStagesByProcess,
  };
}

export async function assignProduccionMaterials({
  processIds = [],
  processId,
  taskId = null,
  materials = [],
} = {}) {
  const lineProcessIds = [...new Set(processIds.filter(Boolean))];
  const selected = [...new Map(
    materials.filter((row) => row?.id).map((row) => [row.id, row]),
  ).values()];
  if (!processId) throw new Error("Elegí una etapa de producción.");
  if (!selected.length) return 0;

  const selectedIds = selected.map((row) => row.id);
  const { data: existing, error: existingError } = await supabase
    .from("linea_proceso_materiales")
    .select("id,material_id,linea_proceso_id")
    .in("linea_proceso_id", lineProcessIds.length ? lineProcessIds : [processId])
    .in("material_id", selectedIds);
  if (existingError) throw existingError;

  const existingByMaterial = new Map((existing ?? []).map((row) => [row.material_id, row]));
  const updates = [];
  const inserts = [];
  selected.forEach((material, index) => {
    const current = existingByMaterial.get(material.id);
    const payload = {
      linea_proceso_id: processId,
      linea_proceso_tarea_id: taskId || null,
      cantidad: numberOr(material.cantidad),
      unidad: material.unidad || material.unidad_medida || "unidad",
      orden: index,
    };
    if (current) {
      updates.push(
        supabase.from("linea_proceso_materiales").update(payload).eq("id", current.id),
      );
    } else {
      inserts.push({ ...payload, material_id: material.id });
    }
  });

  if (inserts.length) {
    const { error } = await supabase.from("linea_proceso_materiales").insert(inserts);
    if (error) throw error;
  }
  if (updates.length) {
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
  return selected.length;
}

export async function updateProduccionMaterial(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.processId !== undefined) clean.linea_proceso_id = patch.processId;
  if (patch.taskId !== undefined) clean.linea_proceso_tarea_id = patch.taskId || null;
  if (patch.cantidad !== undefined) clean.cantidad = numberOr(patch.cantidad);
  if (patch.unidad !== undefined) clean.unidad = String(patch.unidad || "").trim() || null;
  if (patch.notas !== undefined) clean.notas = String(patch.notas || "").trim() || null;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase
    .from("linea_proceso_materiales")
    .update(clean)
    .eq("id", id);
  if (error) throw error;
}

export async function removeProduccionMaterial(id) {
  if (!id) return;
  const { error } = await supabase
    .from("linea_proceso_materiales")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
