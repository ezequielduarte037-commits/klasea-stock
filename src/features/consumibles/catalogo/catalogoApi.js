import { supabase } from "@/supabaseClient";
import { guardarConfig } from "@/features/consumibles/api";
import { costoUnitario, factorCompra, interpretarContenido } from "@/features/consumibles/precios/normalizarLista";

/**
 * Lo que necesita la pestaña Catálogo y no está en el contrato común
 * (`api.js`): la lista vigente del proveedor, los rubros de consumibles y el
 * vínculo renglón ↔ consumible.
 */

/** Quién puede tocar listas de precios (RLS: is_panol_manager). */
export function esGestorDeListas(profile) {
  const rol = String(profile?.role || "").toLowerCase();
  return !!profile?.is_admin || ["admin", "compras", "tecnica"].includes(rol);
}

/** Quién puede editar la config (RLS: panol_es_operador_solicitudes). */
export function esOperador(profile) {
  const rol = String(profile?.role || "").toLowerCase();
  return !!profile?.is_admin || ["admin", "panol", "compras", "tecnica", "oficina"].includes(rol);
}

/** La lista más nueva del proveedor con todos sus renglones (o null). */
export async function fetchListaVigente(proveedor = "Rebollar") {
  const { data: listas, error } = await supabase
    .from("consumibles_listas")
    .select("*")
    .ilike("proveedor_nombre", proveedor)
    .order("vigente_desde", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const lista = listas?.[0];
  if (!lista) return null;
  const { data: items, error: e2 } = await supabase
    .from("consumibles_lista_items")
    .select("*")
    .eq("lista_id", lista.id)
    .order("codigo")
    .limit(5000);
  if (e2) throw e2;
  return { ...lista, items: items ?? [] };
}

/** Subrubros de "Consumibles" (y el rubro raíz), para dar de alta. */
export async function fetchRubrosConsumibles() {
  const { data, error } = await supabase.from("panol_categorias").select("id,nombre,parent_id").limit(2000);
  if (error) throw error;
  const raiz = (data ?? []).find((c) => !c.parent_id && /^consumibles$/i.test(String(c.nombre).trim()));
  const hijos = (data ?? [])
    .filter((c) => raiz && c.parent_id === raiz.id)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { raiz, subrubros: hijos };
}

/**
 * Lo que pasa a la config cuando un consumible queda vinculado a un renglón:
 * proveedor, código, unidad de compra, factor y costo por unidad de entrega.
 * Si las unidades no se corresponden, el factor y el costo quedan vacíos.
 */
export function configDesdeRenglon(renglon, unidadEntrega, proveedorNombre) {
  const { granel } = interpretarContenido(renglon.descripcion);
  const factor = factorCompra({
    unidadEntrega,
    unidadCompra: renglon.unidad_compra,
    contenido: renglon.contenido,
    granel,
  });
  return {
    proveedor_nombre: proveedorNombre,
    proveedor_codigo: renglon.codigo,
    unidad_compra: renglon.unidad_compra,
    factor_compra: factor,
    costo_unitario_ars: costoUnitario(renglon.costo_ars, factor),
    costo_lista_item_id: renglon.id,
    costo_actualizado_at: new Date().toISOString(),
  };
}

/**
 * Confirma el par: el renglón queda con su material y la config del
 * consumible con el proveedor, el código y el costo. Si otro ya se llevó el
 * renglón (alguien conciliando en otra PC), avisa en vez de pisarlo.
 */
export async function vincularRenglon({ renglon, materialId, unidadEntrega, proveedorNombre }) {
  const { data, error } = await supabase
    .from("consumibles_lista_items")
    .update({ material_id: materialId })
    .eq("id", renglon.id)
    .is("material_id", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(`El renglón ${renglon.codigo} ya está vinculado a otro consumible.`);
  return guardarConfig(materialId, configDesdeRenglon(renglon, unidadEntrega, proveedorNombre));
}

/** Contamos renglones de retiro, no cantidades; incluimos todo el historial de ambas sedes. */
export async function fetchRetirosHistoricos(materialIds) {
  const retiros = {};
  if (!materialIds.length) return retiros;
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("id,material_id,notas,egreso_nota")
      .eq("source", "solicitud_consumible_retiro")
      .in("material_id", materialIds)
      .order("id")
      .range(desde, desde + pagina - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      // Igual que el informe histórico: un retiro deshecho no cuenta como uso.
      if (`${r.notas ?? ""} ${r.egreso_nota ?? ""}`.toLowerCase().includes("[anulado]")) continue;
      retiros[r.material_id] = (retiros[r.material_id] ?? 0) + 1;
    }
    if ((data?.length ?? 0) < pagina) return retiros;
  }
}

export async function fusionarConsumibles(viejoId, nuevoId) {
  const { data, error } = await supabase.rpc("consumibles_fusionar", { p_viejo: viejoId, p_nuevo: nuevoId });
  if (error) throw error;
  return data;
}

/** Material y mostrador vuelven juntos, con permiso de conciliación en la base. */
export async function reactivarFueraDeRebollar(materialId) {
  const { data, error } = await supabase.rpc("consumibles_reactivar_fuera_rebollar", { p_material_id: materialId });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) {
      throw new Error("Falta habilitar el alta fuera de Rebollar. El coordinador tiene que aplicar la migración pendiente.");
    }
    throw error;
  }
  return data;
}

export async function guardarAlias(materialId, alias) {
  const { data, error } = await supabase.from("panol_materiales")
    .update({ alias }).eq("id", materialId).select("alias").single();
  if (error) throw error;
  return data.alias;
}
