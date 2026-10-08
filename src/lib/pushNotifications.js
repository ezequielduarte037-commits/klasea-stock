import { supabase } from "@/supabaseClient";
import { isPushWorker, PUSH_WORKER_PATH, pushSupport, vapidKeyBytes } from "./webPushSupport.js";

const OWNER_KEY = "klasea.push.owner";
const CHANGE_EVENT = "klasea:push-change";
let clearing = null;

export function notifyPushChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export const PUSH_CHANGE_EVENT = CHANGE_EVENT;

function owner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function saveOwner(userId) {
  try { if (userId) localStorage.setItem(OWNER_KEY, userId); else localStorage.removeItem(OWNER_KEY); } catch { /* Almacenamiento privado. */ }
}

export async function invokePush(action, extra = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  let result;
  try { result = await supabase.functions.invoke("notificaciones-push", { body: { action, ...extra }, signal: abort.signal }); }
  finally { clearTimeout(timer); }
  const { data, error } = result;
  if (error) {
    let message = "No se pudo conectar con el servicio de notificaciones. Reintentá cuando tengas conexión.";
    try { const body = await error.context?.clone?.().json(); if (body?.error) message = body.error; } catch { /* Respuesta sin JSON. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data || {};
}

async function registration() {
  let reg;
  try { reg = await navigator.serviceWorker.register(PUSH_WORKER_PATH, { scope: "/", updateViaCache: "none" }); }
  catch {
    // El mensaje del navegador viene en inglés y no le sirve a nadie en el astillero.
    throw new Error("Este navegador no pudo preparar los avisos. Recargá la app o abrila desde Chrome (Android) o desde el ícono de inicio (iPhone).");
  }
  // La app nunca espera indefinidamente un worker que no pudo instalarse.
  if (!reg.active) await new Promise((resolve, reject) => {
    const worker = reg.installing || reg.waiting;
    const timer = setTimeout(() => { cleanup(); reject(new Error("No se pudo preparar las notificaciones. Volvé a intentar.")); }, 12_000);
    const onChange = () => {
      if (worker?.state === "activated") { cleanup(); resolve(); }
      else if (worker?.state === "redundant") { cleanup(); reject(new Error("No se pudo instalar el servicio de notificaciones.")); }
    };
    const cleanup = () => { clearTimeout(timer); worker?.removeEventListener("statechange", onChange); };
    worker?.addEventListener("statechange", onChange);
    onChange();
  });
  return reg;
}

async function bindWorker(reg, userId) {
  const active = reg.active;
  if (!active) throw new Error("El servicio de notificaciones todavía no está listo.");
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("No se pudo vincular este dispositivo. Reintentá.")); }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer); channel.port1.close();
      if (event.data?.ok) resolve(); else reject(new Error("No se pudo guardar la configuración de este dispositivo."));
    };
    active.postMessage({ type: "PUSH_USER", userId: userId || null }, [channel.port2]);
  });
}

export async function loadPushState(profile, isCurrent = () => true) {
  if (!profile?.id || profile.role === "cliente" || profile.is_demo || profile.activo === false) return { phase: "hidden" };
  const support = pushSupport(window);
  if (!support.supported) return { phase: support.reason, message: support.message };
  if (clearing) await clearing;
  const config = await invokePush("config");
  if (!isCurrent()) return null;
  if (!config.enabled || !config.publicKey) return { phase: "unconfigured", message: config.reason === "cron_not_configured"
    ? "El envío automático todavía no está habilitado. Consultá al administrador. Los avisos de la campana siguen disponibles."
    : "Las notificaciones al celular todavía no están habilitadas en el servidor. Los avisos de la campana siguen disponibles." };
  const key = vapidKeyBytes(config.publicKey);
  const reg = await registration();
  if (!isCurrent()) return null;
  let subscription = await reg.pushManager.getSubscription();
  // No se reutiliza una suscripción de otra cuenta en un teléfono compartido.
  if (subscription && owner() !== profile.id) {
    await subscription.unsubscribe(); subscription = null;
  }
  if (!isCurrent()) return null;
  await bindWorker(reg, profile.id);
  if (!isCurrent()) return null;
  if (subscription) await invokePush("subscribe", { subscription: subscription.toJSON(), deviceLabel: deviceLabel() });
  const { data: preferences, error } = await supabase.from("notificaciones_push_preferencias").select("push_enabled,categorias").eq("user_id", profile.id).maybeSingle();
  if (error) throw new Error("No se pudieron cargar tus preferencias de notificaciones.");
  if (!isCurrent()) return null;
  const permission = window.Notification?.permission || "default";
  return { phase: permission === "denied" ? "blocked" : subscription ? "active" : "ready", reg, key, subscription,
    preferences: preferences || { push_enabled: true, categorias: ["logistica", "compras", "panol"] } };
}

function deviceLabel() {
  const ua = navigator.userAgent || "";
  return /iPad/.test(ua) ? "iPad" : /iPhone|iPod/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Navegador";
}

// subscribe se invoca ANTES del primer await: iOS exige el gesto del botón.
export async function enablePush(prepared, userId, isCurrent = () => true) {
  const pending = prepared.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: prepared.key });
  const subscription = await pending;
  try {
    if (!isCurrent()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
    await bindWorker(prepared.reg, userId);
    if (!isCurrent()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
    await invokePush("subscribe", { subscription: subscription.toJSON(), deviceLabel: deviceLabel() });
    if (!isCurrent()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
    saveOwner(userId);
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return subscription;
}

export async function disablePush(reg, remote = true) {
  const subscription = await reg?.pushManager?.getSubscription();
  if (subscription) {
    // Primero corta la recepción local. Sin red también deja de llegar al teléfono.
    const removed = await subscription.unsubscribe();
    if (!removed) throw new Error("El navegador no pudo desactivar los avisos. Reintentá.");
    if (remote) try { await invokePush("unsubscribe", { endpoint: subscription.endpoint }); } catch { /* El endpoint local ya no recibe. */ }
  }
  saveOwner(null);
  notifyPushChanged();
}

export async function clearPushForLogout() {
  if (clearing) return clearing;
  saveOwner(null);
  clearing = (async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    for (const reg of regs.filter((registration) => isPushWorker(registration))) {
      await bindWorker(reg, null).catch(() => {});
      await disablePush(reg, false).catch(() => {});
      const notifications = await reg.getNotifications?.() || [];
      notifications.forEach((notification) => notification.close());
    }
    await navigator.clearAppBadge?.().catch(() => {});
  })().catch(() => {}).finally(() => { clearing = null; });
  return clearing;
}

export async function savePushPreferences(userId, preferences) {
  const { error } = await supabase.from("notificaciones_push_preferencias").upsert({ user_id: userId, ...preferences }, { onConflict: "user_id" });
  if (error) throw new Error("No se pudieron guardar tus preferencias. Reintentá.");
}

export function updatePushBadge(count) {
  if (!navigator.setAppBadge) return;
  Promise.resolve(count ? navigator.setAppBadge(count) : navigator.clearAppBadge?.()).catch(() => {});
}
