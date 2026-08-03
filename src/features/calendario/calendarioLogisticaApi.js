import { supabase } from "@/supabaseClient";

function fail(error) {
  if (error) throw error;
}

function timeValue(value) {
  return value ? String(value).slice(0, 5) : null;
}

function transportPayload(form) {
  const rows = (form.transportes || [])
    .filter((row) => row?.tipo && Number(row.cantidad) > 0)
    .map((row) => ({
      tipo: row.tipo,
      cantidad: Math.max(1, Number(row.cantidad) || 1),
      proveedor: String(row.proveedor || "").trim() || null,
    }));
  return rows.length ? rows : [{ tipo: form.tipoTransporte || "otro", cantidad: 1, proveedor: null }];
}

async function decorate(rows = []) {
  const ids = [...new Set(rows.flatMap((row) => [
    row.created_by,
    row.updated_by,
    row.propuesta_por,
    row.aceptado_por,
    row.confirmado_por,
    row.union_decidido_por,
    row.costo_updated_by,
  ]).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,role")
    .in("id", ids);
  fail(error);
  const byId = new Map((data || []).map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    solicitante: byId.get(row.created_by) || null,
    actualizado_por: byId.get(row.updated_by) || null,
    propuesto_por: byId.get(row.propuesta_por) || null,
    aceptado_por_perfil: byId.get(row.aceptado_por) || null,
    confirmado_por_perfil: byId.get(row.confirmado_por) || null,
    union_decidido_por_perfil: byId.get(row.union_decidido_por) || null,
    costo_por: byId.get(row.costo_updated_by) || null,
  }));
}

export async function listarMovimientosLogisticos({ desde, hasta } = {}) {
  let query = supabase
    .from("calendario_eventos")
    .select("*")
    .eq("clase", "solicitud_logistica")
    .order("fecha", { ascending: true })
    .order("hora", { ascending: true });
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  const { data, error } = await query;
  fail(error);
  return decorate(data || []);
}

export async function listarHitosCalendario({ desde, hasta } = {}) {
  let query = supabase
    .from("calendario_eventos")
    .select("id,fecha,hora,tipo,titulo,obra,notas")
    .eq("clase", "evento")
    .order("fecha", { ascending: true });
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function listarObrasActivas() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,estado")
    .neq("estado", "terminada")
    .order("codigo", { ascending: true });
  if (error) return [];
  return data || [];
}

export async function crearSolicitudLogistica(form, profile) {
  const fecha = form.fechaSolicitada;
  const transportes = transportPayload(form);
  const payload = {
    clase: "solicitud_logistica",
    estado: "solicitado",
    tipo: "traslado",
    tipo_transporte: transportes[0].tipo,
    transportes,
    modalidad: form.modalidad || "traslado",
    plantilla_codigo: form.plantillaCodigo || null,
    proveedor_logistico: null,
    titulo: form.carga.trim(),
    carga: form.carga.trim(),
    obra: form.obra.trim() || null,
    fecha,
    hora: timeValue(form.horaSolicitada),
    fecha_solicitada: fecha,
    hora_solicitada: timeValue(form.horaSolicitada),
    paradas: form.paradas,
    prioridad: form.urgente ? "urgente" : "normal",
    urgente_motivo: form.urgenteMotivo.trim() || null,
    notas: form.observaciones.trim() || null,
    viaje_sugerido_id: form.viajeSugeridoId || null,
    union_estado: form.viajeGrupoId ? "aceptada" : form.viajeSugeridoId ? "sugerida" : "sin_evaluar",
    created_by: profile.id,
    updated_by: profile.id,
  };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .insert(payload)
    .select()
    .single();
  fail(error);
  return data;
}

export async function crearMovimientoManualLogistica(form, profile) {
  const transportes = transportPayload({
    transportes: [{ tipo: form.tipoTransporte, cantidad: 1, proveedor: form.proveedor }],
  });
  const payload = {
    clase: "solicitud_logistica",
    estado: "confirmado",
    tipo: form.modalidad === "trabajo_en_sitio" ? "trabajo" : "traslado",
    origen_manual: true,
    tipo_transporte: transportes[0].tipo,
    proveedor_logistico: transportes[0].proveedor,
    transportes,
    modalidad: form.modalidad || "traslado",
    titulo: form.carga.trim(),
    carga: form.carga.trim(),
    obra: form.obra.trim() || null,
    fecha: form.fecha,
    hora: timeValue(form.hora),
    fecha_solicitada: form.fecha,
    hora_solicitada: timeValue(form.hora),
    fecha_confirmada: form.fecha,
    hora_confirmada: timeValue(form.hora),
    paradas: form.paradas,
    prioridad: "normal",
    notas: form.observaciones.trim() || null,
    costo: form.costo === "" ? null : Number(form.costo),
    moneda: form.moneda || "ARS",
    costo_detalle: form.costoDetalle.trim() || null,
    costo_updated_by: form.costo === "" ? null : profile.id,
    confirmado_por: profile.id,
    confirmado_at: new Date().toISOString(),
    created_by: profile.id,
    updated_by: profile.id,
  };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .insert(payload)
    .select()
    .single();
  fail(error);
  return data;
}

