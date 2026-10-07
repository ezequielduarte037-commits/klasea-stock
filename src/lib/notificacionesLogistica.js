const ESTADOS_COORDINACION = ["solicitado", "fecha_aceptada"];
const ESTADOS_SOLICITANTE = ["fecha_propuesta", "confirmado", "realizado", "cancelado"];
const ESTADOS_OPERATIVOS = ["confirmado", "realizado", "cancelado"];
const TIPOS_OPERATIVOS = ["desmolde", "traslado", "botadura", "entrega", "entrega_material"];
const ACTIVIDAD_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
// Igual que el push: el hito dice qué es, no sólo "movimiento".
const TITULOS_HITO = {
  desmolde: "Desmolde programado", botadura: "Botadura programada", entrega: "Entrega programada",
  entrega_material: "Entrega de material programada", traslado: "Traslado programado",
};

function rolDe(profile) {
  return String(profile?.role || "").trim().toLowerCase();
}

function esAdmin(profile) {
  return !!profile?.is_admin || rolDe(profile) === "admin";
}

/** Misma regla que el calendario: Admin (rol o permiso explícito) y Compras coordinan Logística. */
export function esCoordinadorLogistica(profile) {
  return rolDe(profile) !== "cliente" && (esAdmin(profile) || rolDe(profile) === "compras");
}

export function puedeVerLogistica(profile) {
  if (rolDe(profile) === "cliente") return false;
  return esAdmin(profile) || ["compras", "tecnica", "administracion"].includes(rolDe(profile));
}

/** La fecha y el autor de la acción, sin convertir una edición de costos en otra confirmación. */
export function accionLogistica(movement) {
  if (movement.logistica_notificada_at) {
    return {
      fecha: movement.logistica_notificada_at,
      autor: movement.logistica_notificada_por,
      cambio: movement.logistica_cambio || movement.estado,
    };
  }
  const campos = {
    fecha_propuesta: ["propuesta_at", "propuesta_por"],
    fecha_aceptada: ["aceptado_at", "aceptado_por"],
    confirmado: ["confirmado_at", "confirmado_por"],
    realizado: ["completado_at", "updated_by"],
  };
  const [fechaCampo, autorCampo] = campos[movement.estado] || [];
  if (fechaCampo && movement[fechaCampo]) {
    return { fecha: movement[fechaCampo], autor: movement[autorCampo], cambio: movement.estado };
  }
  return {
    fecha: movement.updated_at || movement.created_at,
    autor: movement.updated_by,
    cambio: movement.clase === "evento" ? "movimiento" : movement.estado,
  };
}

/** Misma regla que el push: confirmada alguna vez (o cargada directo en el calendario). */
function estuvoEnAgenda(movement) {
  return movement.clase === "evento" || movement.estado === "confirmado"
    || !!movement.confirmado_at || !!movement.fecha_confirmada;
}

export function audienciaLogistica(movement, profile) {
  if (!movement) return { ok: false, why: "sin-movimiento" };
  if (!profile?.id || !puedeVerLogistica(profile)) return { ok: false, why: "sin-acceso" };
  const propio = movement.created_by === profile.id;
  const { autor } = accionLogistica(movement);
  if (autor && autor === profile.id) return { ok: false, why: "accion-propia" };

  // La relación de solicitante también vale para Admin y Compras.
  if (propio && ESTADOS_SOLICITANTE.includes(movement.estado)) {
    return { ok: true, why: "solicitante" };
  }
  if (!propio && esCoordinadorLogistica(profile) && ESTADOS_COORDINACION.includes(movement.estado)) {
    return { ok: true, why: "cola-logistica" };
  }
  if (esAdmin(profile) && ESTADOS_SOLICITANTE.includes(movement.estado)) {
    return { ok: true, why: "actividad-logistica" };
  }
  // Quien coordina sigue los cierres aunque la solicitud no se haya confirmado.
  if (esCoordinadorLogistica(profile) && ["realizado", "cancelado"].includes(movement.estado)) {
    return { ok: true, why: "actividad-logistica" };
  }
  // Un movimiento confirmado puede servir a otros equipos para sumarse al
  // viaje o preparar la obra. Técnica y Administración ven la agenda común,
  // incluyendo movimientos cargados directamente por Compras. Una solicitud
  // cancelada antes de confirmarse nunca estuvo en esa agenda: no es novedad.
  if ((ESTADOS_OPERATIVOS.includes(movement.estado) && estuvoEnAgenda(movement))
      || (movement.clase === "evento" && TIPOS_OPERATIVOS.includes(movement.tipo))) {
    return { ok: true, why: "agenda-operativa" };
  }
  return { ok: false, why: "sin-interes" };
}

