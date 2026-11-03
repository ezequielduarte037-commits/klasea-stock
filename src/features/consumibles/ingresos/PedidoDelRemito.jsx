/** La IA reconoce los productos; el vínculo apunta siempre a un pedido real. */
export default function PedidoDelRemito({ borrador, candidatos, recibidos = [], error, disabled, onElegir, onSinPedido, onBuscar }) {
  if (!borrador.remitoLeido) return null;
  const vinculadas = borrador.lineas.filter((l) => l.pedidoItemId).length;
  const extras = borrador.lineas.length - vinculadas;
  const opciones = (
    <>
      {candidatos.length > 0 ? (
        <ul>
          {candidatos.map(({ pedido, coincidencias }) => (
            <li key={pedido.id}>
              <div className="ing-pedido-txt">
                <strong>Pedido N° {pedido.numero} · {pedido.proveedor}</strong>
                <small className="ing-dim">{coincidencias} {coincidencias === 1 ? "producto coincide" : "productos coinciden"} · {pedido.sede}</small>
              </div>
              <button type="button" className="ui-btn ui-btn-primario" disabled={disabled} onClick={() => onElegir(pedido)}>Vincular remito</button>
            </li>
          ))}
        </ul>
      ) : recibidos.length ? (
        <>
          <p><strong>Hay pedidos coincidentes que ya fueron recibidos:</strong> {recibidos.map((r) => `Pedido N° ${r.pedido.numero}`).join(", ")}.</p>
          <p className="ing-dim">Revisá la recepción anterior. Cargar este remito como un nuevo ingreso volverá a sumar stock.</p>
        </>
      ) : <p className="ing-dim">No encontramos un pedido pendiente que coincida con los productos de este remito.</p>}
      <div className="ing-pedido-opciones">
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={disabled} onClick={onBuscar}>Volver a buscar pedidos</button>
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={disabled} onClick={onSinPedido}>Ingresar sin pedido</button>
      </div>
    </>
  );
  return (
    <div className="ing-pedidos" role="region" aria-label="Pedido del remito">
      {error && <p className="ing-alerta" role="alert">No pudimos consultar los pedidos. Volvé a buscarlos antes de confirmar el ingreso.</p>}
      {borrador.pedidoId ? (
        <>
          <h3>{borrador.pedidoAutomatico ? "Pedido detectado al leer el remito" : "Remito vinculado"}</h3>
          <p><strong>{borrador.pedidoTitulo}</strong> · {borrador.proveedor}</p>
          <p className="ing-dim">{vinculadas} {vinculadas === 1 ? "producto vinculado" : "productos vinculados"}. Se registra lo que llegó; lo que falte queda pendiente.</p>
          {extras > 0 && <p className="ing-dim">{extras} {extras === 1 ? "producto no pertenece" : "productos no pertenecen"} a este pedido e {extras === 1 ? "ingresará" : "ingresarán"} aparte.</p>}
          {!vinculadas && <p className="ing-alerta">Elegí otro pedido o ingresá este remito sin pedido: sus productos no coinciden.</p>}
          <details className="ing-pedido-cambiar"><summary>Cambiar pedido</summary>{opciones}</details>
        </>
      ) : borrador.sinPedido ? (
        <>
          <h3>Ingreso sin pedido</h3>
          <p className="ing-dim">Este remito se registrará sin descontar pendientes de un pedido.</p>
          <button type="button" className="ui-btn ui-btn-fantasma" disabled={disabled} onClick={onBuscar}>Buscar un pedido</button>
        </>
      ) : (
        <>
          <h3>Vincular este remito a un pedido</h3>
          {candidatos.length > 1 && <p className="ing-dim">Hay más de un pedido posible. Elegí al que corresponde esta entrega.</p>}
          {opciones}
        </>
      )}
    </div>
  );
}