export async function agruparMovimientos(row, objetivo, profile) {
  void profile;
  const { error: decisionError } = await supabase.rpc("calendario_decidir_union", {
    p_evento_id: row.id,
    p_objetivo_id: objetivo.id,
    p_unir: true,
    p_observacion: null,
  });
  fail(decisionError);
  const { data, error } = await supabase.from("calendario_eventos").select().eq("id", row.id).single();
  fail(error);
  return data;
}

export async function rechazarUnionMovimientos(row, objetivo, observacion, profile) {
  void profile;
  const { error: decisionError } = await supabase.rpc("calendario_decidir_union", {
    p_evento_id: row.id,
    p_objetivo_id: objetivo.id,
    p_unir: false,
    p_observacion: String(observacion || "").trim() || null,
  });
  fail(decisionError);
  const { data, error } = await supabase.from("calendario_eventos").select().eq("id", row.id).single();
  fail(error);
  return data;
}

export async function actualizarSolicitudLogistica(id, form, profile) {
  const transportes = transportPayload(form);
  const payload = {
    tipo_transporte: transportes[0].tipo,
    transportes,
    modalidad: form.modalidad || "traslado",
    plantilla_codigo: form.plantillaCodigo || null,
    titulo: form.carga.trim(),
    carga: form.carga.trim(),
    obra: form.obra.trim() || null,
    fecha: form.fechaSolicitada,
    hora: timeValue(form.horaSolicitada),
    fecha_solicitada: form.fechaSolicitada,
    hora_solicitada: timeValue(form.horaSolicitada),
    paradas: form.paradas,
    prioridad: form.urgente ? "urgente" : "normal",
    urgente_motivo: form.urgenteMotivo.trim() || null,
    notas: form.observaciones.trim() || null,
    viaje_sugerido_id: form.viajeSugeridoId || null,
    union_estado: form.viajeGrupoId ? "aceptada" : form.viajeSugeridoId ? "sugerida" : "sin_evaluar",
    updated_by: profile.id,
  };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update(payload)
    .eq("id", id)
    .eq("estado", "solicitado")
    .select()
    .single();
  fail(error);
  return data;
}

