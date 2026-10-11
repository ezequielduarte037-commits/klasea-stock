import { Search } from "lucide-react";
import { avisoStock } from "./mostradorLogica";
import { FormaEtiqueta, FotoItem, StockTexto } from "./Piezas";

/**
 * Lo que se toca con el dedo: la botonera de los más pedidos (con foto, blancos
 * grandes) o, mientras se escribe en el campo del lector, los resultados de la
 * búsqueda. Enter en el campo elige el resultado resaltado.
 */
export default function Botonera({ favoritos = [], resultados = [], buscando = false, texto = "", resaltado = 0, enCarrito, modo, onElegir, onResaltar }) {
  const devolucion = modo === "devolucion";

  if (buscando) {
    return (
      <section aria-label="Resultados de la búsqueda">
        <div className="mst-titulo-seccion">
          <Search size={12} aria-hidden="true" />
          {resultados.length ? <>Resultados <span className="mst-num">{resultados.length}</span></> : "Sin resultados"}
        </div>
        {resultados.length ? (
          <div className="mst-resultados" role="listbox" aria-label="Consumibles encontrados">
            {resultados.map((item, i) => {
              const cuenta = enCarrito.get(item.id) ?? 0;
              const aviso = avisoStock(item, cuenta);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={i === resaltado}
                  className={`mst-res${i === resaltado ? " is-activa" : ""}`}
                  onMouseEnter={() => onResaltar?.(i)}
                  onClick={() => onElegir(item)}
                >
                  <span className="mst-res-foto"><FotoItem item={item} /></span>
                  <span className="mst-res-texto">
                    <span className="mst-res-nombre" style={{ display: "block" }}>{item.descripcion}</span>
                    <span className="mst-res-sub" style={{ display: "block" }}>
                      {[item.rubro, item.ubicacion ? `Ubic. ${item.ubicacion}` : null, item.codigoEtiqueta].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="mst-res-fin">
                    <FormaEtiqueta forma={item.formaEntrega} />
                    <StockTexto aviso={aviso} unidad={item.unidad} />
                    {cuenta ? <span className="mst-num" style={{ color: devolucion ? "var(--teal)" : "var(--blue)", fontWeight: 700 }}>×{cuenta}</span> : null}
                    {i === resaltado ? <span className="mst-res-enter" aria-hidden="true">Enter</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mst-vacio">
            Nada coincide con «{texto.trim()}». Si es un código, pasalo por el lector o tocá Enter para vincularlo.
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Los más pedidos">
      <div className="mst-titulo-seccion">Los más pedidos</div>
      {favoritos.length ? (
        <div className="mst-tiles">
          {favoritos.map((item) => {
            const cuenta = enCarrito.get(item.id) ?? 0;
            const aviso = avisoStock(item, cuenta);
            return (
              <button
                key={item.id}
                type="button"
                className={`mst-tile${devolucion ? " is-devolucion" : ""}`}
                onClick={() => onElegir(item)}
                aria-label={`${item.descripcion}${cuenta ? `, ${cuenta} en el carrito` : ""}`}
              >
                <span className="mst-tile-foto"><FotoItem item={item} /></span>
                {cuenta ? <span className="mst-tile-cuenta mst-num">{cuenta.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span> : null}
                <span className="mst-tile-cuerpo">
                  <span className="mst-tile-nombre">{item.descripcion}</span>
                  <span className="mst-tile-meta">
                    <StockTexto aviso={aviso} />
                    <FormaEtiqueta forma={item.formaEntrega} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mst-vacio">Todavía no hay favoritos. Buscá por nombre en el campo de arriba.</div>
      )}
    </section>
  );
}
