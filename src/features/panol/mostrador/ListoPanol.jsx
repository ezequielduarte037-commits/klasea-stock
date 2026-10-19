import { useEffect, useRef } from "react";
import { DrawnCheck } from "@/components/ui/motion";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";

/**
 * Paso 3: listo. Qué salió, a nombre de quién y adónde, unos segundos, y el
 * mostrador vuelve a empezar solo. Si pasan el próximo producto mientras
 * tanto, no se pierde: arranca el carrito siguiente con ese.
 */
export default function ListoPanol({ resumen, onSiguiente }) {
  const botonRef = useRef(null);
  useEffect(() => { botonRef.current?.focus({ preventScroll: true }); }, []);
  const asignar = resumen.tipo === "asignar";

  return (
    <div className="mst-listo" role="status" aria-live="polite">
      <div className="mst-listo-caja">
        <div className="mst-listo-check" style={asignar ? { background: "var(--teal-soft)", borderColor: "var(--teal-border)", color: "var(--teal)" } : undefined}>
          <DrawnCheck size={38} />
        </div>
        <h2>{asignar ? "Asignado" : "Listo"}</h2>
        <div className="mst-listo-quien">
          <span className="mst-num">{fmtNum(resumen.unidades)}</span>
          {asignar
            ? <>{" quedan reservados a "}<strong>{resumen.destino || "la obra"}</strong></>
            : <>{" a nombre de "}<strong>{resumen.quien || "—"}</strong>{resumen.destino ? <> · <strong>{resumen.destino}</strong></> : null}</>}
          {!asignar && resumen.metodo !== "nfc" ? " · sin tarjeta" : ""}
        </div>

        <div className="mst-listo-items">
          {resumen.items.map((it) => (
            <div key={it.key} className="mst-resumen-fila">
              <span className="mst-num" style={asignar ? { color: "var(--teal)" } : undefined}>{fmtNum(it.cantidad)}</span>
              <span>
                {it.descripcion}
                {it.detalle ? <small> · {it.detalle}</small> : null}
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
