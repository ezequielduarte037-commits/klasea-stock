import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Context from "./PushNotificationsContext";
import { disablePush, enablePush, invokePush, loadPushState, PUSH_CHANGE_EVENT, resumePushForSession, savePushPreferences } from "@/lib/pushNotifications";

// "Ahora no" en la invitación: se vuelve a ofrecer a las dos semanas.
const INVITACION_KEY = "klasea.push.invitacion";
const INVITACION_PAUSA_MS = 14 * 24 * 60 * 60 * 1000;
function invitacionPausada(userId) {
  try { return Number(localStorage.getItem(`${INVITACION_KEY}.${userId}`) || 0) > Date.now(); } catch { return false; }
}

export default function PushNotificationsProvider({ profile, children }) {
  const [state, setState] = useState({ phase: "checking" });
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState(null);
  const request = useRef(0);
  const inFlight = useRef(false);
  const checking = useRef(null);
  const userId = profile?.id;
  // Refrescar el token o los datos del perfil no cambia la sesión push ni debe
  // cancelar una activación que el usuario acaba de confirmar.
  const pushProfile = useMemo(()=>({id:profile?.id,role:profile?.role,is_demo:profile?.is_demo,activo:profile?.activo}),
    [profile?.id,profile?.role,profile?.is_demo,profile?.activo]);
  useEffect(()=>{if(userId)resumePushForSession();},[userId]);
  const [invitacionOculta, setInvitacionOculta] = useState(() => !!userId && invitacionPausada(userId));
  const ocultarInvitacion = useCallback(() => {
    setInvitacionOculta(true);
    try { localStorage.setItem(`${INVITACION_KEY}.${userId}`, String(Date.now() + INVITACION_PAUSA_MS)); } catch { /* Modo privado. */ }
  }, [userId]);
  const invalidate = useCallback(() => { request.current++; }, []);
  const refresh = useCallback(() => {
    if (inFlight.current) return;
    if (checking.current) return checking.current;
    const serial = ++request.current;
    const pending = (async()=>{
      try {
        const next = await loadPushState(pushProfile,()=>serial===request.current);
        if (next && serial===request.current) {
          setState(prev=>({...next,userId,preferences:next.preferences??(prev.userId===userId?prev.preferences:undefined)}));
          if(next.phase==="active")setFeedback(prev=>prev?.ok===false?null:prev);
          else if(next.phase==="reconnecting")setFeedback(null);
        }
      } catch(error) {
        if(serial===request.current)setState(prev=>({phase:prev.subscription?"reconnecting":"error",userId,
          reg:prev.reg,subscription:prev.subscription,preferences:prev.preferences,message:error.message}));
      } finally {if(checking.current===pending)checking.current=null;}
    })();
    checking.current=pending;
    return pending;
  }, [pushProfile,userId]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const permissions = () => { void refresh(); };
    const retry = setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30_000);
    window.addEventListener(PUSH_CHANGE_EVENT, permissions);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", permissions);
    return () => {
      invalidate(); clearTimeout(timer); clearInterval(retry); checking.current=null;
      window.removeEventListener(PUSH_CHANGE_EVENT, permissions);
      window.removeEventListener("online", permissions);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, invalidate]);

  async function action(kind) {
    if (inFlight.current || !userId) return;
    inFlight.current = true; setBusy(kind); setFeedback(null);
    const serial = ++request.current;
    try {
      if (kind === "enable") {
        const subscription = await enablePush(state, userId, () => request.current === serial);
        if (request.current === serial) setState((prev) => ({ ...prev, phase: "active", subscription }));
        // Una prueba al instante: quien activa ve llegar el primer aviso.
        const probada = await invokePush("test", { endpoint: subscription.endpoint }).then((r) => !!r.sent, () => false);
        if (request.current === serial) setFeedback({ ok: true, message: probada
          ? "Avisos activados. Te mandamos una prueba: tendría que llegarte en unos segundos."
          : "Avisos activados en este dispositivo." });
      } else if (kind === "disable") {
        await disablePush(state.reg);
        if (request.current === serial) setState((prev) => ({ ...prev, phase: "ready", subscription: null }));
        if (request.current === serial) setFeedback({ ok: true, message: "Notificaciones desactivadas en este dispositivo." });
      } else if (kind === "test") {
        const result = await invokePush("test", { endpoint: state.subscription?.endpoint });
        if (!result.sent) throw new Error("El servicio no confirmó el envío de prueba. Reintentá.");
        if (request.current === serial) setFeedback({ ok: true, message: "Prueba enviada. Comprobá que llegó al celular; podés cerrar la app para verla." });
      }
    } catch (error) {
      if (request.current === serial) {
        const denied = window.Notification?.permission === "denied";
        if (denied) setState((prev) => ({ ...prev, phase: "blocked" }));
        else if (error.pushState) setState(error.pushState);
        setFeedback({ ok: false, message: denied ? "El permiso fue bloqueado. Habilitá las notificaciones para Klase A en los ajustes del dispositivo." : error.message });
      }
    } finally { inFlight.current = false; setBusy(""); }
  }

  async function preferences(next) {
    if (inFlight.current || !userId) return;
    inFlight.current = true; setBusy("preferences"); setFeedback(null);
    const serial = ++request.current;
    try {
      await savePushPreferences(userId, next);
      if (request.current === serial) {
        setState((prev) => ({ ...prev, preferences: next }));
        setFeedback({ ok: true, message: "Preferencias guardadas para tu cuenta." });
      }
    } catch (error) { if (request.current === serial) setFeedback({ ok: false, message: error.message }); }
    finally { inFlight.current = false; setBusy(""); }
  }

  // El perfil cambia antes de reutilizar cualquier registro del usuario anterior.
  const hidden = !userId || profile?.role === "cliente" || profile?.is_demo || profile?.activo === false;
  const visibleState = hidden ? {phase:"hidden"} : state.userId && state.userId!==userId ? {phase:"checking"} : state;
  return <Context.Provider value={{ state: visibleState, busy, feedback, action, refresh, preferences, invitacionOculta, ocultarInvitacion }}>{children}</Context.Provider>;
}
