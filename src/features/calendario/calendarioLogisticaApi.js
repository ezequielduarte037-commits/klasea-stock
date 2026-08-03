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
    row.confirmado_por,
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
    confirmado_por_perfil: byId.get(row.confirmado_por) || null,
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
  const grupoId = objetivo.viaje_grupo_id || objetivo.id;
  const { error: targetError } = await supabase
    .from("calendario_eventos")
    .update({ viaje_grupo_id: grupoId, updated_by: profile.id })
    .eq("id", objetivo.id);
  fail(targetError);
  const { data, error } = await supabase
    .from("calendario_eventos")
    .update({
      viaje_grupo_id: grupoId,
      viaje_sugerido_id: objetivo.id,
      updated_by: profile.id,
    })
    .eq("id", row.id)
    .select()
    .single();
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
    estado: "confirmado",
    fecha: row.fecha_propuesta,
    hora: timeValue(row.hora_propuesta),
    fecha_confirmada: row.fecha_propuesta,
    hora_confirmada: timeValue(row.hora_propuesta),
    confirmado_por: profile.id,
    confirmado_at: new Date().toISOString(),
    updated_by: profile.id,
  } : {
    estado: "solicitado",
    fecha: row.fecha_solicitada,
    hora: timeValue(row.hora_solicitada),
    fecha_propuesta: null,
    hora_propuesta: null,
    propuesta_mensaje: "La fecha propuesta fue rechazada por el solicitante.",
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

export async function cargarHistorialMovimiento(eventoId) {
  const { data, error } = await supabase
    .from("calendario_eventos_historial")
    .select("*,actor:profiles(id,username)")
    .eq("evento_id", eventoId)
    .order("created_at", { ascending: false });
  fail(error);
  return data || [];
}
