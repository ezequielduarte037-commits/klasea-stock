import { supabase } from "@/supabaseClient";
import { PROVEEDOR_POR_DEFECTO, renglonDesdeItem } from "./pedidosLogica";

/**
 * Pedidos de consumibles al proveedor: el carrito (estado "borrador", uno por
 * sede y proveedor) y los pedidos confirmados. Lo recibido sale de los
 * ingresos vigentes de cada renglón (vista consumibles_pedido_items_recibido).
 */

const COLS = "id,numero,sede,proveedor,estado,nota,created_at,pedido_at,cerrado_at,items:consumibles_pedido_items(id,material_id,cantidad,unidad_compra,factor,costo_compra_ars,nota,created_at)";

/** Pedidos de la sede: el carrito, los que esperan mercadería y los últimos cerrados. */
export async function fetchPedidos(sede, { limite = 40 } = {}) {
  const { data, error } = await supabase
    .from("consumibles_pedidos")
    .select(COLS)
    .eq("sede", sede)
    .neq("estado", "anulado")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  const pedidos = data ?? [];
  const ids = pedidos.flatMap((p) => (p.items ?? []).map((i) => i.id));
  const recibidos = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: filas, error: err } = await supabase
      .from("consumibles_pedido_items_recibido")
      .select("pedido_item_id,recibido_entrega")
      .in("pedido_item_id", ids.slice(i, i + 200));
    if (err) throw err;
    for (const f of filas ?? []) recibidos.set(f.pedido_item_id, Number(f.recibido_entrega) || 0);
  }
  return { pedidos, recibidos };
}

/** El carrito de la sede para ese proveedor; si no hay, lo crea. */
export async function obtenerCarrito(sede, proveedor = PROVEEDOR_POR_DEFECTO) {
  const buscar = async () => {
    const { data, error } = await supabase
      .from("consumibles_pedidos")
      .select(COLS)
      .eq("sede", sede)
      .eq("estado", "borrador")
      .ilike("proveedor", proveedor)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  };
  const existente = await buscar();
  if (existente) return existente;
  const { data, error } = await supabase
    .from("consumibles_pedidos")
    .insert({ sede, proveedor, estado: "borrador" })
    .select(COLS)
    .single();
  // Otro equipo lo creó al mismo tiempo (índice único de un carrito por proveedor).
  if (error?.code === "23505") return buscar();
  if (error) throw error;
  return data;
}

/** Suma un producto al carrito; si ya estaba, suma la cantidad. */
export async function agregarAlCarrito(pedidoId, item, cantidad = 1) {
  const { data: actual, error: errSel } = await supabase
    .from("consumibles_pedido_items")
    .select("id,cantidad")
    .eq("pedido_id", pedidoId)
    .eq("material_id", item.id)
    .maybeSingle();
  if (errSel) throw errSel;
  if (actual) {
    return cambiarCantidad(actual.id, (Number(actual.cantidad) || 0) + (Number(cantidad) || 1));
  }
  const { data, error } = await supabase
    .from("consumibles_pedido_items")
    .insert({ pedido_id: pedidoId, ...renglonDesdeItem(item, cantidad) })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function cambiarCantidad(itemId, cantidad) {
  const { data, error } = await supabase
    .from("consumibles_pedido_items")
    .update({ cantidad })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function quitarRenglon(itemId) {
  const { error } = await supabase.from("consumibles_pedido_items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function vaciarCarrito(pedidoId) {
  const { error } = await supabase.from("consumibles_pedido_items").delete().eq("pedido_id", pedidoId);
  if (error) throw error;
}

/** El carrito pasa a pedido hecho: desde ahí Ingresos lo ofrece para recibir. */
export async function confirmarPedido(pedidoId, nota = "") {
  const { data, error } = await supabase
    .from("consumibles_pedidos")
    .update({ estado: "pedido", nota: String(nota || "").trim() || null })
    .eq("id", pedidoId)
    .eq("estado", "borrador")
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}

/** Dar por terminado un pedido al que le falta algo que no va a venir. */
export async function cerrarPedido(pedidoId) {
  const { error } = await supabase
    .from("consumibles_pedidos")
    .update({ estado: "cerrado" })
    .eq("id", pedidoId)
    .eq("estado", "pedido");
  if (error) throw error;
}

/** Volver a abrir uno cerrado (se cerró por error o al final llegó). */
export async function reabrirPedido(pedidoId) {
  const { error } = await supabase
    .from("consumibles_pedidos")
    .update({ estado: "pedido" })
    .eq("id", pedidoId)
    .eq("estado", "cerrado");
  if (error) throw error;
}
