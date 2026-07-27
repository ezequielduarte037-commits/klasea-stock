import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Etapas de COMPRA: las tandas en que se compra una obra.
//
//   Plantilla (por modelo)      Obra (casco real)
//   ─────────────────────       ─────────────────────
//   linea_compra_etapas    ──▶  obra_compra_etapas
//     └ _materiales                └ _materiales
//     └ _procesos (etiqueta)       └ _procesos (etiqueta)
//
// Los materiales viven DENTRO de la etapa de compra: se cargan ahí y se editan
// ahí. Las etapas de producción son una etiqueta opcional para saber para qué
// es cada compra — no definen qué se compra.
//
// Cada cambio queda auditado por trigger en compras_auditoria.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MATERIAL_SELECT =
  "material:panol_materiales(id, descripcion, codigo, unidad_medida, proveedor, categoria_id)";

export const COMPRA_ETAPA_ESTADOS = [
  { value: "pendiente", label: "Pendiente", color: "#a1a1aa" },
  { value: "en_compra", label: "En compra", color: "#f59e0b" },
  { value: "parcial", label: "Parcial", color: "#a78bfa" },
  { value: "completa", label: "Completa", color: "#10b981" },
  { value: "cancelada", label: "Cancelada", color: "#ef4444" },
];

const COLORES = ["#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];
export const colorSugerido = (i) => COLORES[i % COLORES.length];

async function actorId() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLANTILLA (por modelo)
   ═══════════════════════════════════════════════════════════════════════════ */

export async function fetchPlantillaCompra(lineaId) {
  if (!lineaId) return [];
  const { data, error } = await supabase
    .from("linea_compra_etapas")
    .select(
      "id, linea_id, nombre, descripcion, orden, color, activa, " +
        "procesos:linea_compra_etapa_procesos(linea_proceso_id), " +
        "materiales:linea_compra_etapa_materiales(id)"
    )
    .eq("linea_id", lineaId)
    .eq("activa", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    ...e,
    procesoIds: (e.procesos ?? []).map((p) => p.linea_proceso_id),
    totalMateriales: (e.materiales ?? []).length,
  }));
}

export async function crearEtapaPlantilla(lineaId, { nombre, descripcion = null, orden = 0, color = null } = {}) {
  if (!lineaId) throw new Error("Falta el modelo.");
  if (!nombre?.trim()) throw new Error("La etapa necesita un nombre.");
  const { data, error } = await supabase
    .from("linea_compra_etapas")
    .insert({
      linea_id: lineaId,
      nombre: nombre.trim(),
      descripcion: descripcion || null,
      orden: num(orden),
      color: color || colorSugerido(num(orden)),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarEtapaPlantilla(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.nombre !== undefined) clean.nombre = String(patch.nombre).trim();
  if (patch.descripcion !== undefined) clean.descripcion = patch.descripcion || null;
  if (patch.orden !== undefined) clean.orden = num(patch.orden);
  if (patch.color !== undefined) clean.color = patch.color || null;
  if (patch.activa !== undefined) clean.activa = !!patch.activa;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("linea_compra_etapas").update(clean).eq("id", id);
  if (error) throw error;
}

export async function borrarEtapaPlantilla(id) {
  if (!id) return;
  const { error } = await supabase.from("linea_compra_etapas").delete().eq("id", id);
  if (error) throw error;
}

export async function reordenarPlantilla(ids = []) {
  const res = await Promise.all(ids.map((id, i) => supabase.from("linea_compra_etapas").update({ orden: i }).eq("id", id)));
  const fallo = res.find((r) => r.error);
  if (fallo?.error) throw fallo.error;
}

export async function setProcesosPlantilla(compraEtapaId, procesoIds = []) {
  if (!compraEtapaId) return;
  const ids = [...new Set((procesoIds || []).filter(Boolean))];
  const { error: errDel } = await supabase
    .from("linea_compra_etapa_procesos").delete().eq("compra_etapa_id", compraEtapaId);
  if (errDel) throw errDel;
  if (!ids.length) return;
  const { error } = await supabase
    .from("linea_compra_etapa_procesos")
    .insert(ids.map((linea_proceso_id) => ({ compra_etapa_id: compraEtapaId, linea_proceso_id })));
  if (error) throw error;
}

/* ── Materiales de la plantilla ───────────────────────────────────────────── */

export async function fetchMaterialesPlantilla(compraEtapaId) {
  if (!compraEtapaId) return [];
  const { data, error } = await supabase
    .from("linea_compra_etapa_materiales")
    .select(`id, compra_etapa_id, material_id, cantidad, unidad, notas, linea_proceso_id, orden, ${MATERIAL_SELECT}`)
    .eq("compra_etapa_id", compraEtapaId)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function agregarMaterialesPlantilla(compraEtapaId, materiales = [], { lineaProcesoId = null } = {}) {
  if (!compraEtapaId) throw new Error("Falta la etapa.");
  const filas = (materiales || []).filter((m) => m?.id).map((m, i) => ({
    compra_etapa_id: compraEtapaId,
    material_id: m.id,
    cantidad: num(m.cantidad) || 1,
    unidad: m.unidad || m.unidad_medida || null,
    linea_proceso_id: lineaProcesoId || null,
    orden: i,
  }));
  if (!filas.length) return 0;
  const { error } = await supabase
    .from("linea_compra_etapa_materiales")
    .upsert(filas, { onConflict: "compra_etapa_id,material_id" });
  if (error) throw error;
  return filas.length;
}

export async function actualizarMaterialPlantilla(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.cantidad !== undefined) clean.cantidad = num(patch.cantidad);
  if (patch.unidad !== undefined) clean.unidad = patch.unidad || null;
  if (patch.notas !== undefined) clean.notas = patch.notas || null;
  if (patch.linea_proceso_id !== undefined) clean.linea_proceso_id = patch.linea_proceso_id || null;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("linea_compra_etapa_materiales").update(clean).eq("id", id);
  if (error) throw error;
}

export async function quitarMaterialPlantilla(id) {
  if (!id) return;
  const { error } = await supabase.from("linea_compra_etapa_materiales").delete().eq("id", id);
  if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OBRA
   ═══════════════════════════════════════════════════════════════════════════ */

export async function fetchEtapasCompraObra(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("obra_compra_etapas")
    .select(
      "id, obra_id, origen_id, nombre, descripcion, orden, color, estado, fecha_objetivo, created_at, " +
        "procesos:obra_compra_etapa_procesos(linea_proceso_id), " +
        "materiales:obra_compra_etapa_materiales(id)"
    )
    .eq("obra_id", obraId)
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    ...e,
    procesoIds: (e.procesos ?? []).map((p) => p.linea_proceso_id),
    totalMateriales: (e.materiales ?? []).length,
  }));
}

