// Borradores / ingresos pendientes a Pañol (persistidos en localStorage).
// Permite pausar un ingreso a medio cargar y retomarlo después.
const PENDIENTES_KEY = "panol-ingresos-pendientes";
const PAPELERA_KEY = "panol-ingresos-papelera";
const MAX_PENDIENTES = 20;
const MAX_PAPELERA = 10;

function leerLista(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function escribirLista(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function leerIngresosPendientes() {
  return leerLista(PENDIENTES_KEY);
}

// Borrar un borrador NO lo destruye: pasa a la papelera. Un click de más en la X
// no puede costar un ingreso entero cargado a mano.
export function borrarIngresoPendiente(id) {
  const list = leerIngresosPendientes();
  const victima = list.find((d) => d.id === id);
  escribirLista(PENDIENTES_KEY, list.filter((d) => d.id !== id));
  if (!victima) return;
  const papelera = leerPapeleraIngresos().filter((d) => d.id !== id);
  escribirLista(PAPELERA_KEY, [{ ...victima, deletedAt: new Date().toISOString() }, ...papelera].slice(0, MAX_PAPELERA));
}

export function leerPapeleraIngresos() {
  return leerLista(PAPELERA_KEY);
}

// Devuelve el borrador a la lista activa. Retorna el borrador restaurado o null.
export function restaurarIngresoPendiente(id) {
  const papelera = leerPapeleraIngresos();
  const entry = papelera.find((d) => d.id === id);
  if (!entry) return null;
  escribirLista(PAPELERA_KEY, papelera.filter((d) => d.id !== id));
  const list = leerIngresosPendientes().filter((d) => d.id !== id);
  const { deletedAt, ...restaurado } = entry;
  void deletedAt;
  escribirLista(PENDIENTES_KEY, [restaurado, ...list].slice(0, MAX_PENDIENTES));
  return restaurado;
}

export function vaciarPapeleraIngresos() {
  escribirLista(PAPELERA_KEY, []);
}

// Guarda (o actualiza, si se pasa id) un borrador. Devuelve el id usado.
export function guardarIngresoPendiente(draft, id = null) {
  const list = leerIngresosPendientes().filter((d) => d.id !== id);
  const entry = {
    id: id || (globalThis.crypto?.randomUUID?.() || `d${Date.now()}`),
    savedAt: new Date().toISOString(),
    ...draft,
  };
  return escribirLista(PENDIENTES_KEY, [entry, ...list].slice(0, MAX_PENDIENTES)) ? entry.id : null;
}
