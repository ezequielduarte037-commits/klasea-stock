// Borradores / ingresos pendientes a Pañol (persistidos en localStorage).
// Permite pausar un ingreso a medio cargar y retomarlo después.
const PENDIENTES_KEY = "panol-ingresos-pendientes";
const MAX_PENDIENTES = 20;

export function leerIngresosPendientes() {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDIENTES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function borrarIngresoPendiente(id) {
  try {
    const next = leerIngresosPendientes().filter((d) => d.id !== id);
    localStorage.setItem(PENDIENTES_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

// Guarda (o actualiza, si se pasa id) un borrador. Devuelve el id usado.
export function guardarIngresoPendiente(draft, id = null) {
  try {
    const list = leerIngresosPendientes().filter((d) => d.id !== id);
    const entry = {
      id: id || (globalThis.crypto?.randomUUID?.() || `d${Date.now()}`),
      savedAt: new Date().toISOString(),
      ...draft,
    };
    localStorage.setItem(PENDIENTES_KEY, JSON.stringify([entry, ...list].slice(0, MAX_PENDIENTES)));
    return entry.id;
  } catch {
    return null;
  }
}
