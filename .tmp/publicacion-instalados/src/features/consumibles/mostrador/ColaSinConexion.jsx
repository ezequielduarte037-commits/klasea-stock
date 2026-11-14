import { useState } from "react";
import { CloudOff, Download, LoaderCircle, RotateCcw, X } from "lucide-react";
import { fmtNum } from "./mostradorLogica";
import { fechaRequiereRevision } from "./operacionesMostrador";
import CampoTexto from "./CampoTexto";

const hora = (iso) => Number.isNaN(Date.parse(iso)) ? "Fecha a revisar" : new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ESTADOS = { pendiente: "Pendiente de envío", incierto: "Resultado incierto", rechazado: "Rechazado: requiere corrección", vencido: "Fecha a regularizar" };

export function ChipCola({ cola = [], enviando, onAbrir }) {
  if (!cola.length) return null;
  const conError = cola.some((e) => ["rechazado", "vencido"].includes(e.estado) || fechaRequiereRevision(e));
  return (
    <button type="button" className={"mst-chip " + (conError ? "is-error" : "is-aviso")} onClick={onAbrir} title="Operaciones conservadas en este equipo">
      {enviando ? <LoaderCircle size={13} className="mst-gira" /> : <CloudOff size={13} />}
      <span className="mst-num">{cola.length}</span><span className="mst-chip-texto">por resolver</span>
    </button>
  );
}

