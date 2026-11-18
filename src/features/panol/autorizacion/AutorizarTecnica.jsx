import { useEffect, useRef, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { autorizarConPin, fetchAutorizadores } from "./autorizacionApi";

/**
 * Alguien de Técnica autoriza con su PIN: se toca su nombre y escribe los 6
 * números. Lo usan el retiro sin tarjeta (mostradores y solicitudes) y la
 * asignación de tarjetas. Queda registrado quién autorizó.
 */
export default function AutorizarTecnica({
  titulo,
  detalle = "",
  tipo,
  empleadoId = null,
  sede = null,
  motivo = null,
  onAutorizado,
  onCancelar,
}) {
  const [lista, setLista] = useState(null);
  const [errorLista, setErrorLista] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pinRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    fetchAutorizadores()
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        if (l.length === 1) setTecnicoId(l[0].id);
      })
      .catch((e) => { if (vivo) setErrorLista(e?.message || "No se pudo cargar quién autoriza."); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (tecnicoId) pinRef.current?.focus();
  }, [tecnicoId]);

  async function enviar(e) {
    e?.preventDefault();
    e?.stopPropagation();
    if (enviando || !tecnicoId || pin.length !== 6) return;
    setEnviando(true);
    setError("");
    try {
      const aut = await autorizarConPin({ tecnicoId, pin, tipo, empleadoId, sede, motivo });
      onAutorizado?.(aut);
    } catch (err) {
      setError(navigator.onLine === false
        ? "Sin conexión no se puede verificar el PIN."
        : err?.message || "No se pudo autorizar.");
      setPin("");
      pinRef.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancelar?.(); } else e.stopPropagation(); }}
      style={{
        display: "grid", gap: 12, padding: 14, borderRadius: 12,
        border: "1px solid var(--violet-border)", background: "var(--violet-soft)", color: "var(--text)",
      }}
    >
      <style>{".aut-gira{animation:aut-giro .8s linear infinite}@keyframes aut-giro{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.aut-gira{animation:none}}"}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <ShieldCheck size={18} style={{ color: "var(--violet)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{titulo}</div>
          {detalle ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{detalle}</div> : null}
        </div>
        {onCancelar ? (
          <button type="button" className="ui-btn" onClick={onCancelar} aria-label="Cancelar">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {errorLista ? (
        <div style={{ fontSize: 12.5, color: "var(--red)" }}>{errorLista}</div>
      ) : lista === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--dim)" }}>
          <LoaderCircle size={14} className="aut-gira" /> Buscando quién puede autorizar…
        </div>
      ) : !lista.length ? (
        <div style={{ fontSize: 12.5, color: "var(--red)", lineHeight: 1.45 }}>
          Nadie de Técnica tiene PIN todavía. Se crea en Pañol → Tarjetas NFC, con el usuario de Técnica.
        </div>
      ) : (
        <>
          <div role="group" aria-label="Quién de Técnica autoriza" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lista.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ui-btn${tecnicoId === t.id ? " ui-btn-primario" : ""}`}
                aria-pressed={tecnicoId === t.id}
                onClick={() => { setTecnicoId(t.id); setError(""); }}
              >
                {t.nombre}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label htmlFor="autorizar-pin" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>PIN</label>
            <input
              id="autorizar-pin"
              ref={pinRef}
              className="ui-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              disabled={!tecnicoId || enviando}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              style={{ width: 130, letterSpacing: "0.4em", fontSize: 18, textAlign: "center" }}
            />
            <button type="submit" className="ui-btn ui-btn-primario" disabled={!tecnicoId || pin.length !== 6 || enviando}>
              {enviando ? <LoaderCircle size={15} className="aut-gira" /> : <KeyRound size={15} />}
              Autorizar
            </button>
          </div>
          {error ? <div role="alert" style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 600 }}>{error}</div> : null}
        </>
      )}
    </form>
  );
}
