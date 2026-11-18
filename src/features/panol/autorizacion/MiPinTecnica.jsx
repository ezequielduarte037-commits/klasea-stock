import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { C } from "@/theme";
import { guardarMiPin } from "./autorizacionApi";

/**
 * El PIN personal de quien está logueado (Técnica o admin). Con él autoriza
 * un retiro sin tarjeta o dar una tarjeta. Nadie más lo ve: se guarda cifrado.
 */
export default function MiPinTecnica({ estado, onGuardado, toast }) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(!estado?.tiene);

  const distintos = repetido.length === 6 && pin !== repetido;
  const listo = pin.length === 6 && pin === repetido && !guardando;

  async function guardar(e) {
    e.preventDefault();
    if (!listo) return;
    setGuardando(true);
    try {
      await guardarMiPin(pin);
      toast?.success("PIN guardado. Ya podés autorizar retiros sin tarjeta.");
      setPin(""); setRepetido(""); setAbierto(false);
      onGuardado?.();
    } catch (error) {
      toast?.error(error.message || "No se pudo guardar el PIN.");
    } finally {
      setGuardando(false);
    }
  }

  const campo = { width: 120, minHeight: 44, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, color: C.text, padding: "8px 10px", fontFamily: C.mono, fontSize: 18, letterSpacing: "0.35em", textAlign: "center", outline: "none" };

  return (
    <section className="nfc-card" style={{ border: `1px solid ${estado?.tiene ? C.border : C.violetB}`, background: C.panelSolid, borderRadius: 14, padding: "13px 15px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 9, background: C.violetL, color: C.violet }}><ShieldCheck size={16} /></span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Tu PIN de autorización</div>
          <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
            {estado?.tiene
              ? "Con este PIN autorizás un retiro sin tarjeta o que Pañol dé una tarjeta. No lo compartas."
              : "Todavía no tenés. Sin PIN no podés autorizar retiros sin tarjeta ni tarjetas nuevas."}
          </div>
        </div>
        {estado?.tiene && !abierto ? (
          <button type="button" className="ui-btn" onClick={() => setAbierto(true)}><KeyRound size={14} /> Cambiar PIN</button>
        ) : null}
      </div>
      {abierto ? (
        <form onSubmit={guardar} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 5, fontSize: 11, color: C.dim, fontWeight: 600 }}>
            PIN nuevo (6 números)
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} style={campo} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 11, color: C.dim, fontWeight: 600 }}>
            Repetilo
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={repetido} onChange={(e) => setRepetido(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ ...campo, borderColor: distintos ? C.redB : C.border }} />
          </label>
          <button type="submit" className="ui-btn ui-btn-primario" disabled={!listo}>
            {guardando ? <Loader2 size={15} className="nfc-gira" /> : <KeyRound size={15} />} Guardar PIN
          </button>
          {estado?.tiene ? <button type="button" className="ui-btn" onClick={() => { setAbierto(false); setPin(""); setRepetido(""); }}>Cancelar</button> : null}
          {distintos ? <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>No coinciden.</span> : null}
        </form>
      ) : null}
    </section>
  );
}
