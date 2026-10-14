import { CreditCard, X } from "lucide-react";
import { normalizeNfcUid } from "@/features/rrhh/api";

// Tarjeta de quien retira: muestra al empleado validado o pide la tarjeta. La
// lógica (lector, búsqueda en RRHH) está en retiroNfc.js.

function iniciales(nombre) {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return partes.map((p) => p[0]).join("").toUpperCase() || "?";
}

export default function TarjetaRetiro({ nfc, onLimpiar }) {
  const bridge = nfc.bridge;
  const conectado = bridge?.status === "connected";
  const conectando = bridge?.status === "connecting";
  const tono = nfc.empleado ? "verde" : nfc.status === "error" ? "rojo" : "azul";
  const colorLector = conectado ? "var(--green)" : conectando ? "var(--blue)" : "var(--cyan)";

  return (
    <div className="mad-nfc" data-tono={tono}>
      {nfc.empleado ? (
        <div className="mad-nfc-fila">
          <div className="mad-nfc-foto">
            {String(nfc.empleado.foto_url ?? "").trim()
              ? <img src={nfc.empleado.foto_url} alt="" loading="lazy" />
              : iniciales(nfc.empleado.nombre)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mad-nfc-et">Validado con la tarjeta</div>
            <div className="mad-nfc-nom">{nfc.empleado.nombre}</div>
            <div className="mad-nfc-txt">DNI {nfc.empleado.dni || "—"}{nfc.empleado.sede ? ` · ${nfc.empleado.sede}` : ""}</div>
          </div>
          <button type="button" className="ui-btn chico" onClick={onLimpiar}>Cambiar</button>
        </div>
      ) : (
        <>
          <div className="mad-nfc-fila">
            <span className="mad-nfc-ic"><CreditCard size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Tarjeta de quien retira</div>
              <div className="mad-nfc-txt">Apoyá la tarjeta en el lector o cargá el código a mano.</div>
            </div>
          </div>
          <div className="mad-nfc-uid">
            <input
              className="ui-input"
              value={nfc.code}
              onChange={(e) => nfc.setCode(normalizeNfcUid(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  nfc.resolver(nfc.code);
                }
              }}
              placeholder="Código de la tarjeta"
              aria-label="Código de la tarjeta NFC"
            />
            <button type="button" className="ui-btn chico" onClick={() => nfc.resolver(nfc.code)} disabled={!nfc.code}>Validar</button>
            <button type="button" className="lam-btn-ic chico" onClick={onLimpiar} aria-label="Limpiar tarjeta" title="Limpiar"><X size={14} /></button>
          </div>
        </>
      )}
      <div className="mad-nfc-lector" style={{ "--lector": colorLector }}>
        {conectado ? "Lector NFC conectado" : conectando ? "Conectando el lector NFC…" : "Lector NFC desconectado"}
        {!conectado && !conectando && bridge?.reconnect && <button type="button" onClick={bridge.reconnect}>Reintentar</button>}
      </div>
      {nfc.status === "buscando" && <div className="mad-nfc-txt" style={{ color: "var(--blue)" }}>Buscando al empleado…</div>}
      {nfc.error && <div className="mad-nfc-txt" style={{ color: "var(--red)" }}>{nfc.error}</div>}
    </div>
  );
}
