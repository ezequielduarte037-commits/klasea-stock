import { Search, Warehouse } from "lucide-react";
import { FotoItem } from "@/features/consumibles/mostrador/Piezas";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";
import { LIBRE, origenDe } from "./mostradorPanolLogica";

/**
 * Lo que se toca con el dedo. Sin buscar nada: las obras con saldo como
 * botones grandes (es como llega la gente: "vengo por lo del 52-27"). Con una
 * obra elegida o escribiendo en el lector: los productos, cada uno con su saldo
 * por ubicación. Tocar el saldo suma uno de ahí; tocar el nombre, de la obra
 * elegida (o pregunta de dónde, si hay más de un lugar).
 */
export default function BotoneraPanol({
  riel = [],
  origen,
  onOrigen,
  buscando = false,
  texto = "",
  productos = [],
  resaltado = 0,
  onResaltar,
  enCarrito,
  onMarcar,
  onBuscarTodo,
}) {
  const elegido = riel.find((r) => r.key === origen);

  return (
    <>
      {/* Sin obra elegida ni búsqueda, las obras ya están abajo como botones grandes. */}
      {buscando || origen ? (
      <section aria-label="De qué obra">
        <div className="mst-titulo-seccion">¿De qué obra?</div>
        <div className="mpn-riel" role="group" aria-label="Filtrar por obra">
          <button type="button" className={`mpn-origen${!origen ? " is-elegido" : ""}`} aria-pressed={!origen} onClick={() => onOrigen(null)}>
            Todo el pañol
          </button>
          {riel.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`mpn-origen${r.libre ? " is-libre" : ""}${r.cerrada ? " is-cerrada" : ""}${origen === r.key ? " is-elegido" : ""}`}
              aria-pressed={origen === r.key}
              title={r.cerrada ? "Obra cerrada: lo que quedó en el pañol" : r.descripcion || undefined}
              onClick={() => onOrigen(origen === r.key ? null : r.key)}
            >
              <strong>{r.codigo}</strong>
              <span className="mst-num">{r.productos}</span>
            </button>
          ))}
        </div>
      </section>
      ) : null}

      {buscando || origen ? (
        <section aria-label={buscando ? "Resultados de la búsqueda" : `Productos de ${elegido?.codigo ?? "la obra"}`}>
          <div className="mst-titulo-seccion">
            {buscando ? <Search size={12} aria-hidden="true" /> : null}
            {buscando
              ? (productos.length ? <>Resultados <span className="mst-num">{productos.length}</span></> : "Sin resultados")
              : <>{elegido?.libre ? "Stock libre" : elegido?.codigo} <span className="mst-num">{productos.length}</span></>}
            {buscando && elegido ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· en {elegido.codigo}</span> : null}
          </div>
          {productos.length ? (
            <div className="mst-resultados" role="listbox" aria-label="Productos con saldo">
              {productos.map((g, i) => (
                <ProductoFila
                  key={g.key}
                  grupo={g}
                  origen={origen}
                  activa={buscando && i === resaltado}
                  enCarrito={enCarrito}
                  onResaltar={buscando ? () => onResaltar?.(i) : undefined}
                  onMarcar={onMarcar}
                />
              ))}
            </div>
          ) : (
            <div className="mst-vacio" style={{ display: "grid", gap: 10 }}>
              {buscando ? `Nada con saldo coincide con «${texto.trim()}».` : "Esta obra no tiene nada para entregar."}
              {buscando && origen ? (
                <button type="button" className="ui-btn mpn-buscar-todo" onClick={onBuscarTodo}>Buscar en todo el pañol</button>
              ) : null}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Obras con material en el pañol">
          <div className="mst-titulo-seccion">Elegí la obra o pasá el código</div>
          {riel.length ? (
            <div className="mst-obras">
              {riel.map((r) => (
                <button key={r.key} type="button" className={`mst-obra mpn-obra-tile${r.libre ? " is-libre" : ""}`} onClick={() => onOrigen(r.key)} style={r.cerrada ? { opacity: 0.75 } : undefined}>
                  <strong>{r.libre ? <><Warehouse size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />Stock libre</> : r.codigo}</strong>
                  <span className="mpn-obra-cuenta">
                    {r.productos === 1 ? "1 producto" : `${r.productos} productos`}
                    {r.cerrada ? " · obra cerrada" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mst-vacio">No hay material para entregar en esta sede.</div>
          )}
        </section>
      )}
    </>
  );
}

function ProductoFila({ grupo: g, origen, activa, enCarrito, onResaltar, onMarcar }) {
  const saldos = origen ? g.conSaldo.filter((l) => origenDe(l) === origen) : g.conSaldo;
  const sub = [g.codigo, g.tipoPedido === "adicional" ? "adicional" : null, g.esRequisito ? "elegir cuál" : null].filter(Boolean).join(" · ");
  return (
    <div
      className={`mst-res mpn-prod${activa ? " is-activa" : ""}`}
      role="option"
      aria-selected={Boolean(activa)}
      onMouseEnter={onResaltar}
    >
      <button type="button" className="mpn-prod-main" onClick={() => onMarcar(g, null)}>
        <span className="mst-res-foto"><FotoItem item={{ descripcion: g.label, imagenUrl: g.imagenUrl }} /></span>
        <span className="mst-res-texto">
          <span className="mst-res-nombre" style={{ display: "block" }}>{g.label}</span>
          <span className="mst-res-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {g.ubicacion ? <span className="mpn-ubic" title={g.ubicacion_obs || "Estantería"}>{g.ubicacion}</span> : null}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{sub || g.unidad}</span>
          </span>
        </span>
        {activa ? <span className="mst-res-enter" aria-hidden="true">Enter</span> : null}
      </button>
      <span className="mpn-prod-fin">
        {saldos.map((l) => {
          const enCar = enCarrito.get(`${g.key}::${l.key}`) ?? 0;
          const libre = origenDe(l) === LIBRE;
          return (
            <button
              key={l.key}
              type="button"
              className={`mpn-saldo${libre ? " is-libre" : ""}${enCar ? " is-en-carrito" : ""}`}
              onClick={() => onMarcar(g, l)}
              aria-label={`Sumar uno de ${libre ? "stock libre" : l.label}: hay ${fmtNum(l.available)}${enCar ? `, ${fmtNum(enCar)} en el carrito` : ""}`}
            >
              <span>{libre ? "Libre" : l.label}</span>
              <span className="mst-num">{fmtNum(l.available)}</span>
              {enCar ? <span className="mst-num" style={{ color: "var(--blue)" }}>×{fmtNum(enCar)}</span> : null}
            </button>
          );
        })}
      </span>
    </div>
  );
}
