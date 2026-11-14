import { supabase } from "@/supabaseClient";
import { isPushWorker, PUSH_WORKER_PATH, pushSupport, vapidKeyBytes } from "./webPushSupport.js";

const OWNER_KEY = "klasea.push.owner";
const INTENT_KEY = "klasea.push.enabled.";
const CHANGE_EVENT = "klasea:push-change";
let clearing = null;
let sessionEpoch = 0;
let suspended = false;

export function resumePushForSession() {
  suspended = false;
  sessionEpoch++;
}

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
function intent(userId) {
  try { return localStorage.getItem(INTENT_KEY + userId); } catch { return null; }
}
function saveIntent(userId, enabled) {
  if (!userId) return;
  try { localStorage.setItem(INTENT_KEY + userId, enabled ? "true" : "false"); } catch { /* Almacenamiento privado. */ }
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
  const previous = await navigator.serviceWorker.getRegistration?.("/").catch(() => null);
  try { reg = await navigator.serviceWorker.register(PUSH_WORKER_PATH, { scope: "/", updateViaCache: "none" }); }
  catch {
    if (previous?.active && isPushWorker(previous)) return previous;
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
  const epoch = sessionEpoch;
  const current = () => !suspended && epoch === sessionEpoch && isCurrent();
  if (!current()) return null;
  let remembered = intent(profile.id) === "true" || (intent(profile.id) !== "false" && owner() === profile.id);
  let reg, subscription;
  const reconnecting = (error, extra = {}) => ({ phase:"reconnecting", userId:profile.id, reg, subscription,
    message:error.message || "Se reintentará la conexión de los avisos automáticamente.", ...extra });
  try { reg = await registration(); }
  catch (error) { if (!current()) return null; if (remembered) return reconnecting(error); throw error; }
  if (!current()) return null;
  subscription = await reg.pushManager.getSubscription();
  if (!current()) return null;
  // Una cuenta distinta nunca adopta los avisos de la anterior.
  if (subscription && owner() !== profile.id) {
    if (!await subscription.unsubscribe()) throw new Error("No se pudo desvincular la cuenta anterior de este dispositivo.");
    subscription = null; saveOwner(null);
  }
  if (!current()) return null;
  if (subscription && intent(profile.id) === "false") {
    if (!await subscription.unsubscribe()) throw new Error("No se pudieron desactivar los avisos de este dispositivo.");
    subscription = null; saveOwner(null);
  }
  if (subscription && owner() === profile.id) { remembered = true; saveIntent(profile.id,true); }
  let config;
  try { config = await invokePush("config"); }
  catch (error) { if (!current()) return null; if (remembered) return reconnecting(error); throw error; }
  if (!current()) return null;
  if (!config.enabled || !config.publicKey) return { phase: "unconfigured", message: config.reason === "cron_not_configured"
    ? "El envío automático todavía no está habilitado. Consultá al administrador. Los avisos de la campana siguen disponibles."
    : "Las notificaciones al celular todavía no están habilitadas en el servidor. Los avisos de la campana siguen disponibles." };
  const key = vapidKeyBytes(config.publicKey);
  const permission = window.Notification?.permission || "default";
  if (permission === "denied") return { phase:"blocked", reg,key,userId:profile.id };
  try {
    if (subscription) {
      const { data: saved, error } = await supabase.from("notificaciones_push_suscripciones")
        .select("last_error").eq("user_id",profile.id).eq("endpoint",subscription.endpoint).maybeSingle();
      if (error) throw new Error("No se pudo comprobar la conexión de los avisos.");
      if (!current()) return null;
      const expired = ["push_http_404","push_http_410","invalid_subscription"].includes(saved?.last_error)
        || (subscription.expirationTime != null && subscription.expirationTime <= Date.now());
      if (expired) {
        if (!await subscription.unsubscribe()) throw new Error("No se pudo renovar la conexión de los avisos.");
        subscription = null;
      }
    }
    if (!current()) return null;
    // Renueva solamente una elección previa en ESTE dispositivo y con permiso
    // vigente. El primer permiso siempre se solicita desde el botón del usuario.
    if (!subscription && remembered && permission === "granted") {
      try { subscription = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}); }
      catch (error) {
        if (error.name === "NotAllowedError" && window.Notification?.permission !== "denied") {
          return current() ? {phase:"ready",reg,key,userId:profile.id} : null;
        }
        throw error;
      }
      if (!current()) { await subscription.unsubscribe().catch(()=>{}); return null; }
      saveOwner(profile.id);
    }
    if (!current()) return null;
    await bindWorker(reg,profile.id);
    if (!current()) return null;
    if (subscription) await invokePush("subscribe",{subscription:subscription.toJSON(),deviceLabel:deviceLabel()});
    if (!current()) return null;
    const {data:preferences,error} = await supabase.from("notificaciones_push_preferencias")
      .select("push_enabled,categorias").eq("user_id",profile.id).maybeSingle();
    if (error) throw new Error("No se pudieron cargar tus preferencias de notificaciones.");
    if (!current()) return null;
    return {phase:subscription?"active":"ready",reg,key,subscription,userId:profile.id,
      preferences:preferences||{push_enabled:true,categorias:["logistica","compras","panol","revisiones"]}};
  } catch (error) {
    if (!current()) return null;
    if (remembered || subscription) return reconnecting(error,{key});
    throw error;
  }
}

