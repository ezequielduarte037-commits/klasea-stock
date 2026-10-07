import { useContext } from "react";
import { Bell, BellOff, RefreshCw, Share, Smartphone } from "lucide-react";
import { C } from "@/theme";
import Context from "./PushNotificationsContext";

// Fases que se ofrecen arriba del panel (invitación) en vez de al pie.
const FASES_INVITACION = ["ready", "install"];

function esTactil() {
  try { return window.matchMedia?.("(pointer: coarse)")?.matches === true; } catch { return false; }
}

/**
 * Avisos al celular.
 * modo="invitacion": tarjeta arriba del panel para activar (sólo en pantallas
 * táctiles y mientras no se haya dicho "Ahora no").
 * modo="ajustes": estado del dispositivo, prueba, baja y qué avisos recibir.
 */
export default function PushNotificationsControl({ profile, compacto = false, modo = "ajustes" }) {
  const context = useContext(Context);
  if (!context || !profile || profile.role === "cliente" || profile.is_demo) return null;
  const { state, busy, feedback, action, refresh, preferences, invitacionOculta, ocultarInvitacion } = context;
  if (state.phase === "hidden") return null;
  const invitando = FASES_INVITACION.includes(state.phase) && !invitacionOculta && esTactil();
  if (modo === "invitacion") return invitando ? <Invitacion state={state} busy={busy} feedback={feedback} action={action} ocultar={ocultarInvitacion} /> : null;
  if (invitando) return null;

  const active = state.phase === "active";
  const prefs = state.preferences;
  const paused = active && prefs?.push_enabled === false;
  const explanations = {
    checking: "Comprobando si este dispositivo puede recibir avisos…",
    ready: "Recibí avisos relevantes aunque Klase A esté cerrada.",
    install: "En iPhone o iPad, agregá Klase A a la pantalla de inicio y abrila desde su ícono para activar los avisos.",
    active: paused ? "Los avisos al celular están pausados para tu cuenta." : "Este dispositivo está vinculado a tu cuenta.",
    blocked: "El permiso está bloqueado. Habilitá las notificaciones de Klase A en los ajustes del navegador o del celular y volvé a comprobar.",
  };
  const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, fontFamily: C.sans, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  const text = explanations[state.phase] || state.message;
  return <section aria-label="Notificaciones al celular" style={{ padding: compacto ? "10px 2px 0" : 16, background: compacto ? "transparent" : C.panel, borderTop: `1px solid ${C.border}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, fontSize: 12.5, fontWeight: 650 }}><Smartphone size={16} color={C.blue} aria-hidden="true" />Avisos en este dispositivo
      <span style={{ marginLeft: "auto", fontSize: 10.5, color: active && !paused ? C.green : C.dim }}>{active ? paused ? "Pausados" : "Activados" : "Sin activar"}</span>
    </div>
    <p style={{ margin: "0 0 9px", color: C.dim, fontSize: 12, lineHeight: 1.5 }}>{text}</p>
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {state.phase === "ready" && <button type="button" disabled={!!busy} onClick={() => action("enable")} style={{ ...button, background: C.blue, borderColor: C.blue, color: "var(--inverse-text)" }}><Bell size={14} aria-hidden="true" />{busy === "enable" ? "Activando…" : "Activar notificaciones"}</button>}
      {active && <>
        <button type="button" disabled={!!busy || paused} onClick={() => action("test")} style={button}>{busy === "test" ? "Enviando…" : "Enviar prueba"}</button>
        <button type="button" disabled={!!busy} onClick={() => action("disable")} style={button}><BellOff size={14} aria-hidden="true" />Desactivar aquí</button>
      </>}
      {["blocked", "error", "unconfigured"].includes(state.phase) && <button type="button" disabled={!!busy} onClick={refresh} style={button}><RefreshCw size={14} aria-hidden="true" />Volver a comprobar</button>}
    </div>
    {active && prefs && <details style={{ marginTop: 10, fontSize: 12 }}>
      <summary style={{ cursor: "pointer", color: C.dim, padding: "4px 0" }}>Qué avisos recibir</summary>
      <div style={{ display: "grid", gap: 9, marginTop: 9 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={prefs.push_enabled !== false} disabled={!!busy} onChange={(event) => preferences({ ...prefs, push_enabled: event.target.checked })} />Recibir avisos al celular</label>
        {[["logistica", "Movimientos: hidrogrúas, fletes, desmoldes y recordatorios del día"], ["compras", "Pedidos y novedades de compras"], ["panol", "Recepción y solicitudes de pañol"]].map(([key, label]) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={prefs.categorias?.includes(key) || false} disabled={!!busy} onChange={(event) => preferences({ ...prefs, categorias: event.target.checked ? [...new Set([...(prefs.categorias || []), key])] : (prefs.categorias || []).filter((category) => category !== key) })} />{label}
        </label>)}
        <span style={{ fontSize: 11, color: C.dim, lineHeight: 1.45 }}>Recibís solo los avisos que corresponden a tu rol y a tus pedidos. Estas preferencias se aplican a todos tus dispositivos.</span>
      </div>
    </details>}
    {feedback && <div role={feedback.ok ? "status" : "alert"} style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5, color: feedback.ok ? C.green : C.red }}>{feedback.message}</div>}
  </section>;
}

function Invitacion({ state, busy, feedback, action, ocultar }) {
  const instalar = state.phase === "install";
  const boton = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 10, fontFamily: C.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return <section aria-label="Activar avisos en el celular" style={{ margin: "12px 14px 4px", padding: "13px 14px", borderRadius: 14, background: C.blueL, border: `1px solid ${C.blueB}` }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
      <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: C.panelSolid, color: C.blue, border: `1px solid ${C.blueB}` }}>
        {instalar ? <Share size={17} aria-hidden="true" /> : <Bell size={17} aria-hidden="true" />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: C.text }}>{instalar ? "Para recibir avisos en el iPhone" : "Recibí los avisos en el celular"}</h3>
        {instalar ? <ol style={{ margin: "7px 0 0", paddingLeft: 18, color: C.muted, fontSize: 12.5, lineHeight: 1.55 }}>
          <li>En Safari, tocá <b style={{ fontWeight: 600 }}>Compartir</b> (el cuadrado con la flecha).</li>
          <li>Elegí <b style={{ fontWeight: 600 }}>Agregar a inicio</b>.</li>
          <li>Abrí Klase A desde ese ícono y activá los avisos acá.</li>
        </ol> : <p style={{ margin: "5px 0 0", color: C.muted, fontSize: 12.5, lineHeight: 1.5 }}>
          Movimientos confirmados (hidrogrúas, fletes, desmoldes), tus pedidos y lo que llega a pañol, aunque Klase A esté cerrada.
        </p>}
      </div>
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 11, paddingLeft: 45, flexWrap: "wrap" }}>
      {!instalar && <button type="button" disabled={!!busy} onClick={() => action("enable")} style={{ ...boton, border: `1px solid ${C.blue}`, background: C.blue, color: "var(--inverse-text)" }}>
        <Bell size={15} aria-hidden="true" />{busy === "enable" ? "Activando…" : "Activar avisos"}
      </button>}
      <button type="button" onClick={ocultar} style={{ ...boton, border: `1px solid ${C.border}`, background: "transparent", color: C.dim }}>{instalar ? "Entendido" : "Ahora no"}</button>
    </div>
    {feedback && !feedback.ok && <div role="alert" style={{ marginTop: 9, paddingLeft: 45, fontSize: 12, lineHeight: 1.5, color: C.red }}>{feedback.message}</div>}
  </section>;
}
