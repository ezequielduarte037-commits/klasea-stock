import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Etapas de COMPRA de una obra, vistas desde la matriz de materiales.
//
// Antes la matriz pintaba el badge de etapa leyendo `linea_proceso_materiales`
// (la vieja "receta por etapa de producción" del modelo). Ese modelo se
// abandonó: hoy los materiales se cargan DENTRO de cada etapa de compra de la
// obra (obra_compra_etapas / obra_compra_etapa_materiales), así que aquel badge
// mostraba datos muertos.
//
// Este módulo vive en materiales/ a propósito: comprasObraApi.js y
// comprasEtapasApi.js son de la pantalla de Compras y no se tocan desde acá.
// Lo único que necesitamos es lectura + una asignación puntual.
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_FALLBACK = "#64748b";

/**
 * Etapas de compra de la obra + el mapa material_id → etapas donde está cargado.
 *
 * Devuelve `porMaterial` como Map<material_id, Array<etapa>> porque un mismo
 * material puede estar en más de una tanda de compra (ej. "Casco" y "Terminación"
 * compran el mismo sellador). La UI muestra las primeras y resume el resto.
 */
export async function fetchEtapasDeObraConMateriales(obraId) {
  const vacio = { etapas: [], porMaterial: new Map() };
  if (!obraId) return vacio;

  // Se intenta la vista primero: trae `fecha_compra` y `semaforo` ya resueltos.
  // Si la migración de fechas no corrió en este entorno la vista no existe, y
  // caemos a la tabla — el badge sigue funcionando, sólo sin fecha.
  let etapas = [];
  const desdeVista = await supabase
    .from("v_obra_compra_etapas")
    .select("id, obra_id, nombre, orden, color, estado, fecha_compra, semaforo")
    .eq("obra_id", obraId)
    .order("orden", { ascending: true });

  if (desdeVista.error) {
    const alt = await supabase
      .from("obra_compra_etapas")
      .select("id, obra_id, nombre, orden, color, estado")
      .eq("obra_id", obraId)
      .order("orden", { ascending: true });
    if (alt.error) throw alt.error;
    etapas = (alt.data ?? []).map((e) => ({ ...e, fecha_compra: null, semaforo: "sin_fecha" }));
  } else {
    etapas = desdeVista.data ?? [];
  }

  etapas = etapas.map((e, i) => ({
    id: e.id,
    nombre: e.nombre || `Etapa ${i + 1}`,
    orden: e.orden ?? i,
    color: e.color || COLOR_FALLBACK,
    estado: e.estado || "pendiente",
    fecha_compra: e.fecha_compra ?? null,
    semaforo: e.semaforo ?? "sin_fecha",
  }));

  if (!etapas.length) return { etapas: [], porMaterial: new Map() };

  const { data: filas, error } = await supabase
    .from("obra_compra_etapa_materiales")
    .select("id, obra_compra_etapa_id, material_id, cantidad, unidad")
    .in("obra_compra_etapa_id", etapas.map((e) => e.id));
  if (error) throw error;

  const etapaById = new Map(etapas.map((e) => [e.id, e]));
  const porMaterial = new Map();
  for (const fila of filas ?? []) {
    const etapa = etapaById.get(fila.obra_compra_etapa_id);
    if (!etapa || !fila.material_id) continue;
    const lista = porMaterial.get(fila.material_id) ?? [];
    // `filaId` es la fila de obra_compra_etapa_materiales: sirve para poder
    // quitar/mover el material sin volver a buscarlo.
    lista.push({ ...etapa, filaId: fila.id, cantidad: fila.cantidad, unidad: fila.unidad });
    porMaterial.set(fila.material_id, lista);
  }
  // Orden estable por `orden` de etapa: la primera que se muestra es siempre la
  // más temprana en el plan de compra.
  for (const lista of porMaterial.values()) lista.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  return { etapas, porMaterial };
}

/**
 * Manda un material de la matriz a una etapa de compra sin salir de la pantalla.
 * Respeta la unique (obra_compra_etapa_id, material_id): si ya estaba, no
 * duplica ni pisa su cantidad.
 */
export async function asignarMaterialAEtapa(etapaId, { materialId, cantidad = 1, unidad = null } = {}) {
  if (!etapaId) throw new Error("Falta la etapa de compra.");
  if (!materialId) throw new Error("Este item no está en el catálogo de pañol: no se puede asignar a una etapa.");
  const n = Number(cantidad);
  const { data: existente, error: existenteError } = await supabase
    .from("obra_compra_etapa_materiales")
    .select("id")
    .eq("obra_compra_etapa_id", etapaId)
    .eq("material_id", materialId)
    .maybeSingle();
  if (existenteError) throw existenteError;
  if (existente) return { status: "existente", id: existente.id };

  const { data, error } = await supabase
    .from("obra_compra_etapa_materiales")
    .insert({
      obra_compra_etapa_id: etapaId,
      material_id: materialId,
      cantidad: Number.isFinite(n) && n > 0 ? n : 1,
      unidad: unidad || null,
      origen: "manual",
    })
    .select("id")
    .single();
  // Otra pantalla pudo asignarlo entre el chequeo y el insert. En ese caso el
  // resultado seguro es tratarlo como existente, nunca pisar su cantidad.
  if (error?.code === "23505") return { status: "existente", id: null };
  if (error) throw error;
  return { status: "asignado", id: data?.id ?? null };
}

/**
 * Mueve UNA asignación existente a otra etapa conservando cantidad, unidad,
 * notas y origen. Si el mismo material ya está en destino no fusiona ni elimina
 * nada: devuelve conflicto para que la UI lo explique.
 */
export async function moverMaterialEntreEtapas(filaId, etapaDestinoId) {
  if (!filaId) throw new Error("Falta la asignación de origen.");
  if (!etapaDestinoId) throw new Error("Falta la etapa de destino.");

  const { data: origen, error: origenError } = await supabase
    .from("obra_compra_etapa_materiales")
    .select("id, obra_compra_etapa_id, material_id")
    .eq("id", filaId)
    .maybeSingle();
  if (origenError) throw origenError;
  if (!origen) throw new Error("La asignación ya no existe. Actualizá la pantalla.");
  if (origen.obra_compra_etapa_id === etapaDestinoId) return { status: "sin_cambios" };

  const { data: existente, error: existenteError } = await supabase
    .from("obra_compra_etapa_materiales")
    .select("id")
    .eq("obra_compra_etapa_id", etapaDestinoId)
    .eq("material_id", origen.material_id)
    .maybeSingle();
  if (existenteError) throw existenteError;
  if (existente) return { status: "conflicto_destino", id: existente.id };

  const { error } = await supabase
    .from("obra_compra_etapa_materiales")
    .update({ obra_compra_etapa_id: etapaDestinoId })
    .eq("id", filaId);
  if (error?.code === "23505") return { status: "conflicto_destino", id: null };
  if (error) throw error;
  return { status: "movido" };
}
