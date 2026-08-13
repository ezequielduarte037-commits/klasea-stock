import { supabase } from "@/supabaseClient";

function cleanIds(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function schemaMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01"
    || error?.code === "42703"
    || error?.code === "PGRST202"
    || message.includes("schema cache")
    || message.includes("does not exist")
    || message.includes("could not find");
}

export async function fetchRequisitoProductos(requisitoIds = []) {
  const ids = cleanIds(requisitoIds);
  if (!ids.length) return [];
  const rows = [];
  for (let from = 0; from < ids.length; from += 150) {
    const { data, error } = await supabase
      .from("panol_requisito_productos")
      .select("id,requisito_material_id,producto_material_id,variante_legacy,origen,activo,created_at")
      .in("requisito_material_id", ids.slice(from, from + 150))
      .eq("activo", true);
    if (error) {
      if (schemaMissing(error)) return [];
      throw error;
    }
    rows.push(...(data || []));
  }
  return rows;
}

export async function asignarProductoObraSnapshot(snapshotId, productoMaterialId = null, origen = "asignacion_obra") {
  if (!snapshotId) throw new Error("Falta el ítem de obra.");
  const { data, error } = await supabase.rpc("panol_asignar_producto_snapshot", {
    p_snapshot_id: snapshotId,
    p_producto_material_id: productoMaterialId || null,
    p_origen: origen,
  });
  if (error) {
    if (schemaMissing(error)) {
      throw new Error("Falta aplicar la migración de requisitos y productos.");
    }
    throw error;
  }
  return data;
}

export async function guardarConfiguracionProductoObra({
  snapshotId,
  productoMaterialId = null,
  especificaciones = {},
  origen = "asignacion_obra",
} = {}) {
  if (!snapshotId) throw new Error("Falta el ítem de obra.");
  const { data, error } = await supabase.rpc("panol_guardar_configuracion_snapshot", {
    p_snapshot_id: snapshotId,
    p_producto_material_id: productoMaterialId || null,
    p_especificaciones: especificaciones || {},
    p_origen: origen,
  });
  if (error) {
    if (schemaMissing(error)) {
      throw new Error("Falta aplicar la migración de productos y especificaciones por obra.");
    }
    throw error;
  }
  return data;
}

export async function guardarConfiguracionProductoLinea({
  requisitoMaterialId,
  modelo,
  productoMaterialId = null,
  especificaciones = {},
  aplicarObrasExistentes = false,
} = {}) {
  if (!requisitoMaterialId || !modelo) throw new Error("Falta el requisito o la línea.");
  const { data, error } = await supabase.rpc("panol_guardar_configuracion_matriz", {
    p_requisito_material_id: requisitoMaterialId,
    p_modelo: String(modelo),
    p_producto_material_id: productoMaterialId || null,
    p_especificaciones: especificaciones || {},
    p_aplicar_obras_existentes: !!aplicarObrasExistentes,
  });
  if (error) {
    if (schemaMissing(error)) {
      throw new Error("Falta aplicar la migración de productos y especificaciones por línea.");
    }
    throw error;
  }
  return data || {};
}

export async function marcarMaterialComoRequisito(materialId, esRequisito = true) {
  if (!materialId) throw new Error("Falta el material.");
  const { data, error } = await supabase
    .from("panol_materiales")
    .update({ es_requisito: !!esRequisito })
    .eq("id", materialId)
    .select("id,es_requisito")
    .single();
  if (error) {
    if (schemaMissing(error)) {
      throw new Error("Falta aplicar la migración de requisitos y productos.");
    }
    throw error;
  }
  return data;
}

export async function fetchEstadoMigracionProductos() {
  const { data, error } = await supabase
    .from("panol_requisitos_migracion_estado")
    .select("*")
    .order("obras_pendientes", { ascending: false })
    .order("requisito", { ascending: true });
  if (error) {
    if (schemaMissing(error)) return [];
    throw error;
  }
  return data || [];
}
