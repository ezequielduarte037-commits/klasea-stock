import { supabase } from "@/supabaseClient";

/**
 * Lo que la pestaña Solicitudes necesita y no está en `solicitudesPanolApi`
 * ni en `api.js`. Las altas, cambios de cantidad y estados de renglón se
 * siguen haciendo con las funciones de pañol (`@/features/panol/solicitudesPanolApi`):
 * es la misma tabla y la misma RLS.
 *
 * La entrega va por `consumibles_entregar_solicitud` (migración
 * 20261013100000): escribe los retiros en el registro de consumibles con
 * carril planificado y marca la solicitud entregada en la misma transacción.
 */

const COLS =
  "id, numero, obra_id, obra_texto, sede_origen, sector, prioridad, fecha_pedido, fecha_retiro, " +
  "solicita, retira, tipo, tarea, observaciones, estado, origen, " +
  "retirado_por_id, retirado_por_nombre, retirado_por_dni, retirado_metodo, retirado_at, " +
  "created_by, created_at, updated_at";

// Solo lo necesario para contar renglones en la tarjeta. La marca de
// consumible se toma del material (la del renglón se desfasa).
const RESUMEN = "items:panol_solicitud_items(id, estado, cantidad, material_id, material:panol_materiales(es_consumible))";

const SELECT_BANDEJA = `${COLS}, obra:produccion_obras(id, codigo, descripcion), ${RESUMEN}`;

/**
 * La bandeja: lo activo de la sede (y lo que no tiene sede, para asignarlo)
 * más lo cerrado en los últimos días. Son ~4 por día: dos consultas chicas.
 */
export async function fetchBandeja({ sede, dias = 8 } = {}) {
  if (!sede) return [];
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const [activas, cerradas] = await Promise.all([
    supabase
      .from("panol_solicitudes")
      .select(SELECT_BANDEJA)
      .in("estado", ["enviada", "preparando", "listo"])
      .or(`sede_origen.eq.${sede},sede_origen.is.null`)
      .order("created_at", { ascending: true })
      .limit(400),
    supabase
      .from("panol_solicitudes")
      .select(SELECT_BANDEJA)
      .in("estado", ["entregado", "cancelado"])
      .eq("sede_origen", sede)
      .gte("updated_at", desde)
      .order("updated_at", { ascending: false })
      .limit(400),
  ]);
  if (activas.error) throw activas.error;
  if (cerradas.error) throw cerradas.error;
  return [...(activas.data ?? []), ...(cerradas.data ?? [])];
}

/**
 * Busca en el historial de la sede (entregadas y canceladas de cualquier
 * fecha). La bandeja filtra en memoria; esto suma lo que ya no está cargado.
 */
