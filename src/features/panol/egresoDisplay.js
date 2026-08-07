const STORAGE_KEY = "klasea:panol-pantalla-egreso";
const CHANNEL_NAME = "klasea-panol-egreso-display";
const LOCAL_EVENT = "klasea:panol-egreso-display-change";

export const EGRESO_DISPLAY_IDLE = {
  version: 1,
  revision: 0,
  status: "idle",
  // "retiro"       → sale del pañol y lo firma una persona con su tarjeta
  // "reasignacion" → el material sólo cambia de obra, no lo retira nadie
  // Son dos cosas distintas y la pantalla tiene que decirlo, si no el que está
  // parado enfrente cree que le están cargando un retiro a su nombre.
  mode: "retiro",
  items: [],
  employee: null,
  retiredBy: "",
  destination: "",
  sector: "",
  note: "",
  totalLines: 0,
  totalUnits: 0,
  error: "",
  updatedAt: null,
  completedAt: null,
};

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

export function readEgresoDisplay() {
  const target = safeWindow();
  if (!target) return EGRESO_DISPLAY_IDLE;
  try {
    const parsed = JSON.parse(target.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return EGRESO_DISPLAY_IDLE;
    return { ...EGRESO_DISPLAY_IDLE, ...parsed };
  } catch {
    return EGRESO_DISPLAY_IDLE;
  }
}

export function publishEgresoDisplay(patch = {}) {
  const target = safeWindow();
  if (!target) return EGRESO_DISPLAY_IDLE;

  const current = readEgresoDisplay();
  const next = {
    ...current,
    ...patch,
    version: 1,
    revision: Number(current.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  try {
    target.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // La pantalla sigue funcionando por BroadcastChannel aunque localStorage
    // este deshabilitado o lleno.
  }

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(next);
    channel.close();
  } catch {
    // Navegadores viejos reciben el cambio mediante el evento storage.
  }

  target.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: next }));
  return next;
}

export function resetEgresoDisplay() {
  return publishEgresoDisplay({
    ...EGRESO_DISPLAY_IDLE,
    revision: readEgresoDisplay().revision,
  });
}

export function subscribeEgresoDisplay(onChange) {
  const target = safeWindow();
  if (!target || typeof onChange !== "function") return () => {};

  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      onChange({ ...EGRESO_DISPLAY_IDLE, ...JSON.parse(event.newValue) });
    } catch {
      // Ignora un valor incompleto escrito por otra pestana.
    }
  };
  const onLocal = (event) => onChange({ ...EGRESO_DISPLAY_IDLE, ...(event.detail || {}) });

  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => onChange({ ...EGRESO_DISPLAY_IDLE, ...(event.data || {}) });
  } catch {
    channel = null;
  }

  target.addEventListener("storage", onStorage);
  target.addEventListener(LOCAL_EVENT, onLocal);

  return () => {
    target.removeEventListener("storage", onStorage);
    target.removeEventListener(LOCAL_EVENT, onLocal);
    channel?.close?.();
  };
}

export function openEgresoDisplayWindow() {
  const target = safeWindow();
  if (!target) return null;
  const popup = target.open(
    "/pantalla-egreso",
    "klasea-pantalla-egreso",
    "popup=yes,width=1280,height=800,resizable=yes,scrollbars=no",
  );
  popup?.focus?.();
  return popup;
}
