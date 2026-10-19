import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpFromLine, RotateCcw, Warehouse } from "lucide-react";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";
import { ultimosMovimientos } from "./mostradorPanolLogica";

const hora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opciones = { timeZone: "America/Argentina/Buenos_Aires" };
  const hoy = new Date().toLocaleDateString("es-AR", opciones) === d.toLocaleDateString("es-AR", opciones);
  return hoy
    ? d.toLocaleTimeString("es-AR", { ...opciones, hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { ...opciones, day: "2-digit", month: "2-digit" });
};

/**
 * Los últimos retiros y asignaciones de la sede, por carrito. Sale del mismo
 * ledger que ya está cargado: no hace otra consulta. Para corregir uno se va
 * al kardex del producto en Stock (ahí se anula con motivo).
 */
export default function UltimosPanol({ rows = [], obras = [], sede, onActualizar }) {
  const grupos = useMemo(() => ultimosMovimientos(rows, { obras, sede, limite: 20 }), [rows, obras, sede]);

  return (
    <section aria-label="Últimos movimientos">
      <div className="mst-movs-cab">
        <h3>Últimos movimientos</h3>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>{sede}</span>
        {onActualizar ? (
          <button type="button" className="mst-icono-btn" style={{ width: 32, height: 32 }} onClick={onActualizar} aria-label="Actualizar movimientos">
            <RotateCcw size={14} />
          </button>
        ) : null}
      </div>

      {!grupos.length ? <div className="mst-vacio">Todavía no hay egresos en esta sede.</div> : null}

      {grupos.map((g) => {
        const asignacion = g.tipo === "asignacion";
        return (
          <div key={g.clave} className={`mst-mov${g.anulado ? " is-anulado" : ""}`}>
            <div className="mst-mov-fila">
              <span className="mst-tipo is-retiro" style={asignacion ? { color: "var(--teal)", background: "var(--teal-soft)" } : undefined} aria-label={asignacion ? "Asignación" : "Retiro"}>
                {asignacion ? <Warehouse size={13} /> : <ArrowUpFromLine size={13} />}
              </span>
              <span className="mst-mov-hora">{hora(g.at)}</span>
              <span className="mst-mov-quien">{g.quien || (asignacion ? "Asignación" : "Sin nombre")}</span>
            </div>
            <div className="mst-mov-items">
              {g.items.slice(0, 3).map((it, i) => (
                <span key={i} style={{ marginRight: 8 }}><span className="mst-num">{fmtNum(it.cantidad)}</span> {it.descripcion}</span>
              ))}
              {g.items.length > 3 ? <span> y {g.items.length - 3} más</span> : null}
            </div>
            <div className="mst-mov-sub">
              → {g.destino}
              {g.anulado ? <span style={{ color: "var(--red)" }}> · anulado</span> : null}
            </div>
          </div>
        );
      })}

      <div style={{ padding: "12px 14px" }}>
        <Link to="/stock-panol?tab=movimientos" className="ui-btn ui-btn-fantasma" style={{ width: "100%", justifyContent: "center" }}>
          Ver todo el historial
        </Link>
      </div>
    </section>
  );
}
