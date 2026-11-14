import { useState } from "react";
import { BadgeCheck, Minus, Pause, PenLine, Plus, ShoppingBasket, Warehouse, X } from "lucide-react";
import { availableForVariant } from "@/features/panol/stockGrupos";
import { FotoItem } from "@/features/consumibles/mostrador/Piezas";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";
import { cantidadDe, carritoPorOrigen, sinPrefijo, totalUnidades, variantesQueFaltan } from "./mostradorPanolLogica";

/**
 * El carrito, agrupado por de dónde sale: stock libre primero, después lo
 * reservado a cada obra. La cantidad arranca en uno y nunca pasa lo que hay;
 * las variantes y el producto concreto de un requisito se eligen con chips.
 */
export default function CarritoPanol({
  cart = [],
  obras = [],
  modo,
  persona,
  problemas = [],
  ubicacionDe,
  pausados = 0,
  onSumar,
  onTeclado,
  onQuitar,
  onTodo,
  onVariante,
  onOtraVariante,
  onProducto,
  onVaciar,
  onPausar,
  onVerPausados,
  onQuitarPersona,
  onFirmar,
}) {
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const asignar = modo === "asignar";
  const grupos = carritoPorOrigen(cart, obras);

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
        <ShoppingBasket size={17} aria-hidden="true" style={{ color: asignar ? "var(--teal)" : "var(--blue)" }} />
        <span className="mst-car-titulo">{asignar ? "Se asigna" : "Se lleva"}</span>
        <span className={`mst-car-total mst-num${asignar ? " is-asignar" : ""}`}>{cart.length ? fmtNum(totalUnidades(cart)) : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {cart.length ? (
            <>
              <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 34 }} onClick={onPausar} title="Guardarlo para seguir después y atender al próximo">
                <Pause size={14} aria-hidden="true" /> Pausar
              </button>
              <button type="button" className={`ui-btn ${confirmandoVaciar ? "ui-btn-peligro" : "ui-btn-fantasma"}`} style={{ minHeight: 34 }} onClick={vaciar}>
                {confirmandoVaciar ? "Sí, vaciar" : "Vaciar"}
              </button>
            </>
          ) : pausados ? (
            <button type="button" className="ui-btn" style={{ minHeight: 34 }} onClick={onVerPausados}>
              Pausados <span className="mst-num">{pausados}</span>
            </button>
          ) : null}
        </span>
      </div>

      {persona ? (
        <div className="mst-firma-chip">
          <BadgeCheck size={15} aria-hidden="true" />
          <span>Retira {persona.nombre}</span>
          <button type="button" className="mst-quitar" onClick={onQuitarPersona} aria-label="Quitar a esta persona" style={{ color: "inherit" }}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="mst-car-lista">
        {!cart.length ? (
          <div className="mst-car-vacio">
            <strong>{asignar ? "¿Qué se reserva?" : "Todavía no pasó nada"}</strong>
            {asignar
              ? "Marcá lo que queda en el pañol reservado a una obra. Después elegís la obra."
              : "Pasá los productos por el lector o elegí la obra y tocá lo que se lleva. La tarjeta va al final, para firmar."}
          </div>
        ) : grupos.map((g) => (
          <div key={g.key}>
            <div className={`mpn-grupo-cab${g.obraId ? " is-obra" : ""}`}>
              <i aria-hidden="true" />
              <span>{g.titulo}</span>
            </div>
            {g.lineas.map((l) => (
              <LineaPanol
                key={l.key}
                linea={l}
                cart={cart}
                ubicacion={ubicacionDe?.(l.groupKey)}
                problema={problemas.find((p) => p.key === l.key)}
                onSumar={onSumar}
                onTeclado={onTeclado}
                onQuitar={onQuitar}
                onTodo={onTodo}
                onVariante={onVariante}
                onOtraVariante={onOtraVariante}
                onProducto={onProducto}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mst-car-pie">
        <PieFirmarPanol cart={cart} problemas={problemas} modo={modo} persona={persona} onFirmar={onFirmar} />
      </div>
    </>
  );
}

/** El botón de seguir con lo que falta resolver. En el celular va fijo abajo. */
export function PieFirmarPanol({ cart = [], problemas = [], modo, persona, onFirmar }) {
  const asignar = modo === "asignar";
  const total = fmtNum(totalUnidades(cart));
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
        className={`mst-btn-grande${asignar ? " is-asignar" : ""}`}
        disabled={!cart.length || problemas.length > 0}
        onClick={onFirmar}
      >
        {asignar ? <Warehouse size={19} aria-hidden="true" style={{ flexShrink: 0 }} /> : <PenLine size={19} aria-hidden="true" style={{ flexShrink: 0 }} />}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {asignar
            ? `Elegir la obra${cart.length ? ` · ${total}` : ""}`
            : persona?.nombre ? `Firmar · ${persona.nombre}` : `Firmar el retiro${cart.length ? ` · ${total}` : ""}`}
        </span>
        {cart.length && !problemas.length ? <span className="mst-tecla" aria-hidden="true">Enter</span> : null}
      </button>
    </>
  );
}

export function LineaPanol({ linea: l, cart, ubicacion, problema, onSumar, onTeclado, onQuitar, onTodo, onVariante, onOtraVariante, onProducto, soloLectura = false }) {
  const [sumandoVariante, setSumandoVariante] = useState(false);
  const cantidad = cantidadDe(l);
  const excede = cantidad > (l.available ?? 0) + 0.0001;
  const faltan = !l.esRequisito && l.variantes?.length ? variantesQueFaltan(cart, l.key) : [];

  return (
    <div className="mst-linea">
      <span className="mst-destello" key={l.agregadoAt} aria-hidden="true" />
      <div className="mst-linea-fila">
        <span className="mst-res-foto" style={{ width: 34, height: 34, borderRadius: 9 }}>
          <FotoItem item={{ descripcion: l.label, imagenUrl: l.material?.imagen_url }} />
        </span>
        <div className="mst-linea-texto">
          <div className="mst-linea-nombre">{l.label}</div>
          <div className="mst-linea-sub">
            {ubicacion ? <span className="mpn-ubic">{ubicacion}</span> : null}
            <span className={`mst-stock is-${excede ? "negativo" : "ok"}`}>hay {fmtNum(l.available ?? 0)}</span>
            <span>{l.unidad || "unidad"}</span>
            {!soloLectura && cantidad < (l.available ?? 0) - 0.0001 && (l.available ?? 0) > 1 ? (
              <button type="button" className="mpn-todo" onClick={() => onTodo(l.key)}>Todo · {fmtNum(l.available)}</button>
            ) : null}
          </div>
        </div>
        {soloLectura ? (
          <span className="mst-num" style={{ fontSize: 16, fontWeight: 700 }}>{fmtNum(cantidad)}</span>
        ) : (
          <>
            <div className="mst-cant">
              <button type="button" className="mst-paso" aria-label="Uno menos" onClick={() => onSumar(l.key, -1)}><Minus size={16} /></button>
              <button type="button" className="mst-cant-valor" aria-label="Escribir la cantidad" onClick={() => onTeclado(l.key)} style={excede ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}>
                {cantidad > 0 ? fmtNum(cantidad) : "—"}
              </button>
              <button type="button" className="mst-paso" aria-label="Uno más" disabled={cantidad >= (l.available ?? 0) - 0.0001} onClick={() => onSumar(l.key, 1)}><Plus size={16} /></button>
            </div>
            <button type="button" className="mst-quitar" aria-label={`Sacar ${l.label}`} onClick={() => onQuitar(l.key)}><X size={15} /></button>
          </>
        )}
      </div>

      {l.esRequisito ? (
        <div className="mpn-chips" role="group" aria-label="Qué producto concreto sale">
          <span className="mpn-chips-titulo">¿Cuál?</span>
          {(l.productosCompatibles || []).length ? l.productosCompatibles.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`mpn-chip is-producto${l.productoMaterialId === p.id ? " is-elegida" : ""}${!l.productoMaterialId ? " is-falta" : ""}`}
              aria-pressed={l.productoMaterialId === p.id}
              disabled={soloLectura}
              onClick={() => onProducto(l.key, p.id)}
              title={[p.descripcion, p.codigo].filter(Boolean).join(" · ")}
            >
              {sinPrefijo(p.descripcion, l.label)}
            </button>
          )) : <span style={{ fontSize: 12, color: "var(--red)" }}>No tiene productos compatibles cargados. Revisalo en Materiales.</span>}
        </div>
      ) : null}

      {!l.esRequisito && l.variantes?.length ? (
        <div className="mpn-chips" role="group" aria-label="Variante">
          <span className="mpn-chips-titulo">Variante</span>
          {["", ...l.variantes].map((v) => {
            const hay = availableForVariant({ available: l.locationAvailable, porVariante: l.porVariante }, v);
            const elegida = (l.variante || "") === v;
            return (
              <button
                key={v || "sin"}
                type="button"
                className={`mpn-chip${elegida ? (v ? " is-elegida" : " is-neutra") : ""}`}
                aria-pressed={elegida}
                disabled={soloLectura}
                onClick={() => onVariante(l.key, v)}
              >
                {v || "Sin especificar"} {v ? <span className="mst-num">{fmtNum(hay)}</span> : null}
              </button>
            );
          })}
          {!soloLectura && faltan.length ? (sumandoVariante ? faltan.map((v) => (
            <button key={`mas-${v}`} type="button" className="mpn-chip is-mas" onClick={() => { setSumandoVariante(false); onOtraVariante(l.key, v); }}>
              + {v}
            </button>
          )) : (
            <button type="button" className="mpn-chip is-mas" onClick={() => setSumandoVariante(true)}>+ Otra variante</button>
          )) : null}
        </div>
      ) : null}

      {problema && problema.tipo !== "producto" ? <div style={{ fontSize: 12, color: "var(--red)" }}>{problema.texto}</div> : null}
    </div>
  );
}