function descargarOriginal(envio) {
  // El archivo conserva la fecha del hecho y todo el historial; nunca reemplaza
  // el único registro local por una copia con fecha de hoy.
  const url = URL.createObjectURL(new Blob([JSON.stringify(envio, null, 2)], { type: "application/json" }));
  const enlace = document.createElement("a");
  enlace.href = url; enlace.download = "consumibles-operacion-" + envio.id + ".json";
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Los rechazos y vencimientos se revisan; el original no se puede descartar. */
export default function ColaSinConexion({ cola = [], enviando, onReintentar, onRevisar, onCerrar }) {
  const [editando, setEditando] = useState(null);
  const [cambios, setCambios] = useState({ sector: "", autorizadoPor: "", motivo: "" });
  const [ocupado, setOcupado] = useState(null);
  const [mensaje, setMensaje] = useState("");

  async function revisar(id, correccion = null) {
    setOcupado(id); setMensaje("");
    try {
      const resultado = await onRevisar(id, correccion);
      setMensaje(resultado.estado === "enviado" ? "Los ids ya estaban registrados: operación reconciliada."
        : correccion ? "Corrección conservada con el original. Ahora podés reintentar." : resultado.error);
      setEditando(null);
    } catch (e) { setMensaje(e?.message || "No se pudo verificar el registro. Conservamos el original."); }
    finally { setOcupado(null); }
  }

  return (
    <div className="mst-capa" onMouseDown={(e) => { if (!ocupado && e.target === e.currentTarget) onCerrar(); }}>
      <div className="mst-hoja" role="dialog" aria-modal="true" aria-label="Operaciones por resolver" onKeyDown={(e) => { if (!ocupado && e.key === "Escape") onCerrar(); }}>
        <div className="mst-hoja-cab">
          <CloudOff size={19} aria-hidden="true" style={{ color: "var(--violet)", marginTop: 2 }} />
          <div>
            <div className="mst-hoja-titulo">{cola.length ? cola.length + " por resolver" : "Todo enviado"}</div>
            <div className="mst-hoja-sub">Pendientes e inciertos se verifican cada 20 segundos. Rechazos y fechas vencidas requieren revisión. Conservá los datos del navegador hasta regularizarlos.</div>
          </div>
          <button type="button" className="mst-quitar" disabled={Boolean(ocupado)} onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="mst-hoja-cuerpo" style={{ gap: 8 }}>
          {mensaje ? <div className="mst-aviso is-cian" role="status">{mensaje}</div> : null}
          {!cola.length ? <div className="mst-vacio">No queda nada pendiente.</div> : null}
          {cola.map((e) => {
            const r = e.resumen ?? {};
            const items = r.items ?? [];
            const estado = fechaRequiereRevision(e) ? "vencido" : e.estado;
            const corregible = estado === "rechazado" && !e.fueIncierto;
            return (
              <div key={e.id} className={"mst-envio" + (["rechazado", "vencido"].includes(estado) ? " is-error" : "")}>
                <div className="mst-fila">
                  <span className="mst-num" style={{ fontSize: 12, color: "var(--dim)" }}>{hora(e.creadoAt)}</span>
                  <strong style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{e.tipo === "devolucion" ? "Devolución" : "Retiro"}{r.quien ? " · " + r.quien : ""}</strong>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>{r.destino || ""}</span>
                </div>
                <div style={{ color: "var(--muted)" }}>
                  {items.map((it, i) => <span key={i}>{i ? " · " : ""}<span className="mst-num">{fmtNum(it.cantidad)}</span> {it.descripcion}</span>)}
                </div>
                <strong style={{ fontWeight: 600, color: ["rechazado", "vencido"].includes(estado) ? "var(--red)" : "var(--violet)" }}>{ESTADOS[estado] ?? "Resultado incierto"}</strong>
                {e.error ? <div className="mst-envio-error">{e.error}</div> : null}
                {estado === "vencido" ? <p style={{ margin: 0 }}>Descargá el original para regularizar con el coordinador. La app no lo enviará con otra fecha.</p> : null}
                <small className="mst-num" style={{ overflowWrap: "anywhere", color: "var(--dim)" }}>{e.id}</small>
                <div className="mst-fila">
                  <button type="button" className="ui-btn" disabled={Boolean(ocupado) || enviando} onClick={() => revisar(e.id)}>Comprobar los ids en el registro</button>
                  <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => descargarOriginal(e)}><Download size={14} /> Descargar original</button>
                  {corregible ? <button type="button" className="ui-btn" disabled={Boolean(ocupado) || enviando} onClick={() => { setEditando(e.id); setCambios({ sector: e.filas[0]?.sector ?? "", autorizadoPor: e.filas[0]?.autorizado_por ?? "", motivo: "" }); }}>Corregir destino o autorización</button> : null}
                </div>
                {editando === e.id ? (
                  <form onSubmit={(ev) => { ev.preventDefault(); revisar(e.id, cambios); }} style={{ display: "grid", gap: 8 }}>
                    <label className="mst-etiqueta">Sector correcto<CampoTexto required value={cambios.sector} disabled={Boolean(ocupado)} onChange={(sector) => setCambios({ ...cambios, sector })} onRafaga={() => setMensaje("Para marcar productos, cerrá la revisión.")} /></label>
                    <label className="mst-etiqueta">Quién autoriza<CampoTexto value={cambios.autorizadoPor} disabled={Boolean(ocupado)} onChange={(autorizadoPor) => setCambios({ ...cambios, autorizadoPor })} onRafaga={() => setMensaje("Para marcar productos, cerrá la revisión.")} /></label>
                    <label className="mst-etiqueta">Motivo de la corrección<CampoTexto required value={cambios.motivo} disabled={Boolean(ocupado)} onChange={(motivo) => setCambios({ ...cambios, motivo })} onRafaga={() => setMensaje("Para marcar productos, cerrá la revisión.")} /></label>
                    <span style={{ fontSize: 12, color: "var(--dim)" }}>Primero comprobamos todos los ids. El original y su fecha quedan conservados.</span>
                    <div className="mst-fila"><button type="button" className="ui-btn" disabled={Boolean(ocupado)} onClick={() => setEditando(null)}>Cancelar</button><button type="submit" className="ui-btn ui-btn-primario" disabled={Boolean(ocupado)}>{ocupado ? "Comprobando…" : "Verificar y conservar corrección"}</button></div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" disabled={Boolean(ocupado)} onClick={onCerrar}>Cerrar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={onReintentar} disabled={enviando || Boolean(ocupado) || !cola.some((e) => ["pendiente", "incierto"].includes(e.estado))}>
            {enviando ? <LoaderCircle size={15} className="mst-gira" /> : <RotateCcw size={15} />} Reintentar pendientes
          </button>
        </div>
      </div>
    </div>
  );
}