export function gravedadLogistica(movement = {}) {
  if ([...ESTADOS_COORDINACION, "fecha_propuesta"].includes(movement.estado)) return "warning";
  if (["confirmado", "realizado"].includes(movement.estado)) return "success";
  return "info";
}

export function notificacionLogistica(movement, profile) {
  const audiencia = audienciaLogistica(movement, profile);
  if (!audiencia.ok) return null;
  const titulos = {
    solicitado: "Nueva solicitud logística",
    fecha_aceptada: "El solicitante aceptó la fecha",
    fecha_propuesta: "Nueva propuesta de fecha",
    confirmado: "Movimiento confirmado",
    realizado: "Movimiento realizado",
    cancelado: "Movimiento cancelado",
    reprogramado: "Movimiento reprogramado",
    movimiento: "Movimiento programado",
  };
  const accion = accionLogistica(movement);
  const requiereAccion = ESTADOS_COORDINACION.includes(movement.estado)
    || (movement.estado === "fecha_propuesta" && movement.created_by === profile.id);
  return {
    clave: `logistica:${movement.id}`,
    tipo: "logistica",
    gravedad: movement.estado === "fecha_propuesta" && !requiereAccion ? "info" : gravedadLogistica(movement),
    titulo: (accion.cambio === "movimiento" && TITULOS_HITO[movement.tipo])
      || titulos[accion.cambio] || titulos[movement.estado] || "Movimiento actualizado",
    detalle: detalleLogistica(movement),
    actor: null,
    fecha: accion.fecha,
    ruta: `/calendario?open=${encodeURIComponent(movement.id)}`,
    requiereAccion,
    why: audiencia.why,
    meta: { movement },
  };
}

/** El aviso explica cuándo y dónde, también sin abrir el calendario. */
export function detalleLogistica(movement, ahora = Date.now()) {
  const transportes = {
    flete: "Flete", camion: "Camión", hidrogrua: "Hidrogrúa", grua: "Grúa", otro: "Transporte",
  };
  const recursos = Array.isArray(movement.transportes) && movement.transportes.length
    ? movement.transportes : [{ tipo: movement.tipo_transporte, cantidad: 1 }];
  const nombres = [...new Set(recursos.filter((row) => transportes[row?.tipo]).map((row) => {
    const cantidad = Number(row.cantidad) || 1;
    return `${transportes[row.tipo]}${cantidad > 1 ? ` ×${cantidad}` : ""}`;
  }))];
  const enPropuesta = ["fecha_propuesta", "fecha_aceptada"].includes(movement.estado);
  // Mismo orden que el calendario y que el push: lo confirmado manda.
  const fecha = enPropuesta
    ? movement.fecha_propuesta || movement.fecha_solicitada || movement.fecha
    : movement.fecha_confirmada || movement.fecha_solicitada || movement.fecha;
  const hora = enPropuesta
    ? movement.hora_propuesta || movement.hora_solicitada || movement.hora
    : movement.hora_confirmada || movement.hora_solicitada || movement.hora;
  const dia = diaRelativo(fecha, ahora);
  const lugares = (Array.isArray(movement.paradas) ? movement.paradas : [])
    .map((parada) => String(parada?.lugar || parada?.direccion || "").trim()).filter(Boolean);
  return [
    movement.carga || movement.titulo || "Movimiento",
    movement.obra || "",
    dia ? `${dia}${hora ? ` ${String(hora).slice(0, 5)}` : " · horario a coordinar"}` : "",
    nombres.join(" + "),
    [...new Set(lugares)].join(" → "),
  ].filter(Boolean).join(" · ");
}

