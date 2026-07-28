import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Datos base que usa Compras por Etapa, y el seguimiento de los pedidos ya
// generados.
//
//   lineas_produccion   → los modelos (K37, K55…)
//   linea_procesos      → las etapas de producción de cada modelo
//   produccion_obras    → los cascos reales
//   pedidos_produccion  → el pedido itemizado que gestiona compras
//
// Las etapas de COMPRA y sus materiales viven en comprasObraApi.js.
//
// linea_proceso_materiales (la vieja "receta" por etapa productiva) ya no se
// edita desde esta pantalla: quedó sólo como fuente de la matriz de materiales,
// que la lee fetchEtapaPorMaterialDeModelo más abajo.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ── Modelos y etapas de producción ───────────────────────────────────────── */

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

/* ── Obras ────────────────────────────────────────────────────────────────── */

export async function fetchObras() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id, codigo, descripcion, estado, linea_id, linea_nombre, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ── Matriz de materiales (MaterialesScreen) ──────────────────────────────── */

// Mapa material_id -> { etapa, color, orden } según linea_proceso_materiales.
// Lo usa la matriz de Listas de compras para pintar a qué etapa de producción
// pertenece cada material. No lo escribe nadie desde esta pantalla.
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

/* ── Pedidos de producción ────────────────────────────────────────────────── */

export async function fetchPedidosProduccion() {
  const { data, error } = await supabase
    .from("pedidos_produccion")
    .select("*, items:pedidos_produccion_items(*), obra:produccion_obras(id, codigo, descripcion)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const pedidos = data ?? [];
  const ids = pedidos.map((pedido) => pedido.id);
  let links = [];
  if (ids.length) {
    const { data: rows, error: linksError } = await supabase
      .from("pedido_produccion_etapas")
      .select("pedido_id, etapa:obra_compra_etapas(id, nombre, color, orden)")
      .in("pedido_id", ids);
    if (linksError) throw linksError;
    links = rows ?? [];
  }

  const etapasPorPedido = new Map(ids.map((id) => [id, []]));
  for (const link of links) {
    if (link.etapa) etapasPorPedido.get(link.pedido_id)?.push(link.etapa);
  }

  return pedidos.map((p) => ({
    ...p,
    items: [...(p.items ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    etapas: [...(etapasPorPedido.get(p.id) ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));
}

export async function fetchMaterialesPendientesPorProveedor() {
  const { data, error } = await supabase
    .from("v_compras_materiales_pendientes")
    .select("*")
    .order("proveedor")
    .order("obra_codigo")
    .order("etapa_orden")
    .order("material_orden");
  if (error) throw error;
  return data ?? [];
}

export async function fetchEtapasVencidasSinMateriales() {
  const { data, error } = await supabase
    .from("v_obra_compra_etapas")
    .select("id, obra_id, obra_codigo, nombre, fecha_compra, dias_restantes")
    .eq("vencida_sin_materiales", true)
    .order("fecha_compra");
  if (error) throw error;
  return data ?? [];
}

export async function crearPedidoMultiEtapa({ obraId, materialIds, proveedor }) {
  const ids = [...new Set((materialIds ?? []).filter(Boolean))];
  if (!obraId) throw new Error("Falta la obra.");
  if (!ids.length) throw new Error("Seleccioná al menos un material.");
  const { data, error } = await supabase.rpc("compras_crear_pedido_multi_etapa", {
    p_obra_id: obraId,
    p_material_ids: ids,
    p_proveedor: proveedor || null,
    p_auto: false,
  });
  if (error) throw error;
  return data;
}

export async function autogenerarPedidosVencidos() {
  const { data, error } = await supabase.rpc("compras_autogenerar_pedidos");
  if (error) throw error;
  return data ?? { pedidos_creados: 0, items_incluidos: 0, etapas_vencidas_sin_materiales: 0 };
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
