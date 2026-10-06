const ESTADOS_COORDINACION = ["solicitado", "fecha_aceptada"];
const ESTADOS_SOLICITANTE = ["fecha_propuesta", "confirmado", "realizado", "cancelado"];
const ACTIVIDAD_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

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
function accionLogistica(movement) {
  const campos = {
    fecha_propuesta: ["propuesta_at", "propuesta_por"],
    fecha_aceptada: ["aceptado_at", "aceptado_por"],
    confirmado: ["confirmado_at", "confirmado_por"],
  };
  const [fechaCampo, autorCampo] = campos[movement.estado] || [];
  if (fechaCampo && movement[fechaCampo]) {
    return { fecha: movement[fechaCampo], autor: movement[autorCampo] };
  }
  return {
    fecha: movement.updated_at || movement.created_at,
    autor: movement.updated_by,
  };
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
  };
  const requiereAccion = ESTADOS_COORDINACION.includes(movement.estado)
    || (movement.estado === "fecha_propuesta" && movement.created_by === profile.id);
  return {
    clave: `logistica:${movement.id}`,
    tipo: "logistica",
    gravedad: movement.estado === "fecha_propuesta" && !requiereAccion ? "info" : gravedadLogistica(movement),
    titulo: titulos[movement.estado],
    detalle: `${movement.carga || movement.titulo || "Movimiento"}${movement.obra ? ` · ${movement.obra}` : ""}`,
    actor: null,
    fecha: accionLogistica(movement).fecha,
    ruta: `/calendario?open=${movement.id}`,
    requiereAccion,
    why: audiencia.why,
    meta: { movement },
  };
}

const SELECT_LOGISTICA = `
  id,carga,titulo,obra,estado,fecha,fecha_solicitada,fecha_propuesta,fecha_confirmada,
  hora_propuesta,hora_confirmada,tipo_transporte,proveedor_logistico,
  created_by,updated_by,updated_at,created_at,
  propuesta_por,propuesta_at,aceptado_por,aceptado_at,confirmado_por,confirmado_at
`;

/** Consulta separada para que las confirmaciones propias no desplacen la cola a coordinar. */
export async function cargarAvisosLogistica(client, profile, ahora = Date.now()) {
  if (!profile?.id || !puedeVerLogistica(profile)) return [];
  const base = () => client.from("calendario_eventos")
    .select(SELECT_LOGISTICA)
    .eq("clase", "solicitud_logistica")
    .order("updated_at", { ascending: false })
    .limit(30);
  const queries = [base().eq("created_by", profile.id).in("estado", ESTADOS_SOLICITANTE)];

  if (esCoordinadorLogistica(profile)) {
    queries.push(base().in("estado", ESTADOS_COORDINACION)
      .or(`created_by.neq.${profile.id},created_by.is.null`));
  }
  // Admin recibe la actividad reciente del módulo, además de su cola y solicitudes.
  // Las novedades cerradas tienen una ventana acotada como las de Compras.
  if (esAdmin(profile)) {
    queries.push(base().in("estado", ESTADOS_SOLICITANTE)
      .or(`created_by.neq.${profile.id},created_by.is.null`)
      .gte("updated_at", new Date(ahora - ACTIVIDAD_LOOKBACK_MS).toISOString()));
  }
  const resultados = await Promise.all(queries);
  const error = resultados.find((resultado) => resultado.error)?.error;
  if (error) throw error;
  const unicos = new Map(resultados.flatMap(({ data }) => data || []).map((row) => [row.id, row]));
  return [...unicos.values()]
    .filter((row) => audienciaLogistica(row, profile).ok)
    .sort((a, b) => new Date(accionLogistica(b).fecha || 0) - new Date(accionLogistica(a).fecha || 0));
}