/** "Hoy", "Mañana" o dd/mm, contando el día en Buenos Aires (sin pasar por UTC). */
export function diaRelativo(fecha, ahora = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return "";
  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${diaBuenosAires(ahora)}T00:00:00Z`)) / 86_400_000);
  return dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

const SELECT_LOGISTICA = `
  id,clase,tipo,carga,titulo,obra,estado,fecha,hora,fecha_solicitada,fecha_propuesta,fecha_confirmada,
  hora_solicitada,hora_propuesta,hora_confirmada,tipo_transporte,transportes,paradas,prioridad,proveedor_logistico,
  created_by,updated_by,updated_at,created_at,
  propuesta_por,propuesta_at,aceptado_por,aceptado_at,confirmado_por,confirmado_at,completado_at
`;
const SELECT_LOGISTICA_CON_MARCA = `${SELECT_LOGISTICA},logistica_notificada_at,logistica_notificada_por,logistica_cambio`;

function faltaMarcaLogistica(error) {
  return ["logistica_notificada_at", "logistica_notificada_por", "logistica_cambio"]
    .some((campo) => String(error?.message || "").includes(campo));
}

function diaBuenosAires(ahora) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(ahora));
  const get = (tipo) => parts.find((parte) => parte.type === tipo)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Consulta separada para que las confirmaciones propias no desplacen la cola a coordinar. */
export async function cargarAvisosLogistica(client, profile, ahora = Date.now()) {
  if (!profile?.id || !puedeVerLogistica(profile)) return [];
  const desde = new Date(ahora - ACTIVIDAD_LOOKBACK_MS).toISOString();
  const hoy = diaBuenosAires(ahora);
  const consultar = (select) => {
    const base = (clase = "solicitud_logistica") => client.from("calendario_eventos")
      .select(select)
      .eq("clase", clase)
      .order("updated_at", { ascending: false })
      .limit(80);
    const queries = [base().eq("created_by", profile.id).in("estado", ESTADOS_SOLICITANTE)];
    if (esCoordinadorLogistica(profile)) {
      queries.push(base().in("estado", ESTADOS_COORDINACION)
        .or(`created_by.neq.${profile.id},created_by.is.null`));
    }
    queries.push(base().in("estado", esAdmin(profile) ? ESTADOS_SOLICITANTE : ESTADOS_OPERATIVOS)
      .or(`created_by.neq.${profile.id},created_by.is.null`)
      .or(`updated_at.gte.${desde},fecha.gte.${hoy}`));
    queries.push(base("evento").in("tipo", TIPOS_OPERATIVOS)
      .or(`updated_at.gte.${desde},fecha.gte.${hoy}`));
    return Promise.all(queries);
  };
  let resultados = await consultar(SELECT_LOGISTICA_CON_MARCA);
  let error = resultados.find((resultado) => resultado.error)?.error;
  if (error && faltaMarcaLogistica(error)) {
    resultados = await consultar(SELECT_LOGISTICA);
    error = resultados.find((resultado) => resultado.error)?.error;
  }
  if (error) throw error;
  const unicos = new Map(resultados.flatMap(({ data }) => data || []).map((row) => [row.id, row]));
  return [...unicos.values()]
    .filter((row) => audienciaLogistica(row, profile).ok)
    .filter((row) => {
      if (ESTADOS_COORDINACION.includes(row.estado) || row.estado === "fecha_propuesta") return true;
      // Las fechas futuras siguen visibles aunque se hayan coordinado hace
      // más de 14 días. Editar el costo de un viaje antiguo no lo revive.
      return Date.parse(accionLogistica(row).fecha) >= ahora - ACTIVIDAD_LOOKBACK_MS || row.fecha >= hoy;
    })
    .sort((a, b) => new Date(accionLogistica(b).fecha || 0) - new Date(accionLogistica(a).fecha || 0));
}
