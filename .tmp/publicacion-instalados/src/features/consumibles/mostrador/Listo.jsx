import { useEffect, useRef } from "react";
import { CloudOff, Undo2 } from "lucide-react";
import { DrawnCheck } from "@/components/ui/motion";
import { fmtNum } from "./mostradorLogica";

/**
 * Paso 3: listo. Se muestra unos segundos con qué, a quién y adónde, y el
 * mostrador vuelve a empezar solo. Si el pañolero pasa el próximo producto
 * mientras tanto, no se pierde: arranca el carrito siguiente con ese.
 */
export default function Listo({ resumen, onSiguiente }) {
  const botonRef = useRef(null);
  useEffect(() => { botonRef.current?.focus({ preventScroll: true }); }, []);
  const devolucion = resumen.tipo === "devolucion";

  return (
    <div className="mst-listo" role="status" aria-live="polite">
      <div className="mst-listo-caja">
        <div className={`mst-listo-check${devolucion ? " is-devolucion" : ""}`}>
          <DrawnCheck size={38} />
        </div>
        <h2>{resumen.sinConexion ? "Guardado en este equipo" : devolucion ? "Devolución registrada" : "Listo"}</h2>
        <div className="mst-listo-quien">
          <span className="mst-num">{fmtNum(resumen.unidades)}</span>
          {devolucion
            ? <>{" vuelven al pañol"}{resumen.quien ? <> · <strong>{resumen.quien}</strong></> : null}</>
            : <>{" a nombre de "}<strong>{resumen.quien || "—"}</strong></>}
          {resumen.destino ? <> · <strong>{resumen.destino}</strong></> : null}
          {resumen.metodo === "sin_tarjeta" ? " · sin tarjeta" : ""}
        </div>

        {resumen.sinConexion ? (
          <div className="mst-aviso" style={{ textAlign: "left" }}>
            <CloudOff size={16} />
            <div className="mst-aviso-texto">{resumen.estadoEnvio === "incierto"
              ? "La red no confirmó el resultado. Conservamos los mismos ids y verificamos el registro al reintentar."
              : "Todavía no se envió. Quedó guardado en este equipo y sale cuando vuelva la red."}</div>
          </div>
        ) : null}

        {resumen.prestamos?.length && !devolucion ? (
          <div className="mst-aviso is-cian" style={{ textAlign: "left" }}>
            <Undo2 size={16} />
            <div className="mst-aviso-texto">Tiene que volver al pañol: {resumen.prestamos.join(", ")}.</div>
          </div>
        ) : null}

        <div className="mst-listo-items">
          {resumen.items.map((it) => (
            <div key={it.key} className={`mst-resumen-fila${devolucion ? " is-devolucion" : ""}`}>
              <span className="mst-num">{fmtNum(it.cantidad)}</span>
              <span>
                {it.descripcion}
                {it.gramos ? <small> · <span className="mst-num">{fmtNum(it.gramos)}</span> g</small> : null}
                {it.canje === "sin_usado" ? <small> · sin el usado</small> : null}
              </span>
              <small>{it.unidad}</small>
            </div>
          ))}
        </div>

        <div className="mst-listo-tiempo" aria-hidden="true"><i /></div>
        <button ref={botonRef} type="button" className="mst-btn-grande" onClick={onSiguiente}>
          Sigue el próximo <span className="mst-tecla" aria-hidden="true">Enter</span>
        </button>
      </div>
    </div>
  );
}
