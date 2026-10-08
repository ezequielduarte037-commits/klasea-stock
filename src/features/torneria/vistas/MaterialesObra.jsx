import { Check, Edit3, FileText, Link2, Plus, ShoppingCart } from "lucide-react";
import { cantidadTexto, diasEntre, fmtDate, groupRows } from "../torneriaEstado";
import { GROUP_COLORS, fotoDelMaterial } from "../circuitoDatos";
import { CatalogTechnicalName, FotoMaterial, RecepcionAnticipada } from "../circuito";

const PURCHASE_STATES = [
  ["pendiente_solicitud", "Sin pedir"],
  ["solicitado", "Pedido"],
  ["comprado", "Comprado"],
  ["recibido_astillero", "En astillero"],
  ["no_aplica", "No aplica"],
];

// Los datos de cada material de la obra: compra, planos, catálogo y las marcas
// que cambian su circuito (no lleva, insumo). Es la parte de "configurar" la
// obra; lo de todos los días está en Piezas.
export default function MaterialesObra({ process, onEdit, onNew, onStatus, onConfirm, onPedirCompra, onNoLleva, onInsumo }) {
  const items = (process.items || []).filter((row) => row.activo !== false);
  const itemsByKey = new Map(items.map((row) => [row.clave, row]));
  const sinPedir = items.filter(
    (row) => !row.es_resultado && !row.no_lleva && row.compra_estado === "pendiente_solicitud",
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p className="tor-bloque-txt" style={{ flex: "1 1 240px" }}>
          Materiales que se compran y conjuntos que se arman en el circuito. Los cambios quedan en el historial.
        </p>
        {sinPedir.length > 0 && onPedirCompra && (
          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => onPedirCompra(sinPedir)}>
            <ShoppingCart size={15} /> Pedir {sinPedir.length} a Compras
          </button>
        )}
        <button type="button" className="ui-btn chico" onClick={onNew}>
          <Plus size={15} /> Material
        </button>
      </div>

      {!items.length ? (
        <div className="tor-vacio chico">Todavía no hay materiales cargados.</div>
      ) : groupRows(items).map(([grupo, filas]) => (
        <div key={grupo} style={{ display: "grid", gap: 6 }}>
          <div className="tor-grupo-cab" style={{ "--g": GROUP_COLORS[grupo] || "var(--dim)" }}>
            <span className="pto" />
            <span className="nom">{grupo}</span>
            <span className="n">{filas.length}</span>
            <span className="regla" />
          </div>
          <div className="tor-filas">
            {filas.map((item) => {
              const porConfirmar = item.requiere_confirmacion && !item.confirmado_at && !item.no_lleva;
              const dias = diasEntre(item.solicitado_at, item.recibido_astillero_at);
              return (
                <div
                  key={item.id}
                  className={`tor-fila${porConfirmar ? " atencion" : ""}${item.no_lleva ? " apagada" : ""}`}
                  style={fotoDelMaterial(item) ? { gridTemplateColumns: "auto minmax(0, 1fr) auto" } : undefined}
                >
                  <FotoMaterial item={item} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div className="tor-fila-tit">
                      <span style={{ textDecoration: item.no_lleva ? "line-through" : "none" }}>{item.descripcion}</span>
                      {item.no_lleva && <span className="tor-tag">No lleva</span>}
                      {item.es_insumo && <span className="tor-tag" data-tono="teal">Insumo</span>}
                      {item.es_resultado
                        ? <span className="tor-tag" data-tono="azul">Conjunto</span>
                        : item.material_id
                          ? <span title="Vinculado al catálogo" style={{ color: "var(--green)", display: "inline-flex" }}><Link2 size={13} /></span>
                          : <span className="tor-tag" data-tono="rojo">Sin catálogo</span>}
                    </div>
                    <div style={{ marginTop: 4 }}><CatalogTechnicalName item={item} /></div>
                    <div style={{ marginTop: 4 }}><RecepcionAnticipada item={item} /></div>
                    <div className="tor-fila-txt">
                      {cantidadTexto(item.cantidad, item.unidad)}
                      {item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}
                      {item.solicitado_por_torneria ? " · lo pidió Tornería" : ""}
                    </div>
                    {(item.solicitado_at || item.recibido_astillero_at) && (
                      <div className="tor-fila-txt">
                        {item.solicitado_at && <>Pedido {fmtDate(item.solicitado_at, false)}</>}
                        {item.recibido_astillero_at && <> · llegó {fmtDate(item.recibido_astillero_at, false)}</>}
                        {dias != null && <> · <b style={{ color: "var(--green)" }}>{dias} días</b></>}
                        {item.purchase_request_id && <> · vinculado a Compras</>}
                      </div>
                    )}
                    {!!item.planos?.length && (
                      <div className="tor-planos">
                        <FileText size={13} style={{ color: "var(--blue)" }} />
                        {item.planos.slice(0, 3).map((plano, index) => (
                          <a key={plano.path || plano.url || index} href={plano.url} target="_blank" rel="noreferrer" title={plano.name}>
                            {plano.name || `Plano ${index + 1}`}
                          </a>
                        ))}
                        {item.planos.length > 3 && <span className="tor-fila-txt">+{item.planos.length - 3}</span>}
                      </div>
                    )}
                    {item.es_resultado && item.resultado_de?.length > 0 && (
                      <div className="tor-fila-txt">
                        Se arma con: {item.resultado_de.map((key) => itemsByKey.get(key)?.descripcion || key).join(" + ")}
                      </div>
                    )}
                    {porConfirmar && (
                      <div className="tor-fila-txt alerta"><b>Confirmar:</b> {item.alerta || "dato pendiente antes del envío."}</div>
                    )}
                    {item.confirmado_at && <div className="tor-fila-txt ok">Confirmado {fmtDate(item.confirmado_at)}</div>}
                  </div>

                  <div className="tor-fila-der">
                    {item.no_lleva ? (
                      <span className="tor-estado" data-tono="neutro">Fuera de esta obra</span>
                    ) : item.es_resultado ? (
                      <span className="tor-estado" data-tono="azul">Cantidad manual</span>
                    ) : (
                      <select
                        className="tor-select"
                        value={item.compra_estado}
                        onChange={(event) => onStatus(item, event.target.value)}
                        aria-label={`Estado de compra de ${item.descripcion}`}
                      >
                        {PURCHASE_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    )}
                    <div className="tor-fila-botones">
                      {!item.es_resultado && onNoLleva && (
                        <button
                          type="button"
                          className="ui-btn chico"
                          onClick={() => onNoLleva(item)}
                          title={item.no_lleva ? "Volver a incluirla en esta obra" : "Esta obra no lleva esta pieza"}
                        >
                          {item.no_lleva ? "Sí lleva" : "No lleva"}
                        </button>
                      )}
                      {!item.es_resultado && !item.no_lleva && onInsumo && (
                        <button type="button" className="ui-btn chico" onClick={() => onInsumo(item)}>
                          {item.es_insumo ? "Es pieza" : "Es insumo"}
                        </button>
                      )}
                      {item.requiere_confirmacion && !item.no_lleva && (
                        <button
                          type="button"
                          className={`ui-btn chico${item.confirmado_at ? "" : " ui-btn-suave"}`}
                          onClick={() => onConfirm(item, !item.confirmado_at)}
                          title={item.confirmado_at ? "Reabrir confirmación" : "Confirmar el dato"}
                        >
                          <Check size={14} /> {item.confirmado_at ? "Reabrir" : "Confirmar"}
                        </button>
                      )}
                      <button type="button" className="tor-btn-ic" onClick={() => onEdit(item)} aria-label={`Editar ${item.descripcion}`} style={{ width: 32, height: 32 }}>
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
