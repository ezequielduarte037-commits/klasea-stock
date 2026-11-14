import { esErrorReintentable } from "./mostradorLogica.js";

// Igual que el trigger de la base (20261010210000): hasta 72 h se conserva la
// hora real del retiro; más vieja, queda para regularizar.
export const PLAZO_ENVIO_MS = 72 * 60 * 60_000;
export const LEASE_MS = 45_000;

/** El margen evita cruzar el límite del trigger mientras viaja la solicitud. */
export function fechaRequiereRevision(envio, ahora = Date.now()) {
  return envio.filas.some((f) => {
    const fecha = Date.parse(f.created_at ?? envio.creadoAt);
    return !Number.isFinite(fecha) || ahora - fecha >= PLAZO_ENVIO_MS - 60_000 || fecha > ahora + 5 * 60_000;
  });
}

export function crearOperacion({ id, borradorId, filas, creadoAt, ...datos }) {
  if (!id || !borradorId || !filas?.length || filas.some((f) => !f.id)) throw new Error("Faltan los ids de la operación.");
  // La copia separa lo firmado de las líneas que React puede seguir dibujando.
  return JSON.parse(JSON.stringify({ ...datos, id, borradorId, creadoAt,
    filas: filas.map((f) => ({ ...f, created_at: f.created_at ?? creadoAt })),
    estado: "pendiente", finalizada: false, intentos: 0, error: null, revision: 0 }));
}

export const pendientesVisibles = (operaciones = []) => operaciones.filter((e) => e.estado !== "enviado");

export function recuperarOperacion(operaciones, borradorId, sede) {
  return operaciones.find((e) => e.borradorId === borradorId)
    ?? operaciones.find((e) => !e.finalizada && e.filas?.[0]?.sede === sede) ?? null;
}

/** Se toma dentro de una transacción: dos pestañas no pueden reclamar lo mismo. */
export function reclamarOperacion(envio, token, ahora, revision = false) {
  if (!envio || envio.estado === "enviado" || (envio.candado?.hasta > ahora)) return envio;
  if (!revision && ["rechazado", "vencido"].includes(envio.estado)) return envio;
  if (!revision && fechaRequiereRevision(envio, ahora)) {
    return { ...envio, estado: "vencido", candado: null,
      error: "La fecha llegó al límite de envío o no es válida. Regularizá con la hora original; no se enviará automáticamente." };
  }
  return { ...envio, candado: { token, hasta: ahora + LEASE_MS },
    fueIncierto: envio.fueIncierto || envio.estado === "incierto",
    estado: revision ? envio.estado : "incierto",
    intentos: revision ? envio.intentos : (envio.intentos ?? 0) + 1,
    ultimoIntentoAt: new Date(ahora).toISOString() };
}

/** Una respuesta tardía de una pestaña no puede pisar el resultado de otra. */
export function resolverOperacion(envio, token, { error = null, online = true, enviado = false } = {}) {
  if (!envio || envio.candado?.token !== token) return envio;
  const estado = enviado ? "enviado" : esErrorReintentable(error, { online }) ? "incierto" : "rechazado";
  return { ...envio, estado, candado: null, fueIncierto: envio.fueIncierto || estado === "incierto",
    error: error ? String(error.message ?? error) : null };
}

export function finalizarOperacion(envio) {
  if (!envio || !["pendiente", "incierto", "enviado", "rechazado", "vencido"].includes(envio.estado)) {
    throw new Error("La operación todavía no está guardada.");
  }
  return { ...envio, finalizada: true };
}

/** Identificar ids evita confundir una respuesta vacía del upsert con un fallo. */
export function todosLosIdsPresentes(envio, filas = []) {
  const ids = new Set(filas.map((f) => f.id));
  return envio.filas.every((f) => ids.has(f.id));
}

/**
 * Sólo se corrige un rechazo sin resultado incierto, después de consultar todos
 * sus ids. Así una escritura que todavía está viajando nunca cambia de destino.
 * El original queda en el historial y la fecha del hecho no se reemplaza.
 */
