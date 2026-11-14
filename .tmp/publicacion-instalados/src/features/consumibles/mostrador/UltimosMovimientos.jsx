import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CloudOff, RotateCcw } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { fetchUltimosMovimientos } from "./mostradorApi";
import { agruparMovimientos, fmtNum } from "./mostradorLogica";
import { claveDia } from "../conteo/conteoCalculos";
import FotoConsumible from "../FotoConsumible";

const hora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const mismoDia = claveDia(d) === claveDia(hoy);
  return mismoDia
    ? d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
};

/**
 * Los últimos 20 retiros y devoluciones de esta sede, por carrito, para
 * corregir un error en el momento: ANULAR pide el motivo y deja la fila
 * tachada (el registro no se borra). Lo que vino de la lista planificada se
 * corrige en la solicitud, no acá.
 */
export default function UltimosMovimientos({ sede, version = 0, pendientes = 0, onAbrirCola, onAnular, onEditar }) {
  const [movs, setMovs] = useState(null);
  const [error, setError] = useState("");
  const [tic, setTic] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetchUltimosMovimientos({ sede })
      .then((d) => { if (vivo) { setMovs(d); setError(""); } })
      .catch((e) => { if (vivo) setError(e?.message || "No se pudieron traer los movimientos."); });
    return () => { vivo = false; };
  }, [sede, version, tic]);

  // Otros equipos también registran (la lista planificada, otro mostrador).
  useEffect(() => {
    const reloj = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  const grupos = useMemo(() => agruparMovimientos(movs ?? [], 20), [movs]);

  return (
    <section aria-label="Últimos movimientos">
      <div className="mst-movs-cab">
        <h3>Últimos movimientos</h3>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>{sede}</span>
        <button type="button" className="mst-icono-btn" style={{ width: 32, height: 32 }} onClick={() => setTic((n) => n + 1)} aria-label="Actualizar movimientos">
          <RotateCcw size={14} />
        </button>
      </div>

      {pendientes ? (
        <div className="mst-pendiente">
          <CloudOff size={14} aria-hidden="true" />
          {pendientes === 1 ? "1 sin enviar" : `${pendientes} sin enviar`}
          <button type="button" onClick={onAbrirCola}>Ver</button>
        </div>
      ) : null}

      {error ? <div className="mst-error" style={{ margin: 14 }}>{error}</div> : null}
      {!movs && !error ? <Cargando compacto texto="Trayendo movimientos…" /> : null}
      {movs && !grupos.length ? <div className="mst-vacio">Todavía no hay retiros en esta sede.</div> : null}

      {grupos.map((g) => {
        const devolucion = g.tipo === "devolucion";
        const filas = g.anulado ? g.filas : g.activas;
        const porMaterial = new Map();
        for (const f of filas) {
          const k = f.material_id;
          const actual = porMaterial.get(k) ?? { descripcion: f.material?.descripcion ?? "Consumible", imagenUrl: f.material?.imagen_url, cantidad: 0 };
          actual.cantidad += Math.abs(Number(f.cantidad) || 0);
          porMaterial.set(k, actual);
        }
        const items = [...porMaterial.values()];
        const motivo = g.filas.find((f) => f.anulado_motivo)?.anulado_motivo;
        return (
          <div key={g.clave} className={`mst-mov${g.anulado ? " is-anulado" : ""}`}>
            <div className="mst-mov-fila">
              <span className={`mst-tipo is-${devolucion ? "devolucion" : "retiro"}`} aria-label={devolucion ? "Devolución" : "Retiro"}>
                {devolucion ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
              </span>
              <span className="mst-mov-hora">{hora(g.createdAt)}</span>
              <span className="mst-mov-quien">{g.empleado || (devolucion ? "Sin nombre" : "—")}</span>
              {g.anulable && onEditar ? <button type="button" className="mst-mov-anular" style={{ color: "var(--blue)" }} onClick={() => onEditar(g)}>Editar</button> : null}
              {g.anulable ? (
                <button type="button" className="mst-mov-anular" onClick={() => onAnular(g)}>Anular</button>
              ) : null}
            </div>
            <div className="mst-mov-items">
              {items.slice(0, 4).map((it, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}><FotoConsumible item={it} size={24} /><span className="mst-num">{fmtNum(it.cantidad)}</span> {it.descripcion}</span>
              ))}
              {items.length > 4 ? <span> y {items.length - 4} más</span> : null}
            </div>
            <div className="mst-mov-sub">
              {[g.destino, g.carril === "planificado" ? "lista planificada" : null, g.metodoFirma === "sin_tarjeta" ? "sin tarjeta" : null].filter(Boolean).join(" · ")}
              {g.anulado ? <span style={{ color: "var(--red)" }}>{` · Anulado${motivo ? `: ${motivo}` : ""}`}</span> : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
