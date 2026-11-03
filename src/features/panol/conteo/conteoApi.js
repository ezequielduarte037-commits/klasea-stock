import { supabase } from "@/supabaseClient";

// Las tablas y funciones son de 20261103120000_panol_conteo_diario.sql.

const ITEM_SELECT = "*, lote:panol_conteo_lotes(id,sede,fecha), material:panol_materiales(id,descripcion,codigo,unidad_medida,ubicacion,ubicacion_obs,imagen_url)";
const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];

function faltaMigracion(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || text.includes("panol_conteo") && text.includes("does not exist");
}

export class ConteoSinMigracion extends Error {
  constructor() {
    super("El conteo diario todavía no está instalado en la base.");
    this.name = "ConteoSinMigracion";
  }
}

function lanzar(error) {
  if (faltaMigracion(error)) throw new ConteoSinMigracion();
  throw error;
}

/** El lote de una sede en una fecha, con sus renglones. null si todavía no se armó. */
export async function fetchConteoLote(sede, fecha) {
  const { data: lote, error } = await supabase
    .from("panol_conteo_lotes")
    .select("id,sede,fecha,creado_por,created_at")
    .eq("sede", sede)
    .eq("fecha", fecha)
    .maybeSingle();
  if (error) lanzar(error);
  if (!lote) return null;
  const { data: items, error: itemsError } = await supabase
    .from("panol_conteo_items")
    .select(ITEM_SELECT)
    .eq("lote_id", lote.id)
    .order("orden");
  if (itemsError) lanzar(itemsError);
  return { ...lote, items: items ?? [] };
}

/**
 * Lo que sigue abierto en una sede de otros días: segundos conteos, diferencias
 * a revisar y lo que quedó sin contar (para traerlo a la lista de hoy).
 */
export async function fetchConteosAbiertos(sede) {
  const { data, error } = await supabase
    .from("panol_conteo_items")
    .select(`${ITEM_SELECT.replace("lote:panol_conteo_lotes(", "lote:panol_conteo_lotes!inner(")}`)
    .eq("lote.sede", sede)
    .in("estado", ["pendiente", "recontar", "revisar"])
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) lanzar(error);
  return data ?? [];
}

/** Última vez que se terminó de contar cada material: Map material_id → fecha. */
export async function fetchUltimosConteos() {
  const { data, error } = await supabase
    .from("panol_conteo_items")
    .select("material_id,contado_at,recontado_at,estado")
    .not("contado_at", "is", null)
    .order("contado_at", { ascending: false })
    .limit(5000);
  if (error) lanzar(error);
  const map = new Map();
  for (const row of data ?? []) {
    const at = row.recontado_at || row.contado_at;
    if (!map.has(row.material_id) || new Date(at) > new Date(map.get(row.material_id))) map.set(row.material_id, at);
  }
  return map;
}

/** Lo contado en los últimos días de una sede, para la exactitud. */
export async function fetchConteosRecientes(sede, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("panol_conteo_items")
    .select("id,estado,ajuste,lote:panol_conteo_lotes!inner(sede,fecha)")
    .eq("lote.sede", sede)
    .gte("lote.fecha", desde)
    .limit(2000);
  if (error) lanzar(error);
  return data ?? [];
}

/**
 * Las filas del ledger de un material recién leídas, para comparar el conteo
 * contra lo que dice el sistema en ese momento (no contra la pantalla cargada
 * hace un rato, que puede no tener el último retiro).
 */
export async function fetchLedgerMaterial(materialId) {
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id,material_id,obra_id,stock_sede,source,estado,recepcion_estado,cantidad,cantidad_egresada,notas,egreso_nota,recepcion_nota,stock_nota,panol_envio:panol_envios(sede)")
    .eq("material_id", materialId)
    .in("estado", LEDGER_STATES)
    .limit(5000);
  if (error) throw error;
  return data ?? [];
}

export async function crearLoteConteo(sede, fecha, items) {
  const { data, error } = await supabase.rpc("panol_conteo_crear_lote", { p_sede: sede, p_fecha: fecha, p_items: items });
  if (error) lanzar(error);
  return data;
}

export async function registrarConteo(itemId, { contado, teorico, libre, nota = null }) {
  const { data, error } = await supabase.rpc("panol_conteo_registrar", {
    p_item_id: itemId, p_contado: contado, p_teorico: teorico, p_libre: libre, p_nota: nota,
  });
  if (error) lanzar(error);
  return data;
}

export async function resolverConteo(itemId, { aplicar, cantidad = null, teorico = null, nota = null }) {
  const { data, error } = await supabase.rpc("panol_conteo_resolver", {
    p_item_id: itemId, p_aplicar: !!aplicar, p_cantidad: cantidad, p_teorico: teorico, p_nota: nota,
  });
  if (error) lanzar(error);
  return data;
}
