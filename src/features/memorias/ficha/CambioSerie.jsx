// Cambio sobre algo que viene de serie (ej.: un faro más grande, otro modelo de
// aire). Lo de serie no se pregunta ni se imprime; sólo lo que cambia en este
// barco. Se guarda como nota del equipo.
import { Ban, Layers3, PackagePlus, RotateCcw } from "lucide-react";
import { Modal } from "../ui";
import { NO_LLEVA } from "../decisiones";

export default function CambioSerie({ campo, linea, cambio, puedeNota, onCambio, onCerrar, onIrAdicionales }) {
  const noLleva = /^\s*no lleva\s*$/i.test(cambio || "");
  return (
    <Modal
      titulo={`${campo.label} · de serie en la ${linea}`}
      sub="Lo de serie no hace falta cargarlo. Anotá sólo si este barco lleva otra cosa."
      onCerrar={onCerrar}
      pie={<button type="button" className="ui-btn ui-btn-primario chico" onClick={onCerrar}>Listo</button>}
    >
      <div className="mem-info" data-tono="verde">
        <Layers3 size={15} />
        <span>Viene de serie: <b>{campo.serie}</b></span>
      </div>
      {puedeNota ? (
        <>
          <label className="mem-otro" style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
            <span>¿Qué cambia en este barco?</span>
            <input
              className="ui-input"
              value={noLleva ? "" : cambio || ""}
              onChange={(e) => onCambio(e.target.value)}
              placeholder={`Ej.: ${campo.label.toLowerCase()} más grande, otro modelo, otra ubicación`}
              autoFocus
            />
          </label>
          <div className="mem-chips-elegir">
            <button type="button" className={`mem-no-lleva${noLleva ? " on" : ""}`} aria-pressed={noLleva} onClick={() => onCambio(noLleva ? "" : NO_LLEVA)}>
              <Ban size={14} /> Este barco no lo lleva
            </button>
            {String(cambio || "").trim() && (
              <button type="button" className="mem-no-lleva" onClick={() => onCambio("")}>
                <RotateCcw size={14} /> Volver a lo de serie
              </button>
            )}
          </div>
          <div className="mem-info" data-tono="azul">
            <PackagePlus size={15} />
            <span>
              Si hay que comprar otro, sumalo también en Adicionales para que llegue a Compras.{" "}
              <button type="button" className="mem-link" onClick={onIrAdicionales}>Ir a Adicionales</button>
            </span>
          </div>
        </>
      ) : (
        <div className="mem-info" data-tono="rojo">
          <Ban size={15} />
          <span>
            Para anotar cambios en {campo.label.toLowerCase()} falta aplicar la actualización de la base de Memorias
            (<b>20261005120000_memorias_notas_y_cambios.sql</b>). Mientras tanto, anotalo en Adicionales.
          </span>
        </div>
      )}
    </Modal>
  );
}