export function corregirRechazo(envio, cambios, existentes = [], ahora = Date.now()) {
  if (envio.estado !== "rechazado" || envio.fueIncierto) throw new Error("Este envío necesita revisión con el registro original.");
  if (existentes.length) throw new Error("Hay filas registradas: primero revisá o anulá el registro.");
  if (fechaRequiereRevision(envio, ahora)) throw new Error("La fecha requiere regularización por el coordinador.");
  const sector = String(cambios.sector ?? "").trim();
  const autorizado = String(cambios.autorizadoPor ?? "").trim();
  const motivo = String(cambios.motivo ?? "").trim();
  if (!sector || !motivo) throw new Error("Indicá el sector correcto y el motivo de la corrección.");
  if (envio.filas.some((f) => (f.canje === "sin_usado" || f.fuera_cupo) && !autorizado)) throw new Error("Falta quién autoriza.");
  return { ...envio, estado: "pendiente", candado: null, error: null, revision: (envio.revision ?? 0) + 1,
    historial: [...(envio.historial ?? []), { filas: envio.filas, resumen: envio.resumen, error: envio.error, motivo, corregidoAt: new Date(ahora).toISOString() }],
    resumen: { ...envio.resumen, destino: sector },
    filas: envio.filas.map((f) => ({ ...f, obra_id: null, sector, autorizado_por: autorizado || f.autorizado_por,
      nota: [f.nota, `Corrección: ${motivo}`].filter(Boolean).join(" · ") })) };
}

/** Las filas enviadas siguen contando hasta que la lectura de hoy traiga su id. */
export function reconciliarHoy(hoy = [], operaciones = [], verificadas = []) {
  const porId = new Map(hoy.filter((f) => f.id).map((f) => [f.id, f]));
  for (const e of operaciones) {
    for (const f of e.filas ?? []) if (!porId.has(f.id)) porId.set(f.id, f);
  }
  for (const f of verificadas) if (porId.has(f.id)) porId.set(f.id, f);
  return [...porId.values()].filter((f) => !f.anulado_at);
}

export function limpiarCanjes(carrito, modo) {
  return modo === "devolucion" ? carrito.map((l) => ({ ...l, canje: null, autorizaCanje: "" })) : carrito;
}

/** El token liga cada consulta al carrito, al paso y a la firma que la inició. */
export function tokenConsulta(control) {
  return { carritoId: control.carritoId, pedido: control.pedido, paso: control.paso, operacionId: control.operacionId };
}

export function consultaVigente(control, token) {
  return !control.guardando && !control.operacionId && control.paso !== "listo"
    && control.carritoId === token.carritoId && control.pedido === token.pedido
    && control.paso === token.paso && control.operacionId === token.operacionId;
}

export const puedeEditar = (control) => !control.guardando && !control.operacionId && control.paso !== "listo";

export function transicionControl(control, evento) {
  if (evento.tipo === "empezar") {
    if (control.guardando) return control;
    return { carritoId: evento.id, pedido: control.pedido + 1, paso: "marcar", guardando: false, operacionId: null, auto: false };
  }
  if (evento.tipo === "persistida") return { ...control, operacionId: evento.id };
  if (evento.tipo === "terminar") return { ...control, guardando: false, paso: "listo", auto: false };
  if (evento.tipo === "error") return { ...control, guardando: false, auto: false };
  if (!puedeEditar(control)) return control;
  if (evento.tipo === "confirmar") return { ...control, guardando: true, pedido: control.pedido + 1, auto: false };
  if (evento.tipo === "tarjeta") return { ...control, pedido: control.pedido + 1, auto: false };
  if (evento.tipo === "identificar") return { ...control, pedido: control.pedido + 1, paso: "firmar", auto: evento.auto };
  if (evento.tipo === "paso") return { ...control, pedido: control.pedido + 1, paso: evento.paso, auto: false };
  if (evento.tipo === "cortar") return { ...control, auto: false };
  return control;
}

/** El código manda aunque el campo numérico haya filtrado las letras. */
export function consumirRafaga(teclas, valor, valorPrevio, separar) {
  const { rafaga } = separar(teclas);
  if (!rafaga) return null;
  return { codigo: rafaga, previo: valorPrevio ?? (valor.endsWith(rafaga) ? valor.slice(0, -rafaga.length) : "") };
}