export async function crearEtapaCompraObra(obraId, { nombre, descripcion = null, orden = 0, color = null, fecha_objetivo = null } = {}) {
  if (!obraId) throw new Error("Falta la obra.");
  if (!nombre?.trim()) throw new Error("La etapa necesita un nombre.");
  const { data, error } = await supabase
    .from("obra_compra_etapas")
    .insert({
      obra_id: obraId,
      nombre: nombre.trim(),
      descripcion: descripcion || null,
      orden: num(orden),
      color: color || colorSugerido(num(orden)),
      fecha_objetivo: fecha_objetivo || null,
      created_by: await actorId(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarEtapaCompraObra(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.nombre !== undefined) clean.nombre = String(patch.nombre).trim();
  if (patch.descripcion !== undefined) clean.descripcion = patch.descripcion || null;
  if (patch.orden !== undefined) clean.orden = num(patch.orden);
  if (patch.color !== undefined) clean.color = patch.color || null;
  if (patch.estado !== undefined) clean.estado = patch.estado;
  if (patch.fecha_objetivo !== undefined) clean.fecha_objetivo = patch.fecha_objetivo || null;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("obra_compra_etapas").update(clean).eq("id", id);
  if (error) throw error;
}

export async function borrarEtapaCompraObra(id) {
  if (!id) return;
  const { error } = await supabase.from("obra_compra_etapas").delete().eq("id", id);
  if (error) throw error;
}

export async function reordenarEtapasCompraObra(ids = []) {
  const res = await Promise.all(ids.map((id, i) => supabase.from("obra_compra_etapas").update({ orden: i }).eq("id", id)));
  const fallo = res.find((r) => r.error);
  if (fallo?.error) throw fallo.error;
}

export async function setProcesosEtapaCompra(obraCompraEtapaId, procesoIds = []) {
  if (!obraCompraEtapaId) return;
  const ids = [...new Set((procesoIds || []).filter(Boolean))];
  const { error: errDel } = await supabase
    .from("obra_compra_etapa_procesos").delete().eq("obra_compra_etapa_id", obraCompraEtapaId);
  if (errDel) throw errDel;
  if (!ids.length) return;
  const { error } = await supabase
    .from("obra_compra_etapa_procesos")
    .insert(ids.map((linea_proceso_id) => ({ obra_compra_etapa_id: obraCompraEtapaId, linea_proceso_id })));
  if (error) throw error;
}

/* ── Materiales de la etapa de la obra ────────────────────────────────────── */

export async function fetchMaterialesEtapa(obraCompraEtapaId) {
  if (!obraCompraEtapaId) return [];
  const { data, error } = await supabase
    .from("obra_compra_etapa_materiales")
    .select(`id, obra_compra_etapa_id, material_id, cantidad, unidad, notas, linea_proceso_id, orden, origen, ${MATERIAL_SELECT}`)
    .eq("obra_compra_etapa_id", obraCompraEtapaId)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function agregarMaterialesEtapa(obraCompraEtapaId, materiales = [], { lineaProcesoId = null, origen = "manual" } = {}) {
  if (!obraCompraEtapaId) throw new Error("Falta la etapa.");
  const filas = (materiales || []).filter((m) => m?.id).map((m, i) => ({
    obra_compra_etapa_id: obraCompraEtapaId,
    material_id: m.id,
    cantidad: num(m.cantidad) || 1,
    unidad: m.unidad || m.unidad_medida || null,
    linea_proceso_id: lineaProcesoId || null,
    orden: i,
    origen,
  }));
  if (!filas.length) return 0;
  const { error } = await supabase
    .from("obra_compra_etapa_materiales")
    .upsert(filas, { onConflict: "obra_compra_etapa_id,material_id" });
  if (error) throw error;
  return filas.length;
}

export async function actualizarMaterialEtapa(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.cantidad !== undefined) clean.cantidad = num(patch.cantidad);
  if (patch.unidad !== undefined) clean.unidad = patch.unidad || null;
  if (patch.notas !== undefined) clean.notas = patch.notas || null;
  if (patch.linea_proceso_id !== undefined) clean.linea_proceso_id = patch.linea_proceso_id || null;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("obra_compra_etapa_materiales").update(clean).eq("id", id);
  if (error) throw error;
}

export async function quitarMaterialEtapa(id) {
  if (!id) return;
  const { error } = await supabase.from("obra_compra_etapa_materiales").delete().eq("id", id);
  if (error) throw error;
}

// Trae los materiales de otra etapa de compra (de esta obra o de la plantilla)
// y los suma a la etapa destino. Sirve para arrancar una etapa parecida a otra.
export async function copiarMaterialesDeEtapa(destinoId, { desdeEtapaObraId = null, desdeEtapaPlantillaId = null } = {}) {
  if (!destinoId) throw new Error("Falta la etapa destino.");

  let origen = [];
  if (desdeEtapaObraId) origen = await fetchMaterialesEtapa(desdeEtapaObraId);
  else if (desdeEtapaPlantillaId) origen = await fetchMaterialesPlantilla(desdeEtapaPlantillaId);
  else throw new Error("Falta la etapa de origen.");

  if (!origen.length) throw new Error("Esa etapa no tiene materiales para copiar.");

  const filas = origen.map((m, i) => ({
    obra_compra_etapa_id: destinoId,
    material_id: m.material_id,
    cantidad: num(m.cantidad) || 1,
    unidad: m.unidad || null,
    notas: m.notas || null,
    linea_proceso_id: m.linea_proceso_id || null,
    orden: i,
    origen: "copia",
  }));

  const { error } = await supabase
    .from("obra_compra_etapa_materiales")
    .upsert(filas, { onConflict: "obra_compra_etapa_id,material_id" });
  if (error) throw error;
  return filas.length;
}

/* ── Copiar la plantilla del modelo a la obra ─────────────────────────────── */

// Copia etapas + materiales + etiquetas de proceso. No borra lo que ya haya:
// las etapas nuevas se agregan al final.
export async function copiarPlantillaAObra(obra) {
  if (!obra?.id) throw new Error("Falta la obra.");
  if (!obra.linea_id) throw new Error("La obra no tiene un modelo asociado.");

  const plantilla = await fetchPlantillaCompra(obra.linea_id);
  if (!plantilla.length) throw new Error("Este modelo todavía no tiene plantilla de etapas de compra.");

  const existentes = await fetchEtapasCompraObra(obra.id);
  const base = existentes.length;
  const uid = await actorId();

  const { data: creadas, error } = await supabase
    .from("obra_compra_etapas")
    .insert(plantilla.map((p, i) => ({
      obra_id: obra.id,
      origen_id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      orden: base + i,
      color: p.color,
      estado: "pendiente",
      created_by: uid,
    })))
    .select("id, origen_id");
  if (error) throw error;

  const links = [];
  for (const fila of creadas ?? []) {
    const origen = plantilla.find((p) => p.id === fila.origen_id);
    for (const pid of origen?.procesoIds ?? []) {
      links.push({ obra_compra_etapa_id: fila.id, linea_proceso_id: pid });
    }
  }
  if (links.length) {
    const { error: errLinks } = await supabase.from("obra_compra_etapa_procesos").insert(links);
    if (errLinks) throw errLinks;
  }

  // Los materiales de cada etapa de la plantilla, en un solo viaje.
  const { data: matsPlantilla } = await supabase
    .from("linea_compra_etapa_materiales")
    .select("compra_etapa_id, material_id, cantidad, unidad, notas, linea_proceso_id, orden")
    .in("compra_etapa_id", plantilla.map((p) => p.id));

  const filas = [];
  for (const fila of creadas ?? []) {
    for (const m of (matsPlantilla ?? []).filter((x) => x.compra_etapa_id === fila.origen_id)) {
      filas.push({
        obra_compra_etapa_id: fila.id,
        material_id: m.material_id,
        cantidad: num(m.cantidad) || 1,
        unidad: m.unidad,
        notas: m.notas,
        linea_proceso_id: m.linea_proceso_id,
        orden: m.orden ?? 0,
        origen: "plantilla",
      });
    }
  }
  if (filas.length) {
    const { error: errMats } = await supabase.from("obra_compra_etapa_materiales").insert(filas);
    if (errMats) throw errMats;
  }

  return { etapas: creadas?.length ?? 0, materiales: filas.length };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDITORÍA
   ═══════════════════════════════════════════════════════════════════════════ */

// Historial completo de una etapa (o de una etapa de plantilla).
export async function fetchHistorial({ obraCompraEtapaId = null, compraEtapaId = null, limit = 60 } = {}) {
  let query = supabase
    .from("compras_auditoria")
    .select("id, accion, descripcion, actor_nombre, created_at, tabla")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (obraCompraEtapaId) query = query.eq("obra_compra_etapa_id", obraCompraEtapaId);
  else if (compraEtapaId) query = query.eq("compra_etapa_id", compraEtapaId);
  else return [];

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Último cambio de varias etapas de una sola query, para la línea del pie.
export async function fetchUltimosCambios(etapaIds = []) {
  const ids = [...new Set((etapaIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("compras_auditoria")
    .select("obra_compra_etapa_id, descripcion, actor_nombre, created_at")
    .in("obra_compra_etapa_id", ids)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return new Map();
  const mapa = new Map();
  for (const row of data ?? []) {
    if (!mapa.has(row.obra_compra_etapa_id)) mapa.set(row.obra_compra_etapa_id, row);
  }
  return mapa;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PEDIDO
   ═══════════════════════════════════════════════════════════════════════════ */

export async function pedidosDeEtapaCompra(obraCompraEtapaId) {
  if (!obraCompraEtapaId) return [];
  const { data, error } = await supabase
    .from("pedidos_produccion")
    .select("id, titulo, estado, created_at")
    .eq("obra_compra_etapa_id", obraCompraEtapaId)
    .neq("estado", "cancelado")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Arma el pedido itemizado con los materiales cargados en la etapa.
export async function generarPedidoDesdeEtapaCompra(obra, etapaCompra, procesosById = new Map()) {
  if (!obra?.id) throw new Error("Falta la obra.");
  if (!etapaCompra?.id) throw new Error("Falta la etapa de compra.");

  const materiales = (await fetchMaterialesEtapa(etapaCompra.id)).filter((m) => num(m.cantidad) > 0);
  if (!materiales.length) {
    throw new Error(`"${etapaCompra.nombre}" no tiene materiales cargados. Agregá los materiales antes de generar el pedido.`);
  }

  const { data: pedido, error: errPed } = await supabase
    .from("pedidos_produccion")
    .insert({
      obra_id: obra.id,
      obra_compra_etapa_id: etapaCompra.id,
      titulo: `${etapaCompra.nombre} — ${obra.codigo || obra.descripcion || "obra"}`,
      obra_codigo: obra.codigo ?? null,
      etapa_nombre: etapaCompra.nombre,
      estado: "pendiente",
      created_by: await actorId(),
    })
    .select("*")
    .single();
  if (errPed) throw errPed;

  const items = materiales.map((m, i) => {
    const proc = m.linea_proceso_id ? procesosById.get(m.linea_proceso_id) : null;
    return {
      pedido_id: pedido.id,
      material_id: m.material_id,
      descripcion: m.material?.descripcion || "Material",
      codigo: m.material?.codigo || null,
      cantidad: num(m.cantidad),
      unidad: m.unidad || m.material?.unidad_medida || null,
      notas: m.notas || null,
      orden: i,
      estado: "pendiente",
      origen_proceso_id: m.linea_proceso_id || null,
      // El nombre se congela en el item: si mañana renombran la etapa, el pedido
      // histórico sigue diciendo para qué se compró.
      origen_etapa_nombre: proc?.nombre || null,
    };
  });

  const { error: errItems } = await supabase.from("pedidos_produccion_items").insert(items);
  if (errItems) throw errItems;

  await actualizarEtapaCompraObra(etapaCompra.id, { estado: "en_compra" });

  return { pedido, cantidad: items.length };
}