export async function buscarEnHistorial({ sede, q, limite = 60 } = {}) {
  const termino = String(q ?? "").trim();
  if (!sede || termino.length < 2) return [];
  // La coma y los paréntesis parten el filtro de PostgREST: se cambian por espacios.
  const like = `%${termino.replace(/[%,()]/g, " ")}%`;
  const comoNumero = /^\d+$/.test(termino) ? `,numero.eq.${termino}` : "";
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .select(SELECT_BANDEJA)
    .in("estado", ["entregado", "cancelado"])
    .eq("sede_origen", sede)
    .or(`solicita.ilike.${like},retira.ilike.${like},obra_texto.ilike.${like},sector.ilike.${like},tarea.ilike.${like},retirado_por_nombre.ilike.${like}${comoNumero}`)
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

const ITEM_COLS =
  "id, solicitud_id, material_id, descripcion, codigo, cantidad, unidad, observacion, estado, orden, es_consumible, " +
  "material:panol_materiales(id, es_consumible, descripcion, imagen_url, ubicacion, unidad_medida)";

/** La solicitud con sus renglones y las fotos del papel. */
export async function fetchDetalle(id) {
  if (!id) return null;
  const [sol, items, fotos] = await Promise.all([
    supabase.from("panol_solicitudes").select(`${COLS}, obra:produccion_obras(id, codigo, descripcion)`).eq("id", id).maybeSingle(),
    supabase.from("panol_solicitud_items").select(ITEM_COLS).eq("solicitud_id", id).order("orden", { ascending: true }),
    supabase
      .from("panol_solicitud_fotos")
      .select("id, url, path, nombre, tipo, estado_lectura, error_lectura, orden, created_at")
      .eq("solicitud_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (sol.error) throw sol.error;
  if (items.error) throw items.error;
  return {
    solicitud: sol.data ?? null,
    items: items.data ?? [],
    // Las fotos son un respaldo: si no se pueden leer, la solicitud se trabaja igual.
    fotos: fotos.error ? [] : fotos.data ?? [],
  };
}

/**
 * Agrega un producto del catálogo y devuelve la fila completa: la pantalla la
 * suma a la lista sin volver a pedir todo, y si el lector pasa el mismo
 * producto otra vez mientras tanto, se suma a esta fila en lugar de duplicarla.
 */
export async function agregarRenglon(solicitudId, item, cantidad = 1, orden = 0) {
  if (!solicitudId || !item?.id) throw new Error("Falta la solicitud o el producto.");
  const { data, error } = await supabase
    .from("panol_solicitud_items")
    .insert({
      solicitud_id: solicitudId,
      material_id: item.id,
      // Se congela lo que decía el catálogo al cargarlo (como en pañol).
      descripcion: item.descripcion || "Consumible",
      codigo: item.codigoEtiqueta || item.config?.proveedor_codigo || item.codigo || null,
      cantidad,
      unidad: item.unidad || null,
      es_consumible: true,
      estado: "pendiente",
      orden,
    })
    .select(ITEM_COLS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Resuelve un renglón escrito a mano: le pone el producto del catálogo. Se
 * guarda lo que dice el catálogo hoy (como al agregar), y la descripción
 * original queda en la observación para saber qué decía el papel.
 */
export async function elegirProducto(renglon, item) {
  if (!renglon?.id || !item?.id) throw new Error("Falta el renglón o el producto.");
  const escrito = String(renglon.descripcion ?? "").trim();
  const previa = String(renglon.observacion ?? "").trim();
  const observacion = [previa, escrito && escrito !== item.descripcion ? `Decía: ${escrito}` : ""].filter(Boolean).join(" · ") || null;
  const { error } = await supabase
    .from("panol_solicitud_items")
    .update({
      material_id: item.id,
      descripcion: item.descripcion || escrito || "Consumible",
      codigo: item.codigoEtiqueta || item.config?.proveedor_codigo || item.codigo || null,
      unidad: item.unidad || null,
      es_consumible: true,
      observacion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", renglon.id);
  if (error) throw error;
}

/**
 * Entrega la solicitud a nombre de quien firma. El RPC es idempotente: si se
 * perdió la respuesta y se reintenta, contesta `ya_entregada` sin registrar
 * de nuevo.
 */
export async function entregarSolicitud({ solicitudId, empleado = null, nombre = null, dni = null, metodo = "nfc", nfcUid = null } = {}) {
  if (!solicitudId) throw new Error("Falta la solicitud.");
  const { data, error } = await supabase.rpc("consumibles_entregar_solicitud", {
    p_solicitud_id: solicitudId,
    p_empleado_id: empleado?.id ?? null,
    p_nombre: empleado?.nombre ?? nombre ?? null,
    p_dni: empleado?.dni ?? dni ?? null,
    p_metodo: metodo,
    p_nfc_uid: nfcUid || null,
  });
  if (error) throw error;
  return data;
}

/** Anula los retiros de la entrega y la deja lista para retirar otra vez. */
export async function deshacerEntrega(solicitudId, motivo) {
  const texto = String(motivo ?? "").trim();
  if (!texto) throw new Error("Escribí por qué se deshace.");
  const { data, error } = await supabase.rpc("consumibles_deshacer_entrega_solicitud", {
    p_solicitud_id: solicitudId,
    p_motivo: texto,
  });
  if (error) throw error;
  return data;
}

/** Los mensajes de la base vienen con el prefijo de Postgres: se muestra solo el texto. */
export function mensajeError(err, porDefecto = "No se pudo completar.") {
  const m = String(err?.message || err || "").replace(/^.*?ERROR:\s*/i, "").trim();
  if (/failed to fetch|network|load failed/i.test(m)) return "No hay conexión con el servidor. Probá de nuevo.";
  return m || porDefecto;
}
