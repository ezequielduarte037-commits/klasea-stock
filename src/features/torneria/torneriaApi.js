import { supabase } from "@/supabaseClient";

const ok = (result) => {
  if (result.error) throw result.error;
  return result.data ?? [];
};

const inQuery = async (table, column, ids, select = "*", order = null) => {
  if (!ids.length) return [];
  let query = supabase.from(table).select(select).in(column, ids);
  if (order) query = query.order(order.column, order.options);
  return ok(await query);
};

export async function fetchTorneriaContexto() {
  const [obrasRes, plantillasRes] = await Promise.all([
    supabase
      .from("produccion_obras")
      .select("id,codigo,descripcion,estado,linea_id,linea_nombre,created_at")
      .in("estado", ["activa", "pausada"])
      .order("codigo"),
    supabase
      .from("torneria_plantillas")
      .select("id,linea_id,nombre,descripcion,activa,linea:lineas_produccion(id,nombre)")
      .eq("activa", true)
      .order("nombre"),
  ]);

  return {
    obras: ok(obrasRes),
    plantillas: ok(plantillasRes),
  };
}

export async function fetchTorneriaProcesos() {
  const procesos = ok(await supabase
    .from("torneria_procesos")
    .select(`
      *,
      obra:produccion_obras(id,codigo,descripcion,estado,linea_id,linea_nombre),
      plantilla:torneria_plantillas(id,nombre,linea_id)
    `)
    .order("updated_at", { ascending: false }));

  const procesoIds = procesos.map((row) => row.id);
  if (!procesoIds.length) return [];

  const [items, operaciones, historial] = await Promise.all([
    inQuery(
      "torneria_items",
      "proceso_id",
      procesoIds,
      "*,material:panol_materiales(id,codigo,descripcion,proveedor,unidad_medida,categoria_id)",
      { column: "orden", options: { ascending: true } },
    ),
    inQuery(
      "torneria_operaciones",
      "proceso_id",
      procesoIds,
      "*",
      { column: "orden", options: { ascending: true } },
    ),
    inQuery(
      "torneria_historial",
      "proceso_id",
      procesoIds,
      "*,actor:profiles(id,username)",
      { column: "created_at", options: { ascending: false } },
    ),
  ]);

  const operacionIds = operaciones.map((row) => row.id);
  const [componentes, movimientos] = await Promise.all([
    inQuery("torneria_operacion_items", "operacion_id", operacionIds),
    inQuery(
      "torneria_movimientos",
      "operacion_id",
      operacionIds,
      "*",
      { column: "fecha", options: { ascending: false } },
    ),
  ]);

  const movimientoIds = movimientos.map((row) => row.id);
  const [movimientoItems, archivos] = await Promise.all([
    inQuery("torneria_movimiento_items", "movimiento_id", movimientoIds),
    inQuery(
      "torneria_archivos",
      "movimiento_id",
      movimientoIds,
      "*",
      { column: "created_at", options: { ascending: false } },
    ),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const movItemsByMov = new Map();
  movimientoItems.forEach((row) => {
    const list = movItemsByMov.get(row.movimiento_id) ?? [];
    list.push(row);
    movItemsByMov.set(row.movimiento_id, list);
  });
  const filesByMov = new Map();
  archivos.forEach((row) => {
    const list = filesByMov.get(row.movimiento_id) ?? [];
    list.push(row);
    filesByMov.set(row.movimiento_id, list);
  });

  const movimientosByOp = new Map();
  movimientos.forEach((mov) => {
    const list = movimientosByOp.get(mov.operacion_id) ?? [];
    list.push({
      ...mov,
      items: movItemsByMov.get(mov.id) ?? [],
      archivos: filesByMov.get(mov.id) ?? [],
    });
    movimientosByOp.set(mov.operacion_id, list);
  });

  const componentesByOp = new Map();
  componentes.forEach((componente) => {
    const list = componentesByOp.get(componente.operacion_id) ?? [];
    list.push({ ...componente, item: itemById.get(componente.item_id) ?? null });
    componentesByOp.set(componente.operacion_id, list);
  });

  const itemsByProceso = new Map();
  items.forEach((item) => {
    const list = itemsByProceso.get(item.proceso_id) ?? [];
    list.push(item);
    itemsByProceso.set(item.proceso_id, list);
  });

  const operacionesByProceso = new Map();
  operaciones.forEach((operacion) => {
    const list = operacionesByProceso.get(operacion.proceso_id) ?? [];
    list.push({
      ...operacion,
      componentes: componentesByOp.get(operacion.id) ?? [],
      movimientos: movimientosByOp.get(operacion.id) ?? [],
    });
    operacionesByProceso.set(operacion.proceso_id, list);
  });

  const historialByProceso = new Map();
  historial.forEach((evento) => {
    const list = historialByProceso.get(evento.proceso_id) ?? [];
    list.push(evento);
    historialByProceso.set(evento.proceso_id, list);
  });

  return procesos.map((proceso) => ({
    ...proceso,
    items: itemsByProceso.get(proceso.id) ?? [],
    operaciones: operacionesByProceso.get(proceso.id) ?? [],
    historial: historialByProceso.get(proceso.id) ?? [],
  }));
}

export async function crearProcesoTorneria({ obraId, plantillaId = null }) {
  const { data, error } = await supabase.rpc("torneria_crear_proceso", {
    p_obra_id: obraId,
    p_plantilla_id: plantillaId || null,
  });
  if (error) throw error;
  return data;
}

export async function actualizarProceso(id, patch) {
  return ok(await supabase
    .from("torneria_procesos")
    .update(patch)
    .eq("id", id)
    .select()
    .single());
}

export async function actualizarItem(id, patch) {
  return ok(await supabase
    .from("torneria_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single());
}

// Vincula los items con el pedido a compras. A partir de acá compras trabaja en
// SU pantalla y el avance vuelve solo por trigger: nadie carga el estado dos
// veces.
//
// `vinculos` = [{ itemId, requestItemId }]. El id del ítem del pedido es lo que
// permite que la recepción en pañol —que es por ítem— mueva el estado y las
// fechas de ESE material. Si un ítem no se pudo emparejar queda con el vínculo a
// nivel pedido, que sigue funcionando aunque sea más grueso.
export async function vincularItemsAPedidoCompra(vinculos = [], purchaseRequestId) {
  const lista = vinculos.filter((row) => row?.itemId);
  if (!lista.length || !purchaseRequestId) return [];
  const results = await Promise.all(lista.map((row) => supabase
    .from("torneria_items")
    .update({
      purchase_request_id: purchaseRequestId,
      purchase_request_item_id: row.requestItemId || null,
      compra_estado: "solicitado",
    })
    .eq("id", row.itemId)
    .select("id,compra_estado,solicitado_at,purchase_request_id,purchase_request_item_id")
    .single()));
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  return results.map((result) => result.data);
}

// "No lleva": este barco no usa esta pieza. El trigger de la base se encarga de
// apagar los viajes que existían sólo por ella y de sacarla de las compras.
export async function marcarNoLleva(itemId, noLleva, motivo = null) {
  return ok(await supabase
    .from("torneria_items")
    .update({
      no_lleva: !!noLleva,
      no_lleva_motivo: noLleva ? (String(motivo || "").trim() || null) : null,
    })
    .eq("id", itemId)
    .select()
    .single());
}

function makeKey(description = "") {
  const base = String(description)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 38) || "material";
  return `${base}_${Date.now().toString(36)}`;
}

export async function crearItem(procesoId, fields) {
  const esResultado = !!fields.es_resultado;
  const payload = {
    proceso_id: procesoId,
    clave: makeKey(fields.descripcion),
    grupo: fields.grupo || "Otros",
    descripcion: fields.descripcion,
    cantidad: fields.cantidad || 1,
    unidad: fields.unidad || "unidad",
    proveedor_compra: fields.proveedor_compra || null,
    material_id: fields.material_id || null,
    solicitado_por_torneria: esResultado ? false : fields.solicitado_por_torneria !== false,
    compra_estado: esResultado ? "no_aplica" : fields.compra_estado || "pendiente_solicitud",
    requiere_confirmacion: !!fields.requiere_confirmacion,
    alerta: fields.alerta || null,
    notas: fields.notas || null,
    orden: fields.orden || 999,
    es_resultado: esResultado,
    resultado_de: esResultado ? fields.resultado_de || [] : [],
  };
  return ok(await supabase.from("torneria_items").insert(payload).select().single());
}

export async function archivarItem(id) {
  return actualizarItem(id, { activo: false });
}

export async function guardarOperacion({
  id = null,
  procesoId,
  fields,
  componentes = [],
}) {
  let operacion;
  const payload = {
    proceso_id: procesoId,
    clave: fields.clave || makeKey(fields.nombre),
    grupo: fields.grupo || "Otros",
    nombre: fields.nombre,
    tipo: fields.tipo || "torneria",
    viaje: fields.viaje ? Number(fields.viaje) : null,
    origen: fields.origen || "Astillero",
    destino: fields.destino || null,
    descripcion: fields.descripcion || null,
    depende_de: fields.depende_de || [],
    orden: Number(fields.orden) || 999,
    activa: fields.activa !== false,
  };

  if (id) {
    operacion = ok(await supabase
      .from("torneria_operaciones")
      .update(payload)
      .eq("id", id)
      .select()
      .single());
  } else {
    operacion = ok(await supabase
      .from("torneria_operaciones")
      .insert(payload)
      .select()
      .single());
  }

  const existentes = ok(await supabase
    .from("torneria_operacion_items")
    .select("*")
    .eq("operacion_id", operacion.id));
  const selectedIds = new Set(componentes.map((row) => row.item_id));
  const removibles = existentes.filter((row) => !selectedIds.has(row.item_id));
  const conMovimientos = removibles.filter(
    (row) => Number(row.cantidad_enviada) > 0 || Number(row.cantidad_recibida) > 0,
  );
  if (conMovimientos.length) {
    throw new Error("No se puede quitar una pieza que ya tiene salidas o recepciones registradas.");
  }
  if (removibles.length) {
    const { error } = await supabase
      .from("torneria_operacion_items")
      .delete()
      .in("id", removibles.map((row) => row.id));
    if (error) throw error;
  }

  if (componentes.length) {
    const rows = componentes.map((row) => ({
      operacion_id: operacion.id,
      item_id: row.item_id,
      cantidad_requerida: Number(row.cantidad_requerida) || 1,
    }));
    const { error } = await supabase
      .from("torneria_operacion_items")
      .upsert(rows, { onConflict: "operacion_id,item_id" });
    if (error) throw error;
  }
  return operacion;
}

export async function archivarOperacion(id) {
  return ok(await supabase
    .from("torneria_operaciones")
    .update({ activa: false })
    .eq("id", id)
    .select()
    .single());
}

export async function guardarMovimiento({
  id = null,
  operacionId,
  tipo,
  fecha,
  responsable,
  destino,
  remito,
  notas,
  items,
}) {
  const { data, error } = await supabase.rpc("torneria_guardar_movimiento", {
    p_movimiento_id: id || null,
    p_operacion_id: operacionId,
    p_tipo: tipo,
    p_fecha: fecha,
    p_responsable: responsable || "",
    p_destino: destino || "",
    p_remito: remito || "",
    p_notas: notas || "",
    p_items: items,
  });
  if (error) throw error;
  return data;
}

export async function eliminarMovimiento(movimiento, procesoId) {
  const { error: historyError } = await supabase.from("torneria_historial").insert({
    proceso_id: procesoId,
    entidad: "movimiento",
    entidad_id: movimiento.id,
    accion: "eliminado",
    detalle: { movimiento },
  });
  if (historyError) throw historyError;
  const { error } = await supabase
    .from("torneria_movimientos")
    .delete()
    .eq("id", movimiento.id);
  if (error) throw error;
}

export async function subirArchivosMovimiento({
  procesoId,
  movimientoId,
  files,
}) {
  const rows = [];
  for (const file of Array.from(files || [])) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `torneria/${procesoId}/${movimientoId}/${Date.now()}_${safe}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos")
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from("documentos").getPublicUrl(path);
    rows.push({
      movimiento_id: movimientoId,
      nombre: file.name,
      storage_path: path,
      url: publicData.publicUrl,
      mime_type: file.type || null,
      size_bytes: file.size || null,
    });
  }
  if (!rows.length) return [];
  return ok(await supabase.from("torneria_archivos").insert(rows).select());
}

export async function eliminarArchivo(archivo) {
  const { error: storageError } = await supabase.storage
    .from("documentos")
    .remove([archivo.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("torneria_archivos").delete().eq("id", archivo.id);
  if (error) throw error;
}


// Borra el seguimiento entero de una obra. Las tablas hijas (operaciones,
// items, movimientos, historial) cuelgan con `on delete cascade`, así que se van
// solas; lo único que hay que limpiar a mano son los archivos del storage,
// porque un bucket no participa del cascade de Postgres y quedarían huérfanos
// ocupando lugar para siempre.
export async function borrarProcesoTorneria(procesoId) {
  if (!procesoId) throw new Error("Falta el proceso.");

  // Los archivos cuelgan del MOVIMIENTO, no del proceso: hay que bajar por
  // operaciones → movimientos para juntar los paths antes de borrar.
  const { data: operaciones } = await supabase
    .from("torneria_operaciones")
    .select("id")
    .eq("proceso_id", procesoId);

  const opIds = (operaciones ?? []).map((o) => o.id);
  let paths = [];
  if (opIds.length) {
    const { data: movimientos } = await supabase
      .from("torneria_movimientos")
      .select("id")
      .in("operacion_id", opIds);
    const movIds = (movimientos ?? []).map((m) => m.id);
    if (movIds.length) {
      const { data: archivos } = await supabase
        .from("torneria_archivos")
        .select("storage_path")
        .in("movimiento_id", movIds);
      paths = (archivos ?? []).map((a) => a.storage_path).filter(Boolean);
    }
  }
  if (paths.length) {
    // Si falla el borrado de los archivos se sigue igual: es peor dejar el
    // proceso a medio borrar que dejar un archivo suelto en el bucket.
    try { await supabase.storage.from("documentos").remove(paths); } catch { /* huérfanos, no bloquean */ }
  }

  const { error } = await supabase.from("torneria_procesos").delete().eq("id", procesoId);
  if (error) throw error;
}