function deviceLabel() {
  const ua = navigator.userAgent || "";
  return /iPad/.test(ua) ? "iPad" : /iPhone|iPod/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Navegador";
}

// subscribe se invoca ANTES del primer await: iOS exige el gesto del botón.
export async function enablePush(prepared, userId, isCurrent = () => true) {
  const epoch = sessionEpoch;
  const current = () => !suspended && epoch === sessionEpoch && isCurrent();
  if (!current()) throw new Error("La sesión cambió. Volvé a entrar a tu cuenta.");
  const pending = prepared.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: prepared.key });
  const subscription = await pending;
  try {
    if (!current()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
    saveOwner(userId); saveIntent(userId,true);
    await bindWorker(prepared.reg, userId);
    if (!current()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
    await invokePush("subscribe", { subscription: subscription.toJSON(), deviceLabel: deviceLabel() });
    if (!current()) throw new Error("La sesión cambió. Volvé a activar los avisos desde tu cuenta.");
  } catch (error) {
    if (!current()) await subscription.unsubscribe().catch(() => {});
    else error.pushState = {phase:"reconnecting",reg:prepared.reg,key:prepared.key,subscription,userId,
      message:error.message,preferences:prepared.preferences};
    throw error;
  }
  return subscription;
}

export async function disablePush(reg, remote = true, { preserveIntent = false, announce = true } = {}) {
  if (!preserveIntent) { sessionEpoch++; saveIntent(owner(),false); }
  const subscription = await reg?.pushManager?.getSubscription();
  if (subscription) {
    // Primero corta la recepción local. Sin red también deja de llegar al teléfono.
    const removed = await subscription.unsubscribe();
    if (!removed) throw new Error("El navegador no pudo desactivar los avisos. Reintentá.");
    if (remote) try { await invokePush("unsubscribe", { endpoint: subscription.endpoint }); } catch { /* El endpoint local ya no recibe. */ }
  }
  saveOwner(null);
  if (announce) notifyPushChanged();
}

export async function clearPushForLogout() {
  if (clearing) return clearing;
  suspended = true; sessionEpoch++;
  const previousOwner = owner();
  if (previousOwner && intent(previousOwner) !== "false") saveIntent(previousOwner,true);
  saveOwner(null);
  clearing = (async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    for (const reg of regs.filter((registration) => isPushWorker(registration))) {
      await bindWorker(reg, null).catch(() => {});
      await disablePush(reg, false, { preserveIntent:true, announce:false }).catch(() => {});
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
