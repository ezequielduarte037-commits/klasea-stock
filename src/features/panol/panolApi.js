import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// API del módulo Pedidos / Recepción a Pañol.
// Toda escritura pasa por RPCs `security definer` (panol_crear_envio,
// panol_marcar_items, panol_set_estado) para mantener atómicos: items + eventos
// (historial) + recálculo del estado de cabecera. Ver migración del módulo.
// ─────────────────────────────────────────────────────────────────────────────

export const SEDES_PANOL = ["Pampa", "Chubut"];

export const ENVIO_ESTADOS = ["borrador", "enviado", "en_preparacion", "parcial", "recibido", "cerrado", "cancelado"];
export const ITEM_ESTADOS = ["pendiente", "recibido", "parcial", "sin_info", "falta_stock", "rechazado"];

// Estados de ítem que cuentan como "aviso operativo" (Pañol detectó un problema).
export const ITEM_ESTADOS_PROBLEMA = ["sin_info", "falta_stock", "rechazado"];

export const ITEM_ESTADO_META = {
  pendiente:   { label: "Pendiente",   color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.30)" },
  recibido:    { label: "Recibido",    color: "#34d399", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.30)" },
  parcial:     { label: "Parcial",     color: "#a78bfa", bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.30)" },
  sin_info:    { label: "Sin info",    color: "#60a5fa", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.30)" },
  falta_stock: { label: "Falta stock", color: "#fbbf24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.30)" },
  rechazado:   { label: "Rechazado",   color: "#f87171", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.30)" },
};

export const ENVIO_ESTADO_META = {
  borrador:       { label: "Borrador",       color: "#9ca3af" },
  enviado:        { label: "Enviado",        color: "#fbbf24" },
  en_preparacion: { label: "En preparación", color: "#60a5fa" },
  parcial:        { label: "Parcial",        color: "#a78bfa" },
  recibido:       { label: "Recibido",       color: "#34d399" },
  cerrado:        { label: "Cerrado",        color: "#6b7280" },
  cancelado:      { label: "Cancelado",      color: "#f87171" },
};

// Resumen de estados de los ítems de un envío (para KPIs y chips de la bandeja).
export function resumenItems(items = []) {
  const total = items.length;
  const by = {};
  for (const e of ITEM_ESTADOS) by[e] = 0;
  for (const it of items) by[it.estado] = (by[it.estado] ?? 0) + 1;
  const recibidos = by.recibido ?? 0;
  const problemas = ITEM_ESTADOS_PROBLEMA.reduce((s, e) => s + (by[e] ?? 0), 0);
  const pendientes = by.pendiente ?? 0;
  return { total, by, recibidos, problemas, pendientes, pctRecibido: total ? Math.round((recibidos / total) * 100) : 0 };
}

