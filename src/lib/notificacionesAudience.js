/**
 * Audiencia y prioridad de notificaciones.
 *
 * Separá dos ideas que antes se mezclaban:
 *  1. Poder entrar a un módulo (permiso / is_admin).
 *  2. Tener interés real en un aviso concreto.
 *
 * `is_admin` NO suscribe a todo. El rol operativo (`profile.role`) decide la
 * cola de trabajo; la relación con el evento (creador, asignado, seguidor,
 * sede, próxima acción) decide el resto.
 */

import { canonicalPanolSede } from "@/features/panol/panolApi";

/** Rol operativo real. Nunca se reemplaza por "admin" vía is_admin. */
export function operationalRole(profile) {
  return String(profile?.role || "").trim().toLowerCase();
}

export function isAdminAccount(profile) {
  return !!profile?.is_admin || operationalRole(profile) === "admin";
}

/** Atiende la cola de Compras (no basta con ser admin del sistema). */
export function isComprasOperativo(profile) {
  return operationalRole(profile) === "compras";
}

export function isPanolOperativo(profile) {
  return operationalRole(profile) === "panol";
}

export function isOficinaOperativa(profile) {
  return operationalRole(profile) === "oficina";
}

export function userIdOf(profile) {
  return profile?.id || null;
}

/**
 * Sede operativa de la cuenta.
 * "" = ambas / sin restringir (admin de pañol o sede "ambas").
 */
export function sedeOperativa(profile) {
  const raw = String(profile?.sede || "").trim();
  if (!raw || raw.toLowerCase() === "ambas") return "";
  return canonicalPanolSede(raw) || raw;
}

export function sedeCoincide(profile, sedeEvento) {
  const propia = sedeOperativa(profile);
  if (!propia) return true;
  const evento = canonicalPanolSede(sedeEvento) || String(sedeEvento || "").trim();
  if (!evento) return true;
  return propia === evento;
}

/** Autor conocido y distinto del usuario. Null/undefined = sistema o desconocido → no se filtra como "propio". */
export function esAccionPropia(autorId, profile) {
  const yo = userIdOf(profile);
  if (!yo || autorId == null || autorId === "") return false;
  return autorId === yo;
}

export function compraRelacionada(compra, profile) {
  const yo = userIdOf(profile);
  if (!yo || !compra) return false;
  if (compra.created_by === yo) return true;
  if (compra.assigned_to === yo) return true;
  return (compra.followers || []).some((f) => f.user_id === yo);
}

/**
 * Escalación crítica de Compras hacia Admin (no basta prioridad "alta"):
 * pedido urgente sin responsable claro, todavía en cola inicial.
 */
export function esEscalacionCriticaCompra(compra) {
  if (!compra) return false;
  if (compra.priority !== "urgente") return false;
  if (compra.assigned_to) return false;
  return compra.status === "nuevo" || compra.status === "en_revision";
}

/** Aviso a compras: solo "urgente" escala a Admin. "alta" no. */
export function esEscalacionCriticaAviso(aviso) {
  return aviso?.prioridad === "urgente";
}

/** Alerta de producción: solo gravedad critical escala a Admin. */
export function esEscalacionCriticaProduccion(alerta) {
  return alerta?.gravedad === "critical";
}

export function puedeVerRecepcion(profile) {
  return isPanolOperativo(profile);
}

export function puedeVerProduccion(profile) {
  // Oficina vive producción. Admin sólo ve escalaciones (filtradas aparte).
  return isOficinaOperativa(profile) || isAdminAccount(profile);
}

export function puedeVerCompras(profile) {
  const role = operationalRole(profile);
  if (isComprasOperativo(profile)) return true;
  if (isAdminAccount(profile)) return true;
  return ["tecnica", "oficina", "panol"].includes(role);
}

export function puedeVerLogistica(profile) {
  const role = operationalRole(profile);
  if (isComprasOperativo(profile)) return true;
  if (isAdminAccount(profile)) return true;
  return ["tecnica", "administracion"].includes(role);
}

/**
 * ¿Este usuario debe recibir esta compra como notificación?
 * Devuelve { ok, why } para depurar audiencia.
 */
export function audienciaCompra(compra, profile) {
  if (!compra) return { ok: false, why: "sin-compra" };
  if (compraRelacionada(compra, profile)) {
    return { ok: true, why: "relacionado" };
  }
  if (isComprasOperativo(profile)) {
    return { ok: true, why: "cola-compras" };
  }
  if (isAdminAccount(profile) && esEscalacionCriticaCompra(compra)) {
    return { ok: true, why: "escalacion-urgente-sin-asignar" };
  }
  return { ok: false, why: "sin-interes" };
}

