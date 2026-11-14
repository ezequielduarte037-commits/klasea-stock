import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, History, Search } from "lucide-react";
import { ESTADOS_PRECIO, filtrarComparacion, pesos, porcentaje, resumenComparacion } from "./preciosLogica.js";

const COLUMNAS = [["codigo", "Código"], ["descripcion", "Producto"], ["estado", "Cambio"], ["antes", "Anterior"], ["ahora", "Esta lista"], ["pct", "Variación"]];
const TAMANO_PAGINA = 40;

export default function ComparacionPrecios({ filas, referencia, onHistorial }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todos");
  const [orden, setOrden] = useState("codigo");
  const [descendente, setDescendente] = useState(false);
  const [pagina, setPagina] = useState(1);
  const resumen = useMemo(() => resumenComparacion(filas), [filas]);
  const filtradas = useMemo(() => filtrarComparacion(filas, { busqueda, estado, orden, descendente }), [filas, busqueda, estado, orden, descendente]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = filtradas.slice((actual - 1) * TAMANO_PAGINA, actual * TAMANO_PAGINA);

  function ordenarPor(clave) {
    setDescendente(orden === clave ? !descendente : ["pct", "ahora", "antes"].includes(clave));
    setOrden(clave);
    setPagina(1);
  }

  return (
    <section className="precios-panel" aria-label="Comparación de precios">
      <div className="precios-titulo-fila">
        <div><h3>Comparación de costos</h3><p className="precios-ayuda">{referencia} · Pesos por unidad de compra.</p></div>
      </div>
      <div className="precios-resumen">
        <div><span>Subieron</span><strong className="precios-num" style={{ color: "var(--red)" }}>{resumen.subio}</strong></div>
        <div><span>Mediana del aumento</span><strong className="precios-num">{porcentaje(resumen.mediana)}</strong><small>Sobre las subas con porcentaje calculable.</small></div>
        <div><span>Bajaron</span><strong className="precios-num" style={{ color: "var(--green)" }}>{resumen.bajo}</strong></div>
        <div><span>Nuevos / discontinuados</span><strong className="precios-num">{resumen.nuevo} / {resumen.discontinuado}</strong></div>
      </div>
      <div className="precios-filtros">
        <label className="precios-buscar"><Search size={16} aria-hidden="true" /><input className="ui-input" value={busqueda} placeholder="Buscá código, producto o medida" aria-label="Buscar en la comparación" onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} /></label>
        <select className="ui-input" value={estado} aria-label="Filtrar por cambio" onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
          <option value="todos">Todos los cambios</option>
          {Object.entries(ESTADOS_PRECIO).map(([clave, info]) => <option key={clave} value={clave}>{info.texto}</option>)}
        </select>
        <select className="ui-input precios-orden-celular" value={orden} aria-label="Ordenar comparación" onChange={(e) => ordenarPor(e.target.value)}>
          {COLUMNAS.map(([clave, texto]) => <option key={clave} value={clave}>Orden: {texto}</option>)}
        </select>
        <button type="button" className="ui-btn precios-orden-celular" onClick={() => setDescendente(!descendente)} aria-label={descendente ? "Orden ascendente" : "Orden descendente"}>{descendente ? <ArrowDown size={15} /> : <ArrowUp size={15} />}</button>
      </div>
      <table className="precios-tabla">
        <thead><tr>{COLUMNAS.map(([clave, texto]) => <th key={clave} scope="col" aria-sort={orden === clave ? (descendente ? "descending" : "ascending") : "none"}><button type="button" onClick={() => ordenarPor(clave)}>{texto}{orden === clave && (descendente ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button></th>)}{onHistorial && <th scope="col"><span className="precios-sr">Historial</span></th>}</tr></thead>
        <tbody>{visibles.map((r) => (
          <tr key={r.codigo}>
            <td className="precios-codigo precios-num" data-label="Código">{r.codigo}</td>
            <td className="precios-producto"><span>{r.descripcion}</span>{r.medida && <small>{r.medida}</small>}{r.nuevo?.material_id && <small className="precios-vinculado">Vinculado a un consumible</small>}</td>
            <td data-label="Cambio"><span className="precios-estado" style={{ color: `var(--${ESTADOS_PRECIO[r.estado].tono})`, background: r.estado === "igual" ? "var(--panel-2)" : `var(--${ESTADOS_PRECIO[r.estado].tono}-soft)` }}>{ESTADOS_PRECIO[r.estado].texto}</span></td>
            <td className="precios-num" data-label="Anterior">{pesos(r.antes)}</td>
            <td className="precios-num" data-label="Esta lista">{pesos(r.ahora)}</td>
            <td className="precios-num" data-label="Variación" style={{ color: r.estado === "subio" ? "var(--red)" : r.estado === "bajo" ? "var(--green)" : "var(--muted)" }}>{porcentaje(r.pct)}{r.estado === "subio" && r.antes === 0 && <small>Parte de cero</small>}</td>
            {onHistorial && <td className="precios-historial-accion"><button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" aria-label={`Ver historial de ${r.codigo}`} title="Ver historial" onClick={() => onHistorial(r)}><History size={16} /></button></td>}
          </tr>
        ))}</tbody>
      </table>
      {!visibles.length && <div className="precios-vacio">No hay renglones para este filtro. Probá otra búsqueda.</div>}
      <div className="precios-paginado"><span className="precios-ayuda"><span className="precios-num">{filtradas.length}</span> renglones · Página <span className="precios-num">{actual} / {paginas}</span></span><div><button type="button" className="ui-btn" disabled={actual === 1} onClick={() => setPagina(actual - 1)}>Anterior</button><button type="button" className="ui-btn" disabled={actual === paginas} onClick={() => setPagina(actual + 1)}>Siguiente</button></div></div>
    </section>
  );
}
