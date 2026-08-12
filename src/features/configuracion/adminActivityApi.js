import { supabase } from "@/supabaseClient";

const SESSION_KEY = "klasea.admin-activity.session";

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function isTrackedAdmin(profile) {
  return String(profile?.username || "").trim().toLowerCase() === "admin";
}

export function getAdminActivitySession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.id) return parsed;
  } catch {
    // Una sesion sin storage sigue pudiendo usar el sistema normalmente.
  }
  return null;
}

export function ensureAdminActivitySession() {
  const existing = getAdminActivitySession();
  if (existing) return { ...existing, isNew: false };

  const session = {
    id: createSessionId(),
    startedAt: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // El RPC igualmente recibe el id generado en memoria.
  }
  return { ...session, isNew: true };
}

export function clearAdminActivitySession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // No bloquea el cierre de sesion.
  }
}

function deviceType() {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth || 0;
  if (width <= 768) return "mobile";
  if (width <= 1100) return "tablet";
  return "desktop";
}

export async function registerAdminActivity({
  sessionId,
  eventType,
  route,
  durationSeconds = 0,
  metadata = {},
}) {
  if (!sessionId) return false;
  const { data, error } = await supabase.rpc("register_admin_activity", {
    p_session_id: sessionId,
    p_event_type: eventType,
    p_route: route || null,
    p_duration_seconds: Math.max(0, Math.round(Number(durationSeconds) || 0)),
    p_device_type: deviceType(),
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    p_metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
  if (error) {
    // La auditoria nunca debe impedir que el usuario navegue.
    if (import.meta.env.DEV) console.warn("No se pudo registrar actividad Admin:", error.message);
    return false;
  }
  return data === true;
}

export async function endTrackedAdminSession(profile, route = "") {
  if (!isTrackedAdmin(profile)) return;
  const session = getAdminActivitySession();
  if (!session?.id) return;
  await registerAdminActivity({ sessionId: session.id, eventType: "session_end", route });
  clearAdminActivitySession();
}

export async function loadAdminActivity(days = 30) {
  const safeDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - safeDays * 86400000).toISOString();
  const [sessionsResult, eventsResult] = await Promise.all([
    supabase
      .from("admin_activity_sessions")
      .select("id,username,started_at,last_seen_at,ended_at,initial_route,last_route,page_views,device_type,timezone")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(300),
    supabase
      .from("admin_activity_events")
      .select("id,session_id,event_type,route,duration_seconds,occurred_at")
      .gte("occurred_at", since)
      .in("event_type", ["session_start", "page_view"])
      .order("occurred_at", { ascending: false })
      .limit(1500),
  ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  return {
    sessions: sessionsResult.data || [],
    events: eventsResult.data || [],
    days: safeDays,
  };
}
