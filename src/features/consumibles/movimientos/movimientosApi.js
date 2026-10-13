import { supabase } from "@/supabaseClient";

/**
 * Lecturas de la pestaña Movimientos. Trae anulados también (se muestran
 * tachados si se piden) y pagina: PostgREST corta en mil filas sin avisar.
 */

const PAGINA = 1000;
/** Tope de filas por consulta: un mes del pañol entra holgado. */
export const TOPE_FILAS = 10000;

const CAMPOS = `id,material_id,sede,tipo,cantidad,gramos,contado,teorico,
  empleado_id,empleado_nombre,metodo_firma,obra_id,sector,carril,lote,solicitud_id,
  costo_unitario_ars,canje,fuera_cupo,autorizado_por,remito,origen,nota,
  anulado_at,anulado_motivo,created_by,created_at,
  obra:produccion_obras(id,codigo),
  solicitud:panol_solicitudes(id,numero),
  material:panol_materiales(id,descripcion,unidad_medida,config:consumibles_config(codigo_etiqueta,unidad_entrega))`;

/** Movimientos de un período (desde inclusive, hasta exclusivo), del más nuevo al más viejo. */
export async function fetchMovimientosPeriodo({ sede = null, desde, hasta, signal } = {}) {
  const filas = [];
  // Si entra un retiro mientras se pagina, la página siguiente repite una fila: se descarta por id.
  const vistos = new Set();
  let desdeFila = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    let q = supabase
      .from("consumibles_movimientos")
      .select(CAMPOS)
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (sede) q = q.eq("sede", sede);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    desdeFila += data.length;
    for (const f of data) if (!vistos.has(f.id)) { vistos.add(f.id); filas.push(f); }
    if (filas.length >= TOPE_FILAS) return { filas: filas.slice(0, TOPE_FILAS), recortado: true };
  }
  return { filas, recortado: false };
}

/** Primer conteo por producto y sede (sale de la vista de stock): marca lo pre-conteo. */
export async function fetchPrimerosConteos({ sede = null, signal } = {}) {
  const filas = [];
  for (;;) {
    let q = supabase
      .from("consumibles_stock")
      .select("material_id,sede,primer_conteo_at")
      .not("primer_conteo_at", "is", null)
      .order("material_id")
      .order("sede")
      .range(filas.length, filas.length + PAGINA - 1);
    if (sede) q = q.eq("sede", sede);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
  }
  return filas;
}