// ─── Lecturas ─────────────────────────────────────────────────────────────────
export async function fetchEnvios({ sede = null, estados = null } = {}) {
  let q = supabase
    .from("panol_envios")
    .select("*, obra:produccion_obras(id,codigo), items:panol_envio_items(id,estado)")
    .order("created_at", { ascending: false });
  if (sede) q = q.eq("sede", sede);
  if (estados?.length) q = q.in("estado", estados);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchEnvio(id) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select("*, obra:produccion_obras(id,codigo), items:panol_envio_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchEventos(envioId) {
  const { data, error } = await supabase
    .from("panol_envio_eventos")
    .select("*, actor:profiles(id,username)")
    .eq("envio_id", envioId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Envíos vinculados a un pedido de compras (para el panel "Estado en Pañol").
export async function fetchEnviosDePedido(purchaseRequestId) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select("*, items:panol_envio_items(id,estado)")
    .eq("purchase_request_id", purchaseRequestId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEnviosRegistro({ limit = 80 } = {}) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select(`
      *,
      obra:produccion_obras(id,codigo),
      items:panol_envio_items(*),
      eventos:panol_envio_eventos(*, actor:profiles(id,username))
    `)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((envio) => ({
    ...envio,
    items: envio.items ?? [],
    eventos: [...(envio.eventos ?? [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));
}

export async function fetchLinkedPurchaseRequestForEnvio(envioId) {
  if (!envioId) return null;
  const { data, error } = await supabase
    .rpc("panol_get_linked_purchase_request", { p_envio: envioId })
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ─── Escrituras (RPCs) ──────────────────────────────────────────────────────
export async function crearEnvio({
  titulo, sede, prioridad = "media", obraId = null, destino = null,
  observaciones = null, origen = "manual", purchaseRequestId = null,
  purchaseLogId = null, items = [],
}) {
  const { data, error } = await supabase.rpc("panol_crear_envio", {
    p_titulo: titulo,
    p_sede: sede,
    p_prioridad: prioridad,
    p_obra_id: obraId,
    p_destino: destino,
    p_observaciones: observaciones,
    p_origen: origen,
    p_purchase_request_id: purchaseRequestId,
    p_items: items.map((it) => ({
      descripcion: it.descripcion ?? it.description ?? "",
      codigo: it.codigo ?? it.code ?? null,
      cantidad: it.cantidad ?? it.quantity ?? null,
      unidad: it.unidad ?? it.unit ?? "unidad",
      purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
      precio_unitario: it.precio_unitario ?? it.precioUnitario ?? null,
      moneda: it.moneda ?? null,
    })),
  });
  if (error) throw error;

  // Vínculo envío ↔ compra cargada (purchase_log): permite que "Gasto por obra"
  // cuente el costo una sola vez (lo aporta la compra, no el envío). Best-effort:
  // si la columna todavía no existe (SQL sin correr), no rompe el flujo.
  if (data && purchaseLogId) {
    try {
      const { error: linkErr } = await supabase
        .from("panol_envios")
        .update({ purchase_log_id: purchaseLogId })
        .eq("id", data);
      if (linkErr && import.meta.env?.DEV) {
        console.warn("[panol] no se pudo vincular envío con compra:", linkErr.message);
      }
    } catch { /* columna purchase_log_id aún no creada — se ignora */ }
  }

  return data; // id del envío creado
}

export async function marcarItems(itemIds, estado, { nota = null, cantidadRecibida = null } = {}) {
  const { error } = await supabase.rpc("panol_marcar_items", {
    p_item_ids: itemIds,
    p_estado: estado,
    p_nota: nota,
    p_cant_recibida: cantidadRecibida,
  });
  if (error) throw error;
}

export async function setEstadoEnvio(envioId, estado) {
  const { error } = await supabase.rpc("panol_set_estado", { p_envio: envioId, p_estado: estado });
  if (error) throw error;
}

export async function deleteEnvio(envioId) {
  const { error } = await supabase
    .from("panol_envios")
    .delete()
    .eq("id", envioId);
  if (error) throw error;
}

// Mensaje simple entre Pañol y Compras (queda en el historial del envío).
export async function updateEnvioItemPrice(itemId, { precio_unitario = null, moneda = "ARS" } = {}) {
  const raw = precio_unitario === "" || precio_unitario === undefined ? null : precio_unitario;
  const price = raw === null ? null : Number(raw);
  if (raw !== null && !Number.isFinite(price)) throw new Error("Precio invalido.");

  const { error } = await supabase
    .from("panol_envio_items")
    .update({
      precio_unitario: raw === null ? null : price,
      moneda: raw === null ? null : (moneda === "USD" ? "USD" : "ARS"),
    })
    .eq("id", itemId);
  if (error) throw error;
}

export async function comentarEnvio(envioId, texto) {
  const t = String(texto || "").trim();
  if (!t) return;
  const { error } = await supabase.rpc("panol_comentar_envio", { p_envio: envioId, p_texto: t });
  if (error) throw error;
}
