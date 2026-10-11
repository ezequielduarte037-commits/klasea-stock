import { useState } from "react";
import { LoaderCircle, Undo2, X } from "lucide-react";
import CampoTexto from "./CampoTexto";
import { fmtNum } from "./mostradorLogica";

const MOTIVOS = ["Cargado por error", "Cantidad equivocada", "Era otra persona", "Era otra obra", "Lo devolvió en el momento"];

/**
 * Anular un carrito (o parte) de los últimos movimientos. El registro no se
 * edita: la fila queda anulada con su motivo y, si hacía falta, se vuelve a
 * cargar bien. Por defecto se anula todo el carrito; se pueden destildar filas.
 */
export default function AnularMovimiento({ grupo, onAnular, onCerrar, onRafaga }) {
  const [elegidas, setElegidas] = useState(() => new Set(grupo.activas.map((f) => f.id)));
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState("");

  const alternar = (id) => setElegidas((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    return s;
  });

  async function confirmar() {
    if (!motivo.trim() || !elegidas.size || anulando) return;
    setAnulando(true);
    setError("");
    try {
      await onAnular(grupo.activas.filter((f) => elegidas.has(f.id)), motivo.trim());
    } catch (e) {
      setError(e?.message || "No se pudo anular.");
      setAnulando(false);
    }
  }

  return (
    <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget && !anulando) onCerrar(); }}>
      <div className="mst-hoja" role="dialog" aria-modal="true" aria-label="Anular movimiento" onKeyDown={(e) => { if (e.key === "Escape" && !anulando) onCerrar(); }}>
        <div className="mst-hoja-cab">
          <Undo2 size={19} aria-hidden="true" style={{ color: "var(--red)", marginTop: 2 }} />
          <div>
            <div className="mst-hoja-titulo">Anular {grupo.tipo === "devolucion" ? "la devolución" : "el retiro"}</div>
            <div className="mst-hoja-sub">{[grupo.empleado, grupo.destino].filter(Boolean).join(" · ") || "Sin nombre"}</div>
          </div>
          <button type="button" className="mst-quitar" onClick={onCerrar} disabled={anulando} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="mst-hoja-cuerpo">
          <div style={{ display: "grid", gap: 6 }}>
            {grupo.activas.map((f) => (
              <label key={f.id} className="mst-check-fila">
                <input type="checkbox" checked={elegidas.has(f.id)} onChange={() => alternar(f.id)} />
                <span>
                  <span className="mst-num" style={{ fontWeight: 700 }}>{fmtNum(Math.abs(Number(f.cantidad)))}</span> {f.material?.descripcion ?? "Consumible"}
                </span>
                <span style={{ flex: "none", fontSize: 12, color: "var(--dim)" }}>{f.obra?.codigo || f.sector || ""}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="mst-etiqueta" htmlFor="mst-motivo">¿Por qué se anula?</label>
            <div className="mst-opciones" style={{ marginBottom: 8 }}>
              {MOTIVOS.map((m) => (
                <button key={m} type="button" className={`mst-opcion${motivo === m ? " is-elegida" : ""}`} onClick={() => setMotivo(m)}>{m}</button>
              ))}
            </div>
            <CampoTexto
              id="mst-motivo"
              value={motivo}
              onChange={setMotivo}
              onRafaga={onRafaga}
              onEnter={(e) => { e.preventDefault(); confirmar(); }}
              placeholder="O escribilo"
            />
          </div>
          {error ? <div className="mst-error">{error}</div> : null}
        </div>
        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={anulando}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-peligro" onClick={confirmar} disabled={anulando || !motivo.trim() || !elegidas.size}>
            {anulando ? <LoaderCircle size={15} className="mst-gira" /> : <Undo2 size={15} />}
            {elegidas.size === grupo.activas.length ? "Anular todo" : `Anular ${elegidas.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
