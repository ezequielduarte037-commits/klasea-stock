import { supabase } from "@/supabaseClient";
import { motivoAnulacion } from "./conteoDiario.js";

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

const HISTORIAL_ITEM_SELECT = "id,lote_id,material_id,orden,clase,motivo,estado,unidad,teorico,contado,contado_por,contado_at,recontado,recontado_por,recontado_at,ajuste,ajuste_snapshot_id,recuento_motivo,resuelto_por,resuelto_at,nota,material:panol_materiales(id,descripcion,codigo,unidad_medida,ubicacion,imagen_url)";

/**
 * Las listas de una sede desde `desde` (AAAA-MM-DD), con sus renglones. Se trae
 * también la lista anterior a `desde`, porque un segundo conteo hecho dentro
 * del período puede ser de un renglón de antes. `inicio` es la fecha de la
 * primera lista de la sede (antes no había conteo diario).
 */
export async function fetchHistorialConteo(sede, desde) {
  const { data: primera, error: primeraError } = await supabase
    .from("panol_conteo_lotes")
    .select("fecha")
    .eq("sede", sede)
    .order("fecha", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (primeraError) lanzar(primeraError);
  const inicio = primera?.fecha || null;
  const { data: lotes, error } = await supabase
    .from("panol_conteo_lotes")
    .select("id,sede,fecha,creado_por,created_at")
    .eq("sede", sede)
    .gte("fecha", sumarDiasIso(desde, -14))
    .order("fecha", { ascending: false })
    .limit(400);
  if (error) lanzar(error);
  if (!lotes?.length) return { lotes: [], inicio };
  const ids = lotes.map((lote) => lote.id);
  const items = [];
  const PAGINA = 1000;
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const { data, error: itemsError } = await supabase
      .from("panol_conteo_items")
      .select(HISTORIAL_ITEM_SELECT)
      .in("lote_id", ids)
      .order("id")
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (itemsError) lanzar(itemsError);
    items.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  const porLote = new Map(lotes.map((lote) => [lote.id, { ...lote, items: [] }]));
  for (const item of await marcarAjustesAnulados(items)) porLote.get(item.lote_id)?.items.push(item);
  for (const lote of porLote.values()) lote.items.sort((a, b) => a.orden - b.orden);
  return { lotes: [...porLote.values()], inicio };
}

function sumarDiasIso(fecha, n) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const f = new Date(y, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

const cacheNombres = new Map();

/** Nombre de usuario de cada id (contó, recontó, resolvió, armó la lista). */
export async function fetchNombres(ids = []) {
  const faltan = [...new Set(ids.filter((id) => id && !cacheNombres.has(id)))];
  for (let i = 0; i < faltan.length; i += 200) {
    try {
      const { data, error } = await supabase.from("profiles").select("id,username").in("id", faltan.slice(i, i + 200));
      if (error) throw error;
      for (const p of data ?? []) cacheNombres.set(p.id, p.username || "");
    } catch {
      // Sin nombres la pantalla sigue andando: muestra "alguien".
    }
  }
  return new Map([...new Set(ids)].filter((id) => cacheNombres.has(id)).map((id) => [id, cacheNombres.get(id)]));
}

/**
 * Marca los renglones cuyo ajuste se anuló después desde Movimientos
 * ("Revertir"): la fila del ajuste queda con "[anulado] … Motivo reversion: …"
 * y la del contramovimiento, con quién lo hizo. Agrega
 * `ajuste_anulado: { motivo, por }`. Si la lectura falla, devuelve los
 * renglones como estaban.
 */
export async function marcarAjustesAnulados(items = []) {
  const ids = [...new Set(items.map((item) => item.ajuste_snapshot_id).filter(Boolean))];
  if (!ids.length) return items;
  try {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("id,material_id,notas,egreso_nota,stock_nota")
      .in("id", ids);
    if (error) throw error;
    const anulados = new Map();
    for (const row of data ?? []) {
      const motivo = motivoAnulacion([row.notas, row.egreso_nota, row.stock_nota].filter(Boolean).join(" | "));
      if (motivo !== null) anulados.set(row.id, { motivo, por: null, material_id: row.material_id });
    }
    if (!anulados.size) return items;
    const { data: reversiones } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("notas,egreso_nota,egreso_por")
      .in("material_id", [...new Set([...anulados.values()].map((a) => a.material_id))])
      .ilike("notas", "%Revierte movimiento%")
      .limit(500);
    for (const row of reversiones ?? []) {
      const nota = `${row.notas || ""} ${row.egreso_nota || ""}`;
      for (const [id, anulado] of anulados) {
        if (!anulado.por && row.egreso_por && nota.includes(id)) anulado.por = row.egreso_por;
      }
    }
    return items.map((item) => {
      const anulado = anulados.get(item.ajuste_snapshot_id);
      return anulado ? { ...item, ajuste_anulado: { motivo: anulado.motivo, por: anulado.por } } : item;
    });
  } catch {
    return items;
  }
}
