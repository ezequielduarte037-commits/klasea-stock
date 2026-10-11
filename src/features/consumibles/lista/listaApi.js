import { supabase } from "@/supabaseClient";
import {
  agregarItemsDesdeCatalogo,
  borrarSolicitud,
  crearSolicitud,
  enviarSolicitud,
} from "@/features/panol/solicitudesPanolApi";

// Lectura y alta del carril planificado.
//
// No se toca consumibles_config ni consumibles_stock: el encargado no tiene
// por qué ver costos ni existencias, y esas tablas no se leen con cualquier rol.
// El catálogo sale de panol_materiales (es_consumible) y el pedido entra en la
// misma bandeja que el papel, con origen digital.

const LISTA_COLS =
  "id, numero, obra_id, obra_texto, sector, sede_origen, fecha_pedido, fecha_retiro, " +
  "solicita, tarea, observaciones, estado, origen, tipo, created_at";

const ITEM_COLS =
  "id, material_id, descripcion, codigo, cantidad, unidad, es_consumible, orden";

function normalizarLista(row) {
  const items = [...(row.items || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return {
    id: row.id,
    numero: row.numero,
    obraId: row.obra_id,
    obraTexto: row.obra_texto || "",
    obraCodigo: row.obra?.codigo || "",
    obraNombre: row.obra?.descripcion || "",
    sector: row.sector || "",
    sede: row.sede_origen || "",
    fechaPedido: row.fecha_pedido,
    fechaRetiro: row.fecha_retiro,
    solicita: row.solicita || "",
    tarea: row.tarea || "",
    observaciones: row.observaciones || "",
    estado: row.estado,
    origen: row.origen,
    tipo: row.tipo || [],
    createdAt: row.created_at,
    items,
  };
}

function esDeConsumibles(lista) {
  if ((lista.tipo || []).includes("Consumibles")) return true;
  return (lista.items || []).some((it) => it.es_consumible === true);
}

async function actorId() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Catálogo que cualquier usuario con sesión puede leer. Sin stock ni costos. */
export async function fetchConsumibles() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("panol_materiales")
      .select("id, descripcion, alias, codigo, unidad_medida, activo")
      .eq("es_consumible", true)
      .order("descripcion", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message || "No se pudo leer el catálogo.");
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas
    .filter((m) => m.activo !== false && m.id)
    .map((m) => ({
      id: m.id,
      descripcion: String(m.descripcion || "Sin nombre").trim(),
      alias: m.alias || "",
      codigo: m.codigo || "",
      unidad: m.unidad_medida || "",
    }));
}

export async function fetchObrasActivas() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id, codigo, descripcion, estado")
    .eq("estado", "activa")
    .order("codigo", { ascending: true });
  if (error) throw new Error(error.message || "No se pudieron leer las obras.");
  return (data ?? []).filter((o) => o.id);
}

/** Las listas digitales de quien está logueado, con los ítems para repetirlas. */
export async function fetchMisListas() {
  const uid = await actorId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .select(`${LISTA_COLS}, obra:produccion_obras(id, codigo, descripcion), items:panol_solicitud_items(${ITEM_COLS})`)
    .eq("created_by", uid)
    .eq("origen", "digital")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message || "No se pudieron leer tus listas.");
  return (data ?? []).map(normalizarLista).filter(esDeConsumibles);
}

/**
 * Manda la lista ya en estado enviada, que es lo que la bandeja de pañol
 * muestra como "recién llegada". Los ítems se cargan después: la RLS deja
 * editar lo propio mientras sigue en enviada. Si los ítems fallan, se borra
 * la cabecera para no dejar un pedido vacío en la cola.
 */
export async function enviarLista({ cabecera, items }) {
  const validos = (items || []).filter((it) => it?.materialId && Number(it.cantidad) > 0);
  if (!validos.length) throw new Error("Sumá al menos un consumible.");

  const creada = await crearSolicitud({
    obra_id: cabecera.obra_id || null,
    obra_texto: cabecera.obra_texto || null,
    sector: cabecera.sector || null,
    sede_origen: cabecera.sede_origen,
    fecha_pedido: cabecera.fecha_pedido,
    fecha_retiro: cabecera.fecha_retiro,
    solicita: cabecera.solicita || null,
    tarea: cabecera.tarea || null,
    observaciones: cabecera.observaciones || null,
    tipo: ["Consumibles"],
    prioridad: "normal",
    origen: "digital",
    estado: "enviada",
  });

  try {
    await agregarItemsDesdeCatalogo(creada.id, validos.map((it) => ({
      id: it.materialId,
      descripcion: it.descripcion,
      codigo: it.codigo || null,
      cantidad: it.cantidad,
      unidad: it.unidad || null,
      es_consumible: true,
    })));
  } catch (err) {
    let borro = true;
    try {
      await borrarSolicitud(creada.id);
    } catch {
      borro = false;
    }
    if (!borro) {
      throw new Error(
        `Se creó la lista N° ${creada.numero} pero no se pudieron cargar los ítems, y tampoco se pudo anular. Avisale a pañol ese número.`,
      );
    }
    throw err;
  }

  return creada;
}

export { borrarSolicitud, enviarSolicitud };
