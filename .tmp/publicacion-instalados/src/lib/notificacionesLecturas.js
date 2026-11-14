function fechaPrecisa(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const iso = new Date(milliseconds).toISOString();
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  // PostgreSQL conserva microsegundos: convertir sólo con Date.toISOString
  // recortaría una versión y el servidor podría volver a enviar un push leído.
  return fraction?.length > 3 ? iso.replace(/\.\d{3}Z$/, `.${fraction}Z`) : iso;
}

function ordenFecha(value) {
  const iso = fechaPrecisa(value);
  if (!iso) return null;
  const fraction = /\.(\d+)Z$/.exec(iso)?.[1] || "";
  return { milliseconds: Date.parse(iso), remainder: fraction.slice(3).padEnd(6, "0") };
}

export function compararFechasNotificacion(a, b) {
  const left = ordenFecha(a);
  const right = ordenFecha(b);
  if (left == null || right == null) return NaN;
  if (left.milliseconds !== right.milliseconds) return left.milliseconds > right.milliseconds ? 1 : -1;
  return left.remainder === right.remainder ? 0 : left.remainder > right.remainder ? 1 : -1;
}

/** Lecturas por entidad y versión: leer un movimiento no oculta su próxima novedad. */
export function normalizarLecturas(value) {
  const entries = Array.isArray(value)
    ? value.map((row) => [row?.clave, row?.leida_hasta])
    : value && typeof value === "object" ? Object.entries(value) : [];
  return Object.fromEntries(entries.filter(([clave, fecha]) => typeof clave === "string"
    && clave.length <= 200 && clave.includes(":") && fechaPrecisa(fecha))
    .map(([clave, fecha]) => [clave, fechaPrecisa(fecha)]));
}

/** La marca de lectura nunca retrocede al sincronizar un celular atrasado. */
export function mergeLecturas(...maps) {
  const result = {};
  for (const map of maps) {
    for (const [clave, fecha] of Object.entries(normalizarLecturas(map))) {
      if (!result[clave] || compararFechasNotificacion(fecha, result[clave]) > 0) result[clave] = fecha;
    }
  }
  return result;
}

export function lecturasParaSincronizar(local, servidor) {
  const remoto = normalizarLecturas(servidor);
  return Object.entries(normalizarLecturas(local))
    .filter(([clave, fecha]) => !remoto[clave] || compararFechasNotificacion(fecha, remoto[clave]) > 0)
    .map(([clave, leida_hasta]) => ({ clave, leida_hasta }));
}

export function notificacionLeida(notificacion, lecturas) {
  const hasta = lecturas?.[notificacion.clave];
  return !!hasta && compararFechasNotificacion(notificacion.fecha, hasta) <= 0;
}

/** El enlace del push sólo acusa lectura en la cuenta a la que fue enviado. */
export function lecturaDesdePush(url, userId, ahora = Date.now()) {
  const clave = url.searchParams.get("_push_clave");
  const rawFecha = url.searchParams.get("_push_fecha");
  const destinatario = url.searchParams.get("_push_user");
  if (!userId || destinatario !== userId
    || !/^(recepcion|produccion|compra|aviso|logistica):[a-zA-Z0-9_-]{1,160}$/.test(clave || "")) return null;
  const fecha = Date.parse(rawFecha);
  if (!Number.isFinite(fecha) || fecha > ahora + 5 * 60 * 1000) return null;
  const precisa = fechaPrecisa(rawFecha);
  return precisa ? { clave, fecha: precisa } : null;
}
