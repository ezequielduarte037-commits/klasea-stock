export const PUSH_WORKER_PATH = "/klasea-push-sw.js";

export function pushSupport(env = globalThis) {
  const nav = env.navigator || {};
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || "")
    || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || env.matchMedia?.("(display-mode: standalone)")?.matches === true;
  if (!env.isSecureContext) return { supported: false, reason: "secure", message: "Abrí Klase A con una conexión HTTPS para activar los avisos." };
  if (ios && !standalone) return { supported: false, reason: "install", message: "En iPhone o iPad, agregá Klase A a la pantalla de inicio y abrila desde su ícono. Después podrás activar los avisos." };
  if (!nav.serviceWorker || !("PushManager" in env)) return { supported: false, reason: "unsupported", message: "Este navegador no permite notificaciones push. Probá con un navegador actualizado; en iPhone se necesita iOS 16.4 o posterior." };
  return { supported: true, ios, standalone };
}

export function isPushWorker(registration, origin = globalThis.location?.origin) {
  return [registration?.active, registration?.waiting, registration?.installing].some((worker) => {
    try { return new URL(worker?.scriptURL, origin).pathname === PUSH_WORKER_PATH; }
    catch { return false; }
  });
}

export async function removeLegacyWorkers(nav = globalThis.navigator, origin = globalThis.location?.origin) {
  const registrations = await nav?.serviceWorker?.getRegistrations?.() || [];
  await Promise.all(registrations.filter((registration) => !isPushWorker(registration, origin)).map((registration) => registration.unregister()));
}

export function vapidKeyBytes(publicKey) {
  const base64 = String(publicKey || "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("La configuración de notificaciones no tiene una clave pública válida.");
  return bytes;
}

export function localNotificationUrl(path, origin) {
  try {
    const url = new URL(path || "/", origin);
    return url.origin === origin && ["http:", "https:"].includes(url.protocol) ? url.pathname + url.search + url.hash : "/";
  } catch { return "/"; }
}
