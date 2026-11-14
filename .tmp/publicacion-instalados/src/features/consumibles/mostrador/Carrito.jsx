import { useState } from "react";
import { BadgeCheck, Minus, PenLine, Plus, Scale, ShoppingBasket, Undo2, X } from "lucide-react";
import CampoTexto from "./CampoTexto";
import { avisoStock, fmtNum, totalUnidades } from "./mostradorLogica";
import { FormaEtiqueta } from "./Piezas";
import FotoConsumible from "../FotoConsumible";

/**
 * El carrito: lo que se marcó, con su cantidad y lo que cada forma de entrega
 * necesita resolver antes de firmar (pesar, el usado del canje, el aviso de
 * préstamo). El stock se avisa pero nunca frena.
 */
export default function Carrito({
  carrito = [],
  porId,
  modo,
  persona,
  problemas = [],
  onSumar,
  onTeclado,
  onQuitar,
  onPeso,
  onCanje,
  onAutorizaCanje,
  onVaciar,
  onQuitarPersona,
  onFirmar,
  onRafaga,
}) {
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const devolucion = modo === "devolucion";
  const unidades = totalUnidades(carrito);

  function vaciar() {
    if (!confirmandoVaciar) {
      setConfirmandoVaciar(true);
      window.setTimeout(() => setConfirmandoVaciar(false), 3000);
      return;
    }
    setConfirmandoVaciar(false);
    onVaciar();
  }

  return (
    <>
      <div className="mst-car-cab">
        <ShoppingBasket size={17} aria-hidden="true" style={{ color: devolucion ? "var(--teal)" : "var(--blue)" }} />
        <span className="mst-car-titulo">{devolucion ? "Vuelve al pañol" : "Se lleva"}</span>
        <span className={`mst-car-total mst-num${devolucion ? " is-devolucion" : ""}`}>{carrito.length ? fmtNum(unidades) : ""}</span>
        {carrito.length ? (
          <button type="button" className={`ui-btn ${confirmandoVaciar ? "ui-btn-peligro" : "ui-btn-fantasma"}`} style={{ marginLeft: "auto", minHeight: 34 }} onClick={vaciar}>
            {confirmandoVaciar ? "Sí, vaciar" : "Vaciar"}
          </button>
        ) : null}
      </div>

      {persona ? (
        <div className="mst-firma-chip">
          <BadgeCheck size={15} aria-hidden="true" />
          <span>Firma {persona.nombre}</span>
          <button type="button" className="mst-quitar" onClick={onQuitarPersona} aria-label="Quitar a esta persona" style={{ color: "inherit" }}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="mst-car-lista">
        {!carrito.length ? (
          <div className="mst-car-vacio">
            <strong>{devolucion ? "¿Qué vuelve?" : "Todavía no pasó nada"}</strong>
            Pasá los productos por el lector o tocá los de la botonera. La tarjeta va al final, para firmar.
          </div>
        ) : carrito.map((l) => (
          <LineaCarrito
            key={l.key}
            linea={l}
            item={porId.get(l.materialId)}
            devolucion={devolucion}
            onSumar={onSumar}
            onTeclado={onTeclado}
            onQuitar={onQuitar}
            onPeso={onPeso}
            onCanje={onCanje}
            onAutorizaCanje={onAutorizaCanje}
            onRafaga={onRafaga}
          />
        ))}
      </div>

      <div className="mst-car-pie">
        <PieFirmar carrito={carrito} problemas={problemas} modo={modo} persona={persona} onFirmar={onFirmar} />
      </div>
    </>
  );
}

/** El botón de firmar con lo que falta resolver. En el celular va fijo abajo. */
export function PieFirmar({ carrito = [], problemas = [], modo, persona, onFirmar }) {
  const devolucion = modo === "devolucion";
  const unidades = totalUnidades(carrito);
  return (
    <>
      {problemas.length ? (
        <div className="mst-problemas" role="status">
          {problemas.slice(0, 3).map((p) => <div key={`${p.key}-${p.tipo}`}>{p.texto}</div>)}
          {problemas.length > 3 ? <div>y {problemas.length - 3} más</div> : null}
        </div>
      ) : null}
      <button
        type="button"
        className={`mst-btn-grande${devolucion ? " is-devolucion" : ""}`}
        disabled={!carrito.length || problemas.length > 0}
        onClick={onFirmar}
      >
        <PenLine size={19} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {devolucion
            ? `Registrar la devolución${carrito.length ? ` · ${fmtNum(unidades)}` : ""}`
            : persona?.nombre
              ? `Firmar · ${persona.nombre}`
              : `Firmar el retiro${carrito.length ? ` · ${fmtNum(unidades)}` : ""}`}
        </span>
        {carrito.length && !problemas.length ? <span className="mst-tecla" aria-hidden="true">Enter</span> : null}
      </button>
    </>
  );
}

export function LineaCarrito({ linea: l, item, devolucion, onSumar, onTeclado, onQuitar, onPeso, onCanje, onAutorizaCanje, onRafaga }) {
  const forma = item?.formaEntrega ?? "unidad";
  const aviso = devolucion ? null : avisoStock(item, l.cantidad);
  const esPeso = forma === "peso";
  const sinUsado = l.canje === "sin_usado";

  return (
    <div className="mst-linea">
      <span className="mst-destello" key={l.agregadoAt} aria-hidden="true" />
      <div className="mst-linea-fila">
        <FotoConsumible item={item} size={32} />
        <div className="mst-linea-texto">
          <div className="mst-linea-nombre">{item?.descripcion ?? "Consumible"}</div>
          <div className="mst-linea-sub">
            <span>{item?.unidad ?? "unidad"}</span>
            {aviso ? <span className={`mst-stock is-${aviso.nivel}`} style={{ fontFamily: "inherit" }}>{aviso.texto}</span> : null}
            <FormaEtiqueta forma={forma} />
          </div>
        </div>
        <div className="mst-cant">
          <button type="button" className="mst-paso" aria-label="Uno menos" onClick={() => onSumar(l.key, -1)}><Minus size={16} /></button>
          <button
            type="button"
            className="mst-cant-valor"
            aria-label={esPeso ? "Pesar o contar" : "Escribir la cantidad"}
            onClick={() => (esPeso ? onPeso(l.key) : onTeclado(l.key))}
          >
            {l.cantidad > 0 ? fmtNum(l.cantidad) : "—"}
          </button>
          <button type="button" className="mst-paso" aria-label="Uno más" onClick={() => onSumar(l.key, 1)}><Plus size={16} /></button>
        </div>
        <button type="button" className="mst-quitar" aria-label={`Sacar ${item?.descripcion ?? ""}`} onClick={() => onQuitar(l.key)}><X size={15} /></button>
      </div>

      {esPeso ? (
        <div className={`mst-extra${l.cantidad > 0 ? "" : " is-cian"}`}>
          <Scale size={14} aria-hidden="true" />
          {l.cantidad > 0
            ? <span><span className="mst-num">{fmtNum(l.cantidad)}</span> {item?.unidad ?? "piezas"}{l.gramos ? <> · <span className="mst-num">{fmtNum(l.gramos)}</span> g</> : null}</span>
            : <span>Falta pesar o contar</span>}
          <button type="button" className="mst-extra-btn" onClick={() => onPeso(l.key)}>{l.cantidad > 0 ? "Cambiar" : "Pesar"}</button>
        </div>
      ) : null}

      {forma === "canje" && !devolucion ? (
        <div className={`mst-extra${sinUsado ? " is-violeta" : ""}`}>
          <button
            type="button"
            role="switch"
            aria-checked={!sinUsado}
            className="mst-interruptor"
            onClick={() => onCanje(l.key, sinUsado)}
          >
            <span className="mst-interruptor-pista" aria-hidden="true" />
            Trajo el usado
          </button>
          {sinUsado ? (
            <CampoTexto
              value={l.autorizaCanje}
              onChange={(v) => onAutorizaCanje(l.key, v)}
              onRafaga={onRafaga}
              placeholder="¿Quién autoriza?"
              aria-label="Quién autoriza entregar sin el usado"
            />
          ) : null}
        </div>
      ) : null}

      {forma === "prestamo" ? (
        <div className="mst-extra is-azul">
          <Undo2 size={14} aria-hidden="true" />
          {devolucion ? "Vuelve el préstamo" : "Préstamo: tiene que volver al pañol"}
        </div>
      ) : null}
    </div>
  );
}
