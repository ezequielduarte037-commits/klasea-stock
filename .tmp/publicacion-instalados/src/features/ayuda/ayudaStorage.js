const STORAGE_VERSION = "klasea_tours_v1";

function storageKey(tourId, userId = "anon") {
  return `${STORAGE_VERSION}_${userId}_${tourId}`;
}

export function marcarTourCompletado(tourId, userId = "anon") {
  try {
    window.localStorage.setItem(storageKey(tourId, userId), new Date().toISOString());
  } catch {
    // El tour funciona igual si el navegador bloquea el almacenamiento local.
  }
}

export function tourFueCompletado(tourId, userId = "anon") {
  try {
    return !!window.localStorage.getItem(storageKey(tourId, userId));
  } catch {
    return false;
  }
}