export function audienciaAviso(aviso, profile) {
  if (!aviso) return { ok: false, why: "sin-aviso" };
  if (esAccionPropia(aviso.created_by, profile)) {
    return { ok: false, why: "propio" };
  }
  if (isComprasOperativo(profile)) {
    return { ok: true, why: "cola-compras" };
  }
  if (isAdminAccount(profile) && esEscalacionCriticaAviso(aviso)) {
    return { ok: true, why: "escalacion-urgente" };
  }
  return { ok: false, why: "sin-interes" };
}

export function audienciaRecepcion(envio, profile) {
  if (!envio) return { ok: false, why: "sin-envio" };
  if (!isPanolOperativo(profile)) return { ok: false, why: "no-panol" };
  if (esAccionPropia(envio.created_by, profile)) return { ok: false, why: "propio" };
  if (!sedeCoincide(profile, envio.sede)) return { ok: false, why: "otra-sede" };
  return { ok: true, why: "sede-panol" };
}

export function audienciaProduccion(alerta, profile) {
  if (!alerta) return { ok: false, why: "sin-alerta" };
  if (isOficinaOperativa(profile)) return { ok: true, why: "oficina" };
  if (isAdminAccount(profile) && esEscalacionCriticaProduccion(alerta)) {
    return { ok: true, why: "escalacion-critical" };
  }
  return { ok: false, why: "sin-interes" };
}

/**
 * Logística:
 * - Compras: solicitudes a coordinar / fechas aceptadas (no las propias).
 * - Solicitante (tecnica/admin/administracion): propuestas y confirmaciones de lo suyo.
 * - Admin sin rol compras: sólo lo propio o sin dueño claro en estado crítico.
 */
export function audienciaLogistica(movement, profile) {
  if (!movement) return { ok: false, why: "sin-movimiento" };
  const yo = userIdOf(profile);
  const propio = movement.created_by === yo;
  const compras = isComprasOperativo(profile);

  if (compras) {
    if (propio) return { ok: false, why: "propio-compras" };
    if (["solicitado", "fecha_aceptada"].includes(movement.estado)) {
      return { ok: true, why: "cola-compras" };
    }
    return { ok: false, why: "estado-no-accionable" };
  }

  if (propio && ["fecha_propuesta", "confirmado"].includes(movement.estado)) {
    return { ok: true, why: "solicitante" };
  }

  // Admin sin rol compras: no inunda con toda la cola.
  if (isAdminAccount(profile) && !propio && movement.estado === "solicitado" && !movement.created_by) {
    return { ok: true, why: "escalacion-sin-dueño" };
  }

  return { ok: false, why: "sin-interes" };
}

export function gravedadCompra(row = {}) {
  if (row.status === "comprado" || row.status === "recibido") return "success";
  if (row.status === "cancelado") return "critical";
  if (row.priority === "urgente") return "critical";
  if (row.status === "en_revision" || row.status === "cotizando") return "warning";
  if (row.priority === "alta" || row.status === "nuevo") return "warning";
  return "info";
}

export function gravedadItem(status) {
  if (status === "recibido") return "success";
  if (status === "cancelado") return "critical";
  if (status === "pedido" || status === "parcial") return "warning";
  return "info";
}

export function gravedadAviso(row = {}) {
  if (row.prioridad === "urgente") return "critical";
  if (row.prioridad === "alta" || row.estado === "nuevo") return "warning";
  return "info";
}

export function gravedadRecepcion(envio = {}) {
  if (envio.estado === "parcial") return "warning";
  return "warning"; // recepción abierta = acción pendiente
}

export function gravedadLogistica(movement = {}, { comoManager } = {}) {
  if (movement.estado === "solicitado") return "warning";
  if (movement.estado === "fecha_aceptada") return "warning";
  if (movement.estado === "fecha_propuesta") return "warning";
  if (movement.estado === "confirmado") return "success";
  return "info";
}

/**
 * ¿El aviso pide una acción directa del destinatario?
 * Sirve para toast emergente y la sección "Requieren acción".
 */
export function requiereAccionDirecta(notif) {
  if (!notif || notif.leida) return false;
  if (notif.gravedad === "critical") return true;
  if (notif.gravedad !== "warning") return false;
  if (notif.tipo === "recepcion") return true;
  if (notif.tipo === "compras" && notif.meta?.aviso) return true;
  if (notif.tipo === "compras" && notif.meta?.movimiento?.kind === "status") return false;
  if (notif.tipo === "logistica") return true;
  if (notif.tipo === "produccion") return true;
  return notif.requiereAccion === true;
}

/** Toast emergente: critical siempre; warning sólo si pide acción directa. */
export function debeMostrarToast(notif) {
  if (!notif || notif.leida) return false;
  if (notif.gravedad === "critical") return true;
  if (notif.gravedad === "warning" && (notif.requiereAccion || requiereAccionDirecta(notif))) return true;
  return false;
}

export const PRIORIDAD_LABEL = {
  critical: "Crítico",
  warning: "Acción",
  success: "Listo",
  info: "Novedad",
};
