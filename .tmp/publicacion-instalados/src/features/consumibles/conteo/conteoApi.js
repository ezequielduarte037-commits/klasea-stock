import { supabase } from "@/supabaseClient";
import { hoyArgentina, nuevoId, rangoDeHoyArgentina } from "@/features/consumibles/api";
import { DIA_MS } from "./conteoCalculos";

/**
 * Lecturas propias de Conteo (y que también usan Stock e Ingresos). Lo que es
 * contrato común vive en `@/features/consumibles/api`; acá va lo que necesita
 * columnas mínimas o paginar, para no traer `select *` con joins cada 15 s.
 */

const COLS_MOV = "id,material_id,tipo,cantidad,contado,teorico,gramos,lote,created_at,created_by,anulado_at";

/** Trae todas las filas de una consulta, de a mil (PostgREST corta en mil). */
async function paginar(armar) {
  const filas = [];
  for (let desde = 0; ;) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data?.length) break;
    desde += data.length;
  }
  return filas;
}

/** Todo lo que se movió hoy en la sede (conteos, retiros, ingresos), sin anulados. */
export async function fetchMovimientosDeHoy(sede, ahora = new Date()) {
  const { desde, hasta } = rangoDeHoyArgentina(ahora);
  return paginar(() => supabase
    .from("consumibles_movimientos")
    .select(COLS_MOV)
    .eq("sede", sede)
    .is("anulado_at", null)
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: true }).order("id"));
}

/**
 * Lo que necesita "Contar hoy": retiros de los últimos 30 días y conteos de
 * los últimos 180, todo de antes de hoy.
 */
export async function fetchHistorialParaSugerir(sede, ahora = new Date()) {
  const hoy = new Date(rangoDeHoyArgentina(ahora).desde).getTime();
  const [retiros, conteos] = await Promise.all([
    paginar(() => supabase
      .from("consumibles_movimientos")
      .select("material_id,created_at")
      .eq("sede", sede)
      .eq("tipo", "retiro")
      .is("anulado_at", null)
      .gte("created_at", new Date(hoy - 30 * DIA_MS).toISOString())
      .lt("created_at", new Date(hoy).toISOString())
      .order("created_at", { ascending: true })),
    paginar(() => supabase
      .from("consumibles_movimientos")
      .select("material_id,created_at")
      .eq("sede", sede)
      .eq("tipo", "inventario")
      .is("anulado_at", null)
      .gte("created_at", new Date(hoy - 180 * DIA_MS).toISOString())
      .lt("created_at", new Date(hoy).toISOString())
      .order("created_at", { ascending: true })),
  ]);
  return { retiros, conteos };
}

/** Movimientos de consumo (retiros, devoluciones, mermas) desde una fecha. */
export async function fetchConsumoDesde(sede, desde) {
  return paginar(() => {
    let q = supabase
      .from("consumibles_movimientos")
      .select("material_id,sede,tipo,cantidad,created_at")
      .in("tipo", ["retiro", "devolucion", "merma"])
      .is("anulado_at", null)
      .gte("created_at", new Date(desde).toISOString())
      .order("created_at", { ascending: true });
    if (sede) q = q.eq("sede", sede);
    return q;
  });
}

/** Los rubros de consumibles: hijos de la categoría "Consumibles". */
export async function fetchRubrosConsumibles() {
  const { data, error } = await supabase.from("panol_categorias").select("id,nombre,parent_id").limit(2000);
  if (error) throw error;
  const todas = data ?? [];
  const raiz = todas.find((c) => !c.parent_id && /^consumibles$/i.test(String(c.nombre || "").trim()));
  if (!raiz) return { raiz: null, rubros: [] };
  const rubros = todas
    .filter((c) => c.parent_id === raiz.id)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return { raiz, rubros };
}

const cacheNombres = new Map();

/** Nombre de usuario de quien cargó cada fila (created_by → profiles). */
export async function fetchNombresDePerfiles(ids = []) {
  const faltan = [...new Set(ids.filter((id) => id && !cacheNombres.has(id)))];
  if (faltan.length) {
    try {
      const { data, error } = await supabase.from("profiles").select("id,username").in("id", faltan);
      if (error) throw error;
      for (const p of data ?? []) cacheNombres.set(p.id, p.username || "");
    } catch {
      // Sin nombres la pantalla sigue andando: muestra la hora sola.
    }
  }
  const out = new Map();
  for (const id of ids) if (cacheNombres.has(id)) out.set(id, cacheNombres.get(id));
  return out;
}

const LOTE_KEY = "klasea.consumibles.conteo.lote";

/**
 * El lote agrupa una tanda de conteo: uno por equipo, por sede y por día. Se
 * guarda para que recargar la página no parta el conteo en dos.
 */
export function loteDeConteo(sede, ahora = new Date()) {
  const dia = hoyArgentina(ahora);
  try {
    const guardado = JSON.parse(window.localStorage.getItem(LOTE_KEY) || "null");
    if (guardado?.dia === dia && guardado?.sede === sede && guardado?.lote) return guardado.lote;
  } catch { /* sin almacenamiento: un lote por apertura */ }
  const lote = nuevoId();
  try {
    window.localStorage.setItem(LOTE_KEY, JSON.stringify({ dia, sede, lote }));
  } catch { /* modo privado */ }
  return lote;
}

const ENVASE_KEY = "klasea.consumibles.conteo.envases";

/** Peso del envase vacío de cada cajón, recordado en este equipo. */
export function envaseRecordado(materialId) {
  try {
    const mapa = JSON.parse(window.localStorage.getItem(ENVASE_KEY) || "{}");
    return mapa[materialId] ?? "";
  } catch {
    return "";
  }
}

export function recordarEnvase(materialId, gramos) {
  try {
    const mapa = JSON.parse(window.localStorage.getItem(ENVASE_KEY) || "{}");
    if (gramos) mapa[materialId] = String(gramos);
    else delete mapa[materialId];
    window.localStorage.setItem(ENVASE_KEY, JSON.stringify(mapa));
  } catch { /* modo privado */ }
}