export async function confirmarMovimiento(id, { transportes, fecha, hora, mensaje }, profile) {
  const resources = transportPayload({ transportes });
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update({
      estado: "confirmado",
      tipo_transporte: resources[0].tipo,
      proveedor_logistico: resources[0].proveedor,
      transportes: resources,
      fecha,
      hora: timeValue(hora),
      fecha_confirmada: fecha,
      hora_confirmada: timeValue(hora),
      propuesta_mensaje: mensaje || null,
      confirmado_por: profile.id,
      confirmado_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", id)
    .select()
    .single();
  fail(error);
  return data;
}

export async function proponerFechaMovimiento(id, { transportes, fecha, hora, mensaje }, profile) {
  const resources = transportPayload({ transportes });
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update({
      estado: "fecha_propuesta",
      tipo_transporte: resources[0].tipo,
      proveedor_logistico: resources[0].proveedor,
      transportes: resources,
      fecha,
      hora: timeValue(hora),
      fecha_propuesta: fecha,
      hora_propuesta: timeValue(hora),
      propuesta_mensaje: mensaje || null,
      propuesta_por: profile.id,
      propuesta_at: new Date().toISOString(),
      aceptado_por: null,
      aceptado_at: null,
      updated_by: profile.id,
    })
    .eq("id", id)
    .select()
    .single();
  fail(error);
  return data;
}

export async function responderFechaMovimiento(row, aceptar, profile) {
  const payload = aceptar ? {
    estado: "fecha_aceptada",
    fecha: row.fecha_propuesta,
    hora: timeValue(row.hora_propuesta),
    aceptado_por: profile.id,
    aceptado_at: new Date().toISOString(),
    updated_by: profile.id,
  } : {
    estado: "solicitado",
    fecha: row.fecha_solicitada,
    hora: timeValue(row.hora_solicitada),
    fecha_propuesta: null,
    hora_propuesta: null,
    propuesta_mensaje: "La fecha propuesta fue rechazada por el solicitante.",
    aceptado_por: null,
    aceptado_at: null,
    updated_by: profile.id,
  };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update(payload)
    .eq("id", row.id)
    .eq("created_by", profile.id)
    .eq("estado", "fecha_propuesta")
    .select()
    .single();
  fail(error);
  return data;
}

export async function confirmarFechaAceptadaMovimiento(row, profile) {
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update({
      estado: "confirmado",
      fecha: row.fecha_propuesta,
      hora: timeValue(row.hora_propuesta),
      fecha_confirmada: row.fecha_propuesta,
      hora_confirmada: timeValue(row.hora_propuesta),
      confirmado_por: profile.id,
      confirmado_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", row.id)
    .eq("estado", "fecha_aceptada")
    .select()
    .single();
  fail(error);
  return data;
}

export async function actualizarEstadoMovimiento(row, estado, profile) {
  const payload = {
    estado,
    updated_by: profile.id,
    ...(estado === "realizado" ? { completado_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update(payload)
    .eq("id", row.id)
    .select()
    .single();
  fail(error);
  return data;
}

export async function guardarCostoMovimiento(row, { costo, moneda, detalle }, profile) {
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update({
      costo: costo === "" ? null : Number(costo),
      moneda,
      costo_detalle: detalle.trim() || null,
      costo_updated_by: profile.id,
      updated_by: profile.id,
    })
    .eq("id", row.id)
    .select()
    .single();
  fail(error);
  return data;
}

export async function eliminarMovimientoLogistico(id) {
  const { data: archivos, error: filesError } = await supabase
    .from("calendario_eventos_archivos")
    .select("storage_path")
    .eq("evento_id", id);
  if (filesError && filesError.code !== "42P01") fail(filesError);

  const { data, error } = await supabase
    .from("calendario_eventos")
    .delete()
    .eq("id", id)
    .eq("clase", "solicitud_logistica")
    .select("id")
    .single();
  fail(error);

  const paths = (archivos || []).map((item) => item.storage_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from("documentos").remove(paths);
  }
  return data;
}

const LOGISTICS_FILE_MAX_BYTES = 50 * 1024 * 1024;
const LOGISTICS_FILE_MAX_COUNT = 10;

function safeFilePart(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function attachmentContentType(file) {
  const extension = String(file?.name || "").toLowerCase().split(".").pop();
  if (["html", "htm", "svg", "js", "mjs"].includes(extension)) return "application/octet-stream";
  return String(file?.type || "").trim() || "application/octet-stream";
}

export async function listarArchivosMovimiento(eventoId) {
  const { data, error } = await supabase
    .from("calendario_eventos_archivos")
    .select("*,autor:profiles!calendario_eventos_archivos_created_by_fkey(id,username,role)")
    .eq("evento_id", eventoId)
    .order("created_at", { ascending: false });
  if (error?.code === "42P01") return [];
  fail(error);
  return data || [];
}

export async function subirArchivosMovimiento(eventoId, files, categoria, profile) {
  const selected = Array.from(files || []);
  if (!selected.length) return [];
  if (selected.length > LOGISTICS_FILE_MAX_COUNT) {
    throw new Error(`Podés subir hasta ${LOGISTICS_FILE_MAX_COUNT} archivos por vez.`);
  }

  const uploaded = [];
  try {
    for (const file of selected) {
      if (Number(file.size || 0) > LOGISTICS_FILE_MAX_BYTES) {
        throw new Error(`“${file.name}” supera el límite de 50 MB.`);
      }
      const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `calendario-logistica/${eventoId}/${Date.now()}-${id}-${safeFilePart(file.name)}`;
      const mimeType = attachmentContentType(file);
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(path, file, { cacheControl: "3600", contentType: mimeType, upsert: false });
      fail(uploadError);
      uploaded.push({
        evento_id: eventoId,
        categoria: categoria || "otro",
        nombre: file.name,
        storage_path: path,
        url: supabase.storage.from("documentos").getPublicUrl(path).data.publicUrl,
        mime_type: mimeType,
        size_bytes: file.size || null,
        created_by: profile.id,
      });
    }

    const { data, error } = await supabase
      .from("calendario_eventos_archivos")
      .insert(uploaded)
      .select("*,autor:profiles!calendario_eventos_archivos_created_by_fkey(id,username,role)");
    fail(error);
    return data || [];
  } catch (error) {
    const paths = uploaded.map((item) => item.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from("documentos").remove(paths);
    throw error;
  }
}

export async function eliminarArchivoMovimiento(archivo) {
  const { error } = await supabase
    .from("calendario_eventos_archivos")
    .delete()
    .eq("id", archivo.id);
  fail(error);
  if (archivo.storage_path) {
    const { error: storageError } = await supabase.storage
      .from("documentos")
      .remove([archivo.storage_path]);
    fail(storageError);
  }
}

export async function cargarHistorialMovimiento(eventoId) {
  const { data, error } = await supabase
    .from("calendario_eventos_historial")
    .select("*,actor:profiles(id,username)")
    .eq("evento_id", eventoId)
    .order("created_at", { ascending: false });
  fail(error);
  return data || [];
}
