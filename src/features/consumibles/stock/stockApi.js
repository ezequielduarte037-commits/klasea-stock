import { supabase } from "@/supabaseClient";
import { addRequestItem, createPurchaseRequest, updatePurchaseRequest } from "@/features/compras/purchaseRequestsApi";
import { fmtCantidad } from "@/features/consumibles/api";
import { DIA_MS } from "../conteo/conteoCalculos";
import { fetchConsumoDesde } from "../conteo/conteoApi";
import { totalDePedido } from "./reposicion";

/**
 * Lecturas y escrituras propias de Stock y reposición.
 */

/** Consumo de los últimos 30 días, de las dos sedes (columna 7 d y mínimo sugerido). */
export async function fetchConsumo30Dias(ahora = new Date()) {
  return fetchConsumoDesde(null, new Date(new Date(ahora).getTime() - 30 * DIA_MS));
}

/** Primer conteo de la sede: desde ahí hay registro para promediar consumo. */
export async function fetchPrimerConteo(sede) {
  const { data, error } = await supabase
    .from("consumibles_movimientos")
    .select("created_at")
    .eq("sede", sede)
    .eq("tipo", "inventario")
    .is("anulado_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at ?? null;
}

async function buscarProveedor(nombre) {
  const limpio = String(nombre || "").trim();
  if (!limpio) return null;
  const { data } = await supabase
    .from("panol_proveedores")
    .select("id,nombre")
    .ilike("nombre", limpio)
    .limit(1);
  return data?.[0] ?? null;
}

/**
 * Crea el pedido a Compras como lo hace el resto del sistema
 * (createPurchaseRequest + un purchase_request_item por renglón), con los
 * ítems vinculados al catálogo (`material_id`, `catalog_source: "panol"`) y el
 * código del proveedor. El aviso por mail lo dispara la base al insertar.
 */
export async function mandarPedidoACompras({ grupo, sede }) {
  const lineas = grupo.lineas.filter((l) => l.unidadesCompra > 0);
  if (!lineas.length) throw new Error("No hay renglones para pedir.");
  const proveedor = grupo.sinProveedor ? null : await buscarProveedor(grupo.proveedor);
  const { total, sinCosto } = totalDePedido(lineas);
  const destino = `Pañol ${sede}`;

  const request = await createPurchaseRequest({
    form: {
      title: `Reposición de consumibles · ${destino}${grupo.sinProveedor ? "" : ` · ${grupo.proveedor}`}`,
      description: [
        `Pedido de consumibles armado desde la app (${lineas.length} ${lineas.length === 1 ? "producto" : "productos"}${lineas.some((l) => l.manual) ? ", algunos pedidos a mano" : " en el mínimo o por debajo"}).`,
        total > 0 ? `Total estimado: $ ${total.toLocaleString("es-AR", { maximumFractionDigits: 0 })} sin IVA${sinCosto ? ` (${sinCosto} sin precio)` : ""}.` : "",
      ].filter(Boolean).join("\n"),
      priority: "media",
      proveedor: grupo.sinProveedor ? null : (proveedor?.nombre || grupo.proveedor),
      destino,
      tipo_pedido: "stock",
      es_adicional: false,
      source: "consumibles",
    },
  });

  for (const l of lineas) {
    const equivale = l.factor > 1 ? ` (${fmtCantidad(l.cantidadEntrega)} ${l.unidad})` : "";
    await addRequestItem(request.id, {
      description: l.descripcion,
      quantity: String(l.unidadesCompra),
      unit: l.unidadCompra || l.unidad || "unidad",
      destination: destino,
      notes: [
        `Stock ${l.sinContar ? "sin contar" : fmtCantidad(l.stock)}`,
        l.minimo ? `mínimo ${fmtCantidad(l.minimo)}` : null,
        l.maximo ? `máximo ${fmtCantidad(l.maximo)}` : null,
        l.manual ? "pedido a mano" : null,
      ].filter(Boolean).join(" · ") + equivale,
      material_id: l.materialId,
      requisito_material_id: l.materialId,
      catalog_source: "panol",
      supplier_id: proveedor?.id ?? null,
      supplier_name: grupo.sinProveedor ? null : (proveedor?.nombre || grupo.proveedor),
      supplier_code: l.codigoProveedor || null,
    });
  }

  // createPurchaseRequest no guarda `tipo_pedido`: se marca aparte como pedido de stock.
  try {
    await updatePurchaseRequest(request.id, { tipo_pedido: "stock" });
  } catch { /* el pedido ya está creado; el tipo es un detalle */ }

  return request;
}

// ── Recibir un pedido (Ingresos) ───────────────────────────────────────────

/**
 * Pedidos de consumibles que ya salieron a Compras y todavía no llegaron del
 * todo, con sus renglones abiertos. Son los que Ingresos ofrece recibir.
 */
export async function fetchPedidosEnCamino(sede) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id,title,status,proveedor,destino,created_at,purchase_request_items(id,description,quantity,unit,material_id,status,notes)")
    .eq("source", "consumibles")
    .eq("destino", `Pañol ${sede}`)
    .not("status", "in", '("recibido","cancelado")')
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? [])
    .map((p) => ({
      ...p,
      items: (p.purchase_request_items ?? []).filter((i) => i.material_id && !["recibido", "cancelado"].includes(i.status)),
    }))
    .filter((p) => p.items.length > 0);
}

/**
 * Marca como recibidos los renglones del pedido que llegaron completos (los que
 * llegaron de menos quedan abiertos para la próxima entrega) y deja el pedido
 * en "recibido" si no queda ninguno abierto.
 */
export async function cerrarRenglonesRecibidos(pedidoId, itemIdsCompletos = []) {
  const ids = itemIdsCompletos.filter(Boolean);
  if (ids.length) {
    const { error } = await supabase.from("purchase_request_items").update({ status: "recibido" }).in("id", ids);
    if (error) throw error;
  }
  const { error: errSync } = await supabase.rpc("sync_purchase_request_status_from_items", { p_request_id: pedidoId });
  if (errSync) throw errSync;
}
