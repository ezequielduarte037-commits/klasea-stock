import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Compras por Etapa — receta de materiales por etapa de modelo (BOM) y pedidos
// de producción que nacen de esa receta cuando un casco entra a una etapa.
//
// Reusa lo que ya existe:
//   • lineas_produccion   → los modelos (K37, K34…)
//   • linea_procesos      → las etapas de cada modelo (plantilla)
//   • obra_etapas         → las etapas del casco real (con su estado)
//   • panol_materiales    → el catálogo general
//
// Agrega:
//   • linea_proceso_materiales     → la receta: qué materiales y cuánto por etapa
//   • pedidos_produccion / _items  → el pedido itemizado que ve compras
//
// NO usa purchase_requests: eso queda para pedidos ad-hoc / adicionales.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ── Modelos y etapas (plantilla) ─────────────────────────────────────────── */

export async function fetchModelos() {
  const { data, error } = await supabase
    .from("lineas_produccion")
    .select("id, nombre, orden, color, activa")
    .eq("activa", true)
    .order("orden", { ascending: true, nullsFirst: false })
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function fetchEtapasModelo(lineaId) {
  if (!lineaId) return [];
  const { data, error } = await supabase
    .from("linea_procesos")
    .select("id, linea_id, nombre, orden, color, dias_estimados, descripcion")
    .eq("linea_id", lineaId)
    .eq("activo", true)
    .order("orden", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/* ── Receta (BOM) por etapa ───────────────────────────────────────────────── */

// Trae la receta de varias etapas de una sola query (para pintar todo el modelo).
export async function fetchRecetaPorProcesos(procIds = []) {
  const ids = [...new Set((procIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("linea_proceso_materiales")
    .select(
      "id, linea_proceso_id, material_id, cantidad, unidad, notas, orden, " +
        "material:panol_materiales(id, descripcion, codigo, unidad_medida, proveedor)"
    )
    .in("linea_proceso_id", ids)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function agregarMaterialReceta(lineaProcesoId, material, { cantidad = 1, unidad = null, notas = null } = {}) {
  if (!lineaProcesoId) throw new Error("Falta la etapa.");
  if (!material?.id) throw new Error("Falta el material.");
  const { data, error } = await supabase
    .from("linea_proceso_materiales")
    .upsert(
      {
        linea_proceso_id: lineaProcesoId,
        material_id: material.id,
        cantidad: num(cantidad) || 1,
        unidad: unidad || material.unidad || material.unidad_medida || null,
        notas: notas || null,
      },
      { onConflict: "linea_proceso_id,material_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarMaterialReceta(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.cantidad !== undefined) clean.cantidad = num(patch.cantidad);
  if (patch.unidad !== undefined) clean.unidad = patch.unidad || null;
  if (patch.notas !== undefined) clean.notas = patch.notas || null;
  if (patch.orden !== undefined) clean.orden = num(patch.orden);
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("linea_proceso_materiales").update(clean).eq("id", id);
  if (error) throw error;
}

export async function quitarMaterialReceta(id) {
  if (!id) return;
  const { error } = await supabase.from("linea_proceso_materiales").delete().eq("id", id);
  if (error) throw error;
}

/* ── Materiales de la matriz de un modelo (BOM) ───────────────────────────── */

// Materiales que usa un modelo según su matriz (panol_material_modelo). Se usa para
// que el selector de la receta ofrezca SOLO lo que el barco realmente lleva, en vez
// del catálogo completo. modeloNombre viene como "K37"; el BOM usa el número ("37").
// Si el modelo no tiene matriz cargada, devuelve [] (el selector cae al catálogo).
export async function fetchMaterialesDeModelo(modeloNombre) {
  const modelo = String(modeloNombre || "").replace(/^k/i, "").trim();
  if (!modelo) return [];
  const { data, error } = await supabase
    .from("panol_material_modelo")
    .select("material_id, cantidad, material:panol_materiales(id, descripcion, codigo, unidad_medida, proveedor, activo)")
    .eq("modelo", modelo);
  if (error) throw error;
  const byId = new Map();
  for (const row of data ?? []) {
    const m = row.material;
    if (!m || m.activo === false) continue;
    const prev = byId.get(m.id);
    byId.set(m.id, {
      id: m.id,
      descripcion: m.descripcion || "",
      codigo: m.codigo || "",
      unidad: m.unidad_medida || "unidad",
      proveedor: m.proveedor || "",
      cantidad: num(row.cantidad) + (prev ? num(prev.cantidad) : 0),
    });
  }
  return [...byId.values()].sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

// Mapa material_id -> { etapa, color, orden } según la receta del modelo. Sirve para
// pintar en la matriz (Listas de compras) a qué etapa pertenece cada material.
export async function fetchEtapaPorMaterialDeModelo(modeloNombre) {
  const nombre = String(modeloNombre || "").trim();
  if (!nombre) return new Map();
  const { data: lineas } = await supabase
    .from("lineas_produccion").select("id").eq("nombre", nombre).limit(1);
  const lineaId = lineas?.[0]?.id;
  if (!lineaId) return new Map();
  const { data: procs } = await supabase
    .from("linea_procesos").select("id, nombre, color, orden").eq("linea_id", lineaId);
  if (!procs?.length) return new Map();
  const procById = new Map(procs.map((p) => [p.id, p]));
  const { data: recetas } = await supabase
    .from("linea_proceso_materiales")
    .select("material_id, linea_proceso_id")
    .in("linea_proceso_id", procs.map((p) => p.id));
  const map = new Map();
  for (const r of recetas ?? []) {
    const p = procById.get(r.linea_proceso_id);
    if (!p || map.has(r.material_id)) continue;
    map.set(r.material_id, { etapa: p.nombre, color: p.color || "#64748b", orden: p.orden ?? 0 });
  }
  return map;
}

/* ── Obras (cascos reales) y sus etapas ───────────────────────────────────── */

export async function fetchObras() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id, codigo, descripcion, estado, linea_id, linea_nombre, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEtapasObra(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("obra_etapas")
    .select("id, obra_id, linea_proceso_id, nombre, orden, color, estado, pedido_produccion_id")
    .eq("obra_id", obraId)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// La etapa del casco puede no estar persistida todavía (se ve "virtual" desde la
// plantilla). Antes de generar un pedido, la materializamos en obra_etapas para
// tener dónde colgar el link al pedido.
async function asegurarObraEtapa(obra, proceso) {
  const { data: existente } = await supabase
    .from("obra_etapas")
    .select("id, pedido_produccion_id")
    .eq("obra_id", obra.id)
    .eq("linea_proceso_id", proceso.id)
    .maybeSingle();
  if (existente?.id) return existente;

  const { data, error } = await supabase
    .from("obra_etapas")
    .insert({
      obra_id: obra.id,
      linea_proceso_id: proceso.id,
      nombre: proceso.nombre,
      orden: proceso.orden ?? 999,
      color: proceso.color ?? "#64748b",
      dias_estimados: proceso.dias_estimados ?? null,
      estado: "pendiente",
    })
    .select("id, pedido_produccion_id")
    .single();
  if (error) throw error;
  return data;
}

/* ── Generación del pedido de producción desde la receta ──────────────────── */

// Devuelve el pedido activo (no cancelado) que ya exista para esa etapa del casco,
// o null. Sirve para avisar antes de duplicar.
export async function pedidoExistenteEtapa(obraId, lineaProcesoId) {
  const { data, error } = await supabase
    .from("pedidos_produccion")
    .select("id, titulo, estado, created_at")
    .eq("obra_id", obraId)
    .eq("linea_proceso_id", lineaProcesoId)
    .neq("estado", "cancelado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// Todos los pedidos activos de un casco, para saber de una sola query qué etapas
// ya tienen pedido generado (en vez de una consulta por etapa).
export async function fetchPedidosActivosDeObra(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("pedidos_produccion")
    .select("id, linea_proceso_id, estado, titulo, created_at")
    .eq("obra_id", obraId)
    .neq("estado", "cancelado")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Crea un pedido de producción itemizado a partir de la receta de la etapa.
// obra: fila de produccion_obras. proceso: fila de linea_procesos.
export async function generarPedidoPorEtapa(obra, proceso) {
  if (!obra?.id) throw new Error("Falta la obra.");
  if (!proceso?.id) throw new Error("Falta la etapa.");

  const receta = await fetchRecetaPorProcesos([proceso.id]);
  if (!receta.length) {
    throw new Error(`La etapa "${proceso.nombre}" no tiene receta de materiales cargada.`);
  }

  const etapaObra = await asegurarObraEtapa(obra, proceso);

  const { data: { session } = {} } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const { data: pedido, error: errPed } = await supabase
    .from("pedidos_produccion")
    .insert({
      obra_id: obra.id,
      obra_etapa_id: etapaObra.id,
      linea_proceso_id: proceso.id,
      titulo: `${proceso.nombre} — ${obra.codigo || obra.descripcion || "obra"}`,
      obra_codigo: obra.codigo ?? null,
      etapa_nombre: proceso.nombre,
      estado: "pendiente",
      created_by: userId,
    })
    .select("*")
    .single();
  if (errPed) throw errPed;

  const items = receta.map((r, i) => ({
    pedido_id: pedido.id,
    material_id: r.material_id,
    descripcion: r.material?.descripcion || "Material",
    codigo: r.material?.codigo || null,
    cantidad: num(r.cantidad) || 1,
    unidad: r.unidad || r.material?.unidad_medida || null,
    notas: r.notas || null,
    orden: r.orden ?? i,
    estado: "pendiente",
  }));

  const { error: errItems } = await supabase.from("pedidos_produccion_items").insert(items);
  if (errItems) throw errItems;

  // Linkear la etapa del casco con el pedido generado.
  await supabase
    .from("obra_etapas")
    .update({ pedido_produccion_id: pedido.id })
    .eq("id", etapaObra.id);

  return { pedido, cantidad: items.length };
}

/* ── Lectura y seguimiento de pedidos de producción ───────────────────────── */

export async function fetchPedidosProduccion() {
  const { data, error } = await supabase
    .from("pedidos_produccion")
    .select(
      "*, items:pedidos_produccion_items(*), obra:produccion_obras(id, codigo, descripcion)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    items: [...(p.items ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));
}

export async function actualizarItemPedido(itemId, patch = {}) {
  if (!itemId) return;
  const clean = {};
  if (patch.estado !== undefined) clean.estado = patch.estado;
  if (patch.cantidad_recibida !== undefined) clean.cantidad_recibida = num(patch.cantidad_recibida);
  if (patch.notas !== undefined) clean.notas = patch.notas || null;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("pedidos_produccion_items").update(clean).eq("id", itemId);
  if (error) throw error;
}

export async function actualizarEstadoPedido(pedidoId, estado) {
  if (!pedidoId) return;
  const { error } = await supabase
    .from("pedidos_produccion")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", pedidoId);
  if (error) throw error;
}

export async function borrarPedido(pedidoId) {
  if (!pedidoId) return;
  // Desvincular la etapa del casco antes de borrar (el FK es set null igual,
  // pero así queda consistente si la fila sigue en memoria).
  await supabase.from("obra_etapas").update({ pedido_produccion_id: null }).eq("pedido_produccion_id", pedidoId);
  const { error } = await supabase.from("pedidos_produccion").delete().eq("id", pedidoId);
  if (error) throw error;
}

export const ITEM_ESTADOS = [
  { value: "pendiente", label: "Pendiente", color: "#a1a1aa" },
  { value: "pedido", label: "Pedido", color: "#f59e0b" },
  { value: "parcial", label: "Recibido parcial", color: "#a78bfa" },
  { value: "recibido", label: "Recibido", color: "#10b981" },
  { value: "cancelado", label: "Cancelado", color: "#ef4444" },
];

export const PEDIDO_ESTADOS = [
  { value: "pendiente", label: "Pendiente", color: "#a1a1aa" },
  { value: "en_compra", label: "En compra", color: "#f59e0b" },
  { value: "parcial", label: "Parcial", color: "#a78bfa" },
  { value: "completo", label: "Completo", color: "#10b981" },
  { value: "cancelado", label: "Cancelado", color: "#ef4444" },
];
